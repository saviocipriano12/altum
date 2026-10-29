import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
  summarizeAiEvaluation,
  type AiEvaluationRunItem,
} from "../lib/ai-evaluation.ts";
import {
  compareAiEvaluationRuns,
  selectAiEvaluationReferenceBaseline,
  selectLatestApprovedAiEvaluationBaseline,
  type AiEvaluationComparableRun,
} from "../lib/ai-evaluation-baseline.ts";

function buildRun(input: {
  id: string;
  tenantId?: string;
  failed?: string[];
  latencyMs?: number;
  cost?: number;
  scenarioVersion?: string;
}): AiEvaluationComparableRun {
  const failed = new Set(input.failed || []);
  const items: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: {
      runtime: {
        source: "model",
        latencyMs: input.latencyMs ?? 500,
        estimatedCostUsd: input.cost ?? 0.001,
      },
    },
    verdict: failed.has(scenario.id)
      ? { passed: false, issues: ["falha_controlada"] }
      : { passed: true, issues: [] },
  }));
  return {
    id: input.id,
    tenantId: input.tenantId || "tenant-a",
    scenarioVersion: input.scenarioVersion || AI_EVALUATION_SCENARIO_VERSION,
    summary: summarizeAiEvaluation(items),
    results: items.map((item) => ({
      scenarioId: item.scenarioId,
      passed: item.verdict?.passed === true,
      latencyMs: item.preview?.runtime?.latencyMs,
      estimatedCostUsd: item.preview?.runtime?.estimatedCostUsd,
    })),
  };
}

test("first approved complete run establishes a tenant baseline", () => {
  const comparison = compareAiEvaluationRuns(null, buildRun({ id: "first" }));
  assert.equal(comparison.status, "ready");
  assert.equal(comparison.establishesBaseline, true);
  assert.equal(comparison.baselineRunId, null);
});

test("an incomplete first run cannot establish a baseline", () => {
  const run = buildRun({ id: "partial" });
  run.results.pop();
  const comparison = compareAiEvaluationRuns(null, run);
  assert.equal(comparison.status, "blocked");
  assert.equal(comparison.establishesBaseline, false);
  assert.ok(comparison.reasons.includes("cobertura_de_cenarios_incompleta_ou_duplicada"));
});

test("comparison blocks a compensated role regression", () => {
  const baseline = buildRun({ id: "baseline", failed: ["price_early"] });
  const candidate = buildRun({ id: "candidate", failed: ["sdr_qualifies_one_step"] });
  const comparison = compareAiEvaluationRuns(baseline, candidate);

  assert.equal(candidate.summary.passRate, baseline.summary.passRate);
  assert.equal(comparison.status, "blocked");
  assert.deepEqual(comparison.regressions.map((item) => item.scenarioId), ["sdr_qualifies_one_step"]);
  assert.deepEqual(comparison.improvements.map((item) => item.scenarioId), ["price_early"]);
  assert.ok(comparison.byRole.sdr.delta < 0);
});

test("comparison blocks critical regressions even when the total remains high", () => {
  const baseline = buildRun({ id: "baseline" });
  const candidate = buildRun({ id: "candidate", failed: ["human_handoff"] });
  const comparison = compareAiEvaluationRuns(baseline, candidate);
  assert.equal(comparison.status, "blocked");
  assert.ok(comparison.reasons.includes("regressao_critica"));
  assert.equal(comparison.regressions[0]?.critical, true);
});

test("comparison rejects cross-tenant and scenario-version baselines", () => {
  const baseline = buildRun({ id: "baseline", tenantId: "tenant-a" });
  const candidate = buildRun({
    id: "candidate",
    tenantId: "tenant-b",
    scenarioVersion: "old-version",
  });
  const comparison = compareAiEvaluationRuns(baseline, candidate);
  assert.equal(comparison.status, "blocked");
  assert.equal(comparison.comparable, false);
  assert.ok(comparison.reasons.includes("tenant_incompativel"));
  assert.ok(comparison.reasons.includes("versoes_de_cenario_incompativeis"));
});

test("latency and cost budgets keep an otherwise good candidate under watch", () => {
  const baseline = buildRun({ id: "baseline", latencyMs: 100, cost: 0.001 });
  const candidate = buildRun({ id: "candidate", latencyMs: 140, cost: 0.0014 });
  const comparison = compareAiEvaluationRuns(baseline, candidate);
  assert.equal(comparison.status, "watch");
  assert.equal(comparison.metrics.avgLatencyDeltaPercent, 40);
  assert.equal(comparison.metrics.estimatedCostDeltaPercent, 40);
  assert.ok(comparison.reasons.includes("latencia_acima_do_orcamento"));
  assert.ok(comparison.reasons.includes("custo_acima_do_orcamento"));
});

test("equal or better candidate without regressions is ready", () => {
  const baseline = buildRun({ id: "baseline", latencyMs: 500, cost: 0.001 });
  const candidate = buildRun({ id: "candidate", latencyMs: 480, cost: 0.0009 });
  const comparison = compareAiEvaluationRuns(baseline, candidate);
  assert.equal(comparison.status, "ready");
  assert.equal(comparison.regressions.length, 0);
  assert.equal(comparison.metrics.passRateDelta, 0);
});

test("latest approved baseline selection never crosses tenant or scenario version", () => {
  const oldReady = buildRun({ id: "old-ready", tenantId: "tenant-a" });
  const newestBlocked = buildRun({ id: "newest-blocked", tenantId: "tenant-a", failed: ["human_handoff"] });
  const otherTenant = buildRun({ id: "other-tenant", tenantId: "tenant-b" });
  const oldVersion = buildRun({ id: "old-version", tenantId: "tenant-a", scenarioVersion: "old" });

  const selected = selectLatestApprovedAiEvaluationBaseline(
    [
      { run: oldReady, createdAtMs: 100 },
      { run: newestBlocked, createdAtMs: 500 },
      { run: otherTenant, createdAtMs: 600 },
      { run: oldVersion, createdAtMs: 700 },
    ],
    { tenantId: "tenant-a" }
  );

  assert.equal(selected?.id, "old-ready");
});

test("reference selection keeps the first observed run until an approved baseline exists", () => {
  const firstObserved = buildRun({ id: "first-observed", failed: ["human_handoff"] });
  const newerObserved = buildRun({ id: "newer-observed", failed: ["agent_identity"] });

  const withoutApproved = selectAiEvaluationReferenceBaseline(
    [
      { run: newerObserved, createdAtMs: 200 },
      { run: firstObserved, createdAtMs: 100 },
    ],
    { tenantId: "tenant-a" }
  );
  assert.equal(withoutApproved?.id, "first-observed");

  const approved = buildRun({ id: "approved" });
  const withApproved = selectAiEvaluationReferenceBaseline(
    [
      { run: firstObserved, createdAtMs: 100 },
      { run: approved, createdAtMs: 300 },
      { run: newerObserved, createdAtMs: 400 },
    ],
    { tenantId: "tenant-a" }
  );
  assert.equal(withApproved?.id, "approved");
});
