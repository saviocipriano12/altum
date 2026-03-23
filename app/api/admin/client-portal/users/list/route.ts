import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });

    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);
    if (!clientId) {
      return NextResponse.json({ error: "Parametro obrigatorio: clientId." }, { status: 400 });
    }

    const tenantSnap = await adminDb
      .collection("tenants")
      .where("legacyClientId", "==", clientId)
      .limit(1)
      .get();

    let items: Array<Record<string, unknown>> = [];

    if (!tenantSnap.empty) {
      const tenantId = tenantSnap.docs[0].id;
      const usersSnap = await adminDb
        .collection("tenant_users")
        .where("tenantId", "==", tenantId)
        .limit(80)
        .get();

      items = usersSnap.docs
        .map((doc): Record<string, unknown> => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        }))
        .filter((item) => {
          const role = String(item.role || "");
          return role.startsWith("client_") || role === "client";
        });
    } else {
      const snap = await adminDb
        .collection("client_portal_users")
        .where("clientId", "==", clientId)
        .limit(50)
        .get();

      items = snap.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Record<string, unknown>),
      }));
    }

    return NextResponse.json({ ok: true, items });
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
