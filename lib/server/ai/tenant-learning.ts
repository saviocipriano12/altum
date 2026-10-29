import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  AI_LEARNING_MIN_RELATIONSHIPS,
  AI_LEARNING_MIN_SAMPLE,
  AI_TENANT_RECOMMENDATION_VERSION,
  type AiLearningTargetKind,
} from "@/lib/server/ai/learning-policy";

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof value === "object" && "_seconds" in value && typeof (value as { _seconds?: number })._seconds === "number") return (value as { _seconds: number })._seconds * 1000;
  return 0;
}

export type AltumTenantLearningHints = {
  hasData: boolean;
  topOffers: string[];
  topActions: string[];
  topObjections: string[];
  preferredClosingMotion: "meeting" | "proposal" | null;
  evidenceFingerprints?: string[];
};

type ApprovedRecommendation = {
  targetKind: AiLearningTargetKind;
  targetId: string;
  confidence: number;
  sampleSize: number;
  fingerprint: string;
};

function emptyHints(): AltumTenantLearningHints {
  return { hasData: false, topOffers: [], topActions: [], topObjections: [], preferredClosingMotion: null, evidenceFingerprints: [] };
}

/**
 * Runtime reads only explicitly approved, current and non-expired recommendations.
 * Raw counters and shadow recommendations can be inspected, but never influence a reply.
 */
export async function getTenantLearningHints(
  tenantId: string,
  options?: { includeShadowFingerprint?: string | null }
): Promise<AltumTenantLearningHints> {
  const normalizedTenantId = cleanText(tenantId, 140);
  if (!normalizedTenantId) return emptyHints();

  const now = Date.now();
  const snap = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", normalizedTenantId).limit(100).get();
  const requestedShadowFingerprint = cleanText(options?.includeShadowFingerprint, 160);
  const approved = snap.docs
    .map((doc) => doc.data() as Record<string, unknown>)
    .filter((item) =>
      (item.status === "approved" || (item.status === "shadow" && requestedShadowFingerprint && item.fingerprint === requestedShadowFingerprint)) &&
      item.schemaVersion === AI_TENANT_RECOMMENDATION_VERSION &&
      Number(item.sampleSize || 0) >= AI_LEARNING_MIN_SAMPLE &&
      Number(item.distinctRelationships || 0) >= AI_LEARNING_MIN_RELATIONSHIPS &&
      Number(item.confidence || 0) >= 0.62 &&
      (typeof item.conflictRatio === "number" ? item.conflictRatio : 1) <= 0.35 &&
      toMillis(item.expiresAt) > now
    )
    .map((item): ApprovedRecommendation => ({
      targetKind: item.targetKind as AiLearningTargetKind,
      targetId: cleanText(item.targetId, 120),
      confidence: Number(item.confidence || 0),
      sampleSize: Number(item.sampleSize || 0),
      fingerprint: cleanText(item.fingerprint, 160),
    }))
    .filter((item) => item.targetId)
    .sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);

  const select = (kind: AiLearningTargetKind, limit: number) => approved.filter((item) => item.targetKind === kind).slice(0, limit).map((item) => item.targetId);
  const closingMotion = select("closing_motion", 1)[0];
  const topOffers = select("offer", 3).map((item) => item.replace(/_/g, " "));
  const topActions = select("next_action", 4);
  const topObjections = select("objection", 3);
  const preferredClosingMotion = closingMotion === "meeting" || closingMotion === "proposal" ? closingMotion : null;
  return {
    hasData: topOffers.length > 0 || topActions.length > 0 || topObjections.length > 0 || preferredClosingMotion !== null,
    topOffers,
    topActions,
    topObjections,
    preferredClosingMotion,
    evidenceFingerprints: approved.map((item) => item.fingerprint).filter(Boolean),
  };
}
