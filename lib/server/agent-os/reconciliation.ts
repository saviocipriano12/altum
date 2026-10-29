import type { TaskExecutionStatus } from "@/lib/server/agent-os/task-execution";

export type ReconciliationDecision = "confirmed_completed" | "confirmed_not_executed" | "requires_investigation";

export function executionStatusForReconciliation(decision: ReconciliationDecision): TaskExecutionStatus {
  if (decision === "confirmed_completed") return "completed";
  if (decision === "confirmed_not_executed") return "cancelled";
  return "needs_reconciliation";
}

export function shouldPauseMissionAfterReconciliation(decision: ReconciliationDecision, missionStatus: string) {
  return decision === "confirmed_not_executed" && !["completed", "cancelled"].includes(missionStatus);
}
