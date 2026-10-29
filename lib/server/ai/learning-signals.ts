import { createHash } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  AI_LEARNING_POLICY_VERSION,
  classifyLearningSignal,
  compileTenantLearningRecommendations,
  learningRelationshipKey,
  type AiLearningDirection,
  type AiLearningSignalEvidence,
  type AiLearningSignalType,
  type AiLearningSource,
  type AiLearningTargetKind,
} from "@/lib/server/ai/learning-policy";

const SIGNAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function hash(...parts: unknown[]) {
  return createHash("sha256").update(parts.map((part) => String(part || "")).join("\u0000")).digest("hex").slice(0, 40);
}

function dayKey(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

function toMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
  if (typeof value === "number") return value;
  return 0;
}

export async function recordAiLearningSignal(input: {
  tenantId: string;
  dedupeKey: string;
  relationshipId?: string | null;
  type: AiLearningSignalType;
  source: AiLearningSource;
  direction: AiLearningDirection;
  targetKind: AiLearningTargetKind;
  targetId: string;
  rawCandidate?: string | null;
  selfGenerated?: boolean;
  occurredAtMs?: number;
  referenceType?: string | null;
  referenceId?: string | null;
}) {
  const tenantId = clean(input.tenantId, 140);
  const dedupeKey = clean(input.dedupeKey, 300);
  if (!tenantId || !dedupeKey) return { status: "rejected" as const, reason: "missing_scope" };
  const classification = classifyLearningSignal(input);
  const occurredAtMs = input.occurredAtMs || Date.now();
  const signalId = hash(tenantId, dedupeKey);
  const signalRef = adminDb.collection("ai_learning_signals").doc(signalId);
  const dailyRef = adminDb.collection("ai_tenant_learning_signal_daily").doc(`${tenantId}_${dayKey(occurredAtMs)}`);
  const globalRef = adminDb.collection("ai_global_learning_daily").doc(dayKey(occurredAtMs));
  const relationshipKey = learningRelationshipKey(tenantId, input.relationshipId);

  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(signalRef);
    if (existing.exists) return { status: "duplicate" as const, signalId, classification };
    transaction.create(signalRef, {
      schemaVersion: AI_LEARNING_POLICY_VERSION,
      tenantId,
      type: input.type,
      source: input.source,
      direction: input.direction,
      targetKind: input.targetKind,
      targetId: classification.targetId,
      weight: classification.weight,
      accepted: classification.accepted,
      rejectedReason: classification.rejectedReason,
      relationshipKey: relationshipKey || null,
      referenceType: clean(input.referenceType, 60) || null,
      referenceKey: input.referenceId ? hash(tenantId, input.referenceId) : null,
      observedAt: Timestamp.fromMillis(occurredAtMs),
      expiresAt: Timestamp.fromMillis(occurredAtMs + SIGNAL_TTL_MS),
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.set(dailyRef, {
      tenantId,
      day: dayKey(occurredAtMs),
      totalSignals: FieldValue.increment(1),
      acceptedSignals: FieldValue.increment(classification.accepted ? 1 : 0),
      rejectedSignals: FieldValue.increment(classification.accepted ? 0 : 1),
      [`byType.${input.type}`]: FieldValue.increment(1),
      [`rejections.${classification.rejectedReason || "none"}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (classification.globalEligible) {
      transaction.set(globalRef, {
        day: dayKey(occurredAtMs),
        schemaVersion: AI_LEARNING_POLICY_VERSION,
        [`signals.${input.targetKind}.${classification.targetId}.count`]: FieldValue.increment(1),
        [`signals.${input.targetKind}.${classification.targetId}.weight`]: FieldValue.increment(classification.weight),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    return { status: classification.accepted ? "accepted" as const : "rejected" as const, signalId, classification };
  });
}

export async function refreshTenantLearningRecommendations(tenantIdInput: string) {
  const tenantId = clean(tenantIdInput, 140);
  if (!tenantId) return [];
  const snapshot = await adminDb.collection("ai_learning_signals").where("tenantId", "==", tenantId).limit(500).get();
  const signals: AiLearningSignalEvidence[] = snapshot.docs.map((doc) => {
    const data = doc.data() as Record<string, unknown>;
    return {
      signalId: doc.id,
      targetKind: data.targetKind as AiLearningTargetKind,
      targetId: clean(data.targetId, 64),
      direction: data.direction as AiLearningDirection,
      weight: typeof data.weight === "number" ? data.weight : 0,
      source: data.source as AiLearningSource,
      relationshipKey: clean(data.relationshipKey, 64),
      observedAtMs: toMillis(data.observedAt),
      expiresAtMs: toMillis(data.expiresAt),
      accepted: data.accepted === true,
    };
  });
  const recommendations = compileTenantLearningRecommendations(signals);
  const existingSnapshot = await adminDb.collection("ai_tenant_learning_recommendations").where("tenantId", "==", tenantId).limit(100).get();
  const activeIds = new Set<string>();
  await Promise.all(recommendations.map(async (recommendation) => {
    const id = hash(tenantId, recommendation.targetKind, recommendation.targetId);
    activeIds.add(id);
    const ref = adminDb.collection("ai_tenant_learning_recommendations").doc(id);
    const existing = await ref.get();
    const existingData = existing.data() || {};
    const evidenceUnchanged = existingData.fingerprint === recommendation.fingerprint;
    const preservedStatus = evidenceUnchanged && existingData.status === "approved" ? "approved" : "shadow";
    await ref.set({
      tenantId,
      ...recommendation,
      status: preservedStatus,
      expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists ? existingData.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    }, { merge: true });
  }));
  await Promise.all(existingSnapshot.docs
    .filter((doc) => !activeIds.has(doc.id) && ["shadow", "approved"].includes(clean(doc.data().status, 40)))
    .map((doc) => doc.ref.set({
      status: "archived",
      rollbackReason: "Evidencia expirou, ficou insuficiente ou passou a apresentar conflito.",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })));
  return recommendations;
}
