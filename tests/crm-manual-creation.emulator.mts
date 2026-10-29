import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST } = await import("../app/api/tenant/[tenantId]/leads/route.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenantId = `qa_manual_creation_${randomUUID()}`, uid = `${tenantId}_seller`;
let token: string;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "External transport forbidden in manual creation QA");
  return originalFetch(url, init);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaManualCreation2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "client_agent", status: "active", name: "Vendedor ficticio Shopify" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada", label: "Entrada" }, { id: "escolha", label: "Escolhendo" }, { id: "concluido", label: "Concluido", isTerminal: true }] });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, name: "Recepcao manual ficticia", enabled: true, status: "active", trigger: "lead_created", conditions: {}, actions: [{ type: "create_task", title: "Acompanhar escolha ficticia" }] });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaManualCreation2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["leads", "jobs", "lead_tasks", "lead_notes", "automations", "pipeline", "tenant_users", "users", "tenant_entitlements", "contacts", "contact_identity_aliases", "tenant_usage_monthly", "audit_logs", "ai_logs"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(email: string) { return new Request("http://127.0.0.1/qa", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ nome: "Cliente ficticio da loja", email }) }); }
async function interruptedCreation() {
  const email = `${randomUUID()}@qa.invalid`, original = adminDb.runTransaction;
  let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!interrupted && result && typeof result === "object" && "sourceType" in result && result.sourceType === "manual") { interrupted = true; throw new Error("QA_MANUAL_CREATION_ACK_LOST"); }
    return result;
  });
  try { assert.equal((await POST(request(email), { params: Promise.resolve({ tenantId }) })).status, 500); }
  finally { hook.mock.restore(); }
  assert.equal(interrupted, true);
  const leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).where("email", "==", email).get();
  assert.equal(leads.size, 1);
  return { email, lead: leads.docs[0].ref };
}
test("authenticated manual creation survives lost commit acknowledgement and duplicate request without losing its automation", async () => {
  const { email, lead } = await interruptedCreation();
  assert.equal((await POST(request(email), { params: Promise.resolve({ tenantId }) })).status, 409);
  await processPendingAutomationActions({ tenantId });
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).where("source", "==", "tenant_automation").get();
  assert.equal((await tasks()).size, 1);
  await processPendingAutomationActions({ tenantId }); assert.equal((await tasks()).size, 1);
});

async function rootFor(leadId: string) {
  const roots = await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('leadId', '==', leadId).where('type', '==', 'crm_lead_created_occurrence').get();
  assert.equal(roots.size, 1); return roots.docs[0].ref;
}

test('normal authenticated support creation preserves unassigned contact and one automation receipt', async () => {
  const response = await POST(request(`${randomUUID()}@qa.invalid`), { params: Promise.resolve({ tenantId }) });
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json(), lead = (await adminDb.collection('leads').doc(body.leadId).get()).data()!;
  assert.equal(lead.ownerId, null);
  const root = await rootFor(body.leadId), row = (await root.get()).data()!;
  assert.equal(row.status, 'done'); assert.equal(row.creationAuthority, 'tenant_actor'); assert.equal(row.actorId, uid);
  const tasks = await adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', body.leadId).get();
  assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceId, root.id);
  assert.equal((await adminDb.collection('jobs').doc(tasks.docs[0].data().automationEffectId).get()).data()?.status, 'done');
});

for (const revocation of ['capability', 'membership', 'actor', 'assignment', 'event_actor', 'authority_downgrade', 'module'] as const) {
  test(`pending manual creation revalidates ${revocation} without changing the customer`, async () => {
    const member = adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`), user = adminDb.collection('users').doc(uid);
    await member.update({ capabilities: ['edit_leads', 'manage_pipeline'], status: 'active' });
    const { lead } = await interruptedCreation(), root = await rootFor(lead.id), row = (await root.get()).data()!;
    const event = lead.collection('events').doc(row.sourceEventId);
    if (revocation === 'capability') await member.update({ capabilities: ['manage_pipeline'] });
    if (revocation === 'membership') await member.update({ status: 'blocked' });
    if (revocation === 'actor') await user.update({ status: 'blocked' });
    if (revocation === 'assignment') await lead.update({ assignedTo: `${uid}_other`, ownerId: `${uid}_other`, ownerUserId: `${uid}_other` });
    if (revocation === 'event_actor') await event.update({ actorId: `${uid}_other` });
    if (revocation === 'authority_downgrade') { await root.update({ creationAuthority: 'service' }); await event.update({ creationAuthority: 'service' }); }
    if (revocation === 'module') await adminDb.collection('tenant_entitlements').doc(tenantId).update({ 'modules.crm': false });
    const before = await lead.get();
    try {
      await processPendingAutomationActions({ tenantId });
      assert.equal((await root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', lead.id).get()).size, 0);
      assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally {
      await member.update({ capabilities: ['edit_leads'], status: 'active' }); await user.update({ status: 'active' });
      await adminDb.collection('tenant_entitlements').doc(tenantId).update({ 'modules.crm': true });
    }
  });
}

test('occurrence write failure rolls back manual customer and audit atomically', async () => {
  const email = `${randomUUID()}@qa.invalid`, { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_lead_created_occurrence') throw new Error('QA_MANUAL_CREATION_ROOT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  const before = await adminDb.collection('audit_logs').where('tenantId', '==', tenantId).get();
  try { assert.equal((await POST(request(email), { params: Promise.resolve({ tenantId }) })).status, 500); }
  finally { hook.mock.restore(); }
  assert.equal((await adminDb.collection('leads').where('tenantId', '==', tenantId).where('email', '==', email).get()).size, 0);
  assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', tenantId).get()).size, before.size);
});
