import assert from "node:assert/strict";
import test, { after } from "node:test";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "synthetic-test-key",
  ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { observeSemanticCommercialFacts: semantic } = await import("../lib/server/crm/semantic-observation.ts");
const { getUnambiguousConversationLead: target } = await import("../lib/server/crm/conversation-commercial-context.ts");
const { commitInboundMessageEnrichment: enrich } = await import("../lib/server/ai/inbound-enrichment-write.ts");
const { usageMonthDocId } = await import("../lib/server/ai/usage-ledger.ts");
const { commercialReadNotice } = await import("../lib/crm-read-state.ts");
const { projectCommercialReadIssues } = await import("../lib/server/crm/read-issues.ts");
const { deleteTenantLead, restoreTenantTrash } = await import("../lib/server/tenant-data-deletion.ts");
const { buildConversationCommercialObservationJob: buildJob, enqueueConversationCommercialObservation: enqueueObservation,
  processConversationCommercialObservationJobs: processObservation, reprocessConversationCommercialObservationJob: reprocessObservation } = await import("../lib/server/crm/conversation-observation-queue.ts");
const tenantId = `qa_semantic_${Date.now()}`, other = `${tenantId}_off`; let sequence = 0, calls = 0;
const tenantScope = new Set([tenantId, other]);
process.env.ALTUM_CRM_SEMANTIC_TENANTS = tenantId;
const originalFetch = globalThis.fetch;
let duringCall: (() => Promise<void>) | undefined;
globalThis.fetch = async (url, init) => {
  const address = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(address.hostname)) return originalFetch(url, init);
  assert.equal(address.href, "https://api.openai.com/v1/chat/completions"); calls++;
  const body = JSON.parse(String(init?.body)), messages = JSON.parse(body.messages[1].content).messages;
  const source = messages.find((message: { sender: string }) => message.sender === "client");
  await duringCall?.();
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ facts: [
    { field: "budgetBand", value: "três mil reais", messageId: source.id, excerpt: source.text, confidence: 0.95 },
  ] }) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of ["leads", "contacts", "chats", "messages", "tenant_settings", "tenant_entitlements", "tenants", "crm_semantic_runs", "crm_semantic_usage_monthly", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "ai_usage_ledger", "ai_usage_monthly", "lead_tasks", "tenant_trash", "deletion_audits"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "in", [...tenantScope]).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
});
async function fixture(tenant = tenantId, limit = 100) {
  tenantScope.add(tenant);
  duringCall = undefined;
  const id = `${tenant}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`), chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`);
  await adminDb.collection("tenant_settings").doc(tenant).set({ tenantId: tenant, ai: { enabled: true, responsePaused: true,
    operatingProfile: { preferredProviders: ["openai"], monthlyUsageCap: limit, monthlyBudgetUsd: 100, extractionModelOverride: "gpt-4.1-mini" } } });
  await adminDb.collection("tenant_entitlements").doc(tenant).set({ tenantId: tenant, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
  await lead.set({ tenantId: tenant, nome: "Comprador fictício", pipelineStage: "captado", createdAt: new Date() });
  await chat.set({ tenantId: tenant, leadId: lead.id, channel: "instagram", createdAt: new Date() });
  await message.set({ tenantId: tenant, chatId: chat.id, leadId: lead.id, sender: "client", text: "Dá pra separar três mil reais pra isso", type: "text", createdAt: new Date() });
  const t = await target({ tenantId: tenant, chatId: chat.id }); assert.ok(t.ok);
  const source = await message.get(), snapshots = (await adminDb.collection("messages").where("tenantId", "==", tenant).where("chatId", "==", chat.id).get()).docs;
  const fence = { tenantId: tenant, chatId: chat.id, leadId: lead.id, leadGeneration: t.generation, chatGeneration: t.chatGeneration,
    contactId: t.contactId, contactGeneration: t.contactGeneration, messageId: message.id, messageVersion: source.updateTime! };
  return { lead, chat, message, input: { tenantId: tenant, chatId: chat.id, messageId: message.id },
    semanticInput: { fence, snapshots, messages: [{ id: message.id, text: source.data()!.text, sender: "client" as const, kind: "text" as const }] } };
}
test("continuous observer fills CRM using semantic buyer facts, caches retry and records measured tokens", async () => {
  const f = await fixture(), before = calls;
  assert.equal((await observe(f.input)).observed, true);
  const row = (await f.lead.get()).data()!;
  assert.equal(row.customFields.orcamento, "três mil reais");
  assert.equal(row.aiCommercialReadState.status, "checked");
  assert.equal(row.aiFieldEvidence["custom.orcamento"].messageId, f.message.id);
  assert.equal(calls, before + 1);
  await observe(f.input); assert.equal(calls, before + 1);
  const receipts = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("chatId", "==", f.chat.id).get();
  assert.equal(receipts.size, 1); assert.equal(receipts.docs[0].data().status, "completed");
  const usage = await adminDb.collection("ai_usage_ledger").doc(receipts.docs[0].id).get();
  assert.equal(usage.data()?.inputTokens, 100); assert.equal(usage.data()?.estimatedCostUsd, null);
});
test("two 300-character source IDs with the same 240-character prefix remain distinct through the CRM queue", async () => {
  const f = await fixture(), prefix = `${tenantId}_${"p".repeat(240 - tenantId.length - 1)}`;
  await f.message.delete();
  const data = { tenantId, chatId: f.chat.id, leadId: f.lead.id, sender: "client", type: "audio", text: "", createdAt: new Date() };
  await adminDb.collection("messages").doc(prefix).set(data);
  const before = calls, ids = [`${prefix}${"a".repeat(60)}`, `${prefix}${"b".repeat(60)}`], jobs = [];
  for (let index = 0; index < ids.length; index++) {
    await adminDb.collection("messages").doc(ids[index]).set({ ...data, createdAt: new Date(Date.now() + index * 1000) });
    const input = { ...f.input, messageId: ids[index] }, queued = await enqueueObservation(input); jobs.push(queued.jobId);
    assert.equal((await adminDb.collection("crm_observation_jobs").doc(queued.jobId).get()).data()?.messageId, ids[index]);
    assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "completed");
    assert.equal((await f.lead.get()).data()!.aiCommercialReadState.messageId, ids[index]);
    const receipt = await adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", ids[index]).get();
    assert.equal(receipt.size, 1);
  }
  assert.notEqual(jobs[0], jobs[1]); assert.equal(calls, before);
});
test("malformed caller or persisted job identity cannot be cropped into a valid buyer source", async () => {
  const f = await fixture(), before = calls, original = await f.lead.get();
  for (const input of [{ ...f.input, messageId: ` ${f.message.id}` }, { ...f.input, chatId: `${f.chat.id} ` },
    { ...f.input, messageId: "m".repeat(301) }, { ...f.input, tenantId: `${tenantId}/other` }]) {
    const receipt = await observe(input); assert.equal(receipt.observed, false);
    assert.ok("reason" in receipt); assert.equal(receipt.reason, "invalid_input");
    assert.throws(() => buildJob(input), /INVALID_IDENTITY/);
  }
  const bad = adminDb.collection("crm_observation_jobs").doc(`${f.lead.id}_malformed`);
  await bad.set({ ...f.input, messageId: ` ${f.message.id}`, status: "ready", dueAt: new Date(0), attempts: 0 });
  assert.equal((await processObservation({ jobId: bad.id })).results[0].status, "dead_letter");
  assert.equal((await bad.get()).data()?.errorCode, "CRM_OBSERVATION_INVALID_IDENTITY");
  await assert.rejects(processObservation({ jobId: "" }), /INVALID_IDENTITY/);
  await assert.rejects(reprocessObservation({ tenantId, jobId: bad.id, actorId: "qa" }), /nao encontrada/);
  assert.equal((await f.lead.get()).updateTime!.isEqual(original.updateTime!), true);
  assert.equal(calls, before);
});
test("analysis arriving after a seller correction preserves that correction", async () => {
  const f = await fixture();
  duringCall = async () => { await f.lead.update({ customFields: { orcamento: "Conferir com o sócio" }, aiFieldEvidence: { "custom.orcamento": { source: "manual", value: "Conferir com o sócio" } } }); };
  assert.equal((await observe(f.input)).observed, true);
  assert.equal((await f.lead.get()).data()?.customFields.orcamento, "Conferir com o sócio");
});

test("durable jobs refuse replaced messages, chats and buyers before calling the model", async () => {
  for (const field of ["message", "chat", "lead"] as const) {
    const f = await fixture(), queued = await enqueueObservation(f.input), before = calls;
    const ref = f[field], original = (await ref.get()).data()!;
    await ref.delete(); await ref.set(original);
    const baseline = await f.lead.get();
    assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "awaiting_context", field);
    assert.equal(calls, before);
    assert.equal((await f.lead.get()).updateTime!.isEqual(baseline.updateTime!), true);
    assert.equal((await enqueueObservation(f.input)).status, "awaiting_context");
  }
});

test("a changed revision needs a new producer admission; a completed same-generation job reopens", async () => {
  const f = await fixture(), queued = await enqueueObservation(f.input);
  await f.message.update({ text: "Dá pra separar três mil reais pra isso, agora confirmado" });
  const before = calls;
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "awaiting_context");
  assert.equal(calls, before);
  assert.equal((await enqueueObservation(f.input)).jobId, queued.jobId);
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "completed");
  await f.message.update({ text: "Dá pra separar três mil reais pra isso, pode registrar" });
  assert.equal((await enqueueObservation(f.input)).status, "ready");
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "completed");
  assert.equal(calls, before + 2);
  const proof = (await f.lead.get()).data()!.aiFieldEvidence["custom.orcamento"];
  const message = await f.message.get();
  assert.equal(proof.sourceRevision, `${message.updateTime!.seconds}:${message.updateTime!.nanoseconds}`);
});

test("a replaced contact or changed commercial association cannot reuse an admitted job", async () => {
  for (const mutation of ["contact", "association"] as const) {
    const f = await fixture(), contact = adminDb.collection("contacts").doc(`${f.lead.id}_person`);
    await contact.set({ tenantId, leadIds: [f.lead.id] }); await f.lead.update({ contactId: contact.id });
    const queued = await enqueueObservation(f.input), before = calls;
    if (mutation === "contact") { const data = (await contact.get()).data()!; await contact.delete(); await contact.set(data); }
    else await contact.update({ leadIds: [f.lead.id, "another-purchase"] });
    const baseline = await f.lead.get();
    assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "awaiting_context");
    assert.equal(calls, before); assert.equal((await f.lead.get()).updateTime!.isEqual(baseline.updateTime!), true);
  }
});

test("pending media revision requires its exact enrichment token and unchanged attachment", async () => {
  for (const mutation of ["none", "token", "attachment"] as const) {
    const f = await fixture();
    await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/fictitious.ogg" });
    const queued = await enqueueObservation(f.input);
    assert.equal((await enrich({ ...f.input, source: await f.message.get(), patch: { aiNormalizedText: "Dá pra separar três mil reais pra isso" } })).applied, true);
    const ref = adminDb.collection("crm_observation_jobs").doc(queued.jobId);
    assert.equal((await ref.get()).data()?.sourceBinding.messageRevision, null);
    if (mutation === "token") await ref.update({ enrichmentToken: "another-attempt" });
    if (mutation === "attachment") await f.message.update({ mediaUrl: "https://example.invalid/replaced.ogg" });
    const before = calls;
    assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, mutation === "none" ? "completed" : "awaiting_context");
    assert.equal(calls, before + (mutation === "none" ? 1 : 0));
  }
});

test("an old worker cannot finalize the new producer's job or overwrite its buyer facts", async () => {
  const f = await fixture(), queued = await enqueueObservation(f.input), before = calls;
  duringCall = async () => {
    duringCall = undefined;
    await f.message.update({ text: "Dá pra separar três mil reais pra isso, confirmado pelo sócio" });
    assert.equal((await enqueueObservation(f.input)).status, "ready");
  };
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "skipped");
  const row = (await adminDb.collection("crm_observation_jobs").doc(queued.jobId).get()).data()!;
  assert.equal(row.status, "ready"); assert.equal(row.completedAt, null);
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "completed");
  assert.equal(calls, before + 2);
});

test("source edits during a worker without readmission leave a context warning, not a completed job", async () => {
  const f = await fixture(), queued = await enqueueObservation(f.input);
  duringCall = async () => { duringCall = undefined; await f.message.update({ text: "O orçamento mudou, ainda vou confirmar" }); };
  assert.equal((await processObservation({ jobId: queued.jobId })).results[0].status, "awaiting_context");
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
});

test("legacy adoption requires persisted birth proof and cannot downgrade a malformed modern binding", async () => {
  for (const kind of ["legacy", "null", "corrupt", "recreated"] as const) {
    const f = await fixture(), job = buildJob(f.input), ref = adminDb.collection("crm_observation_jobs").doc(job.jobId);
    await ref.set({ ...job.data, ...(kind === "null" ? { sourceBinding: null } : kind === "corrupt" ? { sourceBinding: { version: 1 } } : {}) });
    if (kind === "recreated") { const original = (await f.message.get()).data()!; await f.message.delete(); await f.message.set(original); }
    const before = calls;
    assert.equal((await processObservation({ jobId: job.jobId })).results[0].status, kind === "legacy" ? "completed" : "awaiting_context", kind);
    assert.equal(calls, before + (kind === "legacy" ? 1 : 0));
  }
});

test("a delayed producer cannot create a missing CRM job for a replaced source or disrupt a fresh job", async () => {
  const f = await fixture(), original = await f.message.get();
  const originNotAfter = `${original.updateTime!.seconds}:${original.updateTime!.nanoseconds}`;
  const data = original.data()!; await f.message.delete(); await f.message.set(data);
  const stale = await enqueueObservation({ ...f.input, originNotAfter });
  assert.equal(stale.status, "skipped");
  const ref = adminDb.collection("crm_observation_jobs").doc(stale.jobId);
  assert.equal((await ref.get()).exists, false);
  assert.equal((await enqueueObservation(f.input)).status, "ready");
  const current = await ref.get();
  assert.equal((await enqueueObservation({ ...f.input, originNotAfter })).status, "skipped");
  assert.equal((await ref.get()).updateTime!.isEqual(current.updateTime!), true);
});
test("ambiguous legacy receipt IDs cannot skip another company's buyer observation or overwrite its history", async () => {
  const a = await fixture(), b = await fixture(`${tenantId}_x`), messageB = `collision_${tenantId}`, messageA = `x_${messageB}`;
  const originalCalls = calls;
  for (const [f, messageId] of [[a, messageA], [b, messageB]] as const) {
    const row = (await f.message.get()).data()!; await f.message.delete();
    await adminDb.collection("messages").doc(messageId).set({ ...row, text: "", type: "audio" });
    assert.equal((await observe({ ...f.input, messageId })).observed, true);
  }
  assert.equal(`${tenantId}_${messageA}`, `${tenantId}_x_${messageB}`);
  const receiptA = await adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", messageA).get();
  const receiptB = await adminDb.collection("crm_conversation_observations").where("tenantId", "==", `${tenantId}_x`).where("messageId", "==", messageB).get();
  assert.equal(receiptA.size, 1); assert.equal(receiptB.size, 1); assert.notEqual(receiptA.docs[0].id, receiptB.docs[0].id);
  assert.equal(calls, originalCalls);
});
test("foreign legacy receipt is preserved and cannot pretend the current source was already read", async () => {
  const f = await fixture();
  const legacy = adminDb.collection("crm_conversation_observations").doc(`${tenantId}_${f.message.id}`);
  await legacy.set({ tenantId: other, chatId: "other-chat", leadId: "other-lead", messageId: f.message.id,
    status: "completed", enrichmentToken: "", semanticRunId: "", historical: true });
  assert.equal((await observe(f.input)).observed, true);
  assert.equal((await legacy.get()).data()?.historical, true); assert.equal((await legacy.get()).data()?.tenantId, other);
  assert.equal((await f.lead.get()).data()!.aiLastConversationMessageId, f.message.id);
});
test("corrupted canonical receipt is rejected without overwriting another company's record", async () => {
  const f = await fixture(); await observe(f.input);
  const records = await adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", f.message.id).get();
  const receipt = records.docs[0].ref; await receipt.update({ tenantId: other });
  const prior = await f.lead.get(), before = calls;
  await assert.rejects(observe(f.input), /RECEIPT_IDENTITY_CONFLICT/);
  assert.equal((await receipt.get()).data()?.tenantId, other);
  assert.equal((await f.lead.get()).updateTime!.isEqual(prior.updateTime!), true);
  assert.equal(calls, before);
});
test("edited text refreshes facts and recreated source/customer generations retain separate receipts", async () => {
  const f = await fixture(), enabled = process.env.ALTUM_CRM_SEMANTIC_ENABLED;
  process.env.ALTUM_CRM_SEMANTIC_ENABLED = "0";
  try {
    await f.message.update({ text: "Meu orçamento é 3100 reais" });
    assert.equal((await observe(f.input)).observed, true);
    await f.message.update({ text: "Meu orçamento é 4200 reais" });
    assert.equal((await observe(f.input)).observed, true);
    assert.match((await f.lead.get()).data()!.customFields.orcamento, /4200/);
    const before = await f.message.get(), original = before.data()!;
    await f.message.delete(); await f.message.set(original);
    assert.equal((await observe(f.input)).observed, true);
    const evidence = (await f.lead.get()).data()!.aiFieldEvidence["custom.orcamento"];
    const recreated = await f.message.get();
    assert.equal(evidence.sourceOrder, `${String(recreated.createTime!.seconds).padStart(12, "0")}:${String(recreated.createTime!.nanoseconds).padStart(9, "0")}`);
    const previousLead = (await f.lead.get()).data()!; await f.lead.delete(); await f.lead.set(previousLead);
    assert.equal((await observe(f.input)).observed, true);
    const receipts = await adminDb.collection("crm_conversation_observations").where("tenantId", "==", tenantId).where("messageId", "==", f.message.id).get();
    assert.equal(receipts.size, 3);
    assert.equal((await f.lead.collection("events").where("evidenceMessageId", "==", f.message.id).where("type", "==", "crm_conversation_observed").get()).size, 4);
    const eventCount = (await f.lead.collection("events").get()).size;
    assert.equal((await observe(f.input)).observed, false);
    assert.equal((await f.lead.collection("events").get()).size, eventCount);
  } finally { process.env.ALTUM_CRM_SEMANTIC_ENABLED = enabled; }
});
test("source correction during the provider call cannot write a stale fact", async () => {
  const f = await fixture(); duringCall = async () => { await f.message.update({ text: "Corrigindo: ainda não defini orçamento" }); };
  const result = await observe(f.input); assert.equal(result.observed, false);
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
});
test("company outside rollout makes no model call", async () => {
  const f = await fixture(other), before = calls;
  await observe(f.input); assert.equal(calls, before);
});
test("an attachment awaiting interpretation does not reserve or call the text model", async () => {
  const f = await fixture(), before = calls;
  await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/not-transcribed" });
  assert.equal((await observe(f.input)).observed, true);
  assert.equal(calls, before);
  const runs = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("chatId", "==", f.chat.id).get();
  assert.equal(runs.size, 0);
  assert.equal((await f.lead.get()).data()?.aiCommercialReadState.status, "awaiting_media");
});
test("semantic path consumes a proved audio transcript and labels its evidence correctly", async () => {
  const f = await fixture();
  await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/audio" });
  assert.equal((await enrich({ tenantId, chatId: f.chat.id, messageId: f.message.id, source: await f.message.get(),
    patch: { aiNormalizedText: "Dá pra separar três mil reais pra isso", aiMediaProcessError: null } })).applied, true);
  assert.equal((await observe(f.input)).observed, true);
  const row = (await f.lead.get()).data()!;
  assert.equal(row.customFields.orcamento, "três mil reais"); assert.equal(row.aiFieldEvidence["custom.orcamento"].contentKind, "audio_transcription");
  assert.equal(row.aiCommercialReadState.status, "checked");
});

test("new text keeps both unread files visible and interpretation resolves only its own source", async () => {
  const f = await fixture();
  await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/first" });
  await observe(f.input);
  const second = adminDb.collection("messages").doc(`${f.message.id}_second`);
  await second.set({ tenantId, chatId: f.chat.id, leadId: f.lead.id, sender: "client", type: "audio", text: "",
    mediaUrl: "https://example.invalid/second", createdAt: new Date(Date.now() + 1000) });
  await observe({ ...f.input, messageId: second.id });
  const newest = adminDb.collection("messages").doc(`${f.message.id}_text`);
  await newest.set({ tenantId, chatId: f.chat.id, leadId: f.lead.id, sender: "client", type: "text",
    text: "Dá pra separar três mil reais pra isso", createdAt: new Date(Date.now() + 2000) });
  await observe({ ...f.input, messageId: newest.id });
  let state = (await f.lead.get()).data()!.aiCommercialReadState;
  assert.equal(state.status, "checked"); assert.equal(state.pendingCount, 2);
  assert.equal(commercialReadNotice(state)?.pendingCount, 2);
  await observe({ ...f.input, messageId: newest.id });
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingCount, 2);
  for (const message of [f.message, second]) {
    await enrich({ tenantId, chatId: f.chat.id, messageId: message.id, source: await message.get(),
      patch: { aiNormalizedText: "Dá pra separar três mil reais pra isso", aiMediaProcessError: null } });
    await observe({ ...f.input, messageId: message.id });
    state = (await f.lead.get()).data()!.aiCommercialReadState;
    assert.equal(state.pendingCount, message.id === f.message.id ? 1 : 0);
    if (state.pendingCount) assert.equal(state.pendingSource.messageId, second.id);
  }
  assert.equal(commercialReadNotice(state), null);
  assert.equal((await f.lead.collection("commercial_read_issues").where("resolved", "==", false).get()).size, 0);
});
test("AI disabled during analysis prevents semantic CRM writes", async () => {
  const f = await fixture(); duringCall = async () => { await adminDb.collection("tenant_settings").doc(tenantId).update({ "ai.enabled": false }); };
  assert.equal((await observe(f.input)).observed, false);
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
});

test("deleting and restoring a customer carries its pending-source ledger with it", async () => {
  const f = await fixture();
  await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/unread" });
  await observe(f.input);
  const issues = f.lead.collection("commercial_read_issues"), before = await issues.get();
  assert.equal(before.size, 1);
  const removed = await deleteTenantLead({ tenantId, leadId: f.lead.id });
  assert.ok(removed.trashId); assert.equal((await issues.get()).size, 0);
  await restoreTenantTrash({ tenantId, trashId: removed.trashId });
  assert.equal((await issues.get()).size, 1);
  assert.equal((await issues.doc(before.docs[0].id).get()).data()?.state.messageId, f.message.id);
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingCount, 1);
});

test("pending-source accounting is atomic across concurrent workers and preserves a legacy warning", async () => {
  const f = await fixture();
  const legacy = { status: "media_failed" as const, chatId: f.chat.id, messageId: "legacy-audio", occurredAtMs: 1, sourceCreatedAtMs: 1 };
  await f.lead.update({ aiCommercialReadState: legacy });
  const update = async (messageId: string, status: "awaiting_media" | "checked") => adminDb.runTransaction(async tx => {
    const lead = await tx.get(f.lead);
    const projection = await projectCommercialReadIssues(tx, f.lead, lead.data()?.aiCommercialReadState,
      { ...legacy, messageId, status, occurredAtMs: 2, sourceCreatedAtMs: messageId === "legacy-audio" ? 1 : 2 },
      `${lead.createTime!.seconds}:${lead.createTime!.nanoseconds}`);
    tx.update(f.lead, { aiCommercialReadState: projection });
  });
  await update("new-text", "checked");
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingSource.messageId, "legacy-audio");
  await Promise.all([update("audio-2", "awaiting_media"), update("audio-3", "awaiting_media"), update("audio-2", "awaiting_media")]);
  assert.equal((await f.lead.get()).data()!.aiCommercialReadState.pendingCount, 3);
  await Promise.all([update("audio-2", "checked"), update("audio-3", "checked")]);
  const state = (await f.lead.get()).data()!.aiCommercialReadState;
  assert.equal(state.pendingCount, 1); assert.equal(state.pendingSource.messageId, "legacy-audio");
  await update("legacy-audio", "checked");
  assert.equal(commercialReadNotice((await f.lead.get()).data()!.aiCommercialReadState), null);
});

test("a recreated customer does not inherit orphaned issues from a previous parent generation", async () => {
  const f = await fixture();
  await f.message.update({ type: "audio", text: "", mediaUrl: "https://example.invalid/old-source" });
  await observe(f.input);
  const oldScope = (await f.lead.get()).data()!.aiCommercialReadState.issuesScope;
  await f.lead.delete();
  await f.lead.set({ tenantId, nome: "Novo cliente fictício", createdAt: new Date() });
  await adminDb.runTransaction(async tx => {
    const lead = await tx.get(f.lead);
    const state = await projectCommercialReadIssues(tx, f.lead, undefined,
      { status: "checked", chatId: f.chat.id, messageId: "new-source", occurredAtMs: 3, sourceCreatedAtMs: 3 },
      `${lead.createTime!.seconds}:${lead.createTime!.nanoseconds}`);
    tx.update(f.lead, { aiCommercialReadState: state });
  });
  const state = (await f.lead.get()).data()!.aiCommercialReadState;
  assert.notEqual(state.issuesScope, oldScope);
  assert.equal(state.pendingCount, 0); assert.equal(commercialReadNotice(state), null);
});
test("media error remains visible while previously registered buyer data is preserved", async () => {
  const f = await fixture();
  await f.lead.update({ customFields: { orcamento: "Valor conferido pela equipe" }, aiFieldEvidence: { "custom.orcamento": { source: "manual" } } });
  await f.message.update({ type: "audio", text: "", aiMediaProcessError: "audio_transcription_empty" });
  assert.equal((await observe(f.input)).observed, true);
  const row = (await f.lead.get()).data()!;
  assert.equal(row.aiCommercialReadState.status, "media_failed");
  assert.equal(row.aiCommercialReadState.messageId, f.message.id);
  assert.equal(row.customFields.orcamento, "Valor conferido pela equipe");
});
test("module revoked during the provider call blocks the final CRM commit", async () => {
  const f = await fixture(); duringCall = async () => { await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.ai": false }); };
  await assert.rejects(observe(f.input));
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
});
test("a disabled CRM module prevents even a failure notice from modifying the customer record", async () => {
  const f = await fixture(), before = await f.lead.get(), callsBefore = calls;
  await adminDb.collection("tenant_entitlements").doc(tenantId).update({ "modules.crm": false });
  await assert.rejects(observe(f.input));
  assert.ok((await f.lead.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal(calls, callsBefore);
});
test("monthly reservation exhaustion blocks new provider calls", async () => {
  const f = await fixture(tenantId, 1), before = calls;
  const result = await semantic(f.semanticInput); assert.equal(result.status, "budget_exhausted"); assert.equal(calls, before);
});
test("unpersisted caller text cannot become a paid extraction source", async () => {
  const f = await fixture(), before = calls;
  await assert.rejects(semantic({ ...f.semanticInput, messages: [{ ...f.semanticInput.messages[0], text: "Texto inventado pelo chamador" }] }), /UNPROVEN_INPUT/);
  assert.equal(calls, before);
});
test("known monthly spend is checked before reserving a new semantic call", async () => {
  const f = await fixture(), before = calls, month = new Date().toISOString().slice(0, 7);
  const aggregate = adminDb.collection("ai_usage_monthly").doc(usageMonthDocId(tenantId, month));
  await aggregate.set({ tenantId, runs: 0, estimatedCostUsd: 100 });
  assert.equal((await semantic(f.semanticInput)).status, "budget_exhausted"); assert.equal(calls, before);
  await aggregate.delete();
});
test("two workers cannot create two paid attempts for the same evidence", async () => {
  const f = await fixture(), before = calls;
  const results = await Promise.allSettled([semantic(f.semanticInput), semantic(f.semanticInput)]);
  assert.equal(calls, before + 1); assert.ok(results.some(result => result.status === "fulfilled" && result.value.status === "completed"));
});
test("lost worker after admission becomes review-required without another provider charge", async () => {
  const f = await fixture(), first = await semantic(f.semanticInput), before = calls;
  assert.ok(first.runId);
  await adminDb.collection("crm_semantic_runs").doc(first.runId).update({ status: "processing", leaseUntil: new Date(0) });
  await assert.rejects(semantic(f.semanticInput), /REVIEW_REQUIRED/); assert.equal(calls, before);
  assert.equal((await adminDb.collection("crm_semantic_runs").doc(first.runId).get()).data()?.status, "review_required");
});
test("failed provider attempt retains its reservation and cannot silently call the provider again", async () => {
  const f = await fixture(), before = calls;
  duringCall = async () => { throw new Error("synthetic_provider_failure"); };
  await assert.rejects(semantic(f.semanticInput), /synthetic_provider_failure/);
  duringCall = undefined;
  await assert.rejects(semantic(f.semanticInput), /CRM_SEMANTIC_FAILED/);
  await assert.rejects(observe(f.input), /CRM_SEMANTIC_FAILED/);
  assert.equal((await f.lead.get()).data()?.aiCommercialReadState.status, "needs_review");
  assert.equal(calls, before + 1);
  const runs = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("chatId", "==", f.chat.id).get();
  assert.equal(runs.docs[0].data().status, "failed");
  assert.equal((await adminDb.collection("ai_usage_ledger").doc(runs.docs[0].id).get()).data()?.metadata.providerOutcomeUnknown, true);
});
test("a delayed failure cannot replace the visible state of a newer conversation message", async () => {
  const f = await fixture(), newerId = `${f.message.id}_newer`;
  duringCall = async () => {
    duringCall = undefined;
    await adminDb.collection("messages").doc(newerId).set({ tenantId, chatId: f.chat.id, leadId: f.lead.id, sender: "client", type: "text",
      text: "Dá pra separar três mil reais pra isso", createdAt: new Date(Date.now() + 1000) });
    assert.equal((await observe({ ...f.input, messageId: newerId })).observed, true);
    throw new Error("synthetic_late_provider_failure");
  };
  await assert.rejects(observe(f.input), /synthetic_late_provider_failure/);
  const row = (await f.lead.get()).data()!;
  assert.equal(row.aiCommercialReadState.messageId, newerId);
  assert.equal(row.aiCommercialReadState.status, "checked");
  assert.equal(row.aiCommercialReadState.pendingCount, 1);
  assert.equal(row.aiCommercialReadState.pendingSource.messageId, f.message.id);
  assert.equal(commercialReadNotice(row.aiCommercialReadState)?.title, "A leitura automática precisa de revisão");
});
