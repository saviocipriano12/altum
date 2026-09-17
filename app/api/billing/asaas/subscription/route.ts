import { after, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getDefaultTenantMembershipForUser, getTenantMembershipForUser } from "@/lib/server/tenant";
import { getPlatformPlan } from "@/lib/server/platform-plans";
import { applyPlatformPlanEntitlements } from "@/lib/server/platform-plan-entitlements";
import { asaasRequest, AsaasApiError } from "@/lib/server/asaas-api";
import {
  isPlanUpgrade,
  isWithinRefundWindow,
  REFUND_WINDOW_DAYS,
} from "@/lib/platform-subscription-policy";
import {
  requireFirebaseUser,
  SelfServiceAuthError,
  timestampToMillis,
} from "@/lib/server/self-service-auth";
import { getTenantCommercialUsage } from "@/lib/server/tenant-usage";
import { cancelPlatformSubscription } from "@/lib/server/subscription-cancellation";
import { deliverSubscriptionReceipts } from "@/lib/server/subscription-notifications";
import { billingLink, paidAccessEnd } from "@/lib/subscription-lifecycle";
import type { AsaasInvoice } from "@/lib/vendor/asaas/invoice";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toIso(value: unknown) {
  const millis = timestampToMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

async function billingContext(uid: string, tenantIdHint?: unknown) {
  const requestedTenantId = clean(tenantIdHint, 180);
  const membership = requestedTenantId
    ? await getTenantMembershipForUser(uid, requestedTenantId)
    : await getDefaultTenantMembershipForUser(uid);
  if (!membership || membership.status !== "active") {
    throw new SelfServiceAuthError(403, "tenant_not_found", "Conta da empresa nao encontrada.");
  }
  const tenantRef = adminDb.collection("tenants").doc(membership.tenantId);
  const tenantSnap = await tenantRef.get();
  return {
    membership,
    tenantRef,
    tenant: (tenantSnap.data() || {}) as Record<string, unknown>,
  };
}

function assertBillingOwner(role: unknown) {
  if (role !== "client_owner" && role !== "client_admin") {
    throw new SelfServiceAuthError(403, "billing_owner_required", "Apenas o responsavel pela conta pode alterar a assinatura.");
  }
}

export async function GET(req: Request) {
  try {
    const actor = await requireFirebaseUser(req);
    const { searchParams } = new URL(req.url);
    const { membership, tenant } = await billingContext(actor.uid, searchParams.get("tenantId"));
    assertBillingOwner(membership.role);
    const subscriptionId = clean(tenant.asaasSubscriptionId, 180);
    const providerReads = subscriptionId ? Promise.allSettled([
      asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`),
      asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=24`),
      asaasRequest<{ data?: AsaasInvoice[] }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/invoices?limit=24`),
    ]) : Promise.resolve([]);
    const [usage, entitlements, providerResults, operations] = await Promise.all([
      getTenantCommercialUsage(membership.tenantId).catch(() => null),
      getTenantEntitlements(membership.tenantId), providerReads,
      adminDb.collection("billing_operations").where("tenantId", "==", membership.tenantId).limit(30).get(),
    ]);
    const subscriptionResult = providerResults[0];
    const paymentsResult = providerResults[1];
    const invoicesResult = providerResults[2];
    const subscription: Record<string, unknown> = subscriptionResult?.status === "fulfilled" ? subscriptionResult.value : {};
    const paymentsPayload = paymentsResult?.status === "fulfilled" ? paymentsResult.value as { data?: Array<Record<string, unknown>> } : null;
    const payments = paymentsPayload?.data || (Array.isArray(tenant.billingPaymentsSnapshot) ? tenant.billingPaymentsSnapshot as Array<Record<string, unknown>> : []);
    const invoicesPayload = invoicesResult?.status === "fulfilled" ? invoicesResult.value as { data?: AsaasInvoice[] } : null;
    const invoices = invoicesPayload?.data || [];
    const invoicesAvailable = Boolean(invoicesPayload);
    const providerAvailable = subscriptionResult?.status === "fulfilled" || paymentsResult?.status === "fulfilled" || tenant.asaasSubscriptionStatus === "DELETED";
    const activity = operations.docs.map((doc) => ({ id: doc.id, action: "cancel",
      createdAt: toIso(doc.data().createdAt), protocol: clean(doc.data().result?.protocol, 80) || null,
      pending: doc.data().status !== "completed" })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const paidEnd = paidAccessEnd(payments);
    const responseData = {
      ok: true,
      invoicesAvailable,
      activity,
      invoices: invoices.map((invoice) => ({ id: invoice.id, status: invoice.status, number: invoice.number || null,
        value: invoice.value, effectiveDate: invoice.effectiveDate, pdfUrl: billingLink(invoice.pdfUrl), xmlUrl: billingLink(invoice.xmlUrl) })),
      billing: {
        tenantId: membership.tenantId,
        status: clean(tenant.billingStatus, 40) || "trial",
        planId: clean(tenant.platformPlan, 80) || "essencial",
        pendingPlanId: clean(tenant.pendingPlan, 80) || null,
        trialEndsAt: toIso(tenant.trialEndsAt),
        blockAt: toIso(tenant.billingBlockAt),
        accessEndsAt: toIso(tenant.accessEndsAt),
        cancelAtPeriodEnd: Boolean(tenant.cancelAtPeriodEnd),
        subscriptionId: subscriptionId || null,
        nextDueDate: clean(subscription.nextDueDate, 40) || clean(tenant.asaasNextDueDate, 40) || null,
        billingType: clean(subscription.billingType, 40) || clean(tenant.asaasBillingType, 40) || null,
        value: typeof subscription.value === "number" ? subscription.value : null,
        providerAvailable,
        fiscalStatus: clean(tenant.billingFiscalStatus, 80) || "not_configured",
        operationPending: Boolean(tenant.billingOperationPending),
        cancelProtocol: clean(tenant.cancelProtocol, 80) || null,
        paidAccessEndsAt: paidEnd?.toISOString() || toIso(tenant.accessEndsAt),
        refundEligible: isWithinRefundWindow(toIso(tenant.subscriptionStartedAt) || toIso(tenant.firstPaymentAt)),
        canManage: membership.role === "client_owner" || membership.role === "client_admin",
      },
      payments: payments.map((payment) => ({
        id: clean(payment.id, 180),
        status: clean(payment.status, 40),
        value: typeof payment.value === "number" ? payment.value : null,
        dueDate: clean(payment.dueDate, 40) || null,
        paidAt: clean(payment.confirmedDate, 40) || clean(payment.paymentDate, 40) || null,
        billingType: clean(payment.billingType, 40) || null,
        invoiceUrl: billingLink(payment.invoiceUrl),
        bankSlipUrl: billingLink(payment.bankSlipUrl),
      })),
      usage,
      limits: entitlements.limits,
      policy: { refundWindowDays: REFUND_WINDOW_DAYS, graceDays: 3 },
    };
    if (searchParams.get("download") === "1") {
      return new NextResponse(JSON.stringify(responseData, null, 2), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=altum-assinatura.json", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(responseData, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Falha ao consultar assinatura:", error);
    return NextResponse.json({ error: "Nao foi possivel consultar a assinatura." }, { status: 500 });
  }
}

type ActionBody = {
  action?: unknown;
  planId?: unknown;
  confirmation?: unknown;
  reason?: unknown;
};

export async function PATCH(req: Request) {
  try {
    const actor = await requireFirebaseUser(req);
    const body = (await req.json()) as ActionBody & { tenantId?: unknown };
    const { membership, tenantRef, tenant } = await billingContext(actor.uid, body.tenantId);
    assertBillingOwner(membership.role);
    const action = clean(body.action, 40);
    const subscriptionId = clean(tenant.asaasSubscriptionId, 180);
    if (!subscriptionId) {
      return NextResponse.json({ error: "A assinatura do Asaas ainda nao foi sincronizada." }, { status: 409 });
    }

    if (action === "upgrade" && tenant.billingOperationPending) {
      return NextResponse.json({ error: "Existe uma solicitacao de cancelamento em conciliacao." }, { status: 409 });
    }
    if (action === "upgrade") {
      const currentBillingStatus = clean(tenant.billingStatus, 40).toLowerCase();
      if (currentBillingStatus !== "active" && currentBillingStatus !== "paid") {
        return NextResponse.json({ error: "Regularize ou reative sua assinatura antes de fazer upgrade." }, { status: 409 });
      }
      const plan = await getPlatformPlan(body.planId);
      if (!plan || !plan.active || !plan.monthlyPrice || !plan.checkoutEnabled) {
        return NextResponse.json({ error: "Plano indisponivel para upgrade." }, { status: 400 });
      }
      if (!isPlanUpgrade(tenant.platformPlan, plan.id)) {
        return NextResponse.json({ error: "Escolha um plano superior ao plano atual." }, { status: 400 });
      }

      await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
        method: "PUT",
        body: {
          value: plan.monthlyPrice,
          description: `ALTUM ${plan.name}`,
          externalReference: `altum:${membership.tenantId}:${plan.id}`,
          updatePendingPayments: false,
        },
      });
      await Promise.all([
        tenantRef.set({
          platformPlan: plan.id,
          pendingPlan: FieldValue.delete(),
          planChangedAt: FieldValue.serverTimestamp(),
          planChangedBy: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        adminDb.collection("client_contracts").doc(membership.tenantId).set({
          platformPlan: plan.id,
          monthlyValue: plan.monthlyPrice,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        applyPlatformPlanEntitlements({
          tenantId: membership.tenantId,
          planId: plan.id,
          source: "asaas_subscription_upgrade",
          actorId: actor.uid,
          actorName: actor.name || actor.email || "Cliente",
        }),
        adminDb.collection("audit_logs").add({
          type: "asaas_subscription_upgraded",
          actorId: actor.uid,
          tenantId: membership.tenantId,
          previousPlan: clean(tenant.platformPlan, 80) || null,
          nextPlan: plan.id,
          subscriptionId,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);
      return NextResponse.json({ ok: true, action: "upgrade", planId: plan.id });
    }

    if (action === "cancel") {
      if (clean(body.confirmation, 40).toUpperCase() !== "CANCELAR") {
        return NextResponse.json({ error: "Confirme o cancelamento para continuar." }, { status: 400 });
      }
      const result = await cancelPlatformSubscription({
        tenantId: membership.tenantId, subscriptionId, actorId: actor.uid,
        reason: clean(body.reason, 300) || "Cancelamento solicitado pelo cliente",
      });
      after(() => deliverSubscriptionReceipts(membership.tenantId).then(() => undefined));
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Acao de assinatura invalida." }, { status: 400 });
  } catch (error) {
    if (error instanceof SelfServiceAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof AsaasApiError) {
      console.error("Operacao recusada pelo Asaas:", { status: error.status, details: error.details });
      return NextResponse.json({ error: "O Asaas nao conseguiu concluir a operacao. Tente novamente ou fale com o suporte." }, { status: 502 });
    }
    console.error("Falha ao gerenciar assinatura Asaas:", error);
    return NextResponse.json({ error: "Nao foi possivel alterar a assinatura." }, { status: 500 });
  }
}
