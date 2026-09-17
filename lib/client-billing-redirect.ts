export const BILLING_ACCESS_CODES = ["trial_expired", "billing_grace_expired", "subscription_ended", "tenant_billing_blocked"] as const;
export function getClientBillingRedirect(payload: { code?: string; tenantId?: string }, status: number) {
  if (![402, 403].includes(status) || !BILLING_ACCESS_CODES.includes(payload.code as typeof BILLING_ACCESS_CODES[number])) return null;
  const params = new URLSearchParams({ reason: payload.code! });
  if (payload.tenantId) params.set("tenantId", payload.tenantId);
  return "/cliente/assinatura?" + params.toString();
}
