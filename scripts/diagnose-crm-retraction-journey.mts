import { writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
if (!process.argv.includes("--synthetic-provider")) throw Error("Explicit synthetic provider mode required");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (!process.env.OPENAI_API_KEY) throw Error("Provider unavailable; no live journey proof");
const tenantId = `qa_diagnostic_journey_${Date.now()}`, leadId = `${tenantId}_lead`, chatId = `${tenantId}_chat`;
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_PRIVATE_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_TENANTS: tenantId, ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25" });
const originalFetch = globalThis.fetch; let calls = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost", "api.openai.com"].includes(url.hostname)) throw Error("External destination blocked");
  if (url.hostname === "api.openai.com" && ++calls > 3) throw Error("Diagnostic call limit");
  return originalFetch(input, init);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const turns: Array<Record<string, unknown>> = [];
try {
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: true, responsePaused: true,
    operatingProfile: { preferredProviders: ["openai"], extractionModelOverride: "gpt-4.1-mini", monthlyBudgetUsd: 5, monthlyUsageCap: 5 } } });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Jornada fictícia de diagnóstico", pipelineStage: "captado", createdAt: new Date() });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp", createdAt: new Date() });
  for (const [index, text] of ["Meu orçamento é 5000 reais", "Corrigindo: meu orçamento é 3000 reais", "Retiro o orçamento informado: ainda não tenho valor definido."].entries()) {
    const messageId = `${tenantId}_turn_${index}`;
    await adminDb.collection("messages").doc(messageId).set({ tenantId, leadId, chatId, sender: "client", type: "text", text, createdAt: new Date() });
    const outcome = await observe({ tenantId, chatId, messageId }), saved = (await adminDb.collection("leads").doc(leadId).get()).data()!;
    const runs = await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("messageId", "==", messageId).get();
    turns.push({ text, messageId, outcome, budget: saved.customFields?.orcamento || null, evidence: saved.aiFieldEvidence?.["custom.orcamento"] || null,
      readState: saved.aiCommercialReadState, semantic: runs.docs.map(doc => ({ status: doc.data().status, facts: doc.data().facts })) });
  }
  await writeFile(".qa-artifacts/crm-diagnostic-baseline/retraction-journey.json", JSON.stringify({ at: new Date().toISOString(), tenantId, leadId, chatId,
    liveProvider: true, syntheticOnly: true, localCrm: true, webhookVerified: false, calls, turns }, null, 2));
  console.log(JSON.stringify({ calls, turns: turns.map(turn => ({ text: turn.text, budget: turn.budget, semantic: turn.semantic, readState: turn.readState })) }));
} finally { globalThis.fetch = originalFetch; await adminDb.terminate(); }
