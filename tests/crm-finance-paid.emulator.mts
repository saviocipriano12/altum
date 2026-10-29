import test, { before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loseStageHookAcknowledgement, freezeLegacyStageRecipe } from "./fixtures/stage-hook-ack-fault.mts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { PATCH } = await import("../app/api/tenant/[tenantId]/finance/[financeId]/route.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { processFinanceStageTransition } = await import("../lib/server/crm/finance-stage-transition.ts");
const tenantId = `qa_finance_paid_${randomUUID()}`, uid = `${tenantId}_seller`;
let token: string;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => { const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "No financial/provider calls allowed in finance occurrence QA"); return originalFetch(url, init); };
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaFinancePaid2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "client_agent", status: "active", name: "Pessoa ficticia Shopify" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["manage_commercial"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "captado", label: "Entrada" }, { id: "escolha", label: "Escolhendo" }, { id: "ganho", label: "Concluido", isTerminal: true }] });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, name: "Acompanhar pagamento ficticio", enabled: true, status: "active", trigger: "finance_paid", conditions: {}, actions: [{ type: "create_task", title: "Acompanhar cliente da loja" }] });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaFinancePaid2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10_000) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["financeiro", "leads", "jobs", "lead_tasks", "lead_notes", "automations", "pipeline", "tenant_users", "users", "tenant_entitlements", "tenant_usage_monthly", "audit_logs", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails"]) for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function req(status = "pago") { return new Request("http://127.0.0.1/qa", { method: "PATCH", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) }); }
async function fixture() {
  const id = randomUUID(), lead = adminDb.collection("leads").doc(`${tenantId}_${id}`), finance = adminDb.collection("financeiro").doc(`${tenantId}_${id}`);
  await lead.set({ tenantId, ownerId: uid, assignedTo: uid, pipelineStage: "captado", stage: "captado", nome: "Cliente ficticio Shopify" });
  await finance.set({ tenantId, leadId: lead.id, status: "pendente", valor: 100, meioPagamento: "qa_local" });
  return { lead, finance, context: { params: Promise.resolve({ tenantId, financeId: finance.id }) } };
}
async function interruptedPayment() {
  const input = await fixture(), { DocumentReference } = await import("firebase-admin/firestore"), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
  let interrupted = false;
  const sets = mock.method(DocumentReference.prototype, "set", async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
    const result = await Reflect.apply(originalSet, this, args);
    if (!interrupted && this.path === input.finance.path) { interrupted = true; throw new Error("QA_FINANCE_COMMIT_ACK_LOST"); }
    return result;
  });
  const txs = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
    const result = await Reflect.apply(originalTx, this, args);
    if (!interrupted && result && typeof result === "object" && "financePaidOccurrenceId" in result && result.financePaidOccurrenceId) { interrupted = true; throw new Error("QA_FINANCE_COMMIT_ACK_LOST"); }
    return result;
  });
  try { assert.equal((await PATCH(req(), input.context)).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
  assert.equal(interrupted, true); assert.equal((await input.finance.get()).data()?.status, "pago");
  return input;
}
test("confirmed finance mutation survives lost acknowledgement and unchanged retry without losing its automation", async () => {
  const input = await interruptedPayment(); assert.equal((await PATCH(req(), input.context)).status, 200);
  await processPendingAutomationActions({ tenantId });
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).where("source", "==", "tenant_automation").get();
  assert.equal((await tasks()).size, 1);
  await processPendingAutomationActions({ tenantId }); assert.equal((await tasks()).size, 1);
});

async function rootFor(input: Awaited<ReturnType<typeof fixture>>) {
  const rows = await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).where('type', '==', 'crm_finance_paid_occurrence').get();
  assert.equal(rows.size, 1); return rows.docs[0].ref;
}
const causalTasks = (leadId: string) => adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('leadId', '==', leadId).where('source', '==', 'tenant_automation').get();

test('normal paid update preserves the existing stage hook and one causal finance receipt', async () => {
  const input = await fixture(), response = await PATCH(req(), input.context);
  assert.equal(response.status, 200, await response.clone().text());
  const root = await rootFor(input), tasks = await causalTasks(input.lead.id);
  assert.equal((await root.get()).data()?.status, 'done'); assert.equal(tasks.size, 1);
  assert.equal(tasks.docs[0].data().stageSourceKind, 'finance');
  assert.equal((await adminDb.collection('jobs').doc(tasks.docs[0].data().automationEffectId).get()).data()?.status, 'done');
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
  assert.equal((await PATCH(req('paid'), input.context)).status, 200);
  assert.equal((await causalTasks(input.lead.id)).size, 1); assert.equal((await rootFor(input)).id, root.id);
});

for (const revoked of ['status', 'value', 'method', 'finance_tenant', 'lead_tenant', 'event', 'capability', 'assignment', 'module'] as const) {
  test(`pending finance automation rejects changed ${revoked} without mutating the customer`, async () => {
    const input = await interruptedPayment(), root = await rootFor(input), row = (await root.get()).data()!;
    if (revoked === 'status') await input.finance.update({ status: 'cancelado' });
    if (revoked === 'value') await input.finance.update({ valor: 200 });
    if (revoked === 'method') await input.finance.update({ meioPagamento: 'outro_metodo' });
    if (revoked === 'finance_tenant') await input.finance.update({ tenantId: `${tenantId}_foreign` });
    if (revoked === 'lead_tenant') await input.lead.update({ tenantId: `${tenantId}_foreign` });
    if (revoked === 'event') await input.lead.collection('events').doc(row.sourceEventId).delete();
    if (revoked === 'capability') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: ['edit_leads'] });
    if (revoked === 'assignment') await input.lead.update({ ownerId: `${uid}_other`, assignedTo: `${uid}_other` });
    if (revoked === 'module') await adminDb.collection('tenant_entitlements').doc(tenantId).update({ 'modules.crm': false });
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId });
      assert.equal((await root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await causalTasks(input.lead.id)).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally {
      if (revoked === 'finance_tenant') await input.finance.update({ tenantId });
      if (revoked === 'lead_tenant') await input.lead.update({ tenantId });
      if (revoked === 'capability') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: ['manage_commercial'] });
      if (revoked === 'module') await adminDb.collection('tenant_entitlements').doc(tenantId).update({ 'modules.crm': true });
    }
  });
}

test('reopening and paying again creates a new occurrence and cannot authorize the previous pending one', async () => {
  const input = await interruptedPayment(), first = await rootFor(input);
  assert.equal((await PATCH(req('pendente'), input.context)).status, 200);
  assert.equal((await PATCH(req(), input.context)).status, 200);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await first.get()).data()?.status, 'reconciliation_required');
  const roots = await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).where('type', '==', 'crm_finance_paid_occurrence').get();
  assert.equal(roots.size, 2); assert.equal(roots.docs.filter(doc => doc.data().status === 'done').length, 1);
  assert.equal((await causalTasks(input.lead.id)).size, 1);
});

test('failure to write finance occurrence rolls back paid status and audit together', async () => {
  const input = await fixture(), { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_finance_paid_occurrence') throw new Error('QA_FINANCE_ROOT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await PATCH(req(), input.context)).status, 500); } finally { hook.mock.restore(); }
  assert.equal((await input.finance.get()).data()?.status, 'pendente');
  assert.equal((await input.lead.collection('events').get()).size, 0);
});

test('payment commit preserves its stage decision and pending stage automation before any consumer', async () => {
  const input = await interruptedPayment();
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
  const roots = await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).where('type', '==', 'crm_finance_stage_transition').get();
  assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().status, 'ready');
  const source = `stage-recovery-${randomUUID().slice(0, 8)}`;
  await input.lead.update({ origem: source });
  await adminDb.collection('automations').doc(`${input.lead.id}_stage`).set({ tenantId, name: 'Acompanhar etapa financeira ficticia', enabled: true, status: 'active',
    trigger: 'lead_stage_changed', conditions: { sourceIn: [source] }, actions: [{ type: 'create_task', title: 'Conferir pedido ficticio' }] });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await roots.docs[0].ref.get()).data()?.status, 'done');
  const tasks = await causalTasks(input.lead.id);
  assert.equal(tasks.docs.filter(task => task.data().stageSourceKind === 'financeStage').length, 1);
  assert.equal(tasks.docs.filter(task => task.data().stageSourceKind === 'finance').length, 1);
  await processPendingAutomationActions({ tenantId }); assert.equal((await causalTasks(input.lead.id)).size, tasks.size);
});

async function stageRootFor(input: Awaited<ReturnType<typeof fixture>>) {
  const rows = await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('leadId', '==', input.lead.id).where('type', '==', 'crm_finance_stage_transition').get();
  assert.equal(rows.size, 1); return rows.docs[0].ref;
}
async function stageAutomation(input: Awaited<ReturnType<typeof fixture>>) {
  const source = `stage-${randomUUID().slice(0, 8)}`;
  await input.lead.update({ origem: source });
  await adminDb.collection('automations').doc(`${input.lead.id}_stage`).set({ tenantId, name: 'Etapa financeira ficticia', enabled: true, status: 'active', trigger: 'lead_stage_changed', conditions: { sourceIn: [source] }, actions: [{ type: 'create_task', title: 'Acompanhar entrega ficticia' }] });
}

async function interruptedFinancialHook(hook: "learning" | "trail" = "trail") {
  const input = await interruptedPayment(), root = await stageRootFor(input); await stageAutomation(input);
  await loseStageHookAcknowledgement(adminDb, hook === "learning" ? "ai_learning_outcomes" : "lead_conversion_trails", () => processFinanceStageTransition(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready");
  const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get();
  assert.equal((await tasks()).size, 1);
  return { input, root, tasks };
}
for (const hook of ["learning", "trail"] as const) test(`financial ${hook} hook resumes while preserving the confirmed stage action`, async () => {
  const { input, root, tasks } = await interruptedFinancialHook(hook);
  await processFinanceStageTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "done"); assert.equal((await tasks()).size, 1);
  const trails = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).get();
  assert.equal(trails.size, 1); assert.equal(trails.docs[0].data().occurrences, 1);
});
for (const changed of ["none", "payment", "actor"] as const) test(`financial partial automation replays receipts with ${changed} authority change`, async () => {
  const input = await interruptedPayment(), root = await stageRootFor(input); await stageAutomation(input);
  await adminDb.collection("automations").doc(`${input.lead.id}_stage`).update({ actions: [
    { type: "create_task", title: "Pagamento confirmado", sequenceOrder: 0 }, { type: "add_note", text: "Concluir acompanhamento", sequenceOrder: 1 },
  ] });
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processFinanceStageTransition(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready"); assert.equal((await root.get()).data()?.stageRunRecoveryProtocol, 2);
  const staged = () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get();
  assert.equal((await staged()).size, 1); const task = (await staged()).docs[0]; await task.ref.update({ title: "Revisada pelo humano" });
  if (changed === "payment") await input.finance.update({ status: "cancelado" });
  if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
  try {
    await processFinanceStageTransition(root.id, tenantId);
    assert.equal((await root.get()).data()?.status, changed === "none" ? "done" : "reconciliation_required");
    assert.equal((await staged()).size, 1); assert.equal((await task.ref.get()).data()?.title, "Revisada pelo humano");
    const notes = await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).get();
    assert.equal(notes.size, changed === "none" ? 1 : 0);
  } finally { if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
});
for (const changed of ["payment", "actor", "receipt", "progress", "expired"] as const) test(`financial partial hook handles ${changed} with its own payment authority`, async () => {
  const { input, root, tasks } = await interruptedFinancialHook();
  const { FieldValue } = await import("firebase-admin/firestore");
  if (changed === "payment") await input.finance.update({ status: "cancelado" });
  if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: [] });
  if (changed === "receipt") await root.update({ stageConversionTrailReceipt: FieldValue.delete() });
  if (changed === "progress") await root.update({ stageHookProgress: FieldValue.delete() });
  if (changed === "expired") {
    await (await tasks()).docs[0].ref.update({ title: "Conferida pelo humano" });
    await root.update({ status: "processing", leaseUntil: new Date(0), claimToken: "lost-financial-owner" });
  }
  try {
    await Promise.all([processFinanceStageTransition(root.id, tenantId), processFinanceStageTransition(root.id, tenantId)]);
    assert.equal((await root.get()).data()?.status, changed === "expired" ? "done" : "reconciliation_required");
    assert.equal((await tasks()).size, 1);
    if (changed === "expired") assert.equal((await tasks()).docs[0].data().title, "Conferida pelo humano");
    const trails = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).get();
    assert.equal(trails.docs[0].data().occurrences, 1);
  } finally { if (changed === "actor") await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).update({ capabilities: ["manage_commercial"] }); }
});

for (const changed of ['human_stage', 'pipeline', 'payment', 'actor', 'audit'] as const) {
  test(`financial stage hooks reject changed ${changed} while preserving the current customer`, async () => {
    const input = await interruptedPayment(), root = await stageRootFor(input);
    await stageAutomation(input);
    if (changed === 'human_stage') await input.lead.update({ pipelineStage: 'escolha', stage: 'escolha', 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true, actorId: uid, transitionId: 'qa-human-correction' } });
    if (changed === 'pipeline') await adminDb.collection('pipeline').doc(tenantId).update({ stages: [{ id: 'captado', label: 'Entrada nova' }, { id: 'escolha', label: 'Escolhendo' }, { id: 'ganho', label: 'Conclusao nova', isTerminal: true }] });
    if (changed === 'payment') await input.finance.update({ status: 'cancelado' });
    if (changed === 'actor') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: [] });
    if (changed === 'audit') await input.lead.collection('events').doc(root.id).update({ previousStage: 'etapa_forjada' });
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId });
      assert.equal((await root.get()).data()?.status, 'reconciliation_required');
      const tasks = await causalTasks(input.lead.id);
      assert.equal(tasks.docs.filter(task => task.data().stageSourceId === root.id).length, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
      if (changed === 'human_stage') assert.equal((await input.lead.get()).data()?.pipelineStage, 'escolha');
    } finally {
      if (changed === 'actor') await adminDb.collection('tenant_users').doc(`${tenantId}_${uid}`).update({ capabilities: ['manage_commercial'] });
      if (changed === 'pipeline') await adminDb.collection('pipeline').doc(tenantId).update({ stages: [{ id: 'captado', label: 'Entrada' }, { id: 'escolha', label: 'Escolhendo' }, { id: 'ganho', label: 'Concluido', isTerminal: true }] });
    }
  });
}

test('payment preserves a previously locked human stage and still registers its separate paid automation', async () => {
  const input = await fixture();
  await input.lead.update({ pipelineStage: 'escolha', stage: 'escolha', 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true, actorId: uid, transitionId: 'qa-human-original' } });
  const before = await input.lead.get();
  assert.equal((await PATCH(req(), input.context)).status, 200);
  const root = await stageRootFor(input);
  assert.equal((await root.get()).data()?.outcome, 'blocked_manual'); assert.equal((await root.get()).data()?.status, 'done');
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await causalTasks(input.lead.id)).size, 1);
});

test('a legacy v1 financial stage task with lost acknowledgement is quarantined rather than replayed', async () => {
  const input = await interruptedPayment(), root = await stageRootFor(input);
  await stageAutomation(input);
  await freezeLegacyStageRecipe(adminDb, root, "financeStage", `${input.lead.id}_stage`);
  const original = adminDb.runTransaction; let interrupted = false;
  const hook = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!interrupted && !(await adminDb.collection('jobs').where('tenantId', '==', tenantId).where('stageSourceId', '==', root.id).get()).empty) { interrupted = true; throw new Error('QA_FINANCE_STAGE_EFFECT_ACK_LOST'); }
    return result;
  });
  try { await processPendingAutomationActions({ tenantId }); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true); assert.equal((await root.get()).data()?.status, 'reconciliation_required');
  const tasks = () => adminDb.collection('lead_tasks').where('tenantId', '==', tenantId).where('stageSourceId', '==', root.id).get();
  assert.equal((await tasks()).size, 1);
  await processPendingAutomationActions({ tenantId }); assert.equal((await tasks()).size, 1);
});

for (const changed of ["none", "payment", "progress", "expired"] as const) test(`causal receipt recovery finance ${changed}`, async () => {
  const input = await interruptedPayment(), root = await rootFor(input);
  const { processFinancePaidOccurrence } = await import("../lib/server/crm/finance-paid-occurrence.ts");
  await adminDb.collection("automations").doc(`${tenantId}_auto`).update({ actions: [{ type: "create_task", title: "Tarefa original", sequenceOrder: 1 }, { type: "add_note", text: "Nota restante", sequenceOrder: 2 }] });
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processFinancePaidOccurrence(root.id, tenantId));
  const before = (await root.get()).data()!, originalTask = (await causalTasks(input.lead.id)).docs;
  assert.equal(originalTask.length, 1); await originalTask[0].ref.update({ title: "Edicao humana" });
  if (changed === "payment") await input.finance.update({ status: "cancelado" });
  if (changed === "progress") { const { FieldValue } = await import("firebase-admin/firestore"); await root.update({ stageHookProgress: FieldValue.delete() }); }
  if (changed === "expired") await root.update({ status: "processing", claimToken: "qa-old-finance", leaseUntil: new Date(0) });
  await Promise.all([processFinancePaidOccurrence(root.id, tenantId), processFinancePaidOccurrence(root.id, tenantId)]);
  const recover = changed === "none" || changed === "expired", final = (await root.get()).data()!;
  assert.equal(final.status, recover ? "done" : "reconciliation_required");
  if (recover) assert.deepEqual(final.stageHookProgress.steps.map((step: { name: string }) => step.name), ["automations"]);
  assert.equal((await causalTasks(input.lead.id)).size, 1); assert.equal((await originalTask[0].ref.get()).data()?.title, "Edicao humana");
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.lead.id).get()).size, recover ? 1 : 0);
  assert.deepEqual(final.stageUsageReservations, before.stageUsageReservations);
});
