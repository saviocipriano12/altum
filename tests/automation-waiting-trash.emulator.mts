import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { normalizeAutomationDoc, processWaitingReplyAutomations: consume, processPendingAutomationActions: periodic } = await import("../lib/server/automations.ts");
const { admitWaitingReplyBatch: admit } = await import("../lib/server/crm/waiting-reply-occurrence.ts");
const { deleteTenantLead, restoreTenantTrash, purgeExpiredTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); return originalFetch(input, init);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "jobs", "automations", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "pipeline", "ai_logs", "audit_logs", "tenant_trash", "deletion_audits", "deletion_certificates"]) {
    assert.ok(tenantId.startsWith("qa_waiting_trash_"));
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_waiting_trash_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_chat`), rule = adminDb.collection("automations").doc(`${tenantId}_rule`), waitingAt = new Date(Date.now() - 7200_000);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await lead.set({ tenantId, nome: "Cliente fictício", pipelineStage: "captado" });
  await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", lastClientMessageAt: waitingAt });
  await rule.set({ tenantId, name: "Espera fictícia", enabled: true, status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 }, actions: [{ type: "create_task", title: "Conferir espera" }] });
  return { tenantId, lead, chat, rule, input: { tenantId, leadId: lead.id, chatId: chat.id, waitingKey: String(waitingAt.getTime()), normalize: normalizeAutomationDoc, matches: () => true },
    jobs: () => adminDb.collection("jobs").where("tenantId", "==", tenantId).get(), tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get() };
}
for (const state of ["completed", "ready", "scheduled"] as const) test(`waiting deletion/restoration preserves ${state} roots, rule fences and effect identity without authorization to repeat`, async () => {
  const f = await fixture();
  if (state === "scheduled") await f.rule.update({ actions: [{ type: "add_note", text: "Nota futura", waitInHours: 1 }] });
  if (state === "ready") assert.ok(await admit(f.input)); else assert.equal((await consume({ tenantId: f.tenantId })).executed, 1);
  const before = (await f.jobs()).docs, root = before.find(doc => doc.data().type === "automation_waiting_reply_runtime"); assert.ok(root);
  const fences = before.filter(doc => doc.data().type === "automation_waiting_reply_legacy_fence"); assert.equal(fences.length, 2);
  const originalTasks = (await f.tasks()).docs.map(doc => doc.id);
  const removed = await deleteTenantLead({ tenantId: f.tenantId, leadId: f.lead.id }); assert.ok(removed.trashId);
  assert.equal((await f.jobs()).size, 0); assert.equal((await f.tasks()).size, 0); assert.equal((await f.chat.get()).exists, false);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.deepEqual((await f.jobs()).docs.map(doc => doc.id).sort(), before.map(doc => doc.id).sort());
  assert.equal((await root.ref.get()).data()?.runtimeProtocolVersion, 4);
  assert.equal((await root.ref.get()).data()?.status, state === "ready" ? "reconciliation_required" : "done");
  for (const fence of fences) { const saved = (await fence.ref.get()).data()!; assert.equal(saved.runtimeCanonicalId, root.id); assert.equal(saved.status, "claimed"); }
  if (state === "scheduled") {
    const schedule = before.find(doc => doc.data().type === "automation_scheduled_action"); assert.ok(schedule);
    const saved = (await schedule.ref.get()).data()!; assert.equal(saved.status, "reconciliation_required"); assert.equal(saved.restorationPreviousStatus, "pending");
    assert.ok(saved.executeAfter.isEqual(schedule.data().executeAfter));
  }
  await periodic({ tenantId: f.tenantId }); assert.equal((await consume({ tenantId: f.tenantId })).executed, 0);
  assert.deepEqual((await f.tasks()).docs.map(doc => doc.id).sort(), originalTasks.sort());
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", f.tenantId).get()).size, 0);
});
test("expired waiting trash purges the original batch, both rule fences and receipts with a durable certificate", async () => {
  const f = await fixture(); assert.equal((await consume({ tenantId: f.tenantId })).executed, 1);
  const before = (await f.jobs()).docs; assert.ok(before.length >= 3);
  const removed = await deleteTenantLead({ tenantId: f.tenantId, leadId: f.lead.id }); assert.ok(removed.trashId);
  const trash = adminDb.collection("tenant_trash").doc(removed.trashId); await trash.update({ expiresAt: new Date(Date.now() - 1000) });
  const result = await purgeExpiredTenantTrash({ tenantId: f.tenantId }); assert.equal(result.purged, 1); assert.equal(result.failed, 0); assert.equal(result.needsReview, 0);
  assert.equal((await f.jobs()).size, 0); assert.equal((await f.tasks()).size, 0); assert.equal((await f.lead.get()).exists, false); assert.equal((await f.chat.get()).exists, false);
  assert.equal((await trash.get()).exists, false); assert.equal((await trash.collection("documents").get()).size, 0);
  const certificate = await adminDb.collection("deletion_certificates").doc(`trash_purge_${removed.trashId}`).get(); assert.equal(certificate.data()?.status, "completed");
  for (const doc of before) assert.equal((await doc.ref.get()).exists, false);
});
