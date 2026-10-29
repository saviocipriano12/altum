import assert from "node:assert/strict";
import test from "node:test";
import { AI_EVALUATION_SCENARIOS, AI_EVALUATION_SCENARIO_VERSION } from "../lib/ai-evaluation.ts";
import {
  compareAiDigitalTwinRuns,
  buildAiDigitalTwinSnapshot,
  digitalTwinJourneyCoverage,
  redactAiDigitalTwinText,
  runAiDigitalTwinFaultProbes,
  validateAiDigitalTwinVariantCoverage,
  type AiDigitalTwinEvaluationRun,
} from "../lib/ai-digital-twin.ts";

function run(id: string, overrides: Partial<AiDigitalTwinEvaluationRun> = {}): AiDigitalTwinEvaluationRun {
  return {
    id,
    tenantId: "tenant-a",
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    summaryGate: "ready",
    baselineStatus: "ready",
    stabilityStatus: "stable",
    learningRecommendationFingerprint: id === "candidate" ? "candidate-learning" : null,
    results: AI_EVALUATION_SCENARIOS.map((scenario) => ({
      scenarioId: scenario.id,
      critical: scenario.critical,
      category: scenario.category,
      passed: true,
      decision: "respond",
      responseGoal: "clarify",
      stateAfter: "discovery",
      qualityScore: 0.9,
      latencyMs: 100,
      estimatedCostUsd: 0.001,
      providerFallbackTriggered: false,
      actionPlanExecutionMode: "blocked",
      actionPlanReadySteps: [],
      actionPlanApprovalSteps: [],
      responseValidationStatus: "accepted",
      issues: [],
    })),
    ...overrides,
  };
}

test("jornadas cobrem cada cenario oficial exatamente uma vez", () => {
  assert.deepEqual(digitalTwinJourneyCoverage(), { complete: true, missing: [], duplicated: [], unknown: [] });
});

test("matriz de variantes cobre papeis, canais, segmentos, maturidade, ruido, ataques, entrega, provedor e jornada", () => {
  assert.deepEqual(validateAiDigitalTwinVariantCoverage(), { complete: true, missingDimensions: [], unknown: [] });
});

test("provas sinteticas exercitam duplicidade, ordem, falha de provedor e silencio sem efeito externo", () => {
  const probes = runAiDigitalTwinFaultProbes();
  assert.deepEqual(probes.map((probe) => probe.id), ["duplicate_event", "out_of_order_event", "provider_failure", "silence"]);
  assert.ok(probes.every((probe) => probe.passed));
});

test("snapshot e reproduzivel, tenant-scoped e nao contem conversa bruta", () => {
  const first = buildAiDigitalTwinSnapshot({ tenantId: "tenant-a", baselineRunId: "b1", candidateRunId: "c1", baselineContextFingerprint: "base", candidateContextFingerprint: "candidate", candidateLearningFingerprint: "learning" });
  const replay = buildAiDigitalTwinSnapshot({ tenantId: "tenant-a", baselineRunId: "b1", candidateRunId: "c1", baselineContextFingerprint: "base", candidateContextFingerprint: "candidate", candidateLearningFingerprint: "learning" });
  const otherTenant = buildAiDigitalTwinSnapshot({ tenantId: "tenant-b", baselineRunId: "b1", candidateRunId: "c1", baselineContextFingerprint: "base", candidateContextFingerprint: "candidate", candidateLearningFingerprint: "learning" });
  assert.equal(first.fingerprint, replay.fingerprint);
  assert.notEqual(first.fingerprint, otherTenant.fingerprint);
  assert.equal(first.containsRawCustomerText, false);
  assert.equal(first.externalEffects, "blocked");
});

test("gemeo aprova candidato estavel, sem regressao e integralmente em sombra", () => {
  const result = compareAiDigitalTwinRuns({
    tenantId: "tenant-a",
    baseline: run("baseline"),
    candidate: run("candidate"),
    expectedCandidateFingerprint: "candidate-learning",
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.scenarioCount, AI_EVALUATION_SCENARIOS.length);
  assert.ok(result.fingerprint);
  assert.match(result.rollback, /nenhum efeito externo/i);
});

test("bloqueia regressao critica, efeito real e fingerprint divergente", () => {
  const candidate = run("candidate");
  candidate.results[0] = { ...candidate.results[0]!, passed: false, actionPlanExecutionMode: "ready", actionPlanReadySteps: ["move_pipeline_stage"] };
  const result = compareAiDigitalTwinRuns({ tenantId: "tenant-a", baseline: run("baseline"), candidate, expectedCandidateFingerprint: "outro" });
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("regressao_critica"));
  assert.ok(result.reasons.includes("efeito_real_na_simulacao"));
  assert.ok(result.reasons.includes("fingerprint_do_candidato_invalido"));
});

test("bloqueia outro tenant, instabilidade e aumento excessivo de custo e latencia", () => {
  const candidate = run("candidate", { tenantId: "tenant-b", stabilityStatus: "unstable" });
  candidate.results = candidate.results.map((item) => ({ ...item, latencyMs: 140, estimatedCostUsd: 0.002 }));
  const result = compareAiDigitalTwinRuns({ tenantId: "tenant-a", baseline: run("baseline"), candidate });
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("tenant_invalido"));
  assert.ok(result.reasons.includes("candidato_instavel"));
  assert.ok(result.reasons.includes("latencia_acima_do_limite"));
  assert.ok(result.reasons.includes("custo_acima_do_limite"));
});

test("bloqueia fallback de provedor, baseline invalido e ids de cenario duplicados", () => {
  const baseline = run("baseline", { summaryGate: "blocked" });
  const candidate = run("candidate");
  candidate.results[1] = { ...candidate.results[0]!, providerFallbackTriggered: true };
  const result = compareAiDigitalTwinRuns({ tenantId: "tenant-a", baseline, candidate });
  assert.equal(result.status, "blocked");
  assert.ok(result.reasons.includes("bateria_baseline_bloqueada"));
  assert.ok(result.reasons.includes("fallback_de_provedor_no_candidato"));
  assert.ok(result.reasons.includes("cobertura_de_cenarios_incompleta"));
});

test("anonimizacao remove email, telefone, documento, cartao e URL", () => {
  const redacted = redactAiDigitalTwinText("Ana ana@empresa.com +55 11 99999-8888 CPF 123.456.789-00 cartão 4111 1111 1111 1111 https://segredo.test/x");
  assert.doesNotMatch(redacted, /ana@|99999|123\.456|4111|https:/i);
  assert.match(redacted, /\[email\].*\[telefone\].*\[documento\].*\[cartao\].*\[url\]/i);
});
