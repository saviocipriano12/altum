import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processWaitingReplyAutomations: consume, normalizeAutomationDoc } = await import("../lib/server/automations.ts");
const { admitWaitingReplyOccurrence: admit, processWaitingReplyOccurrence: processRoot } = await import("../lib/server/crm/waiting-reply-occurrence.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts");
const tenants: string[] = [], originalFetch = globalThis.fetch, sentTexts: string[] = []; let calls = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return originalFetch(input, init);
  assert.equal(url.hostname, "graph.facebook.com"); assert.match(url.pathname, /\/qa-waiting-number\/messages$/);
  const payload = JSON.parse(String(init?.body)); assert.equal(payload.type, "text"); sentTexts.push(payload.text.body);
  calls++; return Promise.resolve(Response.json({ messages: [{ id: `wamid.qa-waiting-${calls}` }] }));
};
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const tenantId of tenants) for (const name of ["leads", "chats", "automations", "jobs", "lead_tasks", "lead_notes", "tenant_entitlements", "tenant_usage_monthly", "ai_logs", "audit_logs", "tenant_channels", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "messages"]) for (const doc of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(doc.ref);
  await adminDb.terminate();
});
async function fixture(send = false) {
  const tenantId = `qa_waiting_integrity_${randomUUID()}`; tenants.push(tenantId);
  const lead = adminDb.collection("leads").doc(`${tenantId}_lead`), chat = adminDb.collection("chats").doc(`${tenantId}_chat`), automation = adminDb.collection("automations").doc(`${tenantId}_rule`), channel = adminDb.collection("tenant_channels").doc(`${tenantId}_channel`), waitingAt = new Date(Date.now() - 7200_000);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true }, limits: {} });
  await lead.set({ tenantId, nome: "Cliente Shopify fictício", pipelineStage: "captado" });
  await chat.set({ tenantId, leadId: lead.id, channelId: channel.id, channel: "whatsapp", contactPhone: "5511000000088", status: "open", lastClientMessageAt: waitingAt });
  await channel.set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-waiting-number", accessToken: "qa-only", channelScope: "shared" });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chat.id)).set({ tenantId, chatId: chat.id, aiEnabled: true });
  await automation.set({ tenantId, name: "Espera fictícia", enabled: true, status: "active", trigger: "waiting_for_reply", conditions: { waitAtLeastHours: 1 }, actions: send ? [{ type: "send_message", text: "Como posso ajudar?" }] : [{ type: "create_task", title: "Retornar cliente" }] });
  return { tenantId, lead, chat, automation, input: { tenantId, leadId: lead.id, chatId: chat.id, automationId: automation.id, waitingKey: String(waitingAt.getTime()), normalize: normalizeAutomationDoc, matches: (rule: ReturnType<typeof normalizeAutomationDoc>) => rule.enabled && rule.trigger === "waiting_for_reply" } };
}
for (const change of ["empty_plan", "timer_payload"] as const) test(`waiting authority rejects corrupted ${change} before effects`, async () => {
  const f = await fixture(), id = await admit(f.input); assert.ok(id); const root = adminDb.collection("jobs").doc(id);
  await root.update(change === "empty_plan" ? { stageAutomationPlans: [] } : { waitingSince: new Date(0) });
  await processRoot(id, f.tenantId);
  assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 0);
});
for (const change of ["own_queue", "human_reply", "new_client"] as const) test(`waiting queued message distinguishes ${change} using its own receipt`, async () => {
  const f = await fixture(true), before = calls, result = await consume({ tenantId: f.tenantId });
  assert.equal(result.executed, 1); assert.equal(calls, before);
  const chat = (await f.chat.get()).data()!, jobId = String(chat.outboundTailJobId), job = adminDb.collection("chat_outbound_jobs").doc(jobId);
  assert.equal((await job.get()).data()?.status, "ready");
  if (change === "human_reply") await f.chat.update({ lastAgentMessageAt: new Date(Date.now() + 1000) });
  if (change === "new_client") await f.chat.update({ lastClientMessageAt: new Date(Date.now() + 1000) });
  await processChatOutboundJobs({ jobId, limit: 1 });
  const delivered = (await job.get()).data()!;
  assert.equal(calls, before + (change === "own_queue" ? 1 : 0));
  assert.equal(delivered.status, change === "own_queue" ? "completed" : "dead_letter");
  await processChatOutboundJobs({ jobId, limit: 1 }); assert.equal(calls, before + (change === "own_queue" ? 1 : 0));
});
test("a source changed after the last hook commit cannot receive a successful final acknowledgement", async () => {
  const f = await fixture(), id = await admit(f.input); assert.ok(id);
  const root = adminDb.collection("jobs").doc(id), original = adminDb.runTransaction.bind(adminDb); let changed = false;
  const hook = mock.method(adminDb, "runTransaction", async (work: Parameters<typeof adminDb.runTransaction>[0]) => {
    let selected = false;
    const result = await original(async tx => {
      const update = tx.update.bind(tx);
      Object.defineProperty(tx, "update", { value: (...args: unknown[]) => {
        const ref = args[0] as FirebaseFirestore.DocumentReference, patch = args[1] as { stageHookProgress?: { steps?: { status: string }[] } };
        if (ref.path === root.path && patch?.stageHookProgress?.steps?.every(step => step.status === "done")) selected = true;
        return Reflect.apply(update, tx, args);
      } });
      return work(tx);
    });
    if (selected && !changed) { changed = true; await f.chat.update({ lastClientMessageAt: new Date() }); }
    return result;
  });
  try { await processRoot(id, f.tenantId); } finally { hook.mock.restore(); }
  assert.equal(changed, true); assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get()).size, 1, "The valid earlier effect remains recorded");
});
test("one rule's queued reply does not suppress an eligible sibling task", async () => {
  const f = await fixture(true), before = calls, definition = (await f.automation.get()).data()!;
  await adminDb.collection("automations").doc(`${f.tenantId}_z_rule`).set({ ...definition, actions: [{ type: "create_task", title: "Conferir retorno" }] });
  assert.equal((await consume({ tenantId: f.tenantId })).executed, 2); assert.equal(calls, before);
  const initialTasks = await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get();
  assert.equal(initialTasks.size, 1); const taskId = initialTasks.docs[0].id;
  const jobId = (await f.chat.get()).data()?.outboundTailJobId; assert.equal(typeof jobId, "string");
  await processChatOutboundJobs({ jobId, limit: 1 }); assert.equal(calls, before + 1);
  await consume({ tenantId: f.tenantId }); assert.equal(calls, before + 1);
  const tasks = await adminDb.collection("lead_tasks").where("tenantId", "==", f.tenantId).get();
  const automationTasks = tasks.docs.filter(doc => doc.data().source === "tenant_automation");
  assert.equal(automationTasks.length, 1); assert.equal(automationTasks[0].id, taskId);
  assert.equal(automationTasks[0].data().automationId, `${f.tenantId}_z_rule`);
  assert.equal(tasks.size, 2, "The existing CRM observer also creates its separate waiting-response task");
  assert.equal(tasks.docs.filter(doc => doc.data().source === "crm_automation").length, 1);
});
test("two eligible reply rules retain their order and each sends only once", async () => {
  const f = await fixture(true), before = calls, textsBefore = sentTexts.length, definition = (await f.automation.get()).data()!;
  await adminDb.collection("automations").doc(`${f.tenantId}_z_rule`).set({ ...definition, actions: [{ type: "send_message", text: "Outra informação aprovada" }] });
  assert.equal((await consume({ tenantId: f.tenantId })).executed, 2); assert.equal(calls, before);
  const jobs = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", f.tenantId).get()).docs.sort((a, b) => a.data().sequence - b.data().sequence);
  assert.equal(jobs.length, 2); assert.equal(jobs[1].data().predecessorJobId, jobs[0].id);
  for (const job of jobs) { await processChatOutboundJobs({ jobId: job.id, limit: 1 }); await processChatOutboundJobs({ jobId: job.id, limit: 1 }); const result = (await job.ref.get()).data(); assert.equal(result?.status, "completed", JSON.stringify({ id: job.id, error: result?.error, errorCode: result?.errorCode })); }
  assert.equal(calls, before + 2); assert.deepEqual(sentTexts.slice(textsBefore), ["Como posso ajudar?", "Outra informação aprovada"]);
});
for (const change of ["receipt_update", "human_reply", "foreign_receipt", "different_route"] as const) test(`waiting sibling delivery revalidates ${change} after a proved first acknowledgement`, async () => {
  const f = await fixture(true), before = calls, definition = (await f.automation.get()).data()!;
  await adminDb.collection("automations").doc(`${f.tenantId}_z_rule`).set({ ...definition, actions: [{ type: "send_message", text: "Segundo retorno aprovado" }] });
  assert.equal((await consume({ tenantId: f.tenantId })).executed, 2);
  const jobs = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", f.tenantId).get()).docs.sort((a, b) => a.data().sequence - b.data().sequence);
  assert.equal(jobs.length, 2);
  await processChatOutboundJobs({ jobId: jobs[0].id, limit: 1 }); assert.equal((await jobs[0].ref.get()).data()?.status, "completed"); assert.equal(calls, before + 1);
  const chat = (await f.chat.get()).data()!, message = adminDb.collection("messages").doc(jobs[0].data().messageId), acknowledged = (await message.get()).data()!;
  assert.equal(chat.lastAgentMessageId, message.id); assert.ok(chat.lastAgentMessageAt.isEqual(acknowledged.agentAcknowledgedAt));
  if (change === "receipt_update") await message.update({ updatedAt: new Date(Date.now() + 1000), deliveryStatus: "read" });
  if (change === "human_reply") await f.chat.update({ lastAgentMessageAt: new Date(Date.now() + 1000) });
  if (change === "foreign_receipt") await message.update({ stageAutomationSourceId: "another_origin" });
  if (change === "different_route") await f.chat.update({ channelPhoneNumberId: "another_number" });
  await processChatOutboundJobs({ jobId: jobs[1].id, limit: 1 }); await processChatOutboundJobs({ jobId: jobs[1].id, limit: 1 });
  assert.equal((await jobs[1].ref.get()).data()?.status, change === "receipt_update" ? "completed" : "dead_letter");
  assert.equal(calls, before + (change === "receipt_update" ? 2 : 1));
});
