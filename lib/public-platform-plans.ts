import {
  DEFAULT_PLATFORM_PLANS,
  type PlatformPlan,
} from "@/lib/platform-plans";

const PUBLIC_PLAN_IDS = ["operacao", "escala", "estrutura_assistida"] as const;

// Marketing selection is independent of existing subscriptions and billing IDs.
export function selectPublicPlatformPlans(
  plans: readonly PlatformPlan[],
): PlatformPlan[] {
  return PUBLIC_PLAN_IDS.flatMap((id) => {
    const plan = plans.find((item) => item.id === id);
    return plan ? [{ ...plan, featured: id === "escala" }] : [];
  });
}

export const PUBLIC_PLATFORM_PLANS = selectPublicPlatformPlans(
  DEFAULT_PLATFORM_PLANS,
);
