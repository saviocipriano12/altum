import {
  sendMetaAudioMessage,
  sendMetaMediaIdMessage,
  sendMetaMediaLinkMessage,
  sendMetaTemplateMessage,
  sendMetaTextMessage,
  uploadWhatsAppMedia,
  type WhatsAppChannelConfig,
} from "@/app/lib/server/whatsapp-channel";
import { messagingResult } from "./result";
import type { MessagingProvider } from "./types";

export class MetaCloudMessagingProvider implements MessagingProvider {
  readonly id = "meta_cloud" as const;
  readonly supportsTemplates = true;
  readonly supportsQr = false;

  constructor(readonly channel: WhatsAppChannelConfig) {}

  async sendText(input: { to: string; text: string }) {
    const payload = await sendMetaTextMessage({ channel: this.channel, ...input });
    return messagingResult(this.id, payload as Record<string, unknown>);
  }

  async sendTemplate(input: Parameters<MessagingProvider["sendTemplate"]>[0]) {
    const payload = await sendMetaTemplateMessage({ channel: this.channel, ...input });
    return messagingResult(this.id, payload as Record<string, unknown>);
  }

  async sendMedia(input: Parameters<MessagingProvider["sendMedia"]>[0]) {
    if (input.mediaUrl) {
      if (input.mediaType === "audio") {
        throw new Error("Audio por URL ainda nao e suportado pelo conector Meta.");
      }
      const payload = await sendMetaMediaLinkMessage({
        channel: this.channel,
        to: input.to,
        mediaUrl: input.mediaUrl,
        mediaType: input.mediaType,
        caption: input.caption,
        filename: input.filename,
      });
      return messagingResult(this.id, payload as Record<string, unknown>);
    }
    if (!input.buffer) throw new Error("Arquivo obrigatorio para envio de midia.");
    const upload = await uploadWhatsAppMedia({
      channel: this.channel,
      buffer: input.buffer,
      filename: input.filename || "arquivo",
      contentType: input.contentType || "application/octet-stream",
    });
    const payload = input.mediaType === "audio"
      ? await sendMetaAudioMessage({ channel: this.channel, to: input.to, mediaId: upload.mediaId, voice: input.voice })
      : await sendMetaMediaIdMessage({
          channel: this.channel,
          to: input.to,
          mediaId: upload.mediaId,
          mediaType: input.mediaType,
          caption: input.caption,
          filename: input.filename,
        });
    return messagingResult(this.id, payload as Record<string, unknown>, upload.mediaId);
  }
}
