import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-turn-identity", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-turn-identity",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueIncomingMessageJob } = await import("../lib/server/ai/queue.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenants = new Set<string>(), originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "jobs", "ai_conversation_turns", "ai_conversation_turns_v2", "crm_observation_jobs", "metrics", "tenant_entitlements", "ai_operational_alerts"]) {
    assert.ok(tenantId.startsWith("qa_turn_identity_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
for (const variant of ["tenant_boundary", "chat_punctuation"] as const) test(`real incoming admission preserves both independent coordinators under ${variant}`, async () => {
  const suffix = randomUUID().replaceAll("-", ""), firstTenant = `qa_turn_identity_${suffix}`, secondTenant = variant === "tenant_boundary" ? `${firstTenant}_part` : firstTenant;
  const firstChat = variant === "tenant_boundary" ? `part_${suffix}_leaf` : `qa_${suffix}:chat`, secondChat = variant === "tenant_boundary" ? `${suffix}_leaf` : `qa_${suffix}?chat`;
  const inputs = [{ tenantId: firstTenant, chatId: firstChat, messageId: `qa_${suffix}_first` }, { tenantId: secondTenant, chatId: secondChat, messageId: `qa_${suffix}_second` }];
  for (const input of inputs) {
    tenants.add(input.tenantId);
    const leadId = `${input.messageId}_lead`;
    await adminDb.collection("leads").doc(leadId).set({ tenantId: input.tenantId, nome: "Pessoa fictícia", pipelineStage: "captado" });
    await adminDb.collection("chats").doc(input.chatId).set({ tenantId: input.tenantId, leadId, channel: "site_chat", status: "open", lastClientMessageAt: new Date() });
    await adminDb.collection("messages").doc(input.messageId).set({ ...input, leadId, sender: "client", text: "Mensagem fictícia", createdAt: new Date() });
    const result = await enqueueIncomingMessageJob({ ...input, source: "qa_turn_identity", dedupeKey: input.messageId, debounceMs: 60_000 }); assert.equal(result.created, true);
  }
  for (const input of inputs) {
    const turn = await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(input.tenantId, input.chatId)).get();
    assert.equal(turn.data()?.tenantId, input.tenantId); assert.equal(turn.data()?.chatId, input.chatId); assert.equal(turn.data()?.latestMessageId, input.messageId);
  }
});
