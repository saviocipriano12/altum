/** Asaas documents a zone-less event dateCreated. Encode its civil components
 * for comparison within that provider clock; never claim it is a UTC instant.
 * Offset-bearing ISO values form a separate absolute clock domain. */
export function parseAsaasEventTime(value: unknown): { occurredAtMs: number | null; clockDomain: "provider_wall_clock" | "absolute" | "unknown" } {
  const unknown = { occurredAtMs: null, clockDomain: "unknown" as const };
  if (typeof value !== "string" || value.length > 80) return unknown;
  const text = value.trim();
  const parts = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/i.exec(text);
  if (!parts) return unknown;
  const [, yy, mm, dd, hh, min, sec, fraction = "", zone] = parts;
  const [year, month, day, hour, minute, second] = [yy, mm, dd, hh, min, sec].map(Number), ms = Number(fraction.padEnd(3, "0"));
  const civil = Date.UTC(year, month - 1, day, hour, minute, second, ms), check = new Date(civil);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second || check.getUTCMilliseconds() !== ms) return unknown;
  if (!zone) return { occurredAtMs: civil, clockDomain: "provider_wall_clock" };
  const instant = Date.parse(`${yy}-${mm}-${dd}T${hh}:${min}:${sec}${fraction ? `.${fraction}` : ""}${zone.toUpperCase()}`);
  return Number.isFinite(instant) ? { occurredAtMs: instant, clockDomain: "absolute" } : unknown;
}
