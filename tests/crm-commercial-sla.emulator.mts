import test, {after, mock} from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: ""});
const {adminDb} = await import("../app/lib/server/firebase-admin.ts");
const {applyCommercialAgentSla: apply, processCommercialAgentSla: processSla} = await import("../lib/server/commercial-agent-sla.ts");
const tenantId = `qa_crm_sla_${Date.now()}`; let sequence = 0;
const now = Date.now(), originalFetch = globalThis.fetch; let externalAttempts = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {externalAttempts++; throw new Error("External transport prohibited in SLA QA");}
  return originalFetch(input, init);
};
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["leads", "appointments", "commercial_agent_actions", "tenant_settings", "ai_internal_notifications", "orcamentos"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate(); assert.equal(externalAttempts, 0);
});
async function fixture() {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), appointment = adminDb.collection("appointments").doc(`${id}_appointment`), action = adminDb.collection("commercial_agent_actions").doc(`${id}_action`);
  await lead.set({tenantId, nome: "Cliente fictício"}); const generation = (await lead.get()).createTime!;
  await appointment.set({tenantId, leadId: lead.id, sourceLeadGeneration: generation, reviewActionId: action.id, status: "draft", version: 1});
  await action.set({tenantId, leadId: lead.id, sourceLeadGeneration: generation, type: "review_appointment", status: "pending_approval", referenceCollection: "appointments", referenceId: appointment.id,
    createdAt: new Date(now - 14 * 3600000), expiresAt: new Date(now - 1000), dueAt: new Date(now - 3600000)});
  return {lead, appointment, action, expected: await action.get()};
}
test("expiration, linked draft, reservation and history commit once under concurrent workers", async () => {
  const f = await fixture();
  const results = await Promise.all([apply(f.expected, now), apply(f.expected, now)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await f.action.get()).data()?.status, "expired");
  assert.equal((await f.appointment.get()).data()?.status, "canceled");
  assert.equal((await f.appointment.get()).data()?.version, 2);
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
test("observed revisions cannot overwrite later approval, deadline changes or deleted reviews", async () => {
  for (const scenario of ["approved", "deadline", "deleted"] as const) {
    const f = await fixture();
    if (scenario === "deleted") await f.action.delete();
    else await f.action.update(scenario === "approved" ? {status: "approved"} : {expiresAt: new Date(now + 3600000)});
    assert.equal(await apply(f.expected, now), null);
    assert.equal((await f.appointment.get()).data()?.status, "draft");
    assert.equal((await f.lead.collection("events").get()).size, 0);
    if (scenario === "deleted") assert.equal((await f.action.get()).exists, false);
  }
});
test("expiration preserves confirmed appointments and replacement review ownership", async () => {
  for (const patch of [{status: "scheduled"}, {reviewActionId: "another_review"}]) {
    const f = await fixture(); await f.appointment.update(patch); const before = await f.appointment.get();
    assert.equal((await apply(f.expected, now))?.state, "expired");
    assert.ok((await f.appointment.get()).updateTime!.isEqual(before.updateTime!));
  }
});
test("removed or recreated parents cannot receive expiration history or linked mutations", async () => {
  for (const recreate of [false, true]) {
    const f = await fixture(); await f.lead.delete(); if (recreate) await f.lead.set({tenantId});
    assert.equal(await apply(f.expected, now), null);
    assert.equal((await f.action.get()).data()?.status, "pending_approval");
    assert.equal((await f.appointment.get()).data()?.status, "draft");
    assert.equal((await f.lead.collection("events").get()).size, 0);
  }
});
test("human confirmation between candidate scan and linked read survives expiration", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  let changed = false;
  const hook = mock.method(Transaction.prototype, "get", async function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (!changed && "path" in args[0] && args[0].path === f.appointment.path) {
      changed = true; await f.appointment.update({status: "scheduled", version: 2});
    }
    return original.apply(this, args);
  });
  try {assert.equal((await apply(f.expected, now))?.state, "expired");} finally {hook.mock.restore();}
  assert.equal(changed, true);
  assert.equal((await f.appointment.get()).data()?.status, "scheduled");
  assert.equal((await f.appointment.get()).data()?.version, 2);
});
test("history failure rolls back expiration and calendar changes", async () => {
  const f = await fixture(), {Transaction} = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].id === `agent_action_expired_${f.action.id}`) throw new Error("QA_SLA_AUDIT_FAILURE");
    return original.apply(this, args);
  });
  try {await assert.rejects(apply(f.expected, now), /QA_SLA_AUDIT_FAILURE/);} finally {hook.mock.restore();}
  assert.equal((await f.action.get()).data()?.status, "pending_approval");
  assert.equal((await f.appointment.get()).data()?.status, "draft");
  assert.equal((await f.appointment.get()).data()?.version, 1);
});
test("current deadlines are backfilled atomically and escalation is applied only once", async () => {
  const f = await fixture(); await f.action.update({createdAt: new Date(now - 40 * 60000), dueAt: null, expiresAt: null});
  const result = await apply(await f.action.get(), now);
  assert.equal(result?.state, "escalate"); assert.equal(result.backfilled, true);
  assert.equal((await f.action.get()).data()?.escalationLevel, 1);
  assert.equal((await apply(await f.action.get(), now))?.state, "overdue");
  assert.equal((await f.appointment.get()).data()?.status, "draft");
});
test("proposal expiration preserves a human approval and a sent proposal", async () => {
  for (const patch of [{agentReviewStatus: "approved"}, {status: "Enviada"}]) {
    const f = await fixture(), proposal = adminDb.collection("orcamentos").doc(`${f.action.id}_proposal`);
    await proposal.set({tenantId, leadId: f.lead.id, status: "Rascunho", reviewActionId: f.action.id, ...patch});
    await f.action.update({type: "review_proposal", referenceCollection: "orcamentos", referenceId: proposal.id}); const before = await proposal.get();
    assert.equal((await apply(await f.action.get(), now))?.state, "expired");
    assert.ok((await proposal.get()).updateTime!.isEqual(before.updateTime!));
  }
});
test("real worker expires a valid candidate and reports no repeat mutation", async () => {
  const f = await fixture();
  const first = await processSla({tenantId, now, limit: 500});
  assert.ok(first.results.some(row => row.actionId === f.action.id && row.state === "expired"));
  const second = await processSla({tenantId, now, limit: 500});
  assert.ok(!second.results.some(row => row.actionId === f.action.id));
  assert.equal((await f.lead.collection("events").get()).size, 1);
});
