import assert from "node:assert/strict";
import test from "node:test";
import { canIncreaseAiConversationRollout, isAiEvaluationFreshForSettings } from "../lib/ai-rollout-quality-gate.ts";

test("a proven ready evaluation is required to increase automatic conversation rollout", () => {
  assert.equal(canIncreaseAiConversationRollout({
    currentPercent: 0,
    nextPercent: 10,
    mode: "automatic",
    latestQualityGate: "ready",
  }).allowed, true);

  assert.equal(canIncreaseAiConversationRollout({
    currentPercent: 0,
    nextPercent: 10,
    mode: "automatic",
    latestQualityGate: "watch",
  }).allowed, false);
});

test("reducing or shadowing rollout never requires a quality gate", () => {
  assert.equal(canIncreaseAiConversationRollout({
    currentPercent: 100,
    nextPercent: 0,
    mode: "automatic",
    latestQualityGate: null,
  }).allowed, true);
  assert.equal(canIncreaseAiConversationRollout({
    currentPercent: 0,
    nextPercent: 100,
    mode: "shadow",
    latestQualityGate: null,
  }).allowed, true);
});

test("a quality evaluation becomes stale after the AI settings change", () => {
  assert.equal(isAiEvaluationFreshForSettings({ evaluatedAtMs: 200, settingsUpdatedAtMs: 100 }), true);
  assert.equal(isAiEvaluationFreshForSettings({ evaluatedAtMs: 100, settingsUpdatedAtMs: 101 }), false);
});
