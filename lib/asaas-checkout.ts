export type AsaasCheckoutPlan = {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
};

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value || "";
}

export function formatAsaasDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return `${datePart(parts, "year")}-${datePart(parts, "month")}-${datePart(parts, "day")} ${datePart(parts, "hour")}:${datePart(parts, "minute")}:${datePart(parts, "second")}`;
}

export function buildAsaasRecurringCheckoutPayload(input: {
  plan: AsaasCheckoutPlan;
  siteUrl: string;
  externalReference: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  const nextDueDate = new Date(now.getTime() + 5 * 60 * 1000);

  return {
    // Asaas only accepts CREDIT_CARD for RECURRENT checkouts. PIX requires a
    // detached charge and therefore cannot share this subscription payload.
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["RECURRENT"],
    minutesToExpire: 60,
    externalReference: input.externalReference,
    callback: {
      successUrl: `${input.siteUrl}/cliente/painel/configuracoes/faturamento?checkout=success`,
      cancelUrl: `${input.siteUrl}/cliente/painel/configuracoes/faturamento?checkout=cancelled`,
      expiredUrl: `${input.siteUrl}/cliente/painel/configuracoes/faturamento?checkout=expired`,
    },
    items: [{
      name: `ALTUM ${input.plan.name}`,
      description: input.plan.description,
      quantity: 1,
      value: input.plan.monthlyPrice,
      externalReference: input.plan.id,
    }],
    subscription: {
      cycle: "MONTHLY",
      nextDueDate: formatAsaasDateTime(nextDueDate),
    },
    // The payer supplies complete billing details on the hosted Asaas checkout.
  };
}

export function buildAsaasCheckoutUrl(checkoutId: string, apiUrl: string) {
  if (!/^[a-zA-Z0-9_-]{1,180}$/.test(checkoutId)) return "";
  const apiHost = new URL(apiUrl).hostname;
  const host = apiHost === "api.asaas.com" ? "asaas.com"
    : apiHost === "api-sandbox.asaas.com" || apiHost === "sandbox.asaas.com" ? "sandbox.asaas.com" : "";
  return host ? `https://${host}/checkoutSession/show?id=${encodeURIComponent(checkoutId)}` : "";
}
