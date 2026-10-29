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
  for (const tenantId of tenants) for (const collection of ["leads", "chats", "messages", "jobs", "automations", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "pipeline", "ai_logs", "chat_state", "chat_outbound_jobs", "tenant_trash", "deletion_audits", "deletion_certificates"]) {
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) { assert.ok(tenantId.startsWith("qa_ai_signal_trash_")); await adminDb.recursiveDelete(doc.ref); }
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_ai_signal_trash_${randomUUID()}`; tenants.push(tenantId);
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


for (const delayed of [false, true]) test(`AI signal lead deletion restores ${delayed ? "pending internal schedule in review" : "completed receipts without a new effect"}`, async () => {
  const f = await fixture();
  if (delayed) await f.automation.update({ actions: [{ type: "add_note", text: "Nota futura", waitInHours: 1 }] });
  await runLeadAutomations(f.context);
  const { deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
  const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
  const allJobs = () => adminDb.collection("jobs").where("tenantId", "==", f.tenantId).get();
  const before = (await allJobs()).docs; assert.ok(before.length >= 2);
  const source = before.find(doc => doc.data().type === "crm_ai_signal_occurrence"); assert.ok(source);
  const removed = await deleteTenantLead({ tenantId: f.tenantId, leadId: f.lead.id }); assert.ok(removed.trashId);
  assert.equal((await allJobs()).size, 0); assert.equal((await f.tasks()).size, 0);
  assert.equal((await f.lead.get()).exists, false); assert.equal((await f.chat.get()).exists, false);
  await restoreTenantTrash({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await allJobs()).size, before.length);
  assert.equal((await source.ref.get()).data()?.status, "done");
  if (delayed) {
    const schedule = before.find(doc => doc.data().type === "automation_scheduled_action"); assert.ok(schedule);
    const restored = (await schedule.ref.get()).data()!;
    assert.equal(restored.status, "reconciliation_required"); assert.equal(restored.restorationPreviousStatus, "pending");
    assert.equal(restored.executeAfter.toMillis(), schedule.data().executeAfter.toMillis());
  }
  await processPendingAutomationActions({ tenantId: f.tenantId });
  await assert.rejects(runLeadAutomations(f.context), /CRM_STAGE_AI_SIGNAL_CONTEXT_CHANGED/);
  assert.equal((await f.tasks()).size, delayed ? 0 : 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", f.tenantId).get()).size, 0);
});

test("AI signal permanent trash deletion removes the original roots and receipts without reviving an effect", async () => {
  const f = await fixture(); await runLeadAutomations(f.context);
  const { deleteTenantLead, deleteTenantTrashPermanently } = await import("../lib/server/tenant-data-deletion.ts");
  const removed = await deleteTenantLead({ tenantId: f.tenantId, leadId: f.lead.id }); assert.ok(removed.trashId);
  await deleteTenantTrashPermanently({ tenantId: f.tenantId, trashId: removed.trashId });
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).get()).size, 0);
  assert.equal((await f.lead.get()).exists, false); assert.equal((await f.chat.get()).exists, false); assert.equal((await f.tasks()).size, 0);
  assert.equal((await adminDb.collection("tenant_trash").doc(removed.trashId).collection("documents").get()).size, 0);
});
