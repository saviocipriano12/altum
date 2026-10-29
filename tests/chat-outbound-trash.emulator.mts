import test, { after } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatText, queueTenantChatTemplate, queueTenantChatMediaBuffer, processChatOutboundJobs, reprocessTenantChatOutboundJob } = await import("../lib/server/chat-outbound.ts");
const { deleteTenantChat, deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenantId = `qa_outbound_trash_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let calls = 0;
let duringProvider: (() => Promise<void>) | null = null;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com");
  if (target.pathname.endsWith("/qa-trash-number/media")) return Response.json({ id: "qa-trash-upload" });
  assert.match(target.pathname, /\/qa-trash-number\/messages$/);
  assert.ok(["text", "template", "document"].includes(JSON.parse(String(options?.body)).type));
  calls++;
  await duringProvider?.();
  return Response.json({ messages: [{ id: `wamid.qa-trash-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-trash-number", accessToken: "qa-only" });
after(async () => {
  globalThis.fetch = originalFetch;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  assert.ok(tenantId.startsWith("qa_outbound_trash_"));
  for (const collection of ["leads", "chats", "messages", "chat_outbound_jobs", "chat_outbound_locks", "chat_state", "crm_observation_jobs", "tenant_channels", "tenant_trash", "deletion_audits", "audit_logs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  const bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
  const prefix = `chat-media/${tenantId}/`;
  const [files] = await bucket.getFiles({ prefix });
  for (const file of files) { assert.ok(file.name.startsWith(prefix)); await file.delete({ ignoreNotFound: true }); }
  await adminDb.terminate();
});
async function fixture(name: string, kind: "text" | "template" | "media" = "text") {
  const leadId = `${tenantId}_${name}_lead`, chatId = `${tenantId}_${name}_chat`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente ficticio" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channelId, channel: "whatsapp", contactPhone: "5511000000087", lastClientMessageAt: new Date() });
  const input = { tenantId, chatId, actor: { id: "qa-human", name: "Atendente QA" }, clientRequestId: `trash-${name}-0001`, text: "Mensagem ficticia" };
  const queued = kind === "template" ? await queueTenantChatTemplate({ ...input, templateName: "qa_follow_up", bodyParams: ["Cliente QA"] })
    : kind === "media" ? await queueTenantChatMediaBuffer({ ...input, mediaType: "document", filename: "fixture.txt", contentType: "text/plain", buffer: Buffer.from("QA deleted delivery") })
    : await queueTenantChatText(input);
  return { ...input, leadId, queued, job: adminDb.collection("chat_outbound_jobs").doc(queued.jobId), message: adminDb.collection("messages").doc(queued.messageId) };
}
for (const entity of ["chat", "lead"] as const) test(`restoring ${entity} revokes a queued outbound delivery without consuming a provider attempt`, async () => {
  const f = await fixture(`ready-${entity}`), before = calls;
  const removed = entity === "chat" ? await deleteTenantChat(f) : await deleteTenantLead(f);
  assert.ok(removed.trashId); assert.equal((await f.job.get()).exists, false);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  await processChatOutboundJobs({ jobId: f.queued.jobId });
  assert.equal(calls, before, "Restoration must not resend a historical queued message");
  const job = (await f.job.get()).data()!, message = (await f.message.get()).data()!;
  assert.equal(job.status, "reconciliation_required"); assert.equal(job.attempts, 0);
  assert.equal(job.errorCode, "RESTORED_DELIVERY_REQUIRES_REVIEW"); assert.equal(job.reconciliationReason, "restored_from_trash");
  assert.equal(message.status, "pending_confirmation"); assert.equal(message.deliveryStatus, "confirmation_pending");
  await assert.rejects(reprocessTenantChatOutboundJob({ tenantId, jobId: f.queued.jobId, actorId: f.actor.id }), /Confirme/);
});

test("restoration preserves completed delivery proof and provider receipt without resending", async () => {
  const f = await fixture("completed");
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "sent");
  const before = calls, previous = (await f.job.get()).data()!;
  const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  const restored = (await f.job.get()).data()!; delete restored.restoredAt;
  assert.deepEqual(restored, previous);
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before);
  assert.equal((await queueTenantChatText(f)).jobId, f.queued.jobId);
});

test("restoring interrupted outbound work keeps its prior provider fence and attempt evidence", async () => {
  const f = await fixture("interrupted"), before = calls;
  await f.job.update({ status: "processing", attempts: 1, leaseToken: "qa-old-lease", leaseUntil: new Date(0), providerAttemptId: "qa-old-lease", providerAttemptCount: 1, providerAttemptStartedAt: new Date(1) });
  const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  const restored = (await f.job.get()).data()!;
  assert.equal(restored.status, "reconciliation_required"); assert.equal(restored.providerAttemptId, "qa-old-lease");
  assert.equal(restored.providerAttemptCount, 1); assert.equal(restored.attempts, 1);
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before);
});

test("legacy retrying delivery without fence metadata is restored into review rather than dispatched", async () => {
  const f = await fixture("legacy"), before = calls;
  const { FieldValue } = await import("firebase-admin/firestore");
  await f.job.update({ status: "retrying", attempts: 2, dueAt: new Date(0), deliveryProtocolVersion: FieldValue.delete() });
  const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  const restored = (await f.job.get()).data()!;
  assert.equal(restored.status, "reconciliation_required"); assert.equal(restored.attempts, 2);
  assert.equal(restored.deliveryProtocolVersion, undefined);
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before);
});

test("a human can explicitly authorize the restored pending delivery using the same accepted slot", async () => {
  const f = await fixture("human-retry"), before = calls;
  const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  const replay = await queueTenantChatText(f);
  assert.equal(replay.jobId, f.queued.jobId); assert.equal(replay.status, "reconciliation_required");
  await reprocessTenantChatOutboundJob({ tenantId, jobId: f.queued.jobId, actorId: f.actor.id, confirmedNotDelivered: true });
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "sent");
  assert.equal(calls, before + 1);
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
});

test("restoring during an in-flight provider call cannot reactivate the old lease or lose attempt evidence", async () => {
  const f = await fixture("inflight"), before = calls;
  duringProvider = async () => {
    duringProvider = null;
    const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
    await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  const restored = (await f.job.get()).data()!;
  assert.equal(restored.status, "reconciliation_required"); assert.equal(restored.providerAttemptCount, 1);
  assert.ok(restored.providerAttemptStartedAt); assert.equal(calls, before + 1);
  const message = (await f.message.get()).data()!;
  assert.equal(message.deliveryStatus, "sent"); assert.ok(message.metaMessageId, "Actual provider acknowledgement must be preserved");
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
});

test("restoration never downgrades a delivery receipt already marked read", async () => {
  const f = await fixture("early-receipt"), before = calls;
  await f.message.update({ status: "read", deliveryStatus: "read", metaMessageId: "wamid.qa-early-read" });
  const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  const message = (await f.message.get()).data()!;
  assert.equal(message.status, "read"); assert.equal(message.deliveryStatus, "read"); assert.equal(message.metaMessageId, "wamid.qa-early-read");
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before);
});

test("provider acknowledgement after deletion is archived without resurrecting chat or messages", async () => {
  const f = await fixture("deleted-inflight"), before = calls;
  let trashId = "";
  duringProvider = async () => {
    duringProvider = null;
    const removed = await deleteTenantChat(f); assert.ok(removed.trashId); trashId = removed.trashId;
  };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  assert.equal(calls, before + 1);
  assert.equal((await adminDb.collection("chats").doc(f.chatId).get()).exists, false, "Late provider ack cannot recreate deleted chat");
  assert.equal((await f.message.get()).exists, false, "Late provider ack cannot recreate deleted message");
  assert.equal((await f.job.get()).exists, false);
  assert.equal((await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).where("chatId", "==", f.chatId).get()).size, 0);
  const archived = await adminDb.collection("tenant_trash").doc(trashId).collection("documents").get();
  const message = archived.docs.find(doc => doc.data().collection === "messages" && doc.data().id === f.queued.messageId)?.data().data;
  assert.equal(message?.metaMessageId, `wamid.qa-trash-${calls}`, "Archive must retain the actual provider receipt");
  await restoreTenantTrash({ tenantId, trashId });
  assert.equal((await f.message.get()).data()?.metaMessageId, message.metaMessageId);
  await processChatOutboundJobs({ jobId: f.queued.jobId });
  assert.equal(calls, before + 1);
});

for (const kind of ["template", "media"] as const) test(`deleted in-flight ${kind} keeps its late provider receipt only in trash`, async () => {
  const f = await fixture(`deleted-${kind}`, kind), before = calls;
  let trashId = "";
  duringProvider = async () => { duringProvider = null; const removed = await deleteTenantChat(f); assert.ok(removed.trashId); trashId = removed.trashId; };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  assert.equal(calls, before + 1);
  assert.equal((await adminDb.collection("chats").doc(f.chatId).get()).exists, false);
  assert.equal((await f.message.get()).exists, false);
  const archived = await adminDb.collection("tenant_trash").doc(trashId).collection("documents").get();
  const receipt = archived.docs.find(doc => doc.data().collection === "messages" && doc.data().id === f.queued.messageId)?.data().data;
  assert.equal(receipt?.metaMessageId, `wamid.qa-trash-${calls}`);
  await restoreTenantTrash({ tenantId, trashId });
  assert.equal((await f.job.get()).data()?.status, "completed");
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
});

test("deleting the lead during delivery archives the receipt in its child chat manifest", async () => {
  const f = await fixture("deleted-lead-inflight"), before = calls;
  let trashId = "";
  duringProvider = async () => { duringProvider = null; const removed = await deleteTenantLead(f); assert.ok(removed.trashId); trashId = removed.trashId; };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
  assert.equal((await adminDb.collection("chats").doc(f.chatId).get()).exists, false);
  assert.equal((await f.message.get()).exists, false);
  await restoreTenantTrash({ tenantId, trashId });
  assert.equal((await f.message.get()).data()?.metaMessageId, `wamid.qa-trash-${calls}`);
  assert.equal((await processChatOutboundJobs({ jobId: f.queued.jobId })).results[0]?.status, "skipped");
  assert.equal(calls, before + 1);
});

test("ambiguous trash manifests cannot receive a late acknowledgement or recreate live data", async () => {
  const f = await fixture("ambiguous-archive"), before = calls;
  let trashId = "";
  duringProvider = async () => {
    duringProvider = null;
    const removed = await deleteTenantChat(f); assert.ok(removed.trashId); trashId = removed.trashId;
    const original = await adminDb.collection("tenant_trash").doc(trashId).get();
    await adminDb.collection("tenant_trash").doc(`${trashId}_ambiguous`).set(original.data()!);
  };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  assert.equal(calls, before + 1);
  assert.equal((await adminDb.collection("chats").doc(f.chatId).get()).exists, false);
  assert.equal((await f.message.get()).exists, false);
  const archived = await adminDb.collection("tenant_trash").doc(trashId).collection("documents").get();
  assert.ok(archived.docs.filter(doc => doc.data().collection === "messages").every(doc => !doc.data().data.metaMessageId));
});

for (const mutation of ["tenant", "fence"] as const) test(`late acknowledgement rejects an archived ${mutation} mismatch without rewriting proof`, async () => {
  const f = await fixture(`archive-mismatch-${mutation}`), before = calls;
  let originalMessage: FirebaseFirestore.DocumentSnapshot | undefined;
  duringProvider = async () => {
    duringProvider = null;
    const removed = await deleteTenantChat(f); assert.ok(removed.trashId);
    const manifest = await adminDb.collection("tenant_trash").doc(removed.trashId).collection("documents").get();
    const job = manifest.docs.find(doc => doc.data().collection === "chat_outbound_jobs" && doc.data().id === f.queued.jobId)!;
    originalMessage = manifest.docs.find(doc => doc.data().collection === "messages" && doc.data().id === f.queued.messageId)!;
    await job.ref.update(mutation === "tenant" ? { "data.tenantId": `${tenantId}_foreign` } : { "data.providerAttemptId": "qa-different-lease" });
  };
  try { await processChatOutboundJobs({ jobId: f.queued.jobId }); } finally { duringProvider = null; }
  assert.equal(calls, before + 1);
  assert.ok(originalMessage);
  assert.ok((await originalMessage.ref.get()).updateTime!.isEqual(originalMessage.updateTime!), "Foreign or unproved attempt cannot receive this receipt");
  assert.equal((await adminDb.collection("chats").doc(f.chatId).get()).exists, false);
  assert.equal((await f.message.get()).exists, false);
});
