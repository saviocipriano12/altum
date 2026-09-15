import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { CommandError } from "@/lib/server/command-center/security";
import { revokeMcpConnection } from "@/lib/server/mcp/oauth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; connectionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, connectionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    await revokeMcpConnection(tenantId, connectionId, user.uid, user.name);
    return NextResponse.json({ ok: true, tenantId, connectionId }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    if (error instanceof CommandError) {
      return NextResponse.json({ error: error.code, code: error.code }, { status: error.status });
    }
    console.error("Erro ao revogar conexao MCP:", error);
    return NextResponse.json({ error: "Falha ao revogar conexao MCP." }, { status: 500 });
  }
}