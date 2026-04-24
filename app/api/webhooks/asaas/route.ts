import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { runLeadAutomations } from "@/lib/server/automations";

const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

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
  try {
    if (!ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json(
        { error: "ASAAS_WEBHOOK_TOKEN nao configurado no servidor." },
        { status: 503 }
      );
    }

    const incoming = req.headers.get("asaas-access-token") || req.headers.get("x-webhook-token");
    if (incoming !== ASAAS_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: "Webhook nao autorizado." }, { status: 401 });
    }

    const body = await req.json();
    const event = normalizeEvent(body?.event);
    const payment = body?.payment && typeof body.payment === "object"
      ? (body.payment as Record<string, unknown>)
      : {};

    const chargeId = clean(payment.id, 140);
    if (!chargeId) {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    console.log(`[Webhook Asaas] Evento recebido: ${event} para pagamento ${chargeId}`);

    const mapped = mapWebhookStatus(event, payment);
    if (!mapped) {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    const financeSnap = await adminDb
      .collection("financeiro")
      .where("asaasChargeId", "==", chargeId)
      .limit(20)
      .get();

    const automationQueue: Array<{ tenantId: string; leadId: string }> = [];

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
        })
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

    return NextResponse.json({
      received: true,
      chargeId,
      event,
      mappedStatus: mapped.status,
      financeUpdated: financeSnap.size,
      leadsUpdated: leadSnap.size,
    });
  } catch (error) {
    console.error("[Webhook Asaas] Erro critico:", error);
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 });
  }
}
