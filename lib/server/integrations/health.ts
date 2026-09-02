import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { getGoogleAdsEnv, normalizeConnectionStatus, type ConnectionStatus } from "@/app/lib/server/integration-oauth";
import { isGoogleAdsServerConfigured } from "@/app/lib/server/google-ads";
import { getWhatsAppChannelById, isOfficialWhatsAppProvider } from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "@/lib/server/messaging/registry";
import {
  connectionConfigFromDoc,
  getCommerceProvider,
  hasCommerceCredentials,
  readCommerceCredentials,
  validateCommerceCredentials,
} from "@/lib/server/commerce/registry";

export type ChannelHealth = {
  channelId: string;
  type: string;
  label?: string;
  provider?: string;
  source?: "channel" | "commerce";
  actionHref?: string;
  ok: boolean;
  status: ConnectionStatus;
  reason?: string;
};

async function withinHealthDeadline<T>(operation: Promise<T>, timeoutMs = 12_000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tempo limite da verificacao excedido.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function providerLabel(value: unknown) {
  const provider = clean(value, 80).toLowerCase();
  if (provider === "meta_whatsapp" || provider === "whatsapp_cloud_api") return "WhatsApp oficial";
  if (provider === "evolution" || provider === "evolution_api") return "WhatsApp por QR";
  return provider ? provider.replace(/_/g, " ") : "WhatsApp";
}

async function verifyWhatsAppChannel(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  const providerName = clean(data.provider, 80);
  const base: ChannelHealth = {
    channelId: doc.id,
    type: "whatsapp",
    label: clean(data.displayName, 160) || "WhatsApp",
    provider: providerLabel(providerName),
    source: "channel",
    actionHref: "/cliente/painel/configuracoes/canais?canal=whatsapp",
    ok: false,
    status: "degraded",
  };
  const channel = await getWhatsAppChannelById(doc.id);
  if (!channel) {
    return { ...base, status: "reauth_required" as const, reason: "Conexao incompleta. Revise as credenciais e salve o canal novamente." };
  }

  if (isOfficialWhatsAppProvider(channel.provider)) {
    const check = await verifyMetaAccessToken(channel.accessToken, clean(process.env.META_GRAPH_VERSION, 20) || "v21.0");
    return check.ok
      ? { ...base, ok: true, status: "ready" as const, reason: "API oficial da Meta validada." }
      : { ...base, status: "reauth_required" as const, reason: check.reason };
  }

  const messaging = getWhatsAppMessagingProvider(channel);
  if (!messaging.getSession) {
    return { ...base, reason: "O provedor nao oferece consulta automatica de sessao." };
  }
  try {
    const session = await withinHealthDeadline(messaging.getSession());
    if (session.status === "connected") {
      return { ...base, ok: true, status: "ready" as const, reason: "Sessao conectada e pronta para mensagens." };
    }
    if (session.status === "qr_required") {
      return { ...base, status: "reauth_required" as const, reason: "A sessao precisa ler um novo QR Code." };
    }
    if (session.status === "connecting") {
      return { ...base, status: "syncing" as const, reason: "A sessao ainda esta conectando." };
    }
    return { ...base, status: "degraded" as const, reason: "A sessao do WhatsApp esta desconectada." };
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 300) : "";
    return { ...base, status: "degraded" as const, reason: message || "Nao foi possivel consultar a sessao do WhatsApp." };
  }
}

async function verifyCommerceConnection(doc: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = doc.data() as Record<string, unknown>;
  const provider = getCommerceProvider(data.provider);
  const base: ChannelHealth = {
    channelId: doc.id,
    type: "ecommerce",
    label: clean(data.displayName, 160) || provider.label,
    provider: provider.label,
    source: "commerce",
    actionHref: "/cliente/painel/configuracoes/integracoes",
    ok: false,
    status: "degraded",
  };
  const storedStatus = clean(data.status, 40).toLowerCase();
  if (storedStatus === "paused") {
    return { ...base, status: "revoked" as const, reason: "Integracao pausada." };
  }
  if (!provider.credentialFields.length) {
    const hasWebhookActivity = Boolean(data.lastEventAt || data.lastWebhookAt || data.lastSyncAt);
    const hasStoredError = clean(data.lastError, 300);
    return hasStoredError
      ? { ...base, status: "degraded" as const, reason: hasStoredError }
      : {
          ...base,
          ok: storedStatus === "active" || hasWebhookActivity,
          status: storedStatus === "active" || hasWebhookActivity ? "ready" as const : "webhook_pending" as const,
          reason: hasWebhookActivity ? "Webhook recebendo dados da loja." : "Aguardando o primeiro evento da loja.",
        };
  }
  if (!hasCommerceCredentials(data.apiCredentials)) {
    return { ...base, status: "reauth_required" as const, reason: "Credenciais da loja nao encontradas." };
  }
  try {
    const credentials = readCommerceCredentials(data.apiCredentials);
    validateCommerceCredentials(provider, credentials);
    const check = await withinHealthDeadline(provider.testConnection({
      connection: connectionConfigFromDoc(doc.id, data),
      credentials,
    }));
    return check.ok
      ? { ...base, ok: true, status: "ready" as const, reason: check.detail || "Loja conectada." }
      : { ...base, status: "reauth_required" as const, reason: check.detail || "A loja recusou a conexao." };
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 300) : "";
    return { ...base, status: "reauth_required" as const, reason: message || "Nao foi possivel validar a loja." };
  }
}

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
    signal: AbortSignal.timeout(10_000),
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
    signal: AbortSignal.timeout(10_000),
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

function resolveMetaWebhookFields(channelType: "instagram" | "messenger") {
  const globalOverride = clean(process.env.META_WEBHOOK_SUBSCRIBED_FIELDS, 1000);
  const scopedOverride =
    channelType === "instagram"
      ? clean(process.env.META_WEBHOOK_SUBSCRIBED_FIELDS_INSTAGRAM, 1000)
      : clean(process.env.META_WEBHOOK_SUBSCRIBED_FIELDS_MESSENGER, 1000);
  if (scopedOverride) return scopedOverride;
  if (globalOverride) return globalOverride;
  if (channelType === "instagram") return "messages,messaging_postbacks";
  return "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers,message_reads,message_deliveries,feed";
}

async function subscribeMetaPageWebhook(input: {
  channelType: "instagram" | "messenger";
  pageId: string;
  pageToken: string;
  graphVersion: string;
}) {
  const fields = resolveMetaWebhookFields(input.channelType);
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
      signal: AbortSignal.timeout(10_000),
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

  const [snap, commerceSnap] = await Promise.all([
    adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(60).get(),
    adminDb.collection("ecommerce_connections").where("tenantId", "==", tenantId).limit(30).get(),
  ]);

  const graphVersion = clean(process.env.META_GRAPH_VERSION, 20) || "v21.0";
  const items: ChannelHealth[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const type = clean(data.type, 40).toLowerCase();
    const metadata =
      data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? (data.metadata as Record<string, unknown>)
        : {};

    if (type === "whatsapp") {
      const result = await verifyWhatsAppChannel(doc);
      await doc.ref.set(
        {
          connectionStatus: result.status,
          lastError: result.ok ? "" : clean(result.reason, 500),
          lastHealthCheckAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      items.push(result);
      continue;
    }

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
      const storedStatus = normalizeConnectionStatus(data.connectionStatus, "draft");
      const storedError = clean(data.lastError, 500);
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
        result = {
          channelId: doc.id,
          type,
          ok: check.ok && hasMapping,
          status: check.ok ? (hasMapping ? "connected" : "connected") : "reauth_required",
          reason: check.reason || (hasMapping ? "" : "Canal sem mapeamento de asset."),
        };

        if (check.ok && hasMapping) {
          if (type === "instagram" || type === "messenger") {
            const shouldRepairWebhook =
              input.attemptRepair &&
              oauthManaged &&
              pageId &&
              storedStatus !== "ready";

            if (shouldRepairWebhook) {
              const repair = await subscribeMetaPageWebhook({
                channelType: type,
                pageId,
                pageToken: accessToken,
                graphVersion,
              });
              result = repair.ok
                ? { ...result, ok: true, status: "ready", reason: "" }
                : { ...result, ok: false, status: "webhook_pending", reason: repair.reason };
            } else if (storedStatus === "ready") {
              result = { ...result, ok: true, status: "ready", reason: "" };
            } else {
              result = {
                ...result,
                ok: false,
                status: "webhook_pending",
                reason:
                  storedError ||
                  (pageId
                    ? "Webhook ainda nao validado. Clique em Testar conexao para assinar a pagina."
                    : "Canal sem pageId para assinatura de webhook."),
              };
            }
          } else if (type === "meta_ads") {
            result = { ...result, ok: true, status: storedStatus === "ready" ? "ready" : "connected", reason: "" };
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

  for (const doc of commerceSnap.docs) {
    let result: ChannelHealth;
    try {
      result = await verifyCommerceConnection(doc);
    } catch {
      const data = doc.data() as Record<string, unknown>;
      result = {
        channelId: doc.id,
        type: "ecommerce",
        label: clean(data.displayName, 160) || "Loja virtual",
        provider: clean(data.provider, 80) || "Ecommerce",
        source: "commerce",
        actionHref: "/cliente/painel/configuracoes/integracoes",
        ok: false,
        status: "degraded",
        reason: "Conector da loja invalido ou indisponivel. Revise a configuracao.",
      };
    }
    await doc.ref.set(
      {
        connectionStatus: result.status,
        lastError: result.ok ? "" : clean(result.reason, 500),
        lastConnectionTestAt: FieldValue.serverTimestamp(),
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
