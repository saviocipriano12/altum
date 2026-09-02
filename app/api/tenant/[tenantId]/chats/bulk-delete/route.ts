import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { deleteTenantChat, recordDeletionAudit } from "@/lib/server/tenant-data-deletion";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantCapability(membership, "respond_inbox");
    const body = (await req.json()) as { ids?: unknown };
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.map((id) => String(id || "").trim()).filter(Boolean))).slice(0, 100)
      : [];
    if (!ids.length) return NextResponse.json({ error: "Selecione ao menos uma conversa." }, { status: 400 });
    let deleted = 0;
    for (const chatId of ids) {
      const result = await deleteTenantChat({ tenantId, chatId });
      if (result.deleted) deleted += 1;
    }
    await recordDeletionAudit({ tenantId, actorId: user.uid, actorName: user.name, entity: "chat", ids });
    return NextResponse.json({ ok: true, deleted });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao apagar conversas em lote:", error);
    return NextResponse.json({ error: "Falha ao apagar conversas." }, { status: 500 });
  }
}
