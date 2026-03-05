import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["admin"] });

    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);
    if (!clientId) {
      return NextResponse.json({ error: "Parametro obrigatorio: clientId." }, { status: 400 });
    }

    const snap = await adminDb
      .collection("client_portal_users")
      .where("clientId", "==", clientId)
      .limit(50)
      .get();

    const items = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar usuarios do portal:", error);
    return NextResponse.json({ error: "Falha ao listar usuarios do portal." }, { status: 500 });
  }
}
