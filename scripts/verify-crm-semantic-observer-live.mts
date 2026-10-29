import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import nextEnv from "@next/env";
if (!process.argv.includes("--run-synthetic-local")) throw new Error("Use --run-synthetic-local for one bounded provider call and isolated emulator records.");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI credential unavailable");
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "",
  FIREBASE_PRIVATE_KEY: "", FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25" });
const tenantId = `qa_crm_live_${Date.now()}`;
process.env.ALTUM_CRM_SEMANTIC_TENANTS = tenantId;
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const { commercialEvidenceFacts } = await import("../lib/crm-field-evidence.ts");
const leadId = `${tenantId}_lead`, chatId = `${tenantId}_chat`, messageId = `${tenantId}_message`;
let providerCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const address = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost", "api.openai.com"].includes(address.hostname), "Unexpected external transport");
  if (address.hostname === "api.openai.com") providerCalls++;
  return originalFetch(url, init);
};
let passed = false;
try {
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, name: "Loja fictícia local", ai: { enabled: true, responsePaused: true,
    businessSummary: "Loja fictícia avaliando atendimento comercial. Dados sintéticos de teste.",
    operatingProfile: { preferredProviders: ["openai"], extractionModelOverride: "gpt-4.1-mini", monthlyBudgetUsd: 1, monthlyUsageCap: 5 } } });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Comprador fictício", pipelineStage: "captado", createdAt: new Date() });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "instagram", createdAt: new Date() });
  await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: "client", type: "text",
    text: "Consigo separar uns 3000 reais pra isso. Aqui sou eu que bato o martelo.", createdAt: new Date() });
  const job = await enqueue({ tenantId, chatId, messageId, source: "synthetic_live_qa" });
  assert.equal((await processJobs({ jobId: job.jobId })).results[0]?.status, "completed");
  const row = (await adminDb.collection("leads").doc(leadId).get()).data()!;
  assert.match(String(row.customFields?.orcamento), /3000/);
  assert.equal(row.aiFieldEvidence?.["custom.orcamento"]?.messageId, messageId);
  const visible = commercialEvidenceFacts(row).find(fact => fact.label === "Orçamento");
  assert.match(visible?.value || "", /3000/); assert.ok(visible?.excerpt); assert.ok(visible?.conversationHref?.includes(chatId));
  assert.equal((await processJobs({ jobId: job.jobId })).results[0]?.status, "skipped");
  assert.equal(providerCalls, 1);
  assert.equal((await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).get()).size, 0);
  const runs = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).get();
  assert.equal(runs.size, 1); assert.equal(runs.docs[0].data().status, "completed");
  passed = true;
  writeFileSync(".qa-artifacts/crm-semantic-observer-live.json", JSON.stringify({ passed, at: new Date().toISOString(), syntheticOnly: true,
    liveProvider: true, localCrmWrite: true, realCustomerDataUsed: false, mediaFilesRead: false, browserVerified: false,
    providerCalls, budget: row.customFields.orcamento, visibleFact: visible, run: runs.docs[0].data() }, null, 2));
} catch (error) {
  writeFileSync(".qa-artifacts/crm-semantic-observer-live.json", JSON.stringify({ passed: false, syntheticOnly: true, providerCalls,
    error: error instanceof Error ? error.message : "unknown_error" }, null, 2));
  throw error;
} finally {
  globalThis.fetch = originalFetch;
  for (const name of ["leads", "chats", "messages", "tenant_settings", "tenant_entitlements", "crm_semantic_runs", "crm_semantic_usage_monthly", "crm_observation_jobs", "crm_conversation_observations", "ai_logs", "ai_usage_ledger", "lead_tasks"]) {
    for (const row of (await adminDb.collection(name).where("tenantId", "==", tenantId).get()).docs) await adminDb.recursiveDelete(row.ref);
  }
  await adminDb.terminate();
}
process.stdout.write(JSON.stringify({ passed, providerCalls, syntheticOnly: true, localCrmWrite: true }));
