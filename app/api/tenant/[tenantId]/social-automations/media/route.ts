import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { listInstagramAutomationMedia } from "@/lib/server/social/service";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "social_automation");
    assertTenantRole(membership, "client_viewer");
    return NextResponse.json({ ok: true, media: await listInstagramAutomationMedia(tenantId) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao listar publicacoes do Instagram:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao listar publicacoes." }, { status: 502 });
  }
}
