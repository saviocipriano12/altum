import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
  projectId?: string | null;
  titulo?: string;
  tipo?: string;
  status?: string;
  valorTotal?: number | null;
  validade?: string | null;
  resumo?: string | null;
  ownerId?: string;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as Body;

    const clientId = clean(body.clientId, 120);
    const titulo = clean(body.titulo, 180);
    if (!clientId || !titulo) {
      return NextResponse.json(
        { error: "Campos obrigatorios: clientId e titulo." },
        { status: 400 }
      );
    }

    const clientSnap = await adminDb.collection("clientes").doc(clientId).get();
    if (!clientSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }
    const clientData = clientSnap.data() as { name?: string; ownerId?: string };
    if (!isAdmin(user) && clientData.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para criar orcamento neste cliente." },
        { status: 403 }
      );
    }

    const projectId = clean(body.projectId, 120) || null;
    let projectTitle: string | null = null;
    if (projectId) {
      const projectSnap = await adminDb.collection("projetos").doc(projectId).get();
      if (!projectSnap.exists) {
        return NextResponse.json({ error: "Projeto informado nao existe." }, { status: 400 });
      }
      const projectData = projectSnap.data() as { titulo?: string; clientId?: string };
      if (projectData.clientId && projectData.clientId !== clientId) {
        return NextResponse.json(
          { error: "Projeto nao pertence ao cliente informado." },
          { status: 400 }
        );
      }
      projectTitle = projectData.titulo || "Projeto";
    }

    let ownerId = user.uid;
    let ownerName = user.name;
    if (isAdmin(user) && body.ownerId) {
      const targetId = clean(body.ownerId, 120);
      if (targetId) {
        const ownerSnap = await adminDb.collection("users").doc(targetId).get();
        if (ownerSnap.exists) {
          const ownerData = ownerSnap.data() as { name?: string };
          ownerId = targetId;
          ownerName = ownerData.name || user.name;
        }
      }
    } else if (clientData.ownerId) {
      ownerId = clientData.ownerId;
    }

    const valorTotal =
      typeof body.valorTotal === "number" && !Number.isNaN(body.valorTotal)
        ? body.valorTotal
        : null;

    const ref = await adminDb.collection("orcamentos").add({
      titulo,
      clientId,
      clientName: clientData.name || "Cliente",
      projectId,
      projectTitle,
      tipo: clean(body.tipo, 60) || "Projeto unico",
      status: clean(body.status, 60) || "Rascunho",
      valorTotal,
      validade: clean(body.validade, 30) || null,
      resumo: clean(body.resumo, 5000) || null,
      ownerId,
      owner: ownerName,
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
    console.error("Erro ao criar orcamento:", error);
    return NextResponse.json({ error: "Falha ao criar orcamento." }, { status: 500 });
  }
}

