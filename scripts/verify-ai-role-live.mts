import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { runConversationAgent, type ConversationAgentInput } from "../lib/server/ai/router.ts";
import { compileTenantAiContext } from "../lib/server/ai/tenant-context.ts";

nextEnv.loadEnvConfig(process.cwd());

const model = process.env.ALTUM_EVAL_MODEL || "gpt-4.1-mini";
const runtimePolicy = {
  primaryProvider: "openai" as const,
  fallbackProviders: [] as const,
  conversationModel: model,
  extractionModel: model,
  retrievalMode: "hybrid" as const,
  supportsToolCalling: true,
  supportsDeepReasoning: false,
  budgetMode: "conservative" as const,
};

const forbiddenSelling = /proposta|orcamento|plano premium|compre agora|ultima chance/i;
const context = compileTenantAiContext({
  tenantId: "quality-evaluation",
  agentName: "Lia",
  assistantRole: "sales",
  businessSummary: "Empresa de tecnologia que organiza atendimento comercial com IA.",
  objective: "Entender o contexto antes de indicar uma proxima etapa util.",
  toneOfVoice: "Humano, direto e acolhedor.",
  commercialBrain: {
    idealCustomer: "Pequenas e medias empresas com vendas por WhatsApp.",
    diagnosisStyle: "Responda primeiro a demanda e investigue uma variavel por vez.",
    forbiddenSalesMoves: "Nao empurre consultoria ou uma oferta antes de entender a pessoa.",
  },
  guardrails: ["Nao invente produto, preco ou prazo.", "Nao force qualificacao em saudacoes ou conversa relacional."],
  mandatoryQuestions: ["Qual resultado voce quer melhorar primeiro?"],
  escalationTopics: ["dados financeiros sensiveis", "cancelamento formal"],
});

const base: Omit<ConversationAgentInput, "inboundText" | "conversation" | "assistantRole"> = {
  tenantId: "quality-evaluation",
  chatId: "role-evaluation",
  channel: "whatsapp",
  agentName: "Lia",
  tenantContext: context,
  tenantContextConfigured: true,
  toneOfVoice: "humano, atento e natural",
  businessSummary: "Empresa de tecnologia que organiza atendimento comercial com IA.",
  objective: "Entender o contexto antes de indicar uma proxima etapa util.",
  guardrails: ["Nao invente informacoes.", "Nao pressione o cliente."],
  mandatoryQuestions: ["Qual resultado voce quer melhorar primeiro?"],
  escalationTopics: ["dados financeiros sensiveis", "cancelamento formal"],
  playbookOffers: [],
  playbookScripts: [],
  tier: "essential",
  autonomyMode: "hybrid",
  reasoningLevel: "fast",
  responseStyle: "concise",
  kbDocs: [
    {
      id: "offer-ia",
      type: "catalog",
      content: "Atendimento comercial com IA para WhatsApp.",
      tags: ["atendimento", "whatsapp", "ia"],
      productName: "Atendimento comercial com IA",
      productCategory: "servico",
      description: "Organiza conversas, CRM e follow-up comercial.",
      benefits: "Respostas mais rapidas e acompanhamento de oportunidades.",
      availability: "active",
      score: 0.95,
    },
  ],
  preferredProviders: ["openai"],
};

const cases: Array<{
  id: string;
  role: ConversationAgentInput["assistantRole"];
  message: string;
  history?: ConversationAgentInput["conversation"];
  validate: (response: string) => void;
}> = [
  {
    id: "greeting_no_pitch",
    role: "sales",
    message: "Oi",
    validate(response) {
      assert.doesNotMatch(response, /consultoria|diagnostico|proposta|gerar leads/i);
      // "Tudo bem?" pode acompanhar a saudacao; a protecao e contra uma
      // sequencia de perguntas de qualificacao, nao contra cordialidade.
      assert.ok((response.match(/\?/g) || []).length <= 2);
    },
  },
  {
    id: "receptionist_routes",
    role: "receptionist",
    message: "Oi, preciso de ajuda mas nao sei com quem falar",
    validate(response) {
      assert.doesNotMatch(response, forbiddenSelling);
      assert.ok((response.match(/\?/g) || []).length <= 1);
    },
  },
  {
    id: "sdr_one_step",
    role: "sdr",
    message: "Tenho uma agencia pequena e quero gerar mais oportunidades",
    validate(response) {
      assert.doesNotMatch(response, /preencha|formulario|questionario/i);
      assert.ok((response.match(/\?/g) || []).length <= 1);
    },
  },
  {
    id: "consultant_without_pressure",
    role: "consultant",
    message: "Meu time recebe bastante lead, mas poucos viram venda",
    validate(response) {
      assert.doesNotMatch(response, /compre agora|fechamos hoje|ultima chance/i);
      assert.ok(response.length <= 600);
    },
  },
  {
    id: "support_without_upsell",
    role: "support",
    message: "Meu acesso parou de funcionar depois da atualizacao",
    validate(response) {
      assert.doesNotMatch(response, forbiddenSelling);
      assert.doesNotMatch(response, /vender mais|oportunidade comercial/i);
    },
  },
  {
    id: "post_sales_retains_first",
    role: "post_sales",
    message: "Estou pensando em cancelar porque ainda nao consegui usar direito",
    validate(response) {
      assert.doesNotMatch(response, /upgrade|novo plano|comprar mais|oferta especial/i);
      assert.match(response, /entendo|sinto|ajudar|ver|resolver|uso/i);
    },
  },
  {
    id: "correction_recovers",
    role: "sales",
    message: "Mas eu nao pedi consultoria",
    history: [{ id: "agent-1", sender: "agent", text: "Posso explicar nossa consultoria comercial?" }],
    validate(response) {
      assert.match(response, /razao|entendi errado|desculp|recomec/i);
      assert.doesNotMatch(response, /nossa consultoria/i);
    },
  },
];

for (const testCase of cases) {
  const run = await runConversationAgent(
    {
      ...base,
      chatId: `role-evaluation-${testCase.id}`,
      inboundText: testCase.message,
      assistantRole: testCase.role,
      conversation: testCase.history || [],
    },
    runtimePolicy
  );
  const response = run.result?.responseText || "";
  if (!response && run.providerChainError) process.stdout.write(`${testCase.id}: provider_error=${run.providerChainError}\n`);
  assert.ok(response, `Modelo nao respondeu ao caso ${testCase.id}`);
  process.stdout.write(`RESULT ${testCase.id}: ${response}\n`);
  testCase.validate(response);
  process.stdout.write(`OK ${testCase.id}: ${response}\n`);
}

process.stdout.write(`AI role evaluation passed: ${cases.length}/${cases.length}\n`);
