import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runLeadAutomations } from "@/lib/server/automations";
import { reactivateTenantAfterBillingPayment } from "@/lib/server/contract-billing";
import { setLeadPipelineStageWithEffects } from "@/lib/server/crm/stage-transition";
import { applyPlatformPlanEntitlements } from "@/lib/server/platform-plan-entitlements";
import { getBillingBlockAt } from "@/lib/platform-subscription-policy";

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
    const duplicate = await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(eventLedgerRef!);
      if (snapshot.exists && snapshot.data()?.status === "completed") return true;
      transaction.set(eventLedgerRef!, {
        event, chargeId: chargeId || null, checkoutId: checkoutId || null,
        subscriptionId: webhookSubscriptionId || null,
        status: "processing", attempts: FieldValue.increment(1),
        receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return false;
    });
    if (duplicate) return NextResponse.json({ received: true, duplicate: true });

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
        const scheduledCancellation = current.billingStatus === "cancel_scheduled";
        const inactive = event === "SUBSCRIPTION_INACTIVATED" || event === "SUBSCRIPTION_DELETED";
        const patch: Record<string, unknown> = {
          asaasSubscriptionId: webhookSubscriptionId,
          asaasSubscriptionStatus: clean(subscription.status, 80) || event.replace("SUBSCRIPTION_", ""),
          asaasCustomerId: clean(subscription.customer, 180) || null,
          asaasNextDueDate: clean(subscription.nextDueDate, 80) || null,
          asaasLastEvent: event,
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (reference.planId) patch.platformPlan = reference.planId;
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
          const checkoutSubscription = checkout.subscription && typeof checkout.subscription === "object"
            ? checkout.subscription as Record<string, unknown>
            : {};
          await Promise.all([
            adminDb.collection("tenants").doc(tenantId).set({
              status: "active", billingStatus: "active", billingProvider: "asaas",
              platformPlan: planId, blockedReason: null,
              asaasSubscriptionId: clean(checkoutSubscription.id, 180) || null,
              asaasNextDueDate: clean(checkoutSubscription.nextDueDate, 80) || null,
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
      } else if (mapped.status === "atrasado") {
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
      } else if (mapped.status === "cancelado" && currentTenant.billingStatus !== "cancel_scheduled") {
        tenantPatch.billingStatus = "blocked";
        tenantPatch.status = "blocked";
        tenantPatch.blockedReason = `asaas_${mapped.status}`;
      }
      await Promise.all([
        tenantRef.set(tenantPatch, { merge: true }),
        adminDb.collection("client_contracts").doc(selfService.tenantId).set({
          billingProvider: "asaas",
          platformAccessMode: "asaas_subscription",
          platformPlan: selfService.planId,
          accessStatus: mapped.isPaid ? "active" : mapped.status,
          asaasSubscriptionId: subscriptionId || null,
          asaasLastPaymentId: chargeId,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        ...(mapped.isPaid ? [applyPlatformPlanEntitlements({
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

    const automationQueue: Array<{ tenantId: string; leadId: string }> = [];
    const saleQueue: Array<{ tenantId: string; leadId: string; sourceId: string }> = [];
    const reactivationQueue: Array<{ tenantId: string; financeId: string }> = [];

    if (!financeSnap.empty) {
      const updates = financeSnap.docs.map(async (doc) => {
        const current = doc.data() as Record<string, unknown>;
        const previousStatus = clean(current.status, 40).toLowerCase();
        const leadId = clean(current.leadId, 140);
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

        await doc.ref.set(patch, { merge: true });

        if (mapped.isPaid && leadId && tenantId && previousStatus !== "pago") {
          automationQueue.push({ tenantId, leadId });
          saleQueue.push({ tenantId, leadId, sourceId: doc.id });
        }

        if (mapped.isPaid && tenantId) {
          reactivationQueue.push({ tenantId, financeId: doc.id });
        }
      });
      await Promise.all(updates);
    }

    const leadSnap = await adminDb
      .collection("leads")
      .where("asaasChargeId", "==", chargeId)
      .limit(5)
      .get();

    if (!leadSnap.empty) {
      await Promise.all(
        leadSnap.docs.map(async (leadDoc) => {
          const patch: Record<string, unknown> = {
            paymentStatus: mapped.status,
            paymentMethod: clean(payment.billingType, 40) || null,
            paymentValue: Number(payment.value || 0) || null,
            updatedAt: FieldValue.serverTimestamp(),
          };

          if (mapped.isPaid) {
            patch.status = "qualificado";
            patch.paidAt = FieldValue.serverTimestamp();
          }

          if (mapped.status === "atrasado") {
            patch.paymentOverdueAt = FieldValue.serverTimestamp();
          }

          if (mapped.status === "cancelado") {
            patch.paymentCanceledAt = FieldValue.serverTimestamp();
          }

          await leadDoc.ref.set(patch, { merge: true });
          await leadDoc.ref.collection("events").add({
            type: "system",
            title: mapped.title,
            detail: mapped.detail,
            asaasEvent: event,
            asaasChargeId: chargeId,
            createdAt: FieldValue.serverTimestamp(),
          });

          if (mapped.isPaid) {
            const lead = leadDoc.data() as Record<string, unknown>;
            const tenantId = clean(lead.tenantId, 140);
            if (tenantId) {
              saleQueue.push({ tenantId, leadId: leadDoc.id, sourceId: chargeId });
            }
          }
        })
      );
    }

    if (saleQueue.length > 0) {
      const uniqueSaleQueue = Array.from(
        new Map(saleQueue.map((item) => [`${item.tenantId}:${item.leadId}`, item])).values()
      );

      await Promise.all(
        uniqueSaleQueue.map((item) =>
          setLeadPipelineStageWithEffects({
            tenantId: item.tenantId,
            leadId: item.leadId,
            nextStage: "ganho",
            actorId: "asaas_webhook",
            actorName: "Asaas Webhook",
            source: "asaas_payment_confirmed",
            metadata: {
              asaasChargeId: chargeId,
              sourceId: item.sourceId,
              asaasEvent: event,
              paymentValue: Number(payment.value || 0) || null,
              paymentMethod: clean(payment.billingType, 40) || null,
            },
            patch: {
              paymentStatus: mapped.status,
              paidAt: FieldValue.serverTimestamp(),
            },
          }).catch((conversionError) => {
            console.error("[Webhook Asaas] Falha ao marcar venda ganha apos pagamento:", {
              tenantId: item.tenantId,
              leadId: item.leadId,
              error: conversionError,
            });
          })
        )
      );
    }

    if (automationQueue.length > 0) {
      const uniqueAutomationQueue = Array.from(
        new Map(
          automationQueue.map((item) => [`${item.tenantId}:${item.leadId}`, item])
        ).values()
      );

      await Promise.all(
        uniqueAutomationQueue.map(async (item) => {
          try {
            await runLeadAutomations({
              tenantId: item.tenantId,
              trigger: "finance_paid",
              leadId: item.leadId,
              actorId: "asaas_webhook",
              actorName: "Asaas Webhook",
            });
          } catch (automationError) {
            console.error("[Webhook Asaas] Falha ao executar automacoes finance_paid:", {
              tenantId: item.tenantId,
              leadId: item.leadId,
              error: automationError,
            });
          }
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
          }).catch((reactivationError) => {
            console.error("[Webhook Asaas] Falha ao reativar tenant apos pagamento:", {
              tenantId: item.tenantId,
              financeId: item.financeId,
              error: reactivationError,
            });
          })
        )
      );
    }

    await eventLedgerRef.set({ status: "completed", completedAt: FieldValue.serverTimestamp() }, { merge: true });
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
    if (eventLedgerRef) {
      await eventLedgerRef.set({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "unknown", updatedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => undefined);
    }
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 });
  }
}
