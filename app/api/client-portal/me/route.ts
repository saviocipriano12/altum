import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";
import { getTenantSettings } from "@/lib/server/tenant";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = String(searchParams.get("tenantId") || "").trim();
    const portalUser = await requirePortalRequestUser(req, {
      tenantId: tenantId || undefined,
    });

    const [tenantSnap, settings, legacyClientSnap] = await Promise.all([
      adminDb.collection("tenants").doc(portalUser.tenantId).get(),
      getTenantSettings(portalUser.tenantId),
      adminDb.collection("clientes").doc(portalUser.clientId).get(),
    ]);

    const tenantData = tenantSnap.exists ? (tenantSnap.data() as Record<string, unknown>) : {};
    const legacyClientData = legacyClientSnap.exists
      ? (legacyClientSnap.data() as Record<string, unknown>)
      : {};

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
