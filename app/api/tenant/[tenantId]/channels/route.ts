import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { isGoogleAdsServerConfigured } from "@/app/lib/server/google-ads";
import { encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";
import { getMetaEnv, normalizeConnectionStatus } from "@/app/lib/server/integration-oauth";
import {
  AGENCY_WHATSAPP_ENV_CHANNEL_ID,
  getAgencyWhatsAppChannelFromEnv,
} from "@/app/lib/server/whatsapp-channel";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { countTenantWhatsAppChannels } from "@/lib/server/tenant-usage";
import { hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { getManagedEvolutionConfig } from "@/lib/server/messaging/evolution-config";

type ChannelBody = {
  channelId?: string;
  type?: string;
  provider?: string;
  displayName?: string;
  status?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  wabaId?: string;
  username?: string;
  pageId?: string;
  externalAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  connectionStatus?: string;
  metadata?: Record<string, unknown>;
  channelScope?: string;
  ownerUserId?: string;
  distributionEnabled?: boolean;
};

type ChannelReadiness = {
  inboundReady: boolean;
  outboundReady: boolean;
  routingReady: boolean;
  syncReady: boolean;
  requiresWebhook: boolean;
  requiresExternalMapping: boolean;
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanType(value: unknown) {
  const normalized = clean(value, 60).toLowerCase();
  if (
    normalized === "whatsapp" ||
    normalized === "instagram" ||
    normalized === "messenger" ||
    normalized === "meta_ads" ||
    normalized === "google_ads"
  ) {
    return normalized;
  }
  return "";
}

function cleanStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "active" || normalized === "inactive" || normalized === "draft" || normalized === "error") {
    return normalized;
  }
  return "draft";
}

function cleanChannelScope(value: unknown) {
  return clean(value, 20).toLowerCase() === "personal" ? "personal" : "shared";
}

function cleanConnectionStatus(value: unknown) {
  return normalizeConnectionStatus(value, "draft");
}

function hasConnectionStatusInput(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function cleanMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = clean(key, 80);
    const normalizedValue = clean(value, 400);
    if (!normalizedKey || !normalizedValue) return acc;
    acc[normalizedKey] = normalizedValue;
    return acc;
  }, {});
}

function normalizeWhatsAppProvider(value: unknown) {
  const normalized = clean(value, 80).toLowerCase();
  if (normalized === "evolution" || normalized === "evolution_api") return "evolution";
  if (
    normalized === "meta_whatsapp" ||
    normalized === "whatsapp_cloud_api" ||
    normalized === "whatsapp_business_cloud_api"
  ) {
    return "meta_whatsapp";
  }
  if (
    normalized === "whatsapp_qr" ||
    normalized === "whatsapp_session" ||
    normalized === "whatsapp_gateway" ||
    normalized === "external_whatsapp"
  ) {
    return normalized;
  }
  return normalized || "meta_whatsapp";
}

function cleanPublicMetadata(input: unknown) {
  const metadata = cleanMetadata(input);
  return Object.entries(metadata).reduce<Record<string, string>>((acc, [key, value]) => {
    const normalizedKey = clean(key, 80).toLowerCase();
    if (["verifytoken", "webhookverifytoken", "appsecret", "accesstoken", "refreshtoken"].includes(normalizedKey)) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
}

function removeSecretMetadata(input: Record<string, string>) {
  const secretKeys = new Set(["verifytoken", "webhookverifytoken", "appsecret", "accesstoken", "refreshtoken"]);
  return Object.entries(input).reduce<Record<string, string>>((acc, [key, value]) => {
    if (secretKeys.has(clean(key, 80).toLowerCase())) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function cleanOrExisting(value: unknown, existing: unknown, max = 200) {
  const cleaned = clean(value, max);
  return cleaned || clean(existing, max);
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  if (typeof value === "number") return new Date(value).toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function buildChannelReadiness(input: {
  type: string;
  status: string;
  phoneNumberId: string;
  pageId: string;
  externalAccountId: string;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  serverReady: boolean;
  provider?: string;
  metadata?: Record<string, string>;
}) {
  const normalizedType = clean(input.type, 60).toLowerCase();
  const isActive = clean(input.status, 40).toLowerCase() === "active";
  const hasMetaMapping = Boolean(input.externalAccountId || input.pageId);
  const provider = normalizeWhatsAppProvider(input.provider);
  const gatewayEndpoint =
    clean(input.metadata?.gatewayEndpoint, 500) ||
    clean(input.metadata?.endpointUrl, 500) ||
    clean(input.metadata?.apiBaseUrl, 500) ||
    clean(input.metadata?.webhookUrl, 500);

  const readiness: ChannelReadiness = {
    inboundReady: false,
    outboundReady: false,
    routingReady: false,
    syncReady: false,
    requiresWebhook: false,
    requiresExternalMapping: false,
  };

  if (normalizedType === "whatsapp") {
    readiness.requiresWebhook = true;
    if (provider === "meta_whatsapp") {
      readiness.inboundReady = isActive && Boolean(input.phoneNumberId) && input.hasVerifyToken && input.hasAppSecret;
      readiness.outboundReady = isActive && Boolean(input.phoneNumberId) && input.hasAccessToken;
      readiness.routingReady = readiness.inboundReady && readiness.outboundReady;
      return readiness;
    }
    readiness.inboundReady = isActive && Boolean(gatewayEndpoint);
    readiness.outboundReady = isActive && Boolean(gatewayEndpoint) && input.hasAccessToken;
    readiness.routingReady = readiness.inboundReady && readiness.outboundReady;
    return readiness;
  }

  if (normalizedType === "instagram" || normalizedType === "messenger") {
    readiness.requiresWebhook = true;
    readiness.requiresExternalMapping = true;
    readiness.inboundReady = isActive && input.hasVerifyToken && input.hasAppSecret && hasMetaMapping;
    readiness.outboundReady = isActive && input.hasAccessToken && hasMetaMapping;
    readiness.routingReady = readiness.inboundReady && readiness.outboundReady;
    return readiness;
  }

  if (normalizedType === "meta_ads") {
    readiness.requiresWebhook = true;
    readiness.requiresExternalMapping = true;
    readiness.inboundReady = isActive && input.hasAccessToken && hasMetaMapping && input.hasVerifyToken && input.hasAppSecret;
    readiness.syncReady = isActive && input.hasAccessToken && Boolean(input.externalAccountId);
    readiness.routingReady = readiness.inboundReady;
    return readiness;
  }

  if (normalizedType === "google_ads") {
    readiness.requiresExternalMapping = true;
    readiness.syncReady =
      isActive &&
      input.serverReady &&
      Boolean(input.externalAccountId) &&
      (input.hasRefreshToken || input.hasAccessToken);
    return readiness;
  }

  return readiness;
}

function isOAuthManaged(metadata: Record<string, string>) {
  return clean(metadata.oauthManaged, 20).toLowerCase() === "true";
}

function resolveEffectiveConnectionStatus(input: {
  type: string;
  status: string;
  storedConnectionStatus: string;
  readiness: ChannelReadiness;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasMapping: boolean;
  hasLastError: boolean;
}) {
  const stored = cleanConnectionStatus(input.storedConnectionStatus);
  const type = clean(input.type, 60).toLowerCase();
  const isActive = clean(input.status, 40).toLowerCase() === "active";

  if (stored !== "draft") return stored;
  if (!isActive) return stored;

  if (type === "instagram" || type === "messenger") {
    if (input.hasLastError) return "webhook_pending";
    if (input.readiness.routingReady) return "ready";
    if (input.hasAccessToken && input.hasMapping) return "webhook_pending";
  }

  if (type === "meta_ads") {
    if (input.readiness.inboundReady && input.readiness.syncReady) return "ready";
    if (input.readiness.syncReady || (input.hasAccessToken && input.hasMapping)) return "connected";
  }

  if (type === "google_ads") {
    if (input.readiness.syncReady) return "ready";
    if ((input.hasRefreshToken || input.hasAccessToken) && input.hasMapping) return "connected";
  }

  if (type === "whatsapp") {
    if (input.readiness.routingReady) return "ready";
    if (input.readiness.outboundReady) return "webhook_pending";
  }

  return stored;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const [snap, chatsSnap, campaignSnapshotsSnap] = await Promise.all([
      adminDb
        .collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .limit(50)
        .get(),
      adminDb
        .collection("chats")
        .where("tenantId", "==", tenantId)
        .limit(800)
        .get(),
      adminDb
        .collection("campaign_snapshots")
        .where("tenantId", "==", tenantId)
        .limit(1800)
        .get(),
    ]);

    const channelStats = chatsSnap.docs.reduce<
      Record<string, { chatCount: number; openChatCount: number; lastActivityAt: string | null }>
    >((acc, doc) => {
      const data = doc.data() as Record<string, unknown>;
      const type = clean(data.channel, 60).toLowerCase() || "whatsapp";
      const channelKey = clean(data.channelId, 180) || type;
      const status = clean(data.status, 40).toLowerCase();
      const activityAt =
        toIso(data.lastMessageTime) ||
        toIso(data.lastClientMessageAt) ||
        toIso(data.lastAgentMessageAt) ||
        toIso(data.updatedAt);

      const current = acc[channelKey] || {
        chatCount: 0,
        openChatCount: 0,
        lastActivityAt: null,
      };

      const nextLastActivityAt =
        activityAt && (!current.lastActivityAt || activityAt > current.lastActivityAt)
          ? activityAt
          : current.lastActivityAt;

      acc[channelKey] = {
        chatCount: current.chatCount + 1,
        openChatCount:
          current.openChatCount + (status !== "resolved" && status !== "archived" ? 1 : 0),
        lastActivityAt: nextLastActivityAt,
      };

      return acc;
    }, {});

    const campaignStatsByChannel = campaignSnapshotsSnap.docs.reduce<
      Record<string, { snapshotCount: number; lastDateRef: string | null }>
    >((acc, doc) => {
      const data = doc.data() as Record<string, unknown>;
      const channelId = clean(data.channelId, 180);
      if (!channelId) return acc;
      const dateRef = clean(data.dateRef, 40) || null;
      const current = acc[channelId] || { snapshotCount: 0, lastDateRef: null };
      acc[channelId] = {
        snapshotCount: current.snapshotCount + 1,
        lastDateRef: dateRef && (!current.lastDateRef || dateRef > current.lastDateRef) ? dateRef : current.lastDateRef,
      };
      return acc;
    }, {});

    const metaEnv = getMetaEnv();
    const metaPlatformWebhookReady = Boolean(metaEnv.verifyToken && metaEnv.appSecret);

    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const type = String(data.type || "");
        const metadata = cleanMetadata(data.metadata);
        const stats = channelStats[doc.id] || channelStats[type] || {
          chatCount: 0,
          openChatCount: 0,
          lastActivityAt: null,
        };
        const campaignStats = campaignStatsByChannel[doc.id] || {
          snapshotCount: 0,
          lastDateRef: null,
        };
        const status = String(data.status || "draft");
        const phoneNumberId = String(data.phoneNumberId || "");
        const wabaId = clean(data.wabaId, 180) || clean(metadata.wabaId, 180) || clean(metadata.whatsappBusinessAccountId, 180);
        const pageId = String(data.pageId || "");
        const externalAccountId = String(data.externalAccountId || "");
        const hasAccessToken = hasStoredSecret(data.accessToken);
        const hasRefreshToken = hasStoredSecret(data.refreshToken);
        const usesGlobalMetaWebhook =
          isOAuthManaged(metadata) &&
          (type === "instagram" || type === "messenger" || type === "meta_ads") &&
          metaPlatformWebhookReady;
        const hasVerifyToken = Boolean(
          clean(data.verifyToken, 400) || clean(metadata.verifyToken, 400) || clean(metadata.webhookVerifyToken, 400)
        ) || usesGlobalMetaWebhook;
        const hasAppSecret =
          hasStoredSecret(data.appSecret) || Boolean(clean(metadata.appSecret, 400)) || usesGlobalMetaWebhook;
        const serverReady = type !== "google_ads" ? true : isGoogleAdsServerConfigured();
        const readiness = buildChannelReadiness({
          type,
          status,
          phoneNumberId,
          pageId,
          externalAccountId,
          hasAccessToken,
          hasRefreshToken,
          hasVerifyToken,
          hasAppSecret,
          serverReady,
          provider: String(data.provider || ""),
          metadata,
        });
        const storedConnectionStatus = cleanConnectionStatus(data.connectionStatus);
        const effectiveConnectionStatus = resolveEffectiveConnectionStatus({
          type,
          status,
          storedConnectionStatus,
          readiness,
          hasAccessToken,
          hasRefreshToken,
          hasMapping: Boolean(externalAccountId || pageId),
          hasLastError: Boolean(clean(data.lastError, 500)),
        });
        const effectiveReadiness =
          (type === "instagram" || type === "messenger") && effectiveConnectionStatus === "webhook_pending"
            ? { ...readiness, inboundReady: false, routingReady: false }
            : readiness;
        return {
          id: doc.id,
          tenantId: String(data.tenantId || tenantId),
          type,
          provider: String(data.provider || ""),
          displayName: String(data.displayName || data.type || "Canal"),
          status,
          connectionStatus: effectiveConnectionStatus,
          phoneNumber: String(data.phoneNumber || ""),
          phoneNumberId,
          wabaId,
          username: String(data.username || ""),
          pageId,
          externalAccountId,
          hasAccessToken,
          hasRefreshToken,
          hasVerifyToken,
          hasAppSecret,
          accessTokenMasked: maskStoredSecret(data.accessToken),
          refreshTokenMasked: maskStoredSecret(data.refreshToken),
          verifyTokenMasked: maskStoredSecret(clean(data.verifyToken, 400) || clean(metadata.verifyToken, 400) || clean(metadata.webhookVerifyToken, 400)),
          appSecretMasked: maskStoredSecret(data.appSecret || clean(metadata.appSecret, 400)),
          lastSyncAt: toIso(data.lastSyncAt),
          updatedAt: toIso(data.updatedAt),
          lastError: clean(data.lastError, 500),
          chatCount: stats.chatCount,
          openChatCount: stats.openChatCount,
          lastActivityAt: stats.lastActivityAt,
          campaignSnapshotCount: campaignStats.snapshotCount,
          lastCampaignDateRef: campaignStats.lastDateRef,
          serverReady,
          inboundReady: effectiveReadiness.inboundReady,
          outboundReady: effectiveReadiness.outboundReady,
          routingReady: effectiveReadiness.routingReady,
          syncReady: effectiveReadiness.syncReady,
          requiresWebhook: effectiveReadiness.requiresWebhook,
          requiresExternalMapping: effectiveReadiness.requiresExternalMapping,
          metadata: cleanPublicMetadata(data.metadata),
          channelScope: cleanChannelScope(data.channelScope),
          ownerUserId: clean(data.ownerUserId, 140),
          ownerUserName: clean(data.ownerUserName, 140),
          distributionEnabled:
            cleanChannelScope(data.channelScope) === "shared" && data.distributionEnabled !== false,
        };
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    const hasOutboundWhatsApp = items.some(
      (item) => item.type === "whatsapp" && item.status === "active" && item.outboundReady
    );
    const hasAgencyVirtualChannel = items.some((item) => item.id === AGENCY_WHATSAPP_ENV_CHANNEL_ID);
    const agencyWhatsApp = getAgencyWhatsAppChannelFromEnv();
    const agencyVirtualItem = agencyWhatsApp && !hasAgencyVirtualChannel
      ? {
          id: AGENCY_WHATSAPP_ENV_CHANNEL_ID,
          tenantId,
          type: "whatsapp",
          provider: "meta_whatsapp",
          source: "agency_env",
          displayName: "WhatsApp oficial Altum",
          status: "active",
          connectionStatus: "ready",
          phoneNumber: agencyWhatsApp.phoneNumber || "",
          phoneNumberId: agencyWhatsApp.phoneNumberId,
          wabaId: agencyWhatsApp.wabaId || "",
          username: "",
          pageId: "",
          externalAccountId: "",
          hasAccessToken: true,
          hasRefreshToken: false,
          hasVerifyToken: Boolean(agencyWhatsApp.verifyToken),
          hasAppSecret: Boolean(agencyWhatsApp.appSecret),
          accessTokenMasked: "Configurado",
          refreshTokenMasked: "",
          verifyTokenMasked: agencyWhatsApp.verifyToken ? "Configurado" : "",
          appSecretMasked: agencyWhatsApp.appSecret ? "Configurado" : "",
          lastSyncAt: null,
          updatedAt: null,
          lastError: "",
          chatCount: 0,
          openChatCount: 0,
          lastActivityAt: null,
          campaignSnapshotCount: 0,
          lastCampaignDateRef: null,
          serverReady: true,
          inboundReady: Boolean(agencyWhatsApp.verifyToken && agencyWhatsApp.appSecret),
          outboundReady: true,
          routingReady: Boolean(agencyWhatsApp.verifyToken && agencyWhatsApp.appSecret),
          syncReady: false,
          requiresWebhook: true,
          requiresExternalMapping: false,
          metadata: { source: "agency_env" },
          channelScope: "shared",
          ownerUserId: "",
          ownerUserName: "",
          distributionEnabled: true,
        }
      : null;
    const allItems = agencyVirtualItem && !hasOutboundWhatsApp ? [agencyVirtualItem, ...items] : items;
    const visibleItems = hasTeamWideCommercialAccess(membership)
      ? allItems
      : allItems.filter(
          (item) => item.type !== "whatsapp" || item.channelScope === "shared" || item.ownerUserId === user.uid
        );

    return NextResponse.json({
      ok: true,
      tenantId,
      items: visibleItems,
      managedProviders: { evolution: Boolean(getManagedEvolutionConfig()) },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao listar canais do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar canais." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const body = (await req.json()) as ChannelBody;
    const type = cleanType(body.type);

    if (!type) {
      return NextResponse.json({ error: "Tipo de canal invalido." }, { status: 400 });
    }
    if (type === "whatsapp") await assertTenantModule(tenantId, "whatsapp");
    if (type === "instagram") await assertTenantModule(tenantId, "instagram");

    let channelRef = null as FirebaseFirestore.DocumentReference | null;

    const requestedId = clean(body.channelId, 160);
    if (requestedId) {
      const existing = await adminDb.collection("tenant_channels").doc(requestedId).get();
      if (existing.exists) {
        const data = existing.data() as Record<string, unknown>;
        if (String(data.tenantId || "").trim() !== tenantId) {
          return NextResponse.json({ error: "Canal nao pertence a este tenant." }, { status: 403 });
        }
        channelRef = existing.ref;
      }
    }

    if (!channelRef && type === "whatsapp") {
      const phoneNumberId = clean(body.phoneNumberId, 160);
      if (phoneNumberId) {
        const sameNumberSnap = await adminDb
          .collection("tenant_channels")
          .where("tenantId", "==", tenantId)
          .where("type", "==", type)
          .where("phoneNumberId", "==", phoneNumberId)
          .limit(1)
          .get();
        if (!sameNumberSnap.empty) channelRef = sameNumberSnap.docs[0].ref;
      }
    }

    if (!channelRef && type !== "whatsapp") {
      const sameTypeSnap = await adminDb
        .collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .where("type", "==", type)
        .limit(1)
        .get();

      channelRef = sameTypeSnap.empty ? adminDb.collection("tenant_channels").doc() : sameTypeSnap.docs[0].ref;
    }

    if (!channelRef) {
      channelRef = adminDb.collection("tenant_channels").doc();
    }

    const currentChannelSnap = await channelRef.get();
    const currentChannelData = currentChannelSnap.exists
      ? (currentChannelSnap.data() as Record<string, unknown>)
      : {};
    if (type === "whatsapp" && !currentChannelSnap.exists) {
      await assertTenantLimitAvailable({
        tenantId,
        limitId: "whatsappChannels",
        currentUsage: await countTenantWhatsAppChannels(tenantId),
        increment: 1,
      });
    }
    const metadata = cleanMetadata(body.metadata);
    const wabaId = clean(body.wabaId, 180) || clean(metadata.wabaId, 180) || clean(metadata.whatsappBusinessAccountId, 180);
    const verifyToken =
      clean(metadata.verifyToken, 400) || clean(metadata.webhookVerifyToken, 400);
    const appSecret = clean(metadata.appSecret, 400);

    const provider = type === "whatsapp" ? normalizeWhatsAppProvider(body.provider) : clean(body.provider, 80) || type;
    const managedEvolution = provider === "evolution" ? getManagedEvolutionConfig() : null;
    if (managedEvolution) {
      metadata.gatewayEndpoint = managedEvolution.baseUrl;
      metadata.evolutionManaged = "true";
    }

    const channelScope = type === "whatsapp" ? cleanChannelScope(body.channelScope) : "shared";
    const ownerUserId = channelScope === "personal" ? clean(body.ownerUserId, 140) : "";
    let ownerUserName = "";
    if (type === "whatsapp" && channelScope === "personal") {
      if (!ownerUserId) {
        return NextResponse.json({ error: "Escolha o vendedor responsavel pelo WhatsApp pessoal." }, { status: 400 });
      }
      const membershipSnap = await adminDb.collection("tenant_users").doc(`${tenantId}_${ownerUserId}`).get();
      if (!membershipSnap.exists || clean(membershipSnap.data()?.status, 20) === "blocked") {
        return NextResponse.json({ error: "Vendedor invalido ou inativo para este canal." }, { status: 400 });
      }
      const ownerData = membershipSnap.data() as Record<string, unknown>;
      const ownerUserSnap = await adminDb.collection("users").doc(ownerUserId).get();
      ownerUserName = clean(ownerUserSnap.data()?.name, 140) || clean(ownerData.name, 140) || clean(ownerData.email, 180) || "Vendedor";
    }

    const accessToken = clean(body.accessToken, 4000) || managedEvolution?.apiKey || "";
    const refreshToken = clean(body.refreshToken, 4000);

    if (type === "whatsapp" && provider === "evolution") {
      const currentMetadata = cleanMetadata(currentChannelData.metadata);
      const gatewayEndpoint = clean(metadata.gatewayEndpoint, 500) || clean(currentMetadata.gatewayEndpoint, 500);
      const hasEffectiveAccessToken = Boolean(accessToken) || hasStoredSecret(currentChannelData.accessToken);
      if (!gatewayEndpoint || !hasEffectiveAccessToken) {
        return NextResponse.json(
          { error: "WhatsApp por QR indisponivel. A configuracao gerenciada da Evolution ainda nao foi concluida." },
          { status: 503 }
        );
      }
    }

    const payload: Record<string, unknown> = {
      tenantId,
      type,
      provider,
      displayName: clean(body.displayName, 120) || type,
      status: cleanStatus(body.status),
      connectionStatus: hasConnectionStatusInput(body.connectionStatus)
        ? cleanConnectionStatus(body.connectionStatus)
        : cleanConnectionStatus(currentChannelData.connectionStatus),
      phoneNumber: cleanOrExisting(body.phoneNumber, currentChannelData.phoneNumber, 80),
      phoneNumberId: cleanOrExisting(body.phoneNumberId, currentChannelData.phoneNumberId, 160),
      wabaId: cleanOrExisting(wabaId, currentChannelData.wabaId, 180),
      username: cleanOrExisting(body.username, currentChannelData.username, 160),
      pageId: cleanOrExisting(body.pageId, currentChannelData.pageId, 160),
      externalAccountId: cleanOrExisting(body.externalAccountId, currentChannelData.externalAccountId, 200),
      metadata: removeSecretMetadata(metadata),
      channelScope,
      ownerUserId: ownerUserId || null,
      ownerUserName: ownerUserName || null,
      distributionEnabled: channelScope === "shared" ? body.distributionEnabled !== false : false,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
    };
    if (verifyToken) payload.verifyToken = verifyToken;
    if (accessToken) payload.accessToken = encryptSecret(accessToken);
    if (refreshToken) payload.refreshToken = encryptSecret(refreshToken);
    if (appSecret) payload.appSecret = encryptSecret(appSecret);

    await Promise.all([
      channelRef.set(payload, { merge: true }),
      ...(type === "whatsapp"
        ? [
            adminDb.collection("tenant_settings").doc(tenantId).set(
              {
                tenantId,
                defaultWhatsAppChannelId: channelRef.id,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            ),
          ]
        : []),
      adminDb.collection("audit_logs").add({
        type: "tenant_channel_upsert",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        channelId: channelRef.id,
        channelType: type,
        channelScope,
        ownerUserId: ownerUserId || null,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, channelId: channelRef.id, type });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === "tenant_limit_exceeded" ? 409 : 403 }
      );
    }

    console.error("Erro ao salvar canal do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar canal." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const body = (await req.json().catch(() => ({}))) as { channelId?: unknown };
    const channelId = clean(body.channelId, 180);
    if (!channelId) {
      return NextResponse.json({ error: "Informe o canal que deseja excluir." }, { status: 400 });
    }
    if (channelId === AGENCY_WHATSAPP_ENV_CHANNEL_ID) {
      return NextResponse.json({ error: "Este numero virtual da Altum nao pode ser excluido pelo cliente." }, { status: 400 });
    }

    const channelRef = adminDb.collection("tenant_channels").doc(channelId);
    const channelSnap = await channelRef.get();
    if (!channelSnap.exists) {
      return NextResponse.json({ error: "Canal nao encontrado." }, { status: 404 });
    }

    const channelData = channelSnap.data() as Record<string, unknown>;
    if (String(channelData.tenantId || "").trim() !== tenantId) {
      return NextResponse.json({ error: "Canal nao pertence a este tenant." }, { status: 403 });
    }

    const channelType = clean(channelData.type, 80) || "canal";
    const settingsRef = adminDb.collection("tenant_settings").doc(tenantId);
    const settingsSnap = await settingsRef.get();
    const currentDefaultId = settingsSnap.exists
      ? clean((settingsSnap.data() as { defaultWhatsAppChannelId?: unknown }).defaultWhatsAppChannelId, 180)
      : "";

    const writes: Promise<unknown>[] = [
      channelRef.delete(),
      adminDb.collection("audit_logs").add({
        type: "tenant_channel_delete",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        channelId,
        channelType,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ];

    if (currentDefaultId === channelId) {
      writes.push(
        settingsRef.set(
          {
            defaultWhatsAppChannelId: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      );
    }

    await Promise.all(writes);

    return NextResponse.json({ ok: true, tenantId, channelId, deleted: true });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao excluir canal do tenant:", error);
    return NextResponse.json({ error: "Falha ao excluir canal." }, { status: 500 });
  }
}
