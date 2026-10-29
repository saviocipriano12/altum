import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
} from "../lib/ai-evaluation.ts";
import { summarizeAiEvaluationStability } from "../lib/ai-evaluation-stability.ts";

function run(id: string, failures: string[] = []) {
  const failed = new Set(failures);
  return {
    id,
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    results: AI_EVALUATION_SCENARIOS.map((scenario) => ({
      scenarioId: scenario.id,
      passed: !failed.has(scenario.id),
    })),
  };
}

test("stability requires repeated complete executions", () => {
  const summary = summarizeAiEvaluationStability([run("only")]);
  assert.equal(summary.status, "insufficient");
  assert.ok(summary.issues.includes("ao_menos_duas_execucoes_sao_necessarias"));
});

test("stability separates persistent failures from stochastic scenarios", () => {
  const summary = summarizeAiEvaluationStability([
    run("one", ["price_early", "human_handoff"]),
    run("two", ["price_early"]),
  ]);
  assert.equal(summary.status, "unstable");
  assert.ok(summary.stableFailures.includes("price_early"));
  assert.ok(summary.flakyScenarios.includes("human_handoff"));
  assert.ok(summary.criticalFlakyScenarios.includes("human_handoff"));
});

test("identical outcomes across complete runs are stable", () => {
  const summary = summarizeAiEvaluationStability([
    run("one", ["price_early"]),
    run("two", ["price_early"]),
  ]);
  assert.equal(summary.status, "stable");
  assert.deepEqual(summary.stableFailures, ["price_early"]);
  assert.equal(summary.flakyScenarios.length, 0);
  assert.equal(summary.consistencyRate, 1);
});

test("incomplete or old-version runs cannot be compared", () => {
  const incomplete = run("incomplete");
  incomplete.results.pop();
  const old = { ...run("old"), scenarioVersion: "old" };
  const summary = summarizeAiEvaluationStability([incomplete, old]);
  assert.equal(summary.status, "insufficient");
  assert.ok(summary.issues.includes("versao_de_cenarios_incompativel"));
  assert.ok(summary.issues.includes("cobertura_invalida:incomplete"));
});
