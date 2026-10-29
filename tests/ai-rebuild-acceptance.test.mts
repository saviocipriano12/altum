import test from "node:test";
import assert from "node:assert/strict";
import { SHOPIFY_ACCEPTANCE_SCENARIOS, SHOPIFY_FIXTURE } from "./fixtures/ai-rebuild-shopify.mts";
import { acceptanceScenarioHash, assessShopifyTrace, planShopifyEvaluation, type AcceptanceTrace } from "../scripts/ai-rebuild/acceptance.mts";

const scenario = SHOPIFY_ACCEPTANCE_SCENARIOS[0], tenantId = SHOPIFY_FIXTURE.tenantId;
// Deliberately fabricated trace tests the verifier, NOT the attendance agent.
function trace(): AcceptanceTrace {
  return { schemaVersion: "shopify-acceptance-trace-v1", scenarioId: scenario.id, scenarioHash: acceptanceScenarioHash(scenario),
    runId: "synthetic-verifier-run", tenantId, channel: scenario.channel, engineVersion: "verifier-test-only",
    executionMode: "simulation", startedAtMs: 100, endedAtMs: 500, modelCalls: [],
    turns: scenario.turns.map((inputText, index) => ({ index, inputText, occurredAtMs: 200 + index * 10,
      response: { text: "Resposta sintetica nao avalia naturalidade", status: "draft", claims: [] }, receipts: [],
      evidence: index === 0 ? scenario.expected.evidence.map((kind, i) => ({ id: `e${i}`, kind, tenantId, source: "synthetic-fixture", occurredAtMs: 150 })) : [] })),
    finalFacts: Object.fromEntries(Object.entries(scenario.expected.facts).map(([key, value]) => [key, { value, evidenceIds: ["e0"] }])), findings: [] };
}
const assess = (value: unknown) => assessShopifyTrace(scenario, value, tenantId);

test("conforming simulation cannot approve quality, model evaluation or a product release", () => {
  const result = assess(trace());
  assert.equal(result.contractPassed, true); assert.equal(result.qualityApproved, false);
  assert.equal(result.reviewRequired, true); assert.equal(result.modelReceiptMetadataPresent, false);
});
test("missing turns, wrong scenario revision and invalid schema fail closed", () => {
  const incomplete = trace(); incomplete.turns.pop();
  assert.ok(assess(incomplete).errors.includes("incomplete_conversation"));
  const stale = trace(); stale.scenarioHash = "old";
  assert.ok(assess(stale).errors.includes("scenario_version_mismatch"));
  assert.equal(assess({ passed: true }).contractPassed, false);
});
test("wrong conversation input and reversed time cannot pass on final facts alone", () => {
  const value = trace(); value.turns[1].inputText = "Input diferente"; value.turns[2].occurredAtMs = 120;
  assert.ok(assess(value).errors.includes("conversation_input_mismatch"));
  assert.ok(assess(value).errors.includes("invalid_turn_order"));
});
test("foreign tenant, foreign source and wrong channel are critical even with correct facts", () => {
  const value = trace(); value.tenantId = SHOPIFY_FIXTURE.foreignTenantId;
  value.turns[0].evidence[0].tenantId = SHOPIFY_FIXTURE.foreignTenantId; value.channel = "messenger";
  const result = assess(value);
  assert.equal(result.contractPassed, false);
  for (const code of ["foreign_trace_tenant", "foreign_evidence_tenant", "wrong_channel"]) assert.ok(result.critical.includes(code));
});
test("fact values need source references and all required evidence must be present", () => {
  const value = trace(); value.finalFacts.size = { value: "M", evidenceIds: ["nonexistent"] };
  value.turns[0].evidence.pop();
  assert.ok(assess(value).errors.includes("missing_or_wrong_fact:size"));
  assert.ok(assess(value).errors.includes("fact_without_source:size"));
  assert.ok(assess(value).errors.some(code => code.startsWith("missing_evidence:")));
});
test("uncertain, wrong-object and wrong-operation receipts cannot support completion claims", () => {
  for (const patch of [{ status: "uncertain" as const }, { objectId: "another-product" }, { operation: "inventory_lookup" }]) {
    const value = trace();
    value.turns[0].receipts.push({ id: "action1", tenantId, operation: "action_execute", objectId: "desired-action",
      status: "confirmed", occurredAtMs: 180, source: "synthetic-tool", ...patch });
    value.turns[0].response!.claims.push({ kind: "action_completed", objectId: "desired-action", receiptId: "action1" });
    assert.ok(assess(value).critical.includes("unsupported_operational_claim"));
  }
});
test("stock and price require a fresh verified receipt, not yesterday's imported catalog", () => {
  const value = trace();
  value.turns[0].receipts.push({ id: "stock1", tenantId, operation: "inventory_lookup", objectId: "variant-G",
    status: "confirmed", occurredAtMs: 150, validUntilMs: 199, source: "synthetic-shopify" });
  value.turns[0].response!.claims.push({ kind: "stock", objectId: "variant-G", receiptId: "stock1" });
  assert.ok(assess(value).critical.includes("expired_operational_claim"));
  value.turns[0].receipts[0].validUntilMs = 250;
  assert.equal(assess(value).contractPassed, true);
});
test("duplicate IDs and future evidence cannot fabricate independent proof", () => {
  const value = trace(); value.turns[0].evidence[1].id = "e0"; value.turns[0].evidence[0].occurredAtMs = 450;
  assert.ok(assess(value).errors.includes("duplicate_trace_id"));
  assert.ok(assess(value).errors.includes("invalid_evidence_time"));
});
test("automatic delivery during human takeover is critical; a draft is allowed", () => {
  const human = { ...scenario, mode: "human" as const }, value = trace(); value.scenarioHash = acceptanceScenarioHash(human);
  value.turns[0].response!.status = "queued";
  assert.ok(assessShopifyTrace(human, value, tenantId).critical.includes("reply_during_human_takeover"));
  value.turns[0].response!.status = "draft";
  assert.equal(assessShopifyTrace(human, value, tenantId).contractPassed, true);
});
test("model metadata is not proof of quality and an empty model run is rejected", () => {
  const value = trace(); value.executionMode = "model";
  assert.ok(assess(value).errors.includes("model_execution_without_receipt"));
  value.modelCalls.push({ id: "m1", provider: "synthetic", model: "fake", inputTokens: 20, outputTokens: 10, costUsd: 0 });
  assert.equal(assess(value).qualityApproved, false); // metadata can be fabricated; no quality gate accepts it.
});
test("independent failure finding cannot be cancelled by other correct results", () => {
  const value = trace(); value.findings.push({ code: "invented_url", severity: "critical", source: "independent-verifier" });
  assert.equal(assess(value).contractPassed, false);
});
test("evaluation planning counts all repetitions and rejects duplicate cases without authorizing paid calls", () => {
  assert.throws(() => planShopifyEvaluation([{ scenarioId: "a", partition: "holdout", critical: true },
    { scenarioId: "a", partition: "development", critical: false }]), /duplicados/);
  const plan = planShopifyEvaluation(Array.from({ length: 100 }, (_, i) => ({ scenarioId: `unique-${i}`,
    partition: i < 30 ? "holdout" : "development", critical: i < 10 })));
  assert.equal(plan.executions, 320); assert.equal(plan.holdout, 30); assert.equal(plan.minimumCountsMet, true);
  assert.equal(plan.qualityApproved, false); assert.equal(plan.paidCallsAuthorized, false);
});
