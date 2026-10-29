import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: process.env.QA_META_FIRESTORE_HOST || "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: process.env.QA_META_AUTH_HOST || "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", META_APP_SECRET: "qa-native-only" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { POST } = await import(process.env.QA_META_WEBHOOK_MODULE || "../app/api/webhooks/meta/route.ts");
const { persistChatMessageAcknowledgement } = await import(process.env.QA_META_ACK_MODULE || "../lib/server/chat-message-acknowledgement.ts");
const { recoverRecentMetaInbox } = await import("../lib/server/meta-inbox-recovery.ts");
const id = `qa_native_${Date.now()}`, other = `${id}_other`, original = fetch;
let graphReads = 0;
globalThis.fetch = async (input, init) => {
  const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (u.hostname === "127.0.0.1") return original(input, init);
  assert.equal(u.hostname, "graph.facebook.com"); assert.ok(!init?.method || init.method === "GET", "No customer sends");
  graphReads++;
  assert.equal(u.searchParams.get("user_id"), "customer", "Target recovery must ask for this customer, independent of recent conversation limit");
  return Response.json({ data: [{ id: "provider-conversation", participants: { data: [{ id: "business" }, { id: "customer" }] }, messages: { data: [
    { id: "recent-history", message: "Native app reply", from: { id: "business" }, to: { data: [{ id: "customer" }] }, created_time: new Date().toISOString() },
    { id: "missing-content", message: "", from: { id: "business" }, to: { data: [{ id: "customer" }] }, created_time: new Date().toISOString() },
  ] } }] });
};
test.before(async () => {
  await adminDb.collection("tenant_channels").doc(id).set({ tenantId: id, type: "instagram", status: "active", pageId: "page", externalAccountId: "business", accessToken: "qa" });
  await adminDb.collection("chats").doc(id).set({ tenantId: id, channel: "instagram", channelId: id, contactExternalId: "customer", status: "open", ownerId: "seller", assignedTo: "seller", lastClientMessageAt: new Date(Date.now() - 10000) });
  await adminDb.collection("chats").doc(other).set({ tenantId: other, channel: "instagram", channelId: id, contactExternalId: "customer" });
});
test.after(async () => { globalThis.fetch = original; await adminDb.terminate(); });
function request(mid: string, options: { sender?: string; valid?: boolean; audio?: boolean } = {}) {
  const body = JSON.stringify({ object: "instagram", entry: [{ id: "business", messaging: [{ sender: { id: options.sender || "business" }, recipient: { id: "customer" }, timestamp: Date.now(), message: {
    mid, is_echo: true, ...(options.audio ? { attachments: [{ type: "audio", payload: { url: "https://lookaside.fbsbx.com/qa-audio" } }] } : { text: "Resposta pelo Instagram" }),
  } }] }] });
  return new Request("http://qa/meta", { method: "POST", headers: { "x-hub-signature-256": "sha256=" + createHmac("sha256", options.valid === false ? "invalid" : "qa-native-only").update(body).digest("hex") }, body });
}
async function rows(mid: string) { return (await adminDb.collection("messages").where("chatId", "==", id).where("metaMessageId", "==", mid).get()).docs; }
async function ack(mid: string) {
  return persistChatMessageAcknowledgement(adminDb.collection("messages").doc(id + mid), { tenantId: id, chatId: id, channel: "instagram", channelId: id, sender: "agent", metaMessageId: mid, text: "Altum send", status: "sent", deliveryStatus: "sent" }, { merge: true });
}
test("native text and voice arrive immediately as outgoing, without AI or assignment changes", async () => {
  assert.equal((await POST(request("native-text"))).status, 200);
  assert.equal((await POST(request("native-audio", { audio: true }))).status, 200);
  assert.equal((await rows("native-text"))[0].data().sender, "agent");
  assert.equal((await rows("native-audio"))[0].data().type, "audio");
  const chat = (await adminDb.collection("chats").doc(id).get()).data()!;
  assert.equal(chat.ownerId, "seller"); assert.equal(chat.assignedTo, "seller"); assert.ok(chat.lastAgentMessageAt);
  assert.equal(graphReads, 0);
  for (const collection of ["ai_jobs", "chat_outbound_jobs", "automation_execution_logs", "leads"]) assert.equal((await adminDb.collection(collection).where("tenantId", "==", id).get()).size, 0);
});
test("duplicate native events remain a single bubble", async () => {
  await Promise.all([POST(request("repeated")), POST(request("repeated"))]); assert.equal((await rows("repeated")).length, 1);
});
test("Altum API receipt and native echo reconcile in either arrival order, including concurrent delivery", async () => {
  await POST(request("echo-first")); await ack("echo-first"); assert.equal((await rows("echo-first")).length, 1);
  await ack("ack-first"); await POST(request("ack-first")); assert.equal((await rows("ack-first")).length, 1);
  await Promise.all([POST(request("concurrent")), ack("concurrent")]); assert.equal((await rows("concurrent")).length, 1);
});
test("forged signatures and echo senders cannot create native replies", async () => {
  assert.equal((await POST(request("forged", { valid: false }))).status, 401);
  await POST(request("wrong-sender", { sender: "foreign" }));
  assert.equal((await rows("forged")).length, 0); assert.equal((await rows("wrong-sender")).length, 0);
});
test("targeted history fills even recent native replies without the previous minute-long exclusion", async () => {
  const result = await recoverRecentMetaInbox(id, { chatId: id }); assert.equal(result.synced, 2);
  assert.equal((await rows("recent-history"))[0].data().sender, "agent");
  assert.equal((await rows("missing-content"))[0].data().contentUnavailable, true);
  await POST(request("missing-content"));
  const restored = await rows("missing-content"); assert.equal(restored.length, 1);
  assert.equal(restored[0].data().contentUnavailable, false); assert.equal(restored[0].data().text, "Resposta pelo Instagram");
  await assert.rejects(recoverRecentMetaInbox(id, { chatId: other }), /target_invalid/);
});
