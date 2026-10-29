import test, {before, after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb, adminAuth} = await import("../app/lib/server/firebase-admin.ts");
const {distributeCommercialLeads: distribute, undoCommercialLeadDistribution: undo} = await import("../lib/server/crm/assignment-mutation.ts");
const {POST: distributeRoute} = await import("../app/api/tenant/[tenantId]/leads/distribute/route.ts");
const {POST: undoRoute} = await import("../app/api/tenant/[tenantId]/leads/distribute/[auditId]/undo/route.ts");
const {prepareAppointmentOwnerTransfers} = await import("../lib/server/crm/appointment-mutation.ts");
const tenantId = `qa_assignment_${Date.now()}`, uid = `${tenantId}_manager`, sellerA = `${tenantId}_seller_a`, sellerB = `${tenantId}_seller_b`;
let sequence = 0, token = "";
const originalFetch = globalThis.fetch; let externalAttempts = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {externalAttempts++; throw new Error("External transport prohibited in assignment QA");}
  return originalFetch(input, init);
};
before(async () => {
  await adminAuth.createUser({uid, email: `${uid}@qa.invalid`, password: "AssignmentQa2026!"});
  for (const userId of [uid, sellerA, sellerB]) {
    const role = userId === uid ? "client_owner" : "client_agent";
    await adminDb.collection("users").doc(userId).set({tenantId, role, status: "active", name: userId === sellerA ? "Vendedor A" : "Vendedor B"});
    await adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`).set({tenantId, userId, role, status: "active", ...(userId === uid ? {} : {capabilities: ["edit_leads"], accessProfile: "seller"})});
  }
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId, mode: "custom", modules: {crm: true}, limits: {}});
  const result = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: `${uid}@qa.invalid`, password: "AssignmentQa2026!", returnSecureToken: true})});
  assert.equal(result.status, 200); token = (await result.json()).idToken;
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "chats", "appointments", "lead_tasks", "orcamentos", "financeiro", "audit_logs", "tenant_channels"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate(); assert.equal(externalAttempts, 0);
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`);
  await lead.set({tenantId, ownerId: sellerA, ownerName: "Vendedor A", pipelineStage: "contato"});
  const records: FirebaseFirestore.DocumentReference[] = [];
  for (const collection of ["chats", "appointments", "lead_tasks", "orcamentos", "financeiro"]) {
    const ref = adminDb.collection(collection).doc(`${id}_${collection}`);
    await ref.set({tenantId, leadId: lead.id, ownerUserId: sellerA, ownerName: "Vendedor A", status: collection === "appointments" ? "draft" : collection === "lead_tasks" ? "pending" : "open", version: 1});
    records.push(ref);
  }
  const input = {tenantId, actorId: uid, actorName: "Gestor fictício", leadIds: [lead.id], mode: "specific" as const, onlyUnassigned: false, assigneeUserId: sellerB, requestId: `${id}_request`};
  return {lead, records, input};
}
function request(body: unknown = {}) {return new Request("http://localhost/assignment", {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(body)});}
test("real distribution API and undo keep the complete occurrence atomic and replayable", async () => {
  const f = await fixture();
  const call = () => distributeRoute(request(f.input), {params: Promise.resolve({tenantId})});
  const response = await call(); assert.equal(response.status, 200); const result = await response.json();
  assert.equal(result.assigned, 1); assert.equal(result.relatedRecordsUpdated, 5);
  for (const ref of [f.lead, ...f.records]) assert.equal((await ref.get()).data()?.ownerUserId, sellerB);
  const replay = await call(); assert.equal(replay.status, 200); assert.equal((await replay.json()).auditId, result.auditId);
  const restore = () => undoRoute(request(), {params: Promise.resolve({tenantId, auditId: result.auditId})});
  const restored = await restore(); assert.equal(restored.status, 200); assert.equal((await restored.json()).restored, 1);
  assert.equal((await f.lead.get()).data()?.ownerId, sellerA); assert.equal((await f.lead.get()).data()?.ownerUserId, undefined);
  for (const ref of f.records) {const data = (await ref.get()).data()!; assert.equal(data.ownerUserId, sellerA); assert.equal(data.ownerId, undefined);}
  assert.equal((await restore()).status, 200); assert.equal((await f.lead.collection("events").get()).size, 2);
});
test("later record edits, removed/recreated parents and new linked work prevent unsafe undo", async () => {
  for (const scenario of ["edit", "deleted", "recreated", "new"] as const) {
    const f = await fixture(), assigned = await distribute(f.input);
    if (scenario === "edit") await f.records[0].update({title: "Alteração posterior"});
    if (scenario === "deleted" || scenario === "recreated") {const data = (await f.lead.get()).data()!; await f.lead.delete(); if (scenario === "recreated") await f.lead.set(data);}
    if (scenario === "new") await adminDb.collection("lead_tasks").doc(`${f.lead.id}_new`).set({tenantId, leadId: f.lead.id, status: "pending", ownerUserId: sellerB});
    await assert.rejects(undo({tenantId, actorId: uid, actorName: "Gestor", auditId: assigned.auditId}), (error: unknown) => error instanceof Error && (error as {code?: string}).code === "assignment_changed_after_distribution");
    assert.equal((await f.records[1].get()).data()?.ownerUserId, sellerB);
    if (scenario === "deleted") assert.equal((await f.lead.get()).exists, false);
  }
});
test("undo restores untouched opportunities and explicitly skips changed ones", async () => {
  const a = await fixture(), b = await fixture(), result = await distribute({...a.input, leadIds: [a.lead.id, b.lead.id]});
  await a.lead.update({notes: "Anotação humana"});
  const restored = await undo({tenantId, actorId: uid, actorName: "Gestor", auditId: result.auditId});
  assert.equal(restored.restored, 1); assert.equal(restored.skipped, 1);
  assert.equal((await a.lead.get()).data()?.ownerId, sellerB); assert.equal((await b.lead.get()).data()?.ownerId, sellerA);
});
test("audit failure rolls back distribution, linked records, receipts and history", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.includes("/events/assignment_")) throw new Error("QA_ASSIGNMENT_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(distribute(f.input), /QA_ASSIGNMENT_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.lead.get()).data()?.ownerId, sellerA); assert.equal((await f.lead.collection("events").get()).size, 0);
  for (const ref of f.records) assert.equal((await ref.get()).data()?.ownerUserId, sellerA);
});
test("current actor and destination authority are required at commit", async () => {
  for (const userId of [uid, sellerB]) {
    const f = await fixture(); await adminDb.collection("users").doc(userId).update({status: "blocked"});
    try {await assert.rejects(distribute(f.input));} finally {await adminDb.collection("users").doc(userId).update({status: "active"});}
    assert.equal((await f.lead.get()).data()?.ownerId, sellerA);
  }
});
test("distribution and undo both reject calendar collisions without partial ownership changes", async () => {
  const f = await fixture(), appointment = f.records[1], date = {startAt: "2027-02-01T14:00:00Z", endAt: "2027-02-01T15:00:00Z"};
  await appointment.update({status: "scheduled", ...date});
  const conflict = adminDb.collection("appointments").doc(`${f.lead.id}_conflict`);
  await conflict.set({tenantId, leadId: "another_lead", ownerUserId: sellerB, status: "scheduled", ...date});
  await assert.rejects(distribute(f.input), (error: unknown) => error instanceof Error && (error as {code?: string}).code === "appointment_conflict");
  assert.equal((await f.lead.get()).data()?.ownerId, sellerA);
  await conflict.update({status: "canceled"}); const assigned = await distribute(f.input);
  await conflict.update({status: "scheduled", ownerUserId: sellerA});
  await assert.rejects(undo({tenantId, actorId: uid, actorName: "Gestor", auditId: assigned.auditId}), (error: unknown) => error instanceof Error && (error as {code?: string}).code === "appointment_conflict");
  assert.equal((await f.lead.get()).data()?.ownerId, sellerB); assert.equal((await appointment.get()).data()?.ownerUserId, sellerB);
});
test("resulting batch calendar catches intra-batch conflicts and accepts a valid owner swap", async () => {
  const a = await fixture(), b = await fixture(), date = {status: "scheduled", startAt: "2027-02-02T14:00:00Z", endAt: "2027-02-02T15:00:00Z"};
  await a.records[1].update({...date, ownerUserId: sellerA}); await b.records[1].update({...date, ownerUserId: sellerB});
  await assert.rejects(distribute({...a.input, leadIds: [a.lead.id, b.lead.id]}), (error: unknown) => error instanceof Error && (error as {code?: string}).code === "appointment_conflict");
  await adminDb.runTransaction(async tx => {
    const reserve = await prepareAppointmentOwnerTransfers(tx, tenantId, new Map([[a.records[1].id, sellerB], [b.records[1].id, sellerA]]));
    tx.update(a.records[1], {ownerUserId: sellerB}); tx.update(b.records[1], {ownerUserId: sellerA}); reserve();
  });
  assert.equal((await a.records[1].get()).data()?.ownerUserId, sellerB);
});
test("concurrent request retries commit a single distribution and reject changed payload", async () => {
  const f = await fixture(), results = await Promise.all([distribute(f.input), distribute(f.input)]);
  assert.equal(results.filter(row => row.replayed).length, 1); assert.equal(results[0].auditId, results[1].auditId);
  assert.equal((await f.lead.collection("events").get()).size, 1);
  await assert.rejects(distribute({...f.input, mode: "unassign"}), (error: unknown) => error instanceof Error && (error as {code?: string}).code === "assignment_request_conflict");
});
test("explicit selection after the old first 500 leads and linked rows after 1000 are not truncated", async () => {
  for (let offset = 0; offset < 505; offset += 200) {
    const batch = adminDb.batch();
    for (let index = offset; index < Math.min(offset + 200, 505); index++) batch.set(adminDb.collection("leads").doc(`${tenantId}_bulk_${index}`), {tenantId, pipelineStage: "ganho", ownerId: sellerA});
    await batch.commit();
  }
  const f = await fixture();
  const last = adminDb.collection("leads").doc(`${tenantId}_zz_last_lead`);
  await last.set((await f.lead.get()).data()!); await f.lead.delete();
  for (const ref of f.records) await ref.update({leadId: last.id});
  assert.ok((await adminDb.collection("leads").where("tenantId", "==", tenantId).get()).docs.findIndex(doc => doc.id === last.id) >= 500);
  for (let offset = 0; offset < 1001; offset += 200) {
    const batch = adminDb.batch();
    for (let index = offset; index < Math.min(offset + 200, 1001); index++) batch.set(adminDb.collection("appointments").doc(`${last.id}_bulk_${index}`), {tenantId, leadId: last.id, status: "draft", ownerUserId: sellerA});
    await batch.commit();
  }
  const result = await distribute({...f.input, leadIds: [last.id]}); assert.equal(result.assigned, 1); assert.equal(result.relatedRecordsUpdated, 1006);
  const rows = await adminDb.collection("appointments").where("tenantId", "==", tenantId).where("leadId", "==", last.id).get();
  assert.equal(rows.size, 1002); assert.ok(rows.docs.every(row => row.data().ownerUserId === sellerB));
});
test("undo audit failure leaves the distributed occurrence intact and retryable", async () => {
  const f = await fixture(), result = await distribute(f.input), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].id === `assignment_undo_${result.auditId}`) throw new Error("QA_ASSIGNMENT_UNDO_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(undo({tenantId, actorId: uid, actorName: "Gestor", auditId: result.auditId}), /QA_ASSIGNMENT_UNDO_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.lead.get()).data()?.ownerId, sellerB); assert.equal((await adminDb.collection("audit_logs").doc(result.auditId).get()).data()?.undoneAt, undefined);
  assert.equal((await undo({tenantId, actorId: uid, actorName: "Gestor", auditId: result.auditId})).restored, 1);
});
test("personal-channel authority is checked both at transfer and before restoring ownership", async () => {
  const f = await fixture(), channel = adminDb.collection("tenant_channels").doc(`${f.lead.id}_channel`);
  await channel.set({tenantId, channelScope: "personal", ownerUserId: sellerA}); await f.records[0].update({channelId: channel.id});
  await assert.rejects(distribute(f.input)); assert.equal((await f.lead.get()).data()?.ownerId, sellerA);
  await channel.update({channelScope: "shared"}); const result = await distribute(f.input);
  await channel.update({channelScope: "personal", ownerUserId: sellerB});
  await assert.rejects(undo({tenantId, actorId: uid, actorName: "Gestor", auditId: result.auditId})); assert.equal((await f.lead.get()).data()?.ownerId, sellerB);
});
test("removing owners does not treat all unassigned appointments as the same seller", async () => {
  const a = await fixture(), b = await fixture(), date = {status: "scheduled", startAt: "2027-02-03T14:00:00Z", endAt: "2027-02-03T15:00:00Z"};
  await a.records[1].update({...date, ownerUserId: sellerA}); await b.records[1].update({...date, ownerUserId: sellerB});
  const result = await distribute({...a.input, mode: "unassign", assigneeUserId: undefined, leadIds: [a.lead.id, b.lead.id]});
  assert.equal(result.assigned, 2); assert.equal((await a.records[1].get()).data()?.ownerUserId, null); assert.equal((await b.records[1].get()).data()?.ownerUserId, null);
});
test("team visibility alone never grants authority to distribute or undo", async () => {
  const f = await fixture(), result = await distribute(f.input), user = adminDb.collection("users").doc(uid), member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
  await user.update({role: "client_viewer"}); await member.set({tenantId, userId: uid, role: "client_viewer", status: "active", capabilities: ["view_team_records"]});
  try {
    await assert.rejects(distribute({...f.input, requestId: `${f.input.requestId}_viewer`}));
    await assert.rejects(undo({tenantId, actorId: uid, actorName: "Visualizador", auditId: result.auditId}));
  } finally {await user.update({role: "client_owner"}); await member.set({tenantId, userId: uid, role: "client_owner", status: "active"});}
  assert.equal((await f.lead.get()).data()?.ownerId, sellerB);
});
