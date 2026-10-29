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
    for (const doc of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) { assert.ok(tenantId.startsWith("qa_waiting_catalogue_")); await adminDb.recursiveDelete(doc.ref); }
  }
  await adminDb.terminate();
});
async function fixture() {
  const tenantId = `qa_waiting_catalogue_${randomUUID()}`; tenants.push(tenantId);
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


async function waitingFixture() {
  const f = await fixture();
  await f.chat.update({ status: "open", lastClientMessageAt: new Date(Date.now() - 7200_000) });
  await f.automation.update({ trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 } });
  return f;
}
test("waiting watchdog discovers its eligible rule beyond unrelated catalogue entries", async () => {
  const f = await waitingFixture(), definition = (await f.automation.get()).data()!;
  await f.automation.delete();
  const batch=adminDb.batch();
  for(let index=0;index<121;index++) batch.set(adminDb.collection("automations").doc(`${f.tenantId}_a_${String(index).padStart(3,"0")}`),{...definition,trigger:"budget_approved"});
  batch.set(adminDb.collection("automations").doc(`${f.tenantId}_z_waiting`),definition);await batch.commit();
  const { processWaitingReplyAutomations } = await import("../lib/server/automations.ts");
  const result=await processWaitingReplyAutomations({tenantId:f.tenantId});assert.equal(result.executed,1);
  await processWaitingReplyAutomations({tenantId:f.tenantId});assert.equal((await f.tasks()).size,1);
});

test("waiting runtime identities do not collide when automation identifiers share a long prefix",async()=>{
  const f=await waitingFixture(),definition=(await f.automation.get()).data()!;await f.automation.delete();
  const prefix=`${f.tenantId}_${"x".repeat(220)}`;
  await adminDb.collection("automations").doc(`${prefix}_first`).set(definition);
  await adminDb.collection("automations").doc(`${prefix}_second`).set(definition);
  const { processWaitingReplyAutomations }=await import("../lib/server/automations.ts");
  const result=await processWaitingReplyAutomations({tenantId:f.tenantId});assert.equal(result.executed,2);
  await processWaitingReplyAutomations({tenantId:f.tenantId});assert.equal((await f.tasks()).size,2);
});
