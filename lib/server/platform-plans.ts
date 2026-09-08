import "server-only";

import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  DEFAULT_PLATFORM_PLANS,
  isPlatformPlanId,
  type PlatformPlan,
  type PlatformPlanId,
} from "@/lib/platform-plans";

function normalizePlan(id: PlatformPlanId, value: Record<string, unknown>): PlatformPlan {
  const fallback = DEFAULT_PLATFORM_PLANS.find((plan) => plan.id === id)!;
  const currentCatalog = value.catalogVersion === fallback.catalogVersion;
  const price = value.monthlyPrice === null ? null : Number(value.monthlyPrice);
  return {
    id,
    catalogVersion: fallback.catalogVersion,
    name: fallback.name,
    promise: fallback.promise,
    description: fallback.description,
    monthlyPrice: currentCatalog && (price === null || (Number.isFinite(price) && price > 0)) ? price : fallback.monthlyPrice,
    pricePrefix: fallback.pricePrefix,
    setupFee: fallback.setupFee,
    setupMode: fallback.setupMode,
    setupLabel: fallback.setupLabel,
    features: [...fallback.features],
    featured: currentCatalog && typeof value.featured === "boolean" ? value.featured : fallback.featured,
    active: currentCatalog && typeof value.active === "boolean" ? value.active : fallback.active,
    checkoutEnabled: currentCatalog && typeof value.checkoutEnabled === "boolean" ? value.checkoutEnabled : fallback.checkoutEnabled,
    trialEligible: fallback.trialEligible,
    sortOrder: currentCatalog && Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : fallback.sortOrder,
    allowances: fallback.allowances,
    modules: fallback.modules,
    limits: fallback.limits,
  };
}

export async function listPlatformPlans(): Promise<PlatformPlan[]> {
  const snapshot = await adminDb.collection("platform_plans").get();
  const overrides = new Map(
    snapshot.docs
      .filter((doc) => isPlatformPlanId(doc.id))
      .map((doc) => [doc.id as PlatformPlanId, doc.data() as Record<string, unknown>])
  );
  return DEFAULT_PLATFORM_PLANS
    .map((fallback) => normalizePlan(fallback.id, overrides.get(fallback.id) || {}))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getPlatformPlan(id: unknown) {
  if (!isPlatformPlanId(id)) return null;
  return (await listPlatformPlans()).find((plan) => plan.id === id) || null;
}
