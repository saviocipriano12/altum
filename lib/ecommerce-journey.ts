export type EcommerceOrderJourneyState =
  | "order_created"
  | "payment_confirmed"
  | "fulfillment_pending"
  | "shipped"
  | "delivered"
  | "partially_refunded"
  | "cancelled"
  | "refunded";

export type EcommerceOrderJourney = {
  state: EcommerceOrderJourneyState;
  paid: boolean;
  terminal: boolean;
  pipelineStage: "proposta" | "ganho" | "perdido";
  shouldConfirmPurchase: boolean;
  shouldFollowUpPayment: boolean;
  shouldSendTracking: boolean;
  shouldWaitForTracking: boolean;
  shouldCreatePostPurchaseUpsell: boolean;
};

function tokens(...values: unknown[]) {
  return values
    .map((value) => String(value || ""))
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_");
}

function hasToken(source: string, values: string[]) {
  return values.some((value) => new RegExp(`(^|_)${value}(_|$)`).test(source));
}

export function deriveEcommerceOrderJourney(input: {
  status?: unknown;
  paymentStatus?: unknown;
  fulfillmentStatus?: unknown;
  trackingCode?: unknown;
  trackingUrl?: unknown;
}): EcommerceOrderJourney {
  const orderStatus = tokens(input.status);
  const paymentStatus = tokens(input.paymentStatus);
  const fulfillmentStatus = tokens(input.fulfillmentStatus);
  const allStatuses = tokens(input.status, input.paymentStatus, input.fulfillmentStatus);
  const hasTracking = Boolean(String(input.trackingCode || "").trim() || String(input.trackingUrl || "").trim());

  const partiallyRefunded = hasToken(allStatuses, ["partially_refunded", "partial_refund", "parcialmente_reembolsado"]);
  const refunded = !partiallyRefunded && hasToken(allStatuses, ["refunded", "refund", "estornado", "estorno", "reembolsado", "reembolso"]);
  const cancelled = hasToken(allStatuses, ["cancelled", "canceled", "cancelado", "voided", "void"]);
  const delivered = hasToken(fulfillmentStatus || orderStatus, ["delivered", "entregue", "completed", "concluido"]);
  const shipped = hasTracking || hasToken(fulfillmentStatus || orderStatus, ["shipped", "fulfilled", "enviado", "despachado", "in_transit"]);
  const explicitlyUnpaid = !partiallyRefunded && hasToken(paymentStatus || orderStatus, [
    "unpaid",
    "not_paid",
    "partially_paid",
    "partial",
    "pending",
    "pendente",
    "authorized",
    "autorizado",
  ]);
  const paid = !refunded && !cancelled && (partiallyRefunded || (!explicitlyUnpaid && hasToken(paymentStatus || orderStatus, [
    "paid",
    "pago",
    "received",
    "recebido",
    "confirmed",
    "confirmado",
    "approved",
    "aprovado",
  ])));

  let state: EcommerceOrderJourneyState = "order_created";
  if (paid) state = "payment_confirmed";
  if (paid && fulfillmentStatus && !shipped && !delivered) state = "fulfillment_pending";
  if (shipped) state = "shipped";
  if (delivered) state = "delivered";
  if (partiallyRefunded) state = "partially_refunded";
  if (cancelled) state = "cancelled";
  if (refunded) state = "refunded";

  const terminal = state === "cancelled" || state === "refunded";
  return {
    state,
    paid,
    terminal,
    pipelineStage: terminal ? "perdido" : paid || state === "shipped" || state === "delivered" ? "ganho" : "proposta",
    shouldConfirmPurchase: paid && !terminal && !partiallyRefunded,
    shouldFollowUpPayment: !paid && !terminal,
    shouldSendTracking: !terminal && hasTracking,
    shouldWaitForTracking: paid && !terminal && !hasTracking && state !== "delivered",
    shouldCreatePostPurchaseUpsell: paid && state === "delivered" && !partiallyRefunded,
  };
}
