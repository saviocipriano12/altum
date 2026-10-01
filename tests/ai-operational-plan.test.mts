import test from "node:test";
import assert from "node:assert/strict";
import { deriveOperationalPlan } from "../lib/server/ai/operational-plan.ts";
import {
  assistantRoleAllowsProactiveClosing,
  assistantRoleInstruction,
  assistantRoleUsesCommercialFunnel,
  normalizeAltumAssistantRole,
} from "../lib/ai-assistant-role.ts";

function buildInput(overrides: Record<string, unknown> = {}) {
  return {
    inboundText: "Quero entender melhor",
    messageType: "text",
    choice: {
      decision: "respond" as const,
      reason: "model_decision",
      confidence: 0.9,
      nextAction: "aprofundar_oportunidade",
      ledBy: "llm" as const,
    },
    llmDecision: "respond" as const,
    llmReason: "model_decision",
    llmConfidence: 0.9,
    llmTurnGoal: "responder e avancar",
    runtimeState: null,
    leadMemory: null,
    extractedFields: null,
    conversation: [],
    kbDocs: [],
    tenantAi: {
      escalationTopics: [],
      playbookOffers: [],
      learningHints: null,
    },
    ...overrides,
  };
}

test("audio transcrito preserva intencao de proposta", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Gostei. Pode preparar e me mandar uma proposta?",
      messageType: "audio",
      extractedFields: {
        businessType: "escritorio de advocacia",
        primaryGoal: "captar clientes pelo Google",
        budgetBand: "ate 3 mil",
      },
    })
  );

  assert.equal(plan.intent, "proposal_interest");
  assert.equal(plan.nextAction, "preparar_proposta_comercial");
  assert.equal(plan.stateAfter, "proposal_path");
  assert.equal(plan.commercialTemperature, "hot");
});

test("audio transcrito preserva intencao de reuniao", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Quero marcar uma reuniao com voces amanha",
      messageType: "audio",
    })
  );

  assert.equal(plan.intent, "meeting_interest");
  assert.equal(plan.nextAction, "agendar_proximo_passo");
  assert.equal(plan.stateAfter, "scheduling");
});

test("audio transcrito com pedido humano gera handoff", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Quero falar com uma pessoa do comercial",
      messageType: "audio",
    })
  );

  assert.equal(plan.intent, "request_human");
  assert.equal(plan.decision, "handoff");
  assert.equal(plan.nextAction, "assumir_handoff_humano");
});

test("audio sem transcricao util continua como mensagem multimodal", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Audio recebido",
      messageType: "audio",
    })
  );

  assert.equal(plan.intent, "send_audio");
  assert.equal(plan.nextAction, "aprofundar_oportunidade");
});

test("contexto de disparo preserva a oferta enviada", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Pode me mostrar um exemplo?",
      leadMemory: {
        tenantId: "tenant-1",
        leadId: "lead-1",
        campaignOfferName: "Landing page para advogados",
        campaignOfferSummary: "Pagina para captar contatos pelo Google",
        campaignExampleUrl: "https://example.com/lp",
      },
      extractedFields: {
        serviceInterest: "consultoria generica",
      },
    })
  );

  assert.equal(plan.recommendedOffer, "Landing page para advogados");
});

test("aprendizado reaproveita oferta somente quando ela continua no catalogo ativo", () => {
  const tenantAi = {
    escalationTopics: [],
    playbookOffers: [],
    learningHints: {
      hasData: true,
      topOffers: ["Landing Page"],
      topActions: [],
      topObjections: [],
      preferredClosingMotion: null,
    },
  };
  const plan = deriveOperationalPlan(
    buildInput({
      tenantAi,
      kbDocs: [{ id: "catalog-1", type: "catalog", content: "Oferta: Landing Page", tags: [], score: 0.9 }],
    })
  );

  assert.equal(plan.recommendedOffer, "Landing Page");

  const removedOfferPlan = deriveOperationalPlan(
    buildInput({
      tenantAi,
      kbDocs: [{ id: "catalog-2", type: "catalog", content: "Oferta: CRM Comercial", tags: [], score: 0.9 }],
    })
  );
  assert.equal(removedOfferPlan.recommendedOffer, null);
});

test("tema configurado como sensivel sempre escala para humano", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Quero cancelar e pedir reembolso",
      tenantAi: {
        escalationTopics: ["reembolso"],
        playbookOffers: [],
        learningHints: null,
      },
    })
  );

  assert.equal(plan.decision, "handoff");
  assert.equal(plan.responseGoal, "handoff");
  assert.equal(plan.nextAction, "assumir_handoff_humano");
});

test("pedido de proposta escala quando este criterio comercial foi estruturado", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Quero uma proposta para apresentar ao meu socio.",
      tenantAi: {
        escalationTopics: ["proposta"],
        playbookOffers: [],
        learningHints: null,
      },
    })
  );

  assert.equal(plan.decision, "handoff");
  assert.equal(plan.nextAction, "assumir_handoff_humano");
});

test("intencao de fechamento respeita negocio de agendamento", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Gostei dessa opcao",
      llmTurnGoal: "fechar a venda",
      tenantAi: { escalationTopics: [], playbookOffers: [], learningHints: null, salesMotion: "appointment" },
    })
  );

  assert.equal(plan.nextAction, "oferecer_horarios_disponiveis");
});

test("intencao de fechamento respeita compra direta", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Essa opcao serve para mim",
      llmTurnGoal: "avancar para fechar",
      tenantAi: { escalationTopics: [], playbookOffers: [], learningHints: null, salesMotion: "direct_checkout" },
    })
  );

  assert.equal(plan.nextAction, "enviar_checkout_e_concluir_compra");
});

test("papel da IA e normalizado com fallback seguro", () => {
  assert.equal(normalizeAltumAssistantRole("support"), "support");
  assert.equal(normalizeAltumAssistantRole("qualquer_coisa"), "sales");
  assert.equal(assistantRoleAllowsProactiveClosing("sales"), true);
  assert.equal(assistantRoleAllowsProactiveClosing("support"), false);
  assert.equal(assistantRoleUsesCommercialFunnel("support"), false);
  assert.equal(assistantRoleUsesCommercialFunnel("consultant"), true);
  assert.match(assistantRoleInstruction("support"), /Nao faça prospeccao/i);
});

test("suporte nao inicia fechamento sem pedido do cliente", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Ainda estou com problema para acessar",
      llmTurnGoal: "avancar para fechar",
      tenantAi: {
        escalationTopics: [],
        playbookOffers: [],
        learningHints: null,
        salesMotion: "direct_checkout",
        assistantRole: "support",
      },
    })
  );

  assert.equal(plan.responseGoal, "clarify");
  assert.notEqual(plan.nextAction, "enviar_checkout_e_concluir_compra");
});

test("suporte nao cai em qualificacao comercial quando o provedor pede discovery", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Meu acesso parou de funcionar",
      llmTurnGoal: "qualify discovery",
      tenantAi: {
        escalationTopics: [],
        playbookOffers: [],
        learningHints: null,
        assistantRole: "support",
      },
    })
  );

  assert.equal(plan.responseGoal, "clarify");
  assert.notEqual(plan.nextAction, "qualificar_contexto_minimo");
});

test("papel consultivo respeita pedido explicito de proposta", () => {
  const plan = deriveOperationalPlan(
    buildInput({
      inboundText: "Pode preparar uma proposta?",
      llmTurnGoal: "preparar proposta",
      tenantAi: {
        escalationTopics: [],
        playbookOffers: [],
        learningHints: null,
        assistantRole: "consultant",
      },
    })
  );

  assert.equal(plan.intent, "proposal_interest");
  assert.equal(plan.responseGoal, "move_to_next_step");
  assert.equal(plan.nextAction, "preparar_proposta_comercial");
});
