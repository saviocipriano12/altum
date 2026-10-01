import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { normalizeEcommerceAutomationSettings } from "@/lib/server/ecommerce";
import { getEcommerceAgentPerformance } from "@/lib/server/ecommerce-agent-performance";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantRole(membership, "client_viewer");
    const snap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const automation = normalizeEcommerceAutomationSettings(snap.data()?.ecommerceAutomation);
    return NextResponse.json({ ok: true, tenantId, ...(await getEcommerceAgentPerformance({ tenantId, automation })) });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao medir agente ecommerce:", error);
    return NextResponse.json({ error: "Falha ao medir o agente ecommerce." }, { status: 500 });
  }
}
