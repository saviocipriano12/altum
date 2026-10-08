import test from "node:test";
import assert from "node:assert/strict";
import { creativePollDelayMs } from "../lib/server/agent-os/creative-poll-delay.ts";

test("polling de mídia começa rápido e reduz pressão gradualmente", () => {
  assert.equal(creativePollDelayMs(0), 15_000);
  assert.equal(creativePollDelayMs(1), 30_000);
  assert.equal(creativePollDelayMs(9), 5 * 60_000);
});
