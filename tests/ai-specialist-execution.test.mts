import assert from "node:assert/strict";
import test from "node:test";
import { compileAiRoleOperatingContract } from "../lib/server/ai/role-operating-contract.ts";
import { superviseAiSpecialist } from "../lib/server/ai/specialist-supervisor.ts";
import {
  compileAiSpecialistExecutionContract,
  validateAiSpecialistOutput,
} from "../lib/server/ai/specialist-execution.ts";

function supervisor(role: string, message: string) {
  return superviseAiSpecialist({
    tenantId: "tenant-a",
    chatId: "chat-a",
    messageId: "message-a",
    configuredRole: role,
    inboundText: message,
    runtimeState: null,
    leadMemory: null,
  });
}

function roleContract(role: string, complete = true) {
  return compileAiRoleOperatingContract({
    tenantId: "tenant-a",
    role,
    businessSummary: complete ? "Empresa de servicos digitais" : "",
    objective: complete ? "Atender e orientar clientes" : "",
    idealCustomer: complete ? "Empresas com operacao digital" : "",
    mandatoryQuestions: complete ? ["Qual resultado quer melhorar?"] : [],
    hasVerifiedOffers: complete,
    proposalStyle: complete ? "Proposta consultiva documentada" : "",
    escalationTopics: complete ? ["pedido humano"] : [],
  });
}

test("contrato tipado libera ferramentas diferentes por especialista", () => {
  const closerSupervisor = supervisor("closer", "Quero fechar hoje");
  const closer = compileAiSpecialistExecutionContract({
    supervisor: closerSupervisor,
    roleContract: roleContract("closer"),
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  const supportSupervisor = supervisor("support", "Meu acesso nao funciona");
  const support = compileAiSpecialistExecutionContract({
    supervisor: supportSupervisor,
    roleContract: roleContract("support"),
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  assert.ok(closer.allowedTools.includes("proposal_prepare"));
  assert.ok(closer.allowedTools.includes("checkout_prepare"));
  assert.ok(!support.allowedTools.includes("proposal_prepare"));
  assert.ok(support.allowedTools.includes("support_context"));
});

test("modo restrito remove toda ferramenta mutavel", () => {
  const contract = compileAiSpecialistExecutionContract({
    supervisor: supervisor("closer", "Quero fechar hoje"),
    roleContract: roleContract("closer", false),
    autonomyMode: "autonomous",
    tenantContextConfigured: true,
  });
  assert.equal(contract.mutatingToolsAllowed, false);
  assert.ok(!contract.allowedTools.includes("checkout_prepare"));
  assert.ok(!contract.allowedTools.includes("proposal_prepare"));
});

test("saida que pede ferramenta proibida e restringida antes da execucao", () => {
  const contract = compileAiSpecialistExecutionContract({
    supervisor: supervisor("support", "Meu acesso nao funciona"),
    roleContract: roleContract("support"),
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  const validation = validateAiSpecialistOutput({
    contract,
    result: {
      decision: "respond",
      responseText: "Vou preparar uma proposta para voce.",
      nextAction: "preparar_proposta_comercial",
    },
  });
  assert.equal(validation.accepted, false);
  assert.ok(validation.blockedReasons.includes("tool_not_allowed:proposal_prepare"));
  assert.equal(validation.nextAction, null);
});

test("falha e pedido humano caem em comportamento seguro", () => {
  const humanSupervisor = supervisor("sales", "Quero falar com um humano");
  const contract = compileAiSpecialistExecutionContract({
    supervisor: humanSupervisor,
    roleContract: roleContract("sales"),
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  const missing = validateAiSpecialistOutput({ contract, result: null });
  assert.equal(missing.status, "fallback_required");
  assert.equal(missing.decision, "handoff");

  const disobeyed = validateAiSpecialistOutput({
    contract,
    result: { decision: "respond", responseText: "Posso continuar por aqui?" },
  });
  assert.equal(disobeyed.decision, "handoff");
  assert.ok(disobeyed.blockedReasons.includes("human_handoff_not_respected"));
});

test("formato reparavel segue para o compositor final sem descartar a resposta", () => {
  const contract = compileAiSpecialistExecutionContract({
    supervisor: supervisor("sales", "Quero entender melhor"),
    roleContract: roleContract("sales"),
    autonomyMode: "hybrid",
    tenantContextConfigured: true,
  });
  const validation = validateAiSpecialistOutput({
    contract,
    result: { decision: "respond", responseText: "Qual seu setor? Qual seu volume?" },
  });
  assert.equal(validation.accepted, true);
  assert.equal(validation.status, "accepted");
});
