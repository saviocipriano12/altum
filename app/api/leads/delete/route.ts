import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  leadId?: string;
};

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;
    const leadId = (body.leadId || "").trim();

    if (!leadId) {
      return NextResponse.json({ error: "Campo obrigatorio: leadId." }, { status: 400 });
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as { ownerId?: string };
    const ownerId = leadData.ownerId || null;
    if (!isAdmin(user) && ownerId !== user.uid) {
      return NextResponse.json({ error: "Sem permissao para remover este lead." }, { status: 403 });
    }

    await leadRef.delete();
    return NextResponse.json({ ok: true, leadId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao remover lead:", error);
    return NextResponse.json({ error: "Falha ao remover lead." }, { status: 500 });
  }
}

