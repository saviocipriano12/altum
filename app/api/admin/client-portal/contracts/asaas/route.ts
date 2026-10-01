import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { asaasRequest, AsaasApiError } from "@/lib/server/asaas-api";
import { cancelPlatformSubscription } from "@/lib/server/subscription-cancellation";

type Body = {
  clientId?: string;
  tenantId?: string;
  action?: "create_subscription" | "update_subscription" | "cancel_subscription" | string;
};

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function nextDueDate(value: unknown) {
  const candidate = clean(value, 16);
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate) && new Date(`${candidate}T12:00:00`).getTime() >= Date.now() - 86_400_000) {
    return candidate;
  }
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function financeStatus(value: unknown) {
  const status = clean(value, 40).toUpperCase();
  if (status === "RECEIVED" || status === "CONFIRMED") return "pago";
  if (status === "OVERDUE") return "atrasado";
  if (status === "DELETED" || status === "REFUNDED") return "cancelado";
  return "pendente";
}

async function syncOpenSubscriptionCharge(input: { tenantId: string; clientId: string; subscriptionId: string; contract: Record<string, unknown> }) {
  const payload = await asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions/${encodeURIComponent(input.subscriptionId)}/payments?limit=12`);
  const payment = payload.data?.find((row) => !["RECEIVED", "CONFIRMED", "DELETED", "REFUNDED"].includes(clean(row.status, 40).toUpperCase())) || payload.data?.[0];
  const chargeId = clean(payment?.id, 180);
  if (!chargeId || !payment) return null;
  const dueDate = clean(payment.dueDate, 20) || nextDueDate(input.contract.nextDueDate);
  const invoiceUrl = clean(payment.invoiceUrl, 500) || null;
  await adminDb.collection("financeiro").doc(`asaas_subscription_${chargeId}`).set({
    tenantId: input.tenantId, clientId: input.clientId, contractId: input.clientId,
    descricao: clean(input.contract.title, 180) || "Assinatura Altum",
    valor: toMoney(payment.value || input.contract.monthlyValue), status: financeStatus(payment.status),
    dueDate, vencimento: dueDate, contractDueDate: dueDate,
    billingType: clean(payment.billingType, 40) || clean(input.contract.autoBillingBillingType, 40) || "PIX",
    asaasChargeId: chargeId, asaasSubscriptionId: input.subscriptionId,
    invoiceUrl, paymentLink: invoiceUrl, contractAutoBilling: true,
    updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { chargeId, invoiceUrl, dueDate };
}

async function resolveTenantId(clientId: string, explicitTenantId?: string) {
  const explicit = clean(explicitTenantId, 140);
  if (explicit) return explicit;
  const direct = await adminDb.collection("tenants").doc(clientId).get();
  if (direct.exists) return direct.id;
  const legacy = await adminDb.collection("tenants").where("legacyClientId", "==", clientId).limit(1).get();
  return legacy.empty ? "" : legacy.docs[0].id;
}

export async function POST(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
    const body = (await req.json()) as Body;
    const clientId = clean(body.clientId, 140);
    if (!clientId) return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    const action = clean(body.action, 60);
    if (action !== "create_subscription" && action !== "update_subscription" && action !== "cancel_subscription") {
      return NextResponse.json({ error: "Acao Asaas invalida." }, { status: 400 });
    }

    const tenantId = await resolveTenantId(clientId, body.tenantId);
    if (!tenantId) return NextResponse.json({ error: "Tenant nao encontrado para esta empresa." }, { status: 404 });

    const [tenantSnap, contractSnap, clientSnap] = await Promise.all([
      adminDb.collection("tenants").doc(tenantId).get(),
      adminDb.collection("client_contracts").doc(clientId).get(),
      adminDb.collection("clientes").doc(clientId).get(),
    ]);
    if (!contractSnap.exists) {
      return NextResponse.json({ error: "Salve a oferta da empresa antes de gerar a assinatura Asaas." }, { status: 409 });
    }
    const tenant = (tenantSnap.data() || {}) as Record<string, unknown>;
    const contract = contractSnap.data() as Record<string, unknown>;
    const client = (clientSnap.data() || {}) as Record<string, unknown>;
    const currentSubscriptionId = clean(tenant.asaasSubscriptionId || contract.asaasSubscriptionId, 180);
    const currentSubscriptionStatus = clean(tenant.asaasSubscriptionStatus || contract.asaasSubscriptionStatus, 80).toUpperCase();
    if (action === "create_subscription" && currentSubscriptionId && currentSubscriptionStatus !== "INACTIVE" && currentSubscriptionStatus !== "DELETED") {
      return NextResponse.json({ error: "Esta empresa já possui uma assinatura Asaas ativa. Cancele ou concilie a assinatura atual antes de gerar outra." }, { status: 409 });
    }

    const monthlyValue = toMoney(contract.monthlyValue);
    const name = clean(tenant.name || contract.clientName || client.name || client.nome, 180) || "Cliente Altum";
    if (action === "cancel_subscription") {
      if (!currentSubscriptionId) return NextResponse.json({ error: "Esta empresa não possui uma assinatura Asaas para cancelar." }, { status: 409 });
      const result = await cancelPlatformSubscription({
        tenantId,
        contractId: clientId,
        subscriptionId: currentSubscriptionId,
        actorId: actor.uid,
        reason: clean(contract.billingNotes || contract.notes, 300) || "Cancelamento solicitado pela Altum",
      });
      await adminDb.collection("client_contracts").doc(clientId).set({
        platformAccessStatus: String(result.action),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return NextResponse.json(result);
    }

    if (monthlyValue <= 0) {
      return NextResponse.json({ error: "Informe e salve uma mensalidade maior que R$ 0,00 antes de gerar ou alterar a assinatura." }, { status: 400 });
    }

    if (action === "update_subscription") {
      if (!currentSubscriptionId) return NextResponse.json({ error: "Crie a assinatura Asaas antes de tentar alterá-la." }, { status: 409 });
      const dueDate = nextDueDate(contract.nextDueDate);
      const updated = await asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(currentSubscriptionId)}`, {
        method: "PUT",
        body: {
          value: monthlyValue,
          nextDueDate: dueDate,
          billingType: clean(contract.autoBillingBillingType, 40) || "PIX",
          description: clean(contract.title, 180) || `Assinatura Altum — ${name}`,
          updatePendingPayments: false,
        },
      });
      const providerDueDate = clean(updated.nextDueDate, 16) || dueDate;
      const batch = adminDb.batch();
      batch.set(adminDb.collection("tenants").doc(tenantId), {
        billingProvider: "asaas", asaasNextDueDate: providerDueDate,
        asaasBillingType: clean(updated.billingType, 40) || clean(contract.autoBillingBillingType, 40) || "PIX",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("client_contracts").doc(clientId), {
        billingProvider: "asaas", platformAccessMode: "asaas_subscription",
        asaasNextDueDate: providerDueDate,
        asaasSubscriptionStatus: clean(updated.status, 80) || currentSubscriptionStatus || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), {
        type: "asaas_subscription_updated_by_admin", tenantId, clientId, actorId: actor.uid, actorName: actor.name,
        subscriptionId: currentSubscriptionId, monthlyValue, dueDate: providerDueDate, createdAt: FieldValue.serverTimestamp(),
      });
      await batch.commit();
      const charge = await syncOpenSubscriptionCharge({ tenantId, clientId, subscriptionId: currentSubscriptionId, contract }).catch(() => null);
      return NextResponse.json({ ok: true, action, subscriptionId: currentSubscriptionId, nextDueDate: providerDueDate, status: clean(updated.status, 80) || null, paymentLink: charge?.invoiceUrl || null });
    }

    const email = clean(tenant.responsibleEmail || client.email, 180).toLowerCase();
    if (!email) return NextResponse.json({ error: "Cadastre o e-mail do responsável da empresa para criar a assinatura no Asaas." }, { status: 400 });
    const phone = clean(tenant.responsiblePhone || client.phone || client.telefone || client.whatsapp, 40);
    const cpfCnpj = clean(tenant.cpfCnpj || client.cpfCnpj || client.document, 24).replace(/\D/g, "");

    let customerId = clean(tenant.asaasCustomerId || contract.asaasCustomerId, 180);
    if (!customerId) {
      const found = await asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/customers?email=${encodeURIComponent(email)}&limit=1`);
      customerId = clean(found.data?.[0]?.id, 180);
      if (!customerId) {
        const created = await asaasRequest<Record<string, unknown>>("/customers", {
          method: "POST",
          body: {
            name,
            email,
            ...(phone ? { mobilePhone: phone } : {}),
            ...(cpfCnpj ? { cpfCnpj } : {}),
          },
        });
        customerId = clean(created.id, 180);
      }
    }
    if (!customerId) throw new AsaasApiError("O Asaas não retornou o cliente de cobrança.", 502, null);

    const dueDate = nextDueDate(contract.nextDueDate);
    const subscription = await asaasRequest<Record<string, unknown>>("/subscriptions", {
      method: "POST",
      body: {
        customer: customerId,
        billingType: clean(contract.autoBillingBillingType, 40) || "PIX",
        value: monthlyValue,
        nextDueDate: dueDate,
        cycle: "MONTHLY",
        description: clean(contract.title, 180) || `Assinatura Altum — ${name}`,
        externalReference: `altum:${tenantId}:admin:${Date.now()}`,
      },
    });
    const subscriptionId = clean(subscription.id, 180);
    if (!subscriptionId) throw new AsaasApiError("O Asaas não retornou a assinatura.", 502, subscription);

    const subscriptionStatus = clean(subscription.status, 80) || "ACTIVE";
    const providerDueDate = clean(subscription.nextDueDate, 16) || dueDate;
    const batch = adminDb.batch();
    batch.set(adminDb.collection("tenants").doc(tenantId), {
      billingProvider: "asaas", billingStatus: "pending", platformAccessMode: "asaas_subscription",
      asaasCustomerId: customerId, asaasSubscriptionId: subscriptionId,
      asaasSubscriptionStatus: subscriptionStatus, asaasNextDueDate: providerDueDate,
      asaasBillingType: clean(subscription.billingType, 40) || clean(contract.autoBillingBillingType, 40) || "PIX",
      billingBlockAt: FieldValue.delete(), blockedReason: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.collection("client_contracts").doc(clientId), {
      billingProvider: "asaas", platformAccessMode: "asaas_subscription", platformAccessStatus: "pending",
      asaasCustomerId: customerId, asaasSubscriptionId: subscriptionId, asaasSubscriptionStatus: subscriptionStatus,
      asaasNextDueDate: providerDueDate, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "asaas_subscription_created_by_admin", tenantId, clientId, actorId: actor.uid, actorName: actor.name,
      monthlyValue, dueDate: providerDueDate, customerId, subscriptionId, createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    const charge = await syncOpenSubscriptionCharge({ tenantId, clientId, subscriptionId, contract }).catch(() => null);

    return NextResponse.json({ ok: true, tenantId, customerId, subscriptionId, status: subscriptionStatus, nextDueDate: providerDueDate, paymentLink: charge?.invoiceUrl || null });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof AsaasApiError) return NextResponse.json({ error: error.message, details: error.details }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    console.error("Erro ao criar assinatura Asaas pelo admin:", error);
    return NextResponse.json({ error: "Falha ao criar assinatura Asaas." }, { status: 500 });
  }
}
