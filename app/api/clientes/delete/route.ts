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

    if (!/^[A-Za-z0-9_-]{1,180}$/.test(clientId)) {
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

    await adminDb.runTransaction(async transaction => {
      const [current, directTenant, directContract, ...dependencies] = await Promise.all([
        transaction.get(clientRef), transaction.get(adminDb.collection("tenants").doc(clientId)), transaction.get(adminDb.collection("client_contracts").doc(clientId)),
        ...["projetos", "financeiro", "orcamentos", "ad_accounts", "client_contracts", "atividades"].map(collection => transaction.get(adminDb.collection(collection).where("clientId", "==", clientId).limit(1))),
        transaction.get(adminDb.collection("tenants").where("legacyClientId", "==", clientId).limit(1)),
      ]);
      if (!current.exists) throw new RouteAuthError(404, "company_not_found", "Empresa não encontrada.");
      if (!isAdmin(user) && current.data()?.ownerId !== user.uid) throw new RouteAuthError(403, "company_access_denied", "Empresa fora da sua carteira.");
      if (directTenant.exists || directContract.exists || dependencies.some(snapshot => !snapshot.empty)) throw new RouteAuthError(409, "company_has_dependencies", "Esta empresa possui histórico, contrato ou workspace. Preserve o cadastro e encerre a operação pela ficha da empresa.");
      transaction.delete(clientRef);
      transaction.set(adminDb.collection("audit_logs").doc(), {
      type: "client_delete",
      actorId: user.uid,
      actorName: user.name,
      clientId,
      clientName: String(clientSnap.data()?.name || ""),
      createdAt: new Date(),
      });
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
