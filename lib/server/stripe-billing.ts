import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getPlatformBillingPlan } from "@/lib/platform-billing";

type ContractStripeRecord = Record<string, unknown> & { id: string };

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unixToYmd(value: unknown) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function normalizeAccessForSubscriptionStatus(status: string) {
  const normalized = clean(status, 80).toLowerCase();
  if (normalized === "active") {
    return { contractAccessStatus: "active", tenantStatus: "active", billingStatus: "active", blockedReason: null };
  }
  if (normalized === "trialing") {
    return { contractAccessStatus: "trial", tenantStatus: "active", billingStatus: "active", blockedReason: null };
  }
  if (normalized === "incomplete" || normalized === "past_due") {
    return { contractAccessStatus: "pending", tenantStatus: "blocked", billingStatus: "blocked", blockedReason: "stripe_payment_pending" };
  }
  return { contractAccessStatus: "blocked", tenantStatus: "blocked", billingStatus: "blocked", blockedReason: "stripe_subscription_inactive" };
}

function resolveSiteUrl(req?: Request | null) {
  const envUrl = clean(process.env.NEXT_PUBLIC_SITE_URL, 500).replace(/\/+$/, "");
  if (envUrl) return envUrl;
  if (!req) return "http://localhost:3000";
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function getStripeServer() {
  const secretKey = clean(process.env.STRIPE_SECRET_KEY, 400);
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY nao configurada.");
  }
  return new Stripe(secretKey);
}

export function resolveStripePriceId(input: {
  platformPlan?: string | null;
  stripePriceId?: string | null;
}) {
  const explicit = clean(input.stripePriceId, 180);
  if (explicit) return explicit;

  const plan = getPlatformBillingPlan(input.platformPlan);
  if (!plan.stripeEnvKey) return "";
  return clean(process.env[plan.stripeEnvKey], 200);
}

async function resolveTenantByClientId(clientId: string) {
  const snap = await adminDb
    .collection("tenants")
    .where("legacyClientId", "==", clientId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, unknown>) };
}

async function findContractByStripeRefs(input: {
  clientId?: string | null;
  subscriptionId?: string | null;
  customerId?: string | null;
}): Promise<ContractStripeRecord | null> {
  const clientId = clean(input.clientId, 140);
  if (clientId) {
    const doc = await adminDb.collection("client_contracts").doc(clientId).get();
    if (doc.exists) {
      return { id: doc.id, ...(doc.data() as Record<string, unknown>) };
    }
  }

  const subscriptionId = clean(input.subscriptionId, 180);
  if (subscriptionId) {
    const snap = await adminDb
      .collection("client_contracts")
      .where("stripeSubscriptionId", "==", subscriptionId)
      .limit(1)
      .get();
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, unknown>) };
    }
  }

  const customerId = clean(input.customerId, 180);
  if (customerId) {
    const snap = await adminDb
      .collection("client_contracts")
      .where("stripeCustomerId", "==", customerId)
      .limit(1)
      .get();
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...(snap.docs[0].data() as Record<string, unknown>) };
    }
  }

  return null;
}

export async function ensureStripeCustomerForContract(input: {
  clientId: string;
  tenantId?: string | null;
  clientName: string;
  email?: string | null;
  phone?: string | null;
  existingCustomerId?: string | null;
}) {
  const stripe = getStripeServer();
  const existingCustomerId = clean(input.existingCustomerId, 180);
  if (existingCustomerId) {
    try {
      const current = await stripe.customers.retrieve(existingCustomerId);
      if (!("deleted" in current && current.deleted)) {
        return current;
      }
    } catch (error) {
      console.warn("Falha ao reutilizar customer Stripe existente:", existingCustomerId, error);
    }
  }

  const customer = await stripe.customers.create({
    name: clean(input.clientName, 180) || "Cliente Altum",
    email: clean(input.email, 180) || undefined,
    phone: clean(input.phone, 40) || undefined,
    metadata: {
      clientId: clean(input.clientId, 140),
      tenantId: clean(input.tenantId, 140) || "",
      source: "altum_admin_contract",
    },
  });

  return customer;
}

export async function createStripeSubscriptionCheckout(input: {
  req: Request;
  clientId: string;
  tenantId?: string | null;
  clientName: string;
  email?: string | null;
  phone?: string | null;
  platformPlan?: string | null;
  stripePriceId?: string | null;
  stripeCustomerId?: string | null;
  monthlyValue?: number | null;
  actorId?: string | null;
  actorName?: string | null;
}) {
  const stripe = getStripeServer();
  const priceId = resolveStripePriceId({
    platformPlan: input.platformPlan,
    stripePriceId: input.stripePriceId,
  });

  if (!priceId) {
    throw new Error("Nenhum price ID Stripe encontrado para este plano.");
  }

  const siteUrl = resolveSiteUrl(input.req);
  const customer = await ensureStripeCustomerForContract({
    clientId: input.clientId,
    tenantId: input.tenantId,
    clientName: input.clientName,
    email: input.email,
    phone: input.phone,
    existingCustomerId: input.stripeCustomerId,
  });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    client_reference_id: clean(input.clientId, 140),
    success_url: `${siteUrl}/admin/clientes/${encodeURIComponent(input.clientId)}/portal?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/admin/clientes/${encodeURIComponent(input.clientId)}/portal?stripe=cancel`,
    allow_promotion_codes: true,
    locale: "pt-BR",
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: {
      clientId: clean(input.clientId, 140),
      tenantId: clean(input.tenantId, 140) || "",
      platformPlan: clean(input.platformPlan, 120) || "",
      monthlyValue: String(Number(toNumber(input.monthlyValue).toFixed(2))),
      source: "altum_admin_contract",
    },
    subscription_data: {
      metadata: {
        clientId: clean(input.clientId, 140),
        tenantId: clean(input.tenantId, 140) || "",
        platformPlan: clean(input.platformPlan, 120) || "",
        source: "altum_admin_contract",
      },
    },
  });

  await Promise.all([
    adminDb.collection("client_contracts").doc(input.clientId).set(
      {
        billingProvider: "stripe",
        platformAccessMode: "stripe_subscription",
        platformAccessStatus: "pending",
        stripeCustomerId: customer.id,
        stripePriceId: priceId,
        stripeCheckoutUrl: clean(session.url, 800) || null,
        stripeCheckoutSessionId: session.id,
        stripeCheckoutCreatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: "stripe_checkout_created",
      clientId: clean(input.clientId, 140),
      tenantId: clean(input.tenantId, 140) || null,
      stripeCustomerId: customer.id,
      stripePriceId: priceId,
      stripeCheckoutSessionId: session.id,
      actorId: clean(input.actorId, 140) || "stripe_admin",
      actorName: clean(input.actorName, 180) || "Admin Altum",
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return {
    checkoutUrl: clean(session.url, 800) || "",
    checkoutSessionId: session.id,
    customerId: customer.id,
    priceId,
  };
}

export async function createStripeCustomerPortalSession(input: {
  req: Request;
  clientId: string;
  tenantId?: string | null;
  stripeCustomerId?: string | null;
  actorId?: string | null;
  actorName?: string | null;
}) {
  const stripe = getStripeServer();
  const customerId = clean(input.stripeCustomerId, 180);
  if (!customerId) {
    throw new Error("Cliente ainda sem Stripe customer ID.");
  }

  const siteUrl = resolveSiteUrl(input.req);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${siteUrl}/admin/clientes/${encodeURIComponent(input.clientId)}/portal`,
  });

  await Promise.all([
    adminDb.collection("client_contracts").doc(input.clientId).set(
      {
        stripeCustomerPortalUrl: clean(session.url, 800) || null,
        stripeCustomerPortalOpenedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: "stripe_customer_portal_created",
      clientId: clean(input.clientId, 140),
      tenantId: clean(input.tenantId, 140) || null,
      stripeCustomerId: customerId,
      actorId: clean(input.actorId, 140) || "stripe_admin",
      actorName: clean(input.actorName, 180) || "Admin Altum",
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return {
    portalUrl: clean(session.url, 800) || "",
    customerId,
  };
}

export async function syncContractFromStripeSubscription(input: {
  subscription: Stripe.Subscription;
  customerId?: string | null;
  eventType: string;
  checkoutSessionId?: string | null;
}) {
  const metadata = input.subscription.metadata || {};
  const customerId =
    clean(input.customerId, 180) ||
    (typeof input.subscription.customer === "string" ? input.subscription.customer : "");
  const contract = await findContractByStripeRefs({
    clientId: clean(metadata.clientId, 140),
    subscriptionId: clean(input.subscription.id, 180),
    customerId,
  });

  if (!contract) {
    return { found: false, reason: "contract_not_found" };
  }

  const clientId = clean(contract.id, 140);
  const tenantRef =
    clean(metadata.tenantId, 140) ||
    clean(contract.tenantId, 140) ||
    clean(contract.legacyTenantId, 140);
  const tenant = tenantRef ? { id: tenantRef } : await resolveTenantByClientId(clientId);
  const tenantId = clean(tenant?.id, 140);

  const firstItem = input.subscription.items.data[0];
  const priceId =
    clean(firstItem?.price?.id, 180) ||
    clean(contract.stripePriceId, 180) ||
    resolveStripePriceId({
      platformPlan: clean(contract.platformPlan, 120),
      stripePriceId: clean(contract.stripePriceId, 180),
    });
  const currentPeriodEnd = unixToYmd(firstItem?.current_period_end);
  const access = normalizeAccessForSubscriptionStatus(clean(input.subscription.status, 80));

  await Promise.all([
    adminDb.collection("client_contracts").doc(clientId).set(
      {
        billingProvider: "stripe",
        platformAccessMode: "stripe_subscription",
        platformAccessStatus: access.contractAccessStatus,
        stripeCustomerId: customerId || clean(contract.stripeCustomerId, 180) || null,
        stripeSubscriptionId: clean(input.subscription.id, 180) || null,
        stripePriceId: priceId || null,
        stripeSubscriptionStatus: clean(input.subscription.status, 80) || null,
        stripeCurrentPeriodEnd: currentPeriodEnd,
        stripeCheckoutSessionId: clean(input.checkoutSessionId, 180) || null,
        stripeLastWebhookEventType: clean(input.eventType, 120),
        stripeLastWebhookAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    adminDb.collection("audit_logs").add({
      type: "stripe_subscription_synced",
      clientId,
      tenantId: tenantId || null,
      stripeCustomerId: customerId || null,
      stripeSubscriptionId: clean(input.subscription.id, 180) || null,
      stripeStatus: clean(input.subscription.status, 80) || null,
      eventType: clean(input.eventType, 120),
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  if (tenantId) {
    await Promise.all([
      adminDb.collection("tenants").doc(tenantId).set(
        {
          status: access.tenantStatus,
          billingStatus: access.billingStatus,
          blockedReason: access.blockedReason,
          stripeCustomerId: customerId || null,
          stripeSubscriptionId: clean(input.subscription.id, 180) || null,
          stripeSubscriptionStatus: clean(input.subscription.status, 80) || null,
          stripeCurrentPeriodEnd: currentPeriodEnd,
          billingUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("tenant_settings").doc(tenantId).set(
        {
          billing: {
            provider: "stripe",
            status: access.billingStatus,
            reason: access.blockedReason,
            stripeCustomerId: customerId || null,
            stripeSubscriptionId: clean(input.subscription.id, 180) || null,
            stripeSubscriptionStatus: clean(input.subscription.status, 80) || null,
            stripeCurrentPeriodEnd: currentPeriodEnd,
            updatedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
    ]);
  }

  return {
    found: true,
    clientId,
    tenantId: tenantId || null,
    contractAccessStatus: access.contractAccessStatus,
    subscriptionStatus: clean(input.subscription.status, 80),
  };
}

function resolveInvoiceDueDate(invoice: Stripe.Invoice) {
  const dueDate = unixToYmd((invoice as Stripe.Invoice & { due_date?: number | null }).due_date);
  if (dueDate) return dueDate;

  const line = invoice.lines.data[0];
  const periodEnd = unixToYmd(line?.period?.end);
  if (periodEnd) return periodEnd;

  const nextAttempt = unixToYmd((invoice as Stripe.Invoice & { next_payment_attempt?: number | null }).next_payment_attempt);
  if (nextAttempt) return nextAttempt;

  return unixToYmd((invoice as Stripe.Invoice & { period_end?: number | null }).period_end);
}

function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscriptionFromParent =
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details?.subscription
      : null;

  if (typeof subscriptionFromParent === "string") return subscriptionFromParent;
  if (
    subscriptionFromParent &&
    typeof subscriptionFromParent === "object" &&
    "id" in subscriptionFromParent &&
    typeof subscriptionFromParent.id === "string"
  ) {
    return subscriptionFromParent.id;
  }

  return "";
}

function mapInvoiceStatus(invoice: Stripe.Invoice, eventType: string) {
  const normalized = clean(invoice.status, 80).toLowerCase();
  if (eventType === "invoice.paid" || normalized === "paid") return "pago";
  if (eventType === "invoice.payment_failed" || normalized === "uncollectible") return "atrasado";
  if (normalized === "void" || normalized === "deleted") return "cancelado";
  return "pendente";
}

export async function upsertStripeFinanceFromInvoice(input: {
  invoice: Stripe.Invoice;
  eventType: string;
}) {
  const customerId =
    typeof input.invoice.customer === "string" ? input.invoice.customer : "";
  const subscriptionId = resolveInvoiceSubscriptionId(input.invoice);
  const contract = await findContractByStripeRefs({
    clientId: clean(input.invoice.metadata?.clientId, 140),
    subscriptionId,
    customerId,
  });

  if (!contract) {
    return { found: false, reason: "contract_not_found" };
  }

  const clientId = clean(contract.id, 140);
  const tenant =
    clean(contract.tenantId, 140) ? { id: clean(contract.tenantId, 140) } : await resolveTenantByClientId(clientId);
  const tenantId = clean(tenant?.id, 140);
  const invoiceId = clean(input.invoice.id, 180);
  const financeSnap = await adminDb
    .collection("financeiro")
    .where("stripeInvoiceId", "==", invoiceId)
    .limit(1)
    .get();

  const amount = Number(
    (toNumber(input.invoice.amount_paid || input.invoice.amount_due || input.invoice.total) / 100).toFixed(2)
  );
  const dueDate = resolveInvoiceDueDate(input.invoice);
  const status = mapInvoiceStatus(input.invoice, input.eventType);
  const payload = {
    descricao: `Mensalidade plataforma - ${clean(contract.clientName, 180) || "Cliente Altum"}`,
    valor: amount,
    tipo: "Receita",
    categoria: "Mensalidade",
    status,
    payoutStatus: "pendente",
    referencia: "Stripe Subscription",
    clientId,
    clientName: clean(contract.clientName, 180) || "Cliente Altum",
    tenantId: tenantId || null,
    contractId: clientId,
    contractDueDate: dueDate,
    vencimento: dueDate,
    billingProvider: "stripe",
    billingType: "subscription",
    stripeInvoiceId: invoiceId,
    stripeInvoiceStatus: clean(input.invoice.status, 80) || null,
    stripeCustomerId: customerId || null,
    stripeSubscriptionId: subscriptionId || null,
    invoiceUrl: clean(input.invoice.hosted_invoice_url, 800) || null,
    paymentLink: clean(input.invoice.hosted_invoice_url, 800) || null,
    dataPagamento: status === "pago" ? FieldValue.serverTimestamp() : null,
    paymentConfirmedAt: status === "pago" ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (financeSnap.empty) {
    await adminDb.collection("financeiro").add({
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else {
    await financeSnap.docs[0].ref.set(payload, { merge: true });
  }

  await adminDb.collection("audit_logs").add({
    type: "stripe_invoice_synced",
    clientId,
    tenantId: tenantId || null,
    stripeInvoiceId: invoiceId,
    stripeSubscriptionId: subscriptionId || null,
    invoiceStatus: clean(input.invoice.status, 80) || null,
    eventType: clean(input.eventType, 120),
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    found: true,
    clientId,
    tenantId: tenantId || null,
    invoiceId,
    status,
  };
}
