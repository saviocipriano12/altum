import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { createCommerceOAuthState, getCommerceOAuthEnv, normalizeShopifyDomain } from "@/lib/server/commerce/oauth";
import { getAppBaseUrl } from "@/app/lib/server/integration-oauth";

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);
    const body = (await req.json()) as { tenantId?: unknown; shopDomain?: unknown; redirectPath?: unknown };
    const tenantId = typeof body.tenantId === "string" ? body.tenantId.trim() : "";
    const shopDomain = normalizeShopifyDomain(body.shopDomain);
    if (!tenantId || !shopDomain) {
      return NextResponse.json({ error: "Informe o dominio sua-loja.myshopify.com." }, { status: 400 });
    }
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_channels");

    const env = getCommerceOAuthEnv().shopify;
    if (!env.clientId || !env.clientSecret) {
      return NextResponse.json({ error: "Conexao gerenciada Shopify ainda nao foi configurada pela Altum." }, { status: 503 });
    }
    const callbackUrl = `${getAppBaseUrl(req)}/api/integrations/commerce/shopify/callback`;
    const state = await createCommerceOAuthState({
      provider: "shopify",
      tenantId,
      userId: user.uid,
      userName: user.name,
      redirectPath: body.redirectPath as string,
      shopDomain,
    });
    const url = new URL(`https://${shopDomain}/admin/oauth/authorize`);
    url.searchParams.set("client_id", env.clientId);
    url.searchParams.set("scope", env.scopes);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("state", state);
    return NextResponse.json({ ok: true, authorizationUrl: url.toString() });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao iniciar OAuth Shopify:", error);
    return NextResponse.json({ error: "Falha ao iniciar conexao Shopify." }, { status: 500 });
  }
}
