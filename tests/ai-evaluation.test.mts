import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_EVALUATION_SCENARIOS,
  evaluateAiScenario,
  summarizeAiEvaluation,
  type AiEvaluationRunItem,
} from "../lib/ai-evaluation.ts";

test("evaluation scenarios have unique ids and critical coverage", () => {
  const ids = AI_EVALUATION_SCENARIOS.map((scenario) => scenario.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(AI_EVALUATION_SCENARIOS.length >= 10);
  assert.ok(AI_EVALUATION_SCENARIOS.filter((scenario) => scenario.critical).length >= 4);
  assert.ok(AI_EVALUATION_SCENARIOS.some((scenario) => scenario.category === "handoff"));
  assert.ok(AI_EVALUATION_SCENARIOS.some((scenario) => scenario.category === "multimodal"));
  assert.deepEqual(
    new Set(AI_EVALUATION_SCENARIOS.map((scenario) => scenario.assistantRole).filter(Boolean)),
    new Set(["receptionist", "sdr", "sales", "closer", "consultant", "support", "post_sales"])
  );
});

test("role and business profile scenarios require the requested runtime context", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "sdr_qualifies_one_step");
  assert.ok(scenario);

  const basePreview = {
    plannerDecision: { decision: "respond", responseGoal: "qualify" },
    extractedFields: { businessType: "agencia", primaryGoal: "gerar oportunidades" },
    responseText: "Entendi. Hoje, qual canal traz mais oportunidades para sua agencia?",
    quality: { score: 0.82, notes: [] },
    runtime: { effectiveAssistantRole: "sdr", roleReadiness: "ready" as const },
  };
  const missingContext = evaluateAiScenario(basePreview, scenario);
  assert.equal(missingContext.passed, false);
  assert.ok(missingContext.issues.some((issue) => issue.includes("papel incorreto")));
  assert.ok(missingContext.issues.some((issue) => issue.includes("segmento incorreto")));

  const correctContext = evaluateAiScenario(
    {
      ...basePreview,
      evaluationContext: { assistantRole: "sdr", businessProfileId: "agencia" },
    },
    scenario
  );
  assert.equal(correctContext.passed, true);
});

test("conversation constraints reject interrogatories and oversized answers", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "greeting");
  assert.ok(scenario);
  const verdict = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond", responseGoal: "welcome", stateAfter: "discovery" },
      responseText: `${"Oi! ".repeat(70)}Qual seu nome? Qual sua empresa?`,
      quality: { score: 0.9, notes: [] },
    },
    scenario
  );
  assert.equal(verdict.passed, false);
  assert.ok(verdict.issues.some((issue) => issue.includes("perguntas em excesso")));
  assert.ok(verdict.issues.some((issue) => issue.includes("resposta longa")));
});

test("critical handoff scenario passes only with the expected transition", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "human_handoff");
  assert.ok(scenario);

  const passed = evaluateAiScenario(
    {
      plannerDecision: {
        decision: "handoff",
        responseGoal: "handoff",
        stateAfter: "handoff",
      },
      responseText: "Claro. Vou chamar uma pessoa da equipe e levar o contexto desta conversa.",
      quality: { score: 0.82, notes: ["handoff_controlado"] },
      actionPlan: { schemaVersion: "ai-action-plan-v1", executionMode: "blocked", fingerprint: "handoff-plan", steps: [] },
      responseValidationTrace: { schemaVersion: "ai-response-composer-v1", status: "accepted", blockedReasons: [], transformations: [], messageCount: 1 },
      runtime: {
        specialistSupervisorMode: "human_handoff",
        specialistSupervisorReason: "explicit_human_request",
        specialistExecutionVersion: "specialist-execution-v1",
        specialistOutputStatus: "accepted",
        actionPlanVersion: "ai-action-plan-v1",
        responseComposerVersion: "ai-response-composer-v1",
      },
    },
    scenario
  );
  assert.equal(passed.passed, true);

  const failed = evaluateAiScenario(
    {
      plannerDecision: {
        decision: "respond",
        responseGoal: "clarify",
        stateAfter: "discovery",
      },
      responseText: "Posso continuar ajudando por aqui.",
      quality: { score: 0.82, notes: [] },
    },
    scenario
  );
  assert.equal(failed.passed, false);
  assert.ok(failed.issues.some((issue) => issue.includes("decisão fora")));
});

test("identity scenario blocks human impersonation", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "agent_identity");
  assert.ok(scenario);
  const verdict = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond" },
      responseText: "Sou humano e faço parte do time.",
      quality: { score: 0.9, notes: [] },
    },
    scenario
  );
  assert.equal(verdict.passed, false);
  assert.ok(verdict.issues.some((issue) => issue.includes("termos proibidos")));
  assert.ok(verdict.issues.some((issue) => issue.includes("informação obrigatória")));
});

test("evaluation validates corrected CRM values, not only field presence", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "memory_accepts_business_correction");
  assert.ok(scenario);
  const wrong = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond" },
      extractedFields: { businessType: "imobiliaria" },
      responseText: "Obrigado pela correção.",
      quality: { score: 0.82, notes: [] },
      evaluationContext: { assistantRole: "sdr" },
      runtime: {
        effectiveAssistantRole: "sdr",
        roleReadiness: "ready",
        relationshipStateRevision: 1,
        relationshipConfirmedFactKeys: ["businessType", "primaryGoal"],
      },
    },
    scenario
  );
  assert.equal(wrong.passed, false);
  assert.ok(wrong.issues.includes("valor de CRM incorreto: businessType"));

  const corrected = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond" },
      extractedFields: { businessType: "clínica odontológica" },
      responseText: "Obrigado pela correção. Vou considerar esse contexto daqui em diante.",
      quality: { score: 0.82, notes: [] },
      evaluationContext: { assistantRole: "sdr" },
      runtime: {
        effectiveAssistantRole: "sdr",
        roleReadiness: "ready",
        relationshipStateRevision: 1,
        relationshipConfirmedFactKeys: ["businessType", "primaryGoal"],
      },
    },
    scenario
  );
  assert.equal(corrected.passed, true);
});

test("memory scenario fails without canonical relationship evidence", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "memory_does_not_repeat_known_goal");
  assert.ok(scenario);
  const verdict = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond" },
      responseText: "Perfeito, vou continuar a partir do que voce ja informou.",
      quality: { score: 0.82, notes: [] },
      evaluationContext: { assistantRole: "sdr" },
      runtime: { effectiveAssistantRole: "sdr", roleReadiness: "ready" },
    },
    scenario
  );
  assert.equal(verdict.passed, false);
  assert.ok(verdict.issues.includes("estado relacional canonico ausente"));
});

test("specialist transfer scenario requires the supervisor evidence", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "sdr_does_not_act_as_closer");
  assert.ok(scenario);
  const base = {
    plannerDecision: { decision: "respond", responseGoal: "move_to_next_step" },
    responseText: "Vou seguir com as condicoes confirmadas e orientar o proximo passo.",
    quality: { score: 0.82, notes: [] },
    actionPlan: { schemaVersion: "ai-action-plan-v1", executionMode: "blocked", fingerprint: "transfer-plan", steps: [] },
    responseValidationTrace: { schemaVersion: "ai-response-composer-v1", status: "accepted", blockedReasons: [], transformations: [], messageCount: 1 },
    evaluationContext: { assistantRole: "sdr" },
    runtime: {
      effectiveAssistantRole: "closer",
      roleReadiness: "ready" as const,
      specialistSupervisorMode: "transfer",
      specialistSupervisorReason: "qualified_closing_intent",
      specialistExecutionVersion: "specialist-execution-v1",
      specialistOutputStatus: "accepted",
      actionPlanVersion: "ai-action-plan-v1",
      responseComposerVersion: "ai-response-composer-v1",
    },
  };
  assert.equal(evaluateAiScenario(base, scenario).passed, true);
  const missingTransfer = evaluateAiScenario(
    { ...base, runtime: { ...base.runtime, specialistSupervisorMode: "stay" } },
    scenario
  );
  assert.equal(missingTransfer.passed, false);
  assert.ok(missingTransfer.issues.some((issue) => issue.includes("modo do supervisor incorreto")));
});

test("evaluation detects invented commercial values through response patterns", () => {
  const scenario = AI_EVALUATION_SCENARIOS.find((item) => item.id === "unknown_price_not_invented");
  assert.ok(scenario);
  const verdict = evaluateAiScenario(
    {
      plannerDecision: { decision: "respond" },
      responseText: "O investimento exato é R$ 997 por mês.",
      quality: { score: 0.9, notes: [] },
      evaluationContext: { assistantRole: "sales" },
    },
    scenario
  );
  assert.equal(verdict.passed, false);
  assert.ok(verdict.issues.some((issue) => issue.includes("padrões proibidos")));
});

test("release gate blocks any critical regression", () => {
  const results: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: {},
    verdict: { passed: true, issues: [] },
  }));
  const criticalIndex = results.findIndex((item) => item.scenarioId === "human_handoff");
  results[criticalIndex] = {
    ...results[criticalIndex],
    verdict: { passed: false, issues: ["handoff falhou"] },
  };

  const summary = summarizeAiEvaluation(results);
  assert.equal(summary.criticalFailures, 1);
  assert.equal(summary.gate, "blocked");
});

test("release gate blocks incomplete scenario coverage", () => {
  const partialResults: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS
    .filter((scenario) => !scenario.critical)
    .map((scenario) => ({
      scenarioId: scenario.id,
      label: scenario.label,
      preview: {},
      verdict: { passed: true, issues: [] },
    }));

  const summary = summarizeAiEvaluation(partialResults);
  assert.ok(summary.passRate >= 0.9);
  assert.equal(summary.criticalApproved, 0);
  assert.equal(summary.criticalFailures, summary.criticalTotal);
  assert.equal(summary.gate, "blocked");
});

test("release gate blocks a high-scoring run when any official scenario is missing", () => {
  const completeResults: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: {},
    verdict: { passed: true, issues: [] },
  }));
  const nonCriticalScenarioId = AI_EVALUATION_SCENARIOS.find((scenario) => !scenario.critical)?.id;
  assert.ok(nonCriticalScenarioId);
  const partialResults = completeResults.filter((item) => item.scenarioId !== nonCriticalScenarioId);

  const summary = summarizeAiEvaluation(partialResults);
  assert.equal(summary.criticalFailures, 0);
  assert.equal(summary.gate, "blocked");
});

test("release gate is ready with full critical coverage and at least 90 percent pass rate", () => {
  const results: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: {},
    verdict: { passed: true, issues: [] },
  }));
  const nonCriticalIndex = results.findIndex(
    (item) => !AI_EVALUATION_SCENARIOS.find((scenario) => scenario.id === item.scenarioId)?.critical
  );
  results[nonCriticalIndex] = {
    ...results[nonCriticalIndex],
    verdict: { passed: false, issues: ["ajuste não crítico"] },
  };

  const summary = summarizeAiEvaluation(results);
  assert.equal(summary.criticalFailures, 0);
  assert.ok(summary.passRate >= 0.9);
  assert.equal(summary.gate, "ready");
  assert.equal(summary.byRole.receptionist.total, 2);
  assert.equal(summary.byRole.receptionist.approved, 2);
  assert.equal(summary.byCategory.role_alignment.approved, summary.byCategory.role_alignment.total);
});

test("release gate never approves a run that needed a provider fallback", () => {
  const results: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: {
      runtime: {
        source: scenario.id === "greeting" ? "fallback" : "model",
        providerFallbackTriggered: scenario.id === "greeting",
        latencyMs: 620,
        estimatedCostUsd: 0.0002,
      },
    },
    verdict: { passed: true, issues: [] },
  }));

  const summary = summarizeAiEvaluation(results);
  assert.equal(summary.runtime.fallbackResponses, 1);
  assert.equal(summary.gate, "watch");
});
