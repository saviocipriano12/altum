import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { after, before, test } from "node:test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-delivery-webhook-http");
const db = getFirestore(app);
const tenantId = `qa_http_webhook_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const phoneNumberId = `${tenantId}_number`;
const secret = "qa-only-signature-secret-no-real-account";
const externalId = `${tenantId}_external`;
const chatId = `${tenantId}_chat`;
const messageId = `${tenantId}_message`;
function body(status = "read") {
  return JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: {
    metadata: { phone_number_id: phoneNumberId }, statuses: [{ id: externalId, status, timestamp: "1792000000", recipient_id: "qa-recipient" }],
  } }] }] });
}
const sign = (text: string) => `sha256=${createHmac("sha256", secret).update(text).digest("hex")}`;
const post = (text: string, signature?: string) => fetch("http://127.0.0.1:3199/api/webhooks/whatsapp", {
  method: "POST", headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) },
  body: text, signal: AbortSignal.timeout(90000),
});
before(async () => {
  await db.collection("tenant_channels").doc(`${tenantId}_channel`).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active",
    phoneNumberId, accessToken: "qa-invalid-token-never-used", appSecret: secret });
  await db.collection("chats").doc(chatId).set({ tenantId, channelPhoneNumberId: phoneNumberId, outboundTailJobId: "qa-job" });
  await db.collection("messages").doc(messageId).set({ tenantId, chatId, channelPhoneNumberId: phoneNumberId,
    metaMessageId: externalId, sender: "agent", status: "sent", deliveryStatus: "sent", outboundJobId: "qa-job", text: "Texto ficticio preservado" });
  await db.collection("messages").doc(`${tenantId}_foreign`).set({ tenantId: `${tenantId}_other`, channelPhoneNumberId: phoneNumberId,
    metaMessageId: externalId, sender: "agent", status: "sent" });
});
after(async () => {
  for (const collection of ["tenant_channels", "messages", "chats", "whatsapp_delivery_events"]) {
    const rows = await db.collection(collection).where("tenantId", "in", [tenantId, `${tenantId}_other`]).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await db.terminate(); await deleteApp(app);
});

test("HTTP webhook rejects missing, invalid and tampered signatures without changing messages", async () => {
  const text = body();
  assert.equal((await post(text)).status, 401);
  assert.equal((await post(text, "sha256=invalid")).status, 401);
  assert.equal((await post(body("delivered"), sign(text))).status, 401);
  assert.equal((await db.collection("messages").doc(messageId).get()).data()?.status, "sent");
  assert.equal((await db.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).get()).size, 0);
});
test("HTTP signed read receipt updates one message and chat, never a foreign tenant", async () => {
  const text = body();
  const response = await post(text, sign(text));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.status, "ok_status_update");
  assert.equal(result.tenantId, tenantId);
  assert.equal(result.matchedMessages, 1);
  assert.equal((await db.collection("messages").doc(messageId).get()).data()?.status, "read");
  assert.equal((await db.collection("messages").doc(messageId).get()).data()?.text, "Texto ficticio preservado");
  assert.equal((await db.collection("chats").doc(chatId).get()).data()?.lastOutboundDeliveryStatus, "read");
  assert.equal((await db.collection("messages").doc(`${tenantId}_foreign`).get()).data()?.status, "sent");
});
test("HTTP signed duplicates and delayed sent do not regress or enqueue any work", async () => {
  for (const status of ["read", "sent", "read"]) {
    const text = body(status);
    assert.equal((await post(text, sign(text))).status, 200);
  }
  assert.equal((await db.collection("messages").doc(messageId).get()).data()?.deliveryStatus, "read");
  assert.equal((await db.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).where("recordType", "==", "event").get()).size, 2);
  for (const collection of ["chat_outbound_jobs", "ai_jobs", "crm_observation_jobs"]) {
    assert.equal((await db.collection(collection).where("tenantId", "==", tenantId).get()).size, 0);
  }
});
