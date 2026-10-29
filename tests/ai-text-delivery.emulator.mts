import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deliverAiConversationText } = await import("../lib/server/ai/text-delivery.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { queueTenantChatText, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenantId = `qa_ai_outbox_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let calls = 0, loseAck = false;
let evolutionMode: "network" | "server" | "legacy" | null = null;
let evolutionCalls = 0;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  if (target.hostname === "evolution-qa.invalid") {
    assert.ok(evolutionMode, "unexpected Evolution call");
    assert.equal(target.pathname, "/message/sendText/qa-instance");
    evolutionCalls++;
    if (evolutionMode === "network") throw new Error("text validation HTTP 400 network timeout");
    if (evolutionMode === "server") return Response.json({ message: "textMessage required: validation failed" }, { status: 500 });
    const body = JSON.parse(String(options?.body));
    if (body.text) return Response.json({ message: 'instance requires property "textMessage"' }, { status: 422 });
    assert.equal(typeof body.textMessage?.text, "string");
    return Response.json({ key: { id: `qa-evolution-${evolutionCalls}` } });
  }
  assert.equal(target.hostname, "graph.facebook.com");
  assert.match(target.pathname, /\/qa-ai-number\/messages$/);
  assert.equal(JSON.parse(String(options?.body)).type, "text");
  calls++;
  if (loseAck) throw new Error("simulated unknown provider outcome");
  return Response.json({ messages: [{ id: `wamid.qa-ai-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active",
  provider: "meta_whatsapp", phoneNumberId: "qa-ai-number", accessToken: "qa-only", channelScope: "shared" });
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date(),
    commerceConversationContext: { productId: "qa-product", selection: { Tamanho: "G" } } });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, chatId)).set({ tenantId, chatId, latestMessageId: "qa-inbound-001" });
  return { tenantId, chatId, sourceMessageId: "qa-inbound-001", slot: "primary" as const, text: "Modelo ficticio\nTamanho G\nhttps://qa.invalid/product", agentName: "Assistente QA" };
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["chat_outbound_jobs", "messages", "chat_outbound_locks", "chat_state", "chats", "tenant_channels", "crm_observation_jobs", "ai_conversation_turns"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});
test("AI primary/secondary/checkout use durable slots without pausing AI or losing commerce context", async () => {
  const input = await fixture("valid");
  const before = calls;
  const freshUntil = new Date(Date.now() + 30000);
  const primary = await deliverAiConversationText({ ...input, freshUntil });
  assert.equal((await deliverAiConversationText(input)).messageId, primary.messageId);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(primary.jobId).get()).data()?.aiDeliveryExpiresAt.toMillis(), freshUntil.getTime());
  assert.equal(calls, before + 1);
  for (const slot of ["secondary", "checkout"] as const) await deliverAiConversationText({ ...input, slot });
  assert.equal(calls, before + 3);
  const state = (await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()!;
  assert.equal(state.aiEnabled, true); assert.equal(state.humanOwnerUserId, null);
  const message = (await adminDb.collection("messages").doc(primary.messageId).get()).data()!;
  assert.equal(message.aiGenerated, true); assert.equal(message.text, input.text); assert.equal(message.senderName, input.agentName);
  const observations = await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).get();
  assert.ok(observations.docs.some((row) => row.data().messageId === primary.messageId && row.data().source === "ai_outbound"));
  const chat = (await adminDb.collection("chats").doc(input.chatId).get()).data()!;
  assert.equal(chat.commerceConversationContext.productId, "qa-product"); assert.equal(chat.queueStatus, "unassigned");
  await assert.rejects(deliverAiConversationText({ ...input, text: "Changed content" }), /outro conteudo/);
  assert.equal(calls, before + 3);
});
test("unknown AI provider outcome is never blindly resent or marked completed", async () => {
  const input = await fixture("unknown");
  const before = calls;
  loseAck = true;
  try {
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before + 1);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "reconciliation_required");
  } finally { loseAck = false; }
});
test("human enqueue continues to pause AI by default", async () => {
  const input = await fixture("human");
  await queueTenantChatText({ ...input, actor: { id: "qa-human", name: "Atendente" }, clientRequestId: "human-default-0001" });
  assert.equal((await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()?.aiEnabled, false);
});
test("AI queued text respects an existing human pause instead of sending over the attendant", async () => {
  const input = await fixture("paused");
  const before = calls;
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, humanOwnerUserId: "qa-human" });
  await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
  assert.equal(calls, before);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.docs[0].data().status, "dead_letter");
  assert.match(jobs.docs[0].data().error, /Resposta automatica pausada/);
});

test("new inbound turn while queued makes the old response ineligible for delivery", async () => {
  const input = await fixture("superseded");
  const before = calls;
  const predecessorId = `${input.chatId}_predecessor`;
  await adminDb.collection("chat_outbound_jobs").doc(predecessorId).set({ tenantId, chatId: input.chatId, status: "ready" });
  await adminDb.collection("chats").doc(input.chatId).update({ outboundTailJobId: predecessorId });
  await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const pending = jobs.docs.find((row) => row.id !== predecessorId)!;
  assert.equal(pending.data().status, "ready"); assert.equal(pending.data().aiSourceMessageId, input.sourceMessageId);
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId)).update({ latestMessageId: "qa-new-inbound-002" });
  await adminDb.collection("chat_outbound_jobs").doc(predecessorId).update({ status: "completed" });
  assert.equal((await processChatOutboundJobs({ jobId: pending.id })).results[0]?.status, "dead_letter");
  assert.match((await pending.ref.get()).data()?.error, /nova mensagem do cliente/);
  assert.equal(calls, before);
});

test("expired verified catalog response is blocked and replay cannot renew its accepted deadline", async () => {
  const input = await fixture("expired");
  const before = calls;
  const deadline = new Date(Date.now() - 1000);
  await assert.rejects(deliverAiConversationText({ ...input, freshUntil: deadline }), /entrega ainda nao foi confirmada/);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 1);
  const job = jobs.docs[0];
  assert.equal(job.data().status, "dead_letter"); assert.match(job.data().error, /preco ou estoque/);
  await assert.rejects(deliverAiConversationText({ ...input, freshUntil: new Date(Date.now() + 30000) }), /entrega ainda nao foi confirmada/);
  assert.equal((await job.ref.get()).data()?.aiDeliveryExpiresAt.toMillis(), deadline.getTime());
  assert.equal(calls, before);
});

test("foreign coordinator scope cannot authorize delivery", async () => {
  const input = await fixture("foreign-turn");
  const before = calls;
  const turn = adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId));
  await turn.update({ tenantId: `${tenantId}_foreign` });
  try {
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before);
  } finally { await turn.update({ tenantId }); }
});

test("site primary response uses one durable local message without an external request", async () => {
  const { readFile } = await import("node:fs/promises");
  const agent = await readFile("lib/server/ai/agent.ts", "utf8");
  assert.match(agent, /else if \(\(isMetaConversation && metaChannel && metaRecipientId\) \|\| chatChannel === "site_chat"\) \{\s*const sent = await deliverAiConversationText/);
  const input = await fixture("site-primary"), before = calls;
  await adminDb.collection("chats").doc(input.chatId).update({ channel: "site_chat", channelId: null });
  const accepted = await deliverAiConversationText(input);
  assert.equal((await deliverAiConversationText(input)).messageId, accepted.messageId);
  await processChatOutboundJobs({ jobId: accepted.jobId });
  assert.equal(calls, before);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.status, "completed"); assert.equal(job.providerAttemptStartedAt, undefined);
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, 1); assert.equal(messages.docs[0].data().text, input.text);
});

for (const mode of ["network", "server", "legacy"] as const) {
  test(`Evolution ${mode}: outbox replay cannot turn one logical message into another send`, async () => {
    const input = await fixture(`evolution-${mode}`);
    const evolutionChannelId = `${tenantId}_evolution_${mode}`;
    await adminDb.collection("tenant_channels").doc(evolutionChannelId).set({ tenantId, type: "whatsapp", status: "active",
      provider: "evolution", accessToken: "qa-fake", channelScope: "shared",
      metadata: { gatewayEndpoint: "https://evolution-qa.invalid", sessionId: "qa-instance" } });
    await adminDb.collection("chats").doc(input.chatId).update({ channelId: evolutionChannelId });
    evolutionMode = mode;
    const before = evolutionCalls;
    try {
      if (mode === "legacy") {
        const result = await deliverAiConversationText(input);
        assert.equal((await deliverAiConversationText(input)).jobId, result.jobId);
        assert.equal(evolutionCalls, before + 2); // First payload rejected; one accepted legacy payload.
      } else {
        await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
        await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
        assert.equal(evolutionCalls, before + 1);
      }
      const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
      assert.equal(jobs.size, 1);
      const job = jobs.docs[0];
      assert.equal(job.data().status, mode === "legacy" ? "completed" : "reconciliation_required");
      await processChatOutboundJobs({ jobId: job.id });
      assert.equal(evolutionCalls, before + (mode === "legacy" ? 2 : 1));
      const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
      assert.equal(messages.size, 1);
    } finally { evolutionMode = null; }
  });
}
