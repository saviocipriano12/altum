import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { commerceSnapshotDigest } from "@/lib/server/commerce/event-identity";

type Kind = "order" | "abandoned_cart" | "recovered_cart";
export type EcommerceProjectionInput = {
  tenantId: string; leadId: string; connectionId: string; sourceEventId: string;
  eventId: string; externalId: string; kind: Kind;
  patch: Record<string, unknown>; eventData: Record<string, unknown>;
};
function validId(value: string) { return Boolean(value && value === value.trim() && value.length <= 500 && !value.includes("/")); }
const suffix = { order: "order_journey", abandoned_cart: "abandoned_cart", recovered_cart: "recovered_cart" } as const;

/** Internal CRM projection only. The existing source event and lead event are
 * its receipt, not confirmation that tasks, messages or conversions completed. */
export async function commitShopifyLeadProjection(input: EcommerceProjectionInput) {
  if (![input.tenantId, input.leadId, input.connectionId, input.sourceEventId].every(validId)
    || !input.eventId || !input.externalId || !Object.hasOwn(suffix, input.kind)) throw new Error("CRM_PROJECTION_CONTEXT_INVALID");
  const eventId = createHash("sha256").update([input.tenantId, input.connectionId, input.eventId, suffix[input.kind]].join("|")).digest("hex").slice(0, 32);
  const leadRef = adminDb.collection("leads").doc(input.leadId), auditRef = leadRef.collection("events").doc(eventId);
  const sourceRef = adminDb.collection("ecommerce_events").doc(input.sourceEventId);
  return adminDb.runTransaction(async tx => {
    const [leadSnapshot, audit, sourceSnapshot, connection] = await Promise.all([
      tx.get(leadRef), tx.get(auditRef), tx.get(sourceRef), tx.get(adminDb.collection("ecommerce_connections").doc(input.connectionId)),
    ]);
    const lead = leadSnapshot.data(), source = sourceSnapshot.data(), account = connection.data();
    if (!lead || lead.tenantId !== input.tenantId) throw new Error("CRM_PROJECTION_DESTINATION_INVALID");
    const entity = input.kind === "order" ? source?.normalized?.order : source?.normalized?.cart;
    if (!source || source.tenantId !== input.tenantId || source.connectionId !== input.connectionId || source.provider !== "shopify"
      || source.externalEventId !== input.eventId || !entity || !account || account.tenantId !== input.tenantId
      || account.provider !== "shopify" || account.status !== "active"
      || (input.kind === "order" ? entity.externalOrderId !== input.externalId
        : entity.externalCartId !== input.externalId || entity.status !== (input.kind === "abandoned_cart" ? "abandoned" : "recovered"))) {
      throw new Error("CRM_PROJECTION_SOURCE_REVOKED");
    }
    const fingerprint = commerceSnapshotDigest([
      input.tenantId, input.connectionId, input.sourceEventId, input.eventId, input.kind, entity,
    ]);
    const receipts = source.crmProjectionReceipts;
    if (receipts !== undefined && (!receipts || typeof receipts !== "object" || Array.isArray(receipts))) throw new Error("CRM_PROJECTION_RECEIPT_CONFLICT");
    const existing = receipts?.[input.kind], auditReceipt = audit.data()?.projectionReceipt;
    if ((receipts && Object.hasOwn(receipts, input.kind)) || audit.exists) {
      for (const receipt of [existing, auditReceipt]) {
        if (!receipt || receipt.protocolVersion !== 1 || receipt.status !== "committed" || receipt.leadId !== input.leadId
          || receipt.leadEventId !== eventId || receipt.sourceFingerprint !== fingerprint || receipt.kind !== input.kind
          || receipt.completionMeaning !== "lead_projection_committed_not_downstream") throw new Error("CRM_PROJECTION_RECEIPT_CONFLICT");
      }
      return { replayed: true, eventId, blockedFields: existing.blockedFields as string[] };
    }
    const allowed = ["priority", "tags", "potentialValue", "valorPotencial", "commercialState"];
    const patch = Object.fromEntries(Object.entries(input.patch).filter(([key]) => allowed.includes(key)));
    const blockedFields: string[] = [], evaluated: Record<string, unknown> = {};
    for (const field of ["priority", "tags"] as const) {
      if (!Object.hasOwn(patch, field)) continue;
      const requested = patch[field], previous = lead[field] ?? null;
      const blocked = isCrmFieldManuallyOwned(lead, field);
      if (field === "tags" && (!Array.isArray(requested) || requested.some(tag => typeof tag !== "string"))) throw new Error("CRM_PROJECTION_TAGS_INVALID");
      if (field === "priority" && !["low", "medium", "high"].includes(String(requested))) throw new Error("CRM_PROJECTION_PRIORITY_INVALID");
      if (blocked) { delete patch[field]; blockedFields.push(field); }
      else if (field === "tags") patch.tags = [...new Set([...(Array.isArray(lead.tags) ? lead.tags : []), ...(requested as string[])])];
      evaluated[field] = { previous, requested, applied: blocked ? previous : patch[field], outcome: blocked ? "blocked_manual" : "applied" };
    }
    const receipt = { protocolVersion: 1, status: "committed", kind: input.kind, leadId: input.leadId, leadEventId: eventId,
      sourceFingerprint: fingerprint, blockedFields, completionMeaning: "lead_projection_committed_not_downstream", committedAt: FieldValue.serverTimestamp() };
    tx.set(leadRef, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const field of ["priority", "tags"] as const) if (Object.hasOwn(patch, field)) tx.update(leadRef, {
      [`crmFieldOwnership.${field}`]: { source: "system_event", locked: false, sourceEventId: input.sourceEventId, projectionEventId: eventId, updatedAt: FieldValue.serverTimestamp() },
    });
    tx.create(auditRef, { ...input.eventData, tenantId: input.tenantId, sourceEventId: input.sourceEventId,
      actorId: "ecommerce_webhook", projectionReceipt: receipt, evaluatedFields: evaluated, createdAt: FieldValue.serverTimestamp() });
    tx.update(sourceRef, { [`crmProjectionReceipts.${input.kind}`]: receipt });
    return { replayed: false, eventId, blockedFields };
  });
}
