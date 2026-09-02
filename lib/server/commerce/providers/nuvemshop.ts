import { cleanCommerceText, commerceFetchJson, localizedCommerceText } from "@/lib/server/commerce/http";
import type { CommerceProvider, CommerceSyncEvent } from "@/lib/server/commerce/types";

function headers(accessToken: string) {
  if (!accessToken) throw new Error("commerce_credentials_missing");
  return {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": cleanCommerceText(process.env.NUVEMSHOP_USER_AGENT, 200) || "Altum Commerce (suporte@altum.com.br)",
  };
}

function endpoint(storeId: string, resource: string, limit: number) {
  const normalizedStoreId = cleanCommerceText(storeId, 80).replace(/[^0-9]/g, "");
  if (!normalizedStoreId) throw new Error("commerce_nuvemshop_store_id_required");
  const url = new URL(`https://api.nuvemshop.com.br/v1/${normalizedStoreId}/${resource}`);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(Math.max(1, Math.min(limit, 50))));
  return url;
}

function resourceEndpoint(storeId: string, resource: string) {
  const url = endpoint(storeId, resource, 1);
  url.search = "";
  return url;
}

function productPayload(value: unknown) {
  const product = value as Record<string, unknown>;
  const variants = Array.isArray(product.variants) ? product.variants as Array<Record<string, unknown>> : [];
  const images = Array.isArray(product.images) ? product.images as Array<Record<string, unknown>> : [];
  return {
    ...product,
    name: localizedCommerceText(product.name),
    description: localizedCommerceText(product.description),
    image: images[0]?.src || "",
    variants: variants.map((variant) => ({ ...variant, price: variant.promotional_price || variant.price, inventory_quantity: variant.stock })),
  };
}

function orderPayload(value: unknown) {
  const order = value as Record<string, unknown>;
  const customer = order.customer && typeof order.customer === "object" ? order.customer as Record<string, unknown> : {};
  const products = Array.isArray(order.products) ? order.products : [];
  return {
    ...order,
    customer: { name: customer.name, email: order.contact_email || customer.email, phone: order.contact_phone || customer.phone },
    line_items: products,
    tracking_number: order.shipping_tracking_number || order.tracking_number,
    tracking_url: order.shipping_tracking_url || order.tracking_url,
    fulfillment_status: order.fulfillment,
    total_price: order.total,
  };
}

export async function fetchNuvemshopWebhookResource(input: {
  connection: Parameters<CommerceProvider["sync"]>[0]["connection"];
  credentials: Parameters<CommerceProvider["sync"]>[0]["credentials"];
  payload: unknown;
}) {
  const event = input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)
    ? input.payload as Record<string, unknown>
    : {};
  const topic = cleanCommerceText(event.event, 120).toLowerCase();
  const resourceId = cleanCommerceText(event.order_id || event.id, 120).replace(/[^0-9]/g, "");
  if (!resourceId) return input.payload;
  const requestHeaders = headers(input.credentials.accessToken || "");
  if (topic.startsWith("product/")) {
    const result = await commerceFetchJson<unknown>(resourceEndpoint(input.connection.storeId, `products/${resourceId}`), { headers: requestHeaders });
    return { ...productPayload(result.data || {}), event: topic };
  }
  if (topic.startsWith("order/") || topic.startsWith("fulfillment_order/")) {
    const result = await commerceFetchJson<unknown>(resourceEndpoint(input.connection.storeId, `orders/${resourceId}`), { headers: requestHeaders });
    return { ...orderPayload(result.data || {}), event: topic };
  }
  return input.payload;
}

export const nuvemshopProvider: CommerceProvider = {
  id: "nuvemshop",
  label: "Nuvemshop",
  capabilities: ["products", "orders", "tracking"],
  credentialFields: ["accessToken"],
  async testConnection({ connection, credentials }) {
    await commerceFetchJson<unknown[]>(endpoint(connection.storeId, "products", 1), { headers: headers(credentials.accessToken || "") });
    return { ok: true, accountLabel: connection.displayName, detail: "API Nuvemshop conectada." };
  },
  async sync({ connection, credentials, limit }) {
    const requestHeaders = headers(credentials.accessToken || "");
    const [productsResult, ordersResult] = await Promise.all([
      commerceFetchJson<unknown[]>(endpoint(connection.storeId, "products", limit), { headers: requestHeaders }),
      commerceFetchJson<unknown[]>(endpoint(connection.storeId, "orders", Math.min(limit, 30)), { headers: requestHeaders }),
    ]);
    const products = Array.isArray(productsResult.data) ? productsResult.data : [];
    const orders = Array.isArray(ordersResult.data) ? ordersResult.data : [];
    const events: CommerceSyncEvent[] = [
      ...products.map((product) => ({ topic: "product/updated", externalEventId: `sync:product:${cleanCommerceText((product as Record<string, unknown>).id, 180)}`, payload: productPayload(product) })),
      ...orders.map((order) => ({ topic: "order/updated", externalEventId: `sync:order:${cleanCommerceText((order as Record<string, unknown>).id, 180)}`, payload: orderPayload(order) })),
    ];
    return { events, products: products.length, orders: orders.length, carts: 0 };
  },
};
