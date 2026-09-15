import test from "node:test";
import assert from "node:assert/strict";
import { applyAdportCampaignChange, applyAdportMetaOperation, fetchAdportCampaignMetrics, fetchAdportGoogleOperatorReport, fetchAdportMetaCreativeMetrics } from "../lib/server/growth/adport-connectors.ts";

test("AdPort Google provider supplies campaigns, keywords, search terms and responsive ads", async () => {
  const originalFetch = globalThis.fetch;
  const queries: string[] = [];
  const developerTokenHeaders: Array<string | null> = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "google-test-token", expires_in: 3600 }), { status: 200, headers: { "content-type": "application/json" } });
    developerTokenHeaders.push(new Headers(init?.headers).get("developer-token"));
    const body = JSON.parse(String(init?.body || "{}")) as { query?: string };
    const query = String(body.query || ""); queries.push(query);
    const metrics = { impressions: "1000", clicks: "50", costMicros: "125000000", conversions: 5, conversionsValue: 500 };
    let results: Array<Record<string, unknown>> = [];
    if (query.includes("FROM campaign")) results = [{ campaign: { id: "campaign-1", name: "Pesquisa", status: "ENABLED", advertisingChannelType: "SEARCH", biddingStrategyType: "MAXIMIZE_CONVERSIONS" }, campaignBudget: { amountMicros: "200000000" }, metrics }];
    if (query.includes("FROM keyword_view")) results = [{ campaign: { id: "campaign-1", name: "Pesquisa" }, adGroup: { id: "group-1", name: "Principal" }, adGroupCriterion: { criterionId: "keyword-1", status: "ENABLED", keyword: { text: "crm para vendas", matchType: "PHRASE" }, qualityInfo: { qualityScore: 8 } }, metrics }];
    if (query.includes("FROM search_term_view")) results = [{ campaign: { id: "campaign-1", name: "Pesquisa" }, adGroup: { id: "group-1", name: "Principal" }, searchTermView: { searchTerm: "melhor crm para vendas" }, metrics }];
    if (query.includes("FROM ad_group_ad")) results = [{ campaign: { id: "campaign-1", name: "Pesquisa" }, adGroup: { id: "group-1", name: "Principal" }, adGroupAd: { status: "ENABLED", adStrength: "GOOD", ad: { id: "ad-1", finalUrls: ["https://altum.test"], responsiveSearchAd: { headlines: [{ text: "Venda mais" }], descriptions: [{ text: "CRM com IA" }] } } }, metrics }];
    return new Response(JSON.stringify({ results }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const report = await fetchAdportGoogleOperatorReport({ platform: "google_ads", accountId: "123-456-7890", channelId: "channel-google", developerToken: "", clientId: "client", clientSecret: "secret", refreshToken: "refresh", from: "2026-09-01", to: "2026-09-09", currency: "BRL" });
    assert.equal(report.campaigns[0].dailyBudget, 200);
    assert.equal(report.campaigns[0].spend, 125);
    assert.equal(report.keywords[0].text, "crm para vendas");
    assert.equal(report.keywords[0].qualityScore, 8);
    assert.equal(report.searchTerms[0].term, "melhor crm para vendas");
    assert.deepEqual(report.ads[0].headlines, ["Venda mais"]);
    assert.equal(queries.length, 4);
    assert.ok(queries.every((query) => query.includes("segments.date BETWEEN '2026-09-01' AND '2026-09-09'")));
    assert.ok(developerTokenHeaders.every((value) => value === null), JSON.stringify(developerTokenHeaders));
  } finally { globalThis.fetch = originalFetch; }
});

test("AdPort Meta provider paginates campaign insights while Altum preserves lead semantics", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; authorization: string }> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") || "" });
    return new Response(JSON.stringify({
      data: [{
        campaign_id: "cmp-123",
        campaign_name: "Campanha pronta",
        impressions: "1000",
        clicks: "50",
        spend: "125.50",
        actions: [
          { action_type: "lead", value: "7" },
          { action_type: "omni_purchase", value: "2" },
        ],
        action_values: [{ action_type: "omni_purchase", value: "500" }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const rows = await fetchAdportCampaignMetrics({
      platform: "meta_ads",
      accountId: "123",
      accessToken: "token-de-teste",
      dateRef: "2026-09-09",
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      campaignId: "cmp-123",
      campaignName: "Campanha pronta",
      status: "unknown",
      impressions: 1000,
      clicks: 50,
      spend: 125.5,
      leads: 7,
      roas: 3.9841,
    });
    assert.equal(requests.length, 1);
    assert.match(requests[0].url, /act_123\/insights/);
    assert.match(requests[0].url, /level=campaign/);
    assert.equal(requests[0].authorization, "Bearer token-de-teste");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Altum lead action filters are honored on top of the ready AdPort provider", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    data: [{
      campaign_id: "cmp-filter",
      campaign_name: "Formulario",
      spend: "20",
      actions: [
        { action_type: "lead", value: "9" },
        { action_type: "custom.crm_qualified", value: "3" },
      ],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const rows = await fetchAdportCampaignMetrics({
      platform: "meta_ads",
      accountId: "act_456",
      accessToken: "token-de-teste",
      actionTypeFilters: ["crm_qualified"],
      dateRef: "2026-09-09",
    });
    assert.equal(rows[0].leads, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AdPort Meta provider supplies ad-level daily snapshots for creative fatigue", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ data: [{
      campaign_id: "cmp-creative",
      campaign_name: "Prospeccao",
      ad_id: "ad-42",
      ad_name: "Video depoimento",
      impressions: "2000",
      clicks: "30",
      spend: "45",
      ctr: "1.5",
      cpc: "1.5",
      frequency: "3.8",
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const rows = await fetchAdportMetaCreativeMetrics({
      platform: "meta_ads",
      accountId: "act_123",
      accessToken: "token-de-teste",
      dateRef: "2026-09-09",
    });
    assert.equal(rows[0].adId, "ad-42");
    assert.equal(rows[0].frequency, 3.8);
    assert.match(requestedUrl, /level=ad/);
    assert.match(requestedUrl, /ad_id/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approved campaign pause uses AdPort provider preview before applying", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ method: string; url: string; body: string }> = [];
  globalThis.fetch = async (input, init) => {
    const method = String(init?.method || "GET").toUpperCase();
    requests.push({ method, url: String(input), body: String(init?.body || "") });
    if (method === "GET") {
      return new Response(JSON.stringify({ name: "Campanha real", status: "ACTIVE" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const result = await applyAdportCampaignChange({
      platform: "meta_ads",
      accountId: "act_123",
      campaignId: "cmp-live",
      action: "pause_campaign",
      credentials: { platform: "meta_ads", accessToken: "token-de-teste" },
    });
    assert.equal(result.preview.serverValidated, true);
    assert.equal(result.result.applied, true);
    assert.deepEqual(result.result.resourceIds, ["cmp-live"]);
    assert.equal(requests.length, 4);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[1].method, "POST");
    assert.match(requests[1].body, /validate_only/);
    assert.equal(requests[3].method, "POST");
    assert.doesNotMatch(requests[3].body, /validate_only/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("approved Meta creation validates with the provider before creating the paused campaign", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = async (_input, init) => {
    bodies.push(String(init?.body || ""));
    return new Response(JSON.stringify({ id: "campaign-created" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await applyAdportMetaOperation({
      accountId: "act_123",
      credentials: { platform: "meta_ads", accessToken: "token-de-teste" },
      operation: { tool: "meta_create_campaign", provider: "meta", accountId: "123", kind: "create", payload: { name: "Leads", objective: "OUTCOME_LEADS", status: "PAUSED", special_ad_categories: [] } },
    });
    assert.equal(result.result.applied, true);
    assert.deepEqual(result.result.resourceIds, ["campaign-created"]);
    assert.equal(bodies.length, 2);
    assert.match(bodies[0], /validate_only/);
    assert.doesNotMatch(bodies[1], /validate_only/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
