import assert from "node:assert/strict";
import { after, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { persistWhatsappStatusEvents: persist } = await import("../lib/server/whatsapp-delivery-status.ts");
const tenantId = `qa_receipts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const phoneNumberId = "qa-receipt-number";
const event = (messageId: string, status: "sent" | "delivered" | "read" | "failed", timestampMs = 1000) => ({
  messageId, status, timestampMs, recipientId: "qa-recipient", errorCode: "", errorMessage: "",
});
async function seed(name: string) {
  const chat = adminDb.collection("chats").doc(`${tenantId}_${name}`);
  const message = adminDb.collection("messages").doc(`${tenantId}_${name}`);
  await chat.set({ tenantId, channelPhoneNumberId: phoneNumberId, outboundTailJobId: name });
  await message.set({ tenantId, chatId: chat.id, channelPhoneNumberId: phoneNumberId,
    outboundJobId: name, sender: "agent", metaMessageId: name, status: "sent", deliveryStatus: "sent" });
  return { chat, message };
}
after(async () => {
  for (const collection of ["messages", "chats", "outbound_campaign_deliveries", "whatsapp_delivery_events"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "in", [tenantId, `${tenantId}_other`]).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("read cannot regress with delayed sent, delivered or failed events", async () => {
  const { message, chat } = await seed("ordered");
  for (const status of ["read", "sent", "delivered", "failed"] as const) {
    await persist({ tenantId, phoneNumberId, events: [event("ordered", status)] });
  }
  assert.equal((await message.get()).data()?.deliveryStatus, "read");
  assert.equal((await chat.get()).data()?.lastOutboundDeliveryStatus, "read");
  assert.equal((await adminDb.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).where("metaMessageId", "==", "ordered").where("recordType", "==", "event").get()).size, 4);
});
test("concurrent events converge to read and duplicate receipts share an event", async () => {
  const { message, chat } = await seed("concurrent");
  await Promise.all((["read", "sent", "delivered", "failed", "read", "sent"] as const).map((status) =>
    persist({ tenantId, phoneNumberId, events: [event("concurrent", status)] })));
  assert.equal((await message.get()).data()?.deliveryStatus, "read");
  assert.equal((await chat.get()).data()?.lastOutboundDeliveryStatus, "read");
  assert.equal((await adminDb.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).where("metaMessageId", "==", "concurrent").where("recordType", "==", "event").get()).size, 4);
});
test("same external ID does not cross tenant, number or inbound message", async () => {
  const { message } = await seed("scope");
  const foreign = adminDb.collection("messages").doc(`${tenantId}_foreign`);
  const otherNumber = adminDb.collection("messages").doc(`${tenantId}_number`);
  const inbound = adminDb.collection("messages").doc(`${tenantId}_inbound`);
  const originals = [
    { tenantId: `${tenantId}_other`, metaMessageId: "scope", status: "sent", sender: "agent", channelPhoneNumberId: phoneNumberId },
    { tenantId, metaMessageId: "scope", status: "sent", sender: "agent", channelPhoneNumberId: "different-number" },
    { tenantId, metaMessageId: "scope", status: "sent", sender: "client", channelPhoneNumberId: phoneNumberId },
  ];
  const refs = [foreign, otherNumber, inbound];
  await Promise.all(refs.map((ref, index) => ref.set(originals[index])));
  await persist({ tenantId, phoneNumberId, events: [event("scope", "read")] });
  assert.equal((await message.get()).data()?.status, "read");
  for (let index = 0; index < refs.length; index += 1) assert.deepEqual((await refs[index].get()).data(), originals[index]);
});
test("old message receipt does not replace the current chat tail status", async () => {
  const { message, chat } = await seed("old");
  await chat.update({ outboundTailJobId: "new", lastOutboundMetaMessageId: "new", lastOutboundDeliveryStatus: "sent" });
  await persist({ tenantId, phoneNumberId, events: [event("old", "read")] });
  assert.equal((await message.get()).data()?.status, "read");
  assert.equal((await chat.get()).data()?.lastOutboundMetaMessageId, "new");
  assert.equal((await chat.get()).data()?.lastOutboundDeliveryStatus, "sent");
});
test("campaign deliveries are monotonic and unmatched receipts are retained", async () => {
  const ref = adminDb.collection("outbound_campaign_deliveries").doc(`${tenantId}_campaign`);
  await ref.set({ tenantId, metaMessageId: "campaign", channelPhoneNumberId: phoneNumberId, status: "sent" });
  await persist({ tenantId, phoneNumberId, events: [event("campaign", "read"), event("campaign", "sent")] });
  assert.equal((await ref.get()).data()?.status, "read");
  const result = await persist({ tenantId, phoneNumberId, events: [event("early", "read")] });
  assert.equal(result.matchedMessages, 0);
  assert.equal((await adminDb.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).where("metaMessageId", "==", "early").where("recordType", "==", "event").get()).size, 1);
});

test("duplicate event preserves first receipt timestamp and delivered evidence supersedes failure", async () => {
  const { message } = await seed("retry-events");
  const input = { tenantId, phoneNumberId, events: [event("retry-events", "failed")] };
  await persist(input);
  const rows = await adminDb.collection("whatsapp_delivery_events").where("tenantId", "==", tenantId).where("metaMessageId", "==", "retry-events").where("recordType", "==", "event").get();
  const receipt = rows.docs[0];
  const firstCreatedAt = receipt.data().createdAt.toMillis();
  await persist(input);
  assert.equal((await receipt.ref.get()).data()?.createdAt.toMillis(), firstCreatedAt);
  await persist({ tenantId, phoneNumberId, events: [event("retry-events", "sent")] });
  assert.equal((await message.get()).data()?.status, "failed");
  await persist({ tenantId, phoneNumberId, events: [event("retry-events", "delivered")] });
  assert.equal((await message.get()).data()?.status, "delivered");
});

test("receipt before provider binding is recovered by acknowledgement without another webhook", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  const chat = adminDb.collection("chats").doc(`${tenantId}_early-bind`);
  const message = adminDb.collection("messages").doc(`${tenantId}_early-bind`);
  await chat.set({ tenantId, outboundTailJobId: "early-bind" });
  await message.set({ tenantId, chatId: chat.id, sender: "agent", status: "sending", deliveryStatus: "queued", outboundJobId: "early-bind" });
  const result = await persist({ tenantId, phoneNumberId, events: [event("early-bind", "read", 1234000)] });
  assert.equal(result.matchedMessages, 0);
  await acknowledge(message, { tenantId, chatId: chat.id, sender: "agent", status: "sent", deliveryStatus: "sent",
    metaMessageId: "early-bind", channelPhoneNumberId: phoneNumberId }, { merge: true });
  assert.equal((await message.get()).data()?.deliveryStatus, "read");
  assert.equal((await message.get()).data()?.deliveryAt.toMillis(), 1234000);
  assert.equal((await chat.get()).data()?.lastOutboundDeliveryStatus, "read");
});

test("simultaneous receipt and binding converge regardless of query timing", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  for (let index = 0; index < 6; index += 1) {
    const id = `race-bind-${index}`;
    const chat = adminDb.collection("chats").doc(`${tenantId}_${id}`);
    const message = adminDb.collection("messages").doc(`${tenantId}_${id}`);
    await chat.set({ tenantId, outboundTailJobId: id });
    await message.set({ tenantId, chatId: chat.id, sender: "agent", status: "sending", deliveryStatus: "queued", outboundJobId: id });
    const args = { tenantId, chatId: chat.id, sender: "agent", status: "sent", deliveryStatus: "sent", metaMessageId: id, channelPhoneNumberId: phoneNumberId };
    await Promise.all(index % 2 ? [acknowledge(message, args, { merge: true }), persist({ tenantId, phoneNumberId, events: [event(id, "read")] })]
      : [persist({ tenantId, phoneNumberId, events: [event(id, "read")] }), acknowledge(message, args, { merge: true })]);
    assert.equal((await message.get()).data()?.deliveryStatus, "read");
    assert.equal((await chat.get()).data()?.lastOutboundDeliveryStatus, "read");
  }
});

test("early receipts stay isolated by sender number and reject binding to a second message", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  const chat = adminDb.collection("chats").doc(`${tenantId}_scoped-bind`);
  await chat.set({ tenantId });
  const message = adminDb.collection("messages").doc(`${tenantId}_scoped-bind`);
  const args = { tenantId, chatId: chat.id, sender: "agent", status: "sent", deliveryStatus: "sent", metaMessageId: "scoped-bind", channelPhoneNumberId: phoneNumberId };
  await persist({ tenantId, phoneNumberId: "other-number", events: [event("scoped-bind", "read")] });
  await acknowledge(message, args, { merge: true });
  assert.equal((await message.get()).data()?.deliveryStatus, "sent");
  const other = adminDb.collection("messages").doc(`${tenantId}_second-bind`);
  await assert.rejects(acknowledge(other, args, { merge: true }), /outra mensagem/);
  assert.equal((await other.get()).exists, false);
});

test("legacy receipts beyond one page recover read and ignore other tenant or number", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  const chat = adminDb.collection("chats").doc(`${tenantId}_legacy-chat`);
  await chat.set({ tenantId });
  const writer = adminDb.bulkWriter();
  for (let index = 0; index < 205; index += 1) {
    writer.set(adminDb.collection("whatsapp_delivery_events").doc(`${tenantId}_legacy_${String(index).padStart(4, "0")}`), {
      tenantId, phoneNumberId, metaMessageId: "legacy-paged", status: index === 204 ? "read" : "sent",
      recipientId: "legacy-recipient", deliveryAt: new Date(5000 + index), createdAt: new Date(10000),
    });
  }
  await writer.close();
  const message = adminDb.collection("messages").doc(`${tenantId}_legacy-bound`);
  await acknowledge(message, { tenantId, chatId: chat.id, sender: "agent", status: "sent", deliveryStatus: "sent",
    metaMessageId: "legacy-paged", channelPhoneNumberId: phoneNumberId }, { merge: true });
  assert.equal((await message.get()).data()?.deliveryStatus, "read");
  assert.equal((await message.get()).data()?.deliveryAt.toMillis(), 5204);
  assert.equal((await message.get()).data()?.deliveryRecipientId, "legacy-recipient");
  for (const suffix of ["other-tenant", "other-number"] as const) {
    await adminDb.collection("whatsapp_delivery_events").doc(`${tenantId}_${suffix}_legacy`).set({
      tenantId: suffix === "other-tenant" ? `${tenantId}_other` : tenantId,
      phoneNumberId: suffix === "other-number" ? "foreign-number" : phoneNumberId,
      metaMessageId: suffix, status: "read", deliveryAt: new Date(1000),
    });
    const other = adminDb.collection("messages").doc(`${tenantId}_${suffix}_message`);
    await acknowledge(other, { tenantId, chatId: chat.id, sender: "agent", status: "sent", deliveryStatus: "sent",
      metaMessageId: suffix, channelPhoneNumberId: phoneNumberId }, { merge: true });
    assert.equal((await other.get()).data()?.deliveryStatus, "sent");
  }
});

test("preexisting summary folds legacy failure details once and accepts a later read", async () => {
  const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
  const chat = adminDb.collection("chats").doc(`${tenantId}_legacy-failure-chat`);
  await chat.set({ tenantId });
  const { whatsappDeliveryStateRef } = await import("../lib/server/whatsapp-delivery-status.ts");
  const messageId = "legacy-failure";
  const summary = whatsappDeliveryStateRef(tenantId, phoneNumberId, messageId);
  await summary.set({ tenantId, phoneNumberId, metaMessageId: messageId, recordType: "state", status: "sent" });
  await adminDb.collection("whatsapp_delivery_events").doc(`${tenantId}_legacy_failure`).set({
    tenantId, phoneNumberId, metaMessageId: messageId, status: "failed", deliveryAt: new Date(765000),
    errorCode: "legacy-131", errorMessage: "Recusa ficticia antiga", recipientId: "legacy-target",
  });
  const message = adminDb.collection("messages").doc(`${tenantId}_failure_bound`);
  const args = { tenantId, chatId: chat.id, sender: "agent", metaMessageId: messageId,
    channelPhoneNumberId: phoneNumberId, status: "sent", deliveryStatus: "sent", deliveryError: "", deliveryErrorCode: "" };
  await acknowledge(message, args, { merge: true });
  assert.equal((await message.get()).data()?.deliveryStatus, "failed");
  assert.equal((await message.get()).data()?.deliveryErrorCode, "legacy-131");
  assert.equal((await message.get()).data()?.deliveryError, "Recusa ficticia antiga");
  assert.equal((await message.get()).data()?.deliveryRecipientId, "legacy-target");
  assert.equal((await summary.get()).data()?.legacyHistoryReconciled, true);
  assert.equal((await summary.get()).data()?.historyReceiptCount, 1);
  await acknowledge(message, args, { merge: true });
  assert.equal((await message.get()).data()?.deliveryStatus, "failed");
  assert.equal((await summary.get()).data()?.historyReceiptCount, 1);
  await persist({ tenantId, phoneNumberId, events: [event(messageId, "read", 766000)] });
  assert.equal((await message.get()).data()?.deliveryStatus, "read");
});
