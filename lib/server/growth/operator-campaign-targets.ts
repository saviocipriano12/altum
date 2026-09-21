import type { GrowthRow } from "./contracts";
/** Identity adapter only: multi-day operator totals must never become daily growth snapshots. */
export function operatorCampaignTargets(reports: GrowthRow[], platform: "meta_ads" | "google_ads"): GrowthRow[] {
  return reports.flatMap(row => {
    const report = row.report && typeof row.report === "object" ? row.report as Record<string, unknown> : {};
    return (Array.isArray(report.campaigns) ? report.campaigns : []).map((value): GrowthRow => {
      const campaign = value && typeof value === "object" ? value as Record<string, unknown> : {};
      return { id: `operator:${row.id}:${String(campaign.id || "")}`, tenantId: row.tenantId, platform,
        campaignId: String(campaign.id || ""), campaignName: String(campaign.name || ""),
        channelId: String(row.channelId || report.channelId || ""), adAccountId: String(row.accountId || report.accountId || ""), dateRef: String(report.to || "") };
    }).filter(row => row.campaignId && row.channelId && row.adAccountId);
  });
}
