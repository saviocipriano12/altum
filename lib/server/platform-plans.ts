import "server-only";

import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  DEFAULT_PLATFORM_PLANS,
  isPlatformPlanId,
  type PlatformPlan,
  type PlatformPlanId,
} from "@/lib/platform-plans";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizePlan(id: PlatformPlanId, value: Record<string, unknown>): PlatformPlan {
  const fallback = DEFAULT_PLATFORM_PLANS.find((plan) => plan.id === id)!;
  const price = value.monthlyPrice === null ? null : Number(value.monthlyPrice);
  return {
    id,
    name: clean(value.name, 80) || fallback.name,
    description: clean(value.description, 400) || fallback.description,
    monthlyPrice: price === null || (Number.isFinite(price) && price > 0) ? price : fallback.monthlyPrice,
    features: Array.isArray(value.features)
      ? value.features.map((item) => clean(item, 120)).filter(Boolean).slice(0, 12)
      : [...fallback.features],
    featured: typeof value.featured === "boolean" ? value.featured : fallback.featured,
    active: typeof value.active === "boolean" ? value.active : fallback.active,
    checkoutEnabled: typeof value.checkoutEnabled === "boolean" ? value.checkoutEnabled : fallback.checkoutEnabled,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : fallback.sortOrder,
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
