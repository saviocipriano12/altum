import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
  type AiEvaluationGate,
  type AiEvaluationSummary,
} from "@/lib/ai-evaluation";

export const AI_EVALUATION_BASELINE_SCHEMA_VERSION = 1;

export type AiEvaluationComparableResult = {
  scenarioId: string;
  passed: boolean;
  error?: string | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
};

export type AiEvaluationComparableRun = {
  id: string;
  tenantId?: string | null;
  scenarioVersion: string;
  summary: AiEvaluationSummary;
  results: AiEvaluationComparableResult[];
};

export type AiEvaluationRegression = {
  scenarioId: string;
  label: string;
  category: string;
  role: string;
  critical: boolean;
};

export type AiEvaluationGroupDelta = {
  baselinePassRate: number;
  candidatePassRate: number;
  delta: number;
};

export type AiEvaluationBaselineComparison = {
  schemaVersion: typeof AI_EVALUATION_BASELINE_SCHEMA_VERSION;
  scenarioVersion: string;
  baselineRunId: string | null;
  candidateRunId: string;
  status: AiEvaluationGate;
  comparable: boolean;
  establishesBaseline: boolean;
  reasons: string[];
  regressions: AiEvaluationRegression[];
  improvements: AiEvaluationRegression[];
  metrics: {
    passRateDelta: number | null;
    avgLatencyDeltaPercent: number | null;
    estimatedCostDeltaPercent: number | null;
  };
  byCategory: Record<string, AiEvaluationGroupDelta>;
  byRole: Record<string, AiEvaluationGroupDelta>;
};

export type AiEvaluationComparisonPolicy = {
  maxLatencyIncreasePercent: number;
  maxCostIncreasePercent: number;
};

export type AiEvaluationBaselineCandidate = {
  run: AiEvaluationComparableRun;
  createdAtMs: number;
};

export const DEFAULT_AI_EVALUATION_COMPARISON_POLICY: AiEvaluationComparisonPolicy = {
  maxLatencyIncreasePercent: 25,
  maxCostIncreasePercent: 25,
};

export function selectLatestApprovedAiEvaluationBaseline(
  candidates: AiEvaluationBaselineCandidate[],
  input: { tenantId: string; scenarioVersion?: string }
) {
  const scenarioVersion = input.scenarioVersion || AI_EVALUATION_SCENARIO_VERSION;
  return [...candidates]
    .filter(({ run }) =>
      run.tenantId === input.tenantId &&
      run.scenarioVersion === scenarioVersion &&
      run.summary.gate === "ready"
    )
    .sort((a, b) => b.createdAtMs - a.createdAtMs)[0]?.run || null;
}

export function selectAiEvaluationReferenceBaseline(
  candidates: AiEvaluationBaselineCandidate[],
  input: { tenantId: string; scenarioVersion?: string }
) {
  const scenarioVersion = input.scenarioVersion || AI_EVALUATION_SCENARIO_VERSION;
  const compatible = candidates.filter(({ run }) =>
    run.tenantId === input.tenantId && run.scenarioVersion === scenarioVersion
  );
  const approved = selectLatestApprovedAiEvaluationBaseline(compatible, input);
  if (approved) return approved;
  return [...compatible].sort((a, b) => a.createdAtMs - b.createdAtMs)[0]?.run || null;
}

const scenarioById = new Map(AI_EVALUATION_SCENARIOS.map((scenario) => [scenario.id, scenario]));
const expectedScenarioIds = new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id));

function fixedDelta(value: number) {
  return Number(value.toFixed(4));
}

function percentDelta(baseline: number | null, candidate: number | null) {
  if (baseline === null || candidate === null) return null;
  if (baseline === 0) return candidate === 0 ? 0 : null;
  return Number((((candidate - baseline) / baseline) * 100).toFixed(2));
}

function coverageIssues(run: AiEvaluationComparableRun) {
  const ids = run.results.map((result) => result.scenarioId);
  const uniqueIds = new Set(ids);
  const issues: string[] = [];
  if (ids.length !== expectedScenarioIds.size || uniqueIds.size !== expectedScenarioIds.size) {
    issues.push("cobertura_de_cenarios_incompleta_ou_duplicada");
  }
  if ([...uniqueIds].some((scenarioId) => !expectedScenarioIds.has(scenarioId))) {
    issues.push("cenario_desconhecido");
  }
  if ([...expectedScenarioIds].some((scenarioId) => !uniqueIds.has(scenarioId))) {
    issues.push("cenario_oficial_ausente");
  }
  return issues;
}

function groupPassRates(run: AiEvaluationComparableRun, group: "category" | "role") {
  const counters: Record<string, { total: number; approved: number }> = {};
  for (const result of run.results) {
    const scenario = scenarioById.get(result.scenarioId);
    const key = group === "category"
      ? scenario?.category || "unknown"
      : scenario?.assistantRole || "tenant_default";
    counters[key] ||= { total: 0, approved: 0 };
    counters[key].total += 1;
    if (result.passed && !result.error) counters[key].approved += 1;
  }
  return Object.fromEntries(
    Object.entries(counters).map(([key, value]) => [
      key,
      Number((value.approved / value.total).toFixed(4)),
    ])
  );
}

function groupDeltas(
  baseline: AiEvaluationComparableRun,
  candidate: AiEvaluationComparableRun,
  group: "category" | "role"
) {
  const baselineGroups = groupPassRates(baseline, group);
  const candidateGroups = groupPassRates(candidate, group);
  const keys = new Set([...Object.keys(baselineGroups), ...Object.keys(candidateGroups)]);
  return Object.fromEntries(
    [...keys].sort().map((key) => {
      const baselinePassRate = baselineGroups[key] ?? 0;
      const candidatePassRate = candidateGroups[key] ?? 0;
      return [
        key,
        {
          baselinePassRate,
          candidatePassRate,
          delta: fixedDelta(candidatePassRate - baselinePassRate),
        },
      ];
    })
  );
}

function scenarioChange(scenarioId: string): AiEvaluationRegression {
  const scenario = scenarioById.get(scenarioId);
  return {
    scenarioId,
    label: scenario?.label || scenarioId,
    category: scenario?.category || "unknown",
    role: scenario?.assistantRole || "tenant_default",
    critical: scenario?.critical === true,
  };
}

function bootstrapComparison(candidate: AiEvaluationComparableRun): AiEvaluationBaselineComparison {
  const reasons = coverageIssues(candidate);
  if (candidate.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION) {
    reasons.push("versao_de_cenarios_desatualizada");
  }
  if (candidate.summary.gate !== "ready") reasons.push("execucao_candidata_nao_aprovada");
  return {
    schemaVersion: AI_EVALUATION_BASELINE_SCHEMA_VERSION,
    scenarioVersion: candidate.scenarioVersion,
    baselineRunId: null,
    candidateRunId: candidate.id,
    status: reasons.length ? "blocked" : "ready",
    comparable: false,
    establishesBaseline: reasons.length === 0,
    reasons: reasons.length ? reasons : ["baseline_inicial_aprovado"],
    regressions: [],
    improvements: [],
    metrics: {
      passRateDelta: null,
      avgLatencyDeltaPercent: null,
      estimatedCostDeltaPercent: null,
    },
    byCategory: {},
    byRole: {},
  };
}

export function compareAiEvaluationRuns(
  baseline: AiEvaluationComparableRun | null,
  candidate: AiEvaluationComparableRun,
  policy: AiEvaluationComparisonPolicy = DEFAULT_AI_EVALUATION_COMPARISON_POLICY
): AiEvaluationBaselineComparison {
  if (!baseline) return bootstrapComparison(candidate);

  const reasons = [...coverageIssues(baseline), ...coverageIssues(candidate)];
  if (
    baseline.scenarioVersion !== candidate.scenarioVersion ||
    candidate.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION
  ) {
    reasons.push("versoes_de_cenario_incompativeis");
  }
  if (baseline.tenantId && candidate.tenantId && baseline.tenantId !== candidate.tenantId) {
    reasons.push("tenant_incompativel");
  }

  const baselineById = new Map(baseline.results.map((result) => [result.scenarioId, result]));
  const candidateById = new Map(candidate.results.map((result) => [result.scenarioId, result]));
  const regressions = AI_EVALUATION_SCENARIOS
    .filter((scenario) => baselineById.get(scenario.id)?.passed && !candidateById.get(scenario.id)?.passed)
    .map((scenario) => scenarioChange(scenario.id));
  const improvements = AI_EVALUATION_SCENARIOS
    .filter((scenario) => !baselineById.get(scenario.id)?.passed && candidateById.get(scenario.id)?.passed)
    .map((scenario) => scenarioChange(scenario.id));

  if (candidate.summary.gate !== "ready") reasons.push("execucao_candidata_nao_aprovada");
  if (regressions.length) reasons.push("regressao_de_cenario");
  if (regressions.some((regression) => regression.critical)) reasons.push("regressao_critica");
  if (candidate.summary.passRate < baseline.summary.passRate) reasons.push("taxa_de_aprovacao_regrediu");

  const avgLatencyDeltaPercent = percentDelta(
    baseline.summary.runtime.avgLatencyMs,
    candidate.summary.runtime.avgLatencyMs
  );
  const estimatedCostDeltaPercent = percentDelta(
    baseline.summary.runtime.estimatedCostUsd,
    candidate.summary.runtime.estimatedCostUsd
  );
  const watchReasons: string[] = [];
  if (
    avgLatencyDeltaPercent !== null &&
    avgLatencyDeltaPercent > policy.maxLatencyIncreasePercent
  ) {
    watchReasons.push("latencia_acima_do_orcamento");
  }
  if (
    estimatedCostDeltaPercent !== null &&
    estimatedCostDeltaPercent > policy.maxCostIncreasePercent
  ) {
    watchReasons.push("custo_acima_do_orcamento");
  }

  const hardReasons = [...new Set(reasons)];
  const uniqueWatchReasons = [...new Set(watchReasons)];
  const status: AiEvaluationGate = hardReasons.length
    ? "blocked"
    : uniqueWatchReasons.length
      ? "watch"
      : "ready";

  return {
    schemaVersion: AI_EVALUATION_BASELINE_SCHEMA_VERSION,
    scenarioVersion: candidate.scenarioVersion,
    baselineRunId: baseline.id,
    candidateRunId: candidate.id,
    status,
    comparable: !hardReasons.some((reason) =>
      [
        "cobertura_de_cenarios_incompleta_ou_duplicada",
        "cenario_desconhecido",
        "cenario_oficial_ausente",
        "versoes_de_cenario_incompativeis",
        "tenant_incompativel",
      ].includes(reason)
    ),
    establishesBaseline: false,
    reasons: [...hardReasons, ...uniqueWatchReasons],
    regressions,
    improvements,
    metrics: {
      passRateDelta: fixedDelta(candidate.summary.passRate - baseline.summary.passRate),
      avgLatencyDeltaPercent,
      estimatedCostDeltaPercent,
    },
    byCategory: groupDeltas(baseline, candidate, "category"),
    byRole: groupDeltas(baseline, candidate, "role"),
  };
}
