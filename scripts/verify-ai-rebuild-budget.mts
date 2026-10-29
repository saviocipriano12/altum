import { evaluationCorpus } from "./ai-rebuild/corpus.mts";
import { EVALUATION_CANDIDATE, EVALUATION_SPEND_AUTHORIZATION, estimateEvaluationBudget } from "./ai-rebuild/budget.mts";
const cases = await evaluationCorpus({ includeHoldout: true });
console.log(JSON.stringify({ candidate: EVALUATION_CANDIDATE, authorization: EVALUATION_SPEND_AUTHORIZATION,
  planning: estimateEvaluationBudget(cases, { callsPerCustomerTurn: 2, inputTokensPerCall: 6000, outputTokensPerCall: 600, marginPercent: 25 }),
  stressEnvelope: estimateEvaluationBudget(cases, { callsPerCustomerTurn: 8, inputTokensPerCall: 24000, outputTokensPerCall: 2000, marginPercent: 25 }),
  proposal: { initialDevelopmentCapUsd: 3, approvedCumulativeCapUsd: 3,
    policy: "User approved only USD 3 cumulative, not USD 3 per run. No paid call before durable reservation; stop at cap even if coverage is incomplete. No automatic extension." } }, null, 2));
