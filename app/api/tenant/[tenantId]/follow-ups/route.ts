import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

type TaskItem = Record<string, unknown> & {
  id: string;
  tenantId?: string;
  leadId?: string;
  title?: string;
  type?: string;
  priority?: string;
  status?: string;
  dueAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type LeadItem = Record<string, unknown> & {
  id: string;
  nome?: string;
  empresa?: string;
  telefone?: string;
  owner?: string;
  ownerId?: string;
  pipelineStage?: string;
  stage?: string;
  heat?: string;
  priority?: string;
};

type LeadSilenceInfo = {
  lastInboundAt: number;
  silenceHours: number;
};

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function toMillis(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

function computeFollowUpPriorityScore(input: {
  dueMillis: number;
  now: number;
  status: string;
  taskPriority: string;
  leadHeat: string;
  leadStage: string;
  stageSlaBreached: boolean;
  silenceHours: number;
}) {
  if (input.status === "done") {
    return { score: 0, reasons: ["done"] };
  }

  let score = 0;
  const reasons: string[] = [];
  const isOverdue = Boolean(input.dueMillis && input.dueMillis < input.now);
  const isDueToday =
    Boolean(input.dueMillis) &&
    new Date(input.dueMillis).toDateString() === new Date(input.now).toDateString();

  if (isOverdue) {
    score += 80;
    reasons.push("overdue");
  } else if (isDueToday) {
    score += 35;
    reasons.push("due_today");
  }

  if (input.stageSlaBreached) {
    score += 30;
    reasons.push("sla_breached");
  }

  if (input.taskPriority === "high") {
    score += 20;
    reasons.push("task_high_priority");
  }

  if (input.leadHeat === "quente") {
    score += 25;
    reasons.push("lead_hot");
  } else if (input.leadHeat === "morno") {
    score += 10;
    reasons.push("lead_warm");
  }

  if (["proposta", "proposta_enviada", "fechamento", "ganho"].includes(input.leadStage)) {
    score += 20;
    reasons.push("late_funnel");
  } else if (input.leadStage === "qualificacao") {
    score += 12;
    reasons.push("qualification");
  }

  if (input.silenceHours >= 72) {
    score += 20;
    reasons.push("lead_silent_72h");
  } else if (input.silenceHours >= 24) {
    score += 10;
    reasons.push("lead_silent_24h");
  }

  return {
    score,
    reasons,
  };
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).limit(300).get();

    const tasks = snap.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }) as TaskItem)
      .sort((a, b) => {
        const statusA = String(a.status || "pending");
        const statusB = String(b.status || "pending");
        if (statusA !== statusB) return statusA === "done" ? 1 : -1;
        return toMillis(a.dueAt || a.createdAt) - toMillis(b.dueAt || b.createdAt);
      });

    const leadIds = Array.from(new Set(tasks.map((task) => String(task.leadId || "")).filter(Boolean)));
    const [leadDocs, chatsSnap] = await Promise.all([
      Promise.all(leadIds.map((leadId) => adminDb.collection("leads").doc(leadId).get())),
      adminDb.collection("chats").where("tenantId", "==", tenantId).limit(1200).get(),
    ]);

    const leadsById = new Map<string, LeadItem>();
    for (const leadSnap of leadDocs) {
      if (!leadSnap.exists) continue;
      const data = leadSnap.data() as Record<string, unknown>;
      if (String(data.tenantId || "") !== tenantId) continue;
      leadsById.set(leadSnap.id, { id: leadSnap.id, ...data } as LeadItem);
    }

    const leadSilenceById = new Map<string, LeadSilenceInfo>();
    for (const chatDoc of chatsSnap.docs) {
      const chat = chatDoc.data() as Record<string, unknown>;
      const leadId = String(chat.leadId || "");
      if (!leadId || !leadsById.has(leadId)) continue;

      const lastInboundAt =
        toMillis(chat.lastClientMessageAt) ||
        toMillis(chat.lastMessageTime) ||
        toMillis(chat.updatedAt);
      if (!lastInboundAt) continue;

      const existing = leadSilenceById.get(leadId);
      if (!existing || lastInboundAt > existing.lastInboundAt) {
        leadSilenceById.set(leadId, {
          lastInboundAt,
          silenceHours: 0,
        });
      }
    }

    const now = Date.now();
    const items = tasks.map((task) => {
      const lead = leadsById.get(String(task.leadId || ""));
      const dueAt = task.dueAt || null;
      const dueMillis = toMillis(dueAt);
      const status = String(task.status || "pending").toLowerCase() === "done" ? "done" : "pending";
      const leadStage = normalizePipelineStageId(lead?.pipelineStage || lead?.stage || "captado");
      const leadHeat = String(lead?.heat || "morno").toLowerCase();
      const stageSlaBreached = Boolean(
        lead?.commercialState &&
          typeof lead.commercialState === "object" &&
          (lead.commercialState as Record<string, unknown>).stagePolicy &&
          typeof (lead.commercialState as Record<string, unknown>).stagePolicy === "object" &&
          ((lead.commercialState as Record<string, unknown>).stagePolicy as Record<string, unknown>).slaBreached === true
      );
      const silenceInfo = lead ? leadSilenceById.get(lead.id) : null;
      const silenceHours = silenceInfo?.lastInboundAt
        ? Math.max(0, Math.floor((now - silenceInfo.lastInboundAt) / 3600_000))
        : 0;
      const priority = String(task.priority || lead?.priority || "medium").toLowerCase();
      const priorityScore = computeFollowUpPriorityScore({
        dueMillis,
        now,
        status,
        taskPriority: priority,
        leadHeat,
        leadStage,
        stageSlaBreached,
        silenceHours,
      });
      const dynamicPriority =
        priorityScore.score >= 85 ? "urgent" : priorityScore.score >= 55 ? "high" : priorityScore.score >= 30 ? "medium" : "low";

      return {
        id: task.id,
        tenantId,
        leadId: String(task.leadId || ""),
        title: String(task.title || "Tarefa"),
        type: String(task.type || "follow_up"),
        priority,
        dynamicPriority,
        priorityScore: priorityScore.score,
        priorityReasons: priorityScore.reasons,
        silenceHours,
        status,
        dueAt,
        createdAt: task.createdAt || null,
        updatedAt: task.updatedAt || null,
        overdue: status !== "done" && Boolean(dueMillis && dueMillis < now),
        dueToday:
          status !== "done" &&
          Boolean(
            dueMillis &&
              new Date(dueMillis).toDateString() === new Date(now).toDateString()
          ),
        lead: lead
          ? {
              id: lead.id,
              nome: String(lead.nome || "Lead"),
              empresa: String(lead.empresa || ""),
              telefone: String(lead.telefone || ""),
              owner: String(lead.owner || ""),
              ownerId: String(lead.ownerId || ""),
              heat: String(lead.heat || "morno"),
              priority: String(lead.priority || "medium"),
              pipelineStage: leadStage,
            }
          : null,
      };
    });

    items.sort((a, b) => {
      const aStatus = String(a.status || "pending");
      const bStatus = String(b.status || "pending");
      if (aStatus !== bStatus) return aStatus === "done" ? 1 : -1;
      const aScore = Number(a.priorityScore || 0);
      const bScore = Number(b.priorityScore || 0);
      if (aScore !== bScore) return bScore - aScore;
      return toMillis(a.dueAt || a.createdAt) - toMillis(b.dueAt || b.createdAt);
    });

    const pending = items.filter((item) => item.status === "pending");
    const done = items.filter((item) => item.status === "done");
    const overdue = pending.filter((item) => item.overdue);
    const dueToday = pending.filter((item) => item.dueToday);
    const highPriority = pending.filter((item) => String(item.priority || "").toLowerCase() === "high");
    const dynamicUrgent = pending.filter((item) => String(item.dynamicPriority || "") === "urgent");
    const dynamicHigh = pending.filter((item) => String(item.dynamicPriority || "") === "high");
    const proposal = pending.filter((item) => String(item.lead?.pipelineStage || "") === "proposta_enviada");

    return NextResponse.json({
      ok: true,
      tenantId,
      summary: {
        total: items.length,
        pending: pending.length,
        done: done.length,
        overdue: overdue.length,
        dueToday: dueToday.length,
        highPriority: highPriority.length,
        dynamicUrgent: dynamicUrgent.length,
        dynamicHigh: dynamicHigh.length,
        proposal: proposal.length,
      },
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar follow-ups do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar follow-ups." }, { status: 500 });
  }
}
