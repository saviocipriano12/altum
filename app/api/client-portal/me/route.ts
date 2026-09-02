import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import { getTenantSettings } from "@/lib/server/tenant";
import { ensureActiveTrialFullAccess } from "@/lib/server/platform-plan-entitlements";

function cleanDocId(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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

async function safeGetDoc(collection: string, docId: string) {
  const id = cleanDocId(docId);
  if (!id) return {};

  try {
    const snap = await adminDb.collection(collection).doc(id).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : {};
  } catch (error) {
    console.warn(`Falha ao buscar ${collection}/${id} no portal:`, error);
    return {};
  }
}

async function safeGetTenantSettings(tenantId: string) {
  try {
    return await getTenantSettings(tenantId);
  } catch (error) {
    console.warn("Falha ao carregar tenant settings no portal:", tenantId, error);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = String(searchParams.get("tenantId") || "").trim();
    const portalUser = await requirePortalRequestUser(req, {
      tenantId: tenantId || undefined,
    });

    const [tenantData, settings] = await Promise.all([
      safeGetDoc("tenants", portalUser.tenantId),
      safeGetTenantSettings(portalUser.tenantId),
    ]);
    const trialAccess = await ensureActiveTrialFullAccess({
      tenantId: portalUser.tenantId,
      tenantData,
      currentEntitlements: portalUser.entitlements,
      actorId: portalUser.uid,
    });
    const effectiveEntitlements = trialAccess.entitlements
      ? {
          ...portalUser.entitlements,
          modules: trialAccess.entitlements.modules,
          limits: trialAccess.entitlements.limits,
        }
      : portalUser.entitlements;

    const legacyClientId =
      cleanDocId(portalUser.clientId) ||
      cleanDocId(tenantData.legacyClientId) ||
      cleanDocId(tenantData.clientId);
    const legacyClientData = await safeGetDoc("clientes", legacyClientId);

    const clientData = {
      ...legacyClientData,
      ...tenantData,
      ...(settings || {}),
      id: portalUser.tenantId,
      tenantId: portalUser.tenantId,
    };

    return NextResponse.json({
      ok: true,
      portalUser: {
        uid: portalUser.uid,
        email: portalUser.email,
        name: portalUser.name,
        tenantId: portalUser.tenantId,
        tenantName: portalUser.tenantName,
        tenantRole: portalUser.tenantRole,
        clientId: portalUser.clientId,
        clientName: portalUser.clientName,
        capabilities: portalUser.capabilities,
        entitlements: effectiveEntitlements,
      },
      client: clientData,
      billing: {
        status: cleanDocId(tenantData.billingStatus, 40) || "active",
        provider: cleanDocId(tenantData.billingProvider, 40) || null,
        planId: cleanDocId(tenantData.platformPlan, 80) || null,
        pendingPlanId: cleanDocId(tenantData.pendingPlan, 80) || null,
        trialEndsAt: timestampToIso(tenantData.trialEndsAt),
        blockAt: timestampToIso(tenantData.billingBlockAt),
        accessEndsAt: timestampToIso(tenantData.accessEndsAt),
        cancelAtPeriodEnd: Boolean(tenantData.cancelAtPeriodEnd),
        subscriptionId: cleanDocId(tenantData.asaasSubscriptionId, 180) || null,
      },
    });
  } catch (error) {
    if (error instanceof PortalAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao carregar dados do portal:", error);
    return NextResponse.json({ error: "Falha ao carregar dados do portal." }, { status: 500 });
  }
}
