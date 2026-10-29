import { AI_EVALUATION_SCENARIO_VERSION } from "@/lib/ai-evaluation";
import {
  AI_LEARNING_MIN_RELATIONSHIPS,
  AI_LEARNING_MIN_SAMPLE,
  AI_TENANT_RECOMMENDATION_VERSION,
} from "@/lib/server/ai/learning-policy";

export const AI_LEARNING_APPROVAL_POLICY_VERSION = "ai-learning-approval-v1" as const;

export function evaluateTenantLearningPromotion(input: {
  tenantId: string;
  fingerprint: string;
  nowMs: number;
  recommendation: {
    tenantId?: unknown;
    status?: unknown;
    schemaVersion?: unknown;
    fingerprint?: unknown;
    sampleSize?: unknown;
    distinctRelationships?: unknown;
    confidence?: unknown;
    conflictRatio?: unknown;
    updatedAtMs?: number;
    expiresAtMs?: number;
  };
  evaluation: {
    runId?: unknown;
    tenantId?: unknown;
    scenarioVersion?: unknown;
    learningRecommendationFingerprint?: unknown;
    createdAtMs?: number;
    summaryGate?: unknown;
    baselineStatus?: unknown;
    stabilityStatus?: unknown;
    results?: Array<{ passed?: unknown }>;
  } | null;
  digitalTwin: {
    tenantId?: unknown;
    status?: unknown;
    candidateFingerprint?: unknown;
    candidateRunId?: unknown;
    createdAtMs?: number;
  } | null;
}) {
  const reasons: string[] = [];
  const recommendation = input.recommendation;
  const evaluation = input.evaluation;
  const digitalTwin = input.digitalTwin;
  if (recommendation.tenantId !== input.tenantId) reasons.push("tenant_da_recomendacao_invalido");
  if (recommendation.status !== "shadow") reasons.push("recomendacao_nao_esta_em_sombra");
  if (recommendation.schemaVersion !== AI_TENANT_RECOMMENDATION_VERSION) reasons.push("versao_da_recomendacao_invalida");
  if (recommendation.fingerprint !== input.fingerprint) reasons.push("fingerprint_da_recomendacao_invalido");
  if (Number(recommendation.sampleSize || 0) < AI_LEARNING_MIN_SAMPLE) reasons.push("amostra_insuficiente");
  if (Number(recommendation.distinctRelationships || 0) < AI_LEARNING_MIN_RELATIONSHIPS) reasons.push("diversidade_insuficiente");
  if (Number(recommendation.confidence || 0) < 0.62) reasons.push("confianca_insuficiente");
  if ((typeof recommendation.conflictRatio === "number" ? recommendation.conflictRatio : 1) > 0.35) reasons.push("conflito_excessivo");
  if (!recommendation.expiresAtMs || recommendation.expiresAtMs <= input.nowMs) reasons.push("recomendacao_expirada");
  if (!evaluation) reasons.push("avaliacao_ausente");
  if (evaluation) {
    if (evaluation.tenantId !== input.tenantId) reasons.push("tenant_da_avaliacao_invalido");
    if (evaluation.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION) reasons.push("versao_da_avaliacao_invalida");
    if (evaluation.learningRecommendationFingerprint !== input.fingerprint) reasons.push("avaliacao_nao_vinculada_a_recomendacao");
    if (!evaluation.createdAtMs || evaluation.createdAtMs < Number(recommendation.updatedAtMs || 0)) reasons.push("avaliacao_anterior_a_recomendacao");
    if (evaluation.summaryGate !== "ready") reasons.push("bateria_nao_aprovada");
    if (evaluation.baselineStatus !== "ready") reasons.push("regressao_ou_baseline_bloqueado");
    if (evaluation.stabilityStatus !== "stable") reasons.push("resultado_nao_estavel");
    if (!evaluation.results?.length || evaluation.results.some((result) => result.passed !== true)) reasons.push("cenario_reprovado");
  }
  if (!digitalTwin) reasons.push("gemeo_digital_ausente");
  if (digitalTwin) {
    if (digitalTwin.tenantId !== input.tenantId) reasons.push("tenant_do_gemeo_invalido");
    if (digitalTwin.status !== "ready") reasons.push("gemeo_digital_bloqueado");
    if (digitalTwin.candidateFingerprint !== input.fingerprint) reasons.push("gemeo_nao_vinculado_a_recomendacao");
    if (digitalTwin.candidateRunId !== evaluation?.runId) reasons.push("execucao_candidata_do_gemeo_invalida");
    if (!digitalTwin.createdAtMs || digitalTwin.createdAtMs < Number(recommendation.updatedAtMs || 0)) reasons.push("gemeo_anterior_a_recomendacao");
  }
  return {
    schemaVersion: AI_LEARNING_APPROVAL_POLICY_VERSION,
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
  };
}
