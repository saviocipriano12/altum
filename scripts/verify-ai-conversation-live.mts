import assert from "node:assert/strict";
import nextEnv from "@next/env";
import { runConversationAgent, type ConversationAgentInput } from "../lib/server/ai/router.ts";

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

const base: Omit<ConversationAgentInput, "inboundText" | "conversation"> = {
  tenantId: "quality-evaluation",
  chatId: "natural-conversation-scenario",
  messageType: "text",
  channel: "whatsapp",
  agentName: "Altum",
  tenantContextConfigured: true,
  toneOfVoice: "humano, atento e natural",
  businessSummary: "Plataforma de operacao comercial com IA.",
  objective: "conversar, compreender e ajudar sem forcar uma oferta",
  guardrails: ["Nao inventar informacoes.", "Nao pressionar o cliente."],
  mandatoryQuestions: [],
  escalationTopics: [],
  playbookOffers: [],
  playbookScripts: [],
  tier: "starter",
  autonomyMode: "hybrid",
  reasoningLevel: "fast",
  responseStyle: "concise",
  kbDocs: [{
    id: "trap-consulting",
    type: "catalog",
    content: "Consultoria comercial completa com diagnostico, geracao de leads e proposta.",
    tags: ["vendas", "consultoria", "leads"],
    productName: "Consultoria comercial",
    productCategory: "servico",
    availability: "active",
    score: 0.95,
  }],
  preferredProviders: ["openai"],
};

const history: ConversationAgentInput["conversation"] = [];
const turns = [
  { text: "Opa", forbidden: /consultoria|diagnostico|proposta|gerar leads/i },
  { text: "Você pode conversar primeiro?", forbidden: /consultoria|diagnostico|proposta|pacote/i },
  { text: "Mas eu não pedi consultoria", required: /razao|razão|entendi errado|desculp|deixar isso/i },
  { text: "Hoje meu objetivo é melhorar minhas vendas", forbidden: /catalog_struct|produto Google|perfil negocios/i },
];

for (const turn of turns) {
  const run = await runConversationAgent({ ...base, inboundText: turn.text, conversation: history }, runtimePolicy);
  const response = run.result?.responseText || "";
  if (!response && run.providerChainError) process.stdout.write(`provider_error=${run.providerChainError}\n`);
  process.stdout.write(`• ${turn.text} -> ${response}\n`);
  assert.ok(response, `Modelo nao respondeu ao turno: ${turn.text}`);
  if (turn.forbidden) assert.doesNotMatch(response, turn.forbidden, `Resposta robotica ou precoce em: ${turn.text}`);
  if (turn.required) assert.match(response, turn.required, `Correcao nao reconhecida em: ${turn.text}`);
  const questionLimit = turn.text === "Opa" ? 2 : 1;
  assert.ok((response.match(/\?/g) || []).length <= questionLimit, `Perguntas demais no turno: ${turn.text}`);
  history.push({ id: `client-${history.length}`, sender: "client", text: turn.text });
  history.push({ id: `agent-${history.length}`, sender: "agent", text: response });
  process.stdout.write(`✓ turno aprovado\n`);
}
