import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { isExactCrmRecordId } from "@/lib/crm-observation-identity";
import { currentCommercialField, commercialFieldDefinitions, type CommercialField } from "@/lib/crm-current-facts";
import { prepareAiExecutionAuthority } from "./execution-authority";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { extractLeadAttributionSummary } from "@/lib/server/attribution";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import {
  mergeRelationshipState,
  normalizeRelationshipState,
  type RelationshipState,
} from "@/lib/server/ai/relationship-state";

export type AltumConversationStage =
  | "greeting"
  | "discovery"
  | "qualification"
  | "recommendation"
  | "objection_handling"
  | "scheduling"
  | "proposal_path"
  | "handoff"
  | "paused";

export type AltumConversationRuntimeState = {
  tenantId: string;
  chatId: string;
  leadId?: string | null;
  stage?: AltumConversationStage | null;
  intent?: string | null;
  confidence?: number | null;
  nextAction?: string | null;
  recommendedOffer?: string | null;
  responseGoal?: string | null;
  objectionType?: string | null;
  turnGoal?: string | null;
  memorySummary?: string | null;
  summary?: string | null;
  lastDecision?: string | null;
  lastReason?: string | null;
  lastInboundText?: string | null;
  lastOutboundText?: string | null;
  pendingQuestion?: string | null;
  lastLeadQuestion?: string | null;
  preferredName?: string | null;
  leadTone?: string | null;
  activeTopic?: string | null;
  conversationMaturity?: string | null;
  activeSpecialist?: string | null;
  specialistSupervisorVersion?: string | null;
  specialistTransferReason?: string | null;
  specialistDecisionKey?: string | null;
};

export type AltumLeadMemory = {
  tenantId: string;
  leadId: string;
  attributionSource?: string | null;
  attributionMedium?: string | null;
  attributionCampaign?: string | null;
  attributionCampaignId?: string | null;
  attributionChannel?: string | null;
  attributionSourceLabel?: string | null;
  lastOutboundCampaignId?: string | null;
  lastOutboundCampaignName?: string | null;
  lastOutboundTemplateName?: string | null;
  lastOutboundMessage?: string | null;
  lastOutboundChannel?: string | null;
  campaignOfferName?: string | null;
  campaignOfferSummary?: string | null;
  campaignExampleUrl?: string | null;
  campaignExampleLabel?: string | null;
  campaignResponseTriggers?: string[] | null;
  campaignNextStep?: string | null;
  campaignHandoffRule?: string | null;
  campaignFollowupNotes?: string | null;
  businessType?: string | null;
  primaryGoal?: string | null;
  budgetBand?: string | null;
  urgency?: string | null;
  dominantIntent?: string | null;
  dominantObjection?: string | null;
  decisionMaker?: string | null;
  digitalMaturity?: string | null;
  city?: string | null;
  currentChannels?: string | null;
  teamSize?: string | null;
  recommendedOffer?: string | null;
  nextBestAction?: string | null;
  diagnosis?: string | null;
  personalizedPlan?: string | null;
  sellerNextMove?: string | null;
  materialToSend?: string | null;
  proposalOutline?: string | null;
  memorySummary?: string | null;
  summary?: string | null;
  preferredName?: string | null;
  leadTone?: string | null;
  activeTopic?: string | null;
  openQuestion?: string | null;
  conversationMaturity?: string | null;
  fields?: Record<string, string>;
  relationshipState?: RelationshipState | null;
};

function cleanText(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function hasKeyword(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
}

function extractQuestion(text: string) {
  const clean = cleanText(text, 400);
  if (!clean || !clean.includes("?")) return "";
  const match = clean.match(/([^?]+\?)/);
  return cleanText(match?.[1] || clean, 220);
}

function humanizeOutboundToken(value: unknown) {
  const raw = cleanText(value, 180);
  if (!raw) return "";
  return raw
    .replace(/\b(v\d+|pt_br|en_us|marketing|utility|utilidade)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractOutboundLine(text: string, label: string, max = 360) {
  const clean = cleanText(text, 1200);
  if (!clean) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = clean.match(new RegExp(`${escaped}:\\s*([^\\n]+)`, "i"));
  return cleanText(match?.[1] || "", max);
}

function normalizeForInternalLeakCheck(value: string) {
  return cleanText(value, 1600)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasInternalCampaignText(value: unknown) {
  const normalized = normalizeForInternalLeakCheck(cleanText(value, 1600));
  if (!normalized) return false;
  return [
    /\bplaybook\b/,
    /\bguardrail\b/,
    /\bruntime\b/,
    /\bhandoff\b/,
    /\bclarify\b/,
    /\boferta provavel\b/,
    /\bproxima acao\b/,
    /\bvariaveis\b/,
    /\btemplate enviado\b/,
    /\bcampanha\s*:/,
    /\bmidia\s*:/,
    /\borigem\s*:/,
    /\blead sem clareza\b/,
    /\blead chega confuso\b/,
    /\bia nao deve\b/,
    /\buse para responder\b/,
  ].some((pattern) => pattern.test(normalized));
}

function cleanPublicCampaignText(value: unknown, max = 500) {
  const text = cleanText(value, max);
  if (!text || hasInternalCampaignText(text)) return "";
  return text.replace(/^(mensagem|oferta|proximo passo|pr[oó]ximo passo|exemplo)\s*:\s*/i, "").trim().slice(0, max);
}

function inferOutboundOfferName(input: {
  followupContext: Record<string, unknown>;
  outboundContext: Record<string, unknown>;
  leadData: Record<string, unknown>;
  outboundMessage: string;
}) {
  const explicit =
    cleanPublicCampaignText(input.followupContext.offerName, 160) ||
    cleanPublicCampaignText(input.outboundContext.offerName, 160) ||
    cleanPublicCampaignText(extractOutboundLine(input.outboundMessage, "Oferta", 160), 160);
  if (explicit) return explicit;

  const campaignName =
    cleanText(input.outboundContext.campaignName, 160) ||
    cleanText(input.leadData.lastOutboundCampaignName, 160);
  if (campaignName && !/^campanha\s*\d*$/i.test(campaignName)) return campaignName;

  const templateName = humanizeOutboundToken(input.outboundContext.templateName);
  if (templateName) return templateName;

  const messageHint = cleanPublicCampaignText(extractOutboundLine(input.outboundMessage, "Mensagem", 160), 160);
  if (messageHint) return messageHint;

  return "";
}

function extractPreferredName(inboundText: string, extractedFields?: Record<string, string> | null) {
  const explicit = cleanText(
    extractedFields?.preferredName || extractedFields?.name || extractedFields?.contactName,
    80
  );
  if (explicit) return explicit;

  const clean = cleanText(inboundText, 220);
  const patterns = [
    /(?:meu nome e|meu nome é)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /(?:pode me chamar de|me chama de)\s+([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
    /(?:sou|aqui e|aqui é)\s+(?!uma\b|um\b|o\b|a\b)([A-Za-zÀ-ÿ]{2,}(?:\s+[A-Za-zÀ-ÿ]{2,})?)/i,
  ];

  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (match?.[1]) {
      const candidate = cleanText(match[1], 80);
      return looksLikeHumanName(candidate) ? candidate : "";
    }
  }

  return "";
}

function inferLeadTone(inboundText: string, extractedFields?: Record<string, string> | null) {
  const explicit = cleanText(
    extractedFields?.leadTone || extractedFields?.tone || extractedFields?.mood,
    80
  );
  if (explicit) return explicit;

  const clean = cleanText(inboundText, 260).toLowerCase();
  if (!clean) return "";
  if (/\b(urgente|urgencia|urgência|pra hoje|agora|o quanto antes)\b/.test(clean)) return "urgente";
  if (/\b(nao entendi|não entendi|confuso|como assim|explica)\b/.test(clean)) return "confuso";
  if (/\b(quanto custa|qual o preco|qual o preço|valor)\b/.test(clean)) return "objetivo";
  if (/\b(quero|preciso|busco|me ajuda)\b/.test(clean)) return "aberto";
  if (/\?$/.test(clean) || clean.includes("?")) return "curioso";
  if (/^(sim|ok|beleza|claro|isso|entendi)\b/.test(clean)) return "receptivo";
  return "";
}

function inferActiveTopic(inboundText: string, extractedFields?: Record<string, string> | null) {
  const explicit = cleanText(
    extractedFields?.activeTopic || extractedFields?.topic || extractedFields?.serviceInterest,
    120
  );
  if (explicit) return explicit;

  const clean = cleanText(inboundText, 260).toLowerCase();
  if (!clean) return "";
  if (/\b(whatsapp|atendimento|responder)\b/.test(clean)) return "atendimento_whatsapp";
  if (/\b(lead|leads|captar|captacao|captação|trafego|tráfego)\b/.test(clean)) return "geracao_de_leads";
  if (/\b(site|landing page|lp)\b/.test(clean)) return "ativos_digitais";
  if (/\b(crm|pipeline|comercial|processo)\b/.test(clean)) return "operacao_comercial";
  if (/\b(preco|preço|valor|orcamento|orçamento)\b/.test(clean)) return "preco";
  if (/\b(proposta|reuniao|reunião|agendar|diagnostico|diagnóstico)\b/.test(clean)) return "fechamento";
  return "";
}

function inferConversationMaturity(stage?: AltumConversationStage | null, nextAction?: string | null) {
  const normalizedStage = cleanText(stage, 60).toLowerCase();
  const normalizedAction = cleanText(nextAction, 160).toLowerCase();

  if (normalizedStage === "handoff") return "handoff";
  if (normalizedStage === "proposal_path" || normalizedStage === "scheduling") return "advance";
  if (normalizedStage === "recommendation") return "recommendation";
  if (normalizedStage === "objection_handling") return "objection";
  if (normalizedStage === "qualification") return "qualification";
  if (normalizedStage === "discovery") return "discovery";
  if (normalizedStage === "greeting") return "opening";

  if (/proposta|agendar|reuniao|diagnostico/.test(normalizedAction)) return "advance";
  if (/objecao|obje/.test(normalizedAction)) return "objection";
  if (/qualificar|coletar_contexto/.test(normalizedAction)) return "qualification";
  return "";
}

function looksLikeHumanName(value: string) {
  const clean = cleanText(value, 80);
  if (!clean) return false;
  if (/\d{4,}|@/.test(clean)) return false;
  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (["lead", "contato", "cliente"].includes(normalized)) return false;
  if (
    /\b(empresa|suplementos|odontologia|imobiliaria|agencia|consultoria|clinica|marketing|studio|loja|comercio|comercial|ltda|eireli|me|sa|grupo|laboratorio)\b/.test(
      normalized
    )
  ) {
    return false;
  }
  return normalized.split(/\s+/).length <= 4;
}

export function getConversationRuntimeDocId(tenantId: string, chatId: string) {
  return `${tenantId.trim()}_${chatId.trim()}`;
}

export function getSelectedConversationRuntimeDocId(tenantId: string, chatId: string, selectionId: string) {
  if (![tenantId, chatId, selectionId].every(id => isExactCrmRecordId(id))) throw new Error("AI_RUNTIME_INVALID_CONTEXT");
  return `selected_${createHash("sha256").update(JSON.stringify([tenantId, chatId, selectionId])).digest("hex")}`;
}

async function runtimeScope(tx: FirebaseFirestore.Transaction, tenantId: string, chatId: string, fence?: ConversationCommercialFence) {
  if (![tenantId, chatId].every(id => isExactCrmRecordId(id))) return null;
  await prepareAiExecutionAuthority(tenantId, chatId, tx);
  const chat = await tx.get(adminDb.collection("chats").doc(chatId));
  if (!chat.exists || chat.data()?.tenantId !== tenantId) return null;
  if (fence && (fence.tenantId !== tenantId || fence.chatId !== chatId || !await matchesConversationCommercialFence(tx, fence))) return null;
  const selectionId = fence?.selectionId;
  if (chat.data()?.commercialContext !== undefined && !selectionId) return null;
  return { chat, selectionId, id: selectionId ? getSelectedConversationRuntimeDocId(tenantId, chatId, selectionId) : getConversationRuntimeDocId(tenantId, chatId) };
}

function matchesRuntimeParent(row: Record<string, unknown>, scope: NonNullable<Awaited<ReturnType<typeof runtimeScope>>>, tenantId: string, chatId: string) {
  return row.tenantId === tenantId && row.chatId === chatId &&
    (!scope.selectionId || row.chatGeneration instanceof Timestamp) &&
    (!scope.chat.data()?.leadId || !row.leadId || scope.chat.data()?.leadId === row.leadId) &&
    (row.selectionId || "") === (scope.selectionId || "") &&
    (!row.chatGeneration || row.chatGeneration instanceof Timestamp && scope.chat.createTime?.isEqual(row.chatGeneration));
}

export function getLeadMemoryDocId(tenantId: string, leadId: string) {
  return `${tenantId.trim()}_${leadId.trim()}`;
}

export function inferConversationStage(input: {
  inboundText: string;
  decision: "respond" | "ask_more" | "handoff" | "skip";
  nextAction?: string | null;
  extractedFields?: Record<string, string> | null;
  previousStage?: AltumConversationStage | null;
}): AltumConversationStage {
  const normalized = cleanText(input.inboundText, 400).toLowerCase();
  if (input.decision === "handoff") return "handoff";
  if (input.decision === "skip" && input.previousStage) return input.previousStage;
  if (hasKeyword(normalized, ["oi", "ola", "bom dia", "boa tarde", "boa noite"]) && normalized.length < 40) {
    return "greeting";
  }
  if (
    hasKeyword(normalized, [
      "preco",
      "valor",
      "investimento",
      "orcamento",
      "caro",
      "desconto",
    ])
  ) {
    return "objection_handling";
  }
  if (
    input.nextAction?.includes("proposta") ||
    input.nextAction?.includes("diagnostico") ||
    input.nextAction?.includes("reuniao")
  ) {
    return "recommendation";
  }
  if (input.extractedFields && Object.keys(input.extractedFields).length >= 2) {
    return "qualification";
  }
  return input.decision === "ask_more" ? "qualification" : "discovery";
}

export async function upsertConversationRuntimeState(input: {
  tenantId: string;
  chatId: string;
  leadId?: string | null;
  inboundText: string;
  outboundText?: string | null;
  decision: "respond" | "ask_more" | "handoff" | "skip";
  reason: string;
  confidence?: number | null;
  nextAction?: string | null;
  stage?: AltumConversationStage | null;
  intent?: string | null;
  responseGoal?: string | null;
  recommendedOffer?: string | null;
  objectionType?: string | null;
  turnGoal?: string | null;
  memorySummary?: string | null;
  summary?: string | null;
  extractedFields?: Record<string, string> | null;
  sourceOccurredAtMs?: number | null;
  sourceMessageId?: string | null;
  activeSpecialist?: string | null;
  specialistSupervisorVersion?: string | null;
  specialistTransferReason?: string | null;
  specialistDecisionKey?: string | null;
  conversationFence?: ConversationCommercialFence;
}) {
  const occurredAtMs = Number(input.sourceOccurredAtMs) > 0 ? Math.round(Number(input.sourceOccurredAtMs)) : Date.now();
  return adminDb.runTransaction(async (tx) => {
    const scope = await runtimeScope(tx, input.tenantId, input.chatId, input.conversationFence);
    if (!scope || scope.chat.data()?.leadId && scope.chat.data()?.leadId !== input.leadId ||
        input.conversationFence && (input.conversationFence.leadId !== input.leadId || input.conversationFence.messageId !== input.sourceMessageId))
      return { applied: false, reason: "context_changed" as const };
    const ref = adminDb.collection("ai_conversation_state").doc(scope.id);
    const snap = await tx.get(ref);
    if (snap.exists && (!matchesRuntimeParent(snap.data()!, scope, input.tenantId, input.chatId) || !snap.data()?.chatGeneration &&
        (snap.createTime!.seconds < scope.chat.createTime!.seconds || snap.createTime!.seconds === scope.chat.createTime!.seconds && snap.createTime!.nanoseconds < scope.chat.createTime!.nanoseconds)))
      return { applied: false, reason: "context_changed" as const };
    const previous = snap.exists ? (snap.data() as { stage?: AltumConversationStage; lastSourceOccurredAtMs?: number }) : null;
    if (Number(previous?.lastSourceOccurredAtMs || 0) > occurredAtMs) {
      return { applied: false, reason: "out_of_order" as const };
    }
    const stage = input.stage || inferConversationStage({
      inboundText: input.inboundText,
      decision: input.decision,
      nextAction: input.nextAction,
      extractedFields: input.extractedFields || null,
      previousStage: previous?.stage || null,
    });
    const intent = cleanText(input.intent, 80) || cleanText(input.extractedFields?.intent, 80) ||
      (stage === "greeting" ? "greeting" : stage === "objection_handling" ? "price_or_objection" : "");
    const recommendedOffer = cleanText(input.recommendedOffer, 140) || cleanText(input.extractedFields?.serviceInterest, 140) || "";
    const payload: Record<string, unknown> = {
      tenantId: input.tenantId,
      chatId: input.chatId,
      chatGeneration: scope.chat.createTime!,
      ...(scope.selectionId ? { selectionId: scope.selectionId } : {}),
      leadId: input.leadId || null,
      stage,
      intent: intent || null,
      confidence: typeof input.confidence === "number" ? input.confidence : null,
      nextAction: cleanText(input.nextAction, 160) || null,
      recommendedOffer: recommendedOffer || null,
      responseGoal: cleanText(input.responseGoal, 80) || null,
      objectionType: cleanText(input.objectionType, 80) || null,
      turnGoal: cleanText(input.turnGoal, 140) || null,
      memorySummary: cleanText(input.memorySummary, 260) || null,
      summary: cleanText(input.summary, 260) || null,
      lastDecision: input.decision,
      lastReason: cleanText(input.reason, 180) || null,
      lastInboundText: cleanText(input.inboundText, 800) || null,
      lastOutboundText: cleanText(input.outboundText, 800) || null,
      pendingQuestion: extractQuestion(input.outboundText || "") || null,
      lastLeadQuestion: extractQuestion(input.inboundText) || null,
      preferredName: extractPreferredName(input.inboundText, input.extractedFields) || null,
      leadTone: inferLeadTone(input.inboundText, input.extractedFields) || null,
      activeTopic: inferActiveTopic(input.inboundText, input.extractedFields) || null,
      conversationMaturity: inferConversationMaturity(stage, input.nextAction || null) || null,
      activeSpecialist: cleanText(input.activeSpecialist, 40) || null,
      specialistSupervisorVersion: cleanText(input.specialistSupervisorVersion, 80) || null,
      specialistTransferReason: cleanText(input.specialistTransferReason, 120) || null,
      specialistDecisionKey: cleanText(input.specialistDecisionKey, 96) || null,
      lastSourceOccurredAtMs: occurredAtMs,
      lastSourceMessageId: cleanText(input.sourceMessageId, 180) || null,
      lastLeadMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.outboundText) payload.lastAiReplyAt = FieldValue.serverTimestamp();
    if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
    tx.set(ref, payload, { merge: true });
    return { applied: true, reason: "applied" as const };
  });
}

export async function upsertLeadMemory(input: {
  tenantId: string;
  leadId: string;
  extractedFields?: Record<string, string> | null;
  nextAction?: string | null;
  recommendedOffer?: string | null;
  dominantIntent?: string | null;
  dominantObjection?: string | null;
  summary?: string | null;
  preferredName?: string | null;
  leadTone?: string | null;
  activeTopic?: string | null;
  openQuestion?: string | null;
  conversationMaturity?: string | null;
  memorySummary?: string | null;
  inboundText?: string | null;
  sourceOccurredAtMs?: number | null;
  sourceMessageId?: string | null;
  identityKey?: string | null;
  conversationFence?: ConversationCommercialFence;
}) {
  const fields = input.extractedFields || null;
  const safeFields = fields || {};

  const businessType = cleanText(safeFields.businessType || safeFields.niche || safeFields.segment, 120);
  const primaryGoal = cleanText(safeFields.primaryGoal || safeFields.goal || safeFields.objective, 180);
  const budgetBand = cleanText(safeFields.budget || safeFields.budgetBand, 120);
  const urgency = cleanText(safeFields.urgency, 120);
  const dominantIntent = cleanText(input.dominantIntent, 120) || cleanText(safeFields.intent, 120);
  const recommendedOffer =
    cleanText(input.recommendedOffer, 160) || cleanText(safeFields.serviceInterest || safeFields.offer, 160);
  const dominantObjection =
    cleanText(input.dominantObjection, 120) || cleanText(safeFields.objectionType || safeFields.objection, 120);
  const decisionMaker = cleanText(safeFields.decisionMaker || safeFields.decisor || safeFields.owner, 160);
  const digitalMaturity = cleanText(safeFields.digitalMaturity || safeFields.maturity || safeFields.structure, 160);
  const city = cleanText(safeFields.city || safeFields.region, 120);
  const currentChannels = cleanText(safeFields.currentChannels || safeFields.channels, 220);
  const teamSize = cleanText(safeFields.teamSize || safeFields.team || safeFields.staffSize, 80);
  const diagnosis = cleanText(safeFields.diagnosis || safeFields.diagnostico, 360);
  const personalizedPlan = cleanText(safeFields.personalizedPlan || safeFields.planoPersonalizado, 520);
  const sellerNextMove = cleanText(safeFields.sellerNextMove || safeFields.vendedorProximoPasso, 260);
  const materialToSend = cleanText(safeFields.materialToSend || safeFields.material || safeFields.exampleUrl, 260);
  const proposalOutline = cleanText(safeFields.proposalOutline || safeFields.propostaResumo, 520);
  const summary = cleanText(input.summary, 260);
  const preferredNameRaw = cleanText(input.preferredName, 80) || extractPreferredName("", fields);
  const preferredName = looksLikeHumanName(preferredNameRaw) ? preferredNameRaw : "";
  const leadTone = cleanText(input.leadTone, 80) || inferLeadTone("", fields);
  const activeTopic = cleanText(input.activeTopic, 120) || inferActiveTopic("", fields);
  const openQuestion = extractQuestion(input.openQuestion || "");
  const conversationMaturity =
    cleanText(input.conversationMaturity, 80) || inferConversationMaturity(undefined, input.nextAction || null);
  const memorySummary = cleanText(input.memorySummary, 260);

  const normalizedFields = Object.fromEntries(
    Object.entries(safeFields)
      .map(([key, value]) => [cleanText(key, 60), cleanText(value, 180)] as const)
      .filter(([key, value]) => key && value)
  );

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    leadId: input.leadId,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (Object.keys(normalizedFields).length) {
    payload.fields = normalizedFields;
  }

  if (businessType) payload.businessType = businessType;
  if (primaryGoal) payload.primaryGoal = primaryGoal;
  if (budgetBand) payload.budgetBand = budgetBand;
  if (urgency) payload.urgency = urgency;
  if (dominantIntent) payload.dominantIntent = dominantIntent;
  if (dominantObjection) payload.dominantObjection = dominantObjection;
  if (decisionMaker) payload.decisionMaker = decisionMaker;
  if (digitalMaturity) payload.digitalMaturity = digitalMaturity;
  if (city) payload.city = city;
  if (currentChannels) payload.currentChannels = currentChannels;
  if (teamSize) payload.teamSize = teamSize;
  if (recommendedOffer) payload.recommendedOffer = recommendedOffer;
  if (diagnosis) payload.diagnosis = diagnosis;
  if (personalizedPlan) payload.personalizedPlan = personalizedPlan;
  if (sellerNextMove) payload.sellerNextMove = sellerNextMove;
  if (materialToSend) payload.materialToSend = materialToSend;
  if (proposalOutline) payload.proposalOutline = proposalOutline;
  if (summary) payload.summary = summary;
  if (preferredName) payload.preferredName = preferredName;
  if (leadTone) payload.leadTone = leadTone;
  if (activeTopic) payload.activeTopic = activeTopic;
  if (openQuestion) payload.openQuestion = openQuestion;
  if (conversationMaturity) payload.conversationMaturity = conversationMaturity;
  if (memorySummary) payload.memorySummary = memorySummary;

  const nextAction = cleanText(input.nextAction, 160);
  if (nextAction) payload.nextBestAction = nextAction;

  const ref = adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(input.tenantId, input.leadId));
  const occurredAtMs = Number(input.sourceOccurredAtMs) > 0 ? Math.round(Number(input.sourceOccurredAtMs)) : Date.now();
  return adminDb.runTransaction(async (tx) => {
    if (input.conversationFence && (input.conversationFence.tenantId !== input.tenantId || input.conversationFence.leadId !== input.leadId ||
        input.conversationFence.messageId !== input.sourceMessageId || !await matchesConversationCommercialFence(tx, input.conversationFence))) {
      return { applied: false, reason: "commercial_context_changed" as const, appliedKeys: [], ignoredKeys: [] };
    }
    const snap = await tx.get(ref);
    const current = snap.exists ? snap.data() as Record<string, unknown> : {};
    if (snap.exists && (current.tenantId !== input.tenantId || current.leadId !== input.leadId)) {
      return { applied: false, reason: "memory_identity_conflict" as const, appliedKeys: [], ignoredKeys: [] };
    }
    if (input.conversationFence && snap.exists) {
      const parent = input.conversationFence.leadGeneration;
      if (current.leadGeneration ? !(current.leadGeneration instanceof Timestamp) || !current.leadGeneration.isEqual(parent)
        : snap.createTime!.seconds < parent.seconds || snap.createTime!.seconds === parent.seconds && snap.createTime!.nanoseconds < parent.nanoseconds) {
        return { applied: false, reason: "memory_generation_conflict" as const, appliedKeys: [], ignoredKeys: [] };
      }
    }
    if (input.conversationFence) payload.leadGeneration = input.conversationFence.leadGeneration;
    const relationship = mergeRelationshipState({
      current: current.relationshipState,
      tenantId: input.tenantId,
      leadId: input.leadId,
      identityKey: input.identityKey,
      occurredAtMs,
      sourceMessageId: cleanText(input.sourceMessageId, 240),
      inboundText: cleanText(input.inboundText, 1400),
      extractedFields: normalizedFields,
      derivedFacts: {
        preferredName,
        leadTone,
        activeTopic,
        conversationMaturity,
        dominantIntent,
        dominantObjection,
        recommendedOffer,
      },
      openQuestion,
    });
    payload.relationshipState = relationship.state;
    payload.relationshipUpdate = {
      applied: relationship.applied,
      reason: relationship.reason,
      appliedKeys: relationship.appliedKeys,
      ignoredKeys: relationship.ignoredKeys,
      sourceMessageId: cleanText(input.sourceMessageId, 240) || null,
      occurredAtMs,
    };
    if (!snap.exists) payload.createdAt = FieldValue.serverTimestamp();
    const writePayload = relationship.applied
      ? payload
      : {
          tenantId: input.tenantId,
          leadId: input.leadId,
          ...(input.conversationFence ? { leadGeneration: input.conversationFence.leadGeneration } : {}),
          relationshipState: relationship.state,
          relationshipUpdate: payload.relationshipUpdate,
          updatedAt: FieldValue.serverTimestamp(),
        };
    tx.set(ref, writePayload, { merge: true });
    return relationship;
  });
}

export async function getConversationRuntimeState(tenantId: string, chatId: string, conversationFence?: ConversationCommercialFence): Promise<AltumConversationRuntimeState | null> {
  return adminDb.runTransaction(async tx => {
  const scope = await runtimeScope(tx, tenantId, chatId, conversationFence);
  if (!scope) return null;
  const snap = await tx.get(adminDb.collection("ai_conversation_state").doc(scope.id));
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
  if (!matchesRuntimeParent(data, scope, tenantId, chatId) || !data.chatGeneration &&
      (snap.createTime!.seconds < scope.chat.createTime!.seconds || snap.createTime!.seconds === scope.chat.createTime!.seconds && snap.createTime!.nanoseconds < scope.chat.createTime!.nanoseconds)) return null;
  return {
    tenantId,
    chatId,
    leadId: cleanText(data.leadId, 160) || null,
    stage: cleanText(data.stage, 60) as AltumConversationStage | null,
    intent: cleanText(data.intent, 120) || null,
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    nextAction: cleanText(data.nextAction, 180) || null,
    recommendedOffer: cleanText(data.recommendedOffer, 180) || null,
    responseGoal: cleanText(data.responseGoal, 80) || null,
    objectionType: cleanText(data.objectionType, 80) || null,
    turnGoal: cleanText(data.turnGoal, 140) || null,
    memorySummary: cleanText(data.memorySummary, 260) || null,
    summary: cleanText(data.summary, 260) || null,
    lastDecision: cleanText(data.lastDecision, 80) || null,
    lastReason: cleanText(data.lastReason, 180) || null,
    lastInboundText: cleanText(data.lastInboundText, 800) || null,
    lastOutboundText: cleanText(data.lastOutboundText, 800) || null,
    pendingQuestion: cleanText(data.pendingQuestion, 220) || null,
    lastLeadQuestion: cleanText(data.lastLeadQuestion, 220) || null,
    preferredName: cleanText(data.preferredName, 80) || null,
    leadTone: cleanText(data.leadTone, 80) || null,
    activeTopic: cleanText(data.activeTopic, 120) || null,
    conversationMaturity: cleanText(data.conversationMaturity, 80) || null,
    activeSpecialist: cleanText(data.activeSpecialist, 40) || null,
    specialistSupervisorVersion: cleanText(data.specialistSupervisorVersion, 80) || null,
    specialistTransferReason: cleanText(data.specialistTransferReason, 120) || null,
    specialistDecisionKey: cleanText(data.specialistDecisionKey, 96) || null,
  };
  }, { readOnly: true });
}

export async function getLeadMemory(tenantId: string, leadId: string, identityKey?: string | null): Promise<AltumLeadMemory | null> {
  const [snap, leadSnap] = await Promise.all([
    adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId, leadId)).get(),
    adminDb.collection("leads").doc(leadId).get(),
  ]);
  if (!snap.exists && !leadSnap.exists) return null;
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  if (leadSnap.exists && leadSnap.data()?.tenantId !== tenantId) return null;
  if (snap.exists && (data.tenantId !== tenantId || data.leadId !== leadId)) return null;
  if (data.leadGeneration && (!(data.leadGeneration instanceof Timestamp) || !leadSnap.createTime?.isEqual(data.leadGeneration))) return null;
  if (snap.exists && !data.leadGeneration && leadSnap.createTime &&
      (snap.createTime!.seconds < leadSnap.createTime.seconds || snap.createTime!.seconds === leadSnap.createTime.seconds && snap.createTime!.nanoseconds < leadSnap.createTime.nanoseconds)) return null;
  const relationshipState = snap.exists
    ? normalizeRelationshipState(data.relationshipState, { tenantId, leadId })
    : null;
  if (
    identityKey &&
    relationshipState?.identityKeys.length &&
    !relationshipState.identityKeys.includes(identityKey)
  ) {
    return null;
  }
  const leadData = leadSnap.exists ? (leadSnap.data() as Record<string, unknown>) : {};
  const attribution = extractLeadAttributionSummary(leadData);
  const outboundContext =
    leadData.lastOutboundCampaignContext &&
    typeof leadData.lastOutboundCampaignContext === "object" &&
    !Array.isArray(leadData.lastOutboundCampaignContext)
      ? (leadData.lastOutboundCampaignContext as Record<string, unknown>)
      : {};
  const followupContext =
    outboundContext.aiFollowup && typeof outboundContext.aiFollowup === "object" && !Array.isArray(outboundContext.aiFollowup)
      ? (outboundContext.aiFollowup as Record<string, unknown>)
      : {};
  const responseTriggers = Array.isArray(followupContext.responseTriggers)
    ? followupContext.responseTriggers
        .map((item) => cleanText(item, 80))
        .filter(Boolean)
        .slice(0, 12)
    : [];
  const outboundMessage =
    cleanText(outboundContext.persistedText, 900) || cleanText(outboundContext.intendedText, 900);
  const inferredCampaignOfferName = inferOutboundOfferName({
    followupContext,
    outboundContext,
    leadData,
    outboundMessage,
  });
  const inferredCampaignOfferSummary =
    cleanPublicCampaignText(followupContext.offerSummary, 500) ||
    cleanPublicCampaignText(extractOutboundLine(outboundMessage, "Mensagem", 500), 500) ||
    cleanPublicCampaignText(outboundContext.offerSummary, 500);
  const fields =
    data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)
      ? Object.fromEntries(
          Object.entries(data.fields as Record<string, unknown>)
            .map(([key, value]) => [cleanText(key, 60), cleanText(value, 180)] as const)
            .filter(([key, value]) => key && value)
        )
      : undefined;

  const factValue = (key: string, legacy: unknown) => {
    if (Object.hasOwn(commercialFieldDefinitions, key)) {
      const current = currentCommercialField(leadData, key as CommercialField);
      if (current.authoritative) return current.value;
    }
    const fact = relationshipState?.facts[key];
    if (fact) return fact.status === "confirmed" ? cleanText(fact.value, 320) : "";
    return Object.hasOwn(commercialFieldDefinitions, key)
      ? currentCommercialField(leadData, key as CommercialField, [legacy]).value : cleanText(legacy, 320);
  };
  // The relationship history remains stored, but a contradictory old fact must
  // not be reintroduced into the agent prompt alongside the corrected CRM field.
  const currentRelationship = relationshipState ? { ...relationshipState, facts: { ...relationshipState.facts } } : null;
  for (const key of Object.keys(commercialFieldDefinitions) as CommercialField[]) {
    const current = currentCommercialField(leadData, key);
    if (!current.authoritative) continue;
    if (currentRelationship?.facts[key] && currentRelationship.facts[key].value !== current.value) delete currentRelationship.facts[key];
    if (fields) for (const alias of [key, commercialFieldDefinitions[key].custom, ...(key === "budgetBand" ? ["budget"] : [])]) {
      if (Object.hasOwn(fields, alias)) { if (current.value) fields[alias] = current.value; else delete fields[alias]; }
    }
  }
  const analysisNeedsRefresh = leadData.aiCommercialAnalysisNeedsRefresh === true;
  return {
    tenantId,
    leadId,
    attributionSource: attribution.source || null,
    attributionMedium: attribution.medium || null,
    attributionCampaign: attribution.campaign || null,
    attributionCampaignId: attribution.lastTouch.campaignId || attribution.firstTouch.campaignId || null,
    attributionChannel: attribution.channel || null,
    attributionSourceLabel: attribution.sourceLabel || null,
    lastOutboundCampaignId:
      cleanText(outboundContext.campaignId, 160) || cleanText(leadData.lastOutboundCampaignId, 160) || null,
    lastOutboundCampaignName:
      cleanText(outboundContext.campaignName, 180) || cleanText(leadData.lastOutboundCampaignName, 180) || null,
    lastOutboundTemplateName: cleanText(outboundContext.templateName, 160) || null,
    lastOutboundMessage: cleanPublicCampaignText(outboundMessage, 500) || null,
    lastOutboundChannel: cleanText(outboundContext.channel, 80) || null,
    campaignOfferName: inferredCampaignOfferName || null,
    campaignOfferSummary: inferredCampaignOfferSummary ? cleanPublicCampaignText(inferredCampaignOfferSummary, 500) : null,
    campaignExampleUrl: cleanPublicCampaignText(followupContext.exampleUrl, 1000) || null,
    campaignExampleLabel: cleanPublicCampaignText(followupContext.exampleLabel, 120) || null,
    campaignResponseTriggers: responseTriggers.length ? responseTriggers : null,
    campaignNextStep: cleanPublicCampaignText(followupContext.nextStep, 260) || null,
    campaignHandoffRule: cleanText(followupContext.handoffRule, 360) || null,
    campaignFollowupNotes: cleanText(followupContext.notes, 700) || null,
    businessType: factValue("businessType", data.businessType) || null,
    primaryGoal: factValue("primaryGoal", data.primaryGoal) || null,
    budgetBand: factValue("budgetBand", data.budgetBand) || null,
    urgency: factValue("urgency", data.urgency) || null,
    dominantIntent: factValue("dominantIntent", data.dominantIntent) || null,
    dominantObjection: factValue("dominantObjection", data.dominantObjection) || null,
    decisionMaker: factValue("decisionMaker", data.decisionMaker) || null,
    digitalMaturity: factValue("digitalMaturity", data.digitalMaturity) || null,
    city: factValue("city", data.city) || null,
    currentChannels: factValue("currentChannels", data.currentChannels) || null,
    teamSize: factValue("teamSize", data.teamSize) || null,
    recommendedOffer: factValue("recommendedOffer", data.recommendedOffer) || cleanText(followupContext.offerName, 180) || null,
    nextBestAction: analysisNeedsRefresh ? null : cleanText(data.nextBestAction, 180) || null,
    diagnosis: analysisNeedsRefresh ? null : cleanText(data.diagnosis, 360) || cleanText(leadData.aiDiagnosis, 360) || null,
    personalizedPlan: analysisNeedsRefresh ? null : cleanText(data.personalizedPlan, 520) || cleanText(leadData.aiPersonalizedPlan, 520) || null,
    sellerNextMove: analysisNeedsRefresh ? null : cleanText(data.sellerNextMove, 260) || cleanText(leadData.aiSellerNextMove, 260) || null,
    materialToSend: analysisNeedsRefresh ? null : cleanText(data.materialToSend, 260) || cleanText(leadData.aiMaterialToSend, 260) || null,
    proposalOutline: analysisNeedsRefresh ? null : cleanText(data.proposalOutline, 520) || cleanText(leadData.aiProposalOutline, 520) || null,
    memorySummary: analysisNeedsRefresh ? null : cleanText(data.memorySummary, 260) || null,
    summary: analysisNeedsRefresh ? null : cleanText(data.summary, 260) || null,
    preferredName: factValue("preferredName", data.preferredName) || null,
    leadTone: factValue("leadTone", data.leadTone) || null,
    activeTopic: factValue("activeTopic", data.activeTopic) || null,
    openQuestion: cleanText(data.openQuestion, 220) || null,
    conversationMaturity: factValue("conversationMaturity", data.conversationMaturity) || null,
    fields,
    relationshipState: currentRelationship,
  };
}

