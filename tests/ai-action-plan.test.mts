import assert from "node:assert/strict";
import test from "node:test";
import { AI_ACTION_TOOL_CONTRACTS, compileAiActionPlan, actionPlanAllows } from "../lib/server/ai/action-plan.ts";
import { compileAiRoleOperatingContract } from "../lib/server/ai/role-operating-contract.ts";
import { compileAiSpecialistExecutionContract } from "../lib/server/ai/specialist-execution.ts";
import { superviseAiSpecialist } from "../lib/server/ai/specialist-supervisor.ts";

function specialist(autonomyMode: "copilot" | "hybrid" | "autonomous") {
  const supervisor = superviseAiSpecialist({
    tenantId: "tenant-a",
    chatId: "chat-a",
    messageId: "message-a",
    configuredRole: "closer",
    inboundText: "Quero fechar hoje.",
    runtimeState: null,
    leadMemory: null,
  });
  const roleContract = compileAiRoleOperatingContract({
    tenantId: "tenant-a",
    role: "closer",
    businessSummary: "Empresa de servicos digitais",
    objective: "Atender e vender com seguranca",
    idealCustomer: "Empresas com atendimento digital",
    mandatoryQuestions: ["Qual objetivo?"],
    hasVerifiedOffers: true,
    proposalStyle: "Condicoes documentadas",
    escalationTopics: ["pedido humano"],
  });
  return compileAiSpecialistExecutionContract({
    supervisor,
    roleContract,
    autonomyMode,
    tenantContextConfigured: true,
  });
}

const planner = {
  decision: "respond" as const,
  reason: "ready",
  confidence: 0.92,
  stateBefore: "qualification" as const,
  stateAfter: "proposal_path" as const,
  responseGoal: "move_to_next_step" as const,
  intent: "purchase_interest",
  objectionType: null,
  commercialTemperature: "hot" as const,
  nextQuestion: null,
  nextAction: "enviar_checkout_e_concluir_compra",
  recommendedOffer: "Oferta verificada",
};

function plan(autonomyMode: "copilot" | "hybrid" | "autonomous", overrides: Record<string, unknown> = {}) {
  return compileAiActionPlan({
    tenantId: "tenant-a",
    chatId: "chat-a",
    messageId: "message-a",
    leadId: "lead-a",
    autonomyMode,
    specialist: specialist(autonomyMode),
    planner,
    tenantContextConfigured: true,
    extractedFieldKeys: ["businessType", "primaryGoal"],
    confirmedFactKeys: ["businessType"],
    verifiedOffer: true,
    explicitPurchaseIntent: true,
    ...overrides,
  });
}

test("niveis de autonomia alteram de fato quais passos podem executar", () => {
  const copilot = plan("copilot");
  const hybrid = plan("hybrid");
  const autonomous = plan("autonomous");
  assert.equal(actionPlanAllows(copilot, "update_crm_context"), false);
  assert.equal(copilot.steps.find((step) => step.kind === "update_crm_context")?.authorization, "approval_required");
  assert.equal(actionPlanAllows(hybrid, "update_crm_context"), true);
  assert.equal(actionPlanAllows(hybrid, "move_pipeline_stage"), false);
  assert.equal(actionPlanAllows(autonomous, "move_pipeline_stage"), true);
});

test("checkout permanece sujeito a aprovacao mesmo no modo autonomo", () => {
  const autonomous = plan("autonomous");
  const checkout = autonomous.steps.find((step) => step.kind === "prepare_checkout");
  assert.equal(checkout?.authorization, "approval_required");
  assert.equal(checkout?.risk, "critical");
  assert.match(checkout?.authorizationReason || "", /financial/);
});

test("checkout sem intencao ou oferta verificada e bloqueado", () => {
  const blocked = plan("autonomous", { verifiedOffer: false, explicitPurchaseIntent: false });
  const checkout = blocked.steps.find((step) => step.kind === "prepare_checkout");
  assert.equal(checkout?.authorization, "blocked");
});

test("modo sombra bloqueia todo efeito e chaves sao idempotentes e isoladas", () => {
  const shadow = plan("autonomous", { shadowMode: true });
  assert.ok(shadow.steps.every((step) => step.authorization === "blocked"));
  const replay = plan("autonomous");
  const otherTenant = compileAiActionPlan({
    tenantId: "tenant-b",
    chatId: "chat-a",
    messageId: "message-a",
    leadId: "lead-a",
    autonomyMode: "autonomous",
    specialist: specialist("autonomous"),
    planner,
    tenantContextConfigured: true,
    extractedFieldKeys: ["businessType", "primaryGoal"],
    verifiedOffer: true,
    explicitPurchaseIntent: true,
  });
  assert.equal(plan("autonomous").fingerprint, replay.fingerprint);
  assert.notEqual(replay.steps[0]?.idempotencyKey, otherTenant.steps[0]?.idempotencyKey);
});

test("handoff de seguranca continua executavel em copilot", () => {
  const handoff = compileAiActionPlan({
    tenantId: "tenant-a",
    chatId: "chat-a",
    messageId: "handoff-message",
    leadId: "lead-a",
    autonomyMode: "copilot",
    specialist: specialist("copilot"),
    planner: { ...planner, decision: "handoff", stateAfter: "handoff", nextAction: "assumir_handoff_humano" },
    tenantContextConfigured: true,
  });
  assert.equal(actionPlanAllows(handoff, "create_handoff_task"), true);
});

test("dado financeiro sensivel bloqueia qualquer automacao comercial", () => {
  const sensitive = plan("autonomous", { sensitiveDataDetected: true });
  assert.ok(sensitive.steps.every((step) => step.authorization === "blocked"));
  assert.ok(sensitive.steps.every((step) => step.authorizationReason === "sensitive_data_no_automation"));
  assert.ok(sensitive.gaps.includes("sensitive_data_detected"));
});

test("cada ferramenta declara entrada, saida, mutacao e efeito externo", () => {
  for (const contract of Object.values(AI_ACTION_TOOL_CONTRACTS)) {
    assert.ok(contract.inputFields.includes("tenantId"));
    assert.ok(contract.inputFields.length >= 3);
    assert.ok(contract.outputFields.length >= 2);
    assert.equal(typeof contract.mutatesState, "boolean");
    assert.equal(typeof contract.externalSideEffect, "boolean");
  }
  assert.equal(AI_ACTION_TOOL_CONTRACTS.prepare_checkout.requiresHumanApproval, true);
  assert.equal(AI_ACTION_TOOL_CONTRACTS.prepare_checkout.externalSideEffect, true);
});
