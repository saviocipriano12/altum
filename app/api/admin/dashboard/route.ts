import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

const COLLECTIONS = ["leads", "projetos", "orcamentos", "atividades", "financeiro"] as const;

function serializable(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serializable);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializable(item)]));
}

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const requested = new Set(
      new URL(req.url)
        .searchParams.get("include")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    );
    const selectedCollections = requested.size
      ? COLLECTIONS.filter((collectionName) => requested.has(collectionName))
      : COLLECTIONS;
    if (!selectedCollections.length) {
      return NextResponse.json({ error: "Coleção administrativa inválida." }, { status: 400 });
    }
    const isAgencyAdmin = ["admin", "agency_owner", "agency_admin"].includes(user.role);
    const results = await Promise.all(
      selectedCollections.map(async (collectionName) => {
        const collection = adminDb.collection(collectionName);
        const ownerField = collectionName === "financeiro" ? "vendedorId" : "ownerId";
        const snapshot = await (isAgencyAdmin
          ? collection.limit(500)
          : collection.where(ownerField, "==", user.uid).limit(500)
        ).get();
        return [
          collectionName,
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...(serializable(doc.data()) as Record<string, unknown>),
          })),
        ] as const;
      })
    );
    return NextResponse.json({ ok: true, ...Object.fromEntries(results) });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao carregar cockpit administrativo:", error);
    return NextResponse.json({ error: "Falha ao carregar dados administrativos." }, { status: 500 });
  }
}
