import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { upsertCampaignSnapshot } from "@/app/lib/server/campaign-sync";
import { fetchGoogleAdsDailyMetrics } from "@/app/lib/server/google-ads";

type Body = {
  days?: number;
};

type SyncResult = {
  channelId: string;
  type: string;
  dateRef?: string;
  ok: boolean;
  error?: string;
};

type TenantChannelItem = {
  id: string;
  status?: string;
  type?: string;
  metadata?: unknown;
  externalAccountId?: unknown;
  accessToken?: unknown;
  refreshToken?: unknown;
  pageId?: unknown;
};

const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInt(value: unknown) {
  return Math.max(0, Math.round(toNumber(value)));
}

function normalizeMetaAccountId(externalId: string) {
  const cleaned = externalId.trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("act_")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `act_${cleaned}`;
  return cleaned;
}

function sumLeadActions(actions: unknown) {
  if (!Array.isArray(actions)) return 0;
  let total = 0;
  for (const action of actions) {
    const item = action as { action_type?: string; value?: unknown };
    const actionType = String(item.action_type || "").toLowerCase();
    if (
      actionType.includes("lead") ||
      actionType.includes("offsite_conversion.fb_pixel_lead") ||
      actionType.includes("onsite_conversion.lead_grouped")
    ) {
      total += toNumber(item.value);
    }
  }
  return Math.max(0, Math.round(total));
}

function buildDateRefs(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1;
    const date = new Date(Date.now() - offset * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

async function syncMetaChannel(input: {
  tenantId: string;
  channelId: string;
  externalAccountId: string;
  accessToken: string;
  dateRef: string;
}) {
  const externalId = normalizeMetaAccountId(input.externalAccountId);
  if (!externalId || !input.accessToken) {
    throw new Error("Canal Meta Ads sem ad account ID ou access token.");
  }

  const fields = ["impressions", "clicks", "spend", "actions"].join(",");
  const timeRange = encodeURIComponent(JSON.stringify({ since: input.dateRef, until: input.dateRef }));
  const url =
    `https://graph.facebook.com/${VERSION}/${externalId}/insights` +
    `?fields=${fields}` +
    `&level=account` +
    `&time_range=${timeRange}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });

  const payload = (await response.json()) as {
    data?: Array<{
      impressions?: unknown;
      clicks?: unknown;
      spend?: unknown;
      actions?: unknown;
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message || "Falha ao sincronizar Meta Ads.");
  }

  const row = payload.data?.[0];
  const impressions = toInt(row?.impressions);
  const clicks = toInt(row?.clicks);
  const spend = Number(toNumber(row?.spend).toFixed(2));
  const leads = sumLeadActions(row?.actions);
  await upsertCampaignSnapshot({
    tenantId: input.tenantId,
    clientId: input.tenantId,
    adAccountId: input.channelId,
    channelId: input.channelId,
    platform: "meta_ads",
    dateRef: input.dateRef,
    impressions,
    clicks,
    spend,
    leads,
    source: "api",
  });
}

async function syncGoogleChannel(input: {
  tenantId: string;
  channelId: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string;
  loginCustomerId: string;
  dateRef: string;
}) {
  const metrics = await fetchGoogleAdsDailyMetrics({
    customerId: input.externalAccountId,
    dateRef: input.dateRef,
    refreshToken: input.refreshToken,
    accessToken: input.accessToken,
    loginCustomerId: input.loginCustomerId,
  });

  await upsertCampaignSnapshot({
    tenantId: input.tenantId,
    clientId: input.tenantId,
    adAccountId: input.channelId,
    channelId: input.channelId,
    platform: "google_ads",
    dateRef: input.dateRef,
    impressions: metrics.impressions,
    clicks: metrics.clicks,
    spend: metrics.spend,
    leads: metrics.leads,
    source: "api",
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    if (!hasTenantCapability(membership, "manage_channels") && !hasTenantCapability(membership, "view_metrics")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para sincronizar campanhas.");
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const days = [1, 7, 30].includes(Number(body.days)) ? Number(body.days) : 7;

    const channelsSnap = await adminDb
      .collection("tenant_channels")
      .where("tenantId", "==", tenantId)
      .limit(20)
      .get();

    const channels = channelsSnap.docs
      .map(
        (doc): TenantChannelItem => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })
      )
      .filter((channel) => String(channel.status || "").toLowerCase() === "active")
      .filter((channel) => ["meta_ads", "google_ads"].includes(String(channel.type || "").toLowerCase()));

    const results: SyncResult[] = [];
    const dateRefs = buildDateRefs(days);

    for (const channel of channels) {
      const type = clean(channel.type, 40).toLowerCase();

      if (type === "google_ads") {
        const metadata =
          channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
            ? (channel.metadata as Record<string, unknown>)
            : {};

        for (const dateRef of dateRefs) {
          try {
            await syncGoogleChannel({
              tenantId,
              channelId: channel.id,
              externalAccountId: clean(channel.externalAccountId, 180),
              accessToken: clean(channel.accessToken, 4000),
              refreshToken: clean(channel.refreshToken, 4000),
              loginCustomerId: clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180),
              dateRef,
            });

            await adminDb.collection("tenant_channels").doc(channel.id).set(
              {
                status: "active",
                lastError: "",
                lastSyncAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );

            results.push({
              channelId: channel.id,
              type,
              dateRef,
              ok: true,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Falha no sync.";
            await adminDb.collection("tenant_channels").doc(channel.id).set(
              {
                status: "error",
                lastError: message,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            );
            results.push({
              channelId: channel.id,
              type,
              dateRef,
              ok: false,
              error: message,
            });
          }
        }
        continue;
      }

      for (const dateRef of dateRefs) {
        try {
          await syncMetaChannel({
            tenantId,
            channelId: channel.id,
            externalAccountId: clean(channel.externalAccountId, 180),
            accessToken: clean(channel.accessToken, 4000),
            dateRef,
          });

          await adminDb.collection("tenant_channels").doc(channel.id).set(
            {
              lastSyncAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );

          results.push({
            channelId: channel.id,
            type,
            dateRef,
            ok: true,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Falha no sync.";
          await adminDb.collection("tenant_channels").doc(channel.id).set(
            {
              status: "error",
              lastError: message,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          results.push({
            channelId: channel.id,
            type,
            dateRef,
            ok: false,
            error: message,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      synced: results.filter((item) => item.ok).length,
      failed: results.filter((item) => !item.ok).length,
      results,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro ao sincronizar campanhas do tenant:", error);
    return NextResponse.json({ error: "Falha ao sincronizar campanhas." }, { status: 500 });
  }
}
