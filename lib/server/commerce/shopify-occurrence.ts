import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { commerceSnapshotDigest } from "@/lib/server/commerce/event-identity";

export type ShopifyOccurrence = { id: string; tenantId: string; connectionId: string; topic: string; externalEventId: string;
  payload: unknown; normalized: Record<string, unknown> };
const states = ["ready", "processing", "done", "reconciliation_required"];
function digest(row: Omit<ShopifyOccurrence, "id">) {
  return commerceSnapshotDigest([row.tenantId, row.connectionId, row.topic, row.externalEventId, row.payload, row.normalized]);
}
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }
function validId(value: unknown): value is string { return typeof value === "string" && Boolean(value) && value === value.trim() && value.length <= 500 && !value.includes("/"); }
function checked(row: FirebaseFirestore.DocumentData | undefined, tenantId?: string) {
  if (!row || row.provider !== "shopify" || !validId(row.tenantId) || !validId(row.connectionId) || (tenantId && row.tenantId !== tenantId)
    || row.occurrence?.protocolVersion !== 1 || !states.includes(row.occurrence.status) || row.occurrence.fingerprint !== digest(row as Omit<ShopifyOccurrence, "id">)) {
    throw new Error("SHOPIFY_OCCURRENCE_SOURCE_INVALID_OR_LEGACY");
  }
  if (row.occurrence.status === "done" && (row.occurrence.completionMeaning !== "commerce_handlers_returned_not_provider_delivery" || !millis(row.occurrence.completedAt))) throw new Error("SHOPIFY_OCCURRENCE_COMPLETION_INVALID");
  if (row.occurrence.status === "processing" && (typeof row.occurrence.claimToken !== "string" || typeof row.occurrence.leaseUntil?.toMillis !== "function")) throw new Error("SHOPIFY_OCCURRENCE_CLAIM_INVALID");
  return row;
}
async function activeConnection(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData) {
  const connection = (await tx.get(adminDb.collection("ecommerce_connections").doc(row.connectionId))).data();
  if (!connection || connection.tenantId !== row.tenantId || connection.provider !== "shopify" || connection.status !== "active") throw new Error("SHOPIFY_OCCURRENCE_CONNECTION_REVOKED");
}

export async function readAuthorizedShopifyOccurrence(tx: FirebaseFirestore.Transaction, id: string, tenantId: string) {
  if (!validId(id)) throw new Error("SHOPIFY_OCCURRENCE_CONTEXT_INVALID");
  const row = checked((await tx.get(adminDb.collection("ecommerce_events").doc(id))).data(), tenantId);
  await activeConnection(tx, row);
  if (row.occurrence.status !== "done" && !(row.occurrence.status === "processing" && millis(row.occurrence.leaseUntil) > Date.now())) throw new Error("SHOPIFY_OCCURRENCE_NOT_AUTHORIZED");
  return row;
}

/** Admission is before every handler: redelivery may update counters, never the
 * accepted payload/normalized snapshot or a previous execution's state. */
export async function admitShopifyOccurrence(input: ShopifyOccurrence, redelivery = true) {
  if (![input.id, input.tenantId, input.connectionId].every(validId) || !input.topic || !input.externalEventId) throw new Error("SHOPIFY_OCCURRENCE_CONTEXT_INVALID");
  const ref = adminDb.collection("ecommerce_events").doc(input.id), fingerprint = digest(input);
  return adminDb.runTransaction(async tx => {
    const current = await tx.get(ref);
    await activeConnection(tx, input);
    if (current.exists) {
      const row = checked(current.data(), input.tenantId);
      if (row.connectionId !== input.connectionId || row.occurrence.fingerprint !== fingerprint) throw new Error("SHOPIFY_OCCURRENCE_PAYLOAD_CONFLICT");
      if (redelivery) tx.update(ref, { lastReceivedAt: FieldValue.serverTimestamp(), deliveryCount: FieldValue.increment(1) });
      return { created: false, status: String(row.occurrence.status) };
    }
    if (!redelivery) throw new Error("SHOPIFY_OCCURRENCE_RECOVERY_SOURCE_MISSING");
    const source = { tenantId: input.tenantId, connectionId: input.connectionId, topic: input.topic,
      externalEventId: input.externalEventId, payload: input.payload, normalized: input.normalized };
    tx.create(ref, { ...source, provider: "shopify", receivedAt: FieldValue.serverTimestamp(), lastReceivedAt: FieldValue.serverTimestamp(), deliveryCount: 1,
      occurrence: { protocolVersion: 1, status: "ready", fingerprint, attempts: 0, completionMeaning: "admitted_no_handlers_started" } });
    return { created: true, status: "ready" };
  });
}

/** A failed/expired started handler is not safe to replay without per-effect
 * evidence. Ready is recoverable because the claim precedes any handler call. */
export async function quarantineShopifyOccurrence(id: string, tenantId: string, token?: string) {
  if (!validId(id)) throw new Error("SHOPIFY_OCCURRENCE_CONTEXT_INVALID");
  const ref = adminDb.collection("ecommerce_events").doc(id);
  return adminDb.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (!row || row.tenantId !== tenantId || row.occurrence?.protocolVersion !== 1) return false;
    if (token ? row.occurrence.status !== "processing" || row.occurrence.claimToken !== token
      : row.occurrence.status !== "ready" && !(row.occurrence.status === "processing" && millis(row.occurrence.leaseUntil) <= Date.now())) return false;
    tx.update(ref, { "occurrence.status": "reconciliation_required", "occurrence.completionMeaning": "handlers_not_confirmed_do_not_replay",
      "occurrence.lastError": "Fonte, permissao, prazo ou execucao sem confirmacao; conferir efeitos antes de retomar.", "occurrence.updatedAt": FieldValue.serverTimestamp() });
    return true;
  });
}

export async function runShopifyOccurrence(id: string, tenantId: string, execute: (assertActive: () => Promise<void>) => Promise<void | Record<string, unknown>>) {
  if (!validId(id)) throw new Error("SHOPIFY_OCCURRENCE_CONTEXT_INVALID");
  const ref = adminDb.collection("ecommerce_events").doc(id), token = randomUUID();
  const claim = await adminDb.runTransaction(async tx => {
    const row = checked((await tx.get(ref)).data(), tenantId); await activeConnection(tx, row);
    if (row.occurrence.status === "processing" && millis(row.occurrence.leaseUntil) <= Date.now()) {
      tx.update(ref, { "occurrence.status": "reconciliation_required", "occurrence.completionMeaning": "expired_handlers_do_not_replay", "occurrence.updatedAt": FieldValue.serverTimestamp() });
      return { row, claimed: false, status: "reconciliation_required" };
    }
    if (row.occurrence.status !== "ready") return { row, claimed: false, status: String(row.occurrence.status) };
    tx.update(ref, { "occurrence.status": "processing", "occurrence.claimToken": token, "occurrence.leaseUntil": new Date(Date.now() + 120_000),
      "occurrence.attempts": Number(row.occurrence.attempts || 0) + 1, "occurrence.completionMeaning": "handlers_started_not_confirmed", "occurrence.updatedAt": FieldValue.serverTimestamp() });
    return { row, claimed: true, status: "processing" };
  });
  const response = (status: string, replayed: boolean) => ({ ok: true, topic: String(claim.row.topic), eventId: id,
    product: Boolean(claim.row.normalized.product), order: Boolean(claim.row.normalized.order), cart: Boolean(claim.row.normalized.cart),
    processingState: status, completed: status === "done", replayed, requiresReconciliation: status === "reconciliation_required" });
  if (!claim.claimed) return response(claim.status, true);
  const assertInTransaction = async (tx: FirebaseFirestore.Transaction) => {
    const row = checked((await tx.get(ref)).data(), tenantId); await activeConnection(tx, row);
    if (row.occurrence.status !== "processing" || row.occurrence.claimToken !== token || millis(row.occurrence.leaseUntil) <= Date.now()) throw new Error("SHOPIFY_OCCURRENCE_CLAIM_LOST");
    return row;
  };
  try {
    const connectionUpdates = await execute(() => adminDb.runTransaction(async tx => { await assertInTransaction(tx); }));
    await adminDb.runTransaction(async tx => {
      const row = await assertInTransaction(tx);
      const counts = Object.fromEntries(["product", "order", "cart"].filter(kind => row.normalized[kind]).map(kind => [`${kind}Count`, FieldValue.increment(1)]));
      const metadata = Object.fromEntries(Object.entries(connectionUpdates || {}).filter(([key]) =>
        ["lastEventAt", "lastError", "connectionStatus", "lastAutomationError", "lastAutomationErrorAt"].includes(key)));
      tx.update(adminDb.collection("ecommerce_connections").doc(row.connectionId), { ...metadata, ...counts, updatedAt: FieldValue.serverTimestamp() });
      tx.update(ref, { "occurrence.status": "done", "occurrence.completionMeaning": "commerce_handlers_returned_not_provider_delivery", "occurrence.completedAt": FieldValue.serverTimestamp() });
    });
    return response("done", false);
  } catch (error) {
    await quarantineShopifyOccurrence(id, tenantId, token).catch(() => false);
    throw error;
  }
}
