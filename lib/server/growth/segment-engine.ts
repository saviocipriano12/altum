/**
 * Operator model and evaluation switch adapted from Dittofeed's
 * packages/isomorphic-lib/src/types.ts and packages/backend-lib/src/segments.ts
 * at commit 52b2bee909744d07dd5d409fd3974d4b95c66766 (MIT).
 */
import { extractLeadAttributionSummary } from "@/lib/server/attribution";
import type { GrowthRow } from "./contracts";

export const growthSegmentFields = ["stage", "source", "campaign", "heat", "score", "potentialValue", "ownerId", "tags"] as const;
export const growthSegmentOperators = ["Equals", "NotEquals", "Exists", "NotExists", "GreaterThanOrEqual", "LessThan", "Includes"] as const;
export type GrowthSegmentField = typeof growthSegmentFields[number];
export type GrowthSegmentOperator = typeof growthSegmentOperators[number];
export type GrowthSegmentCondition = { field: GrowthSegmentField; operator: GrowthSegmentOperator; value?: string | number };

export function normalizeGrowthSegmentConditions(value: unknown): GrowthSegmentCondition[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("INVALID_SEGMENT_DEFINITION");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("INVALID_SEGMENT_DEFINITION");
    const row = item as Record<string, unknown>;
    if (!growthSegmentFields.includes(row.field as GrowthSegmentField) || !growthSegmentOperators.includes(row.operator as GrowthSegmentOperator)) {
      throw new Error("INVALID_SEGMENT_DEFINITION");
    }
    const operator = row.operator as GrowthSegmentOperator;
    const noValue = operator === "Exists" || operator === "NotExists";
    if (!noValue && typeof row.value !== "string" && typeof row.value !== "number") throw new Error("INVALID_SEGMENT_DEFINITION");
    if ((operator === "GreaterThanOrEqual" || operator === "LessThan") && (typeof row.value !== "number" || !Number.isFinite(row.value))) {
      throw new Error("INVALID_SEGMENT_DEFINITION");
    }
    return {
      field: row.field as GrowthSegmentField,
      operator,
      ...(!noValue ? { value: typeof row.value === "string" ? row.value.trim().slice(0, 300) : row.value as number } : {}),
    };
  });
}

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function comparable(value: unknown) {
  return clean(value, 300).toLocaleLowerCase("pt-BR");
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function leadValue(lead: GrowthRow, field: GrowthSegmentField): unknown {
  const attribution = extractLeadAttributionSummary(lead);
  switch (field) {
    case "stage": return clean(lead.pipelineStage || lead.stage, 80);
    case "source": return clean(attribution.sourceLabel || attribution.source || lead.sourceLabel || lead.utmSource || lead.origem, 100);
    case "campaign": return clean(attribution.campaign || lead.campaignName || lead.utmCampaign);
    case "heat": return clean(lead.aiCommercialTemperature || lead.heat, 40);
    case "score": return lead.score;
    case "potentialValue": return lead.potentialValue ?? lead.valorPotencial;
    case "ownerId": return clean(lead.ownerId || lead.assignedTo || lead.ownerUserId || lead.assignedUserId, 180);
    case "tags": return Array.isArray(lead.tags) ? lead.tags.map((item) => clean(item, 80)).filter(Boolean) : [];
  }
}

/** Mirrors Dittofeed's fail-closed operator evaluation for an allowlisted lead trait. */
export function matchesGrowthSegmentCondition(lead: GrowthRow, condition: GrowthSegmentCondition) {
  const actual = leadValue(lead, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case "Equals":
      return comparable(actual) === comparable(expected);
    case "NotEquals":
      return comparable(actual) !== comparable(expected);
    case "Exists":
      return Array.isArray(actual) ? actual.length > 0 : actual !== null && actual !== undefined && comparable(actual) !== "";
    case "NotExists":
      return Array.isArray(actual) ? actual.length === 0 : actual === null || actual === undefined || comparable(actual) === "";
    case "GreaterThanOrEqual": {
      const actualNumber = number(actual);
      const expectedNumber = number(expected);
      return actualNumber != null && expectedNumber != null && actualNumber >= expectedNumber;
    }
    case "LessThan": {
      const actualNumber = number(actual);
      const expectedNumber = number(expected);
      return actualNumber != null && expectedNumber != null && actualNumber < expectedNumber;
    }
    case "Includes":
      return Array.isArray(actual)
        ? actual.some((item) => comparable(item) === comparable(expected))
        : comparable(actual).includes(comparable(expected));
  }
}

export function previewGrowthSegment(input: {
  leads: GrowthRow[];
  conditions: GrowthSegmentCondition[];
  match: "all" | "any";
  sampleLimit?: number;
}) {
  const matched = input.leads.filter((lead) => {
    const results = input.conditions.map((condition) => matchesGrowthSegmentCondition(lead, condition));
    return input.match === "any" ? results.some(Boolean) : results.every(Boolean);
  });
  const byStage: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const lead of matched) {
    const stage = clean(lead.pipelineStage || lead.stage, 80) || "Nao informado";
    const source = String(leadValue(lead, "source") || "Nao informado");
    byStage[stage] = (byStage[stage] || 0) + 1;
    bySource[source] = (bySource[source] || 0) + 1;
  }
  return {
    totalScanned: input.leads.length,
    totalMatched: matched.length,
    match: input.match,
    conditions: input.conditions,
    byStage,
    bySource,
    sample: matched.slice(0, Math.min(50, Math.max(1, input.sampleLimit || 20))).map((lead) => ({
      leadId: lead.id,
      name: clean(lead.nome || lead.name) || "Lead",
      stage: clean(lead.pipelineStage || lead.stage, 80),
      source: leadValue(lead, "source"),
      campaign: leadValue(lead, "campaign"),
      score: number(lead.score),
      potentialValue: number(lead.potentialValue ?? lead.valorPotencial),
    })),
    source: {
      project: "dittofeed/dittofeed",
      license: "MIT",
      upstreamCommit: "52b2bee909744d07dd5d409fd3974d4b95c66766",
      adaptation: "Operadores declarativos do motor de segmentos aplicados a campos comerciais permitidos da Altum.",
    },
  };
}
