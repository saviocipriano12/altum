import { NextRequest, NextResponse } from "next/server";
import { buildClientRedirect, getAppBaseUrl } from "@/app/lib/server/integration-oauth";
import { consumeCommerceOAuthState, getCommerceOAuthEnv, saveManagedCommerceConnection } from "@/lib/server/commerce/oauth";
import { syncCommerceConnection } from "@/lib/server/commerce/sync";
import { ensureNuvemshopWebhookSubscriptions } from "@/lib/server/commerce/nuvemshop-webhooks";

const COOKIE_NAME = "altum_commerce_nuvem_oauth";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const baseUrl = getAppBaseUrl(req);
  let redirectPath = "/cliente/painel/configuracoes/integracoes";
  let response: NextResponse;
  try {
    const env = getCommerceOAuthEnv().nuvemshop;
    if (!env.clientId || !env.clientSecret) throw new Error("nuvemshop_oauth_not_configured");
    const code = clean(url.searchParams.get("code"), 1000);
    const queryState = clean(url.searchParams.get("state"), 500);
    const cookieState = clean(req.cookies.get(COOKIE_NAME)?.value, 500);
    if (!code || !queryState || (cookieState && queryState !== cookieState)) throw new Error("nuvemshop_oauth_callback_invalid");
    const state = queryState;
    const oauthState = await consumeCommerceOAuthState(state, "nuvemshop");
    redirectPath = oauthState.redirectPath;
    const base = String(process.env.NUVEMSHOP_AUTH_BASE_URL || "https://www.nuvemshop.com.br").replace(/\/$/, "");
    const tokenResponse = await fetch(`${base}/apps/authorize/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: env.clientId, client_secret: env.clientSecret, code }),
      cache: "no-store",
    });
    const tokenData = (await tokenResponse.json().catch(() => ({}))) as { access_token?: unknown; user_id?: unknown; scope?: unknown };
    const accessToken = clean(tokenData.access_token, 12000);
    const storeId = clean(String(tokenData.user_id || ""), 180).replace(/[^0-9]/g, "");
    if (!tokenResponse.ok || !accessToken || !storeId) throw new Error("nuvemshop_oauth_token_exchange_failed");
    const connection = await saveManagedCommerceConnection({
      provider: "nuvemshop",
      tenantId: oauthState.tenantId,
      userId: oauthState.userId,
      userName: oauthState.userName,
      storeId,
      accessToken,
      scope: clean(tokenData.scope, 1000),
    });
    let syncWarning = "";
    try {
      const webhooks = await ensureNuvemshopWebhookSubscriptions({
        tenantId: oauthState.tenantId,
        connectionId: connection.connectionId,
        storeId,
        accessToken,
        appBaseUrl: baseUrl,
      });
      if (webhooks.failed.length) syncWarning = "nuvemshop_webhook_provisioning_partial";
    } catch (error) {
      syncWarning = error instanceof Error ? error.message : "nuvemshop_webhook_provisioning_failed";
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
    response = NextResponse.redirect(buildClientRedirect(redirectPath, {
      commerceProvider: "nuvemshop",
      commerceResult: syncWarning ? "connected_with_sync_warning" : "connected",
    }, baseUrl));
  } catch (error) {
    console.error("Erro no callback OAuth Nuvemshop:", error);
    response = NextResponse.redirect(buildClientRedirect(redirectPath, {
      commerceProvider: "nuvemshop",
      commerceResult: "error",
      commerceMessage: error instanceof Error ? error.message.slice(0, 180) : "oauth_failed",
    }, baseUrl));
  }
  response.cookies.delete(COOKIE_NAME);
  return response;
}
