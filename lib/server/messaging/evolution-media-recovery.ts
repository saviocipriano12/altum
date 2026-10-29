import { adminDb } from "@/app/lib/server/firebase-admin";
import { getWhatsAppChannelById, type WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { isEvolutionWhatsAppProvider } from "./registry";
import { downloadEvolutionInboundMedia } from "./evolution-provider";
import { cacheInboundMessageMedia } from "@/lib/server/ai/multimodal";
import { captureMessageMediaSource, assertMessageMediaSource, type MessageMediaSource } from "@/lib/server/message-media-source";

/** A minimal reference lets Evolution retrieve the message it already stores.
 * Keep this server-side; never expose provider message bodies or keys to the UI. */
export function evolutionMediaReference(raw: Record<string, unknown>) {
  const key = raw.key && typeof raw.key === "object" ? raw.key as Record<string, unknown> : {};
  return { key: { id: String(key.id || "").slice(0, 260), remoteJid: String(key.remoteJid || "").slice(0, 180),
    fromMe: key.fromMe === true, ...(key.participant ? { participant: String(key.participant).slice(0, 180) } : {}) } };
}

export async function cacheEvolutionMessageMedia(input: { tenantId: string; chatId: string; messageId: string; channel: WhatsAppChannelConfig; reference: Record<string, unknown>; type: string; mimeType?: string; name?: string; source?: MessageMediaSource }) {
  const source = input.source || await captureMessageMediaSource({...input, expectedIdentity: {channelId: input.channel.id}});
  if (source.tenantId !== input.tenantId || source.chatId !== input.chatId || source.messageId !== input.messageId) return null;
  await assertMessageMediaSource(source);
  const key = input.reference.key && typeof input.reference.key === "object" ? input.reference.key as Record<string, unknown> : {};
  const storedId = source.message.data()?.metaMessageId || source.message.data()?.inboundMetaMessageId;
  if (storedId && key.id && storedId !== key.id) return null;
  const media = await downloadEvolutionInboundMedia(input.channel, input.reference);
  await assertMessageMediaSource(source);
  const contentType = media.contentType === "application/octet-stream" ? input.mimeType || media.contentType : media.contentType;
  return cacheInboundMessageMedia({ tenantId: input.tenantId, chatId: input.chatId, messageId: input.messageId, source,
    message: { type: input.type, mediaUrl: `data:${contentType};base64,${media.base64}`,
      mediaMimeType: contentType, mediaName: media.filename || input.name } });
}

export async function readEvolutionMessageMedia(input: { tenantId: string; chatId: string; messageId: string; data: Record<string, unknown>; source?: MessageMediaSource }) {
  if (input.data.tenantId && input.data.tenantId !== input.tenantId || input.data.chatId && input.data.chatId !== input.chatId) return null;
  const source = input.source || await captureMessageMediaSource({...input, expectedData: input.data});
  if (source.tenantId !== input.tenantId || source.chatId !== input.chatId || source.messageId !== input.messageId) return null;
  const currentSource = await assertMessageMediaSource(source), data = currentSource.message.data()!;
  const channelId = String(data.channelId || "");
  const externalId = String(data.metaMessageId || data.inboundMetaMessageId || "");
  if (!channelId || !externalId || data.channel !== "whatsapp") return null;
  const channel = await getWhatsAppChannelById(channelId);
  if (!channel || channel.tenantId !== input.tenantId || !isEvolutionWhatsAppProvider(channel.provider)) return null;
  const chat = await adminDb.collection("chats").doc(input.chatId).get();
  if (chat.data()?.tenantId !== input.tenantId || chat.data()?.channelId !== channelId) return null;
  const recovery = data.mediaRecovery && typeof data.mediaRecovery === "object" ? data.mediaRecovery as Record<string, unknown> : null;
  const reference = recovery || { key: { id: externalId, remoteJid: chat.data()?.groupJid || `${String(chat.data()?.contactPhone || "").replace(/\D/g, "")}@s.whatsapp.net`, fromMe: data.sender === "agent" } };
  const media = await downloadEvolutionInboundMedia(channel, reference);
  await assertMessageMediaSource(currentSource);
  return { buffer: Buffer.from(media.base64, "base64"), contentType: media.contentType === "application/octet-stream" ? String(data.mediaMimeType || media.contentType) : media.contentType };
}

export async function recoverEvolutionMessageMedia(input: { tenantId: string; chatId: string; messageId: string; data: Record<string, unknown> }) {
  if (input.data.tenantId && input.data.tenantId !== input.tenantId || input.data.chatId && input.data.chatId !== input.chatId) return null;
  const source = await captureMessageMediaSource({...input, expectedData: input.data});
  const media = await readEvolutionMessageMedia({...input, source});
  if (!media) return null;
  return cacheInboundMessageMedia({ ...input, source, message: { type: input.data.type,
    mediaUrl: `data:${media.contentType};base64,${media.buffer.toString("base64")}`, mediaMimeType: media.contentType, mediaName: input.data.mediaName } });
}
