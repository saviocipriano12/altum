import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AiExecutionAuthority } from "../lib/server/ai/execution-authority.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-execution-authority", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-execution-authority", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { withAiExecutionAuthority, AiExecutionAuthorityError } = await import("../lib/server/ai/execution-authority.ts");
const { commitChatOutboundEnqueue } = await import("../lib/server/chat-outbound-enqueue.ts");
const { createChatOutboundIdentity } = await import("../lib/server/chat-outbound-idempotency.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const { writeScopedChatState } = await import("../lib/server/chat-state-store.ts");
const { matchesConversationCommercialFence } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { enqueueConversationCommercialObservation, processConversationCommercialObservationJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const { queueTenantChatText, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "chat_state", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "chat_outbound_jobs", "chat_outbound_locks"]) {
    assert.ok(tenantId.startsWith("qa_execution_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_execution_${randomUUID()}`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`; tenants.push(tenantId);
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0, source: "qa_authority" });
  const original = adminDb.runTransaction.bind(adminDb); let authority: AiExecutionAuthority | undefined;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (result && typeof result === "object" && "id" in result && result.id === queued.jobId && "originNotAfter" in result) {
      authority = result as AiExecutionAuthority; throw new Error("qa injected interruption after real claim");
    }
    return result;
  });
  try { await processAiJobNow(queued.jobId); } finally { hook.mock.restore(); }
  assert.ok(authority);
  const job = adminDb.collection("jobs").doc(queued.jobId); await job.update({ executionPhase: "executing" });
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: `qa_${randomUUID()}` });
  const input = { tenantId, chatId, identity, fingerprint: "qa_authorized_response", pauseAi: false, stateId: getChatStateDocId(tenantId, chatId),
    actor: { id: "altum_ai", name: "Assistente fictício" }, replyToId: null, preview: "Resposta fictícia",
    build: () => ({ message: { text: "Resposta fictícia" }, job: { kind: "text", origin: "ai", aiSourceMessageId: messageId } }) };
  return { tenantId, chatId, messageId, job, authority, input };
}
test("a current claim admits one durable response without losing authority across awaits", async () => {
  const f = await fixture();
  const accepted = await withAiExecutionAuthority(f.authority, async () => { await Promise.resolve(); return commitChatOutboundEnqueue(f.input); });
  assert.equal(accepted.replayed, false);
  assert.equal((await withAiExecutionAuthority(f.authority, () => commitChatOutboundEnqueue(f.input))).replayed, true);
});
test("a revoked, expired or deleted claim cannot admit a new outbound effect", async () => {
  for (const reason of ["revoked", "expired", "deleted"] as const) {
    const f = await fixture();
    if (reason === "revoked") await f.job.update({ claimToken: "qa_other_claim" });
    else if (reason === "expired") await f.job.update({ lockedAt: new Date(1) });
    else await f.job.delete();
    await assert.rejects(withAiExecutionAuthority(f.authority, () => commitChatOutboundEnqueue(f.input)), AiExecutionAuthorityError);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(f.input.identity.jobId).get()).exists, false);
    assert.equal((await adminDb.collection("messages").doc(f.input.identity.messageId).get()).exists, false);
  }
});
test("revocation between validation and commit rejects the entire outbound batch", async () => {
  const f = await fixture(); let revoked = false;
  await assert.rejects(withAiExecutionAuthority(f.authority, () => commitChatOutboundEnqueue({ ...f.input, beforeCommit: async () => {
    if (!revoked) { revoked = true; await f.job.update({ claimToken: "qa_new_owner" }); }
  } })), AiExecutionAuthorityError);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(f.input.identity.jobId).get()).exists, false);
  assert.equal((await adminDb.collection("messages").doc(f.input.identity.messageId).get()).exists, false);
});
test("revoked authority cannot write late response preferences or handoff metadata", async () => {
  const f = await fixture(); await f.job.update({ status: "reconciliation_required" });
  await assert.rejects(withAiExecutionAuthority(f.authority, () => writeScopedChatState(f.tenantId, f.chatId, { responseFormatPreference: "text" })), AiExecutionAuthorityError);
  assert.equal((await adminDb.collection("chat_state").doc(f.input.stateId).get()).exists, false);
});
test("simultaneous authorities remain isolated and cannot target another conversation", async () => {
  const a = await fixture(), b = await fixture();
  const results = await Promise.all([a, b].map(f => withAiExecutionAuthority(f.authority, async () => { await Promise.resolve(); return commitChatOutboundEnqueue(f.input); })));
  assert.equal(results.every(result => !result.replayed), true);
  const changed = { ...a.input, chatId: b.chatId, tenantId: b.tenantId, identity: createChatOutboundIdentity({ tenantId: b.tenantId, chatId: b.chatId, clientRequestId: `qa_${randomUUID()}` }) };
  await assert.rejects(withAiExecutionAuthority(a.authority, () => commitChatOutboundEnqueue(changed)), AiExecutionAuthorityError);
});
test("a revoked claim cannot mutate CRM through an otherwise valid commercial fence", async () => {
  const f = await fixture(), lead = adminDb.collection("leads").doc(`${f.tenantId}_lead`);
  await lead.set({ tenantId: f.tenantId, nome: "Pessoa fictícia" }); await adminDb.collection("chats").doc(f.chatId).update({ leadId: lead.id });
  const before = await lead.get(), message = await adminDb.collection("messages").doc(f.messageId).get();
  const fence = { tenantId: f.tenantId, chatId: f.chatId, leadId: lead.id, leadGeneration: before.createTime!, chatGeneration: f.authority.chatGeneration,
    contactId: null, contactGeneration: null, messageId: f.messageId, messageVersion: message.updateTime! };
  assert.equal(await withAiExecutionAuthority(f.authority, () => adminDb.runTransaction(tx => matchesConversationCommercialFence(tx, fence), { readOnly: true })), true);
  await f.job.update({ claimToken: "qa_other_claim" });
  await assert.rejects(withAiExecutionAuthority(f.authority, () => adminDb.runTransaction(async tx => {
    if (await matchesConversationCommercialFence(tx, fence)) tx.update(lead, { nome: "Stale worker change" });
  })), AiExecutionAuthorityError);
  assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
});
test("the passive CRM worker keeps its own authority when awakened by a revoked agent", async () => {
  const f = await fixture(), lead = adminDb.collection("leads").doc(`${f.tenantId}_lead`), messageId = `${f.messageId}_human`;
  await lead.set({ tenantId: f.tenantId, nome: "Pessoa fictícia" }); await adminDb.collection("chats").doc(f.chatId).update({ leadId: lead.id });
  await adminDb.collection("messages").doc(messageId).set({ tenantId: f.tenantId, chatId: f.chatId, leadId: lead.id,
    sender: "client", text: "Gostaria de conhecer o produto", createdAt: new Date() });
  const queued = await enqueueConversationCommercialObservation({ tenantId: f.tenantId, chatId: f.chatId, messageId, source: "inbound_message" });
  await f.job.update({ claimToken: "qa_revoked" });
  const result = await withAiExecutionAuthority(f.authority, () => processConversationCommercialObservationJobs({ jobId: queued.jobId, limit: 1 }));
  assert.equal(result.results[0]?.status, "completed");
});
test("an accepted outbox operation executes under its own authorization rather than inheriting a revoked caller", async () => {
  const f = await fixture();
  const accepted = await withAiExecutionAuthority(f.authority, () => queueTenantChatText({ tenantId: f.tenantId, chatId: f.chatId,
    origin: "ai", aiSourceMessageId: f.messageId, text: "Resposta fictícia", actor: f.input.actor, clientRequestId: `qa_${randomUUID()}` }));
  await f.job.update({ status: "reconciliation_required", claimToken: "qa_revoked" });
  await withAiExecutionAuthority(f.authority, () => processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 }));
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.status, "completed");
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
});

test("changing the selected purchase revokes an executing worker before state or outbound admission", async () => {
  const f = await fixture();
  await adminDb.collection("chats").doc(f.chatId).update({ commercialContext: { version: 1, id: `context_${"a".repeat(64)}` } });
  await assert.rejects(withAiExecutionAuthority(f.authority, () => writeScopedChatState(f.tenantId, f.chatId, { responseFormatPreference: "text" })), AiExecutionAuthorityError);
  await assert.rejects(withAiExecutionAuthority(f.authority, () => commitChatOutboundEnqueue(f.input)), AiExecutionAuthorityError);
  assert.equal((await adminDb.collection("chat_state").doc(f.input.stateId).get()).exists, false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(f.input.identity.jobId).get()).exists, false);
});
