import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildAdminPortfolio, type PortfolioInput } from "@/lib/admin-portfolio";
const sources = { clients: "clientes", tenants: "tenants", contracts: "client_contracts", channels: "tenant_channels", projects: "projetos", finance: "financeiro", alerts: "ai_internal_notifications", usage: "ai_usage_monthly" } as const;
export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });
    const entries = Object.entries(sources) as Array<[keyof PortfolioInput, string]>;
    const results = await Promise.allSettled(entries.map(([, collection]) => adminDb.collection(collection).orderBy("__name__").limit(501).get()));
    const input: PortfolioInput = { clients: [], tenants: [], contracts: [], channels: [], projects: [], finance: [], alerts: [], usage: [] }; const available = new Set<string>();
    const coverage = entries.map(([key], index) => { const result = results[index]; if (result.status === "rejected") { console.error(`Fonte de carteira indisponível ${key}:`, result.reason); return { source: key, available: false, truncated: false }; } available.add(key); input[key] = result.value.docs.slice(0, 500).map(doc => ({ ...doc.data(), id: doc.id })); return { source: key, available: true, truncated: result.value.size > 500 }; });
    if (!available.has("clients") && !available.has("tenants")) return Response.json({ error: "A carteira de empresas está indisponível." }, { status: 503 });
    return Response.json({ items: buildAdminPortfolio(input, new Date(), available), coverage, partial: coverage.some(row => !row.available || row.truncated), generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status }); console.error("Falha na carteira:", error); return Response.json({ error: "Falha ao carregar a operação da carteira." }, { status: 500 }); }
}
