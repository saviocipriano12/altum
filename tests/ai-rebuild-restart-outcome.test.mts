import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { evaluateRestartJourney, evaluateShopifyDevelopmentJourney } from "../scripts/ai-rebuild/journey-outcome.mts";
import { developmentCorpus, corpusCaseHash } from "../scripts/ai-rebuild/corpus.mts";
import { SHOPIFY_FIXTURE } from "./fixtures/ai-rebuild-shopify.mts";
import { runColdHandlerTurn } from "../scripts/ai-rebuild/cold-handler-turn.mts";

function fixture() {
  const item = developmentCorpus().find(row => row.scenario.id === "shop-correction-and-restart")!;
  return { schemaVersion: "shopify-handler-baseline-v1", synthetic: true, sourceUnchanged: true,
    blockedNetwork: [], paidErrors: [], externalBusinessEffectsExecuted: false,
    corpusCase: { id: item.scenario.id, hash: corpusCaseHash(item), partition: "development" },
    catalogProbe: { turns: item.scenario.turns.map((inputText, index) => ({ caseId: item.scenario.id,
      index, inputText, stage: "captado", context: { productId: String(SHOPIFY_FIXTURE.product.id), selection: { Tamanho: index ? "GG" : "G" } },
      worker: { pid: 2000 + index, bootId: randomUUID(), execution: "fresh_process" },
      requests: [{ failed: false, returnedProductIds: [String(SHOPIFY_FIXTURE.product.id)], fixturePrice: "149.90", fixtureOnlineStoreUrl: String(SHOPIFY_FIXTURE.product.url) }],
      delivered: [{ recipient: "5511000000088", text: index ? "Aurora GG" : "Aurora G" }],
    })) } };
}
test("restart oracle checks persisted correction, fresh workers and resumed lookup, not quality", () => {
  const result = evaluateShopifyDevelopmentJourney(fixture());
  assert.equal(result.objectiveChecksPassed, true); assert.equal(result.qualityApproved, false);
  assert.ok(result.remainingEvidence.includes("long_term_elapsed_time"));
});
test("reused worker metadata or missing worker proof cannot prove restart", () => {
  const data = fixture(); data.catalogProbe.turns[1].worker = data.catalogProbe.turns[0].worker;
  assert.equal(evaluateRestartJourney(data).checks.fourFreshWorkersObserved, false);
  Object.assign(data.catalogProbe.turns[2], { worker: null });
  assert.equal(evaluateRestartJourney(data).checks.fourFreshWorkersObserved, false);
});
test("G after correction, wrong product or silent paused resume remain failures", () => {
  const data = fixture(); data.catalogProbe.turns[2].context.selection.Tamanho = "G";
  data.catalogProbe.turns[3].context.productId = "other-product";
  data.catalogProbe.turns[3].requests = []; data.catalogProbe.turns[3].delivered = [];
  const result = evaluateRestartJourney(data);
  assert.equal(result.checks.correctionPersisted, false); assert.equal(result.checks.productRetainedAcrossWorkers, false);
  assert.equal(result.checks.resumedLookupObserved, false); assert.equal(result.status, "failed");
});
test("stale version and dropped turn remain counted invalid attempts", () => {
  const data = fixture(); data.corpusCase.hash = "old"; data.catalogProbe.turns.pop();
  const result = evaluateRestartJourney(data);
  assert.deepEqual(result.protocolErrors, ["case_version_mismatch", "trajectory_mismatch"]);
  assert.equal(result.attemptsInDenominator, 1); assert.equal(result.objectiveChecksPassed, false);
});
test("cold executor rejects any non-demo or foreign IDs before spawning", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env.FIRESTORE_EMULATOR_HOST = "remote:8080";
    await assert.rejects(runColdHandlerTurn({ tenantId: "anything", chatId: "chat", messageId: "msg" }, globalThis.fetch), /emulador local/);
    process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"; process.env.FIREBASE_PROJECT_ID = "demo-altum-ai-rebuild";
    await assert.rejects(runColdHandlerTurn({ tenantId: "real-tenant", chatId: "chat", messageId: "msg" }, globalThis.fetch), /fora da fixture/);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
