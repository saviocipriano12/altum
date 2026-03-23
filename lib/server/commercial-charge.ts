export type TenantChargeBillingType = "PIX" | "BOLETO" | "CREDIT_CARD";

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizeChargeAmount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

export function normalizeChargeBillingType(value: unknown): TenantChargeBillingType {
  const normalized = clean(value, 40).toUpperCase();
  if (normalized === "BOLETO" || normalized === "CREDIT_CARD") return normalized;
  return "PIX";
}

export function resolveChargeDueDate(value: unknown, now = new Date()) {
  const explicit = clean(value, 40);
  if (explicit) return explicit;
  return now.toISOString().split("T")[0];
}

export function resolveChargeMethodForAsaas(billingType: TenantChargeBillingType) {
  return billingType === "CREDIT_CARD" ? "UNDEFINED" : billingType;
}

export function resolveChargeDescription(input: {
  explicitDescription?: unknown;
  budgetTitle?: unknown;
  customerName?: unknown;
}) {
  const explicitDescription = clean(input.explicitDescription, 180);
  const budgetTitle = clean(input.budgetTitle, 180);
  const customerName = clean(input.customerName, 180);

  return explicitDescription || budgetTitle || `Cobranca ALTUM - ${customerName || "Cliente"}`;
}
