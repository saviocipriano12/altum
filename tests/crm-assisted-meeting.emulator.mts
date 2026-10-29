import test, {before, after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {OPENAI_API_KEY: "", FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb, adminAuth} = await import("../app/lib/server/firebase-admin.ts");
const {observeAssistedMeeting: observe, commitAssistedMeeting: commit} = await import("../lib/server/crm/assisted-meeting-mutation.ts");
const {POST: route, GET: list} = await import("../app/api/tenant/[tenantId]/assisted-meetings/route.ts");
const {upsertLeadCommercialDossier: dossier} = await import("../lib/server/ai/lead-dossier.ts");
const {summaryToMarkdown} = await import("../lib/server/ai/meeting-assistant.ts");
const tenantId = `qa_meeting_commit_${Date.now()}`, uid = `${tenantId}_owner`; let sequence = 0, token = "";
const originalFetch = globalThis.fetch; let externalAttempts = 0;
globalThis.fetch = (input, init) => {const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); if (!["127.0.0.1", "localhost"].includes(url.hostname)) {externalAttempts++; throw new Error("External transport prohibited in meeting QA");} return originalFetch(input, init);};
const summary = {analysisMode: "model" as const, executiveSummary: "Cliente solicitou instalação para julho.", leadNeed: "Instalação", painPoints: [], objections: [], buyingSignals: [], nextSteps: ["Confirmar disponibilidade para julho"], sellerCoaching: [], followUpMessage: "", crmUpdate: "Instalação para julho", qualification: {temperature: "morno" as const, confidence: 70, recommendedStage: ""}};
before(async () => {
  await adminAuth.createUser({uid, email: `${uid}@qa.invalid`, password: "MeetingCommit2026!"});
  await adminDb.collection("users").doc(uid).set({tenantId, role: "client_owner", status: "active"});
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({tenantId, userId: uid, role: "client_owner", status: "active"});
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({tenantId, mode: "custom", modules: {crm: true, assisted_meetings: true}, limits: {}});
  const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({email: `${uid}@qa.invalid`, password: "MeetingCommit2026!", returnSecureToken: true})});
  assert.equal(login.status, 200); token = (await login.json()).idToken;
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "appointments", "assisted_meetings", "lead_notes", "audit_logs"]) for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminAuth.deleteUser(uid); await adminDb.terminate(); assert.equal(externalAttempts, 0);
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), appointment = adminDb.collection("appointments").doc(`${id}_appointment`);
  await lead.set({tenantId, ownerId: uid, nome: "Cliente fictício", notes: "Anotação humana", aiCommercialTemperature: "quente"});
  await appointment.set({tenantId, leadId: lead.id, ownerUserId: uid, title: "Instalação", notes: "Notas humanas", status: "scheduled", startAt: "2027-04-01T14:00:00Z", endAt: "2027-04-01T15:00:00Z", version: 1});
  const input = {tenantId, actorId: uid, actorName: "Gestor fictício", leadId: lead.id, appointmentId: appointment.id, requestId: `${id}_request`,
    data: {title: "Instalação", transcript: "Cliente: quero instalar em julho.\nVendedor: vou confirmar disponibilidade.", notes: "", objective: "Revisar necessidade", language: "pt_BR", meetingUrl: null, completeAppointment: false}};
  return {lead, appointment, input};
}
async function create(f: Awaited<ReturnType<typeof fixture>>, completeAppointment = false) {
  const input = {...f.input, data: {...f.input.data, completeAppointment}}, observed = await observe(input);
  const result = await commit({...input, observed, summary, markdown: summaryToMarkdown(summary)});
  return {input, observed, result, session: adminDb.collection("assisted_meetings").doc(result.id)};
}
test("real fallback API saves evidence without inventing qualification or completing a meeting", async () => {
  const f = await fixture(), body = {...f.input.data, leadId: f.lead.id, appointmentId: f.appointment.id, requestId: f.input.requestId};
  const call = () => route(new Request("http://localhost/meeting", {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(body)}), {params: Promise.resolve({tenantId})});
  const first = await call(); assert.equal(first.status, 200); const payload = await first.json();
  assert.equal(payload.item.summary.analysisMode, "fallback"); assert.equal(payload.item.summary.qualification.confidence, 0); assert.deepEqual(payload.item.summary.painPoints, []);
  assert.equal(payload.item.summary.qualification.temperature, "nao_identificada");
  assert.equal((await f.lead.get()).data()?.aiCommercialTemperature, "quente"); assert.equal((await f.appointment.get()).data()?.status, "scheduled"); assert.equal((await f.appointment.get()).data()?.notes, "Notas humanas");
  await f.lead.update({notes: "Correção posterior"});
  const second = await call(); assert.equal(second.status, 200); assert.equal((await second.json()).id, payload.id); assert.equal((await f.lead.get()).data()?.notes, "Correção posterior");
  assert.equal((await f.lead.collection("events").get()).size, 1);
  const session = adminDb.collection("assisted_meetings").doc(payload.id); assert.equal((await session.get()).data()?.transcript, body.transcript);
  await session.delete(); assert.equal((await call()).status, 409); assert.equal((await session.get()).exists, false);
});
test("concurrent retries create one session, note, document and history event", async () => {
  const f = await fixture(), observed = await observe(f.input);
  const results = await Promise.all([commit({...f.input, observed, summary, markdown: "Resumo"}), commit({...f.input, observed, summary, markdown: "Resumo"})]);
  assert.equal(results.filter(result => result.replayed).length, 1); assert.equal((await f.lead.collection("documents").get()).size, 1); assert.equal((await f.lead.collection("events").get()).size, 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", f.lead.id).get()).size, 1);
});
test("source edits, parent recreation and revoked actor during analysis produce no partial record", async () => {
  for (const scenario of ["lead", "appointment", "recreated", "actor"] as const) {
    const f = await fixture(), observed = await observe(f.input);
    if (scenario === "lead") await f.lead.update({notes: "Correção durante análise"});
    if (scenario === "appointment") await f.appointment.update({notes: "Correção durante análise"});
    if (scenario === "recreated") {const data = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(data);}
    if (scenario === "actor") await adminDb.collection("users").doc(uid).update({status: "blocked"});
    try {await assert.rejects(commit({...f.input, observed, summary, markdown: "Resumo"}));} finally {if (scenario === "actor") await adminDb.collection("users").doc(uid).update({status: "active"});}
    assert.equal((await observed.sessionRef.get()).exists, false); assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("another lead cannot be attached to an existing appointment", async () => {
  const a = await fixture(), b = await fixture(); await assert.rejects(observe({...a.input, leadId: b.lead.id}));
  assert.equal((await a.lead.collection("events").get()).size, 0); assert.equal((await b.lead.collection("events").get()).size, 0);
});
test("explicit completion updates the appointment but refuses canceled or undated appointments", async () => {
  const f = await fixture(); await create(f, true); assert.equal((await f.appointment.get()).data()?.status, "completed"); assert.equal((await f.appointment.get()).data()?.version, 2);
  for (const patch of [{status: "canceled"}, {status: "draft", startAt: null, endAt: null}]) {
    const invalid = await fixture(); await invalid.appointment.update(patch); await assert.rejects(create(invalid, true)); assert.equal((await invalid.lead.collection("events").get()).size, 0);
  }
});
test("audit failure rolls back session, client projection, appointment and all linked records", async () => {
  const f = await fixture(), observed = await observe(f.input), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {if (args[0].path.startsWith("audit_logs/assisted_meeting_")) throw new Error("QA_MEETING_AUDIT_FAILURE"); return original.apply(this, args);});
  try {await assert.rejects(commit({...f.input, observed, summary, markdown: "Resumo"}), /QA_MEETING_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await observed.sessionRef.get()).exists, false); assert.equal((await f.lead.collection("documents").get()).size, 0); assert.equal((await f.appointment.get()).data()?.version, 1); assert.equal((await f.lead.get()).data()?.lastAssistedMeetingId, undefined);
});
test("causal dossier marks its meeting receipt done together with its projection", async () => {
  const f = await fixture(), saved = await create(f), session = await saved.session.get();
  const result = await dossier({tenantId, leadId: f.lead.id, trigger: "meeting_analyzed", sourceId: session.id, assistedMeetingFence: session, actorId: uid, actorName: "Gestor", appointmentId: f.appointment.id});
  assert.ok(result); assert.equal((await saved.session.get()).data()?.dossierStatus, "done"); assert.ok((await f.lead.get()).data()?.commercialDossier);
});
test("late dossier refuses a changed parent, appointment or current authority", async () => {
  for (const scenario of ["lead", "appointment", "actor"] as const) {
    const f = await fixture(), saved = await create(f), session = await saved.session.get();
    if (scenario === "lead") await f.lead.update({notes: "Correção depois de salvar"});
    if (scenario === "appointment") await f.appointment.update({status: "canceled"});
    if (scenario === "actor") await adminDb.collection("users").doc(uid).update({status: "blocked"});
    const call = () => dossier({tenantId, leadId: f.lead.id, trigger: "meeting_analyzed", assistedMeetingFence: session, actorId: uid, actorName: "Gestor"});
    try {if (scenario === "actor") await assert.rejects(call()); else assert.equal(await call(), null);} finally {if (scenario === "actor") await adminDb.collection("users").doc(uid).update({status: "active"});}
    assert.equal((await f.lead.get()).data()?.commercialDossier, undefined); assert.equal((await saved.session.get()).data()?.dossierStatus, "pending");
  }
});
test("meeting history never leaks an older parent generation into a recreated customer", async () => {
  const f = await fixture(), saved = await create(f);
  const call = () => list(new Request("http://localhost/meeting", {headers: {authorization: `Bearer ${token}`}}), {params: Promise.resolve({tenantId})});
  const first = await call(); assert.equal(first.status, 200); assert.ok((await first.json()).items.some((item: {id: string}) => item.id === saved.result.id));
  const data = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(data);
  const second = await call(); assert.equal(second.status, 200); assert.ok(!(await second.json()).items.some((item: {id: string}) => item.id === saved.result.id));
  await assert.rejects(observe({...f.input, requestId: `${f.input.requestId}_new`}));
});
