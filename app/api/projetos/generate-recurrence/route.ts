import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { recurringPeriods, existingRecurringPeriods } from "@/lib/admin-finance";

type Body = {
  projectId?: string;
  months?: number;
  dueDay?: number;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });
    const body = (await req.json()) as Body;

    const projectId = clean(body.projectId);
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(projectId) || (body.months !== undefined && !Number.isFinite(body.months)) || (body.dueDay !== undefined && !Number.isFinite(body.dueDay))) {
      return NextResponse.json({ error: "Campo obrigatorio: projectId." }, { status: 400 });
    }

    const projectRef = adminDb.collection("projetos").doc(projectId);
    const result = await adminDb.runTransaction(async (batch) => {
    const projectSnap = await batch.get(projectRef);
    if (!projectSnap.exists) {
      throw new RouteAuthError(404, "project_not_found", "Projeto não encontrado.");
    }

    const project = projectSnap.data() as {
      clientId?: string;
      clientName?: string;
      titulo?: string;
      valorMensal?: number;
      ownerId?: string;
    };

    const valorMensal = Number(project.valorMensal || 0);
    if (!Number.isFinite(valorMensal) || valorMensal <= 0) {
      throw new RouteAuthError(400, "invalid_monthly_value", "Projeto sem valor mensal válido para recorrência.");
    }

    const months = Math.max(1, Math.min(24, Number(body.months) || 12));
    const dueDay = Math.max(1, Math.min(28, Number(body.dueDay) || 10));
    const now = new Date();
    const existing = await batch.get(adminDb.collection("financeiro").where("projectId", "==", projectId).limit(1001));
    if (existing.size > 1000) throw new RouteAuthError(409, "financial_history_limit", "Revise o histórico financeiro deste projeto antes de gerar recorrência.");
    const occupied = existingRecurringPeriods(existing.docs.map(doc => doc.data()));
    const periods = recurringPeriods(now, months, dueDay);
    let generated = 0;
    for (const [index, period] of periods.entries()) {
      if (occupied.has(period.competence)) continue;
      const ref = adminDb.collection("financeiro").doc(`${projectId}_monthly_${period.competence}`);
      batch.set(ref, {
        clientId: project.clientId || null,
        clientName: project.clientName || "Cliente",
        projectId,
        projectTitle: project.titulo || "Projeto",
        tipo: "Receita",
        categoria: "Mensalidade",
        status: "pendente",
        descricao: `Mensalidade ${period.competence} - ${project.titulo || "Projeto"}`,
        valor: valorMensal,
        referencia: `Mensalidade ${index + 1}/${periods.length}`,
        competence: period.competence,
        vencimento: period.dueDate,
        ownerId: project.ownerId || null,
        vendedorId: project.ownerId || null,
        payoutStatus: "pendente",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      generated += 1;
    }

    return { generated, skipped: periods.length - generated };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao gerar recorrencia:", error);
    return NextResponse.json({ error: "Falha ao gerar recorrencia." }, { status: 500 });
  }
}

