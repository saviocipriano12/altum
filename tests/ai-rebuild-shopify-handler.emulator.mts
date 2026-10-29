import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { collectHandlerBaseline } from "../scripts/ai-rebuild/handler-baseline.mts";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
test("Shopify diagnostic exercises real handler/provider with faithful query fixtures and records failures without approving product", async () => {
  const lookupBefore = dns.lookup, fetchBefore = globalThis.fetch;
  const report = await collectHandlerBaseline({ shopify: true });
  assert.equal(dns.lookup, lookupBefore); assert.equal(globalThis.fetch, fetchBefore);
  assert.equal(report.sourceUnchanged, true); assert.deepEqual(report.blockedNetwork, []);
  assert.equal(report.paidModelCalls, 0); assert.equal(report.externalEffectsExecuted, false);
  assert.equal(report.passiveProbe.deliveryWhilePaused, 0);
  const catalog = report.catalogProbe!;
  assert.ok(catalog); assert.equal(catalog.turns.length, 9);
  assert.equal(new Set(catalog.turns.map(turn => turn.caseId)).size, 3);
  assert.ok(catalog.requests.length >= 6);
  assert.ok(catalog.requests.every(request => /^query AltumLive(?:Product|Catalog)\(/.test(request.query)));
  for (const caseId of ["purchase-link", "size-correction", "lookup-failure"]) {
    const selected = catalog.turns.find(turn => turn.caseId === caseId && turn.index === 1)!;
    assert.equal(selected.context?.productId, catalog.productId);
    assert.equal(selected.context?.selection?.Tamanho, caseId === "lookup-failure" ? "GG" : "G");
    assert.equal(selected.result.reason, "shopify_live_in_stock");
  }
  assert.ok(catalog.turns.every(turn => turn.stage === "captado"), "Consultation must not mark sale as won");
  const failure = catalog.turns.find(turn => turn.caseId === "lookup-failure" && turn.index === 2)!;
  assert.ok(failure.requests.some(request => request.failed));
  assert.equal(failure.result.decision, "handoff");
  assert.ok(failure.delivered.every(item => !item.text.includes("está disponível")));
  // Diagnostic consistency, not an assertion that the bugs must remain forever.
  assert.equal(catalog.findings.some(item => item.id === "requested_product_link_not_delivered"), !catalog.directProductUrlDelivered);
  assert.equal(catalog.findings.some(item => item.id === "size_correction_not_applied"), !catalog.correctionRetained);
  const correction = catalog.turns.find(turn => turn.caseId === "size-correction" && turn.index === 2)!;
  if (correction.requests.some(request => String(request.variables.query).includes("title:verdade*"))) {
    assert.equal(correction.result.decision, "handoff", "Fixture must not return Aurora for a search for verdade");
  }
  assert.equal(report.acceptance.productReady, false); assert.equal(report.acceptance.liveShopifyTested, false);
});
