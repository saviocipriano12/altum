import type { PlatformPlanId } from "@/lib/platform-plans";

export const REFUND_WINDOW_DAYS = 7;
export const PAYMENT_GRACE_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLAN_RANK: Record<PlatformPlanId, number> = {
  essencial: 10,
  operacao: 20,
  estrutura_assistida: 30,
};

export function parseBillingDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00-03:00` : raw;
  const parsed = new Date(normalized);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getBillingBlockAt(dueDate: unknown, fallback = new Date()) {
  const base = parseBillingDate(dueDate) || fallback;
  return new Date(base.getTime() + PAYMENT_GRACE_DAYS * DAY_MS);
}

export function isWithinRefundWindow(firstPaymentAt: unknown, now = new Date()) {
  const paidAt = parseBillingDate(firstPaymentAt);
  if (!paidAt) return false;
  const age = now.getTime() - paidAt.getTime();
  return age >= 0 && age <= REFUND_WINDOW_DAYS * DAY_MS;
}

export function isPlanUpgrade(current: unknown, next: PlatformPlanId) {
  const currentRank = typeof current === "string" && current in PLAN_RANK
    ? PLAN_RANK[current as PlatformPlanId]
    : 0;
  return PLAN_RANK[next] > currentRank;
}
