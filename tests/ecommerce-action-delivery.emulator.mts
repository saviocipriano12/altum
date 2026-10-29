import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { deliverEcommerceActionTemplate, EcommerceDeliveryPendingError } = await import("../lib/server/ecommerce-action-delivery.ts");
const { processTenantEcommerceActions } = await import("../lib/server/ecommerce-agent.ts");
const { normalizeEcommerceAutomationSettings } = await import("../lib/server/ecommerce.ts");
const tenantId = `qa_ecommerce_delivery_${Date.now()}`, channelId = `${tenantId}_channel`;
const originalFetch = globalThis.fetch;
let sends = 0, loseAck = false, omitId = false;
let duringSend: (() => Promise<void>) | null = null;
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, init);
  assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-ecommerce-number\/messages$/);
  const payload = JSON.parse(String(init?.body)); assert.equal(payload.type, "template");
  const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(jobs.size, 1); assert.ok(jobs.docs[0].data().providerAttemptStartedAt);
  sends++; if (duringSend) await duringSend();
  if (loseAck) throw new Error("simulated lost ecommerce acknowledgement");
  return Response.json({ messages: omitId ? [] : [{ id: `wamid.qa-ecommerce-${sends}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", accessToken: "qa-only", phoneNumberId: "qa-ecommerce-number" });
let sequence = 0;
async function fixture(name: string) {
  const actionId = `${tenantId}_${name}`, phone = `55110000${String(++sequence).padStart(5, "0")}`;
  await adminDb.collection("ecommerce_commercial_actions").doc(actionId).set({ tenantId, type: "purchase_confirmation", status: "pending", customerPhone: phone,
    customerName: "Cliente QA", nextAttemptAt: new Date(0), createdAt: new Date(), leadId: "" });
  return { tenantId, actionId, templateName: "qa_purchase", languageCode: "pt_BR", bodyParams: ["Cliente QA"], actor: { id: "qa-human", name: "Atendente QA" } };
}
const automation = normalizeEcommerceAutomationSettings({ agent: { mode: "automatic", rolloutPercent: 100 },
  purchaseConfirmation: { enabled: true, templateName: "qa_purchase", languageCode: "pt_BR", params: ["Cliente QA"] } });
const processActions = () => processTenantEcommerceActions({ tenantId, automation, actor: { id: "qa-agent", name: "Agente QA" }, source: "scheduled" });
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["ecommerce_commercial_actions", "ecommerce_agent_traces", "ecommerce_agent_runs", "ecommerce_agent_dead_letters", "messages", "chats", "chat_state", "chat_outbound_jobs", "chat_outbound_locks", "tenant_channels", "crm_observation_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("concurrent manual/automatic callers share one bound chat, message and template delivery", async () => {
  const input = await fixture("concurrent"), before = sends;
  await Promise.allSettled(Array.from({ length: 6 }, (_, i) => deliverEcommerceActionTemplate({ ...input, actor: { id: `qa-actor-${i}`, name: "QA" } })));
  const sent = await deliverEcommerceActionTemplate(input);
  assert.equal(sends, before + 1); assert.ok(sent.metaMessageId);
  const action = (await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).get()).data()!;
  assert.equal(action.whatsappDelivery.chatId, sent.chatId);
  for (const collection of ["messages", "chat_outbound_jobs"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).where("chatId", "==", sent.chatId).get();
    assert.equal(rows.size, 1);
  }
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "done", whatsappSentAt: new Date() });
});

for (const missing of [false, true]) test(`uncertain ecommerce delivery is never resent, including HTTP without ID (${missing})`, async () => {
  const input = await fixture(`unknown-${missing}`), before = sends;
  loseAck = !missing; omitId = missing;
  try {
    await assert.rejects(deliverEcommerceActionTemplate(input), EcommerceDeliveryPendingError);
    await assert.rejects(deliverEcommerceActionTemplate(input), EcommerceDeliveryPendingError);
    assert.equal(sends, before + 1);
    const actionRef = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId);
    const binding = (await actionRef.get()).data()!.whatsappDelivery;
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(binding.jobId).get()).data()?.status, "reconciliation_required");
    await actionRef.update({ status: "done" });
  } finally { loseAck = false; omitId = false; }
});

test("accepted content or recipient cannot change, and a foreign tenant cannot reuse the action", async () => {
  const input = await fixture("changed"); await deliverEcommerceActionTemplate(input); const before = sends;
  await assert.rejects(deliverEcommerceActionTemplate({ ...input, bodyParams: ["Outro"] }), /outro conteudo/);
  await assert.rejects(deliverEcommerceActionTemplate({ ...input, tenantId: `${tenantId}_foreign` }), /fora do tenant/);
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ customerPhone: "5511000000099" });
  await assert.rejects(deliverEcommerceActionTemplate(input), /outro conteudo/);
  assert.equal(sends, before);
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "done" });
});

test("lost acknowledgement of action binding leaves no delivery and resumes the same binding", async () => {
  const input = await fixture("binding-crash"), before = sends;
  const original = adminDb.runTransaction.bind(adminDb); let intercepted = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const result = await original(callback);
    if (!intercepted) { intercepted = true; throw new Error("lost binding commit acknowledgement"); }
    return result;
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(deliverEcommerceActionTemplate(input), /lost binding/); } finally { hook.mock.restore(); }
  const binding = (await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).get()).data()!.whatsappDelivery;
  assert.ok(binding); assert.equal(sends, before);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(binding.jobId).get()).exists, false);
  const sent = await deliverEcommerceActionTemplate(input); assert.equal(sent.jobId, binding.jobId); assert.equal(sends, before + 1);
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "done" });
});

test("expired new action claim reconciles an already completed outbox instead of sending again", async () => {
  const input = await fixture("recover-completed"); await deliverEcommerceActionTemplate(input); const before = sends;
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "processing", deliveryProtocolVersion: 1, processingStartedAt: new Date(0), processingRunId: "qa-crashed" });
  const result = await processActions(); assert.equal(result.sent, 1); assert.equal(sends, before);
  assert.equal((await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).get()).data()?.status, "done");
});

test("legacy processing claim is held for review rather than blindly sent again", async () => {
  const input = await fixture("legacy-recover"), before = sends;
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "processing", processingStartedAt: new Date(0) });
  await assert.rejects(deliverEcommerceActionTemplate(input), /antiga em processamento/);
  await processActions();
  assert.equal(sends, before);
  assert.equal((await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).get()).data()?.status, "failed");
  await assert.rejects(deliverEcommerceActionTemplate(input), /reconciliacao/);
});

test("manual and automatic entry points are wired to the same durable helper", async () => {
  for (const path of ["lib/server/ecommerce-agent.ts", "app/api/tenant/[tenantId]/ecommerce/actions/[actionId]/send-template/route.ts"]) {
    const source = await readFile(path, "utf8"); assert.match(source, /await deliverEcommerceActionTemplate/);
    assert.doesNotMatch(source, /await sendTenantChatTemplate/);
  }
});

test("automatic uncertain action stays pending without exhausting attempts or declaring done", async () => {
  const input = await fixture("automatic-pending"), before = sends;
  loseAck = true;
  try {
    const first = await processActions(); assert.equal(first.pendingDelivery, 1); assert.equal(first.sent, 0);
    const ref = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId), action = (await ref.get()).data()!;
    assert.equal(action.status, "pending"); assert.equal(action.sendAttempts, 0);
    await ref.update({ nextAttemptAt: new Date(0) });
    const second = await processActions(); assert.equal(second.pendingDelivery, 1); assert.equal(second.sent, 0);
    assert.equal(sends, before + 1);
    await ref.update({ status: "done" });
  } finally { loseAck = false; }
});

test("legacy WhatsApp chat is retained and social chats with same phone are never overwritten", async () => {
  const input = await fixture("legacy-chat"), ref = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId);
  const phone = (await ref.get()).data()!.customerPhone;
  const legacy = adminDb.collection("chats").doc(`${input.actionId}_old`), social = adminDb.collection("chats").doc(`${input.actionId}_instagram`);
  await legacy.set({ tenantId, contactPhone: phone, channelId });
  await social.set({ tenantId, contactPhone: phone, channel: "instagram" });
  const sent = await deliverEcommerceActionTemplate(input); assert.equal(sent.chatId, legacy.id);
  assert.equal((await social.get()).data()?.channel, "instagram");
  await ref.update({ status: "done" });
});

test("removed bound conversation is not replaced by another delivery target", async () => {
  const input = await fixture("removed-bound"), sent = await deliverEcommerceActionTemplate(input), before = sends;
  await adminDb.collection("chats").doc(sent.chatId).delete();
  await assert.rejects(deliverEcommerceActionTemplate(input), /removida/); assert.equal(sends, before);
  await adminDb.collection("ecommerce_commercial_actions").doc(input.actionId).update({ status: "done" });
});

for (const uncertain of [false, true]) test(`worker losing action ownership cannot overwrite the newer claim (uncertain=${uncertain})`, async () => {
  const input = await fixture(`owner-${uncertain}`), ref = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId);
  duringSend = async () => { await ref.update({ processingRunId: "qa-new-owner", lastSendError: "preserve-new-owner" }); };
  loseAck = uncertain;
  try {
    const result = await processActions(); assert.equal(result.results[0]?.status, "busy");
    const action = (await ref.get()).data()!;
    assert.equal(action.processingRunId, "qa-new-owner"); assert.equal(action.status, "processing");
    assert.equal(action.lastSendError, "preserve-new-owner");
    await ref.update({ status: "done" });
  } finally { duringSend = null; loseAck = false; }
});

test("foreign lead cannot be linked by a tenant-scoped ecommerce action", async () => {
  const input = await fixture("foreign-lead"), before = sends;
  const lead = adminDb.collection("leads").doc(`${input.actionId}_foreign`);
  await lead.set({ tenantId: "qa-other-tenant" });
  const action = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId);
  await action.update({ leadId: lead.id });
  try { await assert.rejects(deliverEcommerceActionTemplate(input), /Lead.*fora do tenant/); assert.equal(sends, before); }
  finally { await lead.delete(); await action.update({ status: "done" }); }
});
