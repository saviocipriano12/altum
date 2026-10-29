const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A release changes update policy, never the provenance of the current value.
 * Only a message actually stored after the release may replace that value. */
export function qualificationEvidenceAllowsUpdate(value: unknown, sourceOrder?: string) {
  const evidence = record(value), cutoff = record(evidence.automaticAfter);
  const manual = typeof evidence.source === "string" && evidence.source.trim() === "manual";
  if (manual && (evidence.automaticUpdates !== true || evidence.automaticAfter === undefined)) return false;
  if (evidence.automaticAfter === undefined) return true;
  const seconds = cutoff.seconds ?? cutoff._seconds, nanos = cutoff.nanoseconds ?? cutoff._nanoseconds;
  if (!Number.isSafeInteger(seconds) || !Number.isInteger(nanos) || Number(nanos) < 0 || Number(nanos) >= 1e9 ||
      typeof sourceOrder !== "string" || !/^\d{12}:\d{9}$/.test(sourceOrder)) return false;
  const [sourceSeconds, sourceNanos] = sourceOrder.split(":").map(Number);
  return sourceSeconds > Number(seconds) || sourceSeconds === Number(seconds) && sourceNanos > Number(nanos);
}
