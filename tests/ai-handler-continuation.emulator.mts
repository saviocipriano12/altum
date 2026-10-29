import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-handler-continuation", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-handler-continuation", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { logAiUsage } = await import("../lib/server/ai/usage-ledger.ts");
const { trackAltumAgentLearning } = await import("../lib/server/ai/learning-loop.ts");
const { completeHandlerEffects, resumeHandlerEffects, HandlerContinuationReviewError } = await import("../lib/server/ai/handler-continuation.ts");
const { getConversationRuntimeDocId } = await import("../lib/server/ai/runtime-state.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "messages", "chat_state", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "ai_logs", "operational_alerts", "ai_usage_ledger", "ai_usage_monthly", "ai_learning_events", "ai_tenant_learning_daily", "ai_learning_signals", "ai_tenant_learning_signal_daily", "ai_conversation_state"]) {
    assert.ok(tenantId.startsWith("qa_continuation_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
function tenant() { const tenantId = `qa_continuation_${randomUUID()}`; tenants.push(tenantId); return tenantId; }
test("a legacy decision log alone cannot complete a partially executed handler", async () => {
  const tenantId = tenant(), chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  const logId = `${tenantId}_${chatId}_${messageId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220);
  await adminDb.collection("ai_logs").doc(logId).set({ tenantId, chatId, messageId, decision: "respond", output: "Resposta anterior fictícia" });
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0 });
  await processAiJobNow(queued.jobId);
  assert.equal((await adminDb.collection("jobs").doc(queued.jobId).get()).data()?.status, "reconciliation_required");
});
test("replaying one accepted usage operation cannot count its cost or conversation twice", async () => {
  const tenantId = tenant(), entry = { tenantId, scope: "conversation" as const, provider: "openai" as const, model: "qa-local-no-model", agentId: "qa", chatId: `${tenantId}_chat`, messageId: "qa_message", aiLogId: `${tenantId}_log`, estimatedCostUsd: 0.001 };
  const first = await logAiUsage(entry, "qa_tail_usage"); const second = await logAiUsage(entry, "qa_tail_usage");
  assert.equal(first, second);
  const rows = await adminDb.collection("ai_usage_monthly").where("tenantId", "==", tenantId).get();
  assert.equal(rows.size, 1); assert.equal(rows.docs[0].data().conversationRuns, 1); assert.equal(rows.docs[0].data().estimatedCostUsd, 0.001);
});
test("a learning event whose signal write was interrupted resumes its missing signal without recounting the event", async () => {
  const tenantId = tenant(), input = { tenantId, chatId: `${tenantId}_chat`, aiLogId: `${tenantId}_log`, decision: "respond", nextAction: "qa_follow_up" };
  const original = adminDb.runTransaction.bind(adminDb); let committedEvent = false, injected = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    if (committedEvent && !injected) { injected = true; throw new Error("qa injected loss before learning signal"); }
    const result = await original(...args); if (result === true) committedEvent = true; return result;
  });
  try { await assert.rejects(trackAltumAgentLearning(input)); } finally { hook.mock.restore(); }
  assert.equal(injected, true); await trackAltumAgentLearning(input);
  assert.equal((await adminDb.collection("ai_learning_signals").where("tenantId", "==", tenantId).get()).size, 1);
  const days = await adminDb.collection("ai_tenant_learning_daily").where("tenantId", "==", tenantId).get();
  assert.equal(days.docs[0].data().totalRuns, 1);
});
async function plan() {
  const tenantId = tenant(), chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`, logDocId = `${tenantId}_log`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  return { tenantId, chatId, messageId, result: { decision: "respond" as const, reason: "qa_original_result" }, effects: [
    { kind: "log" as const, input: { logDocId, data: { tenantId, chatId, messageId, decision: "respond", output: "Resposta já enviada" } } },
    { kind: "usage" as const, input: { tenantId, chatId, messageId, aiLogId: logDocId, scope: "conversation" as const, provider: "openai" as const, model: "qa_no_model", agentId: "qa", estimatedCostUsd: 0.001 } },
    { kind: "learning" as const, input: { tenantId, chatId, aiLogId: logDocId, decision: "respond" } },
    { kind: "runtime" as const, input: { tenantId, chatId, inboundText: "Mensagem fictícia", outboundText: "Resposta já enviada", decision: "respond" as const, reason: "qa_original_result", sourceMessageId: messageId, sourceOccurredAtMs: Date.now() } },
  ] };
}
test("a complete frozen tail replays its result without recounting effects or sending a message", async () => {
  const input = await plan(); assert.deepEqual(await completeHandlerEffects(input), input.result);
  const log = await adminDb.collection("ai_logs").doc(input.effects[0].input.logDocId!).get();
  assert.deepEqual(await resumeHandlerEffects(input), input.result);
  assert.ok((await log.ref.get()).updateTime!.isEqual(log.updateTime!));
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", input.tenantId).get()).size, 1);
  const usage = await adminDb.collection("ai_usage_monthly").where("tenantId", "==", input.tenantId).get();
  assert.equal(usage.docs[0].data().conversationRuns, 1);
});
test("a real lost effect acknowledgement resumes the remaining tail with one usage and learning event", async () => {
  const input = await plan(), original = adminDb.runTransaction.bind(adminDb); let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    let checkpoint = false;
    const result = await original(async tx => {
      const capture = mock.method(tx, "update", new Proxy(tx.update, { apply(target, self, values) {
        if ((values[1] as Record<string, unknown>)?.["effects.1.status"] === "done") checkpoint = true;
        return Reflect.apply(target, self, values);
      } }));
      try { return await args[0](tx); } finally { capture.mock.restore(); }
    }, args[1]);
    if (checkpoint && !injected) { injected = true; throw new Error("qa injected loss after durable usage acknowledgement"); }
    return result;
  });
  try { await assert.rejects(completeHandlerEffects(input)); } finally { hook.mock.restore(); }
  assert.equal(injected, true); assert.deepEqual(await resumeHandlerEffects(input), input.result);
  const usage = await adminDb.collection("ai_usage_monthly").where("tenantId", "==", input.tenantId).get();
  assert.equal(usage.docs[0].data().conversationRuns, 1);
  assert.equal((await adminDb.collection("ai_learning_events").where("tenantId", "==", input.tenantId).get()).size, 1);
  assert.equal((await adminDb.collection("ai_conversation_state").doc(getConversationRuntimeDocId(input.tenantId, input.chatId)).get()).data()?.lastSourceMessageId, input.messageId);
});
test("a recreated source or a changed frozen plan cannot inherit a previous completion", async () => {
  const input = await plan(); await completeHandlerEffects(input);
  await assert.rejects(completeHandlerEffects({ ...input, result: { ...input.result, reason: "changed_intent" } }), HandlerContinuationReviewError);
  const message = adminDb.collection("messages").doc(input.messageId); await message.delete();
  await message.set({ tenantId: input.tenantId, chatId: input.chatId, sender: "client", text: "Nova ocorrência" });
  await assert.rejects(resumeHandlerEffects(input), HandlerContinuationReviewError);
});
test("the real incoming worker resumes an admitted tail before the existing-log shortcut and never sends again", async () => {
  const input = await plan(), original = adminDb.runTransaction.bind(adminDb); let injected = false;
  const hook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    return original(async tx => {
      const capture = mock.method(tx, "get", new Proxy(tx.get, { apply(target, self, values) {
        const ref = values[0] as FirebaseFirestore.DocumentReference;
        if (!injected && ref.parent?.id === "ai_usage_ledger") { injected = true; throw new Error("qa injected interruption before usage step"); }
        return Reflect.apply(target, self, values);
      } }));
      try { return await args[0](tx); } finally { capture.mock.restore(); }
    }, args[1]);
  });
  try { await assert.rejects(completeHandlerEffects(input)); } finally { hook.mock.restore(); }
  assert.equal(injected, true);
  assert.equal((await adminDb.collection("ai_logs").doc(input.effects[0].input.logDocId!).get()).exists, true);
  const queued = await enqueueIncomingMessageJob({ tenantId: input.tenantId, chatId: input.chatId, messageId: input.messageId, dedupeKey: input.messageId, debounceMs: 0 });
  const result = await processAiJobNow(queued.jobId);
  assert.equal(result?.ok, true);
  const root = (await adminDb.collection("jobs").doc(queued.jobId).get()).data()!;
  assert.equal(root.status, "done"); assert.equal(root.decisionReason, "qa_original_result");
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", input.tenantId).get()).size, 1);
  assert.equal((await adminDb.collection("ai_usage_ledger").where("tenantId", "==", input.tenantId).get()).size, 1);
});

test("a completed handler cannot replay its former purchase after a new selection", async () => {
  const tenantId = tenant(), chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`;
  const chat = adminDb.collection("chats").doc(chatId);
  await chat.set({ tenantId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  await completeHandlerEffects({ tenantId, chatId, messageId, result: { decision: "skip", reason: "test" }, effects: [
    { kind: "runtime", input: { tenantId, chatId, inboundText: "Compra anterior", decision: "skip", reason: "test", sourceMessageId: messageId } },
  ] });
  const ref = adminDb.collection("ai_conversation_state").doc(getConversationRuntimeDocId(tenantId, chatId)), before = await ref.get();
  await chat.update({ commercialContext: { version: 1, id: `context_${"b".repeat(64)}` } });
  await assert.rejects(resumeHandlerEffects({ tenantId, chatId, messageId }), HandlerContinuationReviewError);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
});
