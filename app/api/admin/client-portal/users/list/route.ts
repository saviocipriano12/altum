import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function resolveTenantIdFromClient(clientId: string) {
  try {
    const directTenant = await adminDb.collection("tenants").doc(clientId).get();
    if (directTenant.exists) return directTenant.id;
  } catch (error) {
    console.warn("Falha ao resolver tenant direto:", clientId, error);
  }

  try {
    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    if (clientSnap.exists) {
      const clientData = clientSnap.data() as Record<string, unknown>;
      const directTenantId =
        clean(clientData.tenantId, 140) ||
        clean(clientData.portalTenantId, 140) ||
        clean(clientData.defaultTenantId, 140);
      if (directTenantId) return directTenantId;
    }
  } catch (error) {
    console.warn("Falha ao resolver tenant pelo documento do cliente:", clientId, error);
  }

  try {
    const tenantSnap = await adminDb
      .collection("tenants")
      .where("legacyClientId", "==", clientId)
      .limit(1)
      .get();
    return tenantSnap.empty ? "" : tenantSnap.docs[0].id;
  } catch (error) {
    console.warn("Falha ao resolver tenant por legacyClientId:", clientId, error);
    return "";
  }
}

async function listTenantPortalUsers(tenantId: string) {
  if (!tenantId) return null;

  try {
    const usersSnap = await adminDb
      .collection("tenant_users")
      .where("tenantId", "==", tenantId)
      .limit(80)
      .get();

    return usersSnap.docs
      .map((doc): Record<string, unknown> => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }))
      .filter((item) => {
        const role = String(item.role || "");
        return role.startsWith("client_") || role === "client";
      });
  } catch (error) {
    console.warn("Falha ao listar tenant_users do portal:", tenantId, error);
    return null;
  }
}

async function listLegacyPortalUsers(clientId: string) {
  try {
    const snap = await adminDb
      .collection("client_portal_users")
      .where("clientId", "==", clientId)
      .limit(50)
      .get();

    return snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));
  } catch (error) {
    console.warn("Falha ao listar client_portal_users:", clientId, error);
    return [];
  }
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });

    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);
    if (!clientId) {
      return NextResponse.json({ error: "Parametro obrigatorio: clientId." }, { status: 400 });
    }

    const tenantId = await resolveTenantIdFromClient(clientId);
    const tenantUsers = await listTenantPortalUsers(tenantId);
    const items = tenantUsers && tenantUsers.length > 0 ? tenantUsers : await listLegacyPortalUsers(clientId);

    return NextResponse.json({ ok: true, tenantId: tenantId || null, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar usuarios do portal:", error);
    return NextResponse.json({ error: "Falha ao listar usuarios do portal." }, { status: 500 });
  }
}
