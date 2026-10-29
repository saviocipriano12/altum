import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import type { ResolveFnOutput, ResolveHookContext } from "node:module";
// Node 24 supplies this synchronous API; the shared project still has older
// Node type declarations. Describe only the runtime surface this harness uses.
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveHookContext,
    nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput): ResolveFnOutput }): { deregister(): void };
};
// This is a Node server harness. Match Next's react-server marker alias only;
// no authentication/provider implementation is replaced or mocked here.
const serverMarker = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST: apply } = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts");
const { PATCH: review } = await import("../app/api/tenant/[tenantId]/mcp/drafts/[draftId]/route.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenantId = `qa_creation_draft_${randomUUID()}`, uid = `${tenantId}_seller`, reviewer = `${tenantId}_owner`, tokens: Record<string, string> = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => { const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "External transport forbidden in creation draft QA"); return originalFetch(url, init); };
before(async () => {
  for (const id of [uid, reviewer]) {
    const role = id === uid ? "client_agent" : "client_owner";
    await adminAuth.createUser({ uid: id, email: `${id}@qa.invalid`, password: "QaCreationDraft2026!" });
    await adminDb.collection("users").doc(id).set({ tenantId, role, status: "active", name: "Pessoa ficticia Shopify" });
    await adminDb.collection("tenant_users").doc(`${tenantId}_${id}`).set({ tenantId, userId: id, role, status: "active", ...(id === uid ? { capabilities: ["edit_leads"] } : {}) });
    const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${id}@qa.invalid`, password: "QaCreationDraft2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, 200); tokens[id] = (await response.json()).idToken;
  }
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada_loja", label: "Entrada" }, { id: "escolha", label: "Escolhendo" }, { id: "concluido", label: "Concluido", isTerminal: true }] });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, name: "Recepcao ficticia", enabled: true, status: "active", trigger: "lead_created", conditions: {}, actions: [{ type: "create_task", title: "Acompanhar cliente da loja" }] });
});
after(async () => {
  serverMarker.deregister(); globalThis.fetch = originalFetch;
  for (const collection of ["mcp_action_drafts", "leads", "jobs", "lead_tasks", "lead_notes", "automations", "pipeline", "tenant_users", "users", "tenant_entitlements", "contacts", "contact_identity_aliases", "tenant_usage_monthly", "audit_logs", "ai_logs"]) for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  for (const id of [uid, reviewer]) await adminAuth.deleteUser(id);
  await adminDb.terminate();
});
function req(id = uid, method = "POST", body: unknown = {}) { return new Request("http://127.0.0.1/qa", { method, headers: { "content-type": "application/json", authorization: `Bearer ${tokens[id]}` }, body: JSON.stringify(body) }); }
async function fixture() {
  const draftId = `qa_${randomUUID()}`, ref = adminDb.collection("mcp_action_drafts").doc(draftId);
  await ref.set({ tenantId, type: "create_lead", status: "pending_review", source: "mcp", userId: uid, proposedChange: { name: "Cliente ficticio Shopify", email: `${randomUUID()}@qa.invalid`, pipelineStage: "entrada_loja" } });
  const context = { params: Promise.resolve({ tenantId, draftId }) };
  const approved = await review(req(reviewer, "PATCH", { action: "approve" }), context); assert.equal(approved.status, 200);
  return { ref, context };
}
test("replaying an approved creation returns its durable receipt without duplicate customer or automation", async () => {
  const input = await fixture(), first = await apply(req(), input.context); assert.equal(first.status, 200, await first.clone().text());
  const body = await first.json(), lead = adminDb.collection("leads").doc(body.leadId);
  await lead.update({ notes: "Correcao humana posterior" }); const before = await lead.get();
  const replay = await apply(req(), input.context); assert.equal(replay.status, 200, await replay.clone().text());
  const repeated = await replay.json(); assert.equal(repeated.leadId, body.leadId); assert.equal(repeated.replayed, true);
  await processPendingAutomationActions({ tenantId });
  assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).get()).size, 1);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", body.leadId).get()).size, 1);
});

async function committedOnly() {
  const input = await fixture(), original = adminDb.runTransaction;
  let interrupted = false;
  const hook = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!interrupted && result && typeof result === 'object' && 'creationJobId' in result && 'replayed' in result && result.replayed === false) { interrupted = true; throw new Error('QA_CREATION_DRAFT_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await apply(req(), input.context)).status, 500); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true);
  const draft = (await input.ref.get()).data()!;
  assert.equal(draft.status, 'applied');
  return { ...input, lead: adminDb.collection('leads').doc(draft.application.leadId), root: adminDb.collection('jobs').doc(draft.creationMutation.creationJobId) };
}

test('lost commit acknowledgement preserves approved draft, customer, pending automation and a safe retry', async () => {
  const input = await committedOnly();
  assert.equal((await input.root.get()).data()?.status, 'ready');
  const replay = await apply(req(), input.context); assert.equal(replay.status, 200);
  assert.equal((await replay.json()).replayed, true);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.root.get()).data()?.status, 'done');
  assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).get()).size, 1);
  const event = (await input.lead.collection('events').doc((await input.root.get()).data()!.sourceEventId).get()).data()!;
  assert.equal(event.authoredBy, 'mcp'); assert.equal(event.draftReviewedBy, reviewer); assert.equal(event.actorId, uid);
});

test('concurrent apply commits one contact, one receipt and one automation for an approved draft', async () => {
  const input = await fixture(), results = await Promise.all(Array.from({ length: 4 }, () => apply(req(), input.context)));
  assert.ok(results.every(result => result.status === 200), JSON.stringify(await Promise.all(results.map(result => result.clone().text()))));
  const bodies = await Promise.all(results.map(result => result.json()));
  assert.equal(new Set(bodies.map(body => body.leadId)).size, 1);
  assert.equal(bodies.filter(body => !body.replayed).length, 1);
  const tasks = await adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', bodies[0].leadId).get();
  assert.equal(tasks.size, 1);
});

for (const changed of ['proposal', 'reviewer', 'legacy', 'invalid_stage'] as const) {
  test(`creation rejects ${changed} before persisting customer or occurrence`, async () => {
    const input = await fixture(), before = await adminDb.collection('leads').where('tenantId', '==', tenantId).get();
    if (changed === 'proposal') await input.ref.update({ 'proposedChange.name': 'Alterado depois da aprovacao' });
    if (changed === 'reviewer') await adminDb.collection('tenant_users').doc(`${tenantId}_${reviewer}`).update({ status: 'blocked' });
    if (changed === 'legacy') await input.ref.update({ reviewedChangeFingerprint: null });
    if (changed === 'invalid_stage') {
      await input.ref.update({ status: 'pending_review', 'proposedChange.pipelineStage': 'etapa_inexistente' });
      assert.equal((await review(req(reviewer, 'PATCH', { action: 'approve' }), input.context)).status, 200);
    }
    try {
      const response = await apply(req(), input.context); assert.equal(response.status, changed === 'reviewer' ? 403 : 409, await response.clone().text());
      assert.equal((await adminDb.collection('leads').where('tenantId', '==', tenantId).get()).size, before.size);
      assert.equal((await input.ref.get()).data()?.status, 'approved_pending_apply');
    } finally { if (changed === 'reviewer') await adminDb.collection('tenant_users').doc(`${tenantId}_${reviewer}`).update({ status: 'active' }); }
  });
}

for (const revoked of ['approval', 'reviewer', 'fingerprint', 'actor', 'source_kind'] as const) {
  test(`pending creation cannot act after ${revoked} revocation`, async () => {
    const input = await committedOnly();
    if (revoked === 'approval') await input.ref.update({ status: 'rejected' });
    if (revoked === 'source_kind') { await input.ref.update({ status: 'rejected' }); await input.root.update({ sourceType: 'manual' }); await input.lead.collection('events').doc((await input.root.get()).data()!.sourceEventId).update({ sourceType: 'manual' }); }
    if (revoked === 'reviewer') await adminDb.collection('tenant_users').doc(`${tenantId}_${reviewer}`).update({ capabilities: [] });
    if (revoked === 'fingerprint') await input.ref.update({ 'proposedChange.notes': 'Instrucao alterada' });
    if (revoked === 'actor') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId });
      assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).get()).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally {
      if (revoked === 'reviewer') await adminDb.collection('tenant_users').doc(`${tenantId}_${reviewer}`).update({ capabilities: ['manage_settings', 'edit_leads'] });
      if (revoked === 'actor') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: ['edit_leads'] });
    }
  });
}

test('occurrence persistence failure rolls back draft, customer and audit together', async () => {
  const input = await fixture(), before = await adminDb.collection('audit_logs').where('tenantId', '==', tenantId).get();
  const { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_lead_created_occurrence') throw new Error('QA_CREATION_DRAFT_ROOT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await apply(req(), input.context)).status, 500); } finally { hook.mock.restore(); }
  assert.equal((await input.ref.get()).data()?.status, 'approved_pending_apply');
  assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', tenantId).get()).size, before.size);
  const proposed = (await input.ref.get()).data()!.proposedChange;
  assert.equal((await adminDb.collection('leads').where('tenantId', '==', tenantId).where('email', '==', proposed.email).get()).size, 0);
});
