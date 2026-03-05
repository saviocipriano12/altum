import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  budgetId?: string;
  patch?: {
    titulo?: string;
    tipo?: string;
    status?: string;
    valorTotal?: number | null;
    validade?: string | null;
    resumo?: string | null;
  };
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;
    const budgetId = clean(body.budgetId, 120);
    if (!budgetId) {
      return NextResponse.json({ error: "Campo obrigatorio: budgetId." }, { status: 400 });
    }

    const ref = adminDb.collection("orcamentos").doc(budgetId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Orcamento nao encontrado." }, { status: 404 });
    }

    const data = snap.data() as { ownerId?: string };
    if (!isAdmin(user) && data.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para atualizar este orcamento." },
        { status: 403 }
      );
    }

    const patch = body.patch || {};
    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof patch.titulo !== "undefined") payload.titulo = clean(patch.titulo, 180) || "Orcamento";
    if (typeof patch.tipo !== "undefined") payload.tipo = clean(patch.tipo, 60) || "Projeto unico";
    if (typeof patch.status !== "undefined") payload.status = clean(patch.status, 60) || "Rascunho";
    if (typeof patch.validade !== "undefined") payload.validade = clean(patch.validade, 40) || null;
    if (typeof patch.resumo !== "undefined") payload.resumo = clean(patch.resumo, 5000) || null;
    if (typeof patch.valorTotal !== "undefined") {
      payload.valorTotal =
        typeof patch.valorTotal === "number" && !Number.isNaN(patch.valorTotal)
          ? patch.valorTotal
          : null;
    }

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id: budgetId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao atualizar orcamento:", error);
    return NextResponse.json({ error: "Falha ao atualizar orcamento." }, { status: 500 });
  }
}

