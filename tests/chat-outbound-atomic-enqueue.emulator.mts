import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatText: enqueue } = await import("../lib/server/chat-outbound.ts");
const { chatOutboundEnqueueLockId } = await import("../lib/server/chat-outbound-enqueue.ts");
const { createChatOutboundIdentity } = await import("../lib/server/chat-outbound-idempotency.ts");
const tenantId = `qa_atomic_enqueue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const actor = { id: "qa-owner", name: "Operador fictício" };
async function fixture(key: string) {
  const chatId = `${tenantId}_${key}`;
  const chatRef = adminDb.collection("chats").doc(chatId);
  await chatRef.set({ tenantId, channel: "whatsapp" });
  const input = { tenantId, chatId, actor, text: "Mensagem fictícia", clientRequestId: `atomic-request-${key}-0001` };
  const identity = createChatOutboundIdentity(input);
  return { input, chatRef, identity };
}
async function assertAbsent(identity: ReturnType<typeof createChatOutboundIdentity>) {
  assert.equal((await adminDb.collection("messages").doc(identity.messageId).get()).exists, false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get()).exists, false);
}
function interceptFirstCommit(callback: (commit: () => Promise<unknown>) => Promise<unknown>) {
  const original = adminDb.batch.bind(adminDb);
  let intercepted = false;
  return mock.method(adminDb, "batch", () => {
    const batch = original();
    if (!intercepted) {
      intercepted = true;
      const commit = batch.commit.bind(batch);
      mock.method(batch, "commit", () => callback(commit));
    }
    return batch;
  });
}
after(async () => {
  mock.restoreAll();
  for (const collection of ["chats", "messages", "chat_outbound_jobs", "chat_state", "chat_outbound_locks"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("stale chat version rejects every write and retries with the winning predecessor", async () => {
  const { input, chatRef, identity } = await fixture("cas");
  let winnerJobId = "";
  let rejectedAtomically = false;
  const originalBatch = adminDb.batch.bind(adminDb);
  const interceptor = interceptFirstCommit(async (commit) => {
    // An older deployment does not know about the new lease; the version guard
    // must still protect rolling-deploy coexistence, not merely cooperative writers.
    const winner = createChatOutboundIdentity({ ...input, clientRequestId: "atomic-winning-request-0001" });
    winnerJobId = winner.jobId;
    const legacy = originalBatch();
    legacy.create(adminDb.collection("chat_outbound_jobs").doc(winner.jobId), { tenantId, chatId: input.chatId, sequence: 1, predecessorJobId: null });
    legacy.create(adminDb.collection("messages").doc(winner.messageId), { tenantId, chatId: input.chatId, text: "Legado" });
    legacy.update(chatRef, { outboundSequence: 1, outboundTailJobId: winner.jobId });
    await legacy.commit();
    try { return await commit(); } catch (error) {
      await assertAbsent(identity);
      assert.equal((await chatRef.get()).data()?.outboundSequence, 1);
      rejectedAtomically = true;
      throw error;
    }
  });
  try {
    const result = await enqueue(input);
    assert.equal(rejectedAtomically, true);
    assert.equal(result.replayed, false);
    const job = (await adminDb.collection("chat_outbound_jobs").doc(result.jobId).get()).data()!;
    assert.equal(job.sequence, 2);
    assert.equal(job.predecessorJobId, winnerJobId);
    assert.equal((await chatRef.get()).data()?.outboundSequence, 2);
  } finally { interceptor.mock.restore(); }
});

test("lost commit acknowledgement resolves the durable job without another write", async () => {
  const { input, chatRef } = await fixture("lostack");
  let commits = 0;
  const interceptor = interceptFirstCommit(async (commit) => {
    commits++;
    await commit();
    throw Object.assign(new Error("QA lost acknowledgement"), { code: 14 });
  });
  try {
    const result = await enqueue(input);
    assert.equal(result.replayed, true);
    assert.equal(commits, 1);
    assert.equal((await chatRef.get()).data()?.outboundSequence, 1);
    assert.equal((await enqueue(input)).jobId, result.jobId);
    assert.equal((await chatRef.get()).data()?.outboundSequence, 1);
  } finally { interceptor.mock.restore(); }
});

test("reply moved after validation cannot produce an outbound operation", async () => {
  const { input, chatRef, identity } = await fixture("reply");
  const replyRef = adminDb.collection("messages").doc(`${tenantId}_reply`);
  await replyRef.set({ tenantId, chatId: input.chatId, text: "Origem", sender: "client" });
  const interceptor = interceptFirstCommit(async (commit) => {
    await replyRef.update({ chatId: "another-conversation" });
    return commit();
  });
  try {
    await assert.rejects(() => enqueue({ ...input, replyToId: replyRef.id }), /nao pertence/);
    await assertAbsent(identity);
    assert.equal((await chatRef.get()).data()?.outboundSequence, undefined);
    assert.equal((await adminDb.collection("chat_state").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

test("uncommitted transport error leaves no phantom sequence and later retry is safe", async () => {
  const { input, chatRef, identity } = await fixture("transport");
  const interceptor = interceptFirstCommit(async () => { throw Object.assign(new Error("QA unavailable before commit"), { code: 14 }); });
  try {
    await assert.rejects(() => enqueue(input), /QA unavailable/);
    await assertAbsent(identity);
    assert.equal((await chatRef.get()).data()?.outboundSequence, undefined);
  } finally { interceptor.mock.restore(); }
  const result = await enqueue(input);
  assert.equal(result.replayed, false);
  assert.equal((await chatRef.get()).data()?.outboundSequence, 1);
});

test("existing orphan message and invalid sequence are not overwritten", async () => {
  const orphan = await fixture("orphan");
  const messageRef = adminDb.collection("messages").doc(orphan.identity.messageId);
  await messageRef.set({ tenantId, chatId: orphan.input.chatId, text: "Preservar" });
  await assert.rejects(() => enqueue(orphan.input), /reconciliacao/);
  assert.equal((await messageRef.get()).data()?.text, "Preservar");
  assert.equal((await orphan.chatRef.get()).data()?.outboundSequence, undefined);
  const invalid = await fixture("invalid");
  await invalid.chatRef.update({ outboundSequence: "NaN" });
  await assert.rejects(() => enqueue(invalid.input), /Sequencia/);
  await assertAbsent(invalid.identity);
});

test("expired enqueue lease is recoverable and removed in the successful atomic commit", async () => {
  const { input, chatRef } = await fixture("expired");
  const lock = adminDb.collection("chat_outbound_locks").doc(chatOutboundEnqueueLockId(tenantId, input.chatId));
  await lock.set({ tenantId, chatId: input.chatId, token: "crashed-instance", leaseUntil: new Date(Date.now() - 1000) });
  await enqueue(input);
  assert.equal((await lock.get()).exists, false);
  assert.equal((await chatRef.get()).data()?.outboundSequence, 1);
});

test("a stale holder cannot commit or delete a lease taken over by another instance", async () => {
  const { input, identity, chatRef } = await fixture("fenced");
  const lock = adminDb.collection("chat_outbound_locks").doc(chatOutboundEnqueueLockId(tenantId, input.chatId));
  const interceptor = interceptFirstCommit(async (commit) => {
    await lock.update({ token: "new-owner", leaseUntil: new Date(Date.now() + 30000) });
    return commit();
  });
  try {
    await assert.rejects(() => enqueue(input), /Posse.*expirou/);
    assert.equal((await lock.get()).data()?.token, "new-owner");
    await assertAbsent(identity);
    assert.equal((await chatRef.get()).data()?.outboundSequence, undefined);
  } finally { interceptor.mock.restore(); }
});
