import { NextResponse } from "next/server";
import { createIntegrationPendingSelection } from "@/app/lib/server/integration-pending";
import {
  buildClientRedirect,
  consumeIntegrationOAuthState,
  getAppBaseUrl,
  getGoogleAdsEnv,
} from "@/app/lib/server/integration-oauth";
import { finalizeGoogleConnection, mapGoogleCustomers } from "@/app/lib/server/integrations/connect-finalizers";

type GoogleTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function mapGoogleError(payload: GoogleTokenPayload, fallback: string) {
  return clean(payload.error_description, 400) || clean(payload.error, 200) || fallback;
}

async function fetchGoogleCustomerPreview(input: {
  customerId: string;
  accessToken: string;
  apiVersion: string;
  developerToken: string;
}) {
  const response = await fetch(
    `https://googleads.googleapis.com/${input.apiVersion}/customers/${input.customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "developer-token": input.developerToken,
      },
      body: JSON.stringify({
        query: [
          "SELECT",
          "customer.id,",
          "customer.descriptive_name,",
          "customer.currency_code,",
          "customer.time_zone",
          "FROM customer",
          "LIMIT 1",
        ].join(" "),
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) return null;
  const payload = (await response.json().catch(() => ([]))) as Array<{
    results?: Array<{ customer?: Record<string, unknown> }>;
  }>;
  const row = Array.isArray(payload) ? payload[0]?.results?.[0] : null;
  const customer = row?.customer && typeof row.customer === "object" ? row.customer : {};
  return {
    descriptiveName: clean(customer.descriptiveName, 200) || clean(customer.descriptive_name, 200),
    currencyCode: clean(customer.currencyCode, 20) || clean(customer.currency_code, 20),
    timeZone: clean(customer.timeZone, 80) || clean(customer.time_zone, 80),
  };
}

export async function GET(req: Request) {
  const env = getGoogleAdsEnv();
  const baseUrl = getAppBaseUrl(req);
  const callbackUri = `${baseUrl}/api/integrations/google/callback`;
  const url = new URL(req.url);
  const code = clean(url.searchParams.get("code"), 1200);
  const state = clean(url.searchParams.get("state"), 400);
  const deniedDescription = clean(url.searchParams.get("error_description"), 300);
  const deniedReason = clean(url.searchParams.get("error"), 120);

  const fallbackRedirect = "/cliente/painel/configuracoes/canais";

  try {
    if (!state) {
      return NextResponse.redirect(
        buildClientRedirect(fallbackRedirect, {
          integration: "google",
          result: "error",
          message: "state_ausente",
        })
      );
    }

    const oauth = await consumeIntegrationOAuthState(state, "google");
    if (deniedReason || !code) {
      return NextResponse.redirect(
        buildClientRedirect(oauth.redirectPath, {
          tenantId: oauth.tenantId,
          integration: "google",
          result: "error",
          message: deniedDescription || deniedReason || "autorizacao_cancelada",
        })
      );
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.clientId,
        client_secret: env.clientSecret,
        redirect_uri: callbackUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const tokenPayload = (await tokenResponse.json().catch(() => ({}))) as GoogleTokenPayload;
    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error(mapGoogleError(tokenPayload, "Falha ao trocar code por token do Google."));
    }

    const customersResponse = await fetch(
      `https://googleads.googleapis.com/${env.apiVersion}/customers:listAccessibleCustomers`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${tokenPayload.access_token}`,
          "developer-token": env.developerToken,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );
    const customersPayload = (await customersResponse.json().catch(() => ({}))) as {
      resourceNames?: string[];
      error?: { message?: string };
    };
    if (!customersResponse.ok) {
      throw new Error(clean(customersPayload.error?.message, 400) || "Falha ao listar contas Google Ads.");
    }

    const customerResources = Array.isArray(customersPayload.resourceNames) ? customersPayload.resourceNames : [];
    const mappedCustomers = mapGoogleCustomers(customerResources);
    if (mappedCustomers.length === 0) {
      throw new Error("Nenhuma conta Google Ads acessivel foi encontrada.");
    }

    const previews = await Promise.all(
      mappedCustomers.slice(0, 25).map(async (item) => {
        const preview = await fetchGoogleCustomerPreview({
          customerId: item.customerId,
          accessToken: clean(tokenPayload.access_token, 5000),
          apiVersion: env.apiVersion,
          developerToken: env.developerToken,
        });
        return {
          customerId: item.customerId,
          preview,
        };
      })
    );
    const previewByCustomer = new Map(previews.map((item) => [item.customerId, item.preview]));

    if (mappedCustomers.length > 1) {
      const pending = await createIntegrationPendingSelection({
        provider: "google",
        tenantId: oauth.tenantId,
        userId: oauth.userId,
        channelType: "google_ads",
        redirectPath: oauth.redirectPath,
        oauthToken: clean(tokenPayload.access_token, 5000),
        oauthScope: clean(tokenPayload.scope, 1200),
        googleCustomers: mappedCustomers.map((item) => {
          const preview = previewByCustomer.get(item.customerId);
          const descriptiveName = preview?.descriptiveName || "";
          return {
            customerId: item.customerId,
            label: descriptiveName || item.label,
            resourceName: item.resourceName,
            currencyCode: preview?.currencyCode || "",
            timeZone: preview?.timeZone || "",
          };
        }),
      });
      return NextResponse.redirect(
        buildClientRedirect(oauth.redirectPath, {
          tenantId: oauth.tenantId,
          integration: "google",
          result: "select",
          channel: "google_ads",
          pendingId: pending.pendingId,
        })
      );
    }

    const selected = mappedCustomers[0];
    const selectedPreview = previewByCustomer.get(selected.customerId);
    const finalized = await finalizeGoogleConnection({
      tenantId: oauth.tenantId,
      userId: oauth.userId,
      tokenPayload,
      customerId: selected.customerId,
      customerResourceName: selected.resourceName,
      channelName: selectedPreview?.descriptiveName || selected.label,
    });

    return NextResponse.redirect(
      buildClientRedirect(oauth.redirectPath, {
        tenantId: oauth.tenantId,
        integration: "google",
        result: "success",
        channel: "google_ads",
        status: finalized.status,
        warning: finalized.warning,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 280) : "Erro no callback Google.";
    return NextResponse.redirect(
      buildClientRedirect(fallbackRedirect, {
        integration: "google",
        result: "error",
        message,
      })
    );
  }
}
