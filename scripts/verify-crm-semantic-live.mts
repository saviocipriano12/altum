import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import nextEnv from "@next/env";
import { extractCommercialFactsWithModel, type SemanticMessage } from "../lib/server/crm/semantic-extraction.ts";

if (!process.argv.includes("--run-synthetic")) throw new Error("Use --run-synthetic to authorize the two bounded provider calls. No CRM records or customer data are used.");
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const model = "gpt-4.1-mini";
const scenarios: { id: string; messages: SemanticMessage[]; check: (facts: Awaited<ReturnType<typeof extractCommercialFactsWithModel>>["facts"]) => void }[] = [
  { id: "buyer-paraphrase", messages: [
    { id: "seller", sender: "agent", kind: "text", text: "Nosso plano custa 9000 reais. Quanto você pode investir?" },
    { id: "buyer", sender: "client", kind: "text", text: "Consigo separar uns 3000 reais pra isso. Aqui sou eu que bato o martelo. Preciso parar de perder pedidos quando a loja fecha." },
  ], check(facts) {
    assert.ok(facts.some(fact => fact.field === "budgetBand" && fact.value.includes("3000")));
    assert.ok(facts.some(fact => fact.field === "decisionMaker"));
    assert.equal(facts.some(fact => fact.value.includes("9000")), false);
  } },
  { id: "correction-and-negative", messages: [
    { id: "first", sender: "client", kind: "text", text: "Tenho 5000 reais pra investir." },
    { id: "last", sender: "client", kind: "text", text: "Corrigindo o valor: só tenho 2000 reais disponíveis. Não sou o dono, preciso falar com meu sócio antes de fechar. Não tenho prazo definido ainda." },
  ], check(facts) {
    assert.ok(facts.some(fact => fact.field === "budgetBand" && fact.value.includes("2000") && fact.messageId === "last"));
    assert.equal(facts.some(fact => fact.field === "budgetBand" && fact.value.includes("5000")), false);
    assert.equal(facts.some(fact => fact.field === "deadline" || fact.field === "urgency"), false);
  } },
];
const results: Record<string, unknown>[] = [];
for (const scenario of scenarios) {
  let extraction: Awaited<ReturnType<typeof extractCommercialFactsWithModel>> | undefined;
  try {
    const result = await extractCommercialFactsWithModel({ messages: scenario.messages, businessContext: "Loja fictícia avaliando atendimento comercial. Não há dados de clientes reais.", model, apiKey: process.env.OPENAI_API_KEY || "", includeDiagnostics: true });
    extraction = result;
    scenario.check(result.facts);
    results.push({ id: scenario.id, passed: true, ...result });
  } catch (error) {
    results.push({ id: scenario.id, passed: false, ...(extraction || {}), error: error instanceof Error ? error.message : "unknown_error" });
  }
}
const report = { at: new Date().toISOString(), model, syntheticOnly: true, liveProvider: true, crmWritten: false,
  mediaFilesRead: false, passed: results.every(result => result.passed), results };
writeFileSync(".qa-artifacts/crm-semantic-live.json", JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify({ passed: report.passed, scenarios: results.map(result => ({ id: result.id, passed: result.passed, error: result.error })) }));
if (!report.passed) process.exitCode = 1;
