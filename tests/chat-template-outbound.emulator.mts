import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatTemplate, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { normalizeOutboundTemplate } = await import("../lib/server/chat-outbound-template.ts");
const { deliverAiConversationTemplate } = await import("../lib/server/ai/template-delivery.ts");
const { persistWhatsappStatusEvents } = await import("../lib/server/whatsapp-delivery-status.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { getConversationTurnDocId } = await import("../lib/server/ai/turn-coordinator.ts");
const tenantId = `qa_template_outbox_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let calls = 0, unknown = false, earlyRead = false, omitId = false;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-template-number\/messages$/);
  const payload = JSON.parse(String(options?.body));
  assert.equal(payload.type, "template"); assert.equal(payload.template.name, "qa_follow_up");
  assert.equal(payload.template.language.code, "pt_BR");
  assert.equal(payload.template.components.find((part: { type: string }) => part.type === "body").parameters[0].text, "Cliente QA");
  calls++;
  if (unknown) throw new Error("simulated lost template acknowledgement");
  if (earlyRead) await persistWhatsappStatusEvents({ tenantId, phoneNumberId: "qa-template-number", events: [{
    messageId: `wamid.qa-template-${calls}`, status: "read", timestampMs: Date.now(), recipientId: "5511000000089", errorCode: "", errorMessage: "",
  }] });
  return Response.json({ messages: omitId ? [] : [{ id: `wamid.qa-template-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-template-number", accessToken: "qa-only" });
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", channelId, contactPhone: "5511000000089" });
  return { tenantId, chatId, templateName: "qa_follow_up", bodyParams: ["Cliente QA"], languageCode: "pt_BR", clientRequestId: `template-${name}-0001`, actor: { id: "qa-owner", name: "Atendente QA" } };
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "whatsapp_delivery_events", "ai_conversation_turns"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});
test("concurrent template retries persist one operation and one visible message before delivery", async () => {
  const input = await fixture("valid");
  const before = calls;
  const results = await Promise.all(Array.from({ length: 8 }, () => queueTenantChatTemplate(input)));
  assert.equal(new Set(results.map((row) => row.jobId)).size, 1);
  const accepted = results[0];
  const original = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(original.type, "template"); assert.equal(original.deliveryStatus, "queued"); assert.equal(calls, before);
  assert.equal(original.text.startsWith("Template:"), true, "queued preview cannot claim successful delivery");
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "sent");
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(message.createdAt.toMillis(), original.createdAt.toMillis()); assert.match(message.metaMessageId, /^wamid.qa-template-/);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  for (const patch of [{ bodyParams: ["Outro cliente"] }, { languageCode: "en_US" }, { templateName: "other_template" }, { headerMedia: { type: "image" as const, link: "https://qa.invalid/image.png" } }]) {
    await assert.rejects(queueTenantChatTemplate({ ...input, ...patch }), /outro conteudo/);
  }
});
test("unknown template result remains pending confirmation without blind retry", async () => {
  const input = await fixture("unknown"); const before = calls;
  const accepted = await queueTenantChatTemplate(input);
  unknown = true;
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
    await queueTenantChatTemplate(input);
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "skipped");
    assert.equal(calls, before + 1);
    assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.status, "pending_confirmation");
  } finally { unknown = false; }
});
test("template HTTP success without a provider message ID is uncertain, not a completed operation", async () => {
  const input = await fixture("missing_id"), accepted = await queueTenantChatTemplate(input), before = calls; omitId = true;
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
    await queueTenantChatTemplate(input); await processChatOutboundJobs({ jobId: accepted.jobId }); assert.equal(calls, before + 1);
    assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.status, "pending_confirmation");
  } finally { omitId = false; }
});
test("tampered accepted template is rejected before provider", async () => {
  const input = await fixture("tampered"); const before = calls;
  const accepted = await queueTenantChatTemplate(input);
  await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).update({ bodyParams: ["Changed"] });
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "dead_letter");
  assert.equal(calls, before);
});
test("template validation never shifts empty variables or silently drops headers", () => {
  for (const body of [null, [], { templateName: "a".repeat(513) }, { templateName: "qa", bodyParams: ["", "second"] },
    { templateName: "qa", bodyParams: Array(21).fill("value") }, { templateName: "qa", headerMedia: { type: "audio", link: "https://qa.invalid/audio" } },
    { templateName: "qa", headerMedia: { type: "image", link: "javascript:alert(1)" } }]) assert.throws(() => normalizeOutboundTemplate(body));
  assert.equal(normalizeOutboundTemplate({ templateName: " QA Follow Up " }).templateName, "qa_follow_up");
});

test("read receipt preceding template acknowledgement is preserved on the same visible message", async () => {
  const input = await fixture("early_read");
  const accepted = await queueTenantChatTemplate(input);
  earlyRead = true;
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "sent");
    const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
    assert.equal(message.status, "read"); assert.equal(message.deliveryStatus, "read");
  } finally { earlyRead = false; }
});

async function aiFixture(name: string) {
  const base = await fixture(`ai_${name}`);
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, base.chatId)).set({ tenantId, chatId: base.chatId, aiEnabled: true, humanOwnerUserId: null });
  await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, base.chatId)).set({ tenantId, chatId: base.chatId, latestMessageId: "qa-source-001" });
  return { tenantId, chatId: base.chatId, sourceMessageId: "qa-source-001", agentName: "Assistente QA",
    templateName: base.templateName, bodyParams: base.bodyParams, languageCode: base.languageCode };
}

test("AI closed-window template is durable, preserves authorship and does not pause or assign to AI", async () => {
  const input = await aiFixture("valid"); const before = calls;
  const first = await deliverAiConversationTemplate(input);
  assert.equal((await deliverAiConversationTemplate(input)).messageId, first.messageId);
  assert.equal(calls, before + 1);
  const message = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
  assert.equal(message.aiGenerated, true); assert.equal(message.senderName, input.agentName); assert.equal(message.type, "template");
  assert.equal(message.text, first.persistedText);
  const state = (await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()!;
  assert.equal(state.aiEnabled, true); assert.equal(state.humanOwnerUserId, null);
  assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.queueStatus, "unassigned");
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  await assert.rejects(deliverAiConversationTemplate({ ...input, bodyParams: ["Changed"] }), /outro conteudo/);
  assert.equal(calls, before + 1);
});

test("unknown AI template confirmation never falls back to a second send", async () => {
  const input = await aiFixture("unknown"); const before = calls;
  unknown = true;
  try {
    await assert.rejects(deliverAiConversationTemplate(input), /entrega ainda nao foi confirmada/);
    await assert.rejects(deliverAiConversationTemplate(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before + 1);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "reconciliation_required");
  } finally { unknown = false; }
});

test("AI template blocked behind a predecessor respects a newer inbound turn or human pause", async () => {
  for (const reason of ["turn", "pause"] as const) {
    const input = await aiFixture(reason); const before = calls;
    const predecessorId = `${input.chatId}_predecessor`;
    await adminDb.collection("chat_outbound_jobs").doc(predecessorId).set({ tenantId, chatId: input.chatId, status: "ready" });
    await adminDb.collection("chats").doc(input.chatId).update({ outboundTailJobId: predecessorId });
    await assert.rejects(deliverAiConversationTemplate(input), /entrega ainda nao foi confirmada/);
    const rows = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    const pending = rows.docs.find(row => row.id !== predecessorId)!;
    assert.equal(pending.data().status, "ready");
    if (reason === "turn") await adminDb.collection("ai_conversation_turns_v2").doc(getConversationTurnDocId(tenantId, input.chatId)).update({ latestMessageId: "qa-new-source-002" });
    else await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, humanOwnerUserId: "qa-human" });
    await adminDb.collection("chat_outbound_jobs").doc(predecessorId).update({ status: "completed" });
    assert.equal((await processChatOutboundJobs({ jobId: pending.id })).results[0]?.status, "dead_letter");
    assert.match((await pending.ref.get()).data()?.error, reason === "turn" ? /nova mensagem/ : /pausada/);
    assert.equal(calls, before);
  }
});
