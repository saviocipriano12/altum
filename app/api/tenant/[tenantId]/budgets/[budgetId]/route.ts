import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { commitProposalMutation, processProposalMutation } from "@/lib/server/crm/proposal-mutation";

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string; budgetId: string }> }) {
  try {
    const user = await requireRequestUser(req), { tenantId, budgetId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm"); assertTenantCapability(membership, "manage_commercial");
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Alteracao de proposta invalida." }, { status: 400 });
    const result = await commitProposalMutation({ tenantId, budgetId, body, membership, actorId: user.uid, actorName: user.name });
    if (result.mutationId) await processProposalMutation(result.mutationId, tenantId).catch(error => console.error("Proposta gravada; efeitos permanecem registrados para verificacao:", error));
    return NextResponse.json({ ok: true, tenantId, budgetId, ...result, completionMeaning: "internal_records_committed_not_external_delivery" });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao atualizar proposta do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar proposta." }, { status: 500 });
  }
}
