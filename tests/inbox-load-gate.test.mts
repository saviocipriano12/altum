import test from "node:test";
import assert from "node:assert/strict";
import { InboxLoadGate, shouldLoadInboxIncrementally } from "../lib/inbox-load-gate.ts";

test("recovery and post-send refresh preserve already paginated history by default", () => {
  assert.equal(shouldLoadInboxIncrementally(220, "newest"), true);
  assert.equal(shouldLoadInboxIncrementally(220, "newest", true), true);
});

test("polling after an initial failure must load the initial pagination metadata", () => {
  assert.equal(shouldLoadInboxIncrementally(0, null, true), false);
  assert.equal(shouldLoadInboxIncrementally(0, "stale-cursor", true), false);
  assert.equal(shouldLoadInboxIncrementally(100, null, true), false);
});

test("an explicit complete reload still replaces history", () => {
  assert.equal(shouldLoadInboxIncrementally(220, "newest", false), false);
});

test("polling cannot supersede the initial pending load of the same conversation", () => {
  const gate = new InboxLoadGate();
  const initial = gate.begin("tenant", "chat");
  assert.notEqual(initial, null);
  for (let tick = 0; tick < 5; tick++) assert.equal(gate.begin("tenant", "chat"), null);
  gate.finish(initial!);
  assert.notEqual(gate.begin("tenant", "chat"), null);
});
test("switching tenant or chat starts immediately despite a previous pending request", () => {
  const gate = new InboxLoadGate();
  const first = gate.begin("tenant", "one");
  const second = gate.begin("tenant", "two");
  assert.notEqual(second, null);
  gate.finish(first!);
  assert.equal(gate.begin("tenant", "two"), null);
  assert.notEqual(gate.begin("other-tenant", "two"), null);
});
test("a stale completion cannot release the current scope even after returning to the original chat", () => {
  const gate = new InboxLoadGate();
  const first = gate.begin("tenant", "one");
  const second = gate.begin("tenant", "two");
  const returned = gate.begin("tenant", "one");
  gate.finish(first!); gate.finish(second!);
  assert.equal(gate.begin("tenant", "one"), null);
  gate.finish(returned!);
  assert.notEqual(gate.begin("tenant", "one"), null);
});
test("effect reinitialization releases a discarded load without letting its completion release the replacement", () => {
  const gate = new InboxLoadGate();
  const discarded = gate.begin("tenant", "one");
  gate.invalidate();
  const replacement = gate.begin("tenant", "one");
  assert.notEqual(replacement, null);
  gate.finish(discarded!);
  assert.equal(gate.begin("tenant", "one"), null);
});
