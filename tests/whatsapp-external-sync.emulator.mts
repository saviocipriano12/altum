import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { persistExternalWhatsAppMessage: importOwn } = await import("../lib/server/messaging/whatsapp-external-message.ts");
const { persistChatMessageAcknowledgement: acknowledge } = await import("../lib/server/chat-message-acknowledgement.ts");
const { recoverEvolutionMessageMedia: recover } = await import("../lib/server/messaging/evolution-media-recovery.ts");
const { resolveWhatsAppGroupName } = await import("../lib/server/messaging/whatsapp-group-name.ts");
const { parseEvolutionWebhook } = await import("../lib/server/messaging/evolution-webhook.ts");
const { listChatMessages } = await import("../lib/server/conversation-queries.ts");
const tenantId = `qa_external_${Date.now()}`;
const channel = { id: `${tenantId}_channel`, tenantId, provider: "evolution", phoneNumberId: `${tenantId}_channel`, source: "tenant_channel",
  accessToken: "fake-only", gatewayEndpoint: "https://evolution-qa.invalid", sessionId: "qa-instance", channelScope: "shared" } as import("../app/lib/server/whatsapp-channel.ts").WhatsAppChannelConfig;
function message(id: string) {
  const result = parseEvolutionWebhook({ event: "messages.upsert", data: { key: { id, remoteJid: "5511000000001@s.whatsapp.net", fromMe: true }, message: { conversation: `Mensagem ${id}` } } });
  if (result?.kind !== "message") throw new Error("Missing fixture");
  return result;
}
test.after(async () => { await adminDb.terminate(); });
test("native message repeated twice is one outgoing message and no inbound AI job", async () => {
  const first = await importOwn(channel, message("device-1"));
  const second = await importOwn(channel, message("device-1"));
  assert.equal(first.messageId, second.messageId);
  assert.equal(second.status, "ignored_known_outbound");
  assert.equal((await adminDb.collection("messages").doc(first.messageId).get()).data()?.sender, "agent");
  const jobs = await adminDb.collection("ai_jobs").where("tenantId", "==", tenantId).get();
  assert.equal(jobs.size, 0);
});
test("echo before acknowledgement merges into the queued message; replay after acknowledgement stays unique", async () => {
  const echo = await importOwn(channel, message("race-1"));
  const queued = adminDb.collection("messages").doc(`${tenantId}_queued`);
  await queued.set({ tenantId, chatId: echo.chatId, sender: "agent", status: "queued" });
  await acknowledge(queued, { tenantId, chatId: echo.chatId, sender: "agent", metaMessageId: "race-1",
    channelPhoneNumberId: channel.phoneNumberId, channelId: channel.id, status: "sent", deliveryStatus: "sent" }, { merge: true });
  assert.equal((await adminDb.collection("messages").doc(echo.messageId).get()).exists, false);
  const replay = await importOwn(channel, message("race-1"));
  assert.equal(replay.messageId, queued.id);
  const rows = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("metaMessageId", "==", "race-1").get();
  assert.equal(rows.size, 1);
});
test("acknowledgement first and a late native webhook preserve provider delivery and sender", async () => {
  const initial = await importOwn(channel, message("device-1"));
  const queued = adminDb.collection("messages").doc(`${tenantId}_delivered`);
  await acknowledge(queued, { tenantId, chatId: initial.chatId, sender: "agent", metaMessageId: "ack-first",
    channelPhoneNumberId: channel.phoneNumberId, channelId: channel.id, status: "delivered", deliveryStatus: "delivered" }, { merge: true });
  const late = await importOwn(channel, message("ack-first"));
  assert.equal(late.messageId, queued.id);
  assert.equal((await queued.get()).data()?.deliveryStatus, "delivered");
});
test("legacy image without stored URL is recovered from Evolution by message key and persisted", async () => {
  const initial = await importOwn(channel, message("device-1"));
  await adminDb.collection("tenant_channels").doc(channel.id).set({ tenantId, type: "whatsapp", status: "active", provider: "evolution", accessToken: "fake-only",
    metadata: { gatewayEndpoint: channel.gatewayEndpoint, sessionId: "qa-instance" } });
  const ref = adminDb.collection("messages").doc(`${tenantId}_legacy_image`);
  const data = { tenantId, chatId: initial.chatId, channel: "whatsapp", channelId: channel.id, inboundMetaMessageId: "old-image", type: "image", sender: "client", mediaMimeType: "image/png" };
  await ref.set(data);
  const original = globalThis.fetch;
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://evolution-qa.invalid/")) {
      assert.match(String(url), /getBase64FromMediaMessage\/qa-instance/);
      assert.equal(JSON.parse(String(init?.body)).message.key.id, "old-image");
      return Response.json({ base64: bytes.toString("base64"), mimetype: "image/png" });
    }
    return original(url, init);
  };
  try {
    const path = await recover({ tenantId, chatId: initial.chatId, messageId: ref.id, data });
    assert.ok(path);
    const [stored] = await adminStorage.bucket("demo-altum-qa-lab.appspot.com").file(path).download();
    assert.deepEqual(stored, bytes);
    assert.equal((await ref.get()).data()?.mediaProcessingStatus, "ready");
    assert.equal(await recover({ tenantId: "qa-other", chatId: initial.chatId, messageId: ref.id, data }), null);
  } finally { globalThis.fetch = original; }
});
test("generic group name is looked up once, then retained", async () => {
  const chatId = `${tenantId}_group`;
  const data = { tenantId, isGroup: true, channelId: channel.id, groupJid: "123456@g.us", contactName: "Grupo do WhatsApp" };
  await adminDb.collection("chats").doc(chatId).set(data);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://evolution-qa.invalid/group/")) { calls++; return Response.json({ subject: "CENTRAL ESB — teste fictício" }); }
    return original(url, init);
  };
  try {
    assert.equal(await resolveWhatsAppGroupName(tenantId, chatId, data), "CENTRAL ESB — teste fictício");
    const saved = (await adminDb.collection("chats").doc(chatId).get()).data()!;
    assert.equal(await resolveWhatsAppGroupName(tenantId, chatId, saved), "CENTRAL ESB — teste fictício");
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test("historical message query remains ordered after a late insertion", async () => {
  const initial = await importOwn(channel, message("device-1"));
  const ref = adminDb.collection("messages").doc(`${tenantId}_late`);
  await ref.set({ tenantId, chatId: initial.chatId, sender: "client", text: "Atrasada", createdAt: new Date(1000) });
  const page = await listChatMessages({ chatId: initial.chatId, direction: "initial", cursor: null, legacySinceMs: null, limit: 100 });
  assert.equal(page.docs.at(-1)?.id, ref.id);
});
