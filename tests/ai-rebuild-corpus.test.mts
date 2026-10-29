import test from "node:test";
import assert from "node:assert/strict";
import { developmentCorpus, evaluationCorpus, summarizeCorpus, corpusCaseHash } from "../scripts/ai-rebuild/corpus.mts";

test("daily development corpus excludes holdout and includes added coverage cases", () => {
  const cases = developmentCorpus();
  assert.equal(cases.length, 74); assert.ok(cases.every(item => item.partition === "development"));
  assert.equal(summarizeCorpus(cases).minimumCountsMet, false);
});
test("evaluation inventory exceeds 100 specifications, reserves 30 and separates partial adapters from acceptance", async () => {
  const cases = await evaluationCorpus({ includeHoldout: true });
  const result = summarizeCorpus(cases);
  assert.equal(result.distinctScenarios, 104); assert.equal(result.development, 74); assert.equal(result.holdout, 30);
  assert.equal(result.minimumCountsMet, true); assert.deepEqual(result.specificationIssues, []);
  assert.equal(result.executableCases, 4); assert.equal(result.modelExecutionsCompleted, null);
  assert.equal(result.executionHistoryLoaded, false); assert.equal(result.fullyVerifiedExecutors, 0);
  assert.equal(result.executorCoverage, "partial_objective_oracles_not_full_acceptance");
  assert.equal(cases.filter(item => item.executor === "cold_handler_partial").length, 1);
  assert.ok(cases.filter(item => item.partition === "holdout").every(item => item.executor === "not_implemented"));
  assert.equal(result.productReady, false); assert.equal(result.qualityApproved, false);
  assert.equal(result.humanReviewCompleted, false); assert.equal(result.independentHoldoutReviewCompleted, false);
  assert.equal(result.paidCallsAuthorized, false); assert.equal(result.stageA, "in_progress");
  assert.equal(result.executions, cases.reduce((sum, item) => sum + (item.critical ? 5 : 3), 0));
  assert.equal(Object.keys(result.capabilityCoverage).length, 19);
  assert.deepEqual(result.missingVariants, []);
  for (const counts of Object.values(result.capabilityCoverage)) assert.ok(counts.positive + counts.negative + counts.recovery > 0);
});
test("case hashes change on expected result or partition change, and malformed/duplicate specifications are rejected", () => {
  const original = developmentCorpus()[0], changed = structuredClone(original);
  changed.scenario.expected.facts.size = "M";
  assert.notEqual(corpusCaseHash(original), corpusCaseHash(changed));
  assert.notEqual(corpusCaseHash(original), corpusCaseHash({ ...original, partition: "holdout" }));
  const duplicateText = { ...original, scenario: { ...original.scenario, id: "new-id-same-dialogue" } };
  assert.ok(summarizeCorpus([original, duplicateText]).specificationIssues.some(issue => issue.startsWith("duplicate_transcript:")));
  const empty = structuredClone(original); empty.scenario.expected.evidence = [];
  assert.ok(summarizeCorpus([empty]).specificationIssues.some(issue => issue.startsWith("incomplete_specification:")));
});
