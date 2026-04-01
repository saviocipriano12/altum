import { adminDb } from "@/app/lib/server/firebase-admin";

function cleanText(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

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

function topKeys(source: Record<string, unknown> | undefined, limit = 3) {
  return Object.entries(source || {})
    .map(([key, value]) => ({
      key: cleanText(key, 120),
      count: typeof value === "number" ? value : Number(value || 0),
    }))
    .filter((item) => item.key && item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function sumOutcomeBucket(source: Record<string, unknown> | undefined, keys: string[]) {
  return Object.entries(source || {}).reduce((sum, [key, value]) => {
    if (!keys.includes(key)) return sum;
    return sum + (typeof value === "number" ? value : Number(value || 0));
  }, 0);
}

export type AltumTenantLearningHints = {
  hasData: boolean;
  topOffers: string[];
  topActions: string[];
  topObjections: string[];
  preferredClosingMotion: "meeting" | "proposal" | null;
};

type LearningAggregate = {
  recommendedOffer: Record<string, number>;
  nextAction: Record<string, number>;
  objectionType: Record<string, number>;
  proposalOutcomes: number;
  meetingOutcomes: number;
};

export async function getTenantLearningHints(tenantId: string): Promise<AltumTenantLearningHints> {
  const normalizedTenantId = cleanText(tenantId, 140);
  if (!normalizedTenantId) {
    return {
      hasData: false,
      topOffers: [],
      topActions: [],
      topObjections: [],
      preferredClosingMotion: null,
    };
  }

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const snap = await adminDb
    .collection("ai_tenant_learning_daily")
    .where("tenantId", "==", normalizedTenantId)
    .limit(60)
    .get();

  const relevantDocs = snap.docs
    .map((doc) => doc.data() as Record<string, unknown>)
    .filter((item) => toMillis(item.updatedAt) >= since);

  const aggregate = relevantDocs.reduce<LearningAggregate>(
    (acc, item) => {
      const counters =
        item.counters && typeof item.counters === "object" && !Array.isArray(item.counters)
          ? (item.counters as Record<string, Record<string, unknown>>)
          : {};
      const outcomes =
        item.outcomes && typeof item.outcomes === "object" && !Array.isArray(item.outcomes)
          ? (item.outcomes as Record<string, Record<string, unknown>>)
          : {};

      for (const group of ["recommendedOffer", "nextAction", "objectionType"] as const) {
        const target = acc[group] as Record<string, number>;
        const source = (counters[group] || {}) as Record<string, unknown>;
        for (const [key, value] of Object.entries(source)) {
          target[key] = (target[key] || 0) + Number(value || 0);
        }
      }

      acc.proposalOutcomes += sumOutcomeBucket(outcomes.proposal, ["approved", "sent", "accepted"]);
      acc.meetingOutcomes += sumOutcomeBucket(outcomes.appointment, ["scheduled", "confirmed", "completed"]);
      return acc;
    },
    {
      recommendedOffer: {} as Record<string, number>,
      nextAction: {} as Record<string, number>,
      objectionType: {} as Record<string, number>,
      proposalOutcomes: 0,
      meetingOutcomes: 0,
    }
  );

  const topOffers = topKeys(aggregate.recommendedOffer, 3).map((item) => item.key.replace(/_/g, " "));
  const topActions = topKeys(aggregate.nextAction, 4).map((item) => item.key);
  const topObjections = topKeys(aggregate.objectionType, 3).map((item) => item.key);

  let preferredClosingMotion: AltumTenantLearningHints["preferredClosingMotion"] = null;
  if (aggregate.meetingOutcomes > aggregate.proposalOutcomes && aggregate.meetingOutcomes > 0) {
    preferredClosingMotion = "meeting";
  } else if (aggregate.proposalOutcomes > 0) {
    preferredClosingMotion = "proposal";
  }

  return {
    hasData:
      topOffers.length > 0 || topActions.length > 0 || topObjections.length > 0 || Boolean(preferredClosingMotion),
    topOffers,
    topActions,
    topObjections,
    preferredClosingMotion,
  };
}
