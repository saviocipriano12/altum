import test from "node:test";
import assert from "node:assert/strict";
import { prepareInboxMediaAttempt, clearAcknowledgedMediaCaption } from "../lib/inbox-upload.ts";

test("first media attempt normalizes wire caption but retains exact composer text", () => {
  const files = [{ id: "one", file: { name: "qa.pdf" } }];
  const result = prepareInboxMediaAttempt(files, "one", { caption: "  Proposta\n🙂  ", replyToId: "reply-one", composerText: "  Proposta\n🙂  " });
  assert.ok(result);
  assert.deepEqual(result.attempt, { caption: "Proposta\n🙂", replyToId: "reply-one", composerText: "  Proposta\n🙂  " });
  assert.equal(Object.isFrozen(result.attempt), true);
  assert.equal(result.files[0].file, files[0].file);
  assert.notEqual(result.files, files);
  assert.equal("attempt" in files[0], false);
});

test("uncertain retry keeps original caption/reply despite a new draft and reply selection", () => {
  const first = prepareInboxMediaAttempt([{ id: "one" }], "one", { caption: "Original", replyToId: "reply-one", composerText: "Original" })!;
  const retry = prepareInboxMediaAttempt(first.files, "one", { caption: "Texto novo", replyToId: "reply-two", composerText: "Texto novo" })!;
  assert.equal(retry.attempt, first.attempt);
  assert.equal(retry.files, first.files);
  assert.equal(clearAcknowledgedMediaCaption("Texto novo", retry.attempt.composerText!), "Texto novo");
});

test("acknowledged retry clears only its original exact composer draft", () => {
  const first = prepareInboxMediaAttempt([{ id: "one" }], "one", { caption: "Original", replyToId: null, composerText: " Original " })!;
  const retry = prepareInboxMediaAttempt(first.files, "one", { caption: "changed", replyToId: "changed" })!;
  assert.equal(clearAcknowledgedMediaCaption(" Original ", retry.attempt.composerText!), "");
});

test("a removed file or another conversation queue cannot create a ghost attempt", () => {
  assert.equal(prepareInboxMediaAttempt([], "removed", { caption: "private", replyToId: null }), null);
  assert.equal(prepareInboxMediaAttempt([{ id: "other" }], "one", { caption: "private", replyToId: null }), null);
});

test("each file owns its attempt without changing another file in the batch", () => {
  const untouched = { id: "two" };
  const first = prepareInboxMediaAttempt([{ id: "one" }, untouched], "one", { caption: "first only", replyToId: null, composerText: "first only" })!;
  assert.equal(first.files[1], untouched);
  const second = prepareInboxMediaAttempt(first.files, "two", { caption: "", replyToId: null })!;
  assert.equal(second.files[0], first.files[0]);
  assert.deepEqual(second.attempt, { caption: "", replyToId: null, composerText: null });
});

test("remaining file in a partially delivered batch cannot inherit a new first-file caption", () => {
  const original = prepareInboxMediaAttempt([{ id: "remaining" }], "remaining", { caption: "", replyToId: "original-reply" })!;
  const retry = prepareInboxMediaAttempt(original.files, "remaining", { caption: "Novo texto", replyToId: null, composerText: "Novo texto" })!;
  assert.equal(retry.attempt.caption, "");
  assert.equal(retry.attempt.replyToId, "original-reply");
  assert.equal(retry.attempt.composerText, null);
});

test("recorded audio retry does not consume or attach the text composer draft", () => {
  const audio = prepareInboxMediaAttempt([{ id: "audio" }], "audio", { caption: "", replyToId: "original-reply" })!;
  const retry = prepareInboxMediaAttempt(audio.files, "audio", { caption: "should not attach", replyToId: null, composerText: "keep this draft" })!;
  assert.deepEqual(retry.attempt, { caption: "", replyToId: "original-reply", composerText: null });
});
