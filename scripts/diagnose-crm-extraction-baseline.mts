/** Diagnostic baseline. Deliberately records product failures without changing the extractor. */
import { mkdir, writeFile } from "node:fs/promises";
import { extractObservedCommercialFacts } from "../lib/server/crm/conversation-facts.ts";
type Case = { id: string; text: string; field: string; expected: string | null; sender?: string };
const cases: Case[] = [
  { id: "budget_literal", text: "Meu orçamento é 5000 reais", field: "budgetBand", expected: "5000 reais" },
  { id: "budget_question_suffix", text: "Meu orçamento é 5000 reais. Pode me ajudar?", field: "budgetBand", expected: "5000 reais" },
  { id: "budget_colloquial", text: "Tenho 5 mil para investir", field: "budgetBand", expected: "5 mil" },
  { id: "budget_currency", text: "Meu orçamento é R$ 5.000,00", field: "budgetBand", expected: "5.000,00" },
  { id: "budget_words", text: "Meu orçamento é cinco mil reais", field: "budgetBand", expected: "cinco mil reais" },
  { id: "budget_limit", text: "Posso investir até 5000 reais", field: "budgetBand", expected: "5000 reais" },
  { id: "budget_question_prefix", text: "Como funciona? Meu orçamento é 5000 reais.", field: "budgetBand", expected: "5000 reais" },
  { id: "budget_same_turn_correction", text: "Meu orçamento é 5000 reais. Corrigindo: meu orçamento é 3000 reais.", field: "budgetBand", expected: "3000 reais" },
  { id: "budget_old_vs_current", text: "Antes meu orçamento era 5000 reais. Hoje meu orçamento é 3000 reais.", field: "budgetBand", expected: "3000 reais" },
  { id: "budget_past_only", text: "Em 2020 meu orçamento é 5000 reais, mas isso não vale mais.", field: "budgetBand", expected: null },
  { id: "budget_third_person", text: "Meu sócio disse: meu orçamento é 5000 reais. Eu ainda não defini o meu.", field: "budgetBand", expected: null },
  { id: "budget_retracted", text: "Meu orçamento é 5000 reais, mas retiro essa informação: ainda não defini orçamento.", field: "budgetBand", expected: null },
  { id: "budget_hypothesis", text: "Se meu orçamento é 5000 reais, daria para contratar", field: "budgetBand", expected: null },
  { id: "budget_explicit_hypothesis", text: "Supondo que meu orçamento é 5000 reais", field: "budgetBand", expected: null },
  { id: "budget_not_customer", text: "O plano de vocês custa 5000 reais", field: "budgetBand", expected: null },
  { id: "budget_seller", text: "Meu orçamento é 5000 reais", field: "budgetBand", expected: null, sender: "agent" },
  { id: "budget_number_context", text: "Meu telefone termina em 5000 e tenho 12 vendedores", field: "budgetBand", expected: null },
  { id: "budget_ask", text: "Meu orçamento é 5000 reais? Não lembro.", field: "budgetBand", expected: null },
  { id: "city_literal", text: "Moro em Recife", field: "city", expected: "Recife" },
  { id: "city_question_suffix", text: "Moro em Recife. Vocês atendem aqui?", field: "city", expected: "Recife" },
  { id: "city_lowercase", text: "moro em belo horizonte", field: "city", expected: "belo horizonte" },
  { id: "city_negation", text: "Não moro em Recife", field: "city", expected: null },
  { id: "city_correction", text: "Moro em Recife. Corrigindo: moro em Salvador.", field: "city", expected: "Salvador" },
  { id: "team_literal", text: "Temos uma equipe com 12 vendedores", field: "teamSize", expected: "12 vendedores" },
  { id: "team_question_suffix", text: "Temos uma equipe com 12 vendedores. Funciona para nós?", field: "teamSize", expected: "12 vendedores" },
  { id: "team_negation", text: "Não temos equipe com 12 vendedores", field: "teamSize", expected: null },
  { id: "interest_literal", text: "Tenho interesse em CRM", field: "serviceInterest", expected: "CRM" },
  { id: "interest_negation", text: "Não tenho interesse em CRM", field: "serviceInterest", expected: null },
  { id: "interest_question_suffix", text: "Tenho interesse em CRM. Pode apresentar?", field: "serviceInterest", expected: "CRM" },
  { id: "goal_literal", text: "Meu objetivo é vender mais", field: "primaryGoal", expected: "vender mais" },
  { id: "need_literal", text: "Meu problema é perder contatos", field: "need", expected: "perder contatos" },
  { id: "deadline_literal", text: "Preciso implantar até sexta", field: "deadline", expected: "até sexta" },
  { id: "decisor_negation", text: "Não sou o dono", field: "decisionMaker", expected: null },
  { id: "decisor_retracted", text: "Sou o dono, mas quem decide a compra é minha sócia", field: "decisionMaker", expected: null },
  { id: "objection_negation", text: "Não achei caro", field: "dominantObjection", expected: null },
];
const output = ".qa-artifacts/crm-diagnostic-baseline";
await mkdir(output, { recursive: true });
const pure = cases.filter(row => row.sender !== "agent").map(row => {
  const actual = extractObservedCommercialFacts(row.text)[row.field] || null;
  return { ...row, actual, passed: actual === row.expected };
});
await writeFile(`${output}/pure.json`, JSON.stringify({ at: new Date().toISOString(), mode: "actual deterministic extractor; no model", cases: pure }, null, 2));
console.log(JSON.stringify({ mode: "pure", total: pure.length, passed: pure.filter(row => row.passed).length, failures: pure.filter(row => !row.passed) }));
if (!process.argv.includes("--emulator")) process.exit(0);
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  GCLOUD_PROJECT: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  OPENAI_API_KEY: "", ALTUM_CRM_SEMANTIC_ENABLED: "0", ALTUM_CRM_SEMANTIC_TENANTS: "" });
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Diagnostic blocks all external transport");
  return originalFetch(input, init);
};
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { observeConversationCommercialState: observe } = await import("../lib/server/crm/conversation-intelligence.ts");
const { enqueueConversationCommercialObservation: enqueue, processConversationCommercialObservationJobs: processJobs } = await import("../lib/server/crm/conversation-observation-queue.ts");
const tenantId = `qa_diagnostic_${Date.now()}`;
const mapping: Record<string, string> = { budgetBand: "orcamento", city: "cidade", teamSize: "tamanho_time", serviceInterest: "servico_interesse", primaryGoal: "objetivo_principal", need: "necessidade", deadline: "prazo", decisionMaker: "decisor", dominantObjection: "objecao_principal" };
const results: Array<Record<string, unknown>> = [];
try {
  await adminDb.collection("tenant_settings").doc(tenantId).set({ tenantId, ai: { enabled: false, responsePaused: true } });
  for (const [index, row] of cases.entries()) {
    const leadId = `${tenantId}_${row.id}`, chatId = `${leadId}_chat`, messageId = `${leadId}_message`;
    await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: `Diagnóstico fictício ${row.id}`, pipelineStage: "captado", createdAt: new Date() });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channel: "whatsapp", createdAt: new Date() });
    await adminDb.collection("messages").doc(messageId).set({ tenantId, chatId, leadId, sender: row.sender || "client", text: row.text, type: "text", createdAt: new Date() });
    const started = performance.now();
    let outcome: unknown;
    if (index < 3) { const queued = await enqueue({ tenantId, chatId, messageId, source: "inbound_message" }); outcome = await processJobs({ jobId: queued.jobId, limit: 1 }); }
    else outcome = await observe({ tenantId, chatId, messageId });
    const saved = (await adminDb.collection("leads").doc(leadId).get()).data()!;
    const actual = saved.customFields?.[mapping[row.field]] || null;
    const result = { ...row, actual, passed: actual === row.expected, outcome, stage: saved.pipelineStage,
      evidence: saved.aiFieldEvidence?.[`custom.${mapping[row.field]}`] || null, elapsedMs: Math.round(performance.now() - started), leadId, chatId, messageId };
    results.push(result);
    console.log(JSON.stringify({ case: row.id, passed: result.passed, actual, expected: row.expected, stage: saved.pipelineStage }));
    await writeFile(`${output}/persisted.json`, JSON.stringify({ at: new Date().toISOString(), tenantId, mode: "real observer and Firestore emulator; model disabled; first three via real local queue; synthetic messages; no webhook or production", cases: results }, null, 2));
  }
} finally { globalThis.fetch = originalFetch; await adminDb.terminate(); }
console.log(JSON.stringify({ mode: "persisted", tenantId, total: results.length, passed: results.filter(row => row.passed).length }));
