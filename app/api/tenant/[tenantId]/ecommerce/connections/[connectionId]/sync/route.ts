import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { normalizeEcommerceProvider } from "@/lib/server/ecommerce";
import { getCommerceProvider } from "@/lib/server/commerce/registry";
import { syncCommerceConnection } from "@/lib/server/commerce/sync";

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; connectionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, connectionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_channels");

    const ref = adminDb.collection("ecommerce_connections").doc(clean(connectionId));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Integração não encontrada." }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (clean(data.tenantId) !== tenantId) throw new TenantAccessError("tenant_mismatch", "Integração não pertence a esta empresa.");
    const providerId = normalizeEcommerceProvider(data.provider);
    if (!providerId) return NextResponse.json({ error: "Plataforma inválida." }, { status: 400 });
    const provider = getCommerceProvider(providerId);
    if (!provider.credentialFields.length) {
      return NextResponse.json({ error: `${provider.label} ainda opera por webhook; sincronização por API não está disponível.` }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    const limit = Math.max(1, Math.min(25, Number(body.limit || 20)));

    const result = await syncCommerceConnection({
      tenantId,
      connectionId,
      limit,
      actor: { id: user.uid, name: user.name, source: "user" },
    });
    return NextResponse.json({
      ok: true,
      connectionId,
      provider: providerId,
      processed: result.processed,
      summary: { products: result.products, orders: result.orders, carts: result.carts },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao sincronizar ecommerce:", error);
    return NextResponse.json({ error: error instanceof Error ? `Falha na sincronização: ${error.message}` : "Falha na sincronização." }, { status: 502 });
  }
}
