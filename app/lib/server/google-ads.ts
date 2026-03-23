const GOOGLE_ADS_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v22";

function clean(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCustomerId(value: unknown) {
  return clean(value, 60).replace(/[^\d]/g, "");
}

function getGoogleAdsEnv() {
  return {
    clientId: clean(process.env.GOOGLE_ADS_CLIENT_ID, 400),
    clientSecret: clean(process.env.GOOGLE_ADS_CLIENT_SECRET, 400),
    developerToken: clean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 200),
  };
}

export function isGoogleAdsServerConfigured() {
  const env = getGoogleAdsEnv();
  return Boolean(env.clientId && env.clientSecret && env.developerToken);
}

function getGoogleAdsErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "Falha ao consultar Google Ads.";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "Falha ao consultar Google Ads.";

  const message = clean((error as { message?: unknown }).message, 500);
  if (message) return message;

  const details = Array.isArray((error as { details?: unknown[] }).details)
    ? ((error as { details?: unknown[] }).details as unknown[])
    : [];

  for (const item of details) {
    if (item && typeof item === "object") {
      const detailMessage = clean((item as { message?: unknown }).message, 500);
      if (detailMessage) return detailMessage;
    }
  }

  return "Falha ao consultar Google Ads.";
}

async function refreshGoogleAdsAccessToken(refreshToken: string) {
  const env = getGoogleAdsEnv();
  if (!env.clientId || !env.clientSecret) {
    throw new Error("Servidor sem GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET configurados.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  };

  if (!response.ok) {
    throw new Error(
      clean(payload.error_description, 500) ||
        clean(payload.error, 160) ||
        "Falha ao renovar token OAuth do Google Ads."
    );
  }

  const accessToken = clean(payload.access_token, 4000);
  if (!accessToken) {
    throw new Error("OAuth do Google Ads nao retornou access token.");
  }

  return accessToken;
}

export async function fetchGoogleAdsDailyMetrics(input: {
  customerId: string;
  dateRef: string;
  refreshToken?: string;
  accessToken?: string;
  loginCustomerId?: string;
}) {
  const env = getGoogleAdsEnv();
  if (!env.developerToken) {
    throw new Error("Servidor sem GOOGLE_ADS_DEVELOPER_TOKEN configurado.");
  }

  const customerId = normalizeCustomerId(input.customerId);
  if (!customerId) {
    throw new Error("Customer ID do Google Ads invalido.");
  }

  const loginCustomerId = normalizeCustomerId(input.loginCustomerId);
  const refreshToken = clean(input.refreshToken, 4000);
  const directAccessToken = clean(input.accessToken, 4000);
  const accessToken = refreshToken
    ? await refreshGoogleAdsAccessToken(refreshToken)
    : directAccessToken;

  if (!accessToken) {
    throw new Error("Conector Google Ads sem credencial OAuth valida. Informe refresh token ou access token.");
  }

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "developer-token": env.developerToken,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
      },
      body: JSON.stringify({
        query: [
          "SELECT",
          "customer.id,",
          "metrics.impressions,",
          "metrics.clicks,",
          "metrics.cost_micros,",
          "metrics.conversions",
          "FROM customer",
          `WHERE segments.date = '${clean(input.dateRef, 20)}'`,
        ].join(" "),
      }),
      cache: "no-store",
    }
  );

  const payload = (await response.json().catch(() => ([]))) as
    | Array<{ results?: Array<{ metrics?: Record<string, unknown> }> }>
    | Record<string, unknown>;

  if (!response.ok) {
    throw new Error(getGoogleAdsErrorMessage(payload));
  }

  const batches = Array.isArray(payload) ? payload : [payload];
  let impressions = 0;
  let clicks = 0;
  let costMicros = 0;
  let conversions = 0;

  for (const batch of batches) {
    const results = Array.isArray(batch?.results) ? batch.results : [];
    for (const row of results) {
      const metrics = row?.metrics && typeof row.metrics === "object" ? row.metrics : {};
      impressions += Math.max(0, Math.round(toNumber(metrics.impressions)));
      clicks += Math.max(0, Math.round(toNumber(metrics.clicks)));
      costMicros += Math.max(0, toNumber(metrics.costMicros ?? metrics.cost_micros));
      conversions += Math.max(0, toNumber(metrics.conversions));
    }
  }

  return {
    impressions,
    clicks,
    spend: Number((costMicros / 1_000_000).toFixed(2)),
    leads: Math.max(0, Math.round(conversions)),
  };
}
