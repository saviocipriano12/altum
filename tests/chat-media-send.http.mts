import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { initializeApp as initializeClient, deleteApp as deleteClient } from "firebase/app";
import { getAuth as getClientAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getStorage as getClientStorage, connectStorageEmulator, ref, uploadBytesResumable, getMetadata } from "firebase/storage";
import { sendInboxDirectMedia, probeInboxUploadedObject, inboxMediaContentSha256, waitForInboxUpload } from "../lib/inbox-upload.ts";
Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199" });
const app = initializeApp({ projectId: "demo-altum-qa-lab" }, "qa-http-media-send");
const db = getFirestore(app);
const auth = getAuth(app);
const bucket = getStorage(app).bucket("demo-altum-qa-lab.appspot.com");
const tenantId = `qa_http_media_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const chatId = `${tenantId}_chat`;
const snapshot = process.env.ALTUM_QA_SNAPSHOT || ".qa-artifacts/inbox-snapshot-1792417470220";
const port = Number(process.env.ALTUM_QA_PORT || 3199);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const origin = `http://127.0.0.1:${port}`;
const tokens = new Map<string, string>();
const users: string[] = [];
const original = Buffer.from("qa-first-body");
const changed = Buffer.from("qa-other-body");
assert.equal(original.length, changed.length);
const clientRequestId = "http-media-replay-0001";
const fingerprint = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const deliveryLockId = fingerprint(["chat-outbound-lock-v1", tenantId, chatId]).slice(0, 48);
async function send(key: string | null, options: { tenant?: string; bytes?: Buffer; caption?: string; requestId?: string; omitFile?: boolean } = {}) {
  const form = new FormData();
  if (!options.omitFile) form.append("file", new Blob([new Uint8Array(options.bytes || original)], { type: "text/plain" }), "fixture.txt");
  form.append("clientRequestId", options.requestId || clientRequestId);
  if (options.caption) form.append("caption", options.caption);
  return fetch(`${origin}/api/tenant/${options.tenant || tenantId}/chats/${chatId}/send-media`, {
    method: "POST", headers: key ? { authorization: `Bearer ${tokens.get(key)}` } : {}, body: form, signal: AbortSignal.timeout(90000),
  });
}
async function count(collection: string) { return (await db.collection(collection).where("tenantId", "==", tenantId).count().get()).data().count; }
before(async () => {
  const manifest = JSON.parse(await readFile(`${snapshot}/qa-source-manifest.json`, "utf8"));
  for (const path of ["lib/server/chat-outbound.ts", "lib/server/chat-outbound-enqueue.ts", "lib/server/chat-dispatch.ts", "lib/server/chat-outbound-template.ts", "lib/server/chat-outbound-payload.ts", "lib/server/chat-outbound-idempotency.ts", "lib/server/ai/agent.ts", "lib/server/ai/template-delivery.ts", "lib/server/chat-media-integrity.ts", "lib/server/firebase-storage.ts", "app/api/tenant/[tenantId]/chats/[chatId]/send-media/route.ts", "app/api/tenant/[tenantId]/chats/[chatId]/send-stored-media/route.ts", "app/api/tenant/[tenantId]/chats/[chatId]/send-template/route.ts"]) {
    const expected = manifest.files.find((row: { path: string }) => row.path === path)?.sha256;
    assert.ok(expected, `Missing baseline source: ${path}`);
    for (const source of [path, `${snapshot}/${path}`]) assert.equal(createHash("sha256").update(await readFile(source)).digest("hex"), expected, `Stale API baseline: ${source}`);
  }
  await db.collection("tenants").doc(tenantId).set({ tenantId, name: "Empresa ficticia HTTP midia", status: "active", billingStatus: "active", accessStatus: "active" });
  await db.collection("tenant_entitlements").doc(tenantId).set({ tenantId, version: 1, mode: "custom", modules: { inbox: true, whatsapp: true }, limits: {}, isLegacyFallback: false });
  for (const [key, role] of [["owner", "client_owner"], ["agent", "client_agent"], ["viewer", "client_viewer"]]) {
    const uid = `${tenantId}_${key}`;
    const email = `${uid}@qa.invalid`;
    await auth.createUser({ uid, email, password: "QaMediaHttpOnly2026!", emailVerified: true });
    users.push(uid);
    await db.collection("users").doc(uid).set({ tenantId, uid, email, name: key, role, status: "active" });
    await db.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role, status: "active", isDefault: true });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "QaMediaHttpOnly2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(response.status, 200);
    tokens.set(key, (await response.json()).idToken);
  }
  await db.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", contactPhone: "5511000000055", assignedTo: `${tenantId}_owner`, ownerId: `${tenantId}_owner` });
  // Fence actual provider dispatch, including Next after() callbacks. No channel
  // is configured. This tests HTTP acceptance/storage, not the simulated worker.
  await db.collection("chat_outbound_locks").doc(deliveryLockId).set({ tenantId, chatId, jobId: "qa-provider-blocked", leaseToken: "qa-only", leaseUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) });
});
after(async () => {
  tokens.clear();
  // Delete pending jobs BEFORE releasing the dispatch fence.
  for (const collection of ["chat_outbound_jobs", "messages", "chat_media_uploads", "chat_state", "chats", "users", "tenant_users", "tenants", "tenant_entitlements", "chat_outbound_locks"]) {
    const rows = await db.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map((row) => row.ref.delete()));
  }
  const prefix = `chat-media/${tenantId}/`;
  const [files] = await bucket.getFiles({ prefix });
  if (files.some((file) => !file.name.startsWith(prefix))) throw new Error("Unsafe fixture cleanup");
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  await Promise.all(users.map((uid) => auth.deleteUser(uid)));
  await db.terminate(); await deleteApp(app);
});

test("HTTP media rejects anonymous, viewer, other seller and foreign tenant before storing", async () => {
  assert.equal((await send(null)).status, 401);
  for (const key of ["viewer", "agent"]) assert.equal((await send(key)).status, 403, key);
  assert.equal((await send("owner", { tenant: `${tenantId}_foreign` })).status, 403);
  for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 0);
  assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 0);
});

test("HTTP media accepts repeated owner attempts into one immutable message, job and object", async () => {
  const first = await send("owner");
  assert.equal(first.status, 200, await first.clone().text());
  const accepted = await first.json();
  const repeated = await Promise.all(Array.from({ length: 6 }, () => send("owner")));
  for (const response of repeated) {
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.messageId, accepted.messageId);
    assert.equal(result.jobId, accepted.jobId);
    assert.equal(result.replayed, true);
  }
  for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 1);
  const job = (await db.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.status, "ready"); assert.equal(job.attempts, 0);
  const [stored] = await bucket.file(job.storagePath).download();
  assert.deepEqual(stored, original);
  assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 1);
});

test("HTTP media conflicts preserve the accepted bytes, caption, file generation and sequence", async () => {
  const jobs = await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
  const job = jobs.docs[0].data();
  const [before] = await bucket.file(job.storagePath).getMetadata();
  for (const options of [{ bytes: changed }, { caption: "Outra legenda" }]) {
    const response = await send("owner", options);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "OUTBOUND_IDEMPOTENCY_CONFLICT");
  }
  assert.deepEqual((await bucket.file(job.storagePath).download())[0], original);
  assert.equal((await bucket.file(job.storagePath).getMetadata())[0].generation, before.generation);
  assert.equal((await db.collection("chats").doc(chatId).get()).data()?.outboundSequence, 1);
  assert.equal((await send("owner")).status, 200);
});

test("HTTP empty or missing media creates no phantom upload or outbound operation", async () => {
  assert.equal((await send("owner", { bytes: Buffer.alloc(0), requestId: "http-media-empty-0001" })).status, 400);
  assert.equal((await send("owner", { omitFile: true, requestId: "http-media-missing-0001" })).status, 400);
  for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 1);
  const jobs = await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
  assert.equal(jobs.docs[0].data().attempts, 0);
  assert.equal((await db.collection("chat_outbound_locks").doc(deliveryLockId).get()).data()?.jobId, "qa-provider-blocked");
});

const storedPath = `chat-media/${tenantId}/${chatId}/${tenantId}_owner/http-stored-0001.txt`;
const storedBody = { storagePath: storedPath, mediaType: "document", filename: "fixture.txt",
  caption: "Original", clientRequestId: "http-stored-0001", contentSha256: createHash("sha256").update(original).digest("hex") };
async function sendStored(key: string | null, changes: Record<string, unknown> = {}) {
  return fetch(`${origin}/api/tenant/${tenantId}/chats/${chatId}/send-stored-media`, {
    method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${tokens.get(key)}` } : {}) },
    body: JSON.stringify({ ...storedBody, ...changes }), signal: AbortSignal.timeout(90000),
  });
}

test("HTTP stored-media authorization and invalid digest reject before creating operations", async () => {
  assert.equal((await sendStored(null)).status, 401);
  for (const key of ["viewer", "agent"]) assert.equal((await sendStored(key)).status, 403);
  assert.equal((await sendStored("owner", { storagePath: `chat-media/foreign/chat/user/file.txt` })).status, 400);
  assert.equal((await sendStored("owner", { contentSha256: "invalid" })).status, 400);
  await bucket.file(storedPath).save(original, { resumable: false, metadata: { contentType: "text/plain" } });
  const mismatch = await sendStored("owner", { contentSha256: "0".repeat(64) });
  assert.equal(mismatch.status, 409, await mismatch.clone().text());
  for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 1);
});

test("HTTP stored-media retries bind one original object and admission without making a copy", async () => {
  const before = (await bucket.file(storedPath).getMetadata())[0];
  const first = await sendStored("owner");
  assert.equal(first.status, 200, await first.clone().text());
  const accepted = await first.json();
  const repeated = await Promise.all(Array.from({ length: 6 }, () => sendStored("owner")));
  for (const response of repeated) {
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.jobId, accepted.jobId); assert.equal(result.messageId, accepted.messageId);
    assert.equal(result.replayed, true);
  }
  const admission = (await db.collection("chat_media_uploads").doc(accepted.jobId).get()).data()!;
  assert.equal(admission.contentSha256, storedBody.contentSha256);
  assert.equal(admission.storagePath, storedPath);
  assert.equal(admission.sourceGeneration, before.generation);
  assert.equal((await bucket.file(storedPath).getMetadata())[0].generation, before.generation);
  for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 2);
  assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 2);
});

test("HTTP stored-media changed payload and post-accept tampering cannot replace its binding", async () => {
  for (const changes of [{ caption: "Changed" }, { filename: "other.txt" }, { contentSha256: "0".repeat(64) }]) {
    assert.equal((await sendStored("owner", changes)).status, 409);
  }
  assert.equal((await sendStored("owner", { contentSha256: undefined })).status, 200, "legacy clients remain compatible");
  await bucket.file(storedPath).save(changed, { resumable: false, metadata: { contentType: "text/plain" } });
  const tampered = await sendStored("owner");
  assert.equal(tampered.status, 409);
  assert.equal((await tampered.json()).code, "OUTBOUND_IDEMPOTENCY_CONFLICT");
  const admissions = await db.collection("chat_media_uploads").where("tenantId", "==", tenantId).where("storagePath", "==", storedPath).get();
  assert.equal(admissions.size, 1);
  assert.equal(admissions.docs[0].data().contentSha256, storedBody.contentSha256);
  assert.equal((await db.collection("chats").doc(chatId).get()).data()?.outboundSequence, 2);
  const jobs = await db.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get();
  assert.ok(jobs.docs.every((row) => row.data().attempts === 0));
});

test("authenticated SDK upload with lost completion and lost HTTP acknowledgement recovers one real API operation", async () => {
  const client = initializeClient({ projectId: "demo-altum-qa-lab", apiKey: "qa-local-only", storageBucket: bucket.name }, `${tenantId}_sdk`);
  const clientAuth = getClientAuth(client);
  connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  const storage = getClientStorage(client);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  storage.maxUploadRetryTime = 5000;
  try {
    await signInWithEmailAndPassword(clientAuth, `${tenantId}_owner@qa.invalid`, "QaMediaHttpOnly2026!");
    const path = `chat-media/${tenantId}/${chatId}/${tenantId}_owner/http-stored-recover-0001.txt`;
    const target = ref(storage, path);
    const file = new Blob([new Uint8Array(original)], { type: "text/plain" });
    let uploads = 0, probes = 0, dispatches = 0;
    const request = { attempt: Object.freeze({ caption: "Original", replyToId: null, composerText: null }), file, storagePath: path,
      upload: async () => {
        uploads++;
        await waitForInboxUpload(uploadBytesResumable(target, new Uint8Array(await file.arrayBuffer()), {
          contentType: "text/plain", customMetadata: { tenantId, chatId, uploadedBy: `${tenantId}_owner` },
        }), () => {}, 10000);
        // Actual Storage commit succeeded; inject loss only at this boundary.
        throw new Error("simulated lost upload completion");
      },
      probeUploaded: () => { probes++; return probeInboxUploadedObject(() => getMetadata(target)); },
      sendStored: async () => {
        const response = await sendStored("owner", { storagePath: path, clientRequestId: "http-stored-recover-0001",
          contentSha256: await inboxMediaContentSha256(file) });
        assert.equal(response.status, 200, await response.clone().text());
        const result = await response.json();
        // The real authenticated API accepted the operation; drop its first acknowledgement.
        if (++dispatches === 1) throw new Error("simulated lost HTTP acknowledgement");
        return result;
      },
      sendPanel: async () => { throw new Error("must not switch transport"); }, allowPanelFallback: true };
    await assert.rejects(sendInboxDirectMedia(request), /lost HTTP acknowledgement/);
    const generation = (await getMetadata(target)).generation;
    const accepted = await sendInboxDirectMedia(request);
    assert.equal(accepted.replayed, true);
    assert.deepEqual([uploads, probes, dispatches], [1, 1, 2]);
    assert.equal((await getMetadata(target)).generation, generation);
    const admission = (await db.collection("chat_media_uploads").doc(accepted.jobId).get()).data()!;
    assert.equal(admission.contentSha256, await inboxMediaContentSha256(file));
    assert.deepEqual((await bucket.file(path).download())[0], original);
    for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads"]) assert.equal(await count(collection), 3);
    assert.equal((await bucket.getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 3);
    assert.equal((await db.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.attempts, 0);
  } finally { await signOut(clientAuth); await deleteClient(client); }
});

test("HTTP templates enforce access, validate without side effects and persist one accepted operation on replay", async () => {
  const payload = { templateName: "qa_follow_up", languageCode: "pt_BR", bodyParams: ["Cliente QA"], clientRequestId: "http-template-replay-0001" };
  const sendTemplate = (key: string | null, changes: Record<string, unknown> = {}, tenant = tenantId) => fetch(`${origin}/api/tenant/${tenant}/chats/${chatId}/send-template`, {
    method: "POST", headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${tokens.get(key)}` } : {}) },
    body: JSON.stringify({ ...payload, ...changes }), signal: AbortSignal.timeout(90000),
  });
  const before = { jobs: await count("chat_outbound_jobs"), messages: await count("messages") };
  assert.equal((await sendTemplate(null)).status, 401);
  for (const key of ["viewer", "agent"]) assert.equal((await sendTemplate(key)).status, 403);
  assert.equal((await sendTemplate("owner", {}, `${tenantId}_foreign`)).status, 403);
  for (const invalid of [{ bodyParams: ["", "second"] }, { clientRequestId: {} }, { headerMedia: { type: "audio", link: "https://qa.invalid/audio" } }]) {
    assert.equal((await sendTemplate("owner", invalid)).status, 400);
  }
  assert.deepEqual({ jobs: await count("chat_outbound_jobs"), messages: await count("messages") }, before);
  const first = await sendTemplate("owner");
  assert.equal(first.status, 200, await first.clone().text());
  const accepted = await first.json();
  assert.equal(accepted.status, "queued");
  for (const replay of await Promise.all(Array.from({ length: 6 }, () => sendTemplate("owner")))) {
    assert.equal(replay.status, 200); const body = await replay.json();
    assert.equal(body.jobId, accepted.jobId); assert.equal(body.messageId, accepted.messageId); assert.equal(body.replayed, true);
  }
  assert.equal((await sendTemplate("owner", { bodyParams: ["Changed"] })).status, 409);
  assert.equal(await count("chat_outbound_jobs"), before.jobs + 1);
  assert.equal(await count("messages"), before.messages + 1);
  const job = (await db.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.kind, "template"); assert.equal(job.attempts, 0); assert.deepEqual(job.bodyParams, payload.bodyParams);
  const message = (await db.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(message.deliveryStatus, "queued"); assert.equal(message.text, "Template: qa_follow_up\nVariaveis: Cliente QA");
});
