import {
  callWhatsAppGateway,
  sendMetaMediaLinkMessage,
  sendMetaTemplateMessage,
  sendMetaTextMessage,
  type WhatsAppChannelConfig,
} from "@/app/lib/server/whatsapp-channel";
import { messagingResult } from "./result";
import type { MessagingProvider, MessagingSessionResult } from "./types";

function statusOf(payload: Record<string, unknown>): MessagingSessionResult["status"] {
  const raw = String(payload.status || payload.state || payload.connectionState || "").trim().toLowerCase();
  if (["connected", "ready", "open", "online"].includes(raw)) return "connected";
  if (["qr", "qr_required", "pairing", "pending_qr"].includes(raw)) return "qr_required";
  if (["connecting", "starting", "syncing"].includes(raw)) return "connecting";
  if (["disconnected", "closed", "offline"].includes(raw)) return "disconnected";
  if (["error", "failed"].includes(raw)) return "error";
  return "unknown";
}

export class LegacyGatewayMessagingProvider implements MessagingProvider {
  readonly id = "legacy_gateway" as const;
  readonly supportsTemplates = true;
  readonly supportsQr = Boolean(this.channel.qrCodeEndpoint);

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
    if (!input.mediaUrl || input.mediaType === "audio") {
      throw new Error("Este gateway legado exige uma URL publica para enviar esta midia.");
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

  private async session(endpoint?: string) {
    if (!endpoint) throw new Error("Endpoint de sessao do gateway nao configurado.");
    const payload = await callWhatsAppGateway({ channel: this.channel, endpoint, payload: { action: "status" } });
    return { status: statusOf(payload), payload };
  }

  getSession() { return this.session(this.channel.sessionStatusEndpoint); }
  getQrCode() { return this.session(this.channel.qrCodeEndpoint); }
}
