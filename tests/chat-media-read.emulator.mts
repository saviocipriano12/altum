import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb, adminAuth, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/[messageId]/media/route.ts");
type StorageFile = import("@google-cloud/storage").File;
const tenantId = `qa_media_read_${Date.now()}`, uid = `${tenantId}_agent`, chatId = `${tenantId}_chat`;
const originalFetch = globalThis.fetch;
let token = "", contentType = "image/png", externalReads = 0, cacheAttempts = 0, providerUnavailable = false, allowCacheWrites = false;
const bytes = Buffer.from("QA transport fixture: not a codec/playback acceptance test");

before(async () => {
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return originalFetch(url, init);
    externalReads++;
    if (target.hostname === "evolution-qa.invalid") {
      assert.match(target.pathname, /getBase64FromMediaMessage/);
      return Promise.resolve(Response.json({ base64: bytes.toString("base64"), mimetype: "image/png" }));
    }
    if (target.hostname === "graph.facebook.com" && target.pathname.endsWith("/qa-media-id")) {
      return Promise.resolve(Response.json({ url: "https://qa-media.invalid/original", mime_type: contentType, file_size: bytes.length }));
    }
    assert.equal(target.href, "https://qa-media.invalid/original", "No actual external transport allowed");
    if (providerUnavailable) return Promise.resolve(new Response(null, { status: 502 }));
    return Promise.resolve(new Response(bytes, { headers: { "content-type": contentType, "content-length": String(bytes.length) } }));
  };
  // Obtain the actual constructor used by firebase-admin. A separate ESM import
  // can expose a different prototype from the SDK's CJS Storage implementation.
  const filePrototype = Object.getPrototypeOf(adminStorage.bucket("demo-altum-qa-lab.appspot.com").file("qa-prototype-only"));
  const save = filePrototype.save as StorageFile["save"];
  mock.method(filePrototype, "save", function(this: StorageFile, ...args: Parameters<StorageFile["save"]>) {
    if (this.name.startsWith(`chat-media/${tenantId}/`)) {
      cacheAttempts++;
      if (allowCacheWrites) return Reflect.apply(save, this, args);
      throw Object.assign(new Error("QA_CACHE_WRITE_UNAVAILABLE"), { code: 503 });
    }
    throw new Error(`Unexpected fixture storage write (${args.length} arguments)`);
  });
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaMediaReadOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_agent", status: "active", name: "QA" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { inbox: true }, limits: {} });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, ownerId: uid, channel: "whatsapp" });
  await adminDb.collection("tenant_channels").doc(`${tenantId}_channel`).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: `${tenantId}_number`, accessToken: "qa-only" });
  const auth = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaMediaReadOnly2026!", returnSecureToken: true }),
  });
  assert.equal(auth.status, 200); token = (await auth.json()).idToken;
});

after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  assert.equal(process.env.STORAGE_EMULATOR_HOST, "http://127.0.0.1:9199");
  const prefix = `chat-media/${tenantId}/`;
  const [files] = await adminStorage.bucket("demo-altum-qa-lab.appspot.com").getFiles({ prefix });
  assert.ok(files.every(file => file.name.startsWith(prefix)), "Only this fixture's objects can be removed");
  await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  for (const collection of ["messages", "chats", "tenant_channels", "tenant_entitlements", "tenant_users", "users"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await row.ref.delete();
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});

function read(messageId: string, authenticated = true, query = "") {
  return GET(new Request(`http://127.0.0.1/qa-media-read${query}`, { headers: authenticated ? { authorization: `Bearer ${token}` } : {} }),
    { params: Promise.resolve({ tenantId, chatId, messageId }) });
}
async function message(name: string, extra: Record<string, unknown> = {}) {
  const ref = adminDb.collection("messages").doc(`${tenantId}_${name}`);
  await ref.set({ tenantId, chatId, type: name, mediaId: "qa-media-id", channelPhoneNumberId: `${tenantId}_number`, ...extra });
  return ref;
}

for (const [type, mime] of [["image", "image/png"], ["audio", "audio/mpeg"], ["video", "video/mp4"]]) {
  test(`${type} already downloaded from WhatsApp is readable even if its optional cache cannot be written`, async () => {
    contentType = mime; const ref = await message(type), before = externalReads, beforeCache = cacheAttempts;
    const result = await read(ref.id);
    assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), mime);
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
    assert.equal(externalReads, before + 2); assert.equal(cacheAttempts, beforeCache + 1);
    assert.equal((await ref.get()).data()?.mediaUrl, undefined, "A failed cache must never be advertised as persisted");
  });
}

for (const [type, mime] of [["image", "image/png"], ["audio", "audio/mpeg"], ["video", "video/mp4"]]) {
  test(`${type} URL resolution falls back to authenticated original bytes when cache is unavailable`, async () => {
    contentType = mime;
    const ref = await message(`resolve-${type}`, { type }), before = externalReads, beforeCache = cacheAttempts;
    const result = await read(ref.id, true, "?resolve=1");
    assert.equal(result.status, 200);
    assert.equal(result.headers.get("content-type"), mime, "No JSON success URL may be invented for a failed cache");
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
    assert.equal(externalReads, before + 2); assert.equal(cacheAttempts, beforeCache + 1);
    const data = (await ref.get()).data();
    assert.equal(data?.mediaUrl, undefined); assert.equal(data?.mediaId, "qa-media-id");
  });
}

test("missing authentication cannot download or cache media", async () => {
  const ref = await message("no-auth"), before = externalReads;
  assert.equal((await read(ref.id, false)).status, 401); assert.equal(externalReads, before);
});
test("a foreign message cannot download or cache media", async () => {
  const ref = await message("foreign-chat", { chatId: `${tenantId}_different_chat` }), before = externalReads;
  assert.equal((await read(ref.id)).status, 403); assert.equal(externalReads, before);
});
test("a conversation belonging to another seller cannot download or cache media", async () => {
  const ref = await message("foreign-owner"), before = externalReads;
  await adminDb.collection("chats").doc(chatId).update({ ownerId: `${tenantId}_other` });
  try { assert.equal((await read(ref.id)).status, 403); assert.equal(externalReads, before); }
  finally { await adminDb.collection("chats").doc(chatId).update({ ownerId: uid }); }
});
test("a foreign tenant message cannot download or cache media", async () => {
  const ref = await message("foreign-tenant", { tenantId: `${tenantId}_other` }), before = externalReads;
  try { assert.equal((await read(ref.id)).status, 403); assert.equal(externalReads, before); }
  finally { await ref.delete(); }
});
test("a channel belonging to another tenant cannot download or cache media", async () => {
  const ref = await message("foreign-channel"), before = externalReads;
  const channelRef = adminDb.collection("tenant_channels").doc(`${tenantId}_channel`);
  await channelRef.update({ tenantId: `${tenantId}_other` });
  try { assert.equal((await read(ref.id)).status, 404); assert.equal(externalReads, before); }
  finally { await channelRef.update({ tenantId }); }
});
test("an upstream download failure is not masked as a successful attachment", async () => {
  const ref = await message("upstream-failed"), before = cacheAttempts;
  providerUnavailable = true;
  try {
    assert.equal((await read(ref.id)).status, 500); assert.equal(cacheAttempts, before);
    assert.equal((await ref.get()).data()?.mediaUrl, undefined);
  } finally { providerUnavailable = false; }
});

test("Evolution image remains readable when its optional storage cache fails", async () => {
  const channelId = `${tenantId}_evolution`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "evolution", status: "active", accessToken: "qa-only",
    metadata: { gatewayEndpoint: "https://evolution-qa.invalid", sessionId: "qa-instance" } });
  await adminDb.collection("chats").doc(chatId).update({ channelId, contactPhone: "5511000000044" });
  const ref = await message("evolution-image", { type: "image", channel: "whatsapp", channelId, mediaId: null, inboundMetaMessageId: "qa-image", mediaMimeType: "image/png" });
  const before = externalReads;
  try {
    const result = await read(ref.id);
    assert.equal(result.status, 200); assert.equal(result.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes); assert.equal(externalReads, before + 1);
    assert.equal((await ref.get()).data()?.mediaUrl, undefined);
  } finally { await adminDb.collection("chats").doc(chatId).update({ channelId: null }); }
});

for (const [type, mime] of [["image", "image/png"], ["audio", "audio/mpeg"], ["video", "video/mp4"]]) {
  test(`${type} successful cache can be reopened without another WhatsApp download`, async () => {
    contentType = mime;
    const ref = await message(`cached-${type}`, { type }), before = externalReads, beforeCache = cacheAttempts;
    allowCacheWrites = true;
    try {
      const first = await read(ref.id);
      assert.equal(first.status, 200); assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
      const savedPath = (await ref.get()).data()?.mediaUrl;
      assert.ok(typeof savedPath === "string" && savedPath.startsWith(`chat-media/${tenantId}/${chatId}/`));
      assert.equal((await adminStorage.bucket("demo-altum-qa-lab.appspot.com").file(savedPath).exists())[0], true);
      assert.equal(externalReads, before + 2); assert.equal(cacheAttempts, beforeCache + 1);
      providerUnavailable = true;
      const reopened = await read(ref.id);
      assert.equal(reopened.status, 200); assert.equal(reopened.headers.get("content-type"), mime);
      assert.deepEqual(Buffer.from(await reopened.arrayBuffer()), bytes);
      assert.equal(externalReads, before + 2, "Cached reads cannot depend on the original provider");
      assert.equal(cacheAttempts, beforeCache + 1, "Reopening cannot rewrite the source object");
    } finally { allowCacheWrites = false; providerUnavailable = false; }
  });
}
