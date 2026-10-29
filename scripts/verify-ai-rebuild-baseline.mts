import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { collectShopifyRebuildBaseline } from "./ai-rebuild/baseline.mts";

const report = await collectShopifyRebuildBaseline();
const directory = fileURLToPath(new URL("../.qa-artifacts/ai-rebuild/", import.meta.url));
await mkdir(directory, { recursive: true });
const path = join(directory, `baseline-${Date.now()}.json`);
await writeFile(path, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ report: path, observedGapCount: report.observedGapCount,
  findings: report.findings.map(f => ({ id: f.id, kind: f.kind, gapObserved: f.gapObserved })),
  scenarioSpecifications: report.scenarioSpecifications, requiredWithoutScenario: report.requiredWithoutScenario,
  evaluationPlan: report.evaluationPlan,
  sourceUnchanged: report.sourceUnchanged, productReady: report.acceptance.productReady, paidModelCalls: report.paidModelCalls }, null, 2));
// Success means a diagnostic was recorded, never that the product passed acceptance.
if (!report.sourceUnchanged) process.exitCode = 2;
