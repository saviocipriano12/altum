import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { normalizeEcommerceAutomationSettings } from "@/lib/server/ecommerce";
import { processTenantEcommerceActions } from "@/lib/server/ecommerce-agent";

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    if (!hasTenantCapability(membership, "manage_channels") && !hasTenantCapability(membership, "respond_inbox")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para processar automacoes ecommerce.");
    }

    const body = (await req.json().catch(() => ({}))) as { limit?: number; dryRun?: boolean };
    const settingsSnap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {};
    const automation = normalizeEcommerceAutomationSettings(settings.ecommerceAutomation);
    if (automation.agent.mode === "off" && body.dryRun !== true) {
      return NextResponse.json({ error: "Agente ecommerce esta desativado." }, { status: 400 });
    }

    const result = await processTenantEcommerceActions({
      tenantId,
      automation,
      limit: body.limit,
      dryRun: body.dryRun === true,
      actor: { id: user.uid, name: user.name },
      source: "manual",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao processar automacoes ecommerce:", error);
    return NextResponse.json({ error: "Falha ao processar automacoes ecommerce." }, { status: 500 });
  }
}
