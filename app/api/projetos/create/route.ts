import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  clientId?: string;
  titulo?: string;
  canalPrincipal?: string;
  servicos?: string[];
  status?: string;
  valorMensal?: number;
  ownerId?: string;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
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
        { error: "Sem permissao para criar projeto neste cliente." },
        { status: 403 }
      );
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

    const servicos = Array.isArray(body.servicos)
      ? body.servicos.map((item) => clean(item, 120)).filter(Boolean).slice(0, 20)
      : [];

    const valorMensal =
      typeof body.valorMensal === "number" && !Number.isNaN(body.valorMensal)
        ? body.valorMensal
        : null;

    const ref = await adminDb.collection("projetos").add({
      titulo,
      clientId,
      clientName: clientData.name || "Cliente",
      canalPrincipal: clean(body.canalPrincipal, 140) || "Nao informado",
      servicos,
      status: clean(body.status, 60) || "Onboarding",
      valorMensal,
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
    console.error("Erro ao criar projeto:", error);
    return NextResponse.json({ error: "Falha ao criar projeto." }, { status: 500 });
  }
}

