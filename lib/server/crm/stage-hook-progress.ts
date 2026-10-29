import { createHash } from "node:crypto";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";

export type StageHookName = "automations" | "learning" | "conversion" | "trail" | "approval";
type Progress = { version: 1 | 2; fingerprint: string; steps: { name: StageHookName; status: "pending" | "running" | "done" }[] };
export function newStageHookProgress(row: FirebaseFirestore.DocumentData): Progress {
  const next = normalizePipelineStageId(row.nextStage), proposal = row.type === "crm_proposal_mutation", names: StageHookName[] = [];
  const automationOnly = ["crm_manual_stage_transition", "crm_lead_created_occurrence", "crm_finance_paid_occurrence", "asaas_billing_paid_occurrence", "crm_ai_signal_occurrence", "crm_social_event_occurrence", "automation_waiting_reply_runtime"].includes(row.type);
  if (automationOnly) names.push("automations");
  else if (!proposal || row.stageOutcome === "applied") {
    names.push("automations", "learning");
    if (!row.skipConversionDispatch && ["qualificacao", "ganho"].includes(next)) names.push("conversion");
    if (["qualificacao", "proposta", "fechamento", "ganho"].includes(next)) names.push("trail");
  }
  if (proposal && row.approved === true) names.push("approval");
  const binding = [row.tenantId, row.leadId, row.previousStage, row.nextStage, row.actorId || null, row.actorName || null, row.source || null, row.skipConversionDispatch === true];
  if (proposal) binding.push(row.stageOutcome, row.approved === true);
  if (automationOnly) binding.push(row.type);
  if (row.type === "crm_ai_signal_occurrence") binding.push(row.sourceEventKey, row.aiNextAction);
  if (row.type === "crm_social_event_occurrence") binding.push(row.socialLogId, row.socialFingerprint);
  if (row.type === "automation_waiting_reply_runtime") binding.push(row.automationId, row.chatId, row.waitingKey);
  if (row.type === "automation_waiting_reply_runtime" && row.runtimeProtocolVersion === 4) binding.push(row.waitingPlanFingerprint);
  return { version: 2, fingerprint: createHash("sha256").update(JSON.stringify(binding)).digest("hex"), steps: names.map(name => ({ name, status: "pending" })) };
}
export function canInitializeStageHooks(row: FirebaseFirestore.DocumentData) {
  return row.stageHookProgress === undefined && Number(row.attempts || 0) === 0 && row.stageAutomationRuns === undefined && row.automationApprovalPlans === undefined;
}
export function readStageHookProgress(row: FirebaseFirestore.DocumentData): Progress | null {
  const progress = row.stageHookProgress, expected = newStageHookProgress(row);
  if (!progress || ![1, 2].includes(progress.version) || progress.fingerprint !== expected.fingerprint || !Array.isArray(progress.steps) || progress.steps.length !== expected.steps.length) return null;
  let unfinished = false;
  for (let i = 0; i < expected.steps.length; i++) {
    const step = progress.steps[i];
    if (!step || step.name !== expected.steps[i].name || !["pending", "running", "done"].includes(step.status) || unfinished && step.status !== "pending") return null;
    if (step.status !== "done") unfinished = true;
  }
  return progress as Progress;
}
export function canResumeStageHooks(row: FirebaseFirestore.DocumentData) {
  const progress = readStageHookProgress(row);
  if (!progress) return false;
  const active = progress.steps.find(step => step.status !== "done");
  // Automations and provider dispatch may have an uncertain external effect.
  // Only the two hooks with durable, idempotent commits may replay in flight.
  return !active || active.status === "pending" || ["learning", "trail"].includes(active.name) ||
    active.name === "automations" && Number(row.attempts) < 3 && canReplayStageAutomationHook(row) ||
    active.name === "approval" && Number(row.attempts) < 3 && canReplayApprovalReceiptHook(row);
}

/** Approval actions already commit through the proposal's receipt executors.
 * Only a manifest admitted with this capability may replay; never infer it for
 * historical plans or derive authority from the presence of a customer record. */
export function canReplayApprovalReceiptHook(row: FirebaseFirestore.DocumentData) {
  const progress = readStageHookProgress(row), active = progress?.steps.find(step => step.status !== "done");
  if (progress?.version !== 2 || active?.name !== "approval" || active.status !== "running" ||
      row.type !== "crm_proposal_mutation" || row.approved !== true || row.approvalReceiptRecoveryProtocol !== 1 ||
      row.automationApprovalProtocol !== 1 || !Number.isSafeInteger(row.attempts) || row.attempts < 1 || row.attempts > 3 ||
      !Array.isArray(row.automationApprovalPlans) || row.automationApprovalPlans.length > 120) return false;
  const ids = new Set<string>();
  return row.automationApprovalPlans.every(automation => {
    if (!automation || typeof automation.id !== "string" || !automation.id || ids.has(automation.id) ||
        automation.tenantId !== row.tenantId || automation.trigger !== "budget_approved" || !Array.isArray(automation.actions) ||
        automation.actions.length > 8 || !automation.actions.every(supportsReceiptBackedAutomationAction)) return false;
    ids.add(automation.id); return true;
  });
}

/** Only a newly admitted receipt-capable recipe may replay started actions.
 * Per-origin authority, live plans, quota and each receipt remain mandatory in
 * the existing executors; this predicate never authorizes an effect itself. */
export function canReplayStageAutomationHook(row: FirebaseFirestore.DocumentData) {
  const progress = readStageHookProgress(row), active = progress?.steps.find(step => step.status !== "done");
  if (progress?.version !== 2 || active?.name !== "automations" || active.status !== "running" || row.stageRunRecoveryProtocol !== 2 || row.stageAutomationProtocolVersion !== 1 || row.stageInternalEffectProtocolVersion !== 1 ||
      !Number.isSafeInteger(row.attempts) || row.attempts < 1 || row.attempts > 3 || !Array.isArray(row.stageAutomationPlans) || row.stageAutomationPlans.length > 120) return false;
  const ids = new Set<string>();
  for (const automation of row.stageAutomationPlans) {
    if (!automation || typeof automation.id !== "string" || !automation.id || ids.has(automation.id) || automation.tenantId !== row.tenantId ||
        !Array.isArray(automation.actions) || automation.actions.length > 8 || !automation.actions.every(supportsReceiptBackedAutomationAction)) return false;
    ids.add(automation.id);
  }
  if (row.type === "crm_proposal_mutation" && row.approved === true && (row.stageApprovalCandidateProtocol !== 1 ||
      typeof row.stageApprovalCandidateFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.stageApprovalCandidateFingerprint) ||
      (row.stageApprovalCandidatesClosed === true ? row.automationApprovalProtocol !== 1 || !Array.isArray(row.automationApprovalPlans) : !Array.isArray(row.stageApprovalCandidates)))) return false;
  return true;
}
