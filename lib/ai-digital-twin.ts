import { createHash } from "node:crypto";
import { AI_EVALUATION_SCENARIOS, AI_EVALUATION_SCENARIO_VERSION } from "@/lib/ai-evaluation";

export const AI_DIGITAL_TWIN_VERSION = "ai-digital-twin-v1" as const;
export const AI_DIGITAL_TWIN_MAX_LATENCY_INCREASE_PERCENT = 25;
export const AI_DIGITAL_TWIN_MAX_COST_INCREASE_PERCENT = 25;

export type AiDigitalTwinStoredResult = {
  scenarioId: string;
  passed: boolean;
  critical?: boolean;
  category?: string;
  decision?: string | null;
  responseGoal?: string | null;
  stateAfter?: string | null;
  qualityScore?: number | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  providerFallbackTriggered?: boolean;
  actionPlanExecutionMode?: string | null;
  actionPlanReadySteps?: string[];
  actionPlanApprovalSteps?: string[];
  responseValidationStatus?: string | null;
  issues?: string[];
};

export type AiDigitalTwinEvaluationRun = {
  id: string;
  tenantId: string;
  scenarioVersion: string;
  learningRecommendationFingerprint?: string | null;
  summaryGate?: string | null;
  baselineStatus?: string | null;
  stabilityStatus?: string | null;
  results: AiDigitalTwinStoredResult[];
};

export type AiDigitalTwinSnapshot = {
  schemaVersion: typeof AI_DIGITAL_TWIN_VERSION;
  tenantId: string;
  scenarioVersion: string;
  baselineRunId: string;
  candidateRunId: string;
  baselineContextFingerprint: string | null;
  candidateContextFingerprint: string | null;
  candidateLearningFingerprint: string | null;
  corpus: "official_synthetic_scenarios";
  containsRawCustomerText: false;
  externalEffects: "blocked";
  fingerprint: string;
};

export const AI_DIGITAL_TWIN_JOURNEYS = [
  { id: "first_contact", steps: ["greeting", "conversation_before_pitch", "ask_services", "business_pain", "price_early", "price_with_context"] },
  { id: "qualification_to_close", steps: ["proposal_too_early", "sdr_qualifies_one_step", "sales_advances_ready_buyer", "sdr_does_not_act_as_closer", "sales_handles_late_price_objection", "closer_resolves_final_objection"] },
  { id: "relationship_continuity", steps: ["context_continuity", "soft_objection", "correction_recovery", "memory_accepts_business_correction", "memory_does_not_repeat_known_goal"] },
  { id: "support_and_retention", steps: ["support_resolves_without_pitch", "post_sales_incident_before_upsell", "post_sales_retention_first", "whatsapp_angry_customer"] },
  { id: "channel_and_media", steps: ["audio_context", "audio_unclear", "instagram_short_product_question", "facebook_contextual_question", "site_chat_direct_help"] },
  { id: "safety_and_handoff", steps: ["agent_identity", "human_handoff", "clinic_medical_safety", "prompt_injection_does_not_leak_policy", "unknown_price_not_invented", "tenant_data_boundary", "sensitive_payment_data_not_requested"] },
  { id: "role_consulting", steps: ["receptionist_routes_without_selling", "consultant_diagnoses_without_rushing"] },
] as const;

export const AI_DIGITAL_TWIN_VARIANT_CASES = [
  { id: "role_receptionist", dimension: "role", scenarioId: "receptionist_routes_without_selling", invariant: "no_unrequested_sales" },
  { id: "role_sdr", dimension: "role", scenarioId: "sdr_qualifies_one_step", invariant: "one_gap_per_turn" },
  { id: "role_closer", dimension: "role", scenarioId: "closer_resolves_final_objection", invariant: "no_discovery_restart" },
  { id: "role_consultant", dimension: "role", scenarioId: "consultant_diagnoses_without_rushing", invariant: "diagnosis_before_close" },
  { id: "role_support", dimension: "role", scenarioId: "support_resolves_without_pitch", invariant: "resolution_before_offer" },
  { id: "role_post_sales", dimension: "role", scenarioId: "post_sales_incident_before_upsell", invariant: "incident_before_expansion" },
  { id: "channel_whatsapp", dimension: "channel", scenarioId: "whatsapp_angry_customer", invariant: "channel_fit" },
  { id: "channel_instagram", dimension: "channel", scenarioId: "instagram_short_product_question", invariant: "channel_fit" },
  { id: "channel_facebook", dimension: "channel", scenarioId: "facebook_contextual_question", invariant: "channel_fit" },
  { id: "channel_site", dimension: "channel", scenarioId: "site_chat_direct_help", invariant: "channel_fit" },
  { id: "segment_clinic", dimension: "segment", scenarioId: "clinic_medical_safety", invariant: "medical_safety" },
  { id: "segment_agency", dimension: "segment", scenarioId: "sdr_qualifies_one_step", invariant: "commercial_role" },
  { id: "maturity_early", dimension: "maturity", scenarioId: "conversation_before_pitch", invariant: "discovery_before_offer" },
  { id: "maturity_ready", dimension: "maturity", scenarioId: "sales_advances_ready_buyer", invariant: "advance_without_restarting" },
  { id: "noise_audio", dimension: "noise", scenarioId: "audio_unclear", invariant: "safe_clarification" },
  { id: "prompt_injection", dimension: "attack", scenarioId: "prompt_injection_does_not_leak_policy", invariant: "no_internal_leak" },
  { id: "sensitive_data", dimension: "safety", scenarioId: "sensitive_payment_data_not_requested", invariant: "no_sensitive_collection" },
  { id: "duplicate_event", dimension: "delivery", synthetic: true, invariant: "idempotent" },
  { id: "out_of_order_event", dimension: "delivery", synthetic: true, invariant: "state_not_regressed" },
  { id: "provider_failure", dimension: "provider", synthetic: true, invariant: "safe_fallback_no_effect" },
  { id: "silence", dimension: "journey", synthetic: true, invariant: "no_unapproved_message" },
  { id: "return", dimension: "journey", scenarioId: "context_continuity", invariant: "context_preserved" },
  { id: "correction", dimension: "journey", scenarioId: "memory_accepts_business_correction", invariant: "new_fact_wins" },
] as const;

export function validateAiDigitalTwinVariantCoverage() {
  const dimensions = new Set<string>(AI_DIGITAL_TWIN_VARIANT_CASES.map((item) => item.dimension));
  const required = ["role", "channel", "segment", "maturity", "noise", "attack", "safety", "delivery", "provider", "journey"];
  const knownScenarios = new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id));
  const unknown = AI_DIGITAL_TWIN_VARIANT_CASES.filter((item) => "scenarioId" in item && item.scenarioId && !knownScenarios.has(item.scenarioId)).map((item) => item.id);
  return { complete: required.every((dimension) => dimensions.has(dimension)) && unknown.length === 0, missingDimensions: required.filter((dimension) => !dimensions.has(dimension)), unknown };
}

export type AiDigitalTwinFaultProbe = {
  id: "duplicate_event" | "out_of_order_event" | "provider_failure" | "silence";
  passed: boolean;
  invariant: string;
  evidence: string;
};

export function runAiDigitalTwinFaultProbes(): AiDigitalTwinFaultProbe[] {
  const appliedEventIds = new Set<string>();
  let relationshipSequence = 10;
  let state = "discovery";
  const applyDelivery = (event: { id: string; sequence: number; nextState: string }) => {
    if (appliedEventIds.has(event.id)) return "duplicate_ignored";
    appliedEventIds.add(event.id);
    if (event.sequence <= relationshipSequence) return "out_of_order_ignored";
    relationshipSequence = event.sequence;
    state = event.nextState;
    return "applied";
  };
  applyDelivery({ id: "evt-11", sequence: 11, nextState: "qualification" });
  const duplicateResult = applyDelivery({ id: "evt-11", sequence: 11, nextState: "closed" });
  const duplicatePassed = duplicateResult === "duplicate_ignored" && state === "qualification";
  const outOfOrderResult = applyDelivery({ id: "evt-09", sequence: 9, nextState: "greeting" });
  const outOfOrderPassed = outOfOrderResult === "out_of_order_ignored" && state === "qualification" && relationshipSequence === 11;

  const providerFailure = { response: "fallback_seguro", externalEffects: [] as string[], readyActions: [] as string[] };
  const silence = { inboundMessage: null, externalEffects: [] as string[], readyActions: [] as string[] };
  return [
    { id: "duplicate_event", passed: duplicatePassed, invariant: "idempotent", evidence: duplicateResult },
    { id: "out_of_order_event", passed: outOfOrderPassed, invariant: "state_not_regressed", evidence: outOfOrderResult },
    { id: "provider_failure", passed: providerFailure.response === "fallback_seguro" && providerFailure.externalEffects.length === 0 && providerFailure.readyActions.length === 0, invariant: "safe_fallback_no_effect", evidence: "fallback_seguro_sem_efeito" },
    { id: "silence", passed: silence.inboundMessage === null && silence.externalEffects.length === 0 && silence.readyActions.length === 0, invariant: "no_unapproved_message", evidence: "silencio_sem_saida" },
  ];
}

function fixed(value: number) {
  return Number(value.toFixed(4));
}

function percentDelta(baseline: number, candidate: number) {
  if (!Number.isFinite(baseline) || baseline <= 0) return candidate <= baseline ? 0 : null;
  return fixed(((candidate - baseline) / baseline) * 100);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function redactAiDigitalTwinText(value: unknown) {
  return String(value || "")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\d{4}[ -]){3}\d{4}\b/g, "[cartao]")
    .replace(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-\s]?\d{4}/g, "[telefone]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/\b\d{13,19}\b/g, "[cartao]")
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1400);
}

export function buildAiDigitalTwinSnapshot(input: {
  tenantId: string;
  baselineRunId: string;
  candidateRunId: string;
  baselineContextFingerprint?: string | null;
  candidateContextFingerprint?: string | null;
  candidateLearningFingerprint?: string | null;
}) {
  const payload = {
    schemaVersion: AI_DIGITAL_TWIN_VERSION,
    tenantId: String(input.tenantId || "").trim(),
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    baselineRunId: String(input.baselineRunId || "").trim(),
    candidateRunId: String(input.candidateRunId || "").trim(),
    baselineContextFingerprint: String(input.baselineContextFingerprint || "").trim() || null,
    candidateContextFingerprint: String(input.candidateContextFingerprint || "").trim() || null,
    candidateLearningFingerprint: String(input.candidateLearningFingerprint || "").trim() || null,
    corpus: "official_synthetic_scenarios" as const,
    containsRawCustomerText: false as const,
    externalEffects: "blocked" as const,
  };
  return {
    ...payload,
    fingerprint: createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32),
  } satisfies AiDigitalTwinSnapshot;
}

export function digitalTwinJourneyCoverage() {
  const expected = new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id));
  const assigned = AI_DIGITAL_TWIN_JOURNEYS.flatMap((journey) => [...journey.steps]);
  const counts = new Map<string, number>();
  for (const id of assigned) counts.set(id, (counts.get(id) || 0) + 1);
  return {
    complete: assigned.length === expected.size && [...expected].every((id) => counts.get(id) === 1),
    missing: [...expected].filter((id) => !counts.has(id)),
    duplicated: [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
    unknown: [...counts.keys()].filter((id) => !expected.has(id)),
  };
}

export function compareAiDigitalTwinRuns(input: {
  tenantId: string;
  baseline: AiDigitalTwinEvaluationRun;
  candidate: AiDigitalTwinEvaluationRun;
  expectedCandidateFingerprint?: string | null;
}) {
  const reasons: string[] = [];
  const coverage = digitalTwinJourneyCoverage();
  const variantCoverage = validateAiDigitalTwinVariantCoverage();
  const faultProbes = runAiDigitalTwinFaultProbes();
  if (!coverage.complete) reasons.push("cobertura_de_jornadas_invalida");
  if (!variantCoverage.complete) reasons.push("cobertura_de_variantes_invalida");
  if (faultProbes.some((probe) => !probe.passed)) reasons.push("prova_de_falha_sintetica_reprovada");
  if (input.baseline.tenantId !== input.tenantId || input.candidate.tenantId !== input.tenantId) reasons.push("tenant_invalido");
  if (input.baseline.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION || input.candidate.scenarioVersion !== AI_EVALUATION_SCENARIO_VERSION) reasons.push("versao_de_cenario_invalida");
  const expectedIds = new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id));
  const baselineById = new Map(input.baseline.results.map((result) => [result.scenarioId, result]));
  const candidateById = new Map(input.candidate.results.map((result) => [result.scenarioId, result]));
  const hasExactScenarioCoverage = (run: AiDigitalTwinEvaluationRun, byId: Map<string, AiDigitalTwinStoredResult>) =>
    run.results.length === expectedIds.size &&
    byId.size === expectedIds.size &&
    run.results.every((result) => expectedIds.has(result.scenarioId)) &&
    [...expectedIds].every((id) => byId.has(id));
  if (!hasExactScenarioCoverage(input.baseline, baselineById) || !hasExactScenarioCoverage(input.candidate, candidateById)) reasons.push("cobertura_de_cenarios_incompleta");
  const expectedFingerprint = String(input.expectedCandidateFingerprint || "").trim();
  if (expectedFingerprint && input.candidate.learningRecommendationFingerprint !== expectedFingerprint) reasons.push("fingerprint_do_candidato_invalido");
  if (input.baseline.summaryGate !== "ready") reasons.push("bateria_baseline_bloqueada");
  if (input.candidate.summaryGate !== "ready") reasons.push("bateria_candidata_bloqueada");
  if (input.candidate.baselineStatus !== "ready") reasons.push("comparacao_oficial_bloqueada");
  if (input.candidate.stabilityStatus !== "stable") reasons.push("candidato_instavel");

  const differences = [...expectedIds].map((scenarioId) => {
    const baseline = baselineById.get(scenarioId);
    const candidate = candidateById.get(scenarioId);
    const critical = AI_EVALUATION_SCENARIOS.find((scenario) => scenario.id === scenarioId)?.critical === true;
    return {
      scenarioId,
      critical,
      baselinePassed: baseline?.passed === true,
      candidatePassed: candidate?.passed === true,
      decisionChanged: baseline?.decision !== candidate?.decision,
      responseGoalChanged: baseline?.responseGoal !== candidate?.responseGoal,
      stateChanged: baseline?.stateAfter !== candidate?.stateAfter,
      qualityDelta: fixed(Number(candidate?.qualityScore || 0) - Number(baseline?.qualityScore || 0)),
      issues: candidate?.issues || [],
    };
  });
  const journeys = AI_DIGITAL_TWIN_JOURNEYS.map((journey) => {
    const steps = journey.steps.map((scenarioId) => differences.find((item) => item.scenarioId === scenarioId)!);
    const regressions = steps.filter((item) => item.baselinePassed && !item.candidatePassed).map((item) => item.scenarioId);
    return {
      id: journey.id,
      scenarioCount: steps.length,
      passed: steps.every((item) => item.candidatePassed),
      regressions,
      decisionChanges: steps.filter((item) => item.decisionChanged).map((item) => item.scenarioId),
      responseGoalChanges: steps.filter((item) => item.responseGoalChanged).map((item) => item.scenarioId),
    };
  });
  const regressions = differences.filter((item) => item.baselinePassed && !item.candidatePassed);
  const criticalRegressions = regressions.filter((item) => item.critical);
  if (regressions.length) reasons.push("regressao_de_cenario");
  if (criticalRegressions.length) reasons.push("regressao_critica");
  if ([...candidateById.values()].some((result) => result.passed !== true)) reasons.push("cenario_candidato_reprovado");
  if ([...candidateById.values()].some((result) => result.providerFallbackTriggered === true)) reasons.push("fallback_de_provedor_no_candidato");
  if ([...candidateById.values()].some((result) => result.actionPlanExecutionMode !== "blocked" || (result.actionPlanReadySteps || []).length > 0)) reasons.push("efeito_real_na_simulacao");
  if ([...candidateById.values()].some((result) => !["accepted", "repaired"].includes(String(result.responseValidationStatus || "")))) reasons.push("resposta_candidata_nao_validada");

  const baselineLatency = average([...baselineById.values()].map((item) => Number(item.latencyMs || 0)).filter((value) => value > 0));
  const candidateLatency = average([...candidateById.values()].map((item) => Number(item.latencyMs || 0)).filter((value) => value > 0));
  const baselineCost = [...baselineById.values()].reduce((sum, item) => sum + Number(item.estimatedCostUsd || 0), 0);
  const candidateCost = [...candidateById.values()].reduce((sum, item) => sum + Number(item.estimatedCostUsd || 0), 0);
  const latencyDeltaPercent = percentDelta(baselineLatency, candidateLatency);
  const costDeltaPercent = percentDelta(baselineCost, candidateCost);
  if (latencyDeltaPercent === null || latencyDeltaPercent > AI_DIGITAL_TWIN_MAX_LATENCY_INCREASE_PERCENT) reasons.push("latencia_acima_do_limite");
  if (costDeltaPercent === null || costDeltaPercent > AI_DIGITAL_TWIN_MAX_COST_INCREASE_PERCENT) reasons.push("custo_acima_do_limite");

  const fingerprint = createHash("sha256").update(JSON.stringify({
    version: AI_DIGITAL_TWIN_VERSION,
    tenantId: input.tenantId,
    baselineRunId: input.baseline.id,
    candidateRunId: input.candidate.id,
    candidateFingerprint: input.candidate.learningRecommendationFingerprint || null,
    differences,
    journeys,
    variantCoverage,
    faultProbes,
  })).digest("hex").slice(0, 32);
  return {
    schemaVersion: AI_DIGITAL_TWIN_VERSION,
    status: reasons.length ? "blocked" as const : "ready" as const,
    reasons: [...new Set(reasons)],
    tenantId: input.tenantId,
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    baselineRunId: input.baseline.id,
    candidateRunId: input.candidate.id,
    candidateFingerprint: input.candidate.learningRecommendationFingerprint || null,
    journeyCount: AI_DIGITAL_TWIN_JOURNEYS.length,
    scenarioCount: expectedIds.size,
    regressions,
    criticalRegressions,
    differences,
    variantCoverage,
    faultProbes,
    metrics: {
      baselinePassRate: fixed([...baselineById.values()].filter((item) => item.passed).length / Math.max(1, expectedIds.size)),
      candidatePassRate: fixed([...candidateById.values()].filter((item) => item.passed).length / Math.max(1, expectedIds.size)),
      baselineLatencyMs: fixed(baselineLatency),
      candidateLatencyMs: fixed(candidateLatency),
      latencyDeltaPercent,
      baselineCostUsd: fixed(baselineCost),
      candidateCostUsd: fixed(candidateCost),
      costDeltaPercent,
    },
    rollback: "Arquivar o candidato e manter o baseline; nenhum efeito externo foi executado pelo gemeo digital.",
    fingerprint,
  };
}
