import type {
  WhatsAppChannelConfig,
  WhatsAppTemplateHeaderMedia,
} from "@/app/lib/server/whatsapp-channel";

export type MessagingProviderId = "meta_cloud" | "evolution" | "legacy_gateway";
export type MessagingMediaType = "image" | "video" | "document" | "audio";

export type MessagingResult = {
  provider: MessagingProviderId;
  externalMessageId: string | null;
  mediaId?: string | null;
  payload: Record<string, unknown>;
};

export type MessagingSessionResult = {
  status: "connected" | "qr_required" | "connecting" | "disconnected" | "error" | "unknown";
  qr?: string;
  payload: Record<string, unknown>;
};

export interface MessagingProvider {
  readonly id: MessagingProviderId;
  readonly channel: WhatsAppChannelConfig;
  readonly supportsTemplates: boolean;
  readonly supportsQr: boolean;

  sendText(input: { to: string; text: string }): Promise<MessagingResult>;
  sendTemplate(input: {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyParams?: string[];
    headerMedia?: WhatsAppTemplateHeaderMedia | null;
  }): Promise<MessagingResult>;
  sendMedia(input: {
    to: string;
    mediaType: MessagingMediaType;
    buffer?: Buffer;
    mediaUrl?: string;
    filename?: string;
    contentType?: string;
    caption?: string;
    voice?: boolean;
  }): Promise<MessagingResult>;
  getSession?(): Promise<MessagingSessionResult>;
  getQrCode?(): Promise<MessagingSessionResult>;
  provision?(input: { webhookUrl: string }): Promise<Record<string, unknown>>;
}
