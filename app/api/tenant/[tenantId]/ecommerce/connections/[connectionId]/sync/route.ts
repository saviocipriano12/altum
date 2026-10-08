import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { normalizeEcommerceProvider } from "@/lib/server/ecommerce";
import { getCommerceProvider, readCommerceCredentials } from "@/lib/server/commerce/registry";
import { syncCommerceConnection } from "@/lib/server/commerce/sync";
import { ensureShopifyWebhookSubscriptions } from "@/lib/server/commerce/shopify-webhooks";
import { getAppBaseUrl } from "@/app/lib/server/integration-oauth";

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

    // Existing Shopify connections predate new webhook topics from time to
    // time. Provisioning here keeps "Sincronizar agora" a safe upgrade path
    // without requiring the merchant to reconnect or rotate credentials.
    let webhookProvisioning: Awaited<ReturnType<typeof ensureShopifyWebhookSubscriptions>> | null = null;
    if (providerId === "shopify") {
      try {
        const credentials = readCommerceCredentials(data.apiCredentials);
        webhookProvisioning = await ensureShopifyWebhookSubscriptions({
          tenantId,
          connectionId,
          shopDomain: clean(data.storeId || data.storeUrl, 220),
          accessToken: credentials.accessToken || "",
          appBaseUrl: getAppBaseUrl(req),
        });
      } catch (error) {
        // The API sync remains useful even if Shopify transiently rejects a
        // subscription. The connection retains the detailed provisioning state.
        console.warn("Falha ao atualizar webhooks Shopify durante sincronizacao:", error);
      }
    }

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
      summary: { products: result.products, orders: result.orders, carts: result.carts, warnings: result.warnings || [] },
      webhookProvisioning,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao sincronizar ecommerce:", error);
    return NextResponse.json({ error: error instanceof Error ? `Falha na sincronização: ${error.message}` : "Falha na sincronização." }, { status: 502 });
  }
}
