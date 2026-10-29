import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-turn-legacy", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-turn-legacy", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob: enqueue, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { enqueueIncomingMessageJob: oldEnqueue } = await import("./fixtures/ai-queue-v1.mts");
const { getConversationTurnDocId, getLegacyConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const { readConversationTurn } = await import("../lib/server/ai/conversation-turn-store.ts");
const tenants = new Set<string>(), originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics"]) for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminDb.terminate();
});
async function fixture() {
  const suffix = randomUUID().replaceAll("-", ""), tenantId = `qa_turn_legacy_${suffix}`, chatId = `part_${suffix}_chat`;
  tenants.add(tenantId);
  const chat = adminDb.collection("chats").doc(chatId), leadId = `${tenantId}_lead`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Pessoa fictícia" });
  await chat.set({ tenantId, leadId, channel: "site_chat" });
  const input = async (tag: string) => {
    const messageId = `qa_${suffix}_${tag}`; await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
    return { tenantId, chatId, messageId, dedupeKey: messageId, source: "qa_turn_legacy", debounceMs: 0 };
  };
  return { tenantId, chatId, chat, input, canonical: adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)), legacy: adminDb.collection("ai_conversation_turns").doc(getLegacyConversationTurnDocId(tenantId, chatId)) };
}
test("current readers retain an authentic v1 coordinator and a duplicate keeps its original job", async () => {
  const f = await fixture(), input = await f.input("old"), old = await oldEnqueue(input), before = await f.legacy.get();
  assert.equal((await f.canonical.get()).exists, false);
  assert.equal((await readConversationTurn(f.tenantId, f.chatId)).data()?.latestMessageId, input.messageId);
  const replay = await enqueue(input); assert.equal(replay.created, false); assert.equal(replay.jobId, old.jobId);
  assert.ok((await f.legacy.get()).updateTime!.isEqual(before.updateTime!));
});
test("new admission preserves a live legacy lock without letting the new worker claim it", async () => {
  const f = await fixture(); await oldEnqueue(await f.input("old"));
  const lockedAt = new Date(); await f.legacy.update({ lockJobId: "qa_old_worker", lockedAt });
  const input = await f.input("new"), queued = await enqueue(input), canonical = (await f.canonical.get()).data()!;
  assert.equal(canonical.lockJobId, "qa_old_worker"); assert.equal(canonical.lockedAt.toMillis(), lockedAt.getTime());
  assert.equal(await processAiJobNow(queued.jobId), null); assert.equal((await adminDb.collection("jobs").doc(queued.jobId).get()).data()?.attempts, 0);
});
test("a newer legacy producer message remains authoritative after a canonical coordinator exists", async () => {
  const f = await fixture(); await enqueue(await f.input("current"));
  const next = await f.input("legacy_new"); await oldEnqueue(next);
  assert.equal((await readConversationTurn(f.tenantId, f.chatId)).data()?.latestMessageId, next.messageId);
  // Losing the colliding legacy mirror later must not resurrect the old turn.
  await f.legacy.update({ tenantId: `${f.tenantId}_other`, chatId: "another_chat", latestMessageId: "foreign_message" });
  assert.equal((await readConversationTurn(f.tenantId, f.chatId)).data()?.latestMessageId, next.messageId);
});
test("a foreign legacy coordinator cannot authorize a missing canonical conversation", async () => {
  const f = await fixture(); await oldEnqueue(await f.input("old")); const before = await f.legacy.get();
  const tenantId = `${f.tenantId}_part`, chatId = f.chatId.slice("part_".length); tenants.add(tenantId);
  await assert.rejects(readConversationTurn(tenantId, chatId), /AI_TURN_LEGACY_IDENTITY_CONFLICT/);
  assert.ok((await f.legacy.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)).get()).exists, false);
});
test("a legacy producer whose old key resembles a canonical ID cannot overwrite that canonical coordinator", async () => {
  const f = await fixture(), original = await f.input("current"); await enqueue(original);
  const tenantId = "turn", chatId = f.canonical.id.slice("turn_".length), messageId = `qa_collision_${randomUUID()}`, leadId = `${messageId}_lead`; tenants.add(tenantId);
  assert.equal(getLegacyConversationTurnDocId(tenantId, chatId), f.canonical.id);
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Pessoa fictícia" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "site_chat" });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: "client", text: "Outra conversa fictícia", createdAt: new Date() });
  await oldEnqueue({ tenantId, chatId, messageId, dedupeKey: messageId, debounceMs: 0 });
  const own = await readConversationTurn(f.tenantId, f.chatId);
  assert.equal(own.data()?.tenantId, f.tenantId); assert.equal(own.data()?.latestMessageId, original.messageId);
});
