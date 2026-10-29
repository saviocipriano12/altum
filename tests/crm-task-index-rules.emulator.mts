import assert from "node:assert/strict";
import test, { before, after } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { withCommercialTaskIndex } from "../lib/crm-task-index.ts";

const projectId = `demo-task-index-${Date.now().toString(36)}`;
let environment: RulesTestEnvironment, sequence = 0;
const date = Timestamp.fromDate(new Date("2026-10-23T14:00:00Z"));
const db = (uid = "owner") => environment.authenticatedContext(uid).firestore();
const path = () => `lead_tasks/task_${++sequence}`;
const task = (tenantId = "indexed", extra: Record<string, unknown> = {}) => withCommercialTaskIndex({
  tenantId, leadId: "fictitious-lead", title: "Retorno fictício", ownerUserId: "agent", status: "pending", dueAt: date, ...extra,
});
async function seed(target: string, value: Record<string, unknown>) {
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), target), value));
}
before(async () => {
  environment = await initializeTestEnvironment({ projectId, firestore: { host: "127.0.0.1", port: 8080, rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") } });
  await environment.withSecurityRulesDisabled(async context => {
    const store = context.firestore();
    const users = { owner: "client_owner", agency: "agency_admin", agent: "client_agent", viewer: "client_viewer", inactive: "client_owner", other: "client_owner" };
    await Promise.all(Object.entries(users).map(([uid, role]) => setDoc(doc(store, "users", uid), { role, status: uid === "inactive" ? "blocked" : "active" })));
    for (const tenantId of ["indexed", "legacy", "missing"]) await setDoc(doc(store, "tenant_users", `${tenantId}_owner`), { tenantId, userId: "owner", role: "client_owner", status: "active" });
    for (const [uid, role] of [["agent", "client_agent"], ["viewer", "client_viewer"], ["inactive", "client_owner"]]) await setDoc(doc(store, "tenant_users", `indexed_${uid}`), { tenantId: "indexed", userId: uid, role, status: "active" });
    await setDoc(doc(store, "tenant_users", "foreign_other"), { tenantId: "foreign", userId: "other", role: "client_owner", status: "active" });
    await setDoc(doc(store, "tenant_entitlements", "indexed"), { taskIndexWriteProtocol: 1, modules: { crm: true } });
    await setDoc(doc(store, "tenant_entitlements", "legacy"), { taskIndexWriteProtocol: 0 });
  });
});
after(async () => { await environment.clearFirestore(); await environment.cleanup(); });

test("disabled or absent write protocol preserves authorized legacy SDK creation and editing", async () => {
  for (const tenantId of ["legacy", "missing"]) {
    const target = doc(db(), path());
    await assertSucceeds(setDoc(target, { tenantId, title: "Retorno legado", dueAt: "2026-10-23T14:00:00Z" }));
    await assertSucceeds(updateDoc(target, { status: "done", dueAt: null }));
    assert.equal((await getDoc(target)).data()?.crmTaskIndex, undefined);
  }
});
test("enabled protocol accepts matching dated, undated and normalized legacy state indexes", async () => {
  for (const extra of [{}, { dueAt: null }, { dueAt: "" }, { status: "completed" }, { status: "cancelled" }, { status: "no_show" }, { status: "draft" }]) {
    const value = task("indexed", extra), target = doc(db(), path());
    await assertSucceeds(setDoc(target, value));
    assert.deepEqual((await getDoc(target)).data()?.crmTaskIndex, value.crmTaskIndex);
  }
});
test("new SDK tasks cannot omit or forge the indexed state, deadline or schema after activation", async () => {
  const valid = task();
  for (const patch of [{ crmTaskIndex: null }, { crmTaskIndex: { ...valid.crmTaskIndex, dueOrder: 0 } },
    { crmTaskIndex: { ...valid.crmTaskIndex, state: "done" } }, { crmTaskIndex: { ...valid.crmTaskIndex, openRank: 1 } },
    { crmTaskIndex: { ...valid.crmTaskIndex, issue: "invalid_due_at" } }, { crmTaskIndex: { ...valid.crmTaskIndex, version: 2 } },
    { crmTaskIndex: { ...valid.crmTaskIndex, extra: true } }, { status: "unknown" }, { dueAt: "2026-10-23T14:00:00Z" }]) {
    const target = doc(db(), path());
    await assertFails(setDoc(target, { ...valid, ...patch }));
    await assertSucceeds(setDoc(target, valid));
  }
  const { crmTaskIndex: _index, ...withoutIndex } = valid;
  assert.ok(_index); await assertFails(setDoc(doc(db(), path()), withoutIndex));
});
test("SDK rescheduling and completion must update the matching index in the same write", async () => {
  const target = doc(db(), path()); await setDoc(target, task());
  const later = Timestamp.fromDate(new Date("2026-10-24T14:00:00Z"));
  await assertFails(updateDoc(target, { dueAt: later })); await assertFails(updateDoc(target, { status: "done" }));
  await assertSucceeds(updateDoc(target, task("indexed", { dueAt: later, status: "done" })));
  await assertSucceeds(updateDoc(target, { title: "Título corrigido" }));
  await assertFails(updateDoc(target, { crmTaskIndex: null }));
  assert.equal((await getDoc(target)).data()?.status, "done");
});
test("unindexed old tasks retain unrelated edits while changes of state or date require the new contract", async () => {
  const targetPath = path(); await seed(targetPath, { tenantId: "indexed", title: "Legado", status: "pending", dueAt: "2026-10-23T14:00:00Z" });
  const target = doc(db(), targetPath);
  await assertSucceeds(updateDoc(target, { title: "Anotação humana preservada" }));
  await assertFails(updateDoc(target, { dueAt: date })); await assertFails(updateDoc(target, { status: "done" }));
  await assertSucceeds(updateDoc(target, task("indexed", { status: "done" })));
});
test("backfilled string dates can be retained but cannot receive forged or silently changed order keys", async () => {
  const value = task("indexed", { dueAt: "2026-10-23T14:00:00Z" }), targetPath = path(); await seed(targetPath, value);
  const target = doc(db(), targetPath);
  await assertSucceeds(updateDoc(target, { title: "Edição sem alterar prazo" }));
  await assertFails(updateDoc(target, { "crmTaskIndex.dueOrder": 0 }));
  await assertSucceeds(updateDoc(target, task("indexed", { dueAt: value.dueAt, status: "done" })));
  await assertFails(updateDoc(target, task("indexed", { dueAt: "2026-10-25T14:00:00Z", status: "done" })));
  await assertSucceeds(updateDoc(target, task("indexed", { dueAt: Timestamp.fromDate(new Date("2026-10-25T14:00:00Z")), status: "done" })));
});
test("an unindexed legacy string date cannot be assigned a forged order under cover of an unrelated edit", async () => {
  const targetPath = path(); await seed(targetPath, { tenantId: "indexed", title: "Legado", status: "pending", dueAt: "2026-10-23T14:00:00Z" });
  await assertFails(updateDoc(doc(db(), targetPath), task("indexed", { dueAt: "2026-10-23T14:00:00Z" })));
});
test("tenant clients cannot disable the server-managed gate; agency administration stays authorized", async () => {
  await assertFails(updateDoc(doc(db(), "tenant_entitlements", "indexed"), { taskIndexWriteProtocol: 0 }));
  await assertSucceeds(updateDoc(doc(db("agency"), "tenant_entitlements", "indexed"), { taskIndexWriteProtocol: 1 }));
  await assertSucceeds(setDoc(doc(db("agency"), path()), task()));
  await assertFails(setDoc(doc(db("agency"), path()), { ...task(), crmTaskIndex: null }));
});

test("activating the protocol and creating a task in the same batch validates the after-state", async () => {
  const store = db("agency"), tenantId = "atomic-rollout", rejectedPath = path();
  const bad = writeBatch(store);
  bad.set(doc(store, "tenant_entitlements", tenantId), { taskIndexWriteProtocol: 1 });
  bad.set(doc(store, rejectedPath), { tenantId, title: "Missing derived index", status: "pending", dueAt: date });
  await assertFails(bad.commit());
  await environment.withSecurityRulesDisabled(async context => {
    assert.equal((await getDoc(doc(context.firestore(), rejectedPath))).exists(), false);
    assert.equal((await getDoc(doc(context.firestore(), "tenant_entitlements", tenantId))).exists(), false);
  });
  const valid = writeBatch(store);
  valid.set(doc(store, "tenant_entitlements", tenantId), { taskIndexWriteProtocol: 1 });
  valid.set(doc(store, path()), task(tenantId));
  await assertSucceeds(valid.commit());
});
test("the new gate never grants writes to attendants, viewers, inactive users or another tenant", async () => {
  for (const uid of ["agent", "viewer", "inactive", "other"]) await assertFails(setDoc(doc(db(uid), path()), task()));
  const target = doc(db(), path()); await setDoc(target, task());
  await assertSucceeds(getDoc(doc(db("agent"), target.path)));
  await assertFails(updateDoc(doc(db("agent"), target.path), { title: "Tentativa direta" }));
  await assertFails(updateDoc(target, { tenantId: "foreign" }));
});
test("a rejected indexed write rolls back the whole SDK batch; authorized deletion remains available", async () => {
  const store = db(), goodPath = path(), badPath = path(), batch = writeBatch(store);
  batch.set(doc(store, goodPath), task()); batch.set(doc(store, badPath), { ...task(), crmTaskIndex: null });
  await assertFails(batch.commit());
  await environment.withSecurityRulesDisabled(async context => { assert.equal((await getDoc(doc(context.firestore(), goodPath))).exists(), false); });
  const target = doc(store, path()); await setDoc(target, task()); await assertSucceeds(deleteDoc(target));
});
