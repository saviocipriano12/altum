import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { readIntegrationPendingSelection, toPublicPendingSelection } from "@/app/lib/server/integration-pending";

export async function GET(req: Request, context: { params: Promise<{ pendingId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { pendingId } = await context.params;
    const pending = await readIntegrationPendingSelection(pendingId);
    if (!pending) {
      return NextResponse.json({ error: "Selecao pendente nao encontrada ou expirada." }, { status: 404 });
    }
    if (pending.userId !== user.uid) {
      return NextResponse.json({ error: "Selecao pendente pertence a outro usuario." }, { status: 403 });
    }
    const membership = await assertTenantAccess(user.uid, pending.tenantId);
    assertTenantCapability(membership, "manage_channels");

    return NextResponse.json({
      ok: true,
      item: toPublicPendingSelection(pending),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao buscar selecao pendente de integracao:", error);
    return NextResponse.json({ error: "Falha ao carregar selecao pendente." }, { status: 500 });
  }
}
