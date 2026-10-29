import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { POST: create } = await import("../app/api/tenant/[tenantId]/budgets/route.ts");
const tenantId = `qa_proposal_create_${Date.now()}`, uid = `${tenantId}_agent`;
let token = ""; const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Only local emulator transport allowed");
  return originalFetch(url, init);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaProposalCreateOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_agent", status: "active", name: "Vendedor ficticio" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["manage_commercial"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, name: "Loja Shopify ficticia" });
  const auth = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-qa", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaProposalCreateOnly2026!", returnSecureToken: true }) });
  assert.equal(auth.status, 200); token = (await auth.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["leads", "orcamentos", "jobs", "users", "tenant_users", "tenant_entitlements", "tenant_settings", "pipeline", "ai_learning_outcomes", "ai_tenant_learning_daily"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) {
      if (collection === "leads") { assert.ok(row.id.startsWith(tenantId)); await adminDb.recursiveDelete(row.ref); }
      else await row.ref.delete();
    }
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function fixture(name: string, locked = false, proposalStage = false) {
  const leadId = `${tenantId}_${name}`, ref = adminDb.collection("leads").doc(leadId);
  await ref.set({ tenantId, nome: "Cliente Shopify QA", ownerId: uid, pipelineStage: "reserva", stage: "reserva",
    ...(locked ? { crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: uid } } } : {}) });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "captado", label: "Entrada" }, { id: "reserva", label: "Separado" }, ...(proposalStage ? [{ id: "proposta", label: "Condicoes" }] : []) ] });
  return { leadId, ref };
}
function request(leadId: string, status = "Enviado", authenticated = true, requestId?: string, extra: Record<string, unknown> = {}) {
  return new Request("http://127.0.0.1/qa-proposal", { method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}),
    ...(requestId ? { "Idempotency-Key": requestId } : {}) },
    body: JSON.stringify({ leadId, titulo: "Compra ficticia", status, valorTotal: 100, ...extra }) });
}
const context = () => ({ params: Promise.resolve({ tenantId }) });
test("creating a sent proposal preserves a manually owned CRM stage", async () => {
  const input = await fixture("manual", true, true), result = await create(request(input.leadId), context());
  assert.equal(result.status, 200); assert.equal((await input.ref.get()).data()?.pipelineStage, "reserva");
});
test("a sent proposal cannot add a default stage absent from the store funnel", async () => {
  const input = await fixture("custom"); assert.equal((await create(request(input.leadId), context())).status, 200);
  assert.equal((await input.ref.get()).data()?.pipelineStage, "reserva");
});
test("a draft proposal does not rewrite the lead or its timestamp", async () => {
  const input = await fixture("draft"), before = await input.ref.get();
  assert.equal((await create(request(input.leadId, "Rascunho"), context())).status, 200);
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
});
test("a configured automatic proposal stage records its cause without claiming manual authorship", async () => {
  const input = await fixture("advance", false, true), response = await create(request(input.leadId), context()); assert.equal(response.status, 200);
  const id = (await response.json()).id, lead = (await input.ref.get()).data()!;
  assert.equal(lead.pipelineStage, "proposta"); assert.equal(lead.crmFieldOwnership?.pipelineStage?.source, "system_event");
  assert.equal(lead.crmFieldOwnership.pipelineStage.budgetId, id);
  const proposal = (await adminDb.collection("orcamentos").doc(id).get()).data()!;
  assert.equal(proposal.crmTransition.outcome, "applied"); assert.equal(proposal.crmTransition.previousStage, "reserva");
});
test("missing authentication or access cannot create a proposal or change a lead", async () => {
  const input = await fixture("denied"), before = await input.ref.get();
  assert.equal((await create(request(input.leadId, "Enviado", false), context())).status, 401);
  await input.ref.update({ ownerId: `${tenantId}_other` }); const restricted = await input.ref.get();
  assert.equal((await create(request(input.leadId), context())).status, 403);
  assert.ok((await input.ref.get()).updateTime!.isEqual(restricted.updateTime!));
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  assert.ok(!restricted.updateTime!.isEqual(before.updateTime!));
});

test("a failed audit write rolls back proposal creation and the stage change together", async () => {
  const input = await fixture("rollback", false, true), before = await input.ref.get();
  const { Transaction } = await import("firebase-admin/firestore"); const originalCreate = Transaction.prototype.create;
  const intercepted = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction,
    ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.path.startsWith(`${input.ref.path}/events/`)) throw new Error("QA_PROPOSAL_EVENT_UNAVAILABLE");
    return originalCreate.call(this, ref, data);
  });
  try {
    assert.equal((await create(request(input.leadId, "Enviado", true, "qa-atomic-failure-2026"), context())).status, 500);
    assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await input.ref.collection("events").get()).size, 0);
    assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
    assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  } finally { intercepted.mock.restore(); }
});

test("foreign, deleted or malformed targets cannot create proposals", async () => {
  for (const condition of ["foreign", "deleted", "malformed"]) {
    const input = await fixture(condition);
    if (condition === "foreign") await input.ref.update({ tenantId: `${tenantId}_foreign` });
    if (condition === "deleted") await input.ref.delete();
    const before = await input.ref.get();
    try {
      const response = await create(request(condition === "malformed" ? `${input.leadId}/nested` : input.leadId), context());
      assert.equal(response.status, condition === "foreign" ? 403 : condition === "deleted" ? 404 : 400);
      const after = await input.ref.get(); assert.equal(after.exists, before.exists);
      if (before.exists) assert.ok(after.updateTime!.isEqual(before.updateTime!));
      assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
    } finally { if (condition === "foreign") await input.ref.update({ tenantId }); }
  }
});

test("invalid funnel never falls back to standard stages and concurrent human ownership prevails", async () => {
  const input = await fixture("invalid-funnel"); await adminDb.collection("pipeline").doc(tenantId).update({ stages: [] });
  assert.equal((await create(request(input.leadId), context())).status, 200);
  assert.equal((await input.ref.get()).data()?.pipelineStage, "reserva");
  const race = await fixture("human-race", false, true);
  const [response] = await Promise.all([create(request(race.leadId), context()), race.ref.update({ pipelineStage: "reserva", stage: "reserva",
    "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: uid } })]);
  assert.equal(response.status, 200); const lead = (await race.ref.get()).data()!;
  assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.crmFieldOwnership.pipelineStage.source, "manual");
});

test("concurrent retries of a creation intent return one proposal and one event", async () => {
  const input = await fixture("same-intent", false, true), requestId = "qa-same-intent-2026";
  const responses = await Promise.all(Array.from({ length: 5 }, () => create(request(input.leadId, "Enviado", true, requestId), context())));
  assert.ok(responses.every(response => response.status === 200));
  const payloads = await Promise.all(responses.map(response => response.json())); assert.equal(new Set(payloads.map(payload => payload.id)).size, 1);
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
  assert.equal((await input.ref.collection("events").get()).size, 1);
});

test("lost acknowledgement replay preserves a later human edit and returns the original transition", async () => {
  const input = await fixture("receipt-replay", false, true), requestId = "qa-replay-2026";
  const first = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(first.status, 200); const original = await first.json();
  await input.ref.update({ pipelineStage: "reserva", stage: "reserva", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: uid } });
  const before = await input.ref.get(), replay = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(replay.status, 200);
  const result = await replay.json(); assert.equal(result.id, original.id); assert.equal(result.replayed, true); assert.deepEqual(result.crmTransition, original.crmTransition);
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("accepted intent rejects a changed payload but another deliberate intent can create an identical proposal", async () => {
  const input = await fixture("intent-conflict"), requestId = "qa-conflict-2026";
  const first = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(first.status, 200); const original = await first.json();
  const conflict = await create(request(input.leadId, "Enviado", true, requestId, { valorTotal: 200 }), context()); assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).existingProposalId, original.id);
  const second = await create(request(input.leadId, "Enviado", true, "qa-another-intent-2026"), context()); assert.equal(second.status, 200);
  assert.notEqual((await second.json()).id, original.id);
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 2);
});

test("a removed proposal is not resurrected and revoked record access cannot disclose a receipt", async () => {
  const input = await fixture("deleted-receipt"), requestId = "qa-deleted-receipt-2026";
  const first = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(first.status, 200); const original = await first.json();
  await input.ref.update({ ownerId: `${tenantId}_other` });
  const denied = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(denied.status, 403);
  assert.equal((await denied.json()).existingProposalId, undefined);
  await input.ref.update({ ownerId: uid }); await adminDb.collection("orcamentos").doc(original.id).delete();
  assert.equal((await create(request(input.leadId, "Enviado", true, requestId), context())).status, 409);
  assert.equal((await adminDb.collection("orcamentos").doc(original.id).get()).exists, false);
});

test("malformed keys cannot create records and uncertain legacy receipt protocols cannot authorize replay", async () => {
  const input = await fixture("receipt-protocol");
  assert.equal((await create(request(input.leadId, "Enviado", true, "bad/key"), context())).status, 400);
  const requestId = "qa-protocol-2026", first = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(first.status, 200);
  const receipt = (await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).docs[0];
  await receipt.ref.update({ protocolVersion: 999 });
  assert.equal((await create(request(input.leadId, "Enviado", true, requestId), context())).status, 409);
  await receipt.ref.update({ protocolVersion: 1, status: "processing" });
  assert.equal((await create(request(input.leadId, "Enviado", true, requestId), context())).status, 409);
  await receipt.ref.update({ status: "done", completionMeaning: "unknown" });
  assert.equal((await create(request(input.leadId, "Enviado", true, requestId), context())).status, 409);
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
});

test("a new process after lost acknowledgement recovers the same durable creation receipt", async () => {
  const input = await fixture("restart", false, true), requestId = "qa-process-restart-2026";
  const first = await create(request(input.leadId, "Enviado", true, requestId), context()); assert.equal(first.status, 200); const original = await first.json();
  await input.ref.update({ pipelineStage: "reserva", stage: "reserva", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: uid } });
  const before = await input.ref.get();
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/proposal-create-replay-worker.mts", import.meta.url))], {
      timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_PROPOSAL_TENANT: tenantId, QA_PROPOSAL_LEAD: input.leadId,
        QA_PROPOSAL_REQUEST: requestId, QA_PROPOSAL_TOKEN: token },
    }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  const response = JSON.parse(output); assert.equal(response.status, 200); assert.equal(response.payload.replayed, true); assert.equal(response.payload.id, original.id);
  assert.deepEqual(response.payload.crmTransition, original.crmTransition); assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("orcamentos").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
});
