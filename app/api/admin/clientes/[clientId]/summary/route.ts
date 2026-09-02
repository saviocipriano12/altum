import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function serializable(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") return value;
  if ("toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (Array.isArray(value)) return value.map(serializable);
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, serializable(item)]));
}

function rows(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.map((doc) => ({ id: doc.id, ...(serializable(doc.data()) as Record<string, unknown>) }));
}

export async function GET(req: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const { clientId } = await context.params;
    const cleanClientId = String(clientId || "").trim();
    if (!cleanClientId) return NextResponse.json({ error: "Cliente invalido." }, { status: 400 });

    const [clientSnap, directTenantSnap] = await Promise.all([
      adminDb.collection("clientes").doc(cleanClientId).get(),
      adminDb.collection("tenants").doc(cleanClientId).get(),
    ]);
    if (!clientSnap.exists && !directTenantSnap.exists) {
      return NextResponse.json({ error: "Cliente nao encontrado." }, { status: 404 });
    }
    const directTenantData = directTenantSnap.exists
      ? (directTenantSnap.data() as Record<string, unknown>)
      : null;
    const client = clientSnap.exists
      ? (clientSnap.data() as Record<string, unknown>)
      : {
          name: directTenantData?.name || "Empresa",
          niche: directTenantData?.niche || "Nao informado",
          contactName: directTenantData?.responsibleName || "Nao informado",
          email: directTenantData?.responsibleEmail || "",
          status: directTenantData?.status === "blocked" ? "Bloqueado" : "Ativo",
          tenantId: directTenantSnap.id,
          signupSource: directTenantData?.signupSource || "self_service",
        };
    if (!clientSnap.exists && !isAdmin(actor)) {
      return NextResponse.json({ error: "Sem permissao para acessar este cliente." }, { status: 403 });
    }
    if (!isAdmin(actor) && client.ownerId !== actor.uid) {
      return NextResponse.json({ error: "Sem permissao para acessar este cliente." }, { status: 403 });
    }
    const clientName = typeof client.name === "string" ? client.name : "";

    const [projectsSnap, budgetsSnap, financeByIdSnap, activitiesSnap, legacyTenantSnap] = await Promise.all([
      adminDb.collection("projetos").where("clientId", "==", cleanClientId).limit(100).get(),
      adminDb.collection("orcamentos").where("clientId", "==", cleanClientId).limit(100).get(),
      adminDb.collection("financeiro").where("clientId", "==", cleanClientId).limit(40).get(),
      clientName ? adminDb.collection("atividades").where("clienteNome", "==", clientName).limit(40).get() : Promise.resolve(null),
      directTenantSnap.exists
        ? Promise.resolve(null)
        : adminDb.collection("tenants").where("legacyClientId", "==", cleanClientId).limit(1).get(),
    ]);

    let finance = rows(financeByIdSnap);
    if (!finance.length && clientName) {
      finance = rows(await adminDb.collection("financeiro").where("clientName", "==", clientName).limit(40).get());
    }

    const tenantDoc = directTenantSnap.exists ? directTenantSnap : legacyTenantSnap?.docs[0] || null;
    const tenantSettings = tenantDoc ? await adminDb.collection("tenant_settings").doc(tenantDoc.id).get() : null;
    const tenant = tenantDoc
      ? {
          id: tenantDoc.id,
          ...(serializable(tenantDoc.data()) as Record<string, unknown>),
          settings: tenantSettings?.exists ? serializable(tenantSettings.data()) : null,
        }
      : null;

    return NextResponse.json({
      ok: true,
      client: { id: cleanClientId, ...(serializable(client) as Record<string, unknown>) },
      projects: rows(projectsSnap),
      budgets: rows(budgetsSnap),
      finance,
      activities: activitiesSnap ? rows(activitiesSnap) : [],
      tenant,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erro ao carregar resumo do cliente:", error);
    return NextResponse.json({ error: "Falha ao carregar resumo do cliente." }, { status: 500 });
  }
}
