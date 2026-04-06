import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import {
  buildAiRuntimePolicy,
  normalizeTenantAiOperatingProfile,
  type AltumAiAutonomyMode,
  type AltumAiProvider,
  type AltumAiReasoningLevel,
  type AltumAiResponseStyle,
  type AltumAiTier,
} from "@/lib/server/ai/operating-layer";
import { runConversationAgent } from "@/lib/server/ai/router";
import { resolveConversationalChoice } from "@/lib/server/ai/conversation-core";
import { logAiUsage } from "@/lib/server/ai/usage-ledger";
import { trackAltumAgentLearning } from "@/lib/server/ai/learning-loop";
import {
  trackAppointmentOutcome,
  trackLeadStageOutcome,
  trackProposalOutcome,
} from "@/lib/server/ai/learning-outcomes";
import { enrichInboundMessageForAgent } from "@/lib/server/ai/multimodal";
import { scoreAltumConversationQuality } from "@/lib/server/ai/quality-score";
import { sendAltumVoiceReply } from "@/lib/server/ai/voice";
import {
  getConversationRuntimeState,
  getLeadMemory,
  upsertConversationRuntimeState,
  upsertLeadMemory,
  type AltumLeadMemory,
} from "@/lib/server/ai/runtime-state";
import { deriveOperationalPlan } from "@/lib/server/ai/operational-plan";
import {
  getMetaChannelForTenant,
  isMetaConversationChannelType,
  sendMetaConversationText,
} from "@/app/lib/server/meta-channel";
import { getWhatsAppChannelForTenant, sendMetaTextMessage } from "@/app/lib/server/whatsapp-channel";
import { getTenantSettings } from "@/lib/server/tenant";
import {
  getBusinessProfile,
  getBusinessProfilePlaybookPreset,
  getBusinessProfilePipelineStages,
  normalizeBusinessProfileId,
  type BusinessProfileId,
  type BusinessProfilePlaybookOffer,
  type BusinessProfilePlaybookScript,
} from "@/lib/business-profiles";
import { runLeadAutomations } from "@/lib/server/automations";
import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";
import type { AltumConversationRuntimeState } from "@/lib/server/ai/runtime-state";
import { buildAiTaskPreset, suggestPipelineStageForAiAction } from "@/lib/ai-next-actions";

const MAX_CONTEXT_MESSAGES = 24;
const MAX_KB_DOCS = 50;

const DEFAULT_GUARDRAILS = [
  "Nao compartilhe dados sensiveis ou segredos internos.",
  "Nao confirme pagamentos, descontos ou prazos que nao estejam documentados.",
  "Mantenha o foco em qualificar o lead e avancar para proximo passo.",
];

type ChatStateDoc = {
  tenantId?: string;
  chatId?: string;
  aiEnabled?: boolean;
  pausedUntil?: unknown;
  humanOwnerUserId?: string | null;
  updatedByName?: string | null;
  updatedAt?: unknown;
  pauseReason?: string | null;
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score: number;
};

type ConversationMessage = {
  id: string;
  text: string;
  sender: "agent" | "client" | "system";
  type?: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaDuration?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaThumbnail?: string | null;
  createdAt?: unknown;
};

type TenantAiConfig = {
  enabled: boolean;
  businessProfileId: BusinessProfileId;
  businessProfileLabel: string;
  toneOfVoice: string;
  businessSummary: string;
  objective: string;
  responsiblePhone: string;
  guardrails: string[];
  mandatoryQuestions: string[];
  escalationTopics: string[];
  playbookOffers: BusinessProfilePlaybookOffer[];
  playbookScripts: BusinessProfilePlaybookScript[];
  tier: AltumAiTier;
  autonomyMode: AltumAiAutonomyMode;
  reasoningLevel: AltumAiReasoningLevel;
  responseStyle: AltumAiResponseStyle;
  preferredProviders: AltumAiProvider[];
  monthlyBudgetUsd: number;
  monthlyUsageCap: number;
  runtimePolicy: ReturnType<typeof buildAiRuntimePolicy>;
};

type Decision = "respond" | "ask_more" | "handoff" | "skip";

type AgentDecision = {
  decision: Exclude<Decision, "skip">;
  responseText?: string;
  reason: string;
  confidence: number;
  nextAction?: string;
};

function classifyLeadTurn(value: string) {
  const normalized = sanitizeText(value, 260)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const isGreeting = /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(normalized);
  const isWellbeing =
    /\b(como voce esta|como voce ta|como c[eê] esta|como vai|tudo bem|tudo certo|como estao voces)\b/.test(
      normalized
    );
  const isThanks = /\b(obrigad|valeu|show|top|perfeito, obrigad)\b/.test(normalized);
  const isLightSmallTalk =
    /\b(rs|kkk|haha|hehe|entao ta|entao tá|blz|beleza|show de bola|massa)\b/.test(normalized) ||
    /\b(voce e rapido|você é rapido|você é rápida|voce e rapida)\b/.test(normalized);
  const hasBusinessTerms =
    /\b(nicho|empresa|lead|leads|venda|vendas|whatsapp|objetivo|comercial|site|trafego|tr[aá]fego|crm|pipeline|proposta|diagnostico|diagn[oó]stico)\b/.test(
      normalized
    );
  const isPureRelational = (isWellbeing || isThanks || isLightSmallTalk) && !hasBusinessTerms;
  const isDirectQuestion = normalized.includes("?");

  return { isGreeting, isPureRelational, isDirectQuestion, hasBusinessTerms, isLightSmallTalk };
}

function chooseConversationalReply(input: {
  llmResponseText?: string | null;
  fallbackWriterText?: string | null;
  previousOutboundText?: string | null;
  inboundText?: string | null;
}) {
  const normalizeComparable = (value: string) =>
    sanitizeText(value, 1600)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const softenRigidPhrases = (value: string) =>
    sanitizeText(value, 1600)
      .replace(/\bme conta em uma linha\b/gi, "me conta rapidinho")
      .replace(/\bmais aderente\b/gi, "mais indicado")
      .replace(/\bnormalmente comecamos entendendo o momento da empresa, os gargalos e o objetivo principal\.?\b/gi, "o primeiro passo aqui e entender seu momento e o que voce quer destravar primeiro.")
      .replace(/\ba partir disso, conduzimos um diagnostico estrategico para identificar o servico ou combina pelo que voce trouxe, faz sentido uma conversa mais estrategica para destravar esse ponto com clareza\.?\b/gi, "com isso, a gente consegue te indicar o caminho mais simples e mais util para o seu caso.")
      .replace(/\bse topar, eu organizo um diagnostico rapido para entendermos meta, canal, budget e gargalos atuais\.?\b/gi, "se quiser, eu te explico o melhor proximo passo sem complicar.")
      .replace(/\bretomando de onde paramos,\s*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

  const removeAutoPilotOpeners = (value: string, inboundText: string) => {
    const clean = sanitizeText(value, 1600);
    const turn = classifyLeadTurn(inboundText);
    if (!clean) return clean;

    if (turn.isGreeting || turn.isDirectQuestion || turn.isPureRelational) {
      return clean.replace(/^(perfeito|entendi|boa|claro|fechado)\.\s+/i, "");
    }

    return clean;
  };

  const keepAtMostOneUsefulQuestion = (value: string, inboundText: string) => {
    const clean = sanitizeText(value, 1600);
    if (!clean) return clean;

    const turn = classifyLeadTurn(inboundText);
    const questionMatches = clean.match(/\?/g) || [];
    if (questionMatches.length <= 1) return clean;
    if (!turn.isGreeting && !turn.isPureRelational) return clean;

    const segments = (clean.match(/[^.!?]+[.!?]?/g) || []).map((item) => item.trim()).filter(Boolean);
    const kept: string[] = [];
    let keptQuestion = false;

    for (const segment of segments) {
      const hasQuestion = segment.includes("?");
      if (hasQuestion && keptQuestion) continue;
      kept.push(segment);
      if (hasQuestion) keptQuestion = true;
    }

    return sanitizeText(kept.join(" "), 1600) || clean;
  };

  const normalizeGreetingMenuResponse = (value: string, inboundText: string) => {
    const turn = classifyLeadTurn(inboundText);
    const clean = sanitizeText(value, 1600);
    if (!turn.isGreeting || turn.hasBusinessTerms) return clean;

    if (
      /\b(o que voce quer melhorar hoje|como posso te ajudar hoje)\b/i.test(clean) &&
      /\b(gerar mais leads|organizar atendimento|vender melhor)\b/i.test(clean)
    ) {
      return "Oi! Tudo bem? Como posso te ajudar hoje?";
    }

    return clean;
  };

  const trimBusinessPushOnHumanTurn = (value: string, inboundText: string) => {
    const turn = classifyLeadTurn(inboundText);
    if (!turn.isPureRelational && !turn.isDirectQuestion) return sanitizeText(value, 1600);

    const segments = (sanitizeText(value, 1600).match(/[^.!?]+[.!?]?/g) || []).map((item) => item.trim()).filter(Boolean);
    if (!segments.length) return sanitizeText(value, 1600);

    const businessPattern =
      /\b(nicho|empresa|lead|leads|venda|vendas|whatsapp|objetivo|comercial|atendimento|site|trafego|tr[aá]fego|crm|pipeline|proposta|diagnostico|diagn[oó]stico)\b/i;

    const kept: string[] = [];
    for (const segment of segments) {
      if (turn.isPureRelational && businessPattern.test(segment) && kept.length > 0) break;
      if (turn.isDirectQuestion && /\?/.test(segment) && kept.length > 0) break;
      kept.push(segment);
      if (kept.length >= 2) break;
    }

    return sanitizeText(kept.join(" "), 1600) || sanitizeText(value, 1600);
  };

  const llmBaseResponse = normalizeGreetingMenuResponse(sanitizeText(input.llmResponseText || "", 1600), input.inboundText || "");
  const llmTurn = classifyLeadTurn(input.inboundText || "");
  const llmResponse =
    llmTurn.isGreeting || llmTurn.isPureRelational || llmTurn.isDirectQuestion
      ? trimBusinessPushOnHumanTurn(llmBaseResponse, input.inboundText || "")
      : llmBaseResponse;
  const fallbackResponse = trimBusinessPushOnHumanTurn(
    keepAtMostOneUsefulQuestion(
      removeAutoPilotOpeners(
        normalizeGreetingMenuResponse(softenRigidPhrases(input.fallbackWriterText || ""), input.inboundText || ""),
        input.inboundText || ""
      ),
      input.inboundText || ""
    ),
    input.inboundText || ""
  );
  const previousResponse = normalizeComparable(String(input.previousOutboundText || ""));

  const llmComparable = normalizeComparable(llmResponse);
  const fallbackComparable = normalizeComparable(fallbackResponse);

  const llmLooksRepeated =
    Boolean(llmComparable) &&
    Boolean(previousResponse) &&
    llmComparable.length >= 20 &&
    previousResponse.length >= 20 &&
    llmComparable === previousResponse;

  if (llmResponse && !llmLooksRepeated) return llmResponse;
  if (fallbackResponse && fallbackComparable !== previousResponse) return fallbackResponse;
  return llmResponse || fallbackResponse;
}

function summarizeRuntimeStateForAgent(runtimeState: AltumConversationRuntimeState | null) {
  if (!runtimeState) return "";
  return [
    runtimeState.preferredName ? `nome preferido do lead: ${runtimeState.preferredName}` : "",
    runtimeState.leadTone ? `tom atual do lead: ${runtimeState.leadTone}` : "",
    runtimeState.activeTopic ? `assunto vivo da conversa: ${runtimeState.activeTopic}` : "",
    runtimeState.conversationMaturity ? `maturidade atual da conversa: ${runtimeState.conversationMaturity}` : "",
    runtimeState.lastOutboundText ? `sua ultima fala foi: ${sanitizeText(runtimeState.lastOutboundText, 120)}` : "",
    runtimeState.pendingQuestion ? `ultima pergunta feita e ainda viva: ${runtimeState.pendingQuestion}` : "",
    runtimeState.lastLeadQuestion ? `ultima pergunta do lead: ${runtimeState.lastLeadQuestion}` : "",
    runtimeState.summary ? `resumo curto do que ja ficou claro: ${runtimeState.summary}` : "",
  ]
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");
}

function summarizeLeadMemoryForAgent(leadMemory: AltumLeadMemory | null) {
  if (!leadMemory) return "";
  return [
    leadMemory.preferredName ? `nome preferido: ${leadMemory.preferredName}` : "",
    leadMemory.leadTone ? `tom mais recorrente: ${leadMemory.leadTone}` : "",
    leadMemory.activeTopic ? `assunto principal recente: ${leadMemory.activeTopic}` : "",
    leadMemory.conversationMaturity ? `momento comercial: ${leadMemory.conversationMaturity}` : "",
    leadMemory.openQuestion ? `pergunta em aberto: ${leadMemory.openQuestion}` : "",
    leadMemory.businessType ? `negocio: ${leadMemory.businessType}` : "",
    leadMemory.primaryGoal ? `objetivo: ${leadMemory.primaryGoal}` : "",
    leadMemory.currentChannels ? `canais atuais: ${leadMemory.currentChannels}` : "",
    leadMemory.dominantObjection ? `objecao dominante: ${leadMemory.dominantObjection}` : "",
    leadMemory.memorySummary ? `memoria viva: ${leadMemory.memorySummary}` : "",
    leadMemory.summary ? `resumo: ${leadMemory.summary}` : "",
  ]
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");
}

function looksLikeHumanName(value: unknown) {
  const clean = sanitizeText(value, 80);
  if (!clean) return false;
  if (/\d{5,}|@/.test(clean)) return false;

  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (["lead", "contato", "cliente", "visitante"].includes(normalized)) return false;
  if (
    /\b(empresa|suplementos|odontologia|imobiliaria|agencia|consultoria|clinica|marketing|studio|loja|comercio|ltda|eireli|me)\b/.test(
      normalized
    )
  ) {
    return false;
  }

  return normalized.split(/\s+/).length <= 4;
}

function leadFirstName(value: unknown) {
  const clean = sanitizeText(value, 80);
  if (!looksLikeHumanName(clean)) return "";
  return clean.split(/\s+/)[0] || clean;
}

export type HandleIncomingMessageInput = {
  tenantId: string;
  chatId: string;
  messageId: string;
};

export type HandleIncomingMessageResult = {
  decision: Decision;
  reason: string;
};

export type ChatState = {
  tenantId: string;
  chatId: string;
  aiEnabled: boolean;
  pausedUntil: Date | null;
  humanOwnerUserId: string | null;
  updatedByName?: string | null;
  updatedAt?: Date | null;
  pauseReason?: string | null;
};

export function getChatStateDocId(tenantId: string, chatId: string) {
  return `${tenantId.trim()}_${chatId.trim()}`;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  return null;
}

function sanitizeText(value: unknown, max = 900) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function safeLogDocId(tenantId: string, chatId: string, messageId: string) {
  const raw = `${tenantId}_${chatId}_${messageId}`;
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return cleaned.slice(0, 220) || `ai_${Date.now()}`;
}

function normalizeMessageType(value: unknown) {
  const raw = sanitizeText(value, 40).toLowerCase();
  if (
    ["text", "audio", "image", "video", "document", "sticker", "location", "contact", "template", "interactive", "system", "internal_note", "activity"].includes(
      raw
    )
  ) {
    return raw;
  }
  return "text";
}

function numericValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarizeMessageForAgent(data: Record<string, unknown>) {
  const aiNormalized = sanitizeText(data.aiNormalizedText, 1200);
  if (aiNormalized) return aiNormalized;

  const type = normalizeMessageType(data.type);
  const rawText = sanitizeText(data.text, 1200);
  if (type === "text" && rawText) return rawText;

  if (type === "audio") {
    const duration = numericValue(data.mediaDuration);
    return [rawText, "[Audio recebido]", duration ? `duracao aproximada ${Math.round(duration)}s` : ""]
      .filter(Boolean)
      .join(" ");
  }

  if (type === "image") {
    const dims =
      numericValue(data.mediaWidth) && numericValue(data.mediaHeight)
        ? `${numericValue(data.mediaWidth)}x${numericValue(data.mediaHeight)}`
        : "";
    return [rawText, "[Imagem recebida]", dims ? `dimensoes ${dims}` : "", sanitizeText(data.mediaName, 120)]
      .filter(Boolean)
      .join(" ");
  }

  if (type === "video") {
    const duration = numericValue(data.mediaDuration);
    return [rawText, "[Video recebido]", duration ? `duracao aproximada ${Math.round(duration)}s` : ""]
      .filter(Boolean)
      .join(" ");
  }

  if (type === "document") {
    return [rawText, "[Arquivo recebido]", sanitizeText(data.mediaName, 120)].filter(Boolean).join(" ");
  }

  if (type === "sticker") return rawText || "[Sticker recebido]";
  if (type === "location") return rawText || "[Localizacao recebida]";
  return rawText || `[${type} recebido]`;
}

function parseGuardrails(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item, 240))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|\.|;|\|/)
      .map((item) => sanitizeText(item, 240))
      .filter(Boolean);
  }

  return [];
}

function parseLines(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item, 160))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;|\|/)
      .map((item) => sanitizeText(item, 160))
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return [];
}

function parseAiConfig(settings: Awaited<ReturnType<typeof getTenantSettings>>): TenantAiConfig {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};
  const businessProfileId = normalizeBusinessProfileId(settings?.businessProfileId);
  const businessProfile = getBusinessProfile(businessProfileId);
  const playbookPreset = getBusinessProfilePlaybookPreset(businessProfileId);
  const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);

  return {
    enabled: ai.enabled !== false,
    businessProfileId,
    businessProfileLabel: businessProfile.label,
    toneOfVoice: sanitizeText(ai.toneOfVoice, 120) || businessProfile.ai.toneOfVoice,
    businessSummary:
      sanitizeText(ai.businessSummary, 360) ||
      sanitizeText(settings?.name, 120) ||
      businessProfile.description,
    objective: sanitizeText(ai.objective, 200) || businessProfile.ai.objective,
    responsiblePhone: normalizePhone(String(ai.responsiblePhone || "")),
    guardrails: Array.from(new Set([...DEFAULT_GUARDRAILS, ...businessProfile.ai.guardrails, ...parseGuardrails(ai.guardrails)])).slice(0, 24),
    mandatoryQuestions: Array.from(new Set([...businessProfile.ai.mandatoryQuestions, ...parseLines(ai.mandatoryQuestions, 12)])).slice(0, 12),
    escalationTopics: Array.from(new Set([...businessProfile.ai.escalationTopics, ...parseLines(ai.escalationTopics, 12)])).slice(0, 12),
    playbookOffers: playbookPreset.offers.slice(0, 6),
    playbookScripts: playbookPreset.scripts.slice(0, 6),
    ...operatingProfile,
    runtimePolicy: buildAiRuntimePolicy(operatingProfile),
  };
}

function textHasAny(text: string, terms: string[]) {
  const normalized = normalizeWords(text).join(" ");
  return terms.some((term) => normalized.includes(term));
}

function shouldHandoff(text: string) {
  const handoffTerms = [
    "humano",
    "atendente",
    "pessoa",
    "gerente",
    "supervisor",
    "reclamacao",
    "procon",
    "cancelar",
    "processo",
    "advogado",
  ];
  return textHasAny(text, handoffTerms);
}

function shouldAskMore(text: string) {
  const normalized = sanitizeText(text, 400);
  if (!normalized) return true;

  const words = normalizeWords(normalized);
  if (words.length <= 1) return true;

  const genericOpeners = ["oi", "ola", "bom dia", "boa tarde", "boa noite"];
  if (textHasAny(normalized, genericOpeners) && words.length < 5) {
    return true;
  }

  return false;
}

function isGreetingLike(text: string) {
  const normalized = sanitizeText(text, 240);
  if (!normalized) return false;
  const words = normalizeWords(normalized);
  if (words.length > 4) return false;
  return textHasAny(normalized, ["oi", "ola", "bom dia", "boa tarde", "boa noite", "tudo bem"]);
}

function isClarificationRequest(text: string) {
  return textHasAny(text, [
    "o que voces fazem",
    "o que fazem",
    "como funciona",
    "nao entendi",
    "me explica",
    "explica melhor",
  ]);
}

function pickNextMandatoryQuestion(messages: ConversationMessage[], questions: string[]) {
  if (!questions.length) return "";

  const clientCorpus = messages
    .filter((item) => item.sender === "client")
    .map((item) => sanitizeText(item.text, 240))
    .join(" ");

  const budgetRegex = /\b\d[\d\.\,]*\s?(?:k|mil|reais|real)?\b/i;

  const isQuestionCovered = (question: string) => {
    const normalizedQuestion = sanitizeText(question, 200).toLowerCase();

    if (textHasAny(normalizedQuestion, ["nicho", "empresa", "tipo de empresa", "negocio"])) {
      return (
        /\b(sou|somos|tenho|atuo|trabalho)\b/i.test(clientCorpus) ||
        textHasAny(clientCorpus, [
          "imobiliaria",
          "clinica",
          "agencia",
          "advocacia",
          "restaurante",
          "ecommerce",
          "loja",
          "consultoria",
          "construtora",
          "industria",
          "escola",
        ])
      );
    }

    if (textHasAny(normalizedQuestion, ["objetivo", "meta", "resultado", "quer", "foco"])) {
      return textHasAny(clientCorpus, [
        "quero",
        "preciso",
        "busco",
        "objetivo",
        "meta",
        "vender",
        "captar",
        "gerar demanda",
        "organizar atendimento",
        "converter",
      ]);
    }

    if (textHasAny(normalizedQuestion, ["orcamento", "budget", "investimento", "faixa", "valor"])) {
      return budgetRegex.test(clientCorpus) || textHasAny(clientCorpus, ["orcamento", "budget", "investimento", "nao tenho"]);
    }

    if (textHasAny(normalizedQuestion, ["urgencia", "prazo", "quando", "rapido"])) {
      return textHasAny(clientCorpus, ["hoje", "urgente", "essa semana", "este mes", "proximo mes", "imediato"]);
    }

    if (textHasAny(normalizedQuestion, ["trafego", "crm", "canal", "anuncia"])) {
      return textHasAny(clientCorpus, ["trafego", "crm", "google", "meta", "instagram", "whatsapp", "anuncio", "anuncio"]);
    }

    const keywords = normalizeWords(question);
    return keywords.length ? textHasAny(clientCorpus, keywords) : false;
  };

  for (const question of questions) {
    if (!isQuestionCovered(question)) {
      return question;
    }
  }

  return questions[0] || "";
}

function scoreKbDoc(messageWords: string[], doc: KbDoc) {
  if (messageWords.length === 0) return 0;
  const docWords = new Set<string>([
    ...normalizeWords(doc.content),
    ...doc.tags.flatMap((tag) => normalizeWords(tag)),
    ...normalizeWords(doc.type),
  ]);

  let score = 0;
  for (const word of messageWords) {
    if (docWords.has(word)) score += 1;
  }

  return score;
}

function makeLeadFacingReply(input: {
  tenantAi: TenantAiConfig;
  decision: Exclude<Decision, "skip" | "handoff">;
  inboundText: string;
  kbDocs: KbDoc[];
  conversation: ConversationMessage[];
  contactName?: string | null;
}) {
  const normalizedInbound = sanitizeText(input.inboundText, 500);
  const turn = classifyLeadTurn(normalizedInbound);
  const knownFirstName = leadFirstName(input.contactName);
  const inboundHasPriceSignal = textHasAny(input.inboundText, ["preco", "valor", "plano", "orcamento", "investimento"]);
  const asksIdentity = textHasAny(normalizedInbound, ["qual e o seu nome", "qual seu nome", "quem e voce", "quem é você"]);
  const asksWellbeing = textHasAny(normalizedInbound, ["como voce esta", "como voce ta", "como vai", "tudo bem"]);
  const thanks = textHasAny(normalizedInbound, ["obrigado", "obrigada", "valeu"]);
  const nextMandatoryQuestion =
    pickNextMandatoryQuestion(input.conversation, input.tenantAi.mandatoryQuestions) ||
    "Hoje o foco maior está em gerar demanda, organizar atendimento ou converter melhor?";
  const leadFacingKbDocs = input.kbDocs.filter((doc) => doc.type !== "policy");
  const primaryKbDoc = leadFacingKbDocs[0] || input.kbDocs[0] || null;
  const primaryKbSnippet = primaryKbDoc
    ? sanitizeText(
        primaryKbDoc.content
          .replace(/^faq:\s*/i, "")
          .replace(/^oferta:\s*/i, "")
          .replace(/^politica:\s*/i, "")
          .replace(/^pergunta:\s*/i, "")
          .replace(/^resposta:\s*/i, ""),
        220
      )
    : "";

  if (asksIdentity) {
    return "Eu sou a assistente comercial da ALTUM. Se quiser, eu posso te ajudar a entender o melhor caminho para o seu caso.";
  }

  if (asksWellbeing && !turn.hasBusinessTerms) {
    return "Tudo certo por aqui. E por aí?";
  }

  if (thanks && !turn.hasBusinessTerms) {
    return "Imagina. Tô por aqui.";
  }

  if (turn.isLightSmallTalk && !turn.hasBusinessTerms) {
    return "Hahaha, tento ajudar rápido mesmo.";
  }

  if (isGreetingLike(input.inboundText)) {
    return knownFirstName
      ? `Oi, ${knownFirstName}! Tudo bem? Como posso te ajudar hoje?`
      : "Oi! Tudo bem? Como posso te ajudar hoje?";
  }

  if (isClarificationRequest(input.inboundText)) {
    return "A ALTUM ajuda empresas a vender mais e organizar melhor a operacao comercial. Se quiser, eu te explico por onde faz mais sentido comecar no seu caso.";
  }

  if (input.decision === "ask_more") {
    return inboundHasPriceSignal
      ? "Consigo te passar isso, sim. Antes, me conta rapidinho seu momento para eu nao te falar algo fora do seu caso."
      : `Me ajuda com mais um ponto so: ${nextMandatoryQuestion}`;
  }

  if (primaryKbSnippet) {
    return `Entendi. ${primaryKbSnippet}`;
  }

  if (inboundHasPriceSignal) {
    return "Entendi. Consigo te orientar nisso, sim. Se quiser, eu te explico o formato que tende a fazer mais sentido para o seu momento.";
  }

  return "Entendi. Me conta um pouco melhor o teu momento hoje.";
}

function summarizeForResponsible(messages: ConversationMessage[]) {
  const recentClient = messages
    .filter((item) => item.sender === "client")
    .map((item) => sanitizeText(item.text, 180))
    .filter(Boolean)
    .slice(-5);

  if (recentClient.length === 0) {
    return ["Cliente pediu suporte humano.", "Sem mensagens recentes para resumir.", "Acompanhar conversa no inbox."];
  }

  const bullets = recentClient.slice(-5).map((line) => `- ${line}`);
  return bullets.slice(0, 5);
}

async function fetchKbDocs(tenantId: string, inboundText: string) {
  const snap = await adminDb
    .collection("kb_docs")
    .where("tenantId", "==", tenantId)
    .limit(MAX_KB_DOCS)
    .get();

  const baseDocs: KbDoc[] = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const typeRaw = String(data.type || "faq").toLowerCase();
      const type: KbDoc["type"] =
        typeRaw === "catalog" ? "catalog" : typeRaw === "policy" ? "policy" : "faq";

      const tags = Array.isArray(data.tags)
        ? data.tags
            .map((tag) => sanitizeText(tag, 80))
            .filter(Boolean)
        : [];

      return {
        id: doc.id,
        type,
        content: sanitizeText(data.content, 600),
        tags,
        score: 0,
      };
    })
    .filter((item) => item.content);

  const messageWords = normalizeWords(inboundText);
  const scored = baseDocs
    .map((doc) => ({ ...doc, score: scoreKbDoc(messageWords, doc) }))
    .sort((a, b) => b.score - a.score);

  return scored.filter((doc) => doc.score > 0);
}

async function fetchConversation(chatId: string, tenantId: string) {
  const snap = await adminDb
    .collection("messages")
    .where("chatId", "==", chatId)
    .where("tenantId", "==", tenantId)
    .limit(300)
    .get();

  const messages: ConversationMessage[] = snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const senderRaw = String(data.sender || "client").toLowerCase();
      const sender: ConversationMessage["sender"] =
        senderRaw === "agent" || senderRaw === "system" ? senderRaw : "client";

      return {
        id: doc.id,
        text: summarizeMessageForAgent(data),
        sender,
        type: normalizeMessageType(data.type),
        mediaUrl: sanitizeText(data.mediaUrl, 800) || null,
        mediaName: sanitizeText(data.mediaName, 160) || null,
        mediaMimeType: sanitizeText(data.mediaMimeType, 120) || null,
        mediaDuration: numericValue(data.mediaDuration),
        mediaWidth: numericValue(data.mediaWidth),
        mediaHeight: numericValue(data.mediaHeight),
        mediaThumbnail: sanitizeText(data.mediaThumbnail, 800) || null,
        createdAt: data.createdAt,
      };
    })
    .sort((a, b) => {
      const aTime = toDate(a.createdAt)?.getTime() || 0;
      const bTime = toDate(b.createdAt)?.getTime() || 0;
      return aTime - bTime;
    })
    .slice(-MAX_CONTEXT_MESSAGES);

  return messages;
}

export async function getChatState(tenantId: string, chatId: string): Promise<ChatState> {
  const docId = getChatStateDocId(tenantId, chatId);
  const snap = await adminDb.collection("chat_state").doc(docId).get();

  if (!snap.exists) {
    return {
      tenantId,
      chatId,
      aiEnabled: true,
      pausedUntil: null,
      humanOwnerUserId: null,
      updatedByName: null,
      updatedAt: null,
      pauseReason: null,
    };
  }

  const data = snap.data() as ChatStateDoc;
  return {
    tenantId,
    chatId,
    aiEnabled: data.aiEnabled !== false,
    pausedUntil: toDate(data.pausedUntil),
    humanOwnerUserId:
      typeof data.humanOwnerUserId === "string" && data.humanOwnerUserId.trim()
        ? data.humanOwnerUserId.trim()
        : null,
    updatedByName:
      typeof data.updatedByName === "string" && data.updatedByName.trim()
        ? data.updatedByName.trim()
        : null,
    updatedAt: toDate(data.updatedAt),
    pauseReason:
      typeof data.pauseReason === "string" && data.pauseReason.trim()
        ? data.pauseReason.trim()
        : null,
  };
}

async function saveAiLog(input: {
  logDocId: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  leadId?: string | null;
  decision: Decision;
  reason: string;
  inboundText: string;
  outboundText: string;
  toolCalls: string[];
  confidence?: number;
  matchedKbDocIds?: string[];
  extractedFields?: Record<string, string> | null;
  nextAction?: string | null;
  latencyMs?: number;
  provider?: AltumAiProvider;
  model?: string;
  tier?: AltumAiTier;
  autonomyMode?: AltumAiAutonomyMode;
  reasoningLevel?: AltumAiReasoningLevel;
  responseStyle?: AltumAiResponseStyle;
  plannerIntent?: string | null;
  stateBefore?: string | null;
  stateAfter?: string | null;
  responseGoal?: string | null;
  recommendedOffer?: string | null;
  objectionType?: string | null;
  commercialTemperature?: string | null;
  llmTurnGoal?: string | null;
  llmMemorySummary?: string | null;
  conversationLedBy?: string | null;
  qualityScore?: number | null;
  qualityNotes?: string[] | null;
}) {
  await adminDb.collection("ai_logs").doc(input.logDocId).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      messageId: input.messageId,
      leadId: input.leadId || null,
      input: input.inboundText,
      output: input.outboundText,
      toolCalls: input.toolCalls,
      decision: input.decision,
      reason: input.reason,
      confidence: input.confidence ?? null,
      matchedKbDocIds: input.matchedKbDocIds || [],
      extractedFields: input.extractedFields || null,
      nextAction: input.nextAction || null,
      latencyMs: input.latencyMs ?? null,
      provider: input.provider || "altum_rules",
      model: input.model || "altum_rules_v1",
      tier: input.tier || null,
      autonomyMode: input.autonomyMode || null,
      reasoningLevel: input.reasoningLevel || null,
      responseStyle: input.responseStyle || null,
      plannerIntent: input.plannerIntent || null,
      stateBefore: input.stateBefore || null,
      stateAfter: input.stateAfter || null,
      responseGoal: input.responseGoal || null,
      recommendedOffer: input.recommendedOffer || null,
      objectionType: input.objectionType || null,
      commercialTemperature: input.commercialTemperature || null,
      llmTurnGoal: input.llmTurnGoal || null,
      llmMemorySummary: input.llmMemorySummary || null,
      conversationLedBy: input.conversationLedBy || null,
      qualityScore: typeof input.qualityScore === "number" ? input.qualityScore : null,
      qualityNotes: input.qualityNotes || [],
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function addHours(base: Date, hours: number) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function getAiTaskDueHours(action: string | null | undefined, commercialTemperature?: string | null) {
  const normalizedAction = sanitizeText(action, 160).toLowerCase();
  const temperature = sanitizeText(commercialTemperature, 40).toLowerCase();

  if (normalizedAction === "assumir_handoff_humano") return 1;
  if (normalizedAction === "agendar_proximo_passo" || normalizedAction === "preparar_proposta_comercial") return 2;
  if (normalizedAction.includes("objecao")) return 3;
  if (temperature === "hot") return 2;
  if (temperature === "warm") return 6;
  return 12;
}

function shouldSeedCommercialDraft(input: {
  plan: AltumPlannerDecision;
  leadData: Record<string, unknown>;
}) {
  const confidence = typeof input.plan.confidence === "number" ? input.plan.confidence : 0;
  const businessType = sanitizeText(input.leadData.aiBusinessType || input.leadData.businessType, 120);
  const primaryGoal = sanitizeText(input.leadData.aiPrimaryGoal || input.leadData.primaryGoal, 180);
  const urgency = sanitizeText(input.leadData.aiUrgency || input.leadData.urgency, 120);
  const recommendedOffer = sanitizeText(input.plan.recommendedOffer, 180);
  const readinessSignals = [businessType, primaryGoal, urgency, recommendedOffer].filter(Boolean).length;

  if (confidence < 0.82) return false;
  return readinessSignals >= 3;
}

async function createAiInternalNotification(input: {
  tenantId: string;
  chatId: string;
  leadId: string;
  type: string;
  severity: "info" | "warning" | "high";
  title: string;
  detail: string;
}) {
  await adminDb.collection("ai_internal_notifications").add({
    tenantId: input.tenantId,
    chatId: input.chatId,
    leadId: input.leadId,
    type: sanitizeText(input.type, 80),
    severity: sanitizeText(input.severity, 20),
    title: sanitizeText(input.title, 180),
    detail: sanitizeText(input.detail, 280),
    status: "open",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: "altum_agent_v2",
  });
}

async function createAiProposalDraft(input: {
  tenantId: string;
  leadId: string;
  leadName?: string | null;
  leadCompany?: string | null;
  recommendedOffer?: string | null;
  summary?: string | null;
}) {
  const titleBase = sanitizeText(input.recommendedOffer, 140) || "Proposta comercial ALTUM";
  const ref = await adminDb.collection("orcamentos").add({
    tenantId: input.tenantId,
    clientId: input.tenantId,
    clientName: "Cliente ALTUM",
    leadId: input.leadId,
    leadName: sanitizeText(input.leadName, 180) || "Lead",
    leadCompany: sanitizeText(input.leadCompany, 180) || null,
    titulo: titleBase,
    tipo: "Proposta consultiva",
    status: "Rascunho",
    valorTotal: null,
    validade: null,
    resumo: sanitizeText(input.summary, 4000) || null,
    ownerId: "ai_sales_agent",
    owner: "AI Sales Agent",
    createdBy: "ai_sales_agent",
    createdByName: "AI Sales Agent",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: "altum_agent_v2",
  });

  await trackProposalOutcome({
    tenantId: input.tenantId,
    leadId: input.leadId,
    budgetId: ref.id,
    status: "Rascunho",
  });

  return ref.id;
}

async function createAiAppointmentDraft(input: {
  tenantId: string;
  leadId: string;
  leadName?: string | null;
  leadCompany?: string | null;
  summary?: string | null;
}) {
  const startAt = addHours(new Date(), 24).toISOString();
  const ref = await adminDb.collection("appointments").add({
    tenantId: input.tenantId,
    leadId: input.leadId,
    leadName: sanitizeText(input.leadName, 180) || "Lead",
    leadCompany: sanitizeText(input.leadCompany, 180) || null,
    title: `Diagnostico comercial com ${sanitizeText(input.leadName, 120) || "lead"}`,
    type: "reuniao",
    status: "scheduled",
    startAt,
    endAt: null,
    location: null,
    meetingUrl: null,
    notes: sanitizeText(input.summary, 4000) || null,
    ownerUserId: null,
    ownerName: "AI Sales Agent",
    createdBy: "ai_sales_agent",
    createdByName: "AI Sales Agent",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: "altum_agent_v2",
  });

  await trackAppointmentOutcome({
    tenantId: input.tenantId,
    leadId: input.leadId,
    appointmentId: ref.id,
    status: "scheduled",
  });

  return ref.id;
}

async function executeAltumAgentActions(input: {
  tenantId: string;
  chatId: string;
  leadId?: string | null;
  plan: AltumPlannerDecision;
  runtimeState: AltumConversationRuntimeState | null;
  extractedFields?: Record<string, string> | null;
  inboundText: string;
  businessProfileId: BusinessProfileId;
  leadName?: string | null;
}) {
  const leadId = sanitizeText(input.leadId, 160);
  if (!leadId) return [] as string[];

  const actions: string[] = [];
  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  const leadData = leadSnap.exists ? (leadSnap.data() as Record<string, unknown>) : {};
  const now = new Date();
  const aiMemory = {
    preferredName:
      sanitizeText(
        input.extractedFields?.preferredName || input.extractedFields?.name || input.extractedFields?.contactName,
        80
      ) || null,
    businessType: sanitizeText(
      input.extractedFields?.businessType || input.extractedFields?.niche || input.extractedFields?.segment,
      120
    ) || null,
    primaryGoal: sanitizeText(
      input.extractedFields?.primaryGoal || input.extractedFields?.goal || input.extractedFields?.objective,
      180
    ) || null,
    urgency: sanitizeText(input.extractedFields?.urgency, 120) || null,
    budgetBand: sanitizeText(input.extractedFields?.budgetBand || input.extractedFields?.budget, 120) || null,
    decisionMaker:
      sanitizeText(input.extractedFields?.decisionMaker || input.extractedFields?.decisor || input.extractedFields?.owner, 120) ||
      null,
    digitalMaturity:
      sanitizeText(input.extractedFields?.digitalMaturity || input.extractedFields?.maturity || input.extractedFields?.structure, 160) ||
      null,
    city: sanitizeText(input.extractedFields?.city || input.extractedFields?.region, 120) || null,
    currentChannels:
      sanitizeText(input.extractedFields?.currentChannels || input.extractedFields?.channels, 220) || null,
    teamSize: sanitizeText(input.extractedFields?.teamSize || input.extractedFields?.team || input.extractedFields?.staffSize, 80) || null,
    leadTone:
      sanitizeText(input.extractedFields?.leadTone || input.extractedFields?.tone || input.extractedFields?.mood, 80) ||
      null,
    activeTopic:
      sanitizeText(input.extractedFields?.activeTopic || input.extractedFields?.topic, 120) || null,
    dominantObjection:
      sanitizeText(input.extractedFields?.objectionType || input.extractedFields?.objection, 120) ||
      input.plan.objectionType ||
      null,
    serviceInterest:
      sanitizeText(input.extractedFields?.serviceInterest || input.extractedFields?.offer, 160) ||
      input.plan.recommendedOffer ||
      null,
  };

  const leadPatch: Record<string, unknown> = {
    tenantId: input.tenantId,
    aiConversationStage: input.plan.stateAfter,
    aiLastIntent: input.plan.intent,
    aiNextAction: input.plan.nextAction || null,
    aiRecommendedOffer: input.plan.recommendedOffer || null,
    aiResponseGoal: input.plan.responseGoal,
    aiDominantObjection: input.plan.objectionType || null,
    aiCommercialTemperature: input.plan.commercialTemperature || null,
    aiBusinessType: aiMemory.businessType,
    aiPrimaryGoal: aiMemory.primaryGoal,
    aiBudgetBand: aiMemory.budgetBand,
    aiUrgency: aiMemory.urgency,
    aiDecisionMaker: aiMemory.decisionMaker,
    aiDigitalMaturity: aiMemory.digitalMaturity,
    aiCurrentChannels: aiMemory.currentChannels,
    aiCity: aiMemory.city,
    aiTeamSize: aiMemory.teamSize,
    aiPreferredName: aiMemory.preferredName,
    aiLeadTone: aiMemory.leadTone,
    aiActiveTopic: aiMemory.activeTopic,
    aiLeadSummary: [
      aiMemory.preferredName ? `Nome: ${aiMemory.preferredName}` : "",
      aiMemory.leadTone ? `Tom: ${aiMemory.leadTone}` : "",
      aiMemory.activeTopic ? `Assunto: ${aiMemory.activeTopic}` : "",
      aiMemory.businessType ? `Negocio: ${aiMemory.businessType}` : "",
      aiMemory.primaryGoal ? `Objetivo: ${aiMemory.primaryGoal}` : "",
      aiMemory.currentChannels ? `Canais: ${aiMemory.currentChannels}` : "",
      aiMemory.city ? `Cidade: ${aiMemory.city}` : "",
      input.plan.recommendedOffer ? `Oferta sugerida: ${input.plan.recommendedOffer}` : "",
      input.plan.nextAction ? `Proximo passo: ${input.plan.nextAction}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    aiLastInboundText: sanitizeText(input.inboundText, 500) || null,
    aiMemory,
    updatedAt: FieldValue.serverTimestamp(),
  };

  const suggestedStage = suggestPipelineStageForAiAction(
    input.plan.nextAction,
    getBusinessProfilePipelineStages(input.businessProfileId).map((stage) => stage.id)
  );
  if (suggestedStage) {
    const previousStage = sanitizeText(leadData.pipelineStage || leadData.stage, 80) || null;
    leadPatch.pipelineStage = suggestedStage;
    leadPatch.stage = suggestedStage;
    leadPatch.stageUpdatedAt = FieldValue.serverTimestamp();
    if (previousStage && previousStage !== suggestedStage) {
      await trackLeadStageOutcome({
        tenantId: input.tenantId,
        leadId,
        previousStage,
        nextStage: suggestedStage,
      });
    }
    actions.push("move_pipeline_stage");
  }

  if (input.plan.stateAfter === "recommendation") {
    leadPatch.priority = "high";
    leadPatch.heat = "hot";
    leadPatch.aiSignalStrength = "high";
    leadPatch.aiLastRecommendedAt = FieldValue.serverTimestamp();
    actions.push("flag_hot_lead");
  }

  await leadRef.set(leadPatch, { merge: true });
  actions.push("update_lead_memory");

  const stageChanged = input.runtimeState?.stage !== input.plan.stateAfter;
  const nextActionChanged = input.runtimeState?.nextAction !== (input.plan.nextAction || null);
  const shouldSeedDraft = shouldSeedCommercialDraft({
    plan: input.plan,
    leadData: {
      ...leadData,
      ...leadPatch,
    },
  });

  if (stageChanged && input.plan.stateAfter === "recommendation") {
    const note = [
      "IA identificou contexto suficiente para recomendacao comercial.",
      input.plan.recommendedOffer ? `Oferta sugerida: ${input.plan.recommendedOffer}.` : "",
      input.plan.nextAction ? `Proximo passo sugerido: ${input.plan.nextAction}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    await Promise.all([
      adminDb.collection("lead_notes").add({
        tenantId: input.tenantId,
        leadId,
        text: note,
        authorId: "ai_sales_agent",
        authorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      leadRef.collection("events").add({
        type: "ai_recommendation",
        title: "IA sinalizou recomendacao comercial",
        detail: note.slice(0, 240),
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "hot_lead",
        severity: "high",
        title: "Lead quente identificado pela IA",
        detail: note.slice(0, 240),
      }),
    ]);
    actions.push("add_lead_note");
    actions.push("notify_internal_team");
  }

  if (
    nextActionChanged &&
    input.plan.nextAction &&
    (
      input.plan.nextAction.includes("diagnostico") ||
      input.plan.nextAction.includes("reuniao") ||
      input.plan.nextAction.includes("proposta") ||
      input.plan.nextAction.includes("objecao")
    )
  ) {
    const taskPreset = buildAiTaskPreset(input.plan.nextAction, input.leadName);
    await Promise.all([
      adminDb.collection("lead_tasks").add({
        tenantId: input.tenantId,
        leadId,
        title: taskPreset.title,
        type: taskPreset.type,
        priority: taskPreset.priority,
        dueAt: addHours(now, getAiTaskDueHours(input.plan.nextAction, input.plan.commercialTemperature || null)),
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "ai_sales_agent",
        createdByName: "AI Sales Agent",
      }),
      leadRef.collection("events").add({
        type: "ai_followup_task_created",
        title: "IA criou tarefa de follow-up",
        detail: input.plan.nextAction.slice(0, 240),
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "followup_task",
        severity: input.plan.commercialTemperature === "hot" ? "high" : "info",
        title: "IA criou proximo passo operacional",
        detail: input.plan.nextAction.slice(0, 240),
      }),
    ]);
    actions.push("create_followup_task");
    actions.push("notify_internal_team");
  }

  if (nextActionChanged && input.plan.nextAction === "preparar_proposta_comercial" && shouldSeedDraft) {
    const proposalId = await createAiProposalDraft({
      tenantId: input.tenantId,
      leadId,
      leadName: input.leadName || sanitizeText(leadData.nome, 180) || null,
      leadCompany: sanitizeText(leadData.empresa, 180) || null,
      recommendedOffer: input.plan.recommendedOffer || aiMemory.serviceInterest,
      summary: leadPatch.aiLeadSummary as string,
    });

    await Promise.all([
      leadRef.collection("events").add({
        type: "ai_proposal_draft_created",
        title: "IA abriu rascunho de proposta",
        detail: `Rascunho ${proposalId} criado para acelerar o fechamento comercial.`,
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "proposal_draft",
        severity: "high",
        title: "IA abriu rascunho de proposta",
        detail: `Proposta em rascunho criada para ${sanitizeText(input.leadName, 120) || "lead"}.`,
      }),
    ]);
    actions.push("create_proposal_draft");
    actions.push("notify_internal_team");
  }

  if (nextActionChanged && input.plan.nextAction === "agendar_proximo_passo" && shouldSeedDraft) {
    const appointmentId = await createAiAppointmentDraft({
      tenantId: input.tenantId,
      leadId,
      leadName: input.leadName || sanitizeText(leadData.nome, 180) || null,
      leadCompany: sanitizeText(leadData.empresa, 180) || null,
      summary: leadPatch.aiLeadSummary as string,
    });

    await Promise.all([
      leadRef.collection("events").add({
        type: "ai_appointment_draft_created",
        title: "IA abriu rascunho de agendamento",
        detail: `Agendamento ${appointmentId} criado para acelerar o proximo passo comercial.`,
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "appointment_draft",
        severity: "high",
        title: "IA abriu rascunho de reuniao",
        detail: `Agendamento em rascunho criado para ${sanitizeText(input.leadName, 120) || "lead"}.`,
      }),
    ]);
    actions.push("create_appointment_draft");
    actions.push("notify_internal_team");
  }

  if (
    nextActionChanged &&
    (input.plan.nextAction === "preparar_proposta_comercial" || input.plan.nextAction === "agendar_proximo_passo") &&
    !shouldSeedDraft
  ) {
    const pendingTitle =
      input.plan.nextAction === "preparar_proposta_comercial"
        ? "IA segurou rascunho de proposta"
        : "IA segurou rascunho de reuniao";
    const pendingDetail =
      input.plan.nextAction === "preparar_proposta_comercial"
        ? "O lead demonstrou interesse, mas ainda faltou contexto comercial suficiente para abrir uma proposta com seguranca."
        : "O lead demonstrou abertura para o proximo passo, mas ainda faltou contexto comercial suficiente para abrir um agendamento com seguranca.";

    await Promise.all([
      leadRef.collection("events").add({
        type: "ai_closing_step_pending_context",
        title: pendingTitle,
        detail: pendingDetail,
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "closing_pending_context",
        severity: "warning",
        title: pendingTitle,
        detail: pendingDetail,
      }),
    ]);
    actions.push("notify_internal_team");
  }

  if (input.plan.stateAfter === "objection_handling" && stageChanged) {
    const objection = sanitizeText(input.inboundText, 220);
    await Promise.all([
      adminDb.collection("lead_notes").add({
        tenantId: input.tenantId,
        leadId,
        text: `IA registrou objecao/comentario do lead: ${objection}${input.plan.objectionType ? ` (tipo: ${input.plan.objectionType})` : ""}`,
        authorId: "ai_sales_agent",
        authorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }),
      leadRef.collection("events").add({
        type: "ai_objection_detected",
        title: "IA detectou objecao",
        detail: `${input.plan.objectionType ? `[${input.plan.objectionType}] ` : ""}${objection}`,
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "objection",
        severity: "warning",
        title: "IA detectou objecao comercial",
        detail: `${input.plan.objectionType ? `[${input.plan.objectionType}] ` : ""}${objection}`.slice(0, 240),
      }),
    ]);
    actions.push("register_objection");
    actions.push("notify_internal_team");
  }

  if (input.plan.decision === "handoff") {
    await Promise.all([
      adminDb.collection("lead_tasks").add({
        tenantId: input.tenantId,
        leadId,
        title: "Assumir handoff solicitado pela IA",
        type: "handoff",
        priority: "high",
        dueAt: addHours(now, 1),
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "ai_sales_agent",
        createdByName: "AI Sales Agent",
      }),
      leadRef.collection("events").add({
        type: "ai_handoff_requested",
        title: "IA solicitou handoff",
        detail: sanitizeText(input.plan.reason, 220),
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        createdAt: FieldValue.serverTimestamp(),
      }),
      createAiInternalNotification({
        tenantId: input.tenantId,
        chatId: input.chatId,
        leadId,
        type: "handoff",
        severity: "high",
        title: "IA pediu handoff humano",
        detail: sanitizeText(input.plan.reason, 220),
      }),
    ]);
    actions.push("handoff_to_human");
    actions.push("notify_internal_team");
  }

  return actions;
}

async function upsertChatState(input: {
  tenantId: string;
  chatId: string;
  aiEnabled?: boolean;
  pausedUntil?: Date | null;
  humanOwnerUserId?: string | null;
  updatedByName?: string | null;
  pauseReason?: string | null;
}) {
  const docId = getChatStateDocId(input.tenantId, input.chatId);
  await adminDb.collection("chat_state").doc(docId).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      aiEnabled: input.aiEnabled,
      pausedUntil: input.pausedUntil || null,
      humanOwnerUserId: input.humanOwnerUserId || null,
      updatedByName: input.updatedByName || null,
      pauseReason: input.pauseReason || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function addMessage(input: {
  chatId: string;
  tenantId: string;
  text: string;
  sender: "agent" | "system";
  type?: "text" | "audio";
  channelPhoneNumberId?: string;
  channel?: string;
  senderId?: string;
  senderName?: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  metaMessageId?: string | null;
}) {
  const cleanText = sanitizeText(input.text, 1800);
  if (!cleanText && input.type !== "audio") return;

  await Promise.all([
    adminDb.collection("messages").add({
      chatId: input.chatId,
      tenantId: input.tenantId,
      text: cleanText,
      sender: input.sender,
      senderId: input.senderId || null,
      senderName: input.senderName || (input.sender === "agent" ? "AI Sales Agent" : null),
      type: input.type || "text",
      status: "sent",
      channel: input.channel || null,
      channelPhoneNumberId: input.channelPhoneNumberId || null,
      mediaUrl: input.mediaUrl || null,
      mediaName: input.mediaName || null,
      mediaMimeType: input.mediaMimeType || null,
      metaMessageId: input.metaMessageId || null,
      createdAt: FieldValue.serverTimestamp(),
    }),
    adminDb.collection("chats").doc(input.chatId).set(
      {
        tenantId: input.tenantId,
        lastMessage: cleanText,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...buildOutgoingChatOperationalPatch({
          status: "open",
          assignedTo: null,
        }),
      },
      { merge: true }
    ),
  ]);
}

function decide(input: {
  inboundText: string;
  kbDocs: KbDoc[];
  tenantAi: TenantAiConfig;
}): AgentDecision {
  const turn = classifyLeadTurn(input.inboundText);

  if (shouldHandoff(input.inboundText)) {
    return {
      decision: "handoff",
      reason: "lead_requested_human",
      confidence: 0.92,
      nextAction: "assumir_handoff_humano",
    };
  }

  if (turn.isGreeting || turn.isPureRelational || turn.isDirectQuestion) {
    return {
      decision: "respond",
      reason: "human_turn_fallback",
      confidence: 0.52,
      nextAction: "aprofundar_oportunidade",
    };
  }

  if (shouldAskMore(input.inboundText)) {
    return {
      decision: "respond",
      reason: "light_context_probe",
      confidence: 0.44,
      nextAction: "qualificar_contexto_minimo",
    };
  }

  if (input.kbDocs.length === 0) {
    if (findRelevantPlaybookScript(input.inboundText, input.tenantAi.playbookScripts)) {
      return {
        decision: "respond",
        reason: "matched_playbook",
        confidence: 0.46,
        nextAction: "conduzir_para_proximo_passo",
      };
    }

    return {
      decision: "respond",
      reason: "conversational_fallback_without_kb",
      confidence: 0.4,
      nextAction: "aprofundar_oportunidade",
    };
  }

  return {
    decision: "respond",
    reason: "matched_kb",
    confidence: Math.min(0.97, 0.58 + Math.min(input.kbDocs[0]?.score || 0, 6) * 0.06),
    nextAction: "aprofundar_oportunidade",
  };
}

function scorePlaybookText(inboundText: string, parts: string[]) {
  const inboundWords = normalizeWords(inboundText);
  if (!inboundWords.length) return 0;
  const corpus = new Set(parts.flatMap((item) => normalizeWords(item)));
  let score = 0;
  for (const word of inboundWords) {
    if (corpus.has(word)) score += 1;
  }
  return score;
}

function findRelevantPlaybookScript(inboundText: string, scripts: BusinessProfilePlaybookScript[]) {
  const ranked = [...scripts]
    .map((script) => ({
      script,
      score: scorePlaybookText(inboundText, [script.situation, script.goal, script.script]),
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score ? ranked[0].script : null;
}

function normalizeFieldKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function normalizeExtractedFieldsForCrm(extracted?: Record<string, string> | null) {
  if (!extracted) return null;

  const aliasMap: Record<string, string> = {
    businesstype: "businessType",
    business_type: "businessType",
    niche: "businessType",
    nicho: "businessType",
    segment: "businessType",
    segmento: "businessType",
    tipo_empresa: "businessType",
    primarygoal: "primaryGoal",
    primary_goal: "primaryGoal",
    goal: "primaryGoal",
    objective: "primaryGoal",
    objetivo: "primaryGoal",
    budgetband: "budgetBand",
    budget: "budgetBand",
    budget_band: "budgetBand",
    orcamento: "budgetBand",
    investimento: "budgetBand",
    urgency: "urgency",
    urgencia: "urgency",
    decisionmaker: "decisionMaker",
    decision_maker: "decisionMaker",
    decisor: "decisionMaker",
    owner: "decisionMaker",
    digitalmaturity: "digitalMaturity",
    digital_maturity: "digitalMaturity",
    maturity: "digitalMaturity",
    structure: "digitalMaturity",
    serviceinterest: "serviceInterest",
    offer: "serviceInterest",
    offer_interest: "serviceInterest",
    service_interest: "serviceInterest",
    oferta: "serviceInterest",
    objection: "objectionType",
    objection_type: "objectionType",
    leadtone: "leadTone",
    lead_tone: "leadTone",
    tone: "leadTone",
    mood: "leadTone",
    activetopic: "activeTopic",
    active_topic: "activeTopic",
    topic: "activeTopic",
    cidade: "city",
    city: "city",
    currentchannels: "currentChannels",
    channels: "currentChannels",
    current_channels: "currentChannels",
    canais: "currentChannels",
    teamsize: "teamSize",
    team: "teamSize",
    team_size: "teamSize",
    staff_size: "teamSize",
    preferredname: "preferredName",
    preferred_name: "preferredName",
    name: "preferredName",
    nome: "preferredName",
    contactname: "preferredName",
    contact_name: "preferredName",
  };

  const normalized = Object.entries(extracted).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = aliasMap[normalizeFieldKey(key)] || normalizeFieldKey(key);
    const cleanValue = sanitizeText(value, 180);
    if (!normalizedKey || !cleanValue) return acc;
    if (!acc[normalizedKey]) acc[normalizedKey] = cleanValue;
    return acc;
  }, {});

  return Object.keys(normalized).length ? normalized : null;
}

function normalizeComparable(value: string) {
  return sanitizeText(value, 220)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function groundRecommendedOffer(input: {
  recommendedOffer?: string | null;
  extractedFields?: Record<string, string> | null;
  leadMemory?: { recommendedOffer?: string | null } | null;
  tenantAi: TenantAiConfig;
}) {
  const allowedOffers = Array.from(
    new Set(input.tenantAi.playbookOffers.map((offer) => sanitizeText(offer.title, 160)).filter(Boolean))
  );

  if (!allowedOffers.length) {
    return sanitizeText(
      input.recommendedOffer ||
        input.extractedFields?.serviceInterest ||
        input.extractedFields?.offer ||
        input.leadMemory?.recommendedOffer,
      160
    );
  }

  const candidates = [
    sanitizeText(input.recommendedOffer, 160),
    sanitizeText(input.extractedFields?.serviceInterest || input.extractedFields?.offer, 160),
    sanitizeText(input.leadMemory?.recommendedOffer, 160),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeComparable(candidate);
    const direct = allowedOffers.find((offer) => {
      const normalizedOffer = normalizeComparable(offer);
      return normalizedOffer === normalizedCandidate || normalizedOffer.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedOffer);
    });
    if (direct) return direct;
  }

  return allowedOffers[0] || "diagnostico comercial e marketing";
}

export function hardenPlannerDecision(input: {
  plannerDecision: AltumPlannerDecision;
  extractedFields?: Record<string, string> | null;
  leadMemory: AltumLeadMemory | null;
  tenantAi: TenantAiConfig;
  llmDecision?: "respond" | "ask_more" | "handoff" | "skip" | null;
  llmConfidence?: number | null;
  llmTurnGoal?: string | null;
}) {
  const extractedFields = input.extractedFields || null;
  const hasCommercialContext = Boolean(
    sanitizeText(extractedFields?.businessType || input.leadMemory?.businessType, 120) &&
      sanitizeText(extractedFields?.primaryGoal || input.leadMemory?.primaryGoal, 180)
  );

  const groundedOffer = groundRecommendedOffer({
    recommendedOffer: input.plannerDecision.recommendedOffer || null,
    extractedFields,
    leadMemory: input.leadMemory,
    tenantAi: input.tenantAi,
  });

  const isClosingPush =
    input.plannerDecision.responseGoal === "recommend" ||
    input.plannerDecision.responseGoal === "move_to_next_step" ||
    /proposta|reuniao|diagnostico|agendar/i.test(String(input.plannerDecision.nextAction || ""));
  const shouldKeepConversationalFreedom = [
    "greeting",
    "ask_agent_identity",
    "ask_services",
    "affirmative",
    "context_share",
    "growth_goal",
    "ops_or_ai",
    "digital_assets",
    "soft_objection",
    "send_audio",
    "send_image",
    "send_document",
  ].includes(String(input.plannerDecision.intent || ""));

  if (
    !hasCommercialContext &&
    isClosingPush &&
    !shouldKeepConversationalFreedom
  ) {
    return {
      ...input.plannerDecision,
      decision: "ask_more" as const,
      reason: "grounding_missing_context",
      stateAfter: "qualification" as const,
      responseGoal: "qualify" as const,
      nextAction: "coletar_contexto_comercial_minimo",
      nextQuestion:
        input.plannerDecision.nextQuestion ||
        "Antes de eu te indicar o melhor caminho, me diz rapidinho qual e o seu tipo de negocio e o principal objetivo hoje.",
      recommendedOffer: groundedOffer || null,
      confidence: Math.min(input.plannerDecision.confidence, 0.74),
    };
  }

  const normalizedTurnGoal = sanitizeText(input.llmTurnGoal || "", 120).toLowerCase();
  const llmWantsConversationalLead =
    input.llmDecision === "respond" &&
    (input.llmConfidence || 0) >= 0.72 &&
    !isClosingPush &&
    (
      shouldKeepConversationalFreedom ||
      input.plannerDecision.decision === "ask_more" ||
      ["welcome", "clarify", "qualify"].includes(String(input.plannerDecision.responseGoal || "")) ||
      /(acolher|boas vindas|welcome|clarify|esclarecer|aprofundar|investigar|entender|qualify|discovery)/i.test(
        normalizedTurnGoal
      )
    );

  if (llmWantsConversationalLead && input.plannerDecision.decision !== "handoff") {
    return {
      ...input.plannerDecision,
      decision: "respond" as const,
      reason:
        input.plannerDecision.reason === "grounding_missing_context"
          ? input.plannerDecision.reason
          : "llm_conversational_lead",
      confidence: Math.max(input.plannerDecision.confidence || 0, Math.min(input.llmConfidence || 0, 0.92)),
      recommendedOffer: groundedOffer || null,
    };
  }

  return {
    ...input.plannerDecision,
    recommendedOffer: groundedOffer || null,
  };
}

function mapTurnGoalToResponseGoal(
  turnGoal: string,
  fallback: AltumPlannerDecision["responseGoal"]
): AltumPlannerDecision["responseGoal"] {
  if (/(handoff|escalar|humano)/i.test(turnGoal)) return "handoff";
  if (/(acolher|boas vindas|welcome)/i.test(turnGoal)) return "welcome";
  if (/(aprofundar|investigar|entender|qualify|discovery)/i.test(turnGoal)) return "qualify";
  if (/(objecao|objeção|objection)/i.test(turnGoal)) return "handle_objection";
  if (/(proposta|agendar|fechar|avancar|avançar|proximo passo|next step)/i.test(turnGoal)) {
    return "move_to_next_step";
  }
  if (/(responder|esclarecer|clarify|orientar|explicar|resumir)/i.test(turnGoal)) return "clarify";
  return fallback;
}

function mapResponseGoalToStage(
  responseGoal: AltumPlannerDecision["responseGoal"],
  currentStage: AltumConversationRuntimeState["stage"] | null | undefined,
  fallback: AltumPlannerDecision["stateAfter"]
): AltumPlannerDecision["stateAfter"] {
  if (responseGoal === "handoff") return "handoff";
  if (responseGoal === "welcome") return currentStage === "greeting" || !currentStage ? "greeting" : fallback;
  if (responseGoal === "qualify") {
    if (!currentStage || currentStage === "greeting" || currentStage === "discovery") return "qualification";
    return currentStage as AltumPlannerDecision["stateAfter"];
  }
  if (responseGoal === "clarify") {
    if (!currentStage || currentStage === "greeting") return "discovery";
    return currentStage as AltumPlannerDecision["stateAfter"];
  }
  if (responseGoal === "handle_objection") return "objection_handling";
  if (responseGoal === "move_to_next_step") return fallback;
  return fallback;
}

export function buildOperationalPlan(input: {
  plannerDecision: AltumPlannerDecision;
  choice: {
    decision: "respond" | "ask_more" | "handoff";
    reason: string;
    confidence: number;
    nextAction: string;
    ledBy: "llm" | "fallback";
  };
  llmTurnGoal?: string | null;
  runtimeState: AltumConversationRuntimeState | null;
}) {
  if (input.choice.decision === "handoff") {
    return {
      ...input.plannerDecision,
      decision: "handoff" as const,
      reason: input.choice.reason || input.plannerDecision.reason,
      confidence: Math.max(input.choice.confidence, input.plannerDecision.confidence || 0),
      stateAfter: "handoff" as const,
      responseGoal: "handoff" as const,
      nextAction: input.choice.nextAction || input.plannerDecision.nextAction,
    };
  }

  if (input.choice.ledBy === "llm") {
    const normalizedTurnGoal = sanitizeText(input.llmTurnGoal || "", 120).toLowerCase();
    const responseGoal = mapTurnGoalToResponseGoal(normalizedTurnGoal, input.plannerDecision.responseGoal);
    const stateAfter = mapResponseGoalToStage(responseGoal, input.runtimeState?.stage, input.plannerDecision.stateAfter);

    return {
      ...input.plannerDecision,
      decision: input.choice.decision,
      reason: input.choice.reason || input.plannerDecision.reason,
      confidence: Math.max(input.choice.confidence, input.plannerDecision.confidence || 0),
      responseGoal,
      stateAfter,
      nextAction: input.choice.nextAction || input.plannerDecision.nextAction,
    };
  }

  return {
    ...input.plannerDecision,
    decision: input.choice.decision,
    reason: input.choice.reason || input.plannerDecision.reason,
    confidence: Math.max(input.choice.confidence, input.plannerDecision.confidence || 0),
    nextAction: input.choice.nextAction || input.plannerDecision.nextAction,
  };
}

export function extractBusinessFields(inboundText: string, tenantAi: TenantAiConfig) {
  const normalizedText = sanitizeText(inboundText, 1000);
  if (!normalizedText) return undefined;

  const extracted: Record<string, string> = {};
  const lowerText = normalizedText.toLowerCase();
  const normalizedCorpus = normalizeWords(normalizedText).join(" ");
  const nichePatterns = [
    "imobiliaria",
    "clinica",
    "clinica odontologica",
    "clinica medica",
    "agencia",
    "advocacia",
    "consultoria",
    "construtora",
    "ecommerce",
    "loja",
    "escola",
    "restaurante",
    "hotel",
    "industria",
  ];
  const primaryGoals = [
    { terms: ["vender mais", "mais vendas", "aumentar vendas", "converter mais"], value: "aumentar vendas" },
    { terms: ["captar mais", "gerar mais leads", "mais leads", "mais demanda"], value: "gerar mais leads qualificados" },
    { terms: ["organizar atendimento", "organizar comercial", "crm", "pipeline"], value: "organizar a operacao comercial" },
    { terms: ["responder mais rapido", "atendimento mais rapido", "whatsapp"], value: "ganhar velocidade no atendimento" },
  ];
  const channelTerms = ["whatsapp", "instagram", "facebook", "google", "meta", "site", "landing page", "crm"];

  for (const field of tenantAi.playbookOffers.length ? tenantAi.playbookOffers : []) {
    if (textHasAny(normalizedText, [field.category, field.title])) {
      extracted.serviceInterest = field.title;
      break;
    }
  }

  for (const niche of nichePatterns) {
    if (normalizedCorpus.includes(normalizeWords(niche).join(" "))) {
      extracted.businessType = niche;
      break;
    }
  }

  for (const goal of primaryGoals) {
    if (textHasAny(normalizedText, goal.terms)) {
      extracted.primaryGoal = goal.value;
      break;
    }
  }

  if (/\b\d{3,}\s?(k|mil)?\b/i.test(normalizedText) || textHasAny(normalizedText, ["orcamento", "budget", "valor", "preco"])) {
    const budgetMatch = normalizedText.match(/(\d[\d\.\,]*\s?(?:k|mil)?)/i);
    if (budgetMatch?.[1]) {
      extracted.budgetBand = budgetMatch[1].trim();
    }
  }

  if (textHasAny(normalizedText, ["urgente", "urgencia", "hoje", "imediato", "essa semana"])) {
    extracted.urgency = "alta";
  }

  if (textHasAny(normalizedText, ["30 dias", "este mes", "esse mes", "proxima semana"])) {
    extracted.urgency = extracted.urgency || "curto_prazo";
  }

  const cityMatch = normalizedText.match(/\b(?:em|de|moro em|cidade)\s+([A-Za-zÀ-ÿ\s]{3,40})/i);
  if (cityMatch?.[1]) {
    extracted.city = sanitizeText(cityMatch[1], 40);
  }

  if (textHasAny(normalizedText, ["eu que decido", "sou o dono", "sou a dona", "sou proprietario", "sou proprietaria"])) {
    extracted.decisionMaker = "lead e decisor principal";
  }

  if (textHasAny(normalizedText, ["tudo manual", "sem crm", "sem processo", "desorganizado"])) {
    extracted.digitalMaturity = "operacao comercial pouco estruturada";
  } else if (textHasAny(normalizedText, ["ja temos crm", "ja rodamos trafego", "ja temos equipe", "ja estruturado"])) {
    extracted.digitalMaturity = "operacao comercial em fase mais madura";
  }

  const channels = channelTerms.filter((term) => textHasAny(normalizedText, [term]));
  if (channels.length) {
    extracted.currentChannels = Array.from(new Set(channels)).join(", ");
  }

  const teamMatch = normalizedText.match(/\b(?:somos|tenho|equipe de|time de)\s+(\d{1,2})\b/i);
  if (teamMatch?.[1]) {
    extracted.teamSize = `${teamMatch[1]} pessoas`;
  }

  for (const field of tenantAi.mandatoryQuestions) {
    const key = normalizeFieldKey(field);
    if (!key || extracted[key]) continue;
    if (textHasAny(lowerText, normalizeWords(field))) {
      extracted[key] = "mencionado_na_conversa";
    }
  }

  return Object.keys(extracted).length ? extracted : undefined;
}

function buildConversationLink(tenantId: string, chatId: string) {
  const explicitBase =
    String(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  if (!explicitBase) {
    return `tenant=${tenantId} chat=${chatId}`;
  }

  return `${explicitBase.replace(/\/$/, "")}/cliente/painel/inbox?chatId=${encodeURIComponent(chatId)}`;
}

export async function handleIncomingMessage(
  input: HandleIncomingMessageInput
): Promise<HandleIncomingMessageResult> {
  const startedAt = Date.now();
  const tenantId = input.tenantId.trim();
  const chatId = input.chatId.trim();
  const messageId = input.messageId.trim();

  if (!tenantId || !chatId || !messageId) {
    return { decision: "skip", reason: "invalid_payload" };
  }

  const logDocId = safeLogDocId(tenantId, chatId, messageId);
  const existingLog = await adminDb.collection("ai_logs").doc(logDocId).get();
  if (existingLog.exists) {
    return { decision: "skip", reason: "already_processed" };
  }

  const [chatSnap, messageSnap, tenantSettings, chatState] = await Promise.all([
    adminDb.collection("chats").doc(chatId).get(),
    adminDb.collection("messages").doc(messageId).get(),
    getTenantSettings(tenantId),
    getChatState(tenantId, chatId),
  ]);

  if (!chatSnap.exists || !messageSnap.exists) {
    return { decision: "skip", reason: "chat_or_message_not_found" };
  }

  const chatData = chatSnap.data() as Record<string, unknown>;
  if (String(chatData.tenantId || "") !== tenantId) {
    return { decision: "skip", reason: "chat_tenant_mismatch" };
  }

  const incomingMessage = messageSnap.data() as Record<string, unknown>;
  const incomingSender = String(incomingMessage.sender || "").toLowerCase();
  const leadId = sanitizeText(chatData.leadId, 160) || undefined;

  if (incomingSender !== "client") {
    return { decision: "skip", reason: "not_client_message" };
  }

  const multimodal = await enrichInboundMessageForAgent({
    tenantId,
    chatId,
    messageId,
    message: incomingMessage,
  });
  const inboundText = sanitizeText(multimodal.normalizedText || summarizeMessageForAgent(incomingMessage), 1400);

  const aiConfig = parseAiConfig(tenantSettings);
  const runtimeProvider = aiConfig.runtimePolicy.primaryProvider;
  const runtimeModel = aiConfig.runtimePolicy.conversationModel;
  const chatChannel = String(chatData.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  const isMetaConversation = isMetaConversationChannelType(chatChannel);

  if (!aiConfig.enabled) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "tenant_ai_disabled",
      inboundText,
      outboundText: "",
      toolCalls: ["tenant_settings.ai.enabled"],
      provider: runtimeProvider,
      model: runtimeModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      latencyMs: Date.now() - startedAt,
    });
    return { decision: "skip", reason: "tenant_ai_disabled" };
  }

  if (chatState.aiEnabled === false) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "chat_ai_paused",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.aiEnabled"],
      provider: runtimeProvider,
      model: runtimeModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      latencyMs: Date.now() - startedAt,
    });
    return { decision: "skip", reason: "chat_ai_paused" };
  }

  if (chatState.pausedUntil && chatState.pausedUntil.getTime() > Date.now()) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "chat_ai_paused_until",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.pausedUntil"],
      provider: runtimeProvider,
      model: runtimeModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      latencyMs: Date.now() - startedAt,
    });
    return { decision: "skip", reason: "chat_ai_paused_until" };
  }

  if (chatState.humanOwnerUserId) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "human_takeover_active",
      inboundText,
      outboundText: "",
      toolCalls: ["chat_state.humanOwnerUserId"],
      provider: runtimeProvider,
      model: runtimeModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      latencyMs: Date.now() - startedAt,
    });
    return { decision: "skip", reason: "human_takeover_active" };
  }

  const [conversation, kbDocs, runtimeState, leadMemory] = await Promise.all([
    fetchConversation(chatId, tenantId),
    fetchKbDocs(tenantId, inboundText),
    getConversationRuntimeState(tenantId, chatId),
    leadId ? getLeadMemory(tenantId, leadId) : Promise.resolve(null),
  ]);

  const runtimeStateSummary = summarizeRuntimeStateForAgent(runtimeState);
  const leadMemorySummary = summarizeLeadMemoryForAgent(leadMemory);
  const preferredContactName =
    sanitizeText(leadMemory?.preferredName, 80) ||
    sanitizeText(runtimeState?.preferredName, 80) ||
    (looksLikeHumanName(chatData.contactName) ? sanitizeText(chatData.contactName, 120) : "") ||
    undefined;

  const llmResult =
    runtimeProvider !== "altum_rules"
      ? await runConversationAgent(
          {
            tenantId,
            chatId,
            inboundText,
            channel: chatChannel,
            contactName: preferredContactName,
            runtimeStateSummary: runtimeStateSummary || undefined,
            leadMemorySummary: leadMemorySummary || undefined,
            toneOfVoice: aiConfig.toneOfVoice,
            businessSummary: aiConfig.businessSummary,
            objective: aiConfig.objective,
            guardrails: aiConfig.guardrails,
            mandatoryQuestions: aiConfig.mandatoryQuestions,
            escalationTopics: aiConfig.escalationTopics,
            playbookOffers: aiConfig.playbookOffers,
            playbookScripts: aiConfig.playbookScripts,
            tier: aiConfig.tier,
            autonomyMode: aiConfig.autonomyMode,
            reasoningLevel: aiConfig.reasoningLevel,
            responseStyle: aiConfig.responseStyle,
            conversation,
            kbDocs,
            preferredProviders: aiConfig.preferredProviders,
          },
          aiConfig.runtimePolicy
        )
      : null;
  const fallbackChoice = decide({ inboundText, kbDocs, tenantAi: aiConfig });
  const choice = resolveConversationalChoice({
    fallbackChoice,
    llmDecision: llmResult?.decision,
    llmReason: llmResult?.reason || null,
    llmConfidence: llmResult?.confidence ?? null,
    llmNextAction: llmResult?.nextAction || null,
    llmResponseText: llmResult?.responseText || null,
    llmTurnGoal: llmResult?.turnGoal || null,
    inboundText,
  });
  const heuristicExtractedFields = extractBusinessFields(inboundText, aiConfig) || null;
  const extractedFields = normalizeExtractedFieldsForCrm(llmResult?.extractedFields || heuristicExtractedFields) || null;
  const plannerDecision = deriveOperationalPlan({
    inboundText,
    messageType: sanitizeText(incomingMessage.type, 40) || null,
    choice,
    llmDecision: choice.decision === "handoff" ? "handoff" : llmResult?.decision,
    llmReason: choice.reason || llmResult?.reason || null,
    llmConfidence: choice.confidence ?? llmResult?.confidence ?? null,
    llmTurnGoal: llmResult?.turnGoal || null,
    runtimeState,
    leadMemory,
    extractedFields,
    conversation,
    kbDocs,
    tenantAi: {
      escalationTopics: aiConfig.escalationTopics,
      playbookOffers: aiConfig.playbookOffers,
    },
  });
  const nextAction = plannerDecision.nextAction || choice.nextAction;
  const effectiveProvider = llmResult?.provider || runtimeProvider;
  const effectiveModel = llmResult?.model || runtimeModel;

  const shouldUseWhatsApp = chatChannel === "whatsapp";
  const whatsappChannel = shouldUseWhatsApp
    ? await getWhatsAppChannelForTenant(tenantId, {
        allowAgencyFallback: tenantId === "ALTUM_AGENCY",
      })
    : null;
  const metaChannel = isMetaConversation
    ? await getMetaChannelForTenant(tenantId, chatChannel, {
        channelId: String(chatData.channelId || "").trim() || null,
        externalAccountId: String(chatData.channelExternalAccountId || "").trim() || null,
        pageId: String(chatData.channelPageId || "").trim() || null,
      })
    : null;

  if (shouldUseWhatsApp && !whatsappChannel) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "channel_not_found",
      inboundText,
      outboundText: "",
      toolCalls: ["tenant_channels.whatsapp"],
      confidence: choice.confidence,
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      extractedFields,
      nextAction,
      latencyMs: Date.now() - startedAt,
      provider: effectiveProvider,
      model: effectiveModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      plannerIntent: plannerDecision.intent,
      stateBefore: plannerDecision.stateBefore,
      stateAfter: plannerDecision.stateAfter,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      objectionType: plannerDecision.objectionType || null,
      commercialTemperature: plannerDecision.commercialTemperature || null,
    });
    return { decision: "skip", reason: "channel_not_found" };
  }
  if (isMetaConversation && !metaChannel) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "channel_not_found",
      inboundText,
      outboundText: "",
      toolCalls: [`tenant_channels.${chatChannel}`],
      confidence: choice.confidence,
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      latencyMs: Date.now() - startedAt,
      provider: effectiveProvider,
      model: effectiveModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
    });
    return { decision: "skip", reason: "channel_not_found" };
  }

  const leadPhone = shouldUseWhatsApp ? normalizePhone(String(chatData.contactPhone || "")) : "";
  if (shouldUseWhatsApp && !leadPhone) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "lead_phone_missing",
      inboundText,
      outboundText: "",
      toolCalls: ["chats.contactPhone"],
      confidence: choice.confidence,
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      latencyMs: Date.now() - startedAt,
      provider: effectiveProvider,
      model: effectiveModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
    });
    return { decision: "skip", reason: "lead_phone_missing" };
  }
  const metaRecipientId = isMetaConversation
    ? sanitizeText(chatData.contactExternalId, 180)
    : "";
  if (isMetaConversation && !metaRecipientId) {
    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "lead_external_id_missing",
      inboundText,
      outboundText: "",
      toolCalls: ["chats.contactExternalId"],
      confidence: choice.confidence,
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      latencyMs: Date.now() - startedAt,
      provider: effectiveProvider,
      model: effectiveModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
    });
    return { decision: "skip", reason: "lead_external_id_missing" };
  }

  if (choice.decision === "handoff" || plannerDecision.decision === "handoff") {
    const conversationLink = buildConversationLink(tenantId, chatId);
    const summaryBullets = summarizeForResponsible(conversation);

    const leadAck =
      "Perfeito, vou acionar um especialista humano agora e priorizar seu atendimento.";
    const quality = scoreAltumConversationQuality({
      inboundText,
      outboundText: leadAck,
      plan: plannerDecision,
      runtimeState,
    });

    if (shouldUseWhatsApp && whatsappChannel && leadPhone) {
      await sendMetaTextMessage({
        channel: whatsappChannel,
        to: leadPhone,
        text: leadAck,
      });
    } else if (isMetaConversation && metaChannel && metaRecipientId) {
      await sendMetaConversationText({
        channel: metaChannel,
        recipientId: metaRecipientId,
        text: leadAck,
      });
    }

    await addMessage({
      chatId,
      tenantId,
      text: leadAck,
      sender: "agent",
      channel: chatChannel,
      channelPhoneNumberId: whatsappChannel?.phoneNumberId,
      senderName: "AI Sales Agent",
    });

    const systemEventText =
      "IA solicitou handoff para humano. Conversa sinalizada para atendimento prioritario.";

    await addMessage({
      chatId,
      tenantId,
      text: systemEventText,
      sender: "system",
      channel: chatChannel,
      channelPhoneNumberId: whatsappChannel?.phoneNumberId,
    });

    if (aiConfig.responsiblePhone && whatsappChannel) {
      const notification = [
        `Handoff solicitado para tenant ${tenantId}.`,
        `Conversa: ${chatId}`,
        `Lead: ${String(chatData.contactName || "Contato")} (${leadPhone})`,
        `Inbox: ${conversationLink}`,
        "Resumo:",
        ...summaryBullets,
      ].join("\n");

      await sendMetaTextMessage({
        channel: whatsappChannel,
        to: aiConfig.responsiblePhone,
        text: notification,
      });
    }

    await upsertChatState({
      tenantId,
      chatId,
      aiEnabled: false,
      pausedUntil: new Date(Date.now() + 30 * 60 * 1000),
      humanOwnerUserId: String(chatData.ownerId || "") || null,
      updatedByName: "AI Sales Agent",
      pauseReason: "handoff_requested",
    });

    const executedActions = await executeAltumAgentActions({
      tenantId,
      chatId,
      leadId,
      plan: plannerDecision,
      runtimeState,
      extractedFields,
      inboundText,
      businessProfileId: aiConfig.businessProfileId,
      leadName: sanitizeText(chatData.contactName, 120) || null,
    });

    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "handoff",
      reason: plannerDecision.reason || choice.reason,
      inboundText,
      outboundText: leadAck,
      toolCalls: [
        "kb_docs",
        "chat_state",
        "tenant_settings.ai",
        shouldUseWhatsApp ? "whatsapp_send" : isMetaConversation ? "meta_send" : "site_chat_reply",
        aiConfig.responsiblePhone && whatsappChannel ? "handoff_notify" : "handoff_log",
      ],
      confidence: Math.max(choice.confidence, plannerDecision.confidence || 0),
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      latencyMs: Date.now() - startedAt,
      provider: effectiveProvider,
      model: effectiveModel,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      plannerIntent: plannerDecision.intent,
      stateBefore: plannerDecision.stateBefore,
      stateAfter: plannerDecision.stateAfter,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      objectionType: plannerDecision.objectionType || null,
      commercialTemperature: plannerDecision.commercialTemperature || null,
      llmTurnGoal: llmResult?.turnGoal || null,
      llmMemorySummary: llmResult?.memorySummary || null,
      conversationLedBy: choice.ledBy,
      qualityScore: quality.score,
      qualityNotes: quality.notes,
    });
    await logAiUsage({
      tenantId,
      scope: "conversation",
      provider: effectiveProvider,
      model: effectiveModel,
      agentId: "sales_autopilot_v1",
      chatId,
      leadId,
      messageId,
      aiLogId: logDocId,
      decision: "handoff",
      confidence: Math.max(choice.confidence, plannerDecision.confidence || 0),
      latencyMs: Date.now() - startedAt,
      inputTokens: llmResult?.inputTokens ?? 0,
      outputTokens: llmResult?.outputTokens ?? 0,
      estimatedCostUsd: llmResult?.estimatedCostUsd ?? 0,
      tier: aiConfig.tier,
      autonomyMode: aiConfig.autonomyMode,
      reasoningLevel: aiConfig.reasoningLevel,
      responseStyle: aiConfig.responseStyle,
      status: "success",
      metadata: {
        reason: plannerDecision.reason || choice.reason,
        runtimePolicy: aiConfig.runtimePolicy,
        fallbackUsed: llmResult?.fallbackUsed || false,
        matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
        extractedFields,
        nextAction,
        plannerIntent: plannerDecision.intent,
        stateBefore: plannerDecision.stateBefore,
        stateAfter: plannerDecision.stateAfter,
        responseGoal: plannerDecision.responseGoal,
        recommendedOffer: plannerDecision.recommendedOffer || null,
        objectionType: plannerDecision.objectionType || null,
        commercialTemperature: plannerDecision.commercialTemperature || null,
        conversationLedBy: choice.ledBy,
        qualityScore: quality.score,
        qualityNotes: quality.notes,
        executedActions,
      },
    });

    await trackAltumAgentLearning({
      tenantId,
      chatId,
      leadId,
      aiLogId: logDocId,
      decision: "handoff",
      intent: plannerDecision.intent,
      responseGoal: plannerDecision.responseGoal,
      stateAfter: plannerDecision.stateAfter,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      objectionType: plannerDecision.objectionType || null,
      nextAction,
      confidence: Math.max(choice.confidence, plannerDecision.confidence || 0),
      commercialTemperature: plannerDecision.commercialTemperature || null,
      qualityScore: quality.score,
    });

    if (leadId && nextAction) {
      await runLeadAutomations({
        tenantId,
        trigger: "ai_next_action",
        leadId,
        actorId: "ai_sales_agent",
        actorName: "AI Sales Agent",
        chatId,
        channel: chatChannel,
        messageText: inboundText,
        aiNextAction: nextAction,
      });
    }

    await upsertConversationRuntimeState({
      tenantId,
      chatId,
      leadId,
      inboundText,
      outboundText: leadAck,
      decision: "handoff",
      reason: plannerDecision.reason || choice.reason,
      confidence: Math.max(choice.confidence, plannerDecision.confidence || 0),
      nextAction,
      stage: plannerDecision.stateAfter,
      intent: plannerDecision.intent,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      objectionType: plannerDecision.objectionType || null,
      turnGoal: llmResult?.turnGoal || null,
      memorySummary: llmResult?.memorySummary || null,
      summary: [
        llmResult?.turnGoal ? `Objetivo do turno: ${llmResult.turnGoal}` : "",
        plannerDecision.intent ? `Intencao: ${plannerDecision.intent}` : "",
        plannerDecision.recommendedOffer ? `Oferta: ${plannerDecision.recommendedOffer}` : "",
        plannerDecision.nextAction ? `Acao: ${plannerDecision.nextAction}` : "",
        llmResult?.memorySummary ? `Memoria: ${llmResult.memorySummary}` : "",
      ]
        .filter(Boolean)
        .join(" | "),
      extractedFields,
    });

    if (leadId) {
      await upsertLeadMemory({
        tenantId,
        leadId,
        extractedFields,
        nextAction,
        recommendedOffer: plannerDecision.recommendedOffer || null,
        dominantIntent: plannerDecision.intent,
        dominantObjection: plannerDecision.objectionType || null,
        preferredName: preferredContactName || null,
        leadTone: extractedFields?.leadTone || runtimeState?.leadTone || null,
        activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || null,
        openQuestion: leadAck,
        conversationMaturity: plannerDecision.stateAfter,
        memorySummary: llmResult?.memorySummary || null,
        summary: [
          llmResult?.memorySummary || "",
          extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || "",
          extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || "",
          plannerDecision.recommendedOffer || "",
        ]
          .filter(Boolean)
          .join(" | "),
      });
    }

    return { decision: "handoff", reason: plannerDecision.reason || choice.reason };
  }

  const responseText =
    chooseConversationalReply({
      llmResponseText: llmResult?.responseText || choice.responseText || "",
      previousOutboundText: runtimeState?.lastOutboundText || null,
      fallbackWriterText: makeLeadFacingReply({
        tenantAi: aiConfig,
        decision: choice.decision,
        inboundText,
        kbDocs,
        conversation,
        contactName: preferredContactName || null,
      }),
    }) || "Perfeito. Me conta so mais um ponto rapido para eu te orientar melhor.";
  const quality = scoreAltumConversationQuality({
    inboundText,
    outboundText: responseText,
    plan: plannerDecision,
    runtimeState,
  });

  if (shouldUseWhatsApp && whatsappChannel && leadPhone) {
    await sendMetaTextMessage({
      channel: whatsappChannel,
      to: leadPhone,
      text: responseText,
    });
  } else if (isMetaConversation && metaChannel && metaRecipientId) {
    await sendMetaConversationText({
      channel: metaChannel,
      recipientId: metaRecipientId,
      text: responseText,
    });
  }

  await addMessage({
    chatId,
    tenantId,
    text: responseText,
    sender: "agent",
    channel: chatChannel,
    channelPhoneNumberId: whatsappChannel?.phoneNumberId,
    senderName: "AI Sales Agent",
  });

  let voiceReplySent = false;
  const shouldSendVoiceReply =
    shouldUseWhatsApp &&
    Boolean(whatsappChannel) &&
    Boolean(leadPhone) &&
    String(incomingMessage.type || "").toLowerCase() === "audio";

  if (shouldSendVoiceReply && whatsappChannel && leadPhone) {
    try {
      const voiceSent = await sendAltumVoiceReply({
        channel: whatsappChannel,
        to: leadPhone,
        text: responseText,
        tenantId,
        chatId,
      });

      await addMessage({
        chatId,
        tenantId,
        text: "[Resposta em audio enviada]",
        sender: "agent",
        type: "audio",
        channel: chatChannel,
        channelPhoneNumberId: whatsappChannel.phoneNumberId,
        senderName: "AI Sales Agent",
        mediaUrl: voiceSent.signedUrl,
        mediaName: "Resposta em audio ALTUM",
        mediaMimeType: voiceSent.contentType,
        metaMessageId: voiceSent.metaMessageId,
      });
      voiceReplySent = true;
    } catch (error) {
      console.error("Falha ao enviar resposta em voz da IA:", error);
    }
  }

  const executedActions = await executeAltumAgentActions({
    tenantId,
    chatId,
    leadId,
    plan: plannerDecision,
    runtimeState,
    extractedFields,
    inboundText,
    businessProfileId: aiConfig.businessProfileId,
    leadName: sanitizeText(chatData.contactName, 120) || null,
  });

  await saveAiLog({
    logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: choice.decision,
    reason: choice.reason,
    inboundText,
    outboundText: responseText,
    toolCalls: [
      "kb_docs",
      "chat_state",
      "tenant_settings.ai",
      shouldUseWhatsApp ? "whatsapp_send" : isMetaConversation ? "meta_send" : "site_chat_reply",
    ],
    confidence: choice.confidence,
    matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
    extractedFields,
    nextAction,
    latencyMs: Date.now() - startedAt,
    provider: effectiveProvider,
    model: effectiveModel,
    tier: aiConfig.tier,
    autonomyMode: aiConfig.autonomyMode,
    reasoningLevel: aiConfig.reasoningLevel,
    responseStyle: aiConfig.responseStyle,
    plannerIntent: plannerDecision.intent,
    stateBefore: plannerDecision.stateBefore,
    stateAfter: plannerDecision.stateAfter,
    responseGoal: plannerDecision.responseGoal,
    recommendedOffer: plannerDecision.recommendedOffer || null,
    objectionType: plannerDecision.objectionType || null,
    commercialTemperature: plannerDecision.commercialTemperature || null,
    llmTurnGoal: llmResult?.turnGoal || null,
    llmMemorySummary: llmResult?.memorySummary || null,
    conversationLedBy: choice.ledBy,
    qualityScore: quality.score,
    qualityNotes: quality.notes,
  });
  await logAiUsage({
    tenantId,
    scope: "conversation",
    provider: effectiveProvider,
    model: effectiveModel,
    agentId: "sales_autopilot_v1",
      chatId,
      leadId,
      messageId,
    aiLogId: logDocId,
    decision: choice.decision,
    confidence: choice.confidence,
    latencyMs: Date.now() - startedAt,
    inputTokens: llmResult?.inputTokens ?? 0,
    outputTokens: llmResult?.outputTokens ?? 0,
    estimatedCostUsd: llmResult?.estimatedCostUsd ?? 0,
    tier: aiConfig.tier,
    autonomyMode: aiConfig.autonomyMode,
    reasoningLevel: aiConfig.reasoningLevel,
    responseStyle: aiConfig.responseStyle,
    status: "success",
    metadata: {
      reason: choice.reason,
      runtimePolicy: aiConfig.runtimePolicy,
      fallbackUsed: llmResult?.fallbackUsed || false,
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      extractedFields,
      nextAction,
      plannerIntent: plannerDecision.intent,
      stateBefore: plannerDecision.stateBefore,
      stateAfter: plannerDecision.stateAfter,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      objectionType: plannerDecision.objectionType || null,
      commercialTemperature: plannerDecision.commercialTemperature || null,
      conversationLedBy: choice.ledBy,
      qualityScore: quality.score,
      qualityNotes: quality.notes,
      executedActions,
      voiceReplySent,
    },
  });

  await trackAltumAgentLearning({
    tenantId,
    chatId,
    leadId,
    aiLogId: logDocId,
    decision: choice.decision,
    intent: plannerDecision.intent,
    responseGoal: plannerDecision.responseGoal,
    stateAfter: plannerDecision.stateAfter,
    recommendedOffer: plannerDecision.recommendedOffer || null,
    objectionType: plannerDecision.objectionType || null,
    nextAction,
    confidence: choice.confidence,
    commercialTemperature: plannerDecision.commercialTemperature || null,
    qualityScore: quality.score,
  });

  if (leadId && nextAction) {
    await runLeadAutomations({
      tenantId,
      trigger: "ai_next_action",
      leadId,
      actorId: "ai_sales_agent",
      actorName: "AI Sales Agent",
      chatId,
      channel: chatChannel,
      messageText: inboundText,
      aiNextAction: nextAction,
    });
  }

  await upsertConversationRuntimeState({
    tenantId,
    chatId,
    leadId,
    inboundText,
    outboundText: responseText,
    decision: choice.decision,
    reason: choice.reason,
    confidence: choice.confidence,
    nextAction,
    stage: plannerDecision.stateAfter,
    intent: plannerDecision.intent,
    responseGoal: plannerDecision.responseGoal,
    recommendedOffer: plannerDecision.recommendedOffer || null,
    objectionType: plannerDecision.objectionType || null,
    turnGoal: llmResult?.turnGoal || null,
    memorySummary: llmResult?.memorySummary || null,
    summary: [
      plannerDecision.intent ? `Intencao: ${plannerDecision.intent}` : "",
      plannerDecision.recommendedOffer ? `Oferta: ${plannerDecision.recommendedOffer}` : "",
      plannerDecision.nextAction ? `Acao: ${plannerDecision.nextAction}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
    extractedFields,
  });

  if (leadId) {
    await upsertLeadMemory({
      tenantId,
      leadId,
      extractedFields,
      nextAction,
      recommendedOffer: plannerDecision.recommendedOffer || null,
      dominantIntent: plannerDecision.intent,
      dominantObjection: plannerDecision.objectionType || null,
      preferredName: preferredContactName || null,
      leadTone: extractedFields?.leadTone || runtimeState?.leadTone || null,
      activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || null,
      openQuestion: responseText,
      conversationMaturity: plannerDecision.stateAfter,
      memorySummary: llmResult?.memorySummary || null,
      summary: [
        llmResult?.memorySummary || "",
        extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || "",
        extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || "",
        plannerDecision.recommendedOffer || "",
      ]
        .filter(Boolean)
        .join(" | "),
    });
  }

  return {
    decision: choice.decision,
    reason: choice.reason,
  };
}


