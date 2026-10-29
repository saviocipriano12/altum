import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { deleteTenantLead, recordDeletionAudit, TenantDeletionConflict } from "@/lib/server/tenant-data-deletion";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { adminDb } from "@/app/lib/server/firebase-admin";

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "crm");
    assertTenantCapability(membership, "edit_leads");
    const body = (await req.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 100)
      : [];
    if (!ids.length) return NextResponse.json({ error: "Selecione ao menos um lead." }, { status: 400 });
    if (ids.some(id => id.includes("/") || id.length > 180)) return NextResponse.json({ error: "Selecao de contatos invalida." }, { status: 400 });
    // Authorize the complete selection before creating any trash or deleting a record.
    const selected = await adminDb.getAll(...ids.map(id => adminDb.collection("leads").doc(id)));
    for (const snapshot of selected) {
      if (!snapshot.exists) continue; // Preserve a harmless retry after a successful deletion.
      const lead = snapshot.data()!;
      if (lead.tenantId !== tenantId) throw new TenantAccessError("lead_tenant_mismatch", "Contato fora desta empresa.");
      assertAssignedCommercialRecordAccess(membership, user.uid, lead);
    }
    let deleted = 0;
    for (const leadId of ids) {
      const result = await deleteTenantLead({ tenantId, leadId, authority: { userId: user.uid, capability: "edit_leads" }, authorize: current => assertAssignedCommercialRecordAccess(membership, user.uid, current) });
      if (result.deleted) deleted += 1;
    }
    await recordDeletionAudit({ tenantId, actorId: user.uid, actorName: user.name, entity: "lead", ids });
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    if (error instanceof TenantDeletionConflict) return NextResponse.json({ error: error.message, code: "deletion_conflict" }, { status: 409 });
    console.error("Erro ao apagar leads em lote:", error);
    return NextResponse.json({ error: "Falha ao apagar leads." }, { status: 500 });
  }
}
