import type { EcommerceVersionMetrics } from "@/lib/ecommerce-agent-experiment";

type ActionRow = Record<string, unknown> & { id?: string };

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function summarizeEcommerceAgentVersions(input: {
  actions: ActionRow[];
  versions: string[];
  now?: number;
  maturityHours?: number;
}) {
  const now = input.now ?? Date.now();
  const maturityMs = Math.max(1, input.maturityHours ?? 24) * 3_600_000;
  const versionSet = new Set(input.versions.filter(Boolean));
  const groups = new Map<string, Map<string, ActionRow[]>>();
  for (const action of input.actions) {
    const version = String(action.agentVersion || "").trim();
    if (!versionSet.has(version)) continue;
    const subject = String(action.externalId || action.leadId || action.id || "").trim();
    if (!subject) continue;
    if (!groups.has(version)) groups.set(version, new Map());
    const subjects = groups.get(version)!;
    subjects.set(subject, [...(subjects.get(subject) || []), action]);
  }

  return input.versions.map((version): EcommerceVersionMetrics => {
    const subjects = Array.from(groups.get(version)?.values() || []);
    let sent = 0;
    let failures = 0;
    let mature = 0;
    let conversions = 0;
    let revenue = 0;
    for (const actions of subjects) {
      const sentActions = actions.filter((row) => Boolean(row.whatsappSentAt));
      const failed = actions.some((row) => String(row.status || "") === "failed");
      const outcome = actions.map((row) => String(row.businessOutcome || "")).find(Boolean) || "";
      const converted = ["cart_recovered", "delivered", "payment_confirmed"].includes(outcome);
      const firstSentAt = Math.min(...sentActions.map((row) => toMillis(row.whatsappSentAt)).filter(Boolean));
      const isMature = converted || (Number.isFinite(firstSentAt) && firstSentAt > 0 && firstSentAt <= now - maturityMs);
      if (sentActions.length) sent += 1;
      else if (failed) failures += 1;
      if (sentActions.length && isMature) mature += 1;
      if (sentActions.length && converted) {
        conversions += 1;
        revenue += Math.max(0, ...actions.map((row) => Number(row.amount || 0)).filter(Number.isFinite));
      }
    }
    return { version, sent, failures, mature, conversions, revenue };
  });
}
