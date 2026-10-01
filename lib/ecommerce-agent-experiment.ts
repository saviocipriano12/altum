import type { EcommerceAgentExperiment } from "@/lib/ecommerce-agent-policy";

export type EcommerceVersionMetrics = {
  version: string;
  sent: number;
  failures: number;
  mature: number;
  conversions: number;
  revenue: number;
};

export function wilsonInterval(successes: number, total: number, z = 1.96) {
  if (total <= 0) return { low: 0, high: 1, rate: 0 };
  const rate = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = (rate + (z * z) / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((rate * (1 - rate) + (z * z) / (4 * total)) / total)) / denominator;
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin), rate };
}

export function evaluateEcommerceExperiment(input: {
  champion: EcommerceVersionMetrics;
  challenger: EcommerceVersionMetrics;
  config: EcommerceAgentExperiment;
}) {
  const championConversion = wilsonInterval(input.champion.conversions, input.champion.mature);
  const challengerConversion = wilsonInterval(input.challenger.conversions, input.challenger.mature);
  const challengerFailure = wilsonInterval(input.challenger.failures, input.challenger.sent + input.challenger.failures);
  const enoughConversionSample = input.champion.mature >= input.config.minSampleSize && input.challenger.mature >= input.config.minSampleSize;
  const enoughFailureSample = input.challenger.sent + input.challenger.failures >= input.config.minSampleSize;
  const relativeDrop = championConversion.rate > 0
    ? Math.max(0, (championConversion.rate - challengerConversion.rate) / championConversion.rate)
    : 0;
  const failureRegression = enoughFailureSample && challengerFailure.low > input.config.maxFailureRate;
  const conversionRegression = enoughConversionSample
    && relativeDrop >= input.config.maxRelativeConversionDrop
    && challengerConversion.high < championConversion.low;
  const promotionCandidate = enoughConversionSample
    && challengerConversion.low > championConversion.high
    && challengerConversion.rate > championConversion.rate;
  const status = failureRegression || conversionRegression
    ? "rollback"
    : promotionCandidate
      ? "promotion_candidate"
      : enoughConversionSample || enoughFailureSample
        ? "healthy"
        : "insufficient_sample";
  return {
    status,
    shouldRollback: status === "rollback" && input.config.autoRollback,
    reason: failureRegression ? "failure_rate_regression" : conversionRegression ? "conversion_regression" : promotionCandidate ? "conversion_lift" : status,
    relativeDrop,
    championConversion,
    challengerConversion,
    challengerFailure,
    enoughConversionSample,
    enoughFailureSample,
  };
}
