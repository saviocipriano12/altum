import type { TenantLimitMap, TenantModuleMap } from "@/lib/tenant-entitlements";
import {
  DEFAULT_PLATFORM_PLANS,
  PLATFORM_TRIAL_ACCESS,
  getDefaultPlatformPlan,
  type PlatformPlanId,
} from "@/lib/platform-plans";

export type PlatformPlanEntitlements = {
  modules: TenantModuleMap;
  limits: TenantLimitMap;
};

export const PLATFORM_PLAN_ENTITLEMENTS = Object.fromEntries(
  DEFAULT_PLATFORM_PLANS.map((plan) => [plan.id, { modules: plan.modules, limits: plan.limits }])
) as Record<PlatformPlanId, PlatformPlanEntitlements>;

export const PLATFORM_TRIAL_ENTITLEMENTS: PlatformPlanEntitlements = {
  modules: PLATFORM_TRIAL_ACCESS.modules,
  limits: PLATFORM_TRIAL_ACCESS.limits,
};

export function getPlatformPlanEntitlements(value: unknown): PlatformPlanEntitlements {
  const plan = getDefaultPlatformPlan(value) || getDefaultPlatformPlan("essencial")!;
  return { modules: plan.modules, limits: plan.limits };
}
