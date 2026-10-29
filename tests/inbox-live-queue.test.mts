import test from "node:test";
import assert from "node:assert/strict";
import { createInboxLiveQueue } from "../lib/inbox-live-queue.ts";
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("two messages arrive while a slower conversation-list request is still pending", async () => {
  let finishList!: () => void, listStarted = false;
  const list = new Promise<void>(resolve => { finishList = resolve; });
  const received: string[] = [];
  const queue = createInboxLiveQueue({ delayMs: 5, messages: async ids => { received.push(...ids); }, chats: async () => { listStarted = true; await list; }, failed: () => assert.fail("unexpected") });
  try {
    queue.chats(); queue.messages(["first"]); await pause(30);
    assert.ok(listStarted); queue.messages(["second"]); await pause(30);
    assert.deepEqual(received, ["first", "second"]);
  } finally { finishList(); queue.stop(); }
});
test("events arriving during an HTTP request are delivered afterwards without loss", async () => {
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; }); const batches: string[][] = [];
  const queue = createInboxLiveQueue({ delayMs: 5, messages: async ids => { batches.push(ids); if (batches.length === 1) await pending; }, chats: async () => {}, failed: () => {} });
  try {
    queue.messages(["first"]); await pause(25); queue.messages(["second", "second"]); await pause(25);
    finish(); await pause(35); assert.deepEqual(batches, [["first"], ["second"]]);
  } finally { finish(); queue.stop(); }
});
test("disconnect cancels queued callbacks", async () => {
  const queue = createInboxLiveQueue({ delayMs: 5, messages: async () => assert.fail("cancelled"), chats: async () => assert.fail("cancelled"), failed: () => {} });
  queue.messages(["private"]); queue.chats(); queue.stop(); await pause(25);
});
