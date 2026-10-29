import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAltumAssistantRole } from "../lib/ai-assistant-role.ts";
import { deriveOperationalPlan } from "../lib/server/ai/operational-plan.ts";
import {
  compileAiRoleOperatingContract,
  roleAllowsOperationalAction,
} from "../lib/server/ai/role-operating-contract.ts";
import { compileTenantAiContext } from "../lib/server/ai/tenant-context.ts";

const complete = {
  tenantId: "tenant-a",
  businessSummary: "Plataforma comercial para pequenas empresas.",
  objective: "Conduzir cada contato ao proximo passo adequado.",
  idealCustomer: "Empresas com equipe comercial e atendimento digital.",
  mandatoryQuestions: ["Qual resultado precisa melhorar?"],
  hasVerifiedOffers: true,
  proposalStyle: "Confirmar escopo e condicoes documentadas antes do envio.",
  escalationTopics: ["desconto", "cancelamento"],
};

test("SDR, closer, consultor e suporte recebem capacidades realmente diferentes", () => {
  assert.equal(roleAllowsOperationalAction("sdr", "qualify_lead"), true);
  assert.equal(roleAllowsOperationalAction("sdr", "schedule_next_step"), true);
  assert.equal(roleAllowsOperationalAction("sdr", "prepare_proposal"), false);
  assert.equal(roleAllowsOperationalAction("sdr", "complete_purchase"), false);

  assert.equal(roleAllowsOperationalAction("closer", "prepare_proposal"), true);
  assert.equal(roleAllowsOperationalAction("closer", "handle_objection"), true);
  assert.equal(roleAllowsOperationalAction("closer", "complete_purchase"), true);
  assert.equal(roleAllowsOperationalAction("closer", "qualify_lead"), false);

  assert.equal(roleAllowsOperationalAction("consultant", "diagnose_need"), true);
  assert.equal(roleAllowsOperationalAction("consultant", "recommend_offer"), true);
  assert.equal(roleAllowsOperationalAction("consultant", "complete_purchase"), false);

  assert.equal(roleAllowsOperationalAction("support", "resolve_support"), true);
  assert.equal(roleAllowsOperationalAction("support", "request_evidence"), true);
  assert.equal(roleAllowsOperationalAction("support", "recommend_offer"), false);
});

test("closer e um papel de primeira classe e configuracao incompleta restringe autonomia", () => {
  assert.equal(normalizeAltumAssistantRole("closer"), "closer");
  const restricted = compileAiRoleOperatingContract({
    tenantId: "tenant-a",
    role: "closer",
    businessSummary: "Empresa de servicos.",
  });

  assert.equal(restricted.role, "closer");
  assert.equal(restricted.readiness, "restricted");
  assert.ok(restricted.missingSignals.includes("offer"));
  assert.ok(restricted.missingSignals.includes("proposal"));
  assert.match(restricted.prompt, /Modo restrito/);

  const ready = compileAiRoleOperatingContract({ ...complete, role: "closer" });
  assert.equal(ready.readiness, "ready");
  assert.deepEqual(ready.missingSignals, []);
});

test("fingerprint muda por tenant, papel e configuracao operacional", () => {
  const sdr = compileAiRoleOperatingContract({ ...complete, role: "sdr" });
  const same = compileAiRoleOperatingContract({ ...complete, role: "sdr" });
  const closer = compileAiRoleOperatingContract({ ...complete, role: "closer" });
  const otherTenant = compileAiRoleOperatingContract({ ...complete, tenantId: "tenant-b", role: "sdr" });

  assert.equal(sdr.fingerprint, same.fingerprint);
  assert.notEqual(sdr.fingerprint, closer.fingerprint);
  assert.notEqual(sdr.fingerprint, otherTenant.fingerprint);
});

test("contexto canonico incorpora contrato, papel efetivo e prontidao", () => {
  const context = compileTenantAiContext({
    tenantId: complete.tenantId,
    agentName: "Lia",
    assistantRole: "closer",
    businessSummary: complete.businessSummary,
    objective: complete.objective,
    toneOfVoice: "Direto e humano.",
    commercialBrain: {
      idealCustomer: complete.idealCustomer,
      proposalStyle: complete.proposalStyle,
    },
    guardrails: ["Nao inventar condicoes."],
    mandatoryQuestions: complete.mandatoryQuestions,
    escalationTopics: complete.escalationTopics,
    hasVerifiedOffers: true,
  });

  assert.equal(context.schemaVersion, "tenant-ai-context-v2");
  assert.equal(context.roleContract.role, "closer");
  assert.equal(context.diagnostics.roleReadiness, "ready");
  assert.match(context.policyPrompt, /objecao decisiva/i);
  assert.match(context.policyPrompt, /nao reiniciar qualificacao/i);
});

function planFor(role: "sdr" | "closer" | "support") {
  return deriveOperationalPlan({
    inboundText: "Quero uma proposta com as condicoes para decidir hoje",
    messageType: "text",
    choice: {
      decision: "respond",
      reason: "proposal_request",
      confidence: 0.9,
      nextAction: "advance",
      ledBy: "llm",
    },
    llmDecision: "respond",
    llmReason: "proposal_request",
    llmConfidence: 0.9,
    llmTurnGoal: "preparar proposta e avancar",
    runtimeState: null,
    leadMemory: null,
    extractedFields: null,
    conversation: [],
    kbDocs: [],
    tenantAi: {
      assistantRole: role,
      escalationTopics: [],
      playbookOffers: [],
      learningHints: null,
      salesMotion: "consultative",
    },
  });
}

test("a mesma intencao gera proximo passo diferente para SDR, closer e suporte", () => {
  const sdr = planFor("sdr");
  const closer = planFor("closer");
  const support = planFor("support");

  assert.equal(sdr.nextAction, "qualificar_e_encaminhar_para_closer");
  assert.equal(closer.nextAction, "preparar_proposta_comercial");
  assert.equal(support.nextAction, "encaminhar_pedido_de_proposta_com_contexto");
});

test("closer com configuracao incompleta nao executa proposta ou fechamento", () => {
  const restrictedContract = compileAiRoleOperatingContract({
    tenantId: "tenant-a",
    role: "closer",
    businessSummary: "Empresa de servicos.",
  });
  const base = planFor("closer");
  const restricted = deriveOperationalPlan({
    inboundText: "Quero a proposta final para contratar agora",
    messageType: "text",
    choice: {
      decision: "respond",
      reason: "proposal_request",
      confidence: 0.9,
      nextAction: "advance",
      ledBy: "llm",
    },
    llmDecision: "respond",
    llmReason: "proposal_request",
    llmConfidence: 0.9,
    llmTurnGoal: "preparar proposta e fechar",
    runtimeState: null,
    leadMemory: null,
    extractedFields: null,
    conversation: [],
    kbDocs: [],
    tenantAi: {
      assistantRole: "closer",
      escalationTopics: [],
      playbookOffers: [],
      learningHints: null,
      salesMotion: "consultative",
      roleContract: restrictedContract,
    },
  });

  assert.equal(base.nextAction, "preparar_proposta_comercial");
  assert.equal(restricted.responseGoal, "clarify");
  assert.equal(restricted.nextAction, "confirmar_configuracao_e_encaminhar_proposta");
});

test("intencao explicita de compra vence uma meta generica do modelo apenas para papel autorizado", () => {
  const make = (role: "sales" | "sdr") => deriveOperationalPlan({
    inboundText: "Quero contratar. Qual e o proximo passo?",
    messageType: "text",
    choice: { decision: "respond", reason: "ready", confidence: 0.9, nextAction: "advance", ledBy: "llm" },
    llmDecision: "respond",
    llmReason: "ready",
    llmConfidence: 0.9,
    llmTurnGoal: "esclarecer detalhes",
    runtimeState: null,
    leadMemory: null,
    extractedFields: null,
    conversation: [],
    kbDocs: [],
    tenantAi: { assistantRole: role, escalationTopics: [], playbookOffers: [], learningHints: null, salesMotion: "consultative" },
  });

  assert.equal(make("sales").responseGoal, "move_to_next_step");
  assert.equal(make("sdr").nextAction, "encaminhar_oportunidade_pronta_para_closer");
});
