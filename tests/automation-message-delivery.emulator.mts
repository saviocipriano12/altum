import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { commercialTaskIndexMatches } from "../lib/crm-task-index.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { FieldValue } = await import("firebase-admin/firestore");
const { queueScheduledAutomationMessage, queueWaitingReplyAutomationMessage, queueInboundAutomationMessage } = await import("../lib/server/automation-message-delivery.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { processPendingAutomationActions, processWaitingReplyAutomations, runLeadAutomations, normalizeAutomationDoc, claimScheduledAutomationJob, finishScheduledAutomationJob } = await import("../lib/server/automations.ts");
const { admitInboundAutomationEvent, claimInboundAutomationExecution, finishInboundAutomationExecution, inboundAutomationExecutionId } = await import("../lib/server/automation-inbound-execution.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { reserveTenantAutomationExecution } = await import("../lib/server/tenant-usage.ts");
const { commitInboundAutomationInternalEffect, commitScheduledAutomationInternalEffect } = await import("../lib/server/automation-internal-effect.ts");
const { commitManualLeadPatch, ManualLeadUpdateConflict } = await import("../lib/server/crm/manual-update.ts");
const { commitAutomaticLeadPatch } = await import("../lib/server/crm/field-ownership.ts");
const { syncLeadCommercialState, analyzeLeadCommercialState } = await import("../lib/server/crm/operations.ts");
const { observeConversationCommercialState } = await import("../lib/server/crm/conversation-intelligence.ts");
const tenantId = `qa_automation_delivery_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let calls = 0, loseAck = false;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  assert.equal(target.hostname, "graph.facebook.com", "No real external services allowed");
  assert.match(target.pathname, /\/qa-automation-number\/messages$/);
  assert.equal(JSON.parse(String(options?.body)).type, "text");
  calls++;
  if (loseAck) throw new Error("provider accepted but acknowledgement lost");
  return Response.json({ messages: [{ id: `wamid.qa-automation-${calls}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active",
  provider: "meta_whatsapp", phoneNumberId: "qa-automation-number", accessToken: "qa-only", channelScope: "shared" });
async function fixture(name: string) {
  const chatId = `${tenantId}_${name}`;
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date() });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true });
  return { tenantId, chatId, automationId: "qa-automation", automationName: "Automacao QA",
    scheduledJobId: `qa-job-${name}`, text: "Mensagem de automacao ficticia" };
}
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["pipeline", "automations", "jobs", "leads", "lead_tasks", "lead_notes", "chat_outbound_jobs", "messages", "chat_outbound_locks", "chat_state", "chats", "tenant_channels", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "tenant_usage_monthly"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) {
      if (collection === "jobs" && typeof row.data().leadId === "string" && row.data().leadId.startsWith(tenantId)) {
        // Source-removal tests can leave a missing parent with fixture-only events.
        await adminDb.recursiveDelete(adminDb.collection("leads").doc(row.data().leadId));
        await row.ref.delete();
      } else if (collection === "leads") await adminDb.recursiveDelete(row.ref);
      else await row.ref.delete();
    }
  }
  await adminDb.terminate();
});

async function inboundFixture(name: string) {
  const input = await fixture(name), leadId = `${tenantId}_${name}_lead`, sourceMessageId = `${tenantId}_${name}_in`;
  const automationId = `${tenantId}_${name}_auto`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente ficticio", origem: name, pipelineStage: "captado" });
  await adminDb.collection("chats").doc(input.chatId).update({ leadId });
  await adminDb.collection("messages").doc(sourceMessageId).set({ tenantId, chatId: input.chatId, leadId, sender: "client", text: "Uma duvida", type: "text", createdAt: new Date() });
  const definition = { tenantId, name: "Entrada QA", status: "active", enabled: true, trigger: "message_received",
    conditions: { sourceIn: [name] }, actions: [{ type: "send_message", text: "Vou ajudar voce" }] };
  await adminDb.collection("automations").doc(automationId).set(definition);
  const context = { tenantId, leadId, chatId: input.chatId, sourceMessageId, trigger: "message_received" as const, channel: "whatsapp" };
  return { ...input, leadId, sourceMessageId, automationId, context, definition };
}

async function delayedInboundFixture(name: string, runScheduler = true) {
  const input = await inboundFixture(name);
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [{ type: "send_message", text: "Retorno adiado QA", waitInHours: 1 }] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const scheduled = jobs.docs.find(row => row.data().type === "automation_scheduled_action")!;
  await scheduled.ref.update({ executeAfter: new Date(0) });
  if (runScheduler) await processPendingAutomationActions({ tenantId, limit: 100 });
  return { ...input, scheduledRef: scheduled.ref, scheduledId: scheduled.id };
}

async function delayedInternalFixture(name: string) {
  const input = await inboundFixture(name);
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "alert_human", title: "Pendencia futura QA", text: "Nota futura QA", dueInHours: 2, waitInHours: 1 },
  ] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const scheduled = jobs.docs.find(row => row.data().type === "automation_scheduled_action")!;
  await scheduled.ref.update({ executeAfter: new Date(0) });
  return { ...input, scheduledRef: scheduled.ref, scheduledId: scheduled.id };
}

async function customCrmPipeline() {
  const ref = adminDb.collection("pipeline").doc(tenantId);
  await ref.set({ tenantId, stages: [
    { id: "captado", label: "Entrada", position: 0, isTerminal: false },
    { id: "provador", label: "Escolhendo pecas", position: 1, isTerminal: false },
    { id: "reserva", label: "Separacao humana", position: 2, isTerminal: false },
  ] });
  return ref;
}

test("CRM mutations commit with receipts, use the tenant funnel and recover without undoing human edits", async () => {
  await customCrmPipeline();
  const input = await inboundFixture("crm-receipts"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "move_stage", stageId: "provador" }, { type: "set_priority", priority: "high" }, { type: "add_tag", tag: "vip" },
  ] });
  await Promise.all(Array.from({ length: 5 }, () => runLeadAutomations(input.context)));
  const leadRef = adminDb.collection("leads").doc(input.leadId), updated = (await leadRef.get()).data()!;
  assert.equal(updated.pipelineStage, "provador"); assert.equal(updated.stage, "provador"); assert.equal(updated.priority, "high"); assert.deepEqual(updated.tags, ["vip"]);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const root = jobs.docs.find(row => row.data().type === "automation_inbound_execution")!;
  const receipts = jobs.docs.filter(row => row.data().type === "automation_internal_effect");
  assert.equal(root.data().executionProtocolVersion, 4); assert.equal(receipts.length, 3);
  for (const receipt of receipts) {
    assert.equal(receipt.data().outcome, "applied"); assert.equal(receipt.data().completionMeaning, "crm_mutation_evaluated_not_external_conversion");
    assert.ok((await leadRef.collection("events").doc(receipt.id).get()).exists);
  }
  const snapshot = await leadRef.get();
  await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"], patch: { pipelineStage: "reserva", stage: "reserva", priority: "low", tags: ["humano"] }, detail: "Decisao humana" });
  await root.ref.update({ status: "processing", leaseUntil: new Date(0) });
  await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  const recovered = (await leadRef.get()).data()!;
  assert.equal((await root.ref.get()).data()?.status, "done"); assert.equal((await root.ref.get()).data()?.attempts, 2);
  assert.equal(recovered.pipelineStage, "reserva"); assert.equal(recovered.priority, "low"); assert.deepEqual(recovered.tags, ["humano"]);
  assert.equal((await leadRef.collection("events").get()).size, 4);
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  assert.equal(calls, before);
});

test("temporary inbound CRM pipeline storage errors keep their identity and cannot become authorization denials", async () => {
  const pipeline = await customCrmPipeline(), input = await inboundFixture("crm-storage-transient");
  const definition = { ...input.definition, actions: [{ type: "move_stage", stageId: "provador" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, definition), normalize: normalizeAutomationDoc });
  assert.ok(claim);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const error = Object.assign(new Error("QA_INBOUND_PIPELINE_UNAVAILABLE"), { code: 14 });
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === pipeline.path) throw error;
    return Reflect.apply(original, this, [target, ...rest]);
  });
  const args = { ...input.context, claim, actionIndex: 0, action: claim.plan.actions[0] };
  try { await assert.rejects(commitInboundAutomationInternalEffect(args), value => value === error); }
  finally { interceptor.mock.restore(); }
  const rows = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(rows.docs.filter(row => row.data().type === "automation_internal_effect").length, 0);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "captado");
  await commitInboundAutomationInternalEffect(args);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "provador");
  await finishInboundAutomationExecution(claim, "done");
});

test("a later inbound event and delayed CRM actions cannot overwrite manually owned fields", async () => {
  await customCrmPipeline(); const input = await inboundFixture("crm-manual-lock"), leadRef = adminDb.collection("leads").doc(input.leadId);
  const snapshot = await leadRef.get();
  await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"], patch: { pipelineStage: "reserva", stage: "reserva", priority: "low", tags: ["humano"] }, detail: "Manter escolha humana" });
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "move_stage", stageId: "provador", waitInHours: 1 }, { type: "set_priority", priority: "high", waitInHours: 1 }, { type: "add_tag", tag: "vip", waitInHours: 1 },
  ] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const schedules = jobs.docs.filter(row => row.data().type === "automation_scheduled_action"); assert.equal(schedules.length, 3);
  for (const job of schedules) await job.ref.update({ executeAfter: new Date(0) });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  for (const job of schedules) { const row = (await job.ref.get()).data()!; assert.equal(row.status, "done"); assert.equal(row.actionsExecuted, 0); }
  const receipts = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const effects = receipts.docs.filter(row => row.data().type === "automation_internal_effect"); assert.equal(effects.length, 3);
  for (const effect of effects) assert.equal(effect.data().outcome, "blocked_manual");
  const lead = (await leadRef.get()).data()!; assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["humano"]);
});

test("delayed CRM commits resume after interrupted scheduler completion without changing later human decisions", async () => {
  await customCrmPipeline(); const input = await inboundFixture("crm-delayed-recovery"), leadRef = adminDb.collection("leads").doc(input.leadId);
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "move_stage", stageId: "provador", waitInHours: 1 }, { type: "set_priority", priority: "high", waitInHours: 1 }, { type: "add_tag", tag: "vip", waitInHours: 1 },
  ] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const scheduled = jobs.docs.filter(row => row.data().type === "automation_scheduled_action"); assert.equal(scheduled.length, 3);
  for (const entry of scheduled) {
    await entry.ref.update({ executeAfter: new Date(0) });
    const claim = await claimScheduledAutomationJob(entry.id, tenantId); assert.ok(claim);
    await commitScheduledAutomationInternalEffect({ tenantId, leadId: input.leadId, chatId: input.chatId, scheduledJobId: entry.id,
      claimToken: claim.claimToken, action: entry.data().action });
    assert.equal((await entry.ref.get()).data()?.status, "processing", "Commit happened but scheduler finalization did not");
  }
  let snapshot = await leadRef.get(); assert.equal(snapshot.data()?.pipelineStage, "provador"); assert.equal(snapshot.data()?.priority, "high"); assert.deepEqual(snapshot.data()?.tags, ["vip"]);
  await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"], patch: { pipelineStage: "reserva", stage: "reserva", priority: "low", tags: ["humano"] }, detail: "Revisao posterior" });
  for (const entry of scheduled) await entry.ref.update({ leaseUntil: new Date(0) });
  await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  for (const entry of scheduled) { const row = (await entry.ref.get()).data()!; assert.equal(row.status, "done"); assert.equal(row.attempts, 2); }
  snapshot = await leadRef.get(); assert.equal(snapshot.data()?.pipelineStage, "reserva"); assert.equal(snapshot.data()?.priority, "low"); assert.deepEqual(snapshot.data()?.tags, ["humano"]);
  assert.equal((await leadRef.collection("events").get()).size, 7);
});

test("sequential mutations of the same fields use their own prior receipt rather than a stale caller snapshot", async () => {
  await customCrmPipeline(); const input = await inboundFixture("crm-sequence"), leadRef = adminDb.collection("leads").doc(input.leadId);
  await leadRef.update({ priority: "medium", tags: ["base"] });
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "move_stage", stageId: "provador" }, { type: "move_stage", stageId: "reserva" },
    { type: "set_priority", priority: "high" }, { type: "set_priority", priority: "low" },
    { type: "add_tag", tag: "vip" }, { type: "add_tag", tag: "vip" },
  ] });
  assert.equal((await runLeadAutomations(input.context)).executed, 6);
  const lead = (await leadRef.get()).data()!; assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["base", "vip"]);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const effects = jobs.docs.filter(row => row.data().type === "automation_internal_effect"); assert.equal(effects.length, 6);
  assert.equal(effects.filter(row => row.data().outcome === "unchanged").length, 1);
  assert.equal((await runLeadAutomations(input.context)).executed, 0); assert.equal((await leadRef.collection("events").get()).size, 6);
});

test("legacy stage-change automation respects manual field ownership without claiming replay migration", async () => {
  await customCrmPipeline(); const input = await inboundFixture("crm-legacy-manual"), leadRef = adminDb.collection("leads").doc(input.leadId);
  const definition = { ...input.definition, trigger: "lead_stage_changed", actions: [
    { type: "move_stage", stageId: "provador" }, { type: "set_priority", priority: "high" }, { type: "add_tag", tag: "vip" },
  ] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const context = { ...input.context, trigger: "lead_stage_changed" as const };
  assert.equal((await runLeadAutomations(context)).executed, 3);
  const snapshot = await leadRef.get();
  await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"], patch: { pipelineStage: "reserva", stage: "reserva", priority: "low", tags: ["humano"] }, detail: "Controle humano" });
  assert.equal((await runLeadAutomations(context)).executed, 0);
  const lead = (await leadRef.get()).data()!; assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["humano"]);
  assert.equal((await leadRef.collection("events").get()).size, 4);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.docs.filter(row => row.data().type === "automation_internal_effect").length, 0, "Do not invent a durable legacy occurrence");
});

test("passive CRM keeps human stage and score while recording new customer facts with replies paused", async () => {
  const pipeline = await customCrmPipeline();
  const configuredStages = (await pipeline.get()).data()!.stages;
  // Explicit tenant semantics, not an assumed meaning for the second column.
  await pipeline.update({ stages: configuredStages.map((stage: Record<string, unknown>) =>
    stage.id === "provador" ? { ...stage, description: "Qualificacao do interesse" } : stage) });
  const input = await inboundFixture("crm-passive-ownership"), leadRef = adminDb.collection("leads").doc(input.leadId);
  await adminDb.collection("ai_logs").doc(`${input.leadId}_signal`).set({ tenantId, leadId: input.leadId, nextAction: "aprofundar_oportunidade", confidence: 0.99, createdAt: new Date() });
  const original = await leadRef.get();
  await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: original.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"], patch: { pipelineStage: "captado", stage: "captado", priority: "low", tags: ["humano"], score: 88, scoreSource: "manual" }, detail: "Manter etapa e score" });
  const analysis = await analyzeLeadCommercialState({ tenantId, leadId: input.leadId, lead: (await leadRef.get()).data()! });
  assert.equal(analysis.qualification.recommendedStage, "provador", "Fixture would otherwise recommend an advancement");
  const synced = await syncLeadCommercialState({ tenantId, leadId: input.leadId, allowStageAdvance: true }); assert.ok(synced); assert.equal(synced.stageAdvanced, false);
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).update({ aiEnabled: false, pauseReason: "human_takeover" });
  await adminDb.collection("messages").doc(input.sourceMessageId).update({ text: "Minha cidade é Recife" });
  const observed = await observeConversationCommercialState({ tenantId, chatId: input.chatId, messageId: input.sourceMessageId }); assert.equal(observed.observed, true); assert.equal(observed.advancedStage, false);
  const lead = (await leadRef.get()).data()!; assert.equal(lead.pipelineStage, "captado"); assert.equal(lead.score, 88); assert.equal(lead.scoreSource, "manual"); assert.equal(lead.customFields.cidade, "Recife");
  assert.deepEqual(lead.tags, ["humano"]); assert.equal(lead.priority, "low");
});

test("CRM detects an untracked edit after claim and permanently records the conflict instead of applying on retry", async () => {
  const input = await inboundFixture("crm-stale"), leadRef = adminDb.collection("leads").doc(input.leadId);
  await leadRef.update({ priority: "medium" });
  const definition = { ...input.definition, actions: [{ type: "set_priority", priority: "high" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, definition), normalize: normalizeAutomationDoc }); assert.ok(claim);
  await leadRef.update({ priority: "low" });
  const args = { ...input.context, claim, actionIndex: 0, action: claim.plan.actions[0] };
  const result = await commitInboundAutomationInternalEffect(args); assert.equal(result.executed, false);
  assert.equal((await adminDb.collection("jobs").doc(result.receiptId).get()).data()?.outcome, "blocked_stale");
  await leadRef.update({ priority: "medium" });
  assert.equal((await commitInboundAutomationInternalEffect(args)).executed, false);
  assert.equal((await leadRef.get()).data()?.priority, "medium"); assert.equal((await leadRef.collection("events").get()).size, 1);
  await finishInboundAutomationExecution(claim, "done");
});

test("CRM validates the accepted funnel version and target ID without remapping to default labels", async () => {
  for (const mutation of ["renamed", "removed_target", "default_not_in_custom", "foreign_funnel", "invalid_funnel"]) {
    const pipeline = await customCrmPipeline(), input = await inboundFixture(`crm-funnel-${mutation}`);
    const definition = { ...input.definition, actions: [{ type: "move_stage", stageId: mutation === "default_not_in_custom" ? "qualificacao" : "provador" }] };
    await adminDb.collection("automations").doc(input.automationId).set(definition);
    const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, definition), normalize: normalizeAutomationDoc }); assert.ok(claim);
    if (mutation === "renamed") await pipeline.update({ updatedBy: "qa-human" });
    if (mutation === "removed_target") await pipeline.update({ stages: [{ id: "captado", label: "Entrada" }, { id: "reserva", label: "Separacao" }, { id: "pos_venda", label: "Suporte" }] });
    if (mutation === "foreign_funnel") await pipeline.update({ tenantId: "qa-other-business" });
    if (mutation === "invalid_funnel") await pipeline.update({ stages: [] });
    const args = { ...input.context, claim, actionIndex: 0, action: claim.plan.actions[0] };
    if (mutation === "foreign_funnel" || mutation === "invalid_funnel") {
      await assert.rejects(commitInboundAutomationInternalEffect(args), /outra empresa|Funil invalido/);
      await pipeline.update({ tenantId });
    } else {
      const result = await commitInboundAutomationInternalEffect(args); assert.equal(result.executed, false);
      assert.equal((await adminDb.collection("jobs").doc(result.receiptId).get()).data()?.outcome, "blocked_pipeline");
    }
    assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "captado");
    await finishInboundAutomationExecution(claim, "done");
  }
});

test("a CRM receipt/event storage conflict rolls back the field mutation too", async () => {
  const input = await inboundFixture("crm-atomic-conflict"), leadRef = adminDb.collection("leads").doc(input.leadId);
  const definition = { ...input.definition, actions: [{ type: "set_priority", priority: "high" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, definition), normalize: normalizeAutomationDoc }); assert.ok(claim);
  const id = `automation_effect_${createHash("sha256").update(JSON.stringify([claim.id, 0])).digest("hex")}`;
  await leadRef.collection("events").doc(id).set({ tenantId, title: "Conflito preexistente" });
  await assert.rejects(commitInboundAutomationInternalEffect({ ...input.context, claim, actionIndex: 0, action: claim.plan.actions[0] }));
  assert.equal((await leadRef.get()).data()?.priority, undefined); assert.equal((await adminDb.collection("jobs").doc(id).get()).exists, false);
  assert.equal((await leadRef.collection("events").doc(id).get()).data()?.title, "Conflito preexistente");
  await finishInboundAutomationExecution(claim, "reconciliation_required");
});

test("manual profile, ownership and audit commit atomically; stale automatic or manual snapshots cannot overwrite them", async () => {
  await customCrmPipeline();
  const input = await inboundFixture("crm-manual-version"), leadRef = adminDb.collection("leads").doc(input.leadId), snapshot = await leadRef.get();
  const args = { tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
    fields: ["pipelineStage", "priority", "tags"] as const, patch: { pipelineStage: "reserva", stage: "reserva", priority: "low", tags: ["decisao"] }, detail: "Edicao humana" };
  await commitManualLeadPatch(args);
  await assert.rejects(commitManualLeadPatch({ ...args, patch: { priority: "high" } }), ManualLeadUpdateConflict);
  assert.equal(await commitAutomaticLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, patch: { priority: "high", score: 99 } }), false);
  const fresh = await leadRef.get();
  assert.equal(await commitAutomaticLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: fresh.updateTime!,
    patch: { pipelineStage: "provador", stage: "provador", stageUpdatedAt: new Date(), priority: "high", tags: ["automatico"], score: 50 } }), true);
  const lead = (await leadRef.get()).data()!;
  assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.stage, "reserva"); assert.equal(lead.priority, "low"); assert.deepEqual(lead.tags, ["decisao"]); assert.equal(lead.score, 50);
  assert.equal(lead.crmFieldOwnership.priority.actorId, "qa-human"); assert.equal((await leadRef.collection("events").get()).size, 1);
});

test("delayed internal effect and recovery preserve one task, note, quota and subsequent human edits", async () => {
  const input = await delayedInternalFixture("delayed-internal-recover"), before = calls;
  const claim = await claimScheduledAutomationJob(input.scheduledId, tenantId); assert.ok(claim);
  await reserveTenantAutomationExecution(tenantId, { jobId: claim.id, claimToken: claim.claimToken });
  const queued = (await input.scheduledRef.get()).data()!;
  await commitScheduledAutomationInternalEffect({ tenantId, chatId: input.chatId, leadId: input.leadId,
    scheduledJobId: input.scheduledId, claimToken: claim.claimToken, action: queued.action });
  const original = (await input.scheduledRef.get()).data()!;
  assert.equal(original.status, "processing", "Fault boundary: effects committed but scheduler completion never happened");
  assert.equal(original.internalEffectProtocolVersion, 1);
  const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const notes = await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(tasks.size, 1); assert.equal(notes.size, 1);
  const due = tasks.docs[0].data().dueAt.toMillis();
  const receipt = (await adminDb.collection("jobs").doc(tasks.docs[0].data().automationEffectId).get()).data()!;
  assert.equal(receipt.scheduledJobId, input.scheduledId); assert.equal(receipt.completionMeaning, "internal_records_committed_not_human_notified");
  await tasks.docs[0].ref.update({ status: "done", title: "Edicao humana" }); await notes.docs[0].ref.update({ text: "Nota revisada" });
  await input.scheduledRef.update({ leaseUntil: new Date(0) });
  await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  const recovered = (await input.scheduledRef.get()).data()!; assert.equal(recovered.status, "done"); assert.equal(recovered.attempts, 2);
  assert.deepEqual(recovered.schedulerUsageReservation, original.schedulerUsageReservation);
  assert.equal((await tasks.docs[0].ref.get()).data()?.title, "Edicao humana"); assert.equal((await tasks.docs[0].ref.get()).data()?.status, "done");
  assert.equal((await tasks.docs[0].ref.get()).data()?.dueAt.toMillis(), due); assert.equal((await notes.docs[0].ref.get()).data()?.text, "Nota revisada");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 2);
  assert.equal(calls, before);
});

test("the real scheduler commits all four delayed internal action types with distinct evidence", async () => {
  const input = await inboundFixture("delayed-internal-types"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "create_task", title: "Tarefa futura", waitInHours: 1 }, { type: "follow_up", dueInHours: 2, waitInHours: 1 },
    { type: "add_note", text: "Nota futura", waitInHours: 1 }, { type: "alert_human", title: "Revisao humana", text: "Contexto", waitInHours: 1 },
  ] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const schedules = jobs.docs.filter(row => row.data().type === "automation_scheduled_action"); assert.equal(schedules.length, 4);
  for (const row of schedules) await row.ref.update({ executeAfter: new Date(0) });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  for (const row of schedules) assert.equal((await row.ref.get()).data()?.status, "done");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 3);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 2);
  const receipts = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(receipts.docs.filter(row => row.data().type === "automation_internal_effect").length, 4);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 8); assert.equal(calls, before);
});

test("delayed internal actions revalidate source, configuration and scheduler ownership before any write", async () => {
  for (const mutation of ["source_deleted", "config_disabled", "foreign_chat", "stale_owner"]) {
    const input = await delayedInternalFixture(`delayed-internal-${mutation}`);
    const claim = await claimScheduledAutomationJob(input.scheduledId, tenantId); assert.ok(claim);
    const row = (await input.scheduledRef.get()).data()!;
    if (mutation === "source_deleted") await adminDb.collection("messages").doc(input.sourceMessageId).delete();
    if (mutation === "config_disabled") await adminDb.collection("automations").doc(input.automationId).update({ enabled: false });
    if (mutation === "foreign_chat") await adminDb.collection("chats").doc(input.chatId).update({ tenantId: "foreign" });
    await assert.rejects(commitScheduledAutomationInternalEffect({ tenantId, chatId: input.chatId, leadId: input.leadId,
      scheduledJobId: input.scheduledId, claimToken: mutation === "stale_owner" ? "old-owner" : claim.claimToken, action: row.action }), /Fonte\/plano/);
    for (const collection of ["lead_tasks", "lead_notes"]) assert.equal((await adminDb.collection(collection).where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
    if (mutation !== "stale_owner") {
      await finishScheduledAutomationJob(claim, { status: "retrying" });
      await processPendingAutomationActions({ tenantId, limit: 100 });
      const rejected = (await input.scheduledRef.get()).data()!;
      assert.equal(rejected.status, "reconciliation_required");
      await processPendingAutomationActions({ tenantId, limit: 100 });
      assert.equal((await input.scheduledRef.get()).data()?.attempts, rejected.attempts, "Revocation must not authorize further retries");
    }
    // Return the fixture chat to its own scope for cleanup, not for execution.
    if (mutation === "foreign_chat") await adminDb.collection("chats").doc(input.chatId).update({ tenantId });
    await input.scheduledRef.update({ status: "reconciliation_required" });
  }
});

test("delayed internal scheduler waits for unfinished root without consuming attempts or restarting its original deadline", async () => {
  const input = await delayedInternalFixture("delayed-internal-preparing");
  const initial = (await input.scheduledRef.get()).data()!;
  const rootRef = adminDb.collection("jobs").doc(initial.inboundExecutionId);
  await rootRef.update({ status: "processing", leaseUntil: new Date(Date.now() + 60_000) });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  const pending = (await input.scheduledRef.get()).data()!;
  assert.equal(pending.status, "retrying"); assert.equal(pending.attempts, 0); assert.ok(pending.retryAfter.toMillis() > Date.now());
  assert.equal(pending.executeAfter.toMillis(), initial.executeAfter.toMillis());
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  await rootRef.update({ status: "done" }); await input.scheduledRef.update({ retryAfter: new Date(0) });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await input.scheduledRef.get()).data()?.status, "done");
  assert.equal((await input.scheduledRef.get()).data()?.executeAfter.toMillis(), initial.executeAfter.toMillis());
});

test("legacy scheduled retries without a proved effect protocol require reconciliation before any repeat", async () => {
  const before = calls;
  for (const type of ["send_message", "create_task", "declared_only", "stale_executor", "missing_owner"]) {
    const input = await fixture(`legacy-retry-${type}`), ref = adminDb.collection("jobs").doc(`${input.chatId}_job`);
    await ref.set({ tenantId, type: "automation_scheduled_action", status: "retrying", attempts: 1,
      action: { type: ["declared_only", "stale_executor", "missing_owner"].includes(type) ? "create_task" : type, text: "Resultado legado desconhecido", title: "Tarefa legada" }, executeAfter: new Date(0),
      ...(["declared_only", "stale_executor", "missing_owner"].includes(type) ? { internalEffectProtocolVersion: 1, inboundExecutionId: "declared-but-no-proved-executor" } : {}),
      ...(type === "missing_owner" ? { internalEffectExecutorVersion: 1 } : {}),
      ...(type === "stale_executor" ? { internalEffectExecutorVersion: 1, internalEffectExecutorToken: "previous-owner", claimToken: "current-owner" } : {}) });
    assert.equal(await claimScheduledAutomationJob(ref.id, tenantId), null);
    assert.equal((await ref.get()).data()?.status, "reconciliation_required");
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  }
  assert.equal(calls, before);
});

test("real inbound runner commits internal tasks, notes and receipts atomically without claiming a human notification", async () => {
  const input = await inboundFixture("internal-runner"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "create_task", title: "Consultar tamanho", dueInHours: 2 },
    { type: "alert_human", title: "Revisar duvida", text: "Pendencia ficticia" },
    { type: "add_note", text: "Preferencia confirmada na fixture" }, { type: "follow_up", dueInHours: 3 },
  ] });
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => runLeadAutomations(input.context)));
  assert.equal(outcomes.reduce((sum, row) => sum + row.executed, 0), 4); assert.equal(calls, before);
  const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const notes = await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const events = await adminDb.collection("leads").doc(input.leadId).collection("events").get();
  assert.equal(tasks.size, 3); assert.equal(notes.size, 2); assert.equal(events.size, 4);
  assert.ok(tasks.docs.every(task => commercialTaskIndexMatches(task.data())));
  assert.ok(events.docs.some(row => row.data().type === "automation_human_task_created"));
  assert.equal(events.docs.some(row => row.data().type === "automation_human_alerted"), false);
  for (const task of tasks.docs) {
    assert.equal(task.data().createdBy, `automation:${input.automationId}`); assert.equal(task.data().automationGenerated, true);
    const receipt = (await adminDb.collection("jobs").doc(task.data().automationEffectId).get()).data()!;
    assert.equal(receipt.status, "done"); assert.equal(receipt.completionMeaning, "internal_records_committed_not_human_notified");
  }
  assert.equal((await runLeadAutomations(input.context)).executed, 0);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 4);
});

test("concurrent internal-effect replay preserves the same task/note and later human edits", async () => {
  const input = await inboundFixture("internal-replay");
  const definition = { ...input.definition, actions: [{ type: "alert_human", title: "Revisar compra", text: "Nota QA", dueInHours: 2 }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const plan = normalizeAutomationDoc(input.automationId, definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
  const payload = { tenantId, chatId: input.chatId, leadId: input.leadId, sourceMessageId: input.sourceMessageId, claim, actionIndex: 0, action: plan.actions[0] };
  const results = await Promise.all(Array.from({ length: 5 }, () => commitInboundAutomationInternalEffect(payload)));
  assert.equal(new Set(results.map(row => row.receiptId)).size, 1);
  const receipt = (await adminDb.collection("jobs").doc(results[0].receiptId).get()).data()!;
  const taskRef = adminDb.collection("lead_tasks").doc(receipt.taskId), noteRef = adminDb.collection("lead_notes").doc(receipt.noteId);
  const original = (await taskRef.get()).data()!;
  await taskRef.update({ status: "done", title: "Titulo editado por humano" }); await noteRef.update({ text: "Nota revisada" });
  await commitInboundAutomationInternalEffect(payload);
  assert.equal((await taskRef.get()).data()?.status, "done"); assert.equal((await taskRef.get()).data()?.title, "Titulo editado por humano");
  assert.equal((await taskRef.get()).data()?.dueAt.toMillis(), original.dueAt.toMillis()); assert.equal((await noteRef.get()).data()?.text, "Nota revisada");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 1);
});

test("revoked source, changed configuration and expired ownership cannot partially create an internal effect", async () => {
  for (const mutation of ["foreign_source", "config_changed", "expired"]) {
    const input = await inboundFixture(`internal-${mutation}`);
    const definition = { ...input.definition, actions: [{ type: "alert_human", title: "Revisar", text: "Nota atomica" }] };
    await adminDb.collection("automations").doc(input.automationId).set(definition);
    const plan = normalizeAutomationDoc(input.automationId, definition);
    const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
    if (mutation === "foreign_source") await adminDb.collection("messages").doc(input.sourceMessageId).update({ tenantId: "foreign" });
    if (mutation === "config_changed") await adminDb.collection("automations").doc(input.automationId).update({ enabled: false });
    if (mutation === "expired") await adminDb.collection("jobs").doc(claim.id).update({ leaseUntil: new Date(0) });
    await assert.rejects(commitInboundAutomationInternalEffect({ tenantId, chatId: input.chatId, leadId: input.leadId,
      sourceMessageId: input.sourceMessageId, claim, actionIndex: 0, action: plan.actions[0] }), /Fonte\/plano/);
    for (const collection of ["lead_tasks", "lead_notes"]) {
      assert.equal((await adminDb.collection(collection).where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
    }
    assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 0);
  }
});

test("a storage conflict rolls back the task, event and receipt instead of leaving a partial handoff", async () => {
  const input = await inboundFixture("internal-rollback");
  const definition = { ...input.definition, actions: [{ type: "alert_human", title: "Revisar compra", text: "Nota QA" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const plan = normalizeAutomationDoc(input.automationId, definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
  const id = `automation_effect_${createHash("sha256").update(JSON.stringify([claim.id, 0])).digest("hex")}`;
  const noteRef = adminDb.collection("lead_notes").doc(id);
  await noteRef.set({ tenantId, leadId: input.leadId, text: "Conteudo preexistente, nao sobrescrever" });
  await assert.rejects(commitInboundAutomationInternalEffect({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sourceMessageId: input.sourceMessageId, claim, actionIndex: 0, action: plan.actions[0] }), /ALREADY_EXISTS|already exists/i);
  assert.equal((await adminDb.collection("lead_tasks").doc(id).get()).exists, false);
  assert.equal((await adminDb.collection("jobs").doc(id).get()).exists, false);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 0);
  assert.equal((await noteRef.get()).data()?.text, "Conteudo preexistente, nao sobrescrever");
});

test("an interrupted atomic plan resumes through a provider alias without duplicating effects, human edits or quota", async () => {
  const input = await inboundFixture("internal-resume"), before = calls;
  const definition = { ...input.definition, actions: [{ type: "create_task", title: "Revisar tamanho", dueInHours: 2 }, { type: "add_note", text: "Nota seguinte" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  await adminDb.collection("messages").doc(input.sourceMessageId).update({ metaMessageId: "resume-provider-event", channelId });
  const alias = `${input.sourceMessageId}_alias`;
  await adminDb.collection("messages").doc(alias).set({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sender: "client", metaMessageId: "resume-provider-event", channelId, text: "Copia por sync", createdAt: new Date() });
  const admission = await admitInboundAutomationEvent({ ...input.context, normalize: normalizeAutomationDoc, matches: automation => automation.id === input.automationId });
  const plan = normalizeAutomationDoc(input.automationId, definition);
  const first = await claimInboundAutomationExecution({ ...input.context, admissionId: admission.id, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(first);
  await reserveTenantAutomationExecution(tenantId, { jobId: first.id, claimToken: first.token, kind: "inbound" });
  const effect = await commitInboundAutomationInternalEffect({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sourceMessageId: input.sourceMessageId, claim: first, actionIndex: 0, action: plan.actions[0] });
  const taskRef = adminDb.collection("lead_tasks").doc(effect.receiptId);
  await taskRef.update({ status: "done", title: "Revisao humana preservada" });
  const rootRef = adminDb.collection("jobs").doc(first.id), prior = (await rootRef.get()).data()!;
  await rootRef.update({ leaseUntil: new Date(0) });
  const results = await Promise.all(Array.from({ length: 5 }, () => runLeadAutomations({ ...input.context, sourceMessageId: alias })));
  assert.equal(results.reduce((sum, row) => sum + row.executed, 0), 2);
  const root = (await rootRef.get()).data()!;
  assert.equal(root.status, "done"); assert.equal(root.attempts, 2); assert.notEqual(root.claimToken, first.token);
  assert.deepEqual(root.inboundUsageReservation, prior.inboundUsageReservation);
  assert.equal((await taskRef.get()).data()?.status, "done"); assert.equal((await taskRef.get()).data()?.title, "Revisao humana preservada");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 2);
  assert.equal(await finishInboundAutomationExecution(first, "done"), false); assert.equal(calls, before);
});

test("root recovery never overrides revoked configuration, legacy protocol, retry ceiling or explicit reconciliation", async () => {
  for (const mutation of ["config_changed", "legacy", "unknown_protocol", "unsupported_action", "retry_ceiling", "explicit_reconciliation"]) {
    const input = await inboundFixture(`root-${mutation}`);
    const definition = { ...input.definition, actions: mutation === "unsupported_action" ? [{ type: "set_priority", priority: "high" }] : [{ type: "add_note", text: "Nao repetir sem prova" }] };
    await adminDb.collection("automations").doc(input.automationId).set(definition);
    const plan = normalizeAutomationDoc(input.automationId, definition);
    const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
    const ref = adminDb.collection("jobs").doc(claim.id);
    await ref.update({ leaseUntil: new Date(0), ...(mutation === "legacy" ? { executionProtocolVersion: 1 } : {}),
      ...(mutation === "unknown_protocol" ? { executionProtocolVersion: 99 } : {}),
      ...(mutation === "unsupported_action" ? { executionProtocolVersion: 3 } : {}),
      ...(mutation === "retry_ceiling" ? { attempts: 3 } : {}), ...(mutation === "explicit_reconciliation" ? { status: "reconciliation_required" } : {}) });
    if (mutation === "config_changed") await adminDb.collection("automations").doc(input.automationId).update({ description: "Nova regra" });
    assert.equal((await runLeadAutomations(input.context)).executed, 0);
    assert.equal((await ref.get()).data()?.status, "reconciliation_required");
    assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  }
});

test("an expired root completion cannot report success after losing ownership", async () => {
  const input = await inboundFixture("root-finish-expired"), plan = normalizeAutomationDoc(input.automationId, input.definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
  await adminDb.collection("jobs").doc(claim.id).update({ leaseUntil: new Date(0) });
  assert.equal(await finishInboundAutomationExecution(claim, "done"), false);
  assert.equal((await adminDb.collection("jobs").doc(claim.id).get()).data()?.status, "reconciliation_required");
});

test("inbound root quota is charged once with a limited counter and cannot be reused by a stale or wrong-kind claimant", async () => {
  const quotaTenant = `${tenantId}_inbound_quota`, id = `${quotaTenant}_job`, token = "qa-root-owner";
  const ref = adminDb.collection("jobs").doc(id), entitlements = adminDb.collection("tenant_entitlements").doc(quotaTenant);
  const date = new Date(), month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const usage = adminDb.collection("tenant_usage_monthly").doc(`${quotaTenant}_${month}`);
  await entitlements.set({ tenantId: quotaTenant, limits: { automationsPerMonth: 1 } });
  await ref.set({ tenantId: quotaTenant, type: "automation_inbound_execution", status: "processing", claimToken: token, leaseUntil: new Date(Date.now() + 60_000) });
  try {
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: token, kind: "inbound" })));
    assert.ok(results.every(row => row.allowed && row.currentUsage === 1)); assert.equal((await usage.get()).data()?.automationExecutions, 1);
    await ref.update({ claimToken: "qa-root-reclaimed" });
    const recovered = await reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: "qa-root-reclaimed", kind: "inbound" });
    assert.equal(recovered.allowed, true); assert.equal(recovered.currentUsage, 1); assert.equal((await usage.get()).data()?.automationExecutions, 1);
    await assert.rejects(reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: token, kind: "inbound" }), /posse valida/);
    await assert.rejects(reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: "qa-root-reclaimed" }), /posse valida/);
  } finally { await Promise.all([ref.delete(), entitlements.delete(), usage.delete()]); }
});

test("the existing periodic automation consumer recovers an expired atomic root without another inbound delivery", async () => {
  const input = await inboundFixture("root-periodic"), before = calls;
  const definition = { ...input.definition, actions: [{ type: "add_note", text: "Retomada pelo worker" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const otherAutomationId = `${input.automationId}_other`;
  await adminDb.collection("automations").doc(otherAutomationId).set({ ...definition, actions: [{ type: "send_message", text: "Nao executar incidentalmente" }] });
  const admission = await admitInboundAutomationEvent({ ...input.context, normalize: normalizeAutomationDoc,
    matches: automation => [input.automationId, otherAutomationId].includes(automation.id) });
  const plan = normalizeAutomationDoc(input.automationId, definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc, admissionId: admission.id }); assert.ok(claim);
  const ref = adminDb.collection("jobs").doc(claim.id); await ref.update({ leaseUntil: new Date(0) });
  const results = await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  assert.ok(results.some(result => result.inboundRecovery.resumed > 0));
  assert.equal((await ref.get()).data()?.status, "done"); assert.equal((await ref.get()).data()?.attempts, 2);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 1); assert.equal(calls, before);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  assert.equal((await adminDb.collection("jobs").doc(inboundAutomationExecutionId(tenantId, input.sourceMessageId, otherAutomationId)).get()).exists, false);
});

test("periodic recovery quarantines a root whose source vanished, without creating effects", async () => {
  const input = await inboundFixture("root-periodic-revoked");
  const definition = { ...input.definition, actions: [{ type: "add_note", text: "Nao criar" }] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  const plan = normalizeAutomationDoc(input.automationId, definition);
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: plan, normalize: normalizeAutomationDoc }); assert.ok(claim);
  const ref = adminDb.collection("jobs").doc(claim.id);
  await ref.update({ leaseUntil: new Date(0) }); await adminDb.collection("messages").doc(input.sourceMessageId).delete();
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
});

test("a v3 mixed plan reuses message, schedule, note and deadlines after interrupted finalization", async () => {
  const input = await inboundFixture("mixed-recovery"), before = calls;
  const definition = { ...input.definition, actions: [
    { type: "send_message", text: "Resposta QA" }, { type: "follow_up", title: "Retorno QA", waitInHours: 1 },
    { type: "add_note", text: "Nota QA" },
  ] };
  await adminDb.collection("automations").doc(input.automationId).set(definition);
  assert.equal((await runLeadAutomations(input.context)).executed, 3);
  const rootRef = adminDb.collection("jobs").doc(inboundAutomationExecutionId(tenantId, input.sourceMessageId, input.automationId));
  const initialJobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const scheduled = initialJobs.docs.find(row => row.data().type === "automation_scheduled_action")!;
  const dueAt = scheduled.data().executeAfter.toMillis();
  const messages = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, 1); const messageRef = messages.docs[0].ref;
  await rootRef.update({ status: "processing", leaseUntil: new Date(0), executionProtocolVersion: 3 });
  await processChatOutboundJobs({ jobId: messageRef.id, limit: 1 });
  assert.equal((await messageRef.get()).data()?.errorCode, "AUTOMATION_PREPARING"); assert.equal(calls, before);
  const results = await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  assert.ok(results.some(row => row.inboundRecovery.resumed > 0));
  assert.equal((await rootRef.get()).data()?.status, "done"); assert.equal((await rootRef.get()).data()?.attempts, 2);
  assert.equal((await scheduled.ref.get()).data()?.executeAfter.toMillis(), dueAt);
  const jobsAfter = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobsAfter.docs.filter(row => row.data().type === "automation_scheduled_action").length, 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 3);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 1);
  await messageRef.update({ dueAt: new Date(0) });
  await processChatOutboundJobs({ jobId: messageRef.id, limit: 1 }); assert.equal(calls, before + 1);
});

test("root recovery cannot turn an uncertain provider outcome into a second send or a delivered receipt", async () => {
  const input = await inboundFixture("mixed-unknown"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "send_message", text: "Entrega incerta QA" }, { type: "add_note", text: "Registro QA" },
  ] });
  await runLeadAutomations(input.context);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const outboundRef = jobs.docs[0].ref;
  loseAck = true;
  try {
    await processChatOutboundJobs({ jobId: outboundRef.id, limit: 1 });
    assert.equal((await outboundRef.get()).data()?.status, "reconciliation_required");
    const rootRef = adminDb.collection("jobs").doc(inboundAutomationExecutionId(tenantId, input.sourceMessageId, input.automationId));
    await rootRef.update({ status: "processing", leaseUntil: new Date(0) });
    await processPendingAutomationActions({ tenantId, limit: 100 });
    await processChatOutboundJobs({ jobId: outboundRef.id, limit: 1 });
    assert.equal(calls, before + 1); assert.equal((await outboundRef.get()).data()?.status, "reconciliation_required");
    assert.equal((await rootRef.get()).data()?.completionMeaning, "actions_registered_not_external_delivery");
  } finally { loseAck = false; }
});

test("expired recoverable scheduler ownership defers delivery until its receipt is safely finalized", async () => {
  const before = calls, input = await delayedInboundFixture("scheduled-expired-owner", false);
  const claim = await claimScheduledAutomationJob(input.scheduledId, tenantId); assert.ok(claim);
  const accepted = await queueScheduledAutomationMessage({ tenantId, chatId: input.chatId, scheduledJobId: input.scheduledId,
    automationId: input.automationId, automationName: "Entrada QA", text: "Retorno adiado QA", schedulerClaimToken: claim.claimToken });
  await input.scheduledRef.update({ leaseUntil: new Date(0) });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const ref = adminDb.collection("chat_outbound_jobs").doc(accepted.jobId);
  assert.equal((await ref.get()).data()?.errorCode, "AUTOMATION_PREPARING"); assert.equal(calls, before);
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await input.scheduledRef.get()).data()?.status, "done");
  assert.equal(await finishScheduledAutomationJob(claim, { status: "done" }), false);
  await ref.update({ dueAt: new Date(0) }); await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  assert.equal((await ref.get()).data()?.status, "completed"); assert.equal(calls, before + 1);
});

test("delayed inbound delivery retains source/plan authority through the outbox and sends once", async () => {
  const before = calls, input = await delayedInboundFixture("delayed-authority");
  const receipt = (await input.scheduledRef.get()).data()!; assert.ok(receipt.outboundJobId);
  const outbox = (await adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId).get()).data()!;
  assert.equal(outbox.automationScheduledGuardVersion, 1); assert.equal(outbox.automationSourceMessageId, input.sourceMessageId);
  assert.equal(outbox.scheduledAutomationJobId, input.scheduledId);
  await processChatOutboundJobs({ jobId: receipt.outboundJobId, limit: 1 });
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId).get()).data()?.status, "completed");
  await processChatOutboundJobs({ jobId: receipt.outboundJobId, limit: 1 }); assert.equal(calls, before + 1);
});

test("delayed inbound revocation after enqueue blocks provider attempts and stripping guard metadata cannot bypass it", async () => {
  for (const mutation of ["disabled", "source_deleted", "config_changed", "schedule_deleted", "root_reconciliation", "lead_deleted", "strip_guard"]) {
    const before = calls, input = await delayedInboundFixture(`delayed-${mutation}`);
    const receipt = (await input.scheduledRef.get()).data()!, jobRef = adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId);
    if (mutation === "disabled") await adminDb.collection("automations").doc(input.automationId).update({ enabled: false });
    if (mutation === "source_deleted") await adminDb.collection("messages").doc(input.sourceMessageId).delete();
    if (mutation === "config_changed") await adminDb.collection("automations").doc(input.automationId).update({ description: "Nova regra" });
    if (mutation === "schedule_deleted") await input.scheduledRef.delete();
    if (mutation === "root_reconciliation") await adminDb.collection("jobs").doc(receipt.inboundExecutionId).update({ status: "reconciliation_required" });
    if (mutation === "lead_deleted") await adminDb.collection("leads").doc(input.leadId).delete();
    if (mutation === "strip_guard") await jobRef.update({ automationScheduledGuardVersion: FieldValue.delete(), scheduledAutomationJobId: FieldValue.delete(),
      automationSourceMessageId: FieldValue.delete(), automationInboundExecutionId: FieldValue.delete() });
    await processChatOutboundJobs({ jobId: receipt.outboundJobId, limit: 1 });
    const job = (await jobRef.get()).data()!;
    assert.equal(job.status, "dead_letter", mutation); assert.equal(job.providerAttemptStartedAt, undefined, mutation); assert.equal(calls, before, mutation);
  }
});

test("delayed outbox waits for scheduler completion and rejects enqueue by a stale scheduler owner", async () => {
  const before = calls, input = await delayedInboundFixture("delayed-preparing", false);
  const claim = await claimScheduledAutomationJob(input.scheduledId, tenantId); assert.ok(claim);
  const payload = { tenantId, chatId: input.chatId, scheduledJobId: input.scheduledId, automationId: input.automationId,
    automationName: "Entrada QA", text: "Retorno adiado QA" };
  await assert.rejects(queueScheduledAutomationMessage({ ...payload, schedulerClaimToken: "stale-owner" }), /Fonte\/plano/);
  const accepted = await queueScheduledAutomationMessage({ ...payload, schedulerClaimToken: claim.claimToken });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const ref = adminDb.collection("chat_outbound_jobs").doc(accepted.jobId);
  assert.equal((await ref.get()).data()?.errorCode, "AUTOMATION_PREPARING"); assert.equal(calls, before);
  assert.equal(await finishScheduledAutomationJob(claim, { status: "done", messageId: accepted.messageId, outboundJobId: accepted.jobId }), true);
  await ref.update({ dueAt: new Date(0) });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  assert.equal((await ref.get()).data()?.status, "completed"); assert.equal(calls, before + 1);
});

test("inbound automation binds one persisted client event to one accepted action despite concurrent retries", async () => {
  const input = await inboundFixture("inbound-parallel"), before = calls;
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => runLeadAutomations(input.context)));
  assert.equal(outcomes.reduce((sum, row) => sum + row.executed, 0), 1);
  assert.equal(calls, before, "Producer may not directly call the provider");
  const events = await adminDb.collection("leads").doc(input.leadId).collection("events").get();
  assert.equal(events.size, 1);
  const accepted = events.docs[0].data();
  assert.equal(accepted.type, "automation_message_queued"); assert.ok(accepted.outboundJobId);
  await processChatOutboundJobs({ jobId: accepted.outboundJobId, limit: 1 });
  await runLeadAutomations(input.context);
  await processChatOutboundJobs({ jobId: accepted.outboundJobId, limit: 1 });
  assert.equal(calls, before + 1);
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(message.automationSourceMessageId, input.sourceMessageId); assert.equal(message.automationGenerated, true);
  assert.equal(message.senderId, `automation:${input.automationId}`);
  const run = (await adminDb.collection("jobs").doc(inboundAutomationExecutionId(tenantId, input.sourceMessageId, input.automationId)).get()).data()!;
  assert.equal(run.status, "done"); assert.equal(run.completionMeaning, "actions_registered_not_external_delivery");
});

test("accepted inbound plan is not extended by edits, while a new client event remains a new occurrence", async () => {
  const input = await inboundFixture("inbound-plan"), before = calls;
  await runLeadAutomations(input.context);
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "send_message", text: "Texto novo" }, { type: "send_message", text: "Segunda mensagem" },
  ] });
  assert.equal((await runLeadAutomations(input.context)).executed, 0);
  const firstMessages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(firstMessages.docs.filter(row => row.data().automationGenerated).length, 1);
  const nextId = `${input.sourceMessageId}_next`;
  await adminDb.collection("messages").doc(nextId).set({ tenantId, chatId: input.chatId, leadId: input.leadId, sender: "client", text: "Outra duvida", createdAt: new Date() });
  assert.equal((await runLeadAutomations({ ...input.context, sourceMessageId: nextId })).executed, 2);
  assert.equal(calls, before);
  const run = (await adminDb.collection("jobs").doc(inboundAutomationExecutionId(tenantId, input.sourceMessageId, input.automationId)).get()).data()!;
  assert.equal(run.plan.actions.length, 1); assert.equal(run.plan.actions[0].text, "Vou ajudar voce");
});

test("event admission freezes the eligible set: newly created or newly matching automations cannot join a replay", async () => {
  const input = await inboundFixture("inbound-manifest"), before = calls;
  const initiallyExcluded = `${input.automationId}_excluded`, newlyCreated = `${input.automationId}_new`;
  await adminDb.collection("automations").doc(initiallyExcluded).set({ ...input.definition, conditions: { sourceIn: ["not-this-source"] } });
  assert.equal((await runLeadAutomations(input.context)).executed, 1);
  await adminDb.collection("automations").doc(initiallyExcluded).update({ conditions: input.definition.conditions });
  await adminDb.collection("automations").doc(newlyCreated).set(input.definition);
  assert.equal((await runLeadAutomations(input.context)).executed, 0);
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.docs.filter(row => row.data().automationGenerated).length, 1);
  const admissions = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const admission = admissions.docs.find(row => row.data().type === "automation_inbound_admission")!.data();
  assert.deepEqual(admission.eligible.map((entry: { id: string }) => entry.id), [input.automationId]);
  const nextId = `${input.sourceMessageId}_next`;
  await adminDb.collection("messages").doc(nextId).set({ tenantId, chatId: input.chatId, leadId: input.leadId, sender: "client", text: "Nova entrada", createdAt: new Date() });
  assert.equal((await runLeadAutomations({ ...input.context, sourceMessageId: nextId })).executed, 3);
  assert.equal(calls, before);
});

test("empty eligibility is durable and uses persisted lead/channel rather than caller hints", async () => {
  const input = await inboundFixture("inbound-empty"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ conditions: { ...input.definition.conditions, channelIn: ["instagram"] } });
  assert.equal((await runLeadAutomations({ ...input.context, channel: "instagram" })).executed, 0);
  await adminDb.collection("automations").doc(input.automationId).update({ conditions: input.definition.conditions });
  assert.equal((await runLeadAutomations(input.context)).executed, 0);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 1); assert.deepEqual(jobs.docs[0].data().eligible, []);
  assert.equal(calls, before);
});

test("configuration changed after admission but before claim cannot replace the frozen action", async () => {
  const input = await inboundFixture("inbound-admission-drift"), before = calls;
  await admitInboundAutomationEvent({ ...input.context, normalize: normalizeAutomationDoc,
    matches: automation => automation.id === input.automationId });
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [{ type: "send_message", text: "Substituicao posterior" }] });
  await assert.rejects(runLeadAutomations(input.context), /depois da admissao/);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 0); assert.equal(calls, before);
});

test("admission rejects more than 120 eligible rules instead of silently authorizing a partial set", async () => {
  const input = await inboundFixture("inbound-overflow"), before = calls;
  const refs = Array.from({ length: 121 }, (_, index) => adminDb.collection("automations").doc(`${input.automationId}_extra_${index}`));
  const batch = adminDb.batch();
  for (const ref of refs) batch.create(ref, { ...input.definition, enabled: true });
  await batch.commit();
  try {
    await assert.rejects(runLeadAutomations(input.context), /120 automacoes elegiveis/);
    const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 0, "No partial admission or effect may survive the failed transaction");
    assert.equal(calls, before);
  } finally {
    const cleanup = adminDb.batch(); for (const ref of refs) cleanup.delete(ref); await cleanup.commit();
  }
});

test("foreign, agent-authored or unrelated source cannot trigger an inbound send", async () => {
  const input = await inboundFixture("inbound-scope"), before = calls;
  for (const patch of [{ tenantId: "foreign", sender: "client", chatId: input.chatId },
    { tenantId, sender: "agent", chatId: input.chatId }, { tenantId, sender: "client", chatId: "other" }]) {
    await adminDb.collection("messages").doc(input.sourceMessageId).update(patch);
    await assert.rejects(runLeadAutomations(input.context), /Fonte da automacao/);
  }
  assert.equal(calls, before);
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(jobs.size, 0);
});

test("expired legacy message claim cannot enqueue and becomes reconciliation without v3 recovery proof", async () => {
  const input = await inboundFixture("inbound-expired"), before = calls;
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, input.definition), normalize: normalizeAutomationDoc });
  assert.ok(claim);
  await adminDb.collection("jobs").doc(claim.id).update({ leaseUntil: new Date(0), executionProtocolVersion: 2 });
  await assert.rejects(queueInboundAutomationMessage({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sourceMessageId: input.sourceMessageId, actionIndex: 0, claim, automationId: input.automationId,
    automationName: "Entrada QA", text: "Vou ajudar voce" }), /Fonte\/plano/);
  assert.equal((await runLeadAutomations(input.context)).executed, 0);
  assert.equal((await adminDb.collection("jobs").doc(claim.id).get()).data()?.status, "reconciliation_required");
  assert.equal(calls, before);
});

test("source deletion and configuration changes after enqueue block delivery before any provider attempt", async () => {
  for (const mutation of ["source_deleted", "config_changed", "disabled"]) {
    const input = await inboundFixture(`inbound-${mutation}`), before = calls;
    await runLeadAutomations(input.context);
    const events = await adminDb.collection("leads").doc(input.leadId).collection("events").get();
    const jobId = events.docs[0].data().outboundJobId;
    if (mutation === "source_deleted") await adminDb.collection("messages").doc(input.sourceMessageId).delete();
    else await adminDb.collection("automations").doc(input.automationId).update(mutation === "disabled" ? { enabled: false } : { description: "Edicao posterior" });
    await processChatOutboundJobs({ jobId, limit: 1 });
    const job = (await adminDb.collection("chat_outbound_jobs").doc(jobId).get()).data()!;
    assert.equal(calls, before); assert.equal(job.providerAttemptStartedAt, undefined);
    assert.equal(job.status, "dead_letter");
  }
});

test("webhook and sync copies of the same provider event share one occurrence and cannot double-send", async () => {
  const input = await inboundFixture("inbound-alias"), before = calls;
  await adminDb.collection("messages").doc(input.sourceMessageId).update({ metaMessageId: "same-provider-event", channelId });
  const alias = `${input.sourceMessageId}_sync`;
  await adminDb.collection("messages").doc(alias).set({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sender: "client", text: "Mesma entrada por sync", metaMessageId: "same-provider-event", channelId, createdAt: new Date() });
  const outcomes = await Promise.all([runLeadAutomations(input.context), runLeadAutomations({ ...input.context, sourceMessageId: alias })]);
  assert.equal(outcomes.reduce((sum, row) => sum + row.executed, 0), 1);
  assert.equal(calls, before);
  const events = await adminDb.collection("leads").doc(input.leadId).collection("events").get();
  assert.equal(events.size, 1);
  await processChatOutboundJobs({ jobId: events.docs[0].data().outboundJobId, limit: 1 });
  assert.equal(calls, before + 1);
});

test("outbox waits for a live inbound producer to finish instead of failing or sending early", async () => {
  const input = await inboundFixture("inbound-preparing"), before = calls;
  const claim = await claimInboundAutomationExecution({ ...input.context, automation: normalizeAutomationDoc(input.automationId, input.definition), normalize: normalizeAutomationDoc });
  assert.ok(claim);
  const accepted = await queueInboundAutomationMessage({ tenantId, chatId: input.chatId, leadId: input.leadId,
    sourceMessageId: input.sourceMessageId, claim, actionIndex: 0, automationId: input.automationId, automationName: "Entrada QA", text: "Vou ajudar voce" });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  let job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.status, "retrying"); assert.equal(job.errorCode, "AUTOMATION_PREPARING");
  assert.equal(job.providerAttemptStartedAt, undefined); assert.equal(calls, before);
  await finishInboundAutomationExecution(claim, "done");
  await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).update({ dueAt: new Date(0) });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()!;
  assert.equal(job.status, "completed"); assert.equal(calls, before + 1);
});

test("removing inbound metadata cannot downgrade an accepted message into an unguarded legacy send", async () => {
  const input = await inboundFixture("inbound-downgrade"), before = calls;
  await runLeadAutomations(input.context);
  const events = await adminDb.collection("leads").doc(input.leadId).collection("events").get();
  const jobId = events.docs[0].data().outboundJobId;
  await adminDb.collection("chat_outbound_jobs").doc(jobId).update({
    automationSourceMessageId: FieldValue.delete(), automationInboundExecutionId: FieldValue.delete(),
  });
  await processChatOutboundJobs({ jobId, limit: 1 });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(jobId).get()).data()!;
  assert.equal(calls, before); assert.equal(job.providerAttemptStartedAt, undefined); assert.equal(job.status, "dead_letter");
});

test("waiting occurrences deduplicate retries but preserve independent actions and later client messages", async () => {
  const fixtureInput = await fixture("waiting-identity"), before = calls;
  const input = { tenantId, chatId: fixtureInput.chatId, automationId: "waiting-qa", automationName: "Espera QA",
    text: "Estou aqui para ajudar", waitingSinceMs: Date.now(), actionIndex: 0 };
  const receipts = await Promise.all(Array.from({ length: 5 }, () => queueWaitingReplyAutomationMessage(input)));
  assert.equal(new Set(receipts.map(row => row.jobId)).size, 1); assert.equal(calls, before);
  const next = await queueWaitingReplyAutomationMessage({ ...input, waitingSinceMs: input.waitingSinceMs + 1 });
  const otherAction = await queueWaitingReplyAutomationMessage({ ...input, actionIndex: 1 });
  assert.notEqual(next.jobId, receipts[0].jobId); assert.notEqual(otherAction.jobId, receipts[0].jobId);
  await assert.rejects(queueWaitingReplyAutomationMessage({ ...input, text: "Texto alterado" }), /outro conteudo/);
  await assert.rejects(queueWaitingReplyAutomationMessage({ ...input, waitingSinceMs: Number.NaN }), /espera invalida/);
  await processChatOutboundJobs({ jobId: receipts[0].jobId, limit: 1 });
  await processChatOutboundJobs({ jobId: receipts[0].jobId, limit: 1 });
  assert.equal(calls, before + 1);
  const message = (await adminDb.collection("messages").doc(receipts[0].messageId).get()).data()!;
  assert.equal(message.automationGenerated, true); assert.equal(message.aiGenerated, false);
  assert.equal(message.automationTrigger, "waiting_for_reply");
  assert.equal(message.scheduledAutomationJobId, undefined);
});

test("waiting watchdog queues its message without a direct provider call or a fictional sent receipt", async () => {
  const input = await fixture("waiting-runner"), before = calls, leadId = `${tenantId}_waiting-lead`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente ficticio", pipelineStage: "captado" });
  await adminDb.collection("chats").doc(input.chatId).update({ leadId, lastClientMessageAt: new Date(Date.now() - 7200_000) });
  await adminDb.collection("automations").doc(`${tenantId}_waiting-auto`).set({ tenantId, name: "Espera QA", enabled: true,
    status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 },
    actions: [{ type: "send_message", text: "Como posso ajudar?" }] });
  const first = await processWaitingReplyAutomations({ tenantId, limit: 100 });
  assert.equal(first.executed, 1); assert.equal(calls, before);
  const events = await adminDb.collection("leads").doc(leadId).collection("events").get();
  const receipt = events.docs.find(doc => doc.data().type === "automation_message_queued")?.data();
  assert.ok(receipt?.outboundJobId); assert.equal(events.docs.some(doc => doc.data().type === "automation_message_sent"), false);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId).get()).data()?.status, "ready");
  await processWaitingReplyAutomations({ tenantId, limit: 100 });
  assert.equal((await adminDb.collection("leads").doc(leadId).collection("events").get()).size, 1);
  assert.equal(calls, before);
});

test("lost acknowledgement of a waiting message remains uncertain and cannot authorize another send", async () => {
  const source = await fixture("waiting-unknown"), before = calls;
  const input = { tenantId, chatId: source.chatId, automationId: "waiting-unknown", automationName: "Espera QA",
    text: "Posso ajudar?", waitingSinceMs: Date.now() - 7200_000, actionIndex: 0 };
  const accepted = await queueWaitingReplyAutomationMessage(input);
  loseAck = true;
  try {
    await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
    const replay = await queueWaitingReplyAutomationMessage(input);
    assert.equal(replay.jobId, accepted.jobId);
    await processChatOutboundJobs({ jobId: replay.jobId, limit: 1 });
    assert.equal(calls, before + 1);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.status, "reconciliation_required");
  } finally { loseAck = false; }
});
test("concurrent retries accept one message and deliver once without impersonating a human or pausing AI", async () => {
  const input = await fixture("parallel"), before = calls;
  const receipts = await Promise.all(Array.from({ length: 5 }, () => queueScheduledAutomationMessage(input)));
  assert.equal(new Set(receipts.map(row => row.jobId)).size, 1);
  const accepted = receipts[0];
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  assert.equal(calls, before + 1);
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data()!;
  assert.equal(message.automationGenerated, true); assert.notEqual(message.aiGenerated, true);
  assert.equal(message.senderId, "automation:qa-automation"); assert.equal(message.deliveryStatus, "sent");
  assert.equal((await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()?.aiEnabled, true);
  assert.ok(!(await adminDb.collection("chats").doc(input.chatId).get()).data()?.assignedTo);
  const observations = await adminDb.collection("crm_observation_jobs").where("tenantId", "==", tenantId).get();
  assert.ok(observations.docs.some(row => row.data().messageId === accepted.messageId && row.data().source === "automation_outbound"));
});
test("new occurrences can send identical text, but a changed accepted payload or destination conflicts", async () => {
  const input = await fixture("identity");
  const first = await queueScheduledAutomationMessage(input);
  const next = await queueScheduledAutomationMessage({ ...input, scheduledJobId: `${input.scheduledJobId}-next` });
  assert.notEqual(first.jobId, next.jobId);
  await assert.rejects(queueScheduledAutomationMessage({ ...input, text: "Changed" }), /outro conteudo/);
  const other = await fixture("other-chat");
  await assert.rejects(queueScheduledAutomationMessage({ ...input, chatId: other.chatId }), /outro conteudo/);
  await assert.rejects(queueScheduledAutomationMessage({ ...input, tenantId: `${tenantId}_foreign` }), /Conversa nao encontrada/);
});
test("unknown provider outcome remains in reconciliation and is not blindly resent", async () => {
  const input = await fixture("unknown"), before = calls;
  const accepted = await queueScheduledAutomationMessage(input);
  loseAck = true;
  try {
    await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
    const replay = await queueScheduledAutomationMessage(input);
    await processChatOutboundJobs({ jobId: replay.jobId, limit: 1 });
    assert.equal(calls, before + 1);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.status, "reconciliation_required");
  } finally { loseAck = false; }
});
test("automation text is not treated as a human's evidence to advance the commercial stage", async () => {
  const input = await fixture("crm"), leadId = `${tenantId}_crm-lead`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente ficticio", pipelineStage: "captado", stage: "captado" });
  await adminDb.collection("chats").doc(input.chatId).update({ leadId });
  const accepted = await queueScheduledAutomationMessage({ ...input, text: "Enviei a proposta" });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).data()?.pipelineStage, "captado");
  assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.automationGenerated, true);
});
test("scheduled automation runner records queued receipt, not a fictional delivery, and reuses it on retry", async () => {
  const input = await fixture("scheduler"), before = calls, leadId = `${tenantId}_lead`, jobId = `${tenantId}_scheduled`;
  const leadRef = adminDb.collection("leads").doc(leadId);
  await leadRef.set({ tenantId, nome: "Cliente QA", pipelineStage: "captado" });
  const jobRef = adminDb.collection("jobs").doc(jobId);
  await jobRef.set({ tenantId, leadId, type: "automation_scheduled_action", status: "pending",
    automationId: input.automationId, automationName: input.automationName, trigger: "message_received",
    chatId: input.chatId, action: { type: "send_message", text: input.text }, executeAfter: new Date(0), attempts: 0 });
  const result = await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal(result.completed, 1); assert.equal(result.failed, 0); assert.equal(calls, before);
  const events = await leadRef.collection("events").get();
  const receipt = events.docs.find(row => row.data().type === "automation_message_queued")?.data();
  assert.ok(receipt?.outboundJobId); assert.ok(receipt?.messageId);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(receipt.outboundJobId).get()).data()?.status, "ready");
  await jobRef.update({ status: "retrying" });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, 1); assert.equal(calls, before);
  assert.equal((await leadRef.collection("events").get()).size, 1);
  assert.equal((await jobRef.get()).data()?.outboundJobId, receipt.outboundJobId);
});

test("inbound delayed actions have one stable job per accepted action and deadlines anchored to the original run", async () => {
  const input = await inboundFixture("scheduled-inbound"), before = calls;
  await adminDb.collection("automations").doc(input.automationId).update({ actions: [
    { type: "send_message", text: "Retorno futuro", waitInHours: 1 },
    { type: "send_message", text: "Outro retorno", waitInHours: 2 },
  ] });
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => runLeadAutomations(input.context)));
  assert.equal(outcomes.reduce((sum, row) => sum + row.executed, 0), 2);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  const scheduled = jobs.docs.filter(row => row.data().type === "automation_scheduled_action");
  assert.equal(scheduled.length, 2); assert.notEqual(scheduled[0].id, scheduled[1].id);
  const root = jobs.docs.find(row => row.data().type === "automation_inbound_execution")!;
  for (const job of scheduled) {
    const row = job.data(); assert.equal(row.inboundExecutionId, root.id);
    assert.equal(row.executeAfter.toMillis(), root.data().createdAt.toMillis() + row.action.waitInHours * 3600_000);
  }
  await runLeadAutomations(input.context);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 2);
  assert.equal(calls, before);
});

test("expired message scheduler lease is reclaimed but stale completion cannot overwrite the new owner", async () => {
  const input = await fixture("scheduled-lease"), leadId = `${input.chatId}_lead`, id = `${input.chatId}_job`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId });
  const ref = adminDb.collection("jobs").doc(id);
  await ref.set({ tenantId, leadId, chatId: input.chatId, type: "automation_scheduled_action", status: "pending",
    action: { type: "send_message", text: "Teste" }, executeAfter: new Date(0), attempts: 0 });
  const first = await claimScheduledAutomationJob(id, tenantId); assert.ok(first); assert.equal(first.attempts, 1);
  assert.equal(await claimScheduledAutomationJob(id, tenantId), null);
  assert.equal(await claimScheduledAutomationJob(id, "another-tenant"), null);
  await ref.update({ leaseUntil: new Date(0) });
  const second = await claimScheduledAutomationJob(id, tenantId); assert.ok(second); assert.equal(second.attempts, 2);
  assert.notEqual(first.claimToken, second.claimToken);
  assert.equal(await finishScheduledAutomationJob(first, { status: "done" }), false);
  assert.equal((await ref.get()).data()?.status, "processing");
  assert.equal(await finishScheduledAutomationJob(second, { status: "done" }), true);
});

test("expired unsafe or legacy scheduler work requires reconciliation instead of repeating an unknown effect", async () => {
  for (const [name, action, version] of [["task", { type: "create_task", title: "Nao duplicar" }, 1],
    ["legacy", { type: "send_message", text: "Entrega desconhecida" }, 0]] as const) {
    const input = await fixture(`scheduled-${name}`), id = `${input.chatId}_job`, ref = adminDb.collection("jobs").doc(id);
    await ref.set({ tenantId, type: "automation_scheduled_action", status: "processing", action,
      executeAfter: new Date(0), leaseUntil: new Date(0), schedulerProtocolVersion: version });
    assert.equal(await claimScheduledAutomationJob(id, tenantId), null);
    assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  }
});

test("scheduler recovery after queued and delivered text reuses the receipt without another provider call", async () => {
  const input = await fixture("scheduled-recover"), before = calls, leadId = `${input.chatId}_lead`, id = `${input.chatId}_job`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "QA" });
  const ref = adminDb.collection("jobs").doc(id);
  await ref.set({ tenantId, leadId, chatId: input.chatId, type: "automation_scheduled_action", status: "pending",
    automationId: input.automationId, automationName: input.automationName, trigger: "message_received",
    action: { type: "send_message", text: "Retorno QA" }, executeAfter: new Date(0), attempts: 0 });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  const accepted = (await ref.get()).data()!; assert.ok(accepted.outboundJobId);
  assert.equal(accepted.schedulerUsageReservation.allowed, true);
  await processChatOutboundJobs({ jobId: accepted.outboundJobId, limit: 1 }); assert.equal(calls, before + 1);
  await ref.update({ status: "processing", leaseUntil: new Date(0), claimToken: "interrupted" });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await ref.get()).data()?.outboundJobId, accepted.outboundJobId);
  assert.deepEqual((await ref.get()).data()?.schedulerUsageReservation, accepted.schedulerUsageReservation, "Recovery reuses the original quota reservation");
  await processChatOutboundJobs({ jobId: accepted.outboundJobId, limit: 1 }); assert.equal(calls, before + 1);
  assert.equal((await adminDb.collection("leads").doc(leadId).collection("events").get()).size, 1);
});

test("scheduled retries reserve limited quota once atomically, including a reclaimed lease", async () => {
  const quotaTenant = `${tenantId}_quota`, id = `${quotaTenant}_job`;
  const ref = adminDb.collection("jobs").doc(id), entitlements = adminDb.collection("tenant_entitlements").doc(quotaTenant);
  const date = new Date(), month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const usage = adminDb.collection("tenant_usage_monthly").doc(`${quotaTenant}_${month}`);
  await entitlements.set({ tenantId: quotaTenant, limits: { automationsPerMonth: 2 } });
  await ref.set({ tenantId: quotaTenant, type: "automation_scheduled_action", status: "pending", action: { type: "send_message" }, executeAfter: new Date(0) });
  try {
    const claim = await claimScheduledAutomationJob(id, quotaTenant); assert.ok(claim);
    const results = await Promise.all(Array.from({ length: 5 }, () => reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: claim.claimToken })));
    assert.ok(results.every(result => result.allowed && result.currentUsage === 1));
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    await ref.update({ leaseUntil: new Date(0) });
    const reclaimed = await claimScheduledAutomationJob(id, quotaTenant); assert.ok(reclaimed);
    await assert.rejects(reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: claim.claimToken }), /posse valida/);
    const recovered = await reserveTenantAutomationExecution(quotaTenant, { jobId: id, claimToken: reclaimed.claimToken });
    assert.equal(recovered.currentUsage, 1); assert.equal((await usage.get()).data()?.automationExecutions, 1);
  } finally {
    await Promise.all([ref.delete(), entitlements.delete(), usage.delete()]);
  }
});

test("scheduler quota refusal finishes without registering or reporting a message delivery", async () => {
  const quotaTenant = `${tenantId}_quota_denied`, id = `${quotaTenant}_job`, before = calls;
  const ref = adminDb.collection("jobs").doc(id), entitlements = adminDb.collection("tenant_entitlements").doc(quotaTenant);
  const date = new Date(), month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  const usage = adminDb.collection("tenant_usage_monthly").doc(`${quotaTenant}_${month}`);
  await entitlements.set({ tenantId: quotaTenant, limits: { automationsPerMonth: 1 } });
  await usage.set({ tenantId: quotaTenant, monthRef: month, automationExecutions: 1 });
  await ref.set({ tenantId: quotaTenant, leadId: "fixture-no-delivery", type: "automation_scheduled_action", status: "pending",
    automationId: "quota-fixture", action: { type: "send_message", text: "Nao deve enviar" }, executeAfter: new Date(0) });
  try {
    const result = await processPendingAutomationActions({ tenantId: quotaTenant });
    assert.equal(result.completed, 1); assert.equal(result.failed, 0);
    const row = (await ref.get()).data()!;
    assert.equal(row.status, "done"); assert.equal(row.actionsExecuted, 0); assert.equal(row.outboundJobId, undefined);
    assert.equal(row.lastError, "tenant_automation_limit_exceeded"); assert.equal(calls, before);
    const outbox = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", quotaTenant).get(); assert.equal(outbox.size, 0);
  } finally {
    const jobs = await adminDb.collection("jobs").where("tenantId", "==", quotaTenant).get();
    await Promise.all([...jobs.docs.map(row => row.ref.delete()), entitlements.delete(), usage.delete()]);
  }
});
