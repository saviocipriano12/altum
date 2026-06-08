import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import { getTenantSettings } from "@/lib/server/tenant";

function cleanDocId(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
      },
      client: clientData,
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
