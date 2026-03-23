import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  leadId?: string;
  type?: string;
  title?: string;
  detail?: string;
  meta?: Record<string, unknown>;
};

function cleanString(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const body = (await req.json()) as Body;

    const leadId = cleanString(body.leadId, 120);
    const type = cleanString(body.type, 80) || "system";
    const title = cleanString(body.title, 180);
    const detail = cleanString(body.detail, 4000);

    if (!leadId || !title) {
      return NextResponse.json(
        { error: "Campos obrigatorios: leadId e title." },
        { status: 400 }
      );
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      return NextResponse.json({ error: "Lead nao encontrado." }, { status: 404 });
    }

    const leadData = leadSnap.data() as { ownerId?: string };
    if (!isAdmin(user) && leadData.ownerId !== user.uid) {
      return NextResponse.json(
        { error: "Sem permissao para registrar evento neste lead." },
        { status: 403 }
      );
    }

    const eventRef = await leadRef.collection("events").add({
      type,
      title,
      detail,
      meta: body.meta || null,
      createdAt: FieldValue.serverTimestamp(),
      actorId: user.uid,
      actorName: user.name,
    });

    return NextResponse.json({ ok: true, id: eventRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao adicionar evento de lead:", error);
    return NextResponse.json({ error: "Falha ao adicionar evento." }, { status: 500 });
  }
}

