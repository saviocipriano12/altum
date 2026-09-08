const MANAGED_BILLING_STATUSES = new Set([
  "active",
  "paid",
  "past_due",
  "refund_pending",
  "cancel_scheduled",
]);

function clean(value: unknown, max = 800) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function hasManagedAsaasSubscription(input: { subscriptionId?: unknown; billingStatus?: unknown }) {
  return Boolean(clean(input.subscriptionId, 180)) && MANAGED_BILLING_STATUSES.has(clean(input.billingStatus, 40).toLowerCase());
}

export function canReuseAsaasCheckout(input: {
  checkoutUrl?: unknown;
  checkoutCreatedAt: number;
  pendingPlan?: unknown;
  pendingMonthlyPrice?: unknown;
  catalogVersion?: unknown;
  planId: string;
  monthlyPrice: number;
  expectedCatalogVersion: string;
  now?: number;
}) {
  const age = (input.now ?? Date.now()) - input.checkoutCreatedAt;
  return Boolean(clean(input.checkoutUrl))
    && input.checkoutCreatedAt > 0
    && age >= 0
    && age < 10 * 60 * 1000
    && clean(input.pendingPlan, 80) === input.planId
    && Number(input.pendingMonthlyPrice) === input.monthlyPrice
    && clean(input.catalogVersion, 80) === input.expectedCatalogVersion;
}

export function checkoutSubscriptionFields(checkout: Record<string, unknown>) {
  const subscription = checkout.subscription;
  const data = subscription && typeof subscription === "object"
    ? subscription as Record<string, unknown>
    : {};
  const subscriptionId = clean(typeof subscription === "string" ? subscription : data.id, 180);
  const nextDueDate = clean(data.nextDueDate, 80);
  return {
    ...(subscriptionId ? { asaasSubscriptionId: subscriptionId } : {}),
    ...(nextDueDate ? { asaasNextDueDate: nextDueDate } : {}),
  };
}
