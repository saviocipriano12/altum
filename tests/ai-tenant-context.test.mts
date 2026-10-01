import assert from "node:assert/strict";
import test from "node:test";
import { buildConversationAgentPrompt } from "../lib/server/ai/router.ts";
import {
  compileTenantAiContext,
  deriveHandoffTopicsFromCommercialCriteria,
  resolveConfiguredFollowUpDelayHours,
} from "../lib/server/ai/tenant-context.ts";
import { enforceCommercialOutboundRestrictions, parseAiConfig } from "../lib/server/ai/agent.ts";

const input = {
  tenantId: "tenant-test",
  agentName: "Lia",
  assistantRole: "consultant" as const,
  businessSummary: "Consultoria comercial para pequenas empresas.",
  objective: "Entender o momento do cliente antes de recomendar uma solucao.",
  toneOfVoice: "Natural, direta e acolhedora.",
  commercialBrain: {
    idealCustomer: "Empresas que precisam organizar captacao e vendas.",
    diagnosisStyle: "Comece pela dor relatada e investigue uma variavel por vez.",
    forbiddenSalesMoves: "Nao empurre uma oferta antes de entender o contexto.",
  },
  guardrails: Array.from({ length: 12 }, (_, index) => `Regra configurada ${index + 1}`),
  mandatoryQuestions: ["Qual e seu principal objetivo hoje?", "Como voce resolve isso atualmente?"],
  escalationTopics: ["cancelamento", "dado financeiro sensivel"],
  salesMotionInstruction: "Priorize conversa util antes de qualquer oferta.",
};

test("compiled tenant context preserves configured policy beyond the legacy prompt limit", () => {
  const context = compileTenantAiContext(input);

  assert.equal(context.diagnostics.guardrailCount, 12);
  assert.match(context.policyPrompt, /Regra configurada 12/);
  assert.match(context.policyPrompt, /Qual e seu principal objetivo hoje/);
  assert.match(context.policyPrompt, /no maximo uma pergunta por turno/);
  assert.match(context.policyPrompt, /cancelamento/);
  assert.match(context.businessPrompt, /Empresas que precisam organizar captacao e vendas/);
  assert.match(context.businessPrompt, /Nao empurre uma oferta antes de entender o contexto/);
});

test("compiled tenant context has a stable fingerprint and changes when its policy changes", () => {
  const first = compileTenantAiContext(input);
  const same = compileTenantAiContext(input);
  const changed = compileTenantAiContext({
    ...input,
    guardrails: [...input.guardrails, "Nova regra"],
  });

  assert.equal(first.fingerprint, same.fingerprint);
  assert.notEqual(first.fingerprint, changed.fingerprint);
});

test("conversation prompt applies tenant policy and blocks automatic commercial pressure", () => {
  const tenantContext = compileTenantAiContext(input);
  const { systemPrompt, userPrompt } = buildConversationAgentPrompt({
    tenantId: input.tenantId,
    chatId: "chat-test",
    inboundText: "Oi",
    channel: "whatsapp",
    agentName: input.agentName,
    assistantRole: input.assistantRole,
    tenantContext,
    tenantContextConfigured: true,
    toneOfVoice: input.toneOfVoice,
    businessSummary: input.businessSummary,
    objective: input.objective,
    guardrails: input.guardrails,
    mandatoryQuestions: input.mandatoryQuestions,
    escalationTopics: input.escalationTopics,
    tier: "essential",
    autonomyMode: "autonomous",
    reasoningLevel: "balanced",
    responseStyle: "concise",
    conversation: [],
    kbDocs: [],
    preferredProviders: ["openai"],
  });

  assert.match(systemPrompt, /Regra configurada 12/);
  assert.match(systemPrompt, /Progressao comercial vem depois de compreender a pessoa/);
  assert.match(systemPrompt, /nao force qualificacao em todo turno/);
  assert.match(systemPrompt, /sem presumir dor, produto ou interesse/);
  assert.match(userPrompt, /apenas uma saudacao: acolha e deixe a pessoa falar, sem oferta ou qualificacao/);
});

test("compiled context carries every structured commercial instruction into the runtime prompt", () => {
  const context = compileTenantAiContext({
    ...input,
    commercialBrain: {
      businessModel: "Assinatura mensal.",
      idealCustomer: "Lojas com equipe comercial.",
      revenuePriorities: "Aumentar recorrencia.",
      diagnosisStyle: "Entender a operacao antes de indicar.",
      customSolutionPolicy: "Personalizar apenas depois do diagnostico.",
      handoffCriteria: "Escalar contratos complexos.",
      proposalStyle: "Proposta com escopo e proximos passos.",
      followUpStrategy: "Retomar no contexto combinado.",
      forbiddenSalesMoves: "Nunca pressionar ou inventar condicoes.",
    },
  });

  for (const expected of [
    "Assinatura mensal",
    "Aumentar recorrencia",
    "Personalizar apenas depois",
    "Escalar contratos complexos",
    "Proposta com escopo",
    "Retomar no contexto",
    "Nunca pressionar",
  ]) {
    assert.match(context.businessPrompt, new RegExp(expected));
  }
  assert.equal(context.diagnostics.configuredCommercialBrainFields, 9);
});

test("blueprint comercial e usado no runtime quando o resumo manual ainda nao foi preenchido", () => {
  const config = parseAiConfig({
    name: "Empresa sem resumo manual",
    businessProfileId: "generic",
    ai: { assistantRole: "consultant" },
    businessBlueprint: {
      active: {
        description: "Clinica de estetica que atende por WhatsApp e agenda avaliacao presencial.",
        aiPolicy: {
          toneOfVoice: "calmo e acolhedor",
          guardrails: ["Nao orientar procedimento clinico por mensagem."],
          handoffWhen: ["dor intensa"],
        },
      },
    },
  } as Parameters<typeof parseAiConfig>[0]);

  assert.equal(config.tenantContextConfigured, true);
  assert.match(config.businessSummary, /Clinica de estetica/);
  assert.doesNotMatch(config.businessSummary, /Empresa sem resumo manual/);
  assert.equal(config.toneOfVoice, "calmo e acolhedor");
  assert.ok(config.guardrails.includes("Nao orientar procedimento clinico por mensagem."));
  assert.ok(config.escalationTopics.includes("dor intensa"));
});

test("criterios comerciais claros tambem reforcam o handoff estruturado", () => {
  assert.deepEqual(
    deriveHandoffTopicsFromCommercialCriteria(
      "Chamar humano quando houver pedido de proposta, urgencia, customizacao ou desconto especial."
    ),
    ["proposta", "urgente", "customizacao", "desconto"]
  );

  const config = parseAiConfig({
    businessProfileId: "generic",
    ai: { commercialBrain: { handoffCriteria: "Encaminhar pedido de proposta ou negociacao de desconto." } },
  } as Parameters<typeof parseAiConfig>[0]);
  assert.ok(config.escalationTopics.includes("proposta"));
  assert.ok(config.escalationTopics.includes("desconto"));
});

test("condutas proibidas do cerebro comercial viram regras obrigatorias do runtime", () => {
  const config = parseAiConfig({
    businessProfileId: "generic",
    ai: {
      commercialBrain: {
        forbiddenSalesMoves: "Nunca oferecer desconto sem aprovacao.\nNao prometer resultado garantido.",
      },
    },
  } as Parameters<typeof parseAiConfig>[0]);

  assert.ok(config.guardrails.includes("Nunca oferecer desconto sem aprovacao"));
  assert.ok(config.guardrails.includes("Nao prometer resultado garantido"));
});

test("condutas proibidas bloqueiam promessa ou desconto antes do envio", () => {
  const restricted = enforceCommercialOutboundRestrictions({
    text: "Consigo liberar um desconto e garanto resultado em poucos dias.",
    forbiddenSalesMoves: "Nunca oferecer desconto sem aprovacao. Nao prometer resultado garantido.",
  });
  assert.deepEqual(restricted.blockedReasons.sort(), ["configured_discount_restriction", "configured_guarantee_restriction"]);
  assert.match(restricted.text, /passar isso com responsabilidade/);

  assert.equal(
    enforceCommercialOutboundRestrictions({
      text: "Posso explicar como funciona e verificar as condicoes atuais.",
      forbiddenSalesMoves: "Nunca oferecer desconto sem aprovacao.",
    }).text,
    "Posso explicar como funciona e verificar as condicoes atuais."
  );
});

test("estrategia de follow-up configurada ajusta apenas o prazo operacional", () => {
  assert.equal(resolveConfiguredFollowUpDelayHours("Retomar em 48 horas com contexto.", 6), 48);
  assert.equal(resolveConfiguredFollowUpDelayHours("Fazer contato amanha.", 6), 24);
  assert.equal(resolveConfiguredFollowUpDelayHours("Retomar imediatamente se o lead estiver quente.", 24), 2);
  assert.equal(resolveConfiguredFollowUpDelayHours("Retomar de forma consultiva.", 6), 6);
});
