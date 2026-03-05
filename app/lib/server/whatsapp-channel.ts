import crypto from "crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";

export const AGENCY_TENANT_ID = "ALTUM_AGENCY";
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

type ChannelDoc = {
  tenantId?: string;
  type?: string;
  phoneNumberId?: string;
  accessToken?: string;
  verifyToken?: string;
  appSecret?: string;
  status?: string;
  displayName?: string;
  phoneNumber?: string;
};

export type WhatsAppChannelConfig = {
  id: string;
  tenantId: string;
  source: "tenant_channel" | "agency_env";
  displayName?: string;
  phoneNumber?: string;
  phoneNumberId: string;
  accessToken: string;
  verifyToken?: string;
  appSecret?: string;
};

function normalizeChannelDoc(id: string, data: ChannelDoc): WhatsAppChannelConfig | null {
  const tenantId = String(data.tenantId || "").trim();
  const type = String(data.type || "").trim().toLowerCase();
  const status = String(data.status || "active").trim().toLowerCase();
  const phoneNumberId = String(data.phoneNumberId || "").trim();
  const accessToken = String(data.accessToken || "").trim();

  if (!tenantId || type !== "whatsapp" || status !== "active") return null;
  if (!phoneNumberId || !accessToken) return null;

  return {
    id,
    tenantId,
    source: "tenant_channel",
    displayName: String(data.displayName || "WhatsApp"),
    phoneNumber: String(data.phoneNumber || ""),
    phoneNumberId,
    accessToken,
    verifyToken: String(data.verifyToken || "") || undefined,
    appSecret: String(data.appSecret || "") || undefined,
  };
}

function getAgencyChannelFromEnv() {
  const phoneNumberId = String(process.env.META_PHONE_ID || "").trim();
  const accessToken = String(process.env.META_WA_TOKEN || "").trim();

  if (!phoneNumberId || !accessToken) return null;

  return {
    id: "agency_env_default",
    tenantId: AGENCY_TENANT_ID,
    source: "agency_env",
    displayName: "ALTUM Agency WhatsApp",
    phoneNumberId,
    accessToken,
    verifyToken: String(process.env.META_VERIFY_TOKEN || "").trim() || undefined,
    appSecret: String(process.env.META_APP_SECRET || "").trim() || undefined,
  } satisfies WhatsAppChannelConfig;
}

export async function getWhatsAppChannelByPhoneNumberId(phoneNumberId: string) {
  const normalized = phoneNumberId.trim();
  if (!normalized) return null;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("phoneNumberId", "==", normalized)
    .limit(5)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;

  const agency = getAgencyChannelFromEnv();
  if (agency && agency.phoneNumberId === normalized) return agency;

  return null;
}

export async function getWhatsAppChannelForTenant(
  tenantId: string,
  options?: { allowAgencyFallback?: boolean }
) {
  const normalizedTenantId = tenantId.trim();
  const allowAgencyFallback = options?.allowAgencyFallback === true;

  if (!normalizedTenantId) {
    return allowAgencyFallback ? getAgencyChannelFromEnv() : null;
  }

  if (normalizedTenantId === AGENCY_TENANT_ID) {
    return getAgencyChannelFromEnv();
  }

  const settingsSnap = await adminDb.collection("tenant_settings").doc(normalizedTenantId).get();
  const defaultChannelId = settingsSnap.exists
    ? String((settingsSnap.data() as { defaultWhatsAppChannelId?: string }).defaultWhatsAppChannelId || "").trim()
    : "";

  if (defaultChannelId) {
    const defaultChannelSnap = await adminDb.collection("tenant_channels").doc(defaultChannelId).get();
    if (defaultChannelSnap.exists) {
      const parsed = normalizeChannelDoc(
        defaultChannelSnap.id,
        defaultChannelSnap.data() as ChannelDoc
      );
      if (parsed && parsed.tenantId === normalizedTenantId) {
        return parsed;
      }
    }
  }

  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", normalizedTenantId)
    .limit(20)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;
  if (allowAgencyFallback) return getAgencyChannelFromEnv();
  return null;
}

export async function getWhatsAppChannelByVerifyToken(verifyToken: string) {
  const normalized = verifyToken.trim();
  if (!normalized) return null;

  const snap = await adminDb
    .collection("tenant_channels")
    .where("verifyToken", "==", normalized)
    .limit(5)
    .get();

  const firstActive = snap.docs
    .map((doc) => normalizeChannelDoc(doc.id, doc.data() as ChannelDoc))
    .find((item) => Boolean(item));

  if (firstActive) return firstActive;

  const agency = getAgencyChannelFromEnv();
  if (agency?.verifyToken === normalized) return agency;

  return null;
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret?: string
) {
  const secret = String(appSecret || "").trim();
  if (!secret) return true;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const signature = signatureHeader.slice(7);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function sendMetaTextMessage(input: {
  channel: WhatsAppChannelConfig;
  to: string;
  text: string;
}) {
  const response = await fetch(
    `https://graph.facebook.com/${VERSION}/${input.channel.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.channel.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { body: input.text },
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errMessage = payload?.error?.message || "Erro na API da Meta.";
    throw new Error(errMessage);
  }

  return payload;
}

export function extractWebhookPhoneNumberId(body: Record<string, unknown>) {
  const entry = Array.isArray(body.entry) ? body.entry[0] : null;
  const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : null;
  const firstChange = Array.isArray(changes) ? changes[0] : null;
  const value = firstChange && typeof firstChange === "object" ? (firstChange as { value?: Record<string, unknown> }).value : null;

  const metaId = value && value.metadata && typeof value.metadata === "object"
    ? String((value.metadata as { phone_number_id?: unknown }).phone_number_id || "").trim()
    : "";

  if (metaId) return metaId;

  const statuses = value && Array.isArray(value.statuses) ? value.statuses : [];
  const firstStatus = statuses[0] && typeof statuses[0] === "object" ? (statuses[0] as Record<string, unknown>) : null;
  return String(firstStatus?.phone_number_id || "").trim() || null;
}
