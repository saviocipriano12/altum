import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { queueTenantChatText, queueTenantChatTemplate, processChatOutboundJobs } from "../chat-outbound";
import { createChatOutboundFingerprint, ChatOutboundIdempotencyError } from "../chat-outbound-idempotency";
import { mcpMessageFingerprint, mcpMessageRequestId, normalizedMcpMessagePayload } from "./message-approval";

export class McpMessageDeliveryPendingError extends Error {
  constructor(readonly jobId: string) { super("Mensagem aprovada registrada, mas a entrega ainda nao foi confirmada."); this.name = "McpMessageDeliveryPendingError"; }
}
export class McpMessageDeliveryBlockedError extends Error {
  constructor(readonly jobId: string) { super("Mensagem aprovada bloqueada antes da entrega. Revise a tarefa; nenhuma nova mensagem sera criada."); this.name = "McpMessageDeliveryBlockedError"; }
}
/** Authorization/access remain with the caller; no proposal text is an instruction. */
export async function deliverApprovedMcpMessage(input: {
  tenantId: string; draftId: string; chatId: string; approvedFingerprint: string; actor: { id: string; name: string };
}) {
  const draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId), snapshot = await draftRef.get(), draft = snapshot.data();
  if (!draft || draft.tenantId !== input.tenantId || mcpMessageFingerprint(draft) !== input.approvedFingerprint) throw new Error("Falha de integridade: aprovacao fora do tenant ou alterada.");
  if (!["send_or_reply_conversation", "start_whatsapp_conversation"].includes(String(draft.type)) ||
    (draft.status !== "approved_pending_apply" && !(draft.messageDelivery?.protocol === 1 && ["applying", "applied"].includes(String(draft.status))))) throw new Error("Aprove o rascunho antes de enviar.");
  const proposed = draft.proposedChange as Record<string, unknown>;
  if (draft.type === "send_or_reply_conversation" && proposed.conversationId !== input.chatId) throw new ChatOutboundIdempotencyError();
  if (draft.messageDelivery && draft.messageDelivery.chatId !== input.chatId) throw new ChatOutboundIdempotencyError();
  const clientRequestId = mcpMessageRequestId(input.tenantId, input.draftId);
  const mcpApproval = { draftId: input.draftId, fingerprint: input.approvedFingerprint };
  const base = { tenantId: input.tenantId, chatId: input.chatId, actor: input.actor, clientRequestId, mcpApproval };
  const templateName = draft.type === "start_whatsapp_conversation" && typeof proposed.templateName === "string" ? proposed.templateName.trim() : "";
  const payload = normalizedMcpMessagePayload(draft);
  const accepted = payload.kind === "template" ? await queueTenantChatTemplate({ ...base, ...payload, headerMedia: payload.headerMedia || undefined })
    : await queueTenantChatText({ ...base, text: payload.text, replyToId: payload.replyToId });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  return adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection("chat_outbound_jobs").doc(accepted.jobId), messageRef = adminDb.collection("messages").doc(accepted.messageId);
    const auditRef = adminDb.collection("audit_logs").doc(`mcp-message-${createChatOutboundFingerprint([input.tenantId, input.draftId])}`);
    const [current, job, message, audit] = await Promise.all([tx.get(draftRef), tx.get(jobRef), tx.get(messageRef), tx.get(auditRef)]);
    const value = current.data();
    if (!value || value.tenantId !== input.tenantId || mcpMessageFingerprint(value) !== input.approvedFingerprint || value.messageDelivery?.jobId !== accepted.jobId ||
      job.data()?.tenantId !== input.tenantId || job.data()?.chatId !== input.chatId || message.data()?.tenantId !== input.tenantId || message.data()?.chatId !== input.chatId ||
      !["applying", "applied"].includes(String(value.status))) throw new Error("Falha de integridade: recibo da mensagem nao corresponde a aprovacao atual.");
    if (job.data()?.status === "dead_letter") throw new McpMessageDeliveryBlockedError(accepted.jobId);
    if (job.data()?.status !== "completed") throw new McpMessageDeliveryPendingError(accepted.jobId);
    if (value.status === "applied") {
      if (value.application?.localMessageId !== accepted.messageId || value.application?.jobId !== accepted.jobId) throw new Error("Falha de integridade: recibo aplicado alterado.");
      return value.application as Record<string, unknown>;
    }
    const application = { conversationId: input.chatId, channel: String(message.data()?.channel || "whatsapp"), messageId: message.data()?.metaMessageId || null,
      localMessageId: accepted.messageId, jobId: accepted.jobId, ...(draft.type === "start_whatsapp_conversation" ? { leadId: proposed.leadId, channelId: value.messageDelivery.channelId, templateName: message.data()?.templateName || templateName || null } : {}) };
    tx.update(draftRef, { status: "applied", appliedAt: FieldValue.serverTimestamp(), appliedBy: job.data()?.actorId, appliedByName: job.data()?.actorName,
      updatedAt: FieldValue.serverTimestamp(), application });
    if (audit.exists && (audit.data()?.tenantId !== input.tenantId || audit.data()?.draftId !== input.draftId)) throw new Error("Auditoria da mensagem fora do tenant.");
    if (!audit.exists) tx.create(auditRef, { type: "mcp_supervised_action_applied", action: value.type, tenantId: input.tenantId, draftId: input.draftId,
      actorId: job.data()?.actorId, actorName: job.data()?.actorName, after: application, createdAt: FieldValue.serverTimestamp() });
    return application;
  });
}
