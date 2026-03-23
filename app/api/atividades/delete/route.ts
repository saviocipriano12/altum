import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  id?: string;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;
    const id = clean(body.id, 120);
    if (!id) {
      return NextResponse.json({ error: "Campo obrigatorio: id." }, { status: 400 });
    }

    const ref = adminDb.collection("atividades").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Atividade nao encontrada." }, { status: 404 });
    }
    const data = snap.data() as { ownerId?: string };
    if (!isAdmin(user) && data.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para remover esta atividade." },
        { status: 403 }
      );
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
    console.error("Erro ao remover atividade:", error);
    return NextResponse.json({ error: "Falha ao remover atividade." }, { status: 500 });
  }
}

