import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { collectHandlerBaseline } from "./ai-rebuild/handler-baseline.mts";
import { evaluateShopifyDevelopmentJourney } from "./ai-rebuild/journey-outcome.mts";
const caseArg = process.argv.find(arg => arg.startsWith("--case="))?.slice("--case=".length);
const paidModel = process.argv.includes("--paid-model");
if (paidModel) {
  if (!caseArg) throw new Error("Chamada paga exige --case de desenvolvimento; nao libera todo diagnostico.");
  // Reuse configured credentials without printing them; Firebase credentials are
  // cleared and all business providers intercepted by the sandbox before imports.
  const { loadEnvConfig } = await import("@next/env");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
}
const baseline = await collectHandlerBaseline({ shopify: process.argv.includes("--shopify"), paidModel, ...(caseArg ? { corpusCaseId: caseArg } : {}) });
const report = { ...baseline, journeyOutcome: baseline.corpusCase ? evaluateShopifyDevelopmentJourney(baseline) : null };
const directory = fileURLToPath(new URL("../.qa-artifacts/ai-rebuild/", import.meta.url));
await mkdir(directory, { recursive: true });
const path = join(directory, `handler-baseline-${Date.now()}.json`);
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: path, turns: report.turns.map(turn => ({ index: turn.index, result: turn.result,
  modelCalls: turn.modelRequests.length, delivered: turn.delivered })),
  foreignSourceProbe: report.foreignSourceProbe, wrongChatProbe: report.wrongChatProbe,
  missingLinkProbe: report.missingLinkProbe, replayProbe: report.replayProbe, outbound: report.outbound,
  passiveProbe: report.passiveProbe, blockedNetwork: report.blockedNetwork,
  catalogProbe: report.catalogProbe,
  corpusCase: report.corpusCase,
  paidReceipts: report.paidReceipts, paidErrors: report.paidErrors,
  sourceUnchanged: report.sourceUnchanged, paidModelCalls: report.paidModelCalls, acceptance: report.acceptance,
  journeyOutcome: report.journeyOutcome }, null, 2));
// Default probes remain diagnostic. An explicit corpus case also fails its narrow
// objective gate; recording a valid artifact must not look like task success.
if (!report.sourceUnchanged || report.blockedNetwork.length || report.paidErrors.length ||
    (report.journeyOutcome && !report.journeyOutcome.objectiveChecksPassed)) process.exitCode = 2;
