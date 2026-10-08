import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";

function date(value: unknown) {
  return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate().toISOString()
    : null;
}

export async function GET(request: Request) {
  try {
    await requireRequestUser(request, { roles: ["agency_admin"] });
    const [assets, projects, tenants] = await Promise.all([
      adminDb.collection("creative_assets").orderBy("createdAt", "desc").limit(160).get(),
      adminDb.collection("creative_projects").limit(200).get(),
      adminDb.collection("tenants").orderBy("__name__").limit(200).get(),
    ]);

    const projectNames = new Map(projects.docs.map((project) => [project.id, String(project.get("title") || "Projeto criativo")]));
    return Response.json({
      items: assets.docs.map((asset) => {
        const row = asset.data();
        return {
          id: asset.id,
          tenantId: String(row.tenantId || ""),
          projectId: typeof row.projectId === "string" ? row.projectId : null,
          projectTitle: projectNames.get(String(row.projectId || "")) || "Projeto criativo",
          type: row.type === "video" ? "video" : "image",
          reviewStatus: String(row.reviewStatus || "pending"),
          qualityPreflight: row.qualityPreflight && typeof row.qualityPreflight === "object" ? row.qualityPreflight : null,
          deliveryUrl: `/api/admin/agent-os/creative-assets/${asset.id}/download`,
          createdAt: date(row.createdAt),
        };
      }),
      tenants: tenants.docs.map((tenant) => ({ id: tenant.id, name: String(tenant.get("name") || tenant.id) })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Falha ao carregar resultados do Agent OS:", error);
    return Response.json({ error: "Não foi possível carregar a central de resultados." }, { status: 500 });
  }
}
