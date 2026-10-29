import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { GET: list, POST: create } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/tasks/route.ts");
const { PATCH: update } = await import("../app/api/tenant/[tenantId]/leads/[leadId]/tasks/[taskId]/route.ts");
const { GET: feed } = await import("../app/api/tenant/[tenantId]/activities/route.ts");
const tenantId = `qa_crm_activity_${Date.now()}`, uid = `${tenantId}_seller`, peer = `${tenantId}_peer`;
let token = "";
const membership = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "ActivitiesLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, name: "Vendedor ficticio", role: "client_agent", status: "active" });
  await membership.set({ tenantId, userId: uid, status: "active", role: "client_agent", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${peer}`).set({ tenantId, userId: peer, status: "active", role: "client_agent", capabilities: ["edit_leads"], name: "Colega ficticio" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "ActivitiesLocalOnly2026!", returnSecureToken: true }) });
  assert.equal(res.status, 200); token = (await res.json()).idToken;
});
after(async () => {
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "leads", "lead_tasks", "appointments"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    if (collection === "lead_tasks") {
      // These fixtures have no task subcollections. Drain the owned primitive
      // records together instead of opening a recursive scan per task.
      const writer = adminDb.bulkWriter();
      await Promise.all([...rows.docs.map(row => writer.delete(row.ref)), writer.close()]);
    } else for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(body?: unknown, method = "POST") { return new Request("http://127.0.0.1/activities", { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
async function lead(suffix: string, ownerId = uid) {
  const leadId = `${tenantId}_${suffix}`, ref = adminDb.collection("leads").doc(leadId); await ref.set({ tenantId, ownerId, nome: "Contato ficticio" });
  return { leadId, ref, context: { params: Promise.resolve({ tenantId, leadId }) } };
}
function taskContext(leadId: string, taskId: string) { return { params: Promise.resolve({ tenantId, leadId, taskId }) }; }
async function seedTask(leadId: string, extra: Record<string, unknown> = {}) {
  const ref = adminDb.collection("lead_tasks").doc(); await ref.set({ tenantId, leadId, title: "Retornar", status: "pending", version: 0, ...extra }); return ref;
}
test("a dated return stores its responsible seller, task ID and one atomic history event", async () => {
  const target = await lead("create"), body = { title: "Enviar proposta", dueAt: "2026-10-22T13:00:00-03:00", requestId: "create-return-1" };
  const responses = await Promise.all([create(request(body), target.context), create(request(body), target.context)]);
  for (const res of responses) assert.equal(res.status, 200);
  const data = await Promise.all(responses.map(res => res.json())); assert.ok(data[0].taskId); assert.equal(data[0].taskId, data[1].taskId);
  const task = await adminDb.collection("lead_tasks").doc(data[0].taskId).get();
  assert.equal(task.data()?.ownerUserId, uid); assert.equal(task.data()?.dueAt.toDate().toISOString(), "2026-10-22T16:00:00.000Z");
  assert.deepEqual(task.data()?.crmTaskIndex, { version: 1, state: "pending", openRank: 0, dueOrder: Date.parse("2026-10-22T16:00:00Z"), issue: null });
  assert.equal((await target.ref.collection("events").where("taskId", "==", task.id).get()).size, 1);
  const conflict = await create(request({ ...body, title: "Outro pedido" }), target.context); assert.equal(conflict.status, 409);
});
test("invalid dates and unsupported update bodies do not silently erase a date or reopen a completed task", async () => {
  const target = await lead("invalid"), task = await seedTask(target.leadId, { status: "done", dueAt: new Date("2026-10-22T16:00:00Z") });
  assert.equal((await create(request({ title: "Retornar", dueAt: "not-a-date" }), target.context)).status, 400);
  for (const body of [{}, { status: "oops" }, { dueAt: "tomorrow" }, { dueAt: "2026-02-31T10:00:00Z" }]) {
    assert.equal((await update(request(body, "PATCH"), taskContext(target.leadId, task.id))).status, 400);
  }
  assert.equal((await task.get()).data()?.status, "done"); assert.equal((await target.ref.collection("events").get()).size, 0);
});
test("rescheduling edits the same activity without changing its completion status", async () => {
  const target = await lead("reschedule"), task = await seedTask(target.leadId, { status: "done" });
  const res = await update(request({ title: "Ligar depois", dueAt: "2026-10-23T14:00:00Z", expectedVersion: 0 }, "PATCH"), taskContext(target.leadId, task.id));
  assert.equal(res.status, 200); const row = (await task.get()).data()!;
  assert.equal(row.title, "Ligar depois"); assert.equal(row.status, "done"); assert.equal(row.dueAt.toDate().toISOString(), "2026-10-23T14:00:00.000Z"); assert.equal(row.version, 1);
  assert.deepEqual(row.crmTaskIndex, { version: 1, state: "done", openRank: 1, dueOrder: Date.parse("2026-10-23T14:00:00Z"), issue: null });
});
test("concurrent stale edits cannot overwrite each other and duplicate completion stays harmless", async () => {
  const target = await lead("version"), task = await seedTask(target.leadId);
  const results = await Promise.all(["Primeira correcao", "Segunda correcao"].map(title => update(request({ title, expectedVersion: 0 }, "PATCH"), taskContext(target.leadId, task.id))));
  assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);
  assert.equal((await update(request({ status: "done", expectedVersion: 1 }, "PATCH"), taskContext(target.leadId, task.id))).status, 200);
  const before = await task.get(), count = (await target.ref.collection("events").get()).size;
  assert.equal((await update(request({ status: "done", expectedVersion: 1 }, "PATCH"), taskContext(target.leadId, task.id))).status, 200);
  assert.equal((await update(request({ status: "done" }, "PATCH"), taskContext(target.leadId, task.id))).status, 200);
  assert.ok((await task.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await target.ref.collection("events").get()).size, count);
});
test("only managers can assign an activity to another active seller of the company", async () => {
  const target = await lead("owner");
  assert.equal((await create(request({ title: "Retornar", ownerUserId: peer }), target.context)).status, 403);
  await membership.update({ capabilities: ["edit_leads", "view_team_records"] });
  try {
    assert.equal((await create(request({ title: "Sem acesso ao cliente", ownerUserId: peer }), target.context)).status, 403);
    await target.ref.update({ ownerId: peer });
    const res = await create(request({ title: "Retornar", ownerUserId: peer, requestId: "assign-peer" }), target.context); assert.equal(res.status, 200);
    const taskId = (await res.json()).taskId; assert.equal((await adminDb.collection("lead_tasks").doc(taskId).get()).data()?.ownerUserId, peer);
    assert.equal((await create(request({ title: "Outro retorno", ownerUserId: "foreign-user" }), target.context)).status, 403);
  } finally { await membership.update({ capabilities: ["edit_leads"] }); }
});
test("task listing covers more than one hundred records and foreign opportunities remain denied", async () => {
  const target = await lead("coverage"), batch = adminDb.batch();
  for (let i = 0; i < 125; i++) batch.set(adminDb.collection("lead_tasks").doc(`${target.leadId}_${i}`), { tenantId, leadId: target.leadId, title: `Retorno ${i}`, status: "pending" });
  await batch.commit();
  const res = await list(request(undefined, "GET"), target.context); assert.equal(res.status, 200); assert.equal((await res.json()).items.length, 125);
  const other = await lead("other", peer); assert.equal((await create(request({ title: "Invadir" }), other.context)).status, 403);
});
test("failure to persist the task history rolls back the activity as well", async () => {
  const target = await lead("atomic"), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith(`leads/${target.leadId}/events/`)) throw new Error("QA_TASK_EVENT_FAILURE"); return original.apply(this, args);
  });
  try { assert.equal((await create(request({ title: "Retorno atomico", requestId: "atomic" }), target.context)).status, 500); }
  finally { interceptor.mock.restore(); }
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", target.leadId).get()).size, 0);
});

test("the unified feed keeps task and appointment identities, dates and human priority without inventing a date", async () => {
  const target = await lead("feed"), other = await lead("feed-hidden", peer);
  const task = await seedTask(target.leadId, { title: "Retorno humano", source: "manual", ownerUserId: uid });
  await seedTask(other.leadId, { title: "Retorno de outro vendedor" });
  const appointment = await adminDb.collection("appointments").add({ tenantId, leadId: target.leadId, title: "Reuniao", ownerUserId: uid, status: "scheduled", startAt: "2026-10-22T14:00:00Z" });
  await adminDb.collection("appointments").add({ tenantId, leadId: target.leadId, title: "Sugestao", ownerUserId: uid, status: "draft", source: "ai", startAt: "2026-10-21T14:00:00Z" });
  const req = new Request(`http://127.0.0.1/activities?leadId=${target.leadId}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await feed(req, { params: Promise.resolve({ tenantId }) }); assert.equal(res.status, 200); const payload = await res.json();
  assert.equal(payload.items.length, 3); assert.ok(payload.items.some((row: {id:string}) => row.id === `appointment:${appointment.id}`));
  assert.equal(payload.nextActivity.id, `task:${task.id}`); assert.equal(payload.nextActivity.dueAt, null);
  const updateRes = await update(request({ dueAt: "2026-10-23T12:00:00Z", expectedVersion: 0 }, "PATCH"), taskContext(target.leadId, task.id)); assert.equal(updateRes.status, 200);
  const taskList = await list(request(undefined, "GET"), target.context), row = (await taskList.json()).items.find((item: { id:string }) => item.id === task.id);
  const fresh = await (await feed(req, { params: Promise.resolve({ tenantId }) })).json();
  assert.equal(fresh.items.find((item: {id:string}) => item.id === `task:${task.id}`).dueAt, row.dueAt);
  assert.equal(fresh.nextActivity.version, 1);
  const all = await (await feed(new Request("http://127.0.0.1/activities", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) })).json();
  assert.ok(!all.items.some((item: {leadId:string}) => item.leadId === other.leadId));
});

test("different return dates are not suppressed and an original request retry preserves later edits", async () => {
  const target = await lead("retries"), body = { title: "Retornar", requestId: "retry-edit", dueAt: "2026-10-23T12:00:00Z" };
  const first = await create(request(body), target.context); assert.equal(first.status, 200); const { taskId } = await first.json();
  await update(request({ title: "Correcao humana", expectedVersion: 1 }, "PATCH"), taskContext(target.leadId, taskId));
  assert.equal((await create(request(body), target.context)).status, 200); assert.equal((await adminDb.collection("lead_tasks").doc(taskId).get()).data()?.title, "Correcao humana");
  for (const dueAt of ["2026-10-24T12:00:00Z", "2026-10-25T12:00:00Z"]) assert.equal((await create(request({ title: "Retorno legado", dueAt }), target.context)).status, 200);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", target.leadId).get()).size, 3);
});

test("canceling and reopening preserve the activity identity and record the actual state transition times", async () => {
  const target = await lead("cancel"), task = await seedTask(target.leadId);
  assert.equal((await update(request({ status: "canceled", expectedVersion: 0 }, "PATCH"), taskContext(target.leadId, task.id))).status, 200);
  assert.ok((await task.get()).data()?.canceledAt); assert.equal((await task.get()).data()?.completedAt, null);
  assert.equal((await update(request({ status: "pending", expectedVersion: 1 }, "PATCH"), taskContext(target.leadId, task.id))).status, 200);
  assert.equal((await task.get()).data()?.canceledAt, null); assert.equal((await task.get()).data()?.status, "pending");
  assert.equal((await target.ref.collection("events").where("taskId", "==", task.id).get()).size, 2);
});

test("membership and module are checked before disclosing whether an opportunity exists", async () => {
  const ctx = { params: Promise.resolve({ tenantId: `${tenantId}_foreign`, leadId: "unknown-contact" }) };
  assert.equal((await create(request({ title: "Negado" }), ctx)).status, 403);
  const target = await lead("module");
  const entitlement = adminDb.collection("tenant_entitlements").doc(tenantId);
  await entitlement.update({ "modules.crm": false });
  try { assert.equal((await create(request({ title: "Negado" }), target.context)).status, 403); }
  finally { await entitlement.update({ "modules.crm": true }); }
  const unauthenticated = new Request("http://127.0.0.1/tasks", { method: "POST", headers: { "content-type":"application/json" }, body: JSON.stringify({title:"Negado"}) });
  assert.equal((await create(unauthenticated, target.context)).status, 401);
});

test("a stale form also detects legacy writers that change the task without incrementing its version", async () => {
  const target = await lead("legacy-revision"), task = await seedTask(target.leadId), snapshot = await task.get();
  const revision = `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
  await task.update({ title: "Correcao recente por caminho legado" });
  const res = await update(request({ title: "Formulario antigo", expectedVersion: 0, expectedRevision: revision }, "PATCH"), taskContext(target.leadId,task.id));
  assert.equal(res.status,409); assert.equal((await task.get()).data()?.title,"Correcao recente por caminho legado");
});

test("routine filters search past old page limits while retaining legacy owners and current portfolio access", async () => {
  const target = await lead("search-pages"), hidden = await lead("search-hidden", peer), batch = adminDb.batch();
  for (let index = 0; index < 430; index++) batch.set(adminDb.collection("lead_tasks").doc(`${target.leadId}_${String(index).padStart(4, "0")}`), {
    tenantId, leadId: target.leadId, title: index === 429 ? "Ligação especial Ágata" : "Retorno antigo", status: "pending",
  });
  await batch.commit();
  await seedTask(hidden.leadId, { title: "Ligação especial Ágata", ownerUserId: uid });
  await seedTask(target.leadId, { title: "Ligação especial Ágata", ownerUserId: peer });
  const res = await feed(new Request("http://127.0.0.1/activities?source=task&status=pending&owner=mine&q=agata", { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) });
  assert.equal(res.status, 200); const payload = await res.json();
  assert.equal(payload.items.length, 1); assert.match(payload.items[0].recordId, /0429$/);
  assert.equal(payload.items[0].ownerUserId, uid);
  assert.ok(!payload.leads.some((row: { id: string }) => row.id === hidden.leadId));
  assert.equal(payload.coverage, "complete");
});

test("invalid routine filters return 400 without turning a narrow view into the whole portfolio", async () => {
  for (const query of ["status=unknown", "owner=another-user", "due=invalid", "timeZone=missing/zone"]) {
    const res = await feed(new Request(`http://127.0.0.1/activities?${query}`, { headers: { authorization: `Bearer ${token}` } }), { params: Promise.resolve({ tenantId }) });
    assert.equal(res.status, 400);
  }
});
