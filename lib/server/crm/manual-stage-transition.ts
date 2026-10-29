import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

export const MANUAL_STAGE_JOB_TYPE = "crm_manual_stage_transition";
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/"); }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }

async function assertAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_MANUAL_HOOK_PROGRESS_INVALID");
  if (row.protocolVersion !== 1 || row.outcome !== "applied" || !["edit_leads", "edit_leads_or_manage_pipeline"].includes(row.requiredCapability) ||
      ![row.tenantId, row.leadId, row.actorId, row.sourceEventId].every(validId)) throw new Error("CRM_STAGE_MANUAL_PROTOCOL_INVALID");
  // Read every policy source used by the existing access helpers in this same
  // transaction. A concurrent revocation invalidates the effect's commit too.
  const reads = await Promise.allSettled([
    tx.get(adminDb.collection("leads").doc(row.leadId)),
    tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(row.sourceEventId)),
    loadTenantPipelineInTransaction(tx, row.tenantId),
    tx.get(adminDb.collection("tenant_users").where("userId", "==", row.actorId).where("tenantId", "==", row.tenantId).limit(2)),
    tx.get(adminDb.collection("tenant_users").doc(`${row.tenantId}_${row.actorId}`)),
    tx.get(adminDb.collection("users").doc(row.actorId)),
    tx.get(adminDb.collection("tenants").doc(row.tenantId)),
    tx.get(adminDb.collection("client_portal_users").doc(row.actorId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId)),
  ]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [leadRead, eventRead, pipelineRead, , , userRead] = reads;
  if (leadRead.status !== "fulfilled" || eventRead.status !== "fulfilled" || pipelineRead.status !== "fulfilled" || userRead.status !== "fulfilled") throw new Error("CRM_STAGE_MANUAL_READ_INVALID");
  const lead = leadRead.value.data(), event = eventRead.value.data(), pipeline = pipelineRead.value, owner = lead?.crmFieldOwnership?.pipelineStage;
  if (!lead || lead.tenantId !== row.tenantId || normalizePipelineStageId(lead.pipelineStage || lead.stage) !== row.nextStage ||
      owner?.source !== "manual" || owner.locked !== true || owner.actorId !== row.actorId || owner.transitionId !== id ||
      !event || event.tenantId !== row.tenantId || event.stageTransitionId !== id || event.actorId !== row.actorId ||
      event.previousStage !== row.previousStage || event.nextStage !== row.nextStage ||
      pipeline.version !== row.pipelineVersion || !pipeline.stages.some(stage => stage.id === row.nextStage) ||
      userRead.value.data()?.status === "blocked") throw new Error("CRM_STAGE_MANUAL_AUTHORITY_CHANGED");
  try {
    const membership = await assertTenantAccess(row.actorId, row.tenantId);
    await assertTenantModule(row.tenantId, "crm");
    if (!hasTenantCapability(membership, "edit_leads") &&
        !(row.requiredCapability === "edit_leads_or_manage_pipeline" && hasTenantCapability(membership, "manage_pipeline"))) throw new Error("CRM_STAGE_MANUAL_CAPABILITY_REVOKED");
    assertAssignedCommercialRecordAccess(membership, row.actorId, lead);
  } catch (error) {
    if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_MANUAL_ACCESS_REVOKED");
    throw error;
  }
}

export async function assertManualStageAutomationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}) {
  if (![input.id, input.tenantId, input.leadId].every(validId)) throw new Error("CRM_STAGE_MANUAL_SOURCE_INVALID");
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== MANUAL_STAGE_JOB_TYPE || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_MANUAL_SOURCE_REVOKED");
  await assertAuthority(tx, row, input.id);
  return source;
}

/** Consumes only the automation occurrence. Learning, dossier and conversion
 * hooks keep their existing route behavior; this receipt does not approve them. */
export async function processManualStageTransition(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("CRM_STAGE_MANUAL_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== MANUAL_STAGE_JOB_TYPE || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) {
      tx.update(ref, { status: "reconciliation_required", lastError: "Automacao manual interrompida; revisar recibos antes de retomar.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    if (current.status !== "ready" && !expired) return null;
    try {
      if (current.stageHookProgress !== undefined ? !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("CRM_STAGE_MANUAL_HOOK_PROGRESS_INVALID");
      await assertAuthority(tx, current, id);
    }
    catch (error) {
      if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", lastError: "Decisao, acesso ou funil alterados antes da automacao.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
    return current;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertManualStageAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false, needsReview = false;
  try {
    const { runLeadAutomations } = await import("@/lib/server/automations");
    await runHook("automations", () => runLeadAutomations({ tenantId: row.tenantId, leadId: row.leadId, trigger: "lead_stage_changed", previousStage: row.previousStage,
      nextStage: row.nextStage, actorId: row.actorId, actorName: row.actorName, strictErrors: true, stageSource: { kind: "manual", id, token } }));
    completed = true;
  } catch (error) { needsReview = stageHookErrorNeedsReview(error) || error instanceof TenantPipelineConfigurationError; }
  const finalized = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    const confirmed = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !confirmed && !needsReview && canResumeStageHooks(current);
    if (resumable) {
      try { await assertAuthority(tx, current, id); }
      catch (error) {
        if (!(error instanceof TenantPipelineConfigurationError) && !stageHookErrorNeedsReview(error)) throw error;
        resumable = false;
      }
    }
    tx.update(ref, { status: confirmed ? "done" : resumable ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
      completionMeaning: confirmed ? "manual_stage_automation_registered_not_provider_delivery" : resumable ? "manual_stage_receipts_preserved_automation_pending" : "manual_stage_partial_actions_need_reconciliation" });
    return confirmed;
  });
  return { processed: true, completed: finalized };
}

export async function processPendingManualStageTransitions(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => {
    let q = adminDb.collection("jobs").where("type", "==", MANUAL_STAGE_JOB_TYPE).where("status", "==", status);
    if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId);
    return q;
  };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const source of [...ready.docs, ...expired.docs]) {
    try { const result = await processManualStageTransition(source.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; }
    catch { failed++; }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
