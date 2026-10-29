import test from "node:test";
import assert from "node:assert/strict";
import { buildIncomingChatOperationalPatch, buildOutgoingChatOperationalPatch, buildManualQueuePatch } from "../lib/server/chat-operations.ts";

test("another customer message preserves the unanswered turn deadline, including a breach", () => {
  const dueAt = new Date(Date.now() - 60000);
  const patch = buildIncomingChatOperationalPatch({ status: "open", assignedTo: "seller", lastClientMessageAt: new Date(Date.now() - 20 * 60000), lastAgentMessageAt: new Date(Date.now() - 25 * 60000), slaDueAt: dueAt });
  assert.equal(patch.slaDueAt.getTime(), dueAt.getTime()); assert.equal(patch.queueStatus, "sla_breached");
});
test("a new turn after the seller answered starts a fresh deadline", () => {
  const start = Date.now();
  const patch = buildIncomingChatOperationalPatch({ status: "open", assignedTo: "seller", slaMinutes: 10, lastClientMessageAt: new Date(start - 20000), lastAgentMessageAt: new Date(start - 10000), slaDueAt: new Date(start - 1000) });
  assert.ok(patch.slaDueAt.getTime() >= start + 600000); assert.equal(patch.queueStatus, "assigned_waiting");
});
test("a reopened conversation is open in both its status and queue, without retaining the old breach", () => {
  for (const status of ["resolved", "archived"]) {
    const patch = buildIncomingChatOperationalPatch({ status, assignedTo: "seller", lastClientMessageAt: new Date(), slaDueAt: new Date(1) });
    assert.equal(patch.status, "open"); assert.equal(patch.queueStatus, "assigned_waiting"); assert.ok(patch.slaDueAt.getTime() > Date.now());
  }
});
test("an acknowledged reply clears the waiting queue and ownership changes preserve the actual pending turn", () => {
  assert.equal(buildOutgoingChatOperationalPatch({ assignedTo: "seller" }).queueStatus, "assigned");
  assert.equal(buildManualQueuePatch({ assignedTo: "other", lastClientMessageAt: new Date(), slaDueAt: new Date(1) }).queueStatus, "sla_breached");
});
