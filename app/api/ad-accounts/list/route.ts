import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError, isAdmin } from "@/app/lib/server/route-auth";
import type { AdAccountDoc } from "@/app/types/domain";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const { searchParams } = new URL(req.url);
    const clientId = clean(searchParams.get("clientId"), 120);

    let query = adminDb.collection("ad_accounts").limit(300);
    if (clientId) {
      query = query.where("clientId", "==", clientId);
    }
    if (!isAdmin(user)) {
      query = query.where("ownerId", "==", user.uid);
    }

    const snap = await query.get();
    const items: AdAccountDoc[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<AdAccountDoc, "id">),
    }));

    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("Erro ao listar contas de anuncio:", error);
    return NextResponse.json({ error: "Falha ao listar contas de anuncio." }, { status: 500 });
  }
}
