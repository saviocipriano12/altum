import { NextResponse } from "next/server";
import { createIntegrationPendingSelection } from "@/app/lib/server/integration-pending";
import {
  buildClientRedirect,
  consumeIntegrationOAuthState,
  getAppBaseUrl,
  getMetaEnv,
} from "@/app/lib/server/integration-oauth";
import { finalizeMetaConnection } from "@/app/lib/server/integrations/connect-finalizers";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function resolveGraphError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  return clean((error as { message?: unknown }).message, 500) || fallback;
}

async function fetchMetaJson<T>(url: string, accessToken?: string) {
  const response = await fetch(url, {
    method: "GET",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new Error(resolveGraphError(payload, "Falha ao consultar API da Meta."));
  }
  return payload;
}

type MetaTokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type MetaPage = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
};

type MetaAdAccount = {
  id?: string;
  account_id?: string;
  name?: string;
  account_status?: unknown;
  currency?: string;
};

export async function GET(req: Request) {
  const env = getMetaEnv();
  const baseUrl = getAppBaseUrl(req);
  const callbackUri = `${baseUrl}/api/integrations/meta/callback`;
  const url = new URL(req.url);
  const code = clean(url.searchParams.get("code"), 1200);
  const state = clean(url.searchParams.get("state"), 400);
  const deniedReason = clean(url.searchParams.get("error_reason"), 200);
  const deniedDescription = clean(url.searchParams.get("error_description"), 300);

  const fallbackRedirect = "/cliente/painel/configuracoes/canais";
  try {
    if (!state) {
      return NextResponse.redirect(
        buildClientRedirect(fallbackRedirect, {
          integration: "meta",
          result: "error",
          message: "state_ausente",
        })
      );
    }

    const oauth = await consumeIntegrationOAuthState(state, "meta");

    if (deniedReason || !code) {
      return NextResponse.redirect(
        buildClientRedirect(oauth.redirectPath, {
          tenantId: oauth.tenantId,
          integration: "meta",
          result: "error",
          message: deniedDescription || deniedReason || "autorizacao_cancelada",
        })
      );
    }

    const tokenRes = await fetch(
      `https://graph.facebook.com/${env.graphVersion}/oauth/access_token?` +
        new URLSearchParams({
          client_id: env.appId,
          client_secret: env.appSecret,
          redirect_uri: callbackUri,
          code,
        }).toString(),
      { cache: "no-store" }
    );
    const tokenPayload = (await tokenRes.json().catch(() => ({}))) as MetaTokenPayload & { error?: unknown };
    if (!tokenRes.ok || !tokenPayload.access_token) {
      throw new Error(resolveGraphError(tokenPayload, "Falha ao trocar code por token da Meta."));
    }

    const scope =
      clean(url.searchParams.get("granted_scopes"), 1200) ||
      clean(url.searchParams.get("scope"), 1200);

    let pages: MetaPage[] = [];
    let adAccounts: MetaAdAccount[] = [];

    if (oauth.channelType === "instagram" || oauth.channelType === "messenger") {
      const pagesPayload = await fetchMetaJson<{ data?: MetaPage[] }>(
        `https://graph.facebook.com/${env.graphVersion}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&limit=100`,
        tokenPayload.access_token
      );
      pages = Array.isArray(pagesPayload.data) ? pagesPayload.data : [];
    }

    if (oauth.channelType === "meta_ads") {
      const adAccountsPayload = await fetchMetaJson<{ data?: MetaAdAccount[] }>(
        `https://graph.facebook.com/${env.graphVersion}/me/adaccounts?fields=id,account_id,name,account_status,currency&limit=100`,
        tokenPayload.access_token
      );
      adAccounts = Array.isArray(adAccountsPayload.data) ? adAccountsPayload.data : [];
    }

    const pageForMessaging =
      oauth.channelType === "messenger"
        ? pages.find((item) => clean(item.id, 200) && clean(item.access_token, 200)) || null
        : null;
    const pageForInstagram =
      oauth.channelType === "instagram"
        ? pages.find((item) => clean(item.instagram_business_account?.id, 200) && clean(item.access_token, 200)) || null
        : null;
    const chosenAdAccount = oauth.channelType === "meta_ads" ? adAccounts[0] || null : null;

    if (oauth.channelType === "instagram" && !pageForInstagram) {
      throw new Error("Nenhuma pagina com Instagram Business vinculada foi encontrada.");
    }
    if (oauth.channelType === "messenger" && !pageForMessaging) {
      throw new Error("Nenhuma pagina com permissao de Messenger foi encontrada.");
    }
    if (oauth.channelType === "meta_ads" && !chosenAdAccount) {
      throw new Error("Nenhuma conta de anuncios foi encontrada para este usuario.");
    }

    const instagramOptions =
      oauth.channelType === "instagram"
        ? pages
            .filter((item) => clean(item.instagram_business_account?.id, 200) && clean(item.access_token, 200))
            .map((item) => ({
              id: clean(item.id, 180),
              name: clean(item.name, 180),
              pageAccessToken: clean(item.access_token, 5000),
              instagramBusinessId: clean(item.instagram_business_account?.id, 180),
              instagramUsername: clean(item.instagram_business_account?.username, 180),
            }))
            .filter((item) => item.id && item.pageAccessToken)
        : [];
    const messengerOptions =
      oauth.channelType === "messenger"
        ? pages
            .filter((item) => clean(item.id, 180) && clean(item.access_token, 200))
            .map((item) => ({
              id: clean(item.id, 180),
              name: clean(item.name, 180),
              pageAccessToken: clean(item.access_token, 5000),
            }))
        : [];
    const adAccountOptions =
      oauth.channelType === "meta_ads"
        ? adAccounts.map((item) => ({
            id: clean(item.id, 180),
            accountId: clean(item.account_id, 120).replace(/[^\d]/g, ""),
            name: clean(item.name, 180),
            accountStatus: clean(item.account_status, 80),
            currency: clean(item.currency, 40),
          }))
        : [];

    if (
      (oauth.channelType === "instagram" && instagramOptions.length > 1) ||
      (oauth.channelType === "messenger" && messengerOptions.length > 1) ||
      (oauth.channelType === "meta_ads" && adAccountOptions.length > 1)
    ) {
      const pending = await createIntegrationPendingSelection({
        provider: "meta",
        tenantId: oauth.tenantId,
        userId: oauth.userId,
        channelType: oauth.channelType,
        redirectPath: oauth.redirectPath,
        oauthToken: clean(tokenPayload.access_token, 5000),
        oauthScope: scope,
        pages: oauth.channelType === "instagram" ? instagramOptions : oauth.channelType === "messenger" ? messengerOptions : [],
        adAccounts: oauth.channelType === "meta_ads" ? adAccountOptions : [],
      });
      return NextResponse.redirect(
        buildClientRedirect(oauth.redirectPath, {
          tenantId: oauth.tenantId,
          integration: "meta",
          result: "select",
          channel: oauth.channelType,
          pendingId: pending.pendingId,
        })
      );
    }

    const finalized = await finalizeMetaConnection({
      tenantId: oauth.tenantId,
      userId: oauth.userId,
      channelType: oauth.channelType as "instagram" | "messenger" | "meta_ads",
      page:
        oauth.channelType === "instagram"
          ? pageForInstagram
          : oauth.channelType === "messenger"
            ? pageForMessaging
            : undefined,
      adAccount: chosenAdAccount,
      token: tokenPayload,
      scope,
      graphVersion: env.graphVersion,
    });

    return NextResponse.redirect(
      buildClientRedirect(oauth.redirectPath, {
        tenantId: oauth.tenantId,
        integration: "meta",
        result: "success",
        channel: oauth.channelType,
        status: finalized.connectionStatus,
        warning: finalized.warning || "",
      })
    );
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 280) : "Erro no callback Meta.";
    return NextResponse.redirect(
      buildClientRedirect(fallbackRedirect, {
        integration: "meta",
        result: "error",
        message,
      })
    );
  }
}
