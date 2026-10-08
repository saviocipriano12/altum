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
  const journey = record(order.customerJourneySummary);
  const lastVisit = record(journey.lastVisit);
  const firstVisit = record(journey.firstVisit);
  const visit = Object.keys(lastVisit).length ? lastVisit : firstVisit;
  const utm = record(visit.utmParameters);
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
    customer: { id: customer.id, name: customer.displayName, email: customer.email, phone: customer.phone || shipping.phone },
    line_items: items,
    tracking_number: tracking.number,
    tracking_url: tracking.url,
    attribution: {
      source: utm.source || visit.source || "",
      medium: utm.medium || "",
      campaign: utm.campaign || "",
      content: utm.content || "",
      term: utm.term || "",
      landing_page: visit.landingPage || "",
      referrer: visit.referrerUrl || "",
    },
  };
}

function abandonedCheckoutPayload(checkout: Record<string, unknown>) {
  const customer = record(checkout.customer);
  return {
    id: checkout.id,
    completed_at: checkout.completedAt,
    created_at: checkout.createdAt,
    updated_at: checkout.updatedAt,
    abandoned_checkout_url: checkout.abandonedCheckoutUrl,
    customer: {
      id: customer.id,
      first_name: customer.firstName,
      last_name: customer.lastName,
      email: customer.email,
    },
  };
}

export const shopifyProvider: CommerceProvider = {
  id: "shopify",
  label: "Shopify",
  capabilities: ["products", "orders", "carts", "tracking"],
  capabilityMatrix: {
    catalog_products: "available",
    product_variants: "partial",
    inventory_aggregate: "partial",
    inventory_by_location: "planned",
    customers: "partial",
    orders: "partial",
    payments: "partial",
    fulfillments: "partial",
    tracking: "available",
    // A refund is emitted by REFUNDS_CREATE and is normalized into the order
    // lifecycle. Returns remain separate because Shopify return workflows are
    // merchant- and app-specific.
    refunds: "partial",
    returns: "planned",
    abandoned_checkouts: "available",
    webhooks: "available",
    api_sync: "available",
  },
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
        nodes { id name createdAt displayFinancialStatus displayFulfillmentStatus totalPriceSet { shopMoney { amount currencyCode } } customer { id displayName email phone } shippingAddress { phone } customerJourneySummary { firstVisit { source landingPage referrerUrl utmParameters { source medium campaign content term } } lastVisit { source landingPage referrerUrl utmParameters { source medium campaign content term } } } fulfillments(first: 10) { trackingInfo(first: 10) { number url } } lineItems(first: 50) { nodes { name quantity sku product { id } originalUnitPriceSet { shopMoney { amount } } } } }
      }
    }`);
    const products = nodes(data.products);
    const orders = nodes(data.orders);
    let carts: Record<string, unknown>[] = [];
    const warnings: string[] = [];

    // Some older Shopify staff installations have read_orders but not the
    // abandoned-checkout permission. Keep catalog and order sync healthy and
    // make the limitation visible instead of failing the whole operation.
    try {
      const checkoutData = await shopifyRequest(connection, credentials.accessToken || "", `query AltumAbandonedCheckouts {
      abandonedCheckouts(first: ${Math.min(pageSize, 30)}, query: "status:open", reverse: true) {
        nodes { id abandonedCheckoutUrl completedAt createdAt updatedAt customer { id firstName lastName email } }
      }
    }`);
      carts = nodes(checkoutData.abandonedCheckouts);
    } catch (error) {
      console.warn("Shopify abandoned-checkout sync unavailable:", error);
      warnings.push("shopify_abandoned_checkouts_unavailable");
    }
    const events: CommerceSyncEvent[] = [
      ...products.map((product) => ({ topic: "products/update", externalEventId: `sync:product:${cleanCommerceText(product.id, 180)}`, payload: productPayload(product) })),
      ...orders.map((order) => ({ topic: "orders/update", externalEventId: `sync:order:${cleanCommerceText(order.id, 180)}`, payload: orderPayload(order) })),
      ...carts.map((cart) => ({ topic: "checkouts/abandoned", externalEventId: `sync:checkout:${cleanCommerceText(cart.id, 180)}`, payload: abandonedCheckoutPayload(cart) })),
    ];
    return { events, products: products.length, orders: orders.length, carts: carts.length, warnings };
  },
};
