import { randomUUID } from "node:crypto";
import type { WhatsAppChannelConfig } from "@/app/lib/server/whatsapp-channel";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";
import { messagingResult } from "./result";
import type { MessagingProvider, MessagingSessionResult } from "./types";
import { readEvolutionQr } from "./evolution-qr";
import { buildEvolutionMediaRequest } from "./evolution-media";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function readMediaBase64(value: unknown) {
  if (typeof value !== "string") return "";
  const raw = value.trim();
  const dataUrlMatch = raw.match(/^data:([^,]*?);base64,([a-z0-9+/=\r\n]+)$/i);
  const normalized = (dataUrlMatch?.[2] || raw).replace(/\s+/g, "");
  if (normalized.length > 48 * 1024 * 1024) {
    throw new Error("Midia recebida excede o limite de 32MB.");
  }
  if (normalized && !/^[a-z0-9+/=]+$/i.test(normalized)) {
    throw new Error("Evolution retornou uma midia em formato invalido.");
  }
  return normalized;
}

function baseUrl(channel: WhatsAppChannelConfig) {
  const value = clean(channel.gatewayEndpoint, 500).replace(/\/+$/, "");
  if (!value) throw new Error("Informe a URL da Evolution API.");
  return value;
}

function instanceName(channel: WhatsAppChannelConfig) {
  return clean(channel.sessionId || channel.id, 180);
}

function payloadError(payload: Record<string, unknown>, status: number) {
  const response = payload.response && typeof payload.response === "object"
    ? payload.response as Record<string, unknown>
    : {};
  const messageValue = payload.message || response.message;
  const message = clean(messageValue) ||
    (Array.isArray(messageValue) ? messageValue.map((item) => clean(item, 500)).filter(Boolean).join("; ") : "") ||
    clean(payload.error) || clean(response.error);
  return message || `Evolution API retornou HTTP ${status}.`;
}

class EvolutionRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "EvolutionRequestError";
    this.status = status;
  }
}

export function normalizeEvolutionSession(payload: Record<string, unknown>): MessagingSessionResult["status"] {
  const instance = payload.instance && typeof payload.instance === "object"
    ? payload.instance as Record<string, unknown>
    : {};
  const raw = clean(payload.state || payload.status || payload.connectionState || instance.state, 80).toLowerCase();
  if (["open", "connected", "ready", "online"].includes(raw)) return "connected";
  if (["connecting", "starting", "syncing"].includes(raw)) return "connecting";
  if (["qr", "qr_required", "pairing", "pending_qr"].includes(raw)) return "qr_required";
  if (["close", "closed", "disconnected", "offline"].includes(raw)) return "disconnected";
  if (["error", "failed"].includes(raw)) return "error";
  return "unknown";
}

export class EvolutionMessagingProvider implements MessagingProvider {
  readonly id = "evolution" as const;
  readonly supportsTemplates = false;
  readonly supportsQr = true;

  readonly channel: WhatsAppChannelConfig;

  constructor(channel: WhatsAppChannelConfig) {
    this.channel = channel;
  }

  private async request(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl(this.channel)}${path}`, {
      ...init,
      signal: init?.signal || AbortSignal.timeout(20_000),
      headers: {
        apikey: this.channel.accessToken,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new EvolutionRequestError(response.status, payloadError(payload, response.status));
    return payload;
  }

  async sendText(input: { to: string; text: string }) {
    const path = `/message/sendText/${encodeURIComponent(instanceName(this.channel))}`;
    try {
      const payload = await this.request(path, { method: "POST", body: JSON.stringify({ number: input.to, text: input.text }) });
      return messagingResult(this.id, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/400|422|valid|text/i.test(message)) throw error;
      const payload = await this.request(path, {
        method: "POST",
        body: JSON.stringify({ number: input.to, textMessage: { text: input.text } }),
      });
      return messagingResult(this.id, payload);
    }
  }

  async sendTemplate(): Promise<never> {
    throw new Error("Templates aprovados pertencem ao canal oficial Meta. No WhatsApp por QR, envie uma mensagem normal.");
  }

  async sendMedia(input: Parameters<MessagingProvider["sendMedia"]>[0]) {
    const { path, body } = buildEvolutionMediaRequest(instanceName(this.channel), input);
    // Para midia hospedada a Evolution primeiro baixa o arquivo assinado e so
    // depois o entrega ao WhatsApp. Video e documento podem legitimamente
    // ultrapassar o timeout de mensagem de texto.
    const timeout = input.mediaType === "video" || input.mediaType === "document" ? 120_000 : 45_000;
    const payload = await this.request(path, {
      method: "POST",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    return messagingResult(this.id, payload);
  }

  async getSession() {
    const payload = await this.request(`/instance/connectionState/${encodeURIComponent(instanceName(this.channel))}`);
    return { status: normalizeEvolutionSession(payload), payload };
  }

  async getQrCode() {
    const payload = await this.request(`/instance/connect/${encodeURIComponent(instanceName(this.channel))}`);
    const qr = readEvolutionQr(payload);
    const status = normalizeEvolutionSession(payload);
    return { status: status === "unknown" && qr ? "qr_required" : status, ...(qr ? { qr } : {}), payload };
  }

  async provision(input: { webhookUrl: string }) {
    let created: Record<string, unknown> = {};
    let instanceAlreadyExists = false;
    try {
      await this.request(`/instance/connectionState/${encodeURIComponent(instanceName(this.channel))}`);
      instanceAlreadyExists = true;
    } catch (error) {
      if (!(error instanceof EvolutionRequestError) || ![400, 404].includes(error.status)) throw error;
    }

    if (!instanceAlreadyExists) {
      try {
        created = await this.request("/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName: instanceName(this.channel),
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const mayBeDuplicate =
          /already|exist|registered|in use/i.test(message) ||
          (error instanceof EvolutionRequestError && error.status === 403);
        if (!mayBeDuplicate) throw error;

        // Evolution 2.3 pode responder apenas "Forbidden" ao recriar uma
        // instancia existente. Confirme a existencia antes de aceitar o 403.
        await this.request(`/instance/connectionState/${encodeURIComponent(instanceName(this.channel))}`);
      }
    }

    const webhook = {
      enabled: true,
      url: input.webhookUrl,
      webhookByEvents: false,
      webhookBase64: false,
      events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      headers: {
        Authorization: `Bearer ${this.channel.accessToken}`,
        "x-altum-whatsapp-channel-id": this.channel.id,
      },
    };
    const request = { method: "POST" as const, body: JSON.stringify({ webhook }) };
    try {
      await this.request(`/webhook/set/${encodeURIComponent(instanceName(this.channel))}`, request);
    } catch (error) {
      if (!(error instanceof EvolutionRequestError) || error.status !== 404) throw error;
      await this.request(`/event/webhook/set/${encodeURIComponent(instanceName(this.channel))}`, request);
    }
    return created;
  }
}

export async function downloadEvolutionInboundMedia(
  channel: WhatsAppChannelConfig,
  rawMessage: Record<string, unknown>
) {
  const response = await fetch(
    `${baseUrl(channel)}/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName(channel))}`,
    {
      method: "POST",
      headers: { apikey: channel.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ message: rawMessage, convertToMp4: false }),
      signal: AbortSignal.timeout(25_000),
    }
  );
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new EvolutionRequestError(response.status, payloadError(payload, response.status));
  const base64 = readMediaBase64(payload.base64);
  if (!base64) throw new Error("Evolution nao retornou o conteudo da midia.");
  return {
    base64,
    contentType: clean(payload.mimetype || payload.mimeType, 180) || "application/octet-stream",
    filename: clean(payload.fileName || payload.filename, 240),
  };
}

export async function fetchEvolutionProfilePicture(channel: WhatsAppChannelConfig, phone: string) {
  const normalizedPhone = clean(phone, 40).replace(/\D/g, "");
  if (!normalizedPhone) return null;

  const response = await fetch(
    `${baseUrl(channel)}/chat/fetchProfilePictureUrl/${encodeURIComponent(instanceName(channel))}`,
    {
      method: "POST",
      headers: { apikey: channel.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ number: normalizedPhone }),
      signal: AbortSignal.timeout(12_000),
    }
  );

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  const candidate = clean(
    payload.profilePictureUrl || payload.profilePicUrl || payload.pictureUrl || payload.url,
    1600
  );
  return /^https:\/\//i.test(candidate) ? candidate : null;
}

const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PROFILE_IMAGE_BYTES = 6 * 1024 * 1024;

function profilePhotoExtension(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/** Links returned by Evolution can expire; persist a vetted copy for Inbox/CRM. */
export async function cacheEvolutionProfilePicture(input: { tenantId: string; phone: string; sourceUrl: string }) {
  const sourceUrl = clean(input.sourceUrl, 1600);
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname === "localhost" || /^127\.|^0\.0\.0\.0$|^::1$/i.test(parsed.hostname)) return null;

  const response = await fetch(parsed, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return null;
  const contentType = clean(response.headers.get("content-type"), 120).toLowerCase().split(";")[0].trim();
  const length = Number(response.headers.get("content-length") || 0);
  if (!PROFILE_IMAGE_TYPES.has(contentType) || (Number.isFinite(length) && length > MAX_PROFILE_IMAGE_BYTES)) return null;
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > MAX_PROFILE_IMAGE_BYTES) return null;

  const phone = clean(input.phone, 40).replace(/\D/g, "") || "contact";
  const token = randomUUID();
  const path = `contact-photos/${clean(input.tenantId, 180)}/${phone}-${randomUUID()}.${profilePhotoExtension(contentType)}`;
  const stored = await saveFirebaseStorageFileWithFallback({
    path,
    data,
    options: {
      metadata: {
        contentType,
        cacheControl: "public,max-age=31536000,immutable",
        metadata: { firebaseStorageDownloadTokens: token, purpose: "whatsapp_profile" },
      },
      resumable: false,
    },
  });
  const bucketName = stored.bucketName || firebaseStorageBucketCandidates()[0];
  return bucketName
    ? `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`
    : null;
}
