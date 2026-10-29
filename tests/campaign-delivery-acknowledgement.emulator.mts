import assert from "node:assert/strict";
import { after, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { persistCampaignDeliveryAcknowledgement: acknowledge } = await import("../lib/server/campaign-delivery-acknowledgement.ts");
const { persistChatMessageAcknowledgement: acknowledgeMessage } = await import("../lib/server/chat-message-acknowledgement.ts");
const { persistWhatsappStatusEvents: persist, whatsappDeliveryStateRef } = await import("../lib/server/whatsapp-delivery-status.ts");
const tenantId = `qa_campaign_receipts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const phoneNumberId = "qa-campaign-number";
const event = (messageId: string, status: "read" | "sent" | "delivered" = "read") => ({ messageId, status, timestampMs: 4000, recipientId: "qa-target", errorCode: "", errorMessage: "" });
const data = (externalId: string) => ({ tenantId, campaignId: "qa-campaign", chatId: `${tenantId}_chat`, metaMessageId: externalId,
  channelPhoneNumberId: phoneNumberId, status: "sent", intendedText: "Texto ficticio original" });
after(async () => {
  for (const collection of ["messages", "chats", "tenant_channels", "outbound_campaign_deliveries", "whatsapp_delivery_events"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "in", [tenantId, `${tenantId}_other`]).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});
test("campaign binding recovers early read and shares the receipt with its chat message", async () => {
  const id = "early-campaign";
  await persist({ tenantId, phoneNumberId, events: [event(id)] });
  await adminDb.collection("chats").doc(data(id).chatId).set({ tenantId, channel: "whatsapp" });
  const message = adminDb.collection("messages").doc(`${tenantId}_message`);
  await acknowledgeMessage(message, { ...data(id), sender: "agent", deliveryStatus: "sent" }, { merge: true });
  const ref = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_early`);
  await acknowledge(ref, data(id));
  assert.equal((await ref.get()).data()?.status, "read");
  assert.equal((await ref.get()).data()?.deliveryAt.toMillis(), 4000);
  assert.equal((await ref.get()).data()?.intendedText, "Texto ficticio original");
  const state = (await whatsappDeliveryStateRef(tenantId, phoneNumberId, id).get()).data();
  assert.equal(state?.localMessageId, message.id);
  assert.equal(state?.localCampaignDeliveryId, ref.id);
  await persist({ tenantId, phoneNumberId, events: [event(id, "sent")] });
  assert.equal((await message.get()).data()?.status, "read");
  assert.equal((await ref.get()).data()?.status, "read");
});
test("simultaneous campaign persistence and webhook converge without another receipt", async () => {
  for (let index = 0; index < 4; index += 1) {
    const id = `campaign-race-${index}`;
    const ref = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_${id}`);
    await Promise.all(index % 2 ? [acknowledge(ref, data(id)), persist({ tenantId, phoneNumberId, events: [event(id)] })]
      : [persist({ tenantId, phoneNumberId, events: [event(id)] }), acknowledge(ref, data(id))]);
    assert.equal((await ref.get()).data()?.deliveryStatus, "read");
  }
});
test("repeated campaign acceptance preserves read and rejects a second binding or foreign tenant", async () => {
  const ref = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_repeat`);
  await acknowledge(ref, data("repeat"));
  await persist({ tenantId, phoneNumberId, events: [event("repeat")] });
  await acknowledge(ref, data("repeat"));
  assert.equal((await ref.get()).data()?.status, "read");
  const other = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_duplicate`);
  await assert.rejects(acknowledge(other, data("repeat")), /outra entrega/);
  assert.equal((await other.get()).exists, false);
  await assert.rejects(acknowledge(ref, { ...data("repeat"), tenantId: `${tenantId}_other` }), /empresa/);
  assert.equal((await ref.get()).data()?.tenantId, tenantId);
});
test("legacy campaign sender is resolved from its own channel, never guessed", async () => {
  const channelId = `${tenantId}_channel`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, phoneNumberId });
  const base = { tenantId, metaMessageId: "legacy-campaign", status: "sent" };
  const known = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_legacy_known`);
  const unknown = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_legacy_unknown`);
  const foreign = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_legacy_foreign`);
  await known.set({ ...base, channelId });
  await unknown.set(base);
  await foreign.set({ ...base, channelPhoneNumberId: "different-number" });
  await persist({ tenantId, phoneNumberId, events: [event("legacy-campaign")] });
  assert.equal((await known.get()).data()?.status, "read");
  assert.equal((await unknown.get()).data()?.status, "sent");
  assert.equal((await foreign.get()).data()?.status, "sent");
});
