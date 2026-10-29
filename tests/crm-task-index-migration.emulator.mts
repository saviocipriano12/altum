import assert from "node:assert/strict";
import test, { after } from "node:test";
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { previewTaskIndexPage: preview, applyTaskIndexEntry: apply, rollbackTaskIndexEntry: rollback, taskIndexSourceFingerprint: fingerprint } = await import("../lib/server/crm/task-index-migration.ts");
const tenantId = `qa_task_index_${Date.now()}`;
let sequence = 0;
async function fixture(extra: Record<string, unknown> = {}) {
  const ref = adminDb.collection("lead_tasks").doc(`${tenantId}_${++sequence}`);
  await ref.set({ tenantId, leadId: "fictitious-lead", title: "Retorno fictício", status: "pending", dueAt: "2026-10-23T14:00:00Z", version: 2, updatedAt: new Date(), ...extra });
  const entry = (await preview({ tenantId, limit: 200 })).entries.find(row => row.taskId === ref.id)!;
  return { ref, entry };
}
after(async () => {
  for (const name of ["lead_tasks", "audit_logs"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(doc => doc.ref.delete()));
  }
  await adminDb.terminate();
});
test("preview is read-only, paginated and explicit about incomplete coverage and invalid legacy values", async () => {
  const f = await fixture(), before = await f.ref.get();
  await fixture({ dueAt: "invalid" }); await fixture({ status: "unknown" });
  const first = await preview({ tenantId, limit: 1 }); assert.equal(first.coverageComplete, false); assert.ok(first.nextCursor);
  const next = await preview({ tenantId, limit: 200, cursor: first.nextCursor });
  assert.equal(next.reachedEnd, true); assert.equal(next.coverageComplete, false); assert.equal(next.entries.filter(row => row.action === "review").length, 2);
  assert.equal((await f.ref.get()).updateTime!.isEqual(before.updateTime!), true);
  assert.equal((await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).get()).empty, true);
});
test("backfill and rollback preserve all business facts, dates and version; replay creates one audit", async () => {
  const f = await fixture(), original = (await f.ref.get()).data()!, beforeHash = fingerprint(original);
  const results = await Promise.all([apply(tenantId, f.entry), apply(tenantId, f.entry)]);
  assert.equal(results.filter(row => row.applied).length, 1); assert.equal(results[0].auditId, results[1].auditId);
  const migrated = (await f.ref.get()).data()!; assert.equal(fingerprint(migrated), beforeHash);
  assert.equal(migrated.version, 2); assert.deepEqual(migrated.updatedAt, original.updatedAt);
  assert.equal((await rollback(tenantId, results[0].auditId)).rolledBack, true);
  assert.deepEqual((await f.ref.get()).data(), original);
  assert.equal((await rollback(tenantId, results[0].auditId)).rolledBack, false);
  await assert.rejects(apply(tenantId, f.entry), /OCCURRENCE_CONFLICT/);
});
test("stale or recreated tasks cannot consume a reviewed backfill plan", async () => {
  for (const kind of ["edit", "recreate"] as const) {
    const f = await fixture();
    if (kind === "edit") await f.ref.update({ title: "Edição humana" });
    else { const row = (await f.ref.get()).data()!; await f.ref.delete(); await f.ref.set(row); }
    const baseline = await f.ref.get();
    await assert.rejects(apply(tenantId, f.entry), /SOURCE_CHANGED/);
    assert.equal((await f.ref.get()).updateTime!.isEqual(baseline.updateTime!), true);
  }
});
test("rollback refuses newer business edits, replacement generations and changed index metadata", async () => {
  for (const kind of ["business", "index", "recreate"] as const) {
    const f = await fixture(), applied = await apply(tenantId, f.entry);
    if (kind === "business") await f.ref.update({ status: "done" });
    if (kind === "index") await f.ref.update({ "crmTaskIndex.dueOrder": 0 });
    if (kind === "recreate") { const row = (await f.ref.get()).data()!; await f.ref.delete(); await f.ref.set(row); }
    const baseline = await f.ref.get();
    await assert.rejects(rollback(tenantId, applied.auditId), /ROLLBACK_CONFLICT/);
    assert.equal((await f.ref.get()).updateTime!.isEqual(baseline.updateTime!), true);
  }
});
test("rollback restores a previous index exactly, including null rather than treating it as absent", async () => {
  for (const crmTaskIndex of [null, { version: 0, legacy: true }]) {
    const f = await fixture({ crmTaskIndex }), applied = await apply(tenantId, f.entry);
    await rollback(tenantId, applied.auditId); assert.deepEqual((await f.ref.get()).data()?.crmTaskIndex, crmTaskIndex);
  }
});

test("a foreign lab tenant or altered proposed index cannot apply or undo another task's migration", async () => {
  const f = await fixture(), baseline = await f.ref.get();
  await assert.rejects(apply(`${tenantId}_foreign`, f.entry), /SOURCE_CHANGED/);
  await assert.rejects(apply(tenantId, { ...f.entry, index: { ...f.entry.index, dueOrder: 0 } }), /SOURCE_CHANGED/);
  assert.equal((await f.ref.get()).updateTime!.isEqual(baseline.updateTime!), true);
  const applied = await apply(tenantId, f.entry), current = await f.ref.get();
  await assert.rejects(rollback(`${tenantId}_foreign`, applied.auditId), /INVALID_AUDIT/);
  assert.equal((await f.ref.get()).updateTime!.isEqual(current.updateTime!), true);
});
test("review-only entries, foreign tenants, invalid cursors and nonlocal operation are rejected", async () => {
  const f = await fixture({ dueAt: "invalid" }); await assert.rejects(apply(tenantId, f.entry), /REQUIRES_REVIEW/);
  await assert.rejects(preview({ tenantId: "real-business" }), /LOCAL_LAB_ONLY/);
  await assert.rejects(preview({ tenantId, cursor: "../bad" }), /INVALID_PAGE/);
  const host = process.env.FIRESTORE_EMULATOR_HOST; process.env.FIRESTORE_EMULATOR_HOST = "example.invalid:8080";
  try { await assert.rejects(preview({ tenantId }), /LOCAL_LAB_ONLY/); } finally { process.env.FIRESTORE_EMULATOR_HOST = host; }
});

test("the actual preview command writes a reviewable local artifact without task mutations or customer text", async () => {
  const f = await fixture(), before = await f.ref.get(), output = resolve(".qa-artifacts", `${tenantId}-preview.json`);
  try {
    const result = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/preview-crm-task-index.mts", "--tenant", tenantId, "--out", output], { timeout: 60000, windowsHide: true });
    const summary = JSON.parse(result.stdout); assert.equal(summary.applied, false); assert.equal(summary.indexedReaderReady, false);
    const text = await readFile(output, "utf8"), artifact = JSON.parse(text);
    assert.equal(artifact.kind, "crm-task-index-preview-v1"); assert.ok(artifact.entries.some((row: { taskId: string }) => row.taskId === f.ref.id));
    assert.equal(text.includes("Retorno fictício"), false);
    assert.equal((await f.ref.get()).updateTime!.isEqual(before.updateTime!), true);
  } finally { await unlink(output).catch(() => {}); }
});
