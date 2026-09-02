import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { AI_QUEUE_JOB_TYPE } from "@/lib/server/ai/queue";
import { AUTOMATION_SCHEDULED_JOB_TYPE, normalizeAutomationDoc } from "@/lib/server/automations";
import {
  normalizeAiQueueStatus,
  readAiWorkerHealth,
  summarizeAiQueueObservability,
  toCounter,
} from "@/lib/server/ai/observability";
import { assertTenantAccess, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type JobItem = {
  id: string;
  type?: string;
  status?: string;
  updatedAt?: unknown;
  chatId?: string;
  attempts?: number;
  lastError?: string;
  [key: string]: unknown;
};

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
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
  if (typeof value === "number") return new Date(value);
  return null;
}

function toTime(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

function dayStartUtcMs(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseFinanceDueDate(value: unknown) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [yearRaw, monthRaw, dayRaw] = value.trim().split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  }
  return toDate(value);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");

    const [
      settings,
      kbSnap,
      chatStateSnap,
      chatsSnap,
      jobsSnap,
      automationsSnap,
      metricsSnap,
      workerHealth,
      leadsSnap,
      tasksSnap,
      appointmentsSnap,
      financeSnap,
    ] =
      await Promise.all([
        getTenantSettings(tenantId),
        adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get(),
        adminDb.collection("chat_state").where("tenantId", "==", tenantId).limit(300).get(),
        adminDb.collection("chats").where("tenantId", "==", tenantId).limit(250).get(),
        adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(300).get(),
        adminDb.collection("automations").where("tenantId", "==", tenantId).limit(100).get(),
        adminDb.collection("metrics").where("tenantId", "==", tenantId).limit(90).get(),
        readAiWorkerHealth(),
        adminDb.collection("leads").where("tenantId", "==", tenantId).limit(240).get(),
        adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).limit(320).get(),
        adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(180).get(),
        adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(500).get(),
      ]);

    const ai =
      settings && typeof settings.ai === "object" && settings.ai
        ? (settings.ai as Record<string, unknown>)
        : {};

    const aiEnabled = ai.enabled !== false;
    const guardrails =
      Array.isArray(ai.guardrails) ? ai.guardrails.filter((item) => typeof item === "string").length : 0;

    const pausedChats = chatStateSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const aiEnabledForChat = data.aiEnabled !== false;
      const pausedUntil = toDate(data.pausedUntil);
      const humanOwnerUserId = String(data.humanOwnerUserId || "").trim();

      return !aiEnabledForChat || Boolean(humanOwnerUserId) || Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
    }).length;

    const allJobs: JobItem[] = jobsSnap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const queueJobs = allJobs
      .filter((item) => String(item.type || "") === AI_QUEUE_JOB_TYPE);
    const scheduledJobs = allJobs
      .filter((item) => String(item.type || "") === AUTOMATION_SCHEDULED_JOB_TYPE);

    const automationExecutions = allJobs
      .filter((item) => String(item.type || "") === "automation_execution")
      .map((item) => item)
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt))
      .slice(0, 12);

    const queueCounts = {
      pending: queueJobs.filter((item) => normalizeAiQueueStatus(item.status) === "pending").length,
      processing: queueJobs.filter((item) => normalizeAiQueueStatus(item.status) === "processing").length,
      retrying: queueJobs.filter((item) => normalizeAiQueueStatus(item.status) === "retrying").length,
      done: queueJobs.filter((item) => normalizeAiQueueStatus(item.status) === "done").length,
      deadLetter: queueJobs.filter((item) => normalizeAiQueueStatus(item.status) === "dead_letter").length,
    };
    const scheduledCounts = {
      pending: scheduledJobs.filter((item) => normalizeAiQueueStatus(item.status) === "pending").length,
      processing: scheduledJobs.filter((item) => normalizeAiQueueStatus(item.status) === "processing").length,
      retrying: scheduledJobs.filter((item) => normalizeAiQueueStatus(item.status) === "retrying").length,
      done: scheduledJobs.filter((item) => normalizeAiQueueStatus(item.status) === "done").length,
      deadLetter: scheduledJobs.filter((item) => normalizeAiQueueStatus(item.status) === "dead_letter").length,
    };

    const recentQueue = queueJobs
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt))
      .slice(0, 12)
      .map((item) => ({
        id: item.id as string,
        chatId: String(item.chatId || ""),
        status: normalizeAiQueueStatus(item.status),
        attempts: typeof item.attempts === "number" ? item.attempts : 0,
        updatedAt: item.updatedAt || null,
        lastError: String(item.lastError || ""),
        lastErrorCode: String(item.lastErrorCode || ""),
        lastReasonCode: String(item.lastReasonCode || ""),
      }));

    const queueMetrics = metricsSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((item) => String(item.type || "") === "ai_queue_daily");

    const processedTotal = queueMetrics.reduce(
      (sum, item) => sum + toCounter(item.counters, "processed"),
      0
    );
    const observability = summarizeAiQueueObservability({
      jobs: queueJobs.map((item) => ({
        id: item.id,
        tenantId,
        status: item.status,
        updatedAt: item.updatedAt,
        availableAt: item.availableAt,
        completedAt: item.completedAt,
        failedAt: item.failedAt,
      })),
      metrics: queueMetrics,
      workerHealth,
    });
    const aiHealth = observability.tenants[0] || {
      tenantId,
      counts: queueCounts,
      backlog: (queueCounts.pending || 0) + (queueCounts.processing || 0) + (queueCounts.retrying || 0),
      throughputToday: 0,
      retryRateToday: 0,
      deadLetterRateToday: 0,
      claimedToday: 0,
      failedToday: 0,
      retriedToday: 0,
      deadLetterToday: 0,
      enqueuedToday: 0,
      dedupedToday: 0,
      staleQueue: false,
      oldestReadyAgeMs: 0,
      lastProcessedAt: null,
      lastFailedAt: null,
      lastActivityAt: null,
      lastErrorCode: "",
      lastReasonCode: "",
      recurringAuthFailures: 0,
      recurringQuotaFailures: 0,
      dominantErrorCode: "",
      riskLevel: "stable" as const,
      riskReasons: [],
    };
    const now = Date.now();
    const waitingReplyBacklog = chatsSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const status = String(data.status || "open").toLowerCase();
      if (status === "resolved" || status === "archived") return false;
      const clientAt = toDate(data.lastClientMessageAt);
      const agentAt = toDate(data.lastAgentMessageAt);
      return Boolean(clientAt && (!agentAt || agentAt.getTime() < clientAt.getTime()));
    }).length;
    const slaBreached = chatsSnap.docs.filter((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const status = String(data.status || "open").toLowerCase();
      if (status === "resolved" || status === "archived") return false;
      const dueAt = toDate(data.slaDueAt);
      return Boolean(dueAt && dueAt.getTime() <= now);
    }).length;

    const automationItems = automationsSnap.docs
      .map((doc) => normalizeAutomationDoc(doc.id, doc.data() as Record<string, unknown>, tenantId))
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));
    const commercialLeads = leadsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    const commercialTasks = tasksSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    const appointments = appointmentsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    const overdueFollowUps = commercialTasks.filter((task) => {
      const status = String(task.status || "pending").toLowerCase();
      if (status === "done") return false;
      const dueAt = toDate(task.dueAt);
      return Boolean(dueAt && dueAt.getTime() < now);
    }).length;
    const handoffReady = commercialLeads.filter((lead) => {
      const handoff =
        lead.handoff && typeof lead.handoff === "object" ? (lead.handoff as Record<string, unknown>) : {};
      return String(handoff.status || "") === "ready";
    }).length;
    const slaBreaches = commercialLeads.filter((lead) => {
      const commercialState =
        lead.commercialState && typeof lead.commercialState === "object"
          ? (lead.commercialState as Record<string, unknown>)
          : {};
      const stagePolicy =
        commercialState.stagePolicy && typeof commercialState.stagePolicy === "object"
          ? (commercialState.stagePolicy as Record<string, unknown>)
          : {};
      return Boolean(stagePolicy.slaBreached);
    }).length;
    const meetingsScheduled = appointments.filter((item) => {
      const status = String(item.status || "scheduled").toLowerCase();
      return status === "scheduled" || status === "confirmed";
    }).length;
    const financeRows = financeSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
    const nowDayStart = dayStartUtcMs(new Date(now));
    const financeDueSoonItems = financeRows.filter((item) => {
      const status = String(item.status || "").toLowerCase();
      if (status === "pago" || status === "cancelado") return false;
      const tipo = String(item.tipo || "").toLowerCase();
      if (tipo === "despesa") return false;
      const dueDate = parseFinanceDueDate(item.vencimento || item.contractDueDate || item.dueDate);
      if (!dueDate) return false;
      const diffDays = Math.round((dayStartUtcMs(dueDate) - nowDayStart) / 86_400_000);
      return diffDays >= 0 && diffDays <= 5;
    });
    const financeDueSoonCount = financeDueSoonItems.length;
    const financeDueSoonTotal = Number(
      financeDueSoonItems
        .reduce((sum, item) => {
          const parsed = Number(item.valor || 0);
          return sum + (Number.isFinite(parsed) ? parsed : 0);
        }, 0)
        .toFixed(2)
    );
    const financeNextDueDate = financeDueSoonItems
      .map((item) => parseFinanceDueDate(item.vencimento || item.contractDueDate || item.dueDate))
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => a.getTime() - b.getTime())[0];

    const activeAutomations = automationItems.length === 0
      ? aiEnabled
        ? 1
        : 0
      : automationItems.filter((item) => item.enabled && item.status !== "paused").length;

    return NextResponse.json({
      ok: true,
      tenantId,
      summary: {
        activeAutomations,
        monitoredConversations: chatsSnap.size,
        pausedConversations: pausedChats,
        kbDocs: kbSnap.size,
        guardrails,
        queue: queueCounts,
        scheduled: scheduledCounts,
        processedTotal,
        aiHealth,
        workerHealth: observability.worker,
        aiEnabled,
        waitingReplyBacklog,
        slaBreached,
        commercial: {
          overdueFollowUps,
          handoffReady,
          slaBreaches,
          meetingsScheduled,
        },
        finance: {
          dueSoonCount: financeDueSoonCount,
          dueSoonTotal: financeDueSoonTotal,
          nextDueDate: financeNextDueDate
            ? financeNextDueDate.toISOString().slice(0, 10)
            : null,
        },
      },
      automations: automationItems,
      recentExecutions: automationExecutions,
      recentQueue,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar resumo de automacoes do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar automacoes." }, { status: 500 });
  }
}
