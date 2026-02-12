import { NextResponse } from "next/server";
import { db } from "@/firebaseConfig";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp 
} from "firebase/firestore";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const event = body.event; // Ex: PAYMENT_RECEIVED
    const payment = body.payment;

    console.log(`[Webhook Asaas] Evento recebido: ${event} para o pagamento ${payment.id}`);

    // Só nos interessa se o pagamento foi RECEBIDO ou CONFIRMADO (Cartão)
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      
      // 1. Localizar o Lead no Firebase pelo ID da cobrança do Asaas
      // (Para isso funcionar, precisamos salvar o asaasChargeId no lead ao gerar a cobrança)
      const leadsRef = collection(db, "leads");
      const q = query(leadsRef, where("asaasChargeId", "==", payment.id));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const leadDoc = querySnapshot.docs[0];
        const leadId = leadDoc.id;

        // 2. Dar baixa no Lead (Mudar status para qualificado/venda fechada)
        await updateDoc(doc(db, "leads", leadId), {
          status: "qualificado",
          paidAt: serverTimestamp(),
          paymentMethod: payment.billingType,
          paymentValue: payment.value
        });

        // 3. Registrar o Evento na Timeline do Lead
        await addDoc(collection(db, "leads", leadId, "events"), {
          type: "system",
          title: "💰 Pagamento Confirmado",
          detail: `O pagamento via ${payment.billingType} de ${payment.value.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})} foi recebido com sucesso.`,
          createdAt: serverTimestamp()
        });

        console.log(`[Webhook Asaas] Lead ${leadId} atualizado para PAGO.`);
      } else {
        console.warn(`[Webhook Asaas] Cobrança ${payment.id} recebida, mas lead não encontrado no CRM.`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error) {
    console.error("[Webhook Asaas] Erro crítico:", error);
    return NextResponse.json({ error: "Erro no processamento do webhook" }, { status: 500 });
  }
}