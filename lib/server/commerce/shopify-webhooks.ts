import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

const SHOPIFY_COMMERCE_TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "FULFILLMENTS_CREATE",
  "FULFILLMENTS_UPDATE",
] as const;

type ShopifyTopic = (typeof SHOPIFY_COMMERCE_TOPICS)[number];
type GraphqlPayload = {
  data?: Record<string, unknown>;
  errors?: Array<{ message?: string }>;
};

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function graphql(input: {
  shopDomain: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}) {
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(input.shopDomain)) throw new Error("shopify_webhook_domain_invalid");
  const apiVersion = clean(process.env.SHOPIFY_ADMIN_API_VERSION, 20) || "2026-07";
  const response = await fetch(`https://${input.shopDomain}/admin/api/${apiVersion}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": input.accessToken,
    },
    body: JSON.stringify({ query: input.query, variables: input.variables || {} }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as GraphqlPayload;
  if (!response.ok) throw new Error(`shopify_webhook_http_${response.status}`);
  if (payload.errors?.length) throw new Error(`shopify_webhook_graphql:${clean(payload.errors[0]?.message, 300)}`);
  return payload.data || {};
}

export async function ensureShopifyWebhookSubscriptions(input: {
  tenantId: string;
  connectionId: string;
  shopDomain: string;
  accessToken: string;
  appBaseUrl: string;
}) {
  const callback = new URL(`/api/webhooks/ecommerce/shopify`, input.appBaseUrl);
  callback.searchParams.set("tenantId", input.tenantId);
  callback.searchParams.set("connectionId", input.connectionId);
  const uri = callback.toString();

  const listed = await graphql({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    query: `query AltumWebhookSubscriptions($topics: [WebhookSubscriptionTopic!]) {
      webhookSubscriptions(first: 100, topics: $topics) { nodes { id topic uri } }
    }`,
    variables: { topics: SHOPIFY_COMMERCE_TOPICS },
  });
  const nodes = Array.isArray(record(listed.webhookSubscriptions).nodes)
    ? record(listed.webhookSubscriptions).nodes as Array<Record<string, unknown>>
    : [];
  const existing = new Set(
    nodes
      .filter((node) => clean(node.uri, 2000) === uri)
      .map((node) => clean(node.topic, 100))
      .filter(Boolean)
  );

  const created: ShopifyTopic[] = [];
  const alreadyPresent: ShopifyTopic[] = [];
  const failed: Array<{ topic: ShopifyTopic; error: string }> = [];
  for (const topic of SHOPIFY_COMMERCE_TOPICS) {
    if (existing.has(topic)) {
      alreadyPresent.push(topic);
      continue;
    }
    try {
      const data = await graphql({
        shopDomain: input.shopDomain,
        accessToken: input.accessToken,
        query: `mutation AltumWebhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
            webhookSubscription { id topic uri }
            userErrors { field message }
          }
        }`,
        variables: { topic, subscription: { uri } },
      });
      const mutation = record(data.webhookSubscriptionCreate);
      const userErrors = Array.isArray(mutation.userErrors) ? mutation.userErrors as Array<Record<string, unknown>> : [];
      if (userErrors.length) throw new Error(clean(userErrors[0]?.message, 300) || "shopify_webhook_create_rejected");
      if (!clean(record(mutation.webhookSubscription).id, 300)) throw new Error("shopify_webhook_create_empty_response");
      created.push(topic);
    } catch (error) {
      failed.push({ topic, error: error instanceof Error ? error.message.slice(0, 300) : "shopify_webhook_create_failed" });
    }
  }

  const result = {
    uri,
    requested: SHOPIFY_COMMERCE_TOPICS.length,
    active: created.length + alreadyPresent.length,
    created,
    alreadyPresent,
    failed,
  };
  await adminDb.collection("ecommerce_connections").doc(input.connectionId).set({
    webhookProvisioning: result,
    webhookProvisionedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return result;
}
