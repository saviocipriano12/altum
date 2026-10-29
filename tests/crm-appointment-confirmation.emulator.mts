import test, {before, after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb, adminAuth} = await import("../app/lib/server/firebase-admin.ts");
const {commitAppointmentChange: change, createManualAppointment: create, AppointmentChangeError} = await import("../lib/server/crm/appointment-mutation.ts");
const {POST: createRoute} = await import("../app/api/tenant/[tenantId]/appointments/route.ts");
const {PATCH: patch} = await import("../app/api/tenant/[tenantId]/appointments/[appointmentId]/route.ts");
const {PATCH: reviewRoute} = await import("../app/api/tenant/[tenantId]/commercial-agent/actions/[actionId]/route.ts");
const tenantId = `qa_appointment_confirm_${Date.now()}`, uid = `${tenantId}_owner`; let sequence = 0, token = "";
const startAt = "2026-11-20T14:00:00.000Z", endAt = "2026-11-20T15:00:00.000Z";
const originalFetch = globalThis.fetch; let externalAttempts = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {externalAttempts++; throw new Error("External transport prohibited in appointment QA");}
  return originalFetch(input, init);
};
before(async () => {
  await adminAuth.createUser({uid, email: `${uid}@qa.invalid`, password: "AppointmentQa2026!"});
  await adminDb.collection("users").doc(uid).set({tenantId, role: "client_owner", status: "active"});
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({tenantId, userId: uid, role: "client_owner", status: "active"});
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId, mode: "custom", modules: {crm: true}, limits: {}});
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: `${uid}@qa.invalid`, password: "AppointmentQa2026!", returnSecureToken: true})});
  assert.equal(res.status, 200); token = (await res.json()).idToken;
});
after(async () => {
  mock.restoreAll();
  globalThis.fetch = originalFetch;
  for (const name of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "appointments", "commercial_agent_actions", "audit_logs", "ai_learning_outcomes", "ai_tenant_learning_daily", "ai_learning_signals", "ai_tenant_learning_signal_daily", "ai_tenant_learning_recommendations", "lead_conversion_trails"]) {
    for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
  assert.equal(externalAttempts, 0);
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), appointment = adminDb.collection("appointments").doc(`${id}_appointment`), review = adminDb.collection("commercial_agent_actions").doc(`${id}_review`);
  await lead.set({tenantId, ownerId: uid});
  await appointment.set({tenantId, leadId: lead.id, ownerUserId: uid, title: "Reunião a definir", status: "draft", startAt: null, endAt: null, version: 1});
  await review.set({tenantId, leadId: lead.id, type: "review_appointment", status: "pending_approval", referenceId: appointment.id, referenceCollection: "appointments", createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000)});
  const expected = await appointment.get();
  const input = {tenantId, appointmentId: appointment.id, userId: uid, userName: "Gestor fictício", expected, patch: {status: "scheduled", startAt, endAt}, detail: "Horário escolhido pelo vendedor"};
  return {lead, appointment, review, input};
}
function request(body: unknown) {return new Request("http://localhost/appointment", {method: "PATCH", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(body)});}
test("both real approval routes refuse an undated AI draft without approving its review", async () => {
  const f = await fixture();
  const first = await patch(request({status: "scheduled"}), {params: Promise.resolve({tenantId, appointmentId: f.appointment.id})});
  const second = await reviewRoute(request({decision: "approved"}), {params: Promise.resolve({tenantId, actionId: f.review.id})});
  assert.equal(first.status, 400); assert.equal(second.status, 400);
  assert.equal((await f.appointment.get()).data()?.status, "draft"); assert.equal((await f.review.get()).data()?.status, "pending_approval");
});
test("chosen range, review decision and appointment history commit together", async () => {
  const f = await fixture(); await change(f.input);
  assert.equal((await f.appointment.get()).data()?.version, 2); assert.equal((await f.appointment.get()).data()?.startAt, startAt);
  assert.equal((await f.review.get()).data()?.status, "approved"); assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("stale revision, deleted appointment and revoked access produce no change", async () => {
  for (const scenario of ["revision", "delete", "access"] as const) {
    const f = await fixture();
    if (scenario === "revision") await f.appointment.update({title: "Alteração humana"});
    if (scenario === "delete") await f.appointment.delete();
    if (scenario === "access") await adminDb.collection("users").doc(uid).update({status: "blocked"});
    const expectedCode = {revision: "appointment_version_conflict", delete: "appointment_not_found", access: "user_blocked"}[scenario];
    try {await assert.rejects(change(f.input), (error: unknown) => error instanceof Error && (error as {code?: string}).code === expectedCode);} finally {if (scenario === "access") await adminDb.collection("users").doc(uid).update({status: "active"});}
    assert.equal((await f.review.get()).data()?.status, "pending_approval"); assert.equal((await f.lead.collection("events").get()).size, 0);
    if (scenario === "delete") assert.equal((await f.appointment.get()).exists, false);
  }
});
test("concurrent confirmations for the same seller and range accept only one", async () => {
  const a = await fixture(), b = await fixture();
  const date = {startAt: "2026-11-21T14:00:00.000Z", endAt: "2026-11-21T15:00:00.000Z"};
  const results = await Promise.allSettled([change({...a.input, patch: {status: "scheduled", ...date}}), change({...b.input, patch: {status: "scheduled", ...date}})]);
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  const failure = results.find(item => item.status === "rejected"); assert.ok(failure?.status === "rejected" && failure.reason instanceof AppointmentChangeError && failure.reason.code === "appointment_conflict");
});
test("audit failure rolls back the appointment and its linked review", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.includes("/events/appointment_")) throw new Error("QA_APPOINTMENT_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(change({...f.input, patch: {status: "scheduled", startAt: "2026-11-22T14:00:00Z", endAt: "2026-11-22T15:00:00Z"}}), /QA_APPOINTMENT_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.appointment.get()).data()?.status, "draft"); assert.equal((await f.review.get()).data()?.status, "pending_approval");
});
test("an old pending AI review cannot reopen a completed appointment", async () => {
  const f = await fixture(); await f.appointment.update({status: "completed", startAt, endAt});
  await assert.rejects(change({...f.input, expected: await f.appointment.get(), review: {snapshot: await f.review.get(), decision: "approved"}}),
    (error: unknown) => error instanceof AppointmentChangeError && error.code === "appointment_review_state_changed");
  assert.equal((await f.appointment.get()).data()?.status, "completed"); assert.equal((await f.review.get()).data()?.status, "pending_approval");
});
test("conflicts beyond the former first 500 appointments are still checked", async () => {
  const f = await fixture(), conflict = adminDb.collection("appointments").doc(`${tenantId}_zz_conflict`);
  for (let offset = 0; offset < 501; offset += 250) {
    const batch = adminDb.batch();
    for (let index = offset; index < Math.min(offset + 250, 501); index++) batch.set(adminDb.collection("appointments").doc(`${tenantId}_bulk_${String(index).padStart(4, "0")}`), {
      tenantId, leadId: "another_lead", ownerUserId: "another_seller", status: "scheduled", startAt: "2026-11-24T14:00:00Z", endAt: "2026-11-24T15:00:00Z",
    });
    await batch.commit();
  }
  await conflict.set({tenantId, leadId: "another_lead", ownerUserId: uid, status: "scheduled", startAt: "2026-11-24T14:00:00Z", endAt: "2026-11-24T15:00:00Z"});
  const ordered = await adminDb.collection("appointments").where("tenantId", "==", tenantId).get();
  assert.ok(ordered.docs.findIndex(row => row.id === conflict.id) >= 500);
  await assert.rejects(change({...f.input, patch: {status: "scheduled", startAt: "2026-11-24T14:00:00Z", endAt: "2026-11-24T15:00:00Z"}}),
    (error: unknown) => error instanceof AppointmentChangeError && error.code === "appointment_conflict");
  assert.equal((await f.review.get()).data()?.status, "pending_approval");
});
test("invalid calendar dates and dates without timezone are rejected by the real appointment API", async () => {
  const f = await fixture();
  for (const value of ["2026-02-30T14:00:00Z", "2026-11-20T14:00", "not-a-date"]) {
    const result = await patch(request({status: "scheduled", startAt: value, endAt}), {params: Promise.resolve({tenantId, appointmentId: f.appointment.id})});
    assert.equal(result.status, 400);
  }
  assert.equal((await f.appointment.get()).data()?.status, "draft");
});
test("a manager demoted before commit cannot clear the appointment owner", async () => {
  const f = await fixture(), user = adminDb.collection("users").doc(uid), member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
  await user.update({role: "client_agent"}); await member.set({tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"]});
  try {
    await assert.rejects(change({...f.input, patch: {ownerUserId: null}}), (error: unknown) => error instanceof AppointmentChangeError && error.code === "appointment_transfer_denied");
  } finally {
    await user.update({role: "client_owner"}); await member.set({tenantId, userId: uid, role: "client_owner", status: "active"});
  }
  assert.equal((await f.appointment.get()).data()?.ownerUserId, uid);
});
function creation(f: Awaited<ReturnType<typeof fixture>>, day: string): Parameters<typeof create>[0] {
  return {tenantId, userId: uid, userName: "Gestor fictício", leadId: f.lead.id, requestId: `${f.appointment.id}_create`,
    data: {title: "Novo compromisso", type: "reuniao", status: "scheduled", startAt: `${day}T14:00:00.000Z`, endAt: `${day}T15:00:00.000Z`, location: null, meetingUrl: null, notes: null}};
}
test("concurrent creation and confirmation share the same calendar reservation", async () => {
  const a = await fixture(), b = await fixture(), input = creation(a, "2026-12-01");
  const results = await Promise.allSettled([create(input), change({...b.input, patch: {status: "scheduled", startAt: input.data.startAt, endAt: input.data.endAt}})]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  const failure = results.find(row => row.status === "rejected");
  assert.ok(failure?.status === "rejected" && failure.reason.code === "appointment_conflict");
});
test("two concurrent manual creates cannot book the same seller and range", async () => {
  const a = await fixture(), b = await fixture();
  const results = await Promise.allSettled([create(creation(a, "2026-12-02")), create(creation(b, "2026-12-02"))]);
  assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
  const failure = results.find(row => row.status === "rejected"); assert.ok(failure?.status === "rejected" && failure.reason.code === "appointment_conflict");
});
test("manual request replay preserves later edits and never restores a removed appointment", async () => {
  const f = await fixture(), input = creation(f, "2026-12-03"), first = await create(input);
  const ref = adminDb.collection("appointments").doc(first.appointmentId);
  await ref.update({title: "Edição humana", status: "canceled"}); const before = await ref.get();
  const second = await create(input); assert.equal(second.appointmentId, first.appointmentId); assert.equal(second.deduped, true);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  await assert.rejects(create({...input, data: {...input.data, title: "Pedido diferente"}}), (error: unknown) => error instanceof AppointmentChangeError && error.code === "appointment_request_conflict");
  await ref.delete(); await assert.rejects(create(input), (error: unknown) => error instanceof AppointmentChangeError && error.code === "appointment_request_removed");
  assert.equal((await ref.get()).exists, false);
});
test("creation audit failure rolls back the appointment, reservation and client history", async () => {
  const f = await fixture(), input = creation(f, "2026-12-04"), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const before = await adminDb.collection("tenant_settings").doc(tenantId).get();
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith("audit_logs/appointment_created_")) throw new Error("QA_APPOINTMENT_CREATE_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(create(input), /QA_APPOINTMENT_CREATE_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  const rows = await adminDb.collection("appointments").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get();
  assert.equal(rows.size, 1); assert.equal((await f.lead.collection("events").get()).size, 0);
  assert.ok((await adminDb.collection("tenant_settings").doc(tenantId).get()).updateTime!.isEqual(before.updateTime!));
});
test("real POST request replay returns the same appointment without repeating creation", async () => {
  const f = await fixture(), input = creation(f, "2026-12-05");
  const body = {...input.data, leadId: f.lead.id, requestId: input.requestId};
  const call = () => createRoute(new Request("http://localhost/appointments", {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(body)}), {params: Promise.resolve({tenantId})});
  const a = await call(); assert.equal(a.status, 200); const first = await a.json();
  const b = await call(); assert.equal(b.status, 200); const second = await b.json();
  assert.equal(second.id, first.id); assert.equal(second.deduped, true);
});

test("manual creation rejects a replaced parent and revoked actor without creating records", async () => {
  for (const scenario of ["parent", "actor"] as const) {
    const f = await fixture(), input = {...creation(f, "2026-12-06"), expectedLead: await f.lead.get()};
    const user = adminDb.collection("users").doc(uid);
    if (scenario === "parent") {await f.lead.delete(); await f.lead.set({tenantId, ownerId: uid});}
    else await user.update({status: "blocked"});
    try {
      await assert.rejects(create(input), (error: unknown) => error instanceof Error &&
        (error as {code?: string}).code === (scenario === "parent" ? "appointment_lead_changed" : "user_blocked"));
    } finally {if (scenario === "actor") await user.update({status: "active"});}
    assert.equal((await adminDb.collection("appointments").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 1);
    assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
