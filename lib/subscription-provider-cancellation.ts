export class RefundReviewRequired extends Error {}

type ProviderState = { providerCancelled?: boolean; refundAttempted?: boolean; refundAccepted?: boolean };
export async function completeProviderCancellation(input: {
  subscriptionId: string; refundPaymentId: string; refundEligible: boolean; reason: string; state: ProviderState;
  request: (path: string, init?: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  persist: (state: ProviderState) => Promise<void>;
}) {
  if (!input.state.providerCancelled) {
    await input.request(`/subscriptions/${encodeURIComponent(input.subscriptionId)}`, { method: "DELETE" });
    await input.persist({ providerCancelled: true });
  }
  if (input.refundEligible && input.refundPaymentId && !input.state.refundAccepted) {
    if (input.state.refundAttempted) {
      const payment = await input.request(`/payments/${encodeURIComponent(input.refundPaymentId)}`);
      if (!["REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS"].includes(String(payment.status))) {
        throw new RefundReviewRequired("O estorno precisa ser conciliado antes de uma nova tentativa.");
      }
    } else {
      await input.persist({ refundAttempted: true });
      await input.request(`/payments/${encodeURIComponent(input.refundPaymentId)}/refund`, {
        method: "POST", body: { description: input.reason },
      });
    }
    await input.persist({ refundAccepted: true });
  }
}
