import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

type Body = {
  situation?: string;
  script?: string;
  result?: string;
};

function clean(value: unknown, max = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["admin", "closer", "sdr"] });
    const body = (await req.json()) as Body;

    const situation = clean(body.situation, 160);
    const script = clean(body.script, 4000);
    const result = clean(body.result, 800);

    if (!situation || !script) {
      return NextResponse.json(
        { error: "Campos obrigatorios: situation e script." },
        { status: 400 }
      );
    }

    const tipRef = await adminDb.collection("sales_playbook_tips").add({
      situation,
      script,
      result,
      authorId: user.uid,
      authorName: user.name,
      authorRole: user.role,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: tipRef.id });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao criar dica de script:", error);
    return NextResponse.json({ error: "Falha ao criar dica." }, { status: 500 });
  }
}

