import { createHash } from "node:crypto";
import {
  normalizeAltumAssistantRole,
  type AltumAssistantRole,
} from "@/lib/ai-assistant-role";
import type { AltumConversationRuntimeState, AltumLeadMemory } from "@/lib/server/ai/runtime-state";

export const AI_SPECIALIST_SUPERVISOR_VERSION = "specialist-supervisor-v1" as const;

export type AiSpecialist = AltumAssistantRole;
export type AiSpecialistSupervisorMode = "stay" | "transfer" | "human_handoff";
export type AiSpecialistSupervisorReason =
  | "explicit_human_request"
  | "active_support_incident"
  | "post_sale_continuity"
  | "qualified_closing_intent"
  | "closing_requires_qualification"
  | "consultative_diagnosis"
  | "configured_specialist";

export type AiSpecialistContinuity = {
  relationshipRevision: number | null;
  confirmedFactKeys: string[];
  hypothesisFactKeys: string[];
  openQuestionCount: number;
  previousStage: string | null;
  previousSpecialist: AiSpecialist | null;
};

export type AiSpecialistSupervisorDecision = {
  schemaVersion: typeof AI_SPECIALIST_SUPERVISOR_VERSION;
  configuredRole: AiSpecialist;
  selectedSpecialist: AiSpecialist | null;
  mode: AiSpecialistSupervisorMode;
  reason: AiSpecialistSupervisorReason;
  confidence: number;
  idempotencyKey: string;
  continuity: AiSpecialistContinuity;
};

function clean(value: unknown, max = 220) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function normalized(value: unknown) {
  return clean(value, 900)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function confirmedFactKeys(memory: AltumLeadMemory | null) {
  return memory?.relationshipState
    ? Object.values(memory.relationshipState.facts)
        .filter((fact) => fact.status === "confirmed")
        .map((fact) => fact.key)
        .sort()
        .slice(0, 24)
    : [];
}

function hypothesisFactKeys(memory: AltumLeadMemory | null) {
  return memory?.relationshipState
    ? Object.values(memory.relationshipState.facts)
        .filter((fact) => fact.status === "hypothesis")
        .map((fact) => fact.key)
        .sort()
        .slice(0, 16)
    : [];
}

function hasQualifiedContext(memory: AltumLeadMemory | null, extractedFields?: Record<string, string> | null) {
  const confirmed = new Set(confirmedFactKeys(memory));
  const hasBusiness =
    confirmed.has("businessType") ||
    Boolean(clean(extractedFields?.businessType || extractedFields?.niche || memory?.businessType, 120));
  const hasGoal =
    confirmed.has("primaryGoal") ||
    Boolean(clean(extractedFields?.primaryGoal || extractedFields?.goal || memory?.primaryGoal, 180));
  return hasBusiness && hasGoal;
}

function previousSpecialistFromState(state: AltumConversationRuntimeState | null) {
  const candidate = clean((state as AltumConversationRuntimeState & { activeSpecialist?: string | null } | null)?.activeSpecialist, 40);
  return candidate ? normalizeAltumAssistantRole(candidate) : null;
}

function allowedTransfer(configuredRole: AiSpecialist, target: AiSpecialist) {
  if (configuredRole === target) return true;
  const transitions: Record<AiSpecialist, AiSpecialist[]> = {
    receptionist: ["sdr", "consultant", "support"],
    sdr: ["closer", "consultant", "support"],
    sales: ["closer", "consultant", "support", "post_sales"],
    closer: ["support", "post_sales"],
    consultant: ["closer", "support"],
    support: ["post_sales"],
    post_sales: ["support"],
  };
  return transitions[configuredRole].includes(target);
}

function buildDecision(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  configuredRole: AiSpecialist;
  selectedSpecialist: AiSpecialist | null;
  mode: AiSpecialistSupervisorMode;
  reason: AiSpecialistSupervisorReason;
  confidence: number;
  continuity: AiSpecialistContinuity;
}): AiSpecialistSupervisorDecision {
  const idempotencyKey = createHash("sha256")
    .update(JSON.stringify({
      version: AI_SPECIALIST_SUPERVISOR_VERSION,
      tenantId: clean(input.tenantId, 160),
      chatId: clean(input.chatId, 180),
      messageId: clean(input.messageId, 180),
      configuredRole: input.configuredRole,
      selectedSpecialist: input.selectedSpecialist,
      mode: input.mode,
      reason: input.reason,
      relationshipRevision: input.continuity.relationshipRevision,
    }))
    .digest("hex")
    .slice(0, 32);
  return {
    schemaVersion: AI_SPECIALIST_SUPERVISOR_VERSION,
    configuredRole: input.configuredRole,
    selectedSpecialist: input.selectedSpecialist,
    mode: input.mode,
    reason: input.reason,
    confidence: Math.max(0, Math.min(1, input.confidence)),
    idempotencyKey,
    continuity: input.continuity,
  };
}

export function superviseAiSpecialist(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  configuredRole: unknown;
  inboundText: string;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  extractedFields?: Record<string, string> | null;
}): AiSpecialistSupervisorDecision {
  const configuredRole = normalizeAltumAssistantRole(input.configuredRole);
  const text = normalized(input.inboundText);
  const previousSpecialist = previousSpecialistFromState(input.runtimeState);
  const continuity: AiSpecialistContinuity = {
    relationshipRevision: input.leadMemory?.relationshipState?.revision ?? null,
    confirmedFactKeys: confirmedFactKeys(input.leadMemory),
    hypothesisFactKeys: hypothesisFactKeys(input.leadMemory),
    openQuestionCount: input.leadMemory?.relationshipState?.openQuestions.length || 0,
    previousStage: clean(input.runtimeState?.stage, 60) || null,
    previousSpecialist,
  };
  const decide = (
    target: AiSpecialist | null,
    reason: AiSpecialistSupervisorReason,
    confidence: number,
    forcedMode?: AiSpecialistSupervisorMode
  ) => {
    const selectedSpecialist = target && allowedTransfer(configuredRole, target) ? target : configuredRole;
    const currentSpecialist = previousSpecialist || configuredRole;
    const mode = forcedMode || (selectedSpecialist === currentSpecialist ? "stay" : "transfer");
    return buildDecision({
      tenantId: input.tenantId,
      chatId: input.chatId,
      messageId: input.messageId,
      configuredRole,
      selectedSpecialist: mode === "human_handoff" ? null : selectedSpecialist,
      mode,
      reason,
      confidence,
      continuity,
    });
  };

  if (/\b(humano|pessoa da equipe|atendente humano|falar com (uma )?pessoa|falar com alguem|especialista humano)\b/.test(text)) {
    return decide(null, "explicit_human_request", 0.99, "human_handoff");
  }

  const supportIncident = /\b(erro|falha|nao funciona|parou de funcionar|nao chegou|travou|cobranca indevida|problema|cancelar|reembolso)\b/.test(text);
  const existingCustomer =
    configuredRole === "post_sales" ||
    /\b(ja sou cliente|meu contrato|minha conta|minha assinatura|implantacao|onboarding|renovacao)\b/.test(text) ||
    ["customer", "onboarding", "retention", "closed_won"].includes(clean(input.runtimeState?.stage, 60).toLowerCase());
  if (supportIncident) {
    return decide(existingCustomer ? "post_sales" : "support", existingCustomer ? "post_sale_continuity" : "active_support_incident", 0.94);
  }
  if (existingCustomer) {
    return decide("post_sales", "post_sale_continuity", 0.88);
  }

  const closingIntent = /\b(proposta|orcamento|quero contratar|quero comprar|vou contratar|vou comprar|podemos fechar|quero fechar|preco|valor|desconto|condicao)\b/.test(text);
  const objection = /\b(caro|nao confio|funciona mesmo|garantia|agora nao|preciso pensar)\b/.test(text);
  if (closingIntent || objection) {
    if (configuredRole === "closer" || hasQualifiedContext(input.leadMemory, input.extractedFields)) {
      return decide("closer", "qualified_closing_intent", 0.93);
    }
    return decide("sdr", "closing_requires_qualification", 0.86);
  }

  const diagnosticIntent = /\b(diagnostico|estrategia|qual caminho|como melhorar|o que recomenda|comparar alternativas)\b/.test(text);
  if (diagnosticIntent) {
    return decide("consultant", "consultative_diagnosis", 0.86);
  }

  const continuingSpecialist = previousSpecialist && allowedTransfer(configuredRole, previousSpecialist)
    ? previousSpecialist
    : configuredRole;
  return decide(continuingSpecialist, "configured_specialist", 0.8);
}

export function specialistSupervisorInstruction(decision: AiSpecialistSupervisorDecision) {
  if (decision.mode === "human_handoff") {
    return "Supervisor: pedido humano confirmado. Nao execute outro papel; preserve o contexto e realize handoff.";
  }
  return [
    `Supervisor ${decision.schemaVersion}: especialista ativo ${decision.selectedSpecialist}.`,
    decision.mode === "transfer"
      ? `Transferencia interna autorizada por ${decision.reason}; continue do estado atual sem reiniciar descoberta.`
      : `Permanencia no especialista por ${decision.reason}.`,
    decision.continuity.confirmedFactKeys.length
      ? `Fatos confirmados preservados: ${decision.continuity.confirmedFactKeys.join(", ")}.`
      : "Nenhum fato confirmado foi descartado ou presumido na transferencia.",
  ].join(" ");
}
