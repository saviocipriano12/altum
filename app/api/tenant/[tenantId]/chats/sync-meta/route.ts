import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { recoverRecentMetaInbox } from "@/lib/server/meta-inbox-recovery";

export const runtime = "nodejs";
export const maxDuration = 180;
export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");await assertTenantModule(tenantId, "inbox");
    return Response.json({ ok: true, ...(await recoverRecentMetaInbox(tenantId)) });
  } catch (error) {
    if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof TenantAccessError) return Response.json({ error: error.message }, { status: 403 });
    return Response.json({ error: "Não foi possível recuperar as conversas agora." }, { status: 503 });
  }
}
