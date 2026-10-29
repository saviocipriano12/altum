import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { deriveEcommerceOrderJourney } from "@/lib/ecommerce-journey";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
import { isCrmFieldManuallyOwned, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { assertStageCrmProjection } from "@/lib/server/crm/proposal-crm-proof";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

type OrderSource = { id: string; connectionId: string; orderId: string };
export type StageTransitionInput = {
  tenantId: string; leadId: string; nextStage: string; actorId?: string | null; actorName?: string | null;
  source?: string; metadata?: Record<string, unknown>; patch?: Record<string, unknown>;
  skipConversionDispatch?: boolean; orderSource?: OrderSource;
};
const jobType = "crm_order_stage_transition";
function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function opaqueId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim(); }
function validId(value: unknown): value is string { return opaqueId(value) && !value.includes("/"); }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }

/** Persisted webhook/sync event, not an order ID invented by the caller/model. */
async function orderAuthority(tx: FirebaseFirestore.Transaction, tenantId: string, source: OrderSource) {
  if (![tenantId, source?.id, source?.connectionId].every(validId) || !opaqueId(source?.orderId)) throw new Error("CRM_STAGE_SOURCE_INVALID");
  const [event, connection] = await Promise.all([tx.get(adminDb.collection("ecommerce_events").doc(source.id)),
    tx.get(adminDb.collection("ecommerce_connections").doc(source.connectionId))]);
  const data = event.data(), account = connection.data(), order = data?.normalized?.order;
  if (!data || data.tenantId !== tenantId || data.connectionId !== source.connectionId || data.provider !== "shopify" ||
      !opaqueId(data.externalEventId) || !order || order.externalOrderId !== source.orderId ||
      !account || account.tenantId !== tenantId || account.provider !== "shopify" || account.status !== "active") throw new Error("CRM_STAGE_SOURCE_REVOKED");
  const journey = deriveEcommerceOrderJourney(order);
  const fingerprint = createHash("sha256").update(JSON.stringify([source.id, source.connectionId, source.orderId, data.externalEventId, order.status ?? null,
    order.paymentStatus ?? null, order.fulfillmentStatus ?? null, Boolean(order.trackingCode || order.trackingUrl), journey.state])).digest("hex");
  return { journey, fingerprint };
}

export function protectedStagePatch(input: Record<string, unknown> | undefined, lead: Record<string, unknown>) {
  const patch = { ...(input || {}) };
  for (const key of ["tenantId", "crmFieldOwnership", "pipelineStage", "stage", "stageUpdatedAt", "wonAt"]) delete patch[key];
  for (const field of ownedCrmFields) if (isCrmFieldManuallyOwned(lead, field)) delete patch[field];
  if (lead.scoreSource === "manual") { delete patch.score; delete patch.scoreSource; }
  return patch;
}

/** Mutation, audit and pending downstream work share the same Firestore commit.
 * This boundary is used by the real producer; tests may stop before consumption. */
export async function commitOrderPipelineTransition(input: StageTransitionInput & { orderSource: OrderSource }) {
  if (![input.tenantId, input.leadId].every(validId) || !clean(input.nextStage)) throw new Error("CRM_STAGE_CONTEXT_INVALID");
  const id = `crm_stage_${createHash("sha256").update(JSON.stringify([input.tenantId, input.orderSource.id, "order_pipeline"])).digest("hex")}`;
  const ref = adminDb.collection("jobs").doc(id), leadRef = adminDb.collection("leads").doc(input.leadId);
  return adminDb.runTransaction(async tx => {
    const [snapshot, existing, authority] = await Promise.all([tx.get(leadRef), tx.get(ref), orderAuthority(tx, input.tenantId, input.orderSource)]);
    const lead = snapshot.data(), target = normalizePipelineStageId(input.nextStage);
    if (!lead || lead.tenantId !== input.tenantId || authority.journey.pipelineStage !== target) throw new Error("CRM_STAGE_DESTINATION_INVALID");
    if (existing.exists) {
      const row = existing.data()!;
      if (row.type !== jobType || row.protocolVersion !== 1 || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
          row.sourceFingerprint !== authority.fingerprint || row.requestedStage !== target || row.skipConversionDispatch !== (input.skipConversionDispatch === true)) throw new Error("CRM_STAGE_RECEIPT_CONFLICT");
      return { id, replayed: true, outcome: String(row.outcome), previousStage: String(row.previousStage), nextStage: String(row.nextStage) };
    }
    let pipelineVersion: string | null = null, knownTarget = false;
    try {
      const pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId);
      pipelineVersion = pipeline.version; knownTarget = pipeline.stages.some(stage => stage.id === target);
    } catch (error) {
      // Only actual configuration defects can freeze a blocked decision.
      // Storage failures must abort admission without writing a false receipt.
      if (!(error instanceof TenantPipelineConfigurationError)) throw error;
    }
    const previousStage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
    const outcome = isCrmFieldManuallyOwned(lead, "pipelineStage") ? "blocked_manual"
      : !knownTarget ? "blocked_pipeline" : target === "ganho" && !authority.journey.paid ? "blocked_unconfirmed_purchase"
      : previousStage === target ? "unchanged" : "applied";
    const nextStage = outcome === "applied" ? target : previousStage;
    const patch = protectedStagePatch(input.patch, lead);
    if (outcome === "applied") Object.assign(patch, { pipelineStage: target, stage: target, stageUpdatedAt: FieldValue.serverTimestamp(),
      ...(target === "ganho" && !lead.wonAt ? { wonAt: FieldValue.serverTimestamp() } : {}) });
    if (Object.keys(patch).length) tx.set(leadRef, { ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (outcome === "applied") tx.update(leadRef, { "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false,
      transitionId: id, sourceEventId: input.orderSource.id, updatedAt: FieldValue.serverTimestamp() } });
    tx.create(leadRef.collection("events").doc(id), { tenantId: input.tenantId, type: "crm_order_stage_evaluated",
      title: outcome === "applied" ? "Pedido atualizou etapa" : "Pedido preservou etapa do CRM", previousStage, nextStage, requestedStage: target,
      outcome, transitionId: id, sourceEventId: input.orderSource.id, connectionId: input.orderSource.connectionId,
      actorId: clean(input.actorId) || "ecommerce_webhook", actorName: clean(input.actorName) || "Ecommerce", createdAt: FieldValue.serverTimestamp() });
    tx.create(ref, { type: jobType, protocolVersion: 1, tenantId: input.tenantId, leadId: input.leadId, orderSource: input.orderSource,
      sourceFingerprint: authority.fingerprint, pipelineVersion, previousStage, nextStage, requestedStage: target, outcome,
      status: outcome === "applied" ? "ready" : "done", skipConversionDispatch: input.skipConversionDispatch === true,
      actorId: clean(input.actorId) || "ecommerce_webhook", actorName: clean(input.actorName) || "Ecommerce",
      source: clean(input.source, 120) || "ecommerce_order", attempts: 0,
      completionMeaning: outcome === "applied" ? "crm_committed_hooks_pending" : "crm_evaluated_no_stage_hooks",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { id, replayed: false, outcome, previousStage, nextStage };
  });
}

async function assertJobAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  const reads = await Promise.allSettled([tx.get(adminDb.collection("leads").doc(row.leadId)),
    orderAuthority(tx, row.tenantId, row.orderSource), loadTenantPipelineInTransaction(tx, row.tenantId)]);
  // A caller may write the reconciliation result after an authorization error.
  // Finish nested pipeline/source reads first; never write while another read
  // chain is still running in this Firestore transaction.
  const [leadRead, authorityRead, pipelineRead] = reads;
  if (leadRead.status === "rejected") throw leadRead.reason;
  if (authorityRead.status === "rejected") throw authorityRead.reason;
  if (pipelineRead.status === "rejected") throw pipelineRead.reason;
  const lead = leadRead.value, authority = authorityRead.value, pipeline = pipelineRead.value;
  const data = lead.data();
  const ownStage = data && data.tenantId === row.tenantId && data.crmFieldOwnership?.pipelineStage?.source === "stage_automation" &&
    await assertStageCrmProjection(tx, { source: row, sourceId: id, lead: data, field: "pipelineStage" });
  if (!data || data.tenantId !== row.tenantId || !ownStage && (normalizePipelineStageId(data.pipelineStage || data.stage) !== row.nextStage ||
      data.crmFieldOwnership?.pipelineStage?.transitionId !== id) || isCrmFieldManuallyOwned(data, "pipelineStage") ||
      authority.fingerprint !== row.sourceFingerprint || pipeline.version !== row.pipelineVersion ||
      !pipeline.stages.some(stage => stage.id === row.nextStage)) throw new Error("CRM_STAGE_AUTHORITY_CHANGED");
}

export async function assertOrderStageAutomationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}) {
  if (![input.id, input.tenantId, input.leadId].every(validId)) throw new Error("CRM_STAGE_SOURCE_INVALID");
  const snapshot = await tx.get(adminDb.collection("jobs").doc(input.id)), row = snapshot.data();
  if (!row || row.type !== jobType || row.protocolVersion !== 1 || row.outcome !== "applied" || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_SOURCE_REVOKED");
  await assertJobAuthority(tx, row, input.id);
  return snapshot;
}

export async function processOrderPipelineTransition(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("CRM_STAGE_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const data = (await tx.get(ref)).data();
    if (!data || data.type !== jobType || (tenantId && data.tenantId !== tenantId)) return null;
    const expired = data.status === "processing" && millis(data.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(data)) {
      tx.update(ref, { status: "reconciliation_required", lastError: "Interrupcao apos inicio dos efeitos; conferir antes de repetir.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    if (data.status !== "ready" && !expired) return null;
    try {
      if (data.protocolVersion !== 1 || data.outcome !== "applied" || ![data.tenantId, data.leadId].every(validId)) throw new Error("CRM_STAGE_PROTOCOL_INVALID");
      if (data.stageHookProgress !== undefined ? !readStageHookProgress(data) || !canResumeStageHooks(data) : !canInitializeStageHooks(data)) throw new Error("CRM_STAGE_HOOK_PROGRESS_INVALID");
      await assertJobAuthority(tx, data, id);
    } catch (error) {
      if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", lastError: "Fonte, funil ou decisao humana mudaram antes dos efeitos.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(data.attempts || 0) + 1,
      ...(data.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(data) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() }); return data;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertOrderStageAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false;
  let hookNeedsReview = false;
  try {
    await runPipelineStageSideEffects({ tenantId: row.tenantId, leadId: row.leadId, previousStage: row.previousStage, nextStage: row.nextStage,
      actorId: row.actorId, actorName: row.actorName, source: row.source, skipConversionDispatch: row.skipConversionDispatch,
      metadata: { stageTransitionId: id, sourceEventId: row.orderSource.id, connectionId: row.orderSource.connectionId, orderId: row.orderSource.orderId },
      automationSource: { kind: "order", id, token }, strict: true, runHook,
    }); completed = true;
  } catch (error) {
    hookNeedsReview = stageHookErrorNeedsReview(error);
    // Unknown automation/provider effects remain quarantined by their running
    // checkpoint; only an intact idempotent hook can be resumed below.
  }
  const finalized = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.claimToken !== token || current.status !== "processing") return false;
    const progress = readStageHookProgress(current);
    const confirmed = completed && progress?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !confirmed && !hookNeedsReview && canResumeStageHooks(current);
    if (resumable) {
      try { await assertJobAuthority(tx, current, id); }
      catch (error) {
        if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
        resumable = false;
      }
    }
    tx.update(ref, { status: confirmed ? "done" : resumable ? "ready" : "reconciliation_required",
      completionMeaning: confirmed ? "stage_hooks_completed_not_provider_delivery" : resumable ? "confirmed_hooks_preserved_idempotent_hook_pending" : "crm_committed_hooks_need_reconciliation",
      lastError: confirmed ? "" : resumable ? "Hook idempotente pendente; retomar pelo consumidor existente." : "Efeitos iniciados sem confirmacao integral; conferir recibos antes de retomar.", updatedAt: FieldValue.serverTimestamp() });
    return confirmed;
  });
  return { processed: true, completed: finalized };
}

/** Consumed by the existing periodic automation processor, not a second cron. */
export async function processPendingOrderPipelineTransitions(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => {
    let scoped = adminDb.collection("jobs").where("type", "==", jobType).where("status", "==", status);
    if (input?.tenantId) scoped = scoped.where("tenantId", "==", input.tenantId); return scoped;
  };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(),
    query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil", "asc").limit(limit).get()]);
  let completed = 0, processed = 0, failed = 0;
  for (const doc of [...ready.docs, ...expired.docs]) {
    try {
      const result = await processOrderPipelineTransition(doc.id, input?.tenantId);
      if (result.processed) processed++; if ("completed" in result && result.completed) completed++;
    } catch {
      // Isolate the occurrence without changing its durable state. Pre-claim
      // failures remain ready; a started effect still requires reconciliation.
      failed++;
    }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
