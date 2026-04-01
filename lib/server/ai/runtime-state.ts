import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

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
  summary?: string | null;
  lastDecision?: string | null;
  lastReason?: string | null;
  lastInboundText?: string | null;
  lastOutboundText?: string | null;
};

export type AltumLeadMemory = {
  tenantId: string;
  leadId: string;
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
  summary?: string | null;
  fields?: Record<string, string>;
};

function cleanText(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function hasKeyword(text: string, words: string[]) {
  return words.some((word) => text.includes(word));
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
    summary: cleanText(input.summary, 260) || null,
    lastDecision: input.decision,
    lastReason: cleanText(input.reason, 180) || null,
    lastInboundText: cleanText(input.inboundText, 800) || null,
    lastOutboundText: cleanText(input.outboundText, 800) || null,
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
}) {
  const fields = input.extractedFields || null;
  if (!fields) return;

  const businessType = cleanText(fields.businessType || fields.niche || fields.segment, 120);
  const primaryGoal = cleanText(fields.primaryGoal || fields.goal || fields.objective, 180);
  const budgetBand = cleanText(fields.budget || fields.budgetBand, 120);
  const urgency = cleanText(fields.urgency, 120);
  const dominantIntent = cleanText(input.dominantIntent, 120) || cleanText(fields.intent, 120);
  const recommendedOffer =
    cleanText(input.recommendedOffer, 160) || cleanText(fields.serviceInterest || fields.offer, 160);
  const dominantObjection =
    cleanText(input.dominantObjection, 120) || cleanText(fields.objectionType || fields.objection, 120);
  const decisionMaker = cleanText(fields.decisionMaker || fields.decisor || fields.owner, 160);
  const digitalMaturity = cleanText(fields.digitalMaturity || fields.maturity || fields.structure, 160);
  const city = cleanText(fields.city || fields.region, 120);
  const currentChannels = cleanText(fields.currentChannels || fields.channels, 220);
  const teamSize = cleanText(fields.teamSize || fields.team || fields.staffSize, 80);
  const summary = cleanText(input.summary, 260);

  const normalizedFields = Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [cleanText(key, 60), cleanText(value, 180)] as const)
      .filter(([key, value]) => key && value)
  );

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    leadId: input.leadId,
    fields: normalizedFields,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

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
  if (summary) payload.summary = summary;

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
    summary: cleanText(data.summary, 260) || null,
    lastDecision: cleanText(data.lastDecision, 80) || null,
    lastReason: cleanText(data.lastReason, 180) || null,
    lastInboundText: cleanText(data.lastInboundText, 800) || null,
    lastOutboundText: cleanText(data.lastOutboundText, 800) || null,
  };
}

export async function getLeadMemory(tenantId: string, leadId: string): Promise<AltumLeadMemory | null> {
  const snap = await adminDb.collection("ai_lead_memory").doc(getLeadMemoryDocId(tenantId, leadId)).get();
  if (!snap.exists) return null;
  const data = snap.data() as Record<string, unknown>;
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
    recommendedOffer: cleanText(data.recommendedOffer, 180) || null,
    nextBestAction: cleanText(data.nextBestAction, 180) || null,
    summary: cleanText(data.summary, 260) || null,
    fields,
  };
}

