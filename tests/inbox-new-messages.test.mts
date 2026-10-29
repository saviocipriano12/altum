import test from "node:test";
import assert from "node:assert/strict";
import { collectInboxNewMessageIds } from "../lib/inbox-new-messages.ts";

test("newer pages count unique additions without counting status edits or repeated pages", () => {
  const pending = collectInboxNewMessageIds(["a", "b"], ["b", "c", "c", "d"], [], false);
  assert.deepEqual(pending, ["c", "d"]);
  assert.deepEqual(collectInboxNewMessageIds(["a", "b", "c", "d"], ["c", "d"], pending, false), pending);
});

test("bursts accumulate while reading history and empty polls preserve the notice", () => {
  const pending = collectInboxNewMessageIds(["a"], ["b"], [], false);
  assert.deepEqual(collectInboxNewMessageIds(["a", "b"], ["c"], pending, false), ["b", "c"]);
  assert.deepEqual(collectInboxNewMessageIds(["a", "b"], [], pending, false), ["b"]);
});

test("following the latest messages clears pending arrivals instead of showing a redundant notice", () => {
  assert.deepEqual(collectInboxNewMessageIds(["a"], ["b"], ["previous"], true), []);
});

test("an empty baseline does not count existing messages or invalid IDs as new", () => {
  assert.deepEqual(collectInboxNewMessageIds(["same-id"], ["same-id"], [], false), []);
  assert.deepEqual(collectInboxNewMessageIds(["a"], ["", "b"], [], false), ["b"]);
});
