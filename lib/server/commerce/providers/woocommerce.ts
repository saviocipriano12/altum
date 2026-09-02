import { assertSafeCommerceUrl, cleanCommerceText, commerceFetchJson } from "@/lib/server/commerce/http";
import type { CommerceProvider, CommerceSyncEvent } from "@/lib/server/commerce/types";

function authHeader(key: string, secret: string) {
  if (!key || !secret) throw new Error("commerce_credentials_missing");
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

async function wooUrl(storeUrl: string, resource: string, limit: number) {
  const base = await assertSafeCommerceUrl(storeUrl);
  const url = new URL(`/wp-json/wc/v3/${resource}`, base);
  url.searchParams.set("per_page", String(Math.max(1, Math.min(limit, 50))));
  url.searchParams.set("orderby", "modified");
  url.searchParams.set("order", "desc");
  return url;
}

export const woocommerceProvider: CommerceProvider = {
  id: "woocommerce",
  label: "WooCommerce",
  capabilities: ["products", "orders", "tracking"],
  credentialFields: ["consumerKey", "consumerSecret"],
  async testConnection({ connection, credentials }) {
    const url = await wooUrl(connection.storeUrl, "products", 1);
    const { headers } = await commerceFetchJson<unknown[]>(url, { headers: { Authorization: authHeader(credentials.consumerKey || "", credentials.consumerSecret || "") } });
    return { ok: true, accountLabel: connection.displayName, detail: `REST API conectada${headers.get("x-wp-total") ? ` · ${headers.get("x-wp-total")} produtos` : ""}.` };
  },
  async sync({ connection, credentials, limit }) {
    const authorization = authHeader(credentials.consumerKey || "", credentials.consumerSecret || "");
    const [productsResult, ordersResult] = await Promise.all([
      commerceFetchJson<unknown[]>(await wooUrl(connection.storeUrl, "products", limit), { headers: { Authorization: authorization } }),
      commerceFetchJson<unknown[]>(await wooUrl(connection.storeUrl, "orders", Math.min(limit, 30)), { headers: { Authorization: authorization } }),
    ]);
    const products = Array.isArray(productsResult.data) ? productsResult.data : [];
    const orders = Array.isArray(ordersResult.data) ? ordersResult.data : [];
    const events: CommerceSyncEvent[] = [
      ...products.map((payload) => ({ topic: "product.updated", externalEventId: `sync:product:${cleanCommerceText((payload as Record<string, unknown>).id, 180)}`, payload })),
      ...orders.map((payload) => ({ topic: "order.updated", externalEventId: `sync:order:${cleanCommerceText((payload as Record<string, unknown>).id, 180)}`, payload })),
    ];
    return { events, products: products.length, orders: orders.length, carts: 0 };
  },
};
