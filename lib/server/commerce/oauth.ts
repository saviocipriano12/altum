import crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { buildConnectionPayload, buildEcommerceWebhookSecret } from "@/lib/server/ecommerce";
import { connectionConfigFromDoc, getCommerceProvider, storeCommerceCredentials } from "@/lib/server/commerce/registry";
import type { CommerceProviderId } from "@/lib/server/commerce/types";

export type CommerceOAuthProvider = Extract<CommerceProviderId, "shopify" | "nuvemshop">;

type StoredCommerceOAuthState = {
  provider: CommerceOAuthProvider;
  tenantId: string;
  userId: string;
  userName: string;
  redirectPath: string;
  shopDomain: string;
  nonceHash: string;
  createdAt: unknown;
  expiresAt: Date;
  consumedAt?: unknown;
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanRedirectPath(value: unknown) {
  const path = clean(value, 300);
  return path.startsWith("/cliente/painel/") ? path : "/cliente/painel/configuracoes/integracoes";
}

function token(bytes: number) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function toDate(value: unknown) {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeShopifyDomain(value: unknown) {
  let domain = clean(value, 220).toLowerCase();
  try {
    if (domain.includes("/")) domain = new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname;
  } catch {
    return "";
  }
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : "";
}

export function getCommerceOAuthEnv() {
  return {
    shopify: {
      clientId: clean(process.env.SHOPIFY_CLIENT_ID, 300),
      clientSecret: clean(process.env.SHOPIFY_CLIENT_SECRET, 500),
      scopes: clean(process.env.SHOPIFY_OAUTH_SCOPES, 500) || "read_products,read_orders,read_fulfillments,read_customers",
    },
    nuvemshop: {
      clientId: clean(process.env.NUVEMSHOP_CLIENT_ID, 300),
      clientSecret: clean(process.env.NUVEMSHOP_CLIENT_SECRET, 500),
    },
  };
}

export function commerceOAuthAvailability() {
  const env = getCommerceOAuthEnv();
  return {
    shopify: Boolean(env.shopify.clientId && env.shopify.clientSecret),
    nuvemshop: Boolean(env.nuvemshop.clientId && env.nuvemshop.clientSecret),
  };
}

export async function createCommerceOAuthState(input: {
  provider: CommerceOAuthProvider;
  tenantId: string;
  userId: string;
  userName?: string;
  redirectPath?: string;
  shopDomain?: string;
}) {
  const id = token(12);
  const nonce = token(24);
  const state = `${id}.${nonce}`;
  const payload: StoredCommerceOAuthState = {
    provider: input.provider,
    tenantId: clean(input.tenantId, 180),
    userId: clean(input.userId, 180),
    userName: clean(input.userName, 120),
    redirectPath: cleanRedirectPath(input.redirectPath),
    shopDomain: clean(input.shopDomain, 220),
    nonceHash: hash(nonce),
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 15 * 60_000),
  };
  await adminDb.collection("commerce_oauth_states").doc(id).set(payload);
  return state;
}

export async function consumeCommerceOAuthState(value: unknown, provider: CommerceOAuthProvider) {
  const [idRaw, nonceRaw] = clean(value, 500).split(".");
  const id = clean(idRaw, 120);
  const nonce = clean(nonceRaw, 240);
  if (!id || !nonce) throw new Error("commerce_oauth_state_invalid");
  const ref = adminDb.collection("commerce_oauth_states").doc(id);

  return adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new Error("commerce_oauth_state_not_found");
    const data = snap.data() as StoredCommerceOAuthState;
    if (data.provider !== provider) throw new Error("commerce_oauth_state_provider_mismatch");
    if (data.consumedAt) throw new Error("commerce_oauth_state_already_used");
    const expiresAt = toDate(data.expiresAt);
    if (!expiresAt || expiresAt.getTime() < Date.now()) throw new Error("commerce_oauth_state_expired");
    const expected = Buffer.from(hash(nonce));
    const actual = Buffer.from(clean(data.nonceHash, 128));
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
      throw new Error("commerce_oauth_state_nonce_invalid");
    }
    transaction.set(ref, { consumedAt: FieldValue.serverTimestamp() }, { merge: true });
    return {
      tenantId: clean(data.tenantId, 180),
      userId: clean(data.userId, 180),
      userName: clean(data.userName, 120),
      redirectPath: cleanRedirectPath(data.redirectPath),
      shopDomain: clean(data.shopDomain, 220),
    };
  });
}

export function verifyShopifyOAuthHmac(url: URL, secret: string) {
  const provided = clean(url.searchParams.get("hmac"), 128).toLowerCase();
  if (!provided || !secret) return false;
  const message = Array.from(url.searchParams.entries())
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  return expectedBuffer.length === providedBuffer.length && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function saveManagedCommerceConnection(input: {
  provider: CommerceOAuthProvider;
  tenantId: string;
  userId: string;
  userName?: string;
  storeId: string;
  storeUrl?: string;
  accessToken: string;
  scope?: string;
}) {
  const existing = await adminDb.collection("ecommerce_connections").where("tenantId", "==", input.tenantId).limit(40).get();
  const match = existing.docs.find((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return clean(data.provider, 80) === input.provider && clean(data.storeId, 220).toLowerCase() === clean(input.storeId, 220).toLowerCase();
  });
  const ref = match?.ref || adminDb.collection("ecommerce_connections").doc();
  const webhookSecret = buildEcommerceWebhookSecret();
  const basePayload = buildConnectionPayload({
    tenantId: input.tenantId,
    provider: input.provider,
    displayName: input.provider === "shopify" ? input.storeId.replace(/\.myshopify\.com$/i, "") : "Nuvemshop",
    storeId: input.storeId,
    storeUrl: input.storeUrl || (input.provider === "shopify" ? `https://${input.storeId}` : ""),
    status: "active",
    syncMode: "api",
    userId: input.userId,
    userName: input.userName,
    ...(match ? {} : { webhookSecret }),
  });
  const provider = getCommerceProvider(input.provider);
  const credentials = { accessToken: input.accessToken };
  const test = await provider.testConnection({
    connection: connectionConfigFromDoc(ref.id, { ...basePayload, provider: input.provider, tenantId: input.tenantId }),
    credentials,
  });
  const now = FieldValue.serverTimestamp();
  await Promise.all([
    ref.set(
      {
        ...basePayload,
        displayName: test.accountLabel || basePayload.displayName,
        apiCredentials: storeCommerceCredentials(credentials),
        syncMode: "api",
        connectionStatus: "connected",
        oauthManaged: true,
        oauthScope: clean(input.scope, 1000),
        lastConnectionTestAt: now,
        lastError: "",
        ...(match ? {} : { createdAt: now }),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: match ? "tenant_ecommerce_oauth_reconnected" : "tenant_ecommerce_oauth_connected",
      tenantId: input.tenantId,
      connectionId: ref.id,
      provider: input.provider,
      actorId: input.userId,
      actorName: input.userName || "Usuario",
      createdAt: now,
    }),
  ]);
  return { connectionId: ref.id, created: !match, accountLabel: test.accountLabel || "" };
}
