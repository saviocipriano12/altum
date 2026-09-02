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
  customerData: {
    name: string;
    email: string;
    cpfCnpj: string;
  };
  now?: Date;
}) {
  const now = input.now || new Date();
  const nextDueDate = new Date(now.getTime() + 5 * 60 * 1000);

  return {
    billingTypes: ["CREDIT_CARD", "PIX"],
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
    customerData: input.customerData,
  };
}
