import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  id?: string;
  patch?: {
    descricao?: string;
    data?: string | null;
    status?: "pendente" | "concluida";
    tipo?: string | null;
    leadId?: string | null;
    clienteNome?: string | null;
  };
};

function clean(value: unknown, max = 300) {
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
        { error: "Sem permissao para atualizar esta atividade." },
        { status: 403 }
      );
    }

    const patch = body.patch || {};
    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof patch.descricao !== "undefined") payload.descricao = clean(patch.descricao, 500) || "";
    if (typeof patch.data !== "undefined") payload.data = clean(patch.data, 40) || null;
    if (typeof patch.status !== "undefined") payload.status = patch.status === "concluida" ? "concluida" : "pendente";
    if (typeof patch.tipo !== "undefined") payload.tipo = clean(patch.tipo, 120) || null;
    if (typeof patch.leadId !== "undefined") payload.leadId = clean(patch.leadId, 120) || null;
    if (typeof patch.clienteNome !== "undefined") payload.clienteNome = clean(patch.clienteNome, 180) || null;

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao atualizar atividade:", error);
    return NextResponse.json({ error: "Falha ao atualizar atividade." }, { status: 500 });
  }
}

