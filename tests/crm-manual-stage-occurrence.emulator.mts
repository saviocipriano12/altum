import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { loseStageHookAcknowledgement, freezeLegacyStageRecipe } from "./fixtures/stage-hook-ack-fault.mts";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { commitManualLeadPatch } = await import("../lib/server/crm/manual-update.ts");
const { processManualStageTransition, processPendingManualStageTransitions } = await import("../lib/server/crm/manual-stage-transition.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const tenantId = `qa_manual_occurrence_${Date.now()}`, actorId = `${tenantId}_seller`;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "External transport blocked in manual occurrence QA");
  return originalFetch(url, init);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["leads", "pipeline", "tenant_users", "users", "jobs", "automations", "lead_tasks", "lead_notes", "tenant_usage_monthly", "tenant_entitlements", "chats", "tenant_channels", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "messages", "ai_logs"]) {
    const docs = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const doc of docs.docs) { assert.equal(doc.data().tenantId, tenantId); await adminDb.recursiveDelete(doc.ref); }
  }
  await adminDb.terminate();
});
async function fixture(name: string) {
  const leadId = `${tenantId}_${name}`, lead = adminDb.collection("leads").doc(leadId);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).set({ tenantId, userId: actorId, role: "client_agent", status: "active", capabilities: ["edit_leads", "manage_pipeline"] });
  await adminDb.collection("users").doc(actorId).set({ tenantId, status: "active", role: "client_agent" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "captado", label: "Entrada", position: 0 }, { id: "provador", label: "Escolha Shopify", position: 1 },
    { id: "reserva", label: "Separado pelo vendedor", position: 2 },
  ] });
  await lead.set({ tenantId, nome: "Cliente Shopify ficticio", ownerId: actorId, origem: name, pipelineStage: "captado", stage: "captado" });
  await adminDb.collection("automations").doc(`${leadId}_automation`).set({ tenantId, name: "Acompanhar escolha", enabled: true, status: "active", trigger: "lead_stage_changed",
    conditions: { sourceIn: [name] }, actions: [{ type: "create_task", title: "Acompanhar escolha ficticia" }] });
  const version = (await lead.get()).updateTime!;
  return { tenantId, leadId, lead, expectedVersion: version, actorId, actorName: "Vendedor QA", fields: ["pipelineStage"] as const,
    patch: { pipelineStage: "provador", stage: "provador" }, detail: "Escolha humana ficticia" };
}

test("manual stage mutation commits its audit and pending automation occurrence before any consumer runs", async () => {
  const input = await fixture("commit-boundary");
  await commitManualLeadPatch(input);
  assert.equal((await input.lead.get()).data()?.pipelineStage, "provador");
  assert.equal((await input.lead.collection("events").get()).docs.filter(doc => doc.data().type === "lead_profile_update").length, 1);
  const roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).where("type", "==", "crm_manual_stage_transition").get();
  assert.equal(roots.size, 1, "A crash after the CRM commit must leave a durable occurrence");
  assert.equal(roots.docs[0].data().status, "ready");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get()).size, 0);
});

async function rootFor(leadId: string) {
  const roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", leadId).where("type", "==", "crm_manual_stage_transition").get();
  assert.equal(roots.size, 1); return roots.docs[0].ref;
}
async function tasksFor(leadId: string) { return adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get(); }

async function interruptedManual(name: string) {
  const input = await fixture(name);
  await adminDb.collection("automations").doc(`${input.leadId}_automation`).update({ actions: [
    { type: "create_task", title: "Tarefa antes da interrupcao", sequenceOrder: 1 },
    { type: "add_note", text: "Nota restante da etapa manual", sequenceOrder: 2 },
  ] });
  await commitManualLeadPatch(input); const root = await rootFor(input.leadId);
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processManualStageTransition(root.id, tenantId));
  return { ...input, root, notes: () => adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get() };
}
test("manual receipt recovery completes remaining actions while preserving the locked decision and edited task", async () => {
  const input = await interruptedManual("partial-recovery"), before = await input.lead.get();
  assert.equal((await input.root.get()).data()?.status, "ready");
  const task = (await tasksFor(input.leadId)).docs; assert.equal(task.length, 1);
  await task[0].ref.update({ title: "Correcao humana" });
  const quota = (await input.root.get()).data()?.stageUsageReservations;
  await Promise.all([processManualStageTransition(input.root.id, tenantId), processManualStageTransition(input.root.id, tenantId)]);
  const row = (await input.root.get()).data()!;
  assert.equal(row.status, "done"); assert.equal(row.attempts, 2);
  assert.deepEqual(row.stageHookProgress.steps.map((step: { name: string }) => step.name), ["automations"]);
  assert.equal((await tasksFor(input.leadId)).size, 1); assert.equal((await task[0].ref.get()).data()?.title, "Correcao humana");
  assert.equal((await input.notes()).size, 1); assert.deepEqual(row.stageUsageReservations, quota);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
});
for (const revoked of ["event", "decision", "capability", "receipt", "progress", "expired"] as const) test(`manual receipt recovery revalidates ${revoked} before remaining actions`, async () => {
  const input = await interruptedManual(`partial-${revoked}`), row = (await input.root.get()).data()!;
  if (revoked === "event") await input.lead.collection("events").doc(row.sourceEventId).delete();
  if (revoked === "decision") await input.lead.update({ "crmFieldOwnership.pipelineStage.transitionId": "qa-new-decision" });
  if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).update({ capabilities: [] });
  if (revoked === "receipt") {
    const receipt = (await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.root.id).get()).docs.find(doc => doc.data().type === "automation_stage_internal_effect");
    assert.ok(receipt); await receipt.ref.delete();
  }
  if (revoked === "progress") { const { FieldValue } = await import("firebase-admin/firestore"); await input.root.update({ stageHookProgress: FieldValue.delete() }); }
  if (revoked === "expired") await input.root.update({ status: "processing", claimToken: "qa-lost-worker", leaseUntil: new Date(0) });
  await processManualStageTransition(input.root.id, tenantId);
  assert.equal((await input.root.get()).data()?.status, revoked === "expired" ? "done" : "reconciliation_required");
  assert.equal((await tasksFor(input.leadId)).size, 1); assert.equal((await input.notes()).size, revoked === "expired" ? 1 : 0);
});

test("periodic processor recovers a committed human stage decision once without replaying the mutation", async () => {
  const input = await fixture("periodic"); await commitManualLeadPatch(input);
  const root = await rootFor(input.leadId), before = await input.lead.get();
  await processPendingAutomationActions({ tenantId });
  assert.equal((await root.get()).data()?.status, "done");
  assert.equal((await tasksFor(input.leadId)).size, 1);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await tasksFor(input.leadId)).size, 1);
  assert.equal((await input.lead.collection("events").get()).docs.filter(doc => doc.data().type === "lead_profile_update").length, 1);
  assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
});

test("concurrent manual consumers register one action and preserve the locked human stage", async () => {
  const input = await fixture("concurrent-consumers"); await commitManualLeadPatch(input);
  const root = await rootFor(input.leadId);
  await Promise.all([processManualStageTransition(root.id, tenantId), processManualStageTransition(root.id, tenantId)]);
  assert.equal((await root.get()).data()?.status, "done");
  assert.equal((await root.get()).data()?.attempts, 1);
  assert.equal((await tasksFor(input.leadId)).size, 1);
  assert.equal((await input.lead.get()).data()?.crmFieldOwnership.pipelineStage.locked, true);
});

test("concurrent human edits commit only one decision, audit and occurrence for the expected version", async () => {
  const input = await fixture("concurrent-writers");
  const results = await Promise.allSettled([commitManualLeadPatch(input), commitManualLeadPatch(input)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  await rootFor(input.leadId);
  assert.equal((await input.lead.collection("events").get()).size, 1);
});

test("profile-only updates and saving the same stage do not invent stage automation occurrences", async () => {
  const input = await fixture("unchanged");
  await commitManualLeadPatch({ ...input, fields: [], patch: { nome: "Correcao ficticia" } });
  const next = await input.lead.get();
  await commitManualLeadPatch({ ...input, expectedVersion: next.updateTime!, patch: { pipelineStage: "captado", stage: "captado" } });
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
});

for (const revoked of ["event", "pipeline", "membership", "capability", "assignment", "decision", "module"] as const) {
  test(`manual automation revalidates ${revoked} before effects and preserves the current human record`, async () => {
    const input = await fixture(`revoked-${revoked}`); await commitManualLeadPatch(input);
    const root = await rootFor(input.leadId), row = (await root.get()).data()!;
    if (revoked === "event") await input.lead.collection("events").doc(row.sourceEventId).delete();
    if (revoked === "pipeline") await adminDb.collection("pipeline").doc(tenantId).update({ updatedBy: "qa-human" });
    if (revoked === "membership") await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).update({ status: "blocked" });
    if (revoked === "capability") await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).update({ capabilities: [] });
    if (revoked === "assignment") await input.lead.update({ ownerId: `${actorId}_other` });
    if (revoked === "decision") await input.lead.update({ "crmFieldOwnership.pipelineStage.transitionId": "qa-new-human-decision" });
    if (revoked === "module") await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.crm": false });
    const before = await input.lead.get();
    await processManualStageTransition(root.id, tenantId);
    assert.equal((await root.get()).data()?.status, "reconciliation_required");
    assert.equal((await tasksFor(input.leadId)).size, 0);
    assert.ok((await input.lead.get()).updateTime!.isEqual(before.updateTime!));
  });
}

test("manual preclaim storage failures preserve the occurrence and isolate it from the rest of the batch", async () => {
  const first = await fixture("storage-failure"); await commitManualLeadPatch(first);
  const second = await fixture("storage-healthy"); await commitManualLeadPatch(second);
  // Both roots must refer to the current pipeline version for this test.
  const root = await rootFor(first.leadId), healthy = await rootFor(second.leadId);
  await root.update({ pipelineVersion: (await healthy.get()).data()?.pipelineVersion });
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const hook = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ("path" in args[0] && args[0].path === first.lead.path) return Promise.reject(new Error("QA_MANUAL_STORAGE_UNAVAILABLE"));
    return Reflect.apply(original, this, args);
  });
  try {
    const result = await processPendingManualStageTransitions({ tenantId, limit: 20 });
    assert.ok(result.failed >= 1); assert.ok(result.completed >= 1);
  } finally { hook.mock.restore(); }
  assert.equal((await root.get()).data()?.status, "ready"); assert.equal((await root.get()).data()?.attempts, 0);
  assert.equal((await healthy.get()).data()?.status, "done");
  assert.equal((await tasksFor(first.leadId)).size, 0); assert.equal((await tasksFor(second.leadId)).size, 1);
});

test("a legacy manual action with lost acknowledgement retains its receipt and is never blindly repeated", async () => {
  const input = await fixture("effect-ack"); await commitManualLeadPatch(input);
  const root = await rootFor(input.leadId), original = adminDb.runTransaction;
  await freezeLegacyStageRecipe(adminDb, root, "manual", `${input.leadId}_automation`);
  let interrupted = false;
  const hook = mock.method(adminDb, "runTransaction", async function(this: typeof adminDb, ...args: Parameters<typeof original>) {
    const result = await Reflect.apply(original, this, args);
    if (!interrupted && !(await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get()).empty) {
      interrupted = true; throw new Error("QA_MANUAL_EFFECT_ACK_LOST");
    }
    return result;
  });
  try { assert.equal((await processManualStageTransition(root.id, tenantId)).completed, false); }
  finally { hook.mock.restore(); }
  assert.equal(interrupted, true); assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await tasksFor(input.leadId)).size, 1);
  assert.equal((await processManualStageTransition(root.id, tenantId)).processed, false);
  assert.equal((await tasksFor(input.leadId)).size, 1);
});

async function queuedMessage(name: string, waitInHours = 0) {
  const input = await fixture(name), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("automations").doc(`${input.leadId}_automation`).update({ actions: [{ type: "send_message", text: "Acompanhamento ficticio da escolha", waitInHours }] });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-manual-stage-number", accessToken: "qa-local-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  await commitManualLeadPatch(input);
  const root = await rootFor(input.leadId);
  assert.equal((await processManualStageTransition(root.id, tenantId)).completed, true);
  return { ...input, root, chatId };
}
async function outboxFor(chatId: string) {
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  assert.equal(jobs.size, 1); return jobs.docs[0].ref;
}
async function deliver(jobId: string) {
  let calls = 0; const previous = globalThis.fetch;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return previous(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-manual-stage-number\/messages$/); calls++;
    return Promise.resolve(Response.json({ messages: [{ id: `wamid.qa-manual-${jobId}` }] }));
  };
  try { await processChatOutboundJobs({ jobId }); } finally { globalThis.fetch = previous; }
  return calls;
}
test("manual stage messages enter the existing outbox and reach the simulated provider once", async () => {
  const input = await queuedMessage("delivery"), job = await outboxFor(input.chatId);
  assert.equal((await job.get()).data()?.stageAutomationSourceKind, "manual");
  assert.equal((await job.get()).data()?.providerAttemptStartedAt, undefined);
  assert.equal(await deliver(job.id), 1); assert.equal((await job.get()).data()?.status, "completed");
  assert.equal(await deliver(job.id), 0);
  assert.equal((await processManualStageTransition(input.root.id, tenantId)).processed, false);
});
test("revoking seller capability after enqueue prevents any provider call", async () => {
  const input = await queuedMessage("delivery-revoked"), job = await outboxFor(input.chatId);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).update({ capabilities: [] });
  assert.equal(await deliver(job.id), 0); assert.equal((await job.get()).data()?.status, "dead_letter");
  assert.equal((await job.get()).data()?.providerAttemptStartedAt, undefined);
});
test("manual scheduled messages reject a forged deadline even when accompanied by a human correction", async () => {
  const input = await queuedMessage("scheduled-revoked", 1);
  const schedules = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.root.id).get();
  const pending = schedules.docs.filter(doc => doc.data().type === "automation_scheduled_action");
  assert.equal(pending.length, 1); assert.equal(pending[0].data().stageSourceKind, "manual");
  await pending[0].ref.update({ executeAfter: new Date(0) });
  await input.lead.update({ "crmFieldOwnership.pipelineStage.transitionId": "qa-human-correction" });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  assert.equal((await pending[0].ref.get()).data()?.status, "reconciliation_required");
});

test("profile stage occurrence cannot replace revoked edit permission with pipeline management permission", async () => {
  const input = await fixture("precise-profile-permission"); await commitManualLeadPatch(input);
  const root = await rootFor(input.leadId);
  await adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`).update({ capabilities: ["manage_pipeline"] });
  await processManualStageTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await tasksFor(input.leadId)).size, 0);
});

test("manual scheduled message uses its original valid deadline and delivers once", async () => {
  const input = await queuedMessage("scheduled-valid", 0.000001);
  const schedules = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.root.id).get();
  const pending = schedules.docs.filter(doc => doc.data().type === "automation_scheduled_action");
  assert.equal(pending.length, 1);
  const source = (await input.root.get()).data()!, quota = source.stageUsageReservations;
  assert.equal(pending[0].data().executeAfter.toMillis(), Math.trunc(source.createdAt.toMillis() + 3.6));
  await processPendingAutomationActions({ tenantId });
  assert.equal((await pending[0].ref.get()).data()?.status, "done");
  const job = await outboxFor(input.chatId);
  assert.equal(await deliver(job.id), 1); assert.equal(await deliver(job.id), 0);
  await processPendingAutomationActions({ tenantId });
  assert.equal((await outboxFor(input.chatId)).id, job.id);
  assert.deepEqual((await input.root.get()).data()?.stageUsageReservations, quota);
});

test("human correction revokes a manual schedule whose original deadline remains valid", async () => {
  const input = await queuedMessage("scheduled-human-only", 0.000001);
  const schedules = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.root.id).get();
  const pending = schedules.docs.filter(doc => doc.data().type === "automation_scheduled_action");
  assert.equal(pending.length, 1);
  const before = await pending[0].ref.get(), source = (await input.root.get()).data()!;
  assert.equal(before.data()?.executeAfter.toMillis(), Math.trunc(source.createdAt.toMillis() + 3.6));
  await input.lead.update({ "crmFieldOwnership.pipelineStage.transitionId": "qa-human-correction" });
  await processPendingAutomationActions({ tenantId });
  assert.equal((await pending[0].ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await pending[0].ref.get()).data()?.executeAfter.toMillis(), before.data()?.executeAfter.toMillis());
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
});
