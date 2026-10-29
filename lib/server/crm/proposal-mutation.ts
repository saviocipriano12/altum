import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, type TenantMembership } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
import { runLeadAutomations, prepareProposalApprovalAutomations } from "@/lib/server/automations";
import { assertProposalCrmProjection, assertStageCrmProjection } from "@/lib/server/crm/proposal-crm-proof";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

const jobType = "crm_proposal_mutation";
const statuses = new Set(["Rascunho", "Enviado", "Aprovado", "Perdido"]);
function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 180 && value === value.trim() && !value.includes("/"); }
function money(value: unknown) { if (value == null || value === "") return null; const parsed = Number(value); return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null; }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }
function conflict(message: string): never { throw new RouteAuthError(409, "PROPOSAL_MUTATION_CONFLICT", message); }
function invalid(message: string): never { throw new RouteAuthError(400, "INVALID_PROPOSAL_MUTATION", message); }

/** Core records share a commit. The jobs record tracks later hooks, not a
 * confirmation that a provider delivered a message or received a payment. */
export async function commitProposalMutation(input: {
  tenantId: string; budgetId: string; body: Record<string, unknown>; membership: TenantMembership; actorId: string; actorName: string;
}) {
  if (![input.tenantId, input.budgetId].every(validId)) invalid("Proposta invalida.");
  if (input.membership.tenantId !== input.tenantId || input.membership.userId !== input.actorId) invalid("Contexto comercial invalido.");
  assertTenantCapability(input.membership, "manage_commercial");
  const body = input.body;
  if (body.expectedRevision !== undefined && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0)) invalid("Revisao da proposta invalida.");
  if (body.status !== undefined && !statuses.has(clean(body.status, 40))) invalid("Status de proposta invalido.");
  if (body.titulo !== undefined && !clean(body.titulo)) invalid("Informe o titulo da proposta.");
  if (body.valorTotal !== undefined && body.valorTotal !== null && body.valorTotal !== "" &&
      (money(body.valorTotal) === null || Number(body.valorTotal) < 0 || Number(body.valorTotal) > 1_000_000_000)) invalid("Valor de proposta invalido.");
  const ref = adminDb.collection("orcamentos").doc(input.budgetId);
  return adminDb.runTransaction(async tx => {
    const budget = (await tx.get(ref)).data();
    if (!budget) throw new RouteAuthError(404, "proposal_not_found", "Proposta nao encontrada.");
    if (budget.tenantId !== input.tenantId) throw new RouteAuthError(403, "proposal_company_mismatch", "Proposta fora desta empresa.");
    if (!validId(budget.leadId)) conflict("Proposta sem cliente valido; revise o vinculo.");
    const leadRef = adminDb.collection("leads").doc(budget.leadId), lead = (await tx.get(leadRef)).data();
    if (!lead || lead.tenantId !== input.tenantId) throw new RouteAuthError(403, "proposal_lead_forbidden", "Cliente fora desta empresa ou excluido.");
    assertAssignedCommercialRecordAccess(input.membership, input.actorId, lead);
    const currentRevision = Number(budget.revision || 0);
    if (!Number.isSafeInteger(currentRevision) || currentRevision < 0) conflict("Revisao historica invalida; solicite revisao.");
    const patch: Record<string, unknown> = {};
    for (const [field, max] of [["titulo", 180], ["resumo", 4000], ["validade", 40]] as const) {
      if (body[field] !== undefined && clean(body[field], max) !== clean(budget[field], max)) patch[field] = clean(body[field], max) || null;
    }
    if (body.valorTotal !== undefined && money(body.valorTotal) !== money(budget.valorTotal)) patch.valorTotal = money(body.valorTotal);
    if (body.status !== undefined && clean(body.status, 40) !== budget.status) patch.status = clean(body.status, 40);
    if (!Object.keys(patch).length) return { unchanged: true, revision: currentRevision, mutationId: clean(budget.lastMutationId) || null };
    if (body.expectedRevision !== undefined && body.expectedRevision !== currentRevision) conflict("A proposta mudou. Atualize antes de salvar novamente.");
    const revision = currentRevision + 1, id = `budget_mutation_${createHash("sha256").update(JSON.stringify([input.tenantId, input.budgetId, revision])).digest("hex")}`;
    const jobRef = adminDb.collection("jobs").doc(id), next = { ...budget, ...patch };
    let financeId: string | null = null, financeCreate: Record<string, unknown> | null = null;
    const approved = patch.status === "Aprovado";
    if (approved || (budget.status === "Aprovado" && patch.valorTotal !== undefined)) {
      const matches = await tx.get(adminDb.collection("financeiro").where("tenantId", "==", input.tenantId).where("orcamentoId", "==", input.budgetId).limit(2));
      if (matches.size > 1) conflict("Ha lancamentos duplicados desta proposta. Concilie antes de aprovar.");
      const stableId = `budget_revenue_${createHash("sha256").update(JSON.stringify([input.tenantId, input.budgetId])).digest("hex")}`;
      const stable = await tx.get(adminDb.collection("financeiro").doc(stableId));
      if (stable.exists && (stable.data()?.tenantId !== input.tenantId || stable.data()?.orcamentoId !== input.budgetId)) conflict("Identidade financeira divergente; solicite revisao.");
      if (!matches.empty && stable.exists && matches.docs[0].id !== stable.id) conflict("Lancamentos financeiros conflitantes; concilie antes de continuar.");
      const existing = matches.docs[0] || (stable.exists ? stable : null), value = money(next.valorTotal);
      if (value === null || value < 0) conflict("Informe um valor valido antes da aprovacao financeira.");
      if (existing) {
        const financial = existing.data()!;
        if ((financial.leadId && financial.leadId !== budget.leadId) || financial.status === "cancelado" || money(financial.valor) !== value) conflict("A proposta diverge do financeiro. Concilie o lancamento existente antes de continuar.");
        financeId = existing.id;
      } else if (approved) {
        financeId = stableId;
        financeCreate = { tenantId: input.tenantId, tipo: "Receita", categoria: "Orcamento aprovado", status: "pendente", valor: value,
          descricao: clean(next.titulo) || "Receita comercial", clientId: input.tenantId, clientName: clean(budget.clientName),
          leadId: budget.leadId, leadName: clean(budget.leadName) || clean(lead.nome), ownerId: clean(budget.ownerId) || input.actorId,
          owner: clean(budget.owner) || input.actorName, orcamentoId: input.budgetId, orcamentoTitulo: clean(next.titulo), referencia: `budget:${input.budgetId}`,
          vencimento: clean(next.validade, 40) || null, createdBy: input.actorId, createdByName: input.actorName,
          sourceMutationId: id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      }
    }
    const previousStage = clean(lead.pipelineStage || lead.stage) || null;
    const requestedStage = patch.status === "Aprovado" ? "ganho" : patch.status === "Enviado" ? "proposta" : patch.status === "Perdido" ? "perdido" : null;
    let pipelineVersion: string | null = null, knownTarget = false;
    if (requestedStage) {
      try { const pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId); pipelineVersion = pipeline.version; knownTarget = pipeline.stages.some(stage => stage.id === requestedStage); }
      catch (error) { if (!(error instanceof TenantPipelineConfigurationError)) throw error; }
    }
    const stageOutcome = !requestedStage ? "not_requested" : isCrmFieldManuallyOwned(lead, "pipelineStage") ? "blocked_manual"
      : !knownTarget ? "blocked_pipeline" : previousStage === requestedStage ? "unchanged" : "applied";
    const nextStage = stageOutcome === "applied" ? requestedStage : previousStage;
    const stageTransition = { stageOutcome, previousStage, nextStage, requestedStage, pipelineVersion };
    const before = Object.fromEntries(Object.keys(patch).map(field => [field, budget[field] ?? null]));
    tx.update(ref, { ...patch, revision, lastMutationId: id, updatedBy: input.actorId, updatedByName: input.actorName, updatedAt: FieldValue.serverTimestamp() });
    if (financeCreate && financeId) tx.create(adminDb.collection("financeiro").doc(financeId), financeCreate);
    if (stageOutcome === "applied") tx.update(leadRef, { pipelineStage: nextStage, stage: nextStage, stageUpdatedAt: FieldValue.serverTimestamp(),
      ...(nextStage === "ganho" && !lead.wonAt ? { wonAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp(),
      "crmFieldOwnership.pipelineStage": { source: "system_event", locked: false, transitionId: id, budgetId: input.budgetId, actorId: input.actorId, updatedAt: FieldValue.serverTimestamp() } });
    tx.create(leadRef.collection("events").doc(id), { tenantId: input.tenantId, type: "budget_updated", title: "Proposta atualizada", budgetId: input.budgetId,
      mutationId: id, revision, before, after: patch, ...stageTransition, financeId, actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp() });
    tx.create(jobRef, { type: jobType, protocolVersion: 1, tenantId: input.tenantId, leadId: budget.leadId, budgetId: input.budgetId, revision,
      budgetStatus: next.status, budgetValue: money(next.valorTotal), actorId: input.actorId, actorName: input.actorName, ownerAtCommit: clean(lead.ownerId || lead.assignedTo),
      manualStageAtCommit: isCrmFieldManuallyOwned(lead, "pipelineStage"), financeId, ...stageTransition, approved,
      status: approved || stageOutcome === "applied" ? "ready" : "done", attempts: 0,
      completionMeaning: approved || stageOutcome === "applied" ? "records_committed_hooks_pending" : "internal_records_committed_no_hooks",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { unchanged: false, revision, mutationId: id };
  });
}

async function membershipFor(row: FirebaseFirestore.DocumentData) {
  const membership = await assertTenantAccess(row.actorId, row.tenantId);
  assertTenantCapability(membership, "manage_commercial"); await assertTenantModule(row.tenantId, "crm"); return membership;
}
async function assertHookAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string, membership: TenantMembership) {
  if (row.protocolVersion !== 1 || ![row.tenantId, row.leadId, row.budgetId].every(validId) || row.actorId !== membership.userId || row.tenantId !== membership.tenantId) throw new Error("PROPOSAL_AUTHORITY_INVALID");
  if (row.stageHookProgress !== undefined) {
    const progress = readStageHookProgress(row);
    if (!progress || row.approved && progress.steps.find(step => step.name === "automations")?.status === "done" &&
        (row.automationApprovalProtocol !== 1 || !Array.isArray(row.automationApprovalPlans))) throw new Error("PROPOSAL_APPROVAL_PLAN_MISSING");
  }
  if (row.stageRunRecoveryProtocol === 2 && row.approved === true) {
    const { readStageApprovalCandidates } = await import("@/lib/server/automation-proposal-delivery");
    readStageApprovalCandidates(row);
  }
  const budget = (await tx.get(adminDb.collection("orcamentos").doc(row.budgetId))).data();
  const lead = (await tx.get(adminDb.collection("leads").doc(row.leadId))).data();
  const ownStage = lead && lead.tenantId === row.tenantId && await (lead.crmFieldOwnership?.pipelineStage?.source === "stage_automation"
    ? assertStageCrmProjection : assertProposalCrmProjection)(tx, { source: row, sourceId: id, lead, field: "pipelineStage" });
  if (!budget || budget.tenantId !== row.tenantId || budget.leadId !== row.leadId || budget.revision !== row.revision || budget.lastMutationId !== id || budget.status !== row.budgetStatus ||
      money(budget.valorTotal) !== row.budgetValue || !lead || lead.tenantId !== row.tenantId || (!ownStage && clean(lead.pipelineStage || lead.stage) !== (row.nextStage || "")) ||
      clean(lead.ownerId || lead.assignedTo) !== row.ownerAtCommit || isCrmFieldManuallyOwned(lead, "pipelineStage") !== row.manualStageAtCommit) throw new Error("PROPOSAL_AUTHORITY_CHANGED");
  assertAssignedCommercialRecordAccess(membership, row.actorId, lead);
  if (!ownStage && row.stageOutcome === "applied" && lead.crmFieldOwnership?.pipelineStage?.transitionId !== id) throw new Error("PROPOSAL_STAGE_REPLACED");
  if (row.pipelineVersion) { const pipeline = await loadTenantPipelineInTransaction(tx, row.tenantId); if (pipeline.version !== row.pipelineVersion) throw new Error("PROPOSAL_FUNNEL_CHANGED"); }
  if (row.financeId) {
    const financial = (await tx.get(adminDb.collection("financeiro").doc(row.financeId))).data();
    if (!financial || financial.tenantId !== row.tenantId || financial.orcamentoId !== row.budgetId || financial.status === "cancelado" || money(financial.valor) !== row.budgetValue) throw new Error("PROPOSAL_FINANCE_CHANGED");
  }
}

/** Shared source authority for accepting and delivering automation outbox work. */
async function assertProposalMutationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}, stage: boolean) {
  if (!validId(input.id)) throw new Error("PROPOSAL_AUTOMATION_SOURCE_INVALID");
  const snapshot = await tx.get(adminDb.collection("jobs").doc(input.id)), row = snapshot.data();
  if (!row || row.type !== jobType || row.tenantId !== input.tenantId || row.leadId !== input.leadId || (stage ? row.stageOutcome !== "applied" : row.approved !== true) ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) {
    throw new Error("PROPOSAL_AUTOMATION_SOURCE_REVOKED");
  }
  await assertHookAuthority(tx, row, input.id, await membershipFor(row));
  return snapshot;
}

export function assertProposalAutomationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}) { return assertProposalMutationSource(tx, input, false); }

export function assertProposalStageAutomationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}) { return assertProposalMutationSource(tx, input, true); }

/** Ready work may recover. Once legacy hooks start, uncertainty is reconciled,
 * never reset to ready for blind repetition. */
export async function processProposalMutation(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("PROPOSAL_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), initial = (await ref.get()).data();
  if (!initial || initial.type !== jobType || (tenantId && initial.tenantId !== tenantId)) return { processed: false };
  const membership = await membershipFor(initial).catch(error => {
    if (!(error instanceof TenantAccessError)) throw error;
    return null;
  }), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== jobType || (tenantId && current.tenantId !== tenantId)) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) {
      tx.update(ref, { status: "reconciliation_required", lastError: "Efeitos iniciados sem confirmacao; conferir antes de repetir.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    if (current.status !== "ready" && !expired) return null;
    try {
      if (current.stageHookProgress !== undefined ? !readStageHookProgress(current) || !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("PROPOSAL_HOOK_PROGRESS_INVALID");
      if (!membership) throw new Error("PROPOSAL_ACCESS_REVOKED"); await assertHookAuthority(tx, current, id, membership);
    }
    catch (error) {
      if (!(error instanceof TenantAccessError) && !(error instanceof TenantPipelineConfigurationError) &&
          !(error instanceof Error && error.message.startsWith("PROPOSAL_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", lastError: "Proposta, acesso, funil ou decisao humana mudaram.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() }); return current;
  });
  if (!row) return { processed: false };
  const executeHook = createStageHookRunner({ ref, authorize: (tx, name) => (name === "approval" ? assertProposalAutomationSource : assertProposalStageAutomationSource)(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  const runHook: ReturnType<typeof createStageHookRunner> = (name, effect) => executeHook(name, async () => {
    await effect();
    if (name === "automations" && row.approved) await prepareProposalApprovalAutomations({ tenantId: row.tenantId, leadId: row.leadId, trigger: "budget_approved",
      actorId: row.actorId, actorName: row.actorName, proposalClaim: { id, token } });
  });
  let completed = false, hookNeedsReview = false;
  try {
    if (row.stageOutcome === "applied") await runPipelineStageSideEffects({ tenantId: row.tenantId, leadId: row.leadId, previousStage: row.previousStage || "", nextStage: row.nextStage,
      actorId: row.actorId, actorName: row.actorName, source: "budget_status_update", metadata: { budgetId: row.budgetId, budgetStatus: row.budgetStatus, budgetValue: row.budgetValue, mutationId: id },
      automationSource: { kind: "proposal", id, token }, strict: true, runHook });
    if (row.approved) await runHook("approval", () => runLeadAutomations({ tenantId: row.tenantId, trigger: "budget_approved", leadId: row.leadId, actorId: row.actorId, actorName: row.actorName, strictErrors: true, proposalClaim: { id, token } }));
    completed = true;
  } catch (error) { hookNeedsReview = stageHookErrorNeedsReview(error) || error instanceof TenantAccessError || error instanceof TenantPipelineConfigurationError; }
  const confirmed = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    const success = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !success && !hookNeedsReview && canResumeStageHooks(current);
    if (resumable) {
      try { await assertHookAuthority(tx, current, id, await membershipFor(current)); }
      catch (error) {
        if (!(error instanceof TenantAccessError) && !(error instanceof TenantPipelineConfigurationError) && !stageHookErrorNeedsReview(error)) throw error;
        resumable = false;
      }
    }
    tx.update(ref, { status: success ? "done" : resumable ? "ready" : "reconciliation_required", completionMeaning: success ? "hooks_completed_not_provider_delivery" : resumable ? "confirmed_hooks_preserved_idempotent_hook_pending" : "records_committed_hooks_need_reconciliation",
      lastError: success ? "" : resumable ? "Hook idempotente pendente; retomar pelo consumidor existente." : "Efeitos iniciados sem confirmacao integral; conferir antes de repetir.", updatedAt: FieldValue.serverTimestamp() }); return success;
  });
  return { processed: true, completed: confirmed };
}

export async function processPendingProposalMutations(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => {
    let scoped = adminDb.collection("jobs").where("type", "==", jobType).where("status", "==", status);
    if (input?.tenantId) scoped = scoped.where("tenantId", "==", input.tenantId); return scoped;
  };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil", "asc").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const doc of [...ready.docs, ...expired.docs]) {
    try {
      const result = await processProposalMutation(doc.id, input?.tenantId);
      if (result.processed) processed++;
      if ("completed" in result && result.completed) completed++;
    } catch {
      // A failed pre-claim read must not consume the occurrence or starve the
      // other ready jobs. Started work still obeys its existing reconciliation.
      failed++;
    }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
