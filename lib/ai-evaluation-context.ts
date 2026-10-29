import { createHash } from "node:crypto";

export const AI_EVALUATION_CONTEXT_FINGERPRINT_VERSION = 5 as const;

export function buildAiEvaluationContextFingerprint(
  items: Array<{
    scenarioId: string;
    tenantContextFingerprint?: string | null;
    roleContractFingerprint?: string | null;
    effectiveAssistantRole?: string | null;
    specialistSupervisorVersion?: string | null;
    specialistExecutionVersion?: string | null;
    actionPlanVersion?: string | null;
    responseComposerVersion?: string | null;
    learningRecommendationFingerprint?: string | null;
  }>
) {
  if (!items.length) return null;
  const normalized = items
    .map((item) => ({
      scenarioId: item.scenarioId.trim(),
      tenantContextFingerprint: item.tenantContextFingerprint?.trim() || "",
      roleContractFingerprint: item.roleContractFingerprint?.trim() || "",
      effectiveAssistantRole: item.effectiveAssistantRole?.trim() || "",
      specialistSupervisorVersion: item.specialistSupervisorVersion?.trim() || "",
      specialistExecutionVersion: item.specialistExecutionVersion?.trim() || "",
      actionPlanVersion: item.actionPlanVersion?.trim() || "",
      responseComposerVersion: item.responseComposerVersion?.trim() || "",
      learningRecommendationFingerprint: item.learningRecommendationFingerprint?.trim() || "",
    }))
    .sort((a, b) => a.scenarioId.localeCompare(b.scenarioId));
  if (
    normalized.some(
      (item) =>
        !item.scenarioId ||
        !item.tenantContextFingerprint ||
        !item.roleContractFingerprint ||
        !item.effectiveAssistantRole ||
        !item.specialistSupervisorVersion ||
        !item.specialistExecutionVersion ||
        !item.actionPlanVersion ||
        !item.responseComposerVersion
    )
  ) {
    return null;
  }
  return createHash("sha256")
    .update(JSON.stringify({ version: AI_EVALUATION_CONTEXT_FINGERPRINT_VERSION, items: normalized }))
    .digest("hex")
    .slice(0, 32);
}
