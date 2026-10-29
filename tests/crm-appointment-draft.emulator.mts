import test, {before, after, mock} from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type {ResolveHookContext, ResolveFnOutput} from "node:module";
const {registerHooks} = nodeModule as typeof nodeModule & {
  registerHooks(hooks: {resolve(specifier: string, context: ResolveHookContext, next: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput): ResolveFnOutput}): {deregister(): void};
};
const serverMarker = registerHooks({resolve(specifier, context, next) {
  return specifier === "server-only" ? {url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true} : next(specifier, context);
}});
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb, adminAuth} = await import("../app/lib/server/firebase-admin.ts");
const {applyApprovedAppointmentDraft: apply} = await import("../lib/server/crm/appointment-draft.ts");
const {createManualAppointment: manual} = await import("../lib/server/crm/appointment-mutation.ts");
const {crmDraftFingerprint} = await import("../lib/server/crm/draft-mutation.ts");
const {tokenHash, endpoint, MCP_REMOTE_PATH} = await import("../lib/server/mcp/oauth.ts");
const {PATCH: reviewRoute} = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/route.ts");
const {POST: applyRoute} = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts");
const tenantId = `qa_appt_draft_${Date.now()}`, uid = `${tenantId}_owner`, reviewerId = `${tenantId}_reviewer`;
let sequence = 0, token = "";
const originalFetch = globalThis.fetch; let externalAttempts = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {externalAttempts++; throw new Error("External transport prohibited in appointment draft QA");}
  return originalFetch(input, init);
};
before(async () => {
  await adminAuth.createUser({uid, email: `${uid}@qa.invalid`, password: "AppointmentDraftQa2026!"});
  for (const userId of [uid, reviewerId]) {
    await adminDb.collection("users").doc(userId).set({tenantId, role: "client_owner", status: "active", name: "Gestor fictício"});
    await adminDb.collection("tenant_users").doc(`${tenantId}_${userId}`).set({tenantId, userId, role: "client_owner", status: "active"});
  }
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId, mode: "custom", modules: {crm: true}, limits: {}});
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: `${uid}@qa.invalid`, password: "AppointmentDraftQa2026!", returnSecureToken: true})});
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch; serverMarker.deregister();
  for (const name of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "appointments", "mcp_action_drafts", "mcp_oauth_tokens", "audit_logs"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate(); assert.equal(externalAttempts, 0);
});
function request(method: string, body: unknown = {}) {return new Request("http://localhost/mcp-draft", {method, headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(body)});}
async function fixture(day = "2027-01-10", approved = true) {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), draft = adminDb.collection("mcp_action_drafts").doc(`${id}_draft`);
  await lead.set({tenantId, nome: "Cliente fictício", ownerId: uid});
  await draft.set({tenantId, userId: uid, type: "create_appointment", source: "mcp", status: "pending_review", requiredScopes: ["calendar:write", "crm:read"],
    proposedChange: {leadId: lead.id, title: "Reunião aprovada", startAt: `${day}T14:00:00.000Z`, endAt: `${day}T15:00:00.000Z`}});
  if (approved) {const response = await reviewRoute(request("PATCH", {action: "approve"}), {params: Promise.resolve({tenantId, draftId: draft.id})}); assert.equal(response.status, 200);}
  const input = {tenantId, draftId: draft.id, expectedDraft: await draft.get(), actorId: uid, actorName: "Gestor fictício", viaMcp: false, scopes: [] as string[]};
  return {lead, draft, input, rows: () => adminDb.collection("appointments").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get()};
}
test("real review and apply API commit once, replay preserves human edits and never restores deletion", async () => {
  const f = await fixture();
  const call = () => applyRoute(request("POST"), {params: Promise.resolve({tenantId, draftId: f.draft.id})});
  const first = await call(); assert.equal(first.status, 200); const result = await first.json();
  const appointment = adminDb.collection("appointments").doc(result.appointmentId);
  assert.equal((await appointment.get()).data()?.source, "mcp"); assert.equal((await appointment.get()).data()?.version, 1);
  assert.equal((await f.draft.get()).data()?.appointmentMutation.protocol, 1);
  await appointment.update({title: "Alterado pelo vendedor", status: "canceled"}); const edited = await appointment.get();
  const second = await call(); assert.equal(second.status, 200); assert.equal((await second.json()).replayed, true);
  assert.ok((await appointment.get()).updateTime!.isEqual(edited.updateTime!)); assert.equal((await f.rows()).size, 1);
  assert.equal((await f.lead.collection("events").get()).size, 1);
  await appointment.delete(); const removed = await call(); assert.equal(removed.status, 409); assert.equal((await appointment.get()).exists, false);
});
test("concurrent applications of one approval produce one appointment and application audit", async () => {
  const f = await fixture("2027-01-11"), results = await Promise.all([apply(f.input), apply(f.input)]);
  assert.equal(results.filter(row => row.replayed).length, 1); assert.equal((await f.rows()).size, 1);
  const audits = await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).where("draftId", "==", f.draft.id).get();
  assert.equal(audits.docs.filter(row => row.data().type === "mcp_supervised_action_applied").length, 1);
});
test("approved drafts and manual creation share one reservation under concurrency", async () => {
  for (const otherManual of [false, true]) {
    const day = otherManual ? "2027-01-13" : "2027-01-12", a = await fixture(day), b = await fixture(day);
    const data = b.input.expectedDraft.data()!.proposedChange;
    const other = otherManual ? manual({tenantId, userId: uid, userName: "Gestor fictício", leadId: b.lead.id, data: {title: data.title, type: "reuniao", status: "scheduled", startAt: data.startAt, endAt: data.endAt, location: null, meetingUrl: null, notes: null}}) : apply(b.input);
    const results = await Promise.allSettled([apply(a.input), other]);
    assert.equal(results.filter(row => row.status === "fulfilled").length, 1);
    const rejected = results.find(row => row.status === "rejected"); assert.ok(rejected?.status === "rejected" && rejected.reason.code === "appointment_conflict");
    assert.equal((await a.rows()).size + (await b.rows()).size, 1);
  }
});
test("changed payload, parent, approval revision or missing approval cannot create an appointment", async () => {
  for (const scenario of ["payload", "lead", "recreated", "review", "unapproved"] as const) {
    const f = await fixture("2027-01-14", scenario !== "unapproved");
    if (scenario === "payload") await f.draft.update({"proposedChange.title": "Novo conteúdo"});
    if (scenario === "lead") await f.lead.update({owner: "Responsável atualizado"});
    if (scenario === "recreated") {const data = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(data);}
    if (scenario === "review") await f.draft.update({reviewNotes: "Nova revisão"});
    await assert.rejects(apply(f.input)); assert.equal((await f.rows()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("actor and human approver must retain current authority at application", async () => {
  for (const blocked of [uid, reviewerId]) {
    const f = await fixture("2027-01-15"); await f.draft.update({reviewedBy: reviewerId});
    const input = {...f.input, expectedDraft: await f.draft.get()}; await adminDb.collection("users").doc(blocked).update({status: "blocked"});
    try {await assert.rejects(apply(input));} finally {await adminDb.collection("users").doc(blocked).update({status: "active"});}
    assert.equal((await f.rows()).size, 0); assert.equal((await f.draft.get()).data()?.status, "approved_pending_apply");
  }
});
test("audit failure rolls back appointment, reservation, history and applied receipt", async () => {
  const f = await fixture("2027-01-16"), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].path.startsWith("audit_logs/mcp_appointment_")) throw new Error("QA_MCP_APPOINTMENT_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(apply(f.input), /QA_MCP_APPOINTMENT_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.rows()).size, 0); assert.equal((await f.lead.collection("events").get()).size, 0);
  assert.equal((await f.draft.get()).data()?.status, "approved_pending_apply"); assert.equal((await f.draft.get()).data()?.appointmentMutation, undefined);
});
test("autonomous application requires current mode, eligibility, scopes and approving actor", async () => {
  for (const scenario of ["valid", "mode", "scopes", "eligibility", "actor"] as const) {
    const f = await fixture("2027-01-17");
    await adminDb.collection("tenant_settings").doc(tenantId).set({tenantId, mcp: {writeMode: scenario === "mode" ? "supervised" : "autonomous"}}, {merge: true});
    await f.draft.update({reviewDecision: "autonomous_policy", reviewedBy: scenario === "actor" ? reviewerId : uid, autonomousEligible: scenario !== "eligibility"});
    const input = {...f.input, expectedDraft: await f.draft.get(), viaMcp: true, scopes: scenario === "scopes" ? ["crm:read"] : ["calendar:write", "crm:read"]};
    if (scenario === "valid") {assert.equal((await apply(input)).replayed, false);}
    else {await assert.rejects(apply(input)); assert.equal((await f.rows()).size, 0);}
  }
});
test("malformed or changed dates require another approval and cannot invent a start", async () => {
  for (const startAt of [null, "2027-02-30T14:00:00Z", "2027-01-18T14:00"]) {
    const f = await fixture("2027-01-18", false), value = f.input.expectedDraft.data()!;
    const proposedChange = {...value.proposedChange, startAt};
    await f.draft.update({proposedChange, status: "approved_pending_apply", reviewDecision: "human_review", reviewedBy: uid, reviewedAt: new Date(),
      reviewedLeadId: f.lead.id, reviewedLeadVersion: (await f.lead.get()).updateTime!, reviewedLeadGeneration: (await f.lead.get()).createTime!,
      reviewedChangeFingerprint: crmDraftFingerprint({...value, proposedChange})});
    await assert.rejects(apply({...f.input, expectedDraft: await f.draft.get()})); assert.equal((await f.rows()).size, 0);
  }
});
test("real MCP token path stamps current approval context before committing an autonomous appointment", async () => {
  const f = await fixture("2027-01-19", false), raw = `qa_local_${f.draft.id}`;
  await adminDb.collection("tenant_settings").doc(tenantId).set({tenantId, mcp: {enabled: true, writeMode: "autonomous"}}, {merge: true});
  await f.draft.update({autonomousEligible: true});
  const req = new Request("http://localhost/appointment-draft", {method: "POST", headers: {authorization: `Bearer ${raw}`}});
  await adminDb.collection("mcp_oauth_tokens").doc(tokenHash(raw)).set({tenantId, userId: uid, scopes: ["context:read", "calendar:write", "crm:read"], clientId: "qa_local",
    audience: endpoint(req, MCP_REMOTE_PATH), expiresAt: new Date(Date.now() + 3600000)});
  const result = await applyRoute(req, {params: Promise.resolve({tenantId, draftId: f.draft.id})});
  assert.equal(result.status, 200); const saved = (await f.draft.get()).data()!;
  assert.equal(saved.reviewDecision, "autonomous_policy"); assert.equal(saved.status, "applied");
  assert.ok(saved.reviewedLeadGeneration.isEqual((await f.lead.get()).createTime)); assert.equal((await f.rows()).size, 1);
});
test("optional customer and existing one-hour duration remain supported with an explicit start", async () => {
  const f = await fixture("2027-01-20", false), proposedChange = {title: "Reunião interna", startAt: "2027-01-20T14:00:00Z"};
  await f.draft.update({proposedChange});
  const reviewed = await reviewRoute(request("PATCH", {action: "approve"}), {params: Promise.resolve({tenantId, draftId: f.draft.id})}); assert.equal(reviewed.status, 200);
  const result = await apply({...f.input, expectedDraft: await f.draft.get()});
  const saved = (await adminDb.collection("appointments").doc(String(result.application.appointmentId)).get()).data()!;
  assert.equal(saved.leadId, null); assert.equal(saved.endAt, "2027-01-20T15:00:00.000Z");
});
test("a replaced draft generation and malformed replay receipt cannot rewrite an existing appointment", async () => {
  for (const scenario of ["generation", "receipt"] as const) {
    const f = await fixture(scenario === "generation" ? "2027-01-21" : "2027-01-22"); await apply(f.input);
    const saved = (await f.rows()).docs[0];
    if (scenario === "generation") {const draft = (await f.draft.get()).data()!; await f.draft.delete(); await f.draft.set(draft);}
    else await f.draft.update({"appointmentMutation.draftGeneration": "malformed"});
    await assert.rejects(apply({...f.input, expectedDraft: await f.draft.get()}));
    assert.ok((await saved.ref.get()).updateTime!.isEqual(saved.updateTime)); assert.equal((await f.rows()).size, 1);
  }
});
