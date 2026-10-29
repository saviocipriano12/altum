import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { readCommercialActivities } from "@/lib/server/crm/activity-read";
import { TaskMutationError } from "@/lib/server/crm/activity-mutation";
import { parseActivityFilters, ActivityFilterError } from "@/lib/crm-activity-filter";
import { commercialTaskPagingAvailable, readCommercialTaskPage } from "@/lib/server/crm/activity-page-read";
import { ActivityPageError } from "@/lib/server/crm/activity-page-cursor";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm"); assertTenantRole(membership, "client_viewer");
    const params = new URL(req.url).searchParams, source = params.get("source") || undefined, leadId = params.get("leadId") || undefined;
    if (source && source !== "task" && source !== "appointment") return NextResponse.json({ error: "Tipo de atividade invalido." }, { status: 400 });
    const filters = parseActivityFilters(params);
    const automatic = params.get("paging") === "auto";
    if (automatic && (source !== "task" || leadId || params.has("pageSize") || params.has("cursor"))) return NextResponse.json({ error: "Consulta automática de retornos inválida." }, { status: 400 });
    if (params.has("pageSize") || params.has("cursor") || automatic && await commercialTaskPagingAvailable(tenantId)) {
      const size = automatic ? "20" : params.get("pageSize");
      if (source !== "task" || !size || !/^[1-9]\d?$/.test(size) || params.has("cursor") && !params.get("cursor")) return NextResponse.json({ error: "Consulta paginada de retornos inválida." }, { status: 400 });
      const page = await readCommercialTaskPage({
        tenantId, userId: user.uid, membership, filters, leadId, pageSize: Number(size), cursor: params.get("cursor") || undefined,
      });
      // Read-work diagnostics are server-side evidence, not counts of another seller's portfolio.
      return NextResponse.json({ ok: true, canEdit: hasTenantCapability(membership, "edit_leads"), ...page, pageWork: undefined });
    }
    return NextResponse.json({ ok: true, canEdit: hasTenantCapability(membership, "edit_leads"), ...(await readCommercialActivities({ tenantId, userId: user.uid, membership, leadId, filters, source: source === "task" || source === "appointment" ? source : undefined })) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof TaskMutationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof ActivityFilterError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof ActivityPageError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error("Erro ao listar atividades comerciais:", error);
    return NextResponse.json({ error: "Falha ao carregar atividades comerciais." }, { status: 500 });
  }
}
