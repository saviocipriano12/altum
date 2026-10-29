import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatText, queueTenantChatTemplate, queueTenantChatVoice, queueTenantChatKnowledgeMedia, queueTenantChatMediaBuffer, queueTenantHandoffAcknowledgement, queueTenantHandoffAlert, processChatOutboundJobs, reprocessTenantChatOutboundJob } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_crash_fence_${Date.now()}`, channelId = `${tenantId}_channel`;
const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-crash-number", accessToken: "qa-only" });
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-crash-number\/messages$/);
  const request = JSON.parse(String(options?.body)); assert.equal(request.type, "text");
  const active = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.ok(active.docs.some(row => row.data().providerAttemptStartedAt && row.data().providerAttemptId === row.data().leaseToken));
  calls++; return Response.json({ messages: [{ id: `wamid.qa-crash-parent-${calls}` }] });
};
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000087", lastClientMessageAt: new Date() });
  return { tenantId, chatId, actor: { id: "qa-human", name: "Atendente QA" }, clientRequestId: `crash-${name}-0001` };
}
async function expire(jobId: string, chatId: string) {
  await adminDb.collection("chat_outbound_jobs").doc(jobId).update({ status: "processing", leaseUntil: new Date(0), dueAt: new Date(0) });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(jobId).get()).data()!;
  const scope = job.kind === "handoff_alert" ? `alert:${job.channelId}:${job.recipientPhone}` : chatId;
  const id = createHash("sha256").update(JSON.stringify(["chat-outbound-lock-v1", tenantId, scope])).digest("hex").slice(0, 48);
  await adminDb.collection("chat_outbound_locks").doc(id).set({ tenantId, chatId, jobId, leaseUntil: new Date(0), leaseToken: "expired-fixture" });
}
async function crashWorker(jobId: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/chat-outbound-crash-worker.mts", jobId], { env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", c => output += c); child.stderr.on("data", c => output += c);
    child.on("error", reject); child.on("close", code => { try { assert.equal(code, 71, output); resolve(); } catch (error) { reject(error); } });
  });
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "chat_media_uploads", "tenant_channels", "crm_observation_jobs", "qa_test_provider_calls", "kb_docs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  for (const prefix of [`chat-media/${tenantId}/`, `kb-media/${tenantId}/`]) {
    const [files] = await bucket.getFiles({ prefix });
    assert.ok(files.every(file => file.name.startsWith(prefix)));
    await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
  }
  await adminDb.terminate();
});
for (const kind of ["text", "template", "media", "ai_voice", "ai_knowledge_media", "handoff_ack", "handoff_alert"] as const) test(`process crash after ${kind} provider acceptance cannot cause an automatic second send`, async () => {
  const input = await fixture(kind); const before = calls;
  const accepted = kind === "text" ? await queueTenantChatText({ ...input, text: "Texto QA" })
    : kind === "template" ? await queueTenantChatTemplate({ ...input, templateName: "qa_follow_up", bodyParams: ["Cliente QA"] })
      : kind === "handoff_ack" ? await queueTenantHandoffAcknowledgement({ ...input, sourceMessageId: "qa-source-001", agentName: "Assistente QA", text: "Encaminhamento QA" })
      : kind === "handoff_alert" ? await queueTenantHandoffAlert({ ...input, sourceMessageId: "qa-source-001", channelId, phoneNumberId: "qa-crash-number", recipientPhone: "5511000000077", text: "Alerta interno QA" })
      : kind === "ai_voice" ? await queueTenantChatVoice({ ...input, aiSourceMessageId: "qa-source-001", text: "Resposta QA", actor: { id: "altum_ai", name: "Assistente QA" } })
      : kind === "ai_knowledge_media" ? await (async () => {
        const kbDocId = `${input.chatId}_kb`, mediaStoragePath = `kb-media/${tenantId}/fixture.png`, mediaUrl = "https://qa-assets.invalid/fixture.png";
        await bucket.file(mediaStoragePath).save(Buffer.from("qa image transport fixture"), { metadata: { contentType: "image/png" } });
        await adminDb.collection("kb_docs").doc(kbDocId).set({ tenantId, mediaStoragePath, mediaUrl, mediaType: "image" });
        return queueTenantChatKnowledgeMedia({ ...input, kbDocId, mediaStoragePath, mediaUrl, mediaType: "image", caption: "Material QA", filename: "fixture.png",
          aiSourceMessageId: "qa-source-001", actor: { id: "altum_ai", name: "Assistente QA" } });
      })()
      : await queueTenantChatMediaBuffer({ ...input, mediaType: "document", filename: "qa.txt", contentType: "text/plain", buffer: Buffer.from("qa immutable crash fixture") });
  await crashWorker(accepted.jobId);
  const crashed = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(crashed.status, "processing"); assert.ok(crashed.providerAttemptStartedAt);
  assert.equal((await adminDb.collection("qa_test_provider_calls").doc(accepted.jobId).get()).data()?.accepted, true);
  if (kind === "ai_voice") {
    assert.ok((await adminDb.collection("qa_test_provider_calls").doc(`${accepted.jobId}_tts`).get()).exists);
    assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.mediaUrl, crashed.voiceArtifacts.playback.storagePath);
  }
  if (kind === "ai_knowledge_media") assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.mediaUrl, crashed.mediaArtifact.storagePath);
  await expire(accepted.jobId, input.chatId);
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.providerAttemptCount, 1); assert.equal(job.errorCode, "PROVIDER_OUTCOME_UNKNOWN");
  if (kind === "handoff_alert") assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).exists, false);
  else assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.status, "pending_confirmation");
  await assert.rejects(reprocessTenantChatOutboundJob({ tenantId, jobId: accepted.jobId, actorId: input.actor.id }), /Confirme/);
  if (kind === "text") {
    await reprocessTenantChatOutboundJob({ tenantId, jobId: accepted.jobId, actorId: input.actor.id, confirmedNotDelivered: true });
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "sent");
    assert.equal(calls, before + 1);
    const retried = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
    assert.equal(retried.providerAttemptCount, 2); assert.ok(retried.lastProviderAttemptStartedAt);
  }
});
test("only proof bound to the actual lease permits recovery before dispatch, including mixed deployment workers", async () => {
  for (const mode of ["current", "missing", "stale"] as const) {
    const legacy = mode !== "current";
    const input = await fixture(`before_dispatch_${mode}`); const before = calls;
    const accepted = await queueTenantChatText({ ...input, text: "Texto QA" });
    // Even a new-version enqueue might have been claimed by an old deployment.
    // Only a proof bound to that actual lease permits a safe pre-dispatch retry.
    await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).update({ leaseToken: "crashed-fixture",
      ...(mode === "missing" ? {} : { leaseDeliveryProtocolVersion: 1, leaseDeliveryProtocolToken: mode === "current" ? "crashed-fixture" : "previous-lease" }) });
    await expire(accepted.jobId, input.chatId);
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, legacy ? "reconciliation_required" : "sent");
    assert.equal(calls, before + (legacy ? 0 : 1));
  }
});
test("recovery never downgrades a read receipt even when the job still requires reconciliation", async () => {
  const input = await fixture("read");
  const accepted = await queueTenantChatText({ ...input, text: "Texto QA" });
  await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).update({ providerAttemptStartedAt: new Date(), providerAttemptId: "lost-worker" });
  await adminDb.collection("messages").doc(accepted.messageId).update({ status: "read", deliveryStatus: "read", metaMessageId: "wamid.qa-crash-read" });
  await expire(accepted.jobId, input.chatId);
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
  assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.deliveryStatus, "read");
});

test("lost acknowledgement of the durable fence cannot accidentally invoke or later reinvoke the provider", async () => {
  const input = await fixture("lost_fence_ack"); const before = calls;
  const accepted = await queueTenantChatText({ ...input, text: "Texto QA" });
  const originalTransaction = adminDb.runTransaction.bind(adminDb);
  let transactions = 0;
  const intercepted = async (callback: (transaction: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const number = ++transactions;
    const result = await originalTransaction(callback);
    if (number === 2) throw new Error("simulated lost fence commit acknowledgement");
    return result;
  };
  const hook = mock.method(adminDb, "runTransaction", intercepted as typeof adminDb.runTransaction);
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "retrying");
  } finally { hook.mock.restore(); }
  const ref = adminDb.collection("chat_outbound_jobs").doc(accepted.jobId);
  assert.ok((await ref.get()).data()?.providerAttemptStartedAt);
  await ref.update({ dueAt: new Date(0) });
  assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "reconciliation_required");
  assert.equal(calls, before);
});

test("worker losing ownership before dispatch neither calls the provider nor overwrites the new owner's state", async () => {
  const input = await fixture("lost_ownership"); const before = calls;
  const accepted = await queueTenantChatText({ ...input, text: "Texto QA" });
  const ref = adminDb.collection("chat_outbound_jobs").doc(accepted.jobId);
  const lockId = createHash("sha256").update(JSON.stringify(["chat-outbound-lock-v1", tenantId, input.chatId])).digest("hex").slice(0, 48);
  const originalTransaction = adminDb.runTransaction.bind(adminDb);
  let transactions = 0;
  const intercepted = async (callback: (transaction: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++transactions === 2) {
      await ref.update({ leaseToken: "new-owner", leaseUntil: new Date(Date.now() + 60000) });
      await adminDb.collection("chat_outbound_locks").doc(lockId).update({ leaseToken: "new-owner", leaseUntil: new Date(Date.now() + 60000) });
    }
    return originalTransaction(callback);
  };
  const hook = mock.method(adminDb, "runTransaction", intercepted as typeof adminDb.runTransaction);
  try {
    assert.equal((await processChatOutboundJobs({ jobId: accepted.jobId })).results[0]?.status, "skipped");
  } finally { hook.mock.restore(); }
  const job = (await ref.get()).data()!;
  assert.equal(job.status, "processing"); assert.equal(job.leaseToken, "new-owner"); assert.equal(job.providerAttemptStartedAt, undefined);
  assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.deliveryStatus, "queued");
  assert.equal(calls, before);
});
