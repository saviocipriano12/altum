import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import nextEnv from "@next/env";
if (!process.argv.includes("--run-synthetic-media")) throw new Error("Use --run-synthetic-media for three bounded model calls with synthetic local media.");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI credential unavailable");
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_PRIVATE_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25" });
const tenantId = `qa_media_live_${Date.now()}`; process.env.ALTUM_CRM_SEMANTIC_TENANTS = tenantId;
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enrichInboundMessageForAgent: enrich } = await import("../lib/server/ai/multimodal.ts");
const { enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const { commercialEvidenceFacts } = await import("../lib/crm-field-evidence.ts");
const originalFetch = globalThis.fetch; let providerCalls = 0;
globalThis.fetch = (url, init) => {
  const address = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost", "api.openai.com"].includes(address.hostname), "Unexpected external transport");
  if (address.hostname === "api.openai.com") { providerCalls++; assert.ok(providerCalls <= 3, "Exceeded bounded media evaluation"); }
  return originalFetch(url, init);
};
const results: Record<string, unknown>[] = [];
try {
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: true, responsePaused: true,
    businessSummary: "Loja fictícia. Avaliação de dados sintéticos.", operatingProfile: { preferredProviders: ["openai"], extractionModelOverride: "gpt-4.1-mini", monthlyBudgetUsd: 1, monthlyUsageCap: 5 } } });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
  for (const kind of ["audio", "image"] as const) {
    const leadId = `${tenantId}_${kind}`, chatId = `${leadId}_chat`, messageId = `${leadId}_message`;
    const buffer = readFileSync(kind === "audio" ? ".qa-artifacts/crm-live-media/buyer.wav" : ".qa-artifacts/crm-live-media/proposal.png");
    await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: `Comprador fictício ${kind}`, pipelineStage: "captado", createdAt: new Date() });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: kind === "audio" ? "whatsapp" : "instagram", createdAt: new Date() });
    const message = adminDb.collection("messages").doc(messageId);
    await message.set({ tenantId, chatId, leadId, sender: "client", type: kind, text: "", mediaDuration: kind === "audio" ? 10 : null,
      mediaUrl: `data:${kind === "audio" ? "audio/wav" : "image/png"};base64,${buffer.toString("base64")}`, createdAt: new Date() });
    const input = { tenantId, chatId, messageId };
    const initial = await enqueue(input);
    assert.equal((await processJobs({ jobId: initial.jobId })).results[0]?.status, "completed");
    const callsBefore = providerCalls;
    const interpreted = await enrich({ ...input, message: (await message.get()).data()! });
    assert.equal(interpreted.source, kind);
    assert.ok(interpreted.normalizedText && !interpreted.normalizedText.startsWith("["));
    assert.equal((await processJobs({ jobId: initial.jobId })).results[0]?.status, "completed");
    const row = (await adminDb.collection("leads").doc(leadId).get()).data()!;
    const fields = commercialEvidenceFacts(row);
    if (kind === "audio") {
      assert.match(String(row.customFields?.orcamento), /(?:3[.,]?000|tr[eê]s mil)/i);
      assert.equal(row.aiFieldEvidence["custom.orcamento"].contentKind, "audio_transcription");
      assert.equal(row.aiFieldEvidence["custom.orcamento"].messageId, messageId);
      assert.match(row.aiFieldEvidence["custom.orcamento"].excerpt, /or[çc]amento/i);
      assert.ok(fields.some(fact => fact.label === "Orçamento" && fact.sourceLabel === "Extraído de áudio"));
    } else {
      assert.equal(row.customFields?.orcamento, undefined);
      assert.equal(row.aiLatestMediaInsight.kind, "image"); assert.equal(row.aiLatestMediaInsight.reviewRequired, true);
      assert.match(row.aiLatestMediaInsight.text, /camiseta|azul|1[.,]?200/i);
      assert.equal(row.aiLatestMediaInsight.messageId, messageId);
    }
    const beforeReplay = providerCalls;
    assert.equal((await enrich({ ...input, message: (await message.get()).data()! })).source, "cached");
    assert.equal((await processJobs({ jobId: initial.jobId })).results[0]?.status, "skipped");
    assert.equal(providerCalls, beforeReplay);
    results.push({ kind, passed: true, mediaBytes: buffer.length, providerCalls: providerCalls - callsBefore, interpreted: interpreted.normalizedText,
      fields, mediaInsight: row.aiLatestMediaInsight || null });
  }
  assert.equal(providerCalls, 3);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
  writeFileSync(".qa-artifacts/crm-media-live.json", JSON.stringify({ passed: true, at: new Date().toISOString(), syntheticMedia: true, liveProvider: true,
    localCrmWrite: true, webhookVerified: false, browserVerified: false, realCustomerDataUsed: false, providerCalls, results }, null, 2));
} catch (error) {
  writeFileSync(".qa-artifacts/crm-media-live.json", JSON.stringify({ passed: false, providerCalls, results, error: error instanceof Error ? error.message : "unknown_error" }, null, 2));
  throw error;
} finally {
  globalThis.fetch = originalFetch;
  for (const name of ["leads", "chats", "messages", "tenant_settings", "tenant_entitlements", "crm_semantic_runs", "crm_semantic_usage_monthly", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "ai_usage_ledger", "lead_tasks"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
}
process.stdout.write(JSON.stringify({ passed: true, providerCalls, kinds: results.map(result => result.kind) }));
