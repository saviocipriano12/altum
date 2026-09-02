import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertSafeCommerceUrl, commerceFetchJson } from "@/lib/server/commerce/http";
import type { CommerceConnectionConfig, CommerceCredentials } from "@/lib/server/commerce/types";

const WOOCOMMERCE_COMMERCE_TOPICS = [
  "product.created",
  "product.updated",
  "order.created",
  "order.updated",
] as const;

type WooTopic = (typeof WOOCOMMERCE_COMMERCE_TOPICS)[number];
type WooWebhook = { id?: number; topic?: string; delivery_url?: string; status?: string };

function authorization(credentials: CommerceCredentials) {
  const key = String(credentials.consumerKey || "").trim();
  const secret = String(credentials.consumerSecret || "").trim();
  if (!key || !secret) throw new Error("woocommerce_webhook_credentials_missing");
  return `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`;
}

async function endpoint(storeUrl: string, resource = "webhooks") {
  const base = await assertSafeCommerceUrl(storeUrl);
  return new URL(`/wp-json/wc/v3/${resource}`, base);
}

export async function ensureWooCommerceWebhookSubscriptions(input: {
  connection: CommerceConnectionConfig;
  credentials: CommerceCredentials;
  webhookSecret: string;
  appBaseUrl: string;
  rotateExistingSecret?: boolean;
}) {
  if (!input.webhookSecret) throw new Error("woocommerce_webhook_secret_missing");
  const callback = new URL("/api/webhooks/ecommerce/woocommerce", input.appBaseUrl);
  callback.searchParams.set("tenantId", input.connection.tenantId);
  callback.searchParams.set("connectionId", input.connection.id);
  const deliveryUrl = callback.toString();
  const headers = { Authorization: authorization(input.credentials), "Content-Type": "application/json" };
  const listUrl = await endpoint(input.connection.storeUrl);
  listUrl.searchParams.set("per_page", "100");
  const listed = await commerceFetchJson<WooWebhook[]>(listUrl, { headers });
  const rows = Array.isArray(listed.data) ? listed.data : [];

  const created: WooTopic[] = [];
  const updated: WooTopic[] = [];
  const alreadyPresent: WooTopic[] = [];
  const failed: Array<{ topic: WooTopic; error: string }> = [];
  for (const topic of WOOCOMMERCE_COMMERCE_TOPICS) {
    const existing = rows.find((row) => row.topic === topic && row.delivery_url === deliveryUrl);
    if (existing?.id && input.rotateExistingSecret) {
      try {
        await commerceFetchJson<WooWebhook>(await endpoint(input.connection.storeUrl, `webhooks/${existing.id}`), {
          method: "PUT",
          headers,
          body: JSON.stringify({ status: "active", secret: input.webhookSecret }),
        });
        updated.push(topic);
      } catch (error) {
        failed.push({ topic, error: error instanceof Error ? error.message.slice(0, 300) : "woocommerce_webhook_update_failed" });
      }
      continue;
    }
    if (existing?.id) {
      alreadyPresent.push(topic);
      continue;
    }
    try {
      const result = await commerceFetchJson<WooWebhook>(await endpoint(input.connection.storeUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: `Altum · ${topic}`,
          status: "active",
          topic,
          delivery_url: deliveryUrl,
          secret: input.webhookSecret,
        }),
      });
      if (!result.data?.id) throw new Error("woocommerce_webhook_create_empty_response");
      created.push(topic);
    } catch (error) {
      failed.push({ topic, error: error instanceof Error ? error.message.slice(0, 300) : "woocommerce_webhook_create_failed" });
    }
  }

  const result = {
    deliveryUrl,
    requested: WOOCOMMERCE_COMMERCE_TOPICS.length,
    active: created.length + updated.length + alreadyPresent.length,
    created,
    updated,
    alreadyPresent,
    failed,
  };
  await adminDb.collection("ecommerce_connections").doc(input.connection.id).set({
    webhookProvisioning: result,
    webhookProvisionedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return result;
}
