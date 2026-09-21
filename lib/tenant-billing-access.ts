function millis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value === "object" && ("_seconds" in value || "seconds" in value)) return Number("_seconds" in value ? value._seconds : value.seconds) * 1000;
  const date = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(date) ? date : null;
}
export function getTenantBillingAccessDenial(data: Record<string, unknown>, now = Date.now()) {
  const status = String(data.billingStatus || "").toLowerCase();
  if (data.status === "blocked" || status === "blocked") return { code: "tenant_billing_blocked", status: 403, message: "Acesso operacional pausado. Regularize a assinatura ou fale com a Altum." };
  const blockAt = millis(data.billingBlockAt);
  if (status === "past_due" && blockAt && blockAt <= now) return { code: "billing_grace_expired", status: 402, message: "O prazo de pagamento terminou. Regularize sua assinatura para continuar." };
  const accessEndsAt = millis(data.accessEndsAt);
  if (status === "cancel_scheduled" && accessEndsAt && accessEndsAt <= now) return { code: "subscription_ended", status: 402, message: "Seu periodo contratado terminou. Escolha um plano para continuar." };
  const trialEndsAt = millis(data.trialEndsAt);
  if (trialEndsAt && trialEndsAt <= now && ["", "trial", "pending"].includes(status)) return { code: "trial_expired", status: 402, message: "Seu periodo gratuito terminou. Escolha um plano para continuar usando a Altum." };
  return null;
}
