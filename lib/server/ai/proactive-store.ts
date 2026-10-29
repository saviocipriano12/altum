import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  AI_PROACTIVE_INTELLIGENCE_VERSION,
  resolveAiProactiveTransition,
  type AiProactiveLifecycleStatus,
  type AiProactiveRecommendation,
} from "@/lib/ai-proactive-intelligence";

export async function persistAiProactiveRecommendation(input: AiProactiveRecommendation, createdBy: string) {
  if (!input.tenantId || !input.leadId || input.schemaVersion !== AI_PROACTIVE_INTELLIGENCE_VERSION || !input.fingerprint) throw new Error("invalid_proactive_recommendation");
  const ref = adminDb.collection("ai_proactive_recommendations").doc(input.fingerprint);
  return adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) {
      const data = current.data();
      if (data?.tenantId !== input.tenantId || data?.leadId !== input.leadId) throw new Error("proactive_scope_conflict");
      return { id: ref.id, status: "duplicate" as const };
    }
    transaction.create(ref, {
      ...input,
      dueAt: Timestamp.fromMillis(input.dueAtMs),
      expiresAt: Timestamp.fromMillis(input.expiresAtMs),
      createdBy: String(createdBy || "").slice(0, 180),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, status: "created" as const };
  });
}

export async function reviewAiProactiveRecommendation(input: {
  tenantId: string;
  recommendationId: string;
  action: "accept" | "dismiss" | "complete";
  outcome?: "positive" | "negative" | "neutral" | null;
  reviewedBy: string;
  reviewedByName?: string | null;
}) {
  const tenantId = String(input.tenantId || "").trim().slice(0, 180);
  const recommendationId = String(input.recommendationId || "").trim().slice(0, 180);
  if (!tenantId || !recommendationId) throw new Error("invalid_proactive_review");
  if (input.action === "complete" && !["positive", "negative", "neutral"].includes(String(input.outcome || ""))) throw new Error("invalid_proactive_outcome");
  const ref = adminDb.collection("ai_proactive_recommendations").doc(recommendationId);
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.tenantId !== tenantId) throw new Error("proactive_review_scope_invalid");
    const currentStatus = String(snapshot.data()?.status || "") as AiProactiveLifecycleStatus;
    const transition = resolveAiProactiveTransition(currentStatus, input.action);
    if (!transition.allowed) throw new Error("invalid_proactive_transition");
    transaction.set(ref, {
      status: transition.nextStatus,
      reviewedBy: String(input.reviewedBy || "").slice(0, 180),
      reviewedByName: String(input.reviewedByName || "").slice(0, 180) || null,
      reviewedAt: FieldValue.serverTimestamp(),
      outcome: input.action === "complete" ? input.outcome : null,
      completedAt: input.action === "complete" ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { id: ref.id, leadId: String(snapshot.data()?.leadId || ""), status: transition.nextStatus, outcome: input.action === "complete" ? input.outcome || null : null };
  });
}
