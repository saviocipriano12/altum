import { z } from "zod";

/**
 * A task is the planned unit of work. An execution is one immutable attempt
 * to deliver that work through a runtime. Keeping them separate makes retry,
 * reconciliation and evidence possible without rewriting the task history.
 */
export const TASK_EXECUTION_STATUSES = [
  "not_configured",
  "queued",
  "claimed",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
  "needs_reconciliation",
] as const;

export type TaskExecutionStatus = (typeof TASK_EXECUTION_STATUSES)[number];

// A private runtime renews this lease whenever it reports progress. It is long
// enough for ordinary model/tool latency but finite so a crashed worker never
// owns an execution indefinitely.
export const EXECUTION_LEASE_MS = 15 * 60 * 1_000;

export function executionLeaseExpiresAt(now = Date.now()) {
  return new Date(now + EXECUTION_LEASE_MS);
}

export function isExecutionLeaseExpired(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object" || !("toMillis" in value) || typeof (value as { toMillis?: unknown }).toMillis !== "function") {
    return true;
  }
  return (value as { toMillis: () => number }).toMillis() <= now;
}

export const taskExecutionSchema = z.object({
  dispatchId: z.string().min(1).max(180),
  missionId: z.string().min(1).max(180),
  tenantId: z.string().min(1).max(180),
  taskId: z.string().min(1).max(180).nullable(),
  runtime: z.string().min(1).max(80),
  status: z.enum(TASK_EXECUTION_STATUSES),
  attempt: z.number().int().min(1),
  agentCandidateId: z.string().min(1).max(160).nullable(),
});

export function isTaskExecutionStatus(value: unknown): value is TaskExecutionStatus {
  return typeof value === "string" && (TASK_EXECUTION_STATUSES as readonly string[]).includes(value);
}

export function taskExecutionStatusForRuntimeEvent(type: string): TaskExecutionStatus {
  if (type === "mission.await_approval") return "waiting_approval";
  if (type === "mission.completed") return "completed";
  if (type === "mission.failed") return "failed";
  if (type === "mission.cancelled") return "cancelled";
  return "running";
}
