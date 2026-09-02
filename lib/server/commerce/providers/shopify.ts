import { assertSafeCommerceUrl, cleanCommerceText, commerceFetchJson } from "@/lib/server/commerce/http";
import type { CommerceProvider, CommerceSyncEvent } from "@/lib/server/commerce/types";

type GraphqlResponse = { data?: Record<string, unknown>; errors?: Array<{ message?: string }> };

function shopDomain(storeUrl: string, storeId: string) {
  const raw = cleanCommerceText(storeId, 180) || cleanCommerceText(storeUrl, 400);
  if (!raw) throw new Error("commerce_shopify_domain_required");
  if (!raw.includes(".") && !raw.includes("/")) return `${raw}.myshopify.com`;
  return raw;
}

async function shopifyRequest(connection: Parameters<CommerceProvider["sync"]>[0]["connection"], accessToken: string, query: string) {
  if (!accessToken) throw new Error("commerce_credentials_missing");
  const base = await assertSafeCommerceUrl(shopDomain(connection.storeUrl, connection.storeId), "myshopify.com");
  const version = cleanCommerceText(process.env.SHOPIFY_ADMIN_API_VERSION, 20) || "2026-07";
  const url = new URL(`/admin/api/${version}/graphql.json`, base);
  const { data } = await commerceFetchJson<GraphqlResponse>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": accessToken },
    body: JSON.stringify({ query }),
  });
  if (data.errors?.length) throw new Error(`commerce_provider_request_failed:${data.errors[0]?.message || "GraphQL error"}`);
  return data.data || {};
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nodes(value: unknown) {
  if (Array.isArray(value)) return value.map(record);
  const source = record(value);
  return Array.isArray(source.nodes) ? source.nodes.map(record) : [];
}

function productPayload(product: Record<string, unknown>) {
  const variants = nodes(product.variants);
  const image = record(record(record(product.featuredMedia).preview).image);
  return {
    id: product.id,
    title: product.title,
    body_html: product.descriptionHtml,
    product_type: product.productType,
    tags: product.tags,
    status: cleanCommerceText(product.status, 60).toLowerCase(),
    image: image.url || "",
    variants: variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      price: variant.price,
      inventory_quantity: variant.inventoryQuantity,
    })),
  };
}

function orderPayload(order: Record<string, unknown>) {
  const customer = record(order.customer);
  const shipping = record(order.shippingAddress);
  const money = record(record(order.totalPriceSet).shopMoney);
  const fulfillment = nodes(order.fulfillments)[0] || {};
  const tracking = nodes(fulfillment.trackingInfo)[0] || {};
  const items = nodes(order.lineItems).map((item) => ({
    id: record(item.product).id,
    product_id: record(item.product).id,
    name: item.name,
    quantity: item.quantity,
    sku: item.sku,
    price: record(record(item.originalUnitPriceSet).shopMoney).amount,
  }));
  return {
    id: order.id,
    name: order.name,
    created_at: order.createdAt,
    financial_status: order.displayFinancialStatus,
    fulfillment_status: order.displayFulfillmentStatus,
    total_price: money.amount,
    currency: money.currencyCode,
    customer: { name: customer.displayName, email: customer.email, phone: customer.phone || shipping.phone },
    line_items: items,
    tracking_number: tracking.number,
    tracking_url: tracking.url,
  };
}

export const shopifyProvider: CommerceProvider = {
  id: "shopify",
  label: "Shopify",
  capabilities: ["products", "orders", "tracking"],
  credentialFields: ["accessToken"],
  async testConnection({ connection, credentials }) {
    const data = await shopifyRequest(connection, credentials.accessToken || "", "query AltumShop { shop { name } }");
    return { ok: true, accountLabel: cleanCommerceText(record(data.shop).name, 180), detail: "Admin GraphQL API conectada." };
  },
  async sync({ connection, credentials, limit }) {
    const pageSize = Math.max(1, Math.min(limit, 50));
    const data = await shopifyRequest(connection, credentials.accessToken || "", `query AltumCommerceSync {
      products(first: ${pageSize}, sortKey: UPDATED_AT, reverse: true) {
        nodes { id title descriptionHtml productType tags status featuredMedia { preview { image { url } } } variants(first: 50) { nodes { id sku price inventoryQuantity } } }
      }
      orders(first: ${Math.min(pageSize, 30)}, sortKey: UPDATED_AT, reverse: true) {
        nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } customer { displayName email phone } shippingAddress { phone } fulfillments(first: 10) { trackingInfo(first: 10) { number url } } lineItems(first: 50) { nodes { name quantity sku product { id } originalUnitPriceSet { shopMoney { amount } } } } }
      }
    }`);
    const products = nodes(data.products);
    const orders = nodes(data.orders);
    const events: CommerceSyncEvent[] = [
      ...products.map((product) => ({ topic: "products/update", externalEventId: `sync:product:${cleanCommerceText(product.id, 180)}`, payload: productPayload(product) })),
      ...orders.map((order) => ({ topic: "orders/update", externalEventId: `sync:order:${cleanCommerceText(order.id, 180)}`, payload: orderPayload(order) })),
    ];
    return { events, products: products.length, orders: orders.length, carts: 0 };
  },
};
