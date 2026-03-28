import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { handleIncomingMessage } from "@/lib/server/ai/agent";

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
};

type ClaimedJob = {
  id: string;
  tenantId: string;
  chatId: string;
  messageId: string;
  attempts: number;
  maxAttempts: number;
};

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
}) {
  const metricRef = adminDb
    .collection("metrics")
    .doc(`${sanitizeId(input.tenantId, 120)}_ai_queue_${getTodayKey()}`);

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

  await metricRef.set(
    {
      tenantId: input.tenantId,
      type: "ai_queue_daily",
      dateRef: getTodayKey(),
      counters,
      decisions,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
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

async function finalizeSuccessfulJob(job: ClaimedJob, decision: "respond" | "ask_more" | "handoff" | "skip", reason: string) {
  const jobRef = adminDb.collection("jobs").doc(job.id);
  await Promise.all([
    jobRef.set(
      {
        status: "done",
        decision,
        decisionReason: reason,
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
    }),
  ]);
}

async function finalizeFailedJob(job: ClaimedJob, error: unknown) {
  const message =
    error instanceof Error ? error.message.slice(0, 400) : "Erro desconhecido ao processar job de IA.";

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
    }),
  ]);
}

async function processOneClaimedJob(job: ClaimedJob) {
  try {
    const result = await handleIncomingMessage({
      tenantId: job.tenantId,
      chatId: job.chatId,
      messageId: job.messageId,
    });

    await finalizeSuccessfulJob(job, result.decision, result.reason);

    return {
      ok: true,
      retried: false,
      deadLetter: false,
      skipped: result.decision === "skip",
    };
  } catch (error) {
    await finalizeFailedJob(job, error);
    console.error("Erro ao processar job de IA:", {
      jobId: job.id,
      tenantId: job.tenantId,
      chatId: job.chatId,
      messageId: job.messageId,
      error,
    });

    return {
      ok: false,
      retried: job.attempts < job.maxAttempts,
      deadLetter: job.attempts >= job.maxAttempts,
      skipped: false,
    };
  }
}

export async function processAiQueue(options?: {
  limit?: number;
  drain?: boolean;
  maxBatches?: number;
}): Promise<ProcessAiQueueResult> {
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

  return result;
}

export function triggerAiQueueWorker(options?: { limit?: number; drain?: boolean }) {
  void processAiQueue(options).catch((error) => {
    console.error("Erro no worker assincrono local da fila de IA:", error);
  });

  const baseUrl =
    String(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const token = String(process.env.AI_JOBS_PROCESS_TOKEN || "").trim();

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
