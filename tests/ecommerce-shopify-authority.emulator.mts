import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { processEcommerceWebhook, normalizeEcommerceAutomationSettings } = await import("../lib/server/ecommerce.ts");
const { deliverEcommerceActionTemplate } = await import("../lib/server/ecommerce-action-delivery.ts");
const { processTenantEcommerceActions } = await import("../lib/server/ecommerce-agent.ts");
const { getDefaultPipelineStages } = await import("../lib/pipeline.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { assertEcommerceActionDeliveryAllowed, EcommerceActionAuthorizationError } = await import("../lib/server/commerce/shopify-action-authority.ts");
const tenantId = `qa_shopify_authority_${Date.now()}`, channelId = `${tenantId}_channel`, originalFetch = globalThis.fetch;
const sends: string[] = []; let sequence = 0;
globalThis.fetch = async (url, init) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-source-number\/messages$/);
  const payload = JSON.parse(String(init?.body)); assert.equal(payload.type, "template"); sends.push(payload.to);
  return Response.json({ messages: [{ id: `wamid.qa-source-${sends.length}` }] });
};
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: "meta_whatsapp", accessToken: "qa-only", phoneNumberId: "qa-source-number" });
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["tenant_channels", "tenant_settings", "pipeline", "leads", "lead_identities", "contacts", "contact_identity_aliases", "ecommerce_connections", "ecommerce_events", "ecommerce_orders", "ecommerce_customers",
    "ecommerce_commercial_actions", "commercial_agent_actions", "ecommerce_agent_traces", "ecommerce_agent_runs", "ecommerce_agent_dead_letters", "lead_tasks", "lead_notes", "jobs", "growth_events", "lead_conversion_trails", "pixel_dispatch_logs", "ai_logs", "ai_learning_outcomes", "ai_tenant_learning_daily",
    "chats", "chat_state", "messages", "chat_outbound_jobs", "chat_outbound_locks", "crm_observation_jobs"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) {
      if (collection === "leads") await adminDb.recursiveDelete(row.ref); else await row.ref.delete();
    }
  }
  await adminDb.terminate();
});
async function fixture(name: string, paused = false) {
  const leadId = `${tenantId}_${name}`, connectionId = `${leadId}_shopify`, phone = `55110000${String(++sequence).padStart(5, "0")}`, email = `${name}@qa.invalid`, chatId = `${leadId}_chat`;
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: getDefaultPipelineStages() });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ecommerceAutomation: { agent: { mode: "automatic", rolloutPercent: 100 },
    purchaseConfirmation: { enabled: true, templateName: "qa_purchase", languageCode: "pt_BR", params: ["{{nome}}"] } } });
  await adminDb.collection("ecommerce_connections").doc(connectionId).set({ tenantId, provider: "shopify", status: "active" });
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente QA", email, telefone: phone, pipelineStage: "captado", crmFieldOwnership: { pipelineStage: { source: "manual", locked: true } } });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", channelId, contactPhone: phone, leadId });
  if (paused) await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: "qa-human", pausedUntil: new Date(Date.now() + 3600_000) });
  const call = (changes: Record<string, unknown> = {}, eventId = `${name}-event`) => processEcommerceWebhook({ tenantId, connectionId, provider: "shopify", trusted: true,
    payload: { id: `${name}-order`, financial_status: "paid", total_price: "100", customer: { id: `${name}-customer`, email, phone, first_name: "Cliente QA" }, ...changes },
    req: new Request("http://127.0.0.1/qa-shopify", { headers: { "x-shopify-topic": "orders/paid", "x-shopify-webhook-id": eventId } }) });
  return { leadId, connectionId, phone, chatId, call };
}
test("a Shopify webhook neither schedules nor sends unrelated tenant actions", async () => {
  const input = await fixture("scoped");
  const unrelated = adminDb.collection("ecommerce_commercial_actions").doc(`${tenantId}_unrelated`);
  await unrelated.set({ tenantId, type: "purchase_confirmation", status: "pending", customerPhone: "5511000099999", customerName: "Outro QA", leadId: "", createdAt: new Date(1) });
  const before = await unrelated.get(), sentBefore = sends.length; await input.call();
  assert.ok((await unrelated.get()).updateTime!.isEqual(before.updateTime!));
  const actions = await adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.deepEqual(sends.slice(sentBefore), [input.phone], JSON.stringify(actions.docs.map(doc => ({ status: doc.data().status, reason: doc.data().lastSendError }))));
});
test("automatic Shopify actions respect an existing human pause in their target conversation", async () => {
  const input = await fixture("paused", true), sentBefore = sends.length; await input.call();
  assert.equal(sends.length, sentBefore);
  const state = (await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()!;
  assert.equal(state.aiEnabled, false); assert.equal(state.humanOwnerUserId, "qa-human");
});

async function afterEnqueue(chatId: string, callback: (job: FirebaseFirestore.QueryDocumentSnapshot) => Promise<void>) {
  const { WriteBatch } = await import("firebase-admin/firestore"), originalCommit = WriteBatch.prototype.commit;
  let injected = false;
  const interceptor = mock.method(WriteBatch.prototype, "commit", async function(this: FirebaseFirestore.WriteBatch) {
    const result = await originalCommit.call(this);
    if (!injected) {
      const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", chatId).get();
      const job = jobs.docs.find(doc => doc.data().status === "ready");
      if (job) { injected = true; await callback(job); }
    }
    return result;
  });
  return { restore: () => interceptor.mock.restore(), injected: () => injected };
}

for (const change of ["configuration", "connection", "human", "guard_removed", "recipient", "business_state"]) test(`queued automatic delivery revalidates ${change} before its provider attempt`, async () => {
  const input = await fixture(`queued-${change}`), sentBefore = sends.length;
  let boundActionId = "";
  const hook = await afterEnqueue(input.chatId, async job => {
    boundActionId = job.data().ecommerceAuthority.actionId;
    const { FieldValue } = await import("firebase-admin/firestore");
    if (change === "configuration") await adminDb.collection("tenant_settings").doc(tenantId).update({ "ecommerceAutomation.agent.mode": "off" });
    if (change === "connection") await adminDb.collection("ecommerce_connections").doc(input.connectionId).update({ status: "paused" });
    if (change === "human") await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).set({ tenantId, chatId: input.chatId, aiEnabled: false, humanOwnerUserId: "qa-human-late" });
    if (change === "guard_removed") await job.ref.update({ ecommerceAuthority: FieldValue.delete() });
    if (change === "recipient") await adminDb.collection("ecommerce_commercial_actions").doc(job.data().ecommerceAuthority.actionId).update({ customerPhone: "5511000099998" });
    if (change === "business_state") {
      const orders = await adminDb.collection("ecommerce_orders").where("tenantId", "==", tenantId).where("connectionId", "==", input.connectionId).get();
      await orders.docs[0].ref.update({ status: "cancelled", paymentStatus: "refunded" });
    }
  });
  try {
    if (change === "connection") await assert.rejects(input.call(), /CONNECTION_REVOKED/);
    else { const response = await input.call(); assert.equal("completed" in response && response.completed, true); }
    assert.equal(hook.injected(), true); assert.equal(sends.length, sentBefore);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 1); assert.equal(jobs.docs[0].data().status, "dead_letter"); assert.equal(jobs.docs[0].data().providerAttemptStartedAt, undefined);
    const actionId = jobs.docs[0].data().ecommerceAuthority?.actionId || boundActionId;
    if (actionId) { const action = (await adminDb.collection("ecommerce_commercial_actions").doc(actionId).get()).data()!;
      assert.equal(action.policyBlocked, true); assert.equal(action.status, "failed"); assert.equal(action.sendAttempts, 0); assert.equal(action.nextAttemptAt, null); }
  } finally { hook.restore(); }
});

test("automatic templates retain AI provenance without pausing their own conversation", async () => {
  const input = await fixture("provenance"), before = sends.length; await input.call(); assert.equal(sends.length, before + 1);
  const messages = await adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
  assert.equal(messages.size, 1); assert.equal(messages.docs[0].data().aiGenerated, true);
  const state = (await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data();
  assert.notEqual(state?.aiEnabled, false);
});

test("a human can explicitly deliver a paused unsent action without enabling automatic replies", async () => {
  const input = await fixture("manual-paused", true), before = sends.length; await input.call(); assert.equal(sends.length, before);
  const actions = await adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(actions.size, 1);
  const sent = await deliverEcommerceActionTemplate({ tenantId, actionId: actions.docs[0].id, templateName: "qa_purchase", languageCode: "pt_BR", bodyParams: ["Cliente QA"], actor: { id: "qa-human", name: "Humano QA" } });
  assert.ok(sent.metaMessageId); assert.equal(sends.length, before + 1);
  const job = (await adminDb.collection("chat_outbound_jobs").doc(sent.jobId).get()).data()!; assert.equal(job.ecommerceAuthority.automatic, false);
  assert.equal((await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()?.aiEnabled, false);
});

test("a new event updates a pending unbound intent before its first send, with a revision and source audit", async () => {
  const input = await fixture("refresh");
  await adminDb.collection("tenant_settings").doc(tenantId).update({ "ecommerceAutomation.agent.mode": "off" });
  const first = await input.call(), before = sends.length;
  await adminDb.collection("tenant_settings").doc(tenantId).update({ "ecommerceAutomation.agent.mode": "automatic" });
  const second = await input.call({ total_price: "120" }, "refresh-updated"); assert.equal(sends.length, before + 1);
  const actions = await adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(actions.size, 1); const action = actions.docs[0].data(); assert.equal(action.amount, 120); assert.equal(action.sourceRevision, 2); assert.equal(action.sourceEventId, second.eventId);
  const events = await adminDb.collection("leads").doc(input.leadId).collection("events").where("type", "==", "ecommerce_pending_action_refreshed").get();
  assert.equal(events.size, 1); assert.equal(events.docs[0].data().previousSourceEventId, first.eventId);
});

test("a frozen webhook plan never incorporates another action added after admission", async () => {
  const input = await fixture("frozen-plan"); const result = await input.call(); assert.ok(result.eventId);
  const source = (await adminDb.collection("ecommerce_events").doc(result.eventId!).get()).data()!, plan = source.occurrence.actionPlan;
  assert.equal(plan.actions.length, 1);
  const original = (await adminDb.collection("ecommerce_commercial_actions").doc(plan.actions[0].id).get()).data()!;
  const unbound = Object.fromEntries(Object.entries(original).filter(([key]) => key !== "whatsappDelivery"));
  await adminDb.collection("ecommerce_commercial_actions").doc(`${tenantId}_late`).set({ ...unbound, status: "pending", nextAttemptAt: new Date(0) });
  const settings = (await adminDb.collection("tenant_settings").doc(tenantId).get()).data()!, before = sends.length;
  const repeated = await processTenantEcommerceActions({ tenantId, source: "webhook", shopifySourceEventId: result.eventId!, automation: normalizeEcommerceAutomationSettings(settings.ecommerceAutomation), actor: { id: "qa-agent", name: "QA" } });
  assert.equal(repeated.processed, 0); assert.equal(sends.length, before);
  assert.deepEqual((await adminDb.collection("ecommerce_events").doc(result.eventId!).get()).data()?.occurrence.actionPlan, plan);
});

test("configuration revoked after preflight is checked again in the provider-start transaction", async () => {
  const input = await fixture("provider-fence"), before = sends.length;
  const original = adminDb.runTransaction.bind(adminDb); let injected = false;
  const interceptor = mock.method(adminDb, "runTransaction", async function<T>(fn: (tx: FirebaseFirestore.Transaction) => Promise<T>, options?: FirebaseFirestore.ReadWriteTransactionOptions) {
    const result = await original(fn, options);
    if (!injected && fn.name === "check") {
      const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
      if (jobs.docs.some(doc => doc.data().status === "processing" && !doc.data().providerAttemptStartedAt)) {
        injected = true; await adminDb.collection("tenant_settings").doc(tenantId).update({ "ecommerceAutomation.agent.mode": "off" });
      }
    }
    return result;
  });
  try {
    await input.call(); assert.equal(injected, true); assert.equal(sends.length, before);
    const jobs = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get();
    assert.equal(jobs.size, 1); const job = jobs.docs[0].data(); assert.equal(job.status, "dead_letter");
    assert.equal(job.errorCode, "ECOMMERCE_AUTHORITY_BLOCKED"); assert.equal(job.providerAttemptStartedAt, undefined);
  } finally { interceptor.mock.restore(); }
});

test("configuration revoked before claim cannot take ownership of the selected action", async () => {
  const input = await fixture("claim-revoked"), before = sends.length;
  const original = adminDb.getAll.bind(adminDb); let injected = false;
  const interceptor = mock.method(adminDb, "getAll", async function(...refs: Parameters<typeof adminDb.getAll>) {
    const snapshots = await original(...refs);
    if (!injected && snapshots.some(snapshot => snapshot.ref.parent.id === "ecommerce_commercial_actions" && snapshot.data()?.leadId === input.leadId && snapshot.data()?.status === "pending")) {
      injected = true; await adminDb.collection("tenant_settings").doc(tenantId).update({ "ecommerceAutomation.agent.mode": "off" });
    }
    return snapshots;
  });
  try {
    await input.call(); assert.equal(injected, true); assert.equal(sends.length, before);
    const actions = await adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
    assert.equal(actions.size, 1); assert.equal(actions.docs[0].data().status, "pending"); assert.equal(actions.docs[0].data().processingRunId, undefined);
    assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("chatId", "==", input.chatId).get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

test("temporary database unavailability is not misclassified as a permanent authorization denial", async () => {
  const input = await fixture("storage-transient"), before = sends.length;
  let probeError: unknown;
  const hook = await afterEnqueue(input.chatId, async job => {
    const sourcePath = `ecommerce_events/${job.data().ecommerceAuthority.sourceEventId}`;
    const { Transaction } = await import("firebase-admin/firestore"), original = Transaction.prototype.get;
    const interceptor = mock.method(Transaction.prototype, "get", function(this: FirebaseFirestore.Transaction, target: unknown, ...rest: unknown[]) {
      if (target && typeof target === "object" && "path" in target && target.path === sourcePath) throw Object.assign(new Error("QA_FIRESTORE_UNAVAILABLE"), { code: 14 });
      return Reflect.apply(original, this, [target, ...rest]);
    });
    try { await assertEcommerceActionDeliveryAllowed(job.data()); }
    catch (error) { probeError = error; }
    finally { interceptor.mock.restore(); }
  });
  try {
    await input.call(); assert.equal(hook.injected(), true);
    assert.ok(probeError && typeof probeError === "object" && "code" in probeError); assert.equal(probeError.code, 14);
    assert.equal(probeError instanceof EcommerceActionAuthorizationError, false); assert.equal(sends.length, before + 1);
  } finally { hook.restore(); }
});
