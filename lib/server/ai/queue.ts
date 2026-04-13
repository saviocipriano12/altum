import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { handleIncomingMessage } from "@/lib/server/ai/agent";
import {
  AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD,
  AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD,
  AI_QUEUE_RECURRING_QUOTA_ALERT_THRESHOLD,
  classifyAiQueueError,
  getAiQueueMetricDocId,
  normalizeReasonCode,
  readTodayAiQueueMetric,
  resolveAiOperationalAlert,
  sanitizeMetricKey,
  toCounterMap,
  updateAiWorkerHealth,
  upsertAiOperationalAlert,
} from "@/lib/server/ai/observability";

const JOB_TYPE = "ai_incoming_message";
const DEFAULT_MAX_ATTEMPTS = 6;
const DEFAULT_BATCH_LIMIT = 10;
const LOCK_TTL_MS = 90_000;
const BASE_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

type JobStatus = "pending" | "processing" | "retrying" | "done" | "dead_letter";

type AiJobDoc = {
  type?: string;
  tenantId?: string;
  chatId?: string;
  messageId?: string;
  source?: string;
  status?: JobStatus;
  attempts?: number;
  maxAttempts?: number;
  priority?: number;
  dedupeKey?: string;
  availableAt?: unknown;
  lockedAt?: unknown;
  lastErrorCode?: string;
  lastReasonCode?: string;
};

type ClaimedJob = {
  id: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  attempts: number;
  maxAttempts: number;
};

async function updateChatStateProcessing(input: {
  tenantId: string;
  chatId: string;
  jobId: string;
  messageId: string;
  jobStatus: JobStatus;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  decisionReason?: string;
  decisionReasonCode?: string;
  lastError?: string | null;
  lastErrorCode?: string | null;
}) {
  const chatStateId = `${input.tenantId.trim()}_${input.chatId.trim()}`;
  await adminDb.collection("chat_state").doc(chatStateId).set(
    {
      tenantId: input.tenantId,
      chatId: input.chatId,
      lastJobStatus: input.jobStatus,
      lastDecision: input.decision || null,
      lastDecisionReason: input.decisionReason || null,
      lastDecisionReasonCode: input.decisionReasonCode || null,
      lastJobError: input.lastError || null,
      lastJobErrorCode: input.lastErrorCode || null,
      lastProcessedAt: FieldValue.serverTimestamp(),
      lastJobId: input.jobId,
      lastMessageId: input.messageId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export type EnqueueIncomingMessageJobInput = {
  tenantId: string;
  chatId: string;
  messageId: string;
  source?: string;
  dedupeKey?: string;
  maxAttempts?: number;
  priority?: number;
};

export type EnqueueIncomingMessageJobResult = {
  jobId: string;
  created: boolean;
  status: JobStatus;
};

export type ProcessAiQueueResult = {
  requested: number;
  claimed: number;
  processed: number;
  retried: number;
  deadLetter: number;
  failed: number;
  skipped: number;
  batches: number;
};

type KickAiQueueNowOptions = {
  limit?: number;
  drain?: boolean;
  maxBatches?: number;
  timeoutMs?: number;
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

function sanitizeId(value: string, max = 220) {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/g, "_");
  return normalized.slice(0, max) || `job_${Date.now()}`;
}

function normalizeStatus(value: unknown): JobStatus {
  const raw = String(value || "").toLowerCase();
  if (raw === "processing") return "processing";
  if (raw === "retrying") return "retrying";
  if (raw === "done") return "done";
  if (raw === "dead_letter") return "dead_letter";
  return "pending";
}

function canClaimStatus(status: JobStatus) {
  return status === "pending" || status === "retrying";
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function recordQueueMetrics(input: {
  tenantId: string;
  enqueued?: number;
  deduped?: number;
  claimed?: number;
  processed?: number;
  failed?: number;
  retried?: number;
  deadLetter?: number;
  skipped?: number;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  reasonCode?: string;
  errorCode?: string;
}) {
  const metricRef = adminDb.collection("metrics").doc(getAiQueueMetricDocId(input.tenantId));

  const counters: Record<string, unknown> = {};
  if (input.enqueued) counters.enqueued = FieldValue.increment(input.enqueued);
  if (input.deduped) counters.deduped = FieldValue.increment(input.deduped);
  if (input.claimed) counters.claimed = FieldValue.increment(input.claimed);
  if (input.processed) counters.processed = FieldValue.increment(input.processed);
  if (input.failed) counters.failed = FieldValue.increment(input.failed);
  if (input.retried) counters.retried = FieldValue.increment(input.retried);
  if (input.deadLetter) counters.deadLetter = FieldValue.increment(input.deadLetter);
  if (input.skipped) counters.skipped = FieldValue.increment(input.skipped);

  const decisions: Record<string, unknown> = {};
  if (input.decision) decisions[input.decision] = FieldValue.increment(1);

  const reasonCounters: Record<string, unknown> = {};
  if (input.reasonCode) {
    reasonCounters[sanitizeMetricKey(input.reasonCode)] = FieldValue.increment(1);
  }

  const errorCounters: Record<string, unknown> = {};
  if (input.errorCode) {
    errorCounters[sanitizeMetricKey(input.errorCode)] = FieldValue.increment(1);
  }

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    type: "ai_queue_daily",
    dateRef: getTodayKey(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };

  if (Object.keys(counters).length > 0) payload.counters = counters;
  if (Object.keys(decisions).length > 0) payload.decisions = decisions;
  if (Object.keys(reasonCounters).length > 0) payload.reasonCounters = reasonCounters;
  if (Object.keys(errorCounters).length > 0) payload.errorCounters = errorCounters;
  if (input.enqueued) payload.lastEnqueuedAt = FieldValue.serverTimestamp();
  if (input.claimed) payload.lastClaimedAt = FieldValue.serverTimestamp();
  if (input.processed) payload.lastProcessedAt = FieldValue.serverTimestamp();
  if (input.failed) payload.lastFailedAt = FieldValue.serverTimestamp();
  if (input.retried) payload.lastRetriedAt = FieldValue.serverTimestamp();
  if (input.deadLetter) payload.lastDeadLetterAt = FieldValue.serverTimestamp();
  if (input.errorCode) payload.lastErrorCode = sanitizeMetricKey(input.errorCode);
  if (input.reasonCode) payload.lastReasonCode = sanitizeMetricKey(input.reasonCode);

  await metricRef.set(payload, { merge: true });
}

async function syncDeadLetterAlert(tenantId: string) {
  const snap = await adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(300).get();
  const deadLetterCount = snap.docs.filter((doc) => {
    const data = doc.data() as AiJobDoc;
    return data.type === JOB_TYPE && normalizeStatus(data.status) === "dead_letter";
  }).length;

  if (deadLetterCount >= AI_QUEUE_DEAD_LETTER_ALERT_THRESHOLD) {
    await upsertAiOperationalAlert({
      tenantId,
      type: "dead_letter_threshold",
      scope: "queue",
      severity: "high",
      title: "Fila de IA com dead-letter acima do limiar",
      detail: `${deadLetterCount} job(s) de IA estao em dead-letter para este tenant.`,
      reasonCode: "dead_letter_threshold",
      source: "ai_queue_worker",
    });
    return;
  }

  await resolveAiOperationalAlert({
    tenantId,
    type: "dead_letter_threshold",
    scope: "queue",
  });
}

async function syncRecurringProviderAlerts(tenantId: string, errorCode: string) {
  const metrics = await readTodayAiQueueMetric(tenantId);
  const counters = toCounterMap(metrics?.errorCounters);

  if (
    errorCode === "auth_invalid" &&
    (counters.auth_invalid || 0) >= AI_QUEUE_RECURRING_AUTH_ALERT_THRESHOLD
  ) {
    await upsertAiOperationalAlert({
      tenantId,
      type: "recurring_auth_fail",
      scope: "provider_auth",
      severity: "high",
      title: "Falha recorrente de autenticacao no provider de IA",
      detail: `${counters.auth_invalid || 0} falha(s) de autenticacao registradas hoje para este tenant.`,
      errorCode,
      reasonCode: "auth_failed",
      source: "ai_queue_worker",
    });
  }

  if (
    errorCode === "quota_exceeded" &&
    (counters.quota_exceeded || 0) >= AI_QUEUE_RECURRING_QUOTA_ALERT_THRESHOLD
  ) {
    await upsertAiOperationalAlert({
      tenantId,
      type: "recurring_quota_fail",
      scope: "provider_quota",
      severity: "high",
      title: "Quota da IA esgotando ou bloqueada",
      detail: `${counters.quota_exceeded || 0} falha(s) de quota registradas hoje para este tenant.`,
      errorCode,
      reasonCode: "quota_exceeded",
      source: "ai_queue_worker",
    });
  }
}

export async function enqueueIncomingMessageJob(
  input: EnqueueIncomingMessageJobInput
): Promise<EnqueueIncomingMessageJobResult> {
  const tenantId = input.tenantId.trim();
  const chatId = input.chatId.trim();
  const messageId = input.messageId.trim();

  if (!tenantId || !chatId || !messageId) {
    throw new Error("Payload invalido para enfileirar job de IA.");
  }

  const dedupeKey = input.dedupeKey?.trim() || `${tenantId}_${messageId}`;
  const jobId = sanitizeId(`${JOB_TYPE}_${dedupeKey}`);
  const maxAttempts = Math.min(10, Math.max(1, input.maxAttempts || DEFAULT_MAX_ATTEMPTS));
  const priority = Math.min(100, Math.max(0, input.priority || 50));

  const jobRef = adminDb.collection("jobs").doc(jobId);
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (snap.exists) {
      const status = normalizeStatus((snap.data() as AiJobDoc).status);
      if (status !== "dead_letter") {
        return { created: false, status } as const;
      }
    }

    tx.set(
      jobRef,
      {
        type: JOB_TYPE,
        tenantId,
        chatId,
        messageId,
        dedupeKey,
        source: input.source || "webhook_whatsapp",
        status: "pending",
        attempts: 0,
        maxAttempts,
        priority,
        availableAt: new Date(),
        lockedAt: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { created: true, status: "pending" as JobStatus } as const;
  });

  await recordQueueMetrics({
    tenantId,
    enqueued: result.created ? 1 : 0,
    deduped: result.created ? 0 : 1,
  });

  return {
    jobId,
    created: result.created,
    status: result.status,
  };
}

async function listClaimableJobs(limit: number) {
  const rawLimit = Math.min(120, Math.max(limit * 4, 20));
  const snap = await adminDb
    .collection("jobs")
    .where("type", "==", JOB_TYPE)
    .limit(rawLimit)
    .get();

  const now = Date.now();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as AiJobDoc;
      const status = normalizeStatus(data.status);
      const availableAt = toDate(data.availableAt)?.getTime() || 0;
      const attempts = typeof data.attempts === "number" ? data.attempts : 0;
      const priority = typeof data.priority === "number" ? data.priority : 50;
      const lockedAt = toDate(data.lockedAt)?.getTime() || 0;

      return {
        id: doc.id,
        status,
        availableAt,
        attempts,
        priority,
        lockedAt,
      };
    })
    .filter((job) => canClaimStatus(job.status))
    .filter((job) => job.availableAt <= now)
    .filter((job) => !job.lockedAt || now - job.lockedAt > LOCK_TTL_MS)
    .sort((a, b) => {
      if (a.availableAt !== b.availableAt) return a.availableAt - b.availableAt;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.attempts - b.attempts;
    })
    .slice(0, limit * 2);
}

async function claimJob(jobId: string): Promise<ClaimedJob | null> {
  const jobRef = adminDb.collection("jobs").doc(jobId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;

    const data = snap.data() as AiJobDoc;
    const status = normalizeStatus(data.status);
    if (!canClaimStatus(status)) return null;

    const now = Date.now();
    const availableAt = toDate(data.availableAt)?.getTime() || 0;
    const lockedAt = toDate(data.lockedAt)?.getTime() || 0;

    if (availableAt > now) return null;
    if (lockedAt && now - lockedAt <= LOCK_TTL_MS) return null;

    const tenantId = String(data.tenantId || "").trim();
    const chatId = String(data.chatId || "").trim();
    const messageId = String(data.messageId || "").trim();
    const maxAttempts = typeof data.maxAttempts === "number" ? data.maxAttempts : DEFAULT_MAX_ATTEMPTS;
    const attempts = (typeof data.attempts === "number" ? data.attempts : 0) + 1;

    if (!tenantId || !chatId || !messageId) {
      tx.set(
        jobRef,
        {
          status: "dead_letter",
          lockedAt: null,
          lastError: "Payload do job invalido.",
          lastErrorCode: "payload_invalid",
          lastReasonCode: "invalid_job_payload",
          updatedAt: FieldValue.serverTimestamp(),
          finishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return null;
    }

    tx.set(
      jobRef,
      {
        status: "processing",
        attempts,
        lockedAt: new Date(),
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      id: jobId,
      tenantId,
      chatId,
      messageId,
      attempts,
      maxAttempts,
    } satisfies ClaimedJob;
  });
}

function computeRetryDelayMs(attempts: number) {
  const multiplier = Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * multiplier);
}

async function finalizeSuccessfulJob(
  job: ClaimedJob,
  decision: "respond" | "ask_more" | "handoff" | "skip",
  reason: string
) {
  const jobRef = adminDb.collection("jobs").doc(job.id);
  const reasonCode = normalizeReasonCode(reason, "decision_recorded");
  await Promise.all([
    jobRef.set(
      {
        status: "done",
        decision,
        decisionReason: reason,
        lastReasonCode: reasonCode,
        lastErrorCode: null,
        lockedAt: null,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    recordQueueMetrics({
      tenantId: job.tenantId,
      claimed: 1,
      processed: 1,
      decision,
      skipped: decision === "skip" ? 1 : 0,
      reasonCode,
    }),
    updateChatStateProcessing({
      tenantId: job.tenantId,
      chatId: job.chatId,
      jobId: job.id,
      messageId: job.messageId,
      jobStatus: "done",
      decision,
      decisionReason: reason,
      decisionReasonCode: reasonCode,
      lastError: null,
      lastErrorCode: null,
    }),
  ]);
}

async function finalizeFailedJob(job: ClaimedJob, error: unknown) {
  const classification = classifyAiQueueError(error);
  const message = classification.message;

  const canRetry = job.attempts < job.maxAttempts;
  const retryDelayMs = computeRetryDelayMs(job.attempts);

  const jobRef = adminDb.collection("jobs").doc(job.id);

  await Promise.all([
    jobRef.set(
      {
        status: canRetry ? "retrying" : "dead_letter",
        lockedAt: null,
        availableAt: canRetry ? new Date(Date.now() + retryDelayMs) : null,
        lastError: message,
        lastErrorCode: classification.errorCode,
        lastReasonCode: classification.reasonCode,
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    recordQueueMetrics({
      tenantId: job.tenantId,
      claimed: 1,
      failed: 1,
      retried: canRetry ? 1 : 0,
      deadLetter: canRetry ? 0 : 1,
      reasonCode: classification.reasonCode,
      errorCode: classification.errorCode,
    }),
    updateChatStateProcessing({
      tenantId: job.tenantId,
      chatId: job.chatId,
      jobId: job.id,
      messageId: job.messageId,
      jobStatus: canRetry ? "retrying" : "dead_letter",
      decisionReason: canRetry ? "job_retry_scheduled" : "job_failed_dead_letter",
      decisionReasonCode: classification.reasonCode,
      lastError: message,
      lastErrorCode: classification.errorCode,
    }),
  ]);

  await Promise.all([
    syncRecurringProviderAlerts(job.tenantId, classification.errorCode),
    syncDeadLetterAlert(job.tenantId),
  ]);

  return {
    canRetry,
    classification,
  };
}

async function processOneClaimedJob(job: ClaimedJob) {
  const startedAt = Date.now();
  try {
    const result = await handleIncomingMessage({
      tenantId: job.tenantId,
      chatId: job.chatId,
      messageId: job.messageId,
    });

    await finalizeSuccessfulJob(job, result.decision, result.reason);
    await updateAiWorkerHealth({
      status: "healthy",
      source: "process_one_claimed_job",
      durationMs: Date.now() - startedAt,
      claimed: 1,
      processed: 1,
      retried: 0,
      deadLetter: 0,
    });

    return {
      ok: true,
      retried: false,
      deadLetter: false,
      skipped: result.decision === "skip",
    };
  } catch (error) {
    const failed = await finalizeFailedJob(job, error);
    await updateAiWorkerHealth({
      status: failed.classification.errorCode === "auth_invalid" || failed.classification.errorCode === "quota_exceeded"
        ? "degraded"
        : "down",
      source: "process_one_claimed_job",
      durationMs: Date.now() - startedAt,
      claimed: 1,
      failed: 1,
      retried: failed.canRetry ? 1 : 0,
      deadLetter: failed.canRetry ? 0 : 1,
      lastErrorCode: failed.classification.errorCode,
      lastErrorMessage: failed.classification.message,
    });
    console.error("Erro ao processar job de IA:", {
      jobId: job.id,
      tenantId: job.tenantId,
      chatId: job.chatId,
      messageId: job.messageId,
      error,
    });

    return {
      ok: false,
      retried: failed.canRetry,
      deadLetter: !failed.canRetry,
      skipped: false,
    };
  }
}

export async function processAiJobNow(jobId: string) {
  const normalizedJobId = String(jobId || "").trim();
  if (!normalizedJobId) return null;

  try {
    const claimed = await claimJob(normalizedJobId);
    if (!claimed) return null;

    const result = await processOneClaimedJob(claimed);
    return {
      jobId: normalizedJobId,
      ...result,
    };
  } catch (error) {
    console.error("Erro ao processar job especifico de IA:", {
      jobId: normalizedJobId,
      error,
    });
    return null;
  }
}

export async function processAiQueue(options?: {
  limit?: number;
  drain?: boolean;
  maxBatches?: number;
}): Promise<ProcessAiQueueResult> {
  const startedAt = Date.now();
  const requested = Math.min(100, Math.max(1, options?.limit || DEFAULT_BATCH_LIMIT));
  const drain = options?.drain === true;
  const maxBatches = Math.min(12, Math.max(1, options?.maxBatches || 4));

  const result: ProcessAiQueueResult = {
    requested,
    claimed: 0,
    processed: 0,
    retried: 0,
    deadLetter: 0,
    failed: 0,
    skipped: 0,
    batches: 0,
  };

  try {
    for (let batch = 0; batch < maxBatches; batch += 1) {
      let claimedInBatch = 0;
      result.batches += 1;

      for (let i = 0; i < requested; i += 1) {
        const candidates = await listClaimableJobs(1);
        const candidate = candidates[0];
        if (!candidate) break;

        const claimed = await claimJob(candidate.id);
        if (!claimed) continue;

        claimedInBatch += 1;
        result.claimed += 1;

        const jobResult = await processOneClaimedJob(claimed);
        if (jobResult.ok) {
          result.processed += 1;
          if (jobResult.skipped) result.skipped += 1;
          continue;
        }

        result.failed += 1;
        if (jobResult.retried) result.retried += 1;
        if (jobResult.deadLetter) result.deadLetter += 1;
      }

      if (!drain || claimedInBatch === 0) break;
    }

    await updateAiWorkerHealth({
      status: result.failed > 0 || result.deadLetter > 0 ? "degraded" : "healthy",
      source: "process_ai_queue",
      durationMs: Date.now() - startedAt,
      claimed: result.claimed,
      processed: result.processed,
      failed: result.failed,
      retried: result.retried,
      deadLetter: result.deadLetter,
    });

    return result;
  } catch (error) {
    const classification = classifyAiQueueError(error);
    await updateAiWorkerHealth({
      status: "down",
      source: "process_ai_queue",
      durationMs: Date.now() - startedAt,
      claimed: result.claimed,
      processed: result.processed,
      failed: result.failed + 1,
      retried: result.retried,
      deadLetter: result.deadLetter,
      lastErrorCode: classification.errorCode,
      lastErrorMessage: classification.message,
    });
    throw error;
  }
}

export async function kickAiQueueNow(options?: KickAiQueueNowOptions) {
  const timeoutMs = Math.min(30_000, Math.max(2_000, options?.timeoutMs || 18_000));

  try {
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<ProcessAiQueueResult>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Timeout ao tentar processar fila de IA inline."));
      }, timeoutMs);
    });

    const queuePromise = processAiQueue({
      limit: options?.limit,
      drain: options?.drain,
      maxBatches: options?.maxBatches,
    });

    const result = await Promise.race([queuePromise, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (error) {
    console.error("Erro ao processar fila de IA inline:", error);
    return null;
  }
}

export function triggerAiQueueWorker(options?: { limit?: number; drain?: boolean }) {
  void processAiQueue(options).catch((error) => {
    console.error("Erro no worker assincrono local da fila de IA:", error);
  });

  // Tenta mais de uma vez porque alguns providers/webhooks ainda chegam com consistencia eventual
  // e uma segunda passada curta ajuda a capturar jobs que acabaram de ser gravados.
  for (const delayMs of [1500, 5000]) {
    setTimeout(() => {
      void processAiQueue(options).catch((error) => {
        console.error("Erro no retry local da fila de IA:", error);
      });
    }, delayMs);
  }

  const baseUrl =
    String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const token =
    String(process.env.AI_JOBS_PROCESS_TOKEN || "").trim() ||
    String(process.env.CRON_SECRET || "").trim();

  if (!baseUrl || !token) return;

  const limit = Math.min(100, Math.max(1, options?.limit || DEFAULT_BATCH_LIMIT));
  const drain = options?.drain === true ? "&drain=1" : "";
  const url = `${baseUrl.replace(/\/$/, "")}/api/internal/jobs/ai/process?limit=${limit}${drain}`;

  void fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  }).catch((error) => {
    console.error("Erro ao acionar endpoint interno da fila de IA:", error);
  });
}

export const AI_QUEUE_JOB_TYPE = JOB_TYPE;
