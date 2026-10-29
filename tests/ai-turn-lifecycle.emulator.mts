import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-turn-lifecycle", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-turn-lifecycle", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob: enqueue, processAiJobNow, processAiQueue } = await import("../lib/server/ai/queue.ts");
const { getConversationTurnDocId, getLegacyConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const { deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const { getChatState } = await import("../lib/server/ai/agent.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "chat_state", "tenant_trash", "deletion_audits", "lead_tasks", "lead_notes", "ai_logs", "operational_alerts"]) {
    assert.ok(tenantId.startsWith("qa_turn_lifecycle_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_turn_lifecycle_${randomUUID()}`; tenants.push(tenantId);
  const leadId = `${tenantId}_lead`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Pessoa fictícia" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "site_chat", lastClientMessageAt: new Date() });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa_human" });
  const input = { tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0, source: "qa_turn_lifecycle" };
  const queued = await enqueue(input);
  return { ...input, leadId, queued, job: adminDb.collection("jobs").doc(queued.jobId), canonical: adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)), legacy: adminDb.collection("ai_conversation_turns").doc(getLegacyConversationTurnDocId(tenantId, chatId)) };
}
test("lead deletion archives both coordinator versions and restoration does not authorize an old AI job", async () => {
  const f = await fixture(), before = (await f.canonical.get()).data()!;
  const removed = await deleteTenantLead({ tenantId: f.tenantId, leadId: f.leadId }); assert.ok(removed.trashId);
  assert.equal((await f.canonical.get()).exists, false); assert.equal((await f.legacy.get()).exists, false);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await f.canonical.get()).data()?.latestMessageId, before.latestMessageId); assert.equal((await f.legacy.get()).data()?.latestMessageId, before.latestMessageId);
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
  const restored = await f.job.get(); assert.equal(await processAiJobNow(f.job.id), null);
  assert.ok((await f.job.get()).updateTime!.isEqual(restored.updateTime!));
});
test("an explicit reconciliation state cannot be normalized into runnable pending work", async () => {
  const f = await fixture(); await f.job.update({ status: "reconciliation_required", reconciliationReason: "qa_uncertain_effect" });
  const before = await f.job.get(); assert.equal(await processAiJobNow(f.job.id), null);
  assert.ok((await f.job.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await f.job.get()).data()?.attempts, 0);
});
test("a worker cannot claim another business occurrence merely because it has tenant/chat/message fields", async () => {
  const f = await fixture(); await f.job.update({ type: "automation_waiting_reply_runtime" });
  const before = await f.job.get(); assert.equal(await processAiJobNow(f.job.id), null);
  assert.ok((await f.job.get()).updateTime!.isEqual(before.updateTime!));
});
test("terminal history cannot hide pending work beyond the queue's bounded candidate window", async () => {
  const f = await fixture(), history = Array.from({ length: 25 }, (_, index) => adminDb.collection("jobs").doc(`${f.tenantId}_history_${index}`)), batch = adminDb.batch();
  for (const ref of history) batch.set(ref, { tenantId: f.tenantId, chatId: f.chatId, messageId: ref.id, type: "ai_incoming_message", status: "done", availableAt: new Date(1), priority: 50, attempts: 1 });
  await batch.commit(); const before = await adminDb.getAll(...history);
  const result = await processAiQueue({ limit: 1 }); assert.equal(result.claimed, 1); assert.equal(result.processed, 1);
  assert.equal((await f.job.get()).data()?.status, "done");
  const after = await adminDb.getAll(...history); for (let index = 0; index < after.length; index++) assert.ok(after[index].updateTime!.isEqual(before[index].updateTime!));
});
test("an unverifiable legacy coordinator is quarantined without touching its owner or starving the next job", async () => {
  const f = await fixture(), foreignTenant = `${f.tenantId}_other`; tenants.push(foreignTenant);
  await f.canonical.delete(); await f.legacy.update({ tenantId: foreignTenant, chatId: "qa_foreign_chat" });
  const foreign = await f.legacy.get(); assert.equal(await processAiJobNow(f.job.id), null);
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required"); assert.equal((await f.job.get()).data()?.attempts, 0);
  assert.ok((await f.legacy.get()).updateTime!.isEqual(foreign.updateTime!));
  const next = await fixture(), result = await processAiQueue({ limit: 1 });
  assert.equal(result.processed, 1); assert.equal((await next.job.get()).data()?.status, "done");
});
test("a queue worker never rewrites the human control state of a colliding company/conversation", async () => {
  const f = await fixture(), boundary = f.chatId.indexOf("_"), tenantId = `${f.tenantId}_${f.chatId.slice(0, boundary)}`, chatId = f.chatId.slice(boundary + 1); tenants.push(tenantId);
  assert.equal(getChatStateDocId(f.tenantId, f.chatId), getChatStateDocId(tenantId, chatId));
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "site_chat" });
  const state = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
  await state.set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa_foreign_owner" }); const before = await state.get();
  await processAiJobNow(f.job.id);
  assert.deepEqual((await state.get()).data(), before.data()); assert.ok((await state.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.job.get()).data()?.status, "reconciliation_required");
});
test("reading state cannot reveal or automatically resume another company's colliding human pause", async () => {
  const f = await fixture(), tenantId = `${f.tenantId}_qa`, chatId = f.chatId.slice("qa_".length); tenants.push(tenantId);
  assert.equal(getChatStateDocId(f.tenantId, f.chatId), getChatStateDocId(tenantId, chatId));
  const state = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId));
  await state.set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa_foreign_owner", pausedUntil: new Date(1), pauseReason: "human_takeover", lastDecisionReason: "qa_private_context" });
  const before = await state.get();
  await assert.rejects(getChatState(f.tenantId, f.chatId), error => error instanceof Error && "code" in error && error.code === "chat_state_identity_conflict");
  assert.deepEqual((await state.get()).data(), before.data()); assert.ok((await state.get()).updateTime!.isEqual(before.updateTime!));
});
