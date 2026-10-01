import assert from "node:assert/strict";
import test from "node:test";
import {
  getConversationTurnDocId,
  isSupersededConversationTurn,
  resolveConversationDebounceMs,
} from "../lib/server/ai/turn-coordinator.ts";

test("conversation debounce gives the customer time to finish a short turn", () => {
  assert.equal(resolveConversationDebounceMs(), 3_500);
  assert.equal(resolveConversationDebounceMs({ configuredMs: "5200" }), 5_200);
  assert.equal(resolveConversationDebounceMs({ configuredMs: 99_000 }), 15_000);
});

test("manual retries are immediate", () => {
  assert.equal(resolveConversationDebounceMs({ source: "manual_retry" }), 0);
  assert.equal(resolveConversationDebounceMs({ source: "resume_pending" }), 0);
});

test("only the latest inbound message represents the current conversation turn", () => {
  assert.equal(isSupersededConversationTurn({ jobMessageId: "m1", latestMessageId: "m2" }), true);
  assert.equal(isSupersededConversationTurn({ jobMessageId: "m2", latestMessageId: "m2" }), false);
});

test("conversation coordinator ids are stable and firestore-safe", () => {
  assert.equal(getConversationTurnDocId("tenant/1", "chat 2"), "tenant_1_chat_2");
});
