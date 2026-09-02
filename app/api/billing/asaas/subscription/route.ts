import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getDefaultTenantMembershipForUser } from "@/lib/server/tenant";
import { getPlatformPlan } from "@/lib/server/platform-plans";
import { applyPlatformPlanEntitlements } from "@/lib/server/platform-plan-entitlements";
import { asaasRequest, AsaasApiError } from "@/lib/server/asaas-api";
import {
  isPlanUpgrade,
  isWithinRefundWindow,
  parseBillingDate,
  REFUND_WINDOW_DAYS,
} from "@/lib/platform-subscription-policy";
import {
  requireFirebaseUser,
  SelfServiceAuthError,
  timestampToMillis,
} from "@/lib/server/self-service-auth";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toIso(value: unknown) {
  const millis = timestampToMillis(value);
  return millis ? new Date(millis).toISOString() : null;
}

async function billingContext(uid: string) {
  const membership = await getDefaultTenantMembershipForUser(uid);
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
    const { membership, tenant } = await billingContext(actor.uid);
    const subscriptionId = clean(tenant.asaasSubscriptionId, 180);
    let providerAvailable = Boolean(subscriptionId);
    let subscription: Record<string, unknown> = {};
    let payments: Array<Record<string, unknown>> = [];

    if (subscriptionId) {
      try {
        const [subscriptionPayload, paymentsPayload] = await Promise.all([
          asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`),
          asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=12`),
        ]);
        subscription = subscriptionPayload;
        payments = paymentsPayload.data || [];
      } catch (error) {
        providerAvailable = false;
        console.error("Falha ao atualizar detalhes da assinatura no Asaas:", error);
      }
    }
    return NextResponse.json({
      ok: true,
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
        canManage: membership.role === "client_owner" || membership.role === "client_admin",
      },
      payments: payments.map((payment) => ({
        id: clean(payment.id, 180),
        status: clean(payment.status, 40),
        value: typeof payment.value === "number" ? payment.value : null,
        dueDate: clean(payment.dueDate, 40) || null,
        paidAt: clean(payment.confirmedDate, 40) || clean(payment.paymentDate, 40) || null,
        billingType: clean(payment.billingType, 40) || null,
        invoiceUrl: clean(payment.invoiceUrl, 800) || null,
        bankSlipUrl: clean(payment.bankSlipUrl, 800) || null,
      })),
      policy: { refundWindowDays: REFUND_WINDOW_DAYS, graceDays: 3 },
    });
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
    const { membership, tenantRef, tenant } = await billingContext(actor.uid);
    assertBillingOwner(membership.role);
    const body = (await req.json()) as ActionBody;
    const action = clean(body.action, 40);
    const subscriptionId = clean(tenant.asaasSubscriptionId, 180);
    if (!subscriptionId) {
      return NextResponse.json({ error: "A assinatura do Asaas ainda nao foi sincronizada." }, { status: 409 });
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
          source: "asaas_webhook",
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
      const subscription = await asaasRequest<Record<string, unknown>>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
      const payments = await asaasRequest<{ data?: Array<Record<string, unknown>> }>(`/subscriptions/${encodeURIComponent(subscriptionId)}/payments`);
      const paidPayments = (payments.data || []).filter((payment) => {
        const status = clean(payment.status, 40).toUpperCase();
        return status === "CONFIRMED" || status === "RECEIVED";
      });
      const orderedPayments = paidPayments.sort((left, right) => {
        const leftDate = parseBillingDate(left.confirmedDate || left.paymentDate || left.dateCreated)?.getTime() || 0;
        const rightDate = parseBillingDate(right.confirmedDate || right.paymentDate || right.dateCreated)?.getTime() || 0;
        return leftDate - rightDate;
      });
      const firstPaid = orderedPayments[0];
      const firstPaymentAt =
        toIso(tenant.subscriptionStartedAt) ||
        toIso(tenant.firstPaymentAt) ||
        parseBillingDate(firstPaid?.confirmedDate || firstPaid?.paymentDate || firstPaid?.dateCreated)?.toISOString() ||
        null;
      const refundEligible = isWithinRefundWindow(firstPaymentAt);
      const reason = clean(body.reason, 300) || "Cancelamento solicitado pelo cliente";

      if (refundEligible) {
        const refundable = orderedPayments[orderedPayments.length - 1];
        const paymentId = clean(refundable?.id, 180);
        if (!paymentId) {
          return NextResponse.json({ error: "Nao encontramos um pagamento elegivel para estorno." }, { status: 409 });
        }
        await tenantRef.set({
          billingStatus: "refund_pending",
          cancelRequestedAt: FieldValue.serverTimestamp(),
          refundPaymentId: paymentId,
          cancelReason: reason,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        try {
          await asaasRequest(`/payments/${encodeURIComponent(paymentId)}/refund`, {
            method: "POST",
            body: { description: reason },
          });
        } catch (error) {
          await tenantRef.set({
            billingStatus: clean(tenant.billingStatus, 40) || "active",
            cancelRequestedAt: FieldValue.delete(),
            refundPaymentId: FieldValue.delete(),
            cancelReason: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          throw error;
        }
        let subscriptionCancellationPending = false;
        try {
          await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "DELETE" });
        } catch (error) {
          subscriptionCancellationPending = true;
          console.error("Estorno iniciado, mas a assinatura ainda precisa ser removida no Asaas:", error);
        }
        await tenantRef.set({
          refundRequestedAt: FieldValue.serverTimestamp(),
          subscriptionCancellationPending,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await adminDb.collection("audit_logs").add({
          type: "asaas_refund_and_cancel_requested",
          actorId: actor.uid,
          tenantId: membership.tenantId,
          subscriptionId,
          paymentId,
          reason,
          createdAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ ok: true, action: "refund_pending", refundEligible: true, subscriptionCancellationPending });
      }

      const nextDueDate = parseBillingDate(subscription.nextDueDate);
      if (!nextDueDate || nextDueDate.getTime() <= Date.now()) {
        return NextResponse.json({ error: "O Asaas nao informou o fim do ciclo atual. Tente novamente ou fale com o suporte." }, { status: 409 });
      }
      await tenantRef.set({
        status: "active",
        billingStatus: "cancel_scheduled",
        cancelAtPeriodEnd: true,
        cancelRequestedAt: FieldValue.serverTimestamp(),
        accessEndsAt: nextDueDate,
        cancelReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      try {
        await asaasRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
          method: "PUT",
          body: { status: "INACTIVE" },
        });
      } catch (error) {
        await tenantRef.set({
          billingStatus: clean(tenant.billingStatus, 40) || "active",
          cancelAtPeriodEnd: false,
          cancelRequestedAt: FieldValue.delete(),
          accessEndsAt: FieldValue.delete(),
          cancelReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        throw error;
      }
      await Promise.all([
        adminDb.collection("client_contracts").doc(membership.tenantId).set({
          accessStatus: "cancel_scheduled",
          cancelAtPeriodEnd: true,
          accessEndsAt: nextDueDate,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        adminDb.collection("audit_logs").add({
          type: "asaas_subscription_cancel_scheduled",
          actorId: actor.uid,
          tenantId: membership.tenantId,
          subscriptionId,
          accessEndsAt: nextDueDate,
          reason,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);
      return NextResponse.json({ ok: true, action: "cancel_scheduled", accessEndsAt: nextDueDate.toISOString(), refundEligible: false });
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
