import assert from "node:assert/strict";
import test from "node:test";
import { assertTaskTransition, canTransitionTask, isTaskStatus, taskStatusLabel } from "@/lib/server/agent-os/task-lifecycle";

test("task lifecycle permits normal mission execution", () => {
  assert.equal(canTransitionTask("queued", "ready"), true);
  assert.equal(canTransitionTask("ready", "claimed"), true);
  assert.equal(canTransitionTask("claimed", "running"), true);
  assert.equal(canTransitionTask("running", "waiting_approval"), true);
  assert.equal(canTransitionTask("waiting_approval", "ready"), true);
  assert.equal(canTransitionTask("running", "completed"), true);
});

test("task lifecycle blocks terminal-state resurrection and invalid shortcuts", () => {
  assert.equal(canTransitionTask("completed", "running"), false);
  assert.equal(canTransitionTask("queued", "completed"), false);
  assert.throws(() => assertTaskTransition("completed", "running"), /Transição de tarefa inválida/);
});

test("task lifecycle recognizes only canonical statuses", () => {
  assert.equal(isTaskStatus("retry_scheduled"), true);
  assert.equal(isTaskStatus("whatever"), false);
  assert.equal(taskStatusLabel("waiting_approval"), "Aguardando aprovação");
});
