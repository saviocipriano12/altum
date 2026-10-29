import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

import { asaasCommercialEventState } from "@/lib/server/crm/asaas-commercial-proof";
export { asaasCommercialEventState } from "@/lib/server/crm/asaas-commercial-proof";

export const ASAAS_COMMERCIAL_CURSOR_TYPE = "asaas_commercial_payment_cursor";
export function asaasCommercialCursorId(chargeId: string) { return `asaas_charge_cursor_${createHash("sha256").update(chargeId).digest("hex")}`; }
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function knownTime(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
export type AsaasOrderPlan = {
  decision: "apply" | "same_fact" | "stale" | "reconcile"; reason: string; id: string; epoch: string; factFingerprint: string;
  cursor: FirebaseFirestore.DocumentData | null; ledgerId: string; objectPath: string;
  previous: FirebaseFirestore.DocumentData | null;
};

/** State index in the existing jobs store, not a new queue. Source timestamps
 * decide order; arrival time and lexical event IDs never decide financial truth. */
export async function planAsaasCommercialOrder(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; leadId: string; financeId: string | null; ledgerId: string; proof: FirebaseFirestore.DocumentData; currentStatus: unknown;
}): Promise<AsaasOrderPlan> {
  const state = asaasCommercialEventState(input.proof.event);
  if (!state || !input.proof.chargeId) throw new Error("CRM_STAGE_ASAAS_ORDER_SOURCE_INVALID");
  const id = asaasCommercialCursorId(input.proof.chargeId), previous = (await tx.get(adminDb.collection("jobs").doc(id))).data();
  const objectPath = input.financeId ? `financeiro/${input.financeId}` : `leads/${input.leadId}`;
  const factFingerprint = digest(state === "pago" ? [state, input.proof.amountCents, input.proof.method] : [state]);
  const epoch = digest([id, input.ledgerId, input.proof.fingerprint, factFingerprint]);
  const base: FirebaseFirestore.DocumentData = { tenantId: input.tenantId, leadId: input.leadId, financeId: input.financeId, type: ASAAS_COMMERCIAL_CURSOR_TYPE,
    protocolVersion: 2, chargeId: input.proof.chargeId, objectPath, status: "observed", state, factFingerprint, authorizationEpoch: epoch,
    occurredAtMs: input.proof.occurredAtMs ?? null, clockDomain: input.proof.clockDomain, sourceLedgerId: input.ledgerId, proofFingerprint: input.proof.fingerprint,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const result: AsaasOrderPlan = { decision: "apply", reason: "first_verified_fact", id, epoch, factFingerprint, cursor: base, ledgerId: input.ledgerId, objectPath, previous: previous || null };
  if (!previous) {
    if (!knownTime(input.proof.occurredAtMs)) return holdAsaasCommercialOrder(result, "missing_provider_order");
    if (["cancelado", "cancelled", "canceled"].includes(String(input.currentStatus || "").toLowerCase()) && state === "pago") return holdAsaasCommercialOrder(result, "legacy_reversal_without_order");
    return result;
  }
  result.epoch = previous.authorizationEpoch || epoch;
  if (previous.type !== ASAAS_COMMERCIAL_CURSOR_TYPE || previous.protocolVersion !== 2 || previous.chargeId !== input.proof.chargeId ||
      previous.tenantId !== input.tenantId || previous.leadId !== input.leadId || previous.objectPath !== objectPath) {
    result.cursor = { status: "reconciliation_required", reconciliationReason: "charge_binding_changed", conflictingLedgerId: input.ledgerId, updatedAt: FieldValue.serverTimestamp() };
    result.decision = "reconcile"; result.reason = "charge_binding_changed"; return result;
  }
  result.cursor = { ...base, createdAt: previous.createdAt, humanHold: previous.humanHold === true };
  if (previous.humanHold === true || previous.status !== "observed") return holdAsaasCommercialOrder(result, "existing_hold_requires_human_review");
  const oldTime = previous.occurredAtMs, nextTime = input.proof.occurredAtMs;
  if (knownTime(oldTime) && knownTime(nextTime) && previous.clockDomain !== input.proof.clockDomain) {
    if (previous.factFingerprint === factFingerprint) {
      result.decision = "same_fact"; result.reason = "same_fact_incomparable_clock";
      result.cursor = { ...previous, lastSeenLedgerId: input.ledgerId, updatedAt: FieldValue.serverTimestamp() };
      return result;
    }
    return holdAsaasCommercialOrder(result, "provider_clock_domain_changed");
  }
  if (knownTime(oldTime) && knownTime(nextTime) && nextTime < oldTime) {
    result.decision = "stale"; result.reason = "older_provider_timestamp"; result.cursor = null; return result;
  }
  if (previous.factFingerprint === factFingerprint) {
    result.decision = "same_fact"; result.reason = "same_verified_fact";
    result.cursor.authorizationEpoch = result.epoch;
    result.cursor.occurredAtMs = knownTime(nextTime) && (!knownTime(oldTime) || nextTime > oldTime) ? nextTime : oldTime ?? null;
    return result;
  }
  if (previous.state === "pago" && state === "pago") return holdAsaasCommercialOrder(result, "paid_fact_context_changed");
  if (!knownTime(oldTime) || !knownTime(nextTime)) return holdAsaasCommercialOrder(result, "missing_provider_order");
  if (nextTime === oldTime) return holdAsaasCommercialOrder(result, "conflicting_same_provider_timestamp");
  result.epoch = epoch; result.reason = "newer_verified_fact";
  return result;
}

export function holdAsaasCommercialOrder(plan: AsaasOrderPlan, reason: string): AsaasOrderPlan {
  return { ...plan, decision: "reconcile", reason, cursor: { ...(plan.previous || plan.cursor || {}), status: "reconciliation_required", reconciliationReason: reason,
    conflictingLedgerId: plan.ledgerId, conflictingState: plan.cursor?.state ?? null, conflictingFactFingerprint: plan.factFingerprint,
    updatedAt: FieldValue.serverTimestamp() } };
}
export function writeAsaasCommercialOrder(tx: FirebaseFirestore.Transaction, plan: AsaasOrderPlan) {
  if (plan.cursor) tx.set(adminDb.collection("jobs").doc(plan.id), plan.cursor, { merge: true });
  tx.set(adminDb.collection("asaas_webhook_events_internal").doc(plan.ledgerId), { commercialOrdering: { [digest(plan.objectPath)]: {
    decision: plan.decision, reason: plan.reason, cursorId: plan.id, objectPath: plan.objectPath, recordedAt: FieldValue.serverTimestamp(),
  } } }, { merge: true });
}
export function asaasOrderMetadata(plan: AsaasOrderPlan) { return { orderCursorId: plan.id, orderEpoch: plan.epoch, orderFactFingerprint: plan.factFingerprint }; }
export function asaasOrderCanApply(plan: AsaasOrderPlan) { return plan.decision === "apply" || plan.decision === "same_fact"; }

export async function assertAsaasCommercialOrder(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, objectPath: string) {
  if (!row.orderCursorId || !row.orderEpoch || !row.orderFactFingerprint || row.orderCursorId !== asaasCommercialCursorId(row.asaasChargeId)) throw new Error("CRM_STAGE_ASAAS_ORDER_UNPROVEN");
  const cursor = (await tx.get(adminDb.collection("jobs").doc(row.orderCursorId))).data();
  if (!cursor || cursor.type !== ASAAS_COMMERCIAL_CURSOR_TYPE || cursor.protocolVersion !== 2 || cursor.status !== "observed" || cursor.humanHold === true ||
      cursor.chargeId !== row.asaasChargeId || cursor.tenantId !== row.tenantId || cursor.leadId !== row.leadId || cursor.objectPath !== objectPath || cursor.state !== "pago" ||
      cursor.authorizationEpoch !== row.orderEpoch || cursor.factFingerprint !== row.orderFactFingerprint) throw new Error("CRM_STAGE_ASAAS_ORDER_REVOKED");
}

/** A reused provider ID with conflicting content cannot replace its ledger or
 * keep authorizing queued effects. Read every affected cursor before writing. */
export async function holdAsaasCommercialContentConflict(tx: FirebaseFirestore.Transaction, chargeIds: string[], ledgerId: string, reason = "provider_event_content_conflict") {
  const refs = [...new Set(chargeIds.filter(value => typeof value === "string" && value.length > 0))].map(chargeId => adminDb.collection("jobs").doc(asaasCommercialCursorId(chargeId)));
  const reads = await Promise.allSettled(refs.map(ref => tx.get(ref)));
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  for (const read of reads) if (read.status === "fulfilled" && read.value.data()?.type === ASAAS_COMMERCIAL_CURSOR_TYPE) {
    tx.set(read.value.ref, { status: "reconciliation_required", reconciliationReason: reason, conflictingLedgerId: ledgerId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}
