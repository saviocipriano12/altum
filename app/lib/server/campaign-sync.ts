import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { fetchGoogleAdsDailyMetrics } from "@/app/lib/server/google-ads";

type Platform = "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";

type SyncContext = {
  adAccountId: string;
  clientId: string;
  tenantId?: string;
  platform: Platform;
  externalAccountId?: string;
  accessToken?: string;
  refreshToken?: string;
  loginCustomerId?: string;
  channelId?: string;
  dateRef: string;
};

type SyncOutput = {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  roas: number;
  source: "api" | "manual" | "import" | "webhook";
  campaignId?: string;
  campaignName?: string;
};

export type SyncRunResult = {
  adAccountId: string;
  clientId: string;
  tenantId?: string;
  platform: Platform;
  dateRef: string;
  metrics?: SyncOutput;
  ok: boolean;
  error?: string;
};

type SnapshotInput = {
  snapshotId?: string;
  tenantId?: string;
  clientId?: string;
  adAccountId: string;
  channelId?: string;
  platform?: Platform;
  dateRef: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
  leads?: number;
  roas?: number;
  source?: "api" | "manual" | "import" | "webhook";
  campaignId?: string;
  campaignName?: string;
  updatedBy?: string;
  updatedByName?: string;
  accountLabel?: string;
};

interface CampaignConnector {
  platform: Platform;
  sync(input: SyncContext): Promise<SyncOutput>;
}

function clean(value: unknown, max = 4000) {
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

function normalizeDateRef(value: unknown) {
  const raw = clean(value, 20).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("dateRef invalido. Use YYYY-MM-DD.");
  }
  return raw;
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

function calculateRates(input: { impressions: number; clicks: number; spend: number; leads: number }) {
  const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0;
  const cpc = input.clicks > 0 ? input.spend / input.clicks : 0;
  const cpl = input.leads > 0 ? input.spend / input.leads : 0;
  return {
    ctr: Number(ctr.toFixed(4)),
    cpc: Number(cpc.toFixed(4)),
    cpl: Number(cpl.toFixed(4)),
  };
}

async function resolveTenantIdForClientId(clientId: string) {
  const normalizedClientId = clean(clientId, 140);
  if (!normalizedClientId) return "";

  const directSnap = await adminDb.collection("tenants").doc(normalizedClientId).get();
  if (directSnap.exists) return directSnap.id;

  const [legacySnap, clientSnap] = await Promise.all([
    adminDb.collection("tenants").where("legacyClientId", "==", normalizedClientId).limit(1).get(),
    adminDb.collection("tenants").where("clientId", "==", normalizedClientId).limit(1).get(),
  ]);

  if (!legacySnap.empty) return legacySnap.docs[0].id;
  if (!clientSnap.empty) return clientSnap.docs[0].id;
  return "";
}

function buildSnapshotId(input: {
  tenantId?: string;
  clientId?: string;
  adAccountId: string;
  channelId?: string;
  campaignId?: string;
  dateRef: string;
}) {
  const scope = clean(input.tenantId || input.clientId, 140) || "global";
  const channelOrAccount = clean(input.channelId || input.adAccountId, 180);
  const campaignSuffix = clean(input.campaignId, 180);
  return [scope, channelOrAccount, campaignSuffix, input.dateRef].filter(Boolean).join("_");
}

function buildConsistency(input: {
  tenantId?: string;
  clientId?: string;
  adAccountId: string;
  channelId?: string;
  platform?: Platform;
  dateRef: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  campaignId?: string;
  campaignName?: string;
}) {
  const warnings: string[] = [];
  if (!input.tenantId && !input.clientId) warnings.push("snapshot_sem_escopo");
  if (!input.platform) warnings.push("snapshot_sem_plataforma");
  if (input.clicks > input.impressions && input.impressions > 0) warnings.push("clicks_maiores_que_impressions");
  if (input.leads > input.clicks && input.clicks > 0) warnings.push("leads_maiores_que_clicks");
  if (input.spend > 0 && input.impressions === 0 && input.clicks === 0) warnings.push("gasto_sem_trafego");
  if (input.campaignId && !input.campaignName) warnings.push("campaign_id_sem_nome");

  return {
    valid: warnings.length === 0,
    warnings,
    hasTenantScope: Boolean(input.tenantId),
    hasCampaignScope: Boolean(input.campaignId || input.campaignName),
    hasChannelScope: Boolean(input.channelId),
    metricsCoherent: !warnings.some((item) =>
      ["clicks_maiores_que_impressions", "leads_maiores_que_clicks", "gasto_sem_trafego"].includes(item)
    ),
  };
}

export async function upsertCampaignSnapshot(input: SnapshotInput) {
  const dateRef = normalizeDateRef(input.dateRef);
  const impressions = toInt(input.impressions);
  const clicks = toInt(input.clicks);
  const spend = Math.max(0, Number(toNumber(input.spend).toFixed(2)));
  const leads = Math.max(0, Math.round(toNumber(input.leads)));
  const roas = Number(toNumber(input.roas).toFixed(4));
  const tenantId =
    clean(input.tenantId, 140) || (input.clientId ? await resolveTenantIdForClientId(input.clientId) : "");
  const clientId = clean(input.clientId, 140) || tenantId;
  const platform = input.platform;
  const campaignId = clean(input.campaignId, 180);
  const campaignName = clean(input.campaignName, 180);
  const channelId = clean(input.channelId, 180);
  const consistency = buildConsistency({
    tenantId,
    clientId,
    adAccountId: input.adAccountId,
    channelId,
    platform,
    dateRef,
    impressions,
    clicks,
    spend,
    leads,
    campaignId,
    campaignName,
  });
  const metrics = calculateRates({ impressions, clicks, spend, leads });
  const snapshotId =
    clean(input.snapshotId, 240) ||
    buildSnapshotId({
      tenantId,
      clientId,
      adAccountId: input.adAccountId,
      channelId,
      campaignId,
      dateRef,
    });

  await adminDb.collection("campaign_snapshots").doc(snapshotId).set(
    {
      tenantId: tenantId || null,
      clientId: clientId || null,
      adAccountId: clean(input.adAccountId, 180),
      channelId: channelId || null,
      platform: platform || null,
      accountLabel: clean(input.accountLabel, 180) || null,
      dateRef,
      impressions,
      clicks,
      spend,
      leads,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpl: metrics.cpl,
      roas: Number.isFinite(roas) ? roas : 0,
      campaignId: campaignId || null,
      campaignName: campaignName || null,
      source: input.source || "manual",
      consistency,
      updatedBy: clean(input.updatedBy, 180) || null,
      updatedByName: clean(input.updatedByName, 160) || null,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    snapshotId,
    tenantId,
    clientId,
    consistency,
    metrics: {
      impressions,
      clicks,
      spend,
      leads,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpl: metrics.cpl,
      roas: Number.isFinite(roas) ? roas : 0,
    },
  };
}

class MetaAdsConnector implements CampaignConnector {
  platform: Platform = "meta_ads";

  async sync(input: SyncContext): Promise<SyncOutput> {
    const token = clean(input.accessToken, 4000) ||
      clean(process.env.META_ADS_ACCESS_TOKEN, 4000) ||
      clean(process.env.META_WA_TOKEN, 4000);
    const version = process.env.META_GRAPH_VERSION || "v21.0";
    if (!token) {
      throw new Error("META_ADS_ACCESS_TOKEN nao configurado no servidor.");
    }

    const externalId = normalizeMetaAccountId(input.externalAccountId || "");
    if (!externalId) {
      throw new Error("externalAccountId da conta Meta Ads nao configurado.");
    }

    const fields = ["impressions", "clicks", "spend", "actions"].join(",");
    const timeRange = encodeURIComponent(JSON.stringify({ since: input.dateRef, until: input.dateRef }));
    const url =
      `https://graph.facebook.com/${version}/${externalId}/insights` +
      `?fields=${fields}` +
      `&level=account` +
      `&time_range=${timeRange}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const data = (await response.json()) as {
      data?: Array<{
        impressions?: unknown;
        clicks?: unknown;
        spend?: unknown;
        actions?: unknown;
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(data.error?.message || "Falha ao sincronizar Meta Ads.");
    }

    const row = data.data?.[0];
    if (!row) {
      return {
        impressions: 0,
        clicks: 0,
        spend: 0,
        leads: 0,
        roas: 0,
        source: "api",
      };
    }

    return {
      impressions: toInt(row.impressions),
      clicks: toInt(row.clicks),
      spend: Number(toNumber(row.spend).toFixed(2)),
      leads: sumLeadActions(row.actions),
      roas: 0,
      source: "api",
    };
  }
}

class GoogleAdsConnector implements CampaignConnector {
  platform: Platform = "google_ads";

  async sync(input: SyncContext): Promise<SyncOutput> {
    const metrics = await fetchGoogleAdsDailyMetrics({
      customerId: clean(input.externalAccountId, 180),
      dateRef: input.dateRef,
      refreshToken: clean(input.refreshToken, 4000),
      accessToken: clean(input.accessToken, 4000),
      loginCustomerId: clean(input.loginCustomerId, 180),
    });

    return {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      leads: metrics.leads,
      roas: 0,
      source: "api",
    };
  }
}

const connectors: CampaignConnector[] = [new MetaAdsConnector(), new GoogleAdsConnector()];

function resolveConnector(platform: Platform) {
  const connector = connectors.find((item) => item.platform === platform);
  if (!connector) {
    throw new Error(`Plataforma ${platform} ainda nao suportada para sync.`);
  }
  return connector;
}

export async function runSyncForAdAccount(input: SyncContext): Promise<SyncRunResult> {
  const normalizedDateRef = normalizeDateRef(input.dateRef);
  const tenantId = clean(input.tenantId, 140) || (input.clientId ? await resolveTenantIdForClientId(input.clientId) : "");

  try {
    const connector = resolveConnector(input.platform);
    const metrics = await connector.sync({ ...input, dateRef: normalizedDateRef, tenantId });
    const snapshot = await upsertCampaignSnapshot({
      tenantId,
      clientId: input.clientId,
      adAccountId: input.adAccountId,
      channelId: input.channelId,
      platform: input.platform,
      dateRef: normalizedDateRef,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      leads: metrics.leads,
      roas: metrics.roas,
      source: metrics.source,
    });

    await Promise.all([
      adminDb.collection("ad_accounts").doc(input.adAccountId).set(
        {
          status: "active",
          lastSyncAt: FieldValue.serverTimestamp(),
          lastConsistency: snapshot.consistency,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("campaign_sync_logs").add({
        adAccountId: input.adAccountId,
        channelId: clean(input.channelId, 180) || null,
        clientId: input.clientId,
        tenantId: tenantId || null,
        platform: input.platform,
        dateRef: normalizedDateRef,
        ok: true,
        metrics,
        consistency: snapshot.consistency,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return {
      adAccountId: input.adAccountId,
      clientId: input.clientId,
      tenantId: tenantId || undefined,
      platform: input.platform,
      dateRef: normalizedDateRef,
      ok: true,
      metrics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no sync da campanha.";
    await Promise.all([
      adminDb.collection("ad_accounts").doc(input.adAccountId).set(
        {
          status: "error",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("campaign_sync_logs").add({
        adAccountId: input.adAccountId,
        channelId: clean(input.channelId, 180) || null,
        clientId: input.clientId,
        tenantId: tenantId || null,
        platform: input.platform,
        dateRef: normalizedDateRef,
        ok: false,
        error: message,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return {
      adAccountId: input.adAccountId,
      clientId: input.clientId,
      tenantId: tenantId || undefined,
      platform: input.platform,
      dateRef: normalizedDateRef,
      ok: false,
      error: message,
    };
  }
}
