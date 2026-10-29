import { adminDb } from "@/app/lib/server/firebase-admin";
import { quarantineShopifyOccurrence } from "@/lib/server/commerce/shopify-occurrence";

/** The periodic consumer must inspect the durable queue without loading the
 * entire commerce handler graph when there is no occurrence to recover. */
export async function processPendingShopifyOccurrences(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(10, Number(input?.limit || 5)));
  const query = (status: string) => {
    let scoped = adminDb.collection("ecommerce_events").where("occurrence.protocolVersion", "==", 1).where("occurrence.status", "==", status);
    if (input?.tenantId) scoped = scoped.where("tenantId", "==", input.tenantId);
    return scoped;
  };
  const [ready, expired] = await Promise.all([query("ready").orderBy("receivedAt", "asc").limit(limit).get(),
    query("processing").where("occurrence.leaseUntil", "<=", new Date()).orderBy("occurrence.leaseUntil", "asc").limit(limit).get()]);
  let completed = 0, reconciled = 0;
  for (const event of [...ready.docs, ...expired.docs]) {
    const row = event.data();
    try {
      const { processEcommerceWebhook } = await import("@/lib/server/ecommerce");
      const result = await processEcommerceWebhook({ tenantId: row.tenantId, connectionId: row.connectionId, provider: "shopify", payload: row.payload,
        trusted: true, recoveryEventId: event.id, req: new Request("http://127.0.0.1/internal-shopify-recovery", {
          headers: { "x-altum-event": row.topic, "x-altum-event-id": row.externalEventId },
        }) });
      if ("completed" in result && result.completed && !result.replayed) completed++;
      if ("requiresReconciliation" in result && result.requiresReconciliation) reconciled++;
      if ("ignored" in result && result.ignored && await quarantineShopifyOccurrence(event.id, row.tenantId)) reconciled++;
    } catch {
      if (await quarantineShopifyOccurrence(event.id, row.tenantId).catch(() => false)) reconciled++;
    }
  }
  return { scanned: ready.size + expired.size, completed, reconciled };
}
