import test from "node:test";
import assert from "node:assert/strict";
import { GoogleDraftError, prepareGoogleDraft, type GoogleOperatorSnapshot } from "../lib/server/growth/google-ads-actions.ts";

const snapshots: GoogleOperatorSnapshot[] = [{ accountId: "1234567890", channelId: "google-main", report: {
  campaigns: [{ id: "campaign-1", name: "Pesquisa" }],
  keywords: [{ campaignId: "campaign-1", adGroupId: "group-1", criterionId: "keyword-1", text: "crm vendas" }],
  searchTerms: [{ campaignId: "campaign-1", adGroupId: "group-1", term: "curso gratis" }],
  ads: [{ campaignId: "campaign-1", adGroupId: "group-1", id: "ad-1" }],
} }];
const base = { adAccountId: "123-456-7890", reason: "Mudanca baseada no relatorio observado.", evidence: ["Evidencia registrada."] };

test("prepares all safe Google Ads draft operations from observed entities", () => {
  const pause = prepareGoogleDraft("draft_google_keyword_pause", { ...base, campaignId: "campaign-1", adGroupId: "group-1", criterionId: "keyword-1" }, snapshots);
  assert.equal(pause.operation.tool, "google_set_keyword_status");
  const group = prepareGoogleDraft("draft_google_ad_group_create", { ...base, campaignId: "campaign-1", name: "Alta intencao", cpcBid: 2.5 }, snapshots);
  assert.equal(group.operation.payload.cpc_bid_micros, 2_500_000);
  const ad = prepareGoogleDraft("draft_google_responsive_search_ad", { ...base, campaignId: "campaign-1", adGroupId: "group-1", headlines: ["CRM para vendas", "Venda mais agora", "Atendimento com IA"], descriptions: ["Organize seus leads e vendas.", "Conheca a Altum para sua empresa."], finalUrls: ["https://altum.com.br/crm"] }, snapshots);
  assert.equal(ad.operation.tool, "google_create_responsive_search_ad");
  const campaign = prepareGoogleDraft("draft_google_campaign_create", { ...base, name: "Nova pesquisa", dailyBudget: 100, channelType: "SEARCH" }, snapshots);
  assert.equal(campaign.operation.payload.status, "PAUSED");
  const bidding = prepareGoogleDraft("draft_google_bidding_strategy", { ...base, campaignId: "campaign-1", strategy: "MAXIMIZE_CONVERSIONS", targetCpa: 50 }, snapshots);
  assert.equal(bidding.operation.payload.target_cpa_micros, 50_000_000);
});

test("rejects unknown entities and invalid responsive ad limits", () => {
  assert.throws(() => prepareGoogleDraft("draft_google_keyword_pause", { ...base, campaignId: "campaign-1", adGroupId: "group-1", criterionId: "unknown" }, snapshots), GoogleDraftError);
  assert.throws(() => prepareGoogleDraft("draft_google_responsive_search_ad", { ...base, campaignId: "campaign-1", adGroupId: "group-1", headlines: ["So um"], descriptions: ["So uma"], finalUrls: ["javascript:alert(1)"] }, snapshots), GoogleDraftError);
});
