import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { runTenantIntegrationHealthCheck } from "@/lib/server/integrations/health";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    if (!hasTenantCapability(membership, "manage_channels") && !hasTenantCapability(membership, "view_metrics")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para health check dos conectores.");
    }

    const { searchParams } = new URL(req.url);
    const attemptRepair = searchParams.get("attemptRepair") === "1";
    const summary = await runTenantIntegrationHealthCheck({ tenantId, attemptRepair });
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro no health check de canais:", error);
    return NextResponse.json({ error: "Falha ao executar health check dos canais." }, { status: 500 });
  }
}
