import { createHash, randomUUID } from "node:crypto";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertLeadCreationActor } from "@/lib/server/crm/intake-occurrence";
import { TenantAccessError } from "@/lib/server/tenant";
import { prepareFinanceStageDecision } from "@/lib/server/crm/finance-stage-transition";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

export const FINANCE_PAID_JOB_TYPE = "crm_finance_paid_occurrence";
export const BILLING_PAID_JOB_TYPE = "asaas_billing_paid_occurrence";
const PAID_JOB_TYPES = [FINANCE_PAID_JOB_TYPE, BILLING_PAID_JOB_TYPE];
export class FinanceMutationConflict extends Error {}
export function isPaidFinanceStatus(value: unknown) { return typeof value === "string" && ["pago", "paid", "recebido", "confirmado"].includes(value.trim().toLowerCase()); }
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/"); }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }
export function financeSnapshotSignature(row: FirebaseFirestore.DocumentData) {
  const date = row.dataPagamento;
  const normalizedDate = date && typeof date.toMillis === "function" ? date.toMillis() : date ?? null;
  return createHash("sha256").update(JSON.stringify([row.tenantId, row.leadId, row.valor ?? null, row.meioPagamento ?? null, normalizedDate])).digest("hex");
}

export async function commitManualFinanceMutation(input: {
  tenantId: string; financeId: string; expectedVersion: Timestamp; patch: FirebaseFirestore.DocumentData;
  changes: string[]; actorId: string; actorName: string;
}) {
  if (![input.tenantId, input.financeId, input.actorId].every(validId)) throw new FinanceMutationConflict("Contexto financeiro invalido.");
  const ref = adminDb.collection("financeiro").doc(input.financeId), eventId = adminDb.collection("jobs").doc().id;
  const id = `crm_finance_paid_${eventId}`;
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref), current = snapshot.data();
    if (!current || current.tenantId !== input.tenantId || !snapshot.updateTime?.isEqual(input.expectedVersion)) throw new FinanceMutationConflict("O lancamento mudou. Atualize antes de salvar.");
    const leadId = typeof current.leadId === "string" ? current.leadId.trim() : "";
    if (leadId && !validId(leadId)) throw new FinanceMutationConflict("Cliente do lancamento invalido.");
    const lead = leadId ? (await tx.get(adminDb.collection("leads").doc(leadId))).data() : null;
    if (leadId && (!validId(leadId) || !lead || lead.tenantId !== input.tenantId)) throw new FinanceMutationConflict("Cliente do lancamento mudou.");
    await assertLeadCreationActor(tx, input.tenantId, input.actorId, lead || {}, !leadId, "manage_commercial");
    const becamePaid = input.patch.status !== undefined && isPaidFinanceStatus(input.patch.status) && !isPaidFinanceStatus(current.status);
    const after = { ...current, ...input.patch }, paidId = becamePaid && leadId ? id : null;
    const stage = paidId && lead ? await prepareFinanceStageDecision(tx, { paidId, eventId, tenantId: input.tenantId, leadId, lead,
      financeId: input.financeId, financeStatus: after.status, actorId: input.actorId, actorName: input.actorName }) : null;
    tx.update(ref, { ...input.patch, ...(paidId ? { paidOccurrenceId: paidId, paidAuthority: "tenant_actor" } : {}) });
    if (leadId) tx.create(adminDb.collection("leads").doc(leadId).collection("events").doc(eventId), {
      tenantId: input.tenantId, type: "finance_updated", title: "Financeiro atualizado", detail: input.changes.join(" | "),
      financeId: input.financeId, actorId: input.actorId, actorName: input.actorName, previousFinanceStatus: current.status || null,
      paymentAuthority: "tenant_actor", financeStatus: after.status ?? null, financeValue: after.valor ?? null, financeFingerprint: financeSnapshotSignature(after),
      financePaidOccurrenceId: paidId, createdAt: FieldValue.serverTimestamp() });
    if (paidId) tx.create(adminDb.collection("jobs").doc(paidId), {
      tenantId: input.tenantId, type: FINANCE_PAID_JOB_TYPE, protocolVersion: 1, financeId: input.financeId, leadId,
      sourceEventId: eventId, sourceFingerprint: financeSnapshotSignature(after), actorId: input.actorId, actorName: input.actorName,
      authority: "tenant_actor", status: "ready", attempts: 0,
      completionMeaning: "payment_record_and_stage_decision_committed_hooks_pending",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (stage) {
      const leadRef = adminDb.collection("leads").doc(leadId);
      if (Object.keys(stage.patch).length) tx.update(leadRef, stage.patch);
      if (stage.root.outcome === "applied") tx.update(leadRef, { "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false,
        transitionId: stage.id, sourceEventId: eventId, updatedAt: FieldValue.serverTimestamp() } });
      tx.create(leadRef.collection("events").doc(stage.id), stage.audit);
      tx.create(adminDb.collection("jobs").doc(stage.id), stage.root);
    }
    return { financePaidOccurrenceId: paidId, financeStageTransitionId: stage?.id || null, becamePaid, leadId };
  }).catch(error => {
    if (error instanceof Error && /^CRM_STAGE_CREATION_(ACTOR|CAPABILITY|ACCESS)_/.test(error.message)) throw new TenantAccessError("finance_authority_revoked", "Acesso ao lancamento foi revogado.");
    throw error;
  });
}

export async function assertFinancePaymentAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_FINANCE_HOOK_PROGRESS_INVALID");
  if (row.type === "crm_asaas_lead_payment") {
    const { assertAsaasLeadPaymentAuthority } = await import("@/lib/server/crm/asaas-lead-payment");
    await assertAsaasLeadPaymentAuthority(tx, row, id); return;
  }
  if (row.protocolVersion !== 1 || !PAID_JOB_TYPES.includes(row.type) || !["tenant_actor", "asaas_event"].includes(row.authority) || ![row.tenantId, row.leadId, row.financeId, row.sourceEventId, row.actorId].every(validId) || id !== `crm_finance_paid_${row.sourceEventId}`) throw new Error("CRM_STAGE_FINANCE_PROTOCOL_INVALID");
  if ((row.type === BILLING_PAID_JOB_TYPE) !== (row.paymentPurpose === "platform_billing") || row.type === BILLING_PAID_JOB_TYPE && row.authority !== "asaas_event") throw new Error("CRM_STAGE_FINANCE_BILLING_KIND_CHANGED");
  const reads = await Promise.allSettled([
    tx.get(adminDb.collection("financeiro").doc(row.financeId)), tx.get(adminDb.collection("leads").doc(row.leadId)),
    tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(row.sourceEventId)),
  ]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [financeRead, leadRead, eventRead] = reads;
  if (financeRead.status !== "fulfilled" || leadRead.status !== "fulfilled" || eventRead.status !== "fulfilled") throw new Error("CRM_STAGE_FINANCE_READ_INVALID");
  const finance = financeRead.value.data(), lead = leadRead.value.data(), event = eventRead.value.data();
  if (!finance || finance.tenantId !== row.tenantId || finance.leadId !== row.leadId || finance.paidOccurrenceId !== id || !isPaidFinanceStatus(finance.status) || financeSnapshotSignature(finance) !== row.sourceFingerprint ||
      !lead || lead.tenantId !== row.tenantId || !event || event.tenantId !== row.tenantId || event.type !== "finance_updated" ||
      event.financeId !== row.financeId || event.actorId !== row.actorId || event.financePaidOccurrenceId !== id || event.financeFingerprint !== row.sourceFingerprint ||
      !isPaidFinanceStatus(event.financeStatus) || isPaidFinanceStatus(event.previousFinanceStatus) || !event.createdAt?.isEqual?.(row.createdAt)) throw new Error("CRM_STAGE_FINANCE_AUTHORITY_CHANGED");
  if ((finance.paidAuthority || "tenant_actor") !== row.authority || (event.paymentAuthority || "tenant_actor") !== row.authority) throw new Error("CRM_STAGE_FINANCE_AUTHORITY_KIND_CHANGED");
  if (row.authority === "asaas_event" && ((finance.paidWorkflow || null) !== (row.paymentWorkflow || null) || (event.paymentWorkflow || null) !== (row.paymentWorkflow || null) ||
      row.paymentWorkflow && row.paymentWorkflow !== "stage_only")) throw new Error("CRM_STAGE_FINANCE_WORKFLOW_CHANGED");
  if (row.authority === "asaas_event" && ((finance.paymentPurpose || null) !== (row.paymentPurpose || null) || (event.paymentPurpose || null) !== (row.paymentPurpose || null) ||
      (finance.billingBindingFingerprint || null) !== (row.billingBindingFingerprint || null) || (event.billingBindingFingerprint || null) !== (row.billingBindingFingerprint || null))) throw new Error("CRM_STAGE_FINANCE_BILLING_PROOF_CHANGED");
  if (row.authority === "asaas_event") {
    if (event.sourceLedgerId !== row.sourceLedgerId || event.verifiedPaymentFingerprint !== row.verifiedPaymentFingerprint) throw new Error("CRM_STAGE_ASAAS_EVENT_PROOF_CHANGED");
    const { assertAsaasFinanceAuthority } = await import("@/lib/server/crm/asaas-finance-occurrence");
    await assertAsaasFinanceAuthority(tx, row, finance);
  } else await assertLeadCreationActor(tx, row.tenantId, row.actorId, lead, false, "manage_commercial");
}
export async function assertFinancePaidAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  if (![input.id, input.tenantId, input.leadId].every(validId)) throw new Error("CRM_STAGE_FINANCE_CONTEXT_INVALID");
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.paymentWorkflow === "stage_only" || !PAID_JOB_TYPES.includes(row.type) || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_FINANCE_SOURCE_REVOKED");
  await assertFinancePaymentAuthority(tx, row, input.id); return source;
}
export async function processFinancePaidOccurrence(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("CRM_STAGE_FINANCE_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || !PAID_JOB_TYPES.includes(current.type) || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) { tx.update(ref, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), lastError: "Automacao financeira interrompida; revisar recibos antes de retomar." }); return null; }
    if (current.status !== "ready" && !expired) return null;
    if (current.paymentWorkflow === "stage_only") {
      tx.update(ref, { status: "reconciliation_required", lastError: "Origem autoriza somente hooks da etapa; finance_paid nao autorizado.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    try {
      if (current.stageHookProgress !== undefined ? !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("CRM_STAGE_FINANCE_HOOK_PROGRESS_INVALID");
      await assertFinancePaymentAuthority(tx, current, id);
    }
    catch (error) {
      if (!(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), lastError: "Lancamento, origem ou acesso alterados." }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() }); return current;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertFinancePaidAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false, needsReview = false;
  try {
    const { runLeadAutomations } = await import("@/lib/server/automations");
    await runHook("automations", () => runLeadAutomations({ tenantId: row.tenantId, leadId: row.leadId, trigger: "finance_paid", actorId: row.actorId, actorName: row.actorName,
      strictErrors: true, stageSource: { kind: row.type === BILLING_PAID_JOB_TYPE ? "billing" : "finance", id, token } })); completed = true;
  } catch (error) { needsReview = stageHookErrorNeedsReview(error); }
  const finalized = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    const confirmed = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !confirmed && !needsReview && canResumeStageHooks(current);
    if (resumable) { try { await assertFinancePaymentAuthority(tx, current, id); } catch (error) { if (!stageHookErrorNeedsReview(error)) throw error; resumable = false; } }
    tx.update(ref, { status: confirmed ? "done" : resumable ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(), completionMeaning: confirmed ? "finance_paid_automation_registered_not_stage_or_provider_delivery" : resumable ? "finance_paid_receipts_preserved_automation_pending" : "finance_paid_partial_actions_need_reconciliation" }); return confirmed;
  });
  return { processed: true, completed: finalized };
}
export async function processPendingFinancePaidOccurrences(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => { let q = adminDb.collection("jobs").where("type", "in", PAID_JOB_TYPES).where("status", "==", status); if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId); return q; };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const source of [...ready.docs, ...expired.docs]) {
    try { const result = await processFinancePaidOccurrence(source.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
