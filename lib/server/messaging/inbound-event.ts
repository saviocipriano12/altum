import { createHash } from "node:crypto";
import { isMediaPlaceholder } from "@/lib/message-media-placeholder";

export const CANONICAL_INBOUND_EVENT_VERSION = 1;

export type CanonicalInboundChannel = "whatsapp" | "instagram" | "messenger" | "webchat";
export type CanonicalInboundMessageType =
  | "text"
  | "audio"
  | "image"
  | "video"
  | "document"
  | "sticker"
  | "location"
  | "contact"
  | "interactive"
  | "template"
  | "unknown";

export type CanonicalInboundAttachmentInput = {
  type?: unknown;
  url?: unknown;
  providerMediaId?: unknown;
  name?: unknown;
  mimeType?: unknown;
  caption?: unknown;
  durationMs?: unknown;
  width?: unknown;
  height?: unknown;
  sizeBytes?: unknown;
  thumbnailUrl?: unknown;
};

export type CanonicalInboundEventInput = {
  tenantId: unknown;
  channel: unknown;
  channelId: unknown;
  provider: unknown;
  providerEventId?: unknown;
  senderExternalId: unknown;
  recipientExternalId?: unknown;
  occurredAt?: unknown;
  receivedAt?: unknown;
  text?: unknown;
  attachments?: CanonicalInboundAttachmentInput[];
  quotedMessage?: {
    providerMessageId?: unknown;
    senderExternalId?: unknown;
    text?: unknown;
  } | null;
  campaign?: {
    id?: unknown;
    name?: unknown;
    source?: unknown;
    medium?: unknown;
    adId?: unknown;
    clickId?: unknown;
  } | null;
};

export type CanonicalInboundAttachment = {
  type: CanonicalInboundMessageType;
  url: string | null;
  providerMediaId: string | null;
  name: string | null;
  mimeType: string | null;
  caption: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  thumbnailUrl: string | null;
};

export type CanonicalInboundEvent = {
  version: typeof CANONICAL_INBOUND_EVENT_VERSION;
  tenantId: string;
  channel: CanonicalInboundChannel;
  channelId: string;
  provider: string;
  providerEventId: string | null;
  eventKey: string;
  messageDocumentId: string;
  conversationIdentityKey: string;
  senderExternalId: string;
  recipientExternalId: string | null;
  occurredAtMs: number;
  receivedAtMs: number;
  orderingTimestampMs: number;
  deliveryClass: "on_time" | "delayed" | "future_clock_skew";
  text: string;
  messageType: CanonicalInboundMessageType;
  attachments: CanonicalInboundAttachment[];
  quotedMessage: {
    providerMessageId: string | null;
    senderExternalId: string | null;
    text: string | null;
  } | null;
  campaign: {
    id: string | null;
    name: string | null;
    source: string | null;
    medium: string | null;
    adId: string | null;
    clickId: string | null;
  } | null;
  normalizationNotes: string[];
};

export type CanonicalInboundEventResult =
  | { accepted: true; event: CanonicalInboundEvent }
  | {
      accepted: false;
      reason:
        | "missing_tenant"
        | "unsupported_channel"
        | "missing_channel"
        | "missing_sender"
        | "empty_message"
        | "missing_idempotency_identity";
    };

const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const DELAYED_AFTER_MS = 5 * 60_000;

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function timestampMs(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric > 1_000_000_000_000 ? Math.floor(numeric) : Math.floor(numeric * 1000);
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value > 1_000_000_000_000 ? Math.floor(value) : Math.floor(value * 1000);
  }
  return null;
}

function channel(value: unknown): CanonicalInboundChannel | null {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "facebook" || normalized === "facebook_messenger") return "messenger";
  if (["whatsapp", "instagram", "messenger", "webchat"].includes(normalized)) {
    return normalized as CanonicalInboundChannel;
  }
  return null;
}

function messageType(value: unknown): CanonicalInboundMessageType {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "file") return "document";
  if (
    [
      "text",
      "audio",
      "image",
      "video",
      "document",
      "sticker",
      "location",
      "contact",
      "interactive",
      "template",
    ].includes(normalized)
  ) {
    return normalized as CanonicalInboundMessageType;
  }
  return "unknown";
}

function attachmentLabel(type: CanonicalInboundMessageType) {
  if (type === "audio") return "[Áudio recebido]";
  if (type === "image") return "[Imagem recebida]";
  if (type === "video") return "[Vídeo recebido]";
  if (type === "document") return "[Arquivo recebido]";
  if (type === "sticker") return "[Sticker recebido]";
  if (type === "location") return "[Localização recebida]";
  if (type === "contact") return "[Contato recebido]";
  return "[Anexo recebido]";
}

function safeDocumentId(prefix: string, identity: string) {
  const hash = createHash("sha256").update(identity).digest("hex");
  return `${prefix}_${hash}`;
}

function normalizeAttachment(input: CanonicalInboundAttachmentInput): CanonicalInboundAttachment {
  return {
    type: messageType(input.type),
    url: clean(input.url, 1800) || null,
    providerMediaId: clean(input.providerMediaId, 300) || null,
    name: clean(input.name, 260) || null,
    mimeType: clean(input.mimeType, 160) || null,
    caption: clean(input.caption, 1200) || null,
    durationMs: finiteNumber(input.durationMs),
    width: finiteNumber(input.width),
    height: finiteNumber(input.height),
    sizeBytes: finiteNumber(input.sizeBytes),
    thumbnailUrl: clean(input.thumbnailUrl, 1800) || null,
  };
}

function normalizedObject<T extends Record<string, string | null>>(input: T | null | undefined) {
  if (!input) return null;
  return Object.values(input).some(Boolean) ? input : null;
}

export function normalizeCanonicalInboundEvent(
  input: CanonicalInboundEventInput
): CanonicalInboundEventResult {
  const tenantId = clean(input.tenantId, 180);
  if (!tenantId) return { accepted: false, reason: "missing_tenant" };
  const normalizedChannel = channel(input.channel);
  if (!normalizedChannel) return { accepted: false, reason: "unsupported_channel" };
  const channelId = clean(input.channelId, 220);
  if (!channelId) return { accepted: false, reason: "missing_channel" };
  const senderExternalId = clean(input.senderExternalId, 320);
  if (!senderExternalId) return { accepted: false, reason: "missing_sender" };

  const receivedAtMs = timestampMs(input.receivedAt) || Date.now();
  const rawOccurredAtMs = timestampMs(input.occurredAt);
  const notes: string[] = [];
  const occurredAtMs = rawOccurredAtMs || receivedAtMs;
  if (!rawOccurredAtMs) notes.push("provider_timestamp_missing");
  let deliveryClass: CanonicalInboundEvent["deliveryClass"] = "on_time";
  let orderingTimestampMs = occurredAtMs;
  if (occurredAtMs > receivedAtMs + MAX_FUTURE_SKEW_MS) {
    deliveryClass = "future_clock_skew";
    orderingTimestampMs = receivedAtMs;
    notes.push("provider_timestamp_future_skew");
  } else if (receivedAtMs - occurredAtMs > DELAYED_AFTER_MS) {
    deliveryClass = "delayed";
    notes.push("delayed_delivery");
  }

  const attachments = (Array.isArray(input.attachments) ? input.attachments : [])
    .slice(0, 12)
    .map(normalizeAttachment);
  const rawText = clean(input.text, 4000);
  const baseText = attachments.some((attachment) => isMediaPlaceholder(attachment.type, rawText)) ? "" : rawText;
  const captions = attachments.filter((attachment) => !isMediaPlaceholder(attachment.type, attachment.caption)).map((attachment) => attachment.caption).filter(Boolean) as string[];
  const labels = attachments.map((attachment) => attachmentLabel(attachment.type));
  const textParts = [baseText, ...captions.filter((caption) => caption !== baseText), ...labels];
  const text = [...new Set(textParts.filter(Boolean))].join(" ").slice(0, 6000);
  if (!text) return { accepted: false, reason: "empty_message" };

  const providerEventId = clean(input.providerEventId, 320) || null;
  if (!providerEventId && !rawOccurredAtMs) {
    return { accepted: false, reason: "missing_idempotency_identity" };
  }
  if (!providerEventId) notes.push("provider_event_id_missing_fingerprint_used");
  const provider = clean(input.provider, 100).toLowerCase() || "unknown";
  const recipientExternalId = clean(input.recipientExternalId, 320) || null;
  const identityPayload = JSON.stringify([
    tenantId,
    normalizedChannel,
    channelId,
    provider,
    providerEventId || "",
    senderExternalId,
    recipientExternalId || "",
    providerEventId ? "" : occurredAtMs,
    providerEventId ? "" : text,
  ]);
  const eventKey = safeDocumentId("inbound_event", identityPayload);
  const messageDocumentId = safeDocumentId("in", identityPayload);
  const conversationIdentityKey = safeDocumentId(
    "conversation",
    JSON.stringify([tenantId, normalizedChannel, channelId, senderExternalId])
  );
  const primaryAttachment = attachments.find((attachment) => attachment.type !== "unknown");

  return {
    accepted: true,
    event: {
      version: CANONICAL_INBOUND_EVENT_VERSION,
      tenantId,
      channel: normalizedChannel,
      channelId,
      provider,
      providerEventId,
      eventKey,
      messageDocumentId,
      conversationIdentityKey,
      senderExternalId,
      recipientExternalId,
      occurredAtMs,
      receivedAtMs,
      orderingTimestampMs,
      deliveryClass,
      text,
      messageType: primaryAttachment?.type || "text",
      attachments,
      quotedMessage: normalizedObject({
        providerMessageId: clean(input.quotedMessage?.providerMessageId, 320) || null,
        senderExternalId: clean(input.quotedMessage?.senderExternalId, 320) || null,
        text: clean(input.quotedMessage?.text, 1200) || null,
      }),
      campaign: normalizedObject({
        id: clean(input.campaign?.id, 240) || null,
        name: clean(input.campaign?.name, 240) || null,
        source: clean(input.campaign?.source, 120) || null,
        medium: clean(input.campaign?.medium, 120) || null,
        adId: clean(input.campaign?.adId, 240) || null,
        clickId: clean(input.campaign?.clickId, 300) || null,
      }),
      normalizationNotes: notes,
    },
  };
}

export function shouldAdvanceConversationCursor(input: {
  previousOccurredAtMs?: unknown;
  incomingOccurredAtMs: number;
}) {
  const previous = finiteNumber(input.previousOccurredAtMs);
  if (previous === null) return true;
  return input.incomingOccurredAtMs >= previous;
}
