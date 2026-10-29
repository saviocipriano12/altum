import assert from "node:assert/strict";
import test from "node:test";
import { REBUILD_CAPABILITIES, SHOPIFY_ACCEPTANCE_SCENARIOS, SHOPIFY_FIXTURE } from "./fixtures/ai-rebuild-shopify.mts";
import { collectShopifyRebuildBaseline } from "../scripts/ai-rebuild/baseline.mts";

test("rebuild manifest includes all 21 capabilities without pretending they are implemented", () => {
  assert.deepEqual(REBUILD_CAPABILITIES.map(c => c.id), Array.from({ length: 21 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`));
  assert.ok(REBUILD_CAPABILITIES.every(c => c.implementation === "not_verified"));
  assert.deepEqual(REBUILD_CAPABILITIES.filter(c => c.scope === "deferred").map(c => c.id), ["C06", "C08"]);
});

test("Shopify scenarios have concrete evidence, forbidden outcomes and multi-turn inputs", () => {
  const ids = new Set<string>();
  for (const scenario of SHOPIFY_ACCEPTANCE_SCENARIOS) {
    assert.ok(!ids.has(scenario.id)); ids.add(scenario.id);
    assert.ok(scenario.turns.length >= 4); assert.ok(scenario.setup.length > 30);
    assert.ok(scenario.expected.evidence.length >= 2); assert.ok(scenario.expected.forbidden.length >= 2);
    assert.ok(scenario.expected.humanChecks.length >= 2);
    for (const capability of scenario.capabilities) assert.ok(REBUILD_CAPABILITIES.some(c => c.id === capability && c.scope === "required"));
  }
  assert.ok(SHOPIFY_FIXTURE.product.url.endsWith("/products/aurora-preta"));
  assert.equal(new URL(SHOPIFY_FIXTURE.product.url).hostname, "shop.fixture.invalid");
});

test("baseline is explicitly diagnostic, read-only and cannot approve product or model quality", async () => {
  const report = await collectShopifyRebuildBaseline();
  assert.equal(report.sourceUnchanged, true);
  assert.equal(report.paidModelCalls, 0); assert.equal(report.externalEffectsExecuted, false);
  assert.equal(report.acceptance.productReady, false); assert.equal(report.acceptance.modelQualityTested, false);
  assert.equal(report.acceptance.liveShopifyTested, false); assert.equal(report.acceptance.stageA, "in_progress");
  assert.deepEqual(report.requiredWithoutScenario, []);
  assert.equal(report.findings.length, 5);
  assert.equal(report.evaluationPlan.minimumCountsMet, false);
  assert.equal(report.evaluationPlan.holdout, 0);
  assert.equal(report.evaluationPlan.executions, 50);
  assert.ok(report.findings.some(f => f.kind === "behavior"));
  assert.ok(report.findings.some(f => f.kind === "source_inspection"));
  // No assertion demands that bugs stay present: fixes may change gapObserved to false.
});
