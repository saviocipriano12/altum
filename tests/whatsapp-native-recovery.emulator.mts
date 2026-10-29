import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { reconcileExternalWhatsAppMessages: reconcile } = await import("../lib/server/messaging/whatsapp-external-reconciliation.ts");
const tenantId = `qa_native_recovery_${Date.now()}`, channelId = `${tenantId}_channel`, chatId = `${tenantId}_chat`, phone = "5511000000011";
const original = globalThis.fetch;
test.after(async () => { globalThis.fetch = original; await adminDb.terminate(); });
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "evolution", status: "active", accessToken: "fictitious", metadata: { gatewayEndpoint: "https://native-recovery.invalid", sessionId: "test" } });
await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: phone, contactName: "Fictício", createdAt: new Date(), lastMessageTime: new Date() });
await adminDb.collection("messages").doc(`${chatId}_pc`).set({ tenantId, chatId, channelId, metaMessageId: "pc-audio", sender: "agent", type: "audio", createdAt: new Date() });
function row(id: string, other = false) { return { key: { id, fromMe: true, remoteJid: "123456@lid", remoteJidAlt: `${other ? "5511000000099" : phone}@s.whatsapp.net` },
  messageTimestamp: Math.floor(Date.now() / 1000), message: { audioMessage: { seconds: 4, mimetype: "audio/ogg; codecs=opus", ptt: true } } }; }
test("mobile LID audio is recovered into the existing conversation exactly once, with no sending or AI", async () => {
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://native-recovery.invalid/")) return original(url, init);
    calls++; assert.match(String(url), /\/chat\/findMessages\/test$/);
    assert.equal(init?.method, "POST");
    return Response.json({ messages: { records: [row("mobile-audio"), row("pc-audio"), row("foreign-audio", true)] } });
  };
  const result = await reconcile(tenantId, chatId); assert.equal(result.imported, 1);
  const saved = await adminDb.collection("messages").where("chatId", "==", chatId).get();
  assert.equal(saved.size, 2); const audio = saved.docs.find(doc => doc.data().metaMessageId === "mobile-audio")!.data();
  assert.equal(audio.sender, "agent"); assert.equal(audio.mediaDuration, 4); assert.equal(audio.source, "whatsapp_external");
  assert.equal(audio.mediaRecovery.key.remoteJid, "123456@lid");
  assert.equal((await adminDb.collection("ai_jobs").where("tenantId", "==", tenantId).get()).size, 0);
  assert.equal((await reconcile(tenantId, chatId)).status, "throttled"); assert.equal(calls, 1);
  await adminDb.collection("chat_external_sync").doc(`${tenantId}_${chatId}`).update({ nextAttemptAt: new Date(0) });
  assert.equal((await reconcile(tenantId, chatId)).imported, 0);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", chatId).get()).size, 2);
});
test("a foreign tenant or a removed channel cannot be recovered through another account", async () => {
  assert.equal((await reconcile("foreign", chatId)).status, "not_applicable");
  await adminDb.collection("chats").doc(chatId).update({ channelId: "removed" });
  assert.equal((await reconcile(tenantId, chatId)).status, "not_applicable");
});
test("deleting a conversation also moves its synchronization state into the trash", async () => {
  const { deleteTenantChat } = await import("../lib/server/tenant-data-deletion.ts");
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, dataRetention: { trashDays: 30 } });
  assert.equal((await deleteTenantChat({ tenantId, chatId })).deleted, true);
  assert.equal((await adminDb.collection("chat_external_sync").doc(`${tenantId}_${chatId}`).get()).exists, false);
});
