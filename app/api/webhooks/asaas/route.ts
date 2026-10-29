import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { reactivateTenantAfterBillingPayment } from "@/lib/server/contract-billing";
import { applyPlatformPlanEntitlements } from "@/lib/server/platform-plan-entitlements";
import { checkoutSubscriptionFields } from "@/lib/asaas-checkout-state";
import { getBillingBlockAt } from "@/lib/platform-subscription-policy";
import { asaasCommercialPaymentProof, commitAsaasFinanceMutation } from "@/lib/server/crm/asaas-finance-occurrence";
import { processFinancePaidOccurrence } from "@/lib/server/crm/finance-paid-occurrence";
import { processFinanceStageTransition } from "@/lib/server/crm/finance-stage-transition";
import { commitAsaasLeadPayment } from "@/lib/server/crm/asaas-lead-payment";
import { commitAsaasCommercialState } from "@/lib/server/crm/asaas-commercial-state";
import { holdAsaasCommercialContentConflict } from "@/lib/server/crm/asaas-commercial-order";

const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

function safeTokenEquals(incoming: string, expected: string) {
  const left = Buffer.from(incoming);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseSelfServiceReference(value: unknown) {
  const [prefix, tenantId, planId] = clean(value, 400).split(":");
  if (prefix !== "altum" || !tenantId || !planId) return null;
  return { tenantId: clean(tenantId, 180), planId: clean(planId, 80) };
}

type FinanceWebhookStatus = {
  status: "pendente" | "pago" | "atrasado" | "cancelado";
  title: string;
  detail: string;
  isPaid?: boolean;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeEvent(value: unknown) {
  return clean(value, 80).toUpperCase();
}

function money(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "R$ 0,00";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapWebhookStatus(event: string, payment: Record<string, unknown>): FinanceWebhookStatus | null {
  if (event === "PAYMENT_CREATED" || event === "PAYMENT_AWAITING_RISK_ANALYSIS") {
    return {
      status: "pendente",
      title: "Cobrança criada",
      detail: `Cobrança via ${clean(payment.billingType, 40) || "Asaas"} no valor de ${money(payment.value)} disponível para pagamento.`,
    };
  }
  if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
    return {
      status: "pago",
      title: "Pagamento confirmado",
      detail: `Pagamento via ${clean(payment.billingType, 40) || "Asaas"} no valor de ${money(payment.value)} confirmado.`,
      isPaid: true,
    };
  }

  if (event === "PAYMENT_OVERDUE") {
    return {
      status: "atrasado",
      title: "Pagamento em atraso",
      detail: "A cobranca entrou em atraso no Asaas. Revisar follow-up financeiro.",
    };
  }

  if (event === "PAYMENT_RESTORED") {
    return {
      status: "pendente",
      title: "Cobranca reaberta",
      detail: "A cobranca foi restaurada no Asaas e voltou para status pendente.",
    };
  }

  if (
    event === "PAYMENT_DELETED" ||
    event === "PAYMENT_CANCELED" ||
    event === "PAYMENT_REFUNDED" ||
    event === "PAYMENT_REFUND_IN_PROGRESS" ||
    event === "PAYMENT_CHARGEBACK_REQUESTED" ||
    event === "PAYMENT_CHARGEBACK_DISPUTE"
  ) {
    return {
      status: "cancelado",
      title: "Cobranca cancelada",
      detail: "A cobranca foi cancelada/estornada no Asaas.",
    };
  }

  return null;
}

export async function POST(req: Request) {
  let eventLedgerRef: FirebaseFirestore.DocumentReference | null = null;
  let ledgerClaimed = false;
  try {
    if (!ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json(
        { error: "ASAAS_WEBHOOK_TOKEN nao configurado no servidor." },
        { status: 503 }
      );
    }

    const incoming = req.headers.get("asaas-access-token") || req.headers.get("x-webhook-token");
    if (!incoming || !safeTokenEquals(incoming, ASAAS_WEBHOOK_TOKEN)) {
      return NextResponse.json({ error: "Webhook nao autorizado." }, { status: 401 });
    }

    const rawBody = await req.text();
    const body = JSON.parse(rawBody);
    const event = normalizeEvent(body?.event);
    const payment = body?.payment && typeof body.payment === "object"
      ? (body.payment as Record<string, unknown>)
      : {};
    const checkout = body?.checkout && typeof body.checkout === "object"
      ? (body.checkout as Record<string, unknown>)
      : {};
    const subscription = body?.subscription && typeof body.subscription === "object"
      ? (body.subscription as Record<string, unknown>)
      : {};

    const chargeId = clean(payment.id, 140);
    const checkoutId = clean(checkout.id, 180);
    const webhookSubscriptionId = clean(subscription.id, 180);
    if (!chargeId && !checkoutId && !webhookSubscriptionId) {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    const eventKey = createHash("sha256")
      .update(clean(body?.id, 180) || `${event}:${chargeId || checkoutId || webhookSubscriptionId}:${clean(payment.status, 80) || clean(checkout.status, 80) || clean(subscription.status, 80)}`)
      .digest("hex");
    eventLedgerRef = adminDb.collection("asaas_webhook_events_internal").doc(eventKey);
    const commercialPayment = chargeId && event.startsWith("PAYMENT_") ? asaasCommercialPaymentProof(event, payment, body.dateCreated) : null;
    const duplicate = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(eventLedgerRef!);
      if (commercialPayment && snapshot.data()?.commercialPayment && snapshot.data()?.commercialPayment.protocol !== commercialPayment.protocol) {
        await holdAsaasCommercialContentConflict(transaction, [chargeId, String(snapshot.data()?.chargeId || "")], eventKey, "legacy_proof_protocol_requires_review");
        return "legacy_proof";
      }
      if (commercialPayment && snapshot.data()?.commercialPayment && snapshot.data()?.commercialPayment.fingerprint !== commercialPayment.fingerprint) {
        await holdAsaasCommercialContentConflict(transaction, [chargeId, String(snapshot.data()?.chargeId || "")], eventKey);
        return "content_changed";
      }
      if (snapshot.exists && snapshot.data()?.status === "completed") return true;
      if (snapshot.data()?.status === "processing" && Number(snapshot.data()?.lockUntil) > Date.now()) return "busy";
      transaction.set(eventLedgerRef!, {
        event, chargeId: chargeId || null, checkoutId: checkoutId || null,
        subscriptionId: webhookSubscriptionId || null,
        ...(commercialPayment ? { commercialPayment } : {}),
        status: "processing", attempts: FieldValue.increment(1),
        lockUntil: Date.now() + 120_000,
        receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return false;
    });
    if (duplicate === "legacy_proof") throw new Error("ASAAS_PROOF_VERSION_REQUIRES_RECONCILIATION");
    if (duplicate === "content_changed") throw new Error("ASAAS_EVENT_CONTENT_CHANGED");
    if (duplicate === "busy") return NextResponse.json({ error: "Evento em processamento. Tente novamente." }, { status: 503 });
    if (duplicate === true) return NextResponse.json({ received: true, duplicate: true });
    ledgerClaimed = true;

    if (webhookSubscriptionId && event.startsWith("SUBSCRIPTION_")) {
      let reference = parseSelfServiceReference(subscription.externalReference);
      if (!reference) {
        const tenantMatch = await adminDb.collection("tenants")
          .where("asaasSubscriptionId", "==", webhookSubscriptionId)
          .limit(1)
          .get();
        const tenantDoc = tenantMatch.docs[0];
        if (tenantDoc) {
          reference = { tenantId: tenantDoc.id, planId: clean(tenantDoc.data().platformPlan, 80) };
        }
      }
      if (reference?.tenantId) {
        const tenantRef = adminDb.collection("tenants").doc(reference.tenantId);
        const currentSnap = await tenantRef.get();
        const current = (currentSnap.data() || {}) as Record<string, unknown>;
        if (current.asaasSubscriptionId && current.asaasSubscriptionId !== webhookSubscriptionId && event !== "SUBSCRIPTION_CREATED") {
          await eventLedgerRef.set({ status: "completed", ignored: "previous_subscription", completedAt: FieldValue.serverTimestamp() }, { merge: true });
          return NextResponse.json({ received: true, ignored: true });
        }
        const scheduledCancellation = current.billingStatus === "cancel_scheduled" || Boolean(current.billingOperationPending);
        const inactive = event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED";
        const patch: Record<string, unknown> = {
          asaasSubscriptionId: webhookSubscriptionId,
          asaasSubscriptionStatus: clean(subscription.status, 80) || event.replace("SUBSCRIPTION_", ""),
          asaasCustomerId: clean(subscription.customer, 180) || null,
          asaasNextDueDate: clean(subscription.nextDueDate, 80) || null,
          asaasLastEvent: event,
          updatedAt: FieldValue.serverTimestamp(),
        };
        // Subscription changes alone are not proof of payment or entitlement.
        if (inactive && !scheduledCancellation) {
          patch.billingStatus = "cancelled";
          patch.status = "blocked";
          patch.blockedReason = "asaas_subscription_inactive";
        }
        await tenantRef.set(patch, { merge: true });
      }
      await eventLedgerRef.set({ status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ received: true, event, subscriptionId: webhookSubscriptionId });
    }

    if (checkoutId && event.startsWith("CHECKOUT_")) {
      const checkoutRef = adminDb.collection("asaas_checkouts").doc(checkoutId);
      const checkoutSnap = await checkoutRef.get();
      if (checkoutSnap.exists) {
        const saved = checkoutSnap.data() as Record<string, unknown>;
        const tenantId = clean(saved.tenantId, 180);
        const planId = clean(saved.planId, 80);
        const paid = event === "CHECKOUT_PAID";
        const closed = event === "CHECKOUT_CANCELED" || event === "CHECKOUT_EXPIRED";
        await checkoutRef.set({
          status: paid ? "paid" : closed ? "closed" : "active",
          lastEvent: event,
          asaasCustomerId: clean(checkout.customer, 180) || null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (paid && tenantId) {
          const latestTenant = (await adminDb.collection("tenants").doc(tenantId).get()).data() || {};
          if (latestTenant.asaasCheckoutId && latestTenant.asaasCheckoutId !== checkoutId) {
            await eventLedgerRef.set({ status: "completed", ignored: "previous_checkout", completedAt: FieldValue.serverTimestamp() }, { merge: true });
            return NextResponse.json({ received: true, ignored: true });
          }
          const subscriptionFields = checkoutSubscriptionFields(checkout);
          await Promise.all([
            adminDb.collection("tenants").doc(tenantId).set({
              status: "active", billingStatus: "active", billingProvider: "asaas",
              cancelAtPeriodEnd: false, accessEndsAt: FieldValue.delete(),
              billingOperationPending: false, cancelProtocol: FieldValue.delete(),
              platformPlan: planId, blockedReason: null,
              ...subscriptionFields,
              billingActivatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }),
            adminDb.collection("client_contracts").doc(tenantId).set({
              accessStatus: "active", billingProvider: "asaas",
              platformAccessMode: "asaas_subscription", platformPlan: planId,
              monthlyValue: Number(saved.monthlyPrice || 0), updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true }),
            applyPlatformPlanEntitlements({ tenantId, planId, source: "asaas_webhook" }),
          ]);
        }
      }
      await eventLedgerRef.set({ status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ received: true, event, checkoutId, checkoutUpdated: checkoutSnap.exists });
    }

    console.log(`[Webhook Asaas] Evento recebido: ${event} para pagamento ${chargeId}`);

    const mapped = mapWebhookStatus(event, payment);
    if (!mapped) {
      await eventLedgerRef.set({ status: "completed", ignored: true, completedAt: FieldValue.serverTimestamp() }, { merge: true });
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    let selfService = parseSelfServiceReference(payment.externalReference);
    const subscriptionId = clean(payment.subscription, 180);
    if (!selfService && subscriptionId) {
      const tenantBySubscription = await adminDb.collection("tenants")
        .where("asaasSubscriptionId", "==", subscriptionId).limit(1).get();
      const match = tenantBySubscription.docs[0];
      if (match) selfService = { tenantId: match.id, planId: clean(match.data().platformPlan, 80) };
    }
    if (!selfService) {
      const customerId = clean(payment.customer, 180);
      if (customerId) {
        const checkoutByCustomer = await adminDb.collection("asaas_checkouts")
          .where("asaasCustomerId", "==", customerId).limit(1).get();
        const match = checkoutByCustomer.docs[0];
        if (match) {
          const saved = match.data() as Record<string, unknown>;
          selfService = { tenantId: clean(saved.tenantId, 180), planId: clean(saved.planId, 80) };
        }
      }
    }
    if (selfService) {
      const tenantRef = adminDb.collection("tenants").doc(selfService.tenantId);
      const currentTenantSnap = await tenantRef.get();
      const currentTenant = (currentTenantSnap.data() || {}) as Record<string, unknown>;
      const entitlementSnap = await adminDb.collection("tenant_entitlements").doc(selfService.tenantId).get();
      const entitlement = (entitlementSnap.data() || {}) as Record<string, unknown>;
      const entitlementSource = clean(entitlement.entitlementSource, 80);
      const adminManagedEntitlements = entitlementSource.startsWith("admin_") || (entitlement.mode === "custom" && entitlementSource !== "trial");
      const contractId = clean(currentTenant.legacyClientId, 180) || selfService.tenantId;
      if (subscriptionId && currentTenant.asaasSubscriptionId && currentTenant.asaasSubscriptionId !== subscriptionId) {
        await eventLedgerRef.set({ status: "completed", ignored: "previous_subscription", completedAt: FieldValue.serverTimestamp() }, { merge: true });
        return NextResponse.json({ received: true, ignored: true });
      }
      const tenantPatch: Record<string, unknown> = {
        billingProvider: "asaas",
        asaasLastEvent: event,
        asaasLastPaymentId: chargeId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (subscriptionId) tenantPatch.asaasSubscriptionId = subscriptionId;
      if (mapped.isPaid) {
        tenantPatch.billingStatus = "active";
        tenantPatch.status = "active";
        tenantPatch.platformPlan = selfService.planId;
        tenantPatch.billingActivatedAt = FieldValue.serverTimestamp();
        tenantPatch.blockedReason = null;
        tenantPatch.billingBlockAt = FieldValue.delete();
        tenantPatch.billingOverdueAt = FieldValue.delete();
        if (!currentTenant.subscriptionStartedAt) {
          tenantPatch.subscriptionStartedAt = FieldValue.serverTimestamp();
        }
        if (currentTenant.cancelAtPeriodEnd || currentTenant.billingStatus === "refund_pending" || currentTenant.billingStatus === "cancelled" || currentTenant.billingOperationPending) {
          for (const key of ["billingStatus", "status", "platformPlan"]) {
            if (currentTenant[key] === undefined) delete tenantPatch[key];
            else tenantPatch[key] = currentTenant[key];
          }
        }
      } else if (mapped.status === "atrasado" && !currentTenant.cancelAtPeriodEnd && !currentTenant.billingOperationPending && !["refund_pending", "cancelled"].includes(String(currentTenant.billingStatus))) {
        tenantPatch.billingStatus = "past_due";
        tenantPatch.status = "active";
        tenantPatch.billingOverdueAt = FieldValue.serverTimestamp();
        tenantPatch.billingBlockAt = getBillingBlockAt(payment.dueDate);
        tenantPatch.blockedReason = null;
      } else if (event === "PAYMENT_REFUND_IN_PROGRESS") {
        tenantPatch.billingStatus = "refund_pending";
        tenantPatch.status = "active";
        tenantPatch.refundRequestedAt = FieldValue.serverTimestamp();
      } else if (event === "PAYMENT_REFUNDED") {
        tenantPatch.billingStatus = "cancelled";
        tenantPatch.status = "blocked";
        tenantPatch.blockedReason = "asaas_refunded";
        tenantPatch.refundedAt = FieldValue.serverTimestamp();
      } else if (mapped.status === "cancelado" && !currentTenant.cancelAtPeriodEnd && !currentTenant.billingOperationPending && !["cancel_scheduled", "refund_pending", "cancelled"].includes(String(currentTenant.billingStatus))) {
        tenantPatch.billingStatus = "blocked";
        tenantPatch.status = "blocked";
        tenantPatch.blockedReason = `asaas_${mapped.status}`;
      }
      await Promise.all([
        tenantRef.set(tenantPatch, { merge: true }),
        adminDb.collection("client_contracts").doc(contractId).set({
          billingProvider: "asaas",
          platformAccessMode: "asaas_subscription",
          platformPlan: selfService.planId,
          accessStatus: currentTenant.cancelAtPeriodEnd || currentTenant.billingOperationPending ? clean(currentTenant.billingStatus, 40) : mapped.isPaid ? "active" : mapped.status,
          ...(subscriptionId ? { asaasSubscriptionId: subscriptionId } : {}),
          asaasLastPaymentId: chargeId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        ...(mapped.isPaid && !adminManagedEntitlements && !currentTenant.cancelAtPeriodEnd && !currentTenant.billingOperationPending && !["cancelled", "refund_pending"].includes(String(currentTenant.billingStatus)) ? [applyPlatformPlanEntitlements({
          tenantId: selfService.tenantId,
          planId: selfService.planId,
          source: "asaas_webhook",
        })] : []),
      ]);
    }

    const financeSnap = await adminDb
      .collection("financeiro")
      .where("asaasChargeId", "==", chargeId)
      .limit(20)
      .get();

    const leadSnap = await adminDb.collection("leads").where("asaasChargeId", "==", chargeId).limit(2).get();
    if (!leadSnap.empty && (typeof leadSnap.docs[0].data().tenantId !== "string" || !leadSnap.docs[0].data().tenantId.trim())) throw new Error("ASAAS_CUSTOMER_TENANT_MISSING");
    if (leadSnap.size > 1 || !leadSnap.empty && financeSnap.size > 1) throw new Error("ASAAS_CUSTOMER_BINDING_AMBIGUOUS");
    if (!leadSnap.empty && financeSnap.size === 1 && leadSnap.docs[0].data().tenantId !== financeSnap.docs[0].data().tenantId) throw new Error("ASAAS_CUSTOMER_BINDING_OUTSIDE_TENANT");

    if (financeSnap.empty && selfService?.tenantId && subscriptionId) {
      const tenant = await adminDb.collection("tenants").doc(selfService.tenantId).get();
      const tenantData = (tenant.data() || {}) as Record<string, unknown>;
      const contractId = clean(tenantData.legacyClientId, 180) || selfService.tenantId;
      const dueDate = clean(payment.dueDate, 20) || null;
      const invoiceUrl = clean(payment.invoiceUrl, 500) || null;
      await adminDb.collection("financeiro").doc(`asaas_subscription_${chargeId}`).set({
        tenantId: selfService.tenantId, clientId: contractId, contractId,
        descricao: "Assinatura Altum", valor: Number(payment.value || 0) || 0,
        status: mapped.status, dueDate, vencimento: dueDate, contractDueDate: dueDate,
        billingType: clean(payment.billingType, 40) || "PIX",
        asaasChargeId: chargeId, asaasSubscriptionId: subscriptionId,
        invoiceUrl, paymentLink: invoiceUrl, contractAutoBilling: true,
        asaasEvent: event, asaasStatus: clean(payment.status, 80) || null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const reactivationQueue: Array<{ tenantId: string; financeId: string }> = [];
    const commercialRoots: Array<{ tenantId: string; paidId: string | null; stageId: string | null }> = [];
    const handledCommercialLeads = new Set<string>();

    if (!financeSnap.empty) {
      const updates = financeSnap.docs.map(async (doc) => {
        const current = doc.data() as Record<string, unknown>;
        const projectionOnly = selfService && doc.id === `asaas_subscription_${chargeId}` && !current.leadId;
        const linkLeadId = !current.leadId && !projectionOnly && leadSnap.size === 1 ? leadSnap.docs[0].id : undefined;
        const leadId = clean(current.leadId, 140) || linkLeadId || "";
        const tenantId = clean(current.tenantId, 140);

        const patch: Record<string, unknown> = {
          status: mapped.status,
          meioPagamento: clean(payment.billingType, 40) || null,
          asaasEvent: event,
          asaasStatus: clean(payment.status, 80) || null,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (mapped.isPaid) {
          patch.dataPagamento = FieldValue.serverTimestamp();
          patch.paymentConfirmedAt = FieldValue.serverTimestamp();
        }

        if (leadId && tenantId && mapped.isPaid) {
          const billing = selfService || current.contractAutoBilling === true ? { platformTenantId: selfService?.tenantId, subscriptionId: subscriptionId || undefined } : undefined;
          handledCommercialLeads.add(`${tenantId}:${leadId}`);
          const result = await commitAsaasFinanceMutation({ financeId: doc.id, ledgerId: eventLedgerRef!.id, chargeId, patch, billing, linkLeadId });
          handledCommercialLeads.add(`${result.tenantId}:${result.leadId}`);
          if (result.financePaidOccurrenceId) commercialRoots.push({ tenantId: result.tenantId, paidId: result.financePaidOccurrenceId, stageId: result.financeStageTransitionId });
          if (billing && !selfService && !("ignored" in result && result.ignored)) reactivationQueue.push({ tenantId, financeId: doc.id });
          return;
        }
        if (leadId && tenantId) {
          handledCommercialLeads.add(`${tenantId}:${leadId}`);
          const billing = selfService || current.contractAutoBilling === true ? { platformTenantId: selfService?.tenantId, subscriptionId: subscriptionId || undefined } : undefined;
          const result = await commitAsaasCommercialState({ financeId: doc.id, ledgerId: eventLedgerRef!.id, chargeId, billing, linkLeadId });
          handledCommercialLeads.add(`${result.tenantId}:${result.leadId}`); return;
        }
        await doc.ref.set(patch, { merge: true });


        if (mapped.isPaid && tenantId && !selfService) {
          reactivationQueue.push({ tenantId, financeId: doc.id });
        }
      });
      await Promise.all(updates);
    }

    if (!leadSnap.empty) {
      await Promise.all(
        leadSnap.docs.map(async (leadDoc) => {
          const boundTenantId = clean(leadDoc.data().tenantId, 140);
          if (handledCommercialLeads.has(`${boundTenantId}:${leadDoc.id}`)) return;
          const projectionOnly = selfService && financeSnap.size === 1 && financeSnap.docs[0].id === `asaas_subscription_${chargeId}` && !financeSnap.docs[0].data().leadId;
          if (selfService && (financeSnap.empty || projectionOnly)) {
            const billing = { platformTenantId: selfService.tenantId, subscriptionId: subscriptionId || undefined };
            if (!mapped.isPaid) { await commitAsaasCommercialState({ leadId: leadDoc.id, ledgerId: eventLedgerRef!.id, chargeId, billing }); return; }
            const result = await commitAsaasLeadPayment({ leadId: leadDoc.id, ledgerId: eventLedgerRef!.id, chargeId, billing });
            if (result.financeStageTransitionId) commercialRoots.push({ tenantId: result.tenantId, paidId: null, stageId: result.financeStageTransitionId });
            return;
          }
          if (!selfService && financeSnap.empty) {
            if (!mapped.isPaid) {
              await commitAsaasCommercialState({ leadId: leadDoc.id, ledgerId: eventLedgerRef!.id, chargeId }); return;
            }
            const result = await commitAsaasLeadPayment({ leadId: leadDoc.id, ledgerId: eventLedgerRef!.id, chargeId });
            if (result.paymentObservationId) handledCommercialLeads.add(`${result.tenantId}:${result.leadId}`);
            if (result.financeStageTransitionId) commercialRoots.push({ tenantId: result.tenantId, paidId: null, stageId: result.financeStageTransitionId });
            return;
          }
          throw new Error("ASAAS_CUSTOMER_BINDING_REQUIRES_REVIEW");
        })
      );
    }

    if (reactivationQueue.length > 0) {
      const uniqueReactivationQueue = Array.from(
        new Map(reactivationQueue.map((item) => [`${item.tenantId}:${item.financeId}`, item])).values()
      );
      await Promise.all(
        uniqueReactivationQueue.map((item) =>
          reactivateTenantAfterBillingPayment({
            tenantId: item.tenantId,
            financeId: item.financeId,
            asaasChargeId: chargeId,
            ledgerId: eventLedgerRef!.id,
          }).catch((reactivationError) => {
            console.error("[Webhook Asaas] Falha ao reativar tenant apos pagamento:", {
              tenantId: item.tenantId,
              financeId: item.financeId,
              error: reactivationError,
            });
            throw reactivationError;
          })
        )
      );
    }

    await eventLedgerRef.set({ status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const source of commercialRoots) {
      try {
        if (source.stageId) await processFinanceStageTransition(source.stageId, source.tenantId);
        if (source.paidId) await processFinancePaidOccurrence(source.paidId, source.tenantId);
      } catch { console.warn("[Webhook Asaas] Ocorrencia comercial persistida; consumidor periodico retomara."); }
    }
    return NextResponse.json({
      received: true,
      chargeId,
      event,
      mappedStatus: mapped.status,
      financeUpdated: financeSnap.size,
      leadsUpdated: leadSnap.size,
      reactivationChecked: reactivationQueue.length,
    });
  } catch (error) {
    console.error("[Webhook Asaas] Erro critico:", error);
    if (eventLedgerRef && ledgerClaimed) {
      await eventLedgerRef.set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "unknown", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    }
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 });
  }
}
