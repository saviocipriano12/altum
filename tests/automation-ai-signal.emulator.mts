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
test("AI signal repeats the same source without duplicating a task or overwriting its human edit", async () => {
  const f = await fixture(); await runLeadAutomations(f.context);
  const first = (await f.tasks()).docs; assert.equal(first.length, 1); await first[0].ref.update({ title: "Edicao humana" });
  await runLeadAutomations(f.context);
  assert.equal((await f.tasks()).size, 1); assert.equal((await first[0].ref.get()).data()?.title, "Edicao humana");
});
test("AI signal freezes empty eligibility before later configuration appears", async () => {
  const f = await fixture(); await f.automation.update({ enabled: false }); await runLeadAutomations(f.context);
  await f.automation.update({ enabled: true }); await runLeadAutomations(f.context);
  assert.equal((await f.tasks()).size, 0);
});
test("AI signal cannot authorize effects from a foreign source message", async () => {
  const f = await fixture(); await f.message.update({ tenantId: `${f.tenantId}_foreign` });
  await assert.rejects(runLeadAutomations(f.context)); assert.equal((await f.tasks()).size, 0);
});
test("AI signal refuses delayed messaging as well as immediate messaging", async () => {
  const f = await fixture(); await f.automation.update({ actions: [{ type: "send_message", text: "Nunca enviar", waitInHours: 1 }] });
  await runLeadAutomations(f.context);
  assert.equal((await adminDb.collection("jobs").where("tenantId", "==", f.tenantId).where("type", "==", "automation_scheduled_action").get()).size, 0);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", f.tenantId).get()).size, 0);
});
