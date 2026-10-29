import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
} from "@/lib/ai-evaluation";

export type AiEvaluationOutcomeRun = {
  id: string;
  scenarioVersion: string;
  results: Array<{ scenarioId: string; passed: boolean }>;
};

export type AiEvaluationStabilitySummary = {
  status: "insufficient" | "stable" | "unstable";
  scenarioVersion: string;
  runCount: number;
  scenarioCount: number;
  stablePasses: string[];
  stableFailures: string[];
  flakyScenarios: string[];
  criticalFlakyScenarios: string[];
  consistencyRate: number;
  issues: string[];
};

export function summarizeAiEvaluationStability(
  runs: AiEvaluationOutcomeRun[]
): AiEvaluationStabilitySummary {
  const issues: string[] = [];
  const expectedIds = AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id);
  const expectedSet = new Set(expectedIds);
  if (runs.length < 2) issues.push("ao_menos_duas_execucoes_sao_necessarias");
  if (runs.some((run) => run.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION)) {
    issues.push("versao_de_cenarios_incompativel");
  }
  for (const run of runs) {
    const ids = run.results.map((result) => result.scenarioId);
    const unique = new Set(ids);
    if (
      ids.length !== expectedIds.length ||
      unique.size !== expectedIds.length ||
      [...unique].some((id) => !expectedSet.has(id))
    ) {
      issues.push(`cobertura_invalida:${run.id}`);
    }
  }

  const stablePasses: string[] = [];
  const stableFailures: string[] = [];
  const flakyScenarios: string[] = [];
  if (!issues.some((issue) => issue.startsWith("cobertura_invalida") || issue.includes("versao"))) {
    for (const scenarioId of expectedIds) {
      const outcomes = runs.map((run) => run.results.find((result) => result.scenarioId === scenarioId)?.passed === true);
      if (outcomes.every(Boolean)) stablePasses.push(scenarioId);
      else if (outcomes.every((outcome) => !outcome)) stableFailures.push(scenarioId);
      else flakyScenarios.push(scenarioId);
    }
  }

  const criticalIds = new Set(
    AI_EVALUATION_SCENARIOS.filter((scenario) => scenario.critical).map((scenario) => scenario.id)
  );
  const criticalFlakyScenarios = flakyScenarios.filter((scenarioId) => criticalIds.has(scenarioId));
  const consistencyRate = expectedIds.length
    ? Number(((stablePasses.length + stableFailures.length) / expectedIds.length).toFixed(4))
    : 0;
  const status = issues.length || runs.length < 2
    ? "insufficient"
    : flakyScenarios.length
      ? "unstable"
      : "stable";

  return {
    status,
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    runCount: runs.length,
    scenarioCount: expectedIds.length,
    stablePasses,
    stableFailures,
    flakyScenarios,
    criticalFlakyScenarios,
    consistencyRate,
    issues: [...new Set(issues)],
  };
}
