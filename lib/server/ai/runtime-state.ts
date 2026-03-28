import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export type AltumConversationStage =
  | "greeting"
  | "discovery"
  | "qualification"
  | "recommendation"
  | "objection_handling"
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
  recommendedOffer?: string | null;
  nextBestAction?: string | null;
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
  extractedFields?: Record<string, string> | null;
}) {
  const docId = getConversationRuntimeDocId(input.tenantId, input.chatId);
  const ref = adminDb.collection("ai_conversation_state").doc(docId);
  const snap = await ref.get();
  const previous = snap.exists ? (snap.data() as { stage?: AltumConversationStage }) : null;

  const stage = inferConversationStage({
    inboundText: input.inboundText,
    decision: input.decision,
    nextAction: input.nextAction,
    extractedFields: input.extractedFields || null,
    previousStage: previous?.stage || null,
  });

  const intent =
    cleanText(input.extractedFields?.intent, 80) ||
    (stage === "greeting" ? "greeting" : stage === "objection_handling" ? "price_or_objection" : "");
  const recommendedOffer = cleanText(input.extractedFields?.serviceInterest, 140) || "";

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    chatId: input.chatId,
    leadId: input.leadId || null,
    stage,
    intent: intent || null,
    confidence: typeof input.confidence === "number" ? input.confidence : null,
    nextAction: cleanText(input.nextAction, 160) || null,
    recommendedOffer: recommendedOffer || null,
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
}) {
  const fields = input.extractedFields || null;
  if (!fields) return;

  const businessType = cleanText(fields.businessType || fields.niche || fields.segment, 120);
  const primaryGoal = cleanText(fields.primaryGoal || fields.goal || fields.objective, 180);
  const budgetBand = cleanText(fields.budget || fields.budgetBand, 120);
  const urgency = cleanText(fields.urgency, 120);
  const dominantIntent = cleanText(fields.intent, 120);
  const recommendedOffer = cleanText(fields.serviceInterest || fields.offer, 160);

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
  if (recommendedOffer) payload.recommendedOffer = recommendedOffer;

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
    recommendedOffer: cleanText(data.recommendedOffer, 180) || null,
    nextBestAction: cleanText(data.nextBestAction, 180) || null,
    fields,
  };
}

