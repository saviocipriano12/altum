import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, getTenantSettings, TenantAccessError } from "@/lib/server/tenant";
import { getAiMonthlyUsageSnapshot } from "@/lib/server/ai/usage-ledger";
import { assertTenantModule, getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { normalizeTenantAiOperatingProfile } from "@/lib/server/ai/operating-layer";

type AiUsageItem = {
  id: string;
  createdAt?: unknown;
  estimatedCostUsd?: number;
  provider?: string;
  scope?: string;
  status?: string;
  [key: string]: unknown;
};

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "ai");
    assertTenantCapability(membership, "manage_ai");

    const [monthlySnapshot, settings, entitlements] = await Promise.all([
      getAiMonthlyUsageSnapshot(tenantId),
      getTenantSettings(tenantId),
      getTenantEntitlements(tenantId),
    ]);
    const ai = settings?.ai && typeof settings.ai === "object" ? settings.ai as Record<string, unknown> : {};
    const operatingProfile = normalizeTenantAiOperatingProfile(ai.operatingProfile);
    const configuredUsageCaps = [
      Number(operatingProfile.monthlyUsageCap || 0),
      Number(entitlements.limits.aiRunsPerMonth || 0),
    ].filter((value) => Number.isFinite(value) && value > 0);
    const effectiveUsageCap = configuredUsageCaps.length ? Math.min(...configuredUsageCaps) : 0;
    const usageCapExceeded = effectiveUsageCap > 0 && monthlySnapshot.conversationRuns >= effectiveUsageCap;
    const budgetCapExceeded =
      operatingProfile.monthlyBudgetUsd > 0 && monthlySnapshot.estimatedCostUsd >= operatingProfile.monthlyBudgetUsd;

    const snap = await adminDb
      .collection("ai_usage_ledger")
      .where("tenantId", "==", tenantId)
      .orderBy("createdAt", "desc")
      .limit(40)
      .get();
    const items: AiUsageItem[] = snap.docs
      .map((doc): AiUsageItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }));

    const summary = {
      total: monthlySnapshot.runs,
      estimatedCostUsd: monthlySnapshot.estimatedCostUsd,
      rulesLane: items.filter((item) => String(item.provider || "") === "altum_rules").length,
      premiumLane: items.filter((item) => String(item.provider || "") !== "altum_rules").length,
      conversationRuns: monthlySnapshot.conversationRuns,
      fallbackRuns: items.filter((item) => String(item.status || "") === "fallback").length,
      monthRef: monthlySnapshot.monthRef,
      effectiveUsageCap,
      monthlyBudgetUsd: operatingProfile.monthlyBudgetUsd,
      usageCapExceeded,
      budgetCapExceeded,
    };

    const providers = Array.from(
      items.reduce((acc, item) => {
        const key = String(item.provider || "unknown");
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([provider, total]) => ({ provider, total }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      ok: true,
      tenantId,
      summary,
      providers,
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao carregar uso da IA:", error);
    return NextResponse.json({ error: "Falha ao carregar uso da IA." }, { status: 500 });
  }
}
