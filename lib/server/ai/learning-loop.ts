import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function metricKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type LearningInput = {
  tenantId: string;
  chatId: string;
  leadId?: string | null;
  aiLogId: string;
  decision: string;
  intent?: string | null;
  responseGoal?: string | null;
  stateAfter?: string | null;
  recommendedOffer?: string | null;
  objectionType?: string | null;
  nextAction?: string | null;
  confidence?: number | null;
  commercialTemperature?: string | null;
  qualityScore?: number | null;
};

export async function trackAltumAgentLearning(input: LearningInput) {
  const tenantId = cleanText(input.tenantId, 140);
  const aiLogId = cleanText(input.aiLogId, 220);
  const chatId = cleanText(input.chatId, 160);
  if (!tenantId || !aiLogId || !chatId) return;

  const normalized = {
    decision: cleanText(input.decision, 80).toLowerCase() || "unknown",
    intent: cleanText(input.intent, 80).toLowerCase(),
    responseGoal: cleanText(input.responseGoal, 80).toLowerCase(),
    stateAfter: cleanText(input.stateAfter, 80).toLowerCase(),
    recommendedOffer: cleanText(input.recommendedOffer, 160),
    objectionType: cleanText(input.objectionType, 80).toLowerCase(),
    nextAction: cleanText(input.nextAction, 120).toLowerCase(),
    commercialTemperature: cleanText(input.commercialTemperature, 40).toLowerCase(),
  };

  const eventRef = adminDb.collection("ai_learning_events").doc(aiLogId);
  const dailyRef = adminDb.collection("ai_tenant_learning_daily").doc(`${tenantId}_${dayKey()}`);

  const aggregatePatch: Record<string, unknown> = {
    tenantId,
    day: dayKey(),
    updatedAt: FieldValue.serverTimestamp(),
    totalRuns: FieldValue.increment(1),
  };

  if (typeof input.confidence === "number") {
    aggregatePatch.confidenceSum = FieldValue.increment(Number(input.confidence.toFixed(4)));
    if (input.confidence < 0.55) {
      aggregatePatch.lowConfidenceRuns = FieldValue.increment(1);
    }
  }

  if (typeof input.qualityScore === "number") {
    aggregatePatch.qualityScoreSum = FieldValue.increment(Number(input.qualityScore.toFixed(4)));
    if (input.qualityScore < 0.6) {
      aggregatePatch.lowQualityRuns = FieldValue.increment(1);
    }
  }

  const counterKeys: Array<[string, string]> = [
    ["decision", normalized.decision],
    ["intent", normalized.intent],
    ["responseGoal", normalized.responseGoal],
    ["stateAfter", normalized.stateAfter],
    ["recommendedOffer", normalized.recommendedOffer],
    ["objectionType", normalized.objectionType],
    ["nextAction", normalized.nextAction],
    ["commercialTemperature", normalized.commercialTemperature],
  ];

  for (const [group, value] of counterKeys) {
    if (!value) continue;
    const key = metricKey(value);
    if (!key) continue;
    aggregatePatch[`counters.${group}.${key}`] = FieldValue.increment(1);
  }

  await Promise.all([
    eventRef.set(
      {
        tenantId,
        chatId,
        leadId: cleanText(input.leadId, 160) || null,
        aiLogId,
        decision: normalized.decision,
        intent: normalized.intent || null,
        responseGoal: normalized.responseGoal || null,
        stateAfter: normalized.stateAfter || null,
        recommendedOffer: normalized.recommendedOffer || null,
        objectionType: normalized.objectionType || null,
        nextAction: normalized.nextAction || null,
        commercialTemperature: normalized.commercialTemperature || null,
        confidence: typeof input.confidence === "number" ? input.confidence : null,
        qualityScore: typeof input.qualityScore === "number" ? input.qualityScore : null,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    dailyRef.set(aggregatePatch, { merge: true }),
  ]);
}
