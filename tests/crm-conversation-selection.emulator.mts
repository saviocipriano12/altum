import assert from "node:assert/strict";
import test, { before, after, mock } from "node:test";
import { randomUUID } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { Transaction } = await import("firebase-admin/firestore");
const { GET, PATCH } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/commercial-context/route.ts");
const { getUnambiguousConversationLead: target, matchesConversationCommercialFence: matches } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { analyzeLeadCommercialState: analyze } = await import("../lib/server/crm/operations.ts");
const { handleIncomingMessage } = await import("../lib/server/ai/agent.ts");
const runtime = await import("../lib/server/ai/runtime-state.ts");
const { enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const tenantId = `qa_selection_${Date.now()}_${randomUUID().slice(0, 6)}`, uid = `${tenantId}_seller`;
let token = "", sequence = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "No external transport permitted");
  return originalFetch(input, options);
};
before(async () => {
  await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "SelectionLocalOnly2026!" });
  await adminDb.collection("users").doc(uid).set({ tenantId, role: "client_agent", status: "active", name: "Vendedor fictício" });
  await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_agent", status: "active", capabilities: ["edit_leads", "respond_inbox"] });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, inbox: true }, limits: {} });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: false, responsePaused: true } });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "SelectionLocalOnly2026!", returnSecureToken: true }) });
  assert.equal(response.status, 200); token = (await response.json()).idToken;
});
after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["users", "tenant_users", "tenant_entitlements", "tenant_settings", "leads", "contacts", "chats", "messages", "tenant_channels", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "lead_tasks", "crm_semantic_runs", "crm_semantic_usage_monthly", "ai_usage_ledger", "ai_usage_monthly", "ai_conversation_state"])
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  await adminAuth.deleteUser(uid); await adminDb.terminate();
});
function req(body?: unknown, authorized = true) {
  return new Request("http://127.0.0.1/context", { method: body === undefined ? "GET" : "PATCH", headers: {
    ...(authorized ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function fixture() {
  const prefix = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${prefix}_old`), purchase = adminDb.collection("leads").doc(`${prefix}_new`);
  const person = adminDb.collection("contacts").doc(`${prefix}_person`), chat = adminDb.collection("chats").doc(`${prefix}_chat`);
  await person.set({ tenantId, leadIds: [lead.id, purchase.id] });
  for (const ref of [lead, purchase]) await ref.set({ tenantId, nome: "Cliente fictício", ownerId: uid, contactId: person.id, pipelineStage: "captado",
    ...(ref.id === purchase.id ? { recordKind: "opportunity", opportunityTitle: "Recompra" } : {}), createdAt: new Date() });
  await chat.set({ tenantId, leadId: lead.id, ownerId: uid, channel: "whatsapp" });
  const context = { params: Promise.resolve({ tenantId, chatId: chat.id }) };
  const read = async () => { const response = await GET(req(), context); assert.equal(response.status, 200); return response.json(); };
  const select = async (leadId: string | null = purchase.id, extra: Record<string, unknown> = {}) => PATCH(req({ revision: (await read()).revision,
    requestId: randomUUID(), mode: leadId ? "opportunity" : "relationship", leadId, ...extra }), context);
  const message = async (text: string, selected = false) => {
    const ref = adminDb.collection("messages").doc(`${prefix}_${randomUUID()}`);
    await ref.set({ tenantId, chatId: chat.id, ...(selected ? { leadId: purchase.id } : {}), sender: "client", text, createdAt: new Date() });
    return ref;
  };
  return { lead, purchase, person, chat, context, read, select, message };
}

test("selection is atomic and keeps historical buyer messages out of the new purchase", async () => {
  const f = await fixture(), historical = await f.message("Meu orçamento é 1000 reais");
  assert.equal((await f.read()).historyBoundary, "legacy_history");
  await f.chat.update({ lastMessage: "Contexto antigo que não pertence à recompra", lastMessageTime: new Date(), lastAgentMessageAt: new Date(), followUpCount: 20 });
  assert.deepEqual(await target({ tenantId, chatId: f.chat.id }), { ok: false, reason: "opportunity_context_required" });
  const original = await f.lead.get(), selected = await f.select(); assert.equal(selected.status, 200);
  const result = await selected.json(), current = await target({ tenantId, chatId: f.chat.id }); assert.ok(current.ok);
  assert.equal(current.leadId, f.purchase.id); assert.equal(current.selectionId, result.selectionId); assert.ok(current.selectedAfter);
  assert.equal((await f.chat.get()).data()?.leadId, f.purchase.id);
  assert.equal((await f.read()).historyBoundary, "new_messages_only");
  assert.ok((await f.lead.get()).updateTime!.isEqual(original.updateTime!));
  const old = await observe({ tenantId, chatId: f.chat.id, messageId: historical.id }); assert.equal(old.observed, false);
  const greeting = await f.message("Olá", true); assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: greeting.id })).observed, true);
  assert.equal((await f.purchase.get()).data()?.customFields?.orcamento, undefined);
  const analysis = await analyze({ tenantId, leadId: f.purchase.id, lead: (await f.purchase.get()).data()! });
  assert.ok(analysis.handoff.transcript.every(row => row.id !== historical.id && !row.text.includes("1000")));
  assert.equal(analysis.relatedChats[0]?.lastMessage, "Olá");
  assert.equal(analysis.relatedChats[0]?.lastAgentMessageAt, null);
  assert.notEqual(analysis.relatedChats[0]?.followUpCount, 20);
  const next = await f.message("Meu orçamento é 9000 reais", true);
  assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: next.id })).observed, true);
  assert.match((await f.purchase.get()).data()?.customFields.orcamento, /9000/);
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 1);
});

test("same-purchase reselection invalidates old fences and admitted jobs without replaying history", async () => {
  const f = await fixture(); assert.equal((await f.select()).status, 200);
  const message = await f.message("Meu orçamento é 2000 reais", true), source = await message.get(), first = await target({ tenantId, chatId: f.chat.id }); assert.ok(first.ok);
  const fence = { tenantId, chatId: f.chat.id, leadId: f.purchase.id, leadGeneration: first.generation, chatGeneration: first.chatGeneration,
    contactId: first.contactId, contactGeneration: first.contactGeneration, selectionId: first.selectionId, messageId: message.id, messageVersion: source.updateTime! };
  assert.equal(await adminDb.runTransaction(tx => matches(tx, fence), { readOnly: true }), true);
  const job = await enqueue({ tenantId, chatId: f.chat.id, messageId: message.id });
  assert.equal((await f.select()).status, 200);
  assert.equal(await adminDb.runTransaction(tx => matches(tx, fence), { readOnly: true }), false);
  const processed = await processJobs({ jobId: job.jobId }); assert.equal(processed.results[0].status, "awaiting_context");
  assert.equal((await f.purchase.get()).data()?.customFields?.orcamento, undefined);
});

test("retry reuses its occurrence and never resets a later selection or history cutoff", async () => {
  const f = await fixture(), original = await f.read(), body = { revision: original.revision, requestId: "stable-operation", mode: "opportunity", leadId: f.purchase.id };
  const first = await PATCH(req(body), f.context); assert.equal(first.status, 200); const id = (await first.json()).selectionId;
  const before = await f.chat.get(); assert.equal((await PATCH(req(body), f.context)).status, 200);
  assert.ok((await f.chat.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.select(null)).status, 200);
  const retry = await PATCH(req(body), f.context); assert.equal(retry.status, 200); assert.equal((await retry.json()).isCurrent, false);
  assert.notEqual((await f.chat.get()).data()?.commercialContext.id, id);
  assert.equal((await PATCH(req({ ...body, mode: "relationship", leadId: null }), f.context)).status, 409);
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 2);
});

test("atomic rollback preserves the old association when its historical event cannot be written", async () => {
  const f = await fixture(), before = await f.chat.get(), original = Transaction.prototype.create;
  const failure = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ...args: Parameters<typeof original>) {
    if ((args[1] as Record<string, unknown>)?.type === "commercial_context_selected") throw new Error("QA_CONTEXT_EVENT_FAILURE");
    return Reflect.apply(original, this, args);
  });
  try { assert.equal((await f.select()).status, 500); } finally { failure.mock.restore(); }
  assert.ok((await f.chat.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 0);
});

test("concurrent choices cannot both commit against the same conversation revision", async () => {
  const f = await fixture(), current = await f.read();
  const responses = await Promise.all([
    PATCH(req({ revision: current.revision, requestId: "purchase", mode: "opportunity", leadId: f.purchase.id }), f.context),
    PATCH(req({ revision: current.revision, requestId: "support", mode: "relationship", leadId: null }), f.context),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 1);
});

test("support selection stops CRM observation without rewriting the earlier purchase", async () => {
  const f = await fixture(); assert.equal((await f.select(null)).status, 200);
  assert.deepEqual(await target({ tenantId, chatId: f.chat.id }), { ok: false, reason: "no_commercial_lead" });
  const message = await f.message("Meu orçamento é 7000 reais");
  assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: message.id })).observed, false);
  assert.equal((await f.lead.get()).data()?.customFields, undefined); assert.equal((await f.purchase.get()).data()?.customFields, undefined);
});

test("selection refuses unrelated people, other sellers, invalid bodies and stale conversation revisions", async () => {
  const f = await fixture(), unrelated = await fixture(), first = await f.read();
  assert.equal((await f.select(unrelated.purchase.id)).status, 409);
  await f.purchase.update({ ownerId: `${uid}_other` }); assert.equal((await f.select()).status, 403); await f.purchase.update({ ownerId: uid });
  for (const extra of [{ leadId: "../bad" }, { actorId: "inventado" }, { mode: "inventado" }, { requestId: "" }]) assert.equal((await f.select(f.purchase.id, extra)).status, 400);
  await f.chat.update({ status: "pending" }); assert.equal((await f.select(f.purchase.id, { revision: first.revision })).status, 409);
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 0);
  assert.equal((await GET(req(undefined, false), f.context)).status, 401);
});

test("live channel transfer, revoked membership and changed identity prevent selection", async () => {
  const f = await fixture(), channel = adminDb.collection("tenant_channels").doc(`${f.chat.id}_channel`);
  await channel.set({ tenantId, channelScope: "personal", ownerUserId: `${uid}_other` });
  await f.chat.update({ channelId: channel.id }); assert.equal((await PATCH(req({ revision: "1:0", requestId: "private", mode: "opportunity", leadId: f.purchase.id }), f.context)).status, 403);
  await channel.update({ ownerUserId: uid });
  await f.person.update({ leadIds: [f.lead.id] }); assert.equal((await f.select()).status, 409);
  await f.person.update({ leadIds: [f.lead.id, f.purchase.id] });
  const original = await f.read(), membership = adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`);
  await membership.update({ status: "blocked" });
  assert.equal((await PATCH(req({ revision: original.revision, requestId: "revoked", mode: "opportunity", leadId: f.purchase.id }), f.context)).status, 403);
  await membership.update({ status: "active" });
  assert.equal((await f.chat.collection("commercial_context_events").get()).size, 0);
});

test("a recreated target or chat and a selection without its matching event cannot inherit authority", async () => {
  const f = await fixture(); assert.equal((await f.select()).status, 200);
  const row = (await f.purchase.get()).data()!; await f.purchase.delete(); await f.purchase.set(row);
  assert.equal((await target({ tenantId, chatId: f.chat.id })).ok, false);
  assert.equal((await f.select()).status, 200);
  const current = (await f.chat.get()).data()!;
  await f.chat.collection("commercial_context_events").doc(current.commercialContext.id).delete();
  assert.equal((await target({ tenantId, chatId: f.chat.id })).ok, false);
  assert.equal((await f.select()).status, 200);
  const selected = (await f.chat.get()).data()!; await f.chat.delete(); await f.chat.set(selected);
  assert.equal((await target({ tenantId, chatId: f.chat.id })).ok, false);
});

test("answering agent cannot restore another purchase's memory or call a provider for a selected context", async () => {
  const f = await fixture(); assert.equal((await f.select()).status, 200);
  const message = await f.message("Meu orçamento é 2000 reais", true);
  const result = await handleIncomingMessage({ tenantId, chatId: f.chat.id, messageId: message.id });
  assert.equal(result.decision, "skip"); assert.equal(result.reason, "selected_commercial_context_agent_pending");
});

test("late historical imports and edited future dates cannot cross the selection boundary", async () => {
  const f = await fixture(), earlier = await f.message("Meu orçamento é 1000 reais");
  assert.equal((await f.select()).status, 200);
  await earlier.update({ createdAt: new Date(Date.now() + 60_000), leadId: f.purchase.id });
  const late = await f.message("Meu orçamento é 8000 reais", true);
  await late.update({ createdAt: new Date(0) });
  for (const message of [earlier, late]) {
    assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: message.id })).observed, false);
    assert.equal((await enqueue({ tenantId, chatId: f.chat.id, messageId: message.id })).status, "awaiting_context");
  }
  assert.equal((await f.purchase.get()).data()?.customFields?.orcamento, undefined);
});

test("known millisecond dates remain supported while invalid imported dates fail closed", async () => {
  const f = await fixture(); assert.equal((await f.select()).status, 200);
  const numeric = await f.message("Meu orçamento é 6500 reais", true);
  await numeric.update({ createdAt: Date.now() });
  assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: numeric.id })).observed, true);
  assert.match((await f.purchase.get()).data()?.customFields.orcamento, /6500/);
  const invalid = await f.message("Meu orçamento é 8000 reais", true);
  await invalid.update({ createdAt: Number.MAX_VALUE });
  assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: invalid.id })).observed, false);
  assert.match((await f.purchase.get()).data()?.customFields.orcamento, /6500/);
});

test("a model response arriving after reselection is discarded and an old source cannot start another paid attempt", async () => {
  const f = await fixture(); assert.equal((await f.select()).status, 200);
  const message = await f.message("Meu orçamento é 2000 reais", true), keys = ["ALTUM_CRM_SEMANTIC_ENABLED", "ALTUM_CRM_SEMANTIC_TENANTS", "ALTUM_CRM_SEMANTIC_RESERVATION_USD", "OPENAI_API_KEY"];
  const previous = new Map(keys.map(key => [key, process.env[key]])), transport = globalThis.fetch;
  Object.assign(process.env, { ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_TENANTS: tenantId, ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25", OPENAI_API_KEY: "synthetic-test-key" });
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.ai": true });
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: true, responsePaused: true,
    operatingProfile: { preferredProviders: ["openai"], monthlyUsageCap: 100, monthlyBudgetUsd: 100, extractionModelOverride: "gpt-4.1-mini" } } });
  let calls = 0;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (["127.0.0.1", "localhost"].includes(url.hostname)) return transport(input, options);
    assert.equal(url.href, "https://api.openai.com/v1/chat/completions"); calls++;
    assert.equal((await f.select()).status, 200);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ facts: [
      { field: "budgetBand", value: "2000 reais", messageId: message.id, excerpt: "Meu orçamento é 2000 reais", confidence: 0.99 },
    ] }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  };
  try {
    const result = await observe({ tenantId, chatId: f.chat.id, messageId: message.id });
    assert.equal(calls, 1); assert.equal(result.observed, false); assert.equal(result.reason, "conversation_commercial_context_changed");
    assert.equal((await f.purchase.get()).data()?.customFields?.orcamento, undefined);
    const runs = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).get();
    assert.equal(runs.size, 1); assert.equal(runs.docs[0].data().status, "discarded_context_changed");
    assert.equal((await observe({ tenantId, chatId: f.chat.id, messageId: message.id })).observed, false); assert.equal(calls, 1);
  } finally {
    globalThis.fetch = transport;
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("runtime memory is isolated per selection, preserves legacy memory, and refuses late reads and writes", async () => {
  const f = await fixture(), legacyId = runtime.getConversationRuntimeDocId(tenantId, f.chat.id);
  const legacy = await runtime.upsertConversationRuntimeState({ tenantId, chatId: f.chat.id, leadId: f.lead.id,
    inboundText: "Compra antiga", outboundText: "Proposta antiga", decision: "respond", reason: "legacy" });
  assert.equal(legacy.applied, true);
  const baseline = await adminDb.collection("ai_conversation_state").doc(legacyId).get();
  assert.equal((await f.select()).status, 200);
  assert.equal(await runtime.getConversationRuntimeState(tenantId, f.chat.id), null);
  const message = await f.message("Compra nova", true), snapshot = await message.get(), selected = await target({ tenantId, chatId: f.chat.id }); assert.ok(selected.ok);
  const fence = { tenantId, chatId: f.chat.id, leadId: f.purchase.id, leadGeneration: selected.generation, chatGeneration: selected.chatGeneration,
    contactId: selected.contactId, contactGeneration: selected.contactGeneration, selectionId: selected.selectionId, messageId: message.id, messageVersion: snapshot.updateTime! };
  const input = { tenantId, chatId: f.chat.id, leadId: f.purchase.id, inboundText: "Compra nova", outboundText: "Resposta desta compra",
    decision: "respond" as const, reason: "current", sourceMessageId: message.id, conversationFence: fence };
  assert.equal((await runtime.upsertConversationRuntimeState({ ...input, conversationFence: undefined })).applied, false);
  assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, true);
  assert.equal((await runtime.getConversationRuntimeState(tenantId, f.chat.id, fence))?.lastOutboundText, "Resposta desta compra");
  const selectedRef = adminDb.collection("ai_conversation_state").doc(runtime.getSelectedConversationRuntimeDocId(tenantId, f.chat.id, selected.selectionId!));
  const current = await selectedRef.get();
  assert.equal((await f.select()).status, 200);
  assert.equal(await runtime.getConversationRuntimeState(tenantId, f.chat.id, fence), null);
  assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, false);
  assert.ok((await selectedRef.get()).updateTime!.isEqual(current.updateTime!));
  assert.ok((await baseline.ref.get()).updateTime!.isEqual(baseline.updateTime!));
});

test("runtime memory refuses colliding identities, recreated conversations and missing parents", async () => {
  const f = await fixture(), ref = adminDb.collection("ai_conversation_state").doc(runtime.getConversationRuntimeDocId(tenantId, f.chat.id));
  const input = { tenantId, chatId: f.chat.id, leadId: f.lead.id, inboundText: "Contexto", decision: "respond" as const, reason: "test" };
  await ref.set({ tenantId: `${tenantId}_foreign`, chatId: f.chat.id, lastOutboundText: "Segredo" });
  const foreign = await ref.get();
  assert.equal(await runtime.getConversationRuntimeState(tenantId, f.chat.id), null);
  assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, false);
  assert.ok((await ref.get()).updateTime!.isEqual(foreign.updateTime!));
  await ref.delete(); assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, true);
  const before = await ref.get(), chat = (await f.chat.get()).data()!;
  await f.chat.delete(); await f.chat.set(chat);
  assert.equal(await runtime.getConversationRuntimeState(tenantId, f.chat.id), null);
  assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, false);
  await f.chat.delete();
  assert.equal((await runtime.upsertConversationRuntimeState(input)).applied, false);
  assert.ok((await ref.get()).updateTime!.isEqual(before.updateTime!));
});
