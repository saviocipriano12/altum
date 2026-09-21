import { createHash } from "node:crypto";
export type PixelAsset = { externalId: string; name: string; provider: "meta" | "google"; providerStatus: string; assetType: string };
export function pixelDocumentId(tenantId: string, provider: string, externalId: string) { return createHash("sha256").update(JSON.stringify([tenantId, provider, externalId])).digest("hex"); }
export async function discoverMetaPixels(accountId: string, accessToken: string): Promise<PixelAsset[]> {
  const { MetaAdsProvider, MetaGraphClient } = await import("@adport/provider-meta");
  const provider = new MetaAdsProvider(new MetaGraphClient({ accessToken }));
  const rows = await provider.apiRead({ account_id: accountId, edge: "adspixels", fields: ["id", "name"], limit: 200, paged: true });
  return (Array.isArray(rows) ? rows : []).map(row => ({ externalId: String(row.id || ""), name: String(row.name || row.id || "").slice(0, 160), provider: "meta" as const, providerStatus: "accessible", assetType: "pixel" })).filter(row => row.externalId);
}
export async function discoverGoogleConversions(accountId: string, credentials: { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; loginCustomerId?: string }): Promise<PixelAsset[]> {
  const { GoogleAdsProvider, GoogleAdsRestClient } = await import("@adport/provider-google");
  const googleFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.get("developer-token")) headers.delete("developer-token");
    return fetch(input, { ...init, headers });
  };
  const provider = new GoogleAdsProvider(new GoogleAdsRestClient(credentials, undefined, googleFetch));
  const rows = await provider.gaqlSearch({ customer_id: accountId, resource: "conversion_action", fields: ["conversion_action.id", "conversion_action.name", "conversion_action.status", "conversion_action.type"], conditions: ["conversion_action.status != 'REMOVED'"], limit: 200 });
  return rows.map(row => { const asset = row.conversionAction as Record<string, unknown> | undefined; return { externalId: String(asset?.id || ""), name: String(asset?.name || asset?.id || "").slice(0, 160), provider: "google" as const, providerStatus: String(asset?.status || "unknown"), assetType: String(asset?.type || "conversion_action") }; }).filter(row => row.externalId);
}
