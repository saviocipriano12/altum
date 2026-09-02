import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhoneBR } from "@/app/lib/server/phone";

type Body = {
  clientId?: string;
  title?: string;
  status?: "ativo" | "encerrado" | "suspenso";
  monthlyValue?: number;
  dueDay?: number;
  startDate?: string;
  nextDueDate?: string;
  notes?: string;
  paymentLink?: string;
  autoBillingEnabled?: boolean;
  autoBillingAdvanceDays?: number;
  autoBillingBillingType?: "PIX" | "BOLETO" | "CREDIT_CARD" | string;
  reminderWhatsAppPhones?: string[] | string;
  autoSuspendEnabled?: boolean;
  autoSuspendBusinessDays?: number;
  platformPlan?: string;
  platformAccessMode?: "stripe_subscription" | "agency_included" | "manual_release" | "disabled" | string;
  platformAccessStatus?: "active" | "trial" | "blocked" | "pending" | string;
  billingProvider?: "stripe" | "asaas" | "manual" | "included" | string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripePriceId?: string;
  stripeSubscriptionStatus?: string;
  stripeCurrentPeriodEnd?: string;
  stripeCheckoutUrl?: string;
  stripeCustomerPortalUrl?: string;
  billingNotes?: string;
  whatsappCostMonthlyBrl?: number;
  telephonyCostMonthlyBrl?: number;
  otherVariableCostMonthlyBrl?: number;
  aiUsdBrlRate?: number;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBillingType(value: unknown) {
  const normalized = clean(value, 40).toUpperCase();
  if (normalized === "BOLETO" || normalized === "CREDIT_CARD") return normalized;
  return "PIX";
}

function normalizeAccessMode(value: unknown) {
  const normalized = clean(value, 60).toLowerCase();
  if (
    normalized === "stripe_subscription" ||
    normalized === "agency_included" ||
    normalized === "manual_release" ||
    normalized === "disabled"
  ) {
    return normalized;
  }
  return "manual_release";
}

function normalizeAccessStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "trial" || normalized === "blocked" || normalized === "pending") {
    return normalized;
  }
  return "active";
}

function normalizeBillingProvider(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "stripe" || normalized === "asaas" || normalized === "included") {
    return normalized;
  }
  return "manual";
}

function parseReminderPhones(value: unknown) {
  const source = Array.isArray(value)
    ? value.map((item) => clean(item, 40))
    : clean(value, 600)
        .split(/[\n,;]+/)
        .map((item) => clean(item, 40));

  return Array.from(
    new Set(
      source
        .map((item) => normalizePhoneBR(item))
        .filter((phone) => phone.length >= 12)
    )
  ).slice(0, 8);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 120);
    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }

    const [clientSnap, directTenantSnap] = await Promise.all([
      adminDb.collection("clientes").doc(clientId).get(),
      adminDb.collection("tenants").doc(clientId).get(),
    ]);
    if (!clientSnap.exists && !directTenantSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const clientData = (clientSnap.exists ? clientSnap.data() : directTenantSnap.data()) as { name?: string };
    const contractRef = adminDb.collection("client_contracts").doc(clientId);
    const previousContractSnap = await contractRef.get();
    const previousContract = previousContractSnap.exists
      ? (previousContractSnap.data() as Record<string, unknown>)
      : {};
    const platformAccessMode = normalizeAccessMode(body.platformAccessMode);
    const billingProvider = normalizeBillingProvider(body.billingProvider);
    const autoBillingEnabled =
      body.autoBillingEnabled === true &&
      billingProvider === "asaas" &&
      platformAccessMode !== "agency_included" &&
      platformAccessMode !== "stripe_subscription" &&
      platformAccessMode !== "disabled";

    const payload = {
      clientId,
      clientName: clientData.name || "Cliente",
      title: clean(body.title, 180) || "Contrato de Prestacao de Servicos",
      status: body.status === "encerrado" || body.status === "suspenso" ? body.status : "ativo",
      monthlyValue: Number(toNumber(body.monthlyValue).toFixed(2)),
      dueDay: Math.min(31, Math.max(1, Math.round(toNumber(body.dueDay, 10)))),
      startDate: clean(body.startDate, 16) || null,
      nextDueDate: clean(body.nextDueDate, 16) || null,
      notes: clean(body.notes, 3000) || null,
      paymentLink: clean(body.paymentLink, 500) || null,
      autoBillingEnabled,
      autoBillingAdvanceDays: Math.min(15, Math.max(1, Math.round(toNumber(body.autoBillingAdvanceDays, 5)))),
      autoBillingBillingType: normalizeBillingType(body.autoBillingBillingType),
      reminderWhatsAppPhones: parseReminderPhones(body.reminderWhatsAppPhones),
      autoSuspendEnabled: body.autoSuspendEnabled !== false,
      autoSuspendBusinessDays: Math.min(10, Math.max(1, Math.round(toNumber(body.autoSuspendBusinessDays, 2)))),
      platformPlan: clean(body.platformPlan, 120) || null,
      platformAccessMode,
      platformAccessStatus: normalizeAccessStatus(body.platformAccessStatus),
      billingProvider,
      stripeCustomerId: clean(body.stripeCustomerId, 180) || null,
      stripeSubscriptionId: clean(body.stripeSubscriptionId, 180) || null,
      stripePriceId: clean(body.stripePriceId, 180) || null,
      stripeSubscriptionStatus: clean(body.stripeSubscriptionStatus, 80) || null,
      stripeCurrentPeriodEnd: clean(body.stripeCurrentPeriodEnd, 40) || null,
      stripeCheckoutUrl: clean(body.stripeCheckoutUrl, 800) || null,
      stripeCustomerPortalUrl: clean(body.stripeCustomerPortalUrl, 800) || null,
      billingNotes: clean(body.billingNotes, 4000) || null,
      whatsappCostMonthlyBrl: Math.max(0, Number(toNumber(body.whatsappCostMonthlyBrl).toFixed(2))),
      telephonyCostMonthlyBrl: Math.max(0, Number(toNumber(body.telephonyCostMonthlyBrl).toFixed(2))),
      otherVariableCostMonthlyBrl: Math.max(0, Number(toNumber(body.otherVariableCostMonthlyBrl).toFixed(2))),
      aiUsdBrlRate: Math.max(0, Number(toNumber(body.aiUsdBrlRate, 5.5).toFixed(4))),
      updatedBy: user.uid,
      updatedByName: user.name,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    await Promise.all([
      contractRef.set(payload, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "client_portal_contract_upsert",
        actorId: user.uid,
        actorName: user.name,
        clientId,
        before: {
          monthlyValue: toNumber(previousContract.monthlyValue),
          status: clean(previousContract.status, 40),
          platformPlan: clean(previousContract.platformPlan, 120),
          platformAccessStatus: clean(previousContract.platformAccessStatus, 40),
          whatsappCostMonthlyBrl: toNumber(previousContract.whatsappCostMonthlyBrl),
          telephonyCostMonthlyBrl: toNumber(previousContract.telephonyCostMonthlyBrl),
          otherVariableCostMonthlyBrl: toNumber(previousContract.otherVariableCostMonthlyBrl),
        },
        after: {
          monthlyValue: payload.monthlyValue,
          status: payload.status,
          platformPlan: payload.platformPlan,
          platformAccessStatus: payload.platformAccessStatus,
          whatsappCostMonthlyBrl: payload.whatsappCostMonthlyBrl,
          telephonyCostMonthlyBrl: payload.telephonyCostMonthlyBrl,
          otherVariableCostMonthlyBrl: payload.otherVariableCostMonthlyBrl,
        },
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, clientId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao salvar contrato do portal:", error);
    return NextResponse.json({ error: "Falha ao salvar contrato do portal." }, { status: 500 });
  }
}
