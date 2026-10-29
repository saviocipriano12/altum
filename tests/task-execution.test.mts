import assert from "node:assert/strict";
import test from "node:test";
import { EXECUTION_LEASE_MS, executionLeaseExpiresAt, isExecutionLeaseExpired, taskExecutionSchema, taskExecutionStatusForRuntimeEvent } from "@/lib/server/agent-os/task-execution";

test("execution records preserve one attempt separately from the task", () => {
  const record = taskExecutionSchema.parse({
    dispatchId: "dispatch-1", missionId: "mission-1", tenantId: "tenant-1", taskId: "task-1",
    runtime: "openclaw", status: "queued", attempt: 1, agentCandidateId: "market-research-synthesist",
  });
  assert.equal(record.taskId, "task-1");
  assert.equal(record.attempt, 1);
});

test("runtime terminal events map to terminal execution states", () => {
  assert.equal(taskExecutionStatusForRuntimeEvent("mission.progress"), "running");
  assert.equal(taskExecutionStatusForRuntimeEvent("mission.await_approval"), "waiting_approval");
  assert.equal(taskExecutionStatusForRuntimeEvent("mission.completed"), "completed");
  assert.equal(taskExecutionStatusForRuntimeEvent("mission.failed"), "failed");
});

test("execution lease expires only after its bounded renewal window", () => {
  const now = 1_800_000_000_000;
  const lease = executionLeaseExpiresAt(now);
  assert.equal(lease.getTime(), now + EXECUTION_LEASE_MS);
  assert.equal(isExecutionLeaseExpired({ toMillis: () => lease.getTime() }, lease.getTime() - 1), false);
  assert.equal(isExecutionLeaseExpired({ toMillis: () => lease.getTime() }, lease.getTime()), true);
});
