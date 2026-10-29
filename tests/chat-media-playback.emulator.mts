import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb, adminAuth, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { cacheInboundMessageMedia } = await import("../lib/server/ai/multimodal.ts");
const { createMobileAudioRenditions } = await import("../lib/server/audio-transcode.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/media/route.ts");
const tenantId = `qa_playback_${Date.now()}`, uid = `${tenantId}_owner`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_audio`;
const bucket = adminStorage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
const ref = adminDb.collection("messages").doc(messageId);
let token = "", sourcePath = "";
let original: Buffer = Buffer.alloc(0);
function wav() {
  const bytes = Buffer.alloc(44 + 8000); bytes.write("RIFF", 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(8000, 40);
  return bytes;
}
before(async () => {
  original = (await createMobileAudioRenditions({ source: wav(), extension: "wav" })).whatsappVoice;
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaPlayback2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_owner", name: "QA", status: "active" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_owner", status: "active" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { inbox: true }, limits: {} });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", ownerId: uid });
  await ref.set({ tenantId, chatId, type: "audio", mediaName: "original.ogg", status: "queued", sender: "agent" });
  sourcePath = (await cacheInboundMessageMedia({ tenantId, chatId, messageId, message: {
    type: "audio", mediaUrl: `data:audio/ogg;base64,${original.toString("base64")}`, mediaMimeType: "audio/ogg",
  } }))!;
  const result = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaPlayback2026!", returnSecureToken: true }),
  }); assert.equal(result.status, 200); token = (await result.json()).idToken;
});
after(async () => {
  mock.restoreAll();
  for (const collection of ["messages", "chats", "users", "tenant_users", "tenant_entitlements"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await row.ref.delete();
  }
  const prefix = `chat-media/${tenantId}/`, [files] = await bucket.getFiles({ prefix });
  assert.ok(files.every(file => file.name.startsWith(prefix))); await Promise.all(files.map(file => file.delete()));
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function read(query = "") { return GET(new Request(`http://localhost/media${query}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId, chatId, messageId }) }); }
test("server-only bucket configuration receives media and concurrent browser playback preserves the original queued source", async () => {
  const results = await Promise.all([read(), read()]);
  for (const result of results) { assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), "audio/mpeg"); assert.equal(Buffer.from(await result.arrayBuffer()).subarray(0, 3).toString(), "ID3"); }
  const data = (await ref.get()).data()!;
  assert.equal(data.mediaUrl, sourcePath); assert.equal(data.mediaMimeType, "audio/ogg"); assert.equal(data.status, "queued");
  assert.ok(data.mediaPlaybackUrl); assert.notEqual(data.mediaPlaybackUrl, sourcePath);
  assert.deepEqual((await bucket.file(sourcePath).download())[0], original);
  const firstPlayback = data.mediaPlaybackUrl;
  assert.equal((await read()).status, 200); assert.equal((await ref.get()).data()?.mediaPlaybackUrl, firstPlayback);
});
test("legacy resolve=1 still returns a playback URL and MP3 MIME", async () => {
  const prototype = Object.getPrototypeOf(bucket.file(sourcePath));
  const signing = mock.method(prototype, "getSignedUrl", async () => ["https://qa.invalid/playback.mp3"]);
  try { const result = await read("?resolve=1"); assert.equal(result.status, 200); const body = await result.json(); assert.equal(body.contentType, "audio/mpeg"); assert.equal(body.url, "https://qa.invalid/playback.mp3"); }
  finally { signing.mock.restore(); }
});
test("access revoked while signing a playback URL prevents returning that URL", async () => {
  const prototype = Object.getPrototypeOf(bucket.file(sourcePath));
  const signing = mock.method(prototype, "getSignedUrl", async () => {
    await adminDb.collection("users").doc(uid).update({status: "blocked"});
    return ["https://qa.invalid/must-not-return.mp3"];
  });
  try {
    const result = await read("?resolve=1");
    assert.equal(result.status, 403);
    assert.equal((await result.text()).includes("must-not-return"), false);
  } finally {
    signing.mock.restore();
    await adminDb.collection("users").doc(uid).update({status: "active"});
  }
});
