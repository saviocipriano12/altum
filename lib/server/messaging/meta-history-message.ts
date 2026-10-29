import { createHash } from "node:crypto";
import { normalizeCanonicalInboundEvent, type CanonicalInboundAttachmentInput } from "./inbound-event";

export type MetaHistoryParticipant = { id?: string; name?: string; username?: string };
export type MetaHistoryMessage = {
  id?: string; message?: string; created_time?: string; from?: MetaHistoryParticipant;
  to?: { data?: MetaHistoryParticipant[] }; attachments?: { data?: Array<Record<string, unknown>> };
};
const clean = (value: unknown, max = 4000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
function mediaUrl(value: unknown) {
  try { const url = new URL(clean(value));
    return url.protocol === "https:" && !url.username && !url.password &&
      ["fbcdn.net", "fbsbx.com", "facebook.com", "cdninstagram.com", "instagram.com"].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null;
  } catch { return null; }
}
export function parseMetaHistoryMessage(input: {
  tenantId: string; channelId: string; channel: "instagram" | "messenger";
  accountIds: string[]; contactId: string; message: MetaHistoryMessage;
}) {
  const m = input.message, id = clean(m.id, 320), from = clean(m.from?.id, 320);
  const time = new Date(clean(m.created_time, 80)).getTime();
  if (!id || !from || !Number.isFinite(time) || time > Date.now() + 300_000) return null;
  const self = new Set(input.accountIds.filter(Boolean)), outgoing = self.has(from);
  if (!outgoing && from !== input.contactId) return null;
  const recipients = m.to?.data?.map(p => clean(p.id, 320)).filter(Boolean) || [];
  if (recipients.length && !(outgoing ? recipients.includes(input.contactId) : recipients.some(id => self.has(id)))) return null;
  const attachments: CanonicalInboundAttachmentInput[] = (m.attachments?.data || []).slice(0, 10).map(a => {
    const image = record(a.image_data), video = record(a.video_data), audio = record(a.audio_data);
    const mime = clean(a.mime_type, 180);
    const type = a.image_data || mime.startsWith("image/") ? "image" : a.video_data || mime.startsWith("video/") ? "video" : a.audio_data || mime.startsWith("audio/") ? "audio" : "document";
    return { type, url: mediaUrl(image.url || video.url || audio.url || a.file_url),
      mimeType: mime || null, name: clean(a.name, 180) || null };
  });
  const recipient = recipients[0] || (outgoing ? input.contactId : input.accountIds[0]);
  const normalized = normalizeCanonicalInboundEvent({ tenantId: input.tenantId, channelId: input.channelId,
    channel: input.channel, provider: "meta", providerEventId: id, senderExternalId: from,
    recipientExternalId: recipient, occurredAt: time, text: clean(m.message) || (outgoing && !attachments.length
      ? `[Mensagem enviada no ${input.channel === "instagram" ? "Instagram" : "Messenger"}: conteúdo não disponibilizado pela Meta]` : ""), attachments });
  if (!normalized.accepted) return null;
  return { ...normalized.event, sender: outgoing ? "agent" as const : "client" as const,
    contentUnavailable: outgoing && !clean(m.message) && !attachments.length,
    historyId: `meta_history_${createHash("sha256").update(JSON.stringify([input.tenantId, input.channel, input.channelId, id])).digest("hex")}` };
}
