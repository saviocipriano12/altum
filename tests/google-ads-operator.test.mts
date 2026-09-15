import test from "node:test";
import assert from "node:assert/strict";
import { analyzeGoogleAdsOperator } from "../lib/server/growth/google-ads-operator.ts";

test("Google Ads operator separates waste, safe scale and quality findings", () => {
  const report = analyzeGoogleAdsOperator({
    accountId: "1234567890", channelId: "google-main", currency: "BRL", from: "2026-09-01", to: "2026-09-09",
    campaigns: [
      { id: "waste", name: "Busca generica", status: "ENABLED", channelType: "SEARCH", biddingStrategy: "MAXIMIZE_CLICKS", dailyBudget: 100, impressions: 5000, clicks: 100, spend: 120, conversions: 0, conversionValue: 0, ctr: 2, cpc: 1.2, cpa: 0, roas: 0 },
      { id: "winner", name: "Alta intencao", status: "ENABLED", channelType: "SEARCH", biddingStrategy: "MAXIMIZE_CONVERSIONS", dailyBudget: 200, impressions: 4000, clicks: 200, spend: 400, conversions: 10, conversionValue: 2400, ctr: 5, cpc: 2, cpa: 40, roas: 6 },
    ],
    keywords: [{ campaignId: "waste", campaignName: "Busca generica", adGroupId: "group-1", adGroupName: "Geral", criterionId: "keyword-1", text: "empresa barata", matchType: "BROAD", status: "ENABLED", qualityScore: 3, impressions: 1000, clicks: 20, spend: 30, conversions: 0, conversionValue: 0 }],
    searchTerms: [{ campaignId: "waste", campaignName: "Busca generica", adGroupId: "group-1", adGroupName: "Geral", term: "curso gratis", impressions: 700, clicks: 30, spend: 60, conversions: 0, conversionValue: 0 }],
    ads: [{ campaignId: "waste", campaignName: "Busca generica", adGroupId: "group-1", adGroupName: "Geral", id: "ad-1", status: "ENABLED", strength: "POOR", headlines: ["Oferta"], descriptions: ["Conheca"], finalUrls: ["https://example.test"], impressions: 1000, clicks: 20, spend: 30, conversions: 0, conversionValue: 0 }],
  });
  assert.equal(report.totals.spend, 520);
  assert.equal(report.totals.conversions, 10);
  assert.equal(report.totals.roas, 4.6154);
  assert.ok(report.recommendations.some((item) => item.type === "stop_waste" && item.nextAction?.tool === "draft_campaign_pause"));
  const scale = report.recommendations.find((item) => item.type === "scale_winner");
  assert.equal(scale?.nextAction?.arguments.proposedDailyBudget, 220);
  assert.ok(report.recommendations.some((item) => item.type === "negative_keyword"));
  assert.ok(report.recommendations.some((item) => item.type === "keyword_quality"));
  assert.ok(report.recommendations.some((item) => item.type === "improve_ad"));
});

test("Google Ads operator never proposes automatic changes without enough evidence", () => {
  const report = analyzeGoogleAdsOperator({
    accountId: "123", channelId: "channel", currency: "BRL", from: "2026-09-01", to: "2026-09-02",
    campaigns: [{ id: "new", name: "Nova", status: "ENABLED", channelType: "SEARCH", biddingStrategy: "MAXIMIZE_CLICKS", dailyBudget: 50, impressions: 10, clicks: 1, spend: 2, conversions: 0, conversionValue: 0, ctr: 10, cpc: 2, cpa: 0, roas: 0 }],
    keywords: [], searchTerms: [], ads: [],
  });
  assert.deepEqual(report.recommendations, []);
});
