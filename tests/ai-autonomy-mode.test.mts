import test from "node:test";
import assert from "node:assert/strict";
import { canAutonomouslyAdvanceCommercialWorkflow } from "../lib/server/ai/operating-layer.ts";

test("only autonomous mode advances commercial workflow without a person", () => {
  assert.equal(canAutonomouslyAdvanceCommercialWorkflow("copilot"), false);
  assert.equal(canAutonomouslyAdvanceCommercialWorkflow("hybrid"), false);
  assert.equal(canAutonomouslyAdvanceCommercialWorkflow("autonomous"), true);
});
