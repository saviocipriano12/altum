import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

type Platform = "meta_ads" | "google_ads" | "tiktok_ads" | "linkedin_ads";

type SyncContext = {
  adAccountId: string;
  clientId: string;
  platform: Platform;
  externalAccountId?: string;
  dateRef: string;
};

type SyncOutput = {
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  roas: number;
  source: "api" | "manual" | "import";
};

export type SyncRunResult = {
  adAccountId: string;
  clientId: string;
  platform: Platform;
  dateRef: string;
  metrics?: SyncOutput;
  ok: boolean;
  error?: string;
};

interface CampaignConnector {
  platform: Platform;
  sync(input: SyncContext): Promise<SyncOutput>;
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

class MetaAdsConnector implements CampaignConnector {
  platform: Platform = "meta_ads";

  async sync(input: SyncContext): Promise<SyncOutput> {
    const token =
      process.env.META_ADS_ACCESS_TOKEN ||
      process.env.META_WA_TOKEN ||
      process.env.NEXT_PUBLIC_META_WA_TOKEN;
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

  async sync(): Promise<SyncOutput> {
    // Estrutura pronta para conectar Google Ads API oficial no próximo sprint.
    throw new Error(
      "Conector Google Ads ainda nao configurado. Configure OAuth + Developer Token para ativar."
    );
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

export async function runSyncForAdAccount(input: SyncContext): Promise<SyncRunResult> {
  try {
    const connector = resolveConnector(input.platform);
    const metrics = await connector.sync(input);
    const rates = calculateRates(metrics);

    const snapshotId = `${input.adAccountId}_${input.dateRef}`;
    await Promise.all([
      adminDb.collection("campaign_snapshots").doc(snapshotId).set(
        {
          adAccountId: input.adAccountId,
          clientId: input.clientId,
          dateRef: input.dateRef,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          spend: metrics.spend,
          leads: metrics.leads,
          ctr: rates.ctr,
          cpc: rates.cpc,
          cpl: rates.cpl,
          roas: metrics.roas,
          source: metrics.source,
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("ad_accounts").doc(input.adAccountId).set(
        {
          status: "active",
          lastSyncAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      ),
      adminDb.collection("campaign_sync_logs").add({
        adAccountId: input.adAccountId,
        clientId: input.clientId,
        platform: input.platform,
        dateRef: input.dateRef,
        ok: true,
        metrics,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return {
      adAccountId: input.adAccountId,
      clientId: input.clientId,
      platform: input.platform,
      dateRef: input.dateRef,
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
        clientId: input.clientId,
        platform: input.platform,
        dateRef: input.dateRef,
        ok: false,
        error: message,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return {
      adAccountId: input.adAccountId,
      clientId: input.clientId,
      platform: input.platform,
      dateRef: input.dateRef,
      ok: false,
      error: message,
    };
  }
}
