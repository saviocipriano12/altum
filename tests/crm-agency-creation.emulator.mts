import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import * as nodeModule from "node:module";
import type { ResolveFnOutput, ResolveHookContext } from "node:module";
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveHookContext, next: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput): ResolveFnOutput }): { deregister(): void };
};
const marker = registerHooks({ resolve(specifier, context, next) {
  return specifier === "server-only" ? { url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true } : next(specifier, context);
} });
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST } = await import("../app/api/leads/create/route.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenantId = `qa_agency_creation_${randomUUID()}`, uid = `${tenantId}_seller`;
let token: string;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "External transport forbidden in fictitious Shopify agency QA");
  return originalFetch(url, init);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaAgencyCreation2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "agency_agent", status: "active", name: "Vendedor ficticio" });
  await adminDb.collection("tenants").doc(tenantId).set({ tenantId, status: "active", name: "Loja Shopify ficticia" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "agency_agent", status: "active", isDefault: true, capabilities: ["edit_leads"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, enabled: true, status: "active", trigger: "lead_created", conditions: {}, actions: [{ type: "create_task", title: "Acompanhar escolha ficticia" }] });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaAgencyCreation2026!", returnSecureToken: true }) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch; marker.deregister();
  for (const collection of ["leads", "jobs", "lead_tasks", "lead_notes", "automations", "tenant_users", "users", "tenants", "tenant_entitlements", "contacts", "contact_identity_aliases", "tenant_usage_monthly", "audit_logs", "ai_logs", "lead_conversion_trails"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function request(id: string, patch: Record<string, unknown> = {}) { return new Request("http://127.0.0.1/qa", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ leadId: id, tenantId, nome: "Cliente ficticio Shopify", sourceType: "manual", ...patch }) }); }
async function interruptedCreation() {
  const id = `${tenantId}_${randomUUID()}`, originalSet = adminDb.doc("leads/x").constructor.prototype.set, originalTransaction = adminDb.runTransaction;
  let interrupted = false;
  const direct = mock.method(adminDb.doc("leads/x").constructor.prototype, "set", async function(this: FirebaseFirestore.DocumentReference, ...args: unknown[]) {
    const result = await Reflect.apply(originalSet, this, args);
    if (!interrupted && this.path === `leads/${id}`) { interrupted = true; throw new Error("QA_AGENCY_CREATION_ACK_LOST"); }
    return result;
  });
  const transaction = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof originalTransaction>) {
    const result = await Reflect.apply(originalTransaction, this, args);
    if (!interrupted && result && typeof result === "object" && "agencyCreated" in result && result.agencyCreated) { interrupted = true; throw new Error("QA_AGENCY_CREATION_ACK_LOST"); }
    return result;
  });
  try { assert.equal((await POST(request(id))).status, 500); } finally { direct.mock.restore(); transaction.mock.restore(); }
  assert.equal(interrupted, true); assert.equal((await adminDb.collection("leads").doc(id).get()).exists, true);
  return adminDb.collection("leads").doc(id);
}
test("agency creation survives lost commit acknowledgement and replay with exactly one causal automation", async () => {
  const lead = await interruptedCreation();
  assert.equal((await POST(request(lead.id))).status, 200);
  await processPendingAutomationActions({ tenantId });
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get();
  assert.equal((await tasks()).size, 1);
  await processPendingAutomationActions({ tenantId }); assert.equal((await tasks()).size, 1);
  const roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).where("type", "==", "crm_lead_created_occurrence").get();
  assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().creationAuthority, "agency_actor");
  assert.equal((await tasks()).docs[0].data().stageSourceId, roots.docs[0].id);
});

for (const revocation of ["actor", "role", "membership", "capability", "assignment", "producer", "authority", "event_actor", "source", "module"] as const) {
  test(`pending agency creation revalidates ${revocation} before effects`, async () => {
    const member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`), user = adminDb.collection("users").doc(uid), entitlement = adminDb.collection("tenant_entitlements").doc(tenantId);
    const lead = await interruptedCreation(), roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).where("type", "==", "crm_lead_created_occurrence").get();
    assert.equal(roots.size, 1); const root = roots.docs[0].ref, event = lead.collection("events").doc(roots.docs[0].data().sourceEventId);
    const originals = await Promise.all([member.get(), user.get(), entitlement.get()]);
    try {
      if (revocation === "actor") await user.update({ status: "blocked" });
      if (revocation === "role") await user.update({ role: "client_agent" });
      if (revocation === "membership") await member.update({ status: "blocked" });
      if (revocation === "capability") await member.update({ capabilities: ["manage_pipeline"] });
      if (revocation === "assignment") await lead.update({ ownerId: `${uid}_other` });
      if (revocation === "producer") await lead.update({ creationProducer: "other" });
      if (revocation === "authority") { await root.update({ creationAuthority: "service" }); await event.update({ creationAuthority: "service" }); await lead.update({ creationAuthority: "service" }); }
      if (revocation === "event_actor") await event.update({ actorId: `${uid}_other` });
      if (revocation === "source") await lead.update({ sourceType: "other" });
      if (revocation === "module") await entitlement.update({ "modules.crm": false });
      const before = await lead.get();
      await processPendingAutomationActions({ tenantId });
      assert.equal((await root.get()).data()?.status, "reconciliation_required");
      assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get()).size, 0);
      assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { for (const snapshot of originals) await snapshot.ref.set(snapshot.data()!); }
  });
}

test("agency preserves acquisition source and repeated updates keep one creation receipt", async () => {
  const id = `${tenantId}_${randomUUID()}`, payload = { sourceType: "campaign_manual", sourceId: "fictional_source", nome: "Primeiro nome" };
  assert.equal((await POST(request(id, payload))).status, 200);
  assert.equal((await POST(request(id, { ...payload, nome: "Nome corrigido" }))).status, 200);
  const lead = (await adminDb.collection("leads").doc(id).get()).data()!;
  assert.equal(lead.nome, "Nome corrigido"); assert.equal(lead.sourceType, payload.sourceType); assert.equal(lead.sourceId, payload.sourceId);
  const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", id).get();
  assert.equal(tasks.size, 1);
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", id).where("type", "==", "crm_lead_created_occurrence").get()).size, 1);
});

test("agency creation rolls back customer and event if the durable occurrence cannot be written", async () => {
  const id = `${tenantId}_${randomUUID()}`, { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === "crm_lead_created_occurrence") throw new Error("QA_AGENCY_ROOT_UNAVAILABLE");
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await POST(request(id))).status, 500); } finally { hook.mock.restore(); }
  assert.equal((await adminDb.collection("leads").doc(id).get()).exists, false);
  assert.equal((await adminDb.collection("leads").doc(id).collection("events").get()).size, 0);
});

test("concurrent agency requests for the same identity cannot create two occurrences or effects", async () => {
  const id = `${tenantId}_${randomUUID()}`;
  const responses = await Promise.all([POST(request(id)), POST(request(id))]);
  assert.ok(responses.some(response => response.status === 200));
  assert.ok(responses.every(response => [200, 409].includes(response.status)));
  await processPendingAutomationActions({ tenantId });
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", id).where("type", "==", "crm_lead_created_occurrence").get()).size, 1);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", id).get()).size, 1);
});

test("agency member cannot create automated work in an unrelated tenant", async () => {
  const id = `${tenantId}_${randomUUID()}`;
  assert.equal((await POST(request(id, { tenantId: `${tenantId}_unrelated` }))).status, 403);
  assert.equal((await adminDb.collection("leads").doc(id).get()).exists, false);
});

test("global agency administrator preserves unassigned creation without a tenant membership", async () => {
  const member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`), user = adminDb.collection("users").doc(uid);
  const originals = await Promise.all([member.get(), user.get()]);
  try {
    await member.delete(); await user.update({ role: "agency_owner" });
    const id = `${tenantId}_${randomUUID()}`, response = await POST(request(id));
    assert.equal(response.status, 200, await response.clone().text());
    const lead = (await adminDb.collection("leads").doc(id).get()).data()!;
    assert.equal(lead.ownerId, null); assert.equal(lead.creationAuthority, "agency_actor");
    assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", id).get()).size, 1);
  } finally { for (const snapshot of originals) await snapshot.ref.set(snapshot.data()!); }
});

test("agency contact without a company keeps its audit and does not invent a workflow", async () => {
  const member = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`), original = await member.get();
  const lead = adminDb.collection("leads").doc(`${tenantId}_${randomUUID()}`);
  try {
    await member.delete();
    const response = await POST(request(lead.id, { tenantId: "" }));
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal((await lead.get()).data()?.tenantId, null);
    assert.equal((await lead.collection("events").get()).size, 1);
    assert.equal((await adminDb.collection("jobs").where("leadId", "==", lead.id).get()).size, 0);
  } finally { await original.ref.set(original.data()!); await adminDb.recursiveDelete(lead); }
});

test("editing a legacy agency contact does not retrospectively approve a creation workflow", async () => {
  const id = `${tenantId}_${randomUUID()}`, lead = adminDb.collection("leads").doc(id);
  await lead.set({ tenantId, nome: "Historico ficticio", ownerId: uid, createdAt: new Date(0), sourceType: "manual" });
  assert.equal((await POST(request(id))).status, 200);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", id).get()).size, 0);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", id).get()).size, 0);
});

test("a concurrent reassignment prevents a stale agency update from reclaiming ownership", async () => {
  const id = `${tenantId}_${randomUUID()}`, lead = adminDb.collection("leads").doc(id);
  await lead.set({ tenantId, nome: "Antes", ownerId: uid, sourceType: "manual" });
  const original = adminDb.runTransaction;
  let changed = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    if (!changed) { changed = true; await lead.update({ ownerId: `${uid}_other`, nome: "Alteracao concorrente" }); }
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await POST(request(id))).status, 409); } finally { hook.mock.restore(); }
  assert.equal((await lead.get()).data()?.ownerId, `${uid}_other`);
  assert.equal((await lead.get()).data()?.nome, "Alteracao concorrente");
});
