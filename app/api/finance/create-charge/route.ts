import { NextResponse } from "next/server";
import { db } from "@/firebaseConfig"; // <-- ADICIONE O IMPORT DO SEU FIREBASE
import { doc, updateDoc } from "firebase/firestore"; // <-- ADICIONE ESTES IMPORTS

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

export async function POST(req: Request) {
  try {
    if (!ASAAS_API_KEY) {
      return NextResponse.json({ error: "Configuração de API ausente." }, { status: 500 });
    }

    const body = await req.json();
    const { 
        amount, 
        customerInfo, 
        split,        
        billingType,
        leadId // <--- MUDANÇA AQUI: Recebemos o ID do lead do front-end
    } = body;

    if (!amount || !customerInfo || !billingType) {
        return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    // PASSO A: Garantir Cliente no Asaas
    let asaasCustomerId = null;
    const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${customerInfo.email}`, {
        headers: { "access_token": ASAAS_API_KEY }
    });
    const searchData = await searchRes.json();

    if (searchData.data && searchData.data.length > 0) {
        asaasCustomerId = searchData.data[0].id;
    } else {
        const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
            body: JSON.stringify({
                name: customerInfo.name,
                email: customerInfo.email,
                cpfCnpj: customerInfo.cpfCnpj,
                mobilePhone: customerInfo.phone
            })
        });
        const createData = await createRes.json();
        if (createData.errors) return NextResponse.json({ error: createData.errors[0].description }, { status: 400 });
        asaasCustomerId = createData.id;
    }

    // PASSO B: Montar Split
    let splitRules = [];
    if (split && split.walletId) {
        splitRules.push({ walletId: split.walletId, percentualValue: split.commissionRate });
    }

    // PASSO C: Criar Cobrança
    const method = billingType === "CREDIT_CARD" ? "UNDEFINED" : billingType;
    const chargePayload = {
        customer: asaasCustomerId,
        billingType: method,
        value: amount,
        dueDate: new Date().toISOString().split('T')[0],
        description: `Altum Digital - ${customerInfo.name}`,
        split: splitRules.length > 0 ? splitRules : undefined
    };

    const chargeRes = await fetch(`${ASAAS_API_URL}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify(chargePayload)
    });

    const chargeData = await chargeRes.json();
    if (chargeData.errors) return NextResponse.json({ error: chargeData.errors[0].description }, { status: 400 });

    // =================================================================================
    // MUDANÇA AQUI: VINCULAR COBRANÇA AO LEAD NO FIREBASE
    // =================================================================================
    if (leadId) {
      try {
        const leadRef = doc(db, "leads", leadId);
        await updateDoc(leadRef, {
          asaasChargeId: chargeData.id, // O Webhook usará esse ID para dar baixa
          lastChargeAmount: amount,
          lastBillingType: billingType
        });
      } catch (err) {
        console.error("Erro ao vincular ID do Asaas no Lead:", err);
        // Não travamos o processo se falhar aqui, mas registramos no log
      }
    }
    // =================================================================================

    // PASSO D: Tratamento de resposta
    let responseData: any = {
        success: true,
        chargeId: chargeData.id,
        invoiceUrl: chargeData.invoiceUrl,
        billingType: chargeData.billingType
    };

    if (billingType === "PIX") {
        const qrRes = await fetch(`${ASAAS_API_URL}/payments/${chargeData.id}/pixQrCode`, {
            headers: { "access_token": ASAAS_API_KEY }
        });
        const qrData = await qrRes.json();
        responseData.pix = { encodedImage: qrData.encodedImage, payload: qrData.payload };
    }

    if (billingType === "BOLETO") {
        responseData.bankSlipUrl = chargeData.bankSlipUrl;
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error("Erro interno API Finance:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}