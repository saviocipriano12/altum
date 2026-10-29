import { adminDb } from "@/app/lib/server/firebase-admin";
import { commitChatOutboundEnqueue } from "../chat-outbound-enqueue";
import { processChatOutboundJobs, reprocessTenantChatOutboundJob } from "../chat-outbound";
import { appendSocialReplyAcceptance, normalizeSocialReply, socialReplyFingerprint, socialReplyIdentity, socialCommentIdentity, type SocialReply } from "./reply-contract";

export async function resumeAcceptedSocialComment(input: { tenantId: string; channelId: string; commentId: string }) {
  const identity = socialCommentIdentity(input.tenantId, input.channelId, input.commentId);
  const ledger = await adminDb.collection("social_reply_deliveries").doc(identity.jobId).get();
  if (!ledger.exists) return null;
  if (ledger.data()?.tenantId !== input.tenantId || ledger.data()?.channelId !== input.channelId || ledger.data()?.commentId !== input.commentId) throw new Error("Falha de integridade: entrega fora do comentario original.");
  return resumeSocialReply({ tenantId: input.tenantId, logId: ledger.data()!.logId });
}

export async function deliverSocialReply(input: { tenantId: string; chatId: string; reply: SocialReply; claimToken: string }) {
  const reply = normalizeSocialReply(input.reply);
  const previous = await resumeAcceptedSocialComment({ tenantId: input.tenantId, channelId: reply.channelId, commentId: reply.commentId });
  if (previous) return previous;
  const identity = socialReplyIdentity(input.tenantId, reply);
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(identity.jobId);
  const accepted = await jobRef.get();
  if (accepted.exists) {
    const previous = normalizeSocialReply(accepted.data()?.socialReply);
    if (accepted.data()?.tenantId !== input.tenantId || previous.channelId !== reply.channelId || previous.commentId !== reply.commentId) throw new Error("Falha de integridade: entrega social fora do comentario original.");
    return resumeSocialReply({ tenantId: input.tenantId, logId: previous.logId });
  } else {
    await commitChatOutboundEnqueue({ tenantId: input.tenantId, chatId: input.chatId, identity, fingerprint: socialReplyFingerprint(input.tenantId, input.chatId, reply),
      actor: { id: "altum_social", name: "Automacao social Altum" }, replyToId: null, preview: reply.text, stateId: "unused", pauseAi: false,
      internalOnly: reply.mode === "public_comment",
      beforeCommit: batch => appendSocialReplyAcceptance(batch, { ...input, reply, jobId: identity.jobId }),
      build: () => ({ message: { channel: reply.channelType, type: "text", text: reply.text, socialCommentId: reply.commentId, socialAutomation: true },
        job: { kind: "social_reply", socialReply: reply } }),
    });
  }
  return resumeSocialReply({ tenantId: input.tenantId, logId: reply.logId });
}

export async function resumeSocialReply(input: { tenantId: string; logId: string; retryActor?: { id: string; name: string } }) {
  const source = await adminDb.collection("social_automation_logs").doc(input.logId).get(), data = source.data();
  if (data?.tenantId !== input.tenantId || data.deliveryProtocol !== 1 || !data.acceptedReply || !data.deliveryJobId) throw new Error("Entrega social legada sem prova duravel; revisao necessaria antes de reenviar.");
  const reply = normalizeSocialReply(data.acceptedReply), chatId = String(data.deliveryChatId);
  const identity = socialReplyIdentity(input.tenantId, reply);
  if (reply.logId !== input.logId || identity.jobId !== data.deliveryJobId || data.replyFingerprint !== socialReplyFingerprint(input.tenantId, chatId, reply)) throw new Error("Falha de integridade: vinculo social alterado.");
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(identity.jobId), job = await jobRef.get();
  const ledger = await adminDb.collection("social_reply_deliveries").doc(identity.jobId).get();
  if (!job.exists || job.data()?.tenantId !== input.tenantId || job.data()?.chatId !== chatId || job.data()?.requestFingerprint !== data.replyFingerprint ||
    ledger.data()?.tenantId !== input.tenantId || ledger.data()?.logId !== input.logId || ledger.data()?.requestFingerprint !== data.replyFingerprint) throw new Error("Falha de integridade: tarefa social aceita removida ou alterada.");
  if (input.retryActor && job.data()?.status === "dead_letter" && !job.data()?.providerAttemptStartedAt && !job.data()?.lastProviderAttemptStartedAt &&
    !job.data()?.externalMessageId && !ledger.data()?.externalMessageId && !data.externalMessageId) {
    await reprocessTenantChatOutboundJob({ tenantId: input.tenantId, jobId: identity.jobId, actorId: input.retryActor.id, actorName: input.retryActor.name });
  }
  await processChatOutboundJobs({ jobId: identity.jobId, limit: 1 });
  const [currentJob, currentSource, currentLedger] = await adminDb.getAll(jobRef, source.ref, ledger.ref);
  const current = currentJob.data()!;
  if (current.status === "dead_letter") throw new Error(String(current.error || "Resposta social bloqueada."));
  const confirmed = current.status === "completed" && current.tenantId === input.tenantId && current.chatId === chatId && current.requestFingerprint === data.replyFingerprint &&
    typeof current.externalMessageId === "string" && Boolean(current.externalMessageId) && currentSource.data()?.tenantId === input.tenantId &&
    currentSource.data()?.deliveryJobId === identity.jobId && currentSource.data()?.status === "sent" && currentSource.data()?.externalMessageId === current.externalMessageId &&
    currentLedger.data()?.tenantId === input.tenantId && currentLedger.data()?.logId === input.logId && currentLedger.data()?.status === "sent" &&
    currentLedger.data()?.externalMessageId === current.externalMessageId;
  return { status: confirmed ? "sent" as const : "pending_confirmation" as const,
    responseText: reply.text, jobId: identity.jobId, chatId, externalMessageId: confirmed ? current.externalMessageId as string : null };
}
