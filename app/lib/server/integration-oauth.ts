import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export type IntegrationProvider = "meta" | "google";
export type IntegrationChannelType = "instagram" | "messenger" | "meta_ads" | "google_ads";
export type MetaOAuthChannelType = Exclude<IntegrationChannelType, "google_ads">;

type StoredOAuthState = {
  provider: IntegrationProvider;
  tenantId: string;
  userId: string;
  channelType: IntegrationChannelType;
  redirectPath: string;
  nonceHash: string;
  createdAt: unknown;
  expiresAt: Date;
  consumedAt?: unknown;
};

export const CONNECTION_STATUSES = [
  "draft",
  "auth_pending",
  "connected",
  "webhook_pending",
  "syncing",
  "ready",
  "degraded",
  "reauth_required",
  "revoked",
  "error",
] as const;

export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanPath(value: unknown) {
  const normalized = clean(value, 300);
  if (!normalized.startsWith("/")) return "/cliente/painel/configuracoes/canais";
  return normalized;
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

export function normalizeConnectionStatus(value: unknown, fallback: ConnectionStatus = "draft"): ConnectionStatus {
  const normalized = clean(value, 40).toLowerCase();
  return (CONNECTION_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as ConnectionStatus)
    : fallback;
}

export function getAppBaseUrl(req?: Request) {
  const fromEnv =
    clean(process.env.APP_URL, 300) ||
    clean(process.env.NEXT_PUBLIC_APP_URL, 300) ||
    clean(process.env.NEXT_PUBLIC_SITE_URL, 300);
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (req) {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  }
  return "";
}

export function buildClientRedirect(path: string, query: Record<string, string>, baseUrl?: string) {
  const params = new URLSearchParams(query);
  const qs = params.toString();
  const relativeUrl = `${path}${qs ? `?${qs}` : ""}`;
  return baseUrl ? new URL(relativeUrl, baseUrl).toString() : relativeUrl;
}

export function getMetaEnv() {
  return {
    appId: clean(process.env.META_APP_ID, 200),
    appSecret: clean(process.env.META_APP_SECRET, 300),
    verifyToken: clean(process.env.META_VERIFY_TOKEN, 300),
    graphVersion: clean(process.env.META_GRAPH_VERSION, 20) || "v21.0",
  };
}

export function getGoogleAdsEnv() {
  return {
    clientId: clean(process.env.GOOGLE_ADS_CLIENT_ID, 300),
    clientSecret: clean(process.env.GOOGLE_ADS_CLIENT_SECRET, 300),
    developerToken: clean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 300),
    apiVersion: clean(process.env.GOOGLE_ADS_API_VERSION, 20) || "v22",
  };
}

const DEFAULT_META_OAUTH_SCOPES: Record<MetaOAuthChannelType, string[]> = {
  instagram: [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_messaging",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_messages",
  ],
  messenger: [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_messaging",
  ],
  meta_ads: [
    "ads_read",
    "business_management",
    "leads_retrieval",
  ],
};

function normalizeScope(scope: unknown) {
  return clean(scope, 120).toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function dedupeScopes(scopes: string[]) {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const scope of scopes) {
    const normalized = normalizeScope(scope);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }
  return ordered;
}

function parseScopeList(value: unknown) {
  return dedupeScopes(
    String(value || "")
      .split(/[,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

export function getMetaOAuthScopes(channelType: MetaOAuthChannelType) {
  const includeInstagramCommentScope =
    clean(process.env.META_INCLUDE_INSTAGRAM_COMMENT_SCOPE, 10) === "1" ||
    clean(process.env.META_INCLUDE_INSTAGRAM_COMMENT_SCOPE, 10).toLowerCase() === "true";

  const envOverrides: Record<MetaOAuthChannelType, string[]> = {
    instagram: parseScopeList(process.env.META_OAUTH_SCOPES_INSTAGRAM),
    messenger: parseScopeList(process.env.META_OAUTH_SCOPES_MESSENGER),
    meta_ads: parseScopeList(process.env.META_OAUTH_SCOPES_META_ADS),
  };

  const defaultScopes = [...DEFAULT_META_OAUTH_SCOPES[channelType]];
  if (channelType === "instagram" && includeInstagramCommentScope) {
    defaultScopes.push("instagram_manage_comments");
  }

  return envOverrides[channelType].length > 0
    ? envOverrides[channelType]
    : dedupeScopes(defaultScopes);
}

export function isMetaPlatformConfigured() {
  const env = getMetaEnv();
  return Boolean(env.appId && env.appSecret && env.verifyToken);
}

export function isGooglePlatformConfigured() {
  const env = getGoogleAdsEnv();
  return Boolean(env.clientId && env.clientSecret && env.developerToken);
}

export async function createIntegrationOAuthState(input: {
  provider: IntegrationProvider;
  tenantId: string;
  userId: string;
  channelType: IntegrationChannelType;
  redirectPath?: string;
  ttlMinutes?: number;
}) {
  const stateId = randomToken(12);
  const nonce = randomToken(18);
  const state = `${stateId}.${nonce}`;
  const ttlMinutes = Math.min(30, Math.max(5, Number(input.ttlMinutes || 15)));
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  const payload: StoredOAuthState = {
    provider: input.provider,
    tenantId: clean(input.tenantId, 180),
    userId: clean(input.userId, 180),
    channelType: input.channelType,
    redirectPath: cleanPath(input.redirectPath),
    nonceHash: sha256(nonce),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  };

  await adminDb.collection("integration_oauth_states").doc(stateId).set(payload);
  return { state, stateId, expiresAt };
}

export async function consumeIntegrationOAuthState(state: string, provider: IntegrationProvider) {
  const [stateIdRaw, nonceRaw] = String(state || "").split(".");
  const stateId = clean(stateIdRaw, 120);
  const nonce = clean(nonceRaw, 240);
  if (!stateId || !nonce) {
    throw new Error("oauth_state_invalid");
  }

  const ref = adminDb.collection("integration_oauth_states").doc(stateId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new Error("oauth_state_not_found");
  }

  const data = snap.data() as StoredOAuthState;
  if (data.provider !== provider) {
    throw new Error("oauth_state_provider_mismatch");
  }
  if (data.consumedAt) {
    throw new Error("oauth_state_already_used");
  }

  const expiresAt = toDate(data.expiresAt);
  if (!expiresAt || expiresAt.getTime() < Date.now()) {
    throw new Error("oauth_state_expired");
  }

  if (sha256(nonce) !== clean(data.nonceHash, 128)) {
    throw new Error("oauth_state_nonce_invalid");
  }

  await ref.set({ consumedAt: FieldValue.serverTimestamp() }, { merge: true });
  return {
    tenantId: clean(data.tenantId, 180),
    userId: clean(data.userId, 180),
    channelType: data.channelType,
    redirectPath: cleanPath(data.redirectPath),
  };
}

export function cleanTokenScope(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .split(/[,\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 80)
    .join(" ");
}
