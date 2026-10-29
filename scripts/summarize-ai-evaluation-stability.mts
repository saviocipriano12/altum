import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AI_EVALUATION_SCENARIO_VERSION } from "../lib/ai-evaluation.ts";
import { summarizeAiEvaluationStability } from "../lib/ai-evaluation-stability.ts";

const artifactDir = resolve(process.cwd(), ".qa-artifacts", "ai-evaluation");
const requestedPaths = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const paths = requestedPaths.length
  ? requestedPaths.map((path) => resolve(process.cwd(), path))
  : (await readdir(artifactDir))
      .filter((name) => name.startsWith("baseline-") && name.endsWith(".json"))
      .sort()
      .reverse()
      .map((name) => resolve(artifactDir, name));

const runs = [];
for (const path of paths) {
  const parsed = JSON.parse(await readFile(path, "utf8")) as {
    scenarioVersion?: string;
    capturedAt?: string;
    results?: Array<{ scenarioId?: string; passed?: boolean }>;
  };
  if (parsed.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION) continue;
  runs.push({
    id: parsed.capturedAt || path,
    scenarioVersion: parsed.scenarioVersion,
    results: (parsed.results || []).map((result) => ({
      scenarioId: String(result.scenarioId || ""),
      passed: result.passed === true,
    })),
  });
  if (!requestedPaths.length && runs.length === 3) break;
}

const summary = summarizeAiEvaluationStability(runs);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (summary.status === "insufficient") process.exitCode = 1;
