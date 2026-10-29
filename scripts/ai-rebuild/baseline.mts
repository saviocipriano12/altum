import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildKnowledgePromptContext } from "../../lib/server/ai/knowledge-context.ts";
import { normalizeShopifyLiveCatalog } from "../../lib/shopify-live-catalog.ts";
import { resolveCatalogConversation } from "../../lib/shopify-conversation-catalog.ts";
import { REBUILD_CAPABILITIES, SHOPIFY_ACCEPTANCE_SCENARIOS, SHOPIFY_FIXTURE } from "../../tests/fixtures/ai-rebuild-shopify.mts";
import { planShopifyEvaluation } from "./acceptance.mts";

const root = fileURLToPath(new URL("../../", import.meta.url));
export type BaselineFinding = {
  id: string; kind: "behavior" | "source_inspection"; gapObserved: boolean;
  expected: string; observed: Record<string, unknown>;
};

/** Pure/local diagnostics. No API key, Firebase, messaging, model or network imports. */
export async function collectShopifyRebuildBaseline() {
  const criticalFiles = ["lib/server/ai/agent.ts", "lib/server/ai/router.ts", "lib/server/ai/knowledge-context.ts", "lib/shopify-conversation-catalog.ts"];
  const sources: Record<string, string> = Object.fromEntries(await Promise.all(criticalFiles.map(async file => [file, await readFile(resolve(root, file), "utf8")])));
  const hashSources = () => Object.fromEntries(Object.entries(sources).map(([file, content]) => [file, createHash("sha256").update(content).digest("hex")]));
  const sourceHashes = hashSources();
  const findings: BaselineFinding[] = [];

  const knowledge = Array.from({ length: 5 }, (_, i) => ({ id: `synthetic-policy-${i}`, type: "policy" as const,
    content: i === 4 ? "SYNTHETIC_RELEVANT_POLICY: troca mediante conferência do pedido." : `Documento auxiliar ${i}.` }));
  const prompt = buildKnowledgePromptContext(knowledge);
  findings.push({ id: "knowledge_fifth_document_omitted", kind: "behavior", gapObserved: !prompt.includes("SYNTHETIC_RELEVANT_POLICY"),
    expected: "A fonte relevante selecionada não deve ser descartada apenas por ser a quinta.",
    observed: { inputDocuments: 5, relevantDocumentIncluded: prompt.includes("SYNTHETIC_RELEVANT_POLICY") } });

  const longPrompt = buildKnowledgePromptContext([{ id: "synthetic-long", type: "policy", content: `${"Texto auxiliar. ".repeat(110)}SYNTHETIC_POLICY_TAIL` }]);
  findings.push({ id: "knowledge_policy_tail_cut", kind: "behavior", gapObserved: !longPrompt.includes("SYNTHETIC_POLICY_TAIL"),
    expected: "Trecho relevante no fim de documento deve ser recuperável, não perdido por corte cego.",
    observed: { policyTailIncluded: longPrompt.includes("SYNTHETIC_POLICY_TAIL"), promptCharacters: longPrompt.length } });

  const now = Date.parse("2026-10-19T12:00:00Z");
  const { product } = SHOPIFY_FIXTURE;
  const catalog = normalizeShopifyLiveCatalog({ shop: { currencyCode: product.currency }, products: { pageInfo: { hasNextPage: false }, nodes: [{
    id: product.id, title: product.title, status: "ACTIVE", onlineStoreUrl: product.url,
    variants: { pageInfo: { hasNextPage: false }, nodes: product.sizes.map((size, index) => ({
      id: `gid://shopify/ProductVariant/${9010 + index}`, title: size, price: product.price,
      selectedOptions: [{ name: "Tamanho", value: size }], availableForSale: true,
      inventoryQuantity: 3, sellableOnlineQuantity: 3, inventoryPolicy: "DENY",
    })) },
  }] } }, SHOPIFY_FIXTURE.connectionId, new Date(now).toISOString());
  const turn = resolveCatalogConversation({ catalog, inboundText: "Quero a Aurora preta no G, manda o link para comprar", now });
  findings.push({ id: "stock_reply_missing_direct_product_link", kind: "behavior", gapObserved: turn.status === "in_stock" && !turn.responseText.includes(product.url),
    expected: "Após consulta válida e pedido explícito, entregar o link direto do produto correto.",
    observed: { status: turn.status, directUrlIncluded: turn.responseText.includes(product.url), text: turn.responseText } });

  const agent = sources["lib/server/ai/agent.ts"];
  findings.push({ id: "upstream_message_cut_1200", kind: "source_inspection", gapObserved: /sanitizeText\(data\.(aiNormalizedText|text), 1200\)/.test(agent),
    expected: "Contexto não pode depender de recuperar texto já descartado antes do router.",
    observed: { fixed1200CharacterCut: /sanitizeText\(data\.(aiNormalizedText|text), 1200\)/.test(agent) } });
  findings.push({ id: "semantic_search_fixed_synonyms", kind: "source_inspection", gapObserved: agent.includes("const SEMANTIC_KEYWORD_GROUPS") && agent.includes("expandSemanticWords(messageWords)"),
    expected: "Busca por significado precisa ser avaliada como tal, não presumida pelo nome semantic.",
    observed: { fixedSynonymGroupsInRetrieval: agent.includes("const SEMANTIC_KEYWORD_GROUPS") && agent.includes("expandSemanticWords(messageWords)") } });

  const finalSources = await Promise.all(criticalFiles.map(async file => [file, createHash("sha256").update(await readFile(resolve(root, file))).digest("hex")]));
  const sourceUnchanged = finalSources.every(([file, hash]) => sourceHashes[file] === hash);
  const covered = new Set(SHOPIFY_ACCEPTANCE_SCENARIOS.flatMap(s => s.capabilities));
  return { schemaVersion: "shopify-rebuild-baseline-v1", capturedAt: new Date().toISOString(), synthetic: true,
    boundary: "Local pure-function reproductions and source inspection only; not a model, full-agent, connector or channel evaluation.",
    externalEffectsExecuted: false, paidModelCalls: 0, sourceUnchanged, sourceHashes,
    capabilityCount: REBUILD_CAPABILITIES.length, scenarioSpecifications: SHOPIFY_ACCEPTANCE_SCENARIOS.length,
    // Existing ten cases are development inputs already inspected during design;
    // none can be relabelled as an untouched holdout.
    evaluationPlan: planShopifyEvaluation(SHOPIFY_ACCEPTANCE_SCENARIOS.map(s => ({ scenarioId: s.id,
      partition: "development", critical: true }))),
    requiredWithoutScenario: REBUILD_CAPABILITIES.filter(c => c.scope === "required" && !covered.has(c.id)).map(c => c.id),
    deferredCapabilities: REBUILD_CAPABILITIES.filter(c => c.scope === "deferred").map(c => c.id),
    observedGapCount: findings.filter(f => f.gapObserved).length, findings,
    acceptance: { stageA: "in_progress", productReady: false, modelQualityTested: false, liveShopifyTested: false } };
}
