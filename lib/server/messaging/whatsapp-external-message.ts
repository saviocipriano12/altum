import { externalWhatsAppMessageId } from "./whatsapp-external-identity";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { resolveCanonicalWhatsAppChat } from "@/lib/server/whatsapp-chat-identity";
import { whatsappDeliveryStateRef, assertWhatsAppDeliveryStateScope } from "@/lib/server/whatsapp-delivery-status";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { cacheEvolutionMessageMedia, evolutionMediaReference } from "./evolution-media-recovery";
import { resolveWhatsAppGroupName } from "./whatsapp-group-name";
import type { EvolutionInbound } from "./evolution-webhook";
import { captureMessageMediaSource, markMessageMediaCacheFailed } from "@/lib/server/message-media-source";

/** Own-device messages are outgoing, never a new client turn or an automation trigger. */
export async function persistExternalWhatsAppMessage(channel: WhatsAppChannelConfig, event: EvolutionInbound, options?: { prepareMedia?: boolean; expectedChatId?: string }) {
  if (!event.fromMe || !event.messageId) throw new Error("Mensagem propria sem identificador.");
  const tenantId = channel.tenantId;
  const phoneNumberId = channel.phoneNumberId || channel.id;
  const name = event.isGroup ? event.groupName || "Grupo do WhatsApp" : event.from;
  const occurredAt = new Date(event.occurredAtMs || Date.now());
  const { chatRef } = await resolveCanonicalWhatsAppChat({ tenantId, channelId: channel.id, phone: event.from,
    createData: { tenantId, channel: "whatsapp", channelId: channel.id, channelPhoneNumberId: phoneNumberId,
      channelScope: channel.channelScope, channelOwnerUserId: channel.ownerUserId || null,
      contactPhone: event.from, contactName: name, isGroup: event.isGroup,
      ...(event.isGroup ? { groupJid: event.groupJid, groupName: name, aiEnabled: false } : {}),
      ownerId: channel.ownerUserId || null, assignedTo: channel.ownerUserId || null, assignedUserName: channel.ownerUserName || null,
      status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } });
  if (options?.expectedChatId && chatRef.id !== options.expectedChatId) throw new Error("Conversa de recuperacao inconsistente.");
  const echoRef = adminDb.collection("messages").doc(externalWhatsAppMessageId(tenantId, channel.id, event.messageId));
  const stateRef = whatsappDeliveryStateRef(tenantId, phoneNumberId, event.messageId);
  const result = await adminDb.runTransaction(async (tx) => {
    const [state, chat] = await Promise.all([tx.get(stateRef), tx.get(chatRef)]);
    assertWhatsAppDeliveryStateScope(state.data(), tenantId, phoneNumberId, event.messageId);
    if (state.data()?.chatId && state.data()?.chatId !== chatRef.id) throw new Error("Mensagem propria vinculada a outra conversa.");
    const target = state.data()?.localMessageId ? adminDb.collection("messages").doc(String(state.data()?.localMessageId)) : echoRef;
    const existing = await tx.get(target);
    if (existing.exists) {
      if (existing.data()?.tenantId !== tenantId || existing.data()?.chatId !== chatRef.id || existing.data()?.metaMessageId !== event.messageId) throw new Error("Identidade de mensagem propria inconsistente.");
      return { id: target.id, created: false };
    }
    tx.set(target, { tenantId, chatId: chatRef.id, channel: "whatsapp", channelId: channel.id, channelPhoneNumberId: phoneNumberId,
      metaMessageId: event.messageId, text: event.text, sender: "agent", senderName: "WhatsApp", source: "whatsapp_external",
      type: event.messageType, status: state.data()?.status || "sent", deliveryStatus: state.data()?.deliveryStatus || "sent",
      mediaName: event.mediaName || null, mediaMimeType: event.mediaMimeType || null,
      mediaDuration: Number.isFinite(event.mediaDuration) ? event.mediaDuration : null,
      ...(event.messageType !== "text" ? { mediaRecovery: evolutionMediaReference(event.rawMessage), mediaProcessingStatus: "pending" } : {}),
      createdAt: occurredAt, receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(stateRef, { recordType: "state", tenantId, phoneNumberId, metaMessageId: event.messageId, localMessageId: target.id,
      chatId: chatRef.id, status: state.data()?.status || "sent", deliveryStatus: state.data()?.deliveryStatus || "sent", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const data = chat.data() || {};
    const last = data.lastMessageTime?.toMillis?.() || new Date(data.lastMessageTime || 0).getTime();
    const latest = occurredAt.getTime() >= (Number.isFinite(last) ? last : 0);
    tx.set(chatRef, { ...(latest ? { lastMessage: event.text, lastMessageTime: occurredAt,
      ...buildOutgoingChatOperationalPatch({ status: data.status, assignedTo: data.assignedTo || data.ownerId }),
      lastAgentMessageAt: occurredAt } : {}), ...(event.isGroup && name !== "Grupo do WhatsApp" ? { contactName: name, groupName: name } : {}),
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { id: target.id, created: true };
  });
  const mediaSource = result.created && event.messageType !== "text" && options?.prepareMedia !== false
    ? await captureMessageMediaSource({tenantId, chatId: chatRef.id, messageId: result.id, expectedIdentity: {metaMessageId: event.messageId, channelId: channel.id}}).catch(() => null) : null;
  if (event.isGroup && !event.groupName) await resolveWhatsAppGroupName(tenantId, chatRef.id, (await chatRef.get()).data() || {});
  if (mediaSource) {
    try { await cacheEvolutionMessageMedia({ tenantId, chatId: chatRef.id, messageId: result.id, channel,
      reference: event.rawMessage, type: event.messageType, mimeType: event.mediaMimeType, name: event.mediaName, source: mediaSource }); }
    catch { await markMessageMediaCacheFailed(mediaSource, "Nao foi possivel preparar o arquivo desta mensagem."); }
  }
  return { status: result.created ? "ok_external_message" : "ignored_known_outbound", chatId: chatRef.id, messageId: result.id };
}
