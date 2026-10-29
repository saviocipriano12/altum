import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { crmFieldValue, type OwnedCrmField } from "@/lib/server/crm/field-ownership";
import type { TenantAutomationDoc } from "@/lib/server/automations";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { stageAutomationSourceKindForType, businessAutomationTrigger } from "@/lib/server/crm/stage-source-contract";

/** A marker on the lead alone is not proof of an accepted proposal action. */
export async function assertProposalCrmProjection(tx: FirebaseFirestore.Transaction, input: {
  source: FirebaseFirestore.DocumentData; sourceId: string; lead: FirebaseFirestore.DocumentData; field: OwnedCrmField;
}) {
  return assertBusinessCrmProjection(tx, input, false);
}
export async function assertStageCrmProjection(tx: FirebaseFirestore.Transaction, input: {
  source: FirebaseFirestore.DocumentData; sourceId: string; lead: FirebaseFirestore.DocumentData; field: OwnedCrmField;
}) {
  return assertBusinessCrmProjection(tx, input, true);
}

async function assertBusinessCrmProjection(tx: FirebaseFirestore.Transaction, input: {
  source: FirebaseFirestore.DocumentData; sourceId: string; lead: FirebaseFirestore.DocumentData; field: OwnedCrmField;
}, stage: boolean) {
  const { source, sourceId, lead, field } = input, namespace = stage ? "stage" : "proposal", projection = source[`${namespace}CrmProjection`]?.[field];
  const kind = stageAutomationSourceKindForType(source.type);
  const sourceMetadata = stage ? { stageSourceId: sourceId, stageSourceKind: kind } : { proposalSourceId: sourceId };
  const receiptType = stage ? "automation_stage_internal_effect" : "automation_proposal_internal_effect", prefix = stage ? "stage_effect_" : "proposal_effect_";
  if (projection === undefined) return false;
  const invalid = () => { throw new Error(stage ? "CRM_STAGE_CRM_PROJECTION_INVALID" : "PROPOSAL_CRM_PROJECTION_INVALID"); };
  if (!projection || typeof projection !== "object" || source[`${namespace}CrmProtocolVersion`] !== 1 ||
      stage && (!kind || source.stageInternalEffectProtocolVersion !== 1 || source.stageAutomationProtocolVersion !== 1) ||
      typeof projection.receiptId !== "string" || !new RegExp(`^${prefix}[a-f0-9]{64}$`).test(projection.receiptId)) return invalid();
  const receipt = (await tx.get(adminDb.collection("jobs").doc(projection.receiptId))).data();
  const frozen = stage ? source.stageAutomationPlans : source.automationApprovalPlans;
  const plans = Array.isArray(frozen) ? frozen : [];
  const accepted = plans.find((item: TenantAutomationDoc) => item.id === receipt?.automationId) as TenantAutomationDoc | undefined;
  const action = accepted && Array.isArray(accepted.actions) ? [...accepted.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0))[receipt?.actionIndex] : undefined;
  const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const plan = accepted && (({ id, tenantId, name, description, trigger, enabled, status, conditions, actions }) =>
    ({ id, tenantId, name, description, trigger, enabled, status, conditions, actions }))(accepted);
  const expectedField = action?.type === "move_stage" ? "pipelineStage" : action?.type === "add_tag" ? "tags" : action?.type === "set_priority" ? "priority" : null;
  const requested = action?.type === "move_stage" ? normalizePipelineStageId(action.stageId, "") : action?.type === "add_tag" ? action.tag?.trim().toLowerCase() : action?.priority;
  const tags = Array.isArray(receipt?.before) ? receipt.before : typeof receipt?.before === "string" ? receipt.before.split(",").map((tag: string) => tag.trim()).filter(Boolean) : [];
  const expectedAfter = field === "tags" ? [...tags, requested] : requested;
  if (!receipt || receipt.type !== receiptType || receipt.protocolVersion !== 1 || receipt.status !== "done" ||
      Object.entries(sourceMetadata).some(([key, value]) => receipt[key] !== value) ||
      receipt.tenantId !== source.tenantId || receipt.leadId !== source.leadId ||
      stage && (!accepted || accepted.tenantId !== source.tenantId || accepted.trigger !== businessAutomationTrigger(kind)) ||
      receipt.outcome !== "applied" || receipt.field !== field || expectedField !== field || !Number.isSafeInteger(receipt.actionIndex) || receipt.actionIndex < 0 ||
      receipt.completionMeaning !== "crm_mutation_evaluated_not_external_conversion" ||
      projection.receiptId !== `${prefix}${digest(stage ? [source.tenantId, kind, sourceId, receipt.automationId, receipt.actionIndex] : [source.tenantId, sourceId, receipt.automationId, receipt.actionIndex])}` ||
      receipt.fingerprint !== digest([digest(plan), receipt.actionIndex, action]) ||
      !isDeepStrictEqual(receipt.requested, requested) || !isDeepStrictEqual(receipt.after, expectedAfter) ||
      !isDeepStrictEqual(receipt.after, projection.value) || !isDeepStrictEqual(crmFieldValue(lead, field), projection.value) ||
      projection.owner?.source !== (stage ? "stage_automation" : "proposal_automation") ||
      Object.entries(sourceMetadata).some(([key, value]) => projection.owner?.[key] !== value) ||
      projection.owner.locked !== false || projection.owner.automationId !== receipt.automationId || projection.owner.actionIndex !== receipt.actionIndex ||
      projection.owner.automationEffectId !== projection.receiptId || !isDeepStrictEqual(projection.owner.value, projection.value) ||
      !isDeepStrictEqual(lead.crmFieldOwnership?.[field], projection.owner)) return invalid();
  return true;
}
