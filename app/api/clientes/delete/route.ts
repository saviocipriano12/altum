import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;
    const clientId = String(body.clientId || "").trim();

    if (!clientId) {
      return NextResponse.json({ error: "Campo obrigatorio: clientId." }, { status: 400 });
    }

    const clientRef = adminDb.collection("clientes").doc(clientId);
    const clientSnap = await clientRef.get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }

    const data = clientSnap.data() as { ownerId?: string };
    if (!isAdmin(user) && data.ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao para excluir este cliente." }, { status: 403 });
    }

    await clientRef.delete();

    await adminDb.collection("audit_logs").add({
      type: "client_delete",
      actorId: user.uid,
      actorName: user.name,
      clientId,
      clientName: String(clientSnap.data()?.name || ""),
      createdAt: new Date(),
    });

    return NextResponse.json({ ok: true, clientId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao excluir cliente:", error);
    return NextResponse.json({ error: "Falha ao excluir cliente." }, { status: 500 });
  }
}
