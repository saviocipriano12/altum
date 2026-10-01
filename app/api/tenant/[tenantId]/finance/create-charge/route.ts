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
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertLeadCommercialAccess } from "@/lib/server/commercial-access";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

type Body = {
  approvalActionId?: string;
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

async function findAsaasChargeByExternalReference(externalReference: string) {
  const response = await fetch(
    `${ASAAS_API_URL}/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`,
    { headers: { access_token: ASAAS_API_KEY as string } }
  );
  if (!response.ok) return null;
  const payload = await response.json() as { data?: Array<Record<string, unknown>> };
  return payload.data?.[0] || null;
}

function sameMoney(left: unknown, right: unknown) {
  return Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
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
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "manage_commercial");

    if (!ASAAS_API_KEY) {
      return NextResponse.json({ error: "Configuracao Asaas ausente no servidor." }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    const amount = normalizeChargeAmount(body.amount);
    const billingType = normalizeChargeBillingType(body.billingType);
    const leadId = clean(body.leadId, 140);
    const budgetId = clean(body.budgetId, 140);
    const approvalActionId = clean(body.approvalActionId, 180);
    const explicitDescription = clean(body.description, 180);
    const dueDate = resolveChargeDueDate(body.dueDate);

    if (!amount || !leadId || !approvalActionId) {
      return NextResponse.json({ error: "A cobranca precisa de cliente, valor e aprovacao humana valida." }, { status: 400 });
    }
    await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId });

    const actionRef = adminDb.collection("commercial_agent_actions").doc(approvalActionId);
    const actionSnap = await actionRef.get();
    if (!actionSnap.exists) {
      return NextResponse.json({ error: "Aprovacao de cobranca nao encontrada." }, { status: 404 });
    }
    const action = actionSnap.data() as Record<string, unknown>;
    const actionPayload = action.payload && typeof action.payload === "object"
      ? action.payload as Record<string, unknown>
      : {};
    const actionBudgetId = clean(actionPayload.budgetId, 140);
    const actionStatus = clean(action.status, 40);
    if (
      clean(action.tenantId, 180) !== tenantId ||
      clean(action.leadId, 140) !== leadId ||
      clean(action.type, 60) !== "review_charge"
    ) {
      return NextResponse.json({ error: "Aprovacao nao pertence a esta cobranca." }, { status: 403 });
    }
    if (!sameMoney(action.amount, amount)) {
      return NextResponse.json({ error: "O valor mudou depois da aprovacao. Prepare uma nova solicitacao." }, { status: 409 });
    }
    if (actionBudgetId !== budgetId) {
      return NextResponse.json({ error: "A proposta vinculada mudou depois da aprovacao." }, { status: 409 });
    }
    if (normalizeChargeBillingType(actionPayload.billingType) !== billingType) {
      return NextResponse.json({ error: "O meio de pagamento mudou depois da aprovacao." }, { status: 409 });
    }
    if (resolveChargeDueDate(actionPayload.dueDate as string | undefined) !== dueDate) {
      return NextResponse.json({ error: "O vencimento mudou depois da aprovacao." }, { status: 409 });
    }

    const financeRef = adminDb.collection("financeiro").doc(`agent_charge_${approvalActionId}`);
    if (actionStatus === "executed") {
      const existingFinance = await financeRef.get();
      const existing = existingFinance.exists ? existingFinance.data() as Record<string, unknown> : {};
      return NextResponse.json({
        ok: true,
        tenantId,
        financeId: financeRef.id,
        chargeId: clean(existing.asaasChargeId, 180),
        invoiceUrl: clean(existing.invoiceUrl, 600) || undefined,
        bankSlipUrl: clean(existing.bankSlipUrl, 600) || undefined,
        billingType: clean(existing.billingType, 40) || billingType,
        reused: true,
      });
    }
    if (!["approved", "execution_failed"].includes(actionStatus)) {
      return NextResponse.json({ error: actionStatus === "executing" ? "A cobranca ja esta sendo processada." : "A cobranca ainda nao foi aprovada." }, { status: 409 });
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
      if (!budget) {
        return NextResponse.json({ error: "A proposta aprovada nao esta mais disponivel." }, { status: 409 });
      }
    }

    const customerName = clean(body.customerInfo?.name, 180) || clean(lead.nome, 180);
    const customerEmail = clean(body.customerInfo?.email, 180) || clean(lead.email, 180);
    const customerPhone = clean(body.customerInfo?.phone, 40) || clean(lead.telefone, 40);
    const customerCpfCnpj = clean(body.customerInfo?.cpfCnpj, 30);

    if (!customerName || !customerEmail) {
      return NextResponse.json({ error: "Lead precisa ter nome e email para gerar cobranca." }, { status: 400 });
    }

    const method = resolveChargeMethodForAsaas(billingType);
    const description = resolveChargeDescription({
      explicitDescription,
      budgetTitle: budget?.titulo,
      customerName,
    });

    const externalReference = `altum:${approvalActionId}`;
    await adminDb.runTransaction(async (transaction) => {
      const freshSnap = await transaction.get(actionRef);
      const freshStatus = clean(freshSnap.data()?.status, 40);
      if (!["approved", "execution_failed"].includes(freshStatus)) {
        throw new TenantAccessError("charge_action_not_ready", "Esta cobranca ja foi processada ou nao esta aprovada.");
      }
      transaction.set(actionRef, {
        status: "executing",
        executionStartedAt: FieldValue.serverTimestamp(),
        executionStartedBy: user.uid,
        externalReference,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    let chargeData: Record<string, unknown> | null = null;
    try {
      chargeData = await findAsaasChargeByExternalReference(externalReference);
      if (!chargeData) {
        const customerId = await ensureAsaasCustomer({
          name: customerName,
          email: customerEmail,
          cpfCnpj: customerCpfCnpj || undefined,
          phone: customerPhone || undefined,
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
            externalReference,
          }),
        });
        chargeData = await chargeRes.json() as Record<string, unknown>;
        const errors = Array.isArray(chargeData.errors) ? chargeData.errors as Array<{ description?: string }> : [];
        if (errors.length) {
          await actionRef.set({ status: "approved", lastExecutionError: errors[0]?.description || "Falha no Asaas.", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return NextResponse.json({ error: errors[0]?.description || "Falha ao gerar cobranca." }, { status: 400 });
        }
      }
    } catch (error) {
      chargeData = await findAsaasChargeByExternalReference(externalReference).catch(() => null);
      if (!chargeData) {
        await actionRef.set({ status: "execution_failed", lastExecutionError: error instanceof Error ? error.message : "Retorno inconclusivo do Asaas.", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return NextResponse.json({ error: "O retorno do Asaas foi inconclusivo. A Altum bloqueou nova emissao ate reconciliar a referencia." }, { status: 502 });
      }
    }

    const settings = await getTenantSettings(tenantId);
    await financeRef.set({
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
      commercialAgentActionId: approvalActionId,
      externalReference,
      billingType,
      invoiceUrl: chargeData.invoiceUrl || null,
      bankSlipUrl: chargeData.bankSlipUrl || null,
      clientEmail: customerEmail,
      clientPhone: customerPhone || null,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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
      leadSnap.ref.collection("events").doc(`charge_${approvalActionId}`).set({
        type: "finance_charge_created",
        title: "Cobranca criada",
        detail: `${description} gerada via Asaas.`,
        financeId: financeRef.id,
        asaasChargeId: String(chargeData.id || ""),
        actorId: user.uid,
        actorName: user.name,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      actionRef.set({
        status: "executed",
        executedAt: FieldValue.serverTimestamp(),
        executedBy: user.uid,
        executionResult: {
          financeId: financeRef.id,
          asaasChargeId: String(chargeData.id || ""),
          invoiceUrl: chargeData.invoiceUrl || null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
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
      financeId: financeRef.id,
      chargeId: String(chargeData.id || ""),
      invoiceUrl: clean(chargeData.invoiceUrl, 600) || undefined,
      billingType: clean(chargeData.billingType, 40) || billingType,
    };

    if (billingType === "PIX") {
      const qrRes = await fetch(`${ASAAS_API_URL}/payments/${chargeData.id}/pixQrCode`, {
        headers: { access_token: ASAAS_API_KEY },
      });
      const qrData = await qrRes.json();
      responseData.pix = { encodedImage: qrData.encodedImage, payload: qrData.payload };
    }

    if (billingType === "BOLETO") {
      responseData.bankSlipUrl = clean(chargeData.bankSlipUrl, 600) || undefined;
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
