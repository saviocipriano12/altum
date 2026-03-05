import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  projectId?: string;
  months?: number;
  dueDay?: number;
};

function clean(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function ymd(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function POST(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });
    const body = (await req.json()) as Body;

    const projectId = clean(body.projectId);
    if (!projectId) {
      return NextResponse.json({ error: "Campo obrigatorio: projectId." }, { status: 400 });
    }

    const projectRef = adminDb.collection("projetos").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) {
      return NextResponse.json({ error: "Projeto nao encontrado." }, { status: 404 });
    }

    const project = projectSnap.data() as {
      clientId?: string;
      clientName?: string;
      titulo?: string;
      valorMensal?: number;
      ownerId?: string;
    };

    const valorMensal = Number(project.valorMensal || 0);
    if (!valorMensal || Number.isNaN(valorMensal) || valorMensal <= 0) {
      return NextResponse.json(
        { error: "Projeto sem valor mensal valido para recorrencia." },
        { status: 400 }
      );
    }

    const months = Math.max(1, Math.min(24, Number(body.months) || 12));
    const dueDay = Math.max(1, Math.min(28, Number(body.dueDay) || 10));
    const now = new Date();
    const batch = adminDb.batch();

    for (let i = 1; i <= months; i++) {
      const due = new Date(now.getFullYear(), now.getMonth() + i, dueDay);
      const ref = adminDb.collection("financeiro").doc();
      batch.set(ref, {
        clientId: project.clientId || null,
        clientName: project.clientName || "Cliente",
        projectId,
        projectTitle: project.titulo || "Projeto",
        tipo: "Receita",
        categoria: "Mensalidade",
        status: "pendente",
        descricao: `Mensalidade ${i}/${months} - ${project.titulo || "Projeto"}`,
        valor: valorMensal,
        referencia: `Mensalidade ${i}/${months}`,
        vencimento: ymd(due),
        ownerId: project.ownerId || null,
        vendedorId: project.ownerId || null,
        payoutStatus: "pendente",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
    return NextResponse.json({ ok: true, generated: months });
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

