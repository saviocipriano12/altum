import { createHash } from "node:crypto";
import { FieldPath, FieldValue, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export type WhatsAppDeliveryStatus = "sent" | "delivered" | "read" | "failed";
export type ParsedWhatsAppStatusEvent = {
  messageId: string; status: WhatsAppDeliveryStatus; timestampMs: number | null;
  recipientId: string; errorCode: string; errorMessage: string;
};
const rank: Record<string, number> = { sent: 1, failed: 2, delivered: 3, read: 4 };
export function whatsappDeliveryStateRef(tenantId: string, phoneNumberId: string, messageId: string) {
  return adminDb.collection("whatsapp_delivery_events").doc(`state_${createHash("sha256").update(JSON.stringify([tenantId, phoneNumberId, messageId])).digest("hex")}`);
}
export function assertWhatsAppDeliveryStateScope(data: Record<string, unknown> | undefined, tenantId: unknown, phoneNumberId: unknown, messageId: unknown) {
  if (data && (data.tenantId !== tenantId || data.phoneNumberId !== phoneNumberId || data.metaMessageId !== messageId)) {
    throw new Error("Recibo fora da empresa, numero ou mensagem original.");
  }
}
export function whatsAppEventFromState(data: Record<string, unknown> | undefined, messageId: string): ParsedWhatsAppStatusEvent | null {
  const status = String(data?.deliveryStatus || data?.status || "");
  if (!rank[status]) return null;
  return { messageId, status: status as WhatsAppDeliveryStatus, timestampMs: millis(data?.deliveryAt) || null,
    recipientId: String(data?.deliveryRecipientId || data?.recipientId || ""), errorCode: String(data?.deliveryErrorCode || data?.errorCode || ""), errorMessage: String(data?.deliveryError || data?.errorMessage || "") };
}
/** One-time, paginated fold of pre-summary receipts within the binding transaction. */
export async function readWhatsAppDeliveryHistory(transaction: Transaction, input: {
  tenantId: string; phoneNumberId: string; messageId: string; current?: Record<string, unknown>;
}) {
  let strongest = whatsAppEventFromState(input.current, input.messageId);
  let scanned = 0;
  let cursor: QueryDocumentSnapshot | null = null;
  do {
    let query = adminDb.collection("whatsapp_delivery_events").where("tenantId", "==", input.tenantId)
      .where("phoneNumberId", "==", input.phoneNumberId).where("metaMessageId", "==", input.messageId)
      .orderBy(FieldPath.documentId()).limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await transaction.get(query);
    for (const row of page.docs) {
      const data = row.data();
      if (data.recordType === "state") continue;
      const event = whatsAppEventFromState(data, input.messageId);
      if (!event) continue;
      scanned += 1;
      if (!strongest || shouldApplyWhatsAppDelivery({ status: strongest.status,
        deliveryAt: strongest.timestampMs ? new Date(strongest.timestampMs) : null }, event)) strongest = event;
    }
    cursor = page.size === 200 ? page.docs[page.docs.length - 1] : null;
  } while (cursor);
  return { receipt: strongest, scanned };
}
export function whatsappDeliveryPatch(event: ParsedWhatsAppStatusEvent, phoneNumberId: string) {
  return { status: event.status, deliveryStatus: event.status,
    deliveryAt: event.timestampMs ? new Date(event.timestampMs) : FieldValue.serverTimestamp(),
    deliveryUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    deliveryError: event.status === "failed" ? event.errorMessage : "",
    deliveryErrorCode: event.status === "failed" ? event.errorCode : "",
    deliveryRecipientId: event.recipientId, channelPhoneNumberId: phoneNumberId };
}
function millis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}
export function shouldApplyWhatsAppDelivery(current: Record<string, unknown>, event: ParsedWhatsAppStatusEvent) {
  const previous = String(current.deliveryStatus || current.status || "").toLowerCase();
  if ((rank[previous] || 0) > rank[event.status]) return false;
  if (previous === event.status) {
    const previousTime = millis(current.deliveryAt);
    return Boolean(event.timestampMs && (!previousTime || event.timestampMs < previousTime));
  }
  return true;
}

/** Persist receipts without treating webhook arrival order as delivery order. */
export async function persistWhatsappStatusEvents(input: {
  tenantId: string; phoneNumberId: string; events: ParsedWhatsAppStatusEvent[];
}) {
  let matchedMessages = 0;
  let updatedChats = 0;
  for (const event of input.events) {
    const eventId = `receipt_${createHash("sha256").update(JSON.stringify([input.tenantId, input.phoneNumberId,
      event.messageId, event.status, event.timestampMs, event.recipientId, event.errorCode, event.errorMessage])).digest("hex")}`;
    const eventRef = adminDb.collection("whatsapp_delivery_events").doc(eventId);
    const stateRef = whatsappDeliveryStateRef(input.tenantId, input.phoneNumberId, event.messageId);
    const [messages, deliveries] = await Promise.all([
      adminDb.collection("messages").where("tenantId", "==", input.tenantId).where("metaMessageId", "==", event.messageId).limit(101).get(),
      adminDb.collection("outbound_campaign_deliveries").where("tenantId", "==", input.tenantId).where("metaMessageId", "==", event.messageId).limit(101).get(),
    ]);
    if (messages.size > 100 || deliveries.size > 100) throw new Error("Confirmacao com vinculos excessivos; requer reconciliacao.");
    const counts = await adminDb.runTransaction(async (transaction) => {
      const existingEvent = await transaction.get(eventRef);
      const state = await transaction.get(stateRef);
      assertWhatsAppDeliveryStateScope(state.data(), input.tenantId, input.phoneNumberId, event.messageId);
      const previousEvent = whatsAppEventFromState(state.data(), event.messageId);
      const effectiveEvent = previousEvent && !shouldApplyWhatsAppDelivery(state.data() || {}, event) ? previousEvent : event;
      const messageRefs = new Map(messages.docs.map((row) => [row.id, row.ref]));
      const boundMessageId = String(state.data()?.localMessageId || "");
      if (boundMessageId) messageRefs.set(boundMessageId, adminDb.collection("messages").doc(boundMessageId));
      const messageRows = messageRefs.size ? await transaction.getAll(...messageRefs.values()) : [];
      const deliveryRefs = new Map(deliveries.docs.map((row) => [row.id, row.ref]));
      const boundDeliveryId = String(state.data()?.localCampaignDeliveryId || "");
      if (boundDeliveryId) deliveryRefs.set(boundDeliveryId, adminDb.collection("outbound_campaign_deliveries").doc(boundDeliveryId));
      const deliveryRows = deliveryRefs.size ? await transaction.getAll(...deliveryRefs.values()) : [];
      const legacyChannelIds = [...new Set(deliveryRows.filter((row) => !row.data()?.channelPhoneNumberId)
        .map((row) => String(row.data()?.channelId || "")).filter(Boolean))];
      const legacyChannels = legacyChannelIds.length ? await transaction.getAll(...legacyChannelIds.map((id) => adminDb.collection("tenant_channels").doc(id))) : [];
      const legacyChannelsById = new Map(legacyChannels.map((row) => [row.id, row.data()]));
      const chatIds = [...new Set(messageRows.map((row) => String(row.data()?.chatId || "")).filter(Boolean))];
      const chats = chatIds.length ? await transaction.getAll(...chatIds.map((id) => adminDb.collection("chats").doc(id))) : [];
      const byChatId = new Map(chats.map((row) => [row.id, row]));
      const patch = whatsappDeliveryPatch(effectiveEvent, input.phoneNumberId);
      let matched = 0;
      let localMessageId = boundMessageId;
      let localCampaignDeliveryId = boundDeliveryId;
      let boundChatId = String(state.data()?.chatId || "");
      const touchedChats = new Set<string>();
      for (const row of messageRows) {
        const data = row.data();
        if (!data || data.tenantId !== input.tenantId || data.sender === "client" || data.metaMessageId !== event.messageId) continue;
        const chat = byChatId.get(String(data.chatId || ""));
        const chatData = chat?.data();
        // Unknown legacy mappings are retained in the event log, not guessed.
        if ((data.channelPhoneNumberId || chatData?.channelPhoneNumberId) !== input.phoneNumberId) continue;
        matched += 1;
        if (!localMessageId) { localMessageId = row.id; boundChatId = String(data.chatId || ""); }
        if (shouldApplyWhatsAppDelivery(data, effectiveEvent)) transaction.set(row.ref, patch, { merge: true });
        if (!chat?.exists || chatData?.tenantId !== input.tenantId || touchedChats.has(chat.id)) continue;
        const isTail = data.outboundJobId && chatData.outboundTailJobId === data.outboundJobId;
        const sameMessage = chatData.lastOutboundMetaMessageId === event.messageId;
        const legacyLatest = !chatData.outboundTailJobId && millis(data.createdAt) > 0 && millis(data.createdAt) >= millis(chatData.lastMessageTime);
        const eligible = isTail || (!chatData.outboundTailJobId && (sameMessage || legacyLatest));
        if (eligible && shouldApplyWhatsAppDelivery(sameMessage ? { deliveryStatus: chatData.lastOutboundDeliveryStatus, deliveryAt: chatData.lastOutboundDeliveryAt } : {}, effectiveEvent)) {
          transaction.set(chat.ref, { lastOutboundDeliveryStatus: effectiveEvent.status, lastOutboundDeliveryAt: patch.deliveryAt,
            lastOutboundMetaMessageId: event.messageId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          touchedChats.add(chat.id);
        }
      }
      for (const row of deliveryRows) {
        const data = row.data();
        if (!data || data.tenantId !== input.tenantId || data.metaMessageId !== event.messageId) continue;
        const legacyChannel = legacyChannelsById.get(String(data.channelId || ""));
        const deliveryPhoneNumberId = data.channelPhoneNumberId || (legacyChannel?.tenantId === input.tenantId ? legacyChannel.phoneNumberId : null);
        if (deliveryPhoneNumberId !== input.phoneNumberId) continue;
        if (!localCampaignDeliveryId) localCampaignDeliveryId = row.id;
        if (shouldApplyWhatsAppDelivery(data, effectiveEvent)) transaction.set(row.ref, patch, { merge: true });
      }
      transaction.set(stateRef, { ...patch, recordType: "state", tenantId: input.tenantId, phoneNumberId: input.phoneNumberId,
        metaMessageId: event.messageId, ...(localMessageId ? { localMessageId } : {}), ...(boundChatId ? { chatId: boundChatId } : {}),
        ...(localCampaignDeliveryId ? { localCampaignDeliveryId } : {}),
        createdAt: state.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(eventRef, {
        recordType: "event",
        tenantId: input.tenantId, phoneNumberId: input.phoneNumberId, metaMessageId: event.messageId,
        status: event.status, recipientId: event.recipientId, errorCode: event.errorCode, errorMessage: event.errorMessage,
        deliveryAt: event.timestampMs ? new Date(event.timestampMs) : null,
        createdAt: existingEvent.data()?.createdAt || FieldValue.serverTimestamp(),
      }, { merge: true });
      return { matched, chats: touchedChats.size };
    });
    matchedMessages += counts.matched;
    updatedChats += counts.chats;
  }
  return { processedEvents: input.events.length, matchedMessages, updatedChats };
}
