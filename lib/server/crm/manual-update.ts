import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { manualCrmOwnershipPatch, type OwnedCrmField } from "@/lib/server/crm/field-ownership";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertPipelineStageExists, loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";

export class ManualLeadUpdateConflict extends Error {}

/** Called after route authentication/capability/record-access checks. Comparing
 * the original snapshot also prevents a changed tenant/assignee bypassing them.
 * Record, field ownership, audit and pending stage automation commit together. */
export async function commitManualLeadPatch(input: {
  tenantId: string; leadId: string; expectedVersion: Timestamp; actorId: string; actorName: string;
  fields: readonly OwnedCrmField[]; patch: Record<string, unknown>; detail: string;
  audit?: { type: string; title: string; forced?: boolean; missingFields?: string[] };
  stageAuthorization?: "edit_leads" | "edit_leads_or_manage_pipeline";
}) {
  const ref = adminDb.collection("leads").doc(input.leadId), eventRef = ref.collection("events").doc();
  const transitionRef = adminDb.collection("jobs").doc(`crm_manual_stage_${eventRef.id}`);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || snapshot.data()?.tenantId !== input.tenantId || !snapshot.updateTime?.isEqual(input.expectedVersion)) {
      throw new ManualLeadUpdateConflict("Este cliente foi alterado. Recarregue os dados antes de salvar novamente.");
    }
    const previousStage = normalizePipelineStageId(snapshot.data()?.pipelineStage || snapshot.data()?.stage || "captado");
    const nextStage = input.patch.pipelineStage === undefined ? previousStage : normalizePipelineStageId(input.patch.pipelineStage, "");
    const stageChanged = input.fields.includes("pipelineStage") && Boolean(nextStage) && previousStage !== nextStage;
    let pipelineVersion: string | null = null, knownStage = false;
    if (input.patch.pipelineStage !== undefined) {
      const pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId);
      assertPipelineStageExists(pipeline.stages, nextStage);
      pipelineVersion = pipeline.version; knownStage = true;
    }
    const owners = input.fields.length ? manualCrmOwnershipPatch(input.fields, input.actorId).crmFieldOwnership : {};
    tx.set(ref, input.patch, { merge: true });
    if (input.fields.length) tx.update(ref, Object.fromEntries(input.fields.map(field => [`crmFieldOwnership.${field}`, owners[field]])));
    if (stageChanged) tx.update(ref, { "crmFieldOwnership.pipelineStage.transitionId": transitionRef.id });
    tx.create(eventRef, { type: "lead_profile_update", title: "Lead atualizado", ...input.audit, tenantId: input.tenantId, detail: input.detail,
      ...(input.fields.includes("pipelineStage") ? { previousStage, nextStage } : {}),
      ...(stageChanged ? { stageTransitionId: transitionRef.id } : {}),
      manuallyOwnedFields: input.fields, actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp() });
    if (stageChanged) tx.create(transitionRef, { type: "crm_manual_stage_transition", protocolVersion: 1,
      tenantId: input.tenantId, leadId: input.leadId, sourceEventId: eventRef.id, previousStage, nextStage, pipelineVersion,
      actorId: input.actorId, actorName: input.actorName, outcome: "applied", status: knownStage ? "ready" : "reconciliation_required", attempts: 0,
      requiredCapability: input.stageAuthorization || "edit_leads",
      completionMeaning: knownStage ? "manual_stage_committed_automation_pending" : "manual_stage_committed_pipeline_needs_review",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { eventId: eventRef.id, stageTransitionId: stageChanged ? transitionRef.id : null };
  });
}
