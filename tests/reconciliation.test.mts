import assert from "node:assert/strict";
import test from "node:test";
import { executionStatusForReconciliation, shouldPauseMissionAfterReconciliation } from "@/lib/server/agent-os/reconciliation";

test("reconciliation keeps ambiguous work blocked and closes confirmed executions", () => {
  assert.equal(executionStatusForReconciliation("requires_investigation"), "needs_reconciliation");
  assert.equal(executionStatusForReconciliation("confirmed_completed"), "completed");
  assert.equal(executionStatusForReconciliation("confirmed_not_executed"), "cancelled");
});

test("only confirmed non-execution returns an open mission to an explicit resume point", () => {
  assert.equal(shouldPauseMissionAfterReconciliation("confirmed_not_executed", "running"), true);
  assert.equal(shouldPauseMissionAfterReconciliation("confirmed_completed", "running"), false);
  assert.equal(shouldPauseMissionAfterReconciliation("confirmed_not_executed", "completed"), false);
});
