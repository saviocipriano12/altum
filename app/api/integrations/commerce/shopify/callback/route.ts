import { NextResponse } from "next/server";
import { buildClientRedirect, getAppBaseUrl } from "@/app/lib/server/integration-oauth";
import {
  consumeCommerceOAuthState,
  getCommerceOAuthEnv,
  normalizeShopifyDomain,
  saveManagedCommerceConnection,
  verifyShopifyOAuthHmac,
} from "@/lib/server/commerce/oauth";
import { syncCommerceConnection } from "@/lib/server/commerce/sync";
import { ensureShopifyWebhookSubscriptions } from "@/lib/server/commerce/shopify-webhooks";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const baseUrl = getAppBaseUrl(req);
  let redirectPath = "/cliente/painel/configuracoes/integracoes";
  try {
    const env = getCommerceOAuthEnv().shopify;
    if (!env.clientId || !env.clientSecret) throw new Error("shopify_oauth_not_configured");
    if (url.searchParams.get("error")) throw new Error(clean(url.searchParams.get("error_description")) || "shopify_authorization_denied");
    if (!verifyShopifyOAuthHmac(url, env.clientSecret)) throw new Error("shopify_oauth_hmac_invalid");
    const shop = normalizeShopifyDomain(url.searchParams.get("shop"));
    const code = clean(url.searchParams.get("code"), 1000);
    const state = clean(url.searchParams.get("state"), 500);
    if (!shop || !code || !state) throw new Error("shopify_oauth_callback_invalid");

    const oauthState = await consumeCommerceOAuthState(state, "shopify");
    redirectPath = oauthState.redirectPath;
    if (shop !== oauthState.shopDomain) throw new Error("shopify_oauth_shop_mismatch");
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, code }),
      cache: "no-store",
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as { access_token?: unknown; scope?: unknown };
    const accessToken = clean(tokenData.access_token, 12000);
    if (!tokenResponse.ok || !accessToken) throw new Error("shopify_oauth_token_exchange_failed");
    const connection = await saveManagedCommerceConnection({
      provider: "shopify",
      tenantId: oauthState.tenantId,
      userId: oauthState.userId,
      userName: oauthState.userName,
      storeId: shop,
      storeUrl: `https://${shop}`,
      accessToken,
      scope: clean(tokenData.scope, 1000),
    });

    let syncWarning = "";
    try {
      const webhooks = await ensureShopifyWebhookSubscriptions({
        tenantId: oauthState.tenantId,
        connectionId: connection.connectionId,
        shopDomain: shop,
        accessToken,
        appBaseUrl: baseUrl,
      });
      if (webhooks.failed.length) syncWarning = "shopify_webhook_provisioning_partial";
    } catch (error) {
      syncWarning = error instanceof Error ? error.message : "shopify_webhook_provisioning_failed";
    }
    try {
      await syncCommerceConnection({
        tenantId: oauthState.tenantId,
        connectionId: connection.connectionId,
        limit: 15,
        actor: { id: oauthState.userId, name: oauthState.userName, source: "oauth" },
      });
    } catch (error) {
      syncWarning = syncWarning || (error instanceof Error ? error.message : "initial_sync_failed");
    }
    return NextResponse.redirect(
      buildClientRedirect(redirectPath, {
        commerceProvider: "shopify",
        commerceResult: syncWarning ? "connected_with_sync_warning" : "connected",
      }, baseUrl)
    );
  } catch (error) {
    console.error("Erro no callback OAuth Shopify:", error);
    return NextResponse.redirect(buildClientRedirect(redirectPath, {
      commerceProvider: "shopify",
      commerceResult: "error",
      commerceMessage: error instanceof Error ? error.message.slice(0, 180) : "oauth_failed",
    }, baseUrl));
  }
}
