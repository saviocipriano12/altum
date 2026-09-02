import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { runTenantCampaignSync } from "@/lib/server/campaigns/tenant-sync";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = {
  days?: number;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    if (!hasTenantCapability(membership, "manage_channels") && !hasTenantCapability(membership, "view_metrics")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para sincronizar campanhas.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const summary = await runTenantCampaignSync({
      tenantId,
      days: body.days,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      synced: summary.synced,
      failed: summary.failed,
      results: summary.results,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao sincronizar campanhas do tenant:", error);
    return NextResponse.json({ error: "Falha ao sincronizar campanhas." }, { status: 500 });
  }
}
