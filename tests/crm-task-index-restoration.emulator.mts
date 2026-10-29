import assert from "node:assert/strict";
import test, { after, mock } from "node:test";
import { Timestamp } from "firebase-admin/firestore";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const { commercialTaskIndexMatches } = await import("../lib/crm-task-index.ts");
const tenantId = `qa_task_restore_${Date.now()}`;
let sequence = 0;
async function fixture(extra: Record<string, unknown> = {}) {
  const leadId = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(leadId);
  const ref = adminDb.collection("lead_tasks").doc(`${leadId}_task`);
  const row = { tenantId, leadId, title: "Retorno fictício", status: "pending", dueAt: "2026-10-23T14:00:00Z",
    version: 7, updatedAt: Timestamp.fromMillis(1000), ownerUserId: "fictitious-owner", ...extra };
  await lead.set({ tenantId, nome: "Pessoa fictícia" }); await ref.set(row);
  const removed = await deleteTenantLead({ tenantId, leadId }); assert.ok(removed.trashId);
  assert.equal((await ref.get()).exists, false);
  return { ref, row, trashId: removed.trashId };
}
after(async () => {
  for (const name of ["leads", "lead_tasks", "tenant_trash", "deletion_audits"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});

test("restoring old tasks rebuilds absent or obsolete metadata and preserves business facts", async () => {
  for (const extra of [{}, { crmTaskIndex: null }, { crmTaskIndex: { version: 0, state: "done", dueOrder: 0 } }, { dueAt: null }]) {
    const f = await fixture(extra); await restoreTenantTrash({ tenantId, trashId: f.trashId });
    const restored = (await f.ref.get()).data()!;
    assert.equal(commercialTaskIndexMatches(restored), true); assert.ok(restored.restoredAt);
    const actual = { ...restored }, expected: Record<string, unknown> = { ...f.row };
    delete actual.crmTaskIndex; delete actual.restoredAt; delete expected.crmTaskIndex;
    assert.deepEqual(actual, expected);
  }
});
test("restored invalid state or deadline remains a review case without correcting business data", async () => {
  for (const extra of [{ dueAt: "invalid" }, { status: false }, { status: 0 }, { status: null }]) {
    const f = await fixture(extra); await restoreTenantTrash({ tenantId, trashId: f.trashId });
    const restored = (await f.ref.get()).data()!;
    assert.equal(commercialTaskIndexMatches(restored), true);
    assert.ok(restored.crmTaskIndex.issue); assert.deepEqual(restored.dueAt, f.row.dueAt); assert.equal(restored.status, f.row.status);
  }
});
test("an exact task restored by the previous writer can resume, while human edits remain protected", async () => {
  const f = await fixture(); await f.ref.create({ ...f.row, restoredAt: Timestamp.now() });
  await restoreTenantTrash({ tenantId, trashId: f.trashId });
  assert.equal(commercialTaskIndexMatches((await f.ref.get()).data()!), true);
  const changed = await fixture();
  await changed.ref.create({ ...changed.row, title: "Correção humana", restoredAt: Timestamp.now() });
  await assert.rejects(restoreTenantTrash({ tenantId, trashId: changed.trashId }), /alterad|concil/i);
  assert.equal((await changed.ref.get()).data()?.title, "Correção humana");
  assert.equal((await adminDb.collection("tenant_trash").doc(changed.trashId).get()).exists, true);
});
test("a lost restoration acknowledgement resumes without duplicating or changing indexed business facts", async () => {
  const f = await fixture(), original = adminDb.recursiveDelete.bind(adminDb);
  const interceptor = mock.method(adminDb, "recursiveDelete", async (...args: Parameters<typeof adminDb.recursiveDelete>) => {
    if (args[0].path === `tenant_trash/${f.trashId}`) throw Error("QA_RESTORE_ACK_LOST");
    return original(...args);
  });
  try { await assert.rejects(restoreTenantTrash({ tenantId, trashId: f.trashId }), /QA_RESTORE_ACK_LOST/); }
  finally { interceptor.mock.restore(); }
  const first = (await f.ref.get()).data()!;
  assert.equal(commercialTaskIndexMatches(first), true);
  await restoreTenantTrash({ tenantId, trashId: f.trashId });
  const resumed = (await f.ref.get()).data()!;
  delete first.restoredAt; delete resumed.restoredAt; assert.deepEqual(resumed, first);
  assert.equal((await adminDb.collection("tenant_trash").doc(f.trashId).get()).exists, false);
});
