import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrackingOverview,
  eventDocumentId,
  normalizeDomain,
  normalizeDomains,
  normalizeGrowthEvent,
  originIsAllowed,
} from "../lib/server/growth/tracking.ts";

test("normaliza dominios e aceita subdominios autorizados", () => {
  assert.equal(normalizeDomain("https://www.Exemplo.com.br/pagina"), "exemplo.com.br");
  assert.deepEqual(normalizeDomains(["exemplo.com.br", "https://www.exemplo.com.br", "loja.exemplo.com.br"]), ["exemplo.com.br", "loja.exemplo.com.br"]);
  assert.equal(originIsAllowed("https://checkout.exemplo.com.br", ["exemplo.com.br"]), true);
  assert.equal(originIsAllowed("https://exemplo.net", ["exemplo.com.br"]), false);
});

test("aceita evento comercial conhecido e remove query sensivel", () => {
  const event = normalizeGrowthEvent({
    eventId: "evt-1",
    name: "purchase_completed",
    occurredAt: "2026-09-11T12:00:00.000Z",
    anonymousId: "anon-1",
    sessionId: "session-1",
    url: "https://loja.exemplo.com/obrigado?utm_source=google&email=pessoa%40mail.com&gclid=abc",
    referrer: "https://google.com/search?q=segredo&utm_medium=cpc",
    value: 299.9,
    currency: "brl",
    properties: { orderId: "pedido-10", nested: { forbidden: true }, ok: true },
    attribution: { source: "google", medium: "cpc", campaign: "marca" },
  }, new Date("2026-09-11T12:01:00.000Z"));

  assert.ok(event);
  assert.equal(event.name, "purchase_completed");
  assert.equal(event.value, 299.9);
  assert.equal(event.currency, "BRL");
  assert.equal(event.url.includes("email="), false);
  assert.equal(event.url.includes("utm_source=google"), true);
  assert.equal("nested" in event.properties, false);
});

test("rejeita eventos desconhecidos e sem identidade anonima", () => {
  assert.equal(normalizeGrowthEvent({ name: "delete_tenant" }), null);
  assert.equal(normalizeGrowthEvent({ eventId: "1", name: "page_view", sessionId: "s" }), null);
});

test("id de persistencia e deterministico e isolado por tenant", () => {
  assert.equal(eventDocumentId("tenant-a", "evt-1"), eventDocumentId("tenant-a", "evt-1"));
  assert.notEqual(eventDocumentId("tenant-a", "evt-1"), eventDocumentId("tenant-b", "evt-1"));
});

test("resume funil, identidade e receita por campanha", () => {
  const report = buildTrackingOverview([
    { name: "page_view", anonymousId: "a", sessionId: "s", attribution: { source: "google", campaign: "Marca" } },
    { name: "form_submitted", anonymousId: "a", sessionId: "s", attribution: { source: "google", campaign: "Marca" } },
    { name: "purchase_completed", anonymousId: "a", sessionId: "s", value: 499.9, attribution: { source: "google", campaign: "Marca" } },
  ]);
  assert.deepEqual(report.totals, { events: 3, visitors: 1, sessions: 1, pageViews: 1, conversions: 1, sales: 1, revenue: 499.9 });
  assert.equal(report.byCampaign[0].campaign, "Marca");
  assert.equal(report.byCampaign[0].revenue, 499.9);
});
