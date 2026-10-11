import test from "node:test";
import assert from "node:assert/strict";
import { CREATIVE_MAX_POLL_AGE_MS, CREATIVE_MAX_POLL_ATTEMPTS, creativeJobPollExpired, creativePollDelayMs } from "../lib/server/agent-os/creative-poll-delay.ts";

test("polling de mídia começa rápido e reduz pressão gradualmente", () => {
  assert.equal(creativePollDelayMs(0), 15_000);
  assert.equal(creativePollDelayMs(1), 30_000);
  assert.equal(creativePollDelayMs(9), 5 * 60_000);
});

test("job pendente expira por idade ou por número máximo de consultas", () => {
  const now = Date.now();
  assert.equal(creativeJobPollExpired({ pollAttempts: CREATIVE_MAX_POLL_ATTEMPTS, submittedAt: now, now }), true);
  assert.equal(creativeJobPollExpired({ pollAttempts: 2, submittedAt: now - CREATIVE_MAX_POLL_AGE_MS, now }), true);
  assert.equal(creativeJobPollExpired({ pollAttempts: 2, submittedAt: now - CREATIVE_MAX_POLL_AGE_MS + 1, now }), false);
});
