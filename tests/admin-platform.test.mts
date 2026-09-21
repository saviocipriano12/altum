import test from "node:test";
import assert from "node:assert/strict";
import { adminDraftPreviewComplete, buildAdminMarketingOverview, type AdminMarketingInput } from "../lib/admin-marketing-overview.ts";
import { mergeAdminCompanies } from "../lib/admin-companies.ts";
import { recurringPeriods, existingRecurringPeriods } from "../lib/admin-finance.ts";
import { canManageAgencyUser } from "../lib/admin-access.ts";
import { adminBatchSchema } from "../lib/admin-batch.ts";
import { compareStrategyObservations, type StrategyObservation } from "../lib/admin-strategies.ts";
import { buildAdminPortfolio, type PortfolioInput } from "../lib/admin-portfolio.ts";
import { operatorCampaignTargets } from "../lib/server/growth/operator-campaign-targets.ts";
import { resolveCampaignTarget } from "../lib/server/growth/campaign-action-policy.ts";
const now = Date.parse("2026-09-18T12:00:00Z");
test("admin approval requires a complete preview and never exposes unknown nested fields", () => {
  assert.equal(adminDraftPreviewComplete({ action: "pause_campaign", expectedStatus: "active", nextStatus: "paused" }), true);
  assert.equal(adminDraftPreviewComplete({ name: "Ready", match: "all", conditions: [{ field: "status", operator: "Equals", value: "active" }] }), true);
  assert.equal(adminDraftPreviewComplete({ name: "Ready", conditions: [{ field: "status", operator: "Equals", value: "active", secret: "private" }] }), false);
  assert.equal(adminDraftPreviewComplete({ action: "pause_campaign", accessToken: "private" }), false);
  assert.equal(adminDraftPreviewComplete({ instructions: "a".repeat(4001) }), false);
  assert.equal(adminDraftPreviewComplete(null), false);
});
const empty = (): AdminMarketingInput => ({ tenants: [], clients: [], accounts: [], channels: [], tracking: [], metaReports: [], googleReports: [], drafts: [], pixels: [] });
test("media projections exclude credentials, write keys, unknown fields and secret draft properties", () => {
  const input = empty(); input.tenants = [{ id: "t", name: "Acme" }];
  input.channels = [{ id: "c", tenantId: "t", type: "meta_ads", externalAccountId: "act_1", accessToken: "private-token", metadata: { appSecret: "private-secret" } }];
  input.tracking = [{ id: "t", publicWriteKey: "private-write", consentMode: "invalid" }];
  input.drafts = [{ id: "d", tenantId: "t", proposedChange: { dailyBudget: 100, instructions: "Reviewed instructions", accessToken: "private-token", credentials: { password: "private-password" } }, adportValidation: { operation: { credentials: "private-secret" } } }];
  const result = buildAdminMarketingOverview(input, now); const serialized = JSON.stringify(result);
  for (const secret of ["private-token", "private-secret", "private-write", "private-password"]) assert.ok(!serialized.includes(secret));
  assert.equal(result.accounts[0].configurationComplete, true); assert.equal(result.tracking[0].consentMode, "required");
  assert.equal(result.drafts[0].details.dailyBudget, 100);
});
test("media links a legacy company only when the tenant mapping is unique", () => {
  const input = empty(); input.clients = [{ id: "legacy", name: "Company" }]; input.accounts = [{ id: "a", clientId: "legacy" }];
  input.tenants = [{ id: "t1", legacyClientId: "legacy" }]; assert.equal(buildAdminMarketingOverview(input).accounts[0].tenantId, "t1");
  input.tenants.push({ id: "t2", legacyClientId: "legacy" }); assert.equal(buildAdminMarketingOverview(input).accounts[0].tenantId, null);
});
test("media selects the latest report independently for each tenant/channel/platform and preserves currencies", () => {
  const input = empty(); input.tenants = [{ id: "t" }];
  const report = (id: string, generatedAt: string, currency: string) => ({ id, tenantId: "t", channelId: "c", generatedAt, report: { currency, accountId: "account", campaigns: [{ id: "cmp", spend: 5, conversions: 2, dailyBudget: 20 }] } });
  input.googleReports = [report("old", "2026-09-01T00:00:00Z", "BRL"), report("new", "2026-09-18T10:00:00Z", "USD")];
  input.metaReports = [report("meta", "2026-09-01T00:00:00Z", "BRL")];
  const result = buildAdminMarketingOverview(input, now); assert.equal(result.campaigns.length, 2);
  assert.equal(result.campaigns.find(row => row.platform === "google_ads")?.currency, "USD");
  assert.equal(result.campaigns.find(row => row.platform === "google_ads")?.dailyBudget, 20);
  assert.equal(result.campaigns.find(row => row.platform === "meta_ads")?.stale, true);
});
test("invalid metrics remain unavailable instead of turning into zero or Infinity", () => {
  const input = empty(); input.googleReports = [{ id: "r", report: { currency: "invalid", campaigns: [{ id: "x", spend: Infinity, conversions: "10" }] } }];
  const campaign = buildAdminMarketingOverview(input).campaigns[0]; assert.equal(campaign.spend, null); assert.equal(campaign.conversions, null); assert.equal(campaign.currency, null);
});
test("company merging retains old URLs and includes SaaS companies with contact aliases", () => {
  const items = mergeAdminCompanies([{ id: "old", name: "Old", telefone: "123" }], [{ id: "linked", legacyClientId: "old" }, { id: "selfservice", name: "Self", responsibleEmail: "a@example.test" }]);
  assert.equal(items.length, 2); assert.equal(items.find(row => row.id === "old")?.tenantId, "linked");
  assert.equal(items.find(row => row.id === "old")?.phone, "123"); assert.equal(items.find(row => row.id === "selfservice")?.email, "a@example.test");
});
test("ambiguous company mappings are surfaced without silently choosing a workspace", () => {
  const [company] = mergeAdminCompanies([{ id: "old" }], [{ id: "t1", legacyClientId: "old" }, { id: "t2", legacyClientId: "old" }]);
  assert.equal(company.ambiguous, true); assert.equal(company.tenantId, null);
});
test("recurrence keys remain stable across year boundaries and legacy monthly rows occupy their period", () => {
  const periods = recurringPeriods(new Date("2026-12-30T23:00:00Z"), 2, 31);
  assert.deepEqual(periods, [{ competence: "2027-01", dueDate: "2027-01-28" }, { competence: "2027-02", dueDate: "2027-02-28" }]);
  const occupied = existingRecurringPeriods([{ categoria: "Mensalidade", vencimento: "2027-01-10" }, { categoria: "Setup", vencimento: "2027-02-10" }, { categoria: "Mensalidade", competence: "2027-03" }]);
  assert.deepEqual([...occupied], ["2027-01", "2027-03"]);
});
test("agency administrator manages normal users but cannot change or promote an owner", () => {
  assert.equal(canManageAgencyUser("agency_admin", "agency_agent", "agency_admin"), true);
  assert.equal(canManageAgencyUser("agency_admin", "agency_owner", "agency_agent"), false);
  assert.equal(canManageAgencyUser("agency_admin", "agency_agent", "admin"), false);
  assert.equal(canManageAgencyUser("agency_agent", "agency_agent"), false);
  assert.equal(canManageAgencyUser("agency_owner", "agency_owner", "agency_agent"), true);
});
const batch = (action: string, targets: unknown[], extras = {}) => ({ requestKey: "request_0123456789", action, targets, ...extras });
test("batch rejects duplicate or incomplete targets and requires confirmation for provider application", () => {
  const target = { tenantId: "t", draftId: "d" };
  assert.equal(adminBatchSchema.safeParse(batch("apply", [target])).success, false);
  assert.equal(adminBatchSchema.safeParse(batch("apply", [target], { confirmed: true })).success, true);
  assert.equal(adminBatchSchema.safeParse(batch("approve", [target, target])).success, false);
  assert.equal(adminBatchSchema.safeParse(batch("sync", [{ tenantId: "t" }])).success, false);
});
test("batch limits twenty targets and only supports explicit sync windows", () => {
  const targets = Array.from({ length: 21 }, (_, index) => ({ tenantId: "t", platform: "meta_ads", channelId: `c${index}` }));
  assert.equal(adminBatchSchema.safeParse(batch("sync", targets)).success, false);
  assert.equal(adminBatchSchema.safeParse(batch("discover_pixels", targets.slice(0, 20))).success, true);
  assert.equal(adminBatchSchema.safeParse(batch("sync", targets.slice(0, 1), { rangeDays: 1 })).success, false);
});
const observation = (overrides: Partial<StrategyObservation> = {}): StrategyObservation => ({ value: 100, conversions: 20, currency: "BRL", from: "2026-09-01", to: "2026-09-07", generatedAt: "2026-09-08T00:00:00Z", reportId: "r:1", ...overrides });
test("strategy records cost improvement as observational, without claiming causality", () => {
  const result = compareStrategyObservations("cost_per_conversion", observation(), observation({ value: 80, from: "2026-09-08", to: "2026-09-14", reportId: "r:2" }));
  assert.equal(result.outcome, "improved"); assert.equal(result.percent, -20); assert.equal(result.causal, false);
});
test("strategy refuses overlapping windows, missing data, low samples and currency mismatch", () => {
  const cases = [{ from: "2026-09-05", to: "2026-09-11" }, { value: null }, { conversions: 2 }, { currency: "USD" }, { reportId: "r:1" }, { from: "invalid" }];
  for (const overrides of cases) { const result = compareStrategyObservations("cost_per_conversion", observation(), observation({ from: "2026-09-08", to: "2026-09-14", reportId: "r:2", ...overrides })); assert.equal(result.outcome, "inconclusive"); assert.equal(result.percent, null); }
});
test("operator target adapter uses campaign identity without importing aggregate spend as a daily snapshot", () => {
  const rows = operatorCampaignTargets([{ id: "report", tenantId: "t", channelId: "c", report: { accountId: "act_1", to: "2026-09-18", campaigns: [{ id: "campaign", name: "Test", spend: 999 }] } }], "meta_ads");
  const target = resolveCampaignTarget(rows, { platform: "meta_ads", campaignId: "campaign", adAccountId: "act_1" });
  assert.equal(target.channelId, "c"); assert.equal(target.campaignName, "Test"); assert.equal(rows[0].spend, undefined);
});
test("portfolio prioritizes connection/billing/AI risks and excludes paid/cancelled financial items", () => {
  const input: PortfolioInput = { clients: [], tenants: [{ id: "t", name: "Acme" }], contracts: [{ id: "t", platformAccessStatus: "blocked" }], channels: [{ id: "c", tenantId: "t", connectionStatus: "expired" }], projects: [], finance: [{ id: "unpaid", tenantId: "t", tipo: "Receita", status: "pendente", vencimento: "2026-01-01" }, { id: "paid", tenantId: "t", tipo: "Receita", status: "pago", vencimento: "2026-01-01" }], alerts: [{ id: "a", tenantId: "t", severity: "high", status: "open" }], usage: [{ id: "u", tenantId: "t", monthRef: "2026-09", estimatedCostUsd: 3.5 }] };
  const [row] = buildAdminPortfolio(input, new Date(now)); assert.equal(row.priority, 3); assert.equal(row.overdueCount, 1); assert.equal(row.estimatedAiCostUsd, 3.5);
  assert.ok(!JSON.stringify(row).includes("connectionStatus"));
});
test("portfolio reports unavailable usage coverage and does not infer missing workspace from failed tenant source", () => {
  const input: PortfolioInput = { clients: [{ id: "legacy" }], tenants: [], contracts: [], channels: [], projects: [], finance: [], alerts: [], usage: [] };
  const [row] = buildAdminPortfolio(input, new Date(now), new Set(["clients"])); assert.equal(row.estimatedAiCostUsd, null); assert.equal(row.issues.length, 0);
});
