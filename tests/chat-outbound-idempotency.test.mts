import assert from "node:assert/strict";
import test from "node:test";
import {
  createChatOutboundFingerprint,
  createChatOutboundIdentity,
  normalizeChatOutboundRequestId,
} from "../lib/server/chat-outbound-idempotency.ts";
import { classifyChatOutboundFailure } from "../lib/server/chat-outbound.ts";

test("a mesma requisicao gera a mesma outbox e mensagem", () => {
  const input = { tenantId: "tenant-a", chatId: "chat-a", clientRequestId: "req-12345678" };
  assert.deepEqual(createChatOutboundIdentity(input), createChatOutboundIdentity(input));
});

test("tenant, conversa e requisicao participam da identidade", () => {
  const base = createChatOutboundIdentity({ tenantId: "tenant-a", chatId: "chat-a", clientRequestId: "req-12345678" });
  assert.notEqual(base.jobId, createChatOutboundIdentity({ tenantId: "tenant-b", chatId: "chat-a", clientRequestId: "req-12345678" }).jobId);
  assert.notEqual(base.jobId, createChatOutboundIdentity({ tenantId: "tenant-a", chatId: "chat-b", clientRequestId: "req-12345678" }).jobId);
});

test("ids invalidos sao recusados e fingerprints detectam conteudo alterado", () => {
  assert.throws(() => normalizeChatOutboundRequestId("curto"), /invalido/);
  assert.notEqual(createChatOutboundFingerprint(["texto-a"]), createChatOutboundFingerprint(["texto-b"]));
});

test("retry e automatico apenas antes da tentativa externa", () => {
  assert.equal(classifyChatOutboundFailure({ deliveryAttempted: false, attempt: 1, message: "Firestore temporariamente indisponivel" }).status, "retrying");
  assert.equal(classifyChatOutboundFailure({ deliveryAttempted: false, attempt: 5, message: "Firestore temporariamente indisponivel" }).status, "dead_letter");
  assert.equal(classifyChatOutboundFailure({ deliveryAttempted: false, attempt: 1, message: "Chat nao encontrado" }).status, "dead_letter");
  assert.equal(classifyChatOutboundFailure({ deliveryAttempted: true, attempt: 1, message: "Timeout" }).status, "reconciliation_required");
});
