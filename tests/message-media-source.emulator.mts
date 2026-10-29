import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { cacheInboundMessageMedia } = await import("../lib/server/ai/multimodal.ts");
const { TenantAccessError, assertTenantAccess } = await import("../lib/server/tenant.ts");
const { assertChatCommercialAccess } = await import("../lib/server/commercial-access.ts");
const { captureMessageMediaSource, assertMessageMediaSource, writeMessageMediaReference, markMessageMediaCacheFailed, MessageMediaSourceChanged, currentMediaReference } = await import("../lib/server/message-media-source.ts");
const tenantId = `qa_media_source_${Date.now()}`;
const refs: FirebaseFirestore.DocumentReference[] = [];
async function fixture() {
  const id = `${tenantId}_${refs.length}`, chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(id);
  refs.push(chat, message);
  await chat.set({tenantId, channel: "whatsapp", contactPhone: "5511999999999"});
  await message.set({tenantId, chatId: chat.id, type: "image", mediaUrl: "https://qa.invalid/original.png", sender: "client"});
  const source = await captureMessageMediaSource({tenantId, chatId: chat.id, messageId: message.id});
  const patch = {mediaUrl: `chat-media/${tenantId}/${chat.id}/immutable.png`, mediaMimeType: "image/png", mediaSize: 3, mediaProcessingStatus: "ready"};
  return {chat, message, source, patch};
}
after(async () => {
  mock.restoreAll();
  await Promise.all(refs.map(ref => ref.delete()));
  const prefix = `chat-media/${tenantId}/`, [files] = await adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET).getFiles({prefix});
  assert.ok(files.every(file => file.name.startsWith(prefix)));
  await Promise.all(files.map(file => file.delete()));
  await adminDb.terminate();
});
test("late download cannot attach to an identical recreated message", async () => {
  const {message, source, patch} = await fixture(), data = (await message.get()).data()!;
  await message.delete(); await message.set(data);
  await assert.rejects(writeMessageMediaReference(source, patch, "source"), MessageMediaSourceChanged);
  assert.equal((await message.get()).data()?.mediaUrl, data.mediaUrl);
  assert.equal(await markMessageMediaCacheFailed(source, "old failure"), false);
});
test("deleted message is never resurrected by success or failure", async () => {
  const {message, source, patch} = await fixture(); await message.delete();
  await assert.rejects(writeMessageMediaReference(source, patch, "source"), MessageMediaSourceChanged);
  assert.equal(await markMessageMediaCacheFailed(source, "old failure"), false);
  assert.equal((await message.get()).exists, false);
});
test("attachment replacement rejects old result while receipt updates remain compatible", async () => {
  const {message, source, patch} = await fixture();
  await message.update({status: "delivered", text: "caption corrected"});
  await assertMessageMediaSource(source);
  await message.update({mediaUrl: "https://qa.invalid/replacement.png"});
  await assert.rejects(writeMessageMediaReference(source, patch, "source"), MessageMediaSourceChanged);
});
test("recreated conversation rejects an otherwise unchanged message", async () => {
  const {chat, source, patch} = await fixture(), data = (await chat.get()).data()!;
  await chat.delete(); await chat.set(data);
  await assert.rejects(writeMessageMediaReference(source, patch, "source"), MessageMediaSourceChanged);
});
test("concurrent identical results converge and old failure cannot overwrite accepted cache", async () => {
  const {message, source, patch} = await fixture();
  await Promise.all([writeMessageMediaReference(source, patch, "source"), writeMessageMediaReference(source, patch, "source")]);
  assert.equal(await markMessageMediaCacheFailed(source, "late failure"), false);
  const accepted = await message.get();
  assert.equal(accepted.data()?.mediaUrl, patch.mediaUrl);
  assert.equal(accepted.data()?.mediaProcessingStatus, "ready");
  assert.equal(currentMediaReference(accepted, "source"), true);
});
test("cross-conversation storage paths are refused without changing the message", async () => {
  const {message, source, patch} = await fixture();
  await assert.rejects(writeMessageMediaReference(source, {...patch, mediaUrl: `chat-media/${tenantId}/other/file.png`}, "source"), /Arquivo fora/);
  assert.equal((await message.get()).data()?.mediaUrl, "https://qa.invalid/original.png");
});
test("actual inbound cache rejects recreation while download is in flight", async () => {
  const {message, source} = await fixture(), original = source.message.data()!;
  let downloads = 0;
  const fetchMock = mock.method(globalThis, "fetch", async (url: unknown) => {
    assert.equal(String(url), original.mediaUrl); downloads++;
    await message.delete(); await message.set({...original, text: "new generation"});
    return new Response(new Uint8Array([137, 80, 78, 71]), {headers: {"content-type": "image/png"}});
  });
  try {
    await assert.rejects(cacheInboundMessageMedia({tenantId, chatId: source.chatId, messageId: message.id, message: original, source}), MessageMediaSourceChanged);
    assert.equal(downloads, 1);
    assert.equal((await message.get()).data()?.mediaUrl, original.mediaUrl);
    assert.equal((await message.get()).data()?.text, "new generation");
  } finally { fetchMock.mock.restore(); }
});
test("legacy caller with stale attachment URL is refused before download", async () => {
  const {message, source} = await fixture();
  await message.update({mediaUrl: "https://qa.invalid/new.png"});
  let downloads = 0;
  const fetchMock = mock.method(globalThis, "fetch", async () => { downloads++; throw new Error("Unexpected external transport"); });
  try {
    await assert.rejects(cacheInboundMessageMedia({tenantId, chatId: source.chatId, messageId: message.id, message: source.message.data()!}), MessageMediaSourceChanged);
    assert.equal(downloads, 0);
  } finally { fetchMock.mock.restore(); }
});
async function sellerFixture() {
  const fixtureData = await fixture(), uid = `${fixtureData.message.id}_seller`;
  const user = adminDb.collection("users").doc(uid), member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`), entitlements = adminDb.collection("tenant_entitlements").doc(tenantId);
  refs.push(user, member, entitlements);
  await user.set({tenantId, uid, role: "client_agent", status: "active"});
  await member.set({tenantId, userId: uid, role: "client_agent", status: "active", capabilities: []});
  await entitlements.set({tenantId, mode: "custom", modules: {inbox: true}, limits: {}});
  await fixtureData.chat.update({ownerId: uid});
  const source = await captureMessageMediaSource({tenantId, chatId: fixtureData.chat.id, messageId: fixtureData.message.id, userId: uid});
  return {...fixtureData, source, uid};
}
test("seller transferred off a team conversation cannot commit an in-flight cache", async () => {
  const {chat, source, patch} = await sellerFixture();
  await chat.update({ownerId: `${tenantId}_other`});
  await assert.rejects(writeMessageMediaReference(source, patch, "source"), TenantAccessError);
  assert.equal(await markMessageMediaCacheFailed(source, "late failure"), false);
});
test("current personal channel owner prevails over stale chat scope and ownership", async () => {
  const {chat, message, uid} = await sellerFixture();
  const channel = adminDb.collection("tenant_channels").doc(`${message.id}_channel`); refs.push(channel);
  await channel.set({tenantId, channelScope: "personal", ownerUserId: uid, type: "whatsapp", provider: "evolution"});
  await chat.update({channelId: channel.id, channelScope: "team", channelOwnerUserId: uid});
  const source = await captureMessageMediaSource({tenantId, chatId: chat.id, messageId: message.id, userId: uid});
  await channel.update({ownerUserId: `${tenantId}_other`});
  await assert.rejects(assertMessageMediaSource(source), TenantAccessError);
  await assert.rejects(captureMessageMediaSource({tenantId, chatId: chat.id, messageId: message.id, userId: uid}), TenantAccessError);
  const membership = await assertTenantAccess(uid, tenantId);
  await assert.rejects(assertChatCommercialAccess({tenantId, chatId: chat.id, userId: uid, membership}), TenantAccessError);
});
