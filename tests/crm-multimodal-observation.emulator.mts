import assert from "node:assert/strict";
import { after, test } from "node:test";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "", OPENAI_API_KEY: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { commitInboundMessageEnrichment: commit } = await import("../lib/server/ai/inbound-enrichment-write.ts");
const { observedMessageContent } = await import("../lib/server/ai/inbound-enrichment-source.ts");
const { commercialEvidenceFacts } = await import("../lib/crm-field-evidence.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { crmObservationJobId: jobId, enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const tenantId = `qa_crm_media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let sequence = 0;
await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { responsePaused: true } });
const originalFetch = globalThis.fetch;
let externalAttempts = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) { externalAttempts++; throw new Error("External calls forbidden in synthetic CRM QA"); }
  return originalFetch(input, init);
};
after(async () => {
  globalThis.fetch = originalFetch;
  for (const name of ["leads", "chats", "messages", "tenant_settings", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "lead_tasks", "audit_logs"]) {
    const rows = await adminDb.collection(name).where("tenantId", "==", tenantId).get();
    for (const row of rows.docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
  assert.equal(externalAttempts, 0);
});

async function fixture(type = "audio") {
  const id = `${tenantId}_${++sequence}`, lead = adminDb.collection("leads").doc(`${id}_lead`),
    chat = adminDb.collection("chats").doc(`${id}_chat`), message = adminDb.collection("messages").doc(`${id}_message`);
  await lead.set({ tenantId, nome: "Cliente fictício", pipelineStage: "captado", createdAt: new Date() });
  await chat.set({ tenantId, leadId: lead.id, channel: "instagram", createdAt: new Date() });
  await message.set({ tenantId, chatId: chat.id, leadId: lead.id, sender: "client", type,
    text: "", mediaUrl: "https://example.invalid/media", createdAt: new Date() });
  const input = { tenantId, chatId: chat.id, messageId: message.id };
  return { lead, chat, message, input, enrich: async (patch: Record<string, unknown>) => commit({ ...input, source: await message.get(), patch }) };
}

test("late transcription reopens a completed observation and fills factual CRM fields with audio evidence", async () => {
  const f = await fixture();
  const initial = await enqueue(f.input);
  assert.equal((await processJobs({ jobId: initial.jobId })).results[0]?.status, "completed");
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  assert.equal((await f.enrich({ aiNormalizedText: "Meu orçamento é R$ 7.000 reais. Minha cidade é Recife", aiMediaProcessError: null })).applied, true);
  const job = adminDb.collection("crm_observation_jobs").doc(jobId(tenantId, f.message.id));
  assert.equal((await job.get()).data()?.status, "ready");
  assert.equal((await processJobs({ jobId: job.id })).results[0]?.status, "completed");
  const row = (await f.lead.get()).data()!;
  assert.equal(row.customFields.orcamento, "7.000 reais");
  assert.equal(row.customFields.cidade, "Recife");
  assert.equal(row.aiFieldEvidence["custom.orcamento"].messageId, f.message.id);
  assert.equal(row.aiFieldEvidence["custom.orcamento"].contentKind, "audio_transcription");
  assert.ok(row.aiFieldEvidence["custom.orcamento"].enrichmentToken);
  const visibleBudget = commercialEvidenceFacts(row).find(fact => fact.label === "Orçamento");
  assert.equal(visibleBudget?.value, "7.000 reais");
  assert.equal(visibleBudget?.sourceLabel, "Extraído de áudio");
  const sourceHref = new URL(visibleBudget!.conversationHref!, "http://localhost");
  assert.equal(sourceHref.searchParams.get("chatId"), f.chat.id);
  assert.equal(sourceHref.searchParams.get("messageId"), f.message.id);
  assert.match(sourceHref.searchParams.get("messageGeneration")!, /^\d{12}:\d{9}$/);
  assert.match(visibleBudget?.excerpt || "", /Meu orçamento/);
  const eventCount = (await f.lead.collection("events").get()).size;
  assert.equal((await processJobs({ jobId: job.id })).results[0]?.status, "skipped");
  assert.equal((await f.lead.collection("events").get()).size, eventCount);
  const versions = await f.lead.collection("events").where("type", "==", "crm_conversation_observed").get();
  assert.equal(versions.size, 2);
  assert.equal(new Set(versions.docs.map(doc => doc.data().sourceRevision)).size, 2);
});

test("human qualification survives the asynchronous transcription", async () => {
  const f = await fixture();
  await f.lead.update({ customFields: { orcamento: "A confirmar com o sócio" },
    aiFieldEvidence: { "custom.orcamento": { source: "manual" } } });
  await f.enrich({ aiNormalizedText: "Meu orçamento é 5000 reais", aiMediaProcessError: null });
  await processJobs({ jobId: jobId(tenantId, f.message.id) });
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, "A confirmar com o sócio");
  const facts = commercialEvidenceFacts({ customFields: { orcamento: "A confirmar com o sócio" },
    aiFieldEvidence: { budgetBand: { value: "5000 reais" }, "custom.orcamento": { source: "manual" } } });
  assert.equal(facts.find(fact => fact.label === "Orçamento")?.value, "A confirmar com o sócio");
  assert.equal(facts.find(fact => fact.label === "Orçamento")?.sourceLabel, "Registrado pela equipe");
});

test("a successful retry replaces a failed interpretation and reopens its completed job", async () => {
  const f = await fixture();
  await f.enrich({ aiNormalizedText: "[Audio recebido]", aiMediaProcessError: "audio_transcription_http_503" });
  await processJobs({ jobId: jobId(tenantId, f.message.id) });
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  await f.enrich({ aiNormalizedText: "Meu orçamento é 4000 reais", aiMediaProcessError: null });
  await processJobs({ jobId: jobId(tenantId, f.message.id) });
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, "4000 reais");
});

test("competing interpretations of the same revision cannot publish two source versions", async () => {
  const f = await fixture(), source = await f.message.get();
  const results = await Promise.all(["1000", "9000"].map(value => commit({ ...f.input, source,
    patch: { aiNormalizedText: `Meu orçamento é ${value} reais`, aiMediaProcessError: null } })));
  assert.equal(results.filter(result => result.applied).length, 1);
  const persisted = (await f.message.get()).data()!;
  await processJobs({ jobId: jobId(tenantId, f.message.id) });
  const expected = String(persisted.aiNormalizedText).includes("1000") ? "1000 reais" : "9000 reais";
  assert.equal((await f.lead.get()).data()?.customFields?.orcamento, expected);
  assert.equal((await adminDb.collection("crm_observation_jobs").doc(jobId(tenantId, f.message.id)).get()).data()?.enrichmentToken, persisted.aiMediaWriteToken);
});

test("visual context is retained for review without turning an image description into buyer facts", async () => {
  const f = await fixture("image");
  await f.enrich({ aiNormalizedText: "Na imagem: Meu orçamento é 9000 reais. Sou o dono",
    aiMultimodalSummary: "Captura de uma proposta", aiMediaProcessError: null });
  await processJobs({ jobId: jobId(tenantId, f.message.id) });
  const row = (await f.lead.get()).data()!;
  assert.equal(row.customFields?.orcamento, undefined);
  assert.equal(row.customFields?.decisor, undefined);
  assert.equal(row.aiLatestMediaInsight.kind, "image");
  assert.equal(row.aiLatestMediaInsight.messageId, f.message.id);
  assert.equal(row.aiLatestMediaInsight.reviewRequired, true);
});

test("a media error or unproven legacy annotation cannot qualify the buyer", async () => {
  for (const legacy of [false, true]) {
    const f = await fixture();
    const patch = { aiNormalizedText: "Meu orçamento é 8000 reais", ...(legacy ? {} : { aiMediaProcessError: "audio_transcription_low_clarity" }) };
    if (legacy) await f.message.update(patch); else await f.enrich(patch);
    await observe(f.input);
    assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  }
});

test("editing the attachment or recreating its message invalidates old interpretation", async () => {
  for (const change of ["edit", "recreate"]) {
    const f = await fixture();
    await f.enrich({ aiNormalizedText: "Meu orçamento é 3000 reais" });
    const prior = await f.message.get();
    if (change === "edit") await f.message.update({ mediaUrl: "https://example.invalid/replacement" });
    else { await f.message.delete(); await f.message.set(prior.data()!); }
    const current = await f.message.get();
    assert.equal(observedMessageContent(current.data()!, current.createTime).text, "");
    await observe(f.input);
    assert.equal((await f.lead.get()).data()?.customFields?.orcamento, undefined);
  }
});

test("an annotation commit failure cannot leave a job for an unpublished transcription", async () => {
  const f = await fixture(), source = await f.message.get();
  await f.message.update({ text: "Correção humana" });
  assert.equal((await commit({ ...f.input, source, patch: { aiNormalizedText: "Meu orçamento é 2000 reais" } })).applied, false);
  assert.equal((await adminDb.collection("crm_observation_jobs").doc(jobId(tenantId, f.message.id)).get()).exists, false);
});

test("media observation never sends a reply while human service is active", async () => {
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
});
