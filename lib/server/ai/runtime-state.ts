import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { extractLeadAttributionSummary } from "@/lib/server/attribution";

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

function inferOutboundOfferName(input: {
  followupContext: Record<string, unknown>;
  outboundContext: Record<string, unknown>;
  leadData: Record<string, unknown>;
  outboundMessage: string;
}) {
  const explicit =
    cleanText(input.followupContext.offerName, 160) ||
    cleanText(input.outboundContext.offerName, 160) ||
    extractOutboundLine(input.outboundMessage, "Oferta", 160);
  if (explicit) return explicit;

  const campaignName =
    cleanText(input.outboundContext.campaignName, 160) ||
    cleanText(input.leadData.lastOutboundCampaignName, 160);
  if (campaignName && !/^campanha\s*\d*$/i.test(campaignName)) return campaignName;

  const templateName = humanizeOutboundToken(input.outboundContext.templateName);
  if (templateName) return templateName;

  const messageHint = extractOutboundLine(input.outboundMessage, "Mensagem", 160);
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
}) {
  const docId = getConversationRuntimeDocId(input.tenantId, input.chatId);
  const ref = adminDb.collection("ai_conversation_state").doc(docId);
  const snap = await ref.get();
  const previous = snap.exists ? (snap.data() as { stage?: AltumConversationStage }) : null;

  const stage =
    input.stage ||
    inferConversationStage({
      inboundText: input.inboundText,
      decision: input.decision,
      nextAction: input.nextAction,
      extractedFields: input.extractedFields || null,
      previousStage: previous?.stage || null,
    });

  const intent =
    cleanText(input.intent, 80) ||
    cleanText(input.extractedFields?.intent, 80) ||
    (stage === "greeting" ? "greeting" : stage === "objection_handling" ? "price_or_objection" : "");
  const recommendedOffer =
    cleanText(input.recommendedOffer, 140) || cleanText(input.extractedFields?.serviceInterest, 140) || "";

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    chatId: input.chatId,
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
    lastLeadMessageAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (input.outboundText) {
    payload.lastAiReplyAt = FieldValue.serverTimestamp();
  }
  if (!snap.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
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
    createdAt: FieldValue.serverTimestamp(),
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

  await adminDb
    .collection("ai_lead_memory")
    .doc(getLeadMemoryDocId(input.tenantId, input.leadId))
    .set(payload, { merge: true });
}

export async function getConversationRuntimeState(tenantId: string, chatId: string): Promise<AltumConversationRuntimeState | null> {
  const snap = await adminDb.collection("ai_conversation_state").doc(getConversationRuntimeDocId(tenantId, chatId)).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
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
  };
}

export async function getLeadMemory(tenantId: string, leadId: string): Promise<AltumLeadMemory | null> {
  const [snap, leadSnap] = await Promise.all([
    adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId, leadId)).get(),
    adminDb.collection("leads").doc(leadId).get(),
  ]);
  if (!snap.exists && !leadSnap.exists) return null;
  const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
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
    cleanText(followupContext.offerSummary, 500) ||
    extractOutboundLine(outboundMessage, "Mensagem", 500) ||
    extractOutboundLine(outboundMessage, "Proximo passo", 260) ||
    outboundMessage;
  const fields =
    data.fields && typeof data.fields === "object" && !Array.isArray(data.fields)
      ? Object.fromEntries(
          Object.entries(data.fields as Record<string, unknown>)
            .map(([key, value]) => [cleanText(key, 60), cleanText(value, 180)] as const)
            .filter(([key, value]) => key && value)
        )
      : undefined;

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
    lastOutboundMessage: outboundMessage ? cleanText(outboundMessage, 500) : null,
    lastOutboundChannel: cleanText(outboundContext.channel, 80) || null,
    campaignOfferName: inferredCampaignOfferName || null,
    campaignOfferSummary: inferredCampaignOfferSummary ? cleanText(inferredCampaignOfferSummary, 500) : null,
    campaignExampleUrl: cleanText(followupContext.exampleUrl, 1000) || null,
    campaignExampleLabel: cleanText(followupContext.exampleLabel, 120) || null,
    campaignResponseTriggers: responseTriggers.length ? responseTriggers : null,
    campaignNextStep: cleanText(followupContext.nextStep, 260) || null,
    campaignHandoffRule: cleanText(followupContext.handoffRule, 360) || null,
    campaignFollowupNotes: cleanText(followupContext.notes, 700) || null,
    businessType: cleanText(data.businessType, 120) || null,
    primaryGoal: cleanText(data.primaryGoal, 180) || null,
    budgetBand: cleanText(data.budgetBand, 120) || null,
    urgency: cleanText(data.urgency, 120) || null,
    dominantIntent: cleanText(data.dominantIntent, 120) || null,
    dominantObjection: cleanText(data.dominantObjection, 120) || null,
    decisionMaker: cleanText(data.decisionMaker, 160) || null,
    digitalMaturity: cleanText(data.digitalMaturity, 160) || null,
    city: cleanText(data.city, 120) || null,
    currentChannels: cleanText(data.currentChannels, 220) || null,
    teamSize: cleanText(data.teamSize, 80) || null,
    recommendedOffer: cleanText(data.recommendedOffer, 180) || cleanText(followupContext.offerName, 180) || null,
    nextBestAction: cleanText(data.nextBestAction, 180) || null,
    diagnosis: cleanText(data.diagnosis, 360) || cleanText(leadData.aiDiagnosis, 360) || null,
    personalizedPlan: cleanText(data.personalizedPlan, 520) || cleanText(leadData.aiPersonalizedPlan, 520) || null,
    sellerNextMove: cleanText(data.sellerNextMove, 260) || cleanText(leadData.aiSellerNextMove, 260) || null,
    materialToSend: cleanText(data.materialToSend, 260) || cleanText(leadData.aiMaterialToSend, 260) || null,
    proposalOutline: cleanText(data.proposalOutline, 520) || cleanText(leadData.aiProposalOutline, 520) || null,
    memorySummary: cleanText(data.memorySummary, 260) || null,
    summary: cleanText(data.summary, 260) || null,
    preferredName: cleanText(data.preferredName, 80) || null,
    leadTone: cleanText(data.leadTone, 80) || null,
    activeTopic: cleanText(data.activeTopic, 120) || null,
    openQuestion: cleanText(data.openQuestion, 220) || null,
    conversationMaturity: cleanText(data.conversationMaturity, 80) || null,
    fields,
  };
}

