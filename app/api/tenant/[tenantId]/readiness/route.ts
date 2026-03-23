import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantReadinessSnapshot } from "@/lib/server/tenant-readiness";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snapshot = await getTenantReadinessSnapshot(tenantId);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar prontidao do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar prontidao do tenant." }, { status: 500 });
  }
}
