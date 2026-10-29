import { isExactCrmRecordId } from "./crm-observation-identity";

export type CommercialRecordIdentity = {
  contactId: string | null;
  recordKind: "legacy" | "opportunity";
  opportunityTitle: string;
};

export function commercialRecordIdentity(row: Record<string, unknown>): CommercialRecordIdentity {
  return {
    contactId: isExactCrmRecordId(row.contactId, 220) ? row.contactId : null,
    recordKind: row.recordKind === "opportunity" ? "opportunity" : "legacy",
    opportunityTitle: typeof row.opportunityTitle === "string" ? row.opportunityTitle.trim().slice(0, 180) : "",
  };
}

/** An explicit unknown value must never resurrect a previous legacy estimate. */
export function commercialPotentialValue(row: Record<string, unknown>): number | null {
  const value = Object.hasOwn(row, "potentialValue") ? row.potentialValue : row.valorPotencial;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function commercialValueCoverage(rows: ReadonlyArray<{ potentialValue?: number | null }>) {
  let totalValue = 0, knownValueCount = 0;
  for (const row of rows) {
    if (typeof row.potentialValue !== "number" || !Number.isFinite(row.potentialValue) || row.potentialValue < 0) continue;
    totalValue += row.potentialValue; knownValueCount++;
  }
  return { totalValue, knownValueCount, unknownValueCount: rows.length - knownValueCount };
}

export function parseCommercialPotentialValue(value: unknown): { ok: true; value: number | null } | { ok: false } {
  if (value === undefined || value === null || typeof value === "string" && !value.trim()) return { ok: true, value: null };
  const parsed = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1e12 ? { ok: true, value: parsed } : { ok: false };
}
