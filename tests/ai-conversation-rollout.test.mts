import assert from "node:assert/strict";
import test from "node:test";
import {
  aiConversationRolloutBucket,
  decideAiConversationRollout,
  normalizeAiConversationRollout,
  isAiConversationInTestScope,
} from "../lib/ai-conversation-rollout.ts";

test("conversation rollout preserves the live behavior by default", () => {
  const rollout = normalizeAiConversationRollout(undefined);
  assert.deepEqual(rollout, { mode: "automatic", agentVersion: "conversation-v1", rolloutPercent: 100 });
  assert.equal(decideAiConversationRollout({ rollout, tenantId: "t", chatId: "c" }).shouldRespond, true);
});

test("exclusive test matches full tenant and chat, never a phone suffix", () => {
  const rollout = normalizeAiConversationRollout({ exclusiveTest: { tenantId: "lf", chatIds: ["whatsapp_lf_channel_553184537782"] } });
  const decide = (tenantId: string, chatId: string) => decideAiConversationRollout({ rollout, tenantId, chatId });
  assert.equal(decide("lf", "whatsapp_lf_channel_553184537782").shouldRespond, true);
  for (const id of ["7782", "whatsapp_lf_channel_552799997782", "whatsapp_lf_other_553184537782", "whatsapp_lf_channel_5527996133050"]) {
    assert.equal(decide("lf", id).reason, "outside_test_scope");
  }
  assert.equal(decide("another", "whatsapp_lf_channel_553184537782").reason, "outside_test_scope");
});

test("malformed or empty exclusive scope holds all chats instead of releasing them", () => {
  for (const exclusiveTest of [null, {}, { tenantId: "lf", chatIds: [] }, { tenantId: "lf", chatIds: ["*"] }]) {
    const rollout = normalizeAiConversationRollout({ exclusiveTest });
    assert.equal(isAiConversationInTestScope({ rollout, tenantId: "lf", chatId: "any" }), false);
  }
});

test("exclusive test does not override shadow or percentage pause and has no timed auto-release", () => {
  const exclusiveTest = { tenantId: "lf", chatIds: ["owner"] };
  assert.equal(decideAiConversationRollout({ rollout: normalizeAiConversationRollout({ exclusiveTest, mode: "shadow" }), tenantId: "lf", chatId: "owner" }).reason, "shadow_only");
  assert.equal(decideAiConversationRollout({ rollout: normalizeAiConversationRollout({ exclusiveTest, rolloutPercent: 0 }), tenantId: "lf", chatId: "owner" }).shouldRespond, false);
  assert.equal(decideAiConversationRollout({ rollout: normalizeAiConversationRollout({ exclusiveTest, mode: "shadow" }), tenantId: "lf", chatId: "customer" }).reason, "outside_test_scope");
});

test("test scope must be deliberately removed to restore the normal policy", () => {
  const rollout = normalizeAiConversationRollout({ rolloutPercent: 100 });
  assert.equal(decideAiConversationRollout({ rollout, tenantId: "lf", chatId: "customer" }).shouldRespond, true);
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
