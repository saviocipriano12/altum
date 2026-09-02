import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildStripePlanReadiness, getStripeIntegrationEnvStatus } from "@/lib/platform-billing";

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeFinanceStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "pago") return "pago";
  if (normalized === "atrasado") return "atrasado";
  if (normalized === "cancelado") return "cancelado";
  return "pendente";
}

function parseDate(value: unknown) {
  const normalized = clean(value, 20);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function timestampToIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });

    const [contractsSnap, tenantsSnap, financeSnap] = await Promise.all([
      adminDb.collection("client_contracts").get(),
      adminDb.collection("tenants").get(),
      adminDb.collection("financeiro").limit(1200).get(),
    ]);

    const tenantsByClientId = new Map<string, Record<string, unknown>>();
    for (const doc of tenantsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const legacyClientId = clean(data.legacyClientId, 140);
      const row = { id: doc.id, ...data };
      tenantsByClientId.set(doc.id, row);
      if (legacyClientId) tenantsByClientId.set(legacyClientId, row);
    }

    const financeByKey = new Map<string, Array<Record<string, unknown> & { id: string }>>();
    for (const doc of financeSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const contractId = clean(data.contractId, 140);
      const tenantId = clean(data.tenantId, 140);
      const clientId = clean(data.clientId, 140);
      const entry = { id: doc.id, ...data };

      for (const key of [contractId, tenantId, clientId].filter(Boolean)) {
        const bucket = financeByKey.get(key) || [];
        bucket.push(entry);
        financeByKey.set(key, bucket);
      }
    }

    const now = new Date();
    const actionItems: Array<{
      clientId: string;
      clientName: string;
      tenantId: string | null;
      platformPlan: string | null;
      billingProvider: string;
      accessMode: string;
      accessStatus: string;
      monthlyValue: number;
      dueDate: string | null;
      financeStatus: string | null;
      reasons: string[];
      severity: number;
    }> = [];
    const customers: Array<Record<string, unknown>> = [];

    let monthlyPlatformValue = 0;
    let overdueAmount = 0;
    let openFinanceCount = 0;
    let overdueFinanceCount = 0;
    let stripeContracts = 0;
    let includedContracts = 0;
    let manualContracts = 0;
    let activeContracts = 0;
    let blockedContracts = 0;

    for (const doc of contractsSnap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const clientId = clean(data.clientId, 140) || doc.id;
      const clientName = clean(data.clientName, 180) || "Cliente";
      const tenant = tenantsByClientId.get(clientId) || null;
      const tenantId = tenant ? clean(tenant.id, 140) : "";
      const tenantStatus = clean(tenant?.status, 40).toLowerCase();
      const tenantBillingStatus = clean(tenant?.billingStatus, 40).toLowerCase();
      const billingStatus = tenantBillingStatus || clean(data.billingStatus, 40).toLowerCase() || "active";
      const billingProvider = clean(data.billingProvider, 40).toLowerCase() || "manual";
      const accessMode = clean(data.platformAccessMode, 80).toLowerCase() || "manual_release";
      const contractAccessStatus = clean(data.platformAccessStatus, 40).toLowerCase() || "active";
      const trialEndsAt = timestampToIso(tenant?.trialEndsAt || data.trialEndsAt);
      const trialEndMs = trialEndsAt ? new Date(trialEndsAt).getTime() : Number.NaN;
      const trialIsActive = billingStatus === "trial" && Boolean(
        !trialEndsAt || (Number.isFinite(trialEndMs) && trialEndMs > now.getTime())
      );
      const accessStatus =
        tenantStatus === "blocked" || tenantBillingStatus === "blocked"
          ? "blocked"
          : trialIsActive
            ? "trial"
            : contractAccessStatus;
      const monthlyValue = Number(toNumber(data.monthlyValue).toFixed(2));
      const platformPlan = clean(data.platformPlan, 120) || null;

      monthlyPlatformValue += monthlyValue;
      if (accessStatus === "blocked") blockedContracts += 1;
      else activeContracts += 1;

      if (billingProvider === "stripe" || accessMode === "stripe_subscription") stripeContracts += 1;
      if (billingProvider === "included" || accessMode === "agency_included") includedContracts += 1;
      if (billingProvider === "manual" || billingProvider === "asaas" || accessMode === "manual_release") {
        manualContracts += 1;
      }

      const financeItems = [
        ...(financeByKey.get(doc.id) || []),
        ...(tenantId ? financeByKey.get(tenantId) || [] : []),
        ...(financeByKey.get(clientId) || []),
      ];

      const uniqueFinance = Array.from(
        new Map(financeItems.map((item) => [item.id, item])).values()
      );

      const openItems = uniqueFinance
        .map((item) => ({
          ...item,
          normalizedStatus: normalizeFinanceStatus(item.status),
          normalizedDueDate:
            clean(item.contractDueDate || item.vencimento || item.dueDate, 20) || null,
        }))
        .filter((item) => item.normalizedStatus === "pendente" || item.normalizedStatus === "atrasado")
        .sort((left, right) => {
          return (parseDate(left.normalizedDueDate)?.getTime() || Number.MAX_SAFE_INTEGER) -
            (parseDate(right.normalizedDueDate)?.getTime() || Number.MAX_SAFE_INTEGER);
        });

      openFinanceCount += openItems.length;
      overdueFinanceCount += openItems.filter((item) => item.normalizedStatus === "atrasado").length;
      overdueAmount += openItems
        .filter((item) => item.normalizedStatus === "atrasado")
        .reduce((sum, item) => sum + toNumber((item as Record<string, unknown>).valor), 0);

      const nextOpen = openItems[0] || null;
      const stripeSetup = buildStripePlanReadiness({
        platformPlan,
        billingProvider,
        platformAccessMode: accessMode,
        stripeCustomerId: clean(data.stripeCustomerId, 180),
        stripeSubscriptionId: clean(data.stripeSubscriptionId, 180),
        stripeSubscriptionStatus: clean(data.stripeSubscriptionStatus, 80),
        stripeCurrentPeriodEnd: clean(data.stripeCurrentPeriodEnd, 40),
        stripeCheckoutUrl: clean(data.stripeCheckoutUrl, 800),
        stripeCustomerPortalUrl: clean(data.stripeCustomerPortalUrl, 800),
      });

      const reasons: string[] = [];
      let severity = 0;

      if (accessStatus === "blocked") {
        reasons.push("Acesso bloqueado");
        severity += 5;
      }

      if (nextOpen?.normalizedStatus === "atrasado") {
        reasons.push(`Mensalidade em atraso${nextOpen.normalizedDueDate ? ` desde ${nextOpen.normalizedDueDate}` : ""}`);
        severity += 4;
      } else if (nextOpen?.normalizedDueDate) {
        const dueDate = parseDate(nextOpen.normalizedDueDate);
        const diffDays = dueDate
          ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        if (diffDays <= 5) {
          reasons.push(`Vencimento proximo (${nextOpen.normalizedDueDate})`);
          severity += diffDays <= 0 ? 3 : 2;
        }
      }

      if (stripeSetup.enabled && stripeSetup.missing.length > 0) {
        reasons.push("Stripe incompleto");
        severity += 2;
      }

      if ((billingProvider === "manual" || billingProvider === "asaas") && accessMode === "manual_release") {
        reasons.push("Operacao depende de liberacao manual");
        severity += 1;
      }

      customers.push({
        clientId,
        clientName,
        tenantId: tenantId || null,
        responsibleEmail: clean(tenant?.responsibleEmail, 180) || null,
        signupSource: clean(tenant?.signupSource, 80) || "admin",
        platformPlan,
        billingProvider,
        billingStatus,
        accessMode,
        accessStatus,
        monthlyValue,
        trialEndsAt,
        accessEndsAt: timestampToIso(tenant?.accessEndsAt || data.accessEndsAt),
        nextDueDate: nextOpen?.normalizedDueDate || clean(data.nextDueDate, 20) || null,
        financeStatus: nextOpen?.normalizedStatus || null,
        asaasCheckoutId: clean(tenant?.asaasCheckoutId || data.asaasCheckoutId, 180) || null,
        asaasSubscriptionId: clean(tenant?.asaasSubscriptionId || data.asaasSubscriptionId, 180) || null,
        createdAt: timestampToIso(tenant?.createdAt || data.createdAt),
        reasons,
      });

      if (reasons.length > 0) {
        actionItems.push({
          clientId,
          clientName,
          tenantId: tenantId || null,
          platformPlan,
          billingProvider,
          accessMode,
          accessStatus,
          monthlyValue,
          dueDate: nextOpen?.normalizedDueDate || clean(data.nextDueDate, 20) || null,
          financeStatus: nextOpen?.normalizedStatus || null,
          reasons,
          severity,
        });
      }
    }

    const stripeEnv = getStripeIntegrationEnvStatus();

    return NextResponse.json({
      ok: true,
      summary: {
        totalContracts: contractsSnap.size,
        activeContracts,
        blockedContracts,
        stripeContracts,
        includedContracts,
        manualContracts,
        openFinanceCount,
        overdueFinanceCount,
        monthlyPlatformValue: Number(monthlyPlatformValue.toFixed(2)),
        overdueAmount: Number(overdueAmount.toFixed(2)),
        stripeReady: stripeEnv.ready,
        stripeMissing: stripeEnv.missing,
      },
      actionItems: actionItems
        .sort((left, right) => {
          if (right.severity !== left.severity) return right.severity - left.severity;
          return (left.dueDate || "").localeCompare(right.dueDate || "");
        })
        .slice(0, 12),
      customers: customers.sort((left, right) => {
        return String(right.createdAt || "").localeCompare(String(left.createdAt || ""));
      }),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar overview de billing:", error);
    return NextResponse.json({ error: "Falha ao carregar overview de billing." }, { status: 500 });
  }
}
