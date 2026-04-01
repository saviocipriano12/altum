import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

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

function topEntries(source: Record<string, unknown> | undefined, limit = 6) {
  return Object.entries(source || {})
    .map(([key, value]) => ({
      key,
      count: typeof value === "number" ? value : Number(value || 0),
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, {
      roles: ["agency_owner", "agency_admin", "agency_agent"],
    });

    const since = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const snap = await adminDb
      .collection("ai_tenant_learning_daily")
      .orderBy("updatedAt", "desc")
      .limit(500)
      .get();

    const docs = snap.docs
      .map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
      .filter((item) => toMillis(item.updatedAt) >= since);

    const aggregate = docs.reduce(
      (acc, item) => {
        acc.totalRuns += Number(item.totalRuns || 0);
        acc.lowConfidenceRuns += Number(item.lowConfidenceRuns || 0);
        acc.confidenceSum += Number(item.confidenceSum || 0);
        acc.lowQualityRuns += Number(item.lowQualityRuns || 0);
        acc.qualityScoreSum += Number(item.qualityScoreSum || 0);

        const counters =
          item.counters && typeof item.counters === "object" && !Array.isArray(item.counters)
            ? (item.counters as Record<string, Record<string, unknown>>)
            : {};

        for (const group of ["intent", "responseGoal", "recommendedOffer", "objectionType", "nextAction", "commercialTemperature"] as const) {
          const source = counters[group] || {};
          const target = acc.counters[group];
          for (const [key, value] of Object.entries(source)) {
            target[key] = (target[key] || 0) + Number(value || 0);
          }
        }

        return acc;
      },
      {
        totalRuns: 0,
        lowConfidenceRuns: 0,
        confidenceSum: 0,
        lowQualityRuns: 0,
        qualityScoreSum: 0,
        counters: {
          intent: {} as Record<string, number>,
          responseGoal: {} as Record<string, number>,
          recommendedOffer: {} as Record<string, number>,
          objectionType: {} as Record<string, number>,
          nextAction: {} as Record<string, number>,
          commercialTemperature: {} as Record<string, number>,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      windowDays: 14,
      summary: {
        totalRuns: aggregate.totalRuns,
        avgConfidence: aggregate.totalRuns
          ? Number((aggregate.confidenceSum / aggregate.totalRuns).toFixed(3))
          : 0,
        lowConfidenceRuns: aggregate.lowConfidenceRuns,
        avgQualityScore: aggregate.totalRuns
          ? Number((aggregate.qualityScoreSum / aggregate.totalRuns).toFixed(3))
          : 0,
        lowQualityRuns: aggregate.lowQualityRuns,
      },
      topIntents: topEntries(aggregate.counters.intent),
      topGoals: topEntries(aggregate.counters.responseGoal),
      topOffers: topEntries(aggregate.counters.recommendedOffer),
      topObjections: topEntries(aggregate.counters.objectionType),
      topActions: topEntries(aggregate.counters.nextAction),
      temperatures: topEntries(aggregate.counters.commercialTemperature, 3),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }

    console.error("Erro ao carregar resumo de aprendizado da IA:", error);
    return NextResponse.json({ error: "Falha ao carregar aprendizado da IA." }, { status: 500 });
  }
}
