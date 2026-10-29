import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processWaitingReplyAutomations: consume } = await import("../lib/server/automations.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => { const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); return originalFetch(input, init); };
after(async () => {
  globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const name of ["leads", "chats", "automations", "jobs", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "pipeline", "ai_logs", "audit_logs"]) for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_waiting_progress_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_z_chat`), rule = adminDb.collection("automations").doc(`${tenantId}_a_rule`), waitingAt = new Date(Date.now() - 7200_000);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "captado", label: "Entrada" }, { id: "proposta", label: "Proposta" }, { id: "ganho", label: "Ganho", isTerminal: true }] });
  await lead.set({ tenantId, nome: "Cliente Shopify fictício", pipelineStage: "captado" });
  await chat.set({ tenantId, leadId: lead.id, channel: "whatsapp", status: "open", lastClientMessageAt: waitingAt });
  await rule.set({ tenantId, name: "Retorno fictício", enabled: true, status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 }, actions: [{ type: "create_task", title: "Retornar cliente" }] });
  return { tenantId, lead, chat, rule, waitingAt, tasks: () => adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).get() };
}
test("waiting selection reaches an eligible conversation beyond 600 archived records", async () => {
  const f = await fixture();
  for (let start = 0; start < 600; start += 300) {
    const batch = adminDb.batch();
    for (let i = start; i < start + 300; i++) batch.set(adminDb.collection("chats").doc(`${f.tenantId}_a_${String(i).padStart(3, "0")}`), { tenantId: f.tenantId, leadId: f.lead.id, status: "archived", lastClientMessageAt: new Date(f.waitingAt.getTime() - 60_000 - i) });
    await batch.commit();
  }
  const result = await consume({ tenantId: f.tenantId, limit: 1 });
  assert.equal(result.executed, 1); assert.equal((await f.tasks()).size, 1);
});
test("concurrent producers admit one batch and execute each eligible rule once", async () => {
  const f = await fixture(), original = (await f.rule.get()).data()!;
  await adminDb.collection("automations").doc(`${f.tenantId}_b_rule`).set({ ...original, actions: [{ type: "create_task", title: "Outro retorno" }] });
  await Promise.all([consume({ tenantId: f.tenantId, limit: 1 }), consume({ tenantId: f.tenantId, limit: 1 })]);
  assert.equal((await f.tasks()).size, 2);
  const roots = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_waiting_reply_runtime").get();
  assert.equal(roots.size, 1); assert.equal(roots.docs[0].data().status, "done"); assert.equal(roots.docs[0].data().stageAutomationPlans.length, 2);
  await consume({ tenantId: f.tenantId }); assert.equal((await f.tasks()).size, 2);
});
test("a newly eligible rule can run in the same interval without reopening completed rules", async () => {
  const f = await fixture(), original = (await f.rule.get()).data()!;
  assert.equal((await consume({ tenantId: f.tenantId })).executed, 1);
  await adminDb.collection("automations").doc(`${f.tenantId}_b_rule`).set({ ...original, actions: [{ type: "create_task", title: "Retorno de nova regra" }] });
  assert.equal((await consume({ tenantId: f.tenantId })).executed, 1); assert.equal((await f.tasks()).size, 2);
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_waiting_reply_runtime").get()).size, 2);
  await consume({ tenantId: f.tenantId }); assert.equal((await f.tasks()).size, 2);
});
test("the actual v3 producer and periodic reader cannot claim a v4 batch", async () => {
  const f = await fixture(), { normalizeAutomationDoc } = await import("../lib/server/automations.ts");
  const { admitWaitingReplyBatch } = await import("../lib/server/crm/waiting-reply-occurrence.ts");
  const { admitWaitingReplyOccurrence: oldAdmit, processPendingWaitingReplyOccurrences: oldPending } = await import("./fixtures/waiting-reply-v3.mts");
  const input = { tenantId: f.tenantId, leadId: f.lead.id, chatId: f.chat.id, waitingKey: String(f.waitingAt.getTime()), normalize: normalizeAutomationDoc, matches: () => true };
  const id = await admitWaitingReplyBatch(input); assert.ok(id); const root = adminDb.collection("jobs").doc(id), before = await root.get();
  assert.equal(before.data()?.runtimeProtocolVersion, 4);
  await assert.rejects(oldAdmit({ ...input, automationId: f.rule.id }), /CRM_STAGE_WAITING_IDENTITY_CHANGED/);
  const old = await oldPending({ tenantId: f.tenantId }); assert.equal(old.processed, 0); assert.equal(old.scanned, 1);
  assert.ok((await root.get()).updateTime!.isEqual(before.updateTime!)); assert.equal((await f.tasks()).size, 0);
  await consume({ tenantId: f.tenantId }); assert.equal((await root.get()).data()?.status, "done"); assert.equal((await f.tasks()).size, 1);
});
test("the current worker resumes an authentic v3 recipe without promoting its protocol", async () => {
  const f = await fixture(), { normalizeAutomationDoc } = await import("../lib/server/automations.ts");
  const { admitWaitingReplyOccurrence: oldAdmit } = await import("./fixtures/waiting-reply-v3.mts");
  const id = await oldAdmit({ tenantId: f.tenantId, leadId: f.lead.id, chatId: f.chat.id, automationId: f.rule.id, waitingKey: String(f.waitingAt.getTime()), normalize: normalizeAutomationDoc, matches: () => true });
  assert.ok(id); const root = adminDb.collection("jobs").doc(id); assert.equal((await root.get()).data()?.runtimeProtocolVersion, 3);
  await consume({ tenantId: f.tenantId });
  assert.equal((await root.get()).data()?.runtimeProtocolVersion, 3); assert.equal((await root.get()).data()?.status, "done"); assert.equal((await f.tasks()).size, 1);
  await consume({ tenantId: f.tenantId }); assert.equal((await f.tasks()).size, 1);
});
test("completed waiting intervals cannot starve later conversations under the same run limit", async () => {
  const f = await fixture(), otherLead = adminDb.collection("leads").doc(`${f.tenantId}_other_lead`), otherChat = adminDb.collection("chats").doc(`${f.tenantId}_zz_chat`);
  await otherLead.set({ tenantId: f.tenantId, nome: "Outra pessoa fictícia", pipelineStage: "captado" });
  await otherChat.set({ tenantId: f.tenantId, leadId: otherLead.id, channel: "whatsapp", status: "open", lastClientMessageAt: new Date(f.waitingAt.getTime() + 1000) });
  assert.equal((await consume({ tenantId: f.tenantId, limit: 1 })).executed, 1);
  assert.equal((await consume({ tenantId: f.tenantId, limit: 1 })).executed, 1);
  assert.equal((await f.tasks()).size, 2); assert.equal((await consume({ tenantId: f.tenantId, limit: 1 })).executed, 0);
  assert.equal((await f.tasks()).size, 2);
});
test("one rule's own CRM change cannot remove another eligible rule from the same waiting interval", async () => {
  const f = await fixture(), original = (await f.rule.get()).data()!;
  await f.rule.update({ actions: [{ type: "move_stage", stageId: "proposta" }] });
  await adminDb.collection("automations").doc(`${f.tenantId}_b_rule`).set({ ...original, conditions: { waitAtLeastHours: 1, stageIn: ["captado"] } });
  await consume({ tenantId: f.tenantId });
  assert.equal((await f.lead.get()).data()?.pipelineStage, "proposta", "The preceding rule must really run");
  assert.equal((await f.tasks()).size, 1, "Eligibility of this interval must survive its own earlier CRM action");
  await consume({ tenantId: f.tenantId }); assert.equal((await f.tasks()).size, 1);
});
test("an oversized fresh batch has no effects and cannot starve another eligible conversation", async () => {
  const f = await fixture(), original = (await f.rule.get()).data()!, otherLead = adminDb.collection("leads").doc(`${f.tenantId}_healthy_lead`), otherChat = adminDb.collection("chats").doc(`${f.tenantId}_zz_healthy_chat`);
  await f.lead.update({ origem: "oversized" }); await f.rule.update({ conditions: { waitAtLeastHours: 1, sourceIn: ["oversized"] } });
  const batch = adminDb.batch();
  for (let i = 0; i < 120; i++) batch.set(adminDb.collection("automations").doc(`${f.tenantId}_m_rule_${String(i).padStart(3, "0")}`), { ...original, conditions: { waitAtLeastHours: 1, sourceIn: ["oversized"] } });
  batch.set(otherLead, { tenantId: f.tenantId, nome: "Pessoa fictícia", origem: "healthy", pipelineStage: "captado" });
  batch.set(otherChat, { tenantId: f.tenantId, leadId: otherLead.id, channel: "whatsapp", status: "open", lastClientMessageAt: new Date(f.waitingAt.getTime() + 1000) });
  batch.set(adminDb.collection("automations").doc(`${f.tenantId}_z_rule`), { ...original, conditions: { waitAtLeastHours: 1, sourceIn: ["healthy"] } });
  await batch.commit();
  const result = await consume({ tenantId: f.tenantId, limit: 1 }); assert.equal(result.failed, 1); assert.equal(result.executed, 1);
  const tasks = await f.tasks(); assert.equal(tasks.size, 1); assert.equal(tasks.docs[0].data().leadId, otherLead.id);
  const rejected = await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("leadId", "==", f.lead.id).get();
  assert.equal(rejected.docs.some(doc => ["automation_waiting_reply_runtime", "automation_waiting_reply_legacy_fence"].includes(doc.data().type)), false);
});
