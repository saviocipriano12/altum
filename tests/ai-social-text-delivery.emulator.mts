import test, { after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deliverAiConversationText } = await import("../lib/server/ai/text-delivery.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const tenantId = `qa_ai_social_${Date.now()}`;
const originalFetch = globalThis.fetch;
let expectedToken = "", expectedText = "", calls = 0, unknown = false;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/me\/messages$/);
  assert.equal(new Headers(options?.headers).get("authorization"), `Bearer ${expectedToken}`);
  const payload = JSON.parse(String(options?.body));
  assert.equal(payload.recipient.id, "qa-shared-recipient-id"); assert.equal(payload.message.text, expectedText);
  calls++;
  if (unknown) throw new Error("simulated lost social acknowledgement");
  return Response.json({ message_id: `mid.qa-social-${calls}` });
};
async function fixture(type: "instagram" | "messenger", name: string) {
  const chatId = `${tenantId}_${type}_${name}`, channelId = `${tenantId}_${type}_channel`;
  const token = `qa-only-${type}`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type, status: "active", accessToken: token, externalAccountId: `qa-account-${type}` });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: type, channelId,
    channelExternalAccountId: `qa-account-${type}`, contactExternalId: "qa-shared-recipient-id", assignedTo: "qa-human-owner" });
  const stateId = getChatStateDocId(tenantId, chatId);
  await adminDb.collection("chat_state").doc(stateId).set({ tenantId, chatId, aiEnabled: true });
  return { tenantId, chatId, sourceMessageId: "qa-source-001", slot: "primary" as const,
    text: `Resposta ${type}\nhttps://qa.invalid/product`, agentName: "Assistente ficticio", token, stateId };
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["messages", "chats", "chat_outbound_jobs", "chat_outbound_locks", "chat_state", "tenant_channels", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});
test("Instagram and Messenger retain channel identity and deduplicate primary/secondary deliveries", async () => {
  for (const type of ["instagram", "messenger"] as const) {
    const input = await fixture(type, "valid"); expectedToken = input.token; expectedText = input.text;
    const before = calls;
    const first = await deliverAiConversationText(input);
    assert.equal((await deliverAiConversationText(input)).messageId, first.messageId);
    const secondary = await deliverAiConversationText({ ...input, slot: "secondary" });
    assert.notEqual(secondary.messageId, first.messageId); assert.equal(calls, before + 2);
    const row = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
    assert.equal(row.channel, type); assert.equal(row.aiGenerated, true); assert.match(row.metaMessageId, /^mid.qa-social-/);
    assert.equal(row.text, input.text);
    assert.equal((await adminDb.collection("chat_state").doc(input.stateId).get()).data()?.aiEnabled, true);
    assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.assignedTo, "qa-human-owner");
  }
});
test("unknown social delivery remains pending confirmation and never resends automatically", async () => {
  const input = await fixture("instagram", "unknown"); expectedToken = input.token; expectedText = input.text;
  const before = calls; unknown = true;
  try {
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before + 1);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "reconciliation_required");
  } finally { unknown = false; }
});
test("wrong channel or account cannot silently fall back to another active tenant channel", async () => {
  for (const field of ["channelId", "channelExternalAccountId"]) {
    const input = await fixture("messenger", `wrong-${field}`);
    await adminDb.collection("chats").doc(input.chatId).update({ [field]: "qa-missing-or-foreign-id" });
    const before = calls;
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.docs[0].data().status, "dead_letter");
    assert.equal(jobs.docs[0].data().errorCode, "PREFLIGHT_PERMANENT");
  }
});

test("a channel document owned by another tenant cannot be substituted for the original social account", async () => {
  const input = await fixture("instagram", "foreign-channel");
  const id = `${tenantId}_foreign_channel`;
  const foreign = adminDb.collection("tenant_channels").doc(id);
  await foreign.set({ tenantId: `${tenantId}_foreign`, type: "instagram", status: "active", accessToken: "qa-foreign-only", externalAccountId: "qa-foreign-account" });
  const before = calls;
  try {
    await adminDb.collection("chats").doc(input.chatId).update({ channelId: id });
    await assert.rejects(deliverAiConversationText(input), /entrega ainda nao foi confirmada/);
    assert.equal(calls, before);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.docs[0].data().status, "dead_letter");
  } finally { await foreign.delete(); }
});
