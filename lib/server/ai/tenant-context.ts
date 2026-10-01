import { createHash } from "node:crypto";
import type { AltumAssistantRole } from "@/lib/ai-assistant-role";

export type TenantCommercialBrain = {
  businessModel?: string;
  idealCustomer?: string;
  revenuePriorities?: string;
  diagnosisStyle?: string;
  customSolutionPolicy?: string;
  handoffCriteria?: string;
  proposalStyle?: string;
  followUpStrategy?: string;
  forbiddenSalesMoves?: string;
};

export type TenantAiContextInput = {
  tenantId: string;
  agentName: string;
  assistantRole: AltumAssistantRole;
  businessSummary: string;
  objective: string;
  toneOfVoice: string;
  commercialBrain: TenantCommercialBrain;
  guardrails: string[];
  mandatoryQuestions: string[];
  escalationTopics: string[];
  salesMotionInstruction?: string;
};

export type CompiledTenantAiContext = {
  schemaVersion: "tenant-ai-context-v1";
  fingerprint: string;
  tenantId: string;
  policyPrompt: string;
  businessPrompt: string;
  diagnostics: {
    guardrailCount: number;
    mandatoryQuestionCount: number;
    escalationTopicCount: number;
    configuredCommercialBrainFields: number;
  };
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function uniqueLines(values: string[], maxItems: number, maxChars: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const line = clean(value, maxChars);
    const key = line.toLocaleLowerCase("pt-BR");
    if (!line || seen.has(key)) continue;
    seen.add(key);
    result.push(line);
    if (result.length >= maxItems) break;
  }
  return result;
}

function bulletBlock(title: string, values: string[]) {
  return values.length ? `${title}:\n${values.map((value) => `- ${value}`).join("\n")}` : "";
}

// O campo comercial aceita linguagem humana, mas alguns sinais precisam
// chegar tambem ao decisor deterministico de handoff. Mantemos os criterios
// originais no prompt e extraimos apenas gatilhos claros, sem tentar adivinhar
// regras complexas escritas livremente.
export function deriveHandoffTopicsFromCommercialCriteria(value: unknown) {
  const source = clean(value, 700);
  if (!source) return [];
  const normalized = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const topics: string[] = [];
  const add = (topic: string) => {
    if (!topics.includes(topic)) topics.push(topic);
  };

  if (/proposta|orcamento|cotacao/.test(normalized)) add("proposta");
  if (/urgenc|urgente|imediat|hoje/.test(normalized)) add("urgente");
  if (/customiz|personaliz|sob medida/.test(normalized)) add("customizacao");
  if (/desconto|negociac|condicao especial/.test(normalized)) add("desconto");
  if (/reclam|insatisfeit|irritad/.test(normalized)) add("reclamacao");
  if (/juridic|advogad|processo|procon/.test(normalized)) add("juridico");
  if (/cancel|reembolso|devolucao/.test(normalized)) add("cancelamento");

  return topics.slice(0, 12);
}

export function resolveConfiguredFollowUpDelayHours(value: unknown, fallbackHours: number) {
  const source = clean(value, 700)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const fallback = Math.max(1, Math.min(24 * 30, Math.round(fallbackHours || 24)));
  if (!source) return fallback;
  if (/imediat|agora|ainda hoje/.test(source)) return Math.min(fallback, 2);
  if (/amanha/.test(source)) return 24;

  const match = source.match(/\b(\d{1,3})\s*(hora|horas|h|dia|dias|semana|semanas)\b/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 1) return fallback;
  const unit = match[2];
  const multiplier = unit.startsWith("dia") ? 24 : unit.startsWith("semana") ? 24 * 7 : 1;
  return Math.max(1, Math.min(24 * 30, Math.round(amount * multiplier)));
}

export function compileTenantAiContext(input: TenantAiContextInput): CompiledTenantAiContext {
  const guardrails = uniqueLines(input.guardrails, 40, 240);
  const mandatoryQuestions = uniqueLines(input.mandatoryQuestions, 20, 240);
  const escalationTopics = uniqueLines(input.escalationTopics, 20, 240);
  const brain = input.commercialBrain || {};

  const commercialLines = [
    brain.businessModel ? `Modelo de negocio: ${clean(brain.businessModel, 700)}` : "",
    brain.idealCustomer ? `Cliente ideal: ${clean(brain.idealCustomer, 700)}` : "",
    brain.revenuePriorities ? `Prioridades de receita: ${clean(brain.revenuePriorities, 700)}` : "",
    brain.diagnosisStyle ? `Como diagnosticar: ${clean(brain.diagnosisStyle, 700)}` : "",
    brain.customSolutionPolicy ? `Solucao personalizada: ${clean(brain.customSolutionPolicy, 700)}` : "",
    brain.handoffCriteria ? `Criterios comerciais de handoff: ${clean(brain.handoffCriteria, 700)}` : "",
    brain.proposalStyle ? `Como preparar proposta: ${clean(brain.proposalStyle, 700)}` : "",
    brain.followUpStrategy ? `Estrategia de follow-up: ${clean(brain.followUpStrategy, 700)}` : "",
    brain.forbiddenSalesMoves ? `Condutas comerciais proibidas: ${clean(brain.forbiddenSalesMoves, 700)}` : "",
  ].filter(Boolean);

  const policyPrompt = [
    "Politica configurada para esta empresa. Aplique estas regras durante todo o turno.",
    bulletBlock("Regras obrigatorias", guardrails),
    mandatoryQuestions.length
      ? [
          "Informacoes de qualificacao desejadas:",
          ...mandatoryQuestions.map((question) => `- ${question}`),
          "Use somente a proxima informacao relevante que ainda estiver ausente. Nunca transforme a conversa em formulario, nunca repita o que ja foi respondido e faca no maximo uma pergunta por turno.",
        ].join("\n")
      : "",
    escalationTopics.length
      ? [
          "Temas que exigem humano:",
          ...escalationTopics.map((topic) => `- ${topic}`),
          "Ao reconhecer um desses temas, nao improvise uma solucao: prepare handoff com contexto.",
        ].join("\n")
      : "",
    clean(input.salesMotionInstruction, 500),
  ]
    .filter(Boolean)
    .join("\n\n");

  const businessPrompt = [
    `Empresa: ${clean(input.businessSummary, 900) || "contexto empresarial nao configurado"}.`,
    `Agente: ${clean(input.agentName, 100) || "Assistente"}.`,
    `Papel: ${input.assistantRole}.`,
    `Objetivo: ${clean(input.objective, 500) || "entender e ajudar o cliente com precisao"}.`,
    `Tom: ${clean(input.toneOfVoice, 300) || "claro, humano e natural"}.`,
    commercialLines.length ? `Contexto comercial estruturado:\n${commercialLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const fingerprintSource = JSON.stringify({
    schemaVersion: "tenant-ai-context-v1",
    tenantId: input.tenantId,
    policyPrompt,
    businessPrompt,
  });

  return {
    schemaVersion: "tenant-ai-context-v1",
    fingerprint: createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 24),
    tenantId: input.tenantId,
    policyPrompt,
    businessPrompt,
    diagnostics: {
      guardrailCount: guardrails.length,
      mandatoryQuestionCount: mandatoryQuestions.length,
      escalationTopicCount: escalationTopics.length,
      configuredCommercialBrainFields: commercialLines.length,
    },
  };
}
