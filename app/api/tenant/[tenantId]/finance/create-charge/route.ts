import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, getTenantSettings } from "@/lib/server/tenant";
import {
  normalizeChargeAmount,
  normalizeChargeBillingType,
  resolveChargeDescription,
  resolveChargeDueDate,
  resolveChargeMethodForAsaas,
} from "@/lib/server/commercial-charge";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

type Body = {
  amount?: number;
  dueDate?: string;
  billingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | string;
  leadId?: string;
  budgetId?: string | null;
  description?: string;
  customerInfo?: {
    name?: string;
    email?: string;
    cpfCnpj?: string;
    phone?: string;
  };
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function ensureAsaasCustomer(input: {
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
}) {
  const searchRes = await fetch(`${ASAAS_API_URL}/customers?email=${encodeURIComponent(input.email)}`, {
    headers: { access_token: ASAAS_API_KEY as string },
  });
  const searchData = await searchRes.json();

  if (searchData.data && searchData.data.length > 0) {
    return String(searchData.data[0].id || "");
  }

  const createRes = await fetch(`${ASAAS_API_URL}/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY as string },
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj,
      mobilePhone: input.phone,
    }),
  });
  const createData = await createRes.json();
  if (createData.errors) {
    throw new Error(createData.errors[0]?.description || "Falha ao criar cliente no Asaas.");
  }
  return String(createData.id || "");
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_commercial");

    if (!ASAAS_API_KEY) {
      return NextResponse.json({ error: "Configuracao Asaas ausente no servidor." }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    const amount = normalizeChargeAmount(body.amount);
    const billingType = normalizeChargeBillingType(body.billingType);
    const leadId = clean(body.leadId, 140);
    const budgetId = clean(body.budgetId, 140);
    const explicitDescription = clean(body.description, 180);

    if (!amount || !leadId) {
      return NextResponse.json({ error: "Campos obrigatorios: leadId e amount." }, { status: 400 });
    }

    const leadSnap = await adminDb.collection("leads").doc(leadId).get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }
    const lead = leadSnap.data() as Record<string, unknown>;
    if (String(lead.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Lead fora do tenant informado." }, { status: 403 });
    }

    let budget: Record<string, unknown> | null = null;
    if (budgetId) {
      const budgetSnap = await adminDb.collection("orcamentos").doc(budgetId).get();
      if (budgetSnap.exists && String((budgetSnap.data() as Record<string, unknown>).tenantId || "") === tenantId) {
        budget = budgetSnap.data() as Record<string, unknown>;
      }
    }

    const customerName = clean(body.customerInfo?.name, 180) || clean(lead.nome, 180);
    const customerEmail = clean(body.customerInfo?.email, 180) || clean(lead.email, 180);
    const customerPhone = clean(body.customerInfo?.phone, 40) || clean(lead.telefone, 40);
    const customerCpfCnpj = clean(body.customerInfo?.cpfCnpj, 30);

    if (!customerName || !customerEmail) {
      return NextResponse.json({ error: "Lead precisa ter nome e email para gerar cobranca." }, { status: 400 });
    }

    const customerId = await ensureAsaasCustomer({
      name: customerName,
      email: customerEmail,
      cpfCnpj: customerCpfCnpj || undefined,
      phone: customerPhone || undefined,
    });

    const dueDate = resolveChargeDueDate(body.dueDate);
    const method = resolveChargeMethodForAsaas(billingType);
    const description = resolveChargeDescription({
      explicitDescription,
      budgetTitle: budget?.titulo,
      customerName,
    });

    const chargeRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", access_token: ASAAS_API_KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: method,
        value: amount,
        dueDate,
        description,
      }),
    });
    const chargeData = await chargeRes.json();

    if (chargeData.errors) {
      return NextResponse.json({ error: chargeData.errors[0]?.description || "Falha ao gerar cobranca." }, { status: 400 });
    }

    const settings = await getTenantSettings(tenantId);
    const financeiroRef = await adminDb.collection("financeiro").add({
      tenantId,
      clientId: tenantId,
      clientName: clean(settings?.name, 180) || "Cliente",
      leadId,
      leadName: clean(lead.nome, 180) || customerName,
      ownerId: clean(lead.ownerId, 140) || user.uid,
      owner: clean(lead.owner, 180) || user.name,
      descricao: description,
      valor: amount,
      tipo: "Receita",
      categoria: "Cobranca Asaas",
      status: "pendente",
      payoutStatus: "pendente",
      vencimento: dueDate,
      meioPagamento: billingType,
      dataPagamento: null,
      orcamentoId: budgetId || null,
      referencia: budgetId ? `budget:${budgetId}` : "Asaas Checkout",
      asaasChargeId: String(chargeData.id || ""),
      billingType,
      invoiceUrl: chargeData.invoiceUrl || null,
      bankSlipUrl: chargeData.bankSlipUrl || null,
      clientEmail: customerEmail,
      clientPhone: customerPhone || null,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await Promise.all([
      leadSnap.ref.set(
        {
          asaasChargeId: String(chargeData.id || ""),
          lastChargeAmount: amount,
          lastBillingType: billingType,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      leadSnap.ref.collection("events").add({
        type: "finance_charge_created",
        title: "Cobranca criada",
        detail: `${description} gerada via Asaas.`,
        financeId: financeiroRef.id,
        asaasChargeId: String(chargeData.id || ""),
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    const responseData: {
      ok: boolean;
      tenantId: string;
      financeId: string;
      chargeId: string;
      invoiceUrl?: string;
      billingType?: string;
      pix?: { encodedImage?: string; payload?: string };
      bankSlipUrl?: string;
    } = {
      ok: true,
      tenantId,
      financeId: financeiroRef.id,
      chargeId: String(chargeData.id || ""),
      invoiceUrl: chargeData.invoiceUrl || undefined,
      billingType: chargeData.billingType || billingType,
    };

    if (billingType === "PIX") {
      const qrRes = await fetch(`${ASAAS_API_URL}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: ASAAS_API_KEY },
      });
      const qrData = await qrRes.json();
      responseData.pix = { encodedImage: qrData.encodedImage, payload: qrData.payload };
    }

    if (billingType === "BOLETO") {
      responseData.bankSlipUrl = chargeData.bankSlipUrl || undefined;
    }

    return NextResponse.json(responseData);
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao criar cobranca Asaas do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar cobranca." },
      { status: 500 }
    );
  }
}
