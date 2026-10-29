import test from "node:test";
import assert from "node:assert/strict";
import { getConversationTurnDocId } from "../lib/server/ai/turn-coordinator.ts";
import { crmObservationIdentity } from "../lib/crm-observation-identity.ts";

for (const [label, first, second] of [
  ["tenant/chat separator boundaries", ["qa_turn", "part_leaf"], ["qa_turn_part", "leaf"]],
  ["distinct punctuation within valid conversation IDs", ["qa_turn", "chat:one"], ["qa_turn", "chat?one"]],
] as const) test(`conversation coordination keeps ${label} independent`, () => {
  assert.ok(crmObservationIdentity({ tenantId: first[0], chatId: first[1], messageId: "qa_message" }));
  assert.ok(crmObservationIdentity({ tenantId: second[0], chatId: second[1], messageId: "qa_message" }));
  assert.notEqual(getConversationTurnDocId(first[0], first[1]), getConversationTurnDocId(second[0], second[1]));
});
