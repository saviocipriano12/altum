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
  budgetId?: string;
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
    const actor = await requireRequestUser(req, { roles: ["agency_admin"] });
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

    if (!descricao || !Number.isFinite(valor) || valor <= 0 || !Number.isFinite(valorComissao) || !Number.isFinite(commissionRate)) {
      return NextResponse.json(
        { error: "Campos obrigatorios: descricao e valor." },
        { status: 400 }
      );
    }

    const budgetId = clean(body.budgetId, 180);
    if (budgetId && !/^[A-Za-z0-9_-]+$/.test(budgetId)) throw new RouteAuthError(400, "invalid_budget", "Proposta inválida.");
    const ref = budgetId ? adminDb.collection("financeiro").doc(`budget_${budgetId}`) : adminDb.collection("financeiro").doc();
    const result = await adminDb.runTransaction(async transaction => {
      if (budgetId) {
        const [budget, existing] = await Promise.all([
          transaction.get(adminDb.collection("orcamentos").doc(budgetId)), transaction.get(ref),
        ]);
        if (!budget.exists || budget.data()?.clientId !== clientId) throw new RouteAuthError(400, "budget_company_mismatch", "Proposta não pertence à empresa informada.");
        if (existing.exists) return { id: ref.id, reused: true };
        if (budget.data()?.status !== "Aprovado") throw new RouteAuthError(409, "budget_not_approved", "Aprove a proposta antes de gerar o lançamento financeiro.");
        if (Number(budget.data()?.valorTotal) !== valor) throw new RouteAuthError(409, "budget_value_changed", "O valor da proposta mudou. Atualize antes de gerar o lançamento.");
      }
      transaction.set(ref, {
      budgetId: budgetId || null,
      createdBy: actor.uid,
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
      return { id: ref.id, reused: false };
    });
    return NextResponse.json({ ok: true, ...result });
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
