import { decryptSecret, encryptSecret, hasStoredSecret } from "@/app/lib/server/secret-crypto";
import { COMMERCE_PROVIDER_IDS, type CommerceConnectionConfig, type CommerceCredentials, type CommerceProvider, type CommerceProviderId } from "@/lib/server/commerce/types";
import { nuvemshopProvider } from "@/lib/server/commerce/providers/nuvemshop";
import { shopifyProvider } from "@/lib/server/commerce/providers/shopify";
import { woocommerceProvider } from "@/lib/server/commerce/providers/woocommerce";

const PROVIDER_LABELS: Record<CommerceProviderId, string> = {
  shopify: "Shopify",
  nuvemshop: "Nuvemshop",
  woocommerce: "WooCommerce",
  vtex: "VTEX",
  tray: "Tray",
  loja_integrada: "Loja Integrada",
};

function webhookOnlyProvider(id: CommerceProviderId): CommerceProvider {
  return {
    id,
    label: PROVIDER_LABELS[id],
    capabilities: ["products", "orders", "carts", "tracking"],
    credentialFields: [],
    async testConnection() {
      return { ok: true, detail: "Conector disponível por webhook." };
    },
    async sync() {
      throw new Error("commerce_api_sync_not_supported");
    },
  };
}

const PROVIDERS = new Map<CommerceProviderId, CommerceProvider>([
  ["shopify", shopifyProvider],
  ["nuvemshop", nuvemshopProvider],
  ["woocommerce", woocommerceProvider],
  ["vtex", webhookOnlyProvider("vtex")],
  ["tray", webhookOnlyProvider("tray")],
  ["loja_integrada", webhookOnlyProvider("loja_integrada")],
]);

function clean(value: unknown, max = 12000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function isCommerceProviderId(value: unknown): value is CommerceProviderId {
  return typeof value === "string" && (COMMERCE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function getCommerceProvider(value: unknown) {
  if (!isCommerceProviderId(value)) throw new Error("ecommerce_provider_invalid");
  return PROVIDERS.get(value) as CommerceProvider;
}

export function commerceProviderMeta(value: unknown) {
  const provider = getCommerceProvider(value);
  return {
    id: provider.id,
    label: provider.label,
    capabilities: [...provider.capabilities],
    connectionMode: provider.credentialFields.length ? "api_and_webhook" as const : "webhook" as const,
    credentialFields: [...provider.credentialFields],
  };
}

export function normalizeCommerceCredentials(value: unknown): CommerceCredentials {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    accessToken: clean(data.accessToken),
    consumerKey: clean(data.consumerKey),
    consumerSecret: clean(data.consumerSecret),
  };
}

export function validateCommerceCredentials(provider: CommerceProvider, credentials: CommerceCredentials) {
  const missing = provider.credentialFields.filter((field) => !clean(credentials[field]));
  if (missing.length) throw new Error(`commerce_credentials_missing:${missing.join(",")}`);
}

export function storeCommerceCredentials(credentials: CommerceCredentials) {
  const normalized = normalizeCommerceCredentials(credentials);
  return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value).map(([key, value]) => [key, encryptSecret(value)]));
}

export function readCommerceCredentials(value: unknown): CommerceCredentials {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    accessToken: decryptSecret(data.accessToken),
    consumerKey: decryptSecret(data.consumerKey),
    consumerSecret: decryptSecret(data.consumerSecret),
  };
}

export function hasCommerceCredentials(value: unknown) {
  const data = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.values(data).some(hasStoredSecret);
}

export function connectionConfigFromDoc(id: string, value: Record<string, unknown>): CommerceConnectionConfig {
  const provider = getCommerceProvider(value.provider);
  return {
    id,
    tenantId: clean(value.tenantId, 180),
    provider: provider.id,
    displayName: clean(value.displayName, 160) || provider.label,
    storeUrl: clean(value.storeUrl, 400),
    storeId: clean(value.storeId, 180),
  };
}
