export const COMMERCIAL_KNOWLEDGE_TEXT_FIELDS = {
  description: 8000,
  benefits: 8000,
  commonQuestions: 8000,
  objections: 8000,
  whenRecommend: 8000,
  whenNotRecommend: 8000,
  whenHuman: 8000,
  productSpecs: 8000,
  stockDelivery: 8000,
  warranty: 8000,
  serviceScope: 8000,
  duration: 4000,
  schedulingRules: 4000,
  deliverables: 8000,
  proofAndCases: 8000,
  demonstration: 4000,
  paymentConditions: 4000,
  supportAndSla: 4000,
} as const;

export type CommercialKnowledgeTextField = keyof typeof COMMERCIAL_KNOWLEDGE_TEXT_FIELDS;
export type CommercialKnowledgeFields = Partial<Record<CommercialKnowledgeTextField, string | null>> & {
  useInAi?: boolean;
};

function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeCommercialKnowledgeFields(
  input: object,
  options: { onlyPresent?: boolean } = {}
): CommercialKnowledgeFields {
  const source = input as Record<string, unknown>;
  const output: CommercialKnowledgeFields = {};
  for (const [field, max] of Object.entries(COMMERCIAL_KNOWLEDGE_TEXT_FIELDS) as Array<
    [CommercialKnowledgeTextField, number]
  >) {
    if (options.onlyPresent && !(field in source)) continue;
    output[field] = clean(source[field], max) || null;
  }
  if (!options.onlyPresent || "useInAi" in source) {
    output.useInAi = source.useInAi !== false;
  }
  return output;
}
