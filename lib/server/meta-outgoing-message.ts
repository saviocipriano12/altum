import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { MetaChannelConfig } from "@/app/lib/server/meta-channel";
import type { CanonicalInboundEvent } from "@/lib/server/messaging/inbound-event";
import { resolveCanonicalSocialChat } from "@/lib/server/social-chat-identity";
import { buildManualQueuePatch, toDate } from "@/lib/server/chat-operations";

export function metaOutgoingMessageId(tenantId: string, channelId: string, providerId: string) {
  return `meta_external_${createHash("sha256").update(JSON.stringify([tenantId, channelId, providerId])).digest("hex")}`;
}

/** A native-app reply is history, never a new inbound trigger for AI or automations. */
export async function persistMetaOutgoingMessage(input: {
  channel: MetaChannelConfig; event: CanonicalInboundEvent; chatId?: string; contentUnavailable?: boolean; source: "meta_native_echo" | "meta_history_recovery";
}) {
  const { channel, event } = input;
  const accounts = [channel.externalAccountId, channel.pageId].filter(Boolean);
  const contactId = event.recipientExternalId;
  if (!event.providerEventId || !contactId || !accounts.includes(event.senderExternalId) || accounts.includes(contactId) ||
    event.tenantId !== channel.tenantId || event.channelId !== channel.id || event.channel !== channel.type ||
    (channel.type !== "instagram" && channel.type !== "messenger")) throw new Error("meta_outgoing_identity_invalid");
  const chatRef = input.chatId ? adminDb.collection("chats").doc(input.chatId) : (await resolveCanonicalSocialChat({
    tenantId: channel.tenantId, channel: channel.type, channelId: channel.id, externalProfileId: contactId,
    createData: { tenantId: channel.tenantId, channel: channel.type, channelId: channel.id,
      channelExternalAccountId: channel.externalAccountId || channel.pageId, contactExternalId: contactId,
      contactName: `${channel.type === "instagram" ? "Instagram" : "Messenger"} ${contactId.slice(-6)}`,
      status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
  })).chatRef;
  const ref = adminDb.collection("messages").doc(metaOutgoingMessageId(channel.tenantId, channel.id, event.providerEventId));
  const created = await adminDb.runTransaction(async tx => {
    const [chat, current, stored, matches] = await Promise.all([
      tx.get(chatRef), tx.get(adminDb.collection("tenant_channels").doc(channel.id)), tx.get(ref),
      tx.get(adminDb.collection("messages").where("chatId", "==", chatRef.id).where("metaMessageId", "==", event.providerEventId)),
    ]);
    const data = chat.data(), active = current.data();
    if (!data || data.tenantId !== channel.tenantId || data.channelId !== channel.id || data.channel !== channel.type ||
      data.contactExternalId !== contactId || active?.tenantId !== channel.tenantId || active.status !== "active" ||
      String(active.externalAccountId || "") !== String(channel.externalAccountId || "")) throw new Error("meta_outgoing_scope_changed");
    if (stored.exists && (stored.data()?.tenantId !== channel.tenantId || stored.data()?.chatId !== chatRef.id || stored.data()?.metaMessageId !== event.providerEventId)) throw new Error("meta_outgoing_conflict");
    const upgrade = stored.exists && stored.data()?.contentUnavailable === true && input.contentUnavailable !== true;
    if (stored.exists && !upgrade || matches.docs.some(d => d.id !== ref.id && d.data().tenantId === channel.tenantId && (!d.data().channelId || d.data().channelId === channel.id))) return false;
    const a = event.attachments[0];
    tx.set(ref, { tenantId: channel.tenantId, chatId: chatRef.id, channel: channel.type, channelId: channel.id,
      metaMessageId: event.providerEventId, sender: "agent", text: event.text, type: event.messageType,
      status: "sent", deliveryStatus: "sent", source: input.source, contentUnavailable: input.contentUnavailable === true, attachments: event.attachments,
      mediaUrl: a?.url || null, mediaMimeType: a?.mimeType || null, mediaName: a?.name || null,
      mediaDuration: a?.durationMs ?? null, mediaWidth: a?.width ?? null, mediaHeight: a?.height ?? null,
      mediaSize: a?.sizeBytes ?? null, mediaThumbnail: a?.thumbnailUrl || null,
      createdAt: new Date(event.occurredAtMs), providerOccurredAt: new Date(event.occurredAtMs), receivedAt: FieldValue.serverTimestamp() }, { merge: upgrade });
    const patch: Record<string, unknown> = {};
    if (event.occurredAtMs >= (toDate(data.lastMessageTime)?.getTime() || 0)) {
      patch.lastMessage = event.text; patch.lastMessageTime = new Date(event.occurredAtMs);
    }
    if (event.occurredAtMs > (toDate(data.lastAgentMessageAt)?.getTime() || 0)) patch.lastAgentMessageAt = new Date(event.occurredAtMs);
    if (Object.keys(patch).length) tx.update(chatRef, { ...patch, ...buildManualQueuePatch({ ...data, ...patch }), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return { created, chatId: chatRef.id, messageId: ref.id };
}
