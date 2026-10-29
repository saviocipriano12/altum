import assert from "node:assert/strict";
import test, { before, after, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { loseStageHookAcknowledgement } from "./fixtures/stage-hook-ack-fault.mts";
import type { TenantAutomationAction } from "../lib/server/automations.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { commitProposalMutation, processProposalMutation } = await import("../lib/server/crm/proposal-mutation.ts");
const { assertTenantAccess } = await import("../lib/server/tenant.ts");
const tenantId = `qa_approval_recovery_${randomUUID()}`, uid = `${tenantId}_seller`, originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const host = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).hostname;
  assert.ok(["127.0.0.1", "localhost"].includes(host), "No external approval calls");
  return originalFetch(url, options);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaApprovalRecovery2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, status: "active", role: "client_agent" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, status: "active", role: "client_agent", capabilities: ["manage_commercial"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: ["captado", "proposta", "ganho"].map(id => ({ id, label: id })) });
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "pipeline", "leads", "orcamentos", "financeiro", "jobs", "automations", "lead_tasks", "lead_notes", "lead_conversion_trails", "tenant_usage_monthly", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) {
      assert.ok(tenantId.startsWith("qa_approval_recovery_")); await adminDb.recursiveDelete(row.ref);
    }
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function fixture(name: string, first: TenantAutomationAction = { type: "create_task", title: "Separar produto ficticio" }, manual = false) {
  const lead = adminDb.collection("leads").doc(`${tenantId}_${name}`), budget = adminDb.collection("orcamentos").doc(`${lead.id}_budget`);
  await lead.set({ tenantId, nome: "Cliente Shopify ficticio", ownerId: uid, assignedTo: uid, origem: name, pipelineStage: "captado", stage: "captado",
    ...(manual ? { crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: uid } } } : {}) });
  await budget.set({ tenantId, leadId: lead.id, titulo: "Proposta Shopify ficticia", valorTotal: 100, status: "Rascunho", revision: 0, ownerId: uid });
  const automation = adminDb.collection("automations").doc(`${lead.id}_approval`);
  await automation.set({ tenantId, trigger: "budget_approved", enabled: true, status: "active", name: "Aprovacao",
    conditions: { sourceIn: [name] }, actions: [{ ...first, sequenceOrder: 1 }, { type: "add_note", text: "Nota restante da aprovacao", sequenceOrder: 2 }] });
  const committed = await commitProposalMutation({ tenantId, budgetId: budget.id, body: { status: "Aprovado" }, actorId: uid, actorName: "Pessoa ficticia", membership: await assertTenantAccess(uid, tenantId) });
  const root = adminDb.collection("jobs").doc(committed.mutationId!);
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processProposalMutation(root.id, tenantId));
  return { lead, budget, root, automation, notes: () => adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get(),
    tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get() };
}
for (const [name, action] of Object.entries({ task: { type: "create_task", title: "Separar produto ficticio" },
  tag: { type: "add_tag", tag: "qa-approved" }, scheduled: { type: "create_task", title: "Depois da aprovacao", waitInHours: 1 },
} satisfies Record<string, TenantAutomationAction>)) test(`approval receipt replay completes remaining note after ${name} acknowledgement loss`, async () => {
  const input = await fixture(name, action);
  assert.equal((await input.root.get()).data()?.status, "ready");
  const tasks = (await input.tasks()).docs;
  if (tasks.length) await tasks[0].ref.update({ title: "Edicao humana preservada" });
  const before = (await input.root.get()).data()!;
  await processProposalMutation(input.root.id, tenantId);
  const final = (await input.root.get()).data()!;
  assert.equal(final.status, "done"); assert.equal((await input.notes()).size, 1);
  assert.deepEqual(final.proposalUsageReservations, before.proposalUsageReservations);
  assert.deepEqual(final.automationApprovalSchedules, before.automationApprovalSchedules);
  if (tasks.length) { assert.equal((await input.tasks()).size, 1); assert.equal((await tasks[0].ref.get()).data()?.title, "Edicao humana preservada"); }
});
test("approval-only receipt replay preserves a manually chosen stage", async () => {
  const input = await fixture("manual-stage", undefined, true);
  assert.equal((await input.root.get()).data()?.status, "ready");
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done");
  assert.equal((await input.lead.get()).data()?.pipelineStage, "captado");
  assert.equal((await input.tasks()).size, 1); assert.equal((await input.notes()).size, 1);
});
for (const changed of ["config", "budget", "receipt", "header", "expired"] as const) test(`approval receipt replay checks ${changed} before remaining effects`, async () => {
  const input = await fixture(`guard-${changed}`);
  if (changed === "config") await input.automation.update({ enabled: false });
  if (changed === "budget") await input.budget.update({ revision: 99 });
  if (changed === "receipt") {
    const receipt = (await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).get()).docs.find(doc => doc.data().type === "automation_proposal_internal_effect");
    assert.ok(receipt); await receipt.ref.delete();
  }
  if (changed === "header") { const { FieldValue } = await import("firebase-admin/firestore"); await input.root.update({ approvalReceiptRecoveryProtocol: FieldValue.delete() }); }
  if (changed === "expired") await input.root.update({ status: "processing", claimToken: "qa-old-worker", leaseUntil: new Date(0) });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, changed === "expired" ? "done" : "reconciliation_required");
  assert.equal((await input.tasks()).size, 1); assert.equal((await input.notes()).size, changed === "expired" ? 1 : 0);
});

test("approval receipt recovery stops at three attempts without repeating committed effects or quota", async () => {
  const input = await fixture("attempt-cap"), reservation = (await input.root.get()).data()!.proposalUsageReservations;
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const fault = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if (args[0].parent.id === "lead_notes") throw new Error("QA_APPROVAL_REMAINING_NOTE_UNAVAILABLE");
    return Reflect.apply(original, this, args);
  });
  try {
    await processProposalMutation(input.root.id, tenantId);
    assert.equal((await input.root.get()).data()?.status, "ready");
    await processProposalMutation(input.root.id, tenantId);
    assert.equal((await input.root.get()).data()?.status, "reconciliation_required");
    assert.equal((await input.root.get()).data()?.attempts, 3);
    assert.equal((await processProposalMutation(input.root.id, tenantId)).processed, false);
  } finally { fault.mock.restore(); }
  assert.equal((await input.tasks()).size, 1); assert.equal((await input.notes()).size, 0);
  assert.deepEqual((await input.root.get()).data()?.proposalUsageReservations, reservation);
});
