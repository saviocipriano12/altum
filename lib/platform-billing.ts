import { DEFAULT_PLATFORM_PLANS, type PlatformPlanId } from "@/lib/platform-plans";

export type PlatformBillingPlanId = PlatformPlanId | "custom";

export type PlatformBillingPlan = {
  id: PlatformBillingPlanId;
  label: string;
  monthlyPrice: number | null;
  interval: "month";
  stripeEnvKey: string | null;
  description: string;
};

export type StripePlanReadiness = {
  enabled: boolean;
  planId: PlatformBillingPlanId;
  planLabel: string;
  planPrice: number | null;
  stripeEnvKey: string | null;
  resolvedPriceId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  checkoutUrl: string | null;
  customerPortalUrl: string | null;
  missing: string[];
  nextStep: string;
};

export const PLATFORM_BILLING_PLANS: readonly PlatformBillingPlan[] = [
  ...DEFAULT_PLATFORM_PLANS.map((plan) => ({
    id: plan.id,
    label: plan.name,
    monthlyPrice: plan.monthlyPrice,
    interval: "month" as const,
    stripeEnvKey: `STRIPE_PRICE_ALTUM_${plan.id.toUpperCase()}_MONTHLY`,
    description: plan.description,
  })),
  {
    id: "custom" as const,
    label: "Custom",
    monthlyPrice: null,
    interval: "month" as const,
    stripeEnvKey: null,
    description: "Contrato especial, sem preco padrao definido.",
  },
] as const;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function normalizePlatformBillingPlanId(value: unknown): PlatformBillingPlanId {
  const normalized = clean(value, 120).toLowerCase();
  if (
    normalized === "essencial" ||
    normalized === "operacao" ||
    normalized === "escala" ||
    normalized === "estrutura_assistida" ||
    normalized === "custom"
  ) {
    return normalized;
  }

  if (normalized.includes("essencial")) return "essencial";
  if (normalized.includes("operacao")) return "operacao";
  if (normalized.includes("escala")) return "escala";
  if (normalized.includes("estrutura")) return "estrutura_assistida";
  return "custom";
}

export function getPlatformBillingPlan(value: unknown): PlatformBillingPlan {
  const planId = normalizePlatformBillingPlanId(value);
  return PLATFORM_BILLING_PLANS.find((item) => item.id === planId) || PLATFORM_BILLING_PLANS.at(-1)!;
}

export function getStripeIntegrationEnvStatus() {
  const requiredEnvMap = {
    secretKey: clean(process.env.STRIPE_SECRET_KEY, 400),
    publishableKey: clean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, 400),
    webhookSecret: clean(process.env.STRIPE_WEBHOOK_SECRET, 400),
    siteUrl: clean(process.env.NEXT_PUBLIC_SITE_URL, 400),
  };

  const missing = Object.entries(requiredEnvMap)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function buildStripePlanReadiness(input: {
  platformPlan?: string | null;
  billingProvider?: string | null;
  platformAccessMode?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  stripeCurrentPeriodEnd?: string | null;
  stripeCheckoutUrl?: string | null;
  stripeCustomerPortalUrl?: string | null;
}): StripePlanReadiness {
  const plan = getPlatformBillingPlan(input.platformPlan);
  const envStatus = getStripeIntegrationEnvStatus();
  const resolvedPriceId = plan.stripeEnvKey ? clean(process.env[plan.stripeEnvKey], 200) : "";
  const billingProvider = clean(input.billingProvider, 40).toLowerCase();
  const accessMode = clean(input.platformAccessMode, 80).toLowerCase();
  const enabled = billingProvider === "stripe" || accessMode === "stripe_subscription";

  const missing: string[] = [];
  if (enabled && !envStatus.ready) missing.push(...envStatus.missing.map((item) => `env:${item}`));
  if (enabled && plan.stripeEnvKey && !resolvedPriceId) missing.push(`price:${plan.stripeEnvKey}`);
  if (enabled && !clean(input.stripeCustomerId, 180)) missing.push("customer_id");
  if (enabled && !clean(input.stripeSubscriptionId, 180)) missing.push("subscription_id");

  let nextStep = "Configurar o modo Stripe quando a operacao comercial estiver pronta.";
  if (!enabled) nextStep = "Marcar provider Stripe ou modo assinatura da plataforma para ativar este trilho.";
  else if (missing.length > 0) nextStep = "Preencher os itens faltantes antes de criar ou sincronizar a assinatura.";
  else nextStep = "Pronto para sincronizar checkout, assinatura e webhook do Stripe.";

  return {
    enabled,
    planId: plan.id,
    planLabel: plan.label,
    planPrice: plan.monthlyPrice,
    stripeEnvKey: plan.stripeEnvKey,
    resolvedPriceId: resolvedPriceId || null,
    subscriptionStatus: clean(input.stripeSubscriptionStatus, 80) || null,
    currentPeriodEnd: clean(input.stripeCurrentPeriodEnd, 40) || null,
    customerId: clean(input.stripeCustomerId, 180) || null,
    subscriptionId: clean(input.stripeSubscriptionId, 180) || null,
    checkoutUrl: clean(input.stripeCheckoutUrl, 800) || null,
    customerPortalUrl: clean(input.stripeCustomerPortalUrl, 800) || null,
    missing,
    nextStep,
  };
}
