import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizeEcommerceProvider, processEcommerceSyncEvent } from "@/lib/server/ecommerce";
import {
  connectionConfigFromDoc,
  getCommerceProvider,
  readCommerceCredentials,
  validateCommerceCredentials,
} from "@/lib/server/commerce/registry";

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export type CommerceSyncActor = {
  id: string;
  name?: string;
  source: "user" | "oauth" | "scheduled";
};

export async function syncCommerceConnection(input: {
  tenantId: string;
  connectionId: string;
  actor: CommerceSyncActor;
  limit?: number;
}) {
  const tenantId = clean(input.tenantId);
  const connectionId = clean(input.connectionId);
  const limit = Math.max(1, Math.min(50, Number(input.limit || 20)));
  const ref = adminDb.collection("ecommerce_connections").doc(connectionId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("commerce_connection_not_found");

  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId) !== tenantId) throw new Error("commerce_connection_tenant_mismatch");
  const providerId = normalizeEcommerceProvider(data.provider);
  if (!providerId) throw new Error("commerce_provider_invalid");
  const provider = getCommerceProvider(providerId);
  if (!provider.credentialFields.length) throw new Error("commerce_api_sync_not_supported");
  const credentials = readCommerceCredentials(data.apiCredentials);
  validateCommerceCredentials(provider, credentials);

  await ref.set(
    {
      connectionStatus: "syncing",
      lastError: "",
      lastSyncAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    const result = await provider.sync({
      connection: connectionConfigFromDoc(connectionId, data),
      credentials,
      limit,
    });
    let processed = 0;
    for (const event of result.events) {
      await processEcommerceSyncEvent({ tenantId, connectionId, provider: providerId, event });
      processed += 1;
    }

    const summary = { processed, products: result.products, orders: result.orders, carts: result.carts };
    await Promise.all([
      ref.set(
        {
          connectionStatus: "connected",
          status: "active",
          lastSyncAt: FieldValue.serverTimestamp(),
          lastError: "",
          lastSyncSummary: summary,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("audit_logs").add({
        type: "tenant_ecommerce_api_sync_completed",
        tenantId,
        connectionId,
        provider: providerId,
        ...summary,
        actorId: clean(input.actor.id) || "system",
        actorName: clean(input.actor.name, 120) || "Altum",
        actorSource: input.actor.source,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);
    return { connectionId, provider: providerId, ...summary };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "commerce_sync_failed";
    await ref.set(
      {
        connectionStatus: "error",
        lastError: message,
        lastSyncAttemptAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    throw error;
  }
}
