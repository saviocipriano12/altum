import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlanningRuntimeEvent,
  isPauseRuntimeEvent,
  missionStatusForRuntimeEvent,
} from "@/lib/server/agent-os/runtime-event-lifecycle";

test("planning callbacks never transition the business mission", () => {
  assert.equal(isPlanningRuntimeEvent("plan"), true);
  assert.equal(missionStatusForRuntimeEvent("plan", "mission.completed"), null);
  assert.equal(missionStatusForRuntimeEvent("plan", "mission.failed"), null);
});

test("pause callbacks cannot reopen a paused mission", () => {
  assert.equal(isPauseRuntimeEvent("pause"), true);
  assert.equal(missionStatusForRuntimeEvent("pause", "mission.progress"), null);
  assert.equal(missionStatusForRuntimeEvent("pause", "mission.failed"), null);
});

test("execution callbacks retain the mission lifecycle", () => {
  assert.equal(
    missionStatusForRuntimeEvent("execute", "mission.progress"),
    "running",
  );
  assert.equal(
    missionStatusForRuntimeEvent("execute", "mission.await_approval"),
    "waiting_approval",
  );
  assert.equal(
    missionStatusForRuntimeEvent("execute", "mission.completed"),
    "completed",
  );
  assert.equal(
    missionStatusForRuntimeEvent("execute", "mission.failed"),
    "failed",
  );
  assert.equal(
    missionStatusForRuntimeEvent("execute", "mission.cancelled"),
    "cancelled",
  );
});
