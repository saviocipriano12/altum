import assert from "node:assert/strict";
import test from "node:test";
import { buildAiEvaluationContextFingerprint } from "../lib/ai-evaluation-context.ts";

const items = [
  {
    scenarioId: "sdr",
    tenantContextFingerprint: "tenant-context-sdr",
    roleContractFingerprint: "role-sdr",
    effectiveAssistantRole: "sdr",
    specialistSupervisorVersion: "supervisor-v1",
    specialistExecutionVersion: "execution-v1",
    actionPlanVersion: "action-plan-v1",
    responseComposerVersion: "response-composer-v1",
  },
  {
    scenarioId: "closer",
    tenantContextFingerprint: "tenant-context-closer",
    roleContractFingerprint: "role-closer",
    effectiveAssistantRole: "closer",
    specialistSupervisorVersion: "supervisor-v1",
    specialistExecutionVersion: "execution-v1",
    actionPlanVersion: "action-plan-v1",
    responseComposerVersion: "response-composer-v1",
  },
];

test("fingerprint da bateria e estavel mesmo com papeis diferentes", () => {
  const first = buildAiEvaluationContextFingerprint(items);
  const reordered = buildAiEvaluationContextFingerprint([...items].reverse());
  assert.ok(first);
  assert.equal(first, reordered);
});

test("mudanca em qualquer contrato de papel invalida a prova da bateria", () => {
  const first = buildAiEvaluationContextFingerprint(items);
  const changed = buildAiEvaluationContextFingerprint([
    items[0],
    { ...items[1], roleContractFingerprint: "role-closer-v2" },
  ]);
  assert.notEqual(first, changed);
});

test("mudanca no supervisor ou na execucao especialista invalida a prova", () => {
  const first = buildAiEvaluationContextFingerprint(items);
  const supervisorChanged = buildAiEvaluationContextFingerprint([
    items[0],
    { ...items[1], specialistSupervisorVersion: "supervisor-v2" },
  ]);
  const executionChanged = buildAiEvaluationContextFingerprint([
    items[0],
    { ...items[1], specialistExecutionVersion: "execution-v2" },
  ]);
  const actionPlanChanged = buildAiEvaluationContextFingerprint([
    items[0],
    { ...items[1], actionPlanVersion: "action-plan-v2" },
  ]);
  const composerChanged = buildAiEvaluationContextFingerprint([
    items[0],
    { ...items[1], responseComposerVersion: "response-composer-v2" },
  ]);
  assert.notEqual(first, supervisorChanged);
  assert.notEqual(first, executionChanged);
  assert.notEqual(first, actionPlanChanged);
  assert.notEqual(first, composerChanged);
});

test("recomendacao de aprendizado em sombra participa da identidade da bateria", () => {
  const baseline = buildAiEvaluationContextFingerprint(items);
  const candidate = buildAiEvaluationContextFingerprint(items.map((item) => ({
    ...item,
    learningRecommendationFingerprint: "learning-candidate-v1",
  })));
  const anotherCandidate = buildAiEvaluationContextFingerprint(items.map((item) => ({
    ...item,
    learningRecommendationFingerprint: "learning-candidate-v2",
  })));
  assert.notEqual(baseline, candidate);
  assert.notEqual(candidate, anotherCandidate);
});

test("bateria sem evidencia completa de contrato nao recebe fingerprint", () => {
  assert.equal(
    buildAiEvaluationContextFingerprint([{ ...items[0], roleContractFingerprint: null }]),
    null
  );
});
