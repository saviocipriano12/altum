import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

export async function GET(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_agent"] });
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const detailed = url.searchParams.get("detailed") === "true";
    if ((includeInactive || detailed) && !isAdmin(actor)) {
      return NextResponse.json({ error: "Sem permissao para consultar a equipe completa." }, { status: 403 });
    }
    const snapshot = await (includeInactive
      ? adminDb.collection("users").limit(500)
      : adminDb.collection("users").where("status", "==", "active").limit(500)
    ).get();
    const items = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const item = {
        id: doc.id,
        name: typeof data.name === "string" ? data.name : "Sem nome",
        email: typeof data.email === "string" ? data.email : "",
        role: typeof data.role === "string" ? data.role : "agency_agent",
        status: typeof data.status === "string" ? data.status : "active",
      };
      if (!detailed) return item;
      return {
        ...item,
        commissionRate: Number(data.commissionRate || 0),
        asaasWalletId: typeof data.asaasWalletId === "string" ? data.asaasWalletId : null,
        createdAt: serializable(data.createdAt),
      };
    });
    items.sort((left, right) => {
      const rightCreatedAt = "createdAt" in right ? right.createdAt : null;
      const leftCreatedAt = "createdAt" in left ? left.createdAt : null;
      return String(rightCreatedAt || "").localeCompare(String(leftCreatedAt || ""));
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao listar usuários administrativos:", error);
    return NextResponse.json({ error: "Falha ao carregar equipe." }, { status: 500 });
  }
}

function serializable(value: unknown): string | number | null {
  if (!value) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}
