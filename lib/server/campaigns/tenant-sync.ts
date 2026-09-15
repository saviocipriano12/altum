import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { upsertCampaignSnapshot } from "@/app/lib/server/campaign-sync";
import { fetchGoogleAdsDailyMetrics } from "@/app/lib/server/google-ads";
import { resolveAiOperationalAlert, upsertAiOperationalAlert } from "@/lib/server/ai/observability";
import { decryptSecret } from "@/app/lib/server/secret-crypto";
import { adportGoogleCredentials, fetchAdportCampaignMetrics, fetchAdportGoogleOperatorReport, fetchAdportMetaCreativeMetrics, fetchAdportMetaOperatorReport, hasAdportGoogleCredentials } from "@/lib/server/growth/adport-connectors";

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

export type TenantCampaignSyncItem = {
  channelId: string;
  type: string;
  dateRef?: string;
  ok: boolean;
  error?: string;
  attempts?: number;
};

export type TenantCampaignSyncSummary = {
  tenantId: string;
  synced: number;
  failed: number;
  results: TenantCampaignSyncItem[];
};

type RunTenantCampaignSyncInput = {
  tenantId: string;
  days?: number;
  onlyChannelIds?: string[];
  maxRetriesPerDate?: number;
  retryBaseDelayMs?: number;
  runId?: string;
  source?: string;
};

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeMetaAccountId(externalId: string) {
  const cleaned = externalId.trim();
  if (!cleaned) return "";
  if (cleaned.startsWith("act_")) return cleaned;
  if (/^\d+$/.test(cleaned)) return `act_${cleaned}`;
  return cleaned;
}

function buildDateRefs(days: number) {
  return Array.from({ length: days }, (_, index) => {
    const offset = days - index - 1;
    const date = new Date(Date.now() - offset * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

function normalizeDays(days: number | undefined) {
  return [1, 7, 30].includes(Number(days)) ? Number(days) : 7;
}

function normalizeRetryCount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(4, Math.max(0, Math.round(parsed)));
}

function normalizeRetryDelayMs(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 900;
  return Math.min(10_000, Math.max(250, Math.round(parsed)));
}

function isRetryableSyncError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("temporar") ||
    normalized.includes("temporarily") ||
    normalized.includes("internal error") ||
    normalized.includes("rate limit") ||
    normalized.includes("try again") ||
    normalized.includes("network") ||
    normalized.includes("econnreset") ||
    normalized.includes("service unavailable") ||
    normalized.includes("resource exhausted")
  );
}

function waitMs(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function writeCampaignSyncLog(input: {
  tenantId: string;
  channelId: string;
  platform: string;
  dateRef: string;
  ok: boolean;
  attempt: number;
  maxAttempts: number;
  error?: string;
  runId?: string;
  source?: string;
}) {
  await adminDb.collection("campaign_sync_logs").add({
    tenantId: input.tenantId,
    adAccountId: input.channelId,
    channelId: input.channelId,
    clientId: input.tenantId,
    platform: input.platform,
    dateRef: input.dateRef,
    ok: input.ok,
    error: input.error || "",
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    runId: clean(input.runId, 160) || null,
    source: clean(input.source, 80) || "tenant_campaign_sync",
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function syncMetaChannel(input: {
  tenantId: string;
  channelId: string;
  externalAccountId: string;
  accessToken: string;
  actionTypeFilters?: string[];
  dateRef: string;
}) {
  const externalId = normalizeMetaAccountId(input.externalAccountId);
  if (!externalId || !input.accessToken) {
    throw new Error("Canal Meta Ads sem ad account ID ou access token.");
  }

  const connectorInput = {
    platform: "meta_ads" as const,
    accountId: externalId,
    accessToken: input.accessToken,
    actionTypeFilters: input.actionTypeFilters,
    dateRef: input.dateRef,
  };
  const [campaigns, creatives] = await Promise.all([
    fetchAdportCampaignMetrics(connectorInput),
    fetchAdportMetaCreativeMetrics(connectorInput),
  ]);
  await Promise.all([
    ...campaigns.map((campaign) => upsertCampaignSnapshot({
    tenantId: input.tenantId,
    clientId: input.tenantId,
    adAccountId: externalId,
    channelId: input.channelId,
    platform: "meta_ads",
    dateRef: input.dateRef,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    spend: campaign.spend,
    leads: campaign.leads,
    roas: campaign.roas,
    campaignId: campaign.campaignId,
    campaignName: campaign.campaignName,
    source: "api",
    })),
    ...creatives.map((creative) => {
      const snapshotId = [input.tenantId, input.channelId, creative.adId, input.dateRef]
        .map((part) => clean(part, 180).replaceAll("/", "_"))
        .join("_");
      return adminDb.collection("ad_creative_snapshots").doc(snapshotId).set({
        tenantId: input.tenantId,
        clientId: input.tenantId,
        channelId: input.channelId,
        adAccountId: externalId,
        platform: "meta_ads",
        dateRef: input.dateRef,
        campaignId: creative.campaignId || null,
        campaignName: creative.campaignName || null,
        adId: creative.adId,
        adName: creative.adName,
        impressions: creative.impressions,
        clicks: creative.clicks,
        spend: creative.spend,
        ctr: creative.ctr,
        cpc: creative.cpc,
        frequency: creative.frequency,
        source: "api",
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }),
  ]);
}

async function syncGoogleChannel(input: {
  tenantId: string;
  channelId: string;
  externalAccountId: string;
  accessToken: string;
  refreshToken: string;
  loginCustomerId: string;
  conversionActionIds?: string[];
  dateRef: string;
}) {
  if (!input.conversionActionIds?.length && hasAdportGoogleCredentials({ refreshToken: input.refreshToken })) {
    const campaigns = await fetchAdportCampaignMetrics({
      platform: "google_ads",
      accountId: input.externalAccountId,
      dateRef: input.dateRef,
      ...adportGoogleCredentials({ refreshToken: input.refreshToken, loginCustomerId: input.loginCustomerId }),
    });
    await Promise.all(campaigns.map((campaign) => upsertCampaignSnapshot({
      tenantId: input.tenantId,
      clientId: input.tenantId,
      adAccountId: input.externalAccountId,
      channelId: input.channelId,
      platform: "google_ads",
      dateRef: input.dateRef,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      spend: campaign.spend,
      leads: campaign.leads,
      roas: campaign.roas,
      campaignId: campaign.campaignId,
      campaignName: campaign.campaignName,
      source: "api",
    })));
    return;
  }

  const metrics = await fetchGoogleAdsDailyMetrics({
    customerId: input.externalAccountId,
    dateRef: input.dateRef,
    refreshToken: input.refreshToken,
    accessToken: input.accessToken,
    loginCustomerId: input.loginCustomerId,
    conversionActionIds: input.conversionActionIds,
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

async function markChannelSyncOk(channelId: string) {
  await adminDb.collection("tenant_channels").doc(channelId).set(
    {
      status: "active",
      connectionStatus: "ready",
      lastError: "",
      lastSyncAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function markChannelSyncError(channelId: string, error: string) {
  await adminDb.collection("tenant_channels").doc(channelId).set(
    {
      status: "error",
      connectionStatus: "degraded",
      lastError: error,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

export async function runTenantCampaignSync(
  input: RunTenantCampaignSyncInput
): Promise<TenantCampaignSyncSummary> {
  const tenantId = clean(input.tenantId, 120);
  if (!tenantId) {
    return { tenantId: "", synced: 0, failed: 0, results: [] };
  }

  const days = normalizeDays(input.days);
  const maxRetriesPerDate = normalizeRetryCount(input.maxRetriesPerDate);
  const retryBaseDelayMs = normalizeRetryDelayMs(input.retryBaseDelayMs);
  const onlyChannelIds = new Set(
    Array.isArray(input.onlyChannelIds) ? input.onlyChannelIds.map((item) => clean(item, 120)).filter(Boolean) : []
  );

  const channelsSnap = await adminDb
    .collection("tenant_channels")
    .where("tenantId", "==", tenantId)
    .limit(30)
    .get();

  const channels = channelsSnap.docs
    .map((doc): TenantChannelItem => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((channel) => String(channel.status || "").toLowerCase() === "active")
    .filter((channel) => ["meta_ads", "google_ads"].includes(String(channel.type || "").toLowerCase()))
    .filter((channel) => !onlyChannelIds.size || onlyChannelIds.has(channel.id));

  const results: TenantCampaignSyncItem[] = [];
  const dateRefs = buildDateRefs(days);

  for (const channel of channels) {
    const type = clean(channel.type, 40).toLowerCase();

    if (type === "google_ads") {
      const metadata =
        channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
          ? (channel.metadata as Record<string, unknown>)
          : {};
      const conversionActionIds = [
        clean(metadata.conversionActionId, 120),
        clean(metadata.leadConversionActionId, 120),
        clean(metadata.qualifiedConversionActionId, 120),
        clean(metadata.meetingConversionActionId, 120),
        clean(metadata.saleConversionActionId, 120),
      ]
        .map((item) => item.replace(/[^\d]/g, ""))
        .filter(Boolean);

      for (const dateRef of dateRefs) {
        let completed = false;
        const maxAttempts = maxRetriesPerDate + 1;
        let finalMessage = "Falha no sync.";

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            await syncGoogleChannel({
              tenantId,
              channelId: channel.id,
              externalAccountId: clean(channel.externalAccountId, 180),
              accessToken: clean(decryptSecret(channel.accessToken), 4000),
              refreshToken: clean(decryptSecret(channel.refreshToken), 4000),
              loginCustomerId: clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180),
              conversionActionIds,
              dateRef,
            });

            await Promise.all([
              markChannelSyncOk(channel.id),
              resolveAiOperationalAlert({
                tenantId,
                type: "campaign_sync_failed",
                scope: `campaigns_${channel.id}`,
              }),
              writeCampaignSyncLog({
                tenantId,
                channelId: channel.id,
                platform: type,
                dateRef,
                ok: true,
                attempt,
                maxAttempts,
                runId: input.runId,
                source: input.source,
              }),
            ]);

            results.push({ channelId: channel.id, type, dateRef, ok: true, attempts: attempt });
            completed = true;
            break;
          } catch (error) {
            finalMessage = error instanceof Error ? error.message : "Falha no sync.";
            const retryable = isRetryableSyncError(finalMessage);

            await writeCampaignSyncLog({
              tenantId,
              channelId: channel.id,
              platform: type,
              dateRef,
              ok: false,
              attempt,
              maxAttempts,
              error: finalMessage,
              runId: input.runId,
              source: input.source,
            });

            if (!retryable || attempt >= maxAttempts) break;
            await waitMs(retryBaseDelayMs * attempt);
          }
        }

        if (!completed) {
          await Promise.all([
            markChannelSyncError(channel.id, finalMessage),
            upsertAiOperationalAlert({
              tenantId,
              type: "campaign_sync_failed",
              scope: `campaigns_${channel.id}`,
              severity: "high",
              title: "Falha recorrente no sync de campanhas",
              detail: `Canal ${channel.id} (${type}) falhou em ${maxAttempts} tentativa(s): ${finalMessage}`,
              reasonCode: "campaign_sync_failed",
              source: clean(input.source, 80) || "campaign_sync_job",
            }),
          ]);

          results.push({
            channelId: channel.id,
            type,
            dateRef,
            ok: false,
            error: finalMessage,
            attempts: maxAttempts,
          });
        }
      }
      const refreshToken = clean(decryptSecret(channel.refreshToken), 4000);
      const accountId = clean(channel.externalAccountId, 180).replace(/[^\d]/g, "");
      if (accountId && hasAdportGoogleCredentials({ refreshToken })) {
        try {
          const report = await fetchAdportGoogleOperatorReport({
            platform: "google_ads",
            accountId,
            channelId: channel.id,
            from: dateRefs[0],
            to: dateRefs[dateRefs.length - 1],
            currency: clean(metadata.currency, 3) || "BRL",
            ...adportGoogleCredentials({ refreshToken, loginCustomerId: clean(metadata.loginCustomerId, 180) || clean(channel.pageId, 180) }),
          });
          const reportId = `${tenantId}_${channel.id}`.replaceAll("/", "_");
          await adminDb.collection("google_ads_operator_reports").doc(reportId).set({
            tenantId,
            channelId: channel.id,
            accountId,
            report,
            generatedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            source: "campaign_sync_job",
          }, { merge: true });
        } catch (error) {
          await adminDb.collection("campaign_sync_logs").add({
            tenantId,
            channelId: channel.id,
            platform: "google_ads",
            ok: false,
            scope: "operator_report",
            error: clean(error instanceof Error ? error.message : "Falha no relatorio do operador.", 800),
            runId: clean(input.runId, 160) || null,
            source: clean(input.source, 80) || "campaign_sync_job",
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
      continue;
    }

    const metadata =
      channel.metadata && typeof channel.metadata === "object" && !Array.isArray(channel.metadata)
        ? (channel.metadata as Record<string, unknown>)
        : {};
    const metaActionTypeFilters = [
      clean(metadata.primaryActionType, 120),
      ...clean(metadata.leadActionTypes, 1200)
        .split(",")
        .map((item) => item.trim()),
    ]
      .map((item) => item.toLowerCase())
      .filter(Boolean);

    for (const dateRef of dateRefs) {
      let completed = false;
      const maxAttempts = maxRetriesPerDate + 1;
      let finalMessage = "Falha no sync.";

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await syncMetaChannel({
            tenantId,
            channelId: channel.id,
            externalAccountId: clean(channel.externalAccountId, 180),
            accessToken: clean(decryptSecret(channel.accessToken), 4000),
            actionTypeFilters: metaActionTypeFilters,
            dateRef,
          });

          await Promise.all([
            markChannelSyncOk(channel.id),
            resolveAiOperationalAlert({
              tenantId,
              type: "campaign_sync_failed",
              scope: `campaigns_${channel.id}`,
            }),
            writeCampaignSyncLog({
              tenantId,
              channelId: channel.id,
              platform: type,
              dateRef,
              ok: true,
              attempt,
              maxAttempts,
              runId: input.runId,
              source: input.source,
            }),
          ]);

          results.push({ channelId: channel.id, type, dateRef, ok: true, attempts: attempt });
          completed = true;
          break;
        } catch (error) {
          finalMessage = error instanceof Error ? error.message : "Falha no sync.";
          const retryable = isRetryableSyncError(finalMessage);

          await writeCampaignSyncLog({
            tenantId,
            channelId: channel.id,
            platform: type,
            dateRef,
            ok: false,
            attempt,
            maxAttempts,
            error: finalMessage,
            runId: input.runId,
            source: input.source,
          });

          if (!retryable || attempt >= maxAttempts) break;
          await waitMs(retryBaseDelayMs * attempt);
        }
      }

      if (!completed) {
        await Promise.all([
          markChannelSyncError(channel.id, finalMessage),
          upsertAiOperationalAlert({
            tenantId,
            type: "campaign_sync_failed",
            scope: `campaigns_${channel.id}`,
            severity: "high",
            title: "Falha recorrente no sync de campanhas",
            detail: `Canal ${channel.id} (${type}) falhou em ${maxAttempts} tentativa(s): ${finalMessage}`,
            reasonCode: "campaign_sync_failed",
            source: clean(input.source, 80) || "campaign_sync_job",
          }),
        ]);

        results.push({
          channelId: channel.id,
          type,
          dateRef,
          ok: false,
          error: finalMessage,
          attempts: maxAttempts,
        });
      }
    }
    const metaAccessToken = clean(decryptSecret(channel.accessToken), 4000);
    const metaAccountId = clean(channel.externalAccountId, 180);
    if (metaAccessToken && metaAccountId) {
      try {
        const report = await fetchAdportMetaOperatorReport({ platform: "meta_ads", accountId: metaAccountId, channelId: channel.id, accessToken: metaAccessToken, appId: clean(metadata.appId, 180) || undefined, appSecret: clean(metadata.appSecret, 4000) || undefined, actionTypeFilters: metaActionTypeFilters, currency: clean(metadata.currency, 3) || "BRL", from: dateRefs[0], to: dateRefs[dateRefs.length - 1] });
        await adminDb.collection("meta_ads_operator_reports").doc(`${tenantId}_${channel.id}`.replaceAll("/", "_")).set({ tenantId, channelId: channel.id, accountId: report.accountId, report, generatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), source: "campaign_sync_job" }, { merge: true });
      } catch (error) {
        await adminDb.collection("campaign_sync_logs").add({ tenantId, channelId: channel.id, platform: "meta_ads", ok: false, scope: "operator_report", error: clean(error instanceof Error ? error.message : "Falha no relatorio do operador.", 800), runId: clean(input.runId, 160) || null, source: clean(input.source, 80) || "campaign_sync_job", createdAt: FieldValue.serverTimestamp() });
      }
    }
  }

  return {
    tenantId,
    synced: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}
