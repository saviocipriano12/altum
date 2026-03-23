import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  descricao?: string;
  data?: string | null;
  status?: "pendente" | "concluida";
  tipo?: string | null;
  leadId?: string | null;
  clienteNome?: string | null;
  ownerId?: string;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;

    const descricao = clean(body.descricao, 500);
    if (!descricao) {
      return NextResponse.json({ error: "Campo obrigatorio: descricao." }, { status: 400 });
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
    }

    const ref = await adminDb.collection("atividades").add({
      descricao,
      data: clean(body.data, 40) || null,
      status: body.status === "concluida" ? "concluida" : "pendente",
      tipo: clean(body.tipo, 120) || null,
      leadId: clean(body.leadId, 120) || null,
      clienteNome: clean(body.clienteNome, 180) || null,
      ownerId,
      owner: ownerName,
      source: "ui",
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
    console.error("Erro ao criar atividade:", error);
    return NextResponse.json({ error: "Falha ao criar atividade." }, { status: 500 });
  }
}

