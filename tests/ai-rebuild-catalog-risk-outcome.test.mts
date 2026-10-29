import test from "node:test";
import assert from "node:assert/strict";
import { evaluateCatalogRiskJourney, evaluateShopifyDevelopmentJourney } from "../scripts/ai-rebuild/journey-outcome.mts";
import { developmentCorpus, corpusCaseHash } from "../scripts/ai-rebuild/corpus.mts";
import { SHOPIFY_FIXTURE } from "./fixtures/ai-rebuild-shopify.mts";

function fixture(id = "shop-price-changed-before-link") {
  const item = developmentCorpus().find(row => row.scenario.id === id)!;
  return { schemaVersion: "shopify-handler-baseline-v1", synthetic: true, sourceUnchanged: true,
    blockedNetwork: [], paidErrors: [], externalBusinessEffectsExecuted: false,
    corpusCase: { id, hash: corpusCaseHash(item), partition: "development" },
    catalogProbe: { turns: item.scenario.turns.map((inputText, index) => ({ caseId: id, index, inputText,
      stage: "captado", context: { productId: String(SHOPIFY_FIXTURE.product.id), selection: { Tamanho: "G" } },
      requests: [{ failed: false, returnedProductIds: [String(SHOPIFY_FIXTURE.product.id)],
        fixturePrice: index < 2 ? "149.90" : "169.90", fixtureOnlineStoreUrl: id === "shop-product-unpublished" ? null : String(SHOPIFY_FIXTURE.product.url) }],
      delivered: [{ recipient: "5511000000088", text: id === "shop-product-unpublished"
        ? "Não há link de compra online confirmado para este produto."
        : index < 2 ? "Custa R$ 149,90." : "O preço mudou: agora está R$ 169,90." }],
    })) } };
}
test("price oracle requires initial price, fresh returned product, variant and communicated change", () => {
  const result = evaluateCatalogRiskJourney(fixture());
  assert.equal(result.objectiveChecksPassed, true); assert.equal(result.qualityApproved, false);
  assert.equal(result.humanReviewCompleted, false);
});
test("fixture price without matched product is not evidence; handoff silence never passes", () => {
  const data = fixture();
  for (const turn of data.catalogProbe.turns) { turn.requests[0].returnedProductIds = []; turn.delivered = []; }
  const result = evaluateShopifyDevelopmentJourney(data);
  assert.equal(result.checks.firstPriceActuallyReturned, false);
  assert.equal(result.checks.updatedPriceActuallyReturned, false);
  assert.equal(result.checks.updatedPriceCommunicated, false); assert.equal(result.status, "failed");
});
test("wrong product or failed request cannot certify current price", () => {
  for (const mode of ["wrong", "failed"]) {
    const data = fixture();
    for (const turn of data.catalogProbe.turns.filter(turn => turn.index >= 2)) {
      if (mode === "wrong") turn.requests[0].returnedProductIds = ["other-product"];
      else turn.requests[0].failed = true;
    }
    assert.equal(evaluateCatalogRiskJourney(data).checks.updatedPriceActuallyReturned, false);
  }
});
test("old price repeated or changed value omitted cannot approve price-change objective", () => {
  const data = fixture();
  for (const turn of data.catalogProbe.turns.filter(turn => turn.index >= 2)) turn.delivered[0].text = "Continua R$ 149,90.";
  assert.equal(evaluateCatalogRiskJourney(data).checks.updatedPriceCommunicated, false);
  assert.equal(evaluateCatalogRiskJourney(data).checks.priceChangeAcknowledged, false);
});
test("unpublished requires matching missing URL and an explanation, not just no delivery", () => {
  const data = fixture("shop-product-unpublished");
  assert.equal(evaluateCatalogRiskJourney(data).objectiveChecksPassed, true);
  for (const turn of data.catalogProbe.turns) turn.delivered = [];
  const result = evaluateCatalogRiskJourney(data);
  assert.equal(result.checks.noUrlInventedObserved, true);
  assert.equal(result.checks.publicationLimitationExplained, false); assert.equal(result.status, "failed");
});
test("invented URL and a normal published object both fail unpublished objective", () => {
  const data = fixture("shop-product-unpublished");
  data.catalogProbe.turns[3].delivered[0].text += ` ${SHOPIFY_FIXTURE.product.url}`;
  assert.equal(evaluateCatalogRiskJourney(data).checks.noUrlInventedObserved, false);
  for (const turn of data.catalogProbe.turns) turn.requests[0].fixtureOnlineStoreUrl = SHOPIFY_FIXTURE.product.url;
  assert.equal(evaluateCatalogRiskJourney(data).checks.unpublishedProductActuallyReturned, false);
});
test("missing response instrumentation, stale version and wrong recipient stay unapproved", () => {
  const data = fixture(); data.corpusCase.hash = "stale";
  data.catalogProbe.turns[0].delivered[0].recipient = "other";
  for (const turn of data.catalogProbe.turns) Object.assign(turn.requests[0], { returnedProductIds: undefined });
  const result = evaluateCatalogRiskJourney(data);
  assert.equal(result.checks.firstPriceActuallyReturned, false); assert.equal(result.checks.noWrongRecipientObserved, false);
  assert.equal(result.status, "invalid_attempt"); assert.equal(result.attemptsInDenominator, 1);
});
test("unknown cases cannot silently inherit another oracle", () => {
  const data = fixture(); data.corpusCase.id = "unknown";
  assert.throws(() => evaluateShopifyDevelopmentJourney(data), /sem oraculo/);
});
