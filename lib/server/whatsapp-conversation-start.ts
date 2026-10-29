import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { isOfficialWhatsAppProvider, type WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { isWhatsAppGroup } from "@/lib/whatsapp-conversation";
import { requiresWhatsAppTemplate } from "@/lib/whatsapp-service-window";
import type { TenantMembership } from "@/lib/server/tenant";
import { assertChatCommercialAccess, assertLeadCommercialAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { resolveCanonicalWhatsAppChat } from "@/lib/server/whatsapp-chat-identity";
import { ChatOutboundIdempotencyError, createChatOutboundFingerprint, createChatOutboundIdentity, normalizeChatOutboundRequestId } from "@/lib/server/chat-outbound-idempotency";
import { queueTenantChatText } from "@/lib/server/chat-outbound";

export type WhatsAppStartBody = {
  text?: string; chatId?: string; to?: string; leadId?: string; channelId?: string; clientRequestId?: string | null;
};
function millis(value: unknown): number | null {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  const date = value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.getTime() : null;
}
async function startStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch (error) {
    // Preserve the SDK error/code; attach only a fixed diagnostic stage, no data.
    if (error instanceof Error) {
      try { Object.defineProperty(error, "whatsappStartStage", { value: stage, enumerable: true, configurable: true }); }
      catch { /* Diagnostics must never replace the original SDK failure. */ }
    }
    throw error;
  }
}

/** Prepare the canonical destination, then use the same durable outbox as Inbox. Never calls a provider. */
export async function startTenantWhatsAppConversation(input: {
  tenantId: string; user: { uid: string; name: string }; membership: TenantMembership;
  channel: WhatsAppChannelConfig; body: WhatsAppStartBody;
}) {
  const { tenantId, user, membership, channel, body } = input;
  for (const key of ["text", "chatId", "to", "leadId", "channelId", "clientRequestId"] as const) {
    if (body[key] != null && typeof body[key] !== "string") throw new RouteAuthError(400, "invalid_payload", "Dados de envio invalidos.");
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) throw new RouteAuthError(400, "invalid_payload", "Informe uma mensagem de ate 4000 caracteres.");
  let clientRequestId: string;
  try { clientRequestId = normalizeChatOutboundRequestId(body.clientRequestId); }
  catch { throw new RouteAuthError(400, "invalid_request_id", "Identificacao de envio invalida."); }
  if (channel.tenantId !== tenantId) throw new RouteAuthError(403, "channel_tenant_mismatch", "Canal fora desta empresa.");
  if (channel.channelScope === "personal" && channel.ownerUserId !== user.uid && !hasTeamWideCommercialAccess(membership)) {
    throw new RouteAuthError(403, "personal_channel_denied", "Este WhatsApp pessoal pertence a outro vendedor.");
  }
  const lead = body.leadId ? await startStage("lead_access", () => assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId: body.leadId! })) : null;
  const idempotencyScope = body.leadId ? `start:${createChatOutboundFingerprint([body.leadId, channel.id])}` : undefined;
  const boundIdentity = idempotencyScope ? createChatOutboundIdentity({ tenantId, chatId: idempotencyScope, clientRequestId }) : null;
  const boundJob = boundIdentity ? await startStage("start_job_lookup", () => adminDb.collection("chat_outbound_jobs").doc(boundIdentity.jobId).get()) : null;
  if (boundJob?.exists && (boundJob.data()?.tenantId !== tenantId || (body.chatId && body.chatId !== boundJob.data()?.chatId))) {
    throw new ChatOutboundIdempotencyError();
  }
  // An uncertain retry belongs to its original chat, even if the lead phone was edited meanwhile.
  let chatId = body.chatId || (boundJob?.exists ? String(boundJob.data()?.chatId || "") : "");
  if (!chatId) {
    const rawPhone = body.to || String(lead?.telefone || "");
    if (isWhatsAppGroup(rawPhone)) throw new RouteAuthError(400, "group_requires_chat_dispatch", "Abra a conversa do grupo para enviar.");
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new RouteAuthError(400, "invalid_phone", "Telefone nao informado.");
    if (lead && body.to && normalizePhone(String(lead.telefone || "")) !== phone) {
      throw new RouteAuthError(400, "lead_phone_mismatch", "O telefone informado difere do cliente selecionado.");
    }
    const resolved = await startStage("canonical_chat", () => resolveCanonicalWhatsAppChat({ tenantId, channelId: channel.id, phone, requireExactChannel: true,
      createData: { tenantId, channel: "whatsapp", channelId: channel.id, channelPhoneNumberId: channel.phoneNumberId,
        contactPhone: phone, contactPhoneNormalized: phone, contactName: String(lead?.nome || phone),
        ownerId: String(lead?.ownerId || user.uid), ownerName: user.name, status: "open",
        requiresTemplate: isOfficialWhatsAppProvider(channel.provider),
        ...(body.leadId ? { leadId: body.leadId } : {}), lastMessage: "",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessageTime: FieldValue.serverTimestamp() } }));
    chatId = resolved.chatRef.id;
  }
  // Also required for legacy `to`: resolving a phone is not permission to access its chat.
  const chat: Record<string, unknown> = await startStage("chat_access", () => assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId }));
  if (chat.channelId !== channel.id || (chat.channel && chat.channel !== "whatsapp")) {
    throw new RouteAuthError(409, "chat_channel_mismatch", "Esta conversa pertence a outro canal. Abra o canal correto.");
  }
  if (isWhatsAppGroup(String(chat.contactPhone || ""))) {
    throw new RouteAuthError(400, "group_requires_chat_dispatch", "Envie pela conversa do grupo para preservar o destinatario.");
  }
  if (!normalizePhone(String(chat.contactPhone || ""))) throw new RouteAuthError(400, "invalid_phone", "Conversa sem telefone valido.");
  if (body.to && normalizePhone(body.to) !== normalizePhone(String(chat.contactPhone || ""))) throw new ChatOutboundIdempotencyError();
  const identity = createChatOutboundIdentity({ tenantId, chatId: idempotencyScope || chatId, clientRequestId });
  const existingJob = boundJob?.exists ? boundJob : await startStage("existing_job_lookup", () => adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get());
  if (!existingJob.exists && requiresWhatsAppTemplate({ channel: "whatsapp", provider: channel.provider,
    requiresTemplate: chat.requiresTemplate === true, lastInboundAt: millis(chat.lastClientMessageAt) })) {
    return { ok: true as const, tenantId, chatId, phoneNumberId: channel.phoneNumberId, requiresTemplate: true as const,
      message: "A API oficial exige um template aprovado para iniciar esta conversa." };
  }
  const queued = await startStage("enqueue_text", () => queueTenantChatText({ tenantId, chatId, text, clientRequestId, idempotencyScope, actor: { id: user.uid, name: user.name } }));
  return { ok: true as const, tenantId, chatId, phoneNumberId: channel.phoneNumberId, requiresTemplate: false as const, ...queued };
}
