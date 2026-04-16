import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { isGoogleAdsServerConfigured } from "@/app/lib/server/google-ads";
import { encryptSecret, hasStoredSecret, maskStoredSecret } from "@/app/lib/server/secret-crypto";
import { normalizeConnectionStatus } from "@/app/lib/server/integration-oauth";

type ChannelBody = {
  channelId?: string;
  type?: string;
  provider?: string;
  displayName?: string;
  status?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  username?: string;
  pageId?: string;
  externalAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  connectionStatus?: string;
  metadata?: Record<string, unknown>;
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

function cleanConnectionStatus(value: unknown) {
  return normalizeConnectionStatus(value, "draft");
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
}) {
  const normalizedType = clean(input.type, 60).toLowerCase();
  const isActive = clean(input.status, 40).toLowerCase() === "active";
  const hasMetaMapping = Boolean(input.externalAccountId || input.pageId);

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
    readiness.inboundReady = isActive && Boolean(input.phoneNumberId) && input.hasVerifyToken && input.hasAppSecret;
    readiness.outboundReady = isActive && Boolean(input.phoneNumberId) && input.hasAccessToken;
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
      const status = clean(data.status, 40).toLowerCase();
      const activityAt =
        toIso(data.lastMessageTime) ||
        toIso(data.lastClientMessageAt) ||
        toIso(data.lastAgentMessageAt) ||
        toIso(data.updatedAt);

      const current = acc[type] || {
        chatCount: 0,
        openChatCount: 0,
        lastActivityAt: null,
      };

      const nextLastActivityAt =
        activityAt && (!current.lastActivityAt || activityAt > current.lastActivityAt)
          ? activityAt
          : current.lastActivityAt;

      acc[type] = {
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

    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const type = String(data.type || "");
        const metadata = cleanMetadata(data.metadata);
        const stats = channelStats[type] || {
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
        const pageId = String(data.pageId || "");
        const externalAccountId = String(data.externalAccountId || "");
        const hasAccessToken = hasStoredSecret(data.accessToken);
        const hasRefreshToken = hasStoredSecret(data.refreshToken);
        const hasVerifyToken = Boolean(
          clean(data.verifyToken, 400) || clean(metadata.verifyToken, 400) || clean(metadata.webhookVerifyToken, 400)
        );
        const hasAppSecret = hasStoredSecret(data.appSecret) || Boolean(clean(metadata.appSecret, 400));
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
        });
        return {
          id: doc.id,
          tenantId: String(data.tenantId || tenantId),
          type,
          provider: String(data.provider || ""),
          displayName: String(data.displayName || data.type || "Canal"),
          status,
          connectionStatus: cleanConnectionStatus(data.connectionStatus),
          phoneNumber: String(data.phoneNumber || ""),
          phoneNumberId,
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
          inboundReady: readiness.inboundReady,
          outboundReady: readiness.outboundReady,
          routingReady: readiness.routingReady,
          syncReady: readiness.syncReady,
          requiresWebhook: readiness.requiresWebhook,
          requiresExternalMapping: readiness.requiresExternalMapping,
          metadata: cleanPublicMetadata(data.metadata),
        };
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));

    return NextResponse.json({ ok: true, tenantId, items });
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

    if (!channelRef) {
      const sameTypeSnap = await adminDb
        .collection("tenant_channels")
        .where("tenantId", "==", tenantId)
        .where("type", "==", type)
        .limit(1)
        .get();

      channelRef = sameTypeSnap.empty ? adminDb.collection("tenant_channels").doc() : sameTypeSnap.docs[0].ref;
    }

    const metadata = cleanMetadata(body.metadata);
    const verifyToken =
      clean(metadata.verifyToken, 400) || clean(metadata.webhookVerifyToken, 400);
    const appSecret = clean(metadata.appSecret, 400);

    const payload = {
      tenantId,
      type,
      provider: clean(body.provider, 80) || type,
      displayName: clean(body.displayName, 120) || type,
      status: cleanStatus(body.status),
      connectionStatus: cleanConnectionStatus(body.connectionStatus),
      phoneNumber: clean(body.phoneNumber, 80),
      phoneNumberId: clean(body.phoneNumberId, 160),
      username: clean(body.username, 160),
      pageId: clean(body.pageId, 160),
      externalAccountId: clean(body.externalAccountId, 200),
      accessToken: encryptSecret(clean(body.accessToken, 4000)),
      refreshToken: encryptSecret(clean(body.refreshToken, 4000)),
      verifyToken: verifyToken || null,
      appSecret: appSecret ? encryptSecret(appSecret) : null,
      metadata: removeSecretMetadata(metadata),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
      updatedByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
    };

    await Promise.all([
      channelRef.set(payload, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "tenant_channel_upsert",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        channelId: channelRef.id,
        channelType: type,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, channelId: channelRef.id, type });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao salvar canal do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar canal." }, { status: 500 });
  }
}
