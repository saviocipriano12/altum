import type { ShopifyAcceptanceScenario } from "./ai-rebuild-shopify.mts";

export type CorpusFamily = "conversation" | "catalog" | "knowledge" | "support" | "crm" | "human" | "learning" | "settings" | "safety" | "resilience";
export type CorpusVariant = "positive" | "negative" | "recovery";
export type CorpusCase = { scenario: ShopifyAcceptanceScenario; family: CorpusFamily; variant: CorpusVariant;
  critical: boolean; partition: "development" | "holdout"; executor: "not_implemented" | "handler_partial" | "cold_handler_partial" };
export type CaseRow = [id: string, variant: CorpusVariant, capabilities: string, setup: string,
  turns: [string, string, string, string], fact: [string, string], evidence: [string, string, ...string[]],
  forbidden: [string, string, ...string[]], success: string, critical?: boolean];

/** Specifications, not fixtures that magically create state or execute a test. */
export function defineCases(family: CorpusFamily, partition: CorpusCase["partition"], rows: CaseRow[],
  channel: ShopifyAcceptanceScenario["channel"] = "whatsapp", mode: ShopifyAcceptanceScenario["mode"] = "respond"): CorpusCase[] {
  return rows.map(([id, variant, capabilities, setup, turns, [key, value], evidence, forbidden, success, critical = true]) => ({
    family, variant, critical, partition, executor: "not_implemented",
    scenario: { id: `shop-${id}`, capabilities: capabilities.split(" "), channel, mode, setup, turns,
      expected: { facts: { [key]: value }, evidence, forbidden,
        humanChecks: [success, "Conferir as quatro falas, necessidade de perguntas e evidencias; nao aprovar somente a ultima frase."] } },
  }));
}
