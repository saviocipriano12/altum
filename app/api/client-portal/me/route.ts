import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { PortalAuthError, requirePortalRequestUser } from "@/app/lib/server/portal-auth";

export async function GET(req: Request) {
  try {
    const portalUser = await requirePortalRequestUser(req);

    const clientSnap = await adminDb.collection("clientes").doc(portalUser.clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente vinculado nao encontrado." }, { status: 404 });
    }
    const clientData = clientSnap.data() as Record<string, unknown>;

    return NextResponse.json({
      ok: true,
      portalUser: {
        uid: portalUser.uid,
        email: portalUser.email,
        name: portalUser.name,
        clientId: portalUser.clientId,
        clientName: portalUser.clientName,
      },
      client: {
        id: clientSnap.id,
        ...clientData,
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
