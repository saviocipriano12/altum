import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-queue-recovery", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-queue-recovery", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob, processAiJobNow, processAiQueue } = await import("../lib/server/ai/queue.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "messages", "chat_state", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "ai_logs", "operational_alerts"]) {
    assert.ok(tenantId.startsWith("qa_queue_recovery_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_queue_recovery_${randomUUID()}`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`; tenants.push(tenantId);
  const chat = adminDb.collection("chats").doc(chatId);
  await chat.set({ tenantId, channel: "site_chat", lastClientMessageAt: new Date() });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  const state = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
  await state.set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa_human" });
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0, source: "qa_recovery" });
  return { tenantId, chatId, messageId, chat, state, job: adminDb.collection("jobs").doc(queued.jobId), turn: adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)) };
}
async function interruptAfterClaim(f: Awaited<ReturnType<typeof fixture>>) {
  const original = adminDb.runTransaction.bind(adminDb); let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (!interrupted && result && typeof result === "object" && "id" in result && result.id === f.job.id && "originNotAfter" in result) {
      interrupted = true; throw new Error("qa injected process interruption immediately after claim");
    }
    return result;
  });
  try { await processAiJobNow(f.job.id); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true); assert.equal((await f.job.get()).data()?.status, "processing");
}
test("an expired authentic claim interrupted before execution resumes without leaving the conversation stuck", async () => {
  const f = await fixture(); await interruptAfterClaim(f); await f.job.update({ lockedAt: new Date(1) });
  await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "done");
  assert.equal((await f.state.get()).data()?.humanOwnerUserId, "qa_human");
});
test("an active processing lease remains untouched by recovery", async () => {
  const f = await fixture(); await interruptAfterClaim(f); const before = await f.job.get();
  assert.equal(await processAiJobNow(f.job.id), null);
  assert.ok((await f.job.get()).updateTime!.isEqual(before.updateTime!));
});
test("expired legacy execution without a completion receipt requires review instead of replaying effects", async () => {
  const f = await fixture(); await f.job.update({ status: "processing", lockedAt: new Date(1), attempts: 1 });
  await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
  assert.equal((await f.state.get()).data()?.lastJobStatus, "reconciliation_required");
});
test("an expired executing claim with an uncertain effect is not treated as an unstarted claim", async () => {
  const f = await fixture(); await interruptAfterClaim(f);
  await f.job.update({ lockedAt: new Date(1), executionPhase: "executing" });
  await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
});
test("a persisted result resumes completion without running the handler or changing its outcome", async () => {
  const f = await fixture(); await interruptAfterClaim(f); const row = (await f.job.get()).data()!;
  await f.job.update({ lockedAt: new Date(1), executionPhase: "result_recorded", executionResult: {
    decision: "skip", reason: "qa_durable_result", claimToken: row.claimToken, rootGeneration: row.claimGeneration || "missing_protocol",
    tenantId: f.tenantId, chatId: f.chatId, messageId: f.messageId, attempts: row.attempts,
  } });
  await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "done");
  assert.equal((await f.job.get()).data()?.decisionReason, "qa_durable_result");
  assert.equal((await f.state.get()).data()?.lastDecisionReason, "qa_durable_result");
  assert.equal((await adminDb.collection("crm_observation_jobs").where("tenantId", "==", f.tenantId).get()).docs.some(doc => doc.data().status === "completed"), false);
});
test("a result with a foreign claim token cannot authorize completion", async () => {
  const f = await fixture(); await interruptAfterClaim(f); const row = (await f.job.get()).data()!;
  await f.job.update({ lockedAt: new Date(1), executionPhase: "result_recorded", executionResult: {
    decision: "respond", reason: "qa_forged_result", claimToken: "qa_other_claim", rootGeneration: row.claimGeneration || "missing_protocol",
    tenantId: f.tenantId, chatId: f.chatId, messageId: f.messageId, attempts: row.attempts,
  } });
  await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
  assert.notEqual((await f.state.get()).data()?.lastDecisionReason, "qa_forged_result");
});
test("the queue recovers expired claims even when active processing history fills the first page", async () => {
  const f = await fixture(); await interruptAfterClaim(f); await f.job.update({ lockedAt: new Date(1) });
  const batch = adminDb.batch();
  for (let index = 0; index < 105; index++) batch.set(adminDb.collection("jobs").doc(`000_active_${f.tenantId}_${index}`), {
    type: "ai_incoming_message", tenantId: f.tenantId, chatId: f.chatId, status: "processing", lockedAt: new Date(), attempts: 1,
  });
  await batch.commit(); await processAiQueue({ limit: 1 });
  assert.equal((await f.job.get()).data()?.status, "done");
});
test("lost acknowledgement of the real result checkpoint recovers completion without another attempt", async () => {
  const f = await fixture(), original = adminDb.runTransaction.bind(adminDb); let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    let checkpoint = false;
    const wrapped: Parameters<typeof adminDb.runTransaction> = [async tx => {
      const update = tx.update;
      const capture = mock.method(tx, "update", ((...values: unknown[]) => {
        if ((values[1] as Record<string, unknown>)?.executionPhase === "result_recorded") checkpoint = true;
        return Reflect.apply(update, tx, values);
      }) as typeof tx.update);
      try { return await args[0](tx); } finally { capture.mock.restore(); }
    }, args[1]];
    const result = await original(...wrapped);
    if (checkpoint && !interrupted) { interrupted = true; throw new Error("qa injected lost result-checkpoint acknowledgement"); }
    return result;
  });
  try { await processAiJobNow(f.job.id); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true);
  const recorded = (await f.job.get()).data()!;
  assert.equal(recorded.status, "processing"); assert.equal(recorded.executionPhase, "result_recorded");
  assert.equal(recorded.executionResult.reason, "tenant_ai_settings_unavailable");
  await f.job.update({ lockedAt: new Date(1) }); await processAiJobNow(f.job.id);
  assert.equal((await f.job.get()).data()?.status, "done");
  assert.equal((await f.job.get()).data()?.decisionReason, recorded.executionResult.reason);
  assert.equal((await f.job.get()).data()?.attempts, recorded.attempts);
});
test("concurrent recovery of one unstarted claim admits only one new attempt", async () => {
  const f = await fixture(); await interruptAfterClaim(f); await f.job.update({ lockedAt: new Date(1) });
  await Promise.all(Array.from({ length: 8 }, () => processAiJobNow(f.job.id)));
  assert.equal((await f.job.get()).data()?.status, "done");
  assert.equal((await f.job.get()).data()?.attempts, 2);
});
