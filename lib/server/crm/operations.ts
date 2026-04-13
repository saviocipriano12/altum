import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { buildLeadHandoffContext } from "@/lib/server/crm/handoff";
import { buildLeadStagePolicy, comparePipelineStages, loadTenantPipelineConfig } from "@/lib/server/crm/pipeline";
import { evaluateLeadQualification } from "@/lib/server/crm/qualification";
import { buildLeadSchedulingAdapter } from "@/lib/server/crm/scheduling";

type GenericRow = { id: string } & Record<string, unknown>;

function cleanText(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\D/g, "").slice(-14);
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  return 0;
}

async function listRelatedChats(tenantId: string, leadId: string, phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const [byLeadSnap, byPhoneSnap] = await Promise.all([
    adminDb.collection("chats").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(12).get(),
    normalizedPhone
      ? adminDb.collection("chats").where("tenantId", "==", tenantId).where("contactPhone", "==", normalizedPhone).limit(12).get()
      : Promise.resolve(null),
  ]);

  const unique = new Map<string, Record<string, unknown>>();
  for (const doc of byLeadSnap.docs) {
    unique.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
  }
  for (const doc of byPhoneSnap?.docs || []) {
    unique.set(doc.id, { id: doc.id, ...(doc.data() as Record<string, unknown>) });
  }

  return Array.from(unique.values())
    .sort((a, b) => toTime(b.lastMessageTime || b.updatedAt) - toTime(a.lastMessageTime || a.updatedAt))
    .slice(0, 8);
}

async function listRecentAiSignals(tenantId: string, leadId: string) {
  const snap = await adminDb.collection("ai_logs").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(12).get();
  return snap.docs
    .map((doc): GenericRow => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))
    .slice(0, 4);
}

async function listPendingTasks(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("lead_tasks")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .where("status", "==", "pending")
    .limit(24)
    .get();

  return snap.docs.map((doc): GenericRow => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  }));
}

function buildTaskKey(code: string, scope: string) {
  return `${code}:${scope}`;
}

async function ensureLeadTask(input: {
  tenantId: string;
  leadId: string;
  title: string;
  type: string;
  priority: string;
  dueAt?: Date | null;
  actorId?: string | null;
  actorName?: string | null;
  reasonCode: string;
  taskKey: string;
  existingTasks: Array<Record<string, unknown>>;
}) {
  const exists = input.existingTasks.some((task) => {
    const currentTaskKey = cleanText(task.taskKey, 180);
    const currentReasonCode = cleanText(task.reasonCode, 80);
    return currentTaskKey === input.taskKey || currentReasonCode === input.reasonCode;
  });
  if (exists) return null;

  const ref = await adminDb.collection("lead_tasks").add({
    tenantId: input.tenantId,
    leadId: input.leadId,
    title: input.title,
    type: input.type,
    priority: input.priority,
    dueAt: input.dueAt || null,
    status: "pending",
    source: "crm_automation",
    reasonCode: input.reasonCode,
    taskKey: input.taskKey,
    createdBy: input.actorId || "crm_automation",
    createdByName: input.actorName || "CRM Automation",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection("leads").doc(input.leadId).collection("events").add({
    type: "crm_task_created",
    title: "CRM criou tarefa automatica",
    detail: `${input.type}: ${input.title}`,
    reasonCode: input.reasonCode,
    taskId: ref.id,
    actorId: input.actorId || "crm_automation",
    actorName: input.actorName || "CRM Automation",
    createdAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}

export async function analyzeLeadCommercialState(input: {
  tenantId: string;
  leadId: string;
  lead: Record<string, unknown>;
}) {
  const [{ stages }, aiSignals, relatedChats] = await Promise.all([
    loadTenantPipelineConfig(input.tenantId),
    listRecentAiSignals(input.tenantId, input.leadId),
    listRelatedChats(input.tenantId, input.leadId, cleanText(input.lead.telefone, 40)),
  ]);

  const qualification = evaluateLeadQualification({
    lead: input.lead,
    stages,
    aiSignals,
    relatedChats,
  });
  const stagePolicy = buildLeadStagePolicy({
    lead: input.lead,
    stages,
  });
  const schedulingAdapter = await buildLeadSchedulingAdapter({
    tenantId: input.tenantId,
    lead: input.lead,
  });
  const handoff = await buildLeadHandoffContext({
    tenantId: input.tenantId,
    leadId: input.leadId,
    lead: input.lead,
    qualification,
    recommendedOwnerId: stagePolicy.ownerUserId,
    recommendedOwnerName: stagePolicy.ownerName,
  });

  return {
    stages,
    aiSignals,
    relatedChats,
    qualification,
    stagePolicy,
    schedulingAdapter,
    handoff,
  };
}

export async function syncLeadCommercialState(input: {
  tenantId: string;
  leadId: string;
  actorId?: string | null;
  actorName?: string | null;
  allowStageAdvance?: boolean;
  preserveManualScore?: boolean;
}) {
  const leadRef = adminDb.collection("leads").doc(input.leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    return null;
  }

  const lead = leadSnap.data() as Record<string, unknown>;
  if (cleanText(lead.tenantId, 140) !== input.tenantId) {
    return null;
  }

  const analysis = await analyzeLeadCommercialState({
    tenantId: input.tenantId,
    leadId: input.leadId,
    lead,
  });
  const existingTasks = await listPendingTasks(input.tenantId, input.leadId);
  const currentStage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
  const patch: Record<string, unknown> = {
    qualification: analysis.qualification,
    commercialState: {
      stagePolicy: analysis.stagePolicy,
      lastAiSignals: analysis.aiSignals.slice(0, 3).map((item) => ({
        id: item.id,
        decision: cleanText(item.decision, 40) || null,
        nextAction: cleanText(item.nextAction, 120) || null,
        confidence: cleanNumber(item.confidence),
        createdAt: item.createdAt || null,
      })),
      updatedAt: FieldValue.serverTimestamp(),
    },
    handoff: {
      status: analysis.handoff.status,
      reasonCode: analysis.handoff.reasonCode,
      reasonLabel: analysis.handoff.reasonLabel,
      summary: analysis.handoff.summary,
      recommendedOwnerId: analysis.handoff.recommendedOwnerId,
      recommendedOwnerName: analysis.handoff.recommendedOwnerName,
      chatCount: analysis.handoff.chatCount,
      lastGeneratedAt: FieldValue.serverTimestamp(),
    },
    schedulingAdapter: {
      provider: analysis.schedulingAdapter.provider,
      status: analysis.schedulingAdapter.status,
      syncReady: analysis.schedulingAdapter.syncReady,
      calendarId: analysis.schedulingAdapter.calendarId,
      suggestedEvent: analysis.schedulingAdapter.suggestedEvent,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!input.preserveManualScore || cleanText(lead.scoreSource, 20) !== "manual") {
    patch.score = analysis.qualification.score;
    patch.scoreSource = "ai";
  }

  const shouldAdvanceStage =
    input.allowStageAdvance !== false &&
    !analysis.stages.find((item) => item.id === currentStage)?.isTerminal &&
    comparePipelineStages(currentStage, analysis.qualification.recommendedStage, analysis.stages) > 0;

  if (shouldAdvanceStage) {
    patch.pipelineStage = analysis.qualification.recommendedStage;
    patch.stage = analysis.qualification.recommendedStage;
    patch.stageUpdatedAt = FieldValue.serverTimestamp();
  }

  await leadRef.set(patch, { merge: true });

  if (shouldAdvanceStage) {
    await leadRef.collection("events").add({
      type: "crm_stage_auto_advanced",
      title: "CRM avancou stage automaticamente",
      detail: `${currentStage} -> ${analysis.qualification.recommendedStage}`,
      reasonCode: "qualification_stage_upgrade",
      actorId: input.actorId || "crm_automation",
      actorName: input.actorName || "CRM Automation",
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const policyStageId = shouldAdvanceStage ? analysis.qualification.recommendedStage : analysis.stagePolicy.stageId;
  const policyStage = analysis.stages.find((item) => item.id === policyStageId) || analysis.stages[0];
  const followUpHours = analysis.stagePolicy.followUpHours;
  if (policyStage && !policyStage.isTerminal && typeof followUpHours === "number" && followUpHours > 0) {
    await ensureLeadTask({
      tenantId: input.tenantId,
      leadId: input.leadId,
      title: `Follow-up comercial em ${policyStage.label}`,
      type: "follow_up",
      priority: analysis.qualification.score >= 70 ? "high" : "medium",
      dueAt: new Date(Date.now() + followUpHours * 3600_000),
      actorId: input.actorId,
      actorName: input.actorName,
      reasonCode: "follow_up_due",
      taskKey: buildTaskKey("follow_up_due", policyStage.id),
      existingTasks,
    });
  }

  if (analysis.handoff.status === "ready") {
    await ensureLeadTask({
      tenantId: input.tenantId,
      leadId: input.leadId,
      title: `Assumir handoff comercial de ${cleanText(lead.nome, 140) || "lead"}`,
      type: "alerta_humano",
      priority: "high",
      dueAt: new Date(),
      actorId: input.actorId,
      actorName: input.actorName,
      reasonCode: analysis.handoff.reasonCode,
      taskKey: buildTaskKey(analysis.handoff.reasonCode, "handoff"),
      existingTasks,
    });
  }

  if (analysis.qualification.recommendedStage === "proposta") {
    await ensureLeadTask({
      tenantId: input.tenantId,
      leadId: input.leadId,
      title: `Preparar proposta para ${cleanText(lead.nome, 140) || "lead"}`,
      type: "proposta",
      priority: "high",
      dueAt: new Date(Date.now() + 6 * 3600_000),
      actorId: input.actorId,
      actorName: input.actorName,
      reasonCode: "proposal_preparation",
      taskKey: buildTaskKey("proposal_preparation", normalizePipelineStageId(currentStage)),
      existingTasks,
    });
  }

  return analysis;
}
