import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  id?: string;
  status?: "pago" | "pendente" | "atrasado" | "cancelado";
  payoutStatus?: "pendente" | "liquidado";
  dataPagamentoNow?: boolean;
  clearDataPagamento?: boolean;
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

    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (body.status) payload.status = body.status;
    if (body.payoutStatus) payload.payoutStatus = body.payoutStatus;
    if (body.dataPagamentoNow) payload.dataPagamento = FieldValue.serverTimestamp();
    if (body.clearDataPagamento) payload.dataPagamento = null;

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao atualizar transacao financeira:", error);
    return NextResponse.json({ error: "Falha ao atualizar transacao." }, { status: 500 });
  }
}
