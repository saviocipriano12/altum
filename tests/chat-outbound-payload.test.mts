import test from "node:test";
import assert from "node:assert/strict";
import { ChatOutboundPayloadError, normalizeOutboundText, normalizeOutboundReplyId } from "../lib/server/chat-outbound-payload.ts";

test("text at the existing limit is preserved including line breaks and Unicode", () => {
  const text = "a".repeat(3994) + "\n🙂fim";
  assert.equal(text.length, 4000);
  assert.equal(normalizeOutboundText(text), text);
  assert.equal(normalizeOutboundText("  Ola\n🙂  "), "Ola\n🙂");
});

test("oversized texts sharing a prefix are rejected instead of silently losing their suffix", () => {
  for (const suffix of ["1", "2", "🙂"]) assert.throws(() => normalizeOutboundText("a".repeat(4000) + suffix), ChatOutboundPayloadError);
  for (const value of [null, undefined, {}, [], 123, false, "", " \n "]) assert.throws(() => normalizeOutboundText(value), ChatOutboundPayloadError);
});

test("reply IDs are optional but never truncated or coerced", () => {
  for (const value of [null, undefined, "", " "]) assert.equal(normalizeOutboundReplyId(value), null);
  assert.equal(normalizeOutboundReplyId("  original-message  "), "original-message");
  assert.equal(normalizeOutboundReplyId("a".repeat(180)), "a".repeat(180));
  for (const value of [false, 0, {}, [], "a".repeat(181), "path/other", "one\ntwo"]) assert.throws(() => normalizeOutboundReplyId(value), ChatOutboundPayloadError);
});
