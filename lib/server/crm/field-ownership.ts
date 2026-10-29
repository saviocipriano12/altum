import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export const ownedCrmFields = ["pipelineStage", "priority", "tags"] as const;
export type OwnedCrmField = typeof ownedCrmFields[number];

export function crmFieldValue(lead: Record<string, unknown>, field: OwnedCrmField) {
  return field === "pipelineStage" ? lead.pipelineStage ?? lead.stage ?? null : lead[field] ?? null;
}

export function crmMutationBaseline(lead: Record<string, unknown>) {
  return Object.fromEntries(ownedCrmFields.map(field => [field, crmFieldValue(lead, field)]));
}

export function isCrmFieldManuallyOwned(lead: Record<string, unknown>, field: OwnedCrmField) {
  const owners = lead.crmFieldOwnership as Record<string, { source?: string; locked?: boolean }> | undefined;
  return owners?.[field]?.source === "manual" && owners[field].locked === true;
}

/** Only authenticated server callers supply actorId. Do not accept ownership
 * metadata from request bodies, extracted text or a model's tool arguments. */
export function manualCrmOwnershipPatch(fields: readonly OwnedCrmField[], actorId: string) {
  if (!actorId.trim()) throw new Error("Autoria manual ausente.");
  return { crmFieldOwnership: Object.fromEntries(fields.map(field => [field, {
    source: "manual", locked: true, actorId, updatedAt: FieldValue.serverTimestamp(),
  }])) };
}

/** Recheck the exact snapshot used for derivation. A concurrent human edit must
 * not be overwritten with an analysis computed before that edit. The caller
 * must defer dependent stage effects/tasks when this returns false. */
export async function commitAutomaticLeadPatch(input: {
  tenantId: string; leadId: string; expectedVersion: Timestamp; patch: Record<string, unknown>;
  verifyContext?: (transaction: FirebaseFirestore.Transaction) => Promise<boolean>;
  prepareEffects?: (transaction: FirebaseFirestore.Transaction, lead: FirebaseFirestore.DocumentData) => Promise<(() => void) | null>;
}) {
  const ref = adminDb.collection("leads").doc(input.leadId);
  return adminDb.runTransaction(async tx => {
    if (input.verifyContext && !await input.verifyContext(tx)) return false;
    const snapshot = await tx.get(ref), lead = snapshot.data();
    if (!lead || lead.tenantId !== input.tenantId || !snapshot.updateTime?.isEqual(input.expectedVersion)) return false;
    const patch = { ...input.patch };
    if (lead.scoreSource === "manual") { delete patch.score; delete patch.scoreSource; }
    for (const field of ownedCrmFields) {
      if (!isCrmFieldManuallyOwned(lead, field)) continue;
      delete patch[field];
      if (field === "pipelineStage") { delete patch.stage; delete patch.stageUpdatedAt; }
    }
    // Read and prepare all dependent internal records before the first write.
    // A rejected plan or failed event/task write must roll back the projection.
    const effects = input.prepareEffects ? await input.prepareEffects(tx, lead) : undefined;
    if (effects === null) return false;
    tx.set(ref, patch, { merge: true });
    effects?.();
    return true;
  });
}
