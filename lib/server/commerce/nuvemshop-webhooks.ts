import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

const NUVEMSHOP_COMMERCE_EVENTS = [
  "product/created",
  "product/updated",
  "order/created",
  "order/paid",
  "order/packed",
  "order/fulfilled",
  "order/cancelled",
  "order/edited",
] as const;

type NuvemshopEvent = (typeof NUVEMSHOP_COMMERCE_EVENTS)[number];
type WebhookRow = { id?: unknown; event?: unknown; url?: unknown };

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function apiHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": clean(process.env.NUVEMSHOP_USER_AGENT, 200) || "Altum Commerce (suporte@altum.com.br)",
  };
}

export async function ensureNuvemshopWebhookSubscriptions(input: {
  tenantId: string;
  connectionId: string;
  storeId: string;
  accessToken: string;
  appBaseUrl: string;
}) {
  const storeId = clean(input.storeId, 80).replace(/[^0-9]/g, "");
  if (!storeId) throw new Error("nuvemshop_webhook_store_id_invalid");
  const callback = new URL("/api/webhooks/ecommerce/nuvemshop", input.appBaseUrl);
  callback.searchParams.set("tenantId", input.tenantId);
  callback.searchParams.set("connectionId", input.connectionId);
  const callbackUrl = callback.toString();
  const endpoint = new URL(`https://api.nuvemshop.com.br/v1/${storeId}/webhooks`);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("per_page", "200");
  const listResponse = await fetch(endpoint, { headers: apiHeaders(input.accessToken), cache: "no-store" });
  const listed = (await listResponse.json().catch(() => [])) as unknown;
  if (!listResponse.ok) throw new Error(`nuvemshop_webhook_list_http_${listResponse.status}`);
  const rows = Array.isArray(listed) ? listed as WebhookRow[] : [];
  const existing = new Set(
    rows
      .filter((row) => clean(row.url, 2000) === callbackUrl)
      .map((row) => clean(row.event, 120))
      .filter(Boolean)
  );

  const created: NuvemshopEvent[] = [];
  const alreadyPresent: NuvemshopEvent[] = [];
  const failed: Array<{ event: NuvemshopEvent; error: string }> = [];
  for (const event of NUVEMSHOP_COMMERCE_EVENTS) {
    if (existing.has(event)) {
      alreadyPresent.push(event);
      continue;
    }
    try {
      const response = await fetch(new URL(`https://api.nuvemshop.com.br/v1/${storeId}/webhooks`), {
        method: "POST",
        headers: apiHeaders(input.accessToken),
        body: JSON.stringify({ event, url: callbackUrl }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as WebhookRow;
      if (!response.ok || !payload.id) throw new Error(`nuvemshop_webhook_create_http_${response.status}`);
      created.push(event);
    } catch (error) {
      failed.push({ event, error: error instanceof Error ? error.message.slice(0, 300) : "nuvemshop_webhook_create_failed" });
    }
  }

  const result = {
    url: callbackUrl,
    requested: NUVEMSHOP_COMMERCE_EVENTS.length,
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
