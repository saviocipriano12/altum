import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

type ChargeBody = {
  amount?: number;
  dueDate?: string;
  customerInfo?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
  };
  split?: {
    walletId?: string;
    commissionRate?: number;
  };
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | string;
  leadId?: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin", "closer"] });

    if (!ASAAS_API_KEY) {
      return NextResponse.json({ error: "Configuracao de API ausente." }, { status: 500 });
    }

    const body = (await req.json()) as ChargeBody;
    const { amount, dueDate, customerInfo, split, billingType, leadId } = body;

    if (!amount || !customerInfo || !billingType || !customerInfo.email || !customerInfo.name) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    let leadOwnerId: string | null = null;
    let leadOwnerName: string | null = null;
    let leadName: string | null = null;

    // If the user is not admin, the lead must belong to them.
    if (leadId && !isAdmin(user)) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (!leadSnap.exists) {
        return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
      }
      const leadData = leadSnap.data() as { ownerId?: string; owner?: string; nome?: string };
      if (leadData.ownerId && leadData.ownerId !== user.uid) {
        return NextResponse.json({ error: "Sem permissao neste lead." }, { status: 403 });
      }
      leadOwnerId = leadData.ownerId || null;
      leadOwnerName = leadData.owner || null;
      leadName = leadData.nome || null;
    } else if (leadId) {
      const leadSnap = await adminDb.collection("leads").doc(leadId).get();
      if (leadSnap.exists) {
        const leadData = leadSnap.data() as { ownerId?: string; owner?: string; nome?: string };
        leadOwnerId = leadData.ownerId || null;
        leadOwnerName = leadData.owner || null;
        leadName = leadData.nome || null;
      }
    }

    let commissionRate = Number(split?.commissionRate || 0);
    let sellerWalletId = (split?.walletId || "").trim();
    let sellerName = leadOwnerName || null;

    if (leadOwnerId) {
      const sellerSnap = await adminDb.collection("users").doc(leadOwnerId).get();
      if (sellerSnap.exists) {
        const sellerData = sellerSnap.data() as {
          name?: string;
          commissionRate?: number;
          asaasWalletId?: string | null;
        };
        sellerName = sellerData.name || sellerName;
        commissionRate = Number(sellerData.commissionRate || commissionRate || 0);
        sellerWalletId = (sellerData.asaasWalletId || sellerWalletId || "").trim();
      }
    }

    // Step A: ensure customer in Asaas.
    let asaasCustomerId: string | null = null;
    const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${customerInfo.email}`, {
      headers: { access_token: ASAAS_API_KEY },
    });
    const searchData = await searchRes.json();

    if (searchData.data && searchData.data.length > 0) {
      asaasCustomerId = searchData.data[0].id;
    } else {
      const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
        body: JSON.stringify({
          name: customerInfo.name,
          email: customerInfo.email,
          cpfCnpj: customerInfo.cpfCnpj,
          mobilePhone: customerInfo.phone,
        }),
      });
      const createData = await createRes.json();
      if (createData.errors) {
        return NextResponse.json({ error: createData.errors[0].description }, { status: 400 });
      }
      asaasCustomerId = createData.id;
    }

    const splitRules: Array<{ walletId: string; percentualValue: number }> = [];
    if (sellerWalletId && commissionRate > 0) {
      splitRules.push({
        walletId: sellerWalletId,
        percentualValue: commissionRate,
      });
    }

    const method = billingType === "CREDIT_CARD" ? "UNDEFINED" : billingType;
    const normalizedDueDate = (dueDate || "").trim() || new Date().toISOString().split("T")[0];
    const chargePayload = {
      customer: asaasCustomerId,
      billingType: method,
      value: amount,
      dueDate: normalizedDueDate,
      description: `Altum Digital - ${customerInfo.name}`,
      split: splitRules.length > 0 ? splitRules : undefined,
    };

    const chargeRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
      body: JSON.stringify(chargePayload),
    });

    const chargeData = await chargeRes.json();
    if (chargeData.errors) {
      return NextResponse.json({ error: chargeData.errors[0].description }, { status: 400 });
    }

    if (leadId) {
      try {
        await adminDb.collection("leads").doc(leadId).set(
          {
            asaasChargeId: chargeData.id,
            lastChargeAmount: amount,
            lastBillingType: billingType,
            updatedAt: Date.now(),
          },
          { merge: true }
        );
      } catch (error) {
        console.error("Erro ao vincular cobranca Asaas no lead:", error);
      }
    }

    try {
      const gross = Number(amount || 0);
      const commissionValue = gross > 0 ? (gross * commissionRate) / 100 : 0;
      await adminDb.collection("financeiro").add({
        descricao: `Venda via checkout - ${leadName || customerInfo.name || "Lead"}`,
        valor: gross,
        valorComissao: commissionValue,
        commissionRate,
        vendedorId: leadOwnerId || user.uid,
        vendedorNome: sellerName || user.name || "Vendedor",
        tipo: "Receita",
        categoria: "Setup",
        status: "pendente",
        payoutStatus: "pendente",
        referencia: "Asaas Checkout",
        vencimento: normalizedDueDate,
        clientName: customerInfo.name,
        leadId: leadId || null,
        asaasChargeId: chargeData.id,
        billingType: billingType,
        invoiceUrl: chargeData.invoiceUrl || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      console.error("Erro ao registrar transacao no financeiro apos checkout:", error);
    }

    const responseData: {
      success: boolean;
      chargeId: string;
      invoiceUrl?: string;
      billingType?: string;
      pix?: { encodedImage?: string; payload?: string };
      bankSlipUrl?: string;
    } = {
      success: true,
      chargeId: chargeData.id,
      invoiceUrl: chargeData.invoiceUrl,
      billingType: chargeData.billingType,
    };

    if (billingType === "PIX") {
      const qrRes = await fetch(`${ASAAS_API_URL}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: ASAAS_API_KEY },
      });
      const qrData = await qrRes.json();
      responseData.pix = { encodedImage: qrData.encodedImage, payload: qrData.payload };
    }

    if (billingType === "BOLETO") {
      responseData.bankSlipUrl = chargeData.bankSlipUrl;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro interno API Finance:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}
