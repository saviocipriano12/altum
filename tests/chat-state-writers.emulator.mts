import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-state-writers", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-state-writers", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { commitChatOutboundEnqueue } = await import("../lib/server/chat-outbound-enqueue.ts");
const { createChatOutboundIdentity } = await import("../lib/server/chat-outbound-idempotency.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const { commitHumanChatControl, writeScopedChatState } = await import("../lib/server/chat-state-store.ts");
const { deleteTenantChat, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "chat_state", "messages", "chat_outbound_jobs", "chat_outbound_locks", "tenant_trash", "deletion_audits"]) {
    assert.ok(tenantId.startsWith("qa_state_writers_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_state_writers_${randomUUID()}`, chatId = "qa_chat", foreignTenant = `${tenantId}_qa`, foreignChat = "chat";
  tenants.push(tenantId, foreignTenant);
  assert.equal(getChatStateDocId(tenantId, chatId), getChatStateDocId(foreignTenant, foreignChat));
  const chat = adminDb.collection("chats").doc(chatId);
  await chat.set({ tenantId, channel: "site_chat" });
  await adminDb.collection("chats").doc(foreignChat).set({ tenantId: foreignTenant, channel: "site_chat" });
  const stateId = getChatStateDocId(tenantId, chatId), state = adminDb.collection("chat_state").doc(stateId);
  const foreign = { tenantId: foreignTenant, chatId: foreignChat, aiEnabled: false, humanOwnerUserId: "qa_other_human" };
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: `qa_${randomUUID()}` });
  const input = { tenantId, chatId, identity, fingerprint: "qa_fingerprint", stateId, actor: { id: "qa_human", name: "Pessoa fictícia" }, replyToId: null, preview: "Resposta fictícia", build: () => ({ message: { text: "Resposta fictícia" }, job: { type: "text" } }) };
  return { tenantId, chatId, foreignTenant, foreignChat, chat, state, foreign, input };
}
test("human enqueue refuses a foreign legacy state before creating a message or job", async () => {
  const f = await fixture(); await f.state.set(f.foreign); const before = await f.state.get(), chatBefore = await f.chat.get();
  await assert.rejects(commitChatOutboundEnqueue(f.input), error => error instanceof Error && "code" in error && error.code === "chat_state_identity_conflict");
  assert.ok((await f.state.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await f.chat.get()).updateTime!.isEqual(chatBefore.updateTime!));
  assert.equal((await adminDb.collection("messages").doc(f.input.identity.messageId).get()).exists, false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(f.input.identity.jobId).get()).exists, false);
});
test("a state created by another owner during enqueue rejects the whole batch", async () => {
  const f = await fixture(); let injected = false;
  await assert.rejects(commitChatOutboundEnqueue({ ...f.input, beforeCommit: async () => { if (!injected) { injected = true; await f.state.set(f.foreign); } } }), error => error instanceof Error && "code" in error && error.code === "chat_state_identity_conflict");
  assert.deepEqual((await f.state.get()).data(), f.foreign);
  assert.equal((await adminDb.collection("messages").doc(f.input.identity.messageId).get()).exists, false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(f.input.identity.jobId).get()).exists, false);
});
test("valid human enqueue pauses its own conversation and replay preserves a subsequent human decision", async () => {
  const f = await fixture(); await f.state.set({ tenantId: f.tenantId, chatId: f.chatId, aiEnabled: true });
  const first = await commitChatOutboundEnqueue(f.input); assert.equal(first.replayed, false);
  assert.equal((await f.state.get()).data()?.humanOwnerUserId, "qa_human");
  await f.state.update({ aiEnabled: true, humanOwnerUserId: null }); const resumed = await f.state.get();
  assert.equal((await commitChatOutboundEnqueue(f.input)).replayed, true);
  assert.ok((await f.state.get()).updateTime!.isEqual(resumed.updateTime!));
});
test("deleting and restoring a chat never archives or deletes another owner's colliding state", async () => {
  const f = await fixture(); await f.state.set(f.foreign); const before = await f.state.get();
  const removed = await deleteTenantChat({ tenantId: f.tenantId, chatId: f.chatId }); assert.ok(removed.trashId);
  assert.ok((await f.state.get()).updateTime?.isEqual(before.updateTime!));
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId! });
  assert.ok((await f.state.get()).updateTime?.isEqual(before.updateTime!));
  assert.deepEqual((await f.state.get()).data(), f.foreign);
});
test("human pause and resume refuse foreign state without changing assignment or emitting a system message", async () => {
  const f = await fixture(); await f.state.set(f.foreign); const before = await f.state.get(), chatBefore = await f.chat.get();
  for (const action of ["pause", "takeover", "resume"] as const) {
    await assert.rejects(commitHumanChatControl({ tenantId: f.tenantId, chatId: f.chatId, expectedChatGeneration: chatBefore.createTime!, action,
      actor: f.input.actor, owner: f.input.actor, pausedUntil: new Date(Date.now() + 60_000) }), error => error instanceof Error && "code" in error && error.code === "chat_state_identity_conflict");
  }
  assert.ok((await f.state.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await f.chat.get()).updateTime!.isEqual(chatBefore.updateTime!));
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", f.tenantId).get()).size, 0);
});
test("takeover and resume commit coherent human state and system history", async () => {
  const f = await fixture(), before = await f.chat.get();
  const input = { tenantId: f.tenantId, chatId: f.chatId, expectedChatGeneration: before.createTime!, actor: f.input.actor, owner: f.input.actor, pausedUntil: new Date(Date.now() + 60_000) };
  await commitHumanChatControl({ ...input, action: "takeover" });
  assert.equal((await f.state.get()).data()?.humanOwnerUserId, f.input.actor.id);
  assert.equal((await f.state.get()).data()?.aiEnabled, false);
  assert.equal((await f.chat.get()).data()?.assignedTo, f.input.actor.id);
  await commitHumanChatControl({ ...input, action: "resume", pausedUntil: null });
  assert.equal((await f.state.get()).data()?.aiEnabled, true);
  assert.equal((await f.state.get()).data()?.humanOwnerUserId, null);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", f.tenantId).where("sender", "==", "system").get()).size, 2);
});
test("late agent metadata and human decisions cannot mutate a recreated conversation", async () => {
  const f = await fixture(), before = await f.chat.get(); await f.chat.delete(); await f.chat.set({ tenantId: f.tenantId, channel: "site_chat" });
  await assert.rejects(writeScopedChatState(f.tenantId, f.chatId, { responseFormatPreference: "text" }, { expectedChatGeneration: before.createTime! }), error => error instanceof Error && "code" in error && error.code === "chat_state_context_changed");
  await assert.rejects(commitHumanChatControl({ tenantId: f.tenantId, chatId: f.chatId, expectedChatGeneration: before.createTime!, action: "resume",
    actor: f.input.actor, owner: f.input.actor, pausedUntil: null }), error => error instanceof Error && "code" in error && error.code === "chat_state_context_changed");
  assert.equal((await f.state.get()).exists, false);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", f.tenantId).get()).size, 0);
});
