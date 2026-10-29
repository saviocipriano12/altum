import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { assertFinancePaymentAuthority, FINANCE_PAID_JOB_TYPE, BILLING_PAID_JOB_TYPE } from "@/lib/server/crm/finance-paid-occurrence";
import { assertStageCrmProjection } from "@/lib/server/crm/proposal-crm-proof";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

export const FINANCE_STAGE_JOB_TYPE = "crm_finance_stage_transition";
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/"); }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }

/** Prepare all reads before the payment commit starts writing. The configured
 * pipeline and manual ownership decide whether payment may advance the stage. */
export async function prepareFinanceStageDecision(tx: FirebaseFirestore.Transaction, input: {
  paidId: string; eventId: string; tenantId: string; leadId: string; lead: FirebaseFirestore.DocumentData;
  financeId: string | null; financeStatus: unknown; actorId: string; actorName: string;
  accessAllowed?: boolean;
}) {
  let pipelineVersion: string | null = null, knownTarget = false;
  try { const pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId); pipelineVersion = pipeline.version; knownTarget = pipeline.stages.some(stage => stage.id === "ganho"); }
  catch (error) { if (!(error instanceof TenantPipelineConfigurationError)) throw error; }
  const id = `${input.paidId}_stage`, previousStage = normalizePipelineStageId(input.lead.pipelineStage || input.lead.stage || "captado");
  const outcome = input.accessAllowed === false ? "blocked_access" : isCrmFieldManuallyOwned(input.lead, "pipelineStage") ? "blocked_manual" : !knownTarget ? "blocked_pipeline" : previousStage === "ganho" ? "unchanged" : "applied";
  const nextStage = outcome === "applied" ? "ganho" : previousStage;
  const patch: FirebaseFirestore.DocumentData = {};
  if (outcome === "applied" || outcome === "unchanged") Object.assign(patch, { paymentStatus: input.financeStatus, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  if (outcome === "applied") Object.assign(patch, { pipelineStage: nextStage, stage: nextStage, stageUpdatedAt: FieldValue.serverTimestamp(),
    ...(!input.lead.wonAt ? { wonAt: FieldValue.serverTimestamp() } : {}) });
  const root = { tenantId: input.tenantId, type: FINANCE_STAGE_JOB_TYPE, protocolVersion: 1, leadId: input.leadId, financeId: input.financeId,
    financePaidOccurrenceId: input.paidId, sourceEventId: input.eventId, pipelineVersion, previousStage, nextStage, requestedStage: "ganho", outcome,
    actorId: input.actorId, actorName: input.actorName, source: "finance_paid", status: outcome === "applied" ? "ready" : "done", attempts: 0,
    completionMeaning: outcome === "applied" ? "finance_stage_committed_hooks_pending" : "finance_stage_evaluated_no_stage_hooks",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  return { id, patch, root, audit: { tenantId: input.tenantId, type: "crm_finance_stage_evaluated", title: outcome === "applied" ? "Pagamento atualizou etapa" : "Pagamento preservou etapa do CRM",
    financeId: input.financeId, financePaidOccurrenceId: input.paidId, sourceEventId: input.eventId, transitionId: id,
    previousStage, nextStage, requestedStage: "ganho", outcome, actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp() } };
}

async function assertAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.protocolVersion !== 1 || row.outcome !== "applied" || ![row.tenantId, row.leadId, row.financePaidOccurrenceId, row.sourceEventId].every(validId) || id !== `${row.financePaidOccurrenceId}_stage`) throw new Error("CRM_STAGE_FINANCE_STAGE_PROTOCOL_INVALID");
  const reads = await Promise.allSettled([
    tx.get(adminDb.collection("jobs").doc(row.financePaidOccurrenceId)), tx.get(adminDb.collection("leads").doc(row.leadId)),
    loadTenantPipelineInTransaction(tx, row.tenantId), tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(id)),
  ]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [sourceRead, leadRead, pipelineRead, eventRead] = reads;
  if (sourceRead.status !== "fulfilled" || leadRead.status !== "fulfilled" || pipelineRead.status !== "fulfilled" || eventRead.status !== "fulfilled") throw new Error("CRM_STAGE_FINANCE_STAGE_READ_INVALID");
  const source = sourceRead.value.data(), lead = leadRead.value.data(), pipeline = pipelineRead.value, event = eventRead.value.data();
  if (!source || ![FINANCE_PAID_JOB_TYPE, BILLING_PAID_JOB_TYPE, "crm_asaas_lead_payment"].includes(source.type) || source.tenantId !== row.tenantId || source.leadId !== row.leadId || source.financeId !== row.financeId ||
      source.sourceEventId !== row.sourceEventId || source.actorId !== row.actorId || !source.createdAt?.isEqual?.(row.createdAt)) throw new Error("CRM_STAGE_FINANCE_STAGE_SOURCE_CHANGED");
  await assertFinancePaymentAuthority(tx, source, row.financePaidOccurrenceId);
  const ownStage = lead && lead.crmFieldOwnership?.pipelineStage?.source === "stage_automation" && await assertStageCrmProjection(tx, { source: row, sourceId: id, lead, field: "pipelineStage" });
  if (!lead || lead.tenantId !== row.tenantId || isCrmFieldManuallyOwned(lead, "pipelineStage") ||
      !ownStage && (normalizePipelineStageId(lead.pipelineStage || lead.stage) !== row.nextStage || lead.crmFieldOwnership?.pipelineStage?.transitionId !== id) ||
      pipeline.version !== row.pipelineVersion || !pipeline.stages.some(stage => stage.id === row.nextStage) ||
      !event || event.tenantId !== row.tenantId || event.transitionId !== id || event.financePaidOccurrenceId !== row.financePaidOccurrenceId ||
      event.outcome !== "applied" || event.previousStage !== row.previousStage || event.nextStage !== row.nextStage || event.actorId !== row.actorId || !event.createdAt?.isEqual?.(row.createdAt)) throw new Error("CRM_STAGE_FINANCE_STAGE_AUTHORITY_CHANGED");
}
export async function assertFinanceStageAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  if (![input.id, input.tenantId, input.leadId].every(validId)) throw new Error("CRM_STAGE_FINANCE_STAGE_CONTEXT_INVALID");
  const snapshot = await tx.get(adminDb.collection("jobs").doc(input.id)), row = snapshot.data();
  if (!row || row.type !== FINANCE_STAGE_JOB_TYPE || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_FINANCE_STAGE_REVOKED");
  await assertAuthority(tx, row, input.id); return snapshot;
}
export async function processFinanceStageTransition(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("CRM_STAGE_FINANCE_STAGE_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== FINANCE_STAGE_JOB_TYPE || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) { tx.update(ref, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), lastError: "Etapa financeira interrompida; conferir recibos antes de retomar." }); return null; }
    if (current.status !== "ready" && !expired) return null;
    try {
      if (current.stageHookProgress !== undefined ? !readStageHookProgress(current) || !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("CRM_STAGE_HOOK_PROGRESS_INVALID");
      await assertAuthority(tx, current, id);
    }
    catch (error) {
      if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), lastError: "Fonte financeira, acesso ou decisao de etapa alterados." }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() }); return current;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertFinanceStageAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false, hookNeedsReview = false;
  try {
    await runPipelineStageSideEffects({ tenantId: row.tenantId, leadId: row.leadId, previousStage: row.previousStage, nextStage: row.nextStage,
      actorId: row.actorId, actorName: row.actorName, source: row.source || "finance_paid", strict: true, automationSource: { kind: "financeStage", id, token },
      metadata: { financeId: row.financeId, financePaidOccurrenceId: row.financePaidOccurrenceId, sourceEventId: row.sourceEventId, stageTransitionId: id },
      runHook,
    }); completed = true;
  } catch (error) { hookNeedsReview = stageHookErrorNeedsReview(error); }
  const finalized = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    const confirmed = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !confirmed && !hookNeedsReview && canResumeStageHooks(current);
    if (resumable) {
      try { await assertAuthority(tx, current, id); }
      catch (error) {
        if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
        resumable = false;
      }
    }
    tx.update(ref, { status: confirmed ? "done" : resumable ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
      completionMeaning: confirmed ? "finance_stage_hooks_completed_not_provider_delivery" : resumable ? "confirmed_hooks_preserved_idempotent_hook_pending" : "finance_stage_hooks_need_reconciliation" }); return confirmed;
  });
  return { processed: true, completed: finalized };
}
export async function processPendingFinanceStageTransitions(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => { let q = adminDb.collection("jobs").where("type", "==", FINANCE_STAGE_JOB_TYPE).where("status", "==", status); if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId); return q; };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const source of [...ready.docs, ...expired.docs]) {
    try { const result = await processFinanceStageTransition(source.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
