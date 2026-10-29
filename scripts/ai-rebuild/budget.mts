import type { CorpusCase } from "../../tests/fixtures/ai-rebuild-corpus-types.mts";

// Checked in official model/pricing documentation on 2026-10-19. This is a
// planning rate card, not an account entitlement or permission to call the API.
export const EVALUATION_CANDIDATE = {
  model: "gpt-4.1-mini-2025-04-14", pricingModel: "gpt-4.1-mini", serviceTier: "standard", currency: "USD",
  inputUsdPerMillion: 0.4, outputUsdPerMillion: 1.6,
  maxShortContextTokens: 272000, checkedOn: "2026-10-19",
  pricingSource: "https://developers.openai.com/api/docs/pricing",
  modelSource: "https://developers.openai.com/api/docs/models/gpt-4.1-mini",
} as const;
export const EVALUATION_SPEND_AUTHORIZATION = {
  approvedCumulativeCapUsd: 3, approvedOn: "2026-10-19", source: "Direct user reply: pode usar apenas 3 dolares",
  scope: "Initial development tests with synthetic Shopify data; no real customer sends, purchases or inventory changes.",
  requiresDurableReservationBeforeAnyPaidCall: true,
  fullEvaluationAuthorized: false,
} as const;
export function estimateEvaluationBudget(cases: CorpusCase[], assumptions: {
  callsPerCustomerTurn: number; inputTokensPerCall: number; outputTokensPerCall: number; marginPercent: number;
}) {
  for (const value of Object.values(assumptions)) if (!Number.isFinite(value) || value < 0) throw new Error("Premissa de custo invalida.");
  if (assumptions.callsPerCustomerTurn < 1 || assumptions.inputTokensPerCall < 1 || assumptions.outputTokensPerCall < 1 ||
    assumptions.inputTokensPerCall > EVALUATION_CANDIDATE.maxShortContextTokens) throw new Error("Premissa fora do modelo de preco suportado.");
  const executions = cases.reduce((sum, item) => sum + (item.critical ? 5 : 3), 0);
  const customerTurns = cases.reduce((sum, item) => sum + item.scenario.turns.length * (item.critical ? 5 : 3), 0);
  const calls = Math.ceil(customerTurns * assumptions.callsPerCustomerTurn);
  const rawUsd = calls * (assumptions.inputTokensPerCall * EVALUATION_CANDIDATE.inputUsdPerMillion +
    assumptions.outputTokensPerCall * EVALUATION_CANDIDATE.outputUsdPerMillion) / 1_000_000;
  return { model: EVALUATION_CANDIDATE.model, executions, customerTurns, calls, assumptions,
    estimatedUsd: Math.ceil(rawUsd * 100) / 100,
    withMarginUsd: Math.ceil(rawUsd * (1 + assumptions.marginPercent / 100) * 100) / 100,
    paidCallsAuthorized: false, measuredUsage: false,
    excludes: ["hosting", "channel_provider_fees", "embeddings", "paid_evaluator", "human_review"],
    boundary: "Estimate only. No cache discount, regional/priority surcharge or long-context pricing assumed; recheck rate card before execution." };
}
