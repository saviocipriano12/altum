import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const ALLOWED_COLLECTIONS = new Set(["projetos", "orcamentos", "financeiro"]);

function toSerializable(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (Array.isArray(value)) return value.map(toSerializable);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toSerializable(item)]));
}

export async function GET(req: Request, context: { params: Promise<{ collection: string; id: string }> }) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const { collection, id } = await context.params;
    const cleanCollection = String(collection || "").trim();
    const cleanId = String(id || "").trim();
    if (!ALLOWED_COLLECTIONS.has(cleanCollection) || !cleanId) {
      return NextResponse.json({ error: "Registro administrativo invalido." }, { status: 400 });
    }

    const snap = await adminDb.collection(cleanCollection).doc(cleanId).get();
    if (!snap.exists) return NextResponse.json({ error: "Registro nao encontrado." }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    const responsibleId = cleanCollection === "financeiro" ? data.vendedorId : data.ownerId;
    if (!isAdmin(actor) && responsibleId !== actor.uid) {
      return NextResponse.json({ error: "Sem permissao para acessar este registro." }, { status: 403 });
    }

    return NextResponse.json({ ok: true, item: { id: snap.id, ...(toSerializable(data) as Record<string, unknown>) } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erro ao carregar registro administrativo:", error);
    return NextResponse.json({ error: "Falha ao carregar registro." }, { status: 500 });
  }
}
