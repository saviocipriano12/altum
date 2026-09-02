function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanBase64(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  return normalized.length <= 48 * 1024 * 1024 ? normalized : "";
}

function cleanThumbnail(value: unknown) {
  const normalized = cleanBase64(value);
  // A miniatura serve apenas como poster e apoio de leitura do video. Nunca a
  // confundimos com a midia original, que e baixada pela Evolution no webhook.
  return normalized.length <= 900 * 1024 ? normalized : "";
}

function normalizedEvent(value: unknown) {
  return clean(value, 80).toLowerCase().replace(/_/g, ".");
}

function mediaMessage(message: Record<string, unknown>) {
  const candidates = [
    ["image", record(message.imageMessage)],
    ["video", record(message.videoMessage)],
    ["document", record(message.documentMessage)],
    ["audio", record(message.audioMessage)],
  ] as const;
  return candidates.find(([, value]) => Object.keys(value).length > 0) || null;
}

function unwrapMessage(input: Record<string, unknown>) {
  let message = input;
  const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage",
    "editedMessage",
  ];

  for (let depth = 0; depth < 6; depth += 1) {
    const wrapper = wrappers
      .map((key) => record(message[key]))
      .find((value) => Object.keys(value).length > 0);
    const nested = wrapper ? record(wrapper.message) : {};
    if (Object.keys(nested).length === 0) break;
    message = nested;
  }

  return message;
}

function phoneJid(value: unknown) {
  const jid = clean(value, 180);
  return /@(s\.whatsapp\.net|c\.us)$/i.test(jid) ? jid : "";
}

function resolveInboundJid(body: Record<string, unknown>, data: Record<string, unknown>, key: Record<string, unknown>) {
  const remoteJid = clean(key.remoteJid, 180);
  if (phoneJid(remoteJid)) return remoteJid;

  const candidates = [
    key.remoteJidAlt,
    key.senderPn,
    data.sender,
    body.sender,
    key.participant,
  ];
  return candidates.map(phoneJid).find(Boolean) || "";
}

export type EvolutionInbound = {
  kind: "message";
  from: string;
  text: string;
  contactName: string;
  messageId: string;
  messageType: "text" | "image" | "video" | "document" | "audio";
  mediaUrl: string;
  mediaBase64: string;
  mediaMimeType: string;
  mediaName: string;
  mediaThumbnail: string;
  rawMessage: Record<string, unknown>;
};

export type EvolutionDelivery = {
  kind: "delivery";
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipientId: string;
  errorCode: string;
  errorMessage: string;
};

export type EvolutionConnection = {
  kind: "connection";
  status: "connected" | "connecting" | "disconnected" | "error" | "unknown";
  errorMessage: string;
};

export type EvolutionWebhookEvent = EvolutionInbound | EvolutionDelivery | EvolutionConnection;

function normalizeDeliveryStatus(value: unknown): EvolutionDelivery["status"] | null {
  const raw = clean(value, 80).toUpperCase();
  if (["READ", "PLAYED", "READ_ACK"].includes(raw)) return "read";
  if (["DELIVERED", "DELIVERY_ACK"].includes(raw)) return "delivered";
  if (["SENT", "SERVER_ACK", "PENDING"].includes(raw)) return "sent";
  if (["FAILED", "ERROR", "DELETED"].includes(raw)) return "failed";
  return null;
}

function parseDelivery(body: Record<string, unknown>): EvolutionDelivery | null {
  const data = record(body.data);
  const key = record(data.key);
  const status = normalizeDeliveryStatus(data.status || body.status);
  const messageId = clean(data.keyId, 260) || clean(data.messageId, 260) || clean(key.id, 260);
  if (!status || !messageId) return null;
  const errors = Array.isArray(data.errors) ? data.errors : [];
  const firstError = record(errors[0]);
  return {
    kind: "delivery",
    messageId,
    status,
    recipientId: clean(data.remoteJid, 180).split("@")[0].replace(/\D/g, ""),
    errorCode: clean(firstError.code, 80),
    errorMessage: clean(firstError.message || firstError.title || data.error, 500),
  };
}

function parseConnection(body: Record<string, unknown>): EvolutionConnection {
  const data = record(body.data);
  const raw = clean(data.state || data.status || body.state, 80).toLowerCase();
  const status = ["open", "connected", "ready", "online"].includes(raw)
    ? "connected"
    : ["connecting", "starting", "syncing"].includes(raw)
      ? "connecting"
      : ["close", "closed", "disconnected", "offline"].includes(raw)
        ? "disconnected"
        : ["error", "failed"].includes(raw)
          ? "error"
          : "unknown";
  return { kind: "connection", status, errorMessage: clean(data.error || data.message, 500) };
}

export function parseEvolutionWebhook(body: Record<string, unknown>): EvolutionWebhookEvent | null {
  const event = normalizedEvent(body.event);
  if (event === "messages.update" || event === "send.message.update") return parseDelivery(body);
  if (event === "connection.update") return parseConnection(body);
  if (event && event !== "messages.upsert") return null;
  const data = record(body.data);
  const key = record(data.key);
  if (key.fromMe === true) return null;
  const rawMessage = record(data.message);
  const message = unwrapMessage(rawMessage);
  const extended = record(message.extendedTextMessage);
  const selectedMedia = mediaMessage(message);
  const type = selectedMedia?.[0] || "text";
  const media = selectedMedia?.[1] || {};
  const remoteJid = resolveInboundJid(body, data, key);
  const from = remoteJid.split("@")[0].replace(/\D/g, "");
  const fallback = type === "image" ? "[Imagem recebida]" : type === "video" ? "[Video recebido]" : type === "document" ? "[Arquivo recebido]" : type === "audio" ? "[Audio recebido]" : "";
  const text = clean(message.conversation) || clean(extended.text) || clean(media.caption) || fallback;
  if (!from || (!text && type === "text")) return null;
  return {
    kind: "message",
    from,
    text,
    contactName: clean(data.pushName, 180) || from,
    messageId: clean(key.id, 260),
    messageType: type,
    mediaUrl: clean(media.url, 1400),
    mediaBase64: cleanBase64(media.base64 || message.base64 || rawMessage.base64 || data.base64),
    mediaMimeType: clean(media.mimetype || media.mime_type, 180),
    mediaName: clean(media.fileName || media.filename, 240),
    mediaThumbnail: cleanThumbnail(media.jpegThumbnail || media.thumbnail || message.jpegThumbnail),
    rawMessage: data,
  };
}

export function parseEvolutionInbound(body: Record<string, unknown>) {
  const parsed = parseEvolutionWebhook(body);
  return parsed?.kind === "message" ? parsed : null;
}
