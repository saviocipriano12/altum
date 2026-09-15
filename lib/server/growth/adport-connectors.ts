import type { AdProvider, ReportRow, WriteOperation } from "@adport/core";
import { createAdportPolicyRuntime, type CampaignPlatform } from "./campaign-action-policy";
import { analyzeGoogleAdsOperator, type GoogleAdsAd, type GoogleAdsCampaign, type GoogleAdsKeyword, type GoogleAdsOperatorReport, type GoogleAdsSearchTerm } from "./google-ads-operator";
import { analyzeMetaAdsOperator, type MetaAdsOperatorReport, type MetaAdsRow } from "./meta-ads-operator";

export type AdportCampaignMetric = {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
  roas: number;
};

export type AdportMetaCreativeMetric = {
  campaignId: string;
  campaignName: string;
  adId: string;
  adName: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  frequency: number;
};

type MetaInput = {
  platform: "meta_ads";
  accountId: string;
  accessToken: string;
  appId?: string;
  appSecret?: string;
  actionTypeFilters?: string[];
  dateRef: string;
};

type GoogleInput = {
  platform: "google_ads";
  accountId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string;
  dateRef: string;
};

const googleAdsFetch: typeof fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.get("developer-token")) headers.delete("developer-token");
  return fetch(input, { ...init, headers });
};

function number(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumActions(value: unknown, filters: string[]) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, item) => {
    const action = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const type = String(action.action_type || "").toLowerCase();
    const matches = filters.length
      ? filters.some((filter) => type.includes(filter))
      : type.includes("lead") || type.includes("offsite_conversion.fb_pixel_lead") || type.includes("onsite_conversion.lead_grouped");
    return matches ? total + number(action.value) : total;
  }, 0);
}

function purchaseValue(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, item) => {
    const action = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return String(action.action_type || "").toLowerCase().includes("purchase") ? total + number(action.value) : total;
  }, 0);
}

function normalizeRows(rows: ReportRow[]): AdportCampaignMetric[] {
  return rows.map((row) => ({
    campaignId: row.entity.id,
    campaignName: row.entity.name || row.entity.id,
    status: row.entity.status || "unknown",
    impressions: Math.max(0, Math.round(number(row.metrics.impressions))),
    clicks: Math.max(0, Math.round(number(row.metrics.clicks))),
    spend: Math.max(0, Number(number(row.metrics.spend).toFixed(2))),
    leads: Math.max(0, Math.round(number(row.metrics.conversions))),
    roas: Math.max(0, Number(number(row.metrics.roas).toFixed(4))),
  }));
}

export async function fetchAdportCampaignMetrics(input: MetaInput | GoogleInput): Promise<AdportCampaignMetric[]> {
  if (input.platform === "meta_ads") {
    const { MetaAdsProvider, MetaGraphClient } = await import("@adport/provider-meta");
    const provider = new MetaAdsProvider(new MetaGraphClient({
      accessToken: input.accessToken,
      ...(input.appId ? { appId: input.appId } : {}),
      ...(input.appSecret ? { appSecret: input.appSecret } : {}),
    }));
    const rows = await provider.insights({
      account_id: input.accountId,
      level: "campaign",
      fields: ["campaign_id", "campaign_name", "impressions", "clicks", "spend", "actions", "action_values"],
      time_range: { since: input.dateRef, until: input.dateRef },
      limit: 1000,
    });
    const filters = (input.actionTypeFilters || []).map((item) => item.trim().toLowerCase()).filter(Boolean);
    return rows.map((row) => {
      const campaignId = String(row.campaign_id || "");
      const spend = Math.max(0, number(row.spend));
      const value = purchaseValue(row.action_values);
      return {
        campaignId,
        campaignName: String(row.campaign_name || campaignId),
        status: String(row.status || "unknown"),
        impressions: Math.max(0, Math.round(number(row.impressions))),
        clicks: Math.max(0, Math.round(number(row.clicks))),
        spend: Number(spend.toFixed(2)),
        leads: Math.max(0, Math.round(sumActions(row.actions, filters))),
        roas: spend > 0 ? Number((value / spend).toFixed(4)) : 0,
      };
    }).filter((row) => row.campaignId);
  }

  const { GoogleAdsProvider, GoogleAdsRestClient } = await import("@adport/provider-google");
  const provider = new GoogleAdsProvider(new GoogleAdsRestClient({
    developerToken: input.developerToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
    ...(input.loginCustomerId ? { loginCustomerId: input.loginCustomerId } : {}),
  }, undefined, googleAdsFetch));
  const report = await provider.report({
    accountIds: [input.accountId],
    level: "campaign",
    metrics: ["impressions", "clicks", "spend", "conversions", "roas"],
    dateRange: { start: input.dateRef, end: input.dateRef },
    limit: 1000,
  });
  return normalizeRows(report.rows);
}

/** Uses AdPort's ready Meta provider at ad granularity for the fatigue playbook. */
export async function fetchAdportMetaCreativeMetrics(input: MetaInput): Promise<AdportMetaCreativeMetric[]> {
  const { MetaAdsProvider, MetaGraphClient } = await import("@adport/provider-meta");
  const provider = new MetaAdsProvider(new MetaGraphClient({
    accessToken: input.accessToken,
    ...(input.appId ? { appId: input.appId } : {}),
    ...(input.appSecret ? { appSecret: input.appSecret } : {}),
  }));
  const rows = await provider.insights({
    account_id: input.accountId,
    level: "ad",
    fields: ["campaign_id", "campaign_name", "ad_id", "ad_name", "impressions", "clicks", "spend", "ctr", "cpc", "frequency"],
    time_range: { since: input.dateRef, until: input.dateRef },
    limit: 5000,
  });
  return rows.map((row) => {
    const adId = String(row.ad_id || "");
    const spend = Math.max(0, number(row.spend));
    const clicks = Math.max(0, Math.round(number(row.clicks)));
    return {
      campaignId: String(row.campaign_id || ""),
      campaignName: String(row.campaign_name || row.campaign_id || ""),
      adId,
      adName: String(row.ad_name || adId),
      impressions: Math.max(0, Math.round(number(row.impressions))),
      clicks,
      spend: Number(spend.toFixed(2)),
      ctr: Math.max(0, Number(number(row.ctr).toFixed(4))),
      cpc: Math.max(0, Number((number(row.cpc) || (clicks > 0 ? spend / clicks : 0)).toFixed(4))),
      frequency: Math.max(0, Number(number(row.frequency).toFixed(4))),
    };
  }).filter((row) => row.adId);
}

export async function fetchAdportMetaOperatorReport(input: Omit<MetaInput, "dateRef"> & { from: string; to: string; channelId: string; currency?: string }): Promise<MetaAdsOperatorReport> {
  const { MetaAdsProvider, MetaGraphClient } = await import("@adport/provider-meta");
  const provider = new MetaAdsProvider(new MetaGraphClient({ accessToken: input.accessToken, ...(input.appId ? { appId: input.appId } : {}), ...(input.appSecret ? { appSecret: input.appSecret } : {}) }));
  const fields = ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name", "impressions", "clicks", "spend", "actions", "action_values", "ctr", "cpc", "frequency"];
  const [campaigns, adSets, ads] = await Promise.all((["campaign", "adset", "ad"] as const).map((level) => provider.insights({ account_id: input.accountId, level, fields, time_range: { since: input.from, until: input.to }, limit: level === "campaign" ? 200 : 500 })));
  const statuses = await Promise.all((["campaigns", "adsets", "ads"] as const).map((edge) => provider.apiRead({ account_id: input.accountId, edge, fields: ["id", "status", "effective_status"], limit: edge === "campaigns" ? 200 : 500, paged: true })));
  const statusMaps = statuses.map((items) => new Map((Array.isArray(items) ? items : []).map((item) => { const row = record(item); return [String(row.id || ""), String(row.effective_status || row.status || "UNKNOWN")]; })));
  const filters = (input.actionTypeFilters || []).map((item) => item.trim().toLowerCase()).filter(Boolean);
  const map = (rows: Array<Record<string, unknown>>, level: "campaign" | "adset" | "ad", statusMap: Map<string, string>): MetaAdsRow[] => rows.map((row) => { const spend = number(row.spend); const leads = sumActions(row.actions, filters); const value = purchaseValue(row.action_values); const id = String(row[`${level}_id`] || ""); return { id, name: String(row[`${level}_name`] || id), campaignId: String(row.campaign_id || ""), campaignName: String(row.campaign_name || ""), adSetId: String(row.adset_id || ""), adSetName: String(row.adset_name || ""), status: statusMap.get(id) || "UNKNOWN", impressions: number(row.impressions), clicks: number(row.clicks), spend: Number(spend.toFixed(2)), leads, purchaseValue: Number(value.toFixed(2)), ctr: number(row.ctr), cpc: number(row.cpc), frequency: number(row.frequency), roas: spend ? Number((value / spend).toFixed(4)) : 0 }; }).filter((row) => row.id);
  return analyzeMetaAdsOperator({ accountId: normalizeMetaAccountIdForOperator(input.accountId), channelId: input.channelId, currency: String(input.currency || "BRL").toUpperCase(), from: input.from, to: input.to, campaigns: map(campaigns, "campaign", statusMaps[0]), adSets: map(adSets, "adset", statusMaps[1]), ads: map(ads, "ad", statusMaps[2]) });
}

function normalizeMetaAccountIdForOperator(value: string) { return value.startsWith("act_") ? value : `act_${value}`; }

type GoogleOperatorInput = Omit<GoogleInput, "dateRef"> & { from: string; to: string; channelId: string; currency?: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function nested(value: unknown, ...path: string[]) {
  let current: unknown = value;
  for (const key of path) current = record(current)[key];
  return current;
}

function micros(value: unknown) {
  return Number((number(value) / 1_000_000).toFixed(2));
}

function textAssets(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(record(item).text || "").trim()).filter(Boolean).slice(0, 15);
}

/**
 * Live Google Ads operating report built on AdPort's Apache-2.0 provider.
 * Queries only business metrics and creative text; OAuth credentials stay inside the server process.
 */
export async function fetchAdportGoogleOperatorReport(input: GoogleOperatorInput): Promise<GoogleAdsOperatorReport> {
  const { GoogleAdsProvider, GoogleAdsRestClient } = await import("@adport/provider-google");
  const provider = new GoogleAdsProvider(new GoogleAdsRestClient({
    developerToken: input.developerToken,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    refreshToken: input.refreshToken,
    ...(input.loginCustomerId ? { loginCustomerId: input.loginCustomerId } : {}),
  }, undefined, googleAdsFetch));
  const dateCondition = `segments.date BETWEEN '${input.from}' AND '${input.to}'`;
  const [campaignRows, keywordRows, searchTermRows, adRows] = await Promise.all([
    provider.gaqlSearch({
      customer_id: input.accountId,
      resource: "campaign",
      fields: ["campaign.id", "campaign.name", "campaign.status", "campaign.advertising_channel_type", "campaign.bidding_strategy_type", "campaign_budget.amount_micros", "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"],
      conditions: [dateCondition, "campaign.status != 'REMOVED'"],
      order_by: ["metrics.cost_micros DESC"], limit: 200,
    }),
    provider.gaqlSearch({
      customer_id: input.accountId,
      resource: "keyword_view",
      fields: ["campaign.id", "campaign.name", "ad_group.id", "ad_group.name", "ad_group_criterion.criterion_id", "ad_group_criterion.keyword.text", "ad_group_criterion.keyword.match_type", "ad_group_criterion.status", "ad_group_criterion.quality_info.quality_score", "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"],
      conditions: [dateCondition, "ad_group_criterion.status != 'REMOVED'"],
      order_by: ["metrics.cost_micros DESC"], limit: 300,
    }),
    provider.gaqlSearch({
      customer_id: input.accountId,
      resource: "search_term_view",
      fields: ["campaign.id", "campaign.name", "ad_group.id", "ad_group.name", "search_term_view.search_term", "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"],
      conditions: [dateCondition], order_by: ["metrics.cost_micros DESC"], limit: 300,
    }),
    provider.gaqlSearch({
      customer_id: input.accountId,
      resource: "ad_group_ad",
      fields: ["campaign.id", "campaign.name", "ad_group.id", "ad_group.name", "ad_group_ad.ad.id", "ad_group_ad.status", "ad_group_ad.ad_strength", "ad_group_ad.ad.final_urls", "ad_group_ad.ad.responsive_search_ad.headlines", "ad_group_ad.ad.responsive_search_ad.descriptions", "metrics.impressions", "metrics.clicks", "metrics.cost_micros", "metrics.conversions", "metrics.conversions_value"],
      conditions: [dateCondition, "ad_group_ad.status != 'REMOVED'"],
      order_by: ["metrics.cost_micros DESC"], limit: 200,
    }),
  ]);

  const campaign = (row: Record<string, unknown>) => record(row.campaign);
  const adGroup = (row: Record<string, unknown>) => record(row.adGroup);
  const metrics = (row: Record<string, unknown>) => record(row.metrics);
  const campaigns: GoogleAdsCampaign[] = campaignRows.map((row) => {
    const item = campaign(row); const values = metrics(row); const budget = record(row.campaignBudget);
    const spend = micros(values.costMicros); const clicks = number(values.clicks); const conversions = number(values.conversions); const conversionValue = number(values.conversionsValue);
    return { id: String(item.id || ""), name: String(item.name || item.id || ""), status: String(item.status || "UNKNOWN"), channelType: String(item.advertisingChannelType || "UNKNOWN"), biddingStrategy: String(item.biddingStrategyType || "UNKNOWN"), dailyBudget: micros(budget.amountMicros), impressions: number(values.impressions), clicks, spend, conversions, conversionValue, ctr: Number((clicks && number(values.impressions) ? clicks * 100 / number(values.impressions) : 0).toFixed(4)), cpc: Number((clicks ? spend / clicks : 0).toFixed(4)), cpa: Number((conversions ? spend / conversions : 0).toFixed(4)), roas: Number((spend ? conversionValue / spend : 0).toFixed(4)) };
  }).filter((item) => item.id);
  const keywords: GoogleAdsKeyword[] = keywordRows.map((row) => {
    const item = record(row.adGroupCriterion); const keyword = record(item.keyword); const quality = record(item.qualityInfo); const values = metrics(row);
    const qualityValue = Number(quality.qualityScore);
    return { campaignId: String(campaign(row).id || ""), campaignName: String(campaign(row).name || ""), adGroupId: String(adGroup(row).id || ""), adGroupName: String(adGroup(row).name || ""), criterionId: String(item.criterionId || ""), text: String(keyword.text || ""), matchType: String(keyword.matchType || "UNKNOWN"), status: String(item.status || "UNKNOWN"), qualityScore: Number.isFinite(qualityValue) && qualityValue > 0 ? qualityValue : null, impressions: number(values.impressions), clicks: number(values.clicks), spend: micros(values.costMicros), conversions: number(values.conversions), conversionValue: number(values.conversionsValue) };
  }).filter((item) => item.criterionId && item.text);
  const searchTerms: GoogleAdsSearchTerm[] = searchTermRows.map((row) => {
    const values = metrics(row);
    return { campaignId: String(campaign(row).id || ""), campaignName: String(campaign(row).name || ""), adGroupId: String(adGroup(row).id || ""), adGroupName: String(adGroup(row).name || ""), term: String(nested(row, "searchTermView", "searchTerm") || ""), impressions: number(values.impressions), clicks: number(values.clicks), spend: micros(values.costMicros), conversions: number(values.conversions), conversionValue: number(values.conversionsValue) };
  }).filter((item) => item.term);
  const ads: GoogleAdsAd[] = adRows.map((row) => {
    const item = record(row.adGroupAd); const ad = record(item.ad); const responsive = record(ad.responsiveSearchAd); const values = metrics(row);
    return { campaignId: String(campaign(row).id || ""), campaignName: String(campaign(row).name || ""), adGroupId: String(adGroup(row).id || ""), adGroupName: String(adGroup(row).name || ""), id: String(ad.id || ""), status: String(item.status || "UNKNOWN"), strength: String(item.adStrength || "UNSPECIFIED"), headlines: textAssets(responsive.headlines), descriptions: textAssets(responsive.descriptions), finalUrls: Array.isArray(ad.finalUrls) ? ad.finalUrls.map(String).slice(0, 10) : [], impressions: number(values.impressions), clicks: number(values.clicks), spend: micros(values.costMicros), conversions: number(values.conversions), conversionValue: number(values.conversionsValue) };
  }).filter((item) => item.id);
  return analyzeGoogleAdsOperator({ accountId: input.accountId, channelId: input.channelId, currency: String(input.currency || "BRL").toUpperCase(), from: input.from, to: input.to, campaigns, keywords, searchTerms, ads });
}

export function hasAdportGoogleCredentials(input: { refreshToken: string }) {
  return Boolean(
    input.refreshToken &&
    (process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID) &&
    (process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function adportGoogleCredentials(input: { refreshToken: string; loginCustomerId?: string }) {
  return {
    developerToken: String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ""),
    clientId: String(process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ""),
    clientSecret: String(process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ""),
    refreshToken: input.refreshToken,
    loginCustomerId: input.loginCustomerId,
  };
}

type LiveMetaCredentials = { platform: "meta_ads"; accessToken: string; appId?: string; appSecret?: string };
type LiveGoogleCredentials = { platform: "google_ads"; developerToken: string; clientId: string; clientSecret: string; refreshToken: string; loginCustomerId?: string };

async function createLiveProvider(credentials: LiveMetaCredentials | LiveGoogleCredentials): Promise<AdProvider> {
  if (credentials.platform === "meta_ads") {
    const { MetaAdsProvider, MetaGraphClient } = await import("@adport/provider-meta");
    return new MetaAdsProvider(new MetaGraphClient({
      accessToken: credentials.accessToken,
      ...(credentials.appId ? { appId: credentials.appId } : {}),
      ...(credentials.appSecret ? { appSecret: credentials.appSecret } : {}),
    }));
  }
  const { GoogleAdsProvider, GoogleAdsRestClient } = await import("@adport/provider-google");
  return new GoogleAdsProvider(new GoogleAdsRestClient({
    developerToken: credentials.developerToken,
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    refreshToken: credentials.refreshToken,
    ...(credentials.loginCustomerId ? { loginCustomerId: credentials.loginCustomerId } : {}),
  }, undefined, googleAdsFetch));
}

function liveOperation(input: {
  platform: CampaignPlatform;
  accountId: string;
  campaignId: string;
  action: "pause_campaign" | "change_daily_budget";
  proposedDailyBudget?: number;
}) {
  if (input.platform === "meta_ads") {
    return {
      tool: input.action === "pause_campaign" ? "meta_set_campaign_status" : "meta_set_budget",
      provider: "meta",
      accountId: input.accountId,
      kind: "update" as const,
      payload: input.action === "pause_campaign"
        ? { campaign_id: input.campaignId, status: "PAUSED" }
        : { object_id: input.campaignId, daily_budget_cents: Math.round(Number(input.proposedDailyBudget) * 100) },
    } satisfies WriteOperation;
  }
  return {
    tool: input.action === "pause_campaign" ? "google_set_campaign_status" : "google_set_budget",
    provider: "google",
    accountId: input.accountId,
    kind: "update" as const,
    payload: input.action === "pause_campaign"
      ? { campaign_id: input.campaignId, status: "PAUSED" }
      : { campaign_id: input.campaignId, daily_budget_micros: Math.round(Number(input.proposedDailyBudget) * 1_000_000) },
  } satisfies WriteOperation;
}

export async function verifyAdportDraftHash(operation: WriteOperation, expectedHash: string) {
  const { hashOperation } = await import("@adport/core");
  return hashOperation(operation) === expectedHash;
}

export async function hashAdportOperation(operation: WriteOperation) {
  const { hashOperation } = await import("@adport/core");
  return hashOperation(operation);
}

export async function applyAdportGoogleOperation(input: { accountId: string; operation: WriteOperation; credentials: LiveGoogleCredentials }) {
  if (input.operation.provider !== "google" || input.operation.accountId.replace(/[^\d]/g, "") !== input.accountId.replace(/[^\d]/g, "")) throw new Error("Operacao Google Ads pertence a outra conta.");
  const provider = await createLiveProvider(input.credentials);
  const { engine, audit } = await createAdportPolicyRuntime();
  const validation = await engine.validate(provider, input.operation);
  const application = await engine.apply(provider, input.operation, validation.pendingOperationId);
  return { preview: validation.preview, result: application.result, audit: audit.entries, operationHash: await hashAdportOperation(input.operation) };
}

export async function applyAdportMetaOperation(input: { accountId: string; operation: WriteOperation; credentials: LiveMetaCredentials }) {
  if (input.operation.provider !== "meta" || input.operation.accountId.replace(/[^\d]/g, "") !== input.accountId.replace(/[^\d]/g, "")) throw new Error("Operação Meta Ads pertence a outra conta.");
  const provider = await createLiveProvider(input.credentials);
  const { engine, audit } = await createAdportPolicyRuntime();
  const validation = await engine.validate(provider, input.operation);
  const application = await engine.apply(provider, input.operation, validation.pendingOperationId);
  return { preview: validation.preview, result: application.result, audit: audit.entries, operationHash: await hashAdportOperation(input.operation) };
}

export async function applyAdportCampaignChange(input: {
  platform: CampaignPlatform;
  accountId: string;
  campaignId: string;
  action: "pause_campaign" | "change_daily_budget";
  proposedDailyBudget?: number;
  credentials: LiveMetaCredentials | LiveGoogleCredentials;
}) {
  if (input.credentials.platform !== input.platform) throw new Error("Credencial e campanha pertencem a plataformas diferentes.");
  const operation = liveOperation(input);
  const provider = await createLiveProvider(input.credentials);
  const { engine, policy, audit } = await createAdportPolicyRuntime();
  const validation = await engine.validate(provider, operation);
  const application = await engine.apply(provider, operation, validation.pendingOperationId);
  const { hashOperation } = await import("@adport/core");
  return {
    engine: "@adport/core",
    version: "0.6.0",
    policy,
    operationHash: hashOperation(operation),
    preview: validation.preview,
    result: application.result,
    audit: audit.entries,
  };
}
