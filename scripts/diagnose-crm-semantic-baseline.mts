import { readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { extractCommercialFactsWithModel } from "../lib/server/crm/semantic-extraction.ts";
if (!process.argv.includes("--synthetic-provider")) throw Error("Explicit synthetic provider mode required");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const input = JSON.parse(await readFile(".qa-artifacts/crm-diagnostic-baseline/pure.json", "utf8")) as {
  cases: Array<{ id: string; text: string; field: string; expected: string | null }> };
const selected = new Set(["budget_literal", "budget_question_suffix", "budget_colloquial", "budget_words", "budget_same_turn_correction", "budget_retracted", "budget_hypothesis", "city_lowercase"]);
const results: Array<Record<string, unknown>> = [];
if (!process.env.OPENAI_API_KEY) {
  await writeFile(".qa-artifacts/crm-diagnostic-baseline/provider.json", JSON.stringify({ attempted: false, reason: "provider_key_unavailable", productionProof: false }));
  console.log("No provider configured; live semantic quality remains unverified"); process.exit(0);
}
const persisted = process.argv.includes("--persisted");
const tenantId = `qa_diagnostic_semantic_${Date.now()}`;
let db: import("firebase-admin/firestore").Firestore | undefined;
let observe: typeof import("../lib/server/crm/conversation-intelligence.ts").observeConversationCommercialState | undefined;
if (persisted) {
  Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_PRIVATE_KEY: "",
    FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", ALTUM_CRM_SEMANTIC_ENABLED: "1", ALTUM_CRM_SEMANTIC_TENANTS: tenantId, ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25" });
  db = (await import("../app/lib/server/firebase-admin.ts")).adminDb;
  observe = (await import("../lib/server/crm/conversation-intelligence.ts")).observeConversationCommercialState;
  await db.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: true, responsePaused: true,
    operatingProfile: { preferredProviders: ["openai"], extractionModelOverride: "gpt-4.1-mini", monthlyBudgetUsd: 20, monthlyUsageCap: 20 } } });
  await db.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
}
for (const row of input.cases.filter(item => selected.has(item.id))) {
  try {
    if (persisted) {
      if (!db || !observe) throw Error("Local observer unavailable");
      const leadId = `${tenantId}_${row.id}`, chatId = `${leadId}_chat`, messageId = `${leadId}_message`;
      await db.collection("leads").doc(leadId).set({ tenantId, nome: `Diagnóstico fictício ${row.id}`, pipelineStage: "captado", createdAt: new Date() });
      await db.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp", createdAt: new Date() });
      await db.collection("messages").doc(messageId).set({ tenantId, leadId, chatId, sender: "client", text: row.text, type: "text", createdAt: new Date() });
      const outcome = await observe({ tenantId, chatId, messageId });
      const saved = (await db.collection("leads").doc(leadId).get()).data()!;
      const actual = saved.customFields?.[row.field === "city" ? "cidade" : "orcamento"] || null;
      const runs = await db.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("messageId", "==", messageId).get();
      const semantic = runs.docs.map(doc => ({ status: doc.data().status, facts: doc.data().facts, rejected: doc.data().rejected }));
      results.push({ ...row, actual, passed: actual === row.expected, outcome, semantic, readState: saved.aiCommercialReadState, leadId, chatId, messageId });
      console.log(JSON.stringify(results.at(-1)));
    } else {
    const result = await extractCommercialFactsWithModel({ messages: [{ id: row.id, sender: "client", kind: "text", text: row.text }],
      businessContext: "Empresa fictícia avaliando CRM; somente dados sintéticos de diagnóstico.", model: "gpt-4.1-mini", apiKey: process.env.OPENAI_API_KEY!, includeDiagnostics: true });
    const values = result.facts.filter(fact => fact.field === row.field).map(fact => fact.value);
    const passed = row.expected === null ? values.length === 0 : values.length === 1 && values[0] === row.expected;
    results.push({ ...row, ...result, values, passed });
    console.log(JSON.stringify({ id: row.id, values, expected: row.expected, passed }));
    }
  } catch (error) { results.push({ id: row.id, passed: false, error: error instanceof Error ? error.message : "unknown" }); }
  await writeFile(`.qa-artifacts/crm-diagnostic-baseline/${persisted ? "provider-persisted" : "provider"}.json`, JSON.stringify({ at: new Date().toISOString(), liveProvider: true, syntheticOnly: true,
    actualExtractor: true, crmWritten: persisted, ...(persisted ? { tenantId } : {}), webhookTested: false, productionProof: false, results }, null, 2));
}
if (db) await db.terminate();
console.log(JSON.stringify({ total: results.length, passed: results.filter(row => row.passed).length }));
