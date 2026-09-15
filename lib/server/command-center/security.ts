import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export class CommandError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 403) { super(code); this.code = code; this.status = status; }
}
export function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function sign(value: Record<string, unknown>, secret: string) {
  if (secret.length < 32) throw new CommandError("UNAVAILABLE", 503);
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}
export function verify(token: string, secret: string): Record<string, unknown> {
  if (secret.length < 32) throw new CommandError("UNAVAILABLE", 503);
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || token.length > 4096) throw new CommandError("FORBIDDEN");
  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(signature, "base64url");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new CommandError("FORBIDDEN");
  try { return JSON.parse(Buffer.from(body, "base64url").toString("utf8")); }
  catch { throw new CommandError("FORBIDDEN"); }
}
export function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return null;
  return value.replace(/Bearer\s+[^\s]+/gi, "[REDACTED]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g, "[REDACTED]")
    .replace(/((?:token|api[_ -]?key|secret|password|senha)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, max);
}
export function millis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  const time = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}
export function iso(value: unknown) { const time = millis(value); return time == null ? null : new Date(time).toISOString(); }
