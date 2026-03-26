import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type UsageItem = {
  id: string;
  tenantId?: string;
  provider?: string;
  model?: string;
  scope?: string;
  estimatedCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  status?: string;
  createdAt?: unknown;
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const snap = await adminDb.collection("ai_usage_ledger").orderBy("createdAt", "desc").limit(1000).get();
    const items: UsageItem[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const monthStart = startOfMonth(new Date(now));

    const recent30 = items.filter((item) => toMillis(item.createdAt) >= thirtyDaysAgo);
    const recent7 = recent30.filter((item) => toMillis(item.createdAt) >= sevenDaysAgo);
    const currentMonth = recent30.filter((item) => toMillis(item.createdAt) >= monthStart);

    const summarize = (source: UsageItem[]) => ({
      runs: source.length,
      estimatedCostUsd: Number(source.reduce((sum, item) => sum + Number(item.estimatedCostUsd || 0), 0).toFixed(4)),
      inputTokens: source.reduce((sum, item) => sum + Number(item.inputTokens || 0), 0),
      outputTokens: source.reduce((sum, item) => sum + Number(item.outputTokens || 0), 0),
      avgLatencyMs: source.length
        ? Math.round(source.reduce((sum, item) => sum + Number(item.latencyMs || 0), 0) / source.length)
        : 0,
      failures: source.filter((item) => String(item.status || "") === "error").length,
      fallbacks: source.filter((item) => String(item.status || "") === "fallback").length,
    });

    const providers = Array.from(
      recent30.reduce((acc, item) => {
        const key = String(item.provider || "unknown");
        const current = acc.get(key) || { provider: key, runs: 0, estimatedCostUsd: 0 };
        current.runs += 1;
        current.estimatedCostUsd += Number(item.estimatedCostUsd || 0);
        acc.set(key, current);
        return acc;
      }, new Map<string, { provider: string; runs: number; estimatedCostUsd: number }>())
    )
      .map(([, value]) => ({
        ...value,
        estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(4)),
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.runs - a.runs);

    const tenantIds = Array.from(new Set(recent30.map((item) => String(item.tenantId || "").trim()).filter(Boolean)));
    const tenantDocs = await Promise.all(
      tenantIds.map(async (tenantId) => {
        const [tenantSnap, settingsSnap] = await Promise.all([
          adminDb.collection("tenants").doc(tenantId).get(),
          adminDb.collection("tenant_settings").doc(tenantId).get(),
        ]);
        const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
        const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
        return {
          tenantId,
          tenantName: String(settingsData.name || tenantData.name || tenantId),
        };
      })
    );
    const tenantNameMap = new Map(tenantDocs.map((item) => [item.tenantId, item.tenantName]));

    const topTenants = Array.from(
      recent30.reduce((acc, item) => {
        const tenantId = String(item.tenantId || "").trim() || "sem-tenant";
        const current = acc.get(tenantId) || {
          tenantId,
          tenantName: tenantNameMap.get(tenantId) || tenantId,
          runs: 0,
          estimatedCostUsd: 0,
        };
        current.runs += 1;
        current.estimatedCostUsd += Number(item.estimatedCostUsd || 0);
        acc.set(tenantId, current);
        return acc;
      }, new Map<string, { tenantId: string; tenantName: string; runs: number; estimatedCostUsd: number }>())
    )
      .map(([, value]) => ({
        ...value,
        estimatedCostUsd: Number(value.estimatedCostUsd.toFixed(4)),
      }))
      .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd || b.runs - a.runs)
      .slice(0, 8);

    const expensiveRuns = [...recent30]
      .sort((a, b) => Number(b.estimatedCostUsd || 0) - Number(a.estimatedCostUsd || 0))
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        tenantId: String(item.tenantId || ""),
        tenantName: tenantNameMap.get(String(item.tenantId || "").trim()) || String(item.tenantId || "-"),
        provider: String(item.provider || "unknown"),
        model: String(item.model || "-"),
        scope: String(item.scope || "-"),
        estimatedCostUsd: Number(Number(item.estimatedCostUsd || 0).toFixed(6)),
        inputTokens: Number(item.inputTokens || 0),
        outputTokens: Number(item.outputTokens || 0),
        latencyMs: Number(item.latencyMs || 0),
        createdAt: item.createdAt || null,
      }));

    return NextResponse.json({
      ok: true,
      currentMonth: summarize(currentMonth),
      last7Days: summarize(recent7),
      last30Days: summarize(recent30),
      providers,
      topTenants,
      expensiveRuns,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao carregar resumo de uso da IA no admin:", error);
    return NextResponse.json({ error: "Falha ao carregar resumo de uso da IA." }, { status: 500 });
  }
}
