import assert from "node:assert/strict";
import test from "node:test";
import {
  assertMissionTransition,
  canTransitionMission,
  isMissionStatus,
} from "@/lib/server/agent-os/mission-lifecycle";

test("mission lifecycle permits operational transitions", () => {
  assert.equal(canTransitionMission("planned", "running"), true);
  assert.equal(canTransitionMission("waiting_approval", "running"), true);
  assert.equal(canTransitionMission("failed", "running"), true);
});

test("mission lifecycle blocks terminal-state resurrection", () => {
  assert.equal(canTransitionMission("completed", "running"), false);
  assert.equal(canTransitionMission("cancelled", "paused"), false);
  assert.throws(() => assertMissionTransition("completed", "running"));
  assert.equal(isMissionStatus("waiting_approval"), true);
  assert.equal(isMissionStatus("not_a_status"), false);
});
