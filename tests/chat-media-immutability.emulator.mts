import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatMediaBuffer: enqueue } = await import("../lib/server/chat-outbound.ts");
const { queueTenantChatMedia } = await import("../lib/server/chat-outbound.ts");
const { createChatOutboundIdentity } = await import("../lib/server/chat-outbound-idempotency.ts");
const { saveChatMediaBuffer } = await import("../lib/server/firebase-storage.ts");
const { deleteTenantChat, restoreTenantTrash, deleteTenantTrashPermanently } = await import("../lib/server/tenant-data-deletion.ts");
const tenantId = `qa_immutable_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const chatId = `${tenantId}_chat`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const prefix = `chat-media/${tenantId}/${chatId}/`;
const original = Buffer.from("first-bytes!");
const replacement = Buffer.from("other-bytes!");
assert.equal(original.length, replacement.length);
await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp" });
const input = { tenantId, chatId, mediaType: "document" as const, filename: "qa.bin", contentType: "application/octet-stream",
  actor: { id: "qa-owner", name: "Operador fictício" }, clientRequestId: "immutable-request-0001", buffer: original };
after(async () => {
  mock.restoreAll();
  const cleanupPrefix = `chat-media/${tenantId}/`;
  const [files] = await bucket.getFiles({ prefix: cleanupPrefix });
  if (files.some((file) => !file.name.startsWith(cleanupPrefix))) throw new Error("Unsafe fixture storage cleanup");
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  for (const collection of ["chats", "messages", "chat_outbound_jobs", "chat_state", "chat_outbound_locks", "chat_media_uploads", "tenant_trash", "deletion_audits", "deletion_certificates"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => collection === "tenant_trash" ? adminDb.recursiveDelete(row.ref) : row.ref.delete()));
  }
  await adminDb.terminate();
});

test("a reused request with different same-length bytes never replaces already queued media", async () => {
  const first = await enqueue(input);
  const message = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
  const path = String(message.mediaUrl);
  assert.ok(path.startsWith(prefix));
  let conflict = false;
  try { await enqueue({ ...input, buffer: replacement }); } catch (error) {
    conflict = Boolean(error && typeof error === "object" && "code" in error && error.code === "OUTBOUND_IDEMPOTENCY_CONFLICT");
  }
  const [stored] = await bucket.file(path).download();
  assert.deepEqual(stored, original, "An idempotency conflict must never mutate the first accepted media bytes");
  assert.equal(conflict, true);
  assert.equal((await enqueue(input)).replayed, true);
  assert.equal((await adminDb.collection("chats").doc(chatId).get()).data()?.outboundSequence, 1);
});

test("twenty identical uploads keep one operation and do not rewrite the accepted object", async () => {
  const same = { ...input, clientRequestId: "immutable-twenty-0001" };
  const results = await Promise.all(Array.from({ length: 20 }, () => enqueue(same)));
  assert.equal(new Set(results.map((row) => row.jobId)).size, 1);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(results[0].jobId).get()).data()!;
  const file = bucket.file(job.storagePath);
  const [before] = await file.getMetadata();
  assert.equal((await enqueue(same)).replayed, true);
  const [afterReplay] = await file.getMetadata();
  assert.equal(afterReplay.generation, before.generation);
  assert.deepEqual((await file.download())[0], original);
});

test("different same-length payloads racing for one attempt cannot both be accepted", async () => {
  const same = { ...input, clientRequestId: "immutable-race-0001" };
  const results = await Promise.allSettled([enqueue(same), enqueue({ ...same, buffer: replacement })]);
  const accepted = results.flatMap((row, index) => row.status === "fulfilled" ? [{ result: row.value, index }] : []);
  assert.equal(accepted.length, 1);
  const rejected = results.find((row) => row.status === "rejected");
  assert.equal(rejected?.status === "rejected" && rejected.reason?.code, "OUTBOUND_IDEMPOTENCY_CONFLICT");
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted[0].result.jobId).get()).data()!;
  assert.deepEqual((await bucket.file(job.storagePath).download())[0], accepted[0].index === 0 ? original : replacement);
});

test("legacy extension paths replay without replacement or migration", async () => {
  const legacy = { ...input, mediaType: "image" as const, contentType: "image/jpeg", filename: "legacy.jpg", clientRequestId: "immutable-legacy-0001" };
  const identity = createChatOutboundIdentity(legacy);
  const path = await saveChatMediaBuffer({ tenantId, chatId, messageId: identity.messageId, data: original, contentType: legacy.contentType, filename: legacy.filename });
  assert.ok(path.endsWith(".jpg"));
  const queued = await queueTenantChatMedia({ ...legacy, storagePath: path, mediaSize: original.length });
  const [before] = await bucket.file(path).getMetadata();
  const replay = await enqueue(legacy);
  assert.equal(replay.jobId, queued.jobId);
  assert.equal(replay.replayed, true);
  assert.equal((await bucket.file(path).getMetadata())[0].generation, before.generation);
  await assert.rejects(() => enqueue({ ...legacy, filename: "another.jpg" }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "OUTBOUND_IDEMPOTENCY_CONFLICT"));
});

test("missing original file and invalid input never create an unverified replacement", async () => {
  const missing = { ...input, clientRequestId: "immutable-missing-0001" };
  const first = await enqueue(missing);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(first.jobId).get()).data()!;
  assert.ok(String(job.storagePath).startsWith(prefix));
  await bucket.file(job.storagePath).delete();
  await assert.rejects(() => enqueue(missing), /original.*ausente/);
  assert.equal((await bucket.file(job.storagePath).exists())[0], false);
  await assert.rejects(() => enqueue({ ...input, buffer: Buffer.alloc(0), clientRequestId: "immutable-empty-0001" }), /vazio/);
  await assert.rejects(() => enqueue({ ...input, tenantId: `${tenantId}_foreign`, clientRequestId: "immutable-foreign-0001" }), /empresa/);
});

test("upload survives a failed enqueue and its admission participates in trash/restore/purge", async () => {
  const stagedChat = `${tenantId}_staged`;
  await adminDb.collection("chats").doc(stagedChat).set({ tenantId, channel: "whatsapp" });
  const staged = { ...input, chatId: stagedChat, clientRequestId: "immutable-staged-0001" };
  const identity = createChatOutboundIdentity(staged);
  const originalBatch = adminDb.batch.bind(adminDb);
  let failed = false;
  const interceptor = mock.method(adminDb, "batch", () => {
    const batch = originalBatch();
    if (!failed) {
      failed = true;
      mock.method(batch, "commit", async () => { throw Object.assign(new Error("QA interrupted after upload"), { code: 14 }); });
    }
    return batch;
  });
  try { await assert.rejects(() => enqueue(staged), /QA interrupted/); }
  finally { interceptor.mock.restore(); }
  const admission = adminDb.collection("chat_media_uploads").doc(identity.jobId);
  const uploaded = (await admission.get()).data()!;
  assert.ok(uploaded.storagePath.startsWith(`chat-media/${tenantId}/${stagedChat}/`));
  assert.equal((await bucket.file(uploaded.storagePath).exists())[0], true);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get()).exists, false);
  await assert.rejects(() => enqueue({ ...staged, buffer: replacement }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "OUTBOUND_IDEMPOTENCY_CONFLICT"));
  const removed = await deleteTenantChat({ tenantId, chatId: stagedChat });
  const trashId = removed.trashId!;
  assert.equal((await admission.get()).exists, false);
  assert.equal((await adminDb.collection("tenant_trash").doc(trashId).get()).data()?.storageObjectCount, 1);
  await restoreTenantTrash({ tenantId, trashId });
  assert.equal((await admission.get()).data()?.contentSha256, uploaded.contentSha256);
  assert.deepEqual((await bucket.file(uploaded.storagePath).download())[0], original);
  await enqueue(staged);
  const finalTrash = await deleteTenantChat({ tenantId, chatId: stagedChat });
  await deleteTenantTrashPermanently({ tenantId, trashId: finalTrash.trashId! });
  assert.equal((await bucket.file(uploaded.storagePath).exists())[0], false);
  assert.equal((await admission.get()).exists, false);
});
