import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

export const AI_QUEUE_STALE_AFTER_MS = 15 * 60_000;
export const AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD = 3;
export const AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD = 3;
export const AI_QUEUE_RECURRING_QUOTA_ALERT_THRESHOLD = 3;
const AI_WORKER_HEALTH_DOC_ID = "ai_queue_worker";

export type AiQueueJobStatus = "pending" | "processing" | "retrying" | "done" | "dead_letter";

export type AiOperationalSeverity = "info" | "warning" | "high";
export type AiWorkerStatus = "healthy" | "degraded" | "down";
export type AiQueueErrorCode =
  | "auth_invalid"
  | "quota_exceeded"
  | "rate_limited"
  | "provider_unavailable"
  | "network_error"
  | "timeout"
  | "payload_invalid"
  | "unknown_error";

export type AiErrorClassification = {
  errorCode: AiQueueErrorCode;
  reasonCode: string;
  message: string;
};

export type AiQueueJobLike = {
  id: string;
  tenantId?: string;
  chatId?: string;
  messageId?: string;
  type?: string;
  status?: unknown;
  attempts?: number;
  maxAttempts?: number;
  lastError?: string;
  lastErrorCode?: string;
  lastReasonCode?: string;
  availableAt?: unknown;
  lockedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  failedAt?: unknown;
};

export type AiQueueMetricLike = {
  tenantId?: string;
  type?: string;
  dateRef?: string;
  counters?: unknown;
  errorCounters?: unknown;
  reasonCounters?: unknown;
  lastProcessedAt?: unknown;
  lastFailedAt?: unknown;
  lastEnqueuedAt?: unknown;
  lastRetriedAt?: unknown;
  lastDeadLetterAt?: unknown;
  lastClaimedAt?: unknown;
  lastErrorCode?: string;
  lastReasonCode?: string;
  updatedAt?: unknown;
};

export type AiWorkerHealthLike = {
  status?: unknown;
  lastHeartbeatAt?: unknown;
  lastSuccessAt?: unknown;
  lastFailureAt?: unknown;
  lastProcessedAt?: unknown;
  lastDurationMs?: unknown;
  lastErrorCode?: unknown;
  lastErrorMessage?: unknown;
  lastResult?: unknown;
  updatedAt?: unknown;
};

export type AiTenantQueueSummary = {
  tenantId: string;
  counts: {
    pending: number;
    processing: number;
    retrying: number;
    done: number;
    deadLetter: number;
  };
  backlog: number;
  throughputToday: number;
  retryRateToday: number;
  deadLetterRateToday: number;
  claimedToday: number;
  failedToday: number;
  retriedToday: number;
  deadLetterToday: number;
  enqueuedToday: number;
  dedupedToday: number;
  staleQueue: boolean;
  oldestReadyAgeMs: number;
  lastProcessedAt: unknown;
  lastFailedAt: unknown;
  lastActivityAt: unknown;
  lastErrorCode: string;
  lastReasonCode: string;
  recurringAuthFailures: number;
  recurringQuotaFailures: number;
  dominantErrorCode: string;
  riskLevel: "stable" | "warning" | "high";
  riskReasons: string[];
};

export function sanitizeText(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function sanitizeDocId(value: string, max = 220) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized.slice(0, max) || `doc_${Date.now()}`;
}

export function toDate(value: unknown) {
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

export function toTime(value: unknown) {
  return toDate(value)?.getTime() || 0;
}

export function normalizeAiQueueStatus(value: unknown): AiQueueJobStatus {
  const raw = String(value || "").toLowerCase();
  if (raw === "processing") return "processing";
  if (raw === "retrying") return "retrying";
  if (raw === "done") return "done";
  if (raw === "dead_letter") return "dead_letter";
  return "pending";
}

export function normalizeReasonCode(value: unknown, fallback = "unspecified") {
  const cleaned = sanitizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

export function sanitizeMetricKey(value: unknown, fallback = "unknown") {
  return normalizeReasonCode(value, fallback).slice(0, 80);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getAiQueueMetricDocId(tenantId: string, dateKey = getTodayKey()) {
  return `${sanitizeDocId(tenantId, 120)}_ai_queue_${dateKey}`;
}

export function getAiWorkerHealthDocRef() {
  return adminDb.collection("ops_health").doc(AI_WORKER_HEALTH_DOC_ID);
}

export async function readAiWorkerHealth() {
  const snap = await getAiWorkerHealthDocRef().get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

export async function readTodayAiQueueMetric(tenantId: string) {
  const snap = await adminDb.collection("metrics").doc(getAiQueueMetricDocId(tenantId)).get();
  return snap.exists ? (snap.data() as Record<string, unknown>) : null;
}

export function toCounter(value: unknown, key: string) {
  if (!value || typeof value !== "object") return 0;
  const target = (value as Record<string, unknown>)[key];
  return typeof target === "number" ? target : 0;
}

export function toCounterMap(value: unknown) {
  if (!value || typeof value !== "object") return {} as Record<string, number>;
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, number>>((acc, [key, raw]) => {
    if (typeof raw === "number" && Number.isFinite(raw)) {
      acc[key] = raw;
    }
    return acc;
  }, {});
}

export function classifyAiQueueError(error: unknown): AiErrorClassification {
  const message = sanitizeText(error instanceof Error ? error.message : String(error || ""), 400);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("authentication") ||
    normalized.includes("auth") ||
    normalized.includes("invalid api key") ||
    normalized.includes("api key")
  ) {
    return {
      errorCode: "auth_invalid",
      reasonCode: "auth_failed",
      message: message || "Falha de autenticacao do provider de IA.",
    };
  }

  if (
    normalized.includes("quota") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("billing") ||
    normalized.includes("credit")
  ) {
    return {
      errorCode: "quota_exceeded",
      reasonCode: "quota_exceeded",
      message: message || "Limite ou credito do provider de IA esgotado.",
    };
  }

  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many requests") ||
    normalized.includes("429")
  ) {
    return {
      errorCode: "rate_limited",
      reasonCode: "rate_limited",
      message: message || "Provider de IA respondeu com rate limit.",
    };
  }

  if (
    normalized.includes("service unavailable") ||
    normalized.includes("bad gateway") ||
    normalized.includes("gateway") ||
    normalized.includes("overloaded") ||
    normalized.includes("503") ||
    normalized.includes("502")
  ) {
    return {
      errorCode: "provider_unavailable",
      reasonCode: "provider_unavailable",
      message: message || "Provider de IA indisponivel temporariamente.",
    };
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("deadline exceeded") ||
    normalized.includes("abort")
  ) {
    return {
      errorCode: "timeout",
      reasonCode: "provider_timeout",
      message: message || "Timeout ao processar resposta da IA.",
    };
  }

  if (
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("enotfound") ||
    normalized.includes("socket") ||
    normalized.includes("fetch failed") ||
    normalized.includes("connect")
  ) {
    return {
      errorCode: "network_error",
      reasonCode: "network_error",
      message: message || "Falha de rede ao processar job de IA.",
    };
  }

  if (
    normalized.includes("payload invalido") ||
    normalized.includes("payload do job invalido") ||
    normalized.includes("invalid payload")
  ) {
    return {
      errorCode: "payload_invalid",
      reasonCode: "invalid_job_payload",
      message: message || "Payload do job de IA invalido.",
    };
  }

  return {
    errorCode: "unknown_error",
    reasonCode: "unknown_failure",
    message: message || "Erro desconhecido ao processar job de IA.",
  };
}

export async function updateAiWorkerHealth(input: {
  status: AiWorkerStatus;
  source?: string;
  message?: string;
  durationMs?: number;
  processed?: number;
  claimed?: number;
  failed?: number;
  retried?: number;
  deadLetter?: number;
  backlog?: number;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
}) {
  const ref = getAiWorkerHealthDocRef();
  const now = FieldValue.serverTimestamp();
  const payload: Record<string, unknown> = {
    status: input.status,
    scope: "ai_queue_worker",
    source: sanitizeText(input.source || "ai_queue", 80),
    message: sanitizeText(input.message, 280),
    lastDurationMs: typeof input.durationMs === "number" ? Math.max(0, Math.round(input.durationMs)) : null,
    lastHeartbeatAt: now,
    updatedAt: now,
    lastErrorCode: sanitizeMetricKey(input.lastErrorCode, ""),
    lastErrorMessage: sanitizeText(input.lastErrorMessage, 320),
    lastResult: {
      processed: Math.max(0, Math.round(input.processed || 0)),
      claimed: Math.max(0, Math.round(input.claimed || 0)),
      failed: Math.max(0, Math.round(input.failed || 0)),
      retried: Math.max(0, Math.round(input.retried || 0)),
      deadLetter: Math.max(0, Math.round(input.deadLetter || 0)),
      backlog: Math.max(0, Math.round(input.backlog || 0)),
    },
  };

  if (input.status !== "down" && (input.processed || input.claimed || input.retried || input.deadLetter)) {
    payload.lastSuccessAt = now;
  }
  if (input.failed) {
    payload.lastFailureAt = now;
  }
  if (input.processed) {
    payload.lastProcessedAt = now;
  }

  await ref.set(payload, { merge: true });
}

export async function upsertAiOperationalAlert(input: {
  tenantId: string;
  type: string;
  severity: AiOperationalSeverity;
  title: string;
  detail: string;
  chatId?: string;
  leadId?: string;
  errorCode?: string;
  reasonCode?: string;
  scope?: string;
  source?: string;
}) {
  const tenantId = sanitizeText(input.tenantId, 140);
  if (!tenantId) return null;

  const scope = sanitizeMetricKey(input.scope, "global");
  const type = sanitizeMetricKey(input.type, "operational_alert");
  const docId = sanitizeDocId(`ops_${tenantId}_${type}_${scope}`);
  const ref = adminDb.collection("ai_internal_notifications").doc(docId);

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const existing = snap.exists ? (snap.data() as Record<string, unknown>) : null;
    const occurrences = typeof existing?.occurrences === "number" ? existing.occurrences : 0;
    const createdAt = existing?.createdAt || FieldValue.serverTimestamp();
    const firstOccurredAt = existing?.firstOccurredAt || FieldValue.serverTimestamp();

    tx.set(
      ref,
      {
        tenantId,
        chatId: sanitizeText(input.chatId, 160),
        leadId: sanitizeText(input.leadId, 160),
        type,
        severity: sanitizeText(input.severity, 20),
        title: sanitizeText(input.title, 180),
        detail: sanitizeText(input.detail, 320),
        status: "open",
        category: "operational",
        dedupeKey: docId,
        scope,
        source: sanitizeText(input.source || "ai_queue_observability", 80),
        errorCode: sanitizeMetricKey(input.errorCode, ""),
        reasonCode: sanitizeMetricKey(input.reasonCode, ""),
        occurrences: occurrences + 1,
        createdAt,
        firstOccurredAt,
        lastOccurredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        resolvedAt: null,
      },
      { merge: true }
    );
  });

  return docId;
}

export async function resolveAiOperationalAlert(input: {
  tenantId: string;
  type: string;
  scope?: string;
}) {
  const tenantId = sanitizeText(input.tenantId, 140);
  if (!tenantId) return;

  const type = sanitizeMetricKey(input.type, "operational_alert");
  const scope = sanitizeMetricKey(input.scope, "global");
  const ref = adminDb
    .collection("ai_internal_notifications")
    .doc(sanitizeDocId(`ops_${tenantId}_${type}_${scope}`));

  const snap = await ref.get();
  if (!snap.exists) return;

  await ref.set(
    {
      status: "resolved",
      resolvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function latestValue(...values: unknown[]) {
  return values
    .map((value) => ({ raw: value, time: toTime(value) }))
    .sort((a, b) => b.time - a.time)[0]?.raw || null;
}

function pickDominantCounterKey(counters: Record<string, number>) {
  return Object.entries(counters)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function summarizeAiQueueObservability(input: {
  jobs: AiQueueJobLike[];
  metrics: AiQueueMetricLike[];
  workerHealth?: AiWorkerHealthLike | null;
  nowMs?: number;
}) {
  const nowMs = typeof input.nowMs === "number" ? input.nowMs : Date.now();
  const tenantIds = new Set<string>();
  const jobsByTenant = new Map<string, AiQueueJobLike[]>();
  const latestMetricByTenant = new Map<string, AiQueueMetricLike>();

  for (const job of input.jobs) {
    const tenantId = sanitizeText(job.tenantId, 140);
    if (!tenantId) continue;
    tenantIds.add(tenantId);
    if (!jobsByTenant.has(tenantId)) jobsByTenant.set(tenantId, []);
    jobsByTenant.get(tenantId)?.push(job);
  }

  for (const metric of input.metrics) {
    const tenantId = sanitizeText(metric.tenantId, 140);
    if (!tenantId) continue;
    tenantIds.add(tenantId);
    const current = latestMetricByTenant.get(tenantId);
    if (!current || String(metric.dateRef || "") > String(current.dateRef || "")) {
      latestMetricByTenant.set(tenantId, metric);
    }
  }

  const tenants: AiTenantQueueSummary[] = Array.from(tenantIds).map((tenantId) => {
    const jobs = jobsByTenant.get(tenantId) || [];
    const metric = latestMetricByTenant.get(tenantId);
    const counts = {
      pending: jobs.filter((job) => normalizeAiQueueStatus(job.status) === "pending").length,
      processing: jobs.filter((job) => normalizeAiQueueStatus(job.status) === "processing").length,
      retrying: jobs.filter((job) => normalizeAiQueueStatus(job.status) === "retrying").length,
      done: jobs.filter((job) => normalizeAiQueueStatus(job.status) === "done").length,
      deadLetter: jobs.filter((job) => normalizeAiQueueStatus(job.status) === "dead_letter").length,
    };
    const backlog = counts.pending + counts.processing + counts.retrying;
    const readyJobTimes = jobs
      .filter((job) => {
        const status = normalizeAiQueueStatus(job.status);
        if (status !== "pending" && status !== "retrying") return false;
        const availableAt = toTime(job.availableAt);
        return availableAt > 0 && availableAt <= nowMs;
      })
      .map((job) => toTime(job.availableAt))
      .filter(Boolean);
    const oldestReadyAt = readyJobTimes.length ? Math.min(...readyJobTimes) : 0;
    const oldestReadyAgeMs = oldestReadyAt ? Math.max(0, nowMs - oldestReadyAt) : 0;
    const staleQueue = backlog > 0 && oldestReadyAgeMs >= AI_QUEUE_STALE_AFTER_MS;

    const metricCounters = toCounterMap(metric?.counters);
    const errorCounters = toCounterMap(metric?.errorCounters);
    const throughputToday = metricCounters.processed || 0;
    const claimedToday = metricCounters.claimed || 0;
    const failedToday = metricCounters.failed || 0;
    const retriedToday = metricCounters.retried || 0;
    const deadLetterToday = metricCounters.deadLetter || 0;
    const enqueuedToday = metricCounters.enqueued || 0;
    const dedupedToday = metricCounters.deduped || 0;
    const retryRateToday = claimedToday ? retriedToday / claimedToday : 0;
    const deadLetterRateToday = claimedToday ? deadLetterToday / claimedToday : 0;
    const recurringAuthFailures = errorCounters.auth_invalid || 0;
    const recurringQuotaFailures = errorCounters.quota_exceeded || 0;
    const dominantErrorCode = pickDominantCounterKey(errorCounters);
    const lastActivityAt = latestValue(
      metric?.updatedAt,
      metric?.lastProcessedAt,
      metric?.lastFailedAt,
      ...jobs.map((job) => job.updatedAt)
    );
    const lastProcessedAt = latestValue(
      metric?.lastProcessedAt,
      ...jobs.filter((job) => normalizeAiQueueStatus(job.status) === "done").map((job) => job.completedAt || job.updatedAt)
    );
    const lastFailedAt = latestValue(
      metric?.lastFailedAt,
      ...jobs
        .filter((job) => normalizeAiQueueStatus(job.status) === "retrying" || normalizeAiQueueStatus(job.status) === "dead_letter")
        .map((job) => job.failedAt || job.updatedAt)
    );

    const riskReasons: string[] = [];
    if (staleQueue) riskReasons.push("stale_queue");
    if (counts.deadLetter >= AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD) riskReasons.push("dead_letter_threshold");
    if (recurringAuthFailures >= AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD) riskReasons.push("recurring_auth_failures");
    if (recurringQuotaFailures >= AI_QUEUE_RECURRING_QUOTA_ALERT_THRESHOLD) riskReasons.push("recurring_quota_failures");
    if (!riskReasons.length && retryRateToday >= 0.2) riskReasons.push("retry_rate_elevated");
    if (!riskReasons.length && deadLetterRateToday >= 0.1) riskReasons.push("dead_letter_rate_elevated");

    const riskLevel =
      riskReasons.some((item) =>
        item === "stale_queue" ||
        item === "dead_letter_threshold" ||
        item === "recurring_auth_failures" ||
        item === "recurring_quota_failures"
      )
        ? "high"
        : riskReasons.length
          ? "warning"
          : "stable";

    return {
      tenantId,
      counts,
      backlog,
      throughputToday,
      retryRateToday,
      deadLetterRateToday,
      claimedToday,
      failedToday,
      retriedToday,
      deadLetterToday,
      enqueuedToday,
      dedupedToday,
      staleQueue,
      oldestReadyAgeMs,
      lastProcessedAt,
      lastFailedAt,
      lastActivityAt,
      lastErrorCode: sanitizeMetricKey(metric?.lastErrorCode, ""),
      lastReasonCode: sanitizeMetricKey(metric?.lastReasonCode, ""),
      recurringAuthFailures,
      recurringQuotaFailures,
      dominantErrorCode,
      riskLevel,
      riskReasons,
    };
  });

  tenants.sort((a, b) => {
    const severityWeight = (value: AiTenantQueueSummary["riskLevel"]) => {
      if (value === "high") return 2;
      if (value === "warning") return 1;
      return 0;
    };
    if (severityWeight(a.riskLevel) !== severityWeight(b.riskLevel)) {
      return severityWeight(b.riskLevel) - severityWeight(a.riskLevel);
    }
    if (a.backlog !== b.backlog) return b.backlog - a.backlog;
    return toTime(b.lastActivityAt) - toTime(a.lastActivityAt);
  });

  const worker = input.workerHealth
    ? {
        status:
          String(input.workerHealth.status || "") === "healthy" ||
          String(input.workerHealth.status || "") === "degraded" ||
          String(input.workerHealth.status || "") === "down"
            ? (String(input.workerHealth.status || "") as AiWorkerStatus)
            : "down",
        lastHeartbeatAt: input.workerHealth.lastHeartbeatAt || null,
        lastSuccessAt: input.workerHealth.lastSuccessAt || null,
        lastFailureAt: input.workerHealth.lastFailureAt || null,
        lastProcessedAt: input.workerHealth.lastProcessedAt || null,
        lastDurationMs:
          typeof input.workerHealth.lastDurationMs === "number" ? input.workerHealth.lastDurationMs : 0,
        lastErrorCode: sanitizeMetricKey(input.workerHealth.lastErrorCode, ""),
        lastErrorMessage: sanitizeText(input.workerHealth.lastErrorMessage, 320),
        lastResult:
          input.workerHealth.lastResult && typeof input.workerHealth.lastResult === "object"
            ? (input.workerHealth.lastResult as Record<string, unknown>)
            : {},
        stale: nowMs - toTime(input.workerHealth.lastHeartbeatAt) > AI_QUEUE_STALE_AFTER_MS,
      }
    : {
        status: "down" as AiWorkerStatus,
        lastHeartbeatAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastProcessedAt: null,
        lastDurationMs: 0,
        lastErrorCode: "",
        lastErrorMessage: "",
        lastResult: {},
        stale: true,
      };

  const counts = tenants.reduce(
    (acc, tenant) => {
      acc.pending += tenant.counts.pending;
      acc.processing += tenant.counts.processing;
      acc.retrying += tenant.counts.retrying;
      acc.done += tenant.counts.done;
      acc.deadLetter += tenant.counts.deadLetter;
      return acc;
    },
    { pending: 0, processing: 0, retrying: 0, done: 0, deadLetter: 0 }
  );

  return {
    worker,
    counts,
    overview: {
      totalTenants: tenants.length,
      riskyTenants: tenants.filter((tenant) => tenant.riskLevel !== "stable").length,
      highRiskTenants: tenants.filter((tenant) => tenant.riskLevel === "high").length,
      staleTenants: tenants.filter((tenant) => tenant.staleQueue).length,
      backlog: tenants.reduce((sum, tenant) => sum + tenant.backlog, 0),
      throughputToday: tenants.reduce((sum, tenant) => sum + tenant.throughputToday, 0),
      retryRateToday:
        tenants.reduce((sum, tenant) => sum + tenant.claimedToday, 0) > 0
          ? tenants.reduce((sum, tenant) => sum + tenant.retriedToday, 0) /
            tenants.reduce((sum, tenant) => sum + tenant.claimedToday, 0)
          : 0,
      deadLetterRateToday:
        tenants.reduce((sum, tenant) => sum + tenant.claimedToday, 0) > 0
          ? tenants.reduce((sum, tenant) => sum + tenant.deadLetterToday, 0) /
            tenants.reduce((sum, tenant) => sum + tenant.claimedToday, 0)
          : 0,
    },
    tenants,
  };
}
