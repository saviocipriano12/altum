import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createHash } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatStoredMedia: enqueue, queueTenantChatMedia } = await import("../lib/server/chat-outbound.ts");
const { createChatOutboundIdentity, createChatOutboundFingerprint } = await import("../lib/server/chat-outbound-idempotency.ts");
const { readVerifiedOutboundMedia } = await import("../lib/server/chat-media-integrity.ts");
const tenantId = `qa_stored_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, chatId = `${tenantId}_chat`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const original = Buffer.from("original fixture"), changed = Buffer.from("modified fixture");
assert.equal(original.length, changed.length);
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp" });
const conflict = (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "OUTBOUND_IDEMPOTENCY_CONFLICT");
async function fixture(id: string) {
  const storagePath = `chat-media/${tenantId}/${chatId}/qa-owner/${id}.txt`;
  const file = bucket.file(storagePath);
  await file.save(original, { resumable: false, metadata: { contentType: "text/plain" } });
  return { tenantId, chatId, storagePath, file, mediaType: "document" as const, filename: "fixture.txt", mediaSize: original.length,
    contentType: "text/plain", actor: { id: "qa-owner", name: "Operador ficticio" }, clientRequestId: id, expectedContentSha256: hash(original) };
}
after(async () => {
  const prefix = `chat-media/${tenantId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.some((file) => !file.name.startsWith(prefix))) throw new Error("Unsafe fixture cleanup");
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  for (const collection of ["chat_outbound_jobs", "messages", "chat_media_uploads", "chat_outbound_locks", "chat_state", "chats"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("direct-upload replay binds verified bytes once without copying or rewriting Storage", async () => {
  const input = await fixture("stored-replay-0001");
  const generation = (await input.file.getMetadata())[0].generation;
  const first = await enqueue(input);
  const repeated = await Promise.all(Array.from({ length: 6 }, () => enqueue(input)));
  assert.ok(repeated.every((row) => row.jobId === first.jobId && row.replayed));
  const admission = (await adminDb.collection("chat_media_uploads").doc(first.jobId).get()).data()!;
  assert.equal(admission.contentSha256, hash(original));
  assert.equal(admission.sourceGeneration, generation);
  assert.equal(admission.bucketName, bucket.name);
  assert.equal(admission.storagePath, input.storagePath);
  assert.equal((await input.file.getMetadata())[0].generation, generation);
  assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 1);
  const verified = await readVerifiedOutboundMedia({ ...input, jobId: first.jobId });
  assert.equal(verified.origin, "upload_admission");
});

test("client digest mismatch never creates a job or poisons the upload admission", async () => {
  const input = await fixture("stored-digest-0001");
  const identity = createChatOutboundIdentity(input);
  await assert.rejects(enqueue({ ...input, expectedContentSha256: hash(changed) }), conflict);
  assert.equal((await adminDb.collection("chat_media_uploads").doc(identity.jobId).get()).exists, false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(identity.jobId).get()).exists, false);
  assert.equal((await enqueue(input)).replayed, false);
});

test("changed caption, path and same-size bytes cannot rebind accepted direct media", async () => {
  const input = await fixture("stored-conflict-0001");
  const first = await enqueue(input);
  await assert.rejects(enqueue({ ...input, caption: "changed caption" }), conflict);
  const other = await fixture("stored-otherpath-0001");
  await assert.rejects(enqueue({ ...input, storagePath: other.storagePath, file: other.file }), conflict);
  await input.file.save(changed, { resumable: false, metadata: { contentType: "text/plain" } });
  await assert.rejects(enqueue(input), conflict);
  await assert.rejects(readVerifiedOutboundMedia({ ...input, jobId: first.jobId }), /integridade/);
  const admission = (await adminDb.collection("chat_media_uploads").doc(first.jobId).get()).data()!;
  assert.equal(admission.contentSha256, hash(original));
});

test("interruption after admission recovers one operation; legacy clients remain accepted", async () => {
  const input = await fixture("stored-interrupt-0001");
  const identity = createChatOutboundIdentity(input);
  // Reconstruct the durable admission-only boundary, without pretending to
  // simulate a process crash or deleting an already accepted message.
  await adminDb.collection("chat_media_uploads").doc(identity.jobId).create({
    tenantId, chatId, storagePath: input.storagePath, contentSha256: hash(original),
    mediaSize: original.length, bucketName: bucket.name,
    requestFingerprint: createChatOutboundFingerprint(["immutable-media-v1", tenantId, chatId,
      input.storagePath, hash(original), "document", "fixture.txt", "text/plain", "", null]),
  });
  const retry = await enqueue({ ...input, expectedContentSha256: undefined });
  assert.equal(retry.jobId, identity.jobId);
  assert.equal(retry.replayed, false);
  assert.equal((await enqueue(input)).replayed, true);
});

test("legacy raw job cannot acquire an admission from a conflicting metadata replay", async () => {
  const input = await fixture("stored-legacy-0001");
  const legacy = await queueTenantChatMedia(input);
  await assert.rejects(enqueue({ ...input, filename: "other.txt" }), conflict);
  assert.equal((await adminDb.collection("chat_media_uploads").doc(legacy.jobId).get()).exists, false);
  assert.equal((await enqueue(input)).replayed, true);
});
