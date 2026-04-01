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

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

async function findRecentLearningEvents(tenantId: string, leadId: string) {
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const snap = await adminDb
    .collection("ai_learning_events")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(50)
    .get();

  return snap.docs
    .filter((doc) => toMillis(doc.data().createdAt) >= since)
    .slice(0, 20);
}

async function updateDailyOutcomeAggregate(input: {
  tenantId: string;
  outcomeType: string;
  outcomeValue: string;
}) {
  const tenantId = cleanText(input.tenantId, 140);
  const outcomeType = metricKey(input.outcomeType);
  const outcomeValue = metricKey(input.outcomeValue);
  if (!tenantId || !outcomeType || !outcomeValue) return;

  const ref = adminDb.collection("ai_tenant_learning_daily").doc(`${tenantId}_${dayKey()}`);
  await ref.set(
    {
      tenantId,
      day: dayKey(),
      updatedAt: FieldValue.serverTimestamp(),
      [`outcomes.${outcomeType}.${outcomeValue}`]: FieldValue.increment(1),
    },
    { merge: true }
  );
}

async function createOutcomeEvent(input: {
  tenantId: string;
  leadId: string;
  type: string;
  value: string;
  referenceId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const tenantId = cleanText(input.tenantId, 140);
  const leadId = cleanText(input.leadId, 160);
  const type = cleanText(input.type, 60);
  const value = cleanText(input.value, 120);
  if (!tenantId || !leadId || !type || !value) return;

  const recentEvents = await findRecentLearningEvents(tenantId, leadId);
  const batch = adminDb.batch();

  const outcomeRef = adminDb.collection("ai_learning_outcomes").doc();
  batch.set(outcomeRef, {
    tenantId,
    leadId,
    type,
    value,
    referenceId: cleanText(input.referenceId, 180) || null,
    metadata: input.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });

  for (const eventDoc of recentEvents) {
    batch.set(
      eventDoc.ref,
      {
        latestOutcomeType: type,
        latestOutcomeValue: value,
        latestOutcomeAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await batch.commit();
  await updateDailyOutcomeAggregate({
    tenantId,
    outcomeType: type,
    outcomeValue: value,
  });
}

export async function trackLeadStageOutcome(input: {
  tenantId: string;
  leadId: string;
  previousStage?: string | null;
  nextStage: string;
}) {
  await createOutcomeEvent({
    tenantId: input.tenantId,
    leadId: input.leadId,
    type: "pipeline_stage",
    value: input.nextStage,
    metadata: {
      previousStage: cleanText(input.previousStage, 80) || null,
      nextStage: cleanText(input.nextStage, 80),
    },
  });
}

export async function trackProposalOutcome(input: {
  tenantId: string;
  leadId: string;
  budgetId: string;
  status: string;
}) {
  await createOutcomeEvent({
    tenantId: input.tenantId,
    leadId: input.leadId,
    type: "proposal",
    value: input.status,
    referenceId: input.budgetId,
    metadata: {
      status: cleanText(input.status, 60),
    },
  });
}

export async function trackAppointmentOutcome(input: {
  tenantId: string;
  leadId: string;
  appointmentId: string;
  status: string;
}) {
  await createOutcomeEvent({
    tenantId: input.tenantId,
    leadId: input.leadId,
    type: "appointment",
    value: input.status,
    referenceId: input.appointmentId,
    metadata: {
      status: cleanText(input.status, 60),
    },
  });
}
