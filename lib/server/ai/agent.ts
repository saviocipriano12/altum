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
import { getAiMonthlyUsageSnapshot, logAiUsage } from "@/lib/server/ai/usage-ledger";
import { trackAltumAgentLearning } from "@/lib/server/ai/learning-loop";
import {
  trackAppointmentOutcome,
  trackProposalOutcome,
} from "@/lib/server/ai/learning-outcomes";
import { getTenantLearningHints, type AltumTenantLearningHints } from "@/lib/server/ai/tenant-learning";
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
import {
  getWhatsAppChannelForTenant,
  sendMetaMediaLinkMessage,
  sendMetaTemplateMessage,
  sendMetaTextMessage,
} from "@/app/lib/server/whatsapp-channel";
import { getTenantSettings, isTenantBillingBlocked } from "@/lib/server/tenant";
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
import { syncLeadCommercialState } from "@/lib/server/crm/operations";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
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
  lastJobStatus?: string | null;
  lastJobError?: string | null;
  lastJobErrorCode?: string | null;
  lastDecision?: string | null;
  lastDecisionReason?: string | null;
  lastDecisionReasonCode?: string | null;
  lastProcessedAt?: unknown;
  lastJobId?: string | null;
  lastMessageId?: string | null;
  lastHandoffNotifyAt?: unknown;
  lastHandoffNotifyMessageId?: string | null;
  lastHandoffNotifyStatus?: string | null;
  lastHandoffNotifyRecipients?: number | null;
  lastHandoffNotifySuccessCount?: number | null;
  lastHandoffNotifyFailureCount?: number | null;
  responseFormatPreference?: "audio" | "text" | null;
  responseFormatPreferenceUpdatedAt?: unknown;
  responseFormatPreferenceAskedAt?: unknown;
  responseFormatPreferenceAskCount?: number | null;
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score: number;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | "document" | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  upsellKeys?: string[];
  crossSellKeys?: string[];
  priority?: number | null;
  availability?: "active" | "seasonal" | "paused";
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
  responsePaused: boolean;
  businessProfileId: BusinessProfileId;
  businessProfileLabel: string;
  agentName: string;
  toneOfVoice: string;
  businessSummary: string;
  objective: string;
  responsiblePhone: string;
  handoffNotifyEnabled: boolean;
  handoffNotifyPhones: string[];
  voiceReplyEnabled: boolean;
  voiceReplyVoice: string;
  voiceReplyMode: "audio_only" | "smart" | "always";
  voiceReplyMaxChars: number;
  whatsappTemplateFollowUpEnabled: boolean;
  whatsappTemplateFollowUpName: string;
  whatsappTemplateFollowUpLanguage: string;
  whatsappTemplateFollowUpParams: string[];
  guardrails: string[];
  mandatoryQuestions: string[];
  escalationTopics: string[];
  playbookOffers: BusinessProfilePlaybookOffer[];
  playbookScripts: BusinessProfilePlaybookScript[];
  learningHints?: AltumTenantLearningHints | null;
  tier: AltumAiTier;
  autonomyMode: AltumAiAutonomyMode;
  reasoningLevel: AltumAiReasoningLevel;
  responseStyle: AltumAiResponseStyle;
  allowPremiumModels: boolean;
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
  const previousQuestion = previousResponse.includes("?") ? previousResponse : "";
  const questionLooksRepeated = (value: string) => {
    const comparable = normalizeComparable(value);
    if (!previousQuestion || !comparable.includes("?")) return false;
    const important = previousQuestion
      .replace(/\b(pra|para|voce|você|me|te|um|uma|com|que|qual|quais|hoje|agora|rapidinho)\b/g, " ")
      .split(/\s+/)
      .filter((item) => item.length >= 4)
      .slice(0, 10);
    if (important.length < 3) return false;
    const hits = important.filter((word) => comparable.includes(word)).length;
    return hits >= Math.min(4, important.length);
  };

  const llmComparable = normalizeComparable(llmResponse);
  const fallbackComparable = normalizeComparable(fallbackResponse);

  const llmLooksRepeated =
    Boolean(llmComparable) &&
    Boolean(previousResponse) &&
    llmComparable.length >= 20 &&
    previousResponse.length >= 20 &&
    llmComparable === previousResponse;

  if (llmResponse && !llmLooksRepeated && !questionLooksRepeated(llmResponse)) return llmResponse;
  if (fallbackResponse && fallbackComparable !== previousResponse && !questionLooksRepeated(fallbackResponse)) {
    return fallbackResponse;
  }
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
    leadMemory.attributionSourceLabel || leadMemory.attributionSource || leadMemory.attributionChannel
      ? `origem do lead: ${[
          leadMemory.attributionSourceLabel,
          leadMemory.attributionSource,
          leadMemory.attributionChannel,
        ].filter(Boolean).join(" / ")}`
      : "",
    leadMemory.attributionCampaign
      ? `campanha de entrada: ${leadMemory.attributionCampaign}${leadMemory.attributionMedium ? ` (${leadMemory.attributionMedium})` : ""}`
      : "",
    leadMemory.lastOutboundCampaignName
      ? `ultimo disparo enviado: ${leadMemory.lastOutboundCampaignName}${
          leadMemory.lastOutboundTemplateName ? ` / template ${leadMemory.lastOutboundTemplateName}` : ""
        }${leadMemory.lastOutboundChannel ? ` / canal ${leadMemory.lastOutboundChannel}` : ""}`
      : "",
    leadMemory.lastOutboundMessage ? `mensagem do ultimo disparo: ${leadMemory.lastOutboundMessage}` : "",
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
    .slice(0, 8)
    .join(" | ");
}

function buildPersistentConversationSummary(input: {
  llmMemorySummary?: string | null;
  preferredName?: string | null;
  leadTone?: string | null;
  activeTopic?: string | null;
  conversationMaturity?: string | null;
  businessType?: string | null;
  primaryGoal?: string | null;
  currentChannels?: string | null;
  dominantObjection?: string | null;
  openQuestion?: string | null;
  recommendedOffer?: string | null;
  nextAction?: string | null;
}) {
  return [
    sanitizeText(input.llmMemorySummary, 220)
      ? `Memoria viva: ${sanitizeText(input.llmMemorySummary, 220)}`
      : "",
    sanitizeText(input.preferredName, 80) ? `Nome: ${sanitizeText(input.preferredName, 80)}` : "",
    sanitizeText(input.leadTone, 80) ? `Tom: ${sanitizeText(input.leadTone, 80)}` : "",
    sanitizeText(input.activeTopic, 120) ? `Assunto: ${sanitizeText(input.activeTopic, 120)}` : "",
    sanitizeText(input.conversationMaturity, 80)
      ? `Momento: ${sanitizeText(input.conversationMaturity, 80)}`
      : "",
    sanitizeText(input.businessType, 120) ? `Negocio: ${sanitizeText(input.businessType, 120)}` : "",
    sanitizeText(input.primaryGoal, 180) ? `Objetivo: ${sanitizeText(input.primaryGoal, 180)}` : "",
    sanitizeText(input.currentChannels, 220) ? `Canais: ${sanitizeText(input.currentChannels, 220)}` : "",
    sanitizeText(input.dominantObjection, 120)
      ? `Objecao: ${sanitizeText(input.dominantObjection, 120)}`
      : "",
    sanitizeText(input.openQuestion, 180) ? `Pergunta em aberto: ${sanitizeText(input.openQuestion, 180)}` : "",
    sanitizeText(input.recommendedOffer, 160)
      ? `Oferta sugerida: ${sanitizeText(input.recommendedOffer, 160)}`
      : "",
    sanitizeText(input.nextAction, 160) ? `Proximo passo: ${sanitizeText(input.nextAction, 160)}` : "",
  ]
    .filter(Boolean)
    .slice(0, 7)
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

function normalizeEmail(value: unknown) {
  const clean = sanitizeText(value, 180).toLowerCase();
  if (!clean) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(clean)) return "";
  return clean;
}

function extractPhoneCandidates(record?: Record<string, unknown> | null) {
  if (!record) return [] as string[];
  const rawCandidates = [
    record.phone,
    record.telefone,
    record.mobile,
    record.celular,
    record.whatsapp,
    record.whatsappPhone,
    record.whatsapp_phone,
    record.whatsappNumber,
    record.whatsapp_number,
    record.contactPhone,
  ];

  return Array.from(
    new Set(
      rawCandidates
        .map((value) => normalizePhone(String(value || "")))
        .filter(Boolean)
    )
  ).slice(0, 4);
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
  lastJobStatus?: string | null;
  lastJobError?: string | null;
  lastJobErrorCode?: string | null;
  lastDecision?: string | null;
  lastDecisionReason?: string | null;
  lastDecisionReasonCode?: string | null;
  lastProcessedAt?: Date | null;
  lastJobId?: string | null;
  lastMessageId?: string | null;
  lastHandoffNotifyAt?: Date | null;
  lastHandoffNotifyMessageId?: string | null;
  lastHandoffNotifyStatus?: string | null;
  lastHandoffNotifyRecipients?: number | null;
  lastHandoffNotifySuccessCount?: number | null;
  lastHandoffNotifyFailureCount?: number | null;
  responseFormatPreference?: "audio" | "text" | null;
  responseFormatPreferenceUpdatedAt?: Date | null;
  responseFormatPreferenceAskedAt?: Date | null;
  responseFormatPreferenceAskCount?: number | null;
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

type ResponseFormatPreference = "audio" | "text";

function normalizeResponsePreferenceText(value: string) {
  return sanitizeText(value, 260)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferResponseFormatPreference(input: {
  inboundText: string;
  messageType?: string | null;
  previousAskedAt?: Date | null;
}) {
  const normalizedType = sanitizeText(input.messageType, 40).toLowerCase();
  if (normalizedType === "audio") {
    return { preference: "audio" as ResponseFormatPreference, reason: "inbound_audio" };
  }

  const text = normalizeResponsePreferenceText(input.inboundText);
  if (!text) return { preference: null as ResponseFormatPreference | null, reason: "empty_text" };

  const asksAudio =
    /\b(audio|voz|falado|falar|locucao)\b/.test(text) &&
    /\b(prefiro|preferi|prefere|quero|manda|mandar|pode|poderia|responde|responder)\b/.test(text);
  const asksText =
    /\b(texto|escrito|digitado|mensagem)\b/.test(text) &&
    /\b(prefiro|preferi|prefere|quero|manda|mandar|pode|poderia|responde|responder)\b/.test(text);

  if (asksAudio) return { preference: "audio" as ResponseFormatPreference, reason: "explicit_audio_preference" };
  if (asksText) return { preference: "text" as ResponseFormatPreference, reason: "explicit_text_preference" };

  const askedRecently =
    Boolean(input.previousAskedAt) && Date.now() - (input.previousAskedAt?.getTime() || 0) <= 30 * 60 * 1000;
  if (askedRecently) {
    if (/^(sim|pode|claro|fechado|ok|okay|manda|pode mandar)(\s|$)/.test(text)) {
      return { preference: "audio" as ResponseFormatPreference, reason: "reply_yes_after_audio_offer" };
    }
    if (/^(nao|melhor nao|prefiro texto|texto)(\s|$)/.test(text)) {
      return { preference: "text" as ResponseFormatPreference, reason: "reply_no_after_audio_offer" };
    }
  }

  return { preference: null as ResponseFormatPreference | null, reason: "no_preference_signal" };
}

function shouldOfferResponseFormatChoice(input: {
  chatState: ChatState;
  messageType?: string | null;
  inboundText: string;
  conversation: ConversationMessage[];
}) {
  if (input.chatState.responseFormatPreference) return false;
  const normalizedType = sanitizeText(input.messageType, 40).toLowerCase();
  if (!["text", "audio"].includes(normalizedType || "text")) return false;
  const recentlyAsked =
    Boolean(input.chatState.responseFormatPreferenceAskedAt) &&
    Date.now() - (input.chatState.responseFormatPreferenceAskedAt?.getTime() || 0) <= 12 * 60 * 60 * 1000;
  if (recentlyAsked) return false;
  if (/\b(audio|voz|texto|escrito)\b/i.test(input.inboundText)) return false;

  const clientTurns = input.conversation.filter((item) => item.sender === "client").length;
  return clientTurns <= 3;
}

function shouldProactivelySendVoiceReply(input: {
  preference: ResponseFormatPreference | null;
  voiceReplyEnabled: boolean;
  voiceReplyMode?: "audio_only" | "smart" | "always";
  shouldUseWhatsApp: boolean;
  serviceWindowClosed: boolean;
  hasChannel: boolean;
  hasLeadPhone: boolean;
  inboundMessageType?: string | null;
  plannerIntent?: string | null;
  responseGoal?: string | null;
  commercialTemperature?: string | null;
  recommendedOffer?: string | null;
}) {
  if (
    !input.voiceReplyEnabled ||
    !input.shouldUseWhatsApp ||
    input.serviceWindowClosed ||
    !input.hasChannel ||
    !input.hasLeadPhone
  ) {
    return { shouldSend: false, reason: "voice_not_available" };
  }

  const inboundType = sanitizeText(input.inboundMessageType, 40).toLowerCase();
  if (inboundType === "audio") return { shouldSend: true, reason: "inbound_audio" };
  if (input.preference === "text") return { shouldSend: false, reason: "lead_prefers_text" };
  if (input.preference === "audio") return { shouldSend: true, reason: "lead_prefers_audio" };
  if (input.voiceReplyMode === "audio_only") return { shouldSend: false, reason: "voice_audio_only_mode" };
  if (input.voiceReplyMode === "always") return { shouldSend: true, reason: "voice_always_mode" };

  const intent = sanitizeText(input.plannerIntent, 80).toLowerCase();
  const responseGoal = sanitizeText(input.responseGoal, 80).toLowerCase();
  const temperature = sanitizeText(input.commercialTemperature, 40).toLowerCase();
  const hasOffer = Boolean(sanitizeText(input.recommendedOffer, 120));

  const commerciallyGoodMoments =
    ["objection", "recommend", "next_step", "closing", "proposal"].some((term) => intent.includes(term)) ||
    ["recommend", "move_to_next_step", "handle_objection"].includes(responseGoal) ||
    temperature === "hot" ||
    hasOffer;

  return commerciallyGoodMoments
    ? { shouldSend: true, reason: "commercial_moment_voice" }
    : { shouldSend: false, reason: "prefer_text_default" };
}

function shouldPlanAudioResponse(input: {
  preference: ResponseFormatPreference | null;
  voiceReplyEnabled: boolean;
  voiceReplyMode?: "audio_only" | "smart" | "always";
  inboundMessageType?: string | null;
}) {
  if (!input.voiceReplyEnabled) return false;
  const inboundType = sanitizeText(input.inboundMessageType, 40).toLowerCase();
  if (inboundType === "audio") return true;
  if (input.preference === "text") return false;
  if (input.preference === "audio") return true;
  return input.voiceReplyMode === "always";
}

function prepareOutboundTextForAudioDelivery(text: string, inboundText: string) {
  let cleaned = sanitizeText(text, 1800);
  const normalizedInbound = normalizeResponsePreferenceText(inboundText);
  const askedForAudio =
    /\b(audio|voz|falado|falar|locucao)\b/.test(normalizedInbound) &&
    /\b(quero|manda|mandar|pode|poderia|responde|responder|prefiro)\b/.test(normalizedInbound);

  const blockedPatterns = [
    /\b(consigo|posso)\s+(sim\s+)?(te\s+)?(responder|enviar|mandar)[^.?!]{0,80}\baudio\b[^.?!]{0,140}\b(prefiro|melhor)\b[^.?!]*(\.|!|\?)/gi,
    /\b(aqui no whatsapp|por aqui)\s+(eu\s+)?prefiro\s+(manter\s+)?(o\s+)?texto[^.?!]*(\.|!|\?)/gi,
    /\bmas\s+(aqui no whatsapp|por aqui)[^.?!]{0,120}\btexto\b[^.?!]*(\.|!|\?)/gi,
    /\bpara garantir clareza[^.?!]{0,160}\btexto\b[^.?!]*(\.|!|\?)/gi,
    /\bnao\s+(consigo|posso)\s+(enviar|mandar|responder)\s+(por\s+)?audio[^.?!]*(\.|!|\?)/gi,
  ];

  for (const pattern of blockedPatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }
  cleaned = sanitizeText(cleaned, 1800);

  if (!cleaned || /\b(prefiro|melhor)\b[^.?!]{0,100}\btexto\b/i.test(cleaned)) {
    return askedForAudio
      ? "Claro, vou te responder por audio. Me conta o principal ponto que voce quer resolver agora para eu seguir direto."
      : "Perfeito, vou te responder por audio de forma curta e direta. Me conta o ponto principal para eu te orientar melhor.";
  }

  return cleaned;
}

function prepareOutboundTextForVoiceUnavailable(text: string, inboundText: string) {
  const cleaned = prepareOutboundTextForAudioDelivery(text, inboundText)
    .replace(/^claro,\s*vou\s+te\s+responder\s+por\s+audio\.?\s*/i, "")
    .replace(/^perfeito,\s*vou\s+te\s+responder\s+por\s+audio[^.?!]*(\.|!|\?)\s*/i, "")
    .trim();
  return `O envio de audio nao ficou disponivel nesta conversa agora. Para nao te deixar esperando: ${
    cleaned || "me conta o ponto principal que voce quer resolver e eu te ajudo por aqui."
  }`;
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

function parseCatalogStringList(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeText(item, 120))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  if (typeof value === "string") {
    return value
      .split(/,|\n|;|\|/)
      .map((item) => sanitizeText(item, 120))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return [] as string[];
}

function normalizeCatalogAvailability(value: unknown): KbDoc["availability"] {
  const normalized = sanitizeText(value, 30).toLowerCase();
  if (normalized === "seasonal") return "seasonal";
  if (normalized === "paused") return "paused";
  return "active";
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

function parsePhoneLines(value: unknown, maxItems = 8) {
  return Array.from(
    new Set(
      parseLines(value, maxItems)
        .map((item) => normalizePhone(item))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function isWhatsAppServiceWindowClosed(value: unknown) {
  const lastClientMessageAt = toDate(value);
  if (!lastClientMessageAt) return true;
  return Date.now() - lastClientMessageAt.getTime() > 23.5 * 60 * 60 * 1000;
}

function resolveFollowUpTemplateParams(
  baseParams: string[],
  context: { contactName?: unknown; contactPhone?: unknown; tenantName?: unknown }
) {
  const firstName =
    sanitizeText(context.contactName, 120)
      .split(/\s+/)
      .filter(Boolean)[0] || "";
  const phone = normalizePhone(String(context.contactPhone || "")) || "";
  const tenantName = sanitizeText(context.tenantName, 120);

  return baseParams
    .map((item) =>
      item
        .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
        .replace(/\{\{\s*telefone\s*\}\}/gi, phone)
        .replace(/\{\{\s*empresa\s*\}\}/gi, tenantName)
        .trim()
    )
    .filter(Boolean)
    .slice(0, 20);
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
    responsePaused: ai.responsePaused === true,
    businessProfileId,
    businessProfileLabel: businessProfile.label,
    agentName:
      sanitizeText(ai.agentName, 80) ||
      `Agente ${sanitizeText(settings?.name, 80) || businessProfile.label}`,
    toneOfVoice: sanitizeText(ai.toneOfVoice, 120) || businessProfile.ai.toneOfVoice,
    businessSummary:
      sanitizeText(ai.businessSummary, 360) ||
      sanitizeText(settings?.name, 120) ||
      businessProfile.description,
    objective: sanitizeText(ai.objective, 200) || businessProfile.ai.objective,
    responsiblePhone: normalizePhone(
      String(ai.responsiblePhone || settings?.contactPhone || settings?.ownerPhone || settings?.phone || "")
    ),
    handoffNotifyEnabled: ai.handoffNotifyEnabled !== false,
    handoffNotifyPhones: parsePhoneLines(ai.handoffNotifyPhones, 8),
    voiceReplyEnabled: ai.voiceReplyEnabled === true,
    voiceReplyVoice: sanitizeText(ai.voiceReplyVoice, 40) || "alloy",
    voiceReplyMode: ["audio_only", "smart", "always"].includes(sanitizeText(ai.voiceReplyMode, 40))
      ? (sanitizeText(ai.voiceReplyMode, 40) as "audio_only" | "smart" | "always")
      : "smart",
    voiceReplyMaxChars: Math.max(260, Math.min(1400, Number(ai.voiceReplyMaxChars || 760) || 760)),
    whatsappTemplateFollowUpEnabled: ai.whatsappTemplateFollowUpEnabled !== false,
    whatsappTemplateFollowUpName: sanitizeText(ai.whatsappTemplateFollowUpName, 120) || "follow_up_geral",
    whatsappTemplateFollowUpLanguage: sanitizeText(ai.whatsappTemplateFollowUpLanguage, 24) || "pt_BR",
    whatsappTemplateFollowUpParams: parseLines(ai.whatsappTemplateFollowUpParams, 12),
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

const SEMANTIC_KEYWORD_GROUPS = [
  ["preco", "valor", "orcamento", "budget", "investimento"],
  ["reuniao", "call", "agenda", "agendar", "meeting"],
  ["lead", "demanda", "captacao", "captar", "trafego"],
  ["venda", "conversao", "converter", "fechamento", "fechar"],
  ["atendimento", "whatsapp", "suporte", "inbox"],
  ["crm", "pipeline", "processo", "operacao"],
  ["urgencia", "prazo", "rapido", "prioridade"],
];

function expandSemanticWords(words: string[]) {
  const expanded = new Set(words);
  for (const group of SEMANTIC_KEYWORD_GROUPS) {
    const touchesGroup = group.some((token) => expanded.has(token));
    if (!touchesGroup) continue;
    for (const token of group) expanded.add(token);
  }
  return expanded;
}

function scoreKbDoc(input: {
  inboundText: string;
  messageWords: string[];
  retrievalMode: "keyword" | "hybrid" | "semantic";
  doc: KbDoc;
}) {
  const { inboundText, messageWords, retrievalMode, doc } = input;
  if (messageWords.length === 0) return 0;

  const docWords = new Set<string>([
    ...normalizeWords(doc.content),
    ...doc.tags.flatMap((tag) => normalizeWords(tag)),
    ...normalizeWords(doc.type),
  ]);
  const normalizedInbound = normalizeComparable(inboundText);
  const normalizedDoc = normalizeComparable(doc.content);

  let lexicalHits = 0;
  for (const word of messageWords) {
    if (docWords.has(word)) lexicalHits += 1;
  }

  let semanticHits = 0;
  const expandedWords = expandSemanticWords(messageWords);
  for (const word of expandedWords) {
    if (docWords.has(word)) semanticHits += 1;
  }

  let phraseHits = 0;
  for (const tag of doc.tags) {
    const normalizedTag = normalizeComparable(tag);
    if (!normalizedTag) continue;
    if (normalizedInbound.includes(normalizedTag)) phraseHits += 1;
  }
  if (normalizedInbound && normalizedDoc.includes(normalizedInbound)) phraseHits += 2;

  const typeBoost = doc.type === "catalog" ? 0.35 : doc.type === "faq" ? 0.2 : 0.1;

  if (retrievalMode === "semantic") {
    return Number((semanticHits * 1.25 + phraseHits * 1.6 + lexicalHits * 0.7 + typeBoost).toFixed(4));
  }

  if (retrievalMode === "hybrid") {
    return Number((lexicalHits * 1.05 + semanticHits * 0.75 + phraseHits * 1.25 + typeBoost).toFixed(4));
  }

  return Number((lexicalHits * 1.2 + phraseHits * 0.9 + typeBoost).toFixed(4));
}

function makeLeadFacingReply(input: {
  tenantAi: TenantAiConfig;
  decision: Exclude<Decision, "skip" | "handoff">;
  inboundText: string;
  messageType?: string | null;
  multimodalSummary?: string | null;
  kbDocs: KbDoc[];
  conversation: ConversationMessage[];
  contactName?: string | null;
}) {
  const normalizedInbound = sanitizeText(input.inboundText, 500);
  const turn = classifyLeadTurn(normalizedInbound);
  const knownFirstName = leadFirstName(input.contactName);
  const hasAskedName = input.conversation.some(
    (item) =>
      item.sender === "agent" &&
      /\b(posso te chamar de|como voce prefere que eu te chame|qual e o seu nome|qual é o seu nome|seu nome)\b/i.test(
        item.text || ""
      )
  );
  const inboundHasPriceSignal = textHasAny(input.inboundText, ["preco", "valor", "plano", "orcamento", "investimento"]);
  const asksIdentity = textHasAny(normalizedInbound, ["qual e o seu nome", "qual seu nome", "quem e voce", "quem é você"]);
  const asksWellbeing = textHasAny(normalizedInbound, ["como voce esta", "como voce ta", "como vai", "tudo bem"]);
  const thanks = textHasAny(normalizedInbound, ["obrigado", "obrigada", "valeu"]);
  const normalizedType = sanitizeText(input.messageType, 20).toLowerCase();
  const multimodalNote = sanitizeText(input.multimodalSummary, 220);
  const lastAgentMessage = [...input.conversation].reverse().find((item) => item.sender === "agent");
  const hasOpenAgentQuestion = Boolean(lastAgentMessage?.text && lastAgentMessage.text.includes("?"));
  const shouldAskNameLater =
    !knownFirstName && !hasAskedName && input.conversation.filter((item) => item.sender === "client").length >= 2;
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
    const agentName = sanitizeText(input.tenantAi.agentName, 80) || "assistente comercial";
    return `Eu sou ${agentName}. Se quiser, eu posso te ajudar a entender o melhor caminho para o seu caso.`;
  }

  if (normalizedType === "audio" && multimodalNote) {
    const tail =
      input.decision === "ask_more"
        ? ` ${nextMandatoryQuestion}`
        : !hasOpenAgentQuestion
          ? " Quer me contar o contexto por tras disso?"
          : "";
    return `Perfeito, recebi seu audio. ${multimodalNote}${tail}`.trim();
  }

  if (normalizedType === "image" && multimodalNote) {
    const tail =
      input.decision === "ask_more"
        ? ` ${nextMandatoryQuestion}`
        : !hasOpenAgentQuestion
          ? " Qual o contexto dessa imagem?"
          : "";
    return `Perfeito, recebi a imagem. ${multimodalNote}${tail}`.trim();
  }

  if (normalizedType === "document" && multimodalNote) {
    const tail =
      input.decision === "ask_more"
        ? ` ${nextMandatoryQuestion}`
        : !hasOpenAgentQuestion
          ? " Quer me contar o objetivo desse material?"
          : "";
    return `Perfeito, recebi o arquivo. ${multimodalNote}${tail}`.trim();
  }

  if (asksWellbeing && !turn.hasBusinessTerms) {
    return "Tudo certo por aqui. Pra eu te direcionar certo: qual resultado voce quer destravar no comercial agora?";
  }

  if (thanks && !turn.hasBusinessTerms) {
    return "Perfeito. Antes de avancar, me conta: hoje seu foco e gerar demanda ou melhorar conversao?";
  }

  if (turn.isLightSmallTalk && !turn.hasBusinessTerms) {
    return "Fechou. Bora usar isso a seu favor: qual e o principal gargalo do seu atendimento hoje?";
  }

  if (isGreetingLike(input.inboundText)) {
    return knownFirstName
      ? `Oi, ${knownFirstName}! Tudo bem? Pra eu te direcionar certo, hoje o foco e gerar mais leads, organizar atendimento ou converter melhor?`
      : "Oi! Tudo bem? Pra te direcionar certo, hoje o foco e gerar mais leads, organizar atendimento ou converter melhor?";
  }

  if (isClarificationRequest(input.inboundText)) {
    return "Claro. A gente estrutura captacao, atendimento e conversao para vender com mais previsibilidade. Se quiser, te explico pelo seu caso real em 1 minuto.";
  }

  if (input.decision === "ask_more") {
    const base = inboundHasPriceSignal
      ? "Consigo te passar isso, sim. Antes, me conta rapidinho seu momento para eu nao te falar algo fora do seu caso."
      : `Me ajuda com mais um ponto so: ${nextMandatoryQuestion}`;
    if (shouldAskNameLater && !base.includes("?")) {
      return `${base} Posso te chamar de como?`;
    }
    return base;
  }

  if (primaryKbSnippet) {
    const base = `Entendi. ${primaryKbSnippet}`;
    if (shouldAskNameLater && !base.includes("?")) {
      return `${base} Posso te chamar de como?`;
    }
    return base;
  }

  if (inboundHasPriceSignal) {
    const base =
      "Entendi. Consigo te orientar nisso, sim. Se quiser, eu te explico o formato que tende a fazer mais sentido para o seu momento.";
    if (shouldAskNameLater && !base.includes("?")) {
      return `${base} Posso te chamar de como?`;
    }
    return base;
  }

  const defaultReply = "Entendi. Me conta um pouco melhor o teu momento hoje.";
  if (shouldAskNameLater && !defaultReply.includes("?")) {
    return `${defaultReply} Posso te chamar de como?`;
  }
  return defaultReply;
}

function buildSecondaryCommercialNudge(input: {
  inboundText: string;
  responseText: string;
  messageType?: string | null;
  decision: Exclude<Decision, "skip" | "handoff">;
  conversation: ConversationMessage[];
  mandatoryQuestions: string[];
}) {
  const normalizedType = sanitizeText(input.messageType, 40).toLowerCase();
  if (normalizedType && normalizedType !== "text") return null;
  if (input.decision !== "respond") return null;

  const turn = classifyLeadTurn(input.inboundText);
  if (!turn.isGreeting && !turn.isPureRelational) return null;
  if (sanitizeText(input.responseText, 300).includes("?")) return null;

  const question = sanitizeText(
    pickNextMandatoryQuestion(input.conversation, input.mandatoryQuestions) ||
      "Pra te direcionar com precisao: qual e o principal objetivo comercial agora?",
    220
  );
  if (!question || question.length < 12) return null;

  const prefixed = question.endsWith("?")
    ? `Pra te direcionar com precisao: ${question}`
    : `Pra te direcionar com precisao: ${question}?`;
  const normalizedPrefix = normalizeComparable(prefixed);
  const normalizedPrimary = normalizeComparable(input.responseText);
  if (!normalizedPrefix || normalizedPrefix === normalizedPrimary) return null;

  return sanitizeText(prefixed, 260);
}

function looksLikeRepeatedQuestion(currentText: string, previousText?: string | null) {
  const current = normalizeComparable(currentText);
  const previous = normalizeComparable(String(previousText || ""));
  if (!current.includes("?") || !previous.includes("?")) return false;
  const previousWords = previous
    .replace(/\b(pra|para|voce|você|me|te|um|uma|com|que|qual|quais|hoje|agora|rapidinho|principal)\b/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .slice(0, 12);
  if (previousWords.length < 3) return false;
  const hits = previousWords.filter((word) => current.includes(word)).length;
  return hits >= Math.min(4, previousWords.length);
}

function buildDirectDiagnosticClose(input: {
  businessType?: string | null;
  primaryGoal?: string | null;
  currentChannels?: string | null;
  recommendedOffer?: string | null;
  nextAction?: string | null;
}) {
  const businessType = sanitizeText(input.businessType, 120);
  const primaryGoal = sanitizeText(input.primaryGoal, 160);
  const currentChannels = sanitizeText(input.currentChannels, 160);
  const recommendedOffer = sanitizeText(input.recommendedOffer, 160) || "diagnostico comercial rapido";
  const context = [
    businessType ? `tipo de negocio: ${businessType}` : "",
    primaryGoal ? `objetivo: ${primaryGoal}` : "",
    currentChannels ? `canais atuais: ${currentChannels}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const action = sanitizeText(input.nextAction, 160).toLowerCase();
  const close =
    /proposta/.test(action)
      ? "Posso transformar isso em uma proposta objetiva para voce avaliar?"
      : "Faz sentido eu encaminhar uma reuniao curta para validar isso no seu caso?";

  return sanitizeText(
    [
      context ? `Pelo que voce trouxe (${context}), ja da para fechar uma leitura inicial.` : "Pelo que voce trouxe, ja da para fechar uma leitura inicial.",
      `Diagnostico rapido: o gargalo parece estar em gerar oportunidade qualificada e conduzir melhor ate a decisao.`,
      `O caminho mais indicado agora e ${recommendedOffer}, com foco em clareza comercial e conversao.`,
      close,
    ].join(" "),
    900
  );
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

async function fetchKbDocs(
  tenantId: string,
  inboundText: string,
  retrievalMode: "keyword" | "hybrid" | "semantic" = "keyword"
) {
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
      const productName = sanitizeText(data.productName, 160) || null;
      const productCategory = sanitizeText(data.productCategory, 120) || null;
      const targetProfile = sanitizeText(data.targetProfile, 180) || null;
      const priceFrom = numericValue(data.priceFrom);
      const priceTo = numericValue(data.priceTo);
      const availability = normalizeCatalogAvailability(data.availability);
      const structuredCatalogHeader =
        type === "catalog"
          ? [
              productName ? `produto ${productName}` : "",
              productCategory ? `categoria ${productCategory}` : "",
              targetProfile ? `perfil ${targetProfile}` : "",
              priceFrom || priceTo
                ? `faixa ${priceFrom ? `R$ ${Math.round(priceFrom)}` : "sob consulta"}${priceTo ? ` a R$ ${Math.round(priceTo)}` : ""}`
                : "",
              availability !== "active" ? `status ${availability}` : "",
            ]
              .filter(Boolean)
              .join(" | ")
          : "";
      const contentBase = sanitizeText(data.content, 600);
      const content =
        type === "catalog" && structuredCatalogHeader
          ? sanitizeText(`catalog_struct: ${structuredCatalogHeader}. ${contentBase}`, 900)
          : contentBase;

      return {
        id: doc.id,
        type,
        content,
        tags,
        mediaUrl: sanitizeText(data.mediaUrl, 1200) || null,
        mediaType: ["image", "video", "document"].includes(sanitizeText(data.mediaType, 40))
          ? (sanitizeText(data.mediaType, 40) as KbDoc["mediaType"])
          : null,
        mediaTitle: sanitizeText(data.mediaTitle, 160) || null,
        mediaStoragePath: sanitizeText(data.mediaStoragePath, 600) || null,
        mediaMimeType: sanitizeText(data.mediaMimeType, 120) || null,
        mediaSize: typeof data.mediaSize === "number" && Number.isFinite(data.mediaSize) ? data.mediaSize : null,
        serviceKey: sanitizeText(data.serviceKey, 120) || null,
        productName,
        productCategory,
        targetProfile,
        priceFrom,
        priceTo,
        upsellKeys: parseCatalogStringList(data.upsellKeys, 12),
        crossSellKeys: parseCatalogStringList(data.crossSellKeys, 12),
        priority: numericValue(data.priority),
        availability,
        score: 0,
      };
    })
    .filter((item) => item.content);

  const messageWords = normalizeWords(inboundText);
  const candidateDocs = baseDocs.filter((doc) => doc.availability !== "paused");

  const scored = candidateDocs
    .map((doc) => ({
      ...doc,
      score: scoreKbDoc({
        inboundText,
        messageWords,
        retrievalMode,
        doc,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  return scored.filter((doc) => doc.score > 0);
}

async function fetchConversation(chatId: string, tenantId: string) {
  const snap = await (async () => {
    try {
      return await adminDb
        .collection("messages")
        .where("chatId", "==", chatId)
        .where("tenantId", "==", tenantId)
        .orderBy("createdAt", "desc")
        .limit(300)
        .get();
    } catch {
      return await adminDb
        .collection("messages")
        .where("chatId", "==", chatId)
        .where("tenantId", "==", tenantId)
        .limit(300)
        .get();
    }
  })();

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
  const ref = adminDb.collection("chat_state").doc(docId);
  const snap = await ref.get();

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
      lastJobStatus: null,
      lastJobError: null,
      lastJobErrorCode: null,
      lastDecision: null,
      lastDecisionReason: null,
      lastDecisionReasonCode: null,
      lastProcessedAt: null,
      lastJobId: null,
      lastMessageId: null,
      lastHandoffNotifyAt: null,
      lastHandoffNotifyMessageId: null,
      lastHandoffNotifyStatus: null,
      lastHandoffNotifyRecipients: null,
      lastHandoffNotifySuccessCount: null,
      lastHandoffNotifyFailureCount: null,
      responseFormatPreference: null,
      responseFormatPreferenceUpdatedAt: null,
      responseFormatPreferenceAskedAt: null,
      responseFormatPreferenceAskCount: null,
    };
  }

  const data = snap.data() as ChatStateDoc;
  const pausedUntil = toDate(data.pausedUntil);
  const hasHumanOwner =
    typeof data.humanOwnerUserId === "string" && data.humanOwnerUserId.trim()
      ? data.humanOwnerUserId.trim()
      : null;
  const shouldAutoResume =
    Boolean(pausedUntil && pausedUntil.getTime() <= Date.now()) &&
    (data.aiEnabled === false || Boolean(hasHumanOwner) || Boolean(data.pauseReason));

  if (shouldAutoResume) {
    await ref.set(
      {
        tenantId,
        chatId,
        aiEnabled: true,
        pausedUntil: null,
        humanOwnerUserId: null,
        pauseReason: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      tenantId,
      chatId,
      aiEnabled: true,
      pausedUntil: null,
      humanOwnerUserId: null,
      updatedByName:
        typeof data.updatedByName === "string" && data.updatedByName.trim()
          ? data.updatedByName.trim()
          : null,
      updatedAt: new Date(),
      pauseReason: null,
      lastJobStatus:
        typeof data.lastJobStatus === "string" && data.lastJobStatus.trim() ? data.lastJobStatus.trim() : null,
      lastJobError:
        typeof data.lastJobError === "string" && data.lastJobError.trim() ? data.lastJobError.trim() : null,
      lastJobErrorCode:
        typeof data.lastJobErrorCode === "string" && data.lastJobErrorCode.trim()
          ? data.lastJobErrorCode.trim()
          : null,
      lastDecision:
        typeof data.lastDecision === "string" && data.lastDecision.trim() ? data.lastDecision.trim() : null,
      lastDecisionReason:
        typeof data.lastDecisionReason === "string" && data.lastDecisionReason.trim()
          ? data.lastDecisionReason.trim()
          : null,
      lastDecisionReasonCode:
        typeof data.lastDecisionReasonCode === "string" && data.lastDecisionReasonCode.trim()
          ? data.lastDecisionReasonCode.trim()
          : null,
      lastProcessedAt: toDate(data.lastProcessedAt),
      lastJobId: typeof data.lastJobId === "string" && data.lastJobId.trim() ? data.lastJobId.trim() : null,
      lastMessageId:
        typeof data.lastMessageId === "string" && data.lastMessageId.trim() ? data.lastMessageId.trim() : null,
      lastHandoffNotifyAt: toDate(data.lastHandoffNotifyAt),
      lastHandoffNotifyMessageId:
        typeof data.lastHandoffNotifyMessageId === "string" && data.lastHandoffNotifyMessageId.trim()
          ? data.lastHandoffNotifyMessageId.trim()
          : null,
      lastHandoffNotifyStatus:
        typeof data.lastHandoffNotifyStatus === "string" && data.lastHandoffNotifyStatus.trim()
          ? data.lastHandoffNotifyStatus.trim()
          : null,
      lastHandoffNotifyRecipients:
        typeof data.lastHandoffNotifyRecipients === "number" && Number.isFinite(data.lastHandoffNotifyRecipients)
          ? data.lastHandoffNotifyRecipients
          : null,
      lastHandoffNotifySuccessCount:
        typeof data.lastHandoffNotifySuccessCount === "number" && Number.isFinite(data.lastHandoffNotifySuccessCount)
          ? data.lastHandoffNotifySuccessCount
          : null,
      lastHandoffNotifyFailureCount:
        typeof data.lastHandoffNotifyFailureCount === "number" && Number.isFinite(data.lastHandoffNotifyFailureCount)
          ? data.lastHandoffNotifyFailureCount
          : null,
      responseFormatPreference:
        data.responseFormatPreference === "audio" || data.responseFormatPreference === "text"
          ? data.responseFormatPreference
          : null,
      responseFormatPreferenceUpdatedAt: toDate(data.responseFormatPreferenceUpdatedAt),
      responseFormatPreferenceAskedAt: toDate(data.responseFormatPreferenceAskedAt),
      responseFormatPreferenceAskCount:
        typeof data.responseFormatPreferenceAskCount === "number" && Number.isFinite(data.responseFormatPreferenceAskCount)
          ? data.responseFormatPreferenceAskCount
          : null,
    };
  }

  return {
    tenantId,
    chatId,
    aiEnabled: data.aiEnabled !== false,
    pausedUntil,
    humanOwnerUserId: hasHumanOwner,
    updatedByName:
      typeof data.updatedByName === "string" && data.updatedByName.trim()
        ? data.updatedByName.trim()
        : null,
    updatedAt: toDate(data.updatedAt),
    pauseReason:
      typeof data.pauseReason === "string" && data.pauseReason.trim()
        ? data.pauseReason.trim()
        : null,
    lastJobStatus:
      typeof data.lastJobStatus === "string" && data.lastJobStatus.trim() ? data.lastJobStatus.trim() : null,
    lastJobError:
      typeof data.lastJobError === "string" && data.lastJobError.trim() ? data.lastJobError.trim() : null,
    lastJobErrorCode:
      typeof data.lastJobErrorCode === "string" && data.lastJobErrorCode.trim()
        ? data.lastJobErrorCode.trim()
        : null,
    lastDecision:
      typeof data.lastDecision === "string" && data.lastDecision.trim() ? data.lastDecision.trim() : null,
    lastDecisionReason:
      typeof data.lastDecisionReason === "string" && data.lastDecisionReason.trim()
        ? data.lastDecisionReason.trim()
        : null,
    lastDecisionReasonCode:
      typeof data.lastDecisionReasonCode === "string" && data.lastDecisionReasonCode.trim()
        ? data.lastDecisionReasonCode.trim()
        : null,
    lastProcessedAt: toDate(data.lastProcessedAt),
    lastJobId: typeof data.lastJobId === "string" && data.lastJobId.trim() ? data.lastJobId.trim() : null,
    lastMessageId:
      typeof data.lastMessageId === "string" && data.lastMessageId.trim() ? data.lastMessageId.trim() : null,
    lastHandoffNotifyAt: toDate(data.lastHandoffNotifyAt),
    lastHandoffNotifyMessageId:
      typeof data.lastHandoffNotifyMessageId === "string" && data.lastHandoffNotifyMessageId.trim()
        ? data.lastHandoffNotifyMessageId.trim()
        : null,
    lastHandoffNotifyStatus:
      typeof data.lastHandoffNotifyStatus === "string" && data.lastHandoffNotifyStatus.trim()
        ? data.lastHandoffNotifyStatus.trim()
        : null,
    lastHandoffNotifyRecipients:
      typeof data.lastHandoffNotifyRecipients === "number" && Number.isFinite(data.lastHandoffNotifyRecipients)
        ? data.lastHandoffNotifyRecipients
        : null,
    lastHandoffNotifySuccessCount:
      typeof data.lastHandoffNotifySuccessCount === "number" && Number.isFinite(data.lastHandoffNotifySuccessCount)
        ? data.lastHandoffNotifySuccessCount
        : null,
    lastHandoffNotifyFailureCount:
      typeof data.lastHandoffNotifyFailureCount === "number" && Number.isFinite(data.lastHandoffNotifyFailureCount)
        ? data.lastHandoffNotifyFailureCount
        : null,
    responseFormatPreference:
      data.responseFormatPreference === "audio" || data.responseFormatPreference === "text"
        ? data.responseFormatPreference
        : null,
    responseFormatPreferenceUpdatedAt: toDate(data.responseFormatPreferenceUpdatedAt),
    responseFormatPreferenceAskedAt: toDate(data.responseFormatPreferenceAskedAt),
    responseFormatPreferenceAskCount:
      typeof data.responseFormatPreferenceAskCount === "number" && Number.isFinite(data.responseFormatPreferenceAskCount)
        ? data.responseFormatPreferenceAskCount
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

async function createAiInternalNotificationOnce(input: {
  tenantId: string;
  chatId: string;
  leadId: string;
  type: string;
  severity: "info" | "warning" | "high";
  title: string;
  detail: string;
  dedupeWindowMinutes?: number;
}) {
  const dedupeWindowMinutes = Math.min(24 * 60, Math.max(15, input.dedupeWindowMinutes || 180));
  const lockId = [
    sanitizeText(input.tenantId, 120),
    sanitizeText(input.chatId, 120),
    sanitizeText(input.type, 80),
  ]
    .join("_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 220);
  const lockRef = adminDb.collection("ai_internal_notification_locks").doc(lockId);

  let shouldCreate = false;
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef);
    const lastNotifiedAt = toDate((snap.data() as { lastNotifiedAt?: unknown } | undefined)?.lastNotifiedAt);
    const now = Date.now();
    if (lastNotifiedAt && now - lastNotifiedAt.getTime() < dedupeWindowMinutes * 60 * 1000) {
      return;
    }

    tx.set(
      lockRef,
      {
        tenantId: input.tenantId,
        chatId: input.chatId,
        type: sanitizeText(input.type, 80),
        lastNotifiedAt: new Date(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    shouldCreate = true;
  });

  if (!shouldCreate) return false;

  await createAiInternalNotification({
    tenantId: input.tenantId,
    chatId: input.chatId,
    leadId: input.leadId,
    type: input.type,
    severity: input.severity,
    title: input.title,
    detail: input.detail,
  });

  return true;
}

function normalizeReasonCode(value: string, fallback: string) {
  const normalized = sanitizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function buildAiTaskKey(reasonCode: string, scope: string) {
  const reason = normalizeReasonCode(reasonCode, "ai_task");
  const normalizedScope = sanitizeText(scope, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${reason}:${normalizedScope || "default"}`.slice(0, 180);
}

async function listPendingLeadTasks(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_tasks")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .where("status", "==", "pending")
    .limit(30)
    .get();

  return snap.docs.map<{ id: string; taskKey?: unknown; reasonCode?: unknown }>((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

async function ensureAiLeadTask(input: {
  tenantId: string;
  leadId: string;
  title: string;
  type: string;
  priority: string;
  dueAt?: Date | null;
  reasonCode: string;
  taskKey: string;
}) {
  const existingTasks = await listPendingLeadTasks(input.tenantId, input.leadId);
  const normalizedReasonCode = normalizeReasonCode(input.reasonCode, "ai_task");
  const normalizedTaskKey = sanitizeText(input.taskKey, 180);
  const alreadyExists = existingTasks.some((task) => {
    const currentTaskKey = sanitizeText(task.taskKey, 180);
    const currentReasonCode = normalizeReasonCode(sanitizeText(task.reasonCode, 120), "");
    return (
      (normalizedTaskKey && currentTaskKey === normalizedTaskKey) ||
      (normalizedReasonCode && currentReasonCode === normalizedReasonCode)
    );
  });

  if (alreadyExists) return null;

  const ref = await adminDb.collection("lead_tasks").add({
    tenantId: input.tenantId,
    leadId: input.leadId,
    title: sanitizeText(input.title, 220) || "Tarefa criada pela IA",
    type: sanitizeText(input.type, 40) || "follow_up",
    priority: sanitizeText(input.priority, 20) || "medium",
    dueAt: input.dueAt || null,
    status: "pending",
    source: "ai_sales_agent",
    reasonCode: normalizedReasonCode,
    taskKey: normalizedTaskKey || null,
    createdBy: "ai_sales_agent",
    createdByName: "AI Sales Agent",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
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

function addMinutes(base: Date, minutes: number) {
  return new Date(base.getTime() + minutes * 60 * 1000);
}

function appointmentRangesOverlap(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

async function findNextAvailableAiSlot(tenantId: string, ownerUserId?: string | null) {
  const snap = await adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(500).get();
  const busy = snap.docs
    .map((doc) => doc.data() as Record<string, unknown>)
    .filter((item) => ["scheduled", "confirmed"].includes(sanitizeText(item.status, 40) || "scheduled"))
    .filter((item) => {
      const currentOwner = sanitizeText(item.ownerUserId, 140);
      const targetOwner = sanitizeText(ownerUserId, 140);
      return targetOwner ? currentOwner === targetOwner : !currentOwner;
    })
    .map((item) => {
      const start = new Date(String(item.startAt || "")).getTime();
      const end = item.endAt ? new Date(String(item.endAt)).getTime() : start + 60 * 60 * 1000;
      return { start, end };
    })
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));

  const now = new Date();
  const cursor = addMinutes(now, 120);
  cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 0, 0, 0);
  if (cursor.getMinutes() === 0 && cursor.getTime() < addMinutes(now, 120).getTime()) {
    cursor.setHours(cursor.getHours() + 1);
  }

  for (let day = 0; day < 14; day += 1) {
    for (let hour = 9; hour <= 17; hour += 1) {
      for (const minute of [0, 30]) {
        const candidate = new Date(cursor);
        candidate.setDate(cursor.getDate() + day);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate.getTime() < cursor.getTime()) continue;

        const candidateEnd = addMinutes(candidate, 60);
        const hasConflict = busy.some((item) =>
          appointmentRangesOverlap(candidate.getTime(), candidateEnd.getTime(), item.start, item.end)
        );
        if (!hasConflict) return { startAt: candidate.toISOString(), endAt: candidateEnd.toISOString() };
      }
    }
  }

  const fallback = addHours(now, 24);
  return { startAt: fallback.toISOString(), endAt: addMinutes(fallback, 60).toISOString() };
}

async function createAiAppointmentDraft(input: {
  tenantId: string;
  leadId: string;
  leadName?: string | null;
  leadCompany?: string | null;
  summary?: string | null;
  ownerUserId?: string | null;
}) {
  const slot = await findNextAvailableAiSlot(input.tenantId, input.ownerUserId);
  const ref = await adminDb.collection("appointments").add({
    tenantId: input.tenantId,
    leadId: input.leadId,
    leadName: sanitizeText(input.leadName, 180) || "Lead",
    leadCompany: sanitizeText(input.leadCompany, 180) || null,
    title: `Diagnostico comercial com ${sanitizeText(input.leadName, 120) || "lead"}`,
    type: "reuniao",
    status: "scheduled",
    startAt: slot.startAt,
    endAt: slot.endAt,
    location: null,
    meetingUrl: null,
    notes: sanitizeText(input.summary, 4000) || null,
    ownerUserId: sanitizeText(input.ownerUserId, 140) || null,
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

function normalizeLeadTags(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => sanitizeText(item, 48).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function mapTemperatureToScore(temperature?: string | null) {
  const normalized = sanitizeText(temperature, 20).toLowerCase();
  if (normalized === "hot") return 82;
  if (normalized === "warm") return 64;
  if (normalized === "cold") return 42;
  return 55;
}

function mapTemperatureToQualificationBand(temperature?: string | null) {
  const normalized = sanitizeText(temperature, 20).toLowerCase();
  if (normalized === "hot") return "sales_ready";
  if (normalized === "warm") return "warming";
  return "cold";
}

function hasMinimumClosingContext(input: {
  plannerConfidence: number;
  businessType?: string | null;
  primaryGoal?: string | null;
  budgetBand?: string | null;
  urgency?: string | null;
  decisionMaker?: string | null;
}) {
  const confidenceOk = input.plannerConfidence >= 0.76;
  const mappedCount = [
    sanitizeText(input.businessType, 80),
    sanitizeText(input.primaryGoal, 120),
    sanitizeText(input.budgetBand, 80),
    sanitizeText(input.urgency, 80),
    sanitizeText(input.decisionMaker, 80),
  ].filter(Boolean).length;

  return confidenceOk && mappedCount >= 3;
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
  leadOwnerId?: string | null;
  leadOwnerName?: string | null;
}) {
  const leadId = sanitizeText(input.leadId, 160);
  if (!leadId) return [] as string[];

  const actions: string[] = [];
  const leadRef = adminDb.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  const leadData = leadSnap.exists ? (leadSnap.data() as Record<string, unknown>) : {};
  const now = new Date();
  const plannerConfidence = Number.isFinite(input.plan.confidence) ? Math.max(0, Math.min(1, input.plan.confidence)) : 0;
  const canWriteIdentity = plannerConfidence >= 0.66;
  const canWriteCompany = plannerConfidence >= 0.7;
  const canWriteContact = plannerConfidence >= 0.82;
  const canAdvanceStage = plannerConfidence >= 0.72;
  const canFlagHotLead = plannerConfidence >= 0.76;
  const canSetReadyHandoff = plannerConfidence >= 0.84 || input.plan.decision === "handoff";
  const canWriteCustomFields = plannerConfidence >= 0.58;
  const rawPreferredName = sanitizeText(
    input.extractedFields?.preferredName || input.extractedFields?.name || input.extractedFields?.contactName,
    80
  );
  const aiMemory = {
    preferredName: looksLikeHumanName(rawPreferredName) ? rawPreferredName : null,
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
  const aiLeadSummary = buildPersistentConversationSummary({
    preferredName: aiMemory.preferredName,
    leadTone: aiMemory.leadTone,
    activeTopic: aiMemory.activeTopic,
    conversationMaturity: input.plan.stateAfter,
    businessType: aiMemory.businessType,
    primaryGoal: aiMemory.primaryGoal,
    currentChannels: aiMemory.currentChannels,
    dominantObjection: aiMemory.dominantObjection,
    recommendedOffer: input.plan.recommendedOffer || aiMemory.serviceInterest,
    nextAction: input.plan.nextAction || null,
  });
  const extractedEmail = normalizeEmail(
    input.extractedFields?.email || input.extractedFields?.contactEmail || input.extractedFields?.mail
  );
  const extractedPhone = normalizePhone(
    String(
      input.extractedFields?.phone ||
        input.extractedFields?.telefone ||
        input.extractedFields?.contactPhone ||
        input.extractedFields?.whatsapp ||
        ""
    )
  );
  const extractedCompany = sanitizeText(
    input.extractedFields?.company || input.extractedFields?.businessName || input.extractedFields?.empresa,
    180
  );
  const currentLeadName = sanitizeText(leadData.nome, 120);
  const fallbackLeadName = sanitizeText(input.leadName, 120);
  const nextLeadName = aiMemory.preferredName || (looksLikeHumanName(fallbackLeadName) ? fallbackLeadName : "");
  const shouldPatchLeadName =
    looksLikeHumanName(nextLeadName) &&
    (!looksLikeHumanName(currentLeadName) || /^(lead|contato|cliente|visitante)$/i.test(currentLeadName));
  const currentLeadPhone = normalizePhone(String(leadData.telefone || ""));
  const currentLeadEmail = normalizeEmail(leadData.email);
  const currentLeadCompany = sanitizeText(leadData.empresa, 180);

  const existingCustomFields =
    leadData.customFields && typeof leadData.customFields === "object"
      ? ({ ...(leadData.customFields as Record<string, string | number | boolean | null>) } as Record<
          string,
          string | number | boolean | null
        >)
      : {};
  const existingAiFieldEvidence =
    leadData.aiFieldEvidence && typeof leadData.aiFieldEvidence === "object"
      ? ({ ...(leadData.aiFieldEvidence as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  let aiFieldEvidenceChanged = false;
  const setAiFieldEvidence = (
    fieldKey: string,
    value: unknown,
    source: "agent_extracted" | "conversation_context" | "derived"
  ) => {
    const normalizedKey = sanitizeText(fieldKey, 80);
    const normalizedValue =
      typeof value === "string"
        ? sanitizeText(value, 220)
        : typeof value === "number"
          ? String(value)
          : "";
    if (!normalizedKey || !normalizedValue) return;

    existingAiFieldEvidence[normalizedKey] = {
      value: normalizedValue,
      source,
      confidence: Number(plannerConfidence.toFixed(3)),
      intent: sanitizeText(input.plan.intent, 80) || null,
      stateAfter: sanitizeText(input.plan.stateAfter, 40) || null,
      nextAction: sanitizeText(input.plan.nextAction, 120) || null,
      capturedAt: now.toISOString(),
    };
    aiFieldEvidenceChanged = true;
  };
  let customFieldsChanged = false;
  const upsertCustomField = (key: string, value: string | null) => {
    const normalizedKey = sanitizeText(key, 60);
    const normalizedValue = sanitizeText(value, 200);
    if (!normalizedKey || !normalizedValue) return;
    if (existingCustomFields[normalizedKey] !== normalizedValue) {
      existingCustomFields[normalizedKey] = normalizedValue;
      customFieldsChanged = true;
    }
  };

  upsertCustomField("nicho", aiMemory.businessType);
  upsertCustomField("objetivo_principal", aiMemory.primaryGoal);
  upsertCustomField("orcamento", aiMemory.budgetBand);
  upsertCustomField("urgencia", aiMemory.urgency);
  upsertCustomField("cidade", aiMemory.city);
  upsertCustomField("canais_atuais", aiMemory.currentChannels);
  upsertCustomField("tamanho_time", aiMemory.teamSize);
  upsertCustomField("servico_interesse", aiMemory.serviceInterest);
  upsertCustomField("decisor", aiMemory.decisionMaker);
  upsertCustomField("maturidade_digital", aiMemory.digitalMaturity);
  upsertCustomField("tom_lead", aiMemory.leadTone);
  upsertCustomField("topico_ativo", aiMemory.activeTopic);
  upsertCustomField("objecao_principal", aiMemory.dominantObjection);

  const heatByTemperature: Record<string, "frio" | "morno" | "quente"> = {
    cold: "frio",
    warm: "morno",
    hot: "quente",
  };
  const mappedHeat = heatByTemperature[String(input.plan.commercialTemperature || "").toLowerCase()] || null;
  const missingFields = [
    !aiMemory.preferredName ? "nome" : "",
    !aiMemory.businessType ? "tipo_empresa" : "",
    !aiMemory.primaryGoal ? "objetivo" : "",
    !aiMemory.budgetBand ? "orcamento" : "",
    !aiMemory.urgency ? "urgencia" : "",
  ].filter(Boolean);

  let qualificationScore = mapTemperatureToScore(input.plan.commercialTemperature || null);
  if (aiMemory.primaryGoal) qualificationScore += 4;
  if (aiMemory.businessType) qualificationScore += 4;
  if (aiMemory.budgetBand) qualificationScore += 5;
  if (aiMemory.urgency && aiMemory.urgency !== "baixa") qualificationScore += 3;
  if (input.plan.recommendedOffer) qualificationScore += 4;
  qualificationScore = Math.max(0, Math.min(100, qualificationScore));

  const currentTags = normalizeLeadTags(leadData.tags);
  const aiTags = [
    aiMemory.businessType ? `nicho:${sanitizeText(aiMemory.businessType, 40).toLowerCase()}` : "",
    aiMemory.primaryGoal ? "ia:objetivo_mapeado" : "",
    aiMemory.budgetBand ? "ia:orcamento_mapeado" : "",
    input.plan.commercialTemperature === "hot" ? "ia:lead_quente" : "",
  ].filter(Boolean);
  const mergedTags = Array.from(new Set([...currentTags, ...aiTags])).slice(0, 12);

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
    aiLeadSummary,
    aiLastInboundText: sanitizeText(input.inboundText, 500) || null,
    aiPlannerConfidence: plannerConfidence,
    aiCaptureChecklist: {
      nome: Boolean(aiMemory.preferredName),
      tipoEmpresa: Boolean(aiMemory.businessType),
      objetivo: Boolean(aiMemory.primaryGoal),
      orcamento: Boolean(aiMemory.budgetBand),
      urgencia: Boolean(aiMemory.urgency),
      decisor: Boolean(aiMemory.decisionMaker),
      canaisAtuais: Boolean(aiMemory.currentChannels),
      cidade: Boolean(aiMemory.city),
      tamanhoTime: Boolean(aiMemory.teamSize),
      servicoInteresse: Boolean(aiMemory.serviceInterest),
      updatedAt: FieldValue.serverTimestamp(),
    },
    aiMemory,
    qualification: {
      score: qualificationScore,
      band:
        input.plan.decision === "handoff"
          ? "handoff"
          : mapTemperatureToQualificationBand(input.plan.commercialTemperature || null),
      label:
        input.plan.decision === "handoff"
          ? "Pronto para handoff humano"
          : input.plan.commercialTemperature === "hot"
            ? "Pronto para proposta"
            : input.plan.commercialTemperature === "warm"
              ? "Em aquecimento comercial"
              : "Descoberta em andamento",
      recommendedStage: null,
      nextAction: input.plan.nextAction || null,
      missingFields,
      reasons: [
        aiMemory.businessType
          ? {
              code: "business_type_mapped",
              label: "Tipo de empresa identificado",
              detail: aiMemory.businessType,
              direction: "positive",
            }
          : {
              code: "business_type_missing",
              label: "Tipo de empresa pendente",
              detail: "Confirmar nicho para calibrar oferta.",
              direction: "negative",
            },
        aiMemory.primaryGoal
          ? {
              code: "goal_mapped",
              label: "Objetivo principal mapeado",
              detail: aiMemory.primaryGoal,
              direction: "positive",
            }
          : {
              code: "goal_missing",
              label: "Objetivo principal pendente",
              detail: "Sem objetivo claro ainda.",
              direction: "negative",
            },
        input.plan.commercialTemperature === "hot"
          ? {
              code: "hot_signal",
              label: "Sinal comercial forte",
              detail: "Lead sinalizou pronta abertura para proximo passo.",
              direction: "positive",
            }
          : {
              code: "temperature_needs_progress",
              label: "Temperatura em evolucao",
              detail: "Conversa precisa consolidar contexto antes de fechar.",
              direction: "negative",
            },
      ],
      updatedAt: FieldValue.serverTimestamp(),
    },
    score: qualificationScore,
    scoreSource: "ai",
    tags: mergedTags,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (canWriteIdentity && shouldPatchLeadName) {
    leadPatch.nome = nextLeadName;
    setAiFieldEvidence("nome", nextLeadName, aiMemory.preferredName ? "agent_extracted" : "conversation_context");
    actions.push("enrich_lead_name");
  }
  if (canWriteContact && extractedEmail && !currentLeadEmail) {
    leadPatch.email = extractedEmail;
    setAiFieldEvidence("email", extractedEmail, "agent_extracted");
    actions.push("enrich_lead_email");
  }
  if (canWriteContact && extractedPhone && !currentLeadPhone) {
    leadPatch.telefone = extractedPhone;
    setAiFieldEvidence("telefone", extractedPhone, "agent_extracted");
    actions.push("enrich_lead_phone");
  }
  if (canWriteCompany && extractedCompany && !currentLeadCompany) {
    leadPatch.empresa = extractedCompany;
    setAiFieldEvidence("empresa", extractedCompany, "agent_extracted");
    actions.push("enrich_lead_company");
  }
  if (mappedHeat && sanitizeText(leadData.heat, 20) !== mappedHeat) {
    leadPatch.heat = mappedHeat;
  }
  const ownerId = sanitizeText(input.leadOwnerId, 160);
  const ownerName = sanitizeText(input.leadOwnerName, 120);
  if (ownerId && !sanitizeText(leadData.ownerId, 160)) {
    leadPatch.ownerId = ownerId;
    if (ownerName) leadPatch.owner = ownerName;
    actions.push("sync_lead_owner");
  } else if (ownerName && sanitizeText(leadData.ownerId, 160) === ownerId && !sanitizeText(leadData.owner, 120)) {
    leadPatch.owner = ownerName;
    actions.push("sync_lead_owner");
  }
  if (canWriteCustomFields && customFieldsChanged) {
    leadPatch.customFields = existingCustomFields;
    setAiFieldEvidence("custom.nicho", aiMemory.businessType, "agent_extracted");
    setAiFieldEvidence("custom.objetivo_principal", aiMemory.primaryGoal, "agent_extracted");
    setAiFieldEvidence("custom.orcamento", aiMemory.budgetBand, "agent_extracted");
    setAiFieldEvidence("custom.urgencia", aiMemory.urgency, "agent_extracted");
    setAiFieldEvidence("custom.cidade", aiMemory.city, "agent_extracted");
    setAiFieldEvidence("custom.canais_atuais", aiMemory.currentChannels, "agent_extracted");
    setAiFieldEvidence("custom.tamanho_time", aiMemory.teamSize, "agent_extracted");
    setAiFieldEvidence("custom.servico_interesse", aiMemory.serviceInterest, "agent_extracted");
    setAiFieldEvidence("custom.decisor", aiMemory.decisionMaker, "agent_extracted");
    setAiFieldEvidence("custom.maturidade_digital", aiMemory.digitalMaturity, "agent_extracted");
    setAiFieldEvidence("custom.tom_lead", aiMemory.leadTone, "derived");
    setAiFieldEvidence("custom.topico_ativo", aiMemory.activeTopic, "derived");
    setAiFieldEvidence("custom.objecao_principal", aiMemory.dominantObjection, "derived");
    actions.push("enrich_custom_fields");
  }
  if (aiFieldEvidenceChanged) {
    leadPatch.aiFieldEvidence = existingAiFieldEvidence;
    actions.push("track_field_evidence");
  }

  const pipelineStages = getBusinessProfilePipelineStages(input.businessProfileId).map((stage) => stage.id);
  const suggestedStage = suggestPipelineStageForAiAction(input.plan.nextAction, pipelineStages);
  const previousStage = sanitizeText(leadData.pipelineStage || leadData.stage, 80) || null;
  let appliedStage = previousStage;
  let aiMovedStage = false;
  if (canAdvanceStage && suggestedStage && suggestedStage !== previousStage) {
    const previousIndex = previousStage ? pipelineStages.indexOf(previousStage) : -1;
    const suggestedIndex = pipelineStages.indexOf(suggestedStage);
    const shouldAdvance = suggestedIndex >= 0 && (previousIndex < 0 || suggestedIndex >= previousIndex);

    if (shouldAdvance) {
      leadPatch.pipelineStage = suggestedStage;
      leadPatch.stage = suggestedStage;
      leadPatch.stageUpdatedAt = FieldValue.serverTimestamp();
      appliedStage = suggestedStage;
      aiMovedStage = true;
      actions.push("move_pipeline_stage");
    }
  }
  const qualificationPatch = leadPatch.qualification as Record<string, unknown>;
  qualificationPatch.recommendedStage = appliedStage || pipelineStages[0] || null;

  if (canFlagHotLead && input.plan.stateAfter === "recommendation") {
    leadPatch.priority = "high";
    leadPatch.heat = "quente";
    leadPatch.aiSignalStrength = "high";
    leadPatch.aiLastRecommendedAt = FieldValue.serverTimestamp();
    actions.push("flag_hot_lead");
  }

  if (canSetReadyHandoff && (input.plan.stateAfter === "handoff" || input.plan.decision === "handoff")) {
    leadPatch.priority = "high";
    leadPatch.handoff = {
      status: "ready",
      reasonCode: "ai_handoff_requested",
      reasonLabel: "IA recomendou atendimento humano",
      summary: aiLeadSummary,
      updatedAt: FieldValue.serverTimestamp(),
    };
    actions.push("mark_handoff_ready");
  }

  await leadRef.set(leadPatch, { merge: true });
  actions.push("update_lead_memory");

  if (aiMovedStage && previousStage && appliedStage) {
    await runPipelineStageSideEffects({
      tenantId: input.tenantId,
      leadId,
      previousStage,
      nextStage: appliedStage,
      actorId: "ai_sales_agent",
      actorName: "AI Sales Agent",
      source: "ai_pipeline_stage_update",
      metadata: {
        nextAction: input.plan.nextAction || null,
        confidence: plannerConfidence,
        stateAfter: input.plan.stateAfter || null,
      },
    });
  }

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
    const normalizedNextAction = sanitizeText(input.plan.nextAction, 160).toLowerCase();
    const isClosingStep =
      normalizedNextAction === "preparar_proposta_comercial" ||
      normalizedNextAction === "agendar_proximo_passo";
    const hasClosingContext = hasMinimumClosingContext({
      plannerConfidence,
      businessType: aiMemory.businessType,
      primaryGoal: aiMemory.primaryGoal,
      budgetBand: aiMemory.budgetBand,
      urgency: aiMemory.urgency,
      decisionMaker: aiMemory.decisionMaker,
    });

    if (isClosingStep && !hasClosingContext) {
      const contextGapTaskId = await ensureAiLeadTask({
        tenantId: input.tenantId,
        leadId,
        title: "Coletar contexto minimo antes de proposta/reuniao",
        type: "follow_up",
        priority: "high",
        dueAt: addHours(now, 2),
        reasonCode: "ai_context_gap_closing",
        taskKey: buildAiTaskKey("ai_context_gap_closing", input.chatId),
      });

      if (contextGapTaskId) {
        await Promise.all([
          leadRef.collection("events").add({
            type: "ai_closing_context_gap_task",
            title: "IA segurou fechamento por falta de contexto",
            detail:
              "Antes de proposta/reuniao, a IA abriu tarefa para coletar contexto comercial minimo com o lead.",
            actorId: "ai_sales_agent",
            actorName: "AI Sales Agent",
            createdAt: FieldValue.serverTimestamp(),
          }),
          createAiInternalNotification({
            tenantId: input.tenantId,
            chatId: input.chatId,
            leadId,
            type: "closing_context_gap",
            severity: "warning",
            title: "IA segurou fechamento por falta de contexto",
            detail:
              "Faltou contexto minimo para proposta/reuniao. A IA abriu follow-up de qualificacao antes do fechamento.",
          }),
        ]);
        actions.push("create_context_gap_followup_task");
        actions.push("notify_internal_team");
      } else {
        actions.push("context_gap_followup_task_already_pending");
      }
    } else {
    const taskPreset = buildAiTaskPreset(input.plan.nextAction, input.leadName);
    const followupReasonCode = normalizeReasonCode(`ai_next_action_${input.plan.nextAction}`, "ai_next_action");
    const followupTaskId = await ensureAiLeadTask({
      tenantId: input.tenantId,
      leadId,
      title: taskPreset.title,
      type: taskPreset.type,
      priority: taskPreset.priority,
      dueAt: addHours(now, getAiTaskDueHours(input.plan.nextAction, input.plan.commercialTemperature || null)),
      reasonCode: followupReasonCode,
      taskKey: buildAiTaskKey(followupReasonCode, input.plan.stateAfter || "conversation"),
    });

    if (followupTaskId) {
      await Promise.all([
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
    } else {
      actions.push("followup_task_already_pending");
    }
    }
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
      ownerUserId: input.leadOwnerId || sanitizeText(leadData.ownerId, 160) || null,
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
    const handoffTaskId = await ensureAiLeadTask({
      tenantId: input.tenantId,
      leadId,
      title: "Assumir handoff solicitado pela IA",
      type: "handoff",
      priority: "high",
      dueAt: addHours(now, 1),
      reasonCode: "ai_handoff_requested",
      taskKey: buildAiTaskKey("ai_handoff_requested", input.chatId),
    });

    if (handoffTaskId) {
      await Promise.all([
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
    } else {
      actions.push("handoff_task_already_pending");
    }
  }

  await syncLeadCommercialState({
    tenantId: input.tenantId,
    leadId,
    actorId: "ai_sales_agent",
    actorName: "AI Sales Agent",
    allowStageAdvance: canAdvanceStage,
    preserveManualScore: true,
  });
  actions.push("sync_crm_state");

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
  type?: "text" | "audio" | "image" | "video" | "document" | "template";
  channelPhoneNumberId?: string;
  channel?: string;
  senderId?: string;
  senderName?: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  metaMessageId?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateParams?: string[] | null;
  voiceReply?: boolean;
  voiceReplyVoice?: string | null;
  voiceReplyTranscript?: string | null;
}) {
  const cleanText = sanitizeText(input.text, 1800);
  if (!cleanText && !["audio", "image", "video", "document"].includes(String(input.type || ""))) return;

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
      mediaSize: typeof input.mediaSize === "number" && Number.isFinite(input.mediaSize) ? input.mediaSize : null,
      metaMessageId: input.metaMessageId || null,
      templateName: input.templateName || null,
      templateLanguage: input.templateLanguage || null,
      templateParams: Array.isArray(input.templateParams) ? input.templateParams.slice(0, 20) : null,
      voiceReply: input.voiceReply === true,
      voiceReplyVoice: input.voiceReplyVoice || null,
      voiceReplyTranscript: input.voiceReplyTranscript || null,
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

function selectMediaDocForLead(input: {
  inboundText: string;
  kbDocs: KbDoc[];
  conversation: ConversationMessage[];
  recommendedOffer?: string | null;
  commercialTemperature?: string | null;
}) {
  const asksForMedia = textHasAny(input.inboundText, [
    "foto",
    "fotos",
    "imagem",
    "imagens",
    "video",
    "videos",
    "resultado",
    "resultados",
    "antes e depois",
    "catalogo",
    "portfolio",
    "prova",
    "exemplo",
  ]);
  const normalizedOffer = normalizeComparable(sanitizeText(input.recommendedOffer, 160));
  const commercialTemperature = sanitizeText(input.commercialTemperature, 40).toLowerCase();
  const proactiveCommercialSend = Boolean(normalizedOffer || commercialTemperature === "hot");
  if (!asksForMedia && !proactiveCommercialSend) return null;

  const alreadySent = new Set(
    input.conversation
      .filter((item) => item.sender === "agent")
      .map((item) => sanitizeText(item.mediaUrl, 1200))
      .filter(Boolean)
  );
  const inboundWords = new Set(normalizeWords(input.inboundText));

  return (
    input.kbDocs
      .filter((doc) => {
        if (!doc.mediaUrl || !doc.mediaType || alreadySent.has(doc.mediaUrl)) return false;
        return doc.availability !== "paused";
      })
      .map((doc) => {
        const productWords = normalizeWords(
          [doc.productName, doc.productCategory, doc.serviceKey, ...(doc.tags || [])].filter(Boolean).join(" ")
        );
        const mediaWords = [
          ...normalizeWords(doc.serviceKey || ""),
          ...normalizeWords(doc.mediaTitle || ""),
          ...doc.tags.flatMap((tag) => normalizeWords(tag)),
          ...normalizeWords(doc.content),
        ];
        const overlap = mediaWords.filter((word) => inboundWords.has(word)).length;
        const offerMatch = normalizedOffer
          ? [doc.productName, doc.serviceKey, doc.content]
              .filter(Boolean)
              .map((item) => normalizeComparable(String(item || "")))
              .some((item) => item.includes(normalizedOffer) || normalizedOffer.includes(item))
          : false;
        const productOverlap = productWords.filter((word) => inboundWords.has(word)).length;
        const catalogPriority = typeof doc.priority === "number" ? Math.max(0, Math.min(10, doc.priority)) : 0;
        const catalogBoost = asksForMedia ? 0 : proactiveCommercialSend ? 1.25 : 0;
        return {
          doc,
          score:
            doc.score +
            overlap * 0.4 +
            productOverlap * 0.5 +
            (offerMatch ? 2 : 0) +
            catalogPriority * 0.08 +
            catalogBoost,
        };
      })
      .sort((a, b) => b.score - a.score)[0]?.doc || null
  );
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
    email: "email",
    contactemail: "email",
    contact_email: "email",
    mail: "email",
    phone: "phone",
    telefone: "phone",
    contactphone: "phone",
    contact_phone: "phone",
    whatsapp: "phone",
    mobile: "phone",
    celular: "phone",
    company: "company",
    businessname: "company",
    empresa: "company",
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

type CommercialOfferBundle = {
  primaryOffer: string | null;
  upsellOffer: string | null;
  crossSellOffer: string | null;
  primaryDocId: string | null;
  rationale: string[];
};

function parseBudgetMaxSignal(value: string) {
  const normalized = sanitizeText(value, 200).toLowerCase();
  if (!normalized) return null;
  const matches = Array.from(normalized.matchAll(/(\d[\d\.,]*)\s*(k|mil)?/g));
  if (!matches.length) return null;

  let maxValue = 0;
  for (const match of matches) {
    const raw = String(match[1] || "").replace(/\./g, "").replace(",", ".");
    const base = Number(raw);
    if (!Number.isFinite(base) || base <= 0) continue;
    const suffix = String(match[2] || "").trim();
    const multiplier = suffix === "k" || suffix === "mil" ? 1000 : 1;
    const amount = base * multiplier;
    if (amount > maxValue) maxValue = amount;
  }

  return maxValue > 0 ? maxValue : null;
}

function recommendCommercialOffers(input: {
  kbDocs: KbDoc[];
  inboundText: string;
  extractedFields?: Record<string, string> | null;
  leadMemory: AltumLeadMemory | null;
  plannerRecommendedOffer?: string | null;
  commercialTemperature?: string | null;
  stageAfter?: string | null;
}) {
  const catalogDocs = input.kbDocs.filter((doc) => doc.type === "catalog" && doc.availability !== "paused");
  if (!catalogDocs.length) {
    return {
      primaryOffer: sanitizeText(input.plannerRecommendedOffer, 160) || null,
      upsellOffer: null,
      crossSellOffer: null,
      primaryDocId: null,
      rationale: ["no_catalog_docs"],
    } satisfies CommercialOfferBundle;
  }

  const preferenceSignal = sanitizeText(
    input.plannerRecommendedOffer ||
      input.extractedFields?.serviceInterest ||
      input.extractedFields?.offer ||
      input.leadMemory?.recommendedOffer,
    180
  );
  const businessSignal = sanitizeText(
    input.extractedFields?.businessType || input.extractedFields?.niche || input.leadMemory?.businessType,
    140
  );
  const goalSignal = sanitizeText(input.extractedFields?.primaryGoal || input.leadMemory?.primaryGoal, 180);
  const inboundSignal = sanitizeText(input.inboundText, 300);
  const stageSignal = sanitizeText(input.stageAfter, 60).toLowerCase();
  const budgetSignal = sanitizeText(input.extractedFields?.budgetBand || input.leadMemory?.budgetBand, 120);
  const budgetMax = parseBudgetMaxSignal(budgetSignal);
  const isHot = sanitizeText(input.commercialTemperature, 40).toLowerCase() === "hot";

  const hasMatch = (left: string, right: string) => {
    const a = normalizeComparable(left);
    const b = normalizeComparable(right);
    if (!a || !b) return false;
    return a.includes(b) || b.includes(a);
  };

  const describeDoc = (doc: KbDoc) =>
    sanitizeText(doc.productName || doc.serviceKey || doc.mediaTitle || doc.content, 160) || "oferta";

  const ranked = catalogDocs
    .map((doc) => {
      const corpus = [
        doc.productName,
        doc.productCategory,
        doc.targetProfile,
        doc.serviceKey,
        doc.content,
        ...(doc.tags || []),
      ]
        .filter(Boolean)
        .join(" ");
      let score = doc.score;
      score += (typeof doc.priority === "number" ? Math.max(0, Math.min(10, doc.priority)) : 0) * 0.12;
      if (doc.availability === "seasonal") score -= 0.2;

      if (preferenceSignal && hasMatch(corpus, preferenceSignal)) score += 2.2;
      if (businessSignal && hasMatch(doc.targetProfile || corpus, businessSignal)) score += 1.1;
      if (goalSignal && hasMatch(corpus, goalSignal)) score += 0.9;
      if (inboundSignal && hasMatch(corpus, inboundSignal)) score += 0.7;
      if (isHot) score += 0.45;
      if (stageSignal === "recommendation" || stageSignal === "objection_handling") score += 0.35;

      if (budgetMax && typeof doc.priceFrom === "number" && doc.priceFrom > 0) {
        if (doc.priceFrom <= budgetMax * 1.2) score += 0.8;
        else if (doc.priceFrom > budgetMax * 1.8) score -= 0.8;
      }

      return { doc, score };
    })
    .sort((a, b) => b.score - a.score);

  const primary = ranked[0]?.doc || null;
  if (!primary) {
    return {
      primaryOffer: sanitizeText(input.plannerRecommendedOffer, 160) || null,
      upsellOffer: null,
      crossSellOffer: null,
      primaryDocId: null,
      rationale: ["catalog_rank_empty"],
    } satisfies CommercialOfferBundle;
  }

  const docsByKey = new Map<string, KbDoc>();
  for (const doc of catalogDocs) {
    const keys = [doc.id, doc.serviceKey, doc.productName, doc.mediaTitle]
      .map((value) => normalizeComparable(String(value || "")))
      .filter(Boolean);
    for (const key of keys) {
      if (!docsByKey.has(key)) docsByKey.set(key, doc);
    }
  }
  const resolveByKeys = (keys: string[] | undefined) => {
    if (!Array.isArray(keys) || !keys.length) return null;
    for (const raw of keys) {
      const key = normalizeComparable(raw);
      if (!key) continue;
      const direct = docsByKey.get(key);
      if (direct) return direct;
      const fuzzy = catalogDocs.find((doc) => {
        const corpus = normalizeComparable([doc.serviceKey, doc.productName, doc.mediaTitle].join(" "));
        if (!corpus) return false;
        return corpus.includes(key) || key.includes(corpus);
      });
      if (fuzzy) return fuzzy;
    }
    return null;
  };

  const higherPriced = ranked
    .map((item) => item.doc)
    .filter(
      (doc) =>
        doc.id !== primary.id &&
        typeof doc.priceFrom === "number" &&
        typeof primary.priceFrom === "number" &&
        doc.priceFrom > primary.priceFrom
    );
  const adjacent = ranked
    .map((item) => item.doc)
    .filter((doc) => doc.id !== primary.id)
    .slice(0, 5);

  const upsellDoc =
    resolveByKeys(primary.upsellKeys) || (isHot || budgetMax ? higherPriced[0] || null : null) || adjacent[0] || null;
  const crossSellDoc =
    resolveByKeys(primary.crossSellKeys) ||
    adjacent.find(
      (doc) =>
        doc.id !== upsellDoc?.id &&
        normalizeComparable(String(doc.productCategory || "")) !==
          normalizeComparable(String(primary.productCategory || ""))
    ) ||
    adjacent.find((doc) => doc.id !== upsellDoc?.id) ||
    null;

  return {
    primaryOffer: describeDoc(primary),
    upsellOffer: upsellDoc ? describeDoc(upsellDoc) : null,
    crossSellOffer: crossSellDoc ? describeDoc(crossSellDoc) : null,
    primaryDocId: primary.id,
    rationale: [
      preferenceSignal ? "matched_preference_signal" : "no_preference_signal",
      isHot ? "hot_lead_boost" : "default_temperature",
      budgetMax ? `budget_signal_${Math.round(budgetMax)}` : "no_budget_signal",
    ],
  } satisfies CommercialOfferBundle;
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
  const businessTypeSignal = sanitizeText(extractedFields?.businessType || input.leadMemory?.businessType, 120);
  const primaryGoalSignal = sanitizeText(extractedFields?.primaryGoal || input.leadMemory?.primaryGoal, 180);
  const commercialSignals = [
    businessTypeSignal,
    primaryGoalSignal,
    sanitizeText(extractedFields?.serviceInterest || input.leadMemory?.recommendedOffer, 180),
    sanitizeText(extractedFields?.currentChannels || input.leadMemory?.currentChannels, 180),
    sanitizeText(extractedFields?.budgetBand || input.leadMemory?.budgetBand, 120),
    sanitizeText(extractedFields?.urgency || input.leadMemory?.urgency, 120),
    sanitizeText(extractedFields?.digitalMaturity || input.leadMemory?.digitalMaturity, 120),
    sanitizeText(input.leadMemory?.activeTopic, 120),
  ].filter(Boolean);
  const hasCommercialContext = Boolean(
    (businessTypeSignal && primaryGoalSignal) ||
      commercialSignals.length >= 2 ||
      ["recommendation", "advance"].includes(sanitizeText(input.leadMemory?.conversationMaturity, 80).toLowerCase())
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

  if (!hasCommercialContext && isClosingPush && !shouldKeepConversationalFreedom) {
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

  const emailMatch = normalizedText.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  if (emailMatch?.[1]) {
    extracted.email = emailMatch[1].toLowerCase();
  }

  const phoneMatch = normalizedText.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-\s]?\d{4}/);
  if (phoneMatch?.[0]) {
    extracted.phone = normalizePhone(phoneMatch[0]);
  }

  const explicitNameMatch = normalizedText.match(
    /\b(?:meu nome e|me chamo|pode me chamar de|sou o|sou a|eu sou)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\-\s]{1,40})/i
  );
  if (explicitNameMatch?.[1]) {
    const possibleName = sanitizeText(explicitNameMatch[1], 80);
    if (looksLikeHumanName(possibleName)) {
      extracted.preferredName = possibleName;
    }
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

async function resolveHandoffNotifyRecipients(input: {
  tenantId: string;
  aiConfig: TenantAiConfig;
  chatData: Record<string, unknown>;
  tenantSettings: Awaited<ReturnType<typeof getTenantSettings>>;
  leadId?: string | null;
}) {
  if (!input.aiConfig.handoffNotifyEnabled) {
    return [] as Array<{ phone: string; source: string }>;
  }

  const recipients = new Map<string, string>();
  const addRecipient = (phone: string, source: string) => {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    if (!recipients.has(normalized)) {
      recipients.set(normalized, source);
    }
  };

  addRecipient(input.aiConfig.responsiblePhone, "ai_responsible_phone");
  for (const phone of input.aiConfig.handoffNotifyPhones) {
    addRecipient(phone, "ai_handoff_notify_phone");
  }

  const tenantSettingsRecord =
    input.tenantSettings && typeof input.tenantSettings === "object"
      ? (input.tenantSettings as Record<string, unknown>)
      : null;

  for (const phone of extractPhoneCandidates(tenantSettingsRecord)) {
    addRecipient(phone, "tenant_settings");
  }

  const ownerIds = new Set<string>();
  const chatOwnerId = sanitizeText(input.chatData.ownerId || input.chatData.assignedUserId, 160);
  if (chatOwnerId) ownerIds.add(chatOwnerId);
  for (const phone of extractPhoneCandidates(input.chatData)) {
    addRecipient(phone, "chat_owner");
  }

  if (input.leadId) {
    const leadSnap = await adminDb.collection("leads").doc(input.leadId).get();
    if (leadSnap.exists) {
      const leadData = leadSnap.data() as Record<string, unknown>;
      if (String(leadData.tenantId || "") === input.tenantId) {
        for (const phone of extractPhoneCandidates(leadData)) {
          addRecipient(phone, "lead_owner");
        }
        const leadOwnerId = sanitizeText(
          leadData.ownerId || leadData.assignedUserId || leadData.responsavelId,
          160
        );
        if (leadOwnerId) ownerIds.add(leadOwnerId);
      }
    }
  }

  for (const ownerId of ownerIds) {
    const tenantUserDocId = `${input.tenantId}_${ownerId}`;
    const tenantUserByDoc = await adminDb.collection("tenant_users").doc(tenantUserDocId).get();
    if (tenantUserByDoc.exists) {
      for (const phone of extractPhoneCandidates(tenantUserByDoc.data() as Record<string, unknown>)) {
        addRecipient(phone, "tenant_user");
      }
    } else {
      const tenantUserByQuery = await adminDb
        .collection("tenant_users")
        .where("userId", "==", ownerId)
        .limit(20)
        .get();
      const tenantUserMatch = tenantUserByQuery.docs.find(
        (doc) => String((doc.data() as Record<string, unknown>).tenantId || "") === input.tenantId
      );
      if (tenantUserMatch) {
        for (const phone of extractPhoneCandidates(tenantUserMatch.data() as Record<string, unknown>)) {
          addRecipient(phone, "tenant_user");
        }
      }
    }

    const userDoc = await adminDb.collection("users").doc(ownerId).get();
    if (userDoc.exists) {
      for (const phone of extractPhoneCandidates(userDoc.data() as Record<string, unknown>)) {
        addRecipient(phone, "global_user");
      }
    }
  }

  return Array.from(recipients.entries())
    .slice(0, 6)
    .map(([phone, source]) => ({ phone, source }));
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

  if (await isTenantBillingBlocked(tenantId)) {
    return { decision: "skip", reason: "tenant_billing_blocked" };
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
  const messageType = sanitizeText(incomingMessage.type, 40);

  const aiConfig = parseAiConfig(tenantSettings);
  const agentDisplayName = sanitizeText(aiConfig.agentName, 80) || "Agente IA";
  const runtimeProvider = aiConfig.runtimePolicy.primaryProvider;
  const runtimeModel = aiConfig.runtimePolicy.conversationModel;
  const monthlyUsage = await getAiMonthlyUsageSnapshot(tenantId);
  const usageCapExceeded =
    Number(aiConfig.monthlyUsageCap || 0) > 0 &&
    Number(monthlyUsage.conversationRuns || 0) >= Number(aiConfig.monthlyUsageCap || 0);
  const budgetCapExceeded =
    Number(aiConfig.monthlyBudgetUsd || 0) > 0 &&
    Number(monthlyUsage.estimatedCostUsd || 0) >= Number(aiConfig.monthlyBudgetUsd || 0);
  const usageGuardTriggered = usageCapExceeded || budgetCapExceeded;
  const shouldUseProviderLlm = runtimeProvider !== "altum_rules" && !usageGuardTriggered;
  const chatChannel = String(chatData.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  const isMetaConversation = isMetaConversationChannelType(chatChannel);

  if (usageGuardTriggered && leadId) {
    await createAiInternalNotificationOnce({
      tenantId,
      chatId,
      leadId,
      type: usageCapExceeded ? "ai_usage_cap_reached" : "ai_budget_cap_reached",
      severity: "high",
      title: usageCapExceeded ? "Limite mensal de execucoes da IA atingido" : "Budget mensal da IA atingido",
      detail: usageCapExceeded
        ? `A IA entrou em contingencia. Execucoes no mes: ${monthlyUsage.conversationRuns}/${aiConfig.monthlyUsageCap}.`
        : `A IA entrou em contingencia. Custo estimado no mes: US$ ${Number(monthlyUsage.estimatedCostUsd || 0).toFixed(2)} / US$ ${Number(aiConfig.monthlyBudgetUsd || 0).toFixed(2)}.`,
      dedupeWindowMinutes: 360,
    });
  }

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

  const [conversation, kbDocs, runtimeState, leadMemory, learningHints] = await Promise.all([
    fetchConversation(chatId, tenantId),
    fetchKbDocs(tenantId, inboundText, aiConfig.runtimePolicy.retrievalMode),
    getConversationRuntimeState(tenantId, chatId),
    leadId ? getLeadMemory(tenantId, leadId) : Promise.resolve(null),
    getTenantLearningHints(tenantId),
  ]);
  const tenantAiWithLearning: TenantAiConfig = {
    ...aiConfig,
    learningHints,
  };

  const runtimeStateSummary = summarizeRuntimeStateForAgent(runtimeState);
  const leadMemorySummary = summarizeLeadMemoryForAgent(leadMemory);
  const preferredContactName =
    sanitizeText(leadMemory?.preferredName, 80) ||
    sanitizeText(runtimeState?.preferredName, 80) ||
    (looksLikeHumanName(chatData.contactName) ? sanitizeText(chatData.contactName, 120) : "") ||
    undefined;
  const plannedResponsePreference = inferResponseFormatPreference({
    inboundText,
    messageType,
    previousAskedAt: chatState.responseFormatPreferenceAskedAt || null,
  }).preference;
  const plannedAudioResponse = shouldPlanAudioResponse({
    preference: plannedResponsePreference || chatState.responseFormatPreference || null,
    voiceReplyEnabled: aiConfig.voiceReplyEnabled === true,
    voiceReplyMode: aiConfig.voiceReplyMode,
    inboundMessageType: incomingMessage.type as string | null,
  });

  let llmRun: Awaited<ReturnType<typeof runConversationAgent>> | null = null;
  let unexpectedProviderError = "";
  if (shouldUseProviderLlm) {
    try {
      llmRun = await runConversationAgent(
        {
          tenantId,
          chatId,
          inboundText,
          multimodalSummary: multimodal.summary || undefined,
          messageType,
          channel: chatChannel,
          agentName: aiConfig.agentName,
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
          learningHints: tenantAiWithLearning.learningHints,
          tier: aiConfig.tier,
          autonomyMode: aiConfig.autonomyMode,
          reasoningLevel: aiConfig.reasoningLevel,
          responseStyle: aiConfig.responseStyle,
          plannedResponseFormat: plannedAudioResponse ? "audio" : "text",
          conversation,
          kbDocs,
          preferredProviders: aiConfig.preferredProviders,
        },
        aiConfig.runtimePolicy
      );
    } catch (error) {
      unexpectedProviderError =
        error instanceof Error ? sanitizeText(error.message, 280) : "conversation_router_unexpected_error";
    }
  }
  const llmResult = llmRun?.result || null;
  const providerChainError = llmRun?.providerChainError || unexpectedProviderError || null;
  const providerFallbackTriggered = Boolean(llmRun?.providerFallbackTriggered || llmResult?.fallbackUsed);
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
      learningHints: tenantAiWithLearning.learningHints,
    },
  });
  const commercialOfferBundle = recommendCommercialOffers({
    kbDocs,
    inboundText,
    extractedFields,
    leadMemory,
    plannerRecommendedOffer: plannerDecision.recommendedOffer || null,
    commercialTemperature: plannerDecision.commercialTemperature || null,
    stageAfter: plannerDecision.stateAfter || null,
  });
  const recommendedOfferResolved = commercialOfferBundle.primaryOffer || plannerDecision.recommendedOffer || null;
  const nextAction = plannerDecision.nextAction || choice.nextAction;
  const effectiveProvider = llmResult?.provider || runtimeProvider;
  const effectiveModel = llmResult?.model || runtimeModel;
  const decisionReasonForQueue =
    usageGuardTriggered && choice.reason
      ? `usage_cap_contingency:${sanitizeText(choice.reason, 140)}`
      : providerChainError && choice.reason
      ? `provider_fallback_contingency:${sanitizeText(choice.reason, 140)}`
      : choice.reason;
  const providerFallbackToolCalls = [
    ...(usageGuardTriggered ? ["usage_cap_contingency"] : []),
    ...(providerChainError ? ["provider_fallback_contingency"] : []),
  ];

  if (providerChainError && leadId) {
    await createAiInternalNotificationOnce({
      tenantId,
      chatId,
      leadId,
      type: "ai_provider_contingency",
      severity: "warning",
      title: "IA em contingencia por falha de provider",
      detail: `A conversa seguiu em modo de contingencia. Motivo tecnico: ${sanitizeText(providerChainError, 220)}.`,
      dedupeWindowMinutes: 180,
    });
  }

  const shouldUseWhatsApp = chatChannel === "whatsapp";
  const whatsappChannel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: tenantId === "ALTUM_AGENCY",
    channelId: String(chatData.channelId || "").trim() || null,
    phoneNumberId: String(chatData.channelPhoneNumberId || "").trim() || null,
  });
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
      recommendedOffer: recommendedOfferResolved,
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

  const inferredResponsePreference = inferResponseFormatPreference({
    inboundText,
    messageType,
    previousAskedAt: chatState.responseFormatPreferenceAskedAt || null,
  });
  const resolvedResponsePreference: ResponseFormatPreference | null =
    inferredResponsePreference.preference || chatState.responseFormatPreference || null;
  if (
    inferredResponsePreference.preference &&
    inferredResponsePreference.preference !== chatState.responseFormatPreference
  ) {
    await adminDb
      .collection("chat_state")
      .doc(getChatStateDocId(tenantId, chatId))
      .set(
        {
          tenantId,
          chatId,
          responseFormatPreference: inferredResponsePreference.preference,
          responseFormatPreferenceUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  if (aiConfig.responsePaused) {
    const suppressedOutboundText = sanitizeText(choice.responseText, 1200);
    const quality = scoreAltumConversationQuality({
      inboundText,
      outboundText: suppressedOutboundText,
      plan: plannerDecision,
      runtimeState,
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
      leadOwnerId: sanitizeText(chatData.ownerId || chatData.assignedUserId, 160) || null,
      leadOwnerName: sanitizeText(chatData.ownerName || chatData.assignedUserName, 120) || null,
    });
    const pausedSummary = buildPersistentConversationSummary({
      llmMemorySummary: llmResult?.memorySummary || null,
      preferredName: preferredContactName || null,
      leadTone: extractedFields?.leadTone || runtimeState?.leadTone || leadMemory?.leadTone || null,
      activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || leadMemory?.activeTopic || null,
      conversationMaturity: plannerDecision.stateAfter,
      businessType: extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || null,
      primaryGoal: extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || null,
      currentChannels: extractedFields?.currentChannels || leadMemory?.currentChannels || null,
      dominantObjection: plannerDecision.objectionType || leadMemory?.dominantObjection || null,
      openQuestion: "",
      recommendedOffer: recommendedOfferResolved,
      nextAction,
    });

    await saveAiLog({
      logDocId,
      tenantId,
      chatId,
      messageId,
      leadId,
      decision: "skip",
      reason: "tenant_ai_response_paused",
      inboundText,
      outboundText: suppressedOutboundText,
      toolCalls: [
        "kb_docs",
        "offer_engine",
        "chat_state",
        "tenant_settings.ai.responsePaused",
        ...providerFallbackToolCalls,
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
      recommendedOffer: recommendedOfferResolved,
      objectionType: plannerDecision.objectionType || null,
      commercialTemperature: plannerDecision.commercialTemperature || null,
      llmTurnGoal: llmResult?.turnGoal || null,
      llmMemorySummary: llmResult?.memorySummary || null,
      conversationLedBy: choice.ledBy,
      qualityScore: quality.score,
      qualityNotes: ["Resposta automatica pausada no tenant.", ...quality.notes],
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
      decision: "skip",
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
        reason: "tenant_ai_response_paused",
        runtimePolicy: aiConfig.runtimePolicy,
        fallbackUsed: providerFallbackTriggered,
        providerChainError,
        usageGuardTriggered,
        matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
        extractedFields,
        nextAction,
        plannerIntent: plannerDecision.intent,
        stateBefore: plannerDecision.stateBefore,
        stateAfter: plannerDecision.stateAfter,
        responseGoal: plannerDecision.responseGoal,
        recommendedOffer: recommendedOfferResolved,
        executedActions,
      },
    });
    await trackAltumAgentLearning({
      tenantId,
      chatId,
      leadId,
      aiLogId: logDocId,
      decision: "skip",
      intent: plannerDecision.intent,
      responseGoal: plannerDecision.responseGoal,
      stateAfter: plannerDecision.stateAfter,
      recommendedOffer: recommendedOfferResolved,
      objectionType: plannerDecision.objectionType || null,
      nextAction,
      confidence: choice.confidence,
      commercialTemperature: plannerDecision.commercialTemperature || null,
      qualityScore: quality.score,
    });
    await upsertConversationRuntimeState({
      tenantId,
      chatId,
      leadId,
      inboundText,
      outboundText: "",
      decision: "skip",
      reason: "tenant_ai_response_paused",
      confidence: choice.confidence,
      nextAction,
      stage: plannerDecision.stateAfter,
      intent: plannerDecision.intent,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: recommendedOfferResolved,
      objectionType: plannerDecision.objectionType || null,
      turnGoal: llmResult?.turnGoal || null,
      memorySummary: llmResult?.memorySummary || null,
      summary: pausedSummary,
      extractedFields,
    });

    if (leadId) {
      await upsertLeadMemory({
        tenantId,
        leadId,
        extractedFields,
        nextAction,
        recommendedOffer: recommendedOfferResolved,
        dominantIntent: plannerDecision.intent,
        dominantObjection: plannerDecision.objectionType || null,
        preferredName: preferredContactName || null,
        leadTone: extractedFields?.leadTone || runtimeState?.leadTone || null,
        activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || null,
        openQuestion: "",
        conversationMaturity: plannerDecision.stateAfter,
        memorySummary: llmResult?.memorySummary || null,
        summary: pausedSummary,
      });
    }

    return { decision: "skip", reason: "tenant_ai_response_paused" };
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
      senderName: agentDisplayName,
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

    const handoffRecipients = whatsappChannel
      ? await resolveHandoffNotifyRecipients({
          tenantId,
          aiConfig,
          chatData,
          tenantSettings,
          leadId,
        })
      : [];

    const previousHandoffNotifyMessageId = sanitizeText(chatState.lastHandoffNotifyMessageId, 160);
    const previousHandoffNotifyStatus = sanitizeText(chatState.lastHandoffNotifyStatus, 80).toLowerCase();
    const handoffNotifyAlreadyHandled =
      previousHandoffNotifyMessageId === messageId &&
      [
        "success",
        "partial_failure",
        "failed",
        "skipped_no_channel",
        "skipped_no_recipients",
        "skipped_disabled",
      ].includes(previousHandoffNotifyStatus);

    let handoffNotifySuccessCount = 0;
    let handoffNotifyFailureCount = 0;
    let handoffNotifyStatus = "pending";
    if (handoffNotifyAlreadyHandled) {
      handoffNotifyStatus = "skipped_duplicate";
      handoffNotifySuccessCount = Math.max(0, Number(chatState.lastHandoffNotifySuccessCount || 0));
      handoffNotifyFailureCount = Math.max(0, Number(chatState.lastHandoffNotifyFailureCount || 0));
    } else if (!aiConfig.handoffNotifyEnabled) {
      handoffNotifyStatus = "skipped_disabled";
    } else if (!whatsappChannel) {
      handoffNotifyStatus = "skipped_no_channel";
    } else if (!handoffRecipients.length) {
      handoffNotifyStatus = "skipped_no_recipients";
    } else {
      const leadName = sanitizeText(chatData.contactName, 120) || "Contato";
      const leadPhoneLabel =
        leadPhone || normalizePhone(String(chatData.contactPhone || "")) || "sem telefone";
      const businessType =
        sanitizeText(extractedFields?.businessType || leadMemory?.businessType, 120) || "nao mapeado";
      const primaryGoal =
        sanitizeText(extractedFields?.primaryGoal || leadMemory?.primaryGoal, 160) || "nao mapeado";
      const budgetBand =
        sanitizeText(extractedFields?.budgetBand || leadMemory?.budgetBand, 120) || "nao informado";
      const temperature = sanitizeText(plannerDecision.commercialTemperature, 40) || "em avaliacao";
      const nextActionLabel = sanitizeText(nextAction, 160) || "nao definido";

      const notification = [
        `Handoff solicitado para tenant ${tenantId}.`,
        `Conversa: ${chatId}`,
        `Lead: ${leadName} (${leadPhoneLabel})`,
        `Motivo: ${sanitizeText(plannerDecision.reason || choice.reason, 180) || "avaliacao da IA"}`,
        `Temperatura: ${temperature}`,
        `Proximo passo: ${nextActionLabel}`,
        `Negocio: ${businessType}`,
        `Objetivo: ${primaryGoal}`,
        `Orcamento: ${budgetBand}`,
        `Inbox: ${conversationLink}`,
        "Resumo:",
        ...summaryBullets,
      ].join("\n");

      const notifyResults = await Promise.allSettled(
        handoffRecipients.map((recipient) =>
          sendMetaTextMessage({
            channel: whatsappChannel,
            to: recipient.phone,
            text: notification,
          })
        )
      );

      handoffNotifySuccessCount = notifyResults.filter((result) => result.status === "fulfilled").length;
      handoffNotifyFailureCount = Math.max(0, notifyResults.length - handoffNotifySuccessCount);
      handoffNotifyStatus =
        handoffNotifyFailureCount === 0
          ? "success"
          : handoffNotifySuccessCount > 0
            ? "partial_failure"
            : "failed";

      if (handoffNotifyFailureCount > 0 && leadId) {
        await createAiInternalNotification({
          tenantId,
          chatId,
          leadId,
          type: "handoff_notify_failed",
          severity: "warning",
          title: "Falha parcial ao notificar handoff no WhatsApp",
          detail: `${handoffNotifyFailureCount} notificacao(oes) nao foram entregues. Verifique phones dos responsaveis.`,
        });
      }
    }

    if (leadId && handoffNotifyStatus === "skipped_no_channel") {
      await createAiInternalNotificationOnce({
        tenantId,
        chatId,
        leadId,
        type: "handoff_notify_missing_channel",
        severity: "high",
        title: "Handoff sem notificacao no WhatsApp",
        detail:
          "A IA escalou para humano, mas nao encontrou canal WhatsApp ativo para enviar alerta ao responsavel.",
        dedupeWindowMinutes: 240,
      });
    }

    if (leadId && handoffNotifyStatus === "skipped_no_recipients") {
      await createAiInternalNotificationOnce({
        tenantId,
        chatId,
        leadId,
        type: "handoff_notify_missing_recipients",
        severity: "high",
        title: "Handoff sem destinatarios configurados",
        detail:
          "A IA escalou para humano, mas nao encontrou telefone valido para notificar responsavel no WhatsApp.",
        dedupeWindowMinutes: 240,
      });
    }

    if (leadId && handoffNotifyStatus === "skipped_disabled") {
      await createAiInternalNotificationOnce({
        tenantId,
        chatId,
        leadId,
        type: "handoff_notify_disabled",
        severity: "info",
        title: "Notificacao de handoff desativada",
        detail:
          "A IA escalou para humano, porem o envio de notificacoes de handoff no WhatsApp esta desativado nas configuracoes.",
        dedupeWindowMinutes: 360,
      });
    }

    await adminDb
      .collection("chat_state")
      .doc(getChatStateDocId(tenantId, chatId))
      .set(
        {
          tenantId,
          chatId,
          lastHandoffNotifyAt: FieldValue.serverTimestamp(),
          lastHandoffNotifyMessageId: messageId,
          lastHandoffNotifyStatus: handoffNotifyStatus,
          lastHandoffNotifyRecipients: handoffRecipients.length,
          lastHandoffNotifySuccessCount: handoffNotifySuccessCount,
          lastHandoffNotifyFailureCount: handoffNotifyFailureCount,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

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
      leadOwnerId: sanitizeText(chatData.ownerId || chatData.assignedUserId, 160) || null,
      leadOwnerName: sanitizeText(chatData.ownerName || chatData.assignedUserName, 120) || null,
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
        "offer_engine",
        "chat_state",
        "tenant_settings.ai",
        shouldUseWhatsApp ? "whatsapp_send" : isMetaConversation ? "meta_send" : "site_chat_reply",
        ["success", "partial_failure", "failed"].includes(handoffNotifyStatus) ? "handoff_notify" : "handoff_log",
        handoffNotifyStatus !== "pending" ? `handoff_notify_${handoffNotifyStatus}` : "",
        handoffNotifyFailureCount > 0 ? "handoff_notify_partial_failure" : "",
        ...providerFallbackToolCalls,
      ].filter(Boolean),
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
      recommendedOffer: recommendedOfferResolved,
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
        fallbackUsed: providerFallbackTriggered,
        providerChainError,
        usageGuardTriggered,
        usageCapExceeded,
        budgetCapExceeded,
        usageMonthRef: monthlyUsage.monthRef,
        usageConversationRuns: monthlyUsage.conversationRuns,
        usageEstimatedCostUsd: Number(monthlyUsage.estimatedCostUsd || 0),
        matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
        extractedFields,
        nextAction,
        plannerIntent: plannerDecision.intent,
        stateBefore: plannerDecision.stateBefore,
        stateAfter: plannerDecision.stateAfter,
        responseGoal: plannerDecision.responseGoal,
        recommendedOffer: recommendedOfferResolved,
        offerBundlePrimary: commercialOfferBundle.primaryOffer,
        offerBundleUpsell: commercialOfferBundle.upsellOffer,
        offerBundleCrossSell: commercialOfferBundle.crossSellOffer,
        offerBundlePrimaryDocId: commercialOfferBundle.primaryDocId,
        offerBundleRationale: commercialOfferBundle.rationale,
        objectionType: plannerDecision.objectionType || null,
        commercialTemperature: plannerDecision.commercialTemperature || null,
        conversationLedBy: choice.ledBy,
        qualityScore: quality.score,
        qualityNotes: quality.notes,
        handoffNotifyStatus,
        handoffNotifySkippedDuplicate: handoffNotifyStatus === "skipped_duplicate",
        handoffNotifyRecipients: handoffRecipients.length,
        handoffNotifySuccessCount,
        handoffNotifyFailureCount,
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
      recommendedOffer: recommendedOfferResolved,
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
    const handoffSummary = buildPersistentConversationSummary({
      llmMemorySummary: llmResult?.memorySummary || null,
      preferredName: preferredContactName || null,
      leadTone: extractedFields?.leadTone || runtimeState?.leadTone || leadMemory?.leadTone || null,
      activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || leadMemory?.activeTopic || null,
      conversationMaturity: plannerDecision.stateAfter,
      businessType: extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || null,
      primaryGoal: extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || null,
      currentChannels: extractedFields?.currentChannels || leadMemory?.currentChannels || null,
      dominantObjection: plannerDecision.objectionType || leadMemory?.dominantObjection || null,
      openQuestion: leadAck,
      recommendedOffer: recommendedOfferResolved,
      nextAction,
    });

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
      recommendedOffer: recommendedOfferResolved,
      objectionType: plannerDecision.objectionType || null,
      turnGoal: llmResult?.turnGoal || null,
      memorySummary: llmResult?.memorySummary || null,
      summary: handoffSummary,
      extractedFields,
    });

    if (leadId) {
      await upsertLeadMemory({
        tenantId,
        leadId,
        extractedFields,
        nextAction,
        recommendedOffer: recommendedOfferResolved,
        dominantIntent: plannerDecision.intent,
        dominantObjection: plannerDecision.objectionType || null,
        preferredName: preferredContactName || null,
        leadTone: extractedFields?.leadTone || runtimeState?.leadTone || null,
        activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || null,
        openQuestion: leadAck,
        conversationMaturity: plannerDecision.stateAfter,
        memorySummary: llmResult?.memorySummary || null,
        summary: handoffSummary,
      });
    }

    return { decision: "handoff", reason: decisionReasonForQueue };
  }

  const responseText =
    chooseConversationalReply({
      llmResponseText: llmResult?.responseText || choice.responseText || "",
      previousOutboundText: runtimeState?.lastOutboundText || null,
      fallbackWriterText: makeLeadFacingReply({
        tenantAi: aiConfig,
        decision: choice.decision,
        inboundText,
        messageType: sanitizeText(incomingMessage.type, 40) || null,
        multimodalSummary: multimodal.summary || null,
        kbDocs,
        conversation,
        contactName: preferredContactName || null,
      }),
    }) || "Perfeito. Me conta so mais um ponto rapido para eu te orientar melhor.";
  let secondaryResponseText = buildSecondaryCommercialNudge({
    inboundText,
    responseText,
    messageType: sanitizeText(incomingMessage.type, 40) || null,
    decision: choice.decision,
    conversation,
    mandatoryQuestions: aiConfig.mandatoryQuestions,
  });
  const whatsappServiceWindowClosed = shouldUseWhatsApp
    ? isWhatsAppServiceWindowClosed(chatData.lastClientMessageAt)
    : false;
  const voiceReplyDecision = shouldProactivelySendVoiceReply({
    preference: resolvedResponsePreference,
    voiceReplyEnabled: aiConfig.voiceReplyEnabled === true,
    voiceReplyMode: aiConfig.voiceReplyMode,
    shouldUseWhatsApp,
    serviceWindowClosed: whatsappServiceWindowClosed,
    hasChannel: Boolean(whatsappChannel),
    hasLeadPhone: Boolean(leadPhone),
    inboundMessageType: incomingMessage.type as string | null,
    plannerIntent: plannerDecision.intent,
    responseGoal: plannerDecision.responseGoal,
    commercialTemperature: plannerDecision.commercialTemperature,
    recommendedOffer: recommendedOfferResolved,
  });
  const inboundMessageType = sanitizeText(incomingMessage.type, 40).toLowerCase();
  const voiceRequestedThisTurn = resolvedResponsePreference === "audio" || inboundMessageType === "audio";
  const voiceAvailableThisTurn =
    aiConfig.voiceReplyEnabled === true &&
    shouldUseWhatsApp &&
    !whatsappServiceWindowClosed &&
    Boolean(whatsappChannel) &&
    Boolean(leadPhone);
  const shouldSendVoiceReply = voiceReplyDecision.shouldSend || (voiceRequestedThisTurn && voiceAvailableThisTurn);
  const voiceReplyDecisionReason = voiceReplyDecision.shouldSend
    ? voiceReplyDecision.reason
    : shouldSendVoiceReply
      ? "explicit_voice_request"
      : voiceReplyDecision.reason;
  const shouldAskResponseFormatNow = !shouldSendVoiceReply && shouldOfferResponseFormatChoice({
    chatState,
    messageType,
    inboundText,
    conversation,
  });
  const responseFormatPrompt = shouldAskResponseFormatNow
    ? String(messageType || "").toLowerCase() === "audio"
      ? "Se voce preferir, eu posso te responder em audio ou em texto. Qual formato voce prefere?"
      : "Se preferir, eu tambem posso te explicar em um audio curto. Voce prefere resposta em audio ou em texto?"
    : "";
  const responseFormatPromptSent = Boolean(responseFormatPrompt);
  if (responseFormatPrompt) {
    secondaryResponseText = secondaryResponseText
      ? `${secondaryResponseText}\n${responseFormatPrompt}`
      : responseFormatPrompt;
  }
  let finalOutboundText = secondaryResponseText ? `${responseText}\n${secondaryResponseText}` : responseText;
  if (looksLikeRepeatedQuestion(finalOutboundText, runtimeState?.lastOutboundText || null)) {
    const diagnosticClose = buildDirectDiagnosticClose({
      businessType: extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || null,
      primaryGoal: extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || null,
      currentChannels: extractedFields?.currentChannels || leadMemory?.currentChannels || null,
      recommendedOffer: recommendedOfferResolved,
      nextAction,
    });
    if (diagnosticClose) {
      finalOutboundText = diagnosticClose;
      secondaryResponseText = "";
    }
  }
  if (shouldSendVoiceReply) {
    finalOutboundText = prepareOutboundTextForAudioDelivery(finalOutboundText, inboundText);
    secondaryResponseText = "";
  } else if (voiceRequestedThisTurn) {
    finalOutboundText = prepareOutboundTextForVoiceUnavailable(finalOutboundText, inboundText);
    secondaryResponseText = "";
  }
  const primaryTextToSend = secondaryResponseText ? responseText : finalOutboundText;
  const openQuestionForMemory = finalOutboundText;
  const conversationSummary = buildPersistentConversationSummary({
    llmMemorySummary: llmResult?.memorySummary || null,
    preferredName: preferredContactName || null,
    leadTone: extractedFields?.leadTone || runtimeState?.leadTone || leadMemory?.leadTone || null,
    activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || leadMemory?.activeTopic || null,
    conversationMaturity: plannerDecision.stateAfter,
    businessType: extractedFields?.businessType || extractedFields?.niche || leadMemory?.businessType || null,
    primaryGoal: extractedFields?.primaryGoal || extractedFields?.goal || leadMemory?.primaryGoal || null,
    currentChannels: extractedFields?.currentChannels || leadMemory?.currentChannels || null,
    dominantObjection: plannerDecision.objectionType || leadMemory?.dominantObjection || null,
    openQuestion: openQuestionForMemory,
    recommendedOffer: recommendedOfferResolved,
    nextAction,
  });
  const quality = scoreAltumConversationQuality({
    inboundText,
    outboundText: finalOutboundText,
    plan: plannerDecision,
    runtimeState,
  });

  let sentAsTemplate = false;
  let sentTemplateName: string | null = null;
  let sentTemplateLanguage: string | null = null;
  let sentTemplateParams: string[] = [];
  let sentTemplateMetaMessageId: string | null = null;
  let voiceReplySent = false;
  let voiceReplyError: string | null = null;

  if (shouldUseWhatsApp && whatsappChannel && leadPhone) {
    if (whatsappServiceWindowClosed) {
      if (!aiConfig.whatsappTemplateFollowUpEnabled) {
        throw new Error(
          "Janela de 24h encerrada e follow-up automatico por template esta desativado na configuracao de IA."
        );
      }
      if (!aiConfig.whatsappTemplateFollowUpName) {
        throw new Error(
          "Janela de 24h encerrada e nenhum template padrao foi configurado para follow-up automatico da IA."
        );
      }

      sentTemplateName = aiConfig.whatsappTemplateFollowUpName;
      sentTemplateLanguage = aiConfig.whatsappTemplateFollowUpLanguage || "pt_BR";
      sentTemplateParams = resolveFollowUpTemplateParams(aiConfig.whatsappTemplateFollowUpParams, {
        contactName: chatData.contactName,
        contactPhone: chatData.contactPhone,
        tenantName: tenantSettings?.name,
      });
      let templatePayload: { messages?: Array<{ id?: string }> } | null = null;
      try {
        templatePayload = await sendMetaTemplateMessage({
          channel: whatsappChannel,
          to: leadPhone,
          templateName: sentTemplateName,
          languageCode: sentTemplateLanguage,
          bodyParams: sentTemplateParams,
        });
      } catch (error) {
        if (leadId) {
          await createAiInternalNotificationOnce({
            tenantId,
            chatId,
            leadId,
            type: "followup_template_send_failed",
            severity: "high",
            title: "Falha no follow-up automatico por template",
            detail: `A IA tentou enviar o template ${sentTemplateName} (${sentTemplateLanguage}) e falhou: ${
              error instanceof Error ? error.message : "erro desconhecido"
            }`,
            dedupeWindowMinutes: 240,
          });
        }
        throw error;
      }
      sentTemplateMetaMessageId = String(templatePayload?.messages?.[0]?.id || "").trim() || null;
      sentAsTemplate = true;
      finalOutboundText = sentTemplateParams.length
        ? `Template enviado: ${sentTemplateName}\nVariaveis: ${sentTemplateParams.join(" | ")}`
        : `Template enviado: ${sentTemplateName}`;
    } else {
      if (shouldSendVoiceReply) {
        try {
          const voiceSent = await sendAltumVoiceReply({
            channel: whatsappChannel,
            to: leadPhone,
            text: finalOutboundText,
            tenantId,
            chatId,
            voice: aiConfig.voiceReplyVoice,
            maxChars: aiConfig.voiceReplyMaxChars,
          });

          await addMessage({
            chatId,
            tenantId,
            text: voiceSent.text || finalOutboundText,
            sender: "agent",
            type: "audio",
            channel: chatChannel,
            channelPhoneNumberId: whatsappChannel.phoneNumberId,
            senderName: agentDisplayName,
            mediaUrl: voiceSent.signedUrl,
            mediaName: "Resposta em audio ALTUM",
            mediaMimeType: voiceSent.contentType,
            mediaSize: voiceSent.size,
            metaMessageId: voiceSent.metaMessageId,
            voiceReply: true,
            voiceReplyVoice: voiceSent.voice,
            voiceReplyTranscript: voiceSent.text,
          });
          voiceReplySent = true;
        } catch (error) {
          voiceReplyError =
            error instanceof Error ? sanitizeText(error.message, 220) : "voice_reply_send_failed";
          finalOutboundText = `Tentei enviar em audio, mas o envio falhou agora. Para nao te deixar esperando: ${prepareOutboundTextForAudioDelivery(finalOutboundText, inboundText)}`;
          console.error("Falha ao enviar resposta em voz da IA:", error);
          if (leadId) {
            await createAiInternalNotificationOnce({
              tenantId,
              chatId,
              leadId,
              type: "voice_reply_send_failed",
              severity: "high",
              title: "Falha ao enviar resposta em audio",
              detail: `A IA tentou responder com audio e falhou. Motivo: ${voiceReplyError}.`,
              dedupeWindowMinutes: 180,
            });
          }
        }
      }

      if (!voiceReplySent) {
        await sendMetaTextMessage({
          channel: whatsappChannel,
          to: leadPhone,
          text: shouldSendVoiceReply || voiceRequestedThisTurn ? finalOutboundText : primaryTextToSend,
        });
      }
    }
  } else if (isMetaConversation && metaChannel && metaRecipientId) {
    await sendMetaConversationText({
      channel: metaChannel,
      recipientId: metaRecipientId,
      text: voiceRequestedThisTurn ? finalOutboundText : primaryTextToSend,
    });
  }

  if (sentAsTemplate || !voiceReplySent) {
    await addMessage({
      chatId,
      tenantId,
      text: sentAsTemplate ? finalOutboundText : shouldSendVoiceReply || voiceRequestedThisTurn ? finalOutboundText : primaryTextToSend,
      sender: "agent",
      type: sentAsTemplate ? "template" : "text",
      channel: chatChannel,
      channelPhoneNumberId: whatsappChannel?.phoneNumberId,
      senderName: agentDisplayName,
      metaMessageId: sentTemplateMetaMessageId,
      templateName: sentTemplateName,
      templateLanguage: sentTemplateLanguage,
      templateParams: sentTemplateParams,
    });
  }

  if (secondaryResponseText && !sentAsTemplate && !voiceReplySent) {
    if (shouldUseWhatsApp && whatsappChannel && leadPhone) {
      await sendMetaTextMessage({
        channel: whatsappChannel,
        to: leadPhone,
        text: secondaryResponseText,
      });
    } else if (isMetaConversation && metaChannel && metaRecipientId) {
      await sendMetaConversationText({
        channel: metaChannel,
        recipientId: metaRecipientId,
        text: secondaryResponseText,
      });
    }

    await addMessage({
      chatId,
      tenantId,
      text: secondaryResponseText,
      sender: "agent",
      channel: chatChannel,
      channelPhoneNumberId: whatsappChannel?.phoneNumberId,
      senderName: agentDisplayName,
    });
  }

  const mediaDoc = selectMediaDocForLead({
    inboundText,
    kbDocs,
    conversation,
    recommendedOffer: recommendedOfferResolved,
    commercialTemperature: plannerDecision.commercialTemperature || null,
  });
  let mediaAssetSent = false;
  if (mediaDoc?.mediaUrl && mediaDoc.mediaType && !whatsappServiceWindowClosed) {
    const mediaCaption =
      sanitizeText(mediaDoc.mediaTitle, 180) ||
      sanitizeText(mediaDoc.content, 180) ||
      "Material relacionado ao que voce pediu.";
    try {
      if (shouldUseWhatsApp && whatsappChannel && leadPhone) {
        await sendMetaMediaLinkMessage({
          channel: whatsappChannel,
          to: leadPhone,
          mediaUrl: mediaDoc.mediaUrl,
          mediaType: mediaDoc.mediaType,
          caption: mediaCaption,
          filename: mediaDoc.mediaTitle || "material",
        });
      } else if (isMetaConversation && metaChannel && metaRecipientId) {
        await sendMetaConversationText({
          channel: metaChannel,
          recipientId: metaRecipientId,
          text: `${mediaCaption}\n${mediaDoc.mediaUrl}`,
        });
      }

      await addMessage({
        chatId,
        tenantId,
        text: mediaCaption,
        sender: "agent",
        type: mediaDoc.mediaType,
        channel: chatChannel,
        channelPhoneNumberId: whatsappChannel?.phoneNumberId,
        senderName: agentDisplayName,
        mediaUrl: mediaDoc.mediaUrl,
        mediaName: mediaDoc.mediaTitle || mediaDoc.serviceKey || "Material enviado pela IA",
        mediaMimeType: mediaDoc.mediaMimeType || undefined,
        mediaSize: mediaDoc.mediaSize || undefined,
      });
      mediaAssetSent = true;
    } catch (error) {
      console.error("Falha ao enviar midia da base pela IA:", error);
    }
  }

  if (responseFormatPromptSent) {
    await adminDb
      .collection("chat_state")
      .doc(getChatStateDocId(tenantId, chatId))
      .set(
        {
          tenantId,
          chatId,
          responseFormatPreferenceAskedAt: FieldValue.serverTimestamp(),
          responseFormatPreferenceAskCount: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
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
    leadOwnerId: sanitizeText(chatData.ownerId || chatData.assignedUserId, 160) || null,
    leadOwnerName: sanitizeText(chatData.ownerName || chatData.assignedUserName, 120) || null,
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
    outboundText: finalOutboundText,
    toolCalls: [
      "kb_docs",
      "offer_engine",
      "chat_state",
      "tenant_settings.ai",
      shouldUseWhatsApp ? "whatsapp_send" : isMetaConversation ? "meta_send" : "site_chat_reply",
      ...providerFallbackToolCalls,
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
    recommendedOffer: recommendedOfferResolved,
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
      fallbackUsed: providerFallbackTriggered,
      providerChainError,
      usageGuardTriggered,
      usageCapExceeded,
      budgetCapExceeded,
      usageMonthRef: monthlyUsage.monthRef,
      usageConversationRuns: monthlyUsage.conversationRuns,
      usageEstimatedCostUsd: Number(monthlyUsage.estimatedCostUsd || 0),
      matchedKbDocIds: kbDocs.slice(0, 5).map((doc) => doc.id),
      extractedFields,
      nextAction,
      plannerIntent: plannerDecision.intent,
      stateBefore: plannerDecision.stateBefore,
      stateAfter: plannerDecision.stateAfter,
      responseGoal: plannerDecision.responseGoal,
      recommendedOffer: recommendedOfferResolved,
      offerBundlePrimary: commercialOfferBundle.primaryOffer,
      offerBundleUpsell: commercialOfferBundle.upsellOffer,
      offerBundleCrossSell: commercialOfferBundle.crossSellOffer,
      offerBundlePrimaryDocId: commercialOfferBundle.primaryDocId,
      offerBundleRationale: commercialOfferBundle.rationale,
      objectionType: plannerDecision.objectionType || null,
      commercialTemperature: plannerDecision.commercialTemperature || null,
      conversationLedBy: choice.ledBy,
      qualityScore: quality.score,
      qualityNotes: quality.notes,
      secondaryResponseSent: Boolean(secondaryResponseText),
      secondaryResponseText: secondaryResponseText || null,
      executedActions,
      mediaAssetSent,
      voiceReplySent,
      voiceReplyError,
      voiceReplyDecisionReason,
      voiceRequestedThisTurn,
      voiceAvailableThisTurn,
      voiceReplyMode: aiConfig.voiceReplyMode,
      voiceReplyMaxChars: aiConfig.voiceReplyMaxChars,
      responseFormatPreference: resolvedResponsePreference || null,
      inferredResponsePreferenceReason: inferredResponsePreference.reason,
      responseFormatPromptSent,
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
    recommendedOffer: recommendedOfferResolved,
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
    outboundText: finalOutboundText,
    decision: choice.decision,
    reason: choice.reason,
    confidence: choice.confidence,
    nextAction,
    stage: plannerDecision.stateAfter,
    intent: plannerDecision.intent,
    responseGoal: plannerDecision.responseGoal,
    recommendedOffer: recommendedOfferResolved,
    objectionType: plannerDecision.objectionType || null,
    turnGoal: llmResult?.turnGoal || null,
    memorySummary: llmResult?.memorySummary || null,
    summary: conversationSummary,
    extractedFields,
  });

  if (leadId) {
    await upsertLeadMemory({
      tenantId,
      leadId,
      extractedFields,
      nextAction,
      recommendedOffer: recommendedOfferResolved,
      dominantIntent: plannerDecision.intent,
      dominantObjection: plannerDecision.objectionType || null,
      preferredName: preferredContactName || null,
      leadTone: extractedFields?.leadTone || runtimeState?.leadTone || null,
      activeTopic: extractedFields?.activeTopic || runtimeState?.activeTopic || null,
      openQuestion: openQuestionForMemory,
      conversationMaturity: plannerDecision.stateAfter,
      memorySummary: llmResult?.memorySummary || null,
      summary: conversationSummary,
    });
  }

  return {
    decision: choice.decision,
    reason: decisionReasonForQueue,
  };
}


