import { createHash } from "node:crypto";
import { z } from "zod";
import type { ShopifyAcceptanceScenario } from "../../tests/fixtures/ai-rebuild-shopify.mts";

const id = z.string().trim().min(1);
const time = z.number().finite().nonnegative();
const receipt = z.object({
  id, tenantId: id, operation: id, objectId: id,
  status: z.enum(["confirmed", "not_found", "ambiguous", "unavailable", "denied", "uncertain"]),
  occurredAtMs: time, validUntilMs: time.optional(), source: id,
}).strict();
const evidence = z.object({ id, tenantId: id, kind: id, source: id, occurredAtMs: time }).strict();
const claim = z.object({
  kind: z.enum(["stock", "price", "product_url", "action_completed", "seller_notified"]),
  objectId: id, receiptId: id,
}).strict();
export const AcceptanceTraceSchema = z.object({
  schemaVersion: z.literal("shopify-acceptance-trace-v1"), scenarioId: id, scenarioHash: id,
  runId: id, tenantId: id, channel: z.enum(["whatsapp", "instagram", "messenger"]),
  engineVersion: id, executionMode: z.enum(["simulation", "model"]),
  startedAtMs: time, endedAtMs: time,
  modelCalls: z.array(z.object({ id, provider: id, model: id, inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(), costUsd: z.number().finite().nonnegative() }).strict()),
  turns: z.array(z.object({
    index: z.number().int().nonnegative(), inputText: id, occurredAtMs: time,
    response: z.object({ text: id, status: z.enum(["draft", "queued", "sent"]), claims: z.array(claim) }).strict().optional(),
    receipts: z.array(receipt), evidence: z.array(evidence),
  }).strict()),
  finalFacts: z.record(z.string(), z.object({ value: z.string(), evidenceIds: z.array(id).min(1) }).strict()),
  // Runtime checks alone cannot detect every prose violation. These findings must
  // come from independent evaluators, never the agent's own self-assessment.
  findings: z.array(z.object({ code: id, severity: z.enum(["critical", "failure"]), source: id }).strict()),
}).strict();
export type AcceptanceTrace = z.infer<typeof AcceptanceTraceSchema>;

export function acceptanceScenarioHash(scenario: ShopifyAcceptanceScenario) {
  return createHash("sha256").update(JSON.stringify(scenario)).digest("hex");
}

/** Checks trace integrity and explicit obligations, NOT unrestricted prose quality. */
export function assessShopifyTrace(scenario: ShopifyAcceptanceScenario, input: unknown, expectedTenantId: string) {
  const parsed = AcceptanceTraceSchema.safeParse(input);
  if (!parsed.success) return { contractPassed: false, qualityApproved: false as const,
    errors: ["invalid_trace_schema"], critical: [] as string[], reviewRequired: true as const, modelReceiptMetadataPresent: false };
  const trace = parsed.data, errors: string[] = [], critical: string[] = [];
  if (trace.scenarioId !== scenario.id || trace.scenarioHash !== acceptanceScenarioHash(scenario)) errors.push("scenario_version_mismatch");
  if (trace.tenantId !== expectedTenantId) critical.push("foreign_trace_tenant");
  if (trace.channel !== scenario.channel) critical.push("wrong_channel");
  if (trace.endedAtMs < trace.startedAtMs) errors.push("invalid_run_time");
  if (trace.turns.length !== scenario.turns.length) errors.push("incomplete_conversation");
  if (trace.executionMode === "model" && !trace.modelCalls.length) errors.push("model_execution_without_receipt");
  const allIds = new Set<string>(), evidenceById = new Map<string, z.infer<typeof evidence>>();
  const kinds = new Set<string>();
  let previousTime = trace.startedAtMs;
  const checkTime = (value: number) => value >= trace.startedAtMs && value <= trace.endedAtMs;
  for (const call of trace.modelCalls) {
    if (allIds.has(call.id)) errors.push("duplicate_trace_id");
    allIds.add(call.id);
  }
  const operationForClaim = { stock: "inventory_lookup", price: "price_lookup", product_url: "product_lookup",
    action_completed: "action_execute", seller_notified: "seller_notify" } as const;
  for (const [index, turn] of trace.turns.entries()) {
    if (turn.index !== index || turn.inputText !== scenario.turns[index]) errors.push("conversation_input_mismatch");
    if (!checkTime(turn.occurredAtMs) || turn.occurredAtMs < previousTime) errors.push("invalid_turn_order");
    previousTime = turn.occurredAtMs;
    if (scenario.mode === "human" && turn.response && turn.response.status !== "draft") critical.push("reply_during_human_takeover");
    const receipts = new Map<string, z.infer<typeof receipt>>();
    for (const record of [...turn.receipts, ...turn.evidence]) {
      if (record.tenantId !== expectedTenantId) critical.push("foreign_evidence_tenant");
      if (allIds.has(record.id)) errors.push("duplicate_trace_id");
      allIds.add(record.id);
      if (!checkTime(record.occurredAtMs) || record.occurredAtMs > turn.occurredAtMs) errors.push("invalid_evidence_time");
    }
    for (const record of turn.receipts) receipts.set(record.id, record);
    for (const record of turn.evidence) { evidenceById.set(record.id, record); kinds.add(record.kind); }
    for (const stated of turn.response?.claims || []) {
      const proof = receipts.get(stated.receiptId);
      if (!proof || proof.status !== "confirmed" || proof.objectId !== stated.objectId || proof.operation !== operationForClaim[stated.kind]) {
        critical.push("unsupported_operational_claim");
      } else if (["stock", "price"].includes(stated.kind) &&
        (proof.validUntilMs == null || proof.validUntilMs < turn.occurredAtMs || proof.validUntilMs < proof.occurredAtMs)) {
        critical.push("expired_operational_claim");
      }
    }
  }
  for (const [key, expected] of Object.entries(scenario.expected.facts)) {
    const fact = trace.finalFacts[key];
    if (!fact || fact.value !== expected) errors.push(`missing_or_wrong_fact:${key}`);
    if (fact && fact.evidenceIds.some(ref => !evidenceById.has(ref))) errors.push(`fact_without_source:${key}`);
  }
  for (const kind of scenario.expected.evidence) if (!kinds.has(kind)) errors.push(`missing_evidence:${kind}`);
  for (const finding of trace.findings) (finding.severity === "critical" ? critical : errors).push(finding.code);
  return { contractPassed: errors.length === 0 && critical.length === 0,
    // Model-call receipts are provenance metadata, not independent proof of quality.
    // Even a conforming real-model trace needs semantic/state and human review.
    qualityApproved: false as const, errors: [...new Set(errors)], critical: [...new Set(critical)],
    reviewRequired: true as const, modelReceiptMetadataPresent: trace.executionMode === "model" && trace.modelCalls.length > 0 };
}

export type EvaluationCase = { scenarioId: string; partition: "development" | "holdout"; critical: boolean };
export function planShopifyEvaluation(cases: EvaluationCase[]) {
  if (new Set(cases.map(item => item.scenarioId)).size !== cases.length) throw new Error("Cenarios duplicados nao contam como cobertura.");
  return { distinctScenarios: cases.length, holdout: cases.filter(item => item.partition === "holdout").length,
    executions: cases.reduce((sum, item) => sum + (item.critical ? 5 : 3), 0),
    // Counts do not establish distinct business coverage or holdout independence.
    minimumCountsMet: cases.length >= 100 && cases.filter(item => item.partition === "holdout").length >= 30,
    paidCallsAuthorized: false as const, qualityApproved: false as const };
}
