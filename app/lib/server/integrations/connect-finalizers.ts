import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { encryptSecret, decryptSecret } from "@/app/lib/server/secret-crypto";
import { normalizeConnectionStatus } from "@/app/lib/server/integration-oauth";
import { runTenantCampaignSync } from "@/lib/server/campaigns/tenant-sync";

type MetaTokenPayload = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type MetaPageLike = {
  id?: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: { id?: string; username?: string };
  instagramBusinessId?: string;
  instagramUsername?: string;
};

type MetaAdLike = {
  id?: string;
  account_id?: string;
  accountId?: string;
  name?: string;
};

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeMetaAdAccountId(value: unknown) {
  const raw = clean(value, 80).replace(/[^\d]/g, "");
  return raw ? `act_${raw}` : "";
}

function resolveGraphError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  return clean((error as { message?: unknown }).message, 500) || fallback;
}

async function subscribePageWebhooks(input: {
  pageId: string;
  pageAccessToken: string;
  graphVersion: string;
}) {
  const fields =
    clean(process.env.META_WEBHOOK_SUBSCRIBED_FIELDS, 1000) ||
    "messages,messaging_postbacks,messaging_optins,messaging_referrals,messaging_handovers,message_reads,message_deliveries,feed";
  const response = await fetch(
    `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.pageId)}/subscribed_apps`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        access_token: input.pageAccessToken,
        subscribed_fields: fields,
      }),
      cache: "no-store",
    }
  );
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(resolveGraphError(payload, "Falha ao assinar webhook da Meta."));
  }
}

async function upsertMetaChannel(input: {
  tenantId: string;
  userId: string;
  channelType: "instagram" | "messenger" | "meta_ads";
  page?: MetaPageLike | null;
  adAccount?: MetaAdLike | null;
  token: MetaTokenPayload;
  scope: string;
  connectionStatus: "connected" | "webhook_pending" | "ready" | "degraded";
  errorMessage?: string;
}) {
  const existing = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", input.tenantId)
    .where("type", "==", input.channelType)
    .limit(1)
    .get();
  const ref = existing.empty ? adminDb.collection("tenant_channels").doc() : existing.docs[0].ref;

  const pageId = clean(input.page?.id, 200);
  const pageAccessToken = clean(input.page?.access_token, 5000);
  const igId = clean(
    input.page?.instagram_business_account?.id || input.page?.instagramBusinessId,
    200
  );
  const igUsername = clean(
    input.page?.instagram_business_account?.username || input.page?.instagramUsername,
    200
  );
  const adAccountId = normalizeMetaAdAccountId(
    input.adAccount?.account_id || input.adAccount?.accountId || input.adAccount?.id
  );

  const metadata: Record<string, string> = {
    oauthManaged: "true",
    oauthProvider: "meta",
    oauthScope: input.scope,
    oauthGrantedAt: new Date().toISOString(),
    tokenType: clean(input.token.token_type, 40) || "bearer",
  };
  if (input.token.expires_in && Number(input.token.expires_in) > 0) {
    metadata.expiresAt = new Date(Date.now() + Number(input.token.expires_in) * 1000).toISOString();
  }
  if (igId) metadata.instagramBusinessId = igId;
  if (pageId) metadata.pageId = pageId;
  if (adAccountId) metadata.adAccountId = adAccountId;

  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    type: input.channelType,
    provider:
      input.channelType === "instagram"
        ? "meta_instagram"
        : input.channelType === "messenger"
          ? "facebook_messenger"
          : "meta_ads",
    displayName:
      input.channelType === "instagram"
        ? clean(input.page?.name, 160) || clean(igUsername, 160) || "Instagram DM"
        : input.channelType === "messenger"
          ? clean(input.page?.name, 160) || "Facebook Messenger"
          : clean(input.adAccount?.name, 160) || "Meta Ads",
    status: "active",
    connectionStatus: normalizeConnectionStatus(input.connectionStatus, "connected"),
    pageId: pageId || "",
    username:
      input.channelType === "instagram"
        ? igUsername || ""
        : input.channelType === "messenger"
          ? clean(input.page?.name, 160)
          : clean(input.adAccount?.name, 160),
    externalAccountId:
      input.channelType === "instagram"
        ? igId || pageId
        : input.channelType === "messenger"
          ? pageId
          : adAccountId,
    accessToken: encryptSecret(pageAccessToken || clean(input.token.access_token, 5000)),
    lastError: clean(input.errorMessage, 500),
    metadata,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: input.userId,
    createdAt: FieldValue.serverTimestamp(),
  };

  await ref.set(payload, { merge: true });
  return ref.id;
}

export async function finalizeMetaConnection(input: {
  tenantId: string;
  userId: string;
  channelType: "instagram" | "messenger" | "meta_ads";
  page?: MetaPageLike | null;
  adAccount?: MetaAdLike | null;
  token: MetaTokenPayload;
  scope: string;
  graphVersion: string;
}) {
  let subscribeError = "";
  const pageToSubscribe = input.channelType === "meta_ads" ? null : input.page || null;
  if (pageToSubscribe?.id && pageToSubscribe.access_token) {
    try {
      await subscribePageWebhooks({
        pageId: clean(pageToSubscribe.id, 200),
        pageAccessToken: clean(pageToSubscribe.access_token, 5000),
        graphVersion: input.graphVersion,
      });
    } catch (error) {
      subscribeError = error instanceof Error ? clean(error.message, 300) : "Erro ao assinar webhook.";
    }
  }

  const connectionStatus =
    input.channelType === "meta_ads"
      ? "connected"
      : subscribeError
        ? "webhook_pending"
        : "ready";

  const channelId = await upsertMetaChannel({
    tenantId: input.tenantId,
    userId: input.userId,
    channelType: input.channelType,
    page: input.page,
    adAccount: input.adAccount,
    token: input.token,
    scope: input.scope,
    connectionStatus,
    errorMessage: subscribeError,
  });

  await adminDb.collection("audit_logs").add({
    type: "tenant_integration_connected",
    provider: "meta",
    tenantId: input.tenantId,
    channelId,
    channelType: input.channelType,
    actorId: input.userId,
    actorName: "OAuth callback",
    warning: subscribeError || "",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { channelId, connectionStatus, warning: subscribeError };
}

function parseCustomerIdFromResource(value: unknown) {
  const normalized = clean(value, 200);
  const match = normalized.match(/customers\/(\d+)/i);
  return match?.[1] || "";
}

type GoogleTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function finalizeGoogleConnection(input: {
  tenantId: string;
  userId: string;
  tokenPayload: GoogleTokenPayload;
  customerId: string;
  customerResourceName?: string;
  channelName?: string;
}) {
  const customerId = clean(input.customerId, 120).replace(/[^\d]/g, "");
  if (!customerId) {
    throw new Error("customer_id_invalido");
  }

  const existing = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", input.tenantId)
    .where("type", "==", "google_ads")
    .limit(1)
    .get();
  const ref = existing.empty ? adminDb.collection("tenant_channels").doc() : existing.docs[0].ref;
  const existingData = existing.empty ? null : (existing.docs[0].data() as Record<string, unknown>);
  const previousRefreshToken = existingData ? clean(decryptSecret(existingData.refreshToken), 5000) : "";
  const refreshToken = clean(input.tokenPayload.refresh_token, 5000) || previousRefreshToken;

  const metadata: Record<string, string> = {
    oauthManaged: "true",
    oauthProvider: "google",
    oauthScope: clean(input.tokenPayload.scope, 1200),
    oauthGrantedAt: new Date().toISOString(),
    tokenType: clean(input.tokenPayload.token_type, 40) || "Bearer",
    loginCustomerId: customerId,
    customerResource: clean(input.customerResourceName, 220),
  };
  if (input.tokenPayload.expires_in && Number(input.tokenPayload.expires_in) > 0) {
    metadata.expiresAt = new Date(Date.now() + Number(input.tokenPayload.expires_in) * 1000).toISOString();
  }

  await ref.set(
    {
      tenantId: input.tenantId,
      type: "google_ads",
      provider: "google_ads",
      displayName: clean(input.channelName, 160) || "Google Ads",
      status: "active",
      connectionStatus: normalizeConnectionStatus("connected", "connected"),
      externalAccountId: customerId,
      pageId: customerId,
      accessToken: encryptSecret(clean(input.tokenPayload.access_token, 5000)),
      refreshToken: encryptSecret(refreshToken),
      metadata,
      lastError: "",
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.userId,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  let syncWarning = "";
  try {
    const syncResult = await runTenantCampaignSync({
      tenantId: input.tenantId,
      days: 1,
      onlyChannelIds: [ref.id],
      source: "oauth_google_callback",
      runId: `oauth_google_${Date.now()}`,
    });
    if (syncResult.failed > 0) {
      syncWarning = `sync_inicial_com_${syncResult.failed}_falha(s)`;
      await ref.set(
        {
          connectionStatus: "degraded",
          lastError: `Sync inicial com falhas (${syncResult.failed}).`,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          connectionStatus: "ready",
          lastError: "",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    syncWarning = error instanceof Error ? clean(error.message, 220) : "falha_sync_inicial";
    await ref.set(
      {
        connectionStatus: "degraded",
        lastError: syncWarning,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  await adminDb.collection("audit_logs").add({
    type: "tenant_integration_connected",
    provider: "google",
    tenantId: input.tenantId,
    channelId: ref.id,
    channelType: "google_ads",
    actorId: input.userId,
    actorName: "OAuth callback",
    warning: syncWarning || "",
    createdAt: FieldValue.serverTimestamp(),
  });

  return { channelId: ref.id, status: syncWarning ? "degraded" : "ready", warning: syncWarning };
}

export function mapGoogleCustomers(resources: string[]) {
  return resources
    .map((resource) => {
      const customerId = parseCustomerIdFromResource(resource);
      if (!customerId) return null;
      return {
        customerId,
        label: `Google Ads ${customerId}`,
        resourceName: resource,
      };
    })
    .filter((item): item is { customerId: string; label: string; resourceName: string } => Boolean(item));
}
