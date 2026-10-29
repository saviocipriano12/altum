import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import * as nodeModule from "node:module";
import type { ResolveFnOutput, ResolveHookContext } from "node:module";
const { registerHooks } = nodeModule as typeof nodeModule & {
  registerHooks(hooks: { resolve(specifier: string, context: ResolveHookContext,
    nextResolve: (specifier: string, context?: Partial<ResolveHookContext>) => ResolveFnOutput): ResolveFnOutput }): { deregister(): void };
};
// Match the Next server marker; authentication and billing remain real handlers.
const serverMarker = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") return { url: new URL("../node_modules/next/dist/compiled/server-only/empty.js", import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", ASAAS_WEBHOOK_TOKEN: "qa-fictitious-asaas-webhook-only" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { POST } = await import("../app/api/webhooks/asaas/route.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenants: string[] = [], ledgers: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => { const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "All real payment/provider transport forbidden in Asaas occurrence QA"); return originalFetch(url, init); };
after(async () => {
  serverMarker.deregister();
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) {
    for (const collection of ["asaas_checkouts", "leads", "financeiro", "jobs", "lead_tasks", "lead_notes", "automations", "pipeline", "tenant_settings", "tenant_entitlements", "tenants", "tenant_usage_monthly", "audit_logs", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails"]) for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
    await adminDb.collection('client_contracts').doc(tenantId).delete();
    await adminDb.collection('tenants').doc(tenantId).delete();
    await adminDb.collection('tenant_settings').doc(tenantId).delete();
  }
  for (const id of ledgers) await adminDb.collection('asaas_webhook_events_internal').doc(id).delete();
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_asaas_paid_${randomUUID()}`, chargeId = `${tenantId}_charge`; tenants.push(tenantId);
  const lead = adminDb.collection('leads').doc(`${tenantId}_lead`), finance = adminDb.collection('financeiro').doc(`${tenantId}_finance`);
  await adminDb.collection('tenants').doc(tenantId).set({ tenantId, status: 'active', billingStatus: 'active' });
  await adminDb.collection('tenant_entitlements').doc(tenantId).set({ tenantId, mode: 'custom', modules: { crm: true }, limits: {} });
  await adminDb.collection('pipeline').doc(tenantId).set({ tenantId, stages: [{ id: 'captado', label: 'Entrada' }, { id: 'escolha', label: 'Escolhendo' }, { id: 'ganho', label: 'Concluido', isTerminal: true }] });
  await lead.set({ tenantId, nome: 'Cliente ficticio Shopify', asaasChargeId: chargeId, pipelineStage: 'captado', stage: 'captado' });
  await finance.set({ tenantId, leadId: lead.id, asaasChargeId: chargeId, status: 'pendente', valor: 100 });
  await adminDb.collection('automations').doc(`${tenantId}_auto`).set({ tenantId, name: 'Conferir pagamento ficticio', enabled: true, status: 'active', trigger: 'finance_paid', conditions: {}, actions: [{ type: 'create_task', title: 'Acompanhar cliente ficticio' }] });
  const body = { id: `evt_${randomUUID()}`, event: 'PAYMENT_RECEIVED', dateCreated: new Date().toISOString(), payment: { id: chargeId, status: 'RECEIVED', value: 100, billingType: 'PIX' } };
  const ledgerId = createHash('sha256').update(body.id).digest('hex'); ledgers.push(ledgerId);
  return { tenantId, chargeId, lead, finance, body, ledger: adminDb.collection('asaas_webhook_events_internal').doc(ledgerId) };
}
function request(body: unknown, authenticated = true) { return new Request('http://127.0.0.1/qa-asaas', { method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { 'asaas-access-token': 'qa-fictitious-asaas-webhook-only' } : {}) }, body: JSON.stringify(body) }); }
async function interrupted() {
  const input = await fixture(), { DocumentReference } = await import('firebase-admin/firestore'), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
  let lost = false;
  const sets = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
    const result = await Reflect.apply(originalSet, this, args);
    if (!lost && this.path === input.finance.path) { lost = true; throw new Error('QA_ASAAS_FINANCE_ACK_LOST'); }
    return result;
  });
  const txs = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
    const result = await Reflect.apply(originalTx, this, args);
    if (!lost && result && typeof result === 'object' && 'financePaidOccurrenceId' in result && result.financePaidOccurrenceId) { lost = true; throw new Error('QA_ASAAS_FINANCE_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
  assert.equal(lost, true); assert.equal((await input.finance.get()).data()?.status, 'pago');
  return input;
}
test('verified Asaas invoice survives lost payment commit acknowledgement, provider retry and periodic recovery', async () => {
  const input = await interrupted();
  const retry = await POST(request(input.body)); assert.equal(retry.status, 200, await retry.clone().text());
  await processPendingAutomationActions({ tenantId: input.tenantId });
  const tasks = () => adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).where('leadId', '==', input.lead.id).where('source', '==', 'tenant_automation').get();
  assert.equal((await tasks()).size, 1);
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
  assert.equal((await POST(request(input.body))).status, 200);
  await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasks()).size, 1);
});

for (const billing of ['contract', 'subscription'] as const) {
  test(`billing ${billing} with a lead recovers its real notification after a lost payment acknowledgement`, async () => {
    const input = await fixture();
    if (billing === 'contract') await input.finance.update({ contractAutoBilling: true });
    else {
      const subscription = `qa_sub_${randomUUID()}`;
      await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscription });
      Object.assign(input.body.payment, { subscription, externalReference: `altum:${input.tenantId}:operacao` });
    }
    const { DocumentReference } = await import('firebase-admin/firestore'), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
    let lost = false;
    const sets = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
      const result = await Reflect.apply(originalSet, this, args);
      if (!lost && this.path === input.finance.path) { lost = true; throw new Error('QA_BILLING_FINANCE_ACK_LOST'); }
      return result;
    });
    const txs = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
      const result = await Reflect.apply(originalTx, this, args);
      if (!lost && result && typeof result === 'object' && 'financePaidOccurrenceId' in result && result.financePaidOccurrenceId) { lost = true; throw new Error('QA_BILLING_FINANCE_ACK_LOST'); }
      return result;
    });
    try { assert.equal((await POST(request(input.body))).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
    assert.equal(lost, true); assert.equal((await input.finance.get()).data()?.status, 'pago');
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    const tasks = await adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).where('source', '==', 'tenant_automation').get();
    assert.equal(tasks.size, 1);
    const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'asaas_billing_paid_occurrence').get();
    assert.equal(roots.size, 1); assert.equal(tasks.docs[0].data().stageSourceId, roots.docs[0].id);
    assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).get()).size, 1);
  });
}

test('commercial customer payment cannot reactivate Altum billing or bypass paused company access', async () => {
  const input = await fixture();
  await adminDb.collection('tenants').doc(input.tenantId).update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'qa-human-billing-pause' });
  const before = await adminDb.collection('tenants').doc(input.tenantId).get();
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await input.finance.get()).data()?.status, 'pago');
  const after = await adminDb.collection('tenants').doc(input.tenantId).get();
  assert.equal(after.data()?.status, 'blocked'); assert.ok(after.updateTime!.isEqual(before.updateTime!));
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'captado');
  assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).get()).size, 0);
});

const tasksFor = (input: Awaited<ReturnType<typeof fixture>>) => adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).where('leadId', '==', input.lead.id).where('source', '==', 'tenant_automation').get();
const rootFor = async (input: Awaited<ReturnType<typeof fixture>>, type = 'crm_finance_paid_occurrence') => {
  const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', type).get();
  assert.equal(roots.size, 1); return roots.docs[0].ref;
};

async function waitingAfterLedger(billing?: 'contract' | 'subscription') {
  const input = await fixture(), { DocumentReference } = await import('firebase-admin/firestore'), original = DocumentReference.prototype.set;
  if (billing === 'contract') await input.finance.update({ contractAutoBilling: true });
  if (billing === 'subscription') {
    const subscription = `qa_sub_${randomUUID()}`;
    await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscription });
    Object.assign(input.body.payment, { subscription, externalReference: `altum:${input.tenantId}:operacao` });
  }
  let lost = false;
  const hook = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const data = args[0] as FirebaseFirestore.DocumentData;
    if (this.path === input.ledger.path && lost && data.status === 'failed') throw new Error('QA_LEDGER_ERROR_WRITE_UNAVAILABLE');
    const result = await Reflect.apply(original, this, args);
    if (this.path === input.ledger.path && data.status === 'completed' && !lost) { lost = true; throw new Error('QA_ASAAS_LEDGER_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.equal(lost, true); assert.equal((await input.ledger.get()).data()?.status, 'completed');
  const root = await rootFor(input, billing ? 'asaas_billing_paid_occurrence' : undefined); assert.equal((await root.get()).data()?.status, 'ready');
  assert.equal((await tasksFor(input)).size, 0);
  return { ...input, root };
}

for (const revocation of ['purpose', 'type', 'binding', 'subscription', 'billing_flag', 'amount', 'module', 'tenant', 'credential'] as const) {
  test(`pending platform billing notification rejects ${revocation} changes`, async () => {
    const input = await waitingAfterLedger('subscription'), originalToken = process.env.ASAAS_WEBHOOK_TOKEN;
    try {
      if (revocation === 'purpose') await input.root.update({ paymentPurpose: 'commercial' });
      if (revocation === 'type') await input.root.update({ type: 'crm_finance_paid_occurrence' });
      if (revocation === 'binding') await input.ledger.update({ 'billingBinding.financeId': 'another_invoice' });
      if (revocation === 'subscription') await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: 'another_subscription' });
      if (revocation === 'billing_flag') await input.finance.update({ contractAutoBilling: true });
      if (revocation === 'amount') await input.finance.update({ valor: 120 });
      if (revocation === 'module') await adminDb.collection('tenant_entitlements').doc(input.tenantId).update({ 'modules.crm': false });
      if (revocation === 'tenant') await input.lead.update({ tenantId: `${input.tenantId}_other` });
      if (revocation === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-rotated-fictitious-token';
      const before = await input.lead.get();
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await tasksFor(input)).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { process.env.ASAAS_WEBHOOK_TOKEN = originalToken; }
  });
}

for (const billing of ['contract', 'subscription'] as const) {
  test(`newer ${billing} reversal fences a pending notification and a genuinely newer payment gets one new receipt`, async () => {
    const input = await waitingAfterLedger(billing);
    const reversal = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(), payment: { ...input.body.payment, status: 'REFUNDED' } };
    ledgers.push(createHash('sha256').update(reversal.id).digest('hex'));
    assert.equal((await POST(request(reversal))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await input.finance.get()).data()?.status, 'cancelado'); assert.equal((await tasksFor(input)).size, 0);
    assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
    if (billing === 'subscription') {
      const tenant = adminDb.collection('tenants').doc(input.tenantId), paused = (await tenant.get()).data()!;
      assert.equal(paused.status, 'blocked'); assert.equal(paused.billingStatus, 'cancelled');
      // A new paid event cannot revoke cancellation. Resume explicitly before
      // exercising a subsequent authorized financial notification.
      await tenant.update({ status: 'active', billingStatus: 'active', blockedReason: null });
    }
    const newer = { ...input.body, id: `evt_${randomUUID()}`, dateCreated: new Date(Date.parse(input.body.dateCreated) + 2000).toISOString() };
    ledgers.push(createHash('sha256').update(newer.id).digest('hex'));
    assert.equal((await POST(request(newer))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await input.finance.get()).data()?.status, 'pago'); assert.equal((await tasksFor(input)).size, 1);
  });
}

test('incomplete provider ledger leaves committed work ready until the same event completes', async () => {
  const input = await interrupted(), root = await rootFor(input);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await root.get()).data()?.status, 'ready'); assert.equal((await root.get()).data()?.attempts, 0);
  assert.equal((await tasksFor(input)).size, 0);
  assert.equal((await POST(request(input.body))).status, 200);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await tasksFor(input)).size, 1);
});

for (const change of ['commercial_to_billing', 'billing_to_commercial'] as const) {
  test(`a repeated paid fact cannot change its purpose from ${change} and release the old notification`, async () => {
    const input = await waitingAfterLedger(change === 'billing_to_commercial' ? 'contract' : undefined);
    if (change === 'billing_to_commercial') await input.finance.update({ contractAutoBilling: false });
    const body = { ...input.body, id: `evt_${randomUUID()}`, dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(),
      payment: { ...input.body.payment, ...(change === 'commercial_to_billing' ? { externalReference: `altum:${input.tenantId}:operacao` } : {}) } };
    ledgers.push(createHash('sha256').update(body.id).digest('hex'));
    assert.equal((await POST(request(body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await tasksFor(input)).size, 0);
    assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
    const cursor = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'asaas_commercial_payment_cursor').get();
    assert.equal(cursor.size, 1); assert.equal(cursor.docs[0].data().reconciliationReason, 'payment_purpose_changed');
  });
}

test('lost ledger acknowledgement is recovered by periodic processing without another payment mutation', async () => {
  const input = await waitingAfterLedger(), before = await input.finance.get();
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await input.root.get()).data()?.status, 'done'); assert.equal((await tasksFor(input)).size, 1);
  assert.ok((await input.finance.get()).updateTime!.isEqual(before.updateTime!));
});

for (const invalid of ['authentication', 'amount', 'missing_amount', 'ambiguous_invoice', 'foreign_customer'] as const) {
  test(`provider ${invalid} cannot authorize a paid commercial mutation`, async () => {
    const input = await fixture(), body = structuredClone(input.body);
    if (invalid === 'amount') body.payment.value = 200;
    if (invalid === 'missing_amount') Object.assign(body.payment, { value: null });
    if (invalid === 'ambiguous_invoice') await adminDb.collection('financeiro').doc(`${input.finance.id}_duplicate`).set((await input.finance.get()).data()!);
    if (invalid === 'foreign_customer') await input.lead.update({ tenantId: `${input.tenantId}_foreign` });
    const before = await input.finance.get();
    try {
      const response = await POST(request(body, invalid !== 'authentication'));
      assert.equal(response.status, invalid === 'authentication' ? 401 : 500);
      assert.ok((await input.finance.get()).updateTime!.isEqual(before.updateTime!));
      assert.equal((await input.finance.get()).data()?.status, 'pendente');
      assert.equal((await tasksFor(input)).size, 0);
    } finally { if (invalid === 'foreign_customer') await input.lead.update({ tenantId: input.tenantId }); }
  });
}

for (const revoked of ['ledger', 'proof_content', 'amount', 'module', 'credential', 'authority'] as const) {
  test(`pending Asaas effects reject ${revoked} revocation`, async () => {
    const input = await waitingAfterLedger();
    if (revoked === 'ledger') await input.ledger.update({ 'commercialPayment.fingerprint': 'qa-forged-proof' });
    if (revoked === 'proof_content') await input.ledger.update({ 'commercialPayment.method': 'QA_ALTERED_METHOD' });
    if (revoked === 'amount') await input.finance.update({ valor: 200 });
    if (revoked === 'module') await adminDb.collection('tenant_entitlements').doc(input.tenantId).update({ 'modules.crm': false });
    if (revoked === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-rotated-authorization';
    if (revoked === 'authority') await input.root.update({ authority: 'tenant_actor' });
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await tasksFor(input)).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { if (revoked === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-fictitious-asaas-webhook-only'; }
  });
}

test('distinct confirmations of one charge preserve one payment receipt and its original date', async () => {
  const input = await fixture(); assert.equal((await POST(request(input.body))).status, 200);
  const first = (await input.finance.get()).data()!;
  const second = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_CONFIRMED', payment: { ...input.body.payment, status: 'CONFIRMED' } };
  ledgers.push(createHash('sha256').update(second.id).digest('hex'));
  assert.equal((await POST(request(second))).status, 200);
  assert.equal((await rootFor(input)).id, first.paidOccurrenceId);
  assert.ok((await input.finance.get()).data()!.dataPagamento.isEqual(first.dataPagamento));
  assert.equal((await tasksFor(input)).size, 1);
});

test('changed content cannot reuse a completed provider event or downgrade its ledger', async () => {
  const input = await fixture(); assert.equal((await POST(request(input.body))).status, 200);
  const before = await input.ledger.get();
  assert.equal((await POST(request({ ...input.body, payment: { ...input.body.payment, value: 200 } }))).status, 500);
  assert.equal((await input.ledger.get()).data()?.status, 'completed');
  assert.ok((await input.ledger.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await tasksFor(input)).size, 1);
});

test('default business pipeline remains valid after a commercial confirmation', async () => {
  const input = await fixture(); await adminDb.collection('pipeline').doc(input.tenantId).delete();
  assert.equal((await POST(request(input.body))).status, 200);
  const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_stage_transition').get();
  assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().status, 'done');
  assert.equal((await tasksFor(input)).size, 1);
});

test('legacy paid invoice is not promoted into a newly authorized payment occurrence', async () => {
  const input = await fixture(); await input.finance.update({ status: 'pago' });
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_paid_occurrence').get()).size, 0);
  assert.equal((await tasksFor(input)).size, 0);
});

test('subscription lifecycle retains its existing billing behavior without commercial occurrences', async () => {
  const input = await fixture(), subscriptionId = `qa_sub_${randomUUID()}`;
  await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscriptionId });
  const body = { id: `evt_${randomUUID()}`, event: 'SUBSCRIPTION_INACTIVATED', subscription: { id: subscriptionId, externalReference: `altum:${input.tenantId}:operacao` } };
  ledgers.push(createHash('sha256').update(body.id).digest('hex'));
  assert.equal((await POST(request(body))).status, 200);
  assert.equal((await adminDb.collection('tenants').doc(input.tenantId).get()).data()?.billingStatus, 'cancelled');
  assert.equal((await input.finance.get()).data()?.status, 'pendente');
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_paid_occurrence').get()).size, 0);
});

test('expired platform checkout retains its existing close behavior without confirming a payment', async () => {
  const input = await fixture(), checkoutId = `qa_checkout_${randomUUID()}`;
  const checkout = adminDb.collection('asaas_checkouts').doc(checkoutId);
  await checkout.set({ tenantId: input.tenantId, status: 'active', planId: 'operacao' });
  const body = { id: `evt_${randomUUID()}`, event: 'CHECKOUT_EXPIRED', checkout: { id: checkoutId } };
  ledgers.push(createHash('sha256').update(body.id).digest('hex'));
  assert.equal((await POST(request(body))).status, 200);
  assert.equal((await checkout.get()).data()?.status, 'closed'); assert.equal((await input.finance.get()).data()?.status, 'pendente');
  assert.equal((await tasksFor(input)).size, 0);
});

test('verified platform subscription payment stays on its own billing flow instead of a commercial receipt', async () => {
  const input = await fixture(), subscriptionId = `qa_sub_${randomUUID()}`;
  await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscriptionId, status: 'blocked', billingStatus: 'blocked' });
  const body = { ...input.body, payment: { ...input.body.payment, subscription: subscriptionId, externalReference: `altum:${input.tenantId}:operacao` } };
  assert.equal((await POST(request(body))).status, 200);
  assert.equal((await adminDb.collection('tenants').doc(input.tenantId).get()).data()?.status, 'active');
  assert.equal((await input.finance.get()).data()?.status, 'pago');
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_paid_occurrence').get()).size, 0);
  assert.equal((await tasksFor(input)).size, 1, 'Preserve the legacy billing notification without inventing a commercial occurrence');
});

async function leadOnlyFixture() {
  const input = await fixture(); await input.finance.delete();
  const source = `leadpay-${randomUUID().slice(0, 8)}`;
  await input.lead.update({ lastChargeAmount: 100, origem: source });
  await adminDb.collection('automations').doc(`${input.tenantId}_stage_auto`).set({ tenantId: input.tenantId, name: 'Conferir compra ficticia', enabled: true, status: 'active', trigger: 'lead_stage_changed',
    conditions: { sourceIn: [source] }, actions: [{ type: 'create_task', title: 'Conferir entrega ficticia' }] });
  return input;
}
async function platformLeadOnlyFixture(subscription: boolean) {
  const input = await leadOnlyFixture();
  Object.assign(input.body.payment, { externalReference: `altum:${input.tenantId}:operacao` });
  if (subscription) {
    const subscriptionId = `qa_sub_${randomUUID()}`;
    await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscriptionId });
    Object.assign(input.body.payment, { subscription: subscriptionId });
  }
  return input;
}
async function unlinkedInvoiceFixture(kind: 'commercial' | 'contract' | 'platform') {
  const input = await leadOnlyFixture();
  await input.finance.set({ tenantId: input.tenantId, asaasChargeId: input.chargeId, status: 'pendente', valor: 100, ...(kind === 'contract' ? { contractAutoBilling: true } : {}) });
  if (kind === 'platform') {
    const subscription = `qa_sub_${randomUUID()}`;
    await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: subscription });
    Object.assign(input.body.payment, { subscription, externalReference: `altum:${input.tenantId}:operacao` });
  }
  return input;
}
for (const kind of ['commercial', 'contract', 'platform'] as const) {
  test(`unlinked ${kind} invoice binds its unique customer atomically and recovers stage effects without finance_paid`, async () => {
    const input = await unlinkedInvoiceFixture(kind), { DocumentReference } = await import('firebase-admin/firestore'), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
    let lost = false;
    const sets = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
      const result = await Reflect.apply(originalSet, this, args);
      if (!lost && this.path === input.finance.path) { lost = true; throw new Error('QA_UNLINKED_INVOICE_ACK_LOST'); }
      return result;
    });
    const txs = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
      const result = await Reflect.apply(originalTx, this, args);
      if (!lost && result && typeof result === 'object' && 'financePaidOccurrenceId' in result && result.financePaidOccurrenceId) { lost = true; throw new Error('QA_UNLINKED_INVOICE_ACK_LOST'); }
      return result;
    });
    try { assert.equal((await POST(request(input.body))).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
    assert.equal(lost, true); assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', kind === 'commercial' ? 'crm_finance_paid_occurrence' : 'asaas_billing_paid_occurrence').get();
    assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().paymentWorkflow, 'stage_only'); assert.equal(roots.docs[0].data().status, 'done');
    assert.equal((await input.finance.get()).data()?.leadId, input.lead.id);
    assert.equal((await input.finance.get()).data()?.paidWorkflow, 'stage_only');
    const tasks = await tasksFor(input); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, 'financeStage');
    assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 1);
  });
}
async function waitingUnlinkedInvoice() {
  const input = await unlinkedInvoiceFixture('commercial'), { DocumentReference } = await import('firebase-admin/firestore'), original = DocumentReference.prototype.set;
  let lost = false;
  const hook = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const data = args[0] as FirebaseFirestore.DocumentData;
    if (this.path === input.ledger.path && lost && data.status === 'failed') throw new Error('QA_UNLINKED_LEDGER_ERROR_WRITE_UNAVAILABLE');
    const result = await Reflect.apply(original, this, args);
    if (this.path === input.ledger.path && data.status === 'completed' && !lost) { lost = true; throw new Error('QA_UNLINKED_LEDGER_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.equal(lost, true);
  const parent = await rootFor(input), stage = adminDb.collection('jobs').doc(`${parent.id}_stage`);
  assert.equal((await parent.get()).data()?.status, 'done'); assert.equal((await stage.get()).data()?.status, 'ready');
  assert.equal((await tasksFor(input)).size, 0); return { ...input, parent, stage };
}
for (const change of ['workflow', 'customer', 'full_trigger', 'event_workflow', 'human_stage'] as const) {
  test(`pending unlinked invoice stage rejects ${change} changes and never acquires a finance_paid trigger`, async () => {
    const input = await waitingUnlinkedInvoice();
    if (change === 'workflow') await input.finance.update({ paidWorkflow: null });
    if (change === 'customer') await input.finance.update({ leadId: 'another_customer' });
    if (change === 'full_trigger') await input.parent.update({ status: 'ready' });
    if (change === 'event_workflow') { const row = (await input.parent.get()).data()!; await input.lead.collection('events').doc(row.sourceEventId).update({ paymentWorkflow: null }); }
    if (change === 'human_stage') await input.lead.update({ 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true } });
    const before = await input.lead.get();
    await processPendingAutomationActions({ tenantId: input.tenantId });
    if (change === 'full_trigger') {
      assert.equal((await input.parent.get()).data()?.status, 'reconciliation_required');
      const tasks = await tasksFor(input); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, 'financeStage');
    } else {
      assert.equal((await input.stage.get()).data()?.status, 'reconciliation_required'); assert.equal((await tasksFor(input)).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    }
  });
}
for (const kind of ['commercial', 'contract', 'platform'] as const) {
  test(`unlinked ${kind} invoice reversal establishes only the verified binding and keeps stage-only intent`, async () => {
    const input = await unlinkedInvoiceFixture(kind), refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(), payment: { ...input.body.payment, status: 'REFUNDED' } };
    ledgers.push(createHash('sha256').update(refund.id).digest('hex'));
    assert.equal((await POST(request(refund))).status, 200);
    assert.equal((await input.finance.get()).data()?.leadId, input.lead.id); assert.equal((await input.finance.get()).data()?.paidWorkflow, 'stage_only');
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.finance.get()).data()?.status, 'cancelado'); assert.equal((await tasksFor(input)).size, 0);
    if (kind === 'platform') await adminDb.collection('tenants').doc(input.tenantId).update({ status: 'active', billingStatus: 'active', blockedReason: null });
    const newer = { ...input.body, id: `evt_${randomUUID()}`, dateCreated: new Date(Date.parse(input.body.dateCreated) + 2000).toISOString() };
    ledgers.push(createHash('sha256').update(newer.id).digest('hex'));
    assert.equal((await POST(request(newer))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    const tasks = await tasksFor(input); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, 'financeStage');
  });
}
for (const invalid of ['customer_tenant', 'ambiguous_customer', 'legacy_paid', 'amount'] as const) {
  test(`unlinked invoice with ${invalid} cannot create an approved customer transition`, async () => {
    const input = await unlinkedInvoiceFixture('commercial'); let duplicate: FirebaseFirestore.DocumentReference | null = null;
    if (invalid === 'customer_tenant') await input.finance.update({ tenantId: `${input.tenantId}_other` });
    if (invalid === 'ambiguous_customer') { duplicate = adminDb.collection('leads').doc(`${input.tenantId}_other`); await duplicate.set({ tenantId: input.tenantId, asaasChargeId: input.chargeId }); }
    if (invalid === 'legacy_paid') await input.finance.update({ status: 'pago' });
    if (invalid === 'amount') input.body.payment.value = 200;
    const before = await input.finance.get(), leadBefore = await input.lead.get();
    try {
      assert.equal((await POST(request(input.body))).status, invalid === 'legacy_paid' ? 200 : 500);
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.ok((await input.finance.get()).updateTime!.isEqual(before.updateTime!));
      assert.ok((await input.lead.get()).updateTime!.isEqual(leadBefore.updateTime!)); assert.equal((await tasksFor(input)).size, 0);
      assert.equal((await input.finance.get()).data()?.leadId, undefined);
    } finally { if (duplicate) await duplicate.delete(); if (invalid === 'customer_tenant') await input.finance.update({ tenantId: input.tenantId }); }
  });
}
test('unlinked invoice occurrence failure rolls back customer association, payment, audits and stage', async () => {
  const input = await unlinkedInvoiceFixture('commercial'), { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const before = await input.finance.get(), leadBefore = await input.lead.get();
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_finance_paid_occurrence') throw new Error('QA_UNLINKED_OCCURRENCE_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.ok((await input.finance.get()).updateTime!.isEqual(before.updateTime!)); assert.ok((await input.lead.get()).updateTime!.isEqual(leadBefore.updateTime!));
  assert.equal((await input.lead.collection('events').get()).size, 0);
  assert.equal((await POST(request(input.body))).status, 200); await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 1);
});
for (const subscription of [false, true]) {
  test(`platform lead without a linked invoice survives interrupted CRM commit with subscription=${subscription}`, async () => {
    const input = await platformLeadOnlyFixture(subscription), { DocumentReference } = await import('firebase-admin/firestore'), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
    let lost = false;
    const sets = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
      const result = await Reflect.apply(originalSet, this, args);
      if (!lost && this.path === input.lead.path) { lost = true; throw new Error('QA_PLATFORM_LEAD_ACK_LOST'); }
      return result;
    });
    const txs = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
      const result = await Reflect.apply(originalTx, this, args);
      if (!lost && result && typeof result === 'object' && 'paymentObservationId' in result && result.paymentObservationId) { lost = true; throw new Error('QA_PLATFORM_LEAD_ACK_LOST'); }
      return result;
    });
    try { assert.equal((await POST(request(input.body))).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
    assert.equal(lost, true); assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago');
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_asaas_lead_payment').get();
    assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().authority, 'asaas_billing_lead_event');
    assert.equal(roots.docs[0].data().paymentPurpose, 'platform_billing'); assert.equal(roots.docs[0].data().financeId, null);
    const tasks = await tasksFor(input); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, 'financeStage');
    assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
    for (const type of ['crm_finance_paid_occurrence', 'asaas_billing_paid_occurrence']) assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', type).get()).size, 0);
    const before = await input.lead.get();
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 1);
    assert.ok((await input.lead.get()).data()?.asaasPaymentConfirmedAt?.isEqual(before.data()?.asaasPaymentConfirmedAt));
  });
}
async function interruptedLeadOnly() {
  const input = await leadOnlyFixture(), { DocumentReference } = await import('firebase-admin/firestore'), originalSet = DocumentReference.prototype.set, originalTx = adminDb.runTransaction;
  let lost = false;
  const sets = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof originalSet>) {
    const result = await Reflect.apply(originalSet, this, args);
    if (!lost && this.path === input.lead.path) { lost = true; throw new Error('QA_ASAAS_LEAD_COMMIT_ACK_LOST'); }
    return result;
  });
  const txs = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof originalTx>) {
    const result = await Reflect.apply(originalTx, this, args);
    if (!lost && result && typeof result === 'object' && 'paymentObservationId' in result && result.paymentObservationId) { lost = true; throw new Error('QA_ASAAS_LEAD_COMMIT_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { sets.mock.restore(); txs.mock.restore(); }
  assert.equal(lost, true); assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago');
  return input;
}

async function waitingPlatformLead() {
  const input = await platformLeadOnlyFixture(true), { DocumentReference } = await import('firebase-admin/firestore'), original = DocumentReference.prototype.set;
  let lost = false;
  const hook = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const data = args[0] as FirebaseFirestore.DocumentData;
    if (this.path === input.ledger.path && lost && data.status === 'failed') throw new Error('QA_PLATFORM_LEDGER_ERROR_WRITE_UNAVAILABLE');
    const result = await Reflect.apply(original, this, args);
    if (this.path === input.ledger.path && data.status === 'completed' && !lost) { lost = true; throw new Error('QA_PLATFORM_LEDGER_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.equal(lost, true); assert.equal((await input.ledger.get()).data()?.status, 'completed');
  const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_asaas_lead_payment').get();
  assert.equal(roots.size, 1);
  const stage = adminDb.collection('jobs').doc(`${roots.docs[0].id}_stage`);
  assert.equal((await stage.get()).data()?.status, 'ready'); assert.equal((await tasksFor(input)).size, 0);
  return { ...input, parent: roots.docs[0].ref, stage };
}

for (const change of ['subscription', 'binding', 'purpose', 'projection', 'linked_invoice', 'actual_amount', 'module', 'credential', 'customer_binding'] as const) {
  test(`pending platform lead stage rejects ${change} revocation`, async () => {
    const input = await waitingPlatformLead(), originalToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const projection = adminDb.collection('financeiro').doc(`asaas_subscription_${input.chargeId}`);
    let duplicate: FirebaseFirestore.DocumentReference | null = null;
    try {
      if (change === 'subscription') await adminDb.collection('tenants').doc(input.tenantId).update({ asaasSubscriptionId: 'different_subscription' });
      if (change === 'binding') await input.ledger.update({ 'billingLeadBinding.leadId': 'another_customer' });
      if (change === 'purpose') await input.parent.update({ authority: 'asaas_lead_event', paymentPurpose: null });
      if (change === 'projection') await projection.update({ valor: 200 });
      if (change === 'linked_invoice') await projection.update({ leadId: input.lead.id });
      if (change === 'actual_amount') await input.lead.update({ paymentValue: 200 });
      if (change === 'module') await adminDb.collection('tenant_entitlements').doc(input.tenantId).update({ 'modules.crm': false });
      if (change === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-platform-rotated-token';
      if (change === 'customer_binding') { duplicate = adminDb.collection('leads').doc(`${input.tenantId}_duplicate`); await duplicate.set({ tenantId: input.tenantId, asaasChargeId: input.chargeId }); }
      const before = await input.lead.get();
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await input.stage.get()).data()?.status, 'reconciliation_required'); assert.equal((await tasksFor(input)).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { process.env.ASAAS_WEBHOOK_TOKEN = originalToken; if (duplicate) await duplicate.delete(); }
  });
}

for (const subscription of [false, true]) {
  test(`platform lead records the verified platform amount without inventing a customer quote with subscription=${subscription}`, async () => {
    const input = await platformLeadOnlyFixture(subscription), { FieldValue } = await import('firebase-admin/firestore');
    await input.lead.update({ lastChargeAmount: FieldValue.delete() });
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await tasksFor(input)).size, 1);
    const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_asaas_lead_payment').get();
    assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().contractAmountField, 'platform_event');
    assert.equal(roots.docs[0].data().expectedAmountCents, 10000); assert.equal(roots.docs[0].data().financeId, null);
    assert.equal((await input.lead.get()).data()?.lastChargeAmount, undefined);
    for (const type of ['crm_finance_paid_occurrence', 'asaas_billing_paid_occurrence']) assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', type).get()).size, 0);
  });
  test(`platform lead reversal orders CRM facts and fences pending stage effects with subscription=${subscription}`, async () => {
    const input = await platformLeadOnlyFixture(subscription);
    const refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(), payment: { ...input.body.payment, status: 'REFUNDED' } };
    ledgers.push(createHash('sha256').update(refund.id).digest('hex'));
    assert.equal((await POST(request(refund))).status, 200);
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'cancelado'); assert.equal((await tasksFor(input)).size, 0);
    const tenant = adminDb.collection('tenants').doc(input.tenantId), paused = (await tenant.get()).data()!;
    assert.equal(paused.status, 'blocked'); assert.equal(paused.billingStatus, 'cancelled');
    assert.equal(paused.platformPlan, undefined, 'An absent legacy plan remains absent while billing is paused');
    // Explicit human resumption precedes a fresh paid event; neither the old
    // event nor the new CRM producer may release a cancelled subscription.
    await tenant.update({ status: 'active', billingStatus: 'active', blockedReason: null });
    const newer = { ...input.body, id: `evt_${randomUUID()}`, dateCreated: new Date(Date.parse(input.body.dateCreated) + 2000).toISOString() };
    ledgers.push(createHash('sha256').update(newer.id).digest('hex'));
    assert.equal((await POST(request(newer))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 1);
  });
}

test('a newer platform reversal invalidates a previously committed pending stage notification', async () => {
  const input = await waitingPlatformLead();
  const refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(), payment: { ...input.body.payment, status: 'REFUNDED' } };
  ledgers.push(createHash('sha256').update(refund.id).digest('hex'));
  assert.equal((await POST(request(refund))).status, 200);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await input.stage.get()).data()?.status, 'reconciliation_required'); assert.equal((await tasksFor(input)).size, 0);
});

for (const state of ['cancelled', 'refund_pending', 'cancelAtPeriodEnd', 'billingOperationPending', 'manual_pause'] as const) {
  test(`verified contract payment preserves ${state} human billing state atomically`, async () => {
    const input = await fixture(); await input.finance.update({ contractAutoBilling: true });
    const tenant = adminDb.collection('tenants').doc(input.tenantId);
    if (['cancelled', 'refund_pending'].includes(state)) await tenant.update({ status: 'blocked', billingStatus: state, blockedReason: 'qa-human-billing-state' });
    else if (state === 'manual_pause') await tenant.update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'manual_admin_block' });
    else await tenant.update({ [state]: true });
    const before = await tenant.get();
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.finance.get()).data()?.status, 'pago');
    assert.ok((await tenant.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', input.tenantId).where('type', '==', 'tenant_billing_reactivated').get()).size, 0);
  });
}

test('contract overdue recovery records one atomic reactivation receipt across two provider confirmations', async () => {
  const input = await fixture(); await input.finance.update({ contractAutoBilling: true });
  const tenant = adminDb.collection('tenants').doc(input.tenantId);
  await tenant.update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'billing_overdue' });
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await tenant.get()).data()?.status, 'active');
  const before = await tenant.get(), newer = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_CONFIRMED', dateCreated: new Date(Date.parse(input.body.dateCreated) + 1000).toISOString(), payment: { ...input.body.payment, status: 'CONFIRMED' } };
  ledgers.push(createHash('sha256').update(newer.id).digest('hex'));
  assert.equal((await POST(request(newer))).status, 200);
  assert.ok((await tenant.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', input.tenantId).where('type', '==', 'tenant_billing_reactivated').get()).size, 1);
});

test('contract reactivation write failure rolls back all access changes and provider retry recovers', async () => {
  const input = await fixture(); await input.finance.update({ contractAutoBilling: true });
  const tenant = adminDb.collection('tenants').doc(input.tenantId);
  await tenant.update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'billing_overdue' });
  const before = await tenant.get(), { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'tenant_billing_reactivated') throw new Error('QA_BILLING_REACTIVATION_RECEIPT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.ok((await tenant.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection('tenant_settings').doc(input.tenantId).get()).exists, false);
  assert.equal((await input.ledger.get()).data()?.status, 'failed');
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await tenant.get()).data()?.status, 'active');
  assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', input.tenantId).where('type', '==', 'tenant_billing_reactivated').get()).size, 1);
});

test('lost contract reactivation acknowledgement preserves its receipt and does not repeat access writes', async () => {
  const input = await fixture(); await input.finance.update({ contractAutoBilling: true });
  const tenant = adminDb.collection('tenants').doc(input.tenantId);
  await tenant.update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'billing_overdue' });
  const original = adminDb.runTransaction;
  let lost = false;
  const hook = mock.method(adminDb, 'runTransaction', async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!lost && result && typeof result === 'object' && 'reactivated' in result && result.reactivated) { lost = true; throw new Error('QA_BILLING_REACTIVATION_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.equal(lost, true); const before = await tenant.get(); assert.equal(before.data()?.status, 'active');
  assert.equal((await POST(request(input.body))).status, 200);
  assert.ok((await tenant.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', input.tenantId).where('type', '==', 'tenant_billing_reactivated').get()).size, 1);
});

for (const overdue of [false, true]) {
  test(`contract reactivation checks the full billing history beyond 200 rows with overdue=${overdue}`, async () => {
    const input = await fixture(); await input.finance.update({ contractAutoBilling: true });
    const tenant = adminDb.collection('tenants').doc(input.tenantId);
    await tenant.update({ status: 'blocked', billingStatus: 'blocked', blockedReason: 'billing_overdue' });
    const refs = Array.from({ length: 200 }, (_, index) => adminDb.collection('financeiro').doc(`${input.tenantId}_${index === 199 ? 'z' : 'a'}_${String(index).padStart(3, '0')}`));
    const batch = adminDb.batch();
    for (const [index, ref] of refs.entries()) batch.create(ref, { tenantId: input.tenantId, contractAutoBilling: true, status: overdue && index === 199 ? 'atrasado' : 'pago', valor: 100, contractDueDate: '2000-01-01' });
    await batch.commit();
    try {
      assert.equal((await POST(request(input.body))).status, 200);
      assert.equal((await tenant.get()).data()?.status, overdue ? 'blocked' : 'active');
      assert.equal((await adminDb.collection('audit_logs').where('tenantId', '==', input.tenantId).where('type', '==', 'tenant_billing_reactivated').get()).size, overdue ? 0 : 1);
    } finally { const cleanup = adminDb.batch(); for (const ref of refs) cleanup.delete(ref); await cleanup.commit(); }
  });
}

test('lead-only Asaas payment commits a recoverable stage decision without inventing a finance-paid event', async () => {
  const input = await interruptedLeadOnly();
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'ganho');
  const observations = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_asaas_lead_payment').get();
  assert.equal(observations.size, 1);
  assert.equal((await POST(request(input.body))).status, 200);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  const tasks = await tasksFor(input); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, 'financeStage');
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_paid_occurrence').get()).size, 0);
  assert.equal((await input.finance.get()).exists, false);
});

async function waitingLeadAfterLedger() {
  const input = await leadOnlyFixture(), { DocumentReference } = await import('firebase-admin/firestore'), original = DocumentReference.prototype.set;
  let lost = false;
  const hook = mock.method(DocumentReference.prototype, 'set', async function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    const data = args[0] as FirebaseFirestore.DocumentData;
    if (this.path === input.ledger.path && lost && data.status === 'failed') throw new Error('QA_LEAD_LEDGER_ERROR_WRITE_UNAVAILABLE');
    const result = await Reflect.apply(original, this, args);
    if (this.path === input.ledger.path && data.status === 'completed' && !lost) { lost = true; throw new Error('QA_LEAD_LEDGER_ACK_LOST'); }
    return result;
  });
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.equal(lost, true); assert.equal((await input.ledger.get()).data()?.status, 'completed');
  const rows = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_stage_transition').get();
  assert.equal(rows.size, 1); assert.equal(rows.docs[0].data().status, 'ready');
  return { ...input, root: rows.docs[0].ref };
}

test('lead-only completed ledger acknowledgement loss recovers its stage once', async () => {
  const input = await waitingLeadAfterLedger(), before = await input.lead.get();
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await input.root.get()).data()?.status, 'done'); assert.equal((await tasksFor(input)).size, 1);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 1);
});

for (const revoked of ['charge', 'contract_value', 'tenant', 'human_stage', 'ledger', 'invoice_added', 'module', 'credential', 'parent_authority'] as const) {
  test(`lead-only pending stage rejects ${revoked} revocation`, async () => {
    const input = await waitingLeadAfterLedger();
    if (revoked === 'charge') await input.lead.update({ asaasChargeId: 'qa_other_charge' });
    if (revoked === 'contract_value') await input.lead.update({ lastChargeAmount: 200 });
    if (revoked === 'tenant') await input.lead.update({ tenantId: `${input.tenantId}_foreign` });
    if (revoked === 'human_stage') await input.lead.update({ pipelineStage: 'escolha', stage: 'escolha', 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true, actorId: 'qa-human' } });
    if (revoked === 'ledger') await input.ledger.update({ 'commercialPayment.method': 'QA_TAMPERED' });
    if (revoked === 'invoice_added') await input.finance.set({ tenantId: input.tenantId, leadId: input.lead.id, asaasChargeId: input.chargeId, valor: 100, status: 'pendente' });
    if (revoked === 'module') await adminDb.collection('tenant_entitlements').doc(input.tenantId).update({ 'modules.crm': false });
    if (revoked === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-revoked-lead-authorization';
    if (revoked === 'parent_authority') await adminDb.collection('jobs').doc((await input.root.get()).data()!.financePaidOccurrenceId).update({ authority: 'tenant_actor' });
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await tasksFor(input)).size, 0); assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally {
      if (revoked === 'tenant') await input.lead.update({ tenantId: input.tenantId });
      if (revoked === 'credential') process.env.ASAAS_WEBHOOK_TOKEN = 'qa-fictitious-asaas-webhook-only';
    }
  });
}

for (const invalid of ['missing_contract', 'different_amount', 'ambiguous_customer'] as const) {
  test(`lead-only ${invalid} cannot create an automatic sale`, async () => {
    const input = await leadOnlyFixture();
    if (invalid === 'missing_contract') await input.lead.update({ lastChargeAmount: null });
    if (invalid === 'different_amount') input.body.payment.value = 200;
    if (invalid === 'ambiguous_customer') await adminDb.collection('leads').doc(`${input.lead.id}_duplicate`).set((await input.lead.get()).data()!);
    const before = await input.lead.get();
    assert.equal((await POST(request(input.body))).status, 500);
    assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await tasksFor(input)).size, 0);
  });
}

test('lead-only repeated confirmations preserve the original payment fact and do not invent finance records', async () => {
  const input = await leadOnlyFixture(); assert.equal((await POST(request(input.body))).status, 200);
  const first = (await input.lead.get()).data()!;
  const second = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_CONFIRMED', payment: { ...input.body.payment, status: 'CONFIRMED' } };
  ledgers.push(createHash('sha256').update(second.id).digest('hex'));
  assert.equal((await POST(request(second))).status, 200);
  const after = (await input.lead.get()).data()!;
  assert.equal(after.asaasPaymentOccurrenceId, first.asaasPaymentOccurrenceId); assert.ok(after.asaasPaymentConfirmedAt.isEqual(first.asaasPaymentConfirmedAt));
  assert.equal((await tasksFor(input)).size, 1); assert.equal((await input.finance.get()).exists, false);
});

test('lead-only payment preserves human stage and paused-company access', async () => {
  for (const blocked of ['human_stage', 'company_access'] as const) {
    const input = await leadOnlyFixture();
    if (blocked === 'human_stage') await input.lead.update({ pipelineStage: 'escolha', stage: 'escolha', 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true, actorId: 'qa-human' } });
    else await adminDb.collection('tenants').doc(input.tenantId).update({ status: 'blocked', billingStatus: 'blocked' });
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago');
    assert.equal((await input.lead.get()).data()?.pipelineStage, blocked === 'human_stage' ? 'escolha' : 'captado');
    assert.equal((await tasksFor(input)).size, 0);
    if (blocked === 'company_access') assert.equal((await adminDb.collection('tenants').doc(input.tenantId).get()).data()?.status, 'blocked');
  }
});

test('lead-only historical paid state does not acquire a new automation approval', async () => {
  const input = await leadOnlyFixture(); await input.lead.update({ paymentStatus: 'pago' });
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await input.lead.get()).data()?.pipelineStage, 'captado');
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_asaas_lead_payment').get()).size, 0);
  assert.equal((await tasksFor(input)).size, 0);
});

test('lead-only observation write rejection rolls back payment metadata and stage together', async () => {
  const input = await leadOnlyFixture(), { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_asaas_lead_payment') throw new Error('QA_LEAD_PAYMENT_RECEIPT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  const before = await input.lead.get();
  try { assert.equal((await POST(request(input.body))).status, 500); } finally { hook.mock.restore(); }
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await input.lead.collection('events').get()).size, 0);
});

for (const target of ['invoice', 'lead_only'] as const) {
  test(`commercial ordering keeps a newer reversal when an old paid event arrives for ${target}`, async () => {
    const input = target === 'invoice' ? await fixture() : await leadOnlyFixture();
    input.body.dateCreated = '2026-10-21T01:00:00.000Z';
    const refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: '2026-10-21T02:00:00.000Z', payment: { ...input.body.payment, status: 'REFUNDED' } };
    ledgers.push(createHash('sha256').update(refund.id).digest('hex'));
    assert.equal((await POST(request(refund))).status, 200);
    assert.equal((await POST(request(input.body))).status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    if (target === 'invoice') assert.equal((await input.finance.get()).data()?.status, 'cancelado');
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'cancelado');
    assert.equal((await input.lead.get()).data()?.pipelineStage, 'captado'); assert.equal((await tasksFor(input)).size, 0);
  });
}

async function commercialCursor(input: Awaited<ReturnType<typeof fixture>>) {
  const rows = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'asaas_commercial_payment_cursor').get();
  assert.equal(rows.size, 1); return rows.docs[0].ref;
}
async function orderedEvent(input: Awaited<ReturnType<typeof fixture>>, event: string, providerStatus: string, offsetMs: number | null, overrides: Record<string, unknown> = {}) {
  const body = { ...input.body, id: `evt_${randomUUID()}`, event, dateCreated: offsetMs === null ? '' : new Date(Date.parse(input.body.dateCreated) + offsetMs).toISOString(), payment: { ...input.body.payment, status: providerStatus, ...overrides } };
  ledgers.push(createHash('sha256').update(body.id).digest('hex'));
  const response = await POST(request(body));
  return { response, body };
}

for (const target of ['invoice', 'lead_only'] as const) {
  test(`commercial ordering ignores an old reversal after a newer payment for ${target}`, async () => {
    const input = target === 'invoice' ? await fixture() : await leadOnlyFixture();
    assert.equal((await POST(request(input.body))).status, 200);
    const first = target === 'invoice' ? await input.finance.get() : await input.lead.get();
    assert.equal((await orderedEvent(input, 'PAYMENT_REFUNDED', 'REFUNDED', -60_000)).response.status, 200);
    const after = target === 'invoice' ? await input.finance.get() : await input.lead.get();
    assert.ok(after.updateTime!.isEqual(first.updateTime!));
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago'); assert.equal((await tasksFor(input)).size, 1);
  });

  for (const scenario of ['same_time', 'missing_time', 'human_hold', 'price_context'] as const) {
    test(`commercial ordering holds ${scenario} before pending actions for ${target}`, async () => {
      const input = target === 'invoice' ? await waitingAfterLedger() : await waitingLeadAfterLedger();
      if (scenario === 'human_hold') {
        await (await commercialCursor(input)).update({ humanHold: true });
        assert.equal((await orderedEvent(input, 'PAYMENT_CONFIRMED', 'CONFIRMED', 60_000)).response.status, 200);
      } else if (scenario === 'price_context') {
        assert.equal((await orderedEvent(input, 'PAYMENT_CONFIRMED', 'CONFIRMED', 60_000, { billingType: 'BOLETO' })).response.status, 200);
      } else {
        assert.equal((await orderedEvent(input, 'PAYMENT_REFUNDED', 'REFUNDED', scenario === 'missing_time' ? null : 0)).response.status, 200);
      }
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await (await commercialCursor(input)).get()).data()?.status, 'reconciliation_required');
      assert.equal((await tasksFor(input)).size, 0);
      assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago', 'An unordered conflict cannot replace the last accepted fact');
    });
  }

  test(`commercial ordering revokes pending effects on a newer reversal for ${target}`, async () => {
    const input = target === 'invoice' ? await waitingAfterLedger() : await waitingLeadAfterLedger();
    assert.equal((await orderedEvent(input, 'PAYMENT_REFUNDED', 'REFUNDED', 60_000)).response.status, 200);
    await processPendingAutomationActions({ tenantId: input.tenantId });
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'cancelado'); assert.equal((await tasksFor(input)).size, 0);
    const pending = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_finance_stage_transition').get();
    assert.equal(pending.size, 1); assert.equal(pending.docs[0].data().status, 'reconciliation_required');
    if (target === 'invoice') assert.equal((await input.finance.get()).data()?.status, 'cancelado');
  });

  test(`commercial ordering preserves a newer pending restoration for ${target}`, async () => {
    const input = target === 'invoice' ? await fixture() : await leadOnlyFixture();
    assert.equal((await orderedEvent(input, 'PAYMENT_RESTORED', 'PENDING', 60_000)).response.status, 200);
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'pendente'); assert.equal((await tasksFor(input)).size, 0);
  });

  test(`commercial ordering admits a genuinely newer payment after reversal for ${target}`, async () => {
    const input = target === 'invoice' ? await fixture() : await leadOnlyFixture();
    assert.equal((await orderedEvent(input, 'PAYMENT_REFUNDED', 'REFUNDED', -60_000)).response.status, 200);
    assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await input.lead.get()).data()?.paymentStatus, 'pago'); assert.equal((await tasksFor(input)).size, 1);
    assert.equal((await (await commercialCursor(input)).get()).data()?.state, 'pago');
  });
}

test('commercial ordering preserves a human finance correction when the bank repeats the same fact', async () => {
  const input = await fixture(); assert.equal((await POST(request(input.body))).status, 200);
  await input.finance.update({ status: 'pendente', updatedBy: 'qa-human-financial-correction' });
  assert.equal((await orderedEvent(input, 'PAYMENT_CONFIRMED', 'CONFIRMED', 60_000)).response.status, 200);
  assert.equal((await input.finance.get()).data()?.status, 'pendente');
  assert.equal((await (await commercialCursor(input)).get()).data()?.status, 'reconciliation_required');
  assert.equal((await tasksFor(input)).size, 1);
});

test('commercial ordering detects reused event content without rewriting the ledger or authorizing queued work', async () => {
  const input = await waitingAfterLedger(), ledgerBefore = await input.ledger.get();
  assert.equal((await POST(request({ ...input.body, payment: { ...input.body.payment, value: 200 } }))).status, 500);
  assert.ok((await input.ledger.get()).updateTime!.isEqual(ledgerBefore.updateTime!));
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await tasksFor(input)).size, 0);
  assert.equal((await (await commercialCursor(input)).get()).data()?.reconciliationReason, 'provider_event_content_conflict');
});

test('commercial invoice cannot authorize an unrelated customer sharing the same provider charge', async () => {
  const input = await fixture();
  await adminDb.collection('leads').doc(`${input.lead.id}_other`).set({ tenantId: input.tenantId, asaasChargeId: input.chargeId, nome: 'Outro cliente ficticio', pipelineStage: 'captado' });
  const before = await input.finance.get();
  assert.equal((await POST(request(input.body))).status, 500);
  assert.ok((await input.finance.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await tasksFor(input)).size, 0);
});

test('commercial ordering supports the documented provider civil datetime without the server time zone', async () => {
  const input = await fixture(); input.body.dateCreated = '2026-10-21 16:45:03';
  const beforeTz = process.env.TZ;
  try {
    process.env.TZ = 'UTC'; assert.equal((await POST(request(input.body))).status, 200);
    process.env.TZ = 'America/Sao_Paulo'; assert.equal((await POST(request(input.body))).status, 200);
    assert.equal((await tasksFor(input)).size, 1);
    const refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: '2026-10-21 16:45:04', payment: { ...input.body.payment, status: 'REFUNDED' } };
    ledgers.push(createHash('sha256').update(refund.id).digest('hex')); assert.equal((await POST(request(refund))).status, 200);
    assert.equal((await input.finance.get()).data()?.status, 'cancelado');
  } finally { if (beforeTz === undefined) delete process.env.TZ; else process.env.TZ = beforeTz; }
});

test('commercial ordering holds incompatible clock domains instead of guessing the provider time zone', async () => {
  const input = await waitingAfterLedger();
  const refund = { ...input.body, id: `evt_${randomUUID()}`, event: 'PAYMENT_REFUNDED', dateCreated: '2026-10-21 16:45:03', payment: { ...input.body.payment, status: 'REFUNDED' } };
  ledgers.push(createHash('sha256').update(refund.id).digest('hex')); assert.equal((await POST(request(refund))).status, 200);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await (await commercialCursor(input)).get()).data()?.reconciliationReason, 'provider_clock_domain_changed');
  assert.equal((await tasksFor(input)).size, 0);
});

test('commercial ordering records an incomplete first clock without authorizing a sale', async () => {
  const input = await fixture(); input.body.dateCreated = '';
  assert.equal((await POST(request(input.body))).status, 200);
  assert.equal((await input.finance.get()).data()?.status, 'pendente'); assert.equal((await tasksFor(input)).size, 0);
  assert.equal((await (await commercialCursor(input)).get()).data()?.reconciliationReason, 'missing_provider_order');
});

test('commercial proof version changes require review without rewriting a completed ledger', async () => {
  const input = await waitingAfterLedger(); await input.ledger.update({ 'commercialPayment.protocol': 1 });
  const before = await input.ledger.get();
  assert.equal((await POST(request(input.body))).status, 500);
  assert.ok((await input.ledger.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await (await commercialCursor(input)).get()).data()?.reconciliationReason, 'legacy_proof_protocol_requires_review');
  await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasksFor(input)).size, 0);
});
