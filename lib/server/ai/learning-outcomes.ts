import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { recordAiLearningSignal, refreshTenantLearningRecommendations } from "@/lib/server/ai/learning-signals";
import type { AiLearningDirection, AiLearningSignalType, AiLearningTargetKind } from "@/lib/server/ai/learning-policy";

function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function metricKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function hash(...parts: unknown[]) {
  return createHash("sha256").update(parts.map((part) => String(part || "")).join("\u0000")).digest("hex").slice(0, 40);
}

function dayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === "object" && "_seconds" in value && typeof (value as { _seconds?: number })._seconds === "number") {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

async function findRecentLearningEvents(tenantId: string, leadId: string) {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const snap = await adminDb.collection("ai_learning_events").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(50).get();
  return snap.docs
    .filter((doc) => toMillis(doc.data().createdAt) >= since)
    .sort((a, b) => toMillis(b.data().createdAt) - toMillis(a.data().createdAt))
    .slice(0, 5);
}

function outcomeSemantics(type: string, value: string): { signalType: AiLearningSignalType; direction: AiLearningDirection; closingMotion: "meeting" | "proposal" | null } {
  const normalized = metricKey(value);
  if (type === "proposal") {
    if (["approved", "accepted", "aprovado", "aceito", "sent", "enviado"].includes(normalized)) return { signalType: "proposal_outcome", direction: "positive", closingMotion: "proposal" };
    if (["rejected", "lost", "canceled", "cancelled", "recusado", "perdido", "cancelado"].includes(normalized)) return { signalType: "proposal_outcome", direction: "negative", closingMotion: "proposal" };
    return { signalType: "proposal_outcome", direction: "neutral", closingMotion: "proposal" };
  }
  if (type === "appointment") {
    if (["scheduled", "confirmed", "completed", "agendado", "confirmado", "concluido"].includes(normalized)) return { signalType: "appointment_outcome", direction: "positive", closingMotion: "meeting" };
    if (["canceled", "cancelled", "no_show", "cancelado", "faltou"].includes(normalized)) return { signalType: "appointment_outcome", direction: "negative", closingMotion: "meeting" };
    return { signalType: "appointment_outcome", direction: "neutral", closingMotion: "meeting" };
  }
  if (["ganho", "won", "fechamento", "closed_won"].includes(normalized)) return { signalType: "conversion", direction: "positive", closingMotion: null };
  if (["perdido", "lost", "closed_lost"].includes(normalized)) return { signalType: "loss", direction: "negative", closingMotion: null };
  return { signalType: "pipeline_outcome", direction: "neutral", closingMotion: null };
}

async function createOutcomeEvent(input: { tenantId: string; leadId: string; type: string; value: string; referenceId?: string | null; metadata?: Record<string, unknown> }) {
  const tenantId = cleanText(input.tenantId, 140);
  const leadId = cleanText(input.leadId, 160);
  const type = metricKey(cleanText(input.type, 60));
  const value = metricKey(cleanText(input.value, 120));
  const referenceId = cleanText(input.referenceId, 180);
  if (!tenantId || !leadId || !type || !value) return;

  const recentEvents = await findRecentLearningEvents(tenantId, leadId);
  const outcomeId = hash(tenantId, leadId, type, value, referenceId, JSON.stringify(input.metadata || {}));
  const outcomeRef = adminDb.collection("ai_learning_outcomes").doc(outcomeId);
  const dailyRef = adminDb.collection("ai_tenant_learning_daily").doc(`${tenantId}_${dayKey()}`);
  const semantics = outcomeSemantics(type, value);
  type SignalTarget = { suffix: string; targetKind: AiLearningTargetKind; targetId: string };
  const targets: SignalTarget[] = [];
  if (semantics.direction !== "neutral") {
    if (semantics.closingMotion) targets.push({ suffix: `closing:${semantics.closingMotion}`, targetKind: "closing_motion", targetId: semantics.closingMotion });
    for (const eventDoc of recentEvents) {
      const event = eventDoc.data();
      for (const [suffix, field, targetKind] of [["offer", "recommendedOffer", "offer"], ["next-action", "nextAction", "next_action"], ["objection", "objectionType", "objection"]] as const) {
        const targetId = cleanText(event[field], targetKind === "next_action" ? 120 : targetKind === "objection" ? 80 : 160);
        if (targetId) targets.push({ suffix: `event:${eventDoc.id}:${suffix}`, targetKind, targetId });
      }
    }
  }
  // The existing outcome is the recovery record: freeze its original evidence,
  // never infer a missing legacy plan from newer AI observations.
  const plan = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(outcomeRef);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.tenantId !== tenantId || row.leadId !== leadId || row.type !== type || row.value !== value || row.referenceId !== (referenceId || null) || row.signalPlanVersion !== 1 || row.signalStatus === "done") return null;
      if (!Array.isArray(row.signalTargets) || row.signalTargets.length > 16 || row.signalTargets.some((target: SignalTarget) => !target || typeof target.suffix !== "string" || typeof target.targetId !== "string" || !["closing_motion", "offer", "next_action", "objection"].includes(target.targetKind))) throw new Error("AI_OUTCOME_SIGNAL_PLAN_INVALID");
      return row.signalTargets as SignalTarget[];
    }
    transaction.create(outcomeRef, { tenantId, leadId, type, value, referenceId: referenceId || null, metadata: input.metadata || {}, attributedAiEventIds: recentEvents.map((event) => event.id),
      signalPlanVersion: 1, signalTargets: targets, signalStatus: targets.length ? "pending" : "done", createdAt: FieldValue.serverTimestamp() });
    transaction.set(dailyRef, { tenantId, day: dayKey(), updatedAt: FieldValue.serverTimestamp(), [`outcomes.${type}.${value}`]: FieldValue.increment(1) }, { merge: true });
    for (const eventDoc of recentEvents) transaction.set(eventDoc.ref, { latestOutcomeType: type, latestOutcomeValue: value, latestOutcomeAt: FieldValue.serverTimestamp() }, { merge: true });
    return targets;
  });
  if (!plan?.length) return;
  const common = { tenantId, relationshipId: leadId, type: semantics.signalType, source: "business_outcome" as const, direction: semantics.direction, referenceType: type, referenceId: referenceId || outcomeId };
  for (const target of plan) await recordAiLearningSignal({ ...common, dedupeKey: `outcome:${outcomeId}:${target.suffix}`, targetKind: target.targetKind, targetId: target.targetId });
  await refreshTenantLearningRecommendations(tenantId);
  await adminDb.runTransaction(async transaction => {
    const row = (await transaction.get(outcomeRef)).data();
    const signature = (items: SignalTarget[]) => JSON.stringify(items.map(target => [target.suffix, target.targetKind, target.targetId]));
    if (!row || row.tenantId !== tenantId || row.signalPlanVersion !== 1 || !Array.isArray(row.signalTargets) || signature(row.signalTargets) !== signature(plan)) throw new Error("AI_OUTCOME_SIGNAL_PLAN_CHANGED");
    transaction.update(outcomeRef, { signalStatus: "done", signalsCompletedAt: FieldValue.serverTimestamp() });
  });
}

export async function trackLeadStageOutcome(input: { tenantId: string; leadId: string; previousStage?: string | null; nextStage: string }) {
  await createOutcomeEvent({ tenantId: input.tenantId, leadId: input.leadId, type: "pipeline_stage", value: input.nextStage, metadata: { previousStage: cleanText(input.previousStage, 80) || null, nextStage: cleanText(input.nextStage, 80) } });
}

export async function trackProposalOutcome(input: { tenantId: string; leadId: string; budgetId: string; status: string }) {
  await createOutcomeEvent({ tenantId: input.tenantId, leadId: input.leadId, type: "proposal", value: input.status, referenceId: input.budgetId, metadata: { status: cleanText(input.status, 60) } });
}

export async function trackAppointmentOutcome(input: { tenantId: string; leadId: string; appointmentId: string; status: string }) {
  await createOutcomeEvent({ tenantId: input.tenantId, leadId: input.leadId, type: "appointment", value: input.status, referenceId: input.appointmentId, metadata: { status: cleanText(input.status, 60) } });
}

/** Draft creation is a neutral internal operation, never positive sales feedback.
 * The caller validates its conversation source and commits this plan with draft. */
export async function prepareNeutralDraftOutcome(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; leadId: string; referenceId: string; type: "proposal" | "appointment";
  sourceMessageId: string; sourceLeadGeneration: FirebaseFirestore.Timestamp;
}) {
  const status = input.type === "proposal" ? "Rascunho" : "draft", value = metricKey(status), metadata = {status};
  const id = hash(input.tenantId, input.leadId, input.type, value, input.referenceId, JSON.stringify(metadata));
  const day = dayKey();
  const ref = adminDb.collection("ai_learning_outcomes").doc(id), dailyRef = adminDb.collection("ai_tenant_learning_daily").doc(`${input.tenantId}_${day}`);
  const saved = await tx.get(ref), daily = await tx.get(dailyRef);
  if (saved.exists) {
    const row = saved.data()!;
    if (row.tenantId !== input.tenantId || row.leadId !== input.leadId || row.referenceId !== input.referenceId || row.type !== input.type || row.value !== value) throw new Error("CRM_DRAFT_OUTCOME_IDENTITY_CONFLICT");
    return () => {};
  }
  if (daily.exists && daily.data()?.tenantId !== input.tenantId) throw new Error("CRM_DRAFT_DAILY_IDENTITY_CONFLICT");
  return () => {
    tx.create(ref, {tenantId: input.tenantId, leadId: input.leadId, type: input.type, value, referenceId: input.referenceId, metadata,
      sourceMessageId: input.sourceMessageId, sourceLeadGeneration: input.sourceLeadGeneration,
      attributedAiEventIds: [], signalPlanVersion: 1, signalTargets: [], signalStatus: "done", createdAt: FieldValue.serverTimestamp()});
    tx.set(dailyRef, {tenantId: input.tenantId, day, [`outcomes.${input.type}.${value}`]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp()}, {merge: true});
  };
}
