import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";

type SnapshotRow = {
  id: string;
  tenantId?: unknown;
  channelId?: unknown;
  adAccountId?: unknown;
  platform?: unknown;
  accountLabel?: unknown;
  dateRef?: unknown;
  campaignId?: unknown;
  campaignName?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  spend?: unknown;
  leads?: unknown;
};

type CampaignGroup = {
  key: string;
  campaignId: string;
  name: string;
  platform: string;
  channelId: string;
  accountLabel: string;
  latestDateRef: string;
  last7: { impressions: number; clicks: number; spend: number; leads: number };
  last30: { impressions: number; clicks: number; spend: number; leads: number };
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateFromRef(value: unknown) {
  const raw = clean(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function emptyMetrics() {
  return { impressions: 0, clicks: 0, spend: 0, leads: 0 };
}

function addMetrics(target: ReturnType<typeof emptyMetrics>, row: SnapshotRow) {
  target.impressions += toNumber(row.impressions);
  target.clicks += toNumber(row.clicks);
  target.spend += toNumber(row.spend);
  target.leads += toNumber(row.leads);
}

function statusFor(group: CampaignGroup) {
  const hasLast7Signal = group.last7.spend > 0 || group.last7.clicks > 0 || group.last7.leads > 0;
  const hasLast30Signal = group.last30.spend > 0 || group.last30.clicks > 0 || group.last30.leads > 0;
  if (hasLast7Signal) return "active";
  if (hasLast30Signal) return "idle";
  return "stale";
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    if (!hasTenantCapability(membership, "view_metrics") && !hasTenantCapability(membership, "manage_channels")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para ver campanhas.");
    }

    const range30Start = daysAgo(30);
    const range7Start = daysAgo(7);

    const [snapshotsSnap, channelsSnap] = await Promise.all([
      adminDb.collection("campaign_snapshots").where("tenantId", "==", tenantId).limit(2000).get(),
      adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(60).get(),
    ]);

    const channels = new Map(
      channelsSnap.docs.map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        return [
          doc.id,
          {
            displayName: clean(data.displayName, 140),
            type: clean(data.type, 40),
            status: clean(data.status, 40),
            lastSyncAt: data.lastSyncAt,
            lastError: clean(data.lastError, 500),
          },
        ] as const;
      })
    );

    const groups = new Map<string, CampaignGroup>();

    for (const doc of snapshotsSnap.docs) {
      const row = { id: doc.id, ...(doc.data() as Record<string, unknown>) } as SnapshotRow;
      const date = dateFromRef(row.dateRef);
      if (!date || date < range30Start) continue;

      const platform = clean(row.platform, 60) || "midia_paga";
      const channelId = clean(row.channelId || row.adAccountId, 180);
      const campaignId = clean(row.campaignId, 180);
      const campaignName = clean(row.campaignName, 180);
      const accountLabel = clean(row.accountLabel, 180) || channels.get(channelId)?.displayName || platform;
      const key = campaignId ? `${platform}:${campaignId}` : `${platform}:${channelId || accountLabel}:account`;
      const current =
        groups.get(key) ||
        ({
          key,
          campaignId,
          name: campaignName || accountLabel || (platform === "google_ads" ? "Google Ads" : "Meta Ads"),
          platform,
          channelId,
          accountLabel,
          latestDateRef: "",
          last7: emptyMetrics(),
          last30: emptyMetrics(),
        } satisfies CampaignGroup);

      if (campaignName) current.name = campaignName;
      if (campaignId) current.campaignId = campaignId;
      if (channelId) current.channelId = channelId;
      current.accountLabel = accountLabel || current.accountLabel;
      if (!current.latestDateRef || clean(row.dateRef, 10) > current.latestDateRef) {
        current.latestDateRef = clean(row.dateRef, 10);
      }

      addMetrics(current.last30, row);
      if (date >= range7Start) addMetrics(current.last7, row);
      groups.set(key, current);
    }

    const items = Array.from(groups.values())
      .map((group) => {
        const status = statusFor(group);
        return {
          ...group,
          status,
          cpl30: group.last30.leads > 0 ? group.last30.spend / group.last30.leads : 0,
          cpc30: group.last30.clicks > 0 ? group.last30.spend / group.last30.clicks : 0,
          channel: channels.get(group.channelId) || null,
        };
      })
      .sort((a, b) => {
        const statusWeight = { active: 0, idle: 1, stale: 2 } as Record<string, number>;
        const byStatus = statusWeight[a.status] - statusWeight[b.status];
        if (byStatus !== 0) return byStatus;
        return b.last30.spend - a.last30.spend;
      })
      .slice(0, 80);

    return NextResponse.json({
      tenantId,
      checkedAt: new Date().toISOString(),
      summary: {
        total: items.length,
        active: items.filter((item) => item.status === "active").length,
        idle: items.filter((item) => item.status === "idle").length,
        stale: items.filter((item) => item.status === "stale").length,
        spend30: items.reduce((sum, item) => sum + item.last30.spend, 0),
        leads30: items.reduce((sum, item) => sum + item.last30.leads, 0),
      },
      items,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao montar visao de campanhas do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar campanhas." }, { status: 500 });
  }
}
