import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

export class MessageMediaSourceChanged extends Error {
  readonly code = "message_media_source_changed";
  constructor() { super("Esta mensagem mudou. Atualize a conversa e tente novamente."); }
}
export type MessageMediaSource = {
  tenantId: string; chatId: string; messageId: string; userId?: string;
  message: FirebaseFirestore.DocumentSnapshot; chatGeneration: Timestamp;
  chatIdentity: unknown[]; channelGeneration: Timestamp | null; channelIdentity: unknown[] | null;
};
// Cache authority concerns the attachment, not text/receipts/AI annotations.
// Commercial extraction has its own stricter whole-message revision fence.
const assetFields = new Set(["tenantId", "chatId", "channel", "channelId", "channelPhoneNumberId", "channelExternalAccountId", "sender", "type",
  "metaMessageId", "inboundMetaMessageId", "inboundEventKey", "conversationIdentityKey", "mediaUrl", "mediaId", "mediaMimeType", "mediaName", "mediaSize",
  "mediaDuration", "mediaWidth", "mediaHeight", "mediaThumbnail", "mediaRecovery", "attachments", "mediaSourceMessageGeneration"]);
const body = (row: FirebaseFirestore.DocumentData) => Object.fromEntries(Object.entries(row).filter(([key]) => assetFields.has(key)));
const chatIdentity = (row: FirebaseFirestore.DocumentData) => [row.channel || null, row.channelId || null, row.contactPhone || null, row.contactId || null, row.externalContactId || null, row.groupJid || null, row.isGroup === true];
const channelIdentity = (row: FirebaseFirestore.DocumentData) => [row.type || null, row.provider || null, row.phoneNumberId || null, row.externalAccountId || null, row.pageId || null, row.metadata?.sessionId || null];
const sameGeneration = (snapshot: FirebaseFirestore.DocumentSnapshot, expected: Timestamp | undefined) => snapshot.createTime && expected && snapshot.createTime.isEqual(expected);

async function current(tx: FirebaseFirestore.Transaction, input: {tenantId: string; chatId: string; messageId: string; userId?: string}) {
  const [message, chat] = await Promise.all([tx.get(adminDb.collection("messages").doc(input.messageId)), tx.get(adminDb.collection("chats").doc(input.chatId))]);
  if (!message.exists || !chat.exists || message.data()?.tenantId !== input.tenantId || message.data()?.chatId !== input.chatId || chat.data()?.tenantId !== input.tenantId) throw new MessageMediaSourceChanged();
  const channelId = chat.data()?.channelId;
  const channel = typeof channelId === "string" && channelId && !channelId.includes("/") ? await tx.get(adminDb.collection("tenant_channels").doc(channelId)) : null;
  if (channel?.exists && channel.data()?.tenantId !== input.tenantId) throw new TenantAccessError("chat_channel_tenant_mismatch", "O canal desta conversa nao pertence a esta empresa.");
  if (input.userId) {
    const membership = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.userId, module: "inbox"});
    assertTenantRole(membership, "client_viewer");
    const record = channel?.exists ? {...chat.data(), channelScope: channel.data()?.channelScope, channelOwnerUserId: channel.data()?.ownerUserId} : chat.data()!;
    assertAssignedCommercialRecordAccess(membership, input.userId, record);
  }
  return {message, chat, channel};
}
function withSnapshots(input: {tenantId: string; chatId: string; messageId: string; userId?: string}, snapshots: Awaited<ReturnType<typeof current>>): MessageMediaSource {
  return {tenantId: input.tenantId, chatId: input.chatId, messageId: input.messageId, ...(input.userId ? {userId: input.userId} : {}), message: snapshots.message, chatGeneration: snapshots.chat.createTime!, chatIdentity: chatIdentity(snapshots.chat.data()!),
    channelGeneration: snapshots.channel?.createTime || null, channelIdentity: snapshots.channel?.exists ? channelIdentity(snapshots.channel.data()!) : null};
}
export async function captureMessageMediaSource(input: {tenantId: string; chatId: string; messageId: string; userId?: string;
  expectedMessage?: FirebaseFirestore.DocumentSnapshot; expectedRevision?: Timestamp; expectedIdentity?: Record<string, unknown>; expectedData?: Record<string, unknown>;
}) {
  return adminDb.runTransaction(async tx => {
    const snapshots = await current(tx, input), row = snapshots.message.data()!;
    if (input.expectedMessage && (input.expectedMessage.ref.path !== snapshots.message.ref.path || !sameGeneration(snapshots.message, input.expectedMessage.createTime) || !snapshots.message.updateTime?.isEqual(input.expectedMessage.updateTime!))) throw new MessageMediaSourceChanged();
    if (input.expectedRevision && !snapshots.message.updateTime?.isEqual(input.expectedRevision)) throw new MessageMediaSourceChanged();
    if (input.expectedData && !isDeepStrictEqual(body(row), body(input.expectedData))) throw new MessageMediaSourceChanged();
    if (input.expectedIdentity && Object.entries(input.expectedIdentity).some(([key, value]) => !isDeepStrictEqual(row[key], value))) throw new MessageMediaSourceChanged();
    return withSnapshots(input, snapshots);
  }, {readOnly: true});
}
async function checked(tx: FirebaseFirestore.Transaction, source: MessageMediaSource, equivalentPatch?: Record<string, unknown>) {
  const snapshots = await current(tx, source);
  if (!sameGeneration(snapshots.message, source.message.createTime) || !sameGeneration(snapshots.chat, source.chatGeneration) ||
      !isDeepStrictEqual(chatIdentity(snapshots.chat.data()!), source.chatIdentity) ||
      (source.channelGeneration ? !snapshots.channel || !sameGeneration(snapshots.channel, source.channelGeneration) : snapshots.channel?.exists) ||
      !isDeepStrictEqual(snapshots.channel?.exists ? channelIdentity(snapshots.channel.data()!) : null, source.channelIdentity)) throw new MessageMediaSourceChanged();
  const expected = equivalentPatch ? {...source.message.data(), ...equivalentPatch} : source.message.data()!;
  if (!isDeepStrictEqual(body(snapshots.message.data()!), body(expected))) throw new MessageMediaSourceChanged();
  return snapshots;
}
export async function assertMessageMediaSource(source: MessageMediaSource) {
  return adminDb.runTransaction(async tx => withSnapshots(source, await checked(tx, source)), {readOnly: true});
}
export function currentMediaReference(message: FirebaseFirestore.DocumentSnapshot, kind: "source" | "playback") {
  const generation = message.data()?.[kind === "source" ? "mediaSourceMessageGeneration" : "mediaPlaybackMessageGeneration"];
  return generation === undefined || generation === null || generation instanceof Timestamp && message.createTime?.isEqual(generation) === true;
}
export function assertMediaPathScope(source: Pick<MessageMediaSource, "tenantId" | "chatId">, path: string) {
  if (!path.startsWith(`chat-media/${source.tenantId}/${source.chatId}/`)) throw new TenantAccessError("message_media_path_denied", "Arquivo fora desta conversa.");
}
const sourceFields = new Set(["mediaUrl", "mediaMimeType", "mediaSize", "mediaProcessingStatus", "mediaProcessingError"]);
const playbackFields = new Set(["mediaPlaybackUrl", "mediaPlaybackSha256"]);
export async function writeMessageMediaReference(source: MessageMediaSource, patch: Record<string, unknown>, kind: "source" | "playback") {
  if (Object.keys(patch).some(key => !(kind === "source" ? sourceFields : playbackFields).has(key))) throw new Error("MESSAGE_MEDIA_PATCH_INVALID");
  const path = patch[kind === "source" ? "mediaUrl" : "mediaPlaybackUrl"];
  if (typeof path === "string") assertMediaPathScope(source, path);
  const marker = kind === "source" ? "mediaSourceMessageGeneration" : "mediaPlaybackMessageGeneration";
  const values = {...patch, [marker]: source.message.createTime!}, token = randomUUID();
  await adminDb.runTransaction(async tx => {
    let snapshots: Awaited<ReturnType<typeof current>>;
    try { snapshots = await checked(tx, source); }
    catch (error) {
      if (!(error instanceof MessageMediaSourceChanged)) throw error;
      snapshots = await checked(tx, source, values);
      // An identical cache result was accepted concurrently. It is already safe.
      if (Object.entries(values).every(([key, value]) => isDeepStrictEqual(snapshots.message.data()?.[key], value))) return;
      throw error;
    }
    tx.update(snapshots.message.ref, {...values, mediaReferenceWriteToken: token, ...(kind === "source" ? {mediaCachedAt: FieldValue.serverTimestamp()} : {}), updatedAt: FieldValue.serverTimestamp()});
  });
  return adminDb.runTransaction(async tx => {
    const snapshots = await checked(tx, source, values), row = snapshots.message.data()!;
    if (Object.entries(values).some(([key, value]) => !isDeepStrictEqual(row[key], value))) throw new MessageMediaSourceChanged();
    return withSnapshots(source, snapshots);
  }, {readOnly: true});
}

export async function markMessageMediaCacheFailed(source: MessageMediaSource, message: string) {
  return adminDb.runTransaction(async tx => {
    let snapshots: Awaited<ReturnType<typeof current>>;
    try { snapshots = await checked(tx, source); }
    catch (error) { if (error instanceof MessageMediaSourceChanged || error instanceof TenantAccessError) return false; throw error; }
    if (!snapshots.message.updateTime?.isEqual(source.message.updateTime!)) return false;
    tx.update(snapshots.message.ref, {mediaProcessingError: message.slice(0, 500), mediaProcessingStatus: "failed", mediaProcessingFailedAt: FieldValue.serverTimestamp()});
    return true;
  });
}
