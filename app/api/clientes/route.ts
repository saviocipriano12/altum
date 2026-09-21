import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { mergeAdminCompanies } from "@/lib/admin-companies";

export async function GET(req: Request) {
  try {
    const user = await requireRequestUser(req, { roles: ["agency_agent"] });
    const snapshot = await (isAdmin(user)
      ? adminDb.collection("clientes").orderBy("createdAt", "desc").limit(500)
      : adminDb.collection("clientes").where("ownerId", "==", user.uid).limit(500)
    ).get();
    const tenantSnapshot = isAdmin(user) ? await adminDb.collection("tenants").limit(501).get() : null;
    const items = mergeAdminCompanies(
      snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      tenantSnapshot?.docs.slice(0, 500).map(doc => ({ ...doc.data(), id: doc.id })) || [],
    );
    // `items` é mantido por compatibilidade; `clientes` deixa a intenção explícita nas telas novas.
    return NextResponse.json({ ok: true, items, clientes: items, partial: snapshot.size >= 500 || Boolean(tenantSnapshot && tenantSnapshot.size > 500) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Erro ao listar clientes:", error);
    return NextResponse.json({ error: "Falha ao carregar empresas." }, { status: 500 });
  }
}
