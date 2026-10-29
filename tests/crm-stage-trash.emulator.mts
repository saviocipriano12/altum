import test, { after, mock } from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "No external transport in trash fixture");
  return originalFetch(url, options);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { getDefaultPipelineStages } = await import("../lib/pipeline.ts");
const { commitOrderPipelineTransition, processOrderPipelineTransition } = await import("../lib/server/crm/order-stage-transition.ts");
const { deleteTenantLead, restoreTenantTrash, deleteTenantTrashPermanently } = await import("../lib/server/tenant-data-deletion.ts");
const { tenantTrashSnapshotId } = await import("../lib/server/tenant-trash-identity.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenants: string[] = [];

/** Reproduce the old writer's persisted state: lead in a complete manifest,
 * internal jobs absent from it and still present under their original IDs. */
async function legacyLeadTrash(f: Awaited<ReturnType<typeof fixture>>) {
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get();
  assert.ok(jobs.size > 0); assert.ok(jobs.docs.every(doc => !doc.data().chatId));
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  const ref = adminDb.collection("tenant_trash").doc(removed.trashId), archived = await ref.collection("documents").get();
  const batch = adminDb.batch();
  for (const job of jobs.docs) batch.create(job.ref, job.data());
  for (const row of archived.docs.filter(doc => doc.data().collection === "jobs")) batch.delete(row.ref);
  const count = archived.size - jobs.size;
  batch.update(ref, { expectedDocumentCount: count, documentCount: count, "collectionCounts.jobs": 0 });
  await batch.commit();
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
  return { ref, jobs, expectedRestored: archived.size };
}

after(async () => {
  globalThis.fetch = originalFetch;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8080");
  for (const tenantId of tenants) {
    assert.ok(tenantId.startsWith("qa_stage_trash_"));
    for (const collection of ["leads", "pipeline", "jobs", "automations", "lead_tasks", "lead_notes", "ecommerce_events", "ecommerce_connections", "tenant_trash", "deletion_audits", "deletion_certificates", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails", "growth_events", "pixel_dispatch_logs", "tenant_usage_monthly"]) {
      const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
      for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
    }
  }
  await adminDb.terminate();
});

async function fixture(kind: string, waitInHours = 0) {
  const tenantId = `qa_stage_trash_${kind}_${Date.now()}`;
  tenants.push(tenantId);
  const leadId = `${tenantId}_lead`, connectionId = `${tenantId}_connection`, eventId = `${tenantId}_event`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, origem: kind, pipelineStage: "captado", stage: "captado" });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages() });
  await adminDb.collection("ecommerce_connections").doc(connectionId).set({ tenantId, provider: "shopify", status: "active" });
  await adminDb.collection("ecommerce_events").doc(eventId).set({ tenantId, connectionId, provider: "shopify", externalEventId: `event:${kind}`,
    normalized: { order: { externalOrderId: `order:${kind}`, status: "created", paymentStatus: "pending", fulfillmentStatus: "" } } });
  await adminDb.collection("automations").doc(`${tenantId}_automation`).set({ tenantId, enabled: true, status: "active",
    trigger: "lead_stage_changed", conditions: { sourceIn: [kind] }, actions: [{ type: "create_task", title: "Revisar pedido ficticio", waitInHours }] });
  const committed = await commitOrderPipelineTransition({ tenantId, leadId, nextStage: "proposta", source: kind,
    skipConversionDispatch: true, orderSource: { id: eventId, connectionId, orderId: `order:${kind}` } });
  return { tenantId, leadId, root: adminDb.collection("jobs").doc(committed.id) };
}

test("lead trash includes completed order roots and internal receipts without chatId and restores deduplication", async () => {
  const f = await fixture("completed");
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).completed, true);
  const before = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get();
  assert.ok(before.size >= 2, "Actual source and internal effect receipt must exist");
  assert.ok(before.docs.every(doc => !doc.data().chatId));
  const removed = await deleteTenantLead(f);
  assert.ok(removed.trashId);
  const remaining = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get();
  assert.equal(remaining.size, 0, "Deleted lead must leave no active root or receipt outside trash");
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await f.root.get()).data()?.status, "done");
  for (const receipt of before.docs) {
    const restored = (await receipt.ref.get()).data()!;
    delete restored.restoredAt;
    assert.deepEqual(restored, receipt.data(), "Completed receipts retain their accepted proof");
  }
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get()).size, 1);
});

test("restoring a lead does not automatically reactivate an unstarted order transition", async () => {
  const f = await fixture("ready");
  assert.equal((await f.root.get()).data()?.status, "ready");
  const removed = await deleteTenantLead(f);
  assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false, "Restore must not grant old automation authority");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get()).size, 0);
});

test("restored delayed internal work stays quarantined while the completed source receipt is retained", async () => {
  const f = await fixture("scheduled", 1 / 3600);
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).completed, true);
  const pending = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_scheduled_action").get();
  assert.equal(pending.size, 1); assert.equal(pending.docs[0].data().chatId, null);
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  assert.equal((await pending.docs[0].ref.get()).exists, false);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await f.root.get()).data()?.status, "done");
  const restored = (await pending.docs[0].ref.get()).data()!;
  assert.equal(restored.status, "reconciliation_required"); assert.equal(restored.restorationPreviousStatus, "pending");
  await processPendingAutomationActions({ tenantId: f.tenantId, limit: 20 });
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 0);
});

test("restore preserves attempt evidence after interrupted effects and never reclaims the root", async () => {
  const f = await fixture("interrupted");
  await f.root.update({ status: "processing", claimToken: "qa-lost-owner", leaseUntil: new Date(0), attempts: 1 });
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  const row = (await f.root.get()).data()!;
  assert.equal(row.status, "reconciliation_required"); assert.equal(row.restorationPreviousStatus, "processing");
  assert.equal(row.attempts, 1); assert.equal(row.claimToken, "qa-lost-owner");
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 0);
});

test("lead deletion and restore cannot collect a foreign receipt with the same leadId", async () => {
  const f = await fixture("isolation"), foreignTenant = `${f.tenantId}_foreign`;
  tenants.push(foreignTenant);
  const foreign = adminDb.collection("jobs").doc(`${foreignTenant}_receipt`);
  await foreign.set({ tenantId: foreignTenant, leadId: f.leadId, type: "automation_internal_effect", status: "done", chatId: null });
  const before = await foreign.get();
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  const manifest = await adminDb.collection("tenant_trash").doc(removed.trashId).collection("documents").get();
  assert.ok(manifest.docs.every(doc => doc.data().data.tenantId === f.tenantId));
  assert.ok((await foreign.get()).updateTime!.isEqual(before.updateTime!));
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.ok((await foreign.get()).updateTime!.isEqual(before.updateTime!));
});

test("legacy lead trash absorbs omitted ready roots without reauthorizing their old intent", async () => {
  const f = await fixture("legacy-ready"), legacy = await legacyLeadTrash(f);
  const result = await restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id });
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false, "Old ready source cannot resume just because lead was restored");
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required");
  assert.equal((await f.root.get()).data()?.attempts, 0);
  assert.equal(result.restored, legacy.expectedRestored);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 0);
});

test("legacy omitted completed roots and receipts are restored together with their original identities and proof", async () => {
  const f = await fixture("legacy-completed");
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).completed, true);
  const legacy = await legacyLeadTrash(f);
  const result = await restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id });
  assert.equal(result.restored, legacy.expectedRestored, "Restore must include the omitted causal records");
  for (const job of legacy.jobs.docs) {
    const restored = (await job.ref.get()).data()!;
    assert.ok(restored.restoredAt); delete restored.restoredAt;
    assert.deepEqual(restored, job.data());
  }
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 1);
});

test("purging a legacy lead manifest includes its omitted internal work in the certificate and removes the live copies", async () => {
  const f = await fixture("legacy-purge"), legacy = await legacyLeadTrash(f);
  const result = await deleteTenantTrashPermanently({ tenantId: f.tenantId, trashId: legacy.ref.id });
  assert.equal(result.documentCount, legacy.expectedRestored);
  assert.equal((await f.root.get()).exists, false); assert.equal((await legacy.ref.get()).exists, false);
  assert.equal((await adminDb.collection("deletion_certificates").doc(result.certificateId).get()).data()?.documentCount, legacy.expectedRestored);
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
});

test("legacy repair never overwrites a recreated live lead or steals its active work", async () => {
  const f = await fixture("legacy-recreated"), legacy = await legacyLeadTrash(f);
  const leadRef = adminDb.collection("leads").doc(f.leadId);
  await leadRef.set({ tenantId: f.tenantId, nome: "Edicao humana posterior", pipelineStage: "captado" });
  const before = await leadRef.get(), job = await f.root.get();
  await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), /Cliente ja existe/);
  await assert.rejects(deleteTenantTrashPermanently({ tenantId: f.tenantId, trashId: legacy.ref.id }), /Cliente ja existe/);
  assert.ok((await leadRef.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await f.root.get()).updateTime!.isEqual(job.updateTime!));
  assert.equal((await legacy.ref.get()).data()?.status, "active");
});

test("identical live and archived copies from interrupted cleanup are absorbed once without inflating the manifest", async () => {
  const f = await fixture("legacy-identical"), before = (await f.root.get()).data()!;
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  const trash = adminDb.collection("tenant_trash").doc(removed.trashId), count = (await trash.get()).data()?.expectedDocumentCount;
  await f.root.create(before);
  const result = await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal(result.restored, count);
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required");
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false);
});

test("divergent live and archived execution proofs block repair without rewriting either copy", async () => {
  const f = await fixture("legacy-conflict"), before = (await f.root.get()).data()!;
  const removed = await deleteTenantLead(f); assert.ok(removed.trashId);
  const trash = adminDb.collection("tenant_trash").doc(removed.trashId);
  const archived = trash.collection("documents").doc(tenantTrashSnapshotId({ collection: "jobs", id: f.root.id }));
  const archivedBefore = await archived.get();
  await f.root.create({ ...before, attempts: 1, claimToken: "qa-other-owner" });
  const liveBefore = await f.root.get();
  await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId }), /diverge do recibo/);
  assert.ok((await f.root.get()).updateTime!.isEqual(liveBefore.updateTime!));
  assert.ok((await archived.get()).updateTime!.isEqual(archivedBefore.updateTime!));
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
});

test("legacy repair rolls back manifest and live work together when archive persistence fails", async () => {
  const f = await fixture("legacy-rollback"), legacy = await legacyLeadTrash(f);
  const before = await f.root.get(), manifestBefore = await legacy.ref.get();
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const failure = new Error("QA_LEGACY_ARCHIVE_UNAVAILABLE");
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith(`${legacy.ref.path}/documents/`)) throw failure;
    return Reflect.apply(original, this, args);
  });
  try { await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), error => error === failure); }
  finally { interceptor.mock.restore(); }
  assert.ok((await f.root.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await legacy.ref.get()).updateTime!.isEqual(manifestBefore.updateTime!));
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
  assert.equal((await restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id })).restored, legacy.expectedRestored);
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required");
});

test("legacy repair resumes a committed first page after lost acknowledgement without losing or duplicating records", async () => {
  const f = await fixture("legacy-pages"), writer = adminDb.bulkWriter();
  for (let index = 0; index < 205; index++) writer.create(adminDb.collection("jobs").doc(`${f.tenantId}_receipt_${String(index).padStart(3, "0")}`), {
    tenantId: f.tenantId, leadId: f.leadId, type: "automation_internal_effect", status: "done", chatId: null, outcome: "applied", proofIndex: index,
  });
  await writer.close();
  const legacy = await legacyLeadTrash(f), original = adminDb.runTransaction;
  let interrupted = false;
  const interceptor = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!interrupted && (await legacy.ref.get()).data()?.legacyJobsAbsorbed >= 200) {
      interrupted = true; throw new Error("QA_LEGACY_COMMIT_ACK_LOST");
    }
    return result;
  });
  try { await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), /QA_LEGACY_COMMIT_ACK_LOST/); }
  finally { interceptor.mock.restore(); }
  assert.equal(interrupted, true);
  assert.equal((await adminDb.collection("leads").doc(f.leadId).get()).exists, false);
  const partial = await legacy.ref.get(), count = (await legacy.ref.collection("documents").count().get()).data().count;
  assert.equal(partial.data()?.expectedDocumentCount, count);
  assert.equal(partial.data()?.legacyJobsAbsorbed, 200);
  const result = await restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id });
  assert.equal(result.restored, legacy.expectedRestored);
  const restored = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("leadId", "==", f.leadId).get();
  assert.equal(restored.size, 206);
  assert.equal(restored.docs.filter(doc => doc.data().status === "done").length, 205);
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required");
});

test("restoration resumes after its committed writes lose acknowledgement without rejecting its own restored lead", async () => {
  const f = await fixture("legacy-restore-ack"), legacy = await legacyLeadTrash(f);
  const probe = adminDb.bulkWriter(), prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const original = prototype.close as FirebaseFirestore.BulkWriter["close"];
  let failed = false;
  const interceptor = mock.method(prototype, "close", async function(this: FirebaseFirestore.BulkWriter) {
    const result = await Reflect.apply(original, this, []);
    if (!failed && (await adminDb.collection("leads").doc(f.leadId).get()).exists) {
      failed = true; throw new Error("QA_RESTORE_WRITES_ACK_LOST");
    }
    return result;
  });
  try { await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), /QA_RESTORE_WRITES_ACK_LOST/); }
  finally { interceptor.mock.restore(); }
  assert.equal(failed, true); assert.equal((await legacy.ref.get()).exists, true);
  assert.equal((await f.root.get()).data()?.status, "reconciliation_required");
  const result = await restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id });
  assert.equal(result.restored, legacy.expectedRestored);
  assert.equal((await legacy.ref.get()).exists, false);
  assert.equal((await processOrderPipelineTransition(f.root.id, f.tenantId)).processed, false);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 0);
});

test("restoration retry preserves human edits after committed writes lose acknowledgement", async () => {
  const f = await fixture("legacy-human-edit"), legacy = await legacyLeadTrash(f);
  const probe = adminDb.bulkWriter(), prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const original = prototype.close as FirebaseFirestore.BulkWriter["close"];
  let failed = false;
  const interceptor = mock.method(prototype, "close", async function(this: FirebaseFirestore.BulkWriter) {
    const result = await Reflect.apply(original, this, []);
    if (!failed && (await adminDb.collection("leads").doc(f.leadId).get()).exists) {
      failed = true; throw new Error("QA_RESTORE_WRITES_ACK_LOST");
    }
    return result;
  });
  try { await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), /QA_RESTORE_WRITES_ACK_LOST/); }
  finally { interceptor.mock.restore(); }
  assert.equal(failed, true);
  const lead = adminDb.collection("leads").doc(f.leadId);
  await lead.update({ nome: "QA human correction" });
  const before = await lead.get(), rootBefore = await f.root.get();
  await assert.rejects(restoreTenantTrash({ tenantId: f.tenantId, trashId: legacy.ref.id }), /Cliente ja existe/);
  assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.ok((await f.root.get()).updateTime!.isEqual(rootBefore.updateTime!));
  assert.equal((await legacy.ref.get()).exists, true);
});
