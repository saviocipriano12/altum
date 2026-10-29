import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { readActivityLeadPage } from "@/lib/server/crm/activity-lead-page";
import { ActivityPageError } from "@/lib/server/crm/activity-page-cursor";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm"); assertTenantRole(membership, "client_viewer");
    const params = new URL(req.url).searchParams, size = params.get("pageSize") ?? "20";
    if (!/^[1-9]\d?$/.test(size) || params.has("cursor") && !params.get("cursor"))
      throw new ActivityPageError(400, "invalid_activity_lead_page", "Busca de cliente inválida.");
    return NextResponse.json({ ok: true, ...(await readActivityLeadPage({ tenantId, userId: user.uid, membership,
      pageSize: Number(size), q: params.get("q") || "", cursor: params.get("cursor") || undefined })) });
  } catch (error) {
    if (error instanceof RouteAuthError || error instanceof ActivityPageError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao buscar cliente para retorno:", error);
    return NextResponse.json({ error: "Não foi possível buscar os clientes." }, { status: 500 });
  }
}
