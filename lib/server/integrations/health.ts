import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { getGoogleAdsEnv, normalizeConnectionStatus, type ConnectionStatus } from "@/app/lib/server/integration-oauth";
import { isGoogleAdsServerConfigured } from "@/app/lib/server/google-ads";

export type ChannelHealth = {
  channelId: string;
  type: string;
  ok: boolean;
  status: ConnectionStatus;
  reason?: string;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeCustomerId(value: unknown) {
  return clean(value, 120).replace(/[^\d]/g, "");
}

async function verifyMetaAccessToken(accessToken: string, graphVersion: string) {
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    return {
      ok: false,
      reason: clean(payload.error?.message, 300) || "Falha ao validar token da Meta.",
    };
  }
  return { ok: true, reason: "" };
}

async function verifyGoogleRefreshToken(refreshToken: string) {
  const env = getGoogleAdsEnv();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    return {
      ok: false,
      reason: clean(payload.error_description, 300) || clean(payload.error, 200) || "Refresh token invalido.",
    };
  }
  return { ok: true, reason: "" };
}

async function subscribeMetaPageWebhook(input: { pageId: string; pageToken: string; graphVersion: string }) {
  const fields =
    clean(process.env.META_WEBHOOK_SUBSCRIBED_FIELDS, 1000) ||
    "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers,message_reads,message_deliveries,feed";
  const response = await fetch(
    `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: input.pageToken,
        subscribed_fields: fields,
      }),
      cache: "no-store",
    }
  );
  const payload = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!response.ok) {
    return {
      ok: false,
      reason: clean(payload.error?.message, 300) || "Falha ao assinar webhook da pagina.",
    };
  }
  return { ok: true, reason: "" };
}

export async function runTenantIntegrationHealthCheck(input: {
  tenantId: string;
  attemptRepair?: boolean;
}) {
  const tenantId = clean(input.tenantId, 180);
  if (!tenantId) {
    return { tenantId: "", checkedAt: new Date().toISOString(), items: [] as ChannelHealth[] };
  }

  const snap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", tenantId)
    .limit(60)
    .get();

  const graphVersion = clean(process.env.META_GRAPH_VERSION, 20) || "v21.0";
  const items: ChannelHealth[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const type = clean(data.type, 40).toLowerCase();
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};

    if (!["instagram", "messenger", "meta_ads", "google_ads"].includes(type)) continue;

    let result: ChannelHealth = {
      channelId: doc.id,
      type,
      ok: true,
      status: normalizeConnectionStatus(data.connectionStatus, "ready"),
    };

    if (type === "google_ads") {
      if (!isGoogleAdsServerConfigured()) {
        result = {
          channelId: doc.id,
          type,
          ok: false,
          status: "degraded",
          reason: "Servidor sem credenciais globais do Google Ads.",
        };
      } else {
        const refreshToken = clean(decryptSecret(data.refreshToken), 5000);
        const accessToken = clean(decryptSecret(data.accessToken), 5000);
        const customerId = normalizeCustomerId(data.externalAccountId);
        if (!customerId || (!refreshToken && !accessToken)) {
          result = {
            channelId: doc.id,
            type,
            ok: false,
            status: "reauth_required",
            reason: "Canal sem customerId ou token OAuth.",
          };
        } else if (refreshToken) {
          const check = await verifyGoogleRefreshToken(refreshToken);
          result = {
            channelId: doc.id,
            type,
            ok: check.ok,
            status: check.ok ? "ready" : "reauth_required",
            reason: check.reason,
          };
        } else {
          result = {
            channelId: doc.id,
            type,
            ok: true,
            status: "connected",
            reason: "Somente access token disponivel; recomenda-se reconectar para refresh token.",
          };
        }
      }
    } else {
      const accessToken = clean(decryptSecret(data.accessToken), 5000);
      const pageId = clean(data.pageId, 180);
      const oauthManaged = clean(metadata.oauthManaged, 20) === "true";
      if (!accessToken) {
        result = {
          channelId: doc.id,
          type,
          ok: false,
          status: "reauth_required",
          reason: "Canal sem access token.",
        };
      } else {
        const check = await verifyMetaAccessToken(accessToken, graphVersion);
        const hasMapping = Boolean(clean(data.externalAccountId, 180) || pageId);
        const hasWebhookSignal = oauthManaged || Boolean(pageId);
        result = {
          channelId: doc.id,
          type,
          ok: check.ok && hasMapping,
          status: check.ok ? (hasMapping ? (hasWebhookSignal ? "ready" : "webhook_pending") : "connected") : "reauth_required",
          reason: check.reason || (hasMapping ? "" : "Canal sem mapeamento de asset."),
        };

        if (
          input.attemptRepair &&
          check.ok &&
          hasMapping &&
          oauthManaged &&
          pageId &&
          (result.status === "webhook_pending" || result.status === "degraded")
        ) {
          const repair = await subscribeMetaPageWebhook({ pageId, pageToken: accessToken, graphVersion });
          if (repair.ok) {
            result = { ...result, ok: true, status: "ready", reason: "" };
          } else if (!result.reason) {
            result = { ...result, reason: repair.reason };
          }
        }
      }
    }

    await doc.ref.set(
      {
        connectionStatus: result.status,
        lastError: result.ok ? "" : clean(result.reason, 500),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    items.push(result);
  }

  return {
    tenantId,
    checkedAt: new Date().toISOString(),
    items,
    healthy: items.filter((item) => item.ok).length,
    total: items.length,
  };
}
