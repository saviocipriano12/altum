import assert from "node:assert/strict";
import test, { before, after, mock } from "node:test";
import { FieldValue } from "firebase-admin/firestore";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  CRM_ACTIVITY_CURSOR_KEY: "ab".repeat(32) });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET } = await import("../app/api/tenant/[tenantId]/activities/route.ts");
const { POST: refresh } = await import("../app/api/tenant/[tenantId]/activities/refresh/route.ts");
const { refreshCommercialTaskRecords } = await import("../lib/server/crm/activity-record-refresh.ts");
const { withCommercialTaskIndex } = await import("../lib/crm-task-index.ts");
const { decodeActivityPageCursor, encodeActivityPageCursor, activityPageScope } = await import("../lib/server/crm/activity-page-cursor.ts");
const { readCommercialTaskPage } = await import("../lib/server/crm/activity-page-read.ts");
const { assertTenantAccess } = await import("../lib/server/tenant.ts");
const { parseActivityFilters } = await import("../lib/crm-activity-filter.ts");
const tenantId = `qa_activity_page_${Date.now()}`, uid = `${tenantId}_owner`, peer = `${tenantId}_peer`;
const leadId = `${tenantId}_lead`, membership = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
const control = adminDb.collection("tenant_entitlements").doc(tenantId);
let token = "", sequence = 0;
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "PageLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, name: "Vendedor fictício", role: "client_agent", status: "active" });
  await membership.set({ tenantId, userId: uid, status: "active", role: "client_agent", capabilities: ["edit_leads"] });
  await control.set({ tenantId, mode: "custom", modules: { crm: true }, taskIndexWriteProtocol: 1, taskIndexReadProtocol: 1, taskIndexCoverageRevision: "fixture-1" });
  await adminDb.collection("leads").doc(leadId).set({ tenantId, ownerId: uid, nome: "Ágata fictícia" });
  await adminDb.collection("leads").doc(`${tenantId}_other`).set({ tenantId, ownerId: peer, nome: "Carteira reservada" });
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "PageLocalOnly2026!", returnSecureToken: true }),
  }); assert.equal(res.status, 200); token = (await res.json()).idToken;
});
after(async () => {
  for (const name of ["users", "tenant_users", "tenant_entitlements", "leads", "lead_tasks"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function task(extra: Record<string, unknown> = {}) {
  const ref = adminDb.collection("lead_tasks").doc(`${tenantId}_${String(++sequence).padStart(5, "0")}`);
  await ref.set(withCommercialTaskIndex({ tenantId, leadId, title: "Retornar", status: "pending", dueAt: new Date("2026-10-23T14:00:00Z"), ...extra })); return ref;
}
async function feed(params: Record<string, string> = {}) {
  const query = new URLSearchParams({ source: "task", pageSize: "2", ...params });
  const res = await GET(new Request(`http://127.0.0.1/activities?${query}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) });
  return { res, body: await res.json() };
}
async function clearTasks() {
  const rows = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
}
async function refreshRecords(recordIds: unknown, expectedScope: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ source: "task", pageSize: "2", ...params });
  const res = await refresh(new Request(`http://127.0.0.1/refresh?${query}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ recordIds, expectedScope }) }), { params: Promise.resolve({ tenantId }) });
  return { res, body: await res.json() };
}

test("opaque cursors reject tampering, other scopes, expiry and missing configuration", () => {
  const scope = activityPageScope([tenantId, uid]), now = Date.now();
  const value = { version: 1 as const, scope, startedAt: now, expiresAt: now + 600000, after: [0, 1, "fictitious-task"] as [number, number, string], reviewSeen: false };
  const cursor = encodeActivityPageCursor(value); assert.deepEqual(decodeActivityPageCursor(cursor, scope, now), value);
  assert.equal(Buffer.from(cursor, "base64url").includes(Buffer.from("fictitious-task")), false);
  assert.throws(() => decodeActivityPageCursor(cursor, "different", now));
  assert.throws(() => decodeActivityPageCursor(cursor, scope, now + 600000));
  assert.throws(() => decodeActivityPageCursor(`${cursor.slice(0, 20)}${cursor[20] === "a" ? "b" : "a"}${cursor.slice(21)}`, scope, now));
  const secret = process.env.CRM_ACTIVITY_CURSOR_KEY; delete process.env.CRM_ACTIVITY_CURSOR_KEY;
  try { assert.throws(() => encodeActivityPageCursor(value), /disponível/); } finally { process.env.CRM_ACTIVITY_CURSOR_KEY = secret; }
});
test("HTTP pages maintain chronological order and ties, with no skipped or duplicated unchanged tasks", async () => {
  await clearTasks();
  const late = await task({ dueAt: new Date("2026-10-24T14:00:00Z") }), first = await task(), tie = await task(), undated = await task({ dueAt: null }), done = await task({ status: "done", dueAt: new Date(1000) });
  const ids: string[] = []; let cursor = "";
  do {
    const { res, body } = await feed(cursor ? { cursor } : {}); assert.equal(res.status, 200);
    ids.push(...body.items.map((item: {recordId: string}) => item.recordId));
    assert.equal(body.pageWork, undefined);
    assert.equal(body.consistency, "live_keyset"); cursor = body.nextCursor || "";
    assert.equal(body.coverage, cursor ? "partial" : "end_reached");
  } while (cursor);
  assert.deepEqual(ids, [first.id, tie.id, late.id, undated.id, done.id]);
});
test("a sparse search scans a bounded page and keeps a continuation instead of claiming zero", async () => {
  await clearTasks(); const batch = adminDb.batch();
  for (let index = 0; index < 205; index++) batch.set(adminDb.collection("lead_tasks").doc(`${tenantId}_scan_${String(index).padStart(4, "0")}`), withCommercialTaskIndex({ tenantId, leadId, status: "pending", title: index === 204 ? "Encontrar este retorno" : "Outro retorno", dueAt: null }));
  await batch.commit();
  const first = await feed({ q: "encontrar" }); assert.equal(first.res.status, 200); assert.equal(first.body.items.length, 0);
  assert.equal(first.body.coverage, "partial"); assert.equal(first.body.pageWork, undefined); assert.ok(first.body.nextCursor);
  const internal = await readCommercialTaskPage({ tenantId, userId: uid, membership: await assertTenantAccess(uid, tenantId),
    filters: parseActivityFilters(new URLSearchParams({ q: "encontrar" })), pageSize: 2 });
  assert.equal(internal.pageWork.taskDocumentsRead, 201); assert.equal(internal.pageWork.leadDocumentsRead, 1);
  const next = await feed({ q: "encontrar", cursor: first.body.nextCursor }); assert.equal(next.res.status, 200);
  assert.equal(next.body.items.length, 1); assert.equal(next.body.coverage, "end_reached");
});
test("current opportunity ownership and tenant links determine access, never cached task ownership", async () => {
  await clearTasks(); await task({ ownerUserId: peer, leadName: "Nome antigo" }); await task({ leadId: `${tenantId}_other`, ownerUserId: uid });
  const foreignId = `${tenantId}_foreign`;
  await adminDb.collection("leads").doc(foreignId).set({ tenantId: `${tenantId}_foreign`, ownerId: uid });
  try {
    await task({ leadId: foreignId }); const first = await feed(); assert.equal(first.res.status, 200);
    assert.equal(first.body.items.length, 1); assert.equal(first.body.items[0].leadId, leadId);
    assert.equal(first.body.items[0].leadName, "Ágata fictícia");
    assert.equal(first.body.leads[0].ownerId, uid); assert.equal(first.body.leadsCoverage, "page");
    await adminDb.collection("leads").doc(leadId).update({ ownerId: peer });
    assert.equal((await feed()).body.items.length, 0);
  } finally { await adminDb.collection("leads").doc(leadId).update({ ownerId: uid }); await adminDb.collection("leads").doc(foreignId).delete(); }
});
test("review cases are delivered explicitly and prevent a false complete result", async () => {
  await clearTasks(); const invalid = await task({ status: false }); await task();
  const { res, body } = await feed(); assert.equal(res.status, 200);
  assert.equal(body.items.length, 1); assert.equal(body.reviewItems[0].recordId, invalid.id);
  assert.equal(body.reviewItems[0].issue, "invalid_status"); assert.equal(body.coverage, "review_required");
});
test("live keysets expose their refresh semantics when a new earlier task arrives between pages", async () => {
  await clearTasks(); const firstTask = await task(), later = await task({ dueAt: new Date("2026-10-24T14:00:00Z") });
  const first = await feed({ pageSize: "1" }); assert.equal(first.body.items[0].recordId, firstTask.id);
  const arrived = await task({ dueAt: new Date("2026-10-22T14:00:00Z") });
  const next = await feed({ pageSize: "1", cursor: first.body.nextCursor });
  assert.equal(next.body.items[0].recordId, later.id); assert.equal(next.body.consistency, "live_keyset");
  assert.equal(next.body.coverage, "end_reached");
  assert.equal((await feed({ pageSize: "1" })).body.items[0].recordId, arrived.id);
});
test("continuations bind filters, membership policy, coverage revision and current authorization", async () => {
  await clearTasks(); for (let index = 0; index < 3; index++) await task();
  const first = await feed(); assert.ok(first.body.nextCursor);
  assert.equal((await feed({ cursor: first.body.nextCursor, q: "different" })).res.status, 400);
  assert.equal((await feed({ cursor: first.body.nextCursor, pageSize: "1" })).res.status, 400);
  await control.update({ taskIndexCoverageRevision: "fixture-2" });
  assert.equal((await feed({ cursor: first.body.nextCursor })).res.status, 400);
  await control.update({ taskIndexCoverageRevision: "fixture-1" });
  await membership.update({ capabilities: ["edit_leads", "view_team_records"] });
  assert.equal((await feed({ cursor: first.body.nextCursor })).res.status, 400);
  await membership.update({ capabilities: ["edit_leads"], status: "blocked" });
  try { assert.equal((await feed({ cursor: first.body.nextCursor })).res.status, 403); }
  finally { await membership.update({ status: "active" }); }
});
test("rollout is explicit, old requests remain compatible, and invalid paging requests fail clearly", async () => {
  await control.update({ taskIndexReadProtocol: 0 });
  assert.equal((await feed()).res.status, 409);
  const legacy = await GET(new Request("http://127.0.0.1/activities?source=task", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) });
  assert.equal(legacy.status, 200); assert.equal((await legacy.json()).contractVersion, 1);
  await control.update({ taskIndexReadProtocol: 1 });
  const invalid: Array<Record<string, string>> = [{ pageSize: "0" }, { pageSize: "51" }, { pageSize: "1.5" }, { source: "appointment" }, { cursor: "" }];
  for (const params of invalid) assert.equal((await feed(params)).res.status, 400);
});
test("automatic routine admission chooses compatibility only before rollout and never hides an active configuration failure", async () => {
  async function automatic(extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ source: "task", paging: "auto", ...extra });
    const res = await GET(new Request(`http://127.0.0.1/activities?${params}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) });
    return { res, body: await res.json() };
  }
  await control.update({ taskIndexReadProtocol: 0 });
  const compatible = await automatic(); assert.equal(compatible.res.status, 200); assert.equal(compatible.body.contractVersion, 1);
  await adminDb.collection("leads").doc(leadId).update({ ownerId: FieldValue.delete(), assignedUserId: uid, title: "Segunda compra" });
  const legacyOwner = await automatic(); assert.equal(legacyOwner.res.status, 200);
  assert.equal(legacyOwner.body.leads[0].ownerId, uid); assert.equal(legacyOwner.body.leads[0].opportunityTitle, "Segunda compra");
  await control.update({ taskIndexReadProtocol: 1 });
  const paged = await automatic(); assert.equal(paged.res.status, 200); assert.equal(paged.body.contractVersion, 2); assert.equal(paged.body.pageWork, undefined);
  const key = process.env.CRM_ACTIVITY_CURSOR_KEY; delete process.env.CRM_ACTIVITY_CURSOR_KEY;
  try { const failure = await automatic(); assert.equal(failure.res.status, 503); assert.equal(failure.body.code, "activity_paging_unavailable"); }
  finally { process.env.CRM_ACTIVITY_CURSOR_KEY = key; }
  await control.update({ taskIndexWriteProtocol: 0 });
  try { assert.equal((await automatic()).res.status, 409); }
  finally { await control.update({ taskIndexWriteProtocol: 1 }); }
  const invalidAutomatic: Array<Record<string, string>> = [{ source: "appointment" }, { leadId }, { pageSize: "2" }, { cursor: "other" }];
  for (const extra of invalidAutomatic) assert.equal((await automatic(extra)).res.status, 400);
});
test("confirmed-record refresh reads current completion and deadline without modifying records or history", async () => {
  await clearTasks(); const ref = await task(), first = await feed();
  await ref.update(withCommercialTaskIndex({ status: "done", title: "Retorno concluído", dueAt: new Date("2026-10-25T15:00:00Z") }, (await ref.get()).data()!));
  const before = await ref.get(), events = await adminDb.collection("leads").doc(leadId).collection("events").get();
  const result = await refreshRecords([ref.id], first.body.queryScope);
  assert.equal(result.res.status, 200); assert.equal(result.body.items[0].status, "done");
  assert.equal(result.body.items[0].dueAt, "2026-10-25T15:00:00.000Z"); assert.equal(result.body.readWork, undefined);
  assert.deepEqual(result.body.removedIds, []); assert.equal((await ref.get()).updateTime!.isEqual(before.updateTime!), true);
  assert.equal((await adminDb.collection("leads").doc(leadId).collection("events").get()).size, events.size);
});
test("refresh removes a completed record from the pending filter and promotes a corrected review", async () => {
  await clearTasks(); const ref = await task(), first = await feed({ status: "pending" });
  await ref.update(withCommercialTaskIndex({ status: "done" }, (await ref.get()).data()!));
  const done = await refreshRecords([ref.id], first.body.queryScope, { status: "pending" });
  assert.equal(done.res.status, 200); assert.equal(done.body.items.length, 0); assert.deepEqual(done.body.removedIds, [ref.id]);
  const invalid = await task({ status: false }), all = await feed();
  assert.equal((await refreshRecords([invalid.id], all.body.queryScope)).body.reviewItems[0].issue, "invalid_status");
  await invalid.update(withCommercialTaskIndex({ status: "pending" }, (await invalid.get()).data()!));
  const corrected = await refreshRecords([invalid.id], all.body.queryScope);
  assert.equal(corrected.body.reviewItems.length, 0); assert.equal(corrected.body.items[0].recordId, invalid.id);
});
test("refresh cannot disclose guessed foreign, missing or reassigned records despite cached task ownership", async () => {
  await clearTasks(); const ref = await task({ ownerUserId: uid }), first = await feed();
  const foreign = adminDb.collection("lead_tasks").doc(`${tenantId}_foreign_task`);
  const foreignParent = adminDb.collection("leads").doc(`${tenantId}_foreign_parent`);
  await foreign.set(withCommercialTaskIndex({ tenantId: `${tenantId}_other_company`, leadId, title: "Reservado", status: "pending", dueAt: null }));
  await foreignParent.set({ tenantId: `${tenantId}_other_company`, ownerId: uid, nome: "Reservado" });
  const wrongParent = await task({ leadId: foreignParent.id, ownerUserId: uid });
  try {
    const result = await refreshRecords([foreign.id, `${tenantId}_missing`, wrongParent.id], first.body.queryScope);
    assert.equal(result.res.status, 200); assert.deepEqual(result.body.items, []); assert.deepEqual(result.body.reviewItems, []);
    assert.deepEqual(result.body.removedIds, [foreign.id, `${tenantId}_missing`, wrongParent.id]); assert.deepEqual(result.body.leads, []);
    await adminDb.collection("leads").doc(leadId).update({ assignedTo: peer });
    const denied = await refreshRecords([ref.id], first.body.queryScope);
    assert.deepEqual(denied.body.items, []); assert.deepEqual(denied.body.removedIds, [ref.id]);
  } finally { await foreign.delete(); await foreignParent.delete(); await adminDb.collection("leads").doc(leadId).update({ assignedTo: FieldValue.delete() }); }
});
test("refresh checks current scope, module, coverage and blocked membership before returning any record", async () => {
  await clearTasks(); const ref = await task(), first = await feed();
  assert.equal((await refreshRecords([ref.id], first.body.queryScope, { q: "other" })).res.status, 409);
  await membership.update({ capabilities: ["edit_leads", "view_team_records"] });
  assert.equal((await refreshRecords([ref.id], first.body.queryScope)).res.status, 409);
  await membership.update({ capabilities: ["edit_leads"] });
  await control.update({ taskIndexCoverageRevision: "new-coverage" });
  assert.equal((await refreshRecords([ref.id], first.body.queryScope)).res.status, 409);
  await control.update({ taskIndexCoverageRevision: "fixture-1", "modules.crm": false });
  assert.equal((await refreshRecords([ref.id], first.body.queryScope)).res.status, 403);
  await control.update({ "modules.crm": true }); await membership.update({ status: "blocked" });
  try { assert.equal((await refreshRecords([ref.id], first.body.queryScope)).res.status, 403); }
  finally { await membership.update({ status: "active" }); }
});
test("refresh rejects malformed or oversized identity lists and preserves distinct long IDs exactly", async () => {
  await clearTasks(); const first = await feed();
  for (const ids of [["../bad"], [" id "], ["."], [1], "not-an-array", Array.from({ length: 101 }, (_, index) => `id_${index}`)])
    assert.equal((await refreshRecords(ids, first.body.queryScope)).res.status, 400);
  const id = `${tenantId}_${"x".repeat(300 - tenantId.length - 1)}`, ref = adminDb.collection("lead_tasks").doc(id);
  await ref.set(withCommercialTaskIndex({ tenantId, leadId, title: "Identidade longa fictícia", status: "pending", dueAt: null }));
  const result = await refreshRecords([id, id], first.body.queryScope);
  assert.equal(result.res.status, 200); assert.equal(result.body.items.length, 1); assert.equal(result.body.items[0].recordId, id);
  assert.deepEqual((await refreshRecords([], first.body.queryScope)).body.items, []);
});
test("refresh resolves at most the requested task documents and their actual parents", async () => {
  await clearTasks(); const ref = await task(), first = await feed(), currentMembership = await assertTenantAccess(uid, tenantId);
  const ids = [ref.id, ...Array.from({ length: 99 }, (_, index) => `${tenantId}_missing_${index}`)];
  const original = adminDb.getAll.bind(adminDb), sizes: number[] = [];
  const interceptor = mock.method(adminDb, "getAll", (...args: Parameters<typeof original>) => {
    sizes.push(args.filter(value => value && typeof value === "object" && "path" in value).length); return original(...args);
  });
  try {
    const result = await refreshCommercialTaskRecords({ tenantId, userId: uid, membership: currentMembership,
      filters: parseActivityFilters(new URLSearchParams()), pageSize: 2, expectedScope: first.body.queryScope, recordIds: ids });
    assert.equal(result.readWork.taskDocumentsRead, 100); assert.equal(result.readWork.leadDocumentsRead, 1);
    assert.deepEqual(sizes, [1, 100, 1]); assert.equal(result.items.length, 1);
  } finally { interceptor.mock.restore(); }
});
test("a read-only profile can refresh its record without gaining mutation permission", async () => {
  await clearTasks(); const ref = await task(), before = await ref.get();
  await membership.update({ role: "client_viewer", capabilities: [] });
  try {
    const first = await feed(); assert.equal(first.res.status, 200); assert.equal(first.body.canEdit, false);
    const result = await refreshRecords([ref.id], first.body.queryScope);
    assert.equal(result.res.status, 200); assert.equal(result.body.items[0].recordId, ref.id); assert.equal(result.body.canEdit, false);
    const { PATCH } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/tasks/[taskId]/route.ts");
    const denied = await PATCH(new Request("http://127.0.0.1/task", { method: "PATCH", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ status: "done" }) }), { params: Promise.resolve({ tenantId, leadId, taskId: ref.id }) });
    assert.equal(denied.status, 403); assert.equal((await ref.get()).updateTime!.isEqual(before.updateTime!), true);
  } finally { await membership.update({ role: "client_agent", capabilities: ["edit_leads"] }); }
});
