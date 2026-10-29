import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/app/lib/server/integration-oauth";
import { getCommerceOAuthEnv, normalizeShopifyDomain, verifyShopifyOAuthHmac } from "@/lib/server/commerce/oauth";

/** App URL: Shopify entry only prefills the store. Linking always requires Altum login and tenant authorization. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = getCommerceOAuthEnv().shopify.clientSecret;
  const shop = normalizeShopifyDomain(url.searchParams.get("shop"));
  if (!secret) return NextResponse.json({ error: "A conexão Shopify está em preparação. Entre em contato com a Altum." }, { status: 503 });
  if (!shop || !verifyShopifyOAuthHmac(url, secret)) {
    return NextResponse.json({ error: "Abra a conexão pelo aplicativo Altum na Shopify." }, { status: 401 });
  }
  const target = new URL("/cliente/painel/configuracoes/integracoes", getAppBaseUrl(req));
  target.searchParams.set("shopifyShop", shop);
  return NextResponse.redirect(target);
}
