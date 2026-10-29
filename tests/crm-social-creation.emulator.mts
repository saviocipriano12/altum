import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const { resolveCanonicalSocialLead } = await import("../lib/server/social-lead-identity.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => { const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url); assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "Only local emulator transport in social creation QA"); return originalFetch(url, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "leads", "lead_identities", "tenant_channels", "pipeline", "tenant_entitlements", "automations", "jobs", "lead_tasks", "lead_notes", "tenant_usage_monthly", "ai_logs"]) for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  await adminDb.terminate();
});
async function fixture(channel: "instagram" | "messenger" = "instagram") {
  const tenantId = `qa_social_creation_${randomUUID()}`, channelId = `${tenantId}_channel`; tenants.push(tenantId);
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: channel, status: "active", externalAccountId: `${tenantId}_account` });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada", label: "Entrada" }, { id: "escolha", label: "Escolhendo" }, { id: "concluido", label: "Concluido", isTerminal: true }] });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, name: "Recepcao da loja ficticia", enabled: true, status: "active", trigger: "lead_created", conditions: {}, actions: [{ type: "create_task", title: "Receber cliente ficticio" }] });
  return { tenantId, channel, externalProfileId: `${tenantId}_profile`, creationWorkflow: { channelId, actorId: "meta_webhook", actorName: "Meta Webhook" },
    createData: { tenantId, channel, externalProfileId: `${tenantId}_profile`, sourceType: channel === "instagram" ? "instagram_dm" : "facebook_messenger", nome: "Cliente ficticio Shopify", pipelineStage: "entrada", stage: "entrada", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } };
}
for (const channel of ["instagram", "messenger"] as const) {
  test(`${channel} creation survives lost commit acknowledgement and retry through canonical identity`, async () => {
    const input = await fixture(channel), original = adminDb.runTransaction; let interrupted = false;
    const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
      const result = await Reflect.apply(original, this, args);
      if (!interrupted && result && typeof result === "object" && "created" in result && result.created === true && "leadRef" in result) { interrupted = true; throw new Error("QA_SOCIAL_CREATION_ACK_LOST"); }
      return result;
    });
    try { await assert.rejects(resolveCanonicalSocialLead(input), /QA_SOCIAL_CREATION_ACK_LOST/); } finally { hook.mock.restore(); }
    assert.equal(interrupted, true);
    const retry = await resolveCanonicalSocialLead(input); assert.equal(retry.created, false);
    await adminDb.collection("chats").doc(`${retry.leadRef.id}_chat`).set({ tenantId: input.tenantId, leadId: retry.leadRef.id, channelId: input.creationWorkflow.channelId, channel: input.channel, contactExternalId: input.externalProfileId });
    await processPendingAutomationActions({ tenantId: input.tenantId });
    const tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("leadId", "==", retry.leadRef.id).get();
    assert.equal((await tasks()).size, 1);
    await processPendingAutomationActions({ tenantId: input.tenantId }); assert.equal((await tasks()).size, 1);
  });
}

async function prepared() {
  const input = await fixture(), lead = await resolveCanonicalSocialLead(input);
  const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_lead_created_occurrence').get();
  assert.equal(roots.size, 1);
  const chat = adminDb.collection('chats').doc(`${lead.leadRef.id}_chat`);
  await chat.set({ tenantId: input.tenantId, leadId: lead.leadRef.id, channelId: input.creationWorkflow.channelId, channel: input.channel, contactExternalId: input.externalProfileId });
  return { input, lead: lead.leadRef, root: roots.docs[0].ref, chat };
}

test('social creation waits for its conversation before claiming and recovers once it exists', async () => {
  const input = await fixture(), lead = await resolveCanonicalSocialLead(input);
  const roots = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('leadId', '==', lead.leadRef.id).get();
  assert.equal(roots.size, 1);
  const waiting = await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal(waiting.intakeRecovery.failed, 1);
  assert.equal((await roots.docs[0].ref.get()).data()?.status, 'ready'); assert.equal((await roots.docs[0].ref.get()).data()?.attempts, 0);
  await adminDb.collection('chats').doc(`${lead.leadRef.id}_chat`).set({ tenantId: input.tenantId, leadId: lead.leadRef.id, channelId: input.creationWorkflow.channelId, channel: input.channel, contactExternalId: input.externalProfileId });
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await roots.docs[0].ref.get()).data()?.status, 'done');
});

test('history import without explicit live workflow cannot be promoted by later identity lookup', async () => {
  const input = await fixture(), history = { tenantId: input.tenantId, channel: input.channel, externalProfileId: input.externalProfileId, createData: input.createData };
  const first = await resolveCanonicalSocialLead(history); assert.equal(first.created, true);
  assert.equal((await resolveCanonicalSocialLead(input)).created, false);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('type', '==', 'crm_lead_created_occurrence').get()).size, 0);
  assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).get()).size, 0);
});

for (const revoked of ['channel', 'account', 'tenant', 'profile', 'human', 'authority', 'actor'] as const) {
  test(`pending social creation rejects changed ${revoked} without mutating the customer`, async () => {
    const input = await prepared(), channel = adminDb.collection('tenant_channels').doc(input.input.creationWorkflow.channelId);
    if (revoked === 'channel') await channel.update({ status: 'disconnected' });
    if (revoked === 'account') await channel.update({ externalAccountId: 'qa_other_account' });
    if (revoked === 'tenant') await channel.update({ tenantId: `${input.input.tenantId}_foreign` });
    if (revoked === 'profile') await input.chat.update({ contactExternalId: 'qa_other_profile' });
    if (revoked === 'actor') await input.root.update({ actorId: 'qa_forged_human' });
    if (revoked === 'human') await input.lead.update({ 'crmFieldOwnership.pipelineStage': { source: 'manual', locked: true, actorId: 'qa-human' } });
    if (revoked === 'authority') {
      await channel.update({ status: 'disconnected' }); await input.root.update({ creationAuthority: 'service' });
      await input.lead.collection('events').doc((await input.root.get()).data()!.sourceEventId).update({ creationAuthority: 'service' });
    }
    const before = await input.lead.get();
    try {
      await processPendingAutomationActions({ tenantId: input.input.tenantId });
      assert.equal((await input.root.get()).data()?.status, 'reconciliation_required');
      assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', input.input.tenantId).get()).size, 0);
      assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { if (revoked === 'tenant') await channel.update({ tenantId: input.input.tenantId }); }
  });
}

test('concurrent live social producers leave one creation audit, root and effect', async () => {
  const input = await fixture('messenger'), results = await Promise.all(Array.from({ length: 4 }, () => resolveCanonicalSocialLead(input)));
  assert.equal(results.filter(result => result.created).length, 1); assert.equal(new Set(results.map(result => result.leadRef.id)).size, 1);
  const lead = results[0].leadRef;
  await adminDb.collection('chats').doc(`${lead.id}_chat`).set({ tenantId: input.tenantId, leadId: lead.id, channelId: input.creationWorkflow.channelId, channel: input.channel, contactExternalId: input.externalProfileId });
  await Promise.all([processPendingAutomationActions({ tenantId: input.tenantId }), processPendingAutomationActions({ tenantId: input.tenantId })]);
  const events = await lead.collection('events').get();
  assert.equal(events.docs.filter(doc => doc.data().intakeCreated === true).length, 1);
  assert.equal(events.docs.filter(doc => doc.data().type === 'automation_task_created').length, 1);
  assert.equal(events.size, 2);
  assert.equal((await adminDb.collection('lead_tasks').where('tenantId', '==', input.tenantId).get()).size, 1);
});

test('social occurrence write rejection rolls back lead, identity and audit together', async () => {
  const input = await fixture(), { Transaction } = await import('firebase-admin/firestore'), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, 'create', function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as FirebaseFirestore.DocumentData).type === 'crm_lead_created_occurrence') throw new Error('QA_SOCIAL_ROOT_UNAVAILABLE');
    return Reflect.apply(original, this, args);
  });
  try { await assert.rejects(resolveCanonicalSocialLead(input), /QA_SOCIAL_ROOT_UNAVAILABLE/); } finally { hook.mock.restore(); }
  for (const collection of ['leads', 'lead_identities', 'jobs']) assert.equal((await adminDb.collection(collection).where('tenantId', '==', input.tenantId).get()).size, 0);
});
