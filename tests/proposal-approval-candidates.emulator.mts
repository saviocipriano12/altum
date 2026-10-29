import assert from "node:assert/strict";
import test, { before, after, mock } from "node:test";
import { randomUUID } from "node:crypto";
import { loseStageHookAcknowledgement } from "./fixtures/stage-hook-ack-fault.mts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { commitProposalMutation, processProposalMutation } = await import("../lib/server/crm/proposal-mutation.ts");
const { assertTenantAccess } = await import("../lib/server/tenant.ts");
const tenantId = `qa_approval_candidates_${randomUUID()}`, uid = `${tenantId}_seller`, originalFetch = globalThis.fetch;
globalThis.fetch = (url, options) => {
  const host = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).hostname;
  assert.ok(["127.0.0.1", "localhost"].includes(host), "No external approval provider calls");
  return originalFetch(url, options);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaApprovalCandidates2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, status: "active", role: "client_agent" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, status: "active", role: "client_agent", capabilities: ["manage_commercial"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: ["captado", "proposta", "ganho"].map(id => ({ id, label: id })) });
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "pipeline", "leads", "orcamentos", "financeiro", "jobs", "automations", "lead_tasks", "lead_notes", "lead_conversion_trails", "tenant_usage_monthly", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) {
      assert.ok(tenantId.startsWith("qa_approval_candidates_")); await adminDb.recursiveDelete(row.ref);
    }
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function fixture(name: string, initial: "matching" | "unmatched" | "empty" | "disabled" = "matching", moveStage = false, duringStage = false) {
  const origin = `qa-candidate-${name}`, lead = adminDb.collection("leads").doc(`${tenantId}_${name}`), budget = adminDb.collection("orcamentos").doc(`${lead.id}_budget`);
  await lead.set({ tenantId, nome: "Cliente Shopify ficticio", ownerId: uid, assignedTo: uid, origem: origin, pipelineStage: "captado", stage: "captado" });
  await budget.set({ tenantId, leadId: lead.id, titulo: "Proposta Shopify ficticia", valorTotal: 100, status: "Rascunho", revision: 0, ownerId: uid });
  await adminDb.collection("automations").doc(`${lead.id}_stage`).set({ tenantId, trigger: "lead_stage_changed", enabled: true, status: "active", name: "Etapa",
    conditions: { sourceIn: [origin] }, actions: [{ type: "create_task", title: "Etapa confirmada" }, ...(moveStage ? [{ type: "move_stage", stageId: "captado" }] : [])] });
  const approval = adminDb.collection("automations").doc(`${lead.id}_approval`);
  const definition = { tenantId, trigger: "budget_approved", enabled: initial !== "disabled", status: "active", name: "Aprovacao original",
    conditions: { sourceIn: [initial === "unmatched" ? "qa-unmatched-original" : origin], ...(moveStage ? { stageIn: ["captado"] } : {}) }, actions: [{ type: "create_task", title: "Aprovacao original" }] };
  if (initial !== "empty") await approval.set(definition);
  const committed = await commitProposalMutation({ tenantId, budgetId: budget.id, body: { status: "Aprovado" }, actorId: uid, actorName: "Pessoa ficticia", membership: await assertTenantAccess(uid, tenantId) });
  const root = adminDb.collection("jobs").doc(committed.mutationId!);
  await loseStageHookAcknowledgement(adminDb, duringStage ? "jobs" : "lead_conversion_trails", () => processProposalMutation(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready");
  return { lead, budget, root, approval, definition, origin, tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get() };
}
test("approval candidates do not acquire a newly created rule after a partial stage hook", async () => {
  const input = await fixture("added");
  await adminDb.collection("automations").doc(`${input.lead.id}_late`).set({ ...input.definition, actions: [{ type: "create_task", title: "Regra posterior" }] });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done");
  assert.equal((await input.tasks()).size, 2);
  assert.ok((await input.tasks()).docs.every(doc => doc.data().title !== "Regra posterior"));
});
test("approval candidates preserve an originally empty eligible set on retry", async () => {
  const input = await fixture("empty", "empty"); await input.approval.set(input.definition);
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done"); assert.equal((await input.tasks()).size, 1);
});
test("approval candidates require review when an originally eligible action changes", async () => {
  const input = await fixture("edited"); await input.approval.update({ actions: [{ type: "create_task", title: "Acao substituida" }] });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "reconciliation_required"); assert.equal((await input.tasks()).size, 1);
});
test("approval candidates evaluate original conditions after the stage's own CRM move", async () => {
  const input = await fixture("post-stage", "matching", true);
  assert.equal((await input.lead.get()).data()?.pipelineStage, "captado");
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done"); assert.equal((await input.tasks()).size, 2);
});
test("approval candidates ignore later eligibility changes of an originally unmatched rule", async () => {
  const input = await fixture("unmatched", "unmatched"); await input.approval.update({ conditions: { sourceIn: [input.origin] } });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done"); assert.equal((await input.tasks()).size, 1);
});
test("approval candidates do not activate a rule enabled only after the original stage hook", async () => {
  const input = await fixture("disabled", "disabled"); await input.approval.update({ enabled: true });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done"); assert.equal((await input.tasks()).size, 1);
});
test("approval candidates cannot rebuild a deleted frozen approval manifest", async () => {
  const input = await fixture("deleted-manifest");
  assert.ok(Array.isArray((await input.root.get()).data()?.automationApprovalPlans));
  const { FieldValue } = await import("firebase-admin/firestore");
  await input.root.update({ automationApprovalPlans: FieldValue.delete() });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "reconciliation_required"); assert.equal((await input.tasks()).size, 1);
});
for (const initial of ["matching", "empty"] as const) test(`partial stage replay keeps original ${initial} approval candidates before the stage hook finishes`, async () => {
  const input = await fixture(`during-${initial}`, initial, false, true);
  await adminDb.collection("automations").doc(`${input.lead.id}_late`).set({ ...input.definition, actions: [{ type: "create_task", title: "Regra posterior ao primeiro efeito" }] });
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done");
  assert.equal((await input.tasks()).size, initial === "matching" ? 2 : 1);
  assert.ok((await input.tasks()).docs.every(doc => doc.data().title !== "Regra posterior ao primeiro efeito"));
});
test("partial stage replay evaluates original approval conditions after its remaining own CRM action", async () => {
  const input = await fixture("during-own-move", "matching", true, true);
  assert.equal((await input.lead.get()).data()?.pipelineStage, "ganho");
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done");
  assert.equal((await input.lead.get()).data()?.pipelineStage, "captado"); assert.equal((await input.tasks()).size, 2);
});
for (const changed of ["missing", "fingerprint", "foreign"] as const) test(`partial stage replay rejects ${changed} approval candidate proof`, async () => {
  const input = await fixture(`during-proof-${changed}`, "matching", false, true);
  const { FieldValue } = await import("firebase-admin/firestore");
  if (changed === "missing") await input.root.update({ stageApprovalCandidates: FieldValue.delete() });
  if (changed === "fingerprint") await input.root.update({ stageApprovalCandidateFingerprint: "corrupted" });
  if (changed === "foreign") {
    const candidates = (await input.root.get()).data()!.stageApprovalCandidates;
    const candidate = candidates.find((item: { id: string }) => item.id === input.approval.id);
    assert.ok(candidate); candidate.tenantId = `${tenantId}_foreign`;
    await input.root.update({ stageApprovalCandidates: candidates });
  }
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "reconciliation_required"); assert.equal((await input.tasks()).size, 1);
});
test("approval catalogue pages nonmatching definitions without truncating the current event", async () => {
  const batch = adminDb.batch();
  for (let index = 0; index < 121; index++) batch.set(adminDb.collection("automations").doc(`${tenantId}_irrelevant_${String(index).padStart(3, "0")}`), {
    tenantId, trigger: "lead_created", enabled: true, status: "active", name: "Outra regra ficticia", conditions: { sourceIn: ["qa-other-event"] }, actions: [{ type: "create_task", title: "Nunca pertence a esta proposta" }],
  });
  await batch.commit();
  const input = await fixture("catalogue-pages");
  await processProposalMutation(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, "done"); assert.equal((await input.tasks()).size, 2);
  assert.equal((await input.root.get()).data()?.stageAutomationPlans.length, 1);
  assert.equal((await input.root.get()).data()?.automationApprovalPlans.length, 1);
});

test("approval catalogue rejects more than 120 matching stage plans before any effect", async () => {
  const origin = "qa-stage-plan-cap", lead = adminDb.collection("leads").doc(`${tenantId}_stage_plan_cap`);
  const budget = adminDb.collection("orcamentos").doc(`${lead.id}_budget`);
  await lead.set({ tenantId, nome: "Cliente Shopify ficticio", ownerId: uid, assignedTo: uid, origem: origin, pipelineStage: "captado", stage: "captado" });
  await budget.set({ tenantId, leadId: lead.id, titulo: "Proposta Shopify ficticia", valorTotal: 100, status: "Rascunho", revision: 0, ownerId: uid });
  const batch = adminDb.batch();
  for (let index = 0; index < 121; index++) batch.set(adminDb.collection("automations").doc(`${lead.id}_${index}`), {
    tenantId, trigger: "lead_stage_changed", enabled: true, status: "active", name: "Regra elegivel ficticia",
    conditions: { sourceIn: [origin] }, actions: [{ type: "create_task", title: "Nao executar lote parcial" }],
  });
  await batch.commit();
  const committed = await commitProposalMutation({ tenantId, budgetId: budget.id, body: { status: "Aprovado" }, actorId: uid, actorName: "Pessoa ficticia", membership: await assertTenantAccess(uid, tenantId) });
  const root = adminDb.collection("jobs").doc(committed.mutationId!);
  await processProposalMutation(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await root.get()).data()?.stageAutomationPlans, undefined);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", lead.id).get()).size, 0);
});
