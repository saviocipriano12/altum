import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { AI_QUEUE_JOB_TYPE } from "@/lib/server/ai/queue";
import {
  buildAiAlertGuidance,
  normalizeAiQueueStatus,
  readAiWorkerHealth,
  sanitizeText,
  summarizeAiQueueObservability,
  toTenantOperationalSnapshot,
  toTime,
} from "@/lib/server/ai/observability";

type JobItem = {
  id: string;
  tenantId: string;
  tenantName: string;
  chatId: string;
  messageId: string;
  status: ReturnType<typeof normalizeAiQueueStatus>;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  lastErrorCode: string;
  lastReasonCode: string;
  updatedAt: unknown;
  availableAt: unknown;
};

async function loadTenantNameMap(tenantIds: string[]) {
  const docs = await Promise.all(
    tenantIds.map(async (tenantId) => {
      const [tenantSnap, settingsSnap] = await Promise.all([
        adminDb.collection("tenants").doc(tenantId).get(),
        adminDb.collection("tenant_settings").doc(tenantId).get(),
      ]);

      const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
      const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};

      return {
        tenantId,
        tenantName: sanitizeText(settingsData.name || tenantData.name || tenantId, 180) || tenantId,
      };
    })
  );

  return new Map(docs.map((item) => [item.tenantId, item.tenantName]));
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const { searchParams } = new URL(req.url);
    const tenantIdFilter = sanitizeText(searchParams.get("tenantId"), 140);
    const limitRaw = Number(searchParams.get("limit") || 250);
    const limit = Number.isNaN(limitRaw) ? 250 : Math.min(700, Math.max(40, Math.round(limitRaw)));

    const [jobsSnap, metricsSnap, workerHealth] = await Promise.all([
      adminDb.collection("jobs").where("type", "==", AI_QUEUE_JOB_TYPE).limit(limit).get(),
      adminDb.collection("metrics").where("type", "==", "ai_queue_daily").limit(1500).get(),
      readAiWorkerHealth(),
    ]);

    const jobs = jobsSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          tenantId: sanitizeText(data.tenantId, 140),
          chatId: sanitizeText(data.chatId, 160),
          messageId: sanitizeText(data.messageId, 160),
          status: normalizeAiQueueStatus(data.status),
          attempts: typeof data.attempts === "number" ? data.attempts : 0,
          maxAttempts: typeof data.maxAttempts === "number" ? data.maxAttempts : 0,
          lastError: sanitizeText(data.lastError, 400),
          lastErrorCode: sanitizeText(data.lastErrorCode, 80),
          lastReasonCode: sanitizeText(data.lastReasonCode, 80),
          updatedAt: data.updatedAt || null,
          availableAt: data.availableAt || null,
          completedAt: data.completedAt || null,
          failedAt: data.failedAt || null,
        };
      })
      .filter((item) => item.tenantId)
      .filter((item) => (tenantIdFilter ? item.tenantId === tenantIdFilter : true));

    const metrics = metricsSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((item) => (tenantIdFilter ? sanitizeText(item.tenantId, 140) === tenantIdFilter : true));

    const summary = summarizeAiQueueObservability({
      jobs,
      metrics,
      workerHealth,
    });
    const tenantIds = Array.from(
      new Set([
        ...jobs.map((item) => item.tenantId).filter(Boolean),
        ...summary.tenants.map((item) => item.tenantId).filter(Boolean),
      ])
    );
    const tenantNameMap = await loadTenantNameMap(tenantIds);

    const recent: JobItem[] = jobs
      .map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        tenantName: tenantNameMap.get(item.tenantId) || item.tenantId,
        chatId: item.chatId,
        messageId: item.messageId,
        status: item.status,
        attempts: item.attempts,
        maxAttempts: item.maxAttempts,
        lastError: item.lastError,
        lastErrorCode: item.lastErrorCode,
        lastReasonCode: item.lastReasonCode,
        updatedAt: item.updatedAt,
        availableAt: item.availableAt,
      }))
      .sort((a, b) => toTime(b.updatedAt) - toTime(a.updatedAt));

    return NextResponse.json({
      ok: true,
      filter: {
        tenantId: tenantIdFilter || null,
        limit,
      },
      counts: summary.counts,
      total: jobs.length,
      worker: summary.worker,
      overview: summary.overview,
      tenants: summary.tenants.map((tenant) => ({
        ...(() => {
          const operational = toTenantOperationalSnapshot({
            workerStatus: summary.worker.status,
            queueRiskLevel: tenant.riskLevel,
            staleQueue: tenant.staleQueue,
            recurringAuthFailures: tenant.recurringAuthFailures,
            recurringQuotaFailures: tenant.recurringQuotaFailures,
            deadLetterCount: tenant.counts.deadLetter,
          });
          const guidance = tenant.recurringQuotaFailures > 0
            ? buildAiAlertGuidance({ errorCode: "quota_exceeded" })
            : tenant.recurringAuthFailures > 0
              ? buildAiAlertGuidance({ errorCode: "auth_invalid" })
              : tenant.staleQueue || tenant.counts.deadLetter > 0
                ? buildAiAlertGuidance({ type: "queue_degraded" })
                : null;
          return {
            operationalStatus: operational.status,
            operationalReason: operational.reason,
            primaryRecommendedAction: guidance?.recommendedAction || "",
            primaryActionHref: guidance?.href || "/cliente/painel/logs",
          };
        })(),
        ...tenant,
        tenantName: tenantNameMap.get(tenant.tenantId) || tenant.tenantId,
        lastOccurrenceAt: tenant.lastFailedAt || tenant.lastProcessedAt || tenant.lastActivityAt || null,
      })),
      deadLetters: recent.filter((item) => item.status === "dead_letter").slice(0, 30),
      retryQueue: recent.filter((item) => item.status === "retrying").slice(0, 30),
      recent: recent.slice(0, 80),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao consultar resumo da fila de IA:", error);
    return NextResponse.json({ error: "Falha ao consultar fila de IA." }, { status: 500 });
  }
}
