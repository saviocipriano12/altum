import assert from "node:assert/strict";
import { after, test } from "node:test";
import { generateBusinessBlueprint } from "../lib/business-blueprint.ts";
import { getDefaultPipelineStages, getPipelineStageLabel } from "../lib/pipeline.ts";
import { crmPipelineStageOptions } from "../lib/crm-pipeline-view.ts";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { enqueueIncomingMessageJob, processAiJobNow } = await import("../lib/server/ai/queue.ts");
const { crmObservationJobId, processConversationCommercialObservationJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const { saveTenantPipelineStages, loadTenantPipelineConfig } = await import("../lib/server/crm/pipeline.ts");
const { applyBusinessBlueprint } = await import("../lib/server/business-blueprint-provisioning.ts");
const tenantId = `qa_passive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const chatId = `${tenantId}_chat`;
const leadId = `${tenantId}_lead`;
const base = Date.now() - 1000000;
await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { responsePaused: true } });
await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente fictício", pipelineStage: "captado", createdAt: new Date(base) });
await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp" });
await adminDb.collection("chat_state").doc(chatId).set({ tenantId, chatId, aiEnabled: false, pauseReason: "human_takeover" });
async function message(id: string, text: string, at: number, extra: Record<string, unknown> = {}) {
  await adminDb.collection("messages").doc(id).set({ tenantId, chatId, leadId, sender: "client", text, createdAt: new Date(at), ...extra });
}
after(async () => {
  const leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).get();
  for (const lead of leads.docs) {
    const events = await lead.ref.collection("events").get();
    await Promise.all(events.docs.map((event) => event.ref.delete()));
  }
  for (const collection of ["tenant_settings", "chats", "messages", "chat_state", "leads", "lead_tasks", "ai_logs", "audit_logs", "crm_conversation_observations", "crm_observation_jobs", "jobs", "ai_conversation_turns", "pipeline", "automations", "kb_docs"]) {
    const snapshot = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  await adminDb.terminate();
});

test("long conversation reads recent buyer facts with exact source even with replies paused", async () => {
  const batch = adminDb.batch();
  for (let index = 0; index < 100; index++) batch.set(adminDb.collection("messages").doc(`${tenantId}_old_${index}`), { tenantId, chatId, leadId, sender: "client", text: "Olá", createdAt: new Date(base + index) });
  await batch.commit();
  const factId = `${tenantId}_new_fact`;
  const humanId = `${tenantId}_human`;
  await message(factId, "Meu orçamento é R$ 7.000 reais. Minha cidade é Recife", base + 200);
  await message(humanId, "Tudo bem", base + 201, { sender: "agent" });
  const result = await observe({ tenantId, chatId, messageId: humanId });
  assert.equal(result.observed, true);
  const lead = (await adminDb.collection("leads").doc(leadId).get()).data()!;
  assert.equal(lead.customFields.orcamento, "7.000 reais");
  assert.equal(lead.customFields.cidade, "Recife");
  assert.equal(lead.aiFieldEvidence["custom.orcamento"].messageId, factId);
  assert.equal(lead.aiFieldEvidence["custom.orcamento"].source, "customer_message");
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
});

test("older job and greetings cannot erase newer evidence or a human-entered value", async () => {
  const newest = `${tenantId}_newest`;
  await message(newest, "Meu orçamento é 9000 reais", base + 300);
  await observe({ tenantId, chatId, messageId: newest });
  const earlier = `${tenantId}_earlier`;
  await message(earlier, "Meu orçamento é 2000 reais", base + 150);
  await observe({ tenantId, chatId, messageId: earlier });
  let lead = (await adminDb.collection("leads").doc(leadId).get()).data()!;
  assert.equal(lead.customFields.orcamento, "9000 reais");
  assert.equal(lead.aiLastConversationMessageId, newest);
  await adminDb.collection("leads").doc(leadId).set({ customFields: { cidade: "Cidade manual" }, aiFieldEvidence: { "custom.cidade": { source: "manual" } }, aiNextAction: "Ligar sexta às 14h" }, { merge: true });
  const greeting = `${tenantId}_greeting`;
  await message(greeting, "Oi", base + 400);
  await observe({ tenantId, chatId, messageId: greeting });
  lead = (await adminDb.collection("leads").doc(leadId).get()).data()!;
  assert.equal(lead.customFields.cidade, "Cidade manual");
  assert.equal(lead.aiNextAction, "Ligar sexta às 14h");
});

test("every inbound retains an observation job even when the response queue supersedes it", async () => {
  const firstId = `${tenantId}_burst1`;
  const secondId = `${tenantId}_burst2`;
  await message(firstId, "Quero contratar manutenção preventiva", base + 500);
  await message(secondId, "Obrigado", base + 501);
  const first = await enqueueIncomingMessageJob({ tenantId, chatId, messageId: firstId, debounceMs: 0 });
  await enqueueIncomingMessageJob({ tenantId, chatId, messageId: secondId, debounceMs: 0 });
  await processAiJobNow(first.jobId);
  assert.equal((await adminDb.collection("jobs").doc(first.jobId).get()).data()?.decisionReason, "superseded_by_newer_inbound");
  for (const id of [firstId, secondId]) {
    const jobId = crmObservationJobId(tenantId, id);
    assert.equal((await adminDb.collection("crm_observation_jobs").doc(jobId).get()).exists, true);
    const processed = await processConversationCommercialObservationJobs({ jobId, limit: 1 });
    assert.equal(processed.results[0]?.status, "completed");
  }
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).data()?.customFields.servico_interesse, "manutenção preventiva");
});

test("duplicate ingress readmits a changed source atomically even if the reply job already exists", async () => {
  const messageId = `${tenantId}_deduped_revision`;
  await message(messageId, "Meu orçamento é 3100 reais", base + 550);
  const first = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, debounceMs: 0 });
  const ref = adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, messageId));
  const original = (await ref.get()).data()!.sourceBinding;
  await adminDb.collection("messages").doc(messageId).update({ text: "Meu orçamento é 4200 reais" });
  const second = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, debounceMs: 0 });
  assert.equal(first.jobId, second.jobId); assert.equal(second.created, false);
  const current = (await ref.get()).data()!.sourceBinding;
  assert.equal(current.messageGeneration, original.messageGeneration);
  assert.notEqual(current.messageRevision, original.messageRevision);
  assert.equal((await processConversationCommercialObservationJobs({ jobId: ref.id })).results[0].status, "completed");
  assert.match((await adminDb.collection("leads").doc(leadId).get()).data()!.customFields.orcamento, /4200/);
});

test("a delayed reply worker cannot recreate a CRM observation for a replaced buyer message", async () => {
  const messageId = `${tenantId}_stale_reply`;
  await message(messageId, "Meu orçamento é 9000 reais", base + 560);
  const queued = await enqueueIncomingMessageJob({ tenantId, chatId, messageId, debounceMs: 0 });
  const crmJob = adminDb.collection("crm_observation_jobs").doc(crmObservationJobId(tenantId, messageId));
  await crmJob.delete();
  const ref = adminDb.collection("messages").doc(messageId), original = (await ref.get()).data()!;
  await ref.delete(); await ref.set(original);
  const baseline = await adminDb.collection("leads").doc(leadId).get();
  const result = await processAiJobNow(queued.jobId);
  assert.equal(result?.skipped, true);
  assert.equal((await adminDb.collection("jobs").doc(queued.jobId).get()).data()?.decisionReason, "source_changed_since_admission");
  assert.equal((await crmJob.get()).exists, false);
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).updateTime!.isEqual(baseline.updateTime!), true);
});

test("foreign message and legacy group linked to lead cannot modify the CRM", async () => {
  const baseline = await adminDb.collection("leads").doc(leadId).get();
  const foreignId = `${tenantId}_foreign`;
  const groupId = `${tenantId}_group`;
  await message(foreignId, "Meu orçamento é 50000 reais", base + 600, { tenantId: "not-this-tenant" });
  await message(groupId, "Meu orçamento é 80000 reais", base + 601);
  assert.equal((await observe({ tenantId, chatId, messageId: foreignId })).observed, false);
  await adminDb.collection("messages").doc(foreignId).delete();
  await adminDb.collection("chats").doc(chatId).set({ isGroup: true }, { merge: true });
  assert.equal((await observe({ tenantId, chatId, messageId: groupId })).observed, false);
  await adminDb.collection("chats").doc(chatId).set({ isGroup: false }, { merge: true });
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).updateTime!.isEqual(baseline.updateTime!), true);
});

test("AI text alone cannot authorize stage advancement in the passive observer", async () => {
  const id = `${tenantId}_ai_commitment`;
  await message(id, "Enviei a proposta comercial", base + 700, { sender: "agent", aiGenerated: true });
  const result = await observe({ tenantId, chatId, messageId: id });
  assert.equal(result.observed, true);
  assert.equal(result.advancedStage, false);
  const pendingId = `${tenantId}_not_sent`;
  await message(pendingId, "Enviei a proposta comercial", base + 701, { sender: "agent", status: "queued" });
  assert.equal((await observe({ tenantId, chatId, messageId: pendingId })).observed, false);
});

test("saving a customized business funnel survives subsequent automatic blueprint application", async () => {
  const stages = getDefaultPipelineStages().map((stage, index) => ({ ...stage, label: `Minha etapa ${index}` }));
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages(), blueprintManaged: true });
  await saveTenantPipelineStages({ tenantId, stages, actorId: "qa-owner", actorName: "Dono fictício" });
  const blueprint = generateBusinessBlueprint({ company: { name: "Negócio fictício", segment: "Serviços" }, offer: { offeringType: "services", summary: "manutenção" }, sales: { salesMotion: "appointment", serviceStyle: "human" } });
  const applied = await applyBusinessBlueprint({ tenantId, blueprint, actorId: "qa-setup", actorName: "Implantação fictícia" });
  assert.equal(applied.pipelinePreserved, true);
  assert.deepEqual((await loadTenantPipelineConfig(tenantId)).stages.map((stage) => stage.label), stages.map((stage) => stage.label));
  const persisted = (await adminDb.collection("pipeline").doc(tenantId).get()).data()!;
  assert.equal(persisted.blueprintManaged, false);
  assert.equal(persisted.starterKitManaged, false);
});

test("concurrent setup and manual funnel save cannot restore the automatic model", async () => {
  const blueprint = generateBusinessBlueprint({ company: { name: "QA", segment: "Serviços" }, offer: { offeringType: "services", summary: "manutenção" }, sales: { salesMotion: "appointment", serviceStyle: "human" } });
  for (let iteration = 0; iteration < 3; iteration++) {
    const stages = getDefaultPipelineStages().map((stage) => ({ ...stage, label: `Manual ${iteration}: ${stage.label}` }));
    await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages(), blueprintManaged: true, customizationSource: "automatic" });
    await Promise.all([
      applyBusinessBlueprint({ tenantId, blueprint, actorId: "qa-setup", actorName: "Setup" }),
      saveTenantPipelineStages({ tenantId, stages, actorId: "qa-owner", actorName: "Owner" }),
    ]);
    assert.deepEqual((await loadTenantPipelineConfig(tenantId)).stages.map((stage) => stage.label), stages.map((stage) => stage.label));
  }
});

test("saved renamed funnel reloads into CRM board names and order without rewriting lead stages", async () => {
  const stages = getDefaultPipelineStages().slice(0, 3).reverse().map((stage, position) => ({
    ...stage, position, label: `Etapa do negocio ${position + 1}`, color: "#123456",
  }));
  const before = (await adminDb.collection("leads").doc(leadId).get()).data()?.pipelineStage;
  await saveTenantPipelineStages({ tenantId, stages, actorId: "qa-owner", actorName: "Owner" });
  const loaded = (await loadTenantPipelineConfig(tenantId)).stages;
  const ids = crmPipelineStageOptions(loaded, [before]);
  assert.deepEqual(ids, stages.map((stage) => stage.id));
  assert.deepEqual(ids.map((id) => getPipelineStageLabel(id, loaded)), stages.map((stage) => stage.label));
  assert.ok(loaded.every((stage) => stage.color === "#123456"));
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).data()?.pipelineStage, before);
});
