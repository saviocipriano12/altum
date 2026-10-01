import assert from "node:assert/strict";
import test from "node:test";
import {
  aiConversationRolloutBucket,
  decideAiConversationRollout,
  normalizeAiConversationRollout,
} from "../lib/ai-conversation-rollout.ts";

test("conversation rollout preserves the live behavior by default", () => {
  const rollout = normalizeAiConversationRollout(undefined);
  assert.deepEqual(rollout, { mode: "automatic", agentVersion: "conversation-v1", rolloutPercent: 100 });
  assert.equal(decideAiConversationRollout({ rollout, tenantId: "t", chatId: "c" }).shouldRespond, true);
});

test("conversation rollout is stable per chat and can be stopped immediately", () => {
  const first = aiConversationRolloutBucket("tenant:chat");
  assert.equal(first, aiConversationRolloutBucket("tenant:chat"));
  const stopped = decideAiConversationRollout({
    rollout: normalizeAiConversationRollout({ rolloutPercent: 0, agentVersion: "conversation-v2" }),
    tenantId: "tenant",
    chatId: "chat",
  });
  assert.equal(stopped.shouldRespond, false);
  assert.equal(stopped.reason, "outside_rollout");
  assert.equal(stopped.assignedVersion, "conversation-v2");
});

test("shadow evaluates no customer-facing response", () => {
  const result = decideAiConversationRollout({
    rollout: normalizeAiConversationRollout({ mode: "shadow", rolloutPercent: 100 }),
    tenantId: "tenant",
    chatId: "chat",
  });
  assert.equal(result.shouldRespond, false);
  assert.equal(result.reason, "shadow_only");
});
