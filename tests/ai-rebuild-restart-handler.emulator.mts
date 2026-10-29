import test from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import { collectHandlerBaseline } from "../scripts/ai-rebuild/handler-baseline.mts";
import { evaluateRestartJourney } from "../scripts/ai-rebuild/journey-outcome.mts";
import { developmentCorpus } from "../scripts/ai-rebuild/corpus.mts";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
test("cold handler executes original restart scenario in four fresh processes without external business effects", async () => {
  const fetchBefore = globalThis.fetch, lookupBefore = dns.lookup;
  const report = await collectHandlerBaseline({ corpusCaseId: "shop-correction-and-restart" });
  assert.equal(globalThis.fetch, fetchBefore); assert.equal(dns.lookup, lookupBefore);
  assert.equal(report.sourceUnchanged, true); assert.deepEqual(report.blockedNetwork, []);
  assert.equal(report.paidModelCalls, 0); assert.equal(report.externalBusinessEffectsExecuted, false);
  const turns = report.catalogProbe!.turns;
  const scenario = developmentCorpus().find(item => item.scenario.id === "shop-correction-and-restart")!.scenario;
  assert.deepEqual(turns.map(turn => turn.inputText), scenario.turns);
  assert.equal(turns.length, 4);
  assert.ok(turns.every(turn => turn.worker?.execution === "fresh_process" && turn.worker.pid !== process.pid));
  assert.equal(new Set(turns.map(turn => turn.worker!.pid)).size, 4);
  assert.equal(new Set(turns.map(turn => turn.worker!.bootId)).size, 4);
  assert.equal(turns[0].context?.selection.Tamanho, "G");
  const outcome = evaluateRestartJourney(report);
  assert.deepEqual(outcome.protocolErrors, []); assert.equal(outcome.checks.fourFreshWorkersObserved, true);
  // This tests the execution boundary and honest oracle, not a permanent bug.
  assert.equal(outcome.checks.correctionPersisted, turns.slice(1).every(turn => turn.context?.selection.Tamanho === "GG"));
  assert.equal(outcome.qualityApproved, false); assert.equal(outcome.liveShopifyTested, false);
  assert.equal(report.passiveProbe.deliveryWhilePaused, 0);
});
