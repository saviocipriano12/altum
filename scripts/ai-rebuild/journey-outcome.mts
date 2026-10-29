import { z } from "zod";
import { developmentCorpus, corpusCaseHash } from "./corpus.mts";
import { SHOPIFY_FIXTURE } from "../../tests/fixtures/ai-rebuild-shopify.mts";

// A narrow state/delivery oracle. Not a natural-language judge, authenticated
// provider receipt, full acceptance trace or replacement for the 104-case suite.
const artifactSchema = z.object({
  schemaVersion: z.literal("shopify-handler-baseline-v1"), synthetic: z.literal(true),
  sourceUnchanged: z.boolean(), blockedNetwork: z.array(z.unknown()),
  externalBusinessEffectsExecuted: z.boolean(), paidErrors: z.array(z.unknown()),
  corpusCase: z.object({ id: z.string(), hash: z.string(), partition: z.literal("development") }),
  catalogProbe: z.object({ turns: z.array(z.object({
    caseId: z.string(), index: z.number().int().nonnegative(), inputText: z.string(),
    delivered: z.array(z.object({ text: z.string(), recipient: z.string() })),
    context: z.object({ productId: z.string(), selection: z.record(z.string(), z.string()) }).passthrough().nullable(),
    stage: z.string().nullable(),
    requests: z.array(z.object({ failed: z.boolean(), fixturePrice: z.string(),
      fixtureOnlineStoreUrl: z.string().nullable(), returnedProductIds: z.array(z.string()).optional(),
    }).passthrough()).optional(),
    worker: z.object({ pid: z.number().int().positive(), bootId: z.string().uuid(), execution: z.literal("fresh_process") }).nullable().optional(),
  }).passthrough()) }).passthrough(),
}).passthrough();

export function evaluateDirectLinkJourney(raw: unknown) {
  const artifact = artifactSchema.parse(raw);
  const item = developmentCorpus().find(row => row.scenario.id === "shop-product-direct-link")!;
  const protocolErrors: string[] = [];
  if (artifact.corpusCase.id !== item.scenario.id || artifact.corpusCase.hash !== corpusCaseHash(item)) protocolErrors.push("case_version_mismatch");
  if (!artifact.sourceUnchanged) protocolErrors.push("source_changed_during_run");
  if (artifact.blockedNetwork.length || artifact.paidErrors.length || artifact.externalBusinessEffectsExecuted) protocolErrors.push("execution_boundary_failure");
  const turns = artifact.catalogProbe.turns;
  if (turns.length !== item.scenario.turns.length || turns.some((turn, index) =>
    turn.index !== index || turn.caseId !== item.scenario.id || turn.inputText !== item.scenario.turns[index])) protocolErrors.push("trajectory_mismatch");
  const selections = turns.filter(turn => turn.index >= 1);
  const checks = {
    selectedProductRetained: selections.length === 3 && selections.every(turn => turn.context?.productId === SHOPIFY_FIXTURE.product.id),
    selectedSizeRetained: selections.length === 3 && selections.every(turn => turn.context?.selection.Tamanho === "G"),
    // Only actual channel interception on the requested-link turn counts. A URL
    // in prompts, tool output, metadata, earlier text or another case is not delivery.
    directProductUrlDelivered: turns.at(3)?.delivered.some(message => {
      const urls = message.text.match(/https?:\/\/[^\s<>"']+/g) || [];
      return urls.some(candidate => {
        try {
          const url = new URL(candidate.replace(/[).,;!?]+$/, ""));
          return url.origin === new URL(SHOPIFY_FIXTURE.product.url).origin &&
            url.pathname === new URL(SHOPIFY_FIXTURE.product.url).pathname && !url.username && !url.password;
        } catch { return false; }
      });
    }) ?? false,
    noWrongRecipientObserved: turns.every(turn => turn.delivered.every(message => message.recipient === "5511000000088")),
    noFalseWonStageObserved: turns.every(turn => turn.stage !== null && !["ganho", "won"].includes(turn.stage.toLowerCase())),
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { schemaVersion: "shopify-journey-outcome-v1", caseId: item.scenario.id, caseHash: corpusCaseHash(item),
    protocolErrors, checks, failedChecks,
    // Infrastructure failures remain failed attempts; never drop them to improve scores.
    status: protocolErrors.length ? "invalid_attempt" : failedChecks.length ? "failed" : "objective_checks_passed",
    attemptsInDenominator: 1, objectiveChecksPassed: protocolErrors.length === 0 && failedChecks.length === 0,
    qualityApproved: false, humanReviewCompleted: false, liveShopifyTested: false,
    remainingEvidence: ["confirmed_variant_stock_price_receipts", "semantic_fidelity", "naturalness_human_review", "real_channel_contract"],
  };
}

/** Two additional development oracles; never silently grades an unknown case. */
export function evaluateCatalogRiskJourney(raw: unknown) {
  const artifact = artifactSchema.parse(raw);
  const id = artifact.corpusCase.id;
  if (!["shop-price-changed-before-link", "shop-product-unpublished"].includes(id)) throw new Error("Caso sem oraculo de risco de catalogo.");
  const item = developmentCorpus().find(row => row.scenario.id === id)!;
  const turns = artifact.catalogProbe.turns;
  const protocolErrors: string[] = [];
  if (artifact.corpusCase.hash !== corpusCaseHash(item)) protocolErrors.push("case_version_mismatch");
  if (!artifact.sourceUnchanged) protocolErrors.push("source_changed_during_run");
  if (artifact.blockedNetwork.length || artifact.paidErrors.length || artifact.externalBusinessEffectsExecuted) protocolErrors.push("execution_boundary_failure");
  if (turns.length !== item.scenario.turns.length || turns.some((turn, index) =>
    turn.index !== index || turn.caseId !== id || turn.inputText !== item.scenario.turns[index])) protocolErrors.push("trajectory_mismatch");
  const returnedProduct = (request: NonNullable<typeof turns[number]["requests"]>[number]) =>
    !request.failed && request.returnedProductIds?.includes(SHOPIFY_FIXTURE.product.id) === true;
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const postChangeText = turns.filter(turn => turn.index >= 2).flatMap(turn => turn.delivered.map(message => message.text));
  const allText = turns.flatMap(turn => turn.delivered.map(message => message.text));
  const common = {
    noWrongRecipientObserved: turns.every(turn => turn.delivered.every(message => message.recipient === "5511000000088")),
    noFalseWonStageObserved: turns.every(turn => turn.stage !== null && !["ganho", "won"].includes(turn.stage.toLowerCase())),
  };
  const checks: Record<string, boolean> = id === "shop-price-changed-before-link" ? {
    firstPriceActuallyReturned: turns.filter(turn => turn.index < 2).some(turn => turn.requests?.some(request => returnedProduct(request) && request.fixturePrice === "149.90")),
    firstPriceCommunicated: turns.filter(turn => turn.index < 2).some(turn => turn.delivered.some(message => /\b149[,.]90\b/.test(message.text))),
    updatedPriceActuallyReturned: turns.filter(turn => turn.index >= 2).some(turn => turn.requests?.some(request => returnedProduct(request) && request.fixturePrice === "169.90")),
    selectedVariantRetained: turns.length === 4 && turns.every(turn => turn.context?.productId === SHOPIFY_FIXTURE.product.id && turn.context.selection.Tamanho === "G"),
    updatedPriceCommunicated: postChangeText.some(text => /\b169[,.]90\b/.test(text)),
    priceChangeAcknowledged: postChangeText.some(text => /\b(mud\w*|alter\w*|atualiz\w*|agora|passou)\b/.test(normalize(text)) && /\b169[,.]90\b/.test(text)),
    ...common,
  } : {
    unpublishedProductActuallyReturned: turns.some(turn => turn.requests?.some(request => returnedProduct(request) && request.fixtureOnlineStoreUrl === null)),
    noUrlInventedObserved: allText.every(text => !/https?:\/\//i.test(text)),
    publicationLimitationExplained: allText.some(text => {
      const normalized = normalize(text);
      return /\b(nao|sem)\b.{0,100}\b(link|endereco|online|publica\w*)\b/.test(normalized) ||
        /\b(link|endereco|online|publica\w*)\b.{0,80}\b(indisponivel|ausente|nao)\b/.test(normalized);
    }),
    ...common,
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { schemaVersion: "shopify-journey-outcome-v1", caseId: id, caseHash: corpusCaseHash(item),
    protocolErrors, checks, failedChecks,
    status: protocolErrors.length ? "invalid_attempt" : failedChecks.length ? "failed" : "objective_checks_passed",
    attemptsInDenominator: 1, objectiveChecksPassed: protocolErrors.length === 0 && failedChecks.length === 0,
    qualityApproved: false, humanReviewCompleted: false, liveShopifyTested: false,
    remainingEvidence: ["semantic_claim_review_including_negation", "naturalness_human_review", "real_channel_contract", "authenticated_tool_receipts"],
  };
}

export function evaluateShopifyDevelopmentJourney(raw: unknown): ReturnType<typeof evaluateCatalogRiskJourney> {
  const artifact = artifactSchema.parse(raw);
  if (artifact.corpusCase.id === "shop-correction-and-restart") return evaluateRestartJourney(artifact);
  return artifact.corpusCase.id === "shop-product-direct-link"
    ? evaluateDirectLinkJourney(artifact) : evaluateCatalogRiskJourney(artifact);
}

export function evaluateRestartJourney(raw: unknown) {
  const artifact = artifactSchema.parse(raw);
  const item = developmentCorpus().find(row => row.scenario.id === "shop-correction-and-restart")!;
  const turns = artifact.catalogProbe.turns;
  const protocolErrors: string[] = [];
  if (artifact.corpusCase.id !== item.scenario.id || artifact.corpusCase.hash !== corpusCaseHash(item)) protocolErrors.push("case_version_mismatch");
  if (!artifact.sourceUnchanged) protocolErrors.push("source_changed_during_run");
  if (artifact.blockedNetwork.length || artifact.paidErrors.length || artifact.externalBusinessEffectsExecuted) protocolErrors.push("execution_boundary_failure");
  if (turns.length !== item.scenario.turns.length || turns.some((turn, index) =>
    turn.index !== index || turn.caseId !== item.scenario.id || turn.inputText !== item.scenario.turns[index])) protocolErrors.push("trajectory_mismatch");
  const freshWorkers = turns.map(turn => turn.worker).filter(worker => worker?.execution === "fresh_process");
  const last = turns.at(3);
  const checks: Record<string, boolean> = {
    fourFreshWorkersObserved: freshWorkers.length === 4 && new Set(freshWorkers.map(worker => worker!.bootId)).size === 4 && new Set(freshWorkers.map(worker => worker!.pid)).size === 4,
    productRetainedAcrossWorkers: turns.length === 4 && turns.every(turn => turn.context?.productId === SHOPIFY_FIXTURE.product.id),
    correctionPersisted: turns.filter(turn => turn.index >= 1).length === 3 && turns.filter(turn => turn.index >= 1).every(turn => turn.context?.selection.Tamanho === "GG"),
    resumedLookupObserved: last?.requests?.some(request => !request.failed && request.returnedProductIds?.includes(SHOPIFY_FIXTURE.product.id)) ?? false,
    resumedSelectionCommunicated: last?.delivered.some(message => /\bGG\b/i.test(message.text)) ?? false,
    noWrongRecipientObserved: turns.every(turn => turn.delivered.every(message => message.recipient === "5511000000088")),
    noFalseWonStageObserved: turns.every(turn => turn.stage !== null && !["ganho", "won"].includes(turn.stage.toLowerCase())),
  };
  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return { schemaVersion: "shopify-journey-outcome-v1", caseId: item.scenario.id, caseHash: corpusCaseHash(item),
    protocolErrors, checks, failedChecks,
    status: protocolErrors.length ? "invalid_attempt" : failedChecks.length ? "failed" : "objective_checks_passed",
    attemptsInDenominator: 1, objectiveChecksPassed: protocolErrors.length === 0 && failedChecks.length === 0,
    qualityApproved: false, humanReviewCompleted: false, liveShopifyTested: false,
    remainingEvidence: ["long_term_elapsed_time", "semantic_claim_review", "naturalness_human_review", "real_channel_contract"],
  };
}
