import { createHash } from "node:crypto";
import type { AltumAiAutonomyMode } from "@/lib/server/ai/operating-layer";
import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";
import type { AiSpecialistExecutionContract, AiSpecialistToolFamily } from "@/lib/server/ai/specialist-execution";

export const AI_ACTION_PLAN_VERSION = "ai-action-plan-v1" as const;
export const AI_ACTION_TOOL_CONTRACT_VERSION = "ai-action-tool-contract-v1" as const;

export type AiActionKind =
  | "update_crm_context"
  | "move_pipeline_stage"
  | "create_follow_up"
  | "prepare_proposal_draft"
  | "prepare_checkout"
  | "create_handoff_task";
export type AiActionRisk = "low" | "medium" | "high" | "critical";
export type AiActionAuthorization = "ready" | "approval_required" | "blocked";

export type AiActionToolContract = {
  schemaVersion: typeof AI_ACTION_TOOL_CONTRACT_VERSION;
  inputFields: string[];
  outputFields: string[];
  mutatesState: boolean;
  externalSideEffect: boolean;
  requiresHumanApproval: boolean;
};

export const AI_ACTION_TOOL_CONTRACTS: Record<AiActionKind, AiActionToolContract> = {
  update_crm_context: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "evidence"], outputFields: ["changedFields", "updatedAt"], mutatesState: true, externalSideEffect: false, requiresHumanApproval: false },
  move_pipeline_stage: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "fromStage", "toStage"], outputFields: ["previousStage", "appliedStage", "eventId"], mutatesState: true, externalSideEffect: false, requiresHumanApproval: false },
  create_follow_up: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "dueAt", "reasonCode"], outputFields: ["taskId", "dueAt", "dedupeKey"], mutatesState: true, externalSideEffect: false, requiresHumanApproval: false },
  prepare_proposal_draft: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "verifiedOfferId", "scope"], outputFields: ["draftId", "status", "approvalId"], mutatesState: true, externalSideEffect: false, requiresHumanApproval: true },
  prepare_checkout: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "verifiedOfferId", "explicitIntent"], outputFields: ["approvalId", "checkoutUrl", "offerId"], mutatesState: true, externalSideEffect: true, requiresHumanApproval: true },
  create_handoff_task: { schemaVersion: AI_ACTION_TOOL_CONTRACT_VERSION, inputFields: ["tenantId", "leadId", "reason"], outputFields: ["taskId", "notificationId"], mutatesState: true, externalSideEffect: false, requiresHumanApproval: false },
};

export type AiActionPlanStep = {
  id: string;
  kind: AiActionKind;
  tool: AiSpecialistToolFamily;
  risk: AiActionRisk;
  authorization: AiActionAuthorization;
  authorizationReason: string;
  idempotencyKey: string;
  preconditions: string[];
  expectedEvidence: string[];
  compensation: string;
  toolContract: AiActionToolContract;
};

export type AiActionPlan = {
  schemaVersion: typeof AI_ACTION_PLAN_VERSION;
  tenantId: string;
  chatId: string;
  messageId: string;
  leadId: string | null;
  autonomyMode: AltumAiAutonomyMode;
  objective: string;
  factsUsed: string[];
  gaps: string[];
  steps: AiActionPlanStep[];
  executionMode: "no_actions" | "execute_ready" | "approval_required" | "blocked";
  fingerprint: string;
};

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function actionKey(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  kind: AiActionKind;
  index: number;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ version: AI_ACTION_PLAN_VERSION, ...input }))
    .digest("hex")
    .slice(0, 36);
}

function requiredAuthorization(input: {
  kind: AiActionKind;
  tool: AiSpecialistToolFamily;
  risk: AiActionRisk;
  autonomyMode: AltumAiAutonomyMode;
  specialist: AiSpecialistExecutionContract;
  tenantContextConfigured: boolean;
  shadowMode: boolean;
  explicitPurchaseIntent: boolean;
  verifiedOffer: boolean;
  sensitiveDataDetected: boolean;
}) {
  if (input.shadowMode) return { authorization: "blocked" as const, reason: "shadow_mode_no_side_effects" };
  if (!input.tenantContextConfigured) return { authorization: "blocked" as const, reason: "tenant_context_not_configured" };
  if (input.sensitiveDataDetected && input.kind !== "create_handoff_task") {
    return { authorization: "blocked" as const, reason: "sensitive_data_no_automation" };
  }
  if (input.kind === "prepare_checkout") {
    if (!input.verifiedOffer || !input.explicitPurchaseIntent) {
      return { authorization: "blocked" as const, reason: "checkout_without_verified_offer_or_intent" };
    }
    return { authorization: "approval_required" as const, reason: "financial_action_requires_approval" };
  }
  if (input.kind === "prepare_proposal_draft") {
    return { authorization: "approval_required" as const, reason: "contractual_draft_requires_review" };
  }
  if (input.kind === "create_handoff_task") {
    return { authorization: "ready" as const, reason: "safety_handoff" };
  }
  if (input.autonomyMode === "copilot") {
    return { authorization: "approval_required" as const, reason: "copilot_never_executes_mutation" };
  }
  if (!input.specialist.allowedTools.includes(input.tool)) {
    return { authorization: "blocked" as const, reason: `tool_not_allowed:${input.tool}` };
  }
  if (input.kind === "move_pipeline_stage" || input.kind === "create_follow_up") {
    return input.autonomyMode === "autonomous"
      ? { authorization: "ready" as const, reason: "autonomous_low_or_medium_risk" }
      : { authorization: "approval_required" as const, reason: "hybrid_requires_workflow_approval" };
  }
  return input.specialist.mutatingToolsAllowed
    ? { authorization: "ready" as const, reason: "role_tenant_and_autonomy_authorized" }
    : { authorization: "approval_required" as const, reason: "mutation_not_authorized" };
}

function contains(value: unknown, pattern: RegExp) {
  return pattern.test(clean(value, 220).toLowerCase());
}

export function compileAiActionPlan(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  leadId?: string | null;
  autonomyMode: AltumAiAutonomyMode;
  specialist: AiSpecialistExecutionContract;
  planner: AltumPlannerDecision;
  tenantContextConfigured: boolean;
  shadowMode?: boolean;
  extractedFieldKeys?: string[];
  confirmedFactKeys?: string[];
  verifiedOffer?: boolean;
  explicitPurchaseIntent?: boolean;
  sensitiveDataDetected?: boolean;
}) {
  const leadId = clean(input.leadId, 160) || null;
  const candidates: Array<{
    kind: AiActionKind;
    tool: AiSpecialistToolFamily;
    risk: AiActionRisk;
    preconditions: string[];
    evidence: string[];
    compensation: string;
  }> = [];

  if (input.planner.decision === "handoff" || input.planner.stateAfter === "handoff") {
    candidates.push({
      kind: "create_handoff_task",
      tool: "human_handoff",
      risk: "low",
      preconditions: ["lead vinculado", "motivo de handoff registrado"],
      evidence: ["taskId ou tarefa pendente equivalente", "notificacao interna registrada"],
      compensation: "cancelar tarefa somente se o handoff for assumido ou invalidado por humano",
    });
  } else if (leadId) {
    candidates.push({
      kind: "update_crm_context",
      tool: "crm_write",
      risk: "low",
      preconditions: ["lead pertence ao tenant", "memoria e evidencias limitadas a este turno"],
      evidence: ["campos gravados", "timestamp e fonte registrados"],
      compensation: "restaurar valor anterior preservado na evidencia do campo",
    });
    if (input.planner.stateBefore !== input.planner.stateAfter) {
      candidates.push({
        kind: "move_pipeline_stage",
        tool: "crm_write",
        risk: "medium",
        preconditions: ["transicao progressiva valida", "confianca minima", "lead pertence ao tenant"],
        evidence: ["etapa anterior", "etapa aplicada", "evento de pipeline"],
        compensation: "reverter para etapa anterior usando evento de compensacao",
      });
    }
    if (contains(input.planner.nextAction, /(follow|retorno|acompanhar|lembrar|agendar|reuniao|diagnostico|objecao|proximo_passo)/)) {
      candidates.push({
        kind: "create_follow_up",
        tool: "crm_write",
        risk: "medium",
        preconditions: ["prazo calculado", "nenhum follow-up equivalente pendente"],
        evidence: ["taskId", "dueAt", "dedupeKey"],
        compensation: "cancelar tarefa pendente criada por esta chave idempotente",
      });
    }
    if (contains(input.planner.nextAction, /(proposta|orcamento)/)) {
      candidates.push({
        kind: "prepare_proposal_draft",
        tool: "proposal_prepare",
        risk: "high",
        preconditions: ["oferta verificada", "escopo e condicoes documentados"],
        evidence: ["draftId", "status draft", "fonte das condicoes"],
        compensation: "arquivar rascunho nao enviado",
      });
    }
    if (contains(input.planner.nextAction, /(checkout|pagamento|concluir_compra)/)) {
      candidates.push({
        kind: "prepare_checkout",
        tool: "checkout_prepare",
        risk: "critical",
        preconditions: ["intencao explicita", "oferta e disponibilidade verificadas", "aprovacao humana"],
        evidence: ["approvalId", "offerId", "checkoutUrl oficial"],
        compensation: "invalidar checkout ainda nao utilizado",
      });
    }
  }

  const steps = candidates.map((candidate, index): AiActionPlanStep => {
    const authorization = requiredAuthorization({
      kind: candidate.kind,
      tool: candidate.tool,
      risk: candidate.risk,
      autonomyMode: input.autonomyMode,
      specialist: input.specialist,
      tenantContextConfigured: input.tenantContextConfigured,
      shadowMode: input.shadowMode === true,
      explicitPurchaseIntent: input.explicitPurchaseIntent === true,
      verifiedOffer: input.verifiedOffer === true,
      sensitiveDataDetected: input.sensitiveDataDetected === true,
    });
    return {
      id: `${candidate.kind}_${index + 1}`,
      kind: candidate.kind,
      tool: candidate.tool,
      risk: candidate.risk,
      authorization: authorization.authorization,
      authorizationReason: authorization.reason,
      idempotencyKey: actionKey({
        tenantId: input.tenantId,
        chatId: input.chatId,
        messageId: input.messageId,
        kind: candidate.kind,
        index,
      }),
      preconditions: candidate.preconditions,
      expectedEvidence: candidate.evidence,
      compensation: candidate.compensation,
      toolContract: AI_ACTION_TOOL_CONTRACTS[candidate.kind],
    };
  });
  const executionMode = !steps.length
    ? "no_actions"
    : steps.some((step) => step.authorization === "ready")
      ? "execute_ready"
      : steps.some((step) => step.authorization === "approval_required")
        ? "approval_required"
        : "blocked";
  const objective = clean(input.planner.nextAction || input.planner.responseGoal || input.planner.intent, 180) || "responder_com_seguranca";
  const factsUsed = Array.from(new Set([...(input.confirmedFactKeys || []), ...(input.extractedFieldKeys || [])])).slice(0, 24);
  const gaps = [
    !leadId ? "lead_not_linked" : "",
    !input.tenantContextConfigured ? "tenant_context_not_configured" : "",
    input.specialist.mutatingToolsAllowed ? "" : "mutation_authority_missing",
    input.sensitiveDataDetected ? "sensitive_data_detected" : "",
  ].filter(Boolean);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: AI_ACTION_PLAN_VERSION,
      tenantId: input.tenantId,
      chatId: input.chatId,
      messageId: input.messageId,
      autonomyMode: input.autonomyMode,
      objective,
      factsUsed,
      gaps,
      steps,
    }))
    .digest("hex")
    .slice(0, 32);
  return {
    schemaVersion: AI_ACTION_PLAN_VERSION,
    tenantId: input.tenantId,
    chatId: input.chatId,
    messageId: input.messageId,
    leadId,
    autonomyMode: input.autonomyMode,
    objective,
    factsUsed,
    gaps,
    steps,
    executionMode,
    fingerprint,
  } satisfies AiActionPlan;
}

export function actionPlanAllows(plan: AiActionPlan, kind: AiActionKind) {
  return plan.steps.some((step) => step.kind === kind && step.authorization === "ready");
}
