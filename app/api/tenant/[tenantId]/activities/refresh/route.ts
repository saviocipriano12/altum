import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { parseActivityFilters, ActivityFilterError } from "@/lib/crm-activity-filter";
import { ActivityPageError } from "@/lib/server/crm/activity-page-cursor";
import { refreshCommercialTaskRecords } from "@/lib/server/crm/activity-record-refresh";

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm"); assertTenantRole(membership, "client_viewer");
    const params = new URL(req.url).searchParams, size = params.get("pageSize") ?? "20";
    if (!/^[1-9]\d?$/.test(size) || params.has("leadId") || params.has("cursor") || params.has("source") && params.get("source") !== "task")
      throw new ActivityPageError(400, "invalid_activity_refresh", "Consulta de atualização inválida.");
    const body: unknown = await req.json().catch(() => { throw new ActivityPageError(400, "invalid_activity_refresh", "Consulta de atualização inválida."); });
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["recordIds", "expectedScope"].includes(key)))
      throw new ActivityPageError(400, "invalid_activity_refresh", "Consulta de atualização inválida.");
    const fields = body as Record<string, unknown>;
    const result = await refreshCommercialTaskRecords({ tenantId, userId: user.uid, membership, filters: parseActivityFilters(params),
      pageSize: Number(size), expectedScope: fields.expectedScope, recordIds: fields.recordIds });
    return NextResponse.json({ ok: true, canEdit: hasTenantCapability(membership, "edit_leads"), ...result, readWork: undefined });
  } catch (error) {
    if (error instanceof RouteAuthError || error instanceof ActivityPageError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof ActivityFilterError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Erro ao conferir retornos:", error);
    return NextResponse.json({ error: "Não foi possível conferir os retornos." }, { status: 500 });
  }
}
