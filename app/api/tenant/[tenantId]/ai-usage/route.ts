import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { getAiMonthlyUsageSnapshot } from "@/lib/server/ai/usage-ledger";

type AiUsageItem = {
  id: string;
  createdAt?: unknown;
  estimatedCostUsd?: number;
  provider?: string;
  scope?: string;
  status?: string;
  [key: string]: unknown;
};

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const monthlySnapshot = await getAiMonthlyUsageSnapshot(tenantId);
    const snap = await adminDb.collection("ai_usage_ledger").where("tenantId", "==", tenantId).limit(200).get();
    const items: AiUsageItem[] = snap.docs
      .map((doc): AiUsageItem => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    const summary = {
      total: monthlySnapshot.runs,
      estimatedCostUsd: monthlySnapshot.estimatedCostUsd,
      rulesLane: items.filter((item) => String(item.provider || "") === "altum_rules").length,
      premiumLane: items.filter((item) => String(item.provider || "") !== "altum_rules").length,
      conversationRuns: monthlySnapshot.conversationRuns,
      fallbackRuns: items.filter((item) => String(item.status || "") === "fallback").length,
      monthRef: monthlySnapshot.monthRef,
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
      items: items.slice(0, 40),
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
