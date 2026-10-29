/** Compatibility boundary for current commercial data. CRM fields are the
 * current record; AI memories and annotations are fallbacks for unmigrated data.
 * An explicitly empty field is a value, never permission to revive an alias. */
export const commercialFieldDefinitions = {
  businessType: { custom: "nicho", aliases: ["aiBusinessType"] },
  primaryGoal: { custom: "objetivo_principal", aliases: ["aiPrimaryGoal"] },
  budgetBand: { custom: "orcamento", aliases: ["aiBudgetBand"], legacyCustom: ["budget"] },
  urgency: { custom: "urgencia", aliases: ["aiUrgency"] },
  city: { custom: "cidade", aliases: ["aiCity"] },
  teamSize: { custom: "tamanho_time", aliases: ["aiTeamSize"] },
  currentChannels: { custom: "canais_atuais", aliases: ["aiCurrentChannels"] },
  digitalMaturity: { custom: "maturidade_digital", aliases: ["aiDigitalMaturity"] },
  serviceInterest: { custom: "servico_interesse", aliases: [] },
  decisionMaker: { custom: "decisor", aliases: ["aiDecisionMaker"] },
  need: { custom: "necessidade", aliases: [] },
  deadline: { custom: "prazo", aliases: [] },
  dominantObjection: { custom: "objecao_principal", aliases: ["aiDominantObjection"] },
} as const;
export type CommercialField = keyof typeof commercialFieldDefinitions;
type CommercialRecord = { customFields?: unknown; aiFieldEvidence?: unknown; aiMemory?: unknown };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 320)
  : typeof value === "number" && Number.isFinite(value) ? String(value) : "";

export function currentCommercialField(lead: CommercialRecord | null | undefined, field: CommercialField, legacyValues: unknown[] = []) {
  const definition = commercialFieldDefinitions[field], custom = record(lead?.customFields), evidence = record(lead?.aiFieldEvidence);
  const proof = record(evidence[`custom.${definition.custom}`]);
  if (Object.hasOwn(custom, definition.custom)) return { value: text(custom[definition.custom]), authoritative: true };
  // Manual ownership also fences incomplete old projections. A release changes
  // future update policy, not the authority of the value already reviewed.
  if (proof.source === "manual") return { value: text(proof.value), authoritative: true };
  const row = record(lead), memory = record(lead?.aiMemory);
  const legacyCustom = "legacyCustom" in definition ? definition.legacyCustom.map(key => custom[key]) : [];
  for (const candidate of [...legacyValues, ...definition.aliases.map(key => row[key]), memory[field], ...legacyCustom, proof.value, record(evidence[field]).value]) {
    const value = text(candidate);
    if (value) return { value, authoritative: false };
  }
  return { value: "", authoritative: false };
}
