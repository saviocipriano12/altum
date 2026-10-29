import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatMediaBuffer, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_audio_dispatch_${Date.now()}`, channelId = `${tenantId}_channel`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const originalFetch = globalThis.fetch;
let uploads = 0, sends = 0, loseMessageAck = false;
const prototype = Object.getPrototypeOf(bucket.file("qa-fixture"));
mock.method(prototype, "getSignedUrl", async () => { throw new Error("Audio must not require URL signing"); });
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com");
  const pending = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(pending.size, 1);
  assert.ok(pending.docs[0].data().providerAttemptStartedAt, "fence must precede upload as well as message submission");
  if (target.pathname.endsWith("/qa-audio-number/media")) {
    const form = options?.body as FormData;
    const file = form.get("file") as File;
    assert.equal(file.name, "voice.ogg"); assert.match(file.type, /audio\/ogg/);
    const buffer = Buffer.from(await file.arrayBuffer());
    assert.equal(buffer.subarray(0, 4).toString(), "OggS"); assert.ok(buffer.includes(Buffer.from("OpusHead")));
    uploads++; return Response.json({ id: `qa-audio-upload-${uploads}` });
  }
  assert.match(target.pathname, /\/qa-audio-number\/messages$/);
  const payload = JSON.parse(String(options?.body));
  assert.equal(payload.type, "audio"); assert.equal(payload.audio.voice, true);
  assert.equal(payload.audio.id, `qa-audio-upload-${uploads}`); assert.equal(payload.audio.link, undefined);
  sends++;
  if (loseMessageAck) throw new Error("simulated lost audio message confirmation");
  return Response.json({ messages: [{ id: `wamid.qa-audio-${sends}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-audio-number", accessToken: "qa-only" });
function wav() {
  const rate = 24000, samples = rate / 2, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 2000), 44 + i * 2);
  return buffer;
}
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000086", lastClientMessageAt: new Date() });
  return { tenantId, chatId, mediaType: "audio" as const, filename: "source.wav", contentType: "audio/wav", buffer: wav(),
    clientRequestId: `audio-${name}-0001`, actor: { id: "qa-human", name: "Atendente QA" } };
}
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "chat_media_uploads", "tenant_channels", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  const prefix = `chat-media/${tenantId}/`, [files] = await bucket.getFiles({ prefix });
  assert.ok(files.every(file => file.name.startsWith(prefix)));
  await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  await adminDb.terminate();
});
test("verified audio is converted with real ffmpeg, uploaded once and sent as native voice without a signed URL", async () => {
  const input = await fixture("valid"); const before = { uploads, sends };
  const accepted = await queueTenantChatMediaBuffer(input);
  const queued = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  const result = await processChatOutboundJobs({ jobId: accepted.jobId });
  assert.equal(result.results[0]?.status, "sent", JSON.stringify(result));
  await queueTenantChatMediaBuffer(input); await processChatOutboundJobs({ jobId: accepted.jobId });
  assert.deepEqual({ uploads, sends }, { uploads: before.uploads + 1, sends: before.sends + 1 });
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(message.deliveryStatus, "sent"); assert.equal(message.mediaMimeType, "audio/mpeg");
  assert.equal(message.createdAt.toMillis(), queued.createdAt.toMillis());
  const [playback] = await bucket.file(message.mediaUrl).download();
  assert.equal(message.mediaSize, playback.length); assert.notEqual(playback.length, input.buffer.length);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.providerAttemptCount, 1);
});
test("lost audio delivery confirmation never repeats the upload or sends a second voice message", async () => {
  const input = await fixture("unknown"); const before = { uploads, sends };
  const accepted = await queueTenantChatMediaBuffer(input);
  loseMessageAck = true;
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
    await queueTenantChatMediaBuffer(input); await processChatOutboundJobs({ jobId: accepted.jobId });
    assert.deepEqual({ uploads, sends }, { uploads: before.uploads + 1, sends: before.sends + 1 });
    assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.deliveryStatus, "confirmation_pending");
  } finally { loseMessageAck = false; }
});
