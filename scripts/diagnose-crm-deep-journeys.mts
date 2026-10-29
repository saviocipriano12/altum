import { mkdir, writeFile } from "node:fs/promises";
import { deepJourneys, type ExpectedValue } from "../tests/fixtures/crm-deep-journeys.ts";
import nextEnv from "@next/env";
import net from "node:net";
const provider = process.argv.includes("--synthetic-provider");
if (!provider && !process.argv.includes("--deterministic")) throw Error("Choose an explicit diagnostic mode");
if (provider) nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (provider && !process.env.OPENAI_API_KEY) throw Error("Provider unavailable; no live evidence");
await new Promise<void>((resolve, reject) => {
  const socket = net.connect({ host: "127.0.0.1", port: 8080 }); socket.setTimeout(2000);
  socket.on("connect", () => { socket.destroy(); resolve(); });
  socket.on("error", reject); socket.on("timeout", () => { socket.destroy(); reject(Error("Local Firestore emulator is unavailable")); });
});
const tenantId = `qa_deep_${provider ? "semantic" : "rules"}_${Date.now()}`;
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", GCLOUD_PROJECT: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_PRIVATE_KEY: "",
  FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "", ALTUM_CRM_SEMANTIC_ENABLED: provider ? "1" : "0", ALTUM_CRM_SEMANTIC_TENANTS: provider ? tenantId : "",
  ALTUM_CRM_SEMANTIC_RESERVATION_USD: "0.25", ...(provider ? {} : { OPENAI_API_KEY: "" }) });
const originalFetch = globalThis.fetch; let calls = 0;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost", ...(provider ? ["api.openai.com"] : [])].includes(url.hostname)) throw Error("Non-diagnostic destination blocked");
  if (url.hostname === "api.openai.com" && ++calls > deepJourneys.length) throw Error("Provider call bound exceeded");
  return originalFetch(input, init);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { commercialReadNotice, commercialReadStatus } = await import("../lib/crm-read-state.ts");
const output = ".qa-artifacts/crm-deep-diagnostic";
await mkdir(output, { recursive: true });
const results: Array<Record<string, unknown>> = [];
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").replace(/[.!]+$/, "").trim();
function accepted(actual: unknown, expected: ExpectedValue) {
  if (expected === null) return actual === undefined || actual === null || actual === "";
  return typeof actual === "string" && (Array.isArray(expected) ? expected : [expected]).some(value => fold(actual) === fold(value));
}
async function persist() {
  await writeFile(`${output}/${provider ? "semantic-final" : "deterministic-turns"}.json`, JSON.stringify({ at: new Date().toISOString(), tenantId,
    mode: provider ? "live provider plus actual observer, final state only" : "actual observer each turn, deterministic path", syntheticOnly: true, webhookVerified: false,
    browserVerified: false, messages: deepJourneys.reduce((sum, journey) => sum + journey.turns.length, 0), calls,
    note: "Challenge suite, not representative production accuracy. Repeated state checkpoints are correlated.", results }, null, 2));
}
try {
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: provider, responsePaused: true,
    businessSummary: "Empresa fictícia vendendo CRM e atendimento. Dados exclusivos de avaliação sintética.",
    operatingProfile: { preferredProviders: ["openai"], extractionModelOverride: "gpt-4.1-mini", monthlyBudgetUsd: 20, monthlyUsageCap: 100 } } });
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { crm: true, ai: true }, limits: {} });
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [
    { id: "entrada", label: "Entrada" }, { id: "analise", label: "Análise comercial" }, { id: "aprovacao", label: "Aguardando aprovação" }, { id: "ganho", label: "Venda concluída", isTerminal: true } ] });
  for (const journey of deepJourneys) {
    const leadId = `${tenantId}_${journey.id}`, chatId = `${leadId}_chat`;
    await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: `Avaliação fictícia ${journey.id}`, pipelineStage: "entrada", createdAt: new Date() });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp", createdAt: new Date() });
    for (const [index, turn] of journey.turns.entries()) {
      const messageId = `${leadId}_turn_${index}`;
      await adminDb.collection("messages").doc(messageId).set({ tenantId, leadId, chatId, sender: turn.sender, type: "text", text: turn.text, createdAt: new Date() });
      if (provider && index !== journey.turns.length - 1) continue;
      const started = performance.now();
      try {
        const outcome = await observe({ tenantId, chatId, messageId }), row = (await adminDb.collection("leads").doc(leadId).get()).data()!;
        const actual = row.customFields?.[journey.field] ?? null;
        const semantic = provider ? (await adminDb.collection("crm_semantic_runs").where("tenantId", "==", tenantId).where("messageId", "==", messageId).get()).docs
          .map(doc => ({ status: doc.data().status, facts: doc.data().facts, rejected: doc.data().rejected })) : [];
        results.push({ journey: journey.id, risk: journey.risk, index, sender: turn.sender, text: turn.text, field: journey.field, expected: turn.expected, actual,
          passed: outcome.observed === true && accepted(actual, turn.expected), outcome, semantic, readState: row.aiCommercialReadState, notice: commercialReadNotice(row.aiCommercialReadState),
          evidence: row.aiFieldEvidence?.[`custom.${journey.field}`] ?? null, stage: row.pipelineStage,
          stageSafe: ["entrada", "analise", "aprovacao"].includes(String(row.pipelineStage)), elapsedMs: Math.round(performance.now() - started), leadId, chatId, messageId });
      } catch (error) { results.push({ journey: journey.id, index, field: journey.field, expected: turn.expected, passed: false, error: error instanceof Error ? error.message : "unknown" }); }
    }
    const checks = results.filter(row => row.journey === journey.id);
    console.log(JSON.stringify({ journey: journey.id, checks: checks.length, passed: checks.filter(row => row.passed).length, last: checks.at(-1)?.actual, calls }));
    await persist();
  }
  const outboundCount = (await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).count().get()).data().count;
  if (outboundCount !== 0) throw Error("Diagnostic unexpectedly created outbound work");
  const states = ["not_enabled", "disabled", "outside_scope", "budget_exhausted", "provider_unavailable", "completed", "cached", "failed", "review_required", "context_changed", "unknown_future_status"];
  await writeFile(`${output}/read-status-contract.json`, JSON.stringify(states.map(semanticStatus => ({ semanticStatus,
    actual: commercialReadStatus({ mediaType: "text", mediaError: false, mediaInterpreted: false, semanticStatus }),
    shouldClaimSemanticSuccess: ["completed", "cached"].includes(semanticStatus) })), null, 2));
  console.log(JSON.stringify({ finished: true, totalChecks: results.length, passed: results.filter(row => row.passed).length,
    journeyFinalPassed: deepJourneys.filter(journey => results.filter(row => row.journey === journey.id).at(-1)?.passed === true).length,
    journeyAllChecksPassed: deepJourneys.filter(journey => results.filter(row => row.journey === journey.id).every(row => row.passed === true)).length, calls, outboundCount }));
} finally { await persist(); globalThis.fetch = originalFetch; await adminDb.terminate(); }
