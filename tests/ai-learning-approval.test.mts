import assert from "node:assert/strict";
import test from "node:test";
import { AI_EVALUATION_SCENARIO_VERSION } from "../lib/ai-evaluation.ts";
import { evaluateTenantLearningPromotion } from "../lib/server/ai/learning-approval.ts";
import { AI_TENANT_RECOMMENDATION_VERSION } from "../lib/server/ai/learning-policy.ts";

const now = Date.now();
const recommendation = {
  tenantId: "tenant-a",
  status: "shadow",
  schemaVersion: AI_TENANT_RECOMMENDATION_VERSION,
  fingerprint: "candidate-1",
  sampleSize: 12,
  distinctRelationships: 6,
  confidence: 0.81,
  conflictRatio: 0.1,
  updatedAtMs: now - 10_000,
  expiresAtMs: now + 100_000,
};
const evaluation = {
  runId: "evaluation-run-1",
  tenantId: "tenant-a",
  scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
  learningRecommendationFingerprint: "candidate-1",
  createdAtMs: now,
  summaryGate: "ready",
  baselineStatus: "ready",
  stabilityStatus: "stable",
  results: [{ passed: true }, { passed: true }],
};
const digitalTwin = {
  tenantId: "tenant-a",
  status: "ready",
  candidateFingerprint: "candidate-1",
  candidateRunId: "evaluation-run-1",
  createdAtMs: now + 1,
};

test("promove somente evidencia ligada a bateria completa, estavel e sem regressao", () => {
  const verdict = evaluateTenantLearningPromotion({ tenantId: "tenant-a", fingerprint: "candidate-1", nowMs: now, recommendation, evaluation, digitalTwin });
  assert.equal(verdict.ready, true);
  assert.deepEqual(verdict.reasons, []);
});

test("bloqueia prova de outro tenant, sem estabilidade ou com fingerprint antigo", () => {
  const verdict = evaluateTenantLearningPromotion({
    tenantId: "tenant-a",
    fingerprint: "candidate-1",
    nowMs: now,
    recommendation,
    evaluation: { ...evaluation, tenantId: "tenant-b", learningRecommendationFingerprint: "old", stabilityStatus: "insufficient" },
    digitalTwin,
  });
  assert.equal(verdict.ready, false);
  assert.ok(verdict.reasons.includes("tenant_da_avaliacao_invalido"));
  assert.ok(verdict.reasons.includes("avaliacao_nao_vinculada_a_recomendacao"));
  assert.ok(verdict.reasons.includes("resultado_nao_estavel"));
});

test("bloqueia amostra vencida, pouca diversidade e qualquer cenario reprovado", () => {
  const verdict = evaluateTenantLearningPromotion({
    tenantId: "tenant-a",
    fingerprint: "candidate-1",
    nowMs: now,
    recommendation: { ...recommendation, sampleSize: 2, distinctRelationships: 1, expiresAtMs: now - 1 },
    evaluation: { ...evaluation, results: [{ passed: true }, { passed: false }] },
    digitalTwin,
  });
  assert.equal(verdict.ready, false);
  assert.ok(verdict.reasons.includes("amostra_insuficiente"));
  assert.ok(verdict.reasons.includes("diversidade_insuficiente"));
  assert.ok(verdict.reasons.includes("recomendacao_expirada"));
  assert.ok(verdict.reasons.includes("cenario_reprovado"));
});

test("bloqueia promocao sem gemeo digital pronto e ligado ao mesmo candidato", () => {
  const missing = evaluateTenantLearningPromotion({ tenantId: "tenant-a", fingerprint: "candidate-1", nowMs: now, recommendation, evaluation, digitalTwin: null });
  assert.ok(missing.reasons.includes("gemeo_digital_ausente"));
  const mismatched = evaluateTenantLearningPromotion({
    tenantId: "tenant-a",
    fingerprint: "candidate-1",
    nowMs: now,
    recommendation,
    evaluation,
    digitalTwin: { ...digitalTwin, status: "blocked", candidateFingerprint: "old", candidateRunId: "other" },
  });
  assert.ok(mismatched.reasons.includes("gemeo_digital_bloqueado"));
  assert.ok(mismatched.reasons.includes("gemeo_nao_vinculado_a_recomendacao"));
  assert.ok(mismatched.reasons.includes("execucao_candidata_do_gemeo_invalida"));
});
