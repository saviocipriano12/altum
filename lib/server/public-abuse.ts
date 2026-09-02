import "server-only";

import crypto from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";

type PublicRateLimitInput = {
  scope: string;
  subject?: string;
  limit: number;
  windowMs: number;
};

export class PublicRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");
  }
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function getRequestIp(req: Request) {
  const forwarded = clean(req.headers.get("x-forwarded-for"), 400);
  const firstForwarded = forwarded.split(",")[0]?.trim();
  return firstForwarded || clean(req.headers.get("x-real-ip"), 120) || "unknown";
}

function fingerprint(req: Request, input: PublicRateLimitInput) {
  const secret = clean(process.env.PUBLIC_RATE_LIMIT_SECRET, 500) || clean(process.env.SECRET_ENCRYPTION_KEY, 500) || "altum-development-rate-limit";
  const raw = [clean(input.scope, 80), clean(input.subject, 180), getRequestIp(req)].join("|");
  return crypto.createHmac("sha256", secret).update(raw).digest("hex").slice(0, 56);
}

function timestampToMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") {
      const millis = Number(toMillis.call(value));
      if (Number.isFinite(millis)) return millis;
    }
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Rate limit compartilhado para entradas públicas. O IP nunca é gravado em
 * claro; apenas um HMAC com segredo do servidor é usado como chave temporária.
 * Um WAF na borda continua necessário para absorver ataques distribuídos.
 */
export async function assertPublicRateLimit(req: Request, input: PublicRateLimitInput) {
  const now = Date.now();
  const windowMs = Math.max(1_000, Math.min(input.windowMs, 24 * 60 * 60 * 1000));
  const limit = Math.max(1, Math.min(input.limit, 100));
  const key = fingerprint(req, input);
  const ref = adminDb.collection("public_rate_limits").doc(`${clean(input.scope, 60)}_${key}`);

  const result = await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    const resetAt = timestampToMillis(data.resetAt);
    const active = resetAt > now;
    const count = active ? Math.max(0, Number(data.count || 0)) : 0;
    const nextResetAt = active ? resetAt : now + windowMs;

    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((nextResetAt - now) / 1000)) };
    }

    transaction.set(ref, {
      scope: clean(input.scope, 80),
      count: count + 1,
      resetAt: new Date(nextResetAt),
      expiresAt: new Date(nextResetAt + 24 * 60 * 60 * 1000),
      updatedAt: new Date(now),
    }, { merge: true });
    return { allowed: true, retryAfterSeconds: 0 };
  });

  if (!result.allowed) throw new PublicRateLimitError(result.retryAfterSeconds);
}
