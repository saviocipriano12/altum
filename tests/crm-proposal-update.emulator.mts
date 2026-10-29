import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loseStageHookAcknowledgement, freezeLegacyApprovalRecipe } from "./fixtures/stage-hook-ack-fault.mts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { PATCH: update } = await import("../app/api/tenant/[tenantId]/budgets/[budgetId]/route.ts");
const { commitProposalMutation, processProposalMutation, processPendingProposalMutations, assertProposalAutomationSource } = await import("../lib/server/crm/proposal-mutation.ts");
const { assertTenantAccess } = await import("../lib/server/tenant.ts");
const { processPendingAutomationActions, claimScheduledAutomationJob } = await import("../lib/server/automations.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const { reserveTenantAutomationExecution } = await import("../lib/server/tenant-usage.ts");
const { freezeProposalAutomationPlans, scheduleProposalAutomationMessage, commitProposalAutomationInternalRecords,
  commitScheduledProposalAutomationInternalRecords } = await import("../lib/server/automation-proposal-delivery.ts");
const { normalizeAutomationDoc } = await import("../lib/server/automations.ts");
const { runLeadAutomations } = await import("../lib/server/automations.ts");
const tenantId = `qa_proposal_update_${Date.now()}`, uid = `${tenantId}_agent`;
let token = ""; const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "No external proposal effects allowed in QA");
  return originalFetch(url, init);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaProposalUpdateOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, uid, role: "client_agent", status: "active", name: "Vendedor ficticio" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["manage_commercial"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: ["captado", "reserva", "proposta", "ganho", "perdido"].map(id => ({ id, label: id })) });
  const auth = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-qa", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaProposalUpdateOnly2026!", returnSecureToken: true }) });
  assert.equal(auth.status, 200); token = (await auth.json()).idToken;
});
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["leads", "orcamentos", "financeiro", "jobs", "users", "tenant_users", "tenant_entitlements", "pipeline", "lead_tasks", "lead_notes", "tenant_automations",
    "ai_learning_outcomes", "ai_tenant_learning_daily", "ai_logs", "conversion_events", "lead_conversion_events", "lead_conversion_trails", "automations", "tenant_usage_monthly", "chats", "tenant_channels", "chat_state", "chat_outbound_jobs", "messages", "chat_outbound_locks"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) { if (collection === "leads") { assert.ok(row.id.startsWith(tenantId)); await adminDb.recursiveDelete(row.ref); } else await row.ref.delete(); }
  }
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
async function fixture(name: string, manual = true) {
  const leadId = `${tenantId}_${name}_lead`, budgetId = `${tenantId}_${name}_budget`;
  const lead = adminDb.collection("leads").doc(leadId), budget = adminDb.collection("orcamentos").doc(budgetId);
  await lead.set({ tenantId, nome: "Cliente Shopify QA", ownerId: uid, pipelineStage: "reserva", stage: "reserva",
    ...(manual ? { crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: uid } } } : {}) });
  await budget.set({ tenantId, leadId, titulo: "Proposta Shopify QA", status: "Rascunho", valorTotal: 100, ownerId: uid, revision: 0 });
  return { leadId, budgetId, lead, budget, context: { params: Promise.resolve({ tenantId, budgetId }) } };
}
function request(body: unknown, authenticated = true) {
  return new Request("http://127.0.0.1/qa-proposal-update", { method: "PATCH", headers: { "content-type": "application/json", ...(authenticated ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
}

test("approved proposal quota is bound to its frozen automation and reserved once under concurrent replay", async () => {
  const input = await fixture("quota");
  await input.lead.update({ origem: "qa-proposal-quota-only" });
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
  const autoId = `${input.leadId}_auto`, claim = { id: source.id, token: "qa-quota-claim" };
  const definition = { tenantId, enabled: true, status: "active", trigger: "budget_approved", name: "QA quota",
    conditions: { sourceIn: ["qa-proposal-quota-only"] }, actions: [{ type: "send_message", text: "Proposta QA" }] };
  const auto = adminDb.collection("automations").doc(autoId);
  await auto.set(definition);
  const secondId = `${autoId}_second`;
  await adminDb.collection("automations").doc(secondId).set(definition);
  await source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  await freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim,
    automations: [normalizeAutomationDoc(autoId, definition, tenantId), normalizeAutomationDoc(secondId, definition, tenantId)] });
  const month = new Date().toISOString().slice(0, 7), usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${month}`);
  const entitlements = adminDb.collection("tenant_entitlements").doc(tenantId), prior = (await entitlements.get()).data()!;
  await entitlements.update({ limits: { automationsPerMonth: 1 } });
  await usage.set({ tenantId, monthRef: month, automationExecutions: 0 });
  const execution = { jobId: source.id, claimToken: claim.token, kind: "proposal" as const, automationId: autoId };
  try {
    const reservations = await Promise.all(Array.from({ length: 5 }, () => reserveTenantAutomationExecution(tenantId, execution)));
    assert.ok(reservations.every(row => row.allowed && row.currentUsage === 1));
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    const saved = (await source.get()).data()?.proposalUsageReservations;
    assert.equal(Object.keys(saved).length, 1);
    const refused = await reserveTenantAutomationExecution(tenantId, { ...execution, automationId: secondId });
    assert.equal(refused.allowed, false, "A different frozen automation needs its own available quota");
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    assert.deepEqual((await source.get()).data()?.proposalUsageReservations, saved);
    await assert.rejects(reserveTenantAutomationExecution(tenantId, { ...execution, automationId: `${autoId}_other` }));
    await assert.rejects(reserveTenantAutomationExecution(tenantId, { ...execution, claimToken: "qa-stale" }));
    await auto.update({ enabled: false });
    await assert.rejects(reserveTenantAutomationExecution(tenantId, execution), /CONFIGURATION_REVOKED/);
    await auto.update({ enabled: true });
    const membership = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
    await membership.update({ capabilities: [] });
    try { await assert.rejects(reserveTenantAutomationExecution(tenantId, execution)); }
    finally { await membership.update({ capabilities: ["manage_commercial"] }); }
    await input.budget.update({ revision: 99 });
    await assert.rejects(reserveTenantAutomationExecution(tenantId, execution), /AUTHORITY_CHANGED/);
    await input.budget.update({ revision: 1 });
    const receiptKey = Object.keys(saved)[0];
    await source.update({ [`proposalUsageReservations.${receiptKey}.planDigest`]: "qa-altered" });
    await assert.rejects(reserveTenantAutomationExecution(tenantId, execution), /RESERVATION_CHANGED/);
    await source.update({ [`proposalUsageReservations.${receiptKey}`]: saved[receiptKey] });
    await source.update({ leaseUntil: new Date(0) });
    await assert.rejects(reserveTenantAutomationExecution(tenantId, execution));
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    assert.deepEqual((await source.get()).data()?.proposalUsageReservations, saved);
  } finally { await entitlements.update({ limits: prior.limits || {} }); await usage.delete(); }
});
test("concurrent approvals commit one pending revenue, one history event and one revision", async () => {
  const input = await fixture("concurrent"), before = await input.lead.get();
  const responses = await Promise.all(Array.from({ length: 5 }, () => update(request({ status: "Aprovado", expectedRevision: 0 }), input.context)));
  assert.ok(responses.every(response => response.status === 200));
  const finance = await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get();
  assert.equal(finance.size, 1); assert.equal(finance.docs[0].data().status, "pendente"); assert.equal(finance.docs[0].data().valor, 100);
  assert.equal((await input.lead.collection("events").get()).size, 1); assert.equal((await input.budget.get()).data()?.revision, 1);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
});
test("a stale revision cannot reverse a newer proposal decision", async () => {
  const input = await fixture("stale"); await input.budget.update({ status: "Aprovado", revision: 3 }); const before = await input.budget.get();
  assert.equal((await update(request({ status: "Perdido", expectedRevision: 0 }), input.context)).status, 409);
  assert.ok((await input.budget.get()).updateTime!.isEqual(before.updateTime!));
});
test("historical duplicate revenue blocks approval rather than choosing an arbitrary record", async () => {
  const input = await fixture("duplicate");
  for (let index = 0; index < 2; index++) await adminDb.collection("financeiro").doc(`${input.budgetId}_${index}`).set({ tenantId, orcamentoId: input.budgetId, leadId: input.leadId, valor: 100, status: "pendente" });
  assert.equal((await update(request({ status: "Aprovado" }), input.context)).status, 409);
  assert.equal((await input.budget.get()).data()?.status, "Rascunho");
});
test("event storage failure cannot partially approve the proposal or create a revenue", async () => {
  const input = await fixture("rollback"), before = await input.budget.get();
  const { Transaction } = await import("firebase-admin/firestore"), originalCreate = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.path.startsWith(`${input.lead.path}/events/`)) throw new Error("QA_PROPOSAL_UPDATE_AUDIT_UNAVAILABLE");
    return originalCreate.call(this, ref, data);
  });
  try {
    assert.equal((await update(request({ status: "Aprovado" }), input.context)).status, 500);
    assert.ok((await input.budget.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

async function commit(input: Awaited<ReturnType<typeof fixture>>, body: Record<string, unknown> = { status: "Aprovado" }) {
  return commitProposalMutation({ tenantId, budgetId: input.budgetId, body, membership: await assertTenantAccess(uid, tenantId), actorId: uid, actorName: "QA" });
}

async function interruptedProposalHook(name: string, hook: "learning" | "trail" = "trail") {
  const input = await fixture(`recover-${name}`, false), origin = `qa-recover-${name}`;
  await input.lead.update({ origem: origin });
  for (const trigger of ["lead_stage_changed", "budget_approved"]) await adminDb.collection("automations").doc(`${input.leadId}_${trigger}`).set({ tenantId,
    name: "Recuperacao Shopify ficticia", enabled: true, status: "active", trigger, conditions: { sourceIn: [origin] }, actions: [{ type: "create_task", title: trigger }] });
  const result = await commit(input), root = adminDb.collection("jobs").doc(result.mutationId!);
  await loseStageHookAcknowledgement(adminDb, hook === "learning" ? "ai_learning_outcomes" : "lead_conversion_trails", () => processProposalMutation(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready");
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal((await tasks()).size, 1);
  return { input, root, tasks };
}
for (const hook of ["learning", "trail"] as const) test(`proposal ${hook} hook resumes before approval without repeating confirmed actions`, async () => {
  const { input, root, tasks } = await interruptedProposalHook(hook, hook);
  await processProposalMutation(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "done"); assert.equal((await tasks()).size, 2);
  await processProposalMutation(root.id, tenantId); assert.equal((await tasks()).size, 2);
  const trails = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(trails.size, 1); assert.equal(trails.docs[0].data().occurrences, 1);
  assert.equal((await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get()).size, 1);
});
for (const changed of ["budget", "actor", "finance", "receipt", "progress", "expired"] as const) test(`proposal partial hook handles ${changed} without bypassing approval authority`, async () => {
  const { input, root, tasks } = await interruptedProposalHook(`revoke-${changed}`);
  const { FieldValue } = await import("firebase-admin/firestore");
  if (changed === "budget") await input.budget.update({ revision: 99 });
  if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
  if (changed === "finance") await adminDb.collection("financeiro").doc((await root.get()).data()!.financeId).update({ valor: 101 });
  if (changed === "receipt") await root.update({ stageConversionTrailReceipt: FieldValue.delete() });
  if (changed === "progress") await root.update({ stageHookProgress: FieldValue.delete() });
  if (changed === "expired") await root.update({ status: "processing", leaseUntil: new Date(0), claimToken: "lost-proposal-owner" });
  try {
    await Promise.all([processProposalMutation(root.id, tenantId), processProposalMutation(root.id, tenantId)]);
    assert.equal((await root.get()).data()?.status, changed === "expired" ? "done" : "reconciliation_required");
    assert.equal((await tasks()).size, changed === "expired" ? 2 : 1);
    const trails = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    assert.equal(trails.docs[0].data().occurrences, 1);
  } finally { if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
});
for (const interrupted of [false, true]) test(`approval-only checkpoint preserves the human stage and ${interrupted ? "holds an uncertain approval" : "recovers confirmed finalization"}`, async () => {
  const input = await fixture(`approval-checkpoint-${interrupted}`), origin = `qa-approval-checkpoint-${interrupted}`;
  await input.lead.update({ origem: origin });
  await adminDb.collection("automations").doc(`${input.leadId}_approval`).set({ tenantId, trigger: "budget_approved", enabled: true, status: "active", name: "Aprovacao ficticia", conditions: { sourceIn: [origin] }, actions: [{ type: "create_task", title: "Conferir aprovacao" }] });
  const result = await commit(input), root = adminDb.collection("jobs").doc(result.mutationId!);
  if (interrupted) {
    await freezeLegacyApprovalRecipe(adminDb, root, `${input.leadId}_approval`);
    await loseStageHookAcknowledgement(adminDb, "lead_tasks", () => processProposalMutation(root.id, tenantId));
  }
  else {
    await processProposalMutation(root.id, tenantId);
    const progress = (await root.get()).data()!.stageHookProgress;
    assert.deepEqual(progress.steps.map((step: { name: string }) => step.name), ["approval"]);
    await root.update({ status: "processing", leaseUntil: new Date(0), claimToken: "lost-approval-finalization" });
  }
  await processProposalMutation(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, interrupted ? "reconciliation_required" : "done");
  assert.equal((await input.lead.get()).data()?.pipelineStage, "reserva");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
});

test("proposal stage-change automation must enqueue before any provider attempt", async () => {
  const input = await fixture("stage-source-message", false), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await input.lead.update({ origem: "qa-stage-source-message" });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).set({ tenantId, name: "QA hook de etapa", enabled: true, status: "active",
    trigger: "lead_stage_changed", conditions: { sourceIn: ["qa-stage-source-message"] }, actions: [{ type: "send_message", text: "Atualizacao ficticia de etapa" }] });
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
  const previousFetch = globalThis.fetch; let attempts = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return previousFetch(url, init);
    attempts++; throw new Error("QA_STAGE_PROVIDER_BEFORE_QUEUE");
  };
  try {
    const processed = await processProposalMutation(source.id, tenantId);
    assert.equal(attempts, 0); assert.equal(processed.completed, true);
    const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
    assert.equal(queued.size, 1);
  } finally { globalThis.fetch = previousFetch; }
});

async function stageMessageProposal(name: string, consume = true, status = "Aprovado") {
  const input = await fixture(`stage-${name}`, false), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`, autoId = `${input.leadId}_auto`;
  await input.lead.update({ origem: `qa-stage-${name}` });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const auto = adminDb.collection("automations").doc(autoId);
  await auto.set({ tenantId, name: "QA origem de etapa", enabled: true, status: "active", trigger: "lead_stage_changed", conditions: { sourceIn: [`qa-stage-${name}`] },
    actions: [{ type: "send_message", text: "Atualizacao ficticia de etapa" }] });
  const result = await commit(input, { status }), source = adminDb.collection("jobs").doc(result.mutationId!);
  let job: FirebaseFirestore.DocumentReference | null = null;
  if (consume) {
    assert.equal((await processProposalMutation(source.id, tenantId)).completed, true);
    const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
    assert.equal(queued.size, 1); job = queued.docs[0].ref;
  }
  return { ...input, source, chatId, channelId, auto, job };
}

async function simulatedStageDelivery(job: FirebaseFirestore.DocumentReference, loseAck = false) {
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return previous(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/); calls++;
    if (loseAck) return Promise.reject(new Error("QA_STAGE_ACK_LOST"));
    return Promise.resolve(Response.json({ messages: [{ id: `wamid.qa-stage-${job.id}` }] }));
  };
  try { await processChatOutboundJobs({ jobId: job.id }); } finally { globalThis.fetch = previous; }
  return calls;
}

for (const status of ["Aprovado", "Enviado"]) {
  test(`stage CRM source of ${status} proposal stays authorized with exact receipts and subsequent approval actions`, async () => {
    const input = await stageMessageProposal(`crm-${status}`, false, status);
    await input.auto.update({ actions: [
      { type: "create_task", title: "Separar produto", sequenceOrder: 0 },
      { type: "move_stage", stageId: "reserva", sequenceOrder: 1 },
      { type: "send_message", text: "Pedido ficticio revisado", sequenceOrder: 2 },
    ] });
    if (status === "Aprovado") await adminDb.collection("automations").doc(`${input.auto.id}_approval`).set({
      tenantId, name: "QA atualizacao apos etapa", enabled: true, status: "active", trigger: "budget_approved",
      conditions: { sourceIn: [`qa-stage-crm-${status}`] }, actions: [{ type: "move_stage", stageId: "captado" }],
    });
    assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true);
    assert.equal((await input.source.get()).data()?.status, "done");
    assert.equal((await input.lead.get()).data()?.pipelineStage, status === "Aprovado" ? "captado" : "reserva");
    const receipts = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.source.id).get();
    assert.equal(receipts.size, 2); assert.ok(receipts.docs.every(doc => doc.data().stageSourceKind === "proposal"));
    assert.equal(receipts.docs.find(doc => doc.data().field === "pipelineStage")?.data().outcome, "applied");
    const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(queued.size, 1); assert.equal(await simulatedStageDelivery(queued.docs[0].ref), 1);
    assert.equal(await simulatedStageDelivery(queued.docs[0].ref), 0);
    await input.lead.update({ pipelineStage: "contato", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: "qa-human" } });
    await processProposalMutation(input.source.id, tenantId);
    assert.equal((await input.lead.get()).data()?.pipelineStage, "contato");
  });
}

for (const status of ["Aprovado", "Enviado"]) {
  test(`stage scheduled actions of ${status} proposal keep their original authority and quota`, async () => {
    const input = await stageMessageProposal(`scheduled-${status}`, false, status);
    await input.auto.update({ actions: [
      { type: "create_task", title: "Revisar produto", waitInHours: 0.000001, sequenceOrder: 0 },
      { type: "send_message", text: "Mensagem ficticia de proposta", waitInHours: 0.000001, sequenceOrder: 1 },
    ] });
    assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true);
    const quota = (await input.source.get()).data()?.stageUsageReservations;
    await processPendingAutomationActions({ tenantId, limit: 100 });
    const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.source.id).get();
    const scheduled = jobs.docs.filter(doc => doc.data().type === "automation_scheduled_action"); assert.equal(scheduled.length, 2);
    assert.ok(scheduled.every(doc => doc.data().stageSourceKind === "proposal" && doc.data().status === "done"));
    const beforeDelivery = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    assert.equal(beforeDelivery.size, 1); assert.equal(beforeDelivery.docs[0].data().stageSourceId, input.source.id);
    const message = scheduled.find(doc => doc.data().action.type === "send_message")!;
    const outbox = adminDb.collection("chat_outbound_jobs").doc(message.data().outboundJobId);
    assert.equal(await simulatedStageDelivery(outbox), 1); assert.equal(await simulatedStageDelivery(outbox), 0);
    assert.deepEqual((await input.source.get()).data()?.stageUsageReservations, quota);
    const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    assert.equal(tasks.docs.filter(doc => doc.data().stageSourceId === input.source.id).length, 1);
    const followups = tasks.docs.filter(doc => doc.data().source === "crm_automation" && doc.data().reasonCode === "sales_journey_wait_for_reply");
    assert.equal(followups.length, status === "Enviado" ? 1 : 0);
    assert.equal(tasks.size, status === "Enviado" ? 2 : 1);
  });
}
test("stage scheduled proposal work refuses a later budget revision instead of executing stale actions", async () => {
  const input = await stageMessageProposal("scheduled-revision", false, "Enviado");
  await input.auto.update({ actions: [{ type: "create_task", title: "Nao criar", waitInHours: 0.000001 }] });
  assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true); await input.budget.update({ revision: 99 });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.source.id).get();
  assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "reconciliation_required"); assert.equal(jobs.docs[0].data().attempts, 0);
});

test("stage source delivery covers approved and sent proposals, charges once, and never repeats an uncertain provider result", async () => {
  for (const scenario of ["approved", "sent", "unknown"] as const) {
    const input = await stageMessageProposal(scenario, true, scenario === "sent" ? "Enviado" : "Aprovado");
    const source = (await input.source.get()).data()!;
    assert.equal(Object.keys(source.stageUsageReservations).length, 1); assert.equal(Object.values(source.stageAutomationRuns)[0] && (Object.values(source.stageAutomationRuns)[0] as { status: string }).status, "done");
    assert.equal(await simulatedStageDelivery(input.job!, scenario === "unknown"), 1);
    const delivered = (await input.job!.get()).data()!;
    assert.equal(delivered.status, scenario === "unknown" ? "reconciliation_required" : "completed",
      JSON.stringify({ scenario, error: delivered.error, errorCode: delivered.errorCode, reason: delivered.reconciliationReason }));
    assert.equal(await simulatedStageDelivery(input.job!), 0);
    assert.deepEqual((await input.source.get()).data()?.stageUsageReservations, source.stageUsageReservations);
    await processProposalMutation(input.source.id, tenantId);
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  }
});

for (const revoked of ["source", "budget", "funnel", "config", "capability", "recipient", "channel", "human", "payload", "guard", "run", "quota"] as const) {
  test(`stage source delivery revalidates ${revoked} immediately before the provider`, async () => {
    const input = await stageMessageProposal(`revoke-${revoked}`);
    if (revoked === "source") await input.source.delete();
    if (revoked === "budget") await input.budget.update({ revision: 99 });
    if (revoked === "funnel") await adminDb.collection("pipeline").doc(tenantId).update({ updatedBy: "qa-stage-edit" });
    if (revoked === "config") await input.auto.update({ enabled: false });
    if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    if (revoked === "recipient") await adminDb.collection("chats").doc(input.chatId).update({ contactPhone: "5511000000099" });
    if (revoked === "channel") await adminDb.collection("tenant_channels").doc(input.channelId).update({ status: "paused" });
    if (revoked === "human") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).set({ tenantId, chatId: input.chatId, aiEnabled: false, humanOwnerUserId: uid });
    if (revoked === "payload") await input.job!.update({ text: "Outra intencao" });
    if (revoked === "guard") { const { FieldValue } = await import("firebase-admin/firestore"); await input.job!.update({ stageAutomationProtocol: FieldValue.delete(), stageAutomationSourceId: FieldValue.delete(), stageAutomationSourceKind: FieldValue.delete() }); }
    if (revoked === "run") await input.source.update({ stageAutomationRuns: {} });
    if (revoked === "quota") await input.source.update({ stageUsageReservations: {} });
    try {
      assert.equal(await simulatedStageDelivery(input.job!), 0);
      assert.equal((await input.job!.get()).data()?.status, "dead_letter");
      assert.equal((await input.job!.get()).data()?.providerAttemptStartedAt, undefined);
    } finally { if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
  });
}

test("stage source freezes empty eligibility and whole-run replay cannot add new automations or repeat actions", async () => {
  const input = await stageMessageProposal("replay", false), claim = { kind: "proposal" as const, id: input.source.id, token: "qa-stage-claim" };
  await input.source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  const context = { tenantId, leadId: input.leadId, trigger: "lead_stage_changed" as const, previousStage: "reserva", nextStage: "ganho", stageSource: claim, strictErrors: true };
  await runLeadAutomations(context);
  const before = (await input.source.get()).data()!.stageUsageReservations;
  await adminDb.collection("automations").doc(`${input.auto.id}_new`).set((await input.auto.get()).data()!);
  await runLeadAutomations(context);
  assert.deepEqual((await input.source.get()).data()?.stageUsageReservations, before);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  const empty = await stageMessageProposal("empty", false), emptyClaim = { kind: "proposal" as const, id: empty.source.id, token: "qa-stage-empty" };
  await empty.auto.delete();
  await empty.source.update({ status: "processing", claimToken: emptyClaim.token, leaseUntil: new Date(Date.now() + 60_000) });
  const emptyContext = { ...context, leadId: empty.leadId, stageSource: emptyClaim };
  await runLeadAutomations(emptyContext);
  await empty.auto.set({ ...(await input.auto.get()).data()!, conditions: { sourceIn: ["qa-stage-empty"] } });
  await runLeadAutomations(emptyContext);
  assert.deepEqual((await empty.source.get()).data()?.stageAutomationPlans, []);
});

test("stage source outbox waits for its live parent without consuming a provider attempt", async () => {
  const input = await stageMessageProposal("preparing", false), claim = { kind: "proposal" as const, id: input.source.id, token: "qa-stage-preparing" };
  await input.source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  await runLeadAutomations({ tenantId, leadId: input.leadId, trigger: "lead_stage_changed", previousStage: "reserva", nextStage: "ganho", stageSource: claim, strictErrors: true });
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 1); const job = jobs.docs[0].ref;
  assert.equal(await simulatedStageDelivery(job), 0);
  assert.equal((await job.get()).data()?.errorCode, "AUTOMATION_PREPARING"); assert.equal((await job.get()).data()?.attempts, 0);
  await input.source.update({ status: "done" }); await job.update({ dueAt: new Date(0) });
  assert.equal(await simulatedStageDelivery(job), 1);
});

test("stage source limited quota is charged once and cannot authorize another occurrence over the cap", async () => {
  const entitlements = adminDb.collection("tenant_entitlements").doc(tenantId), previous = (await entitlements.get()).data()!;
  const usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${new Date().toISOString().slice(0, 7)}`), priorUsage = (await usage.get()).data();
  await entitlements.update({ limits: { automationsPerMonth: 1 } });
  await usage.set({ tenantId, monthRef: new Date().toISOString().slice(0, 7), automationExecutions: 0 });
  try {
    const first = await stageMessageProposal("quota-first");
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    await processProposalMutation(first.source.id, tenantId);
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    const next = await stageMessageProposal("quota-refused", false);
    assert.equal((await processProposalMutation(next.source.id, tenantId)).completed, true);
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", next.chatId).get()).size, 0);
  } finally { await entitlements.update({ limits: previous.limits || {} }); if (priorUsage) await usage.set(priorUsage); else await usage.delete(); }
});

async function internalProposal(name: string) {
  const input = await fixture(`internal-${name}`), origin = `qa-internal-${name}`;
  await input.lead.update({ origem: origin });
  const actions = [
    { type: "create_task", title: "Conferir separacao", dueInHours: 2 },
    { type: "follow_up", dueInHours: 3 },
    { type: "alert_human", title: "Revisar condicao", text: "Exige revisao humana", dueInHours: 1 },
    { type: "add_note", text: "Proposta aprovada; pagamento ainda pendente" },
  ];
  const auto = adminDb.collection("automations").doc(`${input.leadId}_auto`);
  await auto.set({ tenantId, name: "QA registros internos", enabled: true, status: "active", trigger: "budget_approved",
    conditions: { sourceIn: [origin] }, actions });
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!), claim = { id: source.id, token: "qa-internal-claim" };
  await source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  const run = () => runLeadAutomations({ tenantId, leadId: input.leadId, trigger: "budget_approved", strictErrors: true, proposalClaim: claim });
  const records = async (collection: string) => (await adminDb.collection(collection).where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).docs;
  return { ...input, source, claim, auto, run, records };
}

test("proposal internal records and receipts commit once under concurrent execution and replay", async () => {
  const input = await internalProposal("replay");
  await Promise.all(Array.from({ length: 5 }, () => input.run()));
  const tasks = await input.records("lead_tasks"), notes = await input.records("lead_notes");
  assert.equal(tasks.length, 3, "Each accepted task/alert action has exactly one internal record");
  assert.equal(notes.length, 2, "Alert note and explicit note are separate accepted actions, not retry copies");
  const before = tasks.map(row => [row.id, row.data().dueAt?.toMillis()]);
  await input.run();
  assert.deepEqual((await input.records("lead_tasks")).map(row => [row.id, row.data().dueAt?.toMillis()]), before);
  assert.equal((await input.records("lead_notes")).length, 2);
  const receipts = (await input.records("jobs")).filter(row => row.data().type === "automation_proposal_internal_effect");
  assert.equal(receipts.length, 4);
  assert.equal((await input.lead.collection("events").where("type", "==", "automation_human_task_created").get()).size, 1);
  assert.ok(receipts.every(row => row.data().completionMeaning === "internal_records_committed_not_human_notified"));
  const sourceTime = (await input.source.get()).data()!.createdAt.toMillis();
  const task = tasks.find(row => row.data().title === "Conferir separacao")!;
  assert.equal(task.data().dueAt.toMillis(), sourceTime + 2 * 3600_000, "Retry cannot renew an accepted deadline");
});

async function preparedInternal(name: string) {
  const input = await internalProposal(name), automation = normalizeAutomationDoc(input.auto.id, (await input.auto.get()).data()!, tenantId);
  await freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim: input.claim, automations: [automation] });
  assert.equal((await reserveTenantAutomationExecution(tenantId, { jobId: input.source.id, claimToken: input.claim.token,
    kind: "proposal", automationId: automation.id })).allowed, true);
  const effect = (index = 0) => commitProposalAutomationInternalRecords({ tenantId, leadId: input.leadId, claim: input.claim,
    automation, actionIndex: index, action: automation.actions[index] });
  return { ...input, automation, effect };
}

test("proposal CRM replay preserves a newer untracked human priority instead of applying the old action again", async () => {
  const input = await internalProposal("crm-stale-replay");
  await input.auto.update({ actions: [{ type: "set_priority", priority: "high" }] });
  await input.run();
  assert.equal((await input.lead.get()).data()?.priority, "high");
  await input.lead.update({ priority: "low" });
  const before = await input.lead.get();
  await input.run();
  assert.equal((await input.lead.get()).data()?.priority, "low");
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
});

async function crmProposal(name: string, actions: Array<Record<string, unknown>>, manualStage = true) {
  const input = await fixture(`crm-${name}`, manualStage), origin = `qa-crm-${name}`;
  await input.lead.update({ origem: origin, priority: "medium", tags: ["original"] });
  const auto = adminDb.collection("automations").doc(`${input.leadId}_auto`);
  await auto.set({ tenantId, name: "QA mutacoes CRM", enabled: true, status: "active", trigger: "budget_approved", conditions: { sourceIn: [origin] }, actions });
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!), claim = { id: source.id, token: "qa-crm-claim" };
  await source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  const automation = normalizeAutomationDoc(auto.id, (await auto.get()).data()!, tenantId);
  const run = () => runLeadAutomations({ tenantId, leadId: input.leadId, trigger: "budget_approved", strictErrors: true, proposalClaim: claim });
  const prepare = async () => {
    await freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim, automations: [automation] });
    assert.equal((await reserveTenantAutomationExecution(tenantId, { jobId: source.id, claimToken: claim.token, kind: "proposal", automationId: auto.id })).allowed, true);
  };
  const effect = (index: number) => commitProposalAutomationInternalRecords({ tenantId, leadId: input.leadId, claim, automation, actionIndex: index, action: automation.actions[index] });
  const receipts = async () => (await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).docs
    .filter(row => row.data().type === "automation_proposal_internal_effect");
  return { ...input, auto, source, claim, automation, prepare, effect, run, receipts };
}

async function pipelineReadFailure(skip = 0) {
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const error = Object.assign(new Error("QA_PIPELINE_READ_UNAVAILABLE"), { code: 14 }); let reads = 0;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `pipeline/${tenantId}` && ++reads > skip) throw error;
    return Reflect.apply(original, this, [target, ...rest]);
  });
  return { restore: () => interceptor.mock.restore(), injected: () => reads > skip, error };
}

test("proposal pipeline read failure cannot freeze a false missing-funnel baseline", async () => {
  const input = await crmProposal("transient-freeze", [{ type: "move_stage", stageId: "proposta" }]);
  const probe = await pipelineReadFailure(1);
  try { await assert.rejects(freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim: input.claim, automations: [input.automation] }), error => error === probe.error); }
  finally { probe.restore(); }
  assert.equal(probe.injected(), true);
  assert.equal((await input.source.get()).data()?.automationApprovalPlans, undefined);
  await input.prepare();
  assert.ok((await input.source.get()).data()?.proposalCrmPipeline);
});

test("proposal pipeline read failure cannot commit a permanent blocked CRM receipt", async () => {
  const input = await crmProposal("transient-effect", [{ type: "move_stage", stageId: "proposta" }]);
  await input.prepare(); const before = await input.lead.get(), probe = await pipelineReadFailure(2);
  try { await assert.rejects(input.effect(0), error => error === probe.error); }
  finally { probe.restore(); }
  assert.equal(probe.injected(), true); assert.equal((await input.receipts()).length, 0);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  await input.effect(0);
  assert.equal((await input.receipts())[0].data().outcome, "blocked_manual", "Only the genuine human lock can create the final decision after recovery");
});

test("proposal pipeline read failure before approval cannot commit financial or mutation records", async () => {
  const input = await fixture("transient-approval"), before = await input.budget.get(), probe = await pipelineReadFailure();
  try { await assert.rejects(commit(input), error => error === probe.error); }
  finally { probe.restore(); }
  assert.equal(probe.injected(), true); assert.ok((await input.budget.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get()).size, 0);
});

test("proposal pipeline read failure before claiming ready work leaves it ready without consuming an attempt", async () => {
  const input = await fixture("transient-claim"), result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
  const probe = await pipelineReadFailure();
  try { await assert.rejects(processProposalMutation(source.id, tenantId), error => error === probe.error); }
  finally { probe.restore(); }
  assert.equal(probe.injected(), true); assert.equal((await source.get()).data()?.status, "ready"); assert.equal((await source.get()).data()?.attempts, 0);
  assert.equal((await processProposalMutation(source.id, tenantId)).completed, true);
});

test("one unavailable proposal read does not consume it or starve another ready occurrence", async () => {
  const first = await fixture("transient-batch-first"), second = await fixture("transient-batch-second");
  const a = await commit(first), b = await commit(second), source = adminDb.collection("jobs").doc(a.mutationId!);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === first.budget.path) throw Object.assign(new Error("QA_ONE_PROPOSAL_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try {
    const result = await processPendingProposalMutations({ tenantId, limit: 20 });
    assert.ok(result.failed >= 1); assert.ok(result.completed >= 1);
    assert.equal((await source.get()).data()?.status, "ready"); assert.equal((await source.get()).data()?.attempts, 0);
    assert.equal((await adminDb.collection("jobs").doc(b.mutationId!).get()).data()?.status, "done");
  } finally { interceptor.mock.restore(); }
  assert.equal((await processProposalMutation(source.id, tenantId)).completed, true);
});

test("genuine invalid, foreign and ambiguous funnel data remain explicit configuration denials", async () => {
  const { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } = await import("../lib/server/crm/pipeline.ts");
  const scope = `${tenantId}_pipeline_shape`, direct = adminDb.collection("pipeline").doc(scope);
  const a = adminDb.collection("pipeline").doc(`${scope}_legacy_a`), b = adminDb.collection("pipeline").doc(`${scope}_legacy_b`);
  const read = () => adminDb.runTransaction(tx => loadTenantPipelineInTransaction(tx, scope));
  try {
    await direct.set({ tenantId: scope, stages: [{ id: "repetida", label: "Um" }, { id: "repetida", label: "Dois" }] });
    await assert.rejects(read(), error => error instanceof TenantPipelineConfigurationError && /Funil invalido/.test(error.message));
    await direct.set({ tenantId: `${scope}_foreign`, stages: [{ id: "entrada", label: "Entrada" }] });
    await assert.rejects(read(), error => error instanceof TenantPipelineConfigurationError && /outra empresa/.test(error.message));
    await direct.delete();
    for (const ref of [a, b]) await ref.set({ tenantId: scope, stages: [{ id: "entrada", label: "Entrada" }] });
    await assert.rejects(read(), error => error instanceof TenantPipelineConfigurationError && /ambiguo/.test(error.message));
  } finally { for (const ref of [direct, a, b]) await ref.delete(); }
});

test("proposal CRM sequential and concurrent replays advance only receipted own mutations in the saved funnel", async () => {
  const input = await crmProposal("sequence", [
    { type: "move_stage", stageId: "reserva" }, { type: "add_tag", tag: "interessado" }, { type: "set_priority", priority: "high" },
    { type: "move_stage", stageId: "proposta" }, { type: "set_priority", priority: "low" }, { type: "add_tag", tag: "varejo" },
  ], false);
  await Promise.all([input.run(), input.run(), input.run()]);
  const lead = (await input.lead.get()).data()!;
  assert.equal(lead.pipelineStage, "proposta"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["original", "interessado", "varejo"]);
  assert.equal((await input.receipts()).length, 6);
  assert.ok((await input.receipts()).every(row => row.data().outcome === "applied"));
  const before = await input.lead.get(); await input.run();
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
});

test("proposal CRM records manual and stale conflicts permanently rather than retrying into later human data", async () => {
  const input = await crmProposal("conflict", [{ type: "set_priority", priority: "high" }, { type: "add_tag", tag: "automatico" }, { type: "move_stage", stageId: "proposta" }]);
  await input.prepare();
  await input.lead.update({ priority: "low", tags: ["humano"] });
  const before = await input.lead.get();
  await input.effect(0); await input.effect(1); await input.effect(2);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.deepEqual((await input.receipts()).map(row => row.data().outcome).sort(), ["blocked_manual", "blocked_stale", "blocked_stale"]);
  await input.lead.update({ priority: "medium", tags: ["original"] });
  const restored = await input.lead.get(); await input.effect(0); await input.effect(1);
  assert.ok((await input.lead.get()).updateTime!.isEqual(restored.updateTime!));
});

test("proposal CRM manual priority and tags are not overwritten and nonexistent stage IDs are not invented", async () => {
  const input = await crmProposal("manual", [{ type: "set_priority", priority: "high" }, { type: "add_tag", tag: "auto" }, { type: "move_stage", stageId: "qualificacao" }]);
  await input.lead.update({ "crmFieldOwnership.priority": { source: "manual", locked: true, actorId: uid }, "crmFieldOwnership.tags": { source: "manual", locked: true, actorId: uid } });
  await input.prepare(); const before = await input.lead.get();
  await input.run();
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.deepEqual((await input.receipts()).map(row => row.data().outcome).sort(), ["blocked_manual", "blocked_manual", "blocked_pipeline"]);
});

test("proposal CRM mutation, projection, event and receipt roll back together on storage rejection", async () => {
  const input = await crmProposal("rollback", [{ type: "set_priority", priority: "high" }]);
  await input.prepare(); const before = await input.lead.get(), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (data.type === "automation_proposal_internal_effect" && data.proposalSourceId === input.source.id) throw new Error("QA_CRM_RECEIPT_UNAVAILABLE");
    return original.call(this, ref, data);
  });
  try { await assert.rejects(input.effect(0), /QA_CRM_RECEIPT_UNAVAILABLE/); }
  finally { interceptor.mock.restore(); }
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await input.source.get()).data()?.proposalCrmProjection, undefined); assert.equal((await input.receipts()).length, 0);
  assert.equal((await input.lead.collection("events").get()).size, 1);
  await input.effect(0); assert.equal((await input.lead.get()).data()?.priority, "high");
});

test("proposal stage authority requires its exact committed receipt rather than a forged ownership marker", async () => {
  for (const corrupted of ["receipt", "projection", "owner", "null_projection", "receipt_after"] as const) {
    const input = await crmProposal(`proof-${corrupted}`, [{ type: "move_stage", stageId: "reserva" }, { type: "set_priority", priority: "high" }], false);
    await input.prepare(); const result = await input.effect(0);
    if (corrupted === "receipt") await adminDb.collection("jobs").doc(result.receiptId).delete();
    if (corrupted === "projection") await input.source.update({ "proposalCrmProjection.pipelineStage.value": "proposta" });
    if (corrupted === "owner") await input.lead.update({ "crmFieldOwnership.pipelineStage.automationEffectId": "qa-forged" });
    if (corrupted === "null_projection") await input.source.update({ "proposalCrmProjection.pipelineStage": null });
    if (corrupted === "receipt_after") {
      const owner = (await input.lead.get()).data()!.crmFieldOwnership.pipelineStage;
      await adminDb.collection("jobs").doc(result.receiptId).update({ after: "captado" });
      await input.source.update({ "proposalCrmProjection.pipelineStage.value": "captado", "proposalCrmProjection.pipelineStage.owner": { ...owner, value: "captado" } });
      await input.lead.update({ pipelineStage: "captado", stage: "captado", "crmFieldOwnership.pipelineStage": { ...owner, value: "captado" } });
    }
    const before = await input.lead.get();
    await assert.rejects(input.effect(1), /PROPOSAL_CRM_PROJECTION_INVALID/);
    assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  }
});

test("proposal CRM legacy frozen plans are not retroactively given a baseline or replay authorization", async () => {
  const input = await crmProposal("legacy", [{ type: "set_priority", priority: "high" }]);
  await input.prepare(); const { FieldValue } = await import("firebase-admin/firestore");
  await input.source.update({ proposalCrmProtocolVersion: FieldValue.delete(), proposalCrmBaseline: FieldValue.delete(), proposalCrmBaselineOwnership: FieldValue.delete() });
  await assert.rejects(input.effect(0), /BASELINE_MISSING/);
  await freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim: input.claim, automations: [input.automation] });
  assert.equal((await input.source.get()).data()?.proposalCrmProtocolVersion, undefined);
  assert.equal((await input.lead.get()).data()?.priority, "medium");
});

test("proposal CRM stage change stays authorized through real consumer and outbound delivery without weakening human revocation", async () => {
  const input = await crmProposal("outbound", [{ type: "move_stage", stageId: "reserva" }, { type: "send_message", text: "Proposta QA confirmada" }], false);
  const chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  await input.source.update({ status: "ready" });
  assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true);
  assert.equal((await input.lead.get()).data()?.pipelineStage, "reserva");
  const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  assert.equal(queued.size, 1);
  const previousFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return previousFetch(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/);
    calls++; return Promise.resolve(Response.json({ messages: [{ id: "wamid.qa-crm-stage-source" }] }));
  };
  try { await processChatOutboundJobs({ jobId: queued.docs[0].id }); }
  finally { globalThis.fetch = previousFetch; }
  assert.equal(calls, 1); assert.equal((await queued.docs[0].ref.get()).data()?.status, "completed");
  const authorizeDelivery = () => adminDb.runTransaction(tx => assertProposalAutomationSource(tx, { id: input.source.id, tenantId,
    leadId: input.leadId, delivery: true }));
  await authorizeDelivery();
  await input.lead.update({ pipelineStage: "proposta", stage: "proposta", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: uid } });
  await assert.rejects(authorizeDelivery(), /PROPOSAL_CRM_PROJECTION_INVALID/);
});

test("delayed proposal CRM recovers after committed effects without overwriting later human priority or charging again", async () => {
  const input = await crmProposal("delayed-cold", [{ type: "set_priority", priority: "high", waitInHours: 0.000001 }, { type: "add_tag", tag: "automatico", waitInHours: 0.000001 }]);
  await input.source.update({ status: "ready" });
  assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true);
  const schedules = (await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).docs.filter(row => row.data().type === "automation_scheduled_action");
  assert.equal(schedules.length, 2);
  const reservation = (await input.source.get()).data()!.proposalUsageReservations;
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.update as
    (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => FirebaseFirestore.Transaction;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) {
    if (schedules.some(row => row.ref.path === ref.path) && data.status === "done") throw new Error("QA_CRM_SCHEDULE_FINALIZATION_LOST");
    return original.call(this, ref, data);
  });
  try { await processPendingAutomationActions({ tenantId }); } finally { interceptor.mock.restore(); }
  assert.equal((await input.lead.get()).data()?.priority, "high");
  for (const row of schedules) assert.equal((await row.ref.get()).data()?.status, "retrying");
  await input.lead.update({ priority: "low", "crmFieldOwnership.priority": { source: "manual", locked: true, actorId: uid } });
  const before = await input.lead.get();
  await new Promise<void>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/proposal-schedule-worker.mts", import.meta.url))],
    { timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_PROPOSAL_SCHEDULE_TENANT: tenantId } }, error => error ? reject(error) : resolve()));
  for (const row of schedules) assert.equal((await row.ref.get()).data()?.status, "done");
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await input.receipts()).length, 2);
  assert.deepEqual((await input.source.get()).data()!.proposalUsageReservations, reservation);
});

async function delayedInternalProposal(name: string) {
  const input = await internalProposal(`delayed-${name}`), actions = (await input.auto.get()).data()!.actions;
  await input.auto.update({ actions: actions.map((action: Record<string, unknown>) => ({ ...action, waitInHours: 0.000001 })) });
  await input.source.update({ status: "ready" });
  assert.equal((await processProposalMutation(input.source.id, tenantId)).completed, true);
  const schedules = (await input.records("jobs")).filter(row => row.data().type === "automation_scheduled_action");
  assert.equal(schedules.length, 4);
  assert.ok(schedules.every(row => row.data().executeAfter.toMillis() <= Date.now()));
  return { ...input, schedules };
}

test("delayed proposal internal records retain source authority instead of executing after source deletion", async () => {
  const input = await delayedInternalProposal("deleted-source");
  await input.source.delete();
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.records("lead_tasks")).length, 0);
  assert.equal((await input.records("lead_notes")).length, 0);
  for (const row of input.schedules) assert.equal((await row.ref.get()).data()?.status, "reconciliation_required");
});

test("all four delayed proposal internal action types commit once with the original quota and deadline", async () => {
  const input = await delayedInternalProposal("positive"), source = (await input.source.get()).data()!;
  const month = new Date().toISOString().slice(0, 7), usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${month}`);
  const quotaBefore = (await usage.get()).data()?.automationExecutions;
  await processPendingAutomationActions({ tenantId });
  const tasks = await input.records("lead_tasks"), notes = await input.records("lead_notes");
  assert.equal(tasks.length, 3); assert.equal(notes.length, 2);
  for (const row of input.schedules) {
    const schedule = (await row.ref.get()).data()!;
    assert.equal(schedule.status, "done"); assert.equal(schedule.chatId, null);
    const receipts = (await input.records("jobs")).filter(receipt => receipt.data().scheduledJobId === row.id);
    assert.equal(receipts.length, 1); assert.equal(receipts[0].data().completionMeaning, "internal_records_committed_not_human_notified");
    if (schedule.action.type === "create_task") assert.equal(tasks.find(task => task.id === receipts[0].data().taskId)!.data().dueAt.toMillis(),
      schedule.executeAfter.toMillis() + 2 * 3600_000);
  }
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.records("lead_tasks")).length, 3); assert.equal((await input.records("lead_notes")).length, 2);
  assert.deepEqual((await input.source.get()).data()!.proposalUsageReservations, source.proposalUsageReservations);
  assert.equal((await usage.get()).data()?.automationExecutions, quotaBefore);
});

test("delayed proposal internal plans freeze schedule identities and wait for a live producer without spending attempts", async () => {
  const input = await internalProposal("schedule-registration"), actions = (await input.auto.get()).data()!.actions;
  await input.auto.update({ actions: actions.map((action: Record<string, unknown>) => ({ ...action, waitInHours: 0.000001 })) });
  await Promise.all([input.run(), input.run()]);
  const schedules = (await input.records("jobs")).filter(row => row.data().type === "automation_scheduled_action");
  assert.equal(schedules.length, 4);
  const deadlines = schedules.map(row => [row.id, row.data().executeAfter.toMillis()]);
  await processPendingAutomationActions({ tenantId });
  for (const row of schedules) { const current = (await row.ref.get()).data()!; assert.equal(current.status, "pending"); assert.equal(current.attempts, 0); }
  assert.equal((await input.records("lead_tasks")).length, 0);
  await input.run();
  assert.deepEqual((await input.records("jobs")).filter(row => row.data().type === "automation_scheduled_action").map(row => [row.id, row.data().executeAfter.toMillis()]), deadlines);
  await input.source.update({ status: "done" });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.records("lead_tasks")).length, 3);
});

test("delayed proposal internal revocation and manifest tampering cannot create records", async () => {
  for (const condition of ["budget", "configuration", "capability", "payload", "deadline", "guard", "missing_action", "send_substitution"] as const) {
    const input = await delayedInternalProposal(`revoke-${condition}`);
    if (condition === "budget") await input.budget.update({ revision: 99 });
    if (condition === "configuration") await input.auto.update({ enabled: false });
    if (condition === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    for (const schedule of input.schedules) {
      if (condition === "payload") await schedule.ref.update({ "action.title": "Outro plano" });
      if (condition === "deadline") await schedule.ref.update({ executeAfter: new Date(0) });
      if (condition === "guard") await schedule.ref.update({ proposalScheduleProtocol: 0 });
      if (condition === "missing_action") await schedule.ref.update({ action: null });
      if (condition === "send_substitution") await schedule.ref.update({ action: { type: "send_message", text: "Nao autorizado", waitInHours: 0.000001 } });
    }
    try {
      await processPendingAutomationActions({ tenantId });
      assert.equal((await input.records("lead_tasks")).length, 0, condition);
      assert.equal((await input.records("lead_notes")).length, 0, condition);
      for (const schedule of input.schedules) assert.equal((await schedule.ref.get()).data()?.status, "reconciliation_required", condition);
    } finally { if (condition === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
  }
});

test("legacy delayed proposal internal records without a source manifest require reconciliation", async () => {
  const input = await fixture("legacy-internal"), job = adminDb.collection("jobs").doc(`${input.leadId}_old_task`);
  await job.set({ tenantId, leadId: input.leadId, type: "automation_scheduled_action", trigger: "budget_approved", status: "pending", attempts: 0,
    action: { type: "alert_human", title: "Sem origem comprovada", text: "Nota legada" }, executeAfter: new Date(0) });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await job.get()).data()?.status, "reconciliation_required");
  assert.equal((await job.get()).data()?.attempts, 0);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
});

test("delayed proposal internal writes reject a stale scheduler and roll back on receipt storage failure", async () => {
  const input = await delayedInternalProposal("storage"), schedule = input.schedules.find(row => row.data().action.type === "alert_human")!;
  const claim = await claimScheduledAutomationJob(schedule.id, tenantId);
  assert.ok(claim);
  const effect = (token: string) => commitScheduledProposalAutomationInternalRecords({ tenantId, leadId: input.leadId,
    scheduledJobId: schedule.id, token, action: schedule.data().action });
  await assert.rejects(effect("qa-stale-owner"), /CLAIM_LOST/);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (data.type === "automation_proposal_internal_effect" && data.scheduledJobId === schedule.id) throw new Error("QA_DELAYED_INTERNAL_RECEIPT_UNAVAILABLE");
    return original.call(this, ref, data);
  });
  try {
    await assert.rejects(effect(claim.claimToken), /QA_DELAYED_INTERNAL_RECEIPT_UNAVAILABLE/);
    assert.equal((await input.records("lead_tasks")).length, 0); assert.equal((await input.records("lead_notes")).length, 0);
  } finally { interceptor.mock.restore(); }
  await effect(claim.claimToken);
  assert.equal((await input.records("lead_tasks")).length, 1); assert.equal((await input.records("lead_notes")).length, 1);
  for (const row of input.schedules) await row.ref.update({ status: "reconciliation_required" });
});

test("cold scheduler recovers delayed proposal internal commit without undoing human edits or charging twice", async () => {
  const input = await delayedInternalProposal("cold"), { Transaction } = await import("firebase-admin/firestore");
  const original = Transaction.prototype.update as (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => FirebaseFirestore.Transaction;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) {
    if (input.schedules.some(row => row.ref.path === ref.path) && data.status === "done") throw new Error("QA_INTERNAL_FINALIZATION_LOST");
    return original.call(this, ref, data);
  });
  try { await processPendingAutomationActions({ tenantId }); } finally { interceptor.mock.restore(); }
  for (const row of input.schedules) assert.equal((await row.ref.get()).data()?.status, "retrying");
  const tasks = await input.records("lead_tasks"), notes = await input.records("lead_notes");
  assert.equal(tasks.length, 3); assert.equal(notes.length, 2);
  await tasks[0].ref.update({ title: "Editado por humano", status: "done" });
  await notes[0].ref.update({ text: "Nota humana corrigida" });
  const before = await tasks[0].ref.get(), reservation = (await input.source.get()).data()!.proposalUsageReservations;
  await new Promise<void>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/proposal-schedule-worker.mts", import.meta.url))],
    { timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_PROPOSAL_SCHEDULE_TENANT: tenantId } }, error => error ? reject(error) : resolve()));
  for (const row of input.schedules) assert.equal((await row.ref.get()).data()?.status, "done");
  assert.equal((await input.records("lead_tasks")).length, 3); assert.equal((await input.records("lead_notes")).length, 2);
  assert.ok((await tasks[0].ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await notes[0].ref.get()).data()?.text, "Nota humana corrigida");
  assert.deepEqual((await input.source.get()).data()!.proposalUsageReservations, reservation);
});

test("proposal task, note, audit and receipt roll back together on storage rejection", async () => {
  const input = await preparedInternal("rollback-records"), { Transaction } = await import("firebase-admin/firestore");
  const originalCreate = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (data.type === "automation_proposal_internal_effect" && data.proposalSourceId === input.source.id) throw new Error("QA_INTERNAL_RECEIPT_REJECTED");
    return originalCreate.call(this, ref, data);
  });
  try {
    await assert.rejects(input.effect(2), /QA_INTERNAL_RECEIPT_REJECTED/);
    assert.equal((await input.records("lead_tasks")).length, 0);
    assert.equal((await input.records("lead_notes")).length, 0);
    assert.equal((await input.lead.collection("events").get()).size, 1, "Only original proposal mutation event survives");
    assert.equal((await input.records("jobs")).filter(row => row.data().type === "automation_proposal_internal_effect").length, 0);
  } finally { interceptor.mock.restore(); }
  await input.effect(2);
  assert.equal((await input.records("lead_tasks")).length, 1);
  assert.equal((await input.records("lead_notes")).length, 1);
});

test("proposal internal effects revalidate source, quota, plan, capability and lease before writing", async () => {
  for (const revoked of ["revision", "lead", "configuration", "capability", "lease", "token", "quota"] as const) {
    const input = await preparedInternal(`revoke-${revoked}`);
    if (revoked === "revision") await input.budget.update({ revision: 99 });
    if (revoked === "lead") await input.lead.update({ tenantId: `${tenantId}_foreign` });
    if (revoked === "configuration") await input.auto.update({ enabled: false });
    if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    if (revoked === "lease") await input.source.update({ leaseUntil: new Date(0) });
    if (revoked === "token") await input.source.update({ claimToken: "qa-replaced" });
    if (revoked === "quota") await input.source.update({ proposalUsageReservations: {} });
    try {
      await assert.rejects(input.effect(2));
      assert.equal((await input.records("lead_tasks")).length, 0, revoked);
      assert.equal((await input.records("lead_notes")).length, 0, revoked);
      assert.equal((await input.lead.collection("events").get()).size, 1, revoked);
    } finally {
      if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] });
      if (revoked === "lead") await input.lead.update({ tenantId });
    }
  }
});

test("proposal internal replay preserves human edits and rejects changed payload or receipt", async () => {
  const input = await preparedInternal("edited-records"), accepted = await input.effect(2);
  const task = adminDb.collection("lead_tasks").doc(accepted.receiptId), note = adminDb.collection("lead_notes").doc(accepted.receiptId);
  await task.update({ status: "done", title: "Conferido pelo humano" });
  await note.update({ text: "Nota corrigida pelo humano" });
  const before = await task.get();
  await input.effect(2);
  assert.ok((await task.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await note.get()).data()?.text, "Nota corrigida pelo humano");
  await assert.rejects(commitProposalAutomationInternalRecords({ tenantId, leadId: input.leadId, claim: input.claim,
    automation: input.automation, actionIndex: 2, action: { ...input.automation.actions[2], text: "Plano adulterado" } }), /PLAN_OR_QUOTA_CHANGED/);
  await adminDb.collection("jobs").doc(accepted.receiptId).update({ fingerprint: "qa-tampered" });
  await assert.rejects(input.effect(2), /RECEIPT_CHANGED/);
  assert.equal((await input.records("lead_tasks")).length, 1);
  assert.equal((await input.records("lead_notes")).length, 1);
});

test("existing proposal consumer integrates internal receipts without notifying a human or provider", async () => {
  const input = await internalProposal("consumer");
  await input.source.update({ status: "ready" });
  const result = await processProposalMutation(input.source.id, tenantId);
  assert.equal(result.completed, true);
  assert.equal((await input.source.get()).data()?.status, "done");
  assert.equal((await input.records("lead_tasks")).length, 3);
  assert.equal((await input.records("lead_notes")).length, 2);
  assert.equal((await input.records("chat_outbound_jobs")).length, 0);
  assert.equal((await input.records("messages")).length, 0);
});

test("revocation after a committed proposal action blocks later actions and even receipt replay", async () => {
  const input = await preparedInternal("midflight-revoke");
  await input.effect(0);
  await input.auto.update({ status: "paused" });
  await assert.rejects(input.effect(1), /CONFIGURATION_REVOKED/);
  await assert.rejects(input.effect(0), /CONFIGURATION_REVOKED/);
  assert.equal((await input.records("lead_tasks")).length, 1);
  assert.equal((await input.records("lead_notes")).length, 0);
  assert.equal((await input.records("jobs")).filter(row => row.data().type === "automation_proposal_internal_effect").length, 1);
});

test("receipted internal actions do not resurrect a task deliberately removed by a human", async () => {
  const input = await preparedInternal("removed-task"), result = await input.effect(0);
  await adminDb.collection("lead_tasks").doc(result.receiptId).delete();
  const replay = await input.effect(0);
  assert.equal(replay.receiptId, result.receiptId);
  assert.equal((await input.records("lead_tasks")).length, 0);
  assert.equal((await input.lead.collection("events").where("type", "==", "automation_task_created").get()).size, 1);
});

test("cold proposal process replays the same internal occurrence without duplicating records", async () => {
  const input = await internalProposal("cold-records");
  await input.run();
  const before = (await input.records("lead_tasks")).map(row => [row.id, row.data().dueAt?.toMillis()]);
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/proposal-internal-worker.mts", import.meta.url))],
    { env: { ...process.env, QA_PROPOSAL_INTERNAL_TENANT: tenantId, QA_PROPOSAL_INTERNAL_LEAD: input.leadId,
      QA_PROPOSAL_INTERNAL_SOURCE: input.source.id, QA_PROPOSAL_INTERNAL_TOKEN: input.claim.token }, timeout: 25_000, maxBuffer: 8192 },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
  assert.equal(JSON.parse(output).executed, 4);
  assert.deepEqual((await input.records("lead_tasks")).map(row => [row.id, row.data().dueAt?.toMillis()]), before);
  assert.equal((await input.records("lead_notes")).length, 2);
});
test("ready approval work is resumed by the existing periodic consumer and replay changes nothing", async () => {
  const input = await fixture("recover"), result = await commit(input), ref = adminDb.collection("jobs").doc(result.mutationId!);
  assert.equal((await ref.get()).data()?.status, "ready");
  const processed = await processPendingAutomationActions({ tenantId }); assert.ok(processed.proposalRecovery.completed >= 1);
  assert.equal((await ref.get()).data()?.status, "done");
  const before = await input.budget.get(); assert.equal((await update(request({ status: "Aprovado", expectedRevision: 0 }), input.context)).status, 200);
  assert.ok((await input.budget.get()).updateTime!.isEqual(before.updateTime!));
});
test("expired started work requires reconciliation rather than another execution", async () => {
  const input = await fixture("uncertain"), result = await commit(input), ref = adminDb.collection("jobs").doc(result.mutationId!);
  await ref.update({ status: "processing", leaseUntil: new Date(Date.now() - 1000), claimToken: "qa-old" });
  assert.equal((await processProposalMutation(ref.id, tenantId)).processed, false);
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await processProposalMutation(ref.id, tenantId)).processed, false);
});
test("changed source, human stage and revoked capability prevent pending hooks", async () => {
  for (const condition of ["source", "human", "capability"]) {
    const input = await fixture(`revoked-${condition}`), result = await commit(input), ref = adminDb.collection("jobs").doc(result.mutationId!);
    if (condition === "source") await input.budget.update({ revision: 2, status: "Perdido" });
    if (condition === "human") await input.lead.update({ pipelineStage: "captado", stage: "captado" });
    if (condition === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    try { assert.equal((await processProposalMutation(ref.id, tenantId)).processed, false); assert.equal((await ref.get()).data()?.status, "reconciliation_required"); }
    finally { if (condition === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
  }
});
test("automatic stage obeys the saved funnel and commits cause while human ownership survives approval", async () => {
  const input = await fixture("stage-auto", false), result = await commit(input), lead = (await input.lead.get()).data()!;
  assert.equal(lead.pipelineStage, "ganho"); assert.equal(lead.crmFieldOwnership.pipelineStage.transitionId, result.mutationId);
  assert.equal(lead.crmFieldOwnership.pipelineStage.source, "system_event");
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "captado", label: "Entrada" }, { id: "reserva", label: "Separado" }] });
  try {
    const absent = await fixture("stage-absent", false), outcome = await commit(absent);
    assert.equal((await absent.lead.get()).data()?.pipelineStage, "reserva");
    assert.equal((await adminDb.collection("jobs").doc(outcome.mutationId!).get()).data()?.stageOutcome, "blocked_pipeline");
  } finally { await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: ["captado", "reserva", "proposta", "ganho", "perdido"].map(id => ({ id, label: id })) }); }
});
test("one compatible legacy revenue is reused and conflicting money cannot be silently overwritten", async () => {
  const input = await fixture("legacy-finance"), ref = adminDb.collection("financeiro").doc(`${input.budgetId}_legacy`);
  await ref.set({ tenantId, orcamentoId: input.budgetId, leadId: input.leadId, valor: 100, status: "pago" }); const before = await ref.get();
  assert.equal((await update(request({ status: "Aprovado" }), input.context)).status, 200);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await update(request({ valorTotal: 200, expectedRevision: 1 }), input.context)).status, 409);
  assert.equal((await input.budget.get()).data()?.valorTotal, 100);
});
test("missing authentication, other seller and foreign tenant cannot approve or create financial records", async () => {
  for (const condition of ["auth", "seller", "tenant"]) {
    const input = await fixture(`denied-${condition}`);
    if (condition === "seller") await input.lead.update({ ownerId: `${tenantId}_other` });
    if (condition === "tenant") await input.budget.update({ tenantId: `${tenantId}_foreign` });
    const before = await input.budget.get();
    try {
      assert.equal((await update(request({ status: "Aprovado" }, condition !== "auth"), input.context)).status, condition === "auth" ? 401 : 403);
      assert.ok((await input.budget.get()).updateTime!.isEqual(before.updateTime!));
      assert.equal((await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get()).size, 0);
    } finally { if (condition === "tenant") await input.budget.update({ tenantId }); }
  }
});

test("an approved Shopify proposal queues a durable automation message before any provider I/O", async () => {
  const input = await fixture("durable-message"), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await input.lead.update({ origem: "qa-durable-message" });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const automationId = `${input.leadId}_automation`;
  await adminDb.collection("automations").doc(automationId).set({ tenantId, enabled: true, status: "active", name: "QA durable approval",
    trigger: "budget_approved", conditions: { sourceIn: ["qa-durable-message"] }, actions: [{ type: "send_message", text: "Mensagem de proposta ficticia" }] });
  const priorFetch = globalThis.fetch; let providerAttempts = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (!["localhost", "127.0.0.1"].includes(target.hostname)) {
      providerAttempts++;
      return Promise.reject(new Error("QA_PROVIDER_IO_BEFORE_DURABLE_QUEUE"));
    }
    return priorFetch(url, init);
  };
  try {
    const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
    const processed = await processProposalMutation(source.id, tenantId);
    assert.equal(providerAttempts, 0, "A committed approval must enqueue, not call a provider directly");
    assert.equal(processed.completed, true, "Hook completion means accepted queue work, not external delivery");
    const queued = () => adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
    const accepted = await queued(); assert.equal(accepted.size, 1);
    assert.equal(accepted.docs[0].data().automationId, automationId);
    const before = accepted.docs[0].updateTime;
    await processProposalMutation(source.id, tenantId);
    const replay = await queued(); assert.equal(replay.size, 1);
    assert.ok(replay.docs[0].updateTime.isEqual(before)); assert.equal(providerAttempts, 0);
  } finally { globalThis.fetch = priorFetch; }
});

async function delayedApproval(name: string, waitInHours = 0.000001) {
    const input = await fixture(name);
    const chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`, automationId = `${input.leadId}_auto`;
    await input.lead.update({ origem: name });
    await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
    await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true });
    await adminDb.collection("automations").doc(automationId).set({ tenantId, enabled: true, status: "active", name: "QA delayed approval",
      trigger: "budget_approved", conditions: { sourceIn: [name] }, actions: [{ type: "send_message", text: "Proposta adiada ficticia", waitInHours }] });
    const approved = await commit(input), source = adminDb.collection("jobs").doc(approved.mutationId!);
    assert.equal((await processProposalMutation(source.id, tenantId)).completed, true);
    const schedules = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    const scheduled = schedules.docs.filter(row => row.data().type === "automation_scheduled_action");
    assert.equal(scheduled.length, 1);
    return { ...input, source, chatId, channelId, automationId, scheduled: scheduled[0].ref };
}

test("a delayed proposal with genuinely invalid funnel data is quarantined without provider work", async () => {
  const input = await delayedApproval("invalid-funnel-schedule"), pipeline = adminDb.collection("pipeline").doc(tenantId), previous = (await pipeline.get()).data()!;
  try {
    await pipeline.update({ stages: [{ id: "duplicada", label: "Um" }, { id: "duplicada", label: "Dois" }] });
    await processPendingAutomationActions({ tenantId });
    const row = (await input.scheduled.get()).data()!;
    assert.equal(row.status, "reconciliation_required"); assert.equal(row.attempts, 0);
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  } finally { await pipeline.set(previous); }
});

for (const revocation of ["deleted_source", "changed_proposal"] as const) {
  test(`delayed proposal message cannot reach a provider after ${revocation}`, async () => {
    const input = await delayedApproval(`delayed-${revocation}`), { chatId } = input;
    assert.ok((await input.scheduled.get()).data()!.executeAfter.toMillis() <= Date.now(), "The original deadline is actually due, not bypassed or edited");
    if (revocation === "deleted_source") await input.source.delete();
    else await input.budget.update({ revision: 99 });
    const priorFetch = globalThis.fetch; let providerAttempts = 0;
    globalThis.fetch = (url, init) => {
      const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
      assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/);
      providerAttempts++; return Promise.resolve(Response.json({ messages: [{ id: "wamid.qa-delayed-forbidden" }] }));
    };
    try {
      await processPendingAutomationActions({ tenantId });
      const outbox = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
      for (const job of outbox.docs) await processChatOutboundJobs({ jobId: job.id });
      assert.equal(providerAttempts, 0, "A delayed message must retain the authority of the actual approved proposal");
      for (const job of outbox.docs) assert.notEqual((await job.ref.get()).data()?.status, "completed");
    } finally { globalThis.fetch = priorFetch; }
  });
}

test("a delayed proposal schedule has stable identity and deadline while its source is registering actions", async () => {
  const input = await fixture("schedule-replay"), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084" });
  const automationId = `${input.leadId}_auto`, definition = { tenantId, enabled: true, status: "active", name: "QA replay",
    trigger: "budget_approved", conditions: { sourceIn: ["qa-schedule-replay-only"] }, actions: [{ type: "send_message", text: "Proposta QA", waitInHours: 1 }] };
  await adminDb.collection("automations").doc(automationId).set(definition);
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
  const claim = { id: source.id, token: "qa-schedule-replay" }, automation = normalizeAutomationDoc(automationId, definition, tenantId);
  await source.update({ status: "processing", claimToken: claim.token, leaseUntil: new Date(Date.now() + 60_000) });
  await freezeProposalAutomationPlans({ tenantId, leadId: input.leadId, claim, automations: [automation] });
  await reserveTenantAutomationExecution(tenantId, { jobId: source.id, claimToken: claim.token, kind: "proposal", automationId });
  const request = { tenantId, leadId: input.leadId, chatId, claim, automation, actionIndex: 0, action: automation.actions[0] };
  const id = await scheduleProposalAutomationMessage(request), ref = adminDb.collection("jobs").doc(id), before = await ref.get();
  assert.equal(await scheduleProposalAutomationMessage(request), id);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal(before.data()!.executeAfter.toMillis(), Math.trunc((await source.get()).data()!.createdAt.toMillis() + 3600_000));
  await assert.rejects(scheduleProposalAutomationMessage({ ...request, action: { ...request.action, text: "Outra mensagem" } }));
  await ref.update({ executeAfter: new Date(0) });
  await assert.rejects(scheduleProposalAutomationMessage(request), /RECEIPT_CHANGED/);
  await source.update({ status: "reconciliation_required" });
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(jobs.docs.filter(row => row.data().type === "automation_scheduled_action").length, 1);
});

test("an unbound legacy delayed proposal requires reconciliation instead of silently sending", async () => {
  const input = await fixture("schedule-legacy"), ref = adminDb.collection("jobs").doc(`${input.leadId}_old_schedule`);
  await ref.set({ tenantId, leadId: input.leadId, type: "automation_scheduled_action", trigger: "budget_approved", status: "pending", attempts: 0,
    action: { type: "send_message", text: "Proposta sem origem comprovada" }, executeAfter: new Date(0) });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await ref.get()).data()?.attempts, 0);
});

test("a valid delayed proposal sends once and reuses the original automation quota", async () => {
  const month = new Date().toISOString().slice(0, 7), usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${month}`);
  const entitlements = adminDb.collection("tenant_entitlements").doc(tenantId), original = (await entitlements.get()).data()!;
  await usage.set({ tenantId, monthRef: month, automationExecutions: 0 });
  await entitlements.update({ limits: { automationsPerMonth: 1 } });
  const input = await delayedApproval("delayed-positive"), priorFetch = globalThis.fetch; let attempts = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/);
    attempts++; return Promise.resolve(Response.json({ messages: [{ id: "wamid.qa-delayed-once" }] }));
  };
  try {
    const before = (await input.source.get()).data()!.proposalUsageReservations;
    await processPendingAutomationActions({ tenantId });
    const row = (await input.scheduled.get()).data()!;
    assert.equal(row.status, "done"); assert.ok(row.outboundJobId);
    assert.deepEqual((await input.source.get()).data()!.proposalUsageReservations, before);
    assert.equal(row.schedulerUsageReservation.automationId, input.automationId);
    assert.equal((await usage.get()).data()?.automationExecutions, 1, "A delayed action must not charge the accepted run twice");
    await processChatOutboundJobs({ jobId: row.outboundJobId });
    assert.equal(attempts, 1);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(row.outboundJobId).get()).data()?.status, "completed");
    await processPendingAutomationActions({ tenantId });
    await processChatOutboundJobs({ jobId: row.outboundJobId }); assert.equal(attempts, 1);
  } finally { globalThis.fetch = priorFetch; await entitlements.update({ limits: original.limits || {} }); await usage.delete(); }
});

for (const mutation of ["source", "budget", "config", "recipient", "channel", "human", "schedule", "guard", "action", "deadline"] as const) {
  test(`queued delayed proposal revalidates ${mutation} immediately before delivery`, async () => {
    const input = await delayedApproval(`delayed-enqueued-${mutation}`);
    await processPendingAutomationActions({ tenantId });
    const receipt = (await input.scheduled.get()).data()!;
    assert.equal(receipt.status, "done"); assert.ok(receipt.outboundJobId);
    const outbox = adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId);
    if (mutation === "source") await input.source.delete();
    if (mutation === "budget") await input.budget.update({ revision: 99 });
    if (mutation === "config") await adminDb.collection("automations").doc(input.automationId).update({ enabled: false });
    if (mutation === "recipient") await adminDb.collection("chats").doc(input.chatId).update({ contactPhone: "5511000000099" });
    if (mutation === "channel") await adminDb.collection("tenant_channels").doc(input.channelId).update({ phoneNumberId: "qa-other-account" });
    if (mutation === "human") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, humanOwnerUserId: uid });
    if (mutation === "schedule") await input.scheduled.delete();
    if (mutation === "guard") await outbox.update({ proposalScheduledJobId: null, proposalScheduledGuardVersion: null });
    if (mutation === "action") await input.scheduled.update({ "action.text": "Outro conteudo" });
    if (mutation === "deadline") await input.scheduled.update({ executeAfter: new Date(Date.now() + 3600_000) });
    const priorFetch = globalThis.fetch; let attempts = 0;
    globalThis.fetch = (url, init) => {
      const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
      attempts++; return Promise.reject(new Error("QA_DELAYED_PROVIDER_FORBIDDEN"));
    };
    try {
      await processChatOutboundJobs({ jobId: outbox.id });
      const job = (await outbox.get()).data()!;
      assert.equal(attempts, 0); assert.equal(job.providerAttemptStartedAt, undefined); assert.notEqual(job.status, "completed");
    } finally { globalThis.fetch = priorFetch; }
  });
}

test("delayed proposal acknowledgement loss requires reconciliation without another provider attempt", async () => {
  const input = await delayedApproval("delayed-uncertain"), priorFetch = globalThis.fetch; let attempts = 0;
  await processPendingAutomationActions({ tenantId });
  const row = (await input.scheduled.get()).data()!, outbox = adminDb.collection("chat_outbound_jobs").doc(row.outboundJobId);
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
    attempts++; return Promise.reject(new Error("QA_ACCEPTED_BUT_ACK_LOST"));
  };
  try {
    await processChatOutboundJobs({ jobId: outbox.id }); assert.equal(attempts, 1);
    assert.equal((await outbox.get()).data()?.status, "reconciliation_required");
    await processPendingAutomationActions({ tenantId }); await processChatOutboundJobs({ jobId: outbox.id }); assert.equal(attempts, 1);
  } finally { globalThis.fetch = priorFetch; }
});

test("delayed proposal waits for source and scheduler completion without renewing its deadline", async () => {
  const input = await delayedApproval("delayed-preparing"), original = (await input.scheduled.get()).data()!;
  await input.source.update({ status: "processing", leaseUntil: new Date(Date.now() + 60_000) });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.scheduled.get()).data()?.attempts, 0);
  await input.source.update({ status: "done" }); await processPendingAutomationActions({ tenantId });
  const row = (await input.scheduled.get()).data()!, outbox = adminDb.collection("chat_outbound_jobs").doc(row.outboundJobId);
  await input.scheduled.update({ status: "processing", leaseUntil: new Date(0) });
  await processChatOutboundJobs({ jobId: outbox.id });
  assert.equal((await outbox.get()).data()?.errorCode, "AUTOMATION_PREPARING");
  assert.equal((await outbox.get()).data()?.providerAttemptStartedAt, undefined);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await input.scheduled.get()).data()?.status, "done");
  assert.ok((await input.scheduled.get()).data()!.executeAfter.isEqual(original.executeAfter));
  assert.equal((await input.scheduled.get()).data()?.outboundJobId, outbox.id);
});

test("a fresh scheduler resumes a delayed proposal after queue commit but lost finalization", async () => {
  const input = await delayedApproval("delayed-cold-recovery"), { Transaction } = await import("firebase-admin/firestore");
  const original = Transaction.prototype.update as (ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) => FirebaseFirestore.Transaction;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>) {
    if (ref.path === input.scheduled.path && data.status === "done" && data.outboundJobId) throw new Error("QA_SCHEDULE_FINALIZATION_LOST");
    return original.call(this, ref, data);
  });
  try { await processPendingAutomationActions({ tenantId }); }
  finally { interceptor.mock.restore(); }
  assert.equal((await input.scheduled.get()).data()?.status, "retrying");
  const before = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(before.size, 1);
  await new Promise<void>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/proposal-schedule-worker.mts", import.meta.url))], {
      timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_PROPOSAL_SCHEDULE_TENANT: tenantId },
    }, error => error ? reject(error) : resolve()));
  const after = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(after.size, 1); assert.equal(after.docs[0].id, before.docs[0].id);
  const recovered = (await input.scheduled.get()).data()!;
  assert.equal(recovered.status, "done"); assert.equal(recovered.outboundJobId, before.docs[0].id);
  assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
});

async function queuedApproval(name: string) {
  const input = await fixture(name), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`, automationId = `${input.leadId}_automation`;
  await input.lead.update({ origem: name });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  await adminDb.collection("automations").doc(automationId).set({ tenantId, enabled: true, status: "active", name: "QA approval",
    trigger: "budget_approved", conditions: { sourceIn: [name] }, actions: [{ type: "send_message", text: "Mensagem ficticia de proposta" }] });
  const result = await commit(input), source = adminDb.collection("jobs").doc(result.mutationId!);
  assert.equal((await processProposalMutation(source.id, tenantId)).completed, true);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  assert.equal(jobs.size, 1);
  const reservations = (await source.get()).data()?.proposalUsageReservations;
  assert.equal(Object.keys(reservations || {}).length, 1, "The real proposal producer must bind its quota receipt");
  assert.equal((Object.values(reservations) as Array<Record<string, unknown>>)[0].automationId, automationId);
  return { ...input, chatId, automationId, source, job: jobs.docs[0].ref };
}

test("proposal automation delivers once through outbox and preserves its source receipt", async () => {
  const input = await queuedApproval("queue-send"), priorFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/);
    calls++; return Promise.resolve(Response.json({ messages: [{ id: "wamid.qa-proposal-once" }] }));
  };
  try {
    await processChatOutboundJobs({ jobId: input.job.id });
    assert.equal(calls, 1); assert.equal((await input.job.get()).data()?.status, "completed");
    const messageId = (await input.job.get()).data()?.messageId;
    assert.equal((await adminDb.collection("messages").doc(messageId).get()).data()?.metaMessageId, "wamid.qa-proposal-once");
    await processChatOutboundJobs({ jobId: input.job.id }); assert.equal(calls, 1);
    assert.equal((await input.source.get()).data()?.status, "done");
  } finally { globalThis.fetch = priorFetch; }
});

test("an uncertain proposal automation delivery never repeats the provider attempt", async () => {
  const input = await queuedApproval("queue-uncertain"), priorFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-number\/messages$/);
    calls++; return Promise.reject(new Error("QA_ACCEPTED_WITH_ACKNOWLEDGEMENT_LOST"));
  };
  try {
    await processChatOutboundJobs({ jobId: input.job.id }); assert.equal(calls, 1);
    assert.equal((await input.job.get()).data()?.status, "reconciliation_required");
    await processChatOutboundJobs({ jobId: input.job.id }); assert.equal(calls, 1);
    assert.equal((await input.source.get()).data()?.status, "done");
  } finally { globalThis.fetch = priorFetch; }
});

for (const condition of ["config", "budget", "owner", "source", "payload", "guard", "human", "expired", "recipient", "channel"] as const) {
  test(`queued proposal automation blocks ${condition} changes before a provider attempt`, async () => {
    const input = await queuedApproval(`queue-${condition}`);
    if (condition === "config") await adminDb.collection("automations").doc(input.automationId).update({ enabled: false });
    if (condition === "budget") await input.budget.update({ revision: 99 });
    if (condition === "owner") await input.lead.update({ ownerId: `${tenantId}_other` });
    if (condition === "source") await input.source.delete();
    if (condition === "payload") await input.job.update({ text: "Conteudo adulterado" });
    if (condition === "guard") await input.job.update({ automationProposalProtocol: null, automationProposalSourceId: null });
    if (condition === "human") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).set({ tenantId, chatId: input.chatId, aiEnabled: false, humanOwnerUserId: uid });
    if (condition === "expired") await input.source.update({ status: "processing", leaseUntil: new Date(0) });
    if (condition === "recipient") await adminDb.collection("chats").doc(input.chatId).update({ contactPhone: "5511000000099" });
    if (condition === "channel") await adminDb.collection("tenant_channels").doc(`${input.leadId}_channel`).update({ phoneNumberId: "other-number" });
    const priorFetch = globalThis.fetch; let calls = 0;
    globalThis.fetch = (url, init) => {
      const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      if (["localhost", "127.0.0.1"].includes(target.hostname)) return priorFetch(url, init);
      calls++; return Promise.reject(new Error("QA_PROPOSAL_PROVIDER_FORBIDDEN"));
    };
    try {
      await processChatOutboundJobs({ jobId: input.job.id }); assert.equal(calls, 0);
      const row = (await input.job.get()).data(); assert.notEqual(row?.status, "completed"); assert.equal(row?.providerAttemptStartedAt, undefined);
    } finally { globalThis.fetch = priorFetch; }
  });
}

test("a legacy approval task committed before a later hook failure is not duplicated by approval replay", async () => {
  const input = await fixture("partial-hooks"), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await input.lead.update({ origem: "qa-partial-hooks" });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  await adminDb.collection("automations").doc(`${input.leadId}_automation`).set({ tenantId, enabled: true, status: "active", name: "QA approval",
    trigger: "budget_approved", conditions: { sourceIn: ["qa-partial-hooks"] }, actions: [
      { type: "create_task", title: "Tarefa anterior a falha QA" }, { type: "send_message", text: "Nunca enviar externamente QA" } ] });
  const result = await commit(input), ref = adminDb.collection("jobs").doc(result.mutationId!);
  await freezeLegacyApprovalRecipe(adminDb, ref, `${input.leadId}_automation`);
  // Failure is now injected at durable enqueue, not at an untracked provider call.
  const prototype = Object.getPrototypeOf(adminDb.batch()), batches = new WeakSet<object>();
  const create = prototype.create as FirebaseFirestore.WriteBatch["create"], commitBatch = prototype.commit as FirebaseFirestore.WriteBatch["commit"];
  const createMock = mock.method(prototype, "create", function(this: FirebaseFirestore.WriteBatch, ...args: Parameters<FirebaseFirestore.WriteBatch["create"]>) {
    if (args[0].parent.id === "chat_outbound_jobs") batches.add(this);
    return Reflect.apply(create, this, args);
  });
  const commitMock = mock.method(prototype, "commit", function(this: FirebaseFirestore.WriteBatch) {
    if (batches.has(this)) return Promise.reject(new Error("QA_PROPOSAL_QUEUE_COMMIT_UNAVAILABLE"));
    return Reflect.apply(commitBatch, this, []);
  });
  try { const processed = await processProposalMutation(ref.id, tenantId); assert.equal(processed.processed, true); assert.equal(processed.completed, false); }
  finally { createMock.mock.restore(); commitMock.mock.restore(); }
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal((await tasks()).size, 1);
  assert.equal((await update(request({ status: "Aprovado", expectedRevision: 0 }), input.context)).status, 200);
  await processPendingAutomationActions({ tenantId }); assert.equal((await tasks()).size, 1);
  assert.equal((await adminDb.collection("financeiro").where("tenantId", "==", tenantId).where("orcamentoId", "==", input.budgetId).get()).size, 1);
});
