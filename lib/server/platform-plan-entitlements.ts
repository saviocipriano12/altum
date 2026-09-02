import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getPlatformPlanEntitlements } from "@/lib/platform-plan-entitlements";
import type { TenantEntitlementsSnapshot } from "@/lib/tenant-entitlements";

function timestampToMillis(value: unknown) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return Number((value as { toMillis: () => number }).toMillis());
  }
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasSameTrialAccess(current: Pick<TenantEntitlementsSnapshot, "modules" | "limits"> | null | undefined) {
  if (!current) return false;
  const expected = getPlatformPlanEntitlements("operacao");
  return Object.entries(expected.modules).every(([key, value]) => current.modules[key as keyof typeof current.modules] === value)
    && Object.entries(expected.limits).every(([key, value]) => current.limits[key as keyof typeof current.limits] === value);
}

export async function applyPlatformPlanEntitlements(input: {
  tenantId: string;
  planId: unknown;
  source: "trial" | "asaas_webhook" | "admin";
  actorId?: string;
  actorName?: string;
}) {
  const tenantId = String(input.tenantId || "").trim();
  if (!tenantId) throw new Error("Tenant obrigatorio para aplicar o plano.");
  const entitlements = getPlatformPlanEntitlements(input.planId);
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({
    version: 1,
    tenantId,
    mode: "custom",
    modules: entitlements.modules,
    limits: entitlements.limits,
    entitlementSource: input.source,
    platformPlan: String(input.planId || "essencial"),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.actorId || input.source,
    updatedByName: input.actorName || input.source,
  }, { merge: true });
  return entitlements;
}

export async function ensureActiveTrialFullAccess(input: {
  tenantId: string;
  tenantData?: Record<string, unknown>;
  currentEntitlements?: Pick<TenantEntitlementsSnapshot, "modules" | "limits"> | null;
  actorId?: string;
}) {
  const tenantId = String(input.tenantId || "").trim();
  if (!tenantId) return { activeTrial: false, changed: false, entitlements: null };

  const tenantData = input.tenantData || (
    (await adminDb.collection("tenants").doc(tenantId).get()).data() as Record<string, unknown> | undefined
  ) || {};
  const activeTrial = String(tenantData.billingStatus || "").toLowerCase() === "trial"
    && timestampToMillis(tenantData.trialEndsAt) > Date.now();
  if (!activeTrial) return { activeTrial: false, changed: false, entitlements: null };

  const entitlements = getPlatformPlanEntitlements("operacao");
  if (hasSameTrialAccess(input.currentEntitlements)) {
    return { activeTrial: true, changed: false, entitlements };
  }

  await applyPlatformPlanEntitlements({
    tenantId,
    planId: "operacao",
    source: "trial",
    actorId: input.actorId || "trial_reconciliation",
    actorName: "Trial completo Altum",
  });
  return { activeTrial: true, changed: true, entitlements };
}
