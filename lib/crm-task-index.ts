import { activityDateIso, commercialActivityStatus } from "./crm-activity";

export type CommercialTaskIndex = {
  version: 1;
  state: ReturnType<typeof commercialActivityStatus>;
  openRank: 0 | 1;
  dueOrder: number;
  issue: "invalid_due_at" | "invalid_status" | null;
};
/** Metadata on the existing task, never another source of business facts. */
export function commercialTaskIndex(row: Record<string, unknown>): CommercialTaskIndex {
  let iso: string | null = null;
  try { iso = activityDateIso(row.dueAt); } catch { /* Malformed legacy values require review. */ }
  const supplied = row.dueAt !== undefined && row.dueAt !== null && row.dueAt !== "";
  const rawStatus = row.status === undefined ? "pending" : row.status;
  const state = commercialActivityStatus(String(rawStatus || "pending"));
  return { version: 1, state, openRank: state === "pending" ? 0 : 1,
    dueOrder: iso ? Date.parse(iso) : Number.MAX_SAFE_INTEGER,
    issue: supplied && !iso ? "invalid_due_at" : typeof rawStatus !== "string" || !["pending", "done", "completed", "canceled", "cancelled", "no_show", "draft"].includes(rawStatus) ? "invalid_status" : null };
}
export function commercialTaskIndexMatches(row: Record<string, unknown>, expected = commercialTaskIndex(row)) {
  const actual = row.crmTaskIndex as Record<string, unknown> | null;
  return !!actual && typeof actual === "object" && actual.version === expected.version && actual.state === expected.state &&
    actual.openRank === expected.openRank && actual.dueOrder === expected.dueOrder && actual.issue === expected.issue && Object.keys(actual).length === 5;
}
/** Previous data must come from the same transaction when updating a task. */
export function withCommercialTaskIndex<T extends Record<string, unknown>>(patch: T, previous: Record<string, unknown> = {}): T & { crmTaskIndex: CommercialTaskIndex } {
  return { ...patch, crmTaskIndex: commercialTaskIndex({ ...previous, ...patch }) };
}
