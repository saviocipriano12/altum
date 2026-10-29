import { createHash } from "node:crypto";
import { SHOPIFY_ACCEPTANCE_SCENARIOS, REBUILD_CAPABILITIES } from "../../tests/fixtures/ai-rebuild-shopify.mts";
import { SHOPIFY_DEVELOPMENT_ADDITIONS } from "../../tests/fixtures/ai-rebuild-shopify-development.mts";
import type { CorpusCase, CorpusFamily, CorpusVariant } from "../../tests/fixtures/ai-rebuild-corpus-types.mts";
import { planShopifyEvaluation } from "./acceptance.mts";

const originalMetadata: Array<[CorpusFamily, CorpusVariant]> = [
  ["catalog", "positive"], ["conversation", "recovery"], ["knowledge", "recovery"], ["learning", "negative"],
  ["crm", "positive"], ["human", "recovery"], ["conversation", "recovery"], ["learning", "negative"],
  ["settings", "negative"], ["resilience", "recovery"],
];
// Partial setups/objective oracles only, not acceptance-ready or semantically
// validated executors. Shared with the actual handler entry point.
export const DEVELOPMENT_HANDLER_CASE_IDS = ["shop-product-direct-link", "shop-price-changed-before-link",
  "shop-product-unpublished", "shop-correction-and-restart"] as const;
export function developmentCorpus(): CorpusCase[] {
  const cases = [...SHOPIFY_ACCEPTANCE_SCENARIOS.map((scenario, index): CorpusCase => ({ scenario,
    family: originalMetadata[index][0], variant: originalMetadata[index][1], critical: true,
    partition: "development", executor: "not_implemented" })), ...SHOPIFY_DEVELOPMENT_ADDITIONS];
  return cases.map(item => ({ ...item, executor: item.scenario.id === "shop-correction-and-restart" ? "cold_handler_partial"
    : (DEVELOPMENT_HANDLER_CASE_IDS as readonly string[]).includes(item.scenario.id) ? "handler_partial" : "not_implemented" }));
}

/** Explicit evaluation opt-in, NOT a security boundary or a claim of blindness. */
export async function evaluationCorpus(options: { includeHoldout: true }): Promise<CorpusCase[]> {
  if (options?.includeHoldout !== true) throw new Error("Holdout nao entra no executor de desenvolvimento.");
  const { SHOPIFY_HOLDOUT_CASES } = await import("../../tests/fixtures/ai-rebuild-shopify-holdout.mts");
  return [...developmentCorpus(), ...SHOPIFY_HOLDOUT_CASES];
}

export function corpusCaseHash(item: CorpusCase) {
  return createHash("sha256").update(JSON.stringify({ scenario: item.scenario, family: item.family,
    variant: item.variant, critical: item.critical, partition: item.partition })).digest("hex");
}
export function summarizeCorpus(cases: CorpusCase[]) {
  const ids = new Set<string>(), signatures = new Set<string>(), issues: string[] = [];
  const required = REBUILD_CAPABILITIES.filter(capability => capability.scope === "required").map(capability => capability.id);
  const coverage = Object.fromEntries(required.map(id => [id, { positive: 0, negative: 0, recovery: 0 }]));
  for (const item of cases) {
    const scenario = item.scenario;
    if (ids.has(scenario.id)) issues.push(`duplicate_id:${scenario.id}`);
    ids.add(scenario.id);
    const signature = scenario.turns.map(turn => turn.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim()).join("\n");
    if (signatures.has(signature)) issues.push(`duplicate_transcript:${scenario.id}`);
    signatures.add(signature);
    if (scenario.turns.length < 4 || scenario.turns.some(turn => !turn.trim()) || scenario.setup.length < 30 ||
      !Object.keys(scenario.expected.facts).length || scenario.expected.evidence.length < 2 ||
      scenario.expected.forbidden.length < 2 || scenario.expected.humanChecks.length < 2) issues.push(`incomplete_specification:${scenario.id}`);
    for (const capability of scenario.capabilities) {
      if (!coverage[capability]) issues.push(`unknown_or_deferred_capability:${scenario.id}:${capability}`);
      else coverage[capability][item.variant]++;
    }
  }
  const plan = planShopifyEvaluation(cases.map(item => ({ scenarioId: item.scenario.id, partition: item.partition, critical: item.critical })));
  return { schemaVersion: "shopify-corpus-v1", ...plan,
    development: cases.filter(item => item.partition === "development").length,
    criticalScenarios: cases.filter(item => item.critical).length,
    specificationIssues: issues, structuralSpecificationsValid: issues.length === 0,
    capabilityCoverage: coverage,
    missingVariants: Object.entries(coverage).flatMap(([id, counts]) => Object.entries(counts)
      .filter(([, count]) => count === 0).map(([variant]) => `${id}:${variant}`)),
    corpusHash: createHash("sha256").update(JSON.stringify(cases.map(item => ({ id: item.scenario.id, hash: corpusCaseHash(item) })))).digest("hex"),
    executableCases: cases.filter(item => item.executor !== "not_implemented").length,
    executorCoverage: "partial_objective_oracles_not_full_acceptance", fullyVerifiedExecutors: 0,
    // This function inventories specifications; it never reads execution records.
    // Null means unmeasured, not zero (real partial inference already exists).
    modelExecutionsCompleted: null, executionHistoryLoaded: false,
    humanReviewCompleted: false, independentHoldoutReviewCompleted: false,
    productReady: false, stageA: "in_progress" };
}
