import test from "node:test";
import assert from "node:assert/strict";
import { InboxRecordingGate, acquireInboxRecordingStream } from "../lib/inbox-recording.ts";

test("a pending permission or active recording excludes a second microphone request", () => {
  const gate = new InboxRecordingGate();
  const first = gate.begin()!;
  assert.equal(gate.begin(), null);
  gate.finish(first);
  assert.notEqual(gate.begin(), null);
});

test("cancel invalidates late callbacks even when no recorder exists yet", () => {
  const gate = new InboxRecordingGate();
  const first = gate.begin()!;
  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);
  assert.equal(gate.isLatest(first), false);
});

test("stale completion cannot unlock a newer microphone request", () => {
  const gate = new InboxRecordingGate();
  const first = gate.begin()!; gate.invalidate();
  const second = gate.begin()!;
  gate.finish(first);
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.begin(), null);
});

test("late permission after cancel or unmount stops every returned track", async () => {
  const gate = new InboxRecordingGate();
  const token = gate.begin()!;
  let release!: (stream: { getTracks(): { stop(): void }[] }) => void;
  let stopped = 0;
  const pending = acquireInboxRecordingStream(gate, token, () => new Promise((resolve) => { release = resolve; }));
  gate.invalidate();
  release({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] });
  assert.equal(await pending, null);
  assert.equal(stopped, 2);
});

test("current permission returns its stream without stopping live tracks", async () => {
  const gate = new InboxRecordingGate();
  const token = gate.begin()!;
  let stopped = false;
  const stream = { getTracks: () => [{ stop: () => { stopped = true; } }] };
  assert.equal(await acquireInboxRecordingStream(gate, token, async () => stream), stream);
  assert.equal(stopped, false);
});

test("permission failure is propagated without making the gate accept stale completion", async () => {
  const gate = new InboxRecordingGate();
  const token = gate.begin()!;
  await assert.rejects(acquireInboxRecordingStream(gate, token, async () => { throw new Error("permission denied"); }), /permission denied/);
  gate.finish(token);
  assert.equal(gate.isLatest(token), true);
  const next = gate.begin()!;
  assert.equal(gate.isLatest(token), false);
  assert.equal(gate.isCurrent(next), true);
});
