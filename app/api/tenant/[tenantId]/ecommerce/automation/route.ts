import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { normalizeEcommerceAutomationSettings } from "@/lib/server/ecommerce";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantRole(membership, "client_viewer");

    const snap = await adminDb.collection("tenant_settings").doc(tenantId).get();
    const data = snap.exists ? (snap.data() as Record<string, unknown>) : {};
    return NextResponse.json({
      ok: true,
      tenantId,
      ecommerceAutomation: normalizeEcommerceAutomationSettings(data.ecommerceAutomation),
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao carregar automacao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao carregar automacao ecommerce." }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_channels");

    const body = await req.json();
    const ecommerceAutomation = normalizeEcommerceAutomationSettings(body?.ecommerceAutomation || body);
    await adminDb.collection("tenant_settings").doc(tenantId).set(
      {
        tenantId,
        ecommerceAutomation,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, ecommerceAutomation });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao salvar automacao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao salvar automacao ecommerce." }, { status: 500 });
  }
}

