import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  descricao?: string;
  valor?: number;
  tipo?: "Receita" | "Despesa";
  categoria?: string;
  status?: string;
  vendedorId?: string;
  vendedorNome?: string;
  ownerId?: string;
  owner?: string;
  clientId?: string;
  clientName?: string;
  projectId?: string | null;
  projectTitle?: string | null;
  referencia?: string;
  vencimento?: string;
  valorComissao?: number;
  commissionRate?: number;
  meioPagamento?: string | null;
  dataPagamento?: string | null;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const descricao = clean(body.descricao, 240);
    const valor = Number(body.valor || 0);
    const tipo = body.tipo === "Despesa" ? "Despesa" : "Receita";
    const categoria = clean(body.categoria, 120) || (tipo === "Receita" ? "Mensalidade" : "Outros");
    const status = clean(body.status, 50) || "pendente";
    const vendedorId = clean(body.vendedorId, 120) || null;
    const vendedorNome = clean(body.vendedorNome, 180) || null;
    const ownerId = clean(body.ownerId, 120) || null;
    const owner = clean(body.owner, 180) || null;
    const clientId = clean(body.clientId, 120) || null;
    const clientName = clean(body.clientName, 180) || null;
    const projectId = clean(body.projectId, 120) || null;
    const projectTitle = clean(body.projectTitle, 180) || null;
    const referencia = clean(body.referencia, 180) || "";
    const vencimento = clean(body.vencimento, 40) || null;
    const valorComissao = Number(body.valorComissao || 0);
    const commissionRate = Number(body.commissionRate || 0);
    const meioPagamento = clean(body.meioPagamento, 60) || null;
    const dataPagamento = clean(body.dataPagamento, 40) || null;

    if (!descricao || !valor || Number.isNaN(valor)) {
      return NextResponse.json(
        { error: "Campos obrigatorios: descricao e valor." },
        { status: 400 }
      );
    }

    const ref = await adminDb.collection("financeiro").add({
      descricao,
      valor,
      tipo,
      categoria,
      status,
      vendedorId,
      vendedorNome,
      ownerId,
      owner,
      clientId,
      clientName,
      projectId,
      projectTitle,
      referencia,
      vencimento,
      valorComissao,
      commissionRate,
      meioPagamento,
      dataPagamento,
      payoutStatus: tipo === "Receita" ? "pendente" : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar transacao financeira:", error);
    return NextResponse.json({ error: "Falha ao criar transacao." }, { status: 500 });
  }
}
