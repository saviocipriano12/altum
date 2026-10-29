import { FieldValue, type WriteBatch, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "../chat-outbound-idempotency";
import { normalizeOutboundText, normalizeOutboundReplyId } from "../chat-outbound-payload";
import { normalizeOutboundTemplate } from "../chat-outbound-template";

export type McpMessageApproval = { draftId: string; fingerprint: string };
export const mcpMessageRequestId = (tenantId: string, draftId: string) => `mcp-message-${createChatOutboundFingerprint([tenantId, draftId])}`;
const destination = (chat: Record<string, unknown>) => createChatOutboundFingerprint([chat.channel || "whatsapp", chat.channelId || "", chat.channelPhoneNumberId || "",
  chat.channelExternalAccountId || "", chat.contactPhone || "", chat.contactExternalId || "", chat.leadId || "", chat.isGroup === true]);
export function normalizedMcpMessagePayload(draft: Record<string, unknown>) {
  const proposed = draft.proposedChange as Record<string, unknown>;
  if (draft.type === "start_whatsapp_conversation" && proposed.templateName) {
    const template = normalizeOutboundTemplate({ templateName: proposed.templateName, languageCode: proposed.templateLanguage ?? "pt_BR", bodyParams: proposed.templateParams ?? [] });
    const display = typeof proposed.displayText === "string" && proposed.displayText.trim() ? proposed.displayText : proposed.text;
    return { kind: "template" as const, ...template, displayText: typeof display === "string" && display.trim() ? normalizeOutboundText(display) : "" };
  }
  return { kind: "text" as const, text: normalizeOutboundText(proposed.text), replyToId: normalizeOutboundReplyId(proposed.replyToId) };
}
function jobPayload(job: Record<string, unknown>) {
  return job.kind === "template" ? { kind: "template", ...normalizeOutboundTemplate(job), displayText: job.displayText ? normalizeOutboundText(job.displayText) : "" }
    : { kind: "text", text: normalizeOutboundText(job.text), replyToId: normalizeOutboundReplyId(job.replyToId) };
}
export function mcpMessageFingerprint(draft: Record<string, unknown>) {
  return createChatOutboundFingerprint(["mcp-message-v1", draft.type, draft.proposedChange]);
}
export function normalizeMcpMessageApproval(value: unknown): McpMessageApproval | null {
  if (value == null) return null;
  const approval = value as McpMessageApproval;
  if (!approval || typeof approval !== "object" || Array.isArray(approval) || typeof approval.draftId !== "string" || typeof approval.fingerprint !== "string" ||
    !/^[A-Za-z0-9_-]{1,180}$/.test(approval.draftId) || !/^[a-f0-9]{64}$/.test(approval.fingerprint)) throw new Error("Falha de integridade: aprovacao de mensagem invalida.");
  return { draftId: approval.draftId, fingerprint: approval.fingerprint };
}
export async function appendMcpMessageAcceptance(batch: WriteBatch, input: {
  approval: McpMessageApproval; tenantId: string; chatId: string; jobId: string; messageId: string; actor: { id: string; name: string }; chat: Record<string, unknown>; payload: Record<string, unknown>;
}) {
  const ref = adminDb.collection("mcp_action_drafts").doc(input.approval.draftId), snapshot = await ref.get(), draft = snapshot.data();
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: input.chatId, clientRequestId: mcpMessageRequestId(input.tenantId, input.approval.draftId) });
  if (identity.jobId !== input.jobId || identity.messageId !== input.messageId) throw new Error("Falha de integridade: identificacao difere da mensagem aprovada.");
  if (!draft || draft.tenantId !== input.tenantId || !["send_or_reply_conversation", "start_whatsapp_conversation"].includes(String(draft.type)) ||
    mcpMessageFingerprint(draft) !== input.approval.fingerprint || draft.status !== "approved_pending_apply" || draft.appliedAt || draft.messageDelivery) {
    throw new Error("Falha de integridade: aprovacao alterada, revogada ou entrega ja aceita.");
  }
  if (createChatOutboundFingerprint([input.payload]) !== createChatOutboundFingerprint([normalizedMcpMessagePayload(draft)])) throw new Error("Falha de integridade: mensagem difere do conteudo aprovado.");
  const proposed = draft.proposedChange as Record<string, unknown>;
  if ((draft.type === "send_or_reply_conversation" && proposed.conversationId !== input.chatId) ||
    (draft.type === "start_whatsapp_conversation" && (input.chat.channel !== "whatsapp" || input.chat.isGroup === true || input.chat.leadId !== proposed.leadId || (proposed.channelId && input.chat.channelId !== proposed.channelId)))) {
    throw new Error("Falha de integridade: destino difere da conversa aprovada.");
  }
  batch.update(ref, { status: "applying", applyingAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    applyingBy: input.actor.id, applyingByName: input.actor.name,
    messageDelivery: { protocol: 1, fingerprint: input.approval.fingerprint, destination: destination(input.chat), channelId: input.chat.channelId || null, chatId: input.chatId, jobId: input.jobId, messageId: input.messageId } },
  { lastUpdateTime: snapshot.updateTime! });
}

/** Rechecked in the durable fence transaction, so revocation cannot race its commit. */
export async function assertMcpMessageDeliveryAllowed(job: Record<string, unknown>, transaction?: Transaction) {
  const proof = normalizeMcpMessageApproval(job.mcpApproval);
  if (!proof) return;
  if (job.origin === "ai" || !["text", "template"].includes(String(job.kind))) throw new Error("Falha de integridade: tipo de entrega incompativel com aprovacao MCP.");
  const ref = adminDb.collection("mcp_action_drafts").doc(proof.draftId);
  const snapshot = transaction ? await transaction.get(ref) : await ref.get(), draft = snapshot.data();
  const identity = createChatOutboundIdentity({ tenantId: String(job.tenantId), chatId: String(job.chatId), clientRequestId: String(job.clientRequestId) });
  const binding = draft?.messageDelivery;
  const chatRef = adminDb.collection("chats").doc(String(job.chatId));
  const chat = transaction ? await transaction.get(chatRef) : await chatRef.get();
  if (!draft || draft.tenantId !== job.tenantId || !["send_or_reply_conversation", "start_whatsapp_conversation"].includes(String(draft.type)) ||
    draft.status !== "applying" || mcpMessageFingerprint(draft) !== proof.fingerprint || binding?.protocol !== 1 ||
    binding.fingerprint !== proof.fingerprint || binding.chatId !== job.chatId || binding.jobId !== identity.jobId || binding.messageId !== job.messageId ||
    chat.data()?.tenantId !== job.tenantId || binding.destination !== destination(chat.data() || {}) ||
    createChatOutboundFingerprint([jobPayload(job)]) !== createChatOutboundFingerprint([normalizedMcpMessagePayload(draft)])) {
    throw new Error("Falha de integridade: aprovacao da mensagem alterada ou revogada antes da entrega.");
  }
}
