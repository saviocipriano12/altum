import assert from "node:assert/strict";
import test from "node:test";
import { buildRevenueGraph } from "../lib/server/growth/revenue-graph.ts";

test("Revenue Graph connects one acquired lead through payment without inventing stages", () => {
  const from = "2026-09-01T00:00:00.000Z", to = "2026-10-01T00:00:00.000Z";
  const report = buildRevenueGraph({
    from, to,
    events: [
      { id: "e1", name: "page_view", occurredAt: "2026-09-02T10:00:00.000Z", anonymousId: "a1", sessionId: "s1", attribution: { source: "google", campaign: "Marca" } },
      { id: "e2", name: "form_submitted", occurredAt: "2026-09-02T10:05:00.000Z", anonymousId: "a1", sessionId: "s1", externalId: "lead1", attribution: { source: "google", campaign: "Marca" } },
    ],
    leads: [{ id: "lead1", createdAt: "2026-09-02T10:05:00.000Z", pipelineStage: "ganho", potentialValue: 1500, last_touch: { source: "google", sourceLabel: "Google Ads", campaign: "Marca" } }],
    chats: [{ id: "chat1", leadId: "lead1" }],
    appointments: [{ id: "meeting1", leadId: "lead1", status: "completed" }],
    proposals: [{ id: "proposal1", leadId: "lead1", status: "Aprovado", valorTotal: 1500 }],
    finance: [{ id: "finance1", leadId: "lead1", tipo: "Receita", status: "pago", valor: 1500 }],
    snapshots: [{ id: "snap1", dateRef: "2026-09-02", platform: "google_ads", campaignName: "Marca", spend: 300, clicks: 30, impressions: 3000 }],
  });
  assert.equal(report.totals.visitors, 1);
  assert.equal(report.totals.leads, 1);
  assert.equal(report.totals.conversations, 1);
  assert.equal(report.totals.qualified, 1);
  assert.equal(report.totals.meetings, 1);
  assert.equal(report.totals.proposals, 1);
  assert.equal(report.totals.won, 1);
  assert.equal(report.totals.customers, 1);
  assert.equal(report.totals.revenue, 1500);
  assert.equal(report.totals.spend, 300);
  assert.equal(report.totals.roas, 5);
  assert.equal(report.coverage.linkedTrackedEvents, 1);
});

test("Revenue Graph keeps unlinked traffic visible and excludes leads outside the cohort", () => {
  const report = buildRevenueGraph({
    from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z",
    events: [{ id: "e1", name: "page_view", occurredAt: "2026-09-03T00:00:00.000Z", anonymousId: "anon", sessionId: "session", attribution: {} }],
    leads: [{ id: "old", createdAt: "2026-08-01T00:00:00.000Z", pipelineStage: "ganho", last_touch: { campaign: "Antiga" } }],
    chats: [], appointments: [], proposals: [], finance: [{ id: "f", leadId: "old", tipo: "Receita", status: "pago", valor: 900 }], snapshots: [],
  });
  assert.equal(report.totals.visitors, 1);
  assert.equal(report.totals.leads, 0);
  assert.equal(report.totals.revenue, 0);
  assert.equal(report.coverage.linkedTrackedEvents, 0);
});
