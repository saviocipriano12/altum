import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { connectionConfigFromDoc, getCommerceProvider, readCommerceCredentials } from "@/lib/server/commerce/registry";

// Diagnostic surface for the shared provider; not a separate seller/CRM pipeline.
export async function POST(req: Request, context: { params: Promise<{ tenantId: string; connectionId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, connectionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_channels");
    const snap = await adminDb.collection("ecommerce_connections").doc(connectionId).get();
    if (!snap.exists) return NextResponse.json({ error: "Conexão não encontrada." }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (data.tenantId !== tenantId) throw new TenantAccessError("tenant_mismatch", "Conexão não pertence à empresa.");
    if (data.status !== "active") return NextResponse.json({ error: "Conexão pausada." }, { status: 409 });
    const provider = getCommerceProvider(data.provider);
    if (!provider.lookupCatalog) return NextResponse.json({ error: "Consulta ao vivo indisponível nesta plataforma." }, { status: 400 });
    const body = await req.json() as { query?: unknown; productId?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if ((!query && !productId) || query.length > 300 || productId.length > 180) {
      return NextResponse.json({ error: "Informe um produto ou busca de até 300 caracteres." }, { status: 400 });
    }
    const catalog = await provider.lookupCatalog({
      connection: connectionConfigFromDoc(connectionId, data),
      credentials: readCommerceCredentials(data.apiCredentials), query, productId,
    });
    return NextResponse.json({ ok: true, catalog }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    // No upstream error bodies, credentials or product descriptions in logs/responses.
    return NextResponse.json({ error: "Não foi possível consultar a loja agora. Não confirme disponibilidade." }, { status: 502 });
  }
}
