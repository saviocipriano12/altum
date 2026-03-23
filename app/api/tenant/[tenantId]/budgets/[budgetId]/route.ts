import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { runLeadAutomations } from "@/lib/server/automations";

type Body = {
  status?: string;
  titulo?: string;
  resumo?: string | null;
  validade?: string | null;
  valorTotal?: number | string | null;
};

const BUDGET_STATUSES = new Set(["Rascunho", "Enviado", "Aprovado", "Perdido"]);

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanMoney(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

async function findFinanceByBudget(tenantId: string, budgetId: string) {
  const snap = await adminDb
    .collection("financeiro")
    .where("tenantId", "==", tenantId)
    .where("orcamentoId", "==", budgetId)
    .limit(1)
    .get();

  return snap.empty ? null : snap.docs[0];
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; budgetId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, budgetId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_commercial");

    const ref = adminDb.collection("orcamentos").doc(budgetId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Proposta nao encontrada." }, { status: 404 });
    }

    const budget = snap.data() as Record<string, unknown>;
    if (String(budget.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Proposta fora do tenant informado." }, { status: 403 });
    }

    const body = (await req.json()) as Body;
    const patch: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
    };
    const changes: string[] = [];

    const titulo = clean(body.titulo, 180);
    if (body.titulo !== undefined && titulo !== clean(budget.titulo, 180)) {
      patch.titulo = titulo;
      changes.push(`titulo: ${titulo}`);
    }

    const resumo = clean(body.resumo, 4000);
    if (body.resumo !== undefined && resumo !== clean(budget.resumo, 4000)) {
      patch.resumo = resumo || null;
      changes.push("resumo atualizado");
    }

    const validade = clean(body.validade, 40);
    if (body.validade !== undefined && validade !== clean(budget.validade, 40)) {
      patch.validade = validade || null;
      changes.push("validade atualizada");
    }

    const valorTotal = cleanMoney(body.valorTotal);
    if (body.valorTotal !== undefined && valorTotal !== cleanMoney(budget.valorTotal)) {
      patch.valorTotal = valorTotal;
      changes.push("valor atualizado");
    }

    const nextStatus = clean(body.status, 40);
    if (body.status !== undefined) {
      if (!BUDGET_STATUSES.has(nextStatus)) {
        return NextResponse.json({ error: "Status de proposta invalido." }, { status: 400 });
      }
      if (nextStatus !== clean(budget.status, 40)) {
        patch.status = nextStatus;
        changes.push(`status: ${nextStatus}`);
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, tenantId, budgetId, unchanged: true });
    }

    const leadId = clean(budget.leadId, 140);
    const writes: Promise<unknown>[] = [ref.set(patch, { merge: true })];

    if (leadId) {
      const leadRef = adminDb.collection("leads").doc(leadId);
      const nextStage =
        patch.status === "Aprovado"
          ? "ganho"
          : patch.status === "Perdido"
            ? "perdido"
            : patch.status === "Enviado"
              ? "proposta"
              : null;

      writes.push(
        leadRef.collection("events").add({
          type: "budget_updated",
          title: "Proposta atualizada",
          detail: changes.join(" | "),
          budgetId,
          actorId: user.uid,
          actorName: user.name,
          createdAt: FieldValue.serverTimestamp(),
        })
      );

      if (nextStage) {
        writes.push(
          leadRef.set(
            {
              pipelineStage: nextStage,
              stage: nextStage,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        );
      }
    }

    if (patch.status === "Aprovado") {
      const financeSnap = await findFinanceByBudget(tenantId, budgetId);
      if (!financeSnap) {
        writes.push(
          adminDb.collection("financeiro").add({
            tenantId,
            tipo: "Receita",
            categoria: "Orcamento aprovado",
            status: "pendente",
            descricao: clean(patch.titulo || budget.titulo, 180) || "Receita comercial",
            valor: cleanMoney(patch.valorTotal ?? budget.valorTotal) || 0,
            clientId: tenantId,
            clientName: clean(budget.clientName, 180),
            leadId: clean(budget.leadId, 140) || null,
            leadName: clean(budget.leadName, 180) || null,
            ownerId: clean(budget.ownerId, 140) || user.uid,
            owner: clean(budget.owner, 180) || user.name,
            orcamentoId: budgetId,
            orcamentoTitulo: clean(patch.titulo || budget.titulo, 180),
            referencia: `budget:${budgetId}`,
            vencimento: clean(patch.validade || budget.validade, 40) || null,
            createdBy: user.uid,
            createdByName: user.name,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          })
        );
      }
    }

    await Promise.all(writes);

    if (leadId && patch.status === "Aprovado") {
      await runLeadAutomations({
        tenantId,
        trigger: "budget_approved",
        leadId,
        actorId: user.uid,
        actorName: user.name,
      });
    }

    return NextResponse.json({ ok: true, tenantId, budgetId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar proposta do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar proposta." }, { status: 500 });
  }
}

