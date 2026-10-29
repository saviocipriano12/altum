import test from "node:test";
import assert from "node:assert/strict";
import { developmentCorpus } from "../scripts/ai-rebuild/corpus.mts";
import { estimateEvaluationBudget, EVALUATION_CANDIDATE, EVALUATION_SPEND_AUTHORIZATION } from "../scripts/ai-rebuild/budget.mts";
test("budget includes repetitions, all turns and calls without authorizing a payment", () => {
  const result = estimateEvaluationBudget(developmentCorpus().slice(0, 1), { callsPerCustomerTurn: 2, inputTokensPerCall: 6000, outputTokensPerCall: 600, marginPercent: 25 });
  assert.equal(result.executions, 5); assert.equal(result.customerTurns, 20); assert.equal(result.calls, 40);
  assert.equal(result.estimatedUsd, 0.14); assert.equal(result.withMarginUsd, 0.17);
  assert.equal(result.paidCallsAuthorized, false); assert.equal(result.measuredUsage, false);
  assert.equal(EVALUATION_CANDIDATE.model, "gpt-4.1-mini-2025-04-14");
  assert.equal(EVALUATION_SPEND_AUTHORIZATION.approvedCumulativeCapUsd, 3);
  assert.equal(EVALUATION_SPEND_AUTHORIZATION.requiresDurableReservationBeforeAnyPaidCall, true);
  assert.equal(EVALUATION_SPEND_AUTHORIZATION.fullEvaluationAuthorized, false);
});
test("unsupported long context or invalid numeric assumptions cannot understate cost silently", () => {
  const assumptions = { callsPerCustomerTurn: 1, inputTokensPerCall: 6000, outputTokensPerCall: 600, marginPercent: 25 };
  for (const patch of [{ callsPerCustomerTurn: 0 }, { outputTokensPerCall: -1 }, { inputTokensPerCall: 300000 }, { marginPercent: NaN }]) {
    assert.throws(() => estimateEvaluationBudget(developmentCorpus(), { ...assumptions, ...patch }));
  }
});
