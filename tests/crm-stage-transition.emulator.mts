import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loseStageHookAcknowledgement, loseStageRunCompletionAcknowledgement, freezeLegacyStageRecipe } from "./fixtures/stage-hook-ack-fault.mts";
import type { TenantAutomationAction } from "../lib/server/automations.ts";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { setLeadPipelineStageWithEffects } = await import("../lib/server/crm/stage-transition.ts");
const { commitOrderPipelineTransition, processOrderPipelineTransition, processPendingOrderPipelineTransitions } = await import("../lib/server/crm/order-stage-transition.ts");
const { processPendingAutomationActions } = await import("../lib/server/automations.ts");
const { processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { commitManualLeadPatch } = await import("../lib/server/crm/manual-update.ts");
const { getDefaultPipelineStages } = await import("../lib/pipeline.ts");
const { processEcommerceWebhook } = await import("../lib/server/ecommerce.ts");
const tenantId = `qa_stage_order_${Date.now()}`;
const originalFetch = globalThis.fetch;
let failProvider = false, providerAttempts = 0;
globalThis.fetch = (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (!["127.0.0.1", "localhost"].includes(target.hostname)) {
    assert.equal(target.hostname, "graph.facebook.com"); assert.ok(failProvider, "No external service in stage-transition fixtures");
    providerAttempts++; throw new Error("QA_PROVIDER_UNAVAILABLE");
  }
  return originalFetch(url, options);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["leads", "pipeline", "jobs", "automations", "lead_tasks", "lead_notes", "ecommerce_events", "ecommerce_connections", "ai_learning_outcomes", "ai_tenant_learning_daily", "lead_conversion_trails", "chats", "tenant_channels", "chat_state", "tenant_usage_monthly",
    "ecommerce_orders", "ecommerce_customers", "ecommerce_commercial_actions", "commercial_agent_actions", "contacts", "contact_identity_aliases", "growth_events", "pixel_dispatch_logs", "ai_logs", "chat_outbound_jobs", "messages", "chat_outbound_locks",
    "ai_learning_events", "ai_learning_signals", "ai_tenant_learning_signal_daily", "ai_tenant_learning_recommendations"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) {
      if (collection === "leads") { assert.equal(row.data().tenantId, tenantId); assert.ok(tenantId.startsWith("qa_stage_order_")); await adminDb.recursiveDelete(row.ref); }
      else await row.ref.delete();
    }
  }
  await adminDb.terminate();
});
async function lead(name: string, manual: boolean, reusePipeline = false) {
  const leadId = `${tenantId}_${name}`;
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente Shopify ficticio", origem: name, pipelineStage: "captado", stage: "captado",
    ...(manual ? { crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: "qa-human" } } } : {}) });
  if (!reusePipeline) await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "captado", label: "Entrada", position: 0 }, { id: "provador", label: "Escolha", position: 1 }, { id: "reserva", label: "Separado", position: 2 },
  ] });
  return { tenantId, leadId, nextStage: "proposta", actorId: "ecommerce_webhook", source: "ecommerce_order_created", skipConversionDispatch: true };
}
test("order stage writer must preserve a manually chosen stage", async () => {
  const input = await lead("manual", true);
  await setLeadPipelineStageWithEffects(input);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "captado");
});
test("order stage writer must not introduce a default stage absent from the saved funnel", async () => {
  const input = await lead("custom", false);
  await setLeadPipelineStageWithEffects(input);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "captado");
});

async function orderFixture(name: string, manual = false, paymentStatus = "pending", trackingCode = "", reusePipeline = false) {
  const input = await lead(name, manual, reusePipeline), connectionId = `${input.leadId}_connection`, eventId = `${input.leadId}_event`, orderId = `gid://shopify/Order/${name}`;
  if (!reusePipeline) await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages() });
  await adminDb.collection("ecommerce_connections").doc(connectionId).set({ tenantId, provider: "shopify", status: "active" });
  await adminDb.collection("ecommerce_events").doc(eventId).set({ tenantId, connectionId, provider: "shopify", externalEventId: `event:${name}`,
    normalized: { order: { externalOrderId: orderId, status: "created", paymentStatus, fulfillmentStatus: "", trackingCode } } });
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).set({ tenantId, name: "Pendencia do pedido", enabled: true, status: "active",
    trigger: "lead_stage_changed", conditions: { sourceIn: [name] }, actions: [{ type: "create_task", title: "Revisar pedido ficticio" }] });
  return { ...input, nextStage: paymentStatus === "paid" || trackingCode ? "ganho" : "proposta", orderSource: { id: eventId, connectionId, orderId } };
}

test("Shopify order stage-change automation must enqueue before any provider attempt", async () => {
  const input = await orderFixture("stage-source-message"), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`, before = providerAttempts;
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [{ type: "send_message", text: "Atualizacao ficticia do pedido" }] });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  failProvider = true;
  try {
    await setLeadPipelineStageWithEffects(input);
    assert.equal(providerAttempts, before);
    const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
    assert.equal(queued.size, 1);
  } finally { failProvider = false; }
});

async function queuedOrderStage(name: string, actions?: TenantAutomationAction[]) {
  const input = await orderFixture(name), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: actions || [{ type: "send_message", text: "Pedido ficticio em acompanhamento" }] });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-order-stage-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
  const source = adminDb.collection("jobs").doc(String(result.id)); assert.equal((await source.get()).data()?.status, "done");
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  assert.equal(jobs.size, 1);
  return { ...input, sourceJob: source, job: jobs.docs[0].ref };
}
async function simulatedOrderStageDelivery(job: FirebaseFirestore.DocumentReference, loseAck = false) {
  const previous = globalThis.fetch; let calls = 0;
  globalThis.fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (["localhost", "127.0.0.1"].includes(target.hostname)) return previous(url, init);
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-order-stage-number\/messages$/); calls++;
    if (loseAck) return Promise.reject(new Error("QA_STAGE_ACK_LOST"));
    return Promise.resolve(Response.json({ messages: [{ id: `wamid.qa-order-${job.id}` }] }));
  };
  try { await processChatOutboundJobs({ jobId: job.id }); } finally { globalThis.fetch = previous; }
  return calls;
}
test("Shopify stage source delivers once and does not repeat the accepted occurrence", async () => {
  const input = await queuedOrderStage("deliver-source");
  assert.equal(await simulatedOrderStageDelivery(input.job), 1); assert.equal((await input.job.get()).data()?.status, "completed");
  assert.equal(await simulatedOrderStageDelivery(input.job), 0);
  await setLeadPipelineStageWithEffects(input);
  assert.equal(await simulatedOrderStageDelivery(input.job), 0);
});
for (const revoked of ["event", "connection", "order", "human", "source"] as const) {
  test(`Shopify stage source rejects ${revoked} revocation before provider I/O`, async () => {
    const input = await queuedOrderStage(`source-revoke-${revoked}`);
    if (revoked === "event") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
    if (revoked === "connection") await adminDb.collection("ecommerce_connections").doc(input.orderSource.connectionId).update({ status: "paused" });
    if (revoked === "order") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).update({ "normalized.order.paymentStatus": "paid" });
    if (revoked === "human") await adminDb.collection("leads").doc(input.leadId).update({ pipelineStage: "contato", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true } });
    if (revoked === "source") await input.sourceJob.delete();
    assert.equal(await simulatedOrderStageDelivery(input.job), 0); assert.equal((await input.job.get()).data()?.status, "dead_letter");
    assert.equal((await input.job.get()).data()?.providerAttemptStartedAt, undefined);
  });
}
test("Shopify stage source preserves transient read failure for retry without consuming a provider attempt", async () => {
  const input = await queuedOrderStage("source-transient"), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `ecommerce_connections/${input.orderSource.connectionId}`) throw Object.assign(new Error("QA_ORDER_SOURCE_READ_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try { assert.equal(await simulatedOrderStageDelivery(input.job), 0); }
  finally { interceptor.mock.restore(); }
  assert.equal((await input.job.get()).data()?.status, "retrying"); assert.equal((await input.job.get()).data()?.providerAttemptStartedAt, undefined);
  await input.job.update({ dueAt: new Date(0) }); assert.equal(await simulatedOrderStageDelivery(input.job), 1);
});
async function tasks(leadId: string) { return adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", leadId).get(); }

for (const changedRouting of [false, true]) test(`partial stage message in the same run ${changedRouting ? "rejects changed routing" : "reuses its original slot before the remaining note"}`, async () => {
  const input = await orderFixture(`same-run-message-${changedRouting}`), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`, before = providerAttempts;
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [{ type: "send_message", text: "Pedido ficticio em acompanhamento" }, { type: "add_note", text: "Nota apos fila confirmada" }] });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-order-stage-number", accessToken: "qa-only" });
  const chat = adminDb.collection("chats").doc(chatId);
  await chat.set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id!);
  const queued = () => adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  const original = adminDb.runTransaction; let interrupted = false;
  const fault = mock.method(adminDb, "runTransaction", async (...args: Parameters<typeof original>) => {
    if (!interrupted && (await queued()).size === 1) { interrupted = true; throw new Error("QA_AFTER_MESSAGE_BEFORE_REMAINING_NOTE"); }
    return Reflect.apply(original, adminDb, args);
  });
  try { await processOrderPipelineTransition(root.id, tenantId); } finally { fault.mock.restore(); }
  assert.ok(interrupted); assert.equal((await root.get()).data()?.status, "ready");
  const first = (await queued()).docs; assert.equal(first.length, 1);
  const message = await adminDb.collection("messages").doc(first[0].data().messageId).get();
  const sequence = (await chat.get()).data()?.outboundSequence;
  if (changedRouting) await chat.update({ contactPhone: "5511000000099" });
  await processOrderPipelineTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, changedRouting ? "reconciliation_required" : "done");
  const final = (await queued()).docs; assert.equal(final.length, 1); assert.equal(final[0].id, first[0].id);
  assert.equal(final[0].data().messageId, message.id);
  assert.equal((await message.ref.get()).updateTime?.toMillis(), message.updateTime?.toMillis());
  assert.equal((await chat.get()).data()?.outboundSequence, sequence);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, changedRouting ? 0 : 1);
  assert.equal(providerAttempts, before); assert.equal(final[0].data().providerAttemptStartedAt, undefined);
});

for (const action of [
  { type: "create_task", title: "Separar produto" }, { type: "follow_up", title: "Conferir entrega", dueInHours: 2 },
  { type: "alert_human", title: "Revisar condicao", text: "Pendencia ficticia" }, { type: "add_note", text: "Nota ficticia" },
  { type: "add_tag", tag: "qa_verified" }, { type: "set_priority", priority: "high" }, { type: "move_stage", stageId: "captado" },
  { type: "add_note", text: "Nota adiada ficticia", waitInHours: 1 }, { type: "send_message", text: "Mensagem adiada ficticia", waitInHours: 1 },
] satisfies TenantAutomationAction[]) test(`partial stage run resumes receipted ${action.type}${action.waitInHours ? " scheduled" : " immediate"} without repeating the effect`, async () => {
  const input = await orderFixture(`partial-run-${action.type}-${action.waitInHours || 0}`);
  if (action.type === "send_message") {
    const channelId = `${input.leadId}_channel`, chatId = `${input.leadId}_chat`;
    await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-partial-run", accessToken: "qa-only", channelScope: "shared" });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date(), status: "open" });
  }
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [{ ...action, sequenceOrder: 0 }, { type: "create_task", title: "Concluir etapa restante", sequenceOrder: 1 }] });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id);
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processOrderPipelineTransition(root.id, tenantId));
  const before = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get();
  const ids = before.docs.map(doc => doc.id), deadlines = before.docs.map(doc => doc.data().executeAfter?.toMillis?.() || null);
  assert.equal((await root.get()).data()?.status, "ready");
  const firstTasks = await tasks(input.leadId);
  for (const task of firstTasks.docs) await task.ref.update({ title: "Editada pelo humano" });
  if (action.type === "add_note" && !action.waitInHours) {
    const notes = await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    assert.equal(notes.size, 1); await notes.docs[0].ref.delete();
  }
  await processOrderPipelineTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "done");
  const after = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get();
  for (let index = 0; index < ids.length; index++) {
    const retained = after.docs.find(doc => doc.id === ids[index]); assert.ok(retained);
    assert.equal(retained.data().executeAfter?.toMillis?.() || null, deadlines[index]);
  }
  assert.equal((await tasks(input.leadId)).docs.filter(doc => doc.data().title === "Concluir etapa restante").length, 1);
  for (const task of firstTasks.docs) assert.equal((await task.ref.get()).data()?.title, "Editada pelo humano");
  if (action.type === "add_note" && !action.waitInHours) assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
});
test("partial stage run resumes after a registered message without creating another message slot", async () => {
  const input = await orderFixture("partial-run-message"), channelId = `${input.leadId}_channel`, chatId = `${input.leadId}_chat`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-partial-message", accessToken: "qa-only", channelScope: "shared" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date(), status: "open" });
  const auto = adminDb.collection("automations").doc(`${input.leadId}_auto`);
  await auto.update({ actions: [{ type: "send_message", text: "Fila ficticia original" }] });
  await adminDb.collection("automations").doc(`${input.leadId}_zz`).set({ ...(await auto.get()).data()!, actions: [{ type: "create_task", title: "Etapa posterior" }] });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id), attempts = providerAttempts;
  await loseStageRunCompletionAcknowledgement(adminDb, root.path, () => processOrderPipelineTransition(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready");
  const queued = () => adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  const before = await queued(); assert.equal(before.size, 1);
  await processOrderPipelineTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.status, "done"); assert.equal((await queued()).size, 1);
  assert.equal((await queued()).docs[0].id, before.docs[0].id); assert.equal((await tasks(input.leadId)).size, 1);
  assert.equal(providerAttempts, attempts);
});

async function interruptedAutomationRun(name: string) {
  const input = await orderFixture(`run-guard-${name}`);
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [
    { type: "create_task", title: "Primeiro efeito confirmado", sequenceOrder: 0 }, { type: "add_note", text: "Efeito restante", sequenceOrder: 1 },
  ] });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id);
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processOrderPipelineTransition(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "ready"); assert.equal((await tasks(input.leadId)).size, 1);
  return { input, root };
}
for (const changed of ["source", "configuration", "receipt", "recovery", "legacy_run", "hook_v1", "human", "expired"] as const) test(`partial stage run verifies ${changed} before resuming pending actions`, async () => {
  const { input, root } = await interruptedAutomationRun(changed), { FieldValue } = await import("firebase-admin/firestore");
  if (changed === "source") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
  if (changed === "configuration") await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [{ type: "create_task", title: "Acao substituida" }] });
  if (changed === "receipt") {
    const receipts = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", root.id).get();
    assert.equal(receipts.size, 1); await receipts.docs[0].ref.delete();
  }
  if (changed === "recovery") await root.update({ stageRunRecoveryProtocol: FieldValue.delete() });
  if (changed === "hook_v1") await root.update({ "stageHookProgress.version": 1 });
  if (changed === "legacy_run") {
    const runs = (await root.get()).data()!.stageAutomationRuns, key = Object.keys(runs)[0];
    await root.update({ [`stageAutomationRuns.${key}.recoveryProtocolVersion`]: FieldValue.delete() });
  }
  if (changed === "human") await adminDb.collection("leads").doc(input.leadId).update({ pipelineStage: "captado", "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: "qa-human" } });
  if (changed === "expired") await root.update({ status: "processing", claimToken: "lost-run-owner", leaseUntil: new Date(0) });
  await Promise.all([processOrderPipelineTransition(root.id, tenantId), processOrderPipelineTransition(root.id, tenantId)]);
  assert.equal((await root.get()).data()?.status, changed === "expired" ? "done" : "reconciliation_required");
  assert.equal((await tasks(input.leadId)).size, 1);
  const notes = await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(notes.size, changed === "expired" ? 1 : 0);
});
test("an admitted v1 hook is not retroactively upgraded to receipt recovery", async () => {
  const input = await orderFixture("legacy-hook-admission");
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [{ type: "create_task", title: "Efeito legado confirmado" }, { type: "add_note", text: "Nunca repetir legado" }] });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id);
  const { newStageHookProgress } = await import("../lib/server/crm/stage-hook-progress.ts");
  await root.update({ stageHookProgress: { ...newStageHookProgress((await root.get()).data()!), version: 1 } });
  await loseStageHookAcknowledgement(adminDb, "jobs", () => processOrderPipelineTransition(root.id, tenantId));
  assert.equal((await root.get()).data()?.status, "reconciliation_required");
  assert.equal((await root.get()).data()?.stageRunRecoveryProtocol, undefined);
  await processOrderPipelineTransition(root.id, tenantId); assert.equal((await tasks(input.leadId)).size, 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
});
test("partial stage run reaches its finite retry bound without resetting quota or recreating the committed task", async () => {
  const { input, root } = await interruptedAutomationRun("retry-cap"), { Transaction } = await import("firebase-admin/firestore");
  const month = new Date().toISOString().slice(0, 7), usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${month}`), before = (await usage.get()).data()!.automationExecutions;
  const create = Transaction.prototype.create;
  const fault = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof create>) {
    if (args[0].parent.id === "lead_notes") throw new Error("QA_REMAINING_ACTION_UNAVAILABLE");
    return Reflect.apply(create, this, args);
  });
  try {
    await processOrderPipelineTransition(root.id, tenantId); assert.equal((await root.get()).data()?.status, "ready");
    await processOrderPipelineTransition(root.id, tenantId); assert.equal((await root.get()).data()?.status, "reconciliation_required");
  } finally { fault.mock.restore(); }
  await processOrderPipelineTransition(root.id, tenantId);
  assert.equal((await root.get()).data()?.attempts, 3); assert.equal((await tasks(input.leadId)).size, 1);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  assert.equal((await usage.get()).data()?.automationExecutions, before);
});

test("stage internal actions commit a receipt with their task, note and human pending record", async () => {
  const input = await orderFixture("internal-receipts");
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [
    { type: "create_task", title: "Separar produto", sequenceOrder: 0 },
    { type: "add_note", text: "Solicitacao ficticia verificada", sequenceOrder: 1 },
    { type: "alert_human", title: "Revisar condicao", text: "Nao foi enviada notificacao", sequenceOrder: 2 },
  ] });
  const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
  const records = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", String(result.id)).get();
  const receipts = records.docs.filter(doc => doc.data().type === "automation_stage_internal_effect");
  assert.equal(receipts.length, 3, "Each internal effect needs its own atomic receipt");
  assert.equal((await tasks(input.leadId)).size, 2);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.data().completionMeaning, "internal_records_committed_not_human_notified");
    assert.ok((await adminDb.collection("leads").doc(input.leadId).collection("events").doc(receipt.id).get()).exists);
  }
});

test("a receipted stage CRM move preserves source authority through the real order consumer and delivery", async () => {
  const input = await orderFixture("internal-crm-stage"), channelId = `${input.leadId}_channel`, chatId = `${input.leadId}_chat`;
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [
    { type: "move_stage", stageId: "fechamento", sequenceOrder: 0 },
    { type: "send_message", text: "Pedido ficticio preparado para revisao", sequenceOrder: 1 },
  ] });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-order-stage-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
  assert.equal((await adminDb.collection("jobs").doc(String(result.id)).get()).data()?.status, "done");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "fechamento");
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
  assert.equal(jobs.size, 1); assert.equal(await simulatedOrderStageDelivery(jobs.docs[0].ref), 1);
  assert.equal(await simulatedOrderStageDelivery(jobs.docs[0].ref), 0);
});

async function activeStagePlan(name: string, actions: TenantAutomationAction[]) {
  const input = await orderFixture(name), auto = adminDb.collection("automations").doc(`${input.leadId}_auto`);
  await auto.update({ actions });
  const committed = await commitOrderPipelineTransition(input), root = adminDb.collection("jobs").doc(committed.id);
  const source = { kind: "order" as const, id: root.id, token: `qa-claim-${name}` };
  await root.update({ status: "processing", claimToken: source.token, leaseUntil: new Date(Date.now() + 60_000) });
  const { normalizeAutomationDoc } = await import("../lib/server/automations.ts"), stage = await import("../lib/server/automation-stage-delivery.ts");
  const automation = normalizeAutomationDoc(auto.id, (await auto.get()).data()!, tenantId);
  await stage.freezeStageAutomationPlans({ tenantId, leadId: input.leadId, source, previousStage: committed.previousStage, nextStage: committed.nextStage,
    matches: candidate => candidate.id === auto.id });
  const { reserveTenantAutomationExecution } = await import("../lib/server/tenant-usage.ts");
  assert.equal((await reserveTenantAutomationExecution(tenantId, { kind: "stage", stageSourceKind: "order", jobId: root.id, claimToken: source.token, automationId: auto.id })).allowed, true);
  await stage.beginStageAutomationRun({ tenantId, leadId: input.leadId, source, automationId: auto.id });
  return { ...input, root, auto, source, automation, apply: (actionIndex: number) => stage.commitStageAutomationInternalRecords({ tenantId, leadId: input.leadId,
    source, automation, actionIndex, action: automation.actions[actionIndex] }) };
}

test("stage atomic replay preserves edited or deleted records and original deadlines without charging again", async () => {
  const input = await activeStagePlan("internal-replay", [
    { type: "create_task", title: "Separar", dueInHours: 3 }, { type: "follow_up", title: "Retorno" },
    { type: "alert_human", text: "Revisar" }, { type: "add_note", text: "Preferencia ficticia" },
  ]);
  const quota = (await input.root.get()).data()?.stageUsageReservations;
  const ids: string[] = [];
  for (let index = 0; index < 4; index++) {
    const results = await Promise.all(Array.from({ length: 5 }, () => input.apply(index)));
    assert.equal(new Set(results.map(row => row.receiptId)).size, 1); ids.push(results[0].receiptId);
  }
  assert.equal((await tasks(input.leadId)).size, 3);
  const task = adminDb.collection("lead_tasks").doc(ids[0]), first = (await task.get()).data()!;
  assert.equal(first.dueAt.toMillis(), (await input.root.get()).data()!.createdAt.toMillis() + 3 * 3600_000);
  await task.update({ title: "Decisao humana" }); await adminDb.collection("lead_notes").doc(ids[3]).delete();
  await input.apply(0); await input.apply(3);
  assert.equal((await task.get()).data()?.title, "Decisao humana"); assert.equal((await adminDb.collection("lead_notes").doc(ids[3]).get()).exists, false);
  assert.equal((await task.get()).data()?.dueAt.toMillis(), first.dueAt.toMillis());
  assert.deepEqual((await input.root.get()).data()?.stageUsageReservations, quota);
});

test("stage task, note, audit and receipt roll back together on receipt rejection", async () => {
  const input = await activeStagePlan("internal-rollback", [{ type: "alert_human", title: "Revisao", text: "Contexto ficticio" }]);
  const { Transaction } = await import("firebase-admin/firestore"), create = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.parent.id === "jobs" && ref.id.startsWith("stage_effect_")) throw new Error("QA_STAGE_RECEIPT_UNAVAILABLE");
    return create.call(this, ref, data);
  });
  try { await assert.rejects(input.apply(0), /QA_STAGE_RECEIPT_UNAVAILABLE/); } finally { interceptor.mock.restore(); }
  assert.equal((await tasks(input.leadId)).size, 0);
  assert.equal((await adminDb.collection("lead_notes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").get()).size, 1, "Only the original transition event exists");
  const result = await input.apply(0); assert.equal((await tasks(input.leadId)).size, 1);
  assert.equal((await adminDb.collection("jobs").doc(result.receiptId).get()).data()?.completionMeaning, "internal_records_committed_not_human_notified");
});

test("cold stage internal process reuses the committed receipt without undoing human edits or deleted notes", async () => {
  const input = await activeStagePlan("internal-cold", [{ type: "alert_human", title: "Revisar", text: "Contexto ficticio", dueInHours: 2 }]);
  const committed = await input.apply(0), task = adminDb.collection("lead_tasks").doc(committed.receiptId);
  await task.update({ title: "Revisao humana preservada" }); await adminDb.collection("lead_notes").doc(committed.receiptId).delete();
  const before = await task.get(), quota = (await input.root.get()).data()?.stageUsageReservations;
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/stage-internal-worker.mts", import.meta.url))],
    { env: { ...process.env, QA_STAGE_INTERNAL_TENANT: tenantId, QA_STAGE_INTERNAL_SOURCE: input.root.id, QA_STAGE_INTERNAL_TOKEN: input.source.token }, timeout: 25_000, maxBuffer: 8192 },
    (error, stdout) => error ? reject(error) : resolve(stdout)));
  assert.deepEqual(JSON.parse(output), { receiptId: committed.receiptId, executed: true });
  assert.ok((await task.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("lead_notes").doc(committed.receiptId).get()).exists, false);
  assert.deepEqual((await input.root.get()).data()?.stageUsageReservations, quota);
});

for (const revoked of ["source", "event", "connection", "config", "lease", "claim", "quota", "protocol", "run", "foreign-lead"] as const) {
  test(`stage internal effects reject ${revoked} before any records commit`, async () => {
    const input = await activeStagePlan(`internal-deny-${revoked}`, [{ type: "create_task", title: "Nao criar" }]);
    const root = (await input.root.get()).data()!, key = Object.keys(root.stageUsageReservations)[0];
    if (revoked === "source") await input.root.delete();
    if (revoked === "event") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
    if (revoked === "connection") await adminDb.collection("ecommerce_connections").doc(input.orderSource.connectionId).update({ status: "paused" });
    if (revoked === "config") await input.auto.update({ enabled: false });
    if (revoked === "lease") await input.root.update({ leaseUntil: new Date(0) });
    if (revoked === "claim") await input.root.update({ claimToken: "another-claim" });
    if (revoked === "quota") await input.root.update({ [`stageUsageReservations.${key}.allowed`]: false });
    if (revoked === "protocol") { const { FieldValue } = await import("firebase-admin/firestore"); await input.root.update({ stageInternalEffectProtocolVersion: FieldValue.delete() }); }
    if (revoked === "run") await input.root.update({ [`stageAutomationRuns.${key}.status`]: "reconciliation_required" });
    if (revoked === "foreign-lead") await adminDb.collection("leads").doc(input.leadId).update({ tenantId: `${tenantId}_foreign` });
    try { await assert.rejects(input.apply(0)); assert.equal((await tasks(input.leadId)).size, 0); }
    finally { if (revoked === "foreign-lead") await adminDb.collection("leads").doc(input.leadId).update({ tenantId }); }
  });
}

test("stage CRM receipts preserve human edits and evaluate subsequent own actions using proved projections", async () => {
  const input = await activeStagePlan("internal-crm-fields", [
    { type: "set_priority", priority: "high" }, { type: "add_tag", tag: "produto-escolhido" },
    { type: "add_tag", tag: "aguarda-tamanho" }, { type: "set_priority", priority: "medium" },
  ]), ref = adminDb.collection("leads").doc(input.leadId);
  const first = await input.apply(0); await input.apply(1); await input.apply(2);
  assert.deepEqual((await ref.get()).data()?.tags, ["produto-escolhido", "aguarda-tamanho"]);
  await ref.update({ priority: "low", "crmFieldOwnership.priority": { source: "manual", locked: true, actorId: "qa-human" } });
  await input.apply(0); const blocked = await input.apply(3);
  assert.equal((await ref.get()).data()?.priority, "low");
  assert.equal((await adminDb.collection("jobs").doc(blocked.receiptId).get()).data()?.outcome, "blocked_manual");
  assert.equal((await adminDb.collection("jobs").doc(first.receiptId).get()).data()?.after, "high");
});

test("stage CRM replay cannot invent a new baseline after a human untracked change or promote a legacy plan", async () => {
  const input = await activeStagePlan("internal-crm-stale", [{ type: "set_priority", priority: "high" }]), ref = adminDb.collection("leads").doc(input.leadId);
  await ref.update({ priority: "low" }); const evaluated = await input.apply(0);
  assert.equal((await adminDb.collection("jobs").doc(evaluated.receiptId).get()).data()?.outcome, "blocked_stale");
  assert.equal((await ref.get()).data()?.priority, "low");
  const legacy = await activeStagePlan("internal-crm-legacy", [{ type: "set_priority", priority: "high" }]);
  const { FieldValue } = await import("firebase-admin/firestore"); await legacy.root.update({ stageCrmBaseline: FieldValue.delete() });
  await assert.rejects(legacy.apply(0), /CRM_BASELINE_MISSING/);
});

test("stage CRM transaction rejects unavailable storage without committing a false blocked receipt", async () => {
  const input = await activeStagePlan("internal-crm-transient", [{ type: "move_stage", stageId: "fechamento" }]);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `pipeline/${tenantId}`) throw Object.assign(new Error("QA_STAGE_PIPELINE_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try { await assert.rejects(input.apply(0), /QA_STAGE_PIPELINE_UNAVAILABLE/); } finally { interceptor.mock.restore(); }
  const receipts = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.root.id).get();
  assert.equal(receipts.size, 0); assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "proposta");
  await input.apply(0); assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "fechamento");
});

test("stage CRM never invents a destination absent from the actual tenant funnel", async () => {
  const input = await activeStagePlan("internal-crm-invalid-stage", [{ type: "move_stage", stageId: "inexistent-destination" }]);
  const result = await input.apply(0);
  assert.equal((await adminDb.collection("jobs").doc(result.receiptId).get()).data()?.outcome, "blocked_pipeline");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "proposta");
});

for (const tampered of ["receipt", "requested", "kind", "projection", "owner", "manual"] as const) {
  test(`stage CRM own-move proof rejects ${tampered} tampering before delivery`, async () => {
    const input = await queuedOrderStage(`internal-crm-proof-${tampered}`, [
      { type: "move_stage", stageId: "fechamento", sequenceOrder: 0 }, { type: "send_message", text: "Pedido ficticio", sequenceOrder: 1 },
    ]), root = (await input.sourceJob.get()).data()!, projection = root.stageCrmProjection.pipelineStage;
    const receipt = adminDb.collection("jobs").doc(projection.receiptId), leadRef = adminDb.collection("leads").doc(input.leadId);
    if (tampered === "receipt") await receipt.delete();
    if (tampered === "requested") await receipt.update({ requested: "contato" });
    if (tampered === "kind") await receipt.update({ stageSourceKind: "proposal" });
    if (tampered === "projection") await input.sourceJob.update({ "stageCrmProjection.pipelineStage.value": "contato" });
    if (tampered === "owner") await leadRef.update({ "crmFieldOwnership.pipelineStage.automationEffectId": `${projection.receiptId}_forged` });
    if (tampered === "manual") await leadRef.update({ "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: "qa-human" } });
    assert.equal(await simulatedOrderStageDelivery(input.job), 0);
    assert.equal((await input.job.get()).data()?.status, "dead_letter");
    assert.equal((await input.job.get()).data()?.providerAttemptStartedAt, undefined);
  });
}

async function scheduledOrderStage(name: string, actions: TenantAutomationAction[], reusePipeline = false) {
  const input = await orderFixture(name, false, "pending", "", reusePipeline), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: actions.map(action => ({ ...action, waitInHours: 0.000001 })) });
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "meta_whatsapp", status: "active", phoneNumberId: "qa-order-stage-number", accessToken: "qa-only" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channel: "whatsapp", channelId, contactPhone: "5511000000084", lastClientMessageAt: new Date() });
  const committed = await setLeadPipelineStageWithEffects(input); assert.ok("id" in committed);
  const sourceJob = adminDb.collection("jobs").doc(String(committed.id)); assert.equal((await sourceJob.get()).data()?.status, "done");
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const scheduled = jobs.docs.filter(doc => doc.data().type === "automation_scheduled_action"); assert.equal(scheduled.length, actions.length);
  return { ...input, chatId, channelId, sourceJob, scheduled };
}

for (const type of ["create_task", "send_message"] as const) {
  test(`stage schedule ${type} cannot execute after its source is deleted`, async () => {
    const input = await scheduledOrderStage(`scheduled-deleted-${type}`, [{ type, title: "Nao executar", text: "Mensagem ficticia" }]);
    await input.sourceJob.delete(); await processPendingAutomationActions({ tenantId, limit: 100 });
    if (type === "create_task") assert.equal((await tasks(input.leadId)).size, 0);
    else assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  });
}
test("stage schedule identity and deadline are anchored to its original occurrence", async () => {
  const input = await scheduledOrderStage("scheduled-manifest", [{ type: "create_task", title: "Prazo original" }]);
  const source = (await input.sourceJob.get()).data()!, schedule = input.scheduled[0];
  assert.equal(schedule.data().executeAfter.toMillis(), Math.trunc(source.createdAt.toMillis() + 3.6));
  assert.match(schedule.id, /^stage_schedule_[a-f0-9]{64}$/); assert.equal(schedule.data().stageSourceId, input.sourceJob.id);
  assert.equal(schedule.data().stageSourceKind, "order"); assert.equal(schedule.data().stageScheduleProtocol, 1);
});

test("stage scheduled message is queued once, delivered once and reuses its original quota", async () => {
  const input = await scheduledOrderStage("scheduled-delivery", [{ type: "send_message", text: "Mensagem ficticia agendada" }]);
  const quota = (await input.sourceJob.get()).data()?.stageUsageReservations;
  await processPendingAutomationActions({ tenantId, limit: 100 });
  const scheduled = (await input.scheduled[0].ref.get()).data()!; assert.equal(scheduled.status, "done");
  const job = adminDb.collection("chat_outbound_jobs").doc(scheduled.outboundJobId);
  assert.equal((await job.get()).data()?.stageScheduledJobId, input.scheduled[0].id);
  assert.equal(await simulatedOrderStageDelivery(job), 1); assert.equal((await job.get()).data()?.status, "completed");
  await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal(await simulatedOrderStageDelivery(job), 0);
  assert.deepEqual((await input.sourceJob.get()).data()?.stageUsageReservations, quota);
});

for (const action of [
  { type: "create_task", title: "Separar", dueInHours: 2 }, { type: "follow_up", title: "Retornar", dueInHours: 3 },
  { type: "alert_human", title: "Revisar", text: "Contexto ficticio" }, { type: "add_note", text: "Nota ficticia" },
  { type: "move_stage", stageId: "fechamento" }, { type: "add_tag", tag: "produto-escolhido" }, { type: "set_priority", priority: "high" },
] satisfies TenantAutomationAction[]) {
  test(`stage scheduled ${action.type} commits its own receipt through the real scheduler`, async () => {
    const input = await scheduledOrderStage(`scheduled-positive-${action.type}`, [action]), before = input.scheduled[0].data();
    await processPendingAutomationActions({ tenantId, limit: 100 });
    const job = (await input.scheduled[0].ref.get()).data()!; assert.equal(job.status, "done"); assert.equal(job.actionsExecuted, 1);
    const records = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("stageSourceId", "==", input.sourceJob.id).get();
    const receipts = records.docs.filter(doc => doc.data().type === "automation_stage_internal_effect"); assert.equal(receipts.length, 1);
    assert.equal(receipts[0].data().scheduledJobId, input.scheduled[0].id);
    if (action.type === "create_task" || action.type === "follow_up") {
      const task = (await adminDb.collection("lead_tasks").doc(receipts[0].id).get()).data()!;
      assert.equal(task.dueAt.toMillis(), before.executeAfter.toMillis() + action.dueInHours! * 3600_000);
    }
    if (action.type === "move_stage") assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "fechamento");
    if (action.type === "set_priority") assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.priority, "high");
    if (action.type === "add_tag") assert.deepEqual((await adminDb.collection("leads").doc(input.leadId).get()).data()?.tags, ["produto-escolhido"]);
    if (action.type === "alert_human") assert.equal(receipts[0].data().completionMeaning, "internal_records_committed_not_human_notified");
    await processPendingAutomationActions({ tenantId, limit: 100 });
    assert.equal((await input.scheduled[0].ref.get()).data()?.attempts, 1);
  });
}

for (const revoked of ["event", "connection", "config", "human-stage", "funnel", "manifest", "deadline", "guard"] as const) {
  test(`stage scheduled internal effect rejects ${revoked} revocation at claim`, async () => {
    const input = await scheduledOrderStage(`scheduled-internal-revoke-${revoked}`, [{ type: "create_task", title: "Nao criar" }]);
    if (revoked === "event") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
    if (revoked === "connection") await adminDb.collection("ecommerce_connections").doc(input.orderSource.connectionId).update({ status: "paused" });
    if (revoked === "config") await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ enabled: false });
    if (revoked === "human-stage") await adminDb.collection("leads").doc(input.leadId).update({ "crmFieldOwnership.pipelineStage": { source: "manual", locked: true, actorId: "qa-human" } });
    if (revoked === "funnel") await adminDb.collection("pipeline").doc(tenantId).update({ updatedBy: "qa-funnel-edit" });
    if (revoked === "manifest") { const { FieldValue } = await import("firebase-admin/firestore"); await input.sourceJob.update({ stageAutomationSchedules: FieldValue.delete() }); }
    if (revoked === "deadline") await input.scheduled[0].ref.update({ executeAfter: new Date(0) });
    if (revoked === "guard") { const { FieldValue } = await import("firebase-admin/firestore"); await input.scheduled[0].ref.update({ stageScheduleProtocol: FieldValue.delete(), stageSourceId: FieldValue.delete(), stageSourceKind: FieldValue.delete() }); }
    await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal((await tasks(input.leadId)).size, 0);
    const row = (await input.scheduled[0].ref.get()).data()!; assert.equal(row.status, "reconciliation_required"); assert.equal(row.attempts, 0);
  });
}

for (const revoked of ["source", "event", "config", "recipient", "channel", "human", "schedule", "guard"] as const) {
  test(`stage queued delayed message rejects ${revoked} immediately before provider I/O`, async () => {
    const input = await scheduledOrderStage(`scheduled-outbox-revoke-${revoked}`, [{ type: "send_message", text: "Nao enviar apos revogacao" }]);
    await processPendingAutomationActions({ tenantId, limit: 100 });
    const scheduled = (await input.scheduled[0].ref.get()).data()!; assert.equal(scheduled.status, "done");
    const job = adminDb.collection("chat_outbound_jobs").doc(scheduled.outboundJobId);
    if (revoked === "source") await input.sourceJob.delete();
    if (revoked === "event") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
    if (revoked === "config") await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ enabled: false });
    if (revoked === "recipient") await adminDb.collection("chats").doc(input.chatId).update({ contactPhone: "5511000000077" });
    if (revoked === "channel") await adminDb.collection("tenant_channels").doc(input.channelId).update({ phoneNumberId: "different-number" });
    if (revoked === "human") { const { getChatStateDocId } = await import("../lib/server/chat-state-identity.ts"); await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).set({ tenantId, chatId: input.chatId, aiEnabled: false, humanOwnerUserId: "qa-human" }); }
    if (revoked === "schedule") await input.scheduled[0].ref.delete();
    if (revoked === "guard") { const { FieldValue } = await import("firebase-admin/firestore"); await job.update({ stageScheduledJobId: FieldValue.delete(), stageScheduledGuardVersion: FieldValue.delete() }); }
    assert.equal(await simulatedOrderStageDelivery(job), 0); assert.equal((await job.get()).data()?.status, "dead_letter");
    assert.equal((await job.get()).data()?.providerAttemptStartedAt, undefined);
  });
}

test("stage delayed unknown provider result never becomes a second send", async () => {
  const input = await scheduledOrderStage("scheduled-unknown", [{ type: "send_message", text: "Mensagem ficticia" }]);
  await processPendingAutomationActions({ tenantId, limit: 100 });
  const job = adminDb.collection("chat_outbound_jobs").doc((await input.scheduled[0].ref.get()).data()!.outboundJobId);
  assert.equal(await simulatedOrderStageDelivery(job, true), 1); assert.equal((await job.get()).data()?.status, "reconciliation_required");
  assert.equal(await simulatedOrderStageDelivery(job), 0);
});

test("stage scheduled internal commit resumes after lost finalization without overwriting human CRM", async () => {
  const input = await scheduledOrderStage("scheduled-lost-finalization", [{ type: "set_priority", priority: "high" }]);
  const quota = (await input.sourceJob.get()).data()?.stageUsageReservations;
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.update; let fail = true;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>, ...rest: unknown[]) {
    if (fail && ref.path === input.scheduled[0].ref.path && data.status === "done") { fail = false; throw new Error("QA_STAGE_FINALIZATION_LOST"); }
    return Reflect.apply(original, this, [ref, data, ...rest]);
  });
  try { await processPendingAutomationActions({ tenantId, limit: 100 }); } finally { interceptor.mock.restore(); }
  assert.equal((await input.scheduled[0].ref.get()).data()?.status, "retrying");
  const leadRef = adminDb.collection("leads").doc(input.leadId); assert.equal((await leadRef.get()).data()?.priority, "high");
  await leadRef.update({ priority: "low", "crmFieldOwnership.priority": { source: "manual", locked: true, actorId: "qa-human" } });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await input.scheduled[0].ref.get()).data()?.status, "done"); assert.equal((await leadRef.get()).data()?.priority, "low");
  assert.deepEqual((await input.sourceJob.get()).data()?.stageUsageReservations, quota);
});

test("one stage schedule transient claim failure stays pending without starving another eligible occurrence", async () => {
  const unavailable = await scheduledOrderStage("scheduled-transient-claim", [{ type: "create_task", title: "Primeira" }]);
  const healthy = await scheduledOrderStage("scheduled-healthy-claim", [{ type: "create_task", title: "Segunda" }], true);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `ecommerce_events/${unavailable.orderSource.id}`) throw Object.assign(new Error("QA_STAGE_CLAIM_READ_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try {
    const result = await processPendingAutomationActions({ tenantId, limit: 100 }); assert.ok(result.failed >= 1);
    assert.equal((await unavailable.scheduled[0].ref.get()).data()?.status, "pending"); assert.equal((await unavailable.scheduled[0].ref.get()).data()?.attempts, 0);
    assert.equal((await healthy.scheduled[0].ref.get()).data()?.status, "done"); assert.equal((await tasks(healthy.leadId)).size, 1);
  } finally { interceptor.mock.restore(); }
  await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal((await tasks(unavailable.leadId)).size, 1); assert.equal((await tasks(healthy.leadId)).size, 1);
});

test("stage delayed message waits for recovered scheduler finalization and keeps the same outbox slot", async () => {
  const input = await scheduledOrderStage("scheduled-message-recovery", [{ type: "send_message", text: "Mensagem ficticia" }]);
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.update; let fail = true;
  const interceptor = mock.method(Transaction.prototype, "update", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>, ...rest: unknown[]) {
    if (fail && ref.path === input.scheduled[0].ref.path && data.status === "done") { fail = false; throw new Error("QA_STAGE_MESSAGE_FINALIZATION_LOST"); }
    return Reflect.apply(original, this, [ref, data, ...rest]);
  });
  try { await processPendingAutomationActions({ tenantId, limit: 100 }); } finally { interceptor.mock.restore(); }
  const queued = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get(); assert.equal(queued.size, 1);
  const job = queued.docs[0].ref; assert.equal(await simulatedOrderStageDelivery(job), 0);
  assert.equal((await job.get()).data()?.providerAttemptStartedAt, undefined); assert.equal((await job.get()).data()?.attempts, 0);
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await input.scheduled[0].ref.get()).data()?.status, "done"); assert.equal((await input.scheduled[0].ref.get()).data()?.outboundJobId, job.id);
  await job.update({ dueAt: new Date(0) }); assert.equal(await simulatedOrderStageDelivery(job), 1); assert.equal(await simulatedOrderStageDelivery(job), 0);
});

test("cold stage scheduler recovers a committed internal action without recreating a human-edited task", async () => {
  const input = await scheduledOrderStage("scheduled-cold-recovery", [{ type: "create_task", title: "Revisar", dueInHours: 2 }]);
  const { claimScheduledAutomationJob } = await import("../lib/server/automations.ts"), { commitScheduledStageAutomationInternalRecords } = await import("../lib/server/automation-stage-delivery.ts");
  const claim = await claimScheduledAutomationJob(input.scheduled[0].id, tenantId); assert.ok(claim);
  const committed = await commitScheduledStageAutomationInternalRecords({ tenantId, leadId: input.leadId, scheduledJobId: claim.id,
    token: claim.claimToken, action: input.scheduled[0].data().action }); assert.ok(committed);
  const task = adminDb.collection("lead_tasks").doc(committed.receiptId); await task.update({ title: "Decisao humana preservada" }); const before = await task.get();
  const quota = (await input.sourceJob.get()).data()?.stageUsageReservations, originalDeadline = input.scheduled[0].data().executeAfter.toMillis();
  await input.scheduled[0].ref.update({ leaseUntil: new Date(0) });
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/stage-schedule-worker.mts", import.meta.url))],
    { env: { ...process.env, QA_STAGE_SCHEDULE_TENANT: tenantId }, timeout: 25_000, maxBuffer: 8192 },
    (error, stdout, stderr) => { if (stderr) process.stderr.write(stderr); return error ? reject(error) : resolve(stdout); }));
  const result = JSON.parse(output); assert.ok(result.completed >= 1);
  assert.equal(result.shopifyRecovery.scanned, 0); assert.equal(result.runtime.ecommerceHandlerLoaded, false, "An empty Shopify queue must not load its full handler graph");
  const scheduled = (await input.scheduled[0].ref.get()).data()!; assert.equal(scheduled.status, "done"); assert.equal(scheduled.attempts, 2);
  assert.equal(scheduled.executeAfter.toMillis(), originalDeadline); assert.ok((await task.get()).updateTime!.isEqual(before.updateTime!));
  assert.deepEqual((await input.sourceJob.get()).data()?.stageUsageReservations, quota);
});

test("stage scheduled actions reuse one finite monthly reservation even when the counter is already at its cap", async () => {
  const month = new Date().toISOString().slice(0, 7), usage = adminDb.collection("tenant_usage_monthly").doc(`${tenantId}_${month}`);
  const entitlements = adminDb.collection("tenant_entitlements").doc(tenantId), priorEntitlements = await entitlements.get(), priorUsage = await usage.get();
  try {
    await entitlements.set({ tenantId, mode: "custom", modules: { crm: true }, limits: { automationsPerMonth: 1 } });
    await usage.set({ tenantId, monthRef: month, automationExecutions: 0 });
    const input = await scheduledOrderStage("scheduled-finite-quota", [
      ...Array.from({ length: 4 }, (_, index) => ({ type: "create_task" as const, title: `Tarefa ${index}` })), { type: "send_message", text: "Mensagem ficticia" },
    ]);
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    await processPendingAutomationActions({ tenantId, limit: 100 }); assert.equal((await tasks(input.leadId)).size, 4);
    for (const scheduled of input.scheduled) assert.equal((await scheduled.ref.get()).data()?.status, "done");
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
    const message = input.scheduled.find(doc => doc.data().action.type === "send_message")!;
    const job = adminDb.collection("chat_outbound_jobs").doc((await message.ref.get()).data()!.outboundJobId);
    assert.equal(await simulatedOrderStageDelivery(job), 1); assert.equal(await simulatedOrderStageDelivery(job), 0);
    assert.equal((await usage.get()).data()?.automationExecutions, 1);
  } finally {
    if (priorEntitlements.exists) await entitlements.set(priorEntitlements.data()!); else await entitlements.delete();
    if (priorUsage.exists) await usage.set(priorUsage.data()!); else await usage.delete();
  }
});

test("one persisted Shopify event commits one transition and one downstream task under concurrent producer replay", async () => {
  const input = await orderFixture("concurrent");
  const results = await Promise.all(Array.from({ length: 5 }, () => setLeadPipelineStageWithEffects(input)));
  assert.equal(new Set(results.map(row => "id" in row && row.id)).size, 1);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const transitions = jobs.docs.filter(row => row.data().type === "crm_order_stage_transition"); assert.equal(transitions.length, 1);
  const job = transitions[0]; assert.equal(job.data().status, "done"); assert.equal(job.data().attempts, 1);
  assert.equal(job.data().completionMeaning, "stage_hooks_completed_not_provider_delivery");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "proposta");
  assert.equal((await tasks(input.leadId)).size, 1); assert.equal((await adminDb.collection("leads").doc(input.leadId).collection("events").doc(job.id).get()).data()?.sourceEventId, input.orderSource.id);
});

test("a committed transition with no started hooks is resumed by the existing periodic consumer", async () => {
  const input = await orderFixture("ready-recovery"), committed = await commitOrderPipelineTransition(input);
  const ref = adminDb.collection("jobs").doc(committed.id); assert.equal((await ref.get()).data()?.status, "ready"); assert.equal((await tasks(input.leadId)).size, 0);
  const workers = await Promise.all(Array.from({ length: 5 }, () => processPendingAutomationActions({ tenantId, limit: 100 })));
  assert.equal(workers.reduce((sum, row) => sum + row.orderStageRecovery.completed, 0), 1);
  assert.equal((await ref.get()).data()?.status, "done"); assert.equal((await tasks(input.leadId)).size, 1);
});

test("paid Shopify evidence is retained without overwriting manual CRM stage or inventing a stage in a customized funnel", async () => {
  for (const kind of ["manual", "custom"]) {
    const input = await orderFixture(`blocked-${kind}`, kind === "manual", "paid");
    if (kind === "custom") await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
      { id: "captado", label: "Entrada" }, { id: "provador", label: "Escolha" }, { id: "reserva", label: "Separado" },
    ] });
    const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
    const row = (await adminDb.collection("jobs").doc(String(result.id)).get()).data()!;
    assert.equal(row.status, "done"); assert.equal(row.outcome, kind === "manual" ? "blocked_manual" : "blocked_pipeline");
    const current = (await adminDb.collection("leads").doc(input.leadId).get()).data()!;
    assert.equal(current.pipelineStage, "captado"); assert.equal(current.wonAt, undefined); assert.equal((await tasks(input.leadId)).size, 0);
    assert.equal((await adminDb.collection("ecommerce_events").doc(input.orderSource.id).get()).data()?.normalized.order.paymentStatus, "paid");
  }
});

test("shipping without confirmed payment cannot silently mark the opportunity won", async () => {
  const input = await orderFixture("unpaid-shipped", false, "pending", "QA-TRACKING");
  const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
  assert.equal((await adminDb.collection("jobs").doc(String(result.id)).get()).data()?.outcome, "blocked_unconfirmed_purchase");
  assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.wonAt, undefined); assert.equal((await tasks(input.leadId)).size, 0);
});

test("order pipeline admission preserves storage failure instead of committing a false missing-funnel decision", async () => {
  const input = await orderFixture("pipeline-read-admission"), leadRef = adminDb.collection("leads").doc(input.leadId), before = await leadRef.get();
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const unavailable = Object.assign(new Error("QA_ORDER_PIPELINE_UNAVAILABLE"), { code: 14 });
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `pipeline/${tenantId}`) throw unavailable;
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try { await assert.rejects(commitOrderPipelineTransition(input), error => error === unavailable); }
  finally { interceptor.mock.restore(); }
  assert.ok((await leadRef.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await leadRef.collection("events").get()).size, 0);
  const roots = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get(); assert.equal(roots.size, 0);
  const committed = await commitOrderPipelineTransition(input); assert.equal(committed.outcome, "applied");
});

test("order pipeline preclaim storage failure keeps ready ownership and attempt count unchanged", async () => {
  const input = await orderFixture("pipeline-read-preclaim"), committed = await commitOrderPipelineTransition(input), ref = adminDb.collection("jobs").doc(committed.id);
  const before = await ref.get(), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const unavailable = Object.assign(new Error("QA_ORDER_PIPELINE_UNAVAILABLE"), { code: 14 });
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `pipeline/${tenantId}`) throw unavailable;
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try { await assert.rejects(processOrderPipelineTransition(committed.id, tenantId), error => error === unavailable); }
  finally { interceptor.mock.restore(); }
  const pending = await ref.get(); assert.ok(pending.updateTime!.isEqual(before.updateTime!)); assert.equal(pending.data()?.status, "ready");
  assert.equal(pending.data()?.attempts, 0); assert.equal((await tasks(input.leadId)).size, 0);
  assert.equal((await processOrderPipelineTransition(committed.id, tenantId)).completed, true); assert.equal((await tasks(input.leadId)).size, 1);
});

test("order pipeline batch records a failed read without consuming it or starving another ready occurrence", async () => {
  const first = await orderFixture("pipeline-unavailable-first"), unavailableRoot = await commitOrderPipelineTransition(first);
  const second = await orderFixture("pipeline-healthy-second", false, "pending", "", true), healthyRoot = await commitOrderPipelineTransition(second);
  const ref = adminDb.collection("jobs").doc(unavailableRoot.id), { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `ecommerce_events/${first.orderSource.id}`) throw Object.assign(new Error("QA_ORDER_SOURCE_UNAVAILABLE"), { code: 14 });
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try {
    const result = await processPendingOrderPipelineTransitions({ tenantId, limit: 20 });
    assert.equal("failed" in result ? result.failed : undefined, 1); assert.equal((await ref.get()).data()?.status, "ready"); assert.equal((await ref.get()).data()?.attempts, 0);
    assert.equal((await adminDb.collection("jobs").doc(healthyRoot.id).get()).data()?.status, "done"); assert.equal((await tasks(second.leadId)).size, 1);
  } finally { interceptor.mock.restore(); }
  await processPendingOrderPipelineTransitions({ tenantId, limit: 20 }); assert.equal((await tasks(first.leadId)).size, 1); assert.equal((await tasks(second.leadId)).size, 1);
});

test("order pipeline unknown preclaim failure preserves the exact error and durable ready state", async () => {
  const input = await orderFixture("unknown-preclaim"), committed = await commitOrderPipelineTransition(input);
  const ref = adminDb.collection("jobs").doc(committed.id), before = await ref.get();
  const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
  const unknown = new Error("QA_UNKNOWN_READ_FAILURE");
  const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
    if (target && typeof target === "object" && "path" in target && target.path === `ecommerce_events/${input.orderSource.id}`) throw unknown;
    return Reflect.apply(original, this, [target, ...rest]);
  });
  try {
    await assert.rejects(processOrderPipelineTransition(committed.id, tenantId), error => error === unknown);
    const result = await processPendingOrderPipelineTransitions({ tenantId, limit: 20 });
    assert.equal(result.failed, 1); assert.equal(result.processed, 0); assert.equal(result.completed, 0);
    const pending = await ref.get(); assert.ok(pending.updateTime!.isEqual(before.updateTime!));
    assert.equal(pending.data()?.status, "ready"); assert.equal(pending.data()?.attempts, 0);
    assert.equal((await tasks(input.leadId)).size, 0);
  } finally { interceptor.mock.restore(); }
  assert.equal((await processOrderPipelineTransition(committed.id, tenantId)).completed, true);
  await processPendingOrderPipelineTransitions({ tenantId, limit: 20 });
  assert.equal((await tasks(input.leadId)).size, 1);
});

test("order pipeline genuine invalid foreign and ambiguous configurations block admission and preclaim safely", async () => {
  const pipeline = adminDb.collection("pipeline").doc(tenantId);
  const legacy = [adminDb.collection("pipeline").doc(`${tenantId}_ambiguous_a`), adminDb.collection("pipeline").doc(`${tenantId}_ambiguous_b`)];
  async function invalidate(kind: string) {
    if (kind === "invalid") await pipeline.update({ stages: [] });
    if (kind === "foreign") await pipeline.update({ tenantId: `${tenantId}_foreign` });
    if (kind === "ambiguous") {
      const data = (await pipeline.get()).data()!;
      await pipeline.delete();
      for (const ref of legacy) await ref.set(data);
    }
  }
  for (const kind of ["invalid", "foreign", "ambiguous"]) {
    try {
      const input = await orderFixture(`configuration-admission-${kind}`);
      await invalidate(kind);
      const committed = await commitOrderPipelineTransition(input), row = (await adminDb.collection("jobs").doc(committed.id).get()).data()!;
      assert.equal(row.outcome, "blocked_pipeline"); assert.equal(row.status, "done"); assert.equal(row.attempts, 0);
      assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.pipelineStage, "captado");
      assert.equal((await tasks(input.leadId)).size, 0);
    } finally { for (const ref of legacy) await ref.delete(); }
    try {
      const input = await orderFixture(`configuration-preclaim-${kind}`), committed = await commitOrderPipelineTransition(input);
      await invalidate(kind);
      await processOrderPipelineTransition(committed.id, tenantId);
      const row = (await adminDb.collection("jobs").doc(committed.id).get()).data()!;
      assert.equal(row.status, "reconciliation_required"); assert.equal(row.attempts, 0);
      assert.equal((await tasks(input.leadId)).size, 0);
      await processPendingOrderPipelineTransitions({ tenantId, limit: 20 });
      assert.equal((await tasks(input.leadId)).size, 0);
    } finally { for (const ref of legacy) await ref.delete(); }
  }
});

test("source, account, destination and accepted intent are revalidated; another lead cannot reuse the event", async () => {
  const input = await orderFixture("identity"), committed = await commitOrderPipelineTransition(input);
  const anotherLead = `${input.leadId}_another`; await adminDb.collection("leads").doc(anotherLead).set({ tenantId, pipelineStage: "captado" });
  await assert.rejects(commitOrderPipelineTransition({ ...input, leadId: anotherLead }), /RECEIPT_CONFLICT/);
  await assert.rejects(commitOrderPipelineTransition({ ...input, nextStage: "ganho" }), /DESTINATION_INVALID/);
  await assert.rejects(commitOrderPipelineTransition({ ...input, orderSource: { ...input.orderSource, orderId: "another-order" } }), /SOURCE_REVOKED/);
  await adminDb.collection("ecommerce_connections").doc(input.orderSource.connectionId).update({ status: "paused" });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await adminDb.collection("jobs").doc(committed.id).get()).data()?.status, "reconciliation_required");
  assert.equal((await tasks(input.leadId)).size, 0);
});

test("a manual correction, changed funnel or deleted source between commit and consumption prevents stale hooks", async () => {
  for (const mutation of ["human", "funnel", "source"]) {
    const input = await orderFixture(`revoked-${mutation}`), committed = await commitOrderPipelineTransition(input);
    if (mutation === "human") {
      const snapshot = await adminDb.collection("leads").doc(input.leadId).get();
      await commitManualLeadPatch({ tenantId, leadId: input.leadId, expectedVersion: snapshot.updateTime!, actorId: "qa-human", actorName: "Vendedor QA",
        fields: ["pipelineStage"], patch: { pipelineStage: "contato", stage: "contato" }, detail: "Correcao humana" });
    }
    if (mutation === "funnel") await adminDb.collection("pipeline").doc(tenantId).update({ updatedBy: "qa-human" });
    if (mutation === "source") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
    await processPendingAutomationActions({ tenantId, limit: 100 });
    assert.equal((await adminDb.collection("jobs").doc(committed.id).get()).data()?.status, "reconciliation_required"); assert.equal((await tasks(input.leadId)).size, 0);
  }
});

test("interruption after downstream start is quarantined, never treated as ready work", async () => {
  const input = await orderFixture("uncertain"), committed = await commitOrderPipelineTransition(input), ref = adminDb.collection("jobs").doc(committed.id);
  await ref.update({ status: "processing", claimToken: "lost-owner", leaseUntil: new Date(0), attempts: 1 });
  await processPendingAutomationActions({ tenantId, limit: 100 });
  assert.equal((await ref.get()).data()?.status, "reconciliation_required"); assert.equal((await tasks(input.leadId)).size, 0);
  await setLeadPipelineStageWithEffects(input); assert.equal((await ref.get()).data()?.attempts, 1); assert.equal((await tasks(input.leadId)).size, 0);
});

test("legacy v1 task committed before downstream failure is not repeated or reported fully completed", async () => {
  const input = await orderFixture("partial-failure"), chatId = `${input.leadId}_chat`, channelId = `${input.leadId}_channel`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", phoneNumberId: "qa-stage-number", accessToken: "qa-only", channelScope: "shared" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId: input.leadId, channelId, channel: "whatsapp", contactPhone: "5511000000088", lastClientMessageAt: new Date(), status: "open" });
  await adminDb.collection("automations").doc(`${input.leadId}_auto`).update({ actions: [
    { type: "create_task", title: "Ja criada antes da falha" }, { type: "send_message", text: "Mensagem ficticia nunca enviada" },
  ] });
  const legacy = await commitOrderPipelineTransition(input);
  await freezeLegacyStageRecipe(adminDb, adminDb.collection("jobs").doc(legacy.id), "order", `${input.leadId}_auto`);
  const before = providerAttempts, prototype = Object.getPrototypeOf(adminDb.batch()), batches = new WeakSet<object>();
  const create = prototype.create as FirebaseFirestore.WriteBatch["create"], commitBatch = prototype.commit as FirebaseFirestore.WriteBatch["commit"];
  const createMock = mock.method(prototype, "create", function(this: FirebaseFirestore.WriteBatch, ...args: Parameters<FirebaseFirestore.WriteBatch["create"]>) {
    if (args[0].parent.id === "chat_outbound_jobs") batches.add(this);
    return Reflect.apply(create, this, args);
  });
  const commitMock = mock.method(prototype, "commit", function(this: FirebaseFirestore.WriteBatch) {
    if (batches.has(this)) return Promise.reject(new Error("QA_STAGE_QUEUE_COMMIT_UNAVAILABLE"));
    return Reflect.apply(commitBatch, this, []);
  });
  try {
    const result = await setLeadPipelineStageWithEffects(input); assert.ok("id" in result);
    const ref = adminDb.collection("jobs").doc(String(result.id)); assert.equal((await ref.get()).data()?.status, "reconciliation_required");
    assert.equal((await tasks(input.leadId)).size, 1); assert.equal(providerAttempts, before);
    await setLeadPipelineStageWithEffects(input); await processPendingAutomationActions({ tenantId, limit: 100 });
    assert.equal((await tasks(input.leadId)).size, 1); assert.equal(providerAttempts, before);
  } finally { createMock.mock.restore(); commitMock.mock.restore(); }
});

async function interruptedStageHook(name: string, hook: "learning" | "trail" = "trail", learningEvidence = false) {
  const input = await orderFixture(name, false, learningEvidence ? "paid" : "pending"), committed = await commitOrderPipelineTransition(input);
  if (learningEvidence) await adminDb.collection("ai_learning_events").doc(`${input.leadId}_observation`).set({ tenantId, leadId: input.leadId, recommendedOffer: "Camisa Shopify ficticia", createdAt: new Date() });
  const ref = adminDb.collection("jobs").doc(committed.id), original = adminDb.runTransaction.bind(adminDb);
  const collection = hook === "learning" ? "ai_learning_outcomes" : "lead_conversion_trails";
  let injected = false;
  const fault = mock.method(adminDb, "runTransaction", async (work: Parameters<typeof adminDb.runTransaction>[0]) => {
    let selected = false;
    const result = await original(async tx => {
      for (const method of ["create", "set"] as const) {
        const write = tx[method].bind(tx);
        Object.defineProperty(tx, method, { value: (...args: unknown[]) => {
          if ((args[0] as FirebaseFirestore.DocumentReference).parent.id === collection) selected = true;
          return Reflect.apply(write, tx, args);
        } });
      }
      return work(tx);
    });
    if (selected && !injected) { injected = true; throw new Error(`QA_${hook}_HOOK_ACK_LOST`); }
    return result;
  });
  try { await processOrderPipelineTransition(committed.id, tenantId); } finally { fault.mock.restore(); }
  assert.equal(injected, true);
  assert.equal((await tasks(input.leadId)).size, 1);
  assert.equal((await ref.get()).data()?.status, "ready", "Only the replay-safe unfinished hook should be recoverable");
  return { input, committed, ref };
}
for (const hook of ["learning", "trail"] as const) test(`partial ${hook} hook resumes without repeating confirmed automations or conversion counters`, async () => {
  const { input, committed, ref } = await interruptedStageHook(`recover-${hook}`, hook);
  await processOrderPipelineTransition(committed.id, tenantId);
  assert.equal((await ref.get()).data()?.status, "done");
  assert.equal((await tasks(input.leadId)).size, 1);
  const trail = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(trail.size, 1); assert.equal(trail.docs[0].data().occurrences, 1);
  await processPendingOrderPipelineTransitions({ tenantId, limit: 20 });
  assert.equal((await tasks(input.leadId)).size, 1);
});

test("an expired owner resumes only the durable idempotent hook and keeps confirmed tasks and trail", async () => {
  const { input, committed, ref } = await interruptedStageHook("recover-expired");
  await ref.update({ status: "processing", claimToken: "lost-confirmation", leaseUntil: new Date(0) });
  await Promise.all([processOrderPipelineTransition(committed.id, tenantId), processOrderPipelineTransition(committed.id, tenantId)]);
  assert.equal((await ref.get()).data()?.status, "done");
  assert.equal((await tasks(input.leadId)).size, 1);
  const trail = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(trail.docs[0].data().occurrences, 1);
});
for (const mutation of ["source", "human", "progress", "receipt", "audit"] as const) test(`partial hook rejects ${mutation} revocation instead of replaying confirmed work`, async () => {
  const { input, committed, ref } = await interruptedStageHook(`recover-revoke-${mutation}`);
  if (mutation === "source") await adminDb.collection("ecommerce_events").doc(input.orderSource.id).delete();
  if (mutation === "human") await adminDb.collection("leads").doc(input.leadId).update({ pipelineStage: "captado", crmFieldOwnership: { pipelineStage: { source: "manual", locked: true, actorId: "qa-human" } } });
  const { FieldValue } = await import("firebase-admin/firestore");
  if (mutation === "progress") await ref.update({ stageHookProgress: FieldValue.delete() });
  if (mutation === "receipt") await ref.update({ stageConversionTrailReceipt: FieldValue.delete() });
  if (mutation === "audit") {
    const events = await adminDb.collection("leads").doc(input.leadId).collection("events").where("stageOccurrenceId", "==", committed.id).get();
    assert.equal(events.size, 1); await events.docs[0].ref.delete();
  }
  await processOrderPipelineTransition(committed.id, tenantId);
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await tasks(input.leadId)).size, 1);
  const trail = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(trail.docs[0].data().occurrences, 1);
});

test("a corrupted learning plan requires review instead of an endless automatic hook retry", async () => {
  const { input, committed, ref } = await interruptedStageHook("recover-invalid-learning", "learning", true);
  const outcomes = await adminDb.collection("ai_learning_outcomes").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(outcomes.size, 1); assert.equal(outcomes.docs[0].data().signalStatus, "pending");
  await outcomes.docs[0].ref.update({ signalTargets: [{ suffix: "corrupted", targetKind: "unrecognized", targetId: "fixture" }] });
  await processOrderPipelineTransition(committed.id, tenantId);
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal((await tasks(input.leadId)).size, 1);
  const signals = await adminDb.collection("ai_learning_signals").where("tenantId", "==", tenantId).get();
  assert.equal(signals.size, 0);
});

test("an uncertain conversion checkpoint never becomes a second dispatch", async () => {
  const input = { ...await orderFixture("uncertain-conversion", false, "paid"), skipConversionDispatch: false };
  const committed = await commitOrderPipelineTransition(input), ref = adminDb.collection("jobs").doc(committed.id);
  await processOrderPipelineTransition(committed.id, tenantId);
  const progress = (await ref.get()).data()!.stageHookProgress;
  assert.equal(progress.steps.find((step: { name: string }) => step.name === "conversion").status, "done");
  progress.steps.find((step: { name: string }) => step.name === "conversion").status = "running";
  progress.steps.find((step: { name: string }) => step.name === "trail").status = "pending";
  await ref.update({ status: "processing", claimToken: "lost-dispatch-owner", leaseUntil: new Date(0), stageHookProgress: progress });
  const attempts = providerAttempts;
  await processOrderPipelineTransition(committed.id, tenantId);
  assert.equal((await ref.get()).data()?.status, "reconciliation_required");
  assert.equal(providerAttempts, attempts); assert.equal((await tasks(input.leadId)).size, 1);
});
test("all confirmed hooks recover a missing finalization without overwriting a human-edited task", async () => {
  const input = await orderFixture("recover-finalization"), committed = await commitOrderPipelineTransition(input);
  await processOrderPipelineTransition(committed.id, tenantId);
  const ref = adminDb.collection("jobs").doc(committed.id), task = (await tasks(input.leadId)).docs[0];
  await task.ref.update({ title: "Revisada pelo humano" });
  await ref.update({ status: "processing", leaseUntil: new Date(0), claimToken: "lost-finalization" });
  await processOrderPipelineTransition(committed.id, tenantId);
  assert.equal((await ref.get()).data()?.status, "done");
  assert.equal((await task.ref.get()).data()?.title, "Revisada pelo humano");
  const trail = await adminDb.collection("lead_conversion_trails").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(trail.docs[0].data().occurrences, 1);
});

test("event-audit storage conflict rolls back the lead and transition receipt together", async () => {
  const input = await orderFixture("atomic-conflict"), ref = adminDb.collection("leads").doc(input.leadId), before = await ref.get();
  const id = `crm_stage_${createHash("sha256").update(JSON.stringify([tenantId, input.orderSource.id, "order_pipeline"])).digest("hex")}`;
  await ref.collection("events").doc(id).set({ title: "Conflito local existente" });
  await assert.rejects(commitOrderPipelineTransition(input)); assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await adminDb.collection("jobs").doc(id).get()).exists, false);
});

test("the actual Shopify webhook consumer persists payment evidence and one stage receipt while preserving the human stage on replay", async () => {
  const input = await orderFixture("webhook-consumer", true, "paid"), leadRef = adminDb.collection("leads").doc(input.leadId);
  await leadRef.update({ sourceType: "ecommerce_order", sourceId: `${input.orderSource.connectionId}:${input.orderSource.orderId}`, email: `${input.leadId}@qa.invalid` });
  const payload = { id: input.orderSource.orderId, name: "QA-ORDER", financial_status: "paid", total_price: "100.00", currency: "BRL",
    created_at: "2026-10-19T10:00:00Z", customer: { id: "qa-customer", first_name: "Cliente", last_name: "Ficticio", email: `${input.leadId}@qa.invalid` },
    line_items: [{ title: "Camisa ficticia QA", quantity: 1, price: "100.00" }] };
  const call = () => processEcommerceWebhook({ tenantId, connectionId: input.orderSource.connectionId, provider: "shopify", payload, trusted: true,
    req: new Request("http://127.0.0.1/qa-webhook", { headers: { "x-shopify-topic": "orders/paid", "x-shopify-webhook-id": `${input.leadId}-paid` } }) });
  const initial = await call(); await call(); assert.equal(initial.ok, true);
  const current = (await leadRef.get()).data()!; assert.equal(current.pipelineStage, "captado"); assert.equal(current.crmFieldOwnership.pipelineStage.actorId, "qa-human");
  const orders = await adminDb.collection("ecommerce_orders").where("tenantId", "==", tenantId).get();
  const order = orders.docs.find(row => row.data().connectionId === input.orderSource.connectionId)!;
  assert.ok(order); assert.equal(order.data().paymentStatus, "paid"); assert.equal(order.data().leadId, input.leadId);
  const jobs = await adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  const receipts = jobs.docs.filter(row => row.data().type === "crm_order_stage_transition"); assert.equal(receipts.length, 1);
  assert.equal(receipts[0].data().orderSource.id, initial.eventId); assert.equal(receipts[0].data().outcome, "blocked_manual");
  assert.ok(initial.eventId);
  assert.equal((await adminDb.collection("ecommerce_events").doc(initial.eventId).get()).data()?.deliveryCount, 2);
});
