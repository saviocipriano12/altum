import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createChatOutboundIdentity, normalizeChatOutboundRequestId, ChatOutboundRequestIdError } from "../lib/server/chat-outbound-idempotency.ts";

test("oversized keys sharing the valid 180-character prefix are rejected, never aliased", () => {
  const prefix = "a".repeat(180);
  assert.equal(normalizeChatOutboundRequestId(prefix), prefix);
  for (const value of [prefix + "1", prefix + "2", "x".repeat(10000)]) assert.throws(() => normalizeChatOutboundRequestId(value), ChatOutboundRequestIdError);
  const base = { tenantId: "tenant-a", chatId: "chat-a" };
  assert.notEqual(createChatOutboundIdentity({ ...base, clientRequestId: prefix }).jobId,
    createChatOutboundIdentity({ ...base, clientRequestId: "a".repeat(179) + "b" }).jobId);
});

test("runtime malformed values never fall back to a new random operation", () => {
  for (const value of [12, false, {}, [], new Blob(["request-1234"]), "short", "request/12345", "request\n12345", "request-🙂-1234"]) {
    assert.throws(() => normalizeChatOutboundRequestId(value), ChatOutboundRequestIdError);
  }
});

test("valid legacy keys retain exact identity and omitted keys remain unique", () => {
  assert.equal(normalizeChatOutboundRequestId("  req-12345678  "), "req-12345678");
  assert.equal(normalizeChatOutboundRequestId("12345678"), "12345678");
  const values = [undefined, null, "", "  "].map((value) => normalizeChatOutboundRequestId(value));
  assert.equal(new Set(values).size, 4);
  assert.ok(values.every((value) => /^[a-f0-9-]{36}$/.test(value)));
  assert.equal(createChatOutboundIdentity({ tenantId: "tenant", chatId: "chat", clientRequestId: "req-12345678" }).jobId,
    createChatOutboundIdentity({ tenantId: "tenant", chatId: "chat", clientRequestId: " req-12345678 " }).jobId);
});

test("route source contracts preserve invalid-key handling without truncating form/JSON keys", async () => {
  for (const route of ["send", "send-media", "send-stored-media"]) {
    const source = await readFile(`app/api/tenant/[tenantId]/chats/[chatId]/${route}/route.ts`, "utf8");
    assert.match(source, /error instanceof ChatOutboundRequestIdError/);
    assert.doesNotMatch(source, /clientRequestId:\s*clean\(/);
    if (route !== "send") assert.match(source, /const clientRequestId = normalizeChatOutboundRequestId\(/);
  }
});
