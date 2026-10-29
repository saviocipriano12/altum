import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AiExecutionAuthority } from "../lib/server/ai/execution-authority.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-handler-diagnostic", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-handler-diagnostic", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { completeHandlerEffects } = await import("../lib/server/ai/handler-continuation.ts");
const { withAiExecutionAuthority } = await import("../lib/server/ai/execution-authority.ts");
const tenantId = `qa_handler_diagnostic_${randomUUID()}`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["chats", "messages", "jobs", "chat_state", "ai_logs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "ai_usage_ledger", "ai_usage_monthly"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
test("an expired executing root with a valid pending tail resumes that tail without another reply", async () => {
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0 });
  const job = adminDb.collection("jobs").doc(queued.jobId), original = adminDb.runTransaction.bind(adminDb);
  let authority: AiExecutionAuthority | undefined;
  const claimHook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => {
    const result = await original(...args);
    if (result && typeof result === "object" && "id" in result && result.id === queued.jobId && "originNotAfter" in result) {
      authority = result as AiExecutionAuthority; throw new Error("qa injected process loss after claim");
    }
    return result;
  });
  try { await processAiJobNow(queued.jobId); } finally { claimHook.mock.restore(); }
  assert.ok(authority); await job.update({ executionPhase: "executing" });
  let interrupted = false;
  const usageHook = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof adminDb.runTransaction>) => original(async tx => {
    const capture = mock.method(tx, "get", new Proxy(tx.get, { apply(target, self, values) {
      if (!interrupted && (values[0] as FirebaseFirestore.DocumentReference).parent?.id === "ai_usage_ledger") {
        interrupted = true; throw new Error("qa injected failure before usage effect");
      }
      return Reflect.apply(target, self, values);
    } }));
    try { return await args[0](tx); } finally { capture.mock.restore(); }
  }, args[1]));
  try {
    await assert.rejects(withAiExecutionAuthority(authority, () => completeHandlerEffects({ tenantId, chatId, messageId,
      result: { decision: "respond", reason: "qa_original_result" }, effects: [
        { kind: "log", input: { logDocId: `${tenantId}_log`, data: { tenantId, chatId, messageId, decision: "respond", output: "Resposta já enviada" } } },
        { kind: "usage", input: { tenantId, chatId, messageId, scope: "conversation", provider: "openai", model: "qa_no_model", agentId: "qa", estimatedCostUsd: 0.001 } },
      ] })));
  } finally { usageHook.mock.restore(); }
  assert.equal(interrupted, true);
  const tails = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("type", "==", "ai_handler_continuation").get();
  assert.equal(tails.size, 1); assert.equal(tails.docs[0].data().status, "pending");
  await job.update({ lockedAt: new Date(1) }); await processAiJobNow(queued.jobId);
  assert.equal((await job.get()).data()?.status, "done");
  assert.equal((await job.get()).data()?.decisionReason, "qa_original_result");
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 1);
});
