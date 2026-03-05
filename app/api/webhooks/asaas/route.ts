import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

const ASAAS_WEBHOOK_TOKEN = process.env.ASAAS_WEBHOOK_TOKEN;

export async function POST(req: Request) {
  try {
    if (ASAAS_WEBHOOK_TOKEN) {
      const incoming =
        req.headers.get("asaas-access-token") || req.headers.get("x-webhook-token");
      if (incoming !== ASAAS_WEBHOOK_TOKEN) {
        return NextResponse.json({ error: "Webhook nao autorizado." }, { status: 401 });
      }
    }

    const body = await req.json();
    const event = body.event;
    const payment = body.payment;

    if (!payment?.id) {
      return NextResponse.json({ received: true, ignored: true }, { status: 200 });
    }

    console.log(`[Webhook Asaas] Evento recebido: ${event} para pagamento ${payment.id}`);

    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      const financeSnap = await adminDb
        .collection("financeiro")
        .where("asaasChargeId", "==", payment.id)
        .limit(5)
        .get();

      if (!financeSnap.empty) {
        const updates = financeSnap.docs.map((doc) =>
          doc.ref.set(
            {
              status: "pago",
              dataPagamento: FieldValue.serverTimestamp(),
              meioPagamento: payment.billingType || null,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        );
        await Promise.all(updates);
      }

      const leadSnap = await adminDb
        .collection("leads")
        .where("asaasChargeId", "==", payment.id)
        .limit(1)
        .get();

      if (!leadSnap.empty) {
        const leadDoc = leadSnap.docs[0];
        const leadId = leadDoc.id;

        await leadDoc.ref.set(
          {
            status: "qualificado",
            paidAt: FieldValue.serverTimestamp(),
            paymentMethod: payment.billingType,
            paymentValue: payment.value,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await leadDoc.ref.collection("events").add({
          type: "system",
          title: "Pagamento confirmado",
          detail: `Pagamento via ${payment.billingType} de ${Number(payment.value || 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })} recebido com sucesso.`,
          createdAt: FieldValue.serverTimestamp(),
        });

        console.log(`[Webhook Asaas] Lead ${leadId} atualizado para pago.`);
      } else {
        console.warn(`[Webhook Asaas] Cobranca ${payment.id} recebida, mas lead nao encontrado.`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("[Webhook Asaas] Erro critico:", error);
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 });
  }
}
