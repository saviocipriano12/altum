import test from "node:test";
import assert from "node:assert/strict";
import { evaluateDirectLinkJourney } from "../scripts/ai-rebuild/journey-outcome.mts";
import { developmentCorpus, corpusCaseHash } from "../scripts/ai-rebuild/corpus.mts";
import { SHOPIFY_FIXTURE } from "./fixtures/ai-rebuild-shopify.mts";

function fixture() {
  const item = developmentCorpus()[0];
  return { schemaVersion: "shopify-handler-baseline-v1", synthetic: true, sourceUnchanged: true,
    blockedNetwork: [], paidErrors: [], externalBusinessEffectsExecuted: false,
    corpusCase: { id: item.scenario.id, hash: corpusCaseHash(item), partition: "development" },
    catalogProbe: { turns: item.scenario.turns.map((inputText, index) => ({ caseId: item.scenario.id,
      index, inputText, stage: "captado", context: { productId: String(SHOPIFY_FIXTURE.product.id), selection: { Tamanho: "G" } },
      delivered: [{ recipient: "5511000000088", text: index === 3 ? SHOPIFY_FIXTURE.product.url : "Resposta" }] })) } };
}
test("narrow objective success never approves overall quality", () => {
  const result = evaluateDirectLinkJourney(fixture());
  assert.equal(result.status, "objective_checks_passed"); assert.equal(result.qualityApproved, false);
  assert.equal(result.humanReviewCompleted, false); assert.equal(result.liveShopifyTested, false);
});
test("lost product and size fail even when a direct link is sent", () => {
  const data = fixture(); data.catalogProbe.turns[2].context.productId = "";
  data.catalogProbe.turns[3].context.selection.Tamanho = "GG";
  assert.deepEqual(evaluateDirectLinkJourney(data).failedChecks, ["selectedProductRetained", "selectedSizeRetained"]);
});
test("URL in tool metadata, earlier turn, suffix path, homepage or attack domain never counts", () => {
  for (const text of ["https://shop.fixture.invalid", `${SHOPIFY_FIXTURE.product.url}-other`,
    "https://shop.fixture.invalid.attacker.invalid/products/aurora-preta", "Não consegui enviar"]) {
    const data = fixture(); data.catalogProbe.turns[0].delivered[0].text = SHOPIFY_FIXTURE.product.url;
    data.catalogProbe.turns[3].delivered[0].text = text;
    Object.assign(data.catalogProbe, { productUrl: SHOPIFY_FIXTURE.product.url });
    assert.equal(evaluateDirectLinkJourney(data).checks.directProductUrlDelivered, false);
  }
});
test("wrong recipient, false won and missing turns cannot pass or disappear from denominator", () => {
  const data = fixture(); data.catalogProbe.turns[2].stage = "ganho";
  data.catalogProbe.turns[3].delivered[0].recipient = "other";
  assert.equal(evaluateDirectLinkJourney(data).checks.noWrongRecipientObserved, false);
  assert.equal(evaluateDirectLinkJourney(data).checks.noFalseWonStageObserved, false);
  data.catalogProbe.turns.pop();
  const result = evaluateDirectLinkJourney(data);
  assert.equal(result.status, "invalid_attempt"); assert.equal(result.attemptsInDenominator, 1);
});
test("stale case, out-of-order turns and changed sources invalidate attempt", () => {
  const data = fixture(); data.corpusCase.hash = "stale"; data.sourceUnchanged = false;
  data.catalogProbe.turns.reverse();
  assert.deepEqual(evaluateDirectLinkJourney(data).protocolErrors,
    ["case_version_mismatch", "source_changed_during_run", "trajectory_mismatch"]);
});
