import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { createHash } from "node:crypto";
import type { File, GetSignedUrlConfig } from "@google-cloud/storage";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatMediaBuffer, queueTenantChatMedia, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_media_dispatch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const channelId = `${tenantId}_channel`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const source = Buffer.from("first-bytes!");
const originalFetch = globalThis.fetch;
let providerCalls = 0;
let signedCalls = 0;
let expectedBytes = source;
const prototype = Object.getPrototypeOf(bucket.file("fixture"));
mock.method(prototype, "getSignedUrl", async function (this: File, config: GetSignedUrlConfig) {
  signedCalls++;
  assert.equal(config.version, "v4");
  assert.equal(config.action, "read");
  const generation = String(config.queryParams?.generation || "");
  assert.match(generation, /^\d+$/);
  assert.equal(String(this.generation), generation);
  // Signing itself is deliberately simulated; no real service-account key.
  return [`https://qa-media.invalid/${encodeURIComponent(this.name)}?generation=${generation}`];
});
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  if (target.hostname === "evolution-qa.invalid") {
    assert.match(target.pathname, /\/message\/sendMedia\/qa-instance$/);
    const body = JSON.parse(String(options?.body));
    assert.equal(body.number, "5511000000066");
    assert.ok(["image", "video", "document"].includes(body.mediatype));
    assert.deepEqual(Buffer.from(body.media, "base64"), expectedBytes);
    assert.equal(signedCalls, 0);
    providerCalls++;
    return Response.json({ key: { id: `evolution-media-${providerCalls}` } });
  }
  // Fail closed: never forward traffic to any external host.
  assert.equal(target.hostname, "graph.facebook.com");
  if (target.pathname.endsWith("/qa-media-number/media")) {
    const file = (options?.body as FormData).get("file") as globalThis.File;
    assert.equal(file.name, "qa.pdf");
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), expectedBytes);
    return Response.json({ id: "qa-verified-upload" });
  }
  assert.match(target.pathname, /\/qa-media-number\/messages$/);
  const payload = JSON.parse(String(options?.body));
  assert.equal(payload.to, "5511000000066");
  assert.equal(payload.type, "document");
  assert.equal(payload.document.filename, "qa.pdf");
  assert.equal(payload.document.id, "qa-verified-upload");
  assert.equal(payload.document.link, undefined);
  assert.equal(signedCalls, 0, "WhatsApp media must not depend on signing credentials");
  providerCalls++;
  return Response.json({ messages: [{ id: `wamid.qa-media-${providerCalls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, id: channelId, type: "whatsapp", status: "active",
  provider: "meta_whatsapp", phoneNumberId: "qa-media-number", accessToken: "qa-fake-token", channelScope: "shared" });
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000066", lastClientMessageAt: new Date() });
  return { tenantId, chatId, mediaType: "document" as const, filename: "qa.pdf", contentType: "application/pdf", buffer: source,
    actor: { id: "qa-owner", name: "Dono ficticio" }, clientRequestId: `dispatch-${name}-0001` };
}
after(async () => {
  globalThis.fetch = originalFetch;
  mock.restoreAll();
  const prefix = `chat-media/${tenantId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.some((file) => !file.name.startsWith(prefix))) throw new Error("Unsafe fixture cleanup");
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  for (const collection of ["chats", "messages", "chat_outbound_jobs", "chat_outbound_locks", "chat_media_uploads", "chat_state", "tenant_channels", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("buffer upload reaches simulated Meta once with verified bytes, filename and generation", async () => {
  const input = await fixture("verified");
  const queued = await queueTenantChatMediaBuffer(input);
  const callsBefore = providerCalls;
  const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "sent", JSON.stringify(result));
  const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
  const message = (await adminDb.collection("messages").doc(queued.messageId).get()).data()!;
  assert.equal(job.mediaIntegrityOrigin, "upload_admission");
  assert.equal(job.sourceSha256, createHash("sha256").update(source).digest("hex"));
  assert.equal(job.deliveryGeneration, job.sourceGeneration);
  assert.equal(message.mediaName, input.filename);
  assert.equal(message.status, "sent");
  assert.equal(message.mediaUrl, job.storagePath);
  assert.equal((await queueTenantChatMediaBuffer(input)).jobId, queued.jobId);
  assert.equal((await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 })).results[0]?.status, "skipped");
  assert.equal(providerCalls - callsBefore, 1);
});

test("storage bytes changed after queue acceptance are blocked before signing or delivery", async () => {
  const queued = await queueTenantChatMediaBuffer(await fixture("tampered"));
  const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
  await bucket.file(job.storagePath).save(Buffer.from("other-bytes!"));
  const before = { providerCalls, signedCalls };
  const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "dead_letter");
  assert.match(result.results[0]?.error || "", /integridade/);
  assert.deepEqual({ providerCalls, signedCalls }, before);
  assert.equal((await adminDb.collection("messages").doc(queued.messageId).get()).data()?.deliveryStatus, "failed");
});

test("foreign upload admission is rejected without exposing or sending its file", async () => {
  const queued = await queueTenantChatMediaBuffer(await fixture("foreign"));
  const admission = adminDb.collection("chat_media_uploads").doc(queued.jobId);
  await admission.update({ tenantId: `${tenantId}_foreign` });
  const before = { providerCalls, signedCalls };
  try {
    assert.equal((await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 })).results[0]?.status, "dead_letter");
    assert.deepEqual({ providerCalls, signedCalls }, before);
  } finally { await admission.update({ tenantId }); }
});

test("audio corruption cannot be swallowed by the normalization fallback", async () => {
  const input = await fixture("audio");
  const queued = await queueTenantChatMediaBuffer({ ...input, mediaType: "audio", filename: "qa.ogg", contentType: "audio/ogg" });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
  await bucket.file(job.storagePath).save(Buffer.from("other-bytes!"));
  const before = { providerCalls, signedCalls };
  const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "dead_letter");
  assert.match(result.results[0]?.error || "", /integridade/);
  assert.deepEqual({ providerCalls, signedCalls }, before);
});

test("legacy queued file remains compatible but is explicitly labeled unbound", async () => {
  const input = await fixture("legacy");
  const path = `chat-media/${tenantId}/${input.chatId}/legacy.pdf`;
  await bucket.file(path).save(source, { metadata: { contentType: "application/pdf" } });
  expectedBytes = source;
  const queued = await queueTenantChatMedia({ ...input, storagePath: path, mediaSize: source.length });
  const result = await processChatOutboundJobs({ jobId: queued.jobId, limit: 1 });
  assert.equal(result.results[0]?.status, "sent", JSON.stringify(result));
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.mediaIntegrityOrigin, "legacy_unbound");
});

test("Evolution receives exact verified bytes for images, video and documents without a signed URL", async () => {
  const evolutionChannel = `${tenantId}_evolution`;
  await adminDb.collection("tenant_channels").doc(evolutionChannel).set({ tenantId, type: "whatsapp", status: "active", provider: "evolution", accessToken: "qa-only",
    metadata: { gatewayEndpoint: "https://evolution-qa.invalid", sessionId: "qa-instance" } });
  for (const mediaType of ["image", "video", "document"] as const) {
    const input = await fixture(`evolution-${mediaType}`);
    await adminDb.collection("chats").doc(input.chatId).update({ channelId: evolutionChannel });
    const before = providerCalls;
    const accepted = await queueTenantChatMediaBuffer({ ...input, mediaType });
    const result = await processChatOutboundJobs({ jobId: accepted.jobId });
    assert.equal(result.results[0]?.status, "sent", JSON.stringify(result));
    await queueTenantChatMediaBuffer({ ...input, mediaType }); await processChatOutboundJobs({ jobId: accepted.jobId });
    assert.equal(providerCalls, before + 1);
  }
});

test("media reference removed or moved after acceptance never reaches provider", async () => {
  for (const mode of ["deleted", "other-chat", "other-tenant"]) {
    const input = await fixture(`reply-${mode}`);
    const replyToId = `${input.chatId}_reference`;
    const reference = adminDb.collection("messages").doc(replyToId);
    await reference.set({ tenantId, chatId: input.chatId, text: "Referencia ficticia", sender: "client" });
    const queued = await queueTenantChatMediaBuffer({ ...input, replyToId });
    const before = providerCalls;
    if (mode === "deleted") await reference.delete();
    else await reference.update(mode === "other-chat" ? { chatId: `${tenantId}_other` } : { tenantId: `${tenantId}_foreign` });
    try {
      const result = await processChatOutboundJobs({ jobId: queued.jobId });
      assert.equal(result.results[0]?.status, "dead_letter", JSON.stringify(result));
      assert.equal(providerCalls, before);
      const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
      assert.equal(job.errorCode, "PREFLIGHT_PERMANENT");
      assert.equal(job.reconciliationReason, null);
    } finally { if (mode === "other-tenant") await reference.update({ tenantId }); }
  }
});
