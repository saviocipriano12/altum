import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { recordInboundLead } = await import("../lib/server/lead-intake.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { processIntakeCreation, processPendingIntakeCreations } = await import("../lib/server/crm/intake-occurrence.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "External transport blocked in intake occurrence QA");
  return originalFetch(url, init);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["chats", "tenant_channels", "chat_outbound_jobs", "chat_states", "leads", "lead_identities", "pipeline", "automations", "tenant_entitlements", "jobs", "lead_tasks", "lead_notes", "contacts", "contact_identity_aliases", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails", "tenant_usage_monthly"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_intake_occurrence_${randomUUID()}`; tenants.push(tenantId);
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada_loja", label: "Entrada" }, { id: "reserva", label: "Separado" }, { id: "finalizado", label: "Concluido", isTerminal: true }] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("automations").doc(`${tenantId}_auto`).set({ tenantId, name: "Recepcao da loja ficticia", enabled: true, status: "active", trigger: "lead_created",
    conditions: {}, actions: [{ type: "create_task", title: "Receber cliente ficticio" }] });
  return { tenantId, sourceType: "shopify_order", sourceId: `${tenantId}_entry`, sourceLabel: "Shopify QA", channel: "ecommerce", nome: "Cliente ficticio", email: `${randomUUID()}@qa.invalid` };
}

test("committed intake survives lost acknowledgement and repeated intake without losing or duplicating lead-created automation", async () => {
  const input = await fixture(), original = adminDb.runTransaction;
  let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    const committed = result as { created?: boolean; leadRef?: FirebaseFirestore.DocumentReference } | undefined;
    if (!interrupted && committed?.created && committed.leadRef) { interrupted = true; throw new Error("QA_INTAKE_COMMIT_ACK_LOST"); }
    return result;
  });
  try { await assert.rejects(recordInboundLead(input), /QA_INTAKE_COMMIT_ACK_LOST/); } finally { hook.mock.restore(); }
  assert.equal(interrupted, true);
  const result = await recordInboundLead(input); assert.equal(result.created, false);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  const causalTasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("source", "==", "tenant_automation").get();
  assert.equal((await causalTasks()).size, 1, "A committed creation must retain its pending automation after a crash");
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await causalTasks()).size, 1);
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", input.tenantId).get()).size, 1);
});

test("explicit intake workflow opt-out cannot be turned into an approval by a later replay", async () => {
  const input = await fixture();
  const first = await recordInboundLead({ ...input, skipLeadCreatedWorkflows: true }); assert.equal(first.created, true);
  assert.equal((await recordInboundLead(input)).created, false);
  await processPendingAutomationActions({ tenantId: input.tenantId });
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("source", "==", "tenant_automation").get()).size, 0);
});

async function commitOnly(input: Awaited<ReturnType<typeof fixture>>) {
  const original = adminDb.runTransaction;
  let stopped = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args), committed = result as { created?: boolean; leadRef?: FirebaseFirestore.DocumentReference } | undefined;
    if (!stopped && committed?.created && committed.leadRef) { stopped = true; throw new Error("QA_INTAKE_COMMIT_ACK_LOST"); }
    return result;
  });
  try { await assert.rejects(recordInboundLead(input), /QA_INTAKE_COMMIT_ACK_LOST/); } finally { hook.mock.restore(); }
  assert.equal(stopped, true);
  const leads = await adminDb.collection("leads").where("tenantId", "==", input.tenantId).where("email", "==", input.email).get();
  assert.equal(leads.size, 1);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", input.tenantId).where("leadId", "==", leads.docs[0].id).where("type", "==", "crm_lead_created_occurrence").get();
  assert.equal(jobs.size, 1);
  return { lead: leads.docs[0].ref, root: jobs.docs[0].ref };
}

test("normal intake registers its action and receipt once through the real producer", async () => {
  const input = await fixture(), created = await recordInboundLead(input);
  assert.equal(created.created, true);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", input.tenantId).where("type", "==", "crm_lead_created_occurrence").get();
  assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "done");
  const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("stageSourceId", "==", jobs.docs[0].id).get();
  assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().stageSourceKind, "intake");
  const event = await adminDb.collection("leads").doc(created.leadId).collection("events").doc(jobs.docs[0].data().sourceEventId).get();
  assert.equal(event.data()?.intakeCreated, true); assert.equal(event.data()?.intakeWorkflows, "enabled");
});

test("concurrent intake and consumers preserve one creation occurrence and one effect", async () => {
  const input = await fixture(), results = await Promise.all([recordInboundLead(input), recordInboundLead(input)]);
  assert.equal(results.filter(result => result.created).length, 1); assert.equal(results[0].leadId, results[1].leadId);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", input.tenantId).where("type", "==", "crm_lead_created_occurrence").get();
  assert.equal(jobs.size, 1);
  await Promise.all([processIntakeCreation(jobs.docs[0].id, input.tenantId), processIntakeCreation(jobs.docs[0].id, input.tenantId)]);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("stageSourceId", "==", jobs.docs[0].id).get()).size, 1);
});

test("failure to persist the creation occurrence rolls back contact, identity and audit together", async () => {
  const input = await fixture(), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.create;
  const hook = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    const data = args[1] as FirebaseFirestore.DocumentData;
    if (data.type === "crm_lead_created_occurrence") throw new Error("QA_INTAKE_ROOT_UNAVAILABLE");
    return Reflect.apply(original, this, args);
  });
  try { await assert.rejects(recordInboundLead(input), /QA_INTAKE_ROOT_UNAVAILABLE/); } finally { hook.mock.restore(); }
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", input.tenantId).get()).size, 0);
  assert.equal((await adminDb.collection("lead_identities").where("tenantId", "==", input.tenantId).get()).size, 0);
});

for (const revoked of ["event", "tenant", "creation_marker", "human_stage", "module"] as const) {
  test(`pending intake rejects ${revoked} revocation without changing the customer`, async () => {
    const input = await fixture(), { lead, root } = await commitOnly(input), row = (await root.get()).data()!;
    if (revoked === "event") await lead.collection("events").doc(row.sourceEventId).delete();
    if (revoked === "tenant") await lead.update({ tenantId: `${input.tenantId}_foreign` });
    if (revoked === "creation_marker") await lead.update({ intakeCreationEventId: "qa-other-event" });
    if (revoked === "human_stage") await lead.update({ "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: "qa-human" } });
    if (revoked === "module") await adminDb.collection("tenant_entitlements").doc(input.tenantId).update({ "modules.crm": false });
    const before = await lead.get();
    try {
      await processIntakeCreation(root.id, input.tenantId);
      assert.equal((await root.get()).data()?.status, "reconciliation_required");
      assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("source", "==", "tenant_automation").get()).size, 0);
      assert.ok((await lead.get()).updateTime!.isEqual(before.updateTime!));
    } finally { if (revoked === "tenant") await lead.update({ tenantId: input.tenantId }); }
  });
}

test("transient preclaim read failure leaves the creation pending without starving another occurrence", async () => {
  const input = await fixture(), failed = await commitOnly(input);
  const healthy = await commitOnly({ ...input, email: `${randomUUID()}@qa.invalid`, sourceId: `${input.sourceId}_other` });
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const hook = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === failed.lead.path) throw new Error("QA_INTAKE_READ_UNAVAILABLE");
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try { const result = await processPendingIntakeCreations({ tenantId: input.tenantId }); assert.equal(result.failed, 1); assert.equal(result.completed, 1); }
  finally { hook.mock.restore(); }
  assert.equal((await failed.root.get()).data()?.status, "ready"); assert.equal((await failed.root.get()).data()?.attempts, 0);
  assert.equal((await healthy.root.get()).data()?.status, "done");
});

for (const scenario of ['immediate', 'scheduled', 'revoked'] as const) {
  test(`intake ${scenario} message preserves its real trigger, delivery receipt and authorization`, async () => {
    const input = await fixture(), { lead, root } = await commitOnly(input);
    const chatId = `${lead.id}_chat`, channelId = `${lead.id}_channel`;
    await adminDb.collection('automations').doc(`${input.tenantId}_auto`).update({ actions: [{ type: 'send_message', text: 'Recepcao ficticia', waitInHours: scenario === 'scheduled' ? 0.000001 : 0 }] });
    await adminDb.collection('tenant_channels').doc(channelId).set({ tenantId: input.tenantId, type: 'whatsapp', provider: 'meta_whatsapp', status: 'active', phoneNumberId: 'qa-intake-number', accessToken: 'qa-local-only' });
    await adminDb.collection('chats').doc(chatId).set({ tenantId: input.tenantId, leadId: lead.id, channel: 'whatsapp', channelId, contactPhone: '5511000000084', lastClientMessageAt: new Date() });
    assert.equal((await processIntakeCreation(root.id, input.tenantId)).completed, true);
    if (scenario === 'scheduled') {
      const schedules = await adminDb.collection('jobs').where('tenantId', '==', input.tenantId).where('stageSourceId', '==', root.id).get();
      const pending = schedules.docs.filter(doc => doc.data().type === 'automation_scheduled_action');
      assert.equal(pending.length, 1); assert.equal(pending[0].data().trigger, 'lead_created');
      assert.equal(pending[0].data().executeAfter.toMillis(), Math.trunc((await root.get()).data()!.createdAt.toMillis() + 3.6));
      await processPendingAutomationActions({ tenantId: input.tenantId });
      assert.equal((await pending[0].ref.get()).data()?.status, 'done');
    }
    const jobs = await adminDb.collection('chat_outbound_jobs').where('tenantId', '==', input.tenantId).where('chatId', '==', chatId).get();
    assert.equal(jobs.size, 1); const job = jobs.docs[0].ref;
    assert.equal(jobs.docs[0].data().stageAutomationSourceKind, 'intake');
    if (scenario === 'revoked') await lead.collection('events').doc((await root.get()).data()!.sourceEventId).delete();
    let calls = 0; const previous = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      const target = new URL(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
      if (['localhost', '127.0.0.1'].includes(target.hostname)) return previous(url, init);
      assert.equal(target.hostname, 'graph.facebook.com'); assert.match(target.pathname, /\/qa-intake-number\/messages$/); calls++;
      return Promise.resolve(Response.json({ messages: [{ id: `wamid.qa-intake-${job.id}` }] }));
    };
    try { await processChatOutboundJobs({ jobId: job.id }); await processChatOutboundJobs({ jobId: job.id }); }
    finally { globalThis.fetch = previous; }
    assert.equal(calls, scenario === 'revoked' ? 0 : 1);
    assert.equal((await job.get()).data()?.status, scenario === 'revoked' ? 'dead_letter' : 'completed');
    assert.equal((await processIntakeCreation(root.id, input.tenantId)).processed, false);
  });
}

for (const changed of ["none", "event", "progress", "expired"] as const) test(`causal receipt recovery intake ${changed}`, async () => {
  const input = await fixture(), f = await commitOnly(input);
  const { loseStageHookAcknowledgement } = await import("./fixtures/stage-hook-ack-fault.mts");
  await adminDb.collection("automations").doc(`${input.tenantId}_auto`).update({ actions: [{ type: "create_task", title: "Tarefa original", sequenceOrder: 1 }, { type: "add_note", text: "Nota restante", sequenceOrder: 2 }] });
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processIntakeCreation(f.root.id, input.tenantId));
  const before = (await f.root.get()).data()!, tasks = () => adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("leadId", "==", f.lead.id).get();
  const originalTask = (await tasks()).docs; assert.equal(originalTask.length, 1); await originalTask[0].ref.update({ title: "Edicao humana" });
  if (changed === "event") await f.lead.collection("events").doc(before.sourceEventId).delete();
  if (changed === "progress") { const { FieldValue } = await import("firebase-admin/firestore"); await f.root.update({ stageHookProgress: FieldValue.delete() }); }
  if (changed === "expired") await f.root.update({ status: "processing", claimToken: "qa-old-intake", leaseUntil: new Date(0) });
  await Promise.all([processIntakeCreation(f.root.id, input.tenantId), processIntakeCreation(f.root.id, input.tenantId)]);
  const recover = changed === "none" || changed === "expired", final = (await f.root.get()).data()!;
  assert.equal(final.status, recover ? "done" : "reconciliation_required");
  if (recover) assert.deepEqual(final.stageHookProgress.steps.map((step: { name: string }) => step.name), ["automations"]);
  assert.equal((await tasks()).size, 1); assert.equal((await originalTask[0].ref.get()).data()?.title, "Edicao humana");
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", input.tenantId).where("leadId", "==", f.lead.id).get()).size, recover ? 1 : 0);
  assert.deepEqual(final.stageUsageReservations, before.stageUsageReservations);
});
