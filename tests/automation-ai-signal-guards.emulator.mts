import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { runLeadAutomations } = await import("../lib/server/automations.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const host = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url).hostname;
  assert.ok(["127.0.0.1", "localhost"].includes(host), "No external AI signal effects"); return originalFetch(url, init);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "jobs", "automations", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "pipeline", "ai_logs", "chat_state", "chat_outbound_jobs"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) { assert.ok(tenantId.startsWith("qa_ai_signal_")); await adminDb.recursiveDelete(doc.ref); }
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_ai_signal_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_chat`), message = adminDb.collection("messages").doc(`${tenantId}_message`), automation = adminDb.collection("automations").doc(`${tenantId}_rule`);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "captado", label: "Entrada" }, { id: "proposta", label: "Proposta" }] });
  await lead.set({ tenantId, nome: "Cliente Shopify ficticio", pipelineStage: "captado", stage: "captado" });
  await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp" });
  await message.set({ tenantId, chatId: chat.id, leadId: lead.id, sender: "client", text: "Quero saber sobre esta peca", createdAt: new Date() });
  await automation.set({ tenantId, name: "Sinal da IA", enabled: true, status: "active", trigger: "ai_next_action", conditions: { aiNextActionIn: ["follow_up"] }, actions: [{ type: "create_task", title: "Acompanhar interesse" }] });
  const context = { tenantId, leadId: lead.id, chatId: chat.id, sourceMessageId: message.id, trigger: "ai_next_action" as const, actorId: "ai_sales_agent", actorName: "AI Sales Agent", aiNextAction: "follow_up", channel: "whatsapp" };
  return { tenantId, lead, chat, message, automation, context, tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get() };
}


for (const changed of ["none", "message", "config", "human", "paused", "receipt", "expired"] as const) test(`AI signal partial replay verifies ${changed}`, async () => {
  const f = await fixture();
  await f.automation.update({ actions: [{ type: "create_task", title: "Tarefa inicial", sequenceOrder: 1 }, { type: "add_note", text: "Nota restante", sequenceOrder: 2 }] });
  const { loseStageHookAcknowledgement } = await import("./fixtures/stage-hook-ack-fault.mts");
  const { processAiSignalOccurrence } = await import("../lib/server/crm/ai-signal-occurrence.ts");
  const { admitAiSignalOccurrence } = await import("../lib/server/crm/ai-signal-occurrence.ts");
  const { normalizeAutomationDoc } = await import("../lib/server/automations.ts");
  await admitAiSignalOccurrence({ ...f.context, normalize: normalizeAutomationDoc, matches: automation => automation.id === f.automation.id });
  await loseStageHookAcknowledgement(adminDb, "jobs", () => runLeadAutomations(f.context));
  const rootRows = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "crm_ai_signal_occurrence").get();
  assert.equal(rootRows.size, 1); const root = rootRows.docs[0].ref;
  assert.equal((await root.get()).data()?.status, "ready");
  const task = (await f.tasks()).docs; assert.equal(task.length, 1); await task[0].ref.update({ title: "Edicao humana" });
  const quota = (await root.get()).data()?.stageUsageReservations;
  if (changed === "message") await f.message.update({ text: "Mensagem corrigida" });
  if (changed === "config") await f.automation.update({ enabled: false });
  if (changed === "human" || changed === "paused") {
    const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
    await adminDb.collection("chat_state").doc(getChatStateDocId(f.tenantId, f.chat.id)).set({ tenantId: f.tenantId, chatId: f.chat.id, ...(changed === "human" ? { humanOwnerUserId: "qa-human" } : { aiEnabled: false }) });
  }
  if (changed === "receipt") {
    const receipts = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_stage_internal_effect").get();
    assert.equal(receipts.size, 1); await receipts.docs[0].ref.delete();
  }
  if (changed === "expired") await root.update({ status: "processing", claimToken: "qa-old", leaseUntil: new Date(0) });
  await Promise.all([processAiSignalOccurrence(root.id, f.tenantId), processAiSignalOccurrence(root.id, f.tenantId)]);
  const recover = changed === "none" || changed === "expired";
  assert.equal((await root.get()).data()?.status, recover ? "done" : "reconciliation_required");
  assert.equal((await f.tasks()).size, 1); assert.equal((await task[0].ref.get()).data()?.title, "Edicao humana");
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", f.tenantId).get()).size, recover ? 1 : 0);
  assert.deepEqual((await root.get()).data()?.stageUsageReservations, quota);
});

test("AI signal delayed internal action preserves its schedule identity and uses the existing processor", async () => {
  const f = await fixture(); await f.automation.update({ actions: [{ type: "add_note", text: "Nota adiada", waitInHours: 0.000001 }] });
  await runLeadAutomations(f.context); await runLeadAutomations(f.context);
  const schedules = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_scheduled_action").get();
  assert.equal(schedules.size, 1); const original = schedules.docs[0].data();
  const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
  await processPendingAutomationActions({ tenantId: f.tenantId }); await processPendingAutomationActions({ tenantId: f.tenantId });
  assert.equal((await schedules.docs[0].ref.get()).data()?.status, "done");
  assert.equal((await schedules.docs[0].ref.get()).data()?.executeAfter.toMillis(), original.executeAfter.toMillis());
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", f.tenantId).get()).size, 1);
});

test("AI signal counters describe actual matched actions and a replay does not claim another execution", async () => {
  const f = await fixture();
  const first = await runLeadAutomations(f.context);
  assert.deepEqual(first, { evaluated: 1, matched: 1, executed: 1 });
  const replay = await runLeadAutomations(f.context);
  assert.deepEqual(replay, { evaluated: 1, matched: 1, executed: 0 });
  const empty = await fixture(); await empty.automation.update({ enabled: false });
  assert.deepEqual(await runLeadAutomations(empty.context), { evaluated: 0, matched: 0, executed: 0 });
});

test("AI signal policy transport failure remains retryable before claim instead of becoming revoked", async () => {
  const f = await fixture();
  const { admitAiSignalOccurrence, processAiSignalOccurrence } = await import("../lib/server/crm/ai-signal-occurrence.ts");
  const { normalizeAutomationDoc } = await import("../lib/server/automations.ts");
  const id = await admitAiSignalOccurrence({ ...f.context, normalize: normalizeAutomationDoc, matches: automation => automation.id === f.automation.id });
  const { DocumentReference } = await import("firebase-admin/firestore"), { mock } = await import("node:test"), original = DocumentReference.prototype.get;
  const fault = mock.method(DocumentReference.prototype, "get", function(this: FirebaseFirestore.DocumentReference, ...args: Parameters<typeof original>) {
    if (this.path === `tenant_entitlements/${f.tenantId}`) throw Object.assign(new Error("QA_POLICY_STORAGE_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, args);
  });
  try { await assert.rejects(processAiSignalOccurrence(id, f.tenantId), /QA_POLICY_STORAGE_UNAVAILABLE/); }
  finally { fault.mock.restore(); }
  const root = adminDb.collection("jobs").doc(id);
  assert.equal((await root.get()).data()?.status, "ready"); assert.equal((await root.get()).data()?.attempts, 0);
  assert.equal((await f.tasks()).size, 0);
  await processAiSignalOccurrence(id, f.tenantId); assert.equal((await root.get()).data()?.status, "done");
});

test("AI signal concurrent first admissions share one occurrence, effect and quota reservation", async () => {
  const f = await fixture();
  const results = await Promise.all([runLeadAutomations(f.context), runLeadAutomations(f.context), runLeadAutomations(f.context)]);
  assert.equal(results.reduce((sum, row) => sum + row.executed, 0), 1);
  assert.equal((await f.tasks()).size, 1);
  const roots = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "crm_ai_signal_occurrence").get();
  assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().status, "done");
  assert.equal(Object.keys(roots.docs[0].data().stageUsageReservations).length, 1);
});

test("AI signal rejects a different decision for the same accepted source event", async () => {
  const f = await fixture(); await runLeadAutomations(f.context);
  await assert.rejects(runLeadAutomations({ ...f.context, aiNextAction: "new_decision" }), /CRM_STAGE_AI_SIGNAL_DECISION_CHANGED/);
  assert.equal((await f.tasks()).size, 1);
});

test("AI signal cannot reuse an old event after the same message identifier is recreated", async () => {
  const f = await fixture(); await runLeadAutomations(f.context);
  const data = (await f.message.get()).data()!; await f.message.delete(); await f.message.set(data);
  await assert.rejects(runLeadAutomations(f.context), /CRM_STAGE_AI_SIGNAL_CONTEXT_CHANGED/);
  assert.equal((await f.tasks()).size, 1);
});
