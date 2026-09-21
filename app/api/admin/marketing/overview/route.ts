import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { buildAdminMarketingOverview, type AdminMarketingInput } from "@/lib/admin-marketing-overview";

const sources = {
  tenants: "tenants", clients: "clientes", accounts: "ad_accounts", channels: "tenant_channels",
  tracking: "growth_tracking_configs", metaReports: "meta_ads_operator_reports", googleReports: "google_ads_operator_reports",
  drafts: "mcp_action_drafts", pixels: "admin_growth_pixels",
} as const;
const limit = 500;

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_admin"] });
    const entries = Object.entries(sources) as Array<[keyof AdminMarketingInput, string]>;
    const results = await Promise.allSettled(entries.map(async ([key, collection]) => {
      const query = key === "channels"
        ? adminDb.collection(collection).where("type", "in", ["meta_ads", "google_ads"])
        : adminDb.collection(collection);
      return query.orderBy("__name__").limit(limit + 1).get();
    }));
    const input: AdminMarketingInput = { tenants: [], clients: [], accounts: [], channels: [], tracking: [], metaReports: [], googleReports: [], drafts: [], pixels: [] };
    const coverage = entries.map(([key, collection], index) => {
      const result = results[index];
      if (result.status === "rejected") {
        console.error(`Falha na fonte administrativa ${collection}:`, result.reason);
        return { source: key, available: false, truncated: false, count: 0 };
      }
      input[key] = result.value.docs.slice(0, limit).map(doc => ({ ...doc.data(), id: doc.id }));
      return { source: key, available: true, truncated: result.value.size > limit, count: input[key].length };
    });
    if (coverage.every(row => !row.available)) return NextResponse.json({ error: "Não foi possível consultar a operação de mídia." }, { status: 503 });
    return NextResponse.json({
      ok: true, ...buildAdminMarketingOverview(input), coverage,
      partial: coverage.some(row => !row.available || row.truncated),
      generatedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Falha no panorama administrativo de mídia:", error);
    return NextResponse.json({ error: "Falha ao carregar a central de mídia." }, { status: 500 });
  }
}
