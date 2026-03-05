import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  id?: string;
};

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;
    const id = (body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Campo obrigatorio: id." }, { status: 400 });
    }

    const ref = adminDb.collection("financeiro").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Transacao nao encontrada." }, { status: 404 });
    }

    await ref.delete();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao remover transacao financeira:", error);
    return NextResponse.json({ error: "Falha ao remover transacao." }, { status: 500 });
  }
}

