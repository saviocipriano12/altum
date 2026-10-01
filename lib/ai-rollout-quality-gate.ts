export type AiRolloutQualityGate = "ready" | "watch" | "blocked" | null;

export function canIncreaseAiConversationRollout(input: {
  currentPercent: number;
  nextPercent: number;
  mode: "automatic" | "shadow";
  latestQualityGate: AiRolloutQualityGate;
}) {
  const isIncrease = input.nextPercent > input.currentPercent;
  if (!isIncrease || input.mode === "shadow") {
    return { allowed: true, reason: "not_an_automatic_increase" as const };
  }
  if (input.latestQualityGate === "ready") {
    return { allowed: true, reason: "quality_gate_ready" as const };
  }
  return {
    allowed: false,
    reason: input.latestQualityGate === "watch" ? "quality_gate_watch" as const : "quality_gate_missing_or_blocked" as const,
  };
}

export function isAiEvaluationFreshForSettings(input: {
  evaluatedAtMs: number;
  settingsUpdatedAtMs: number;
}) {
  return input.evaluatedAtMs > 0 && (input.settingsUpdatedAtMs === 0 || input.evaluatedAtMs >= input.settingsUpdatedAtMs);
}
