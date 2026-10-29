import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { AiVoicePreparationError, AiVoiceDeliveryPendingError } from "./voice-delivery-errors";

export async function deliverAiConversationVoice(input: {
  tenantId: string; chatId: string; sourceMessageId: string; text: string; agentName: string;
  voice?: string; maxChars?: number; freshUntil?: Date;
}) {
  if (!input.sourceMessageId.trim()) throw new Error("Resposta em voz sem mensagem de origem.");
  const key = createHash("sha256").update(JSON.stringify(["ai-voice-v1", input.sourceMessageId, "primary"])).digest("hex");
  const outbound = await import("@/lib/server/chat-outbound");
  const accepted = await outbound.queueTenantChatVoice({ ...input, aiSourceMessageId: input.sourceMessageId,
    aiDeliveryExpiresAt: input.freshUntil, actor: { id: "altum_ai", name: input.agentName }, clientRequestId: `ai-voice-${key}` });
  await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data();
  if (job?.status !== "completed") {
    if (job?.status === "dead_letter" && job.voicePreparationFailed === true && !job.providerAttemptStartedAt) {
      throw new AiVoicePreparationError(String(job.error || "Falha na preparacao da voz."));
    }
    // Uncertain outcome, blocked predecessor, pause and integrity failures must
    // never produce a second delivery through the old text fallback.
    throw new AiVoiceDeliveryPendingError();
  }
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data();
  if (!message || message.tenantId !== input.tenantId || message.chatId !== input.chatId || message.type !== "audio" ||
    !message.metaMessageId || !message.mediaUrl) throw new AiVoiceDeliveryPendingError();
  return { messageId: accepted.messageId, jobId: accepted.jobId, externalMessageId: String(message?.metaMessageId || "") || null,
    durationMs: Number(message?.voiceReplyDurationMs || 0), durationSource: message?.voiceReplyDurationSource as "measured_wav" | "estimated_text" };
}
