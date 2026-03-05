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
    const id = String(body.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Campo obrigatorio: id." }, { status: 400 });
    }

    await adminDb.collection("sales_playbook_tips").doc(id).delete();
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao remover dica de script:", error);
    return NextResponse.json({ error: "Falha ao remover dica." }, { status: 500 });
  }
}

