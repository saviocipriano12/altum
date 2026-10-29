import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-queue-finalization", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-queue-finalization", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "messages", "chat_state", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "ai_logs", "operational_alerts"]) {
    assert.ok(tenantId.startsWith("qa_queue_final_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_queue_final_${randomUUID()}`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`; tenants.push(tenantId);
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat", lastClientMessageAt: new Date() });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  const state = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
  await state.set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa_human" });
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0, source: "qa_finalization" });
  return { tenantId, chatId, messageId, state, job: adminDb.collection("jobs").doc(queued.jobId) };
}
async function mutateAfterClaim(jobId: string, mutation: () => Promise<void>, run: () => Promise<unknown>) {
  const original = adminDb.runTransaction.bind(adminDb); let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (!injected && result && typeof result === "object" && "id" in result && result.id === jobId && "originNotAfter" in result) {
      injected = true; await mutation();
    }
    return result;
  });
  try { await run(); assert.equal(injected, true, "test must cross a real committed claim"); } finally { hook.mock.restore(); }
}
test("a worker finishing after its root was deleted never recreates it or publishes a stale decision", async () => {
  const f = await fixture(), before = await f.state.get();
  await mutateAfterClaim(f.job.id, () => f.job.delete().then(() => {}), () => processAiJobNow(f.job.id));
  assert.equal((await f.job.get()).exists, false);
  assert.ok((await f.state.get()).updateTime!.isEqual(before.updateTime!));
});
test("a worker cannot finalize a root recreated for another owner at the same document path", async () => {
  const f = await fixture(), foreignTenant = `${f.tenantId}_other`; tenants.push(foreignTenant); let replaced: FirebaseFirestore.DocumentSnapshot;
  await mutateAfterClaim(f.job.id, async () => {
    await f.job.delete(); await f.job.set({ tenantId: foreignTenant, chatId: "qa_other_chat", messageId: "qa_other_message", type: "ai_incoming_message", status: "pending", attempts: 0 }); replaced = await f.job.get();
  }, () => processAiJobNow(f.job.id));
  assert.deepEqual((await f.job.get()).data(), replaced!.data());
  assert.ok((await f.job.get()).updateTime!.isEqual(replaced!.updateTime!));
});
test("a stale worker cannot finish a newer attempt of the same job", async () => {
  const f = await fixture(); let replaced: FirebaseFirestore.DocumentSnapshot;
  await mutateAfterClaim(f.job.id, async () => {
    await f.job.update({ status: "processing", attempts: 2, lockedAt: new Date(), claimToken: "qa_new_owner" }); replaced = await f.job.get();
  }, () => processAiJobNow(f.job.id));
  assert.deepEqual((await f.job.get()).data(), replaced!.data());
  assert.ok((await f.job.get()).updateTime!.isEqual(replaced!.updateTime!));
});
test("normal completion commits root and diagnostics together and releases only its own turn lock", async () => {
  const f = await fixture(), result = await processAiJobNow(f.job.id);
  assert.equal(result?.ok, true);
  const [job, state] = await adminDb.getAll(f.job, f.state);
  assert.equal(job.data()?.status, "done"); assert.equal(state.data()?.lastJobStatus, "done");
  assert.equal(job.data()?.claimToken, undefined); assert.equal(state.data()?.lastJobId, f.job.id);
  assert.ok(job.updateTime!.isEqual(state.updateTime!));
  const turns = await adminDb.collection("ai_conversation_turns_v2").where("tenantId", "==", f.tenantId).get();
  assert.equal(turns.size, 1); assert.equal(turns.docs[0].data().lockJobId, undefined);
  assert.equal(turns.docs[0].data().lockClaimToken, undefined);
});
test("a changed human-state owner after claim prevents stale diagnostics and marks the root for review", async () => {
  const f = await fixture(), foreignTenant = `${f.tenantId}_other`; tenants.push(foreignTenant); let replaced: FirebaseFirestore.DocumentSnapshot;
  await mutateAfterClaim(f.job.id, async () => {
    await f.state.set({ tenantId: foreignTenant, chatId: "qa_other_chat", aiEnabled: false, humanOwnerUserId: "qa_other_human" }); replaced = await f.state.get();
  }, () => processAiJobNow(f.job.id));
  assert.ok((await f.state.get()).updateTime!.isEqual(replaced!.updateTime!));
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
});
test("a recreated chat after claim cannot receive the previous conversation's completion metadata", async () => {
  const f = await fixture(), before = await f.state.get();
  await mutateAfterClaim(f.job.id, async () => {
    const ref = adminDb.collection("chats").doc(f.chatId); await ref.delete(); await ref.set({ tenantId: f.tenantId, channel: "site_chat" });
  }, () => processAiJobNow(f.job.id));
  assert.ok((await f.state.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
});
test("failure after claim commits retry diagnostics and root atomically", async () => {
  const f = await fixture(), original = adminDb.runTransaction.bind(adminDb); let claimed = false, injected = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    if (claimed && !injected) { injected = true; throw new Error("qa injected transient failure before handler"); }
    const result = await original(...args);
    if (result && typeof result === "object" && "id" in result && result.id === f.job.id && "originNotAfter" in result) claimed = true;
    return result;
  });
  try { assert.equal((await processAiJobNow(f.job.id))?.retried, true); } finally { hook.mock.restore(); }
  assert.equal(injected, true);
  const [job, state] = await adminDb.getAll(f.job, f.state);
  assert.equal(job.data()?.status, "retrying"); assert.equal(state.data()?.lastJobStatus, "retrying");
  assert.equal(job.data()?.claimToken, undefined); assert.ok(job.updateTime!.isEqual(state.updateTime!));
});
test("a metrics failure after completion never turns a completed operation into a retry", async () => {
  const f = await fixture(), prototype = Object.getPrototypeOf(f.job) as FirebaseFirestore.DocumentReference;
  const original = prototype.set as (this: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions) => Promise<FirebaseFirestore.WriteResult>;
  let injected = 0;
  const hook = mock.method(prototype, "set", function (this: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions) {
    if (this.parent.id === "metrics" && data.tenantId === f.tenantId) { injected++; return Promise.reject(new Error("qa injected metrics failure")); }
    return options ? original.call(this, data, options) : original.call(this, data);
  });
  try { assert.equal((await processAiJobNow(f.job.id))?.ok, true); } finally { hook.mock.restore(); }
  assert.equal(injected, 1);
  assert.equal((await f.job.get()).data()?.status, "done");
  assert.equal((await f.state.get()).data()?.lastJobStatus, "done");
  assert.equal(await processAiJobNow(f.job.id), null);
});

test("a purchase selection after claim cannot publish the old worker's completion over human control", async () => {
  const f = await fixture(), before = await f.state.get();
  await mutateAfterClaim(f.job.id, async () => {
    await adminDb.collection("chats").doc(f.chatId).update({ commercialContext: { version: 1, id: `context_${"c".repeat(64)}` } });
  }, () => processAiJobNow(f.job.id));
  assert.ok((await f.state.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
  assert.equal((await f.state.get()).data()?.humanOwnerUserId, "qa_human");
});
