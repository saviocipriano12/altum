import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  projectId?: string;
  patch?: {
    titulo?: string;
    canalPrincipal?: string;
    servicos?: string[];
    valorMensal?: number | null;
    status?: string;
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

    const projectId = clean(body.projectId, 120);
    if (!projectId) {
      return NextResponse.json({ error: "Campo obrigatorio: projectId." }, { status: 400 });
    }

    const ref = adminDb.collection("projetos").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Projeto nao encontrado." }, { status: 404 });
    }
    const data = snap.data() as { ownerId?: string };

    if (!isAdmin(user) && data.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para atualizar este projeto." },
        { status: 403 }
      );
    }

    const patch = body.patch || {};
    const payload: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (typeof patch.titulo !== "undefined") payload.titulo = clean(patch.titulo, 180) || "Projeto";
    if (typeof patch.canalPrincipal !== "undefined") payload.canalPrincipal = clean(patch.canalPrincipal, 140) || "Nao informado";
    if (typeof patch.status !== "undefined") payload.status = clean(patch.status, 80) || "Onboarding";
    if (Array.isArray(patch.servicos)) {
      payload.servicos = patch.servicos
        .map((item) => clean(item, 120))
        .filter(Boolean)
        .slice(0, 30);
    }
    if (typeof patch.valorMensal !== "undefined") {
      payload.valorMensal =
        typeof patch.valorMensal === "number" && !Number.isNaN(patch.valorMensal)
          ? patch.valorMensal
          : null;
    }

    await ref.set(payload, { merge: true });
    return NextResponse.json({ ok: true, id: projectId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao atualizar projeto:", error);
    return NextResponse.json({ error: "Falha ao atualizar projeto." }, { status: 500 });
  }
}

