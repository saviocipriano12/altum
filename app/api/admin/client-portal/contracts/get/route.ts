import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildStripePlanReadiness } from "@/lib/platform-billing";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function isResourceExhausted(error: unknown) {
  if (typeof error !== "object" || !error) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  const details = "details" in error ? String((error as { details?: unknown }).details || "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  return code === "8" || details.includes("Quota exceeded") || message.includes("RESOURCE_EXHAUSTED");
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function normalizeFinanceStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "pago") return "pago";
  if (normalized === "atrasado") return "atrasado";
  if (normalized === "cancelado") return "cancelado";
  return "pendente";
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);
    if (!clientId) {
      return NextResponse.json({ error: "Parametro obrigatorio: clientId." }, { status: 400 });
    }

    const directTenantSnap = await adminDb.collection("tenants").doc(clientId).get().catch((error) => {
      if (isResourceExhausted(error)) {
        throw new RouteAuthError(429, "firebase_quota_exceeded", "A cota do Firebase/Firestore foi excedida.");
      }
      throw error;
    });
    const tenantSnap = directTenantSnap.exists
      ? null
      : await adminDb
        .collection("tenants")
        .where("legacyClientId", "==", clientId)
        .limit(1)
        .get()
        .catch((error) => {
        if (isResourceExhausted(error)) {
          throw new RouteAuthError(
            429,
            "firebase_quota_exceeded",
            "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
          );
        }
        throw error;
        });

    const tenantDoc = directTenantSnap.exists ? directTenantSnap : tenantSnap?.docs[0] || null;
    const tenantId = tenantDoc?.id || "";
    const tenantData = tenantDoc?.exists
      ? (tenantDoc.data() as Record<string, unknown>)
      : {};

    const [contractSnap, financeSnap] = await Promise.all([
      adminDb.collection("client_contracts").doc(clientId).get().catch((error) => {
        if (isResourceExhausted(error)) {
          throw new RouteAuthError(
            429,
            "firebase_quota_exceeded",
            "A cota do Firebase/Firestore foi excedida. Aguarde a liberacao da cota ou ative billing no Firebase."
          );
        }
        throw error;
      }),
      tenantId
        ? adminDb.collection("financeiro").where("tenantId", "==", tenantId).limit(80).get()
        : adminDb.collection("financeiro").where("clientId", "==", clientId).limit(80).get(),
    ]);

    if (!contractSnap.exists) {
      return NextResponse.json({
        ok: true,
        contract: null,
        tenant: tenantId
          ? {
              tenantId,
              status: clean(tenantData.status, 40) || "active",
              billingStatus: clean(tenantData.billingStatus, 40) || "active",
              blockedReason: clean(tenantData.blockedReason, 120) || null,
            }
          : null,
        billingOverview: null,
        recentFinance: [],
      });
    }

    const recentFinance = financeSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return {
          id: doc.id,
          descricao: clean(data.descricao, 180) || clean(data.referencia, 180) || "Lancamento",
          valor: Number(toNumber(data.valor).toFixed(2)),
          status: normalizeFinanceStatus(data.status),
          dueDate:
            clean(data.contractDueDate || data.vencimento || data.dueDate, 20) || null,
          billingType: clean(data.billingType, 40) || null,
          asaasChargeId: clean(data.asaasChargeId, 140) || null,
          paymentLink: clean(data.paymentLink || data.invoiceUrl, 500) || null,
          createdAt: toMillis(data.createdAt),
          updatedAt: toMillis(data.updatedAt),
          reminderStatus: clean(data.reminderStatus || data.manualReminderStatus, 80) || null,
        };
      })
      .sort((left, right) => {
        const leftScore = left.updatedAt || left.createdAt || 0;
        const rightScore = right.updatedAt || right.createdAt || 0;
        return rightScore - leftScore;
      })
      .slice(0, 12);

    const openFinance = recentFinance.filter((item) => item.status === "pendente" || item.status === "atrasado");
    const overdueFinance = recentFinance.filter((item) => item.status === "atrasado");
    const paidFinance = recentFinance.filter((item) => item.status === "pago");
    const nextFinance = [...openFinance].sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || ""))[0] || null;
    const contractData = contractSnap.data() as Record<string, unknown>;
    const accessStatus = clean(tenantData.status, 40) === "blocked" || clean(tenantData.billingStatus, 40) === "blocked"
      ? "blocked"
      : clean(contractData.platformAccessStatus, 40) || "active";
    const stripeSetup = buildStripePlanReadiness({
      platformPlan: clean(contractData.platformPlan, 120),
      billingProvider: clean(contractData.billingProvider, 40),
      platformAccessMode: clean(contractData.platformAccessMode, 80),
      stripeCustomerId: clean(contractData.stripeCustomerId, 180),
      stripeSubscriptionId: clean(contractData.stripeSubscriptionId, 180),
      stripeSubscriptionStatus: clean(contractData.stripeSubscriptionStatus, 80),
      stripeCurrentPeriodEnd: clean(contractData.stripeCurrentPeriodEnd, 40),
      stripeCheckoutUrl: clean(contractData.stripeCheckoutUrl, 800),
      stripeCustomerPortalUrl: clean(contractData.stripeCustomerPortalUrl, 800),
    });

    return NextResponse.json({
      ok: true,
      contract: {
        id: contractSnap.id,
        ...(contractSnap.data() as Record<string, unknown>),
      },
      tenant: tenantId
        ? {
            tenantId,
            status: clean(tenantData.status, 40) || "active",
            billingStatus: clean(tenantData.billingStatus, 40) || "active",
            blockedReason: clean(tenantData.blockedReason, 120) || null,
          }
        : null,
      billingOverview: {
        tenantId: tenantId || null,
        accessStatus,
        accessMode: clean(contractData.platformAccessMode, 60) || "manual_release",
        billingProvider: clean(contractData.billingProvider, 40) || "manual",
        autoBillingEnabled: contractData.autoBillingEnabled === true,
        contractStatus: clean(contractData.status, 40) || "ativo",
        openFinanceCount: openFinance.length,
        overdueFinanceCount: overdueFinance.length,
        paidFinanceCount: paidFinance.length,
        latestOpenAmount: Number(toNumber(nextFinance?.valor).toFixed(2)),
        latestOpenDueDate: nextFinance?.dueDate || clean(contractData.nextDueDate, 20) || null,
        latestOpenStatus: nextFinance?.status || null,
        lastPaidAmount: Number(toNumber(paidFinance[0]?.valor).toFixed(2)),
        lastPaidAt: paidFinance[0]?.updatedAt || paidFinance[0]?.createdAt || 0,
        lastAutoChargeDueDate: clean(contractData.lastAutoChargeDueDate, 20) || null,
        lastAutoChargeFinanceId: clean(contractData.lastAutoChargeFinanceId, 140) || null,
        stripeSetup,
      },
      recentFinance,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao buscar contrato do portal:", error);
    return NextResponse.json({ error: "Falha ao buscar contrato do portal." }, { status: 500 });
  }
}
