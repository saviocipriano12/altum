/** Pure scheduling helper: safe to test without loading Next/Firebase modules. */
export function creativePollDelayMs(attempt: number) {
  return Math.min(5 * 60_000, Math.max(15_000, 15_000 * 2 ** Math.min(5, Math.max(0, attempt))));
}

// A provider can acknowledge a render and still never produce an asset (for
// example after an upstream outage). Never leave a paid job in "submitted"
// forever: the user needs a clear failure they can retry or reroute.
export const CREATIVE_MAX_POLL_ATTEMPTS = 96;
export const CREATIVE_MAX_POLL_AGE_MS = 4 * 60 * 60_000;

function timestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: unknown; toDate?: unknown };
    if (typeof candidate.toMillis === "function") return Number((candidate.toMillis as () => unknown)()) || 0;
    if (typeof candidate.toDate === "function") return (candidate.toDate as () => Date)().getTime();
  }
  return 0;
}

export function creativeJobPollExpired(input: { pollAttempts: number; submittedAt?: unknown; createdAt?: unknown; now?: number }) {
  if (Math.max(0, input.pollAttempts) >= CREATIVE_MAX_POLL_ATTEMPTS) return true;
  const startedAt = timestampMillis(input.submittedAt) || timestampMillis(input.createdAt);
  return startedAt > 0 && (input.now ?? Date.now()) - startedAt >= CREATIVE_MAX_POLL_AGE_MS;
}
