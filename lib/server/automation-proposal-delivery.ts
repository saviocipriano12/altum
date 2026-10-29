import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import { assertProposalAutomationSource } from "@/lib/server/crm/proposal-mutation";
import { normalizeAutomationDoc, type TenantAutomationDoc, type TenantAutomationAction } from "@/lib/server/automations";
import { TenantAccessError } from "@/lib/server/tenant";
import { commitChatOutboundEnqueue } from "@/lib/server/chat-outbound-enqueue";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "@/lib/server/chat-outbound-idempotency";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { InboundAutomationPreparingError } from "@/lib/server/automation-inbound-execution";
import { supportsAtomicAutomationEffect, supportsAtomicCrmEffect, supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";
import { readStageHookProgress } from "@/lib/server/crm/stage-hook-progress";
import { crmFieldValue, crmMutationBaseline, isCrmFieldManuallyOwned, ownedCrmFields, type OwnedCrmField } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { assertProposalCrmProjection, assertStageCrmProjection } from "@/lib/server/crm/proposal-crm-proof";
import type { StageAutomationSource } from "@/lib/server/automation-stage-delivery";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";

export type ProposalAutomationClaim = { id: string; token: string };
function plan(doc: TenantAutomationDoc) {
  const { id, tenantId, name, description, trigger, enabled, status, conditions, actions } = doc;
  return { id, tenantId, name, description, trigger, enabled, status, conditions, actions };
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
type StageApprovalCandidate = Pick<TenantAutomationDoc, "id" | "tenantId" | "enabled" | "status" | "conditions"> & { planDigest: string };
export function stageApprovalCandidateFingerprint(candidates: StageApprovalCandidate[]) {
  return digest(candidates.map(candidate => [candidate.id, candidate.tenantId, candidate.enabled, candidate.status,
    normalizeAutomationDoc(candidate.id, { ...candidate, trigger: "budget_approved", actions: [] }, candidate.tenantId).conditions, candidate.planDigest]));
}
export function readStageApprovalCandidates(row: FirebaseFirestore.DocumentData): StageApprovalCandidate[] {
  const candidates = row.stageApprovalCandidates, ids = new Set<string>();
  if (row.stageApprovalCandidatesClosed === true) {
    if (row.stageApprovalCandidateProtocol !== 1 || typeof row.stageApprovalCandidateFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(row.stageApprovalCandidateFingerprint) ||
        candidates !== undefined || row.automationApprovalProtocol !== 1 || !Array.isArray(row.automationApprovalPlans)) throw new Error("PROPOSAL_STAGE_APPROVAL_CANDIDATES_CLOSED_CHANGED");
    return [];
  }
  if (row.stageApprovalCandidateProtocol !== 1 || !Array.isArray(candidates) || candidates.length > 120) throw new Error("PROPOSAL_STAGE_APPROVAL_CANDIDATES_INVALID");
  for (const candidate of candidates) {
    if (!candidate || typeof candidate.id !== "string" || !candidate.id || candidate.id.length > 500 || candidate.id !== candidate.id.trim() || candidate.id.includes("/") || ids.has(candidate.id) ||
        candidate.tenantId !== row.tenantId || typeof candidate.enabled !== "boolean" || !["active", "paused"].includes(candidate.status) ||
        !candidate.conditions || typeof candidate.conditions !== "object" || Array.isArray(candidate.conditions) || typeof candidate.planDigest !== "string" || !/^[a-f0-9]{64}$/.test(candidate.planDigest)) throw new Error("PROPOSAL_STAGE_APPROVAL_CANDIDATES_INVALID");
    ids.add(candidate.id);
  }
  if (stageApprovalCandidateFingerprint(candidates) !== row.stageApprovalCandidateFingerprint) throw new Error("PROPOSAL_STAGE_APPROVAL_CANDIDATES_CHANGED");
  return candidates;
}
function millis(value: unknown): number {
  return value instanceof Date ? value.getTime() : value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}
function actionAt(doc: TenantAutomationDoc, index: number) {
  return [...doc.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0))[index];
}
export function isProposalAutomationSchedule(id: string, row: Record<string, unknown>) {
  return id.startsWith("proposal_schedule_") || row.proposalScheduleProtocol !== undefined || row.automationProposalSourceId !== undefined ||
    Boolean(row.trigger === "budget_approved" && row.action && typeof row.action === "object" && "type" in row.action &&
      (row.action.type === "send_message" || supportsAtomicAutomationEffect(row.action as TenantAutomationAction)));
}
export function isProposalAutomationAuthorizationError(error: unknown) {
  return error instanceof TenantAccessError || error instanceof TenantPipelineConfigurationError || error instanceof Error && error.message.startsWith("PROPOSAL_");
}

/** Quota belongs to one accepted automation in the proposal occurrence, not to
 * the retry or each action. Reusing its receipt still requires live authority. */
export async function authorizeProposalAutomationReservation(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; sourceId: string; token: string; automationId: string;
}) {
  if (!input.automationId || input.automationId !== input.automationId.trim() || input.automationId.includes("/")) {
    throw new Error("PROPOSAL_AUTOMATION_RESERVATION_INVALID");
  }
  const raw = await tx.get(adminDb.collection("jobs").doc(input.sourceId));
  const source = await assertProposalAutomationSource(tx, { id: input.sourceId, tenantId: input.tenantId,
    leadId: String(raw.data()?.leadId || ""), token: input.token });
  const row = source.data()!, plans = row.automationApprovalPlans;
  if (row.automationApprovalProtocol !== 1 || !Array.isArray(plans)) throw new Error("PROPOSAL_AUTOMATION_PLAN_MISSING");
  const candidates = plans.filter(item => item.id === input.automationId) as TenantAutomationDoc[];
  const accepted = candidates[0];
  if (candidates.length !== 1 || accepted.tenantId !== input.tenantId || accepted.trigger !== "budget_approved") {
    throw new Error("PROPOSAL_AUTOMATION_RESERVATION_UNBOUND");
  }
  const current = await tx.get(adminDb.collection("automations").doc(input.automationId));
  const planDigest = digest(plan(accepted));
  if (!current.exists || current.data()?.tenantId !== input.tenantId ||
      digest(plan(normalizeAutomationDoc(current.id, current.data()!, input.tenantId))) !== planDigest) {
    throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_REVOKED");
  }
  return { key: digest(input.automationId), planDigest };
}

function routingDigest(chat: FirebaseFirestore.DocumentData, channel: FirebaseFirestore.DocumentData) {
  return digest([chat.channel || "whatsapp", chat.channelId || null, chat.contactPhone || null, chat.contactExternalId || null,
    chat.channelPhoneNumberId || null, chat.channelExternalAccountId || null, channel.tenantId, channel.type, channel.provider || null,
    channel.status || null, channel.phoneNumberId || null, channel.externalAccountId || null, channel.pageId || null,
    channel.ownerUserId || null, channel.channelScope || null, channel.metadata?.sessionId || null, channel.metadata?.gatewayEndpoint || null]);
}
export function proposalAutomationFingerprint(job: Record<string, unknown>) {
  const marked = String(job.clientRequestId || "").startsWith("proposal-");
  if (!marked && job.automationProposalProtocol === undefined && job.automationProposalSourceId === undefined) return null;
  if (job.automationProposalProtocol !== 1 || job.origin !== "automation" || job.replyToId != null ||
      ![job.tenantId, job.chatId, job.automationProposalSourceId, job.automationSourceLeadId, job.automationId, job.automationProposalPlanDigest, job.automationProposalRoutingDigest]
        .every(value => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/")) ||
      !Number.isSafeInteger(job.automationActionIndex) || Number(job.automationActionIndex) < 0) throw new Error("PROPOSAL_AUTOMATION_PROTOCOL_INVALID");
  const metadata = { automationProposalProtocol: 1, automationProposalSourceId: job.automationProposalSourceId,
    automationSourceLeadId: job.automationSourceLeadId, automationId: job.automationId, automationActionIndex: job.automationActionIndex,
    automationProposalPlanDigest: job.automationProposalPlanDigest, automationProposalRoutingDigest: job.automationProposalRoutingDigest,
    ...(job.proposalScheduledJobId !== undefined || job.proposalScheduledGuardVersion !== undefined ? {
      proposalScheduledJobId: job.proposalScheduledJobId, proposalScheduledGuardVersion: job.proposalScheduledGuardVersion,
    } : {}) };
  return createChatOutboundFingerprint(["proposal-automation-v1", job.tenantId, job.chatId, normalizeOutboundText(job.text), metadata]);
}

export async function freezeProposalAutomationPlans(input: { tenantId: string; leadId: string; claim: ProposalAutomationClaim; automations: TenantAutomationDoc[];
  matches?: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData) => boolean }) {
  return adminDb.runTransaction(async tx => {
    const source = await assertProposalAutomationSource(tx, { ...input, ...input.claim });
    const existing = source.data()?.automationApprovalPlans;
    if (existing !== undefined) {
      if (!Array.isArray(existing) || source.data()?.automationApprovalProtocol !== 1) throw new Error("PROPOSAL_AUTOMATION_PLAN_INVALID");
      return existing as TenantAutomationDoc[];
    }
    const assertActive = () => {
      if (millis(source.data()?.leaseUntil) <= Date.now()) throw new Error("PROPOSAL_AUTOMATION_SOURCE_LEASE_EXPIRED");
    };
    let candidates = input.automations;
    if (input.matches) {
      const lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
      if (lead.data()?.tenantId !== input.tenantId) throw new Error("PROPOSAL_AUTOMATION_LEAD_REVOKED");
      if (source.data()?.stageRunRecoveryProtocol === 2) {
        candidates = [];
        for (const candidate of readStageApprovalCandidates(source.data()!)) {
          const definition = normalizeAutomationDoc(candidate.id, { ...candidate, trigger: "budget_approved", actions: [] }, input.tenantId);
          if (!input.matches(definition, lead.data()!)) continue;
          const current = await tx.get(adminDb.collection("automations").doc(candidate.id));
          if (!current.exists || current.data()?.tenantId !== input.tenantId) throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_REVOKED");
          const normalized = normalizeAutomationDoc(current.id, current.data()!, input.tenantId);
          if (digest(plan(normalized)) !== candidate.planDigest) throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_REVOKED");
          candidates.push(normalized);
        }
      } else {
        candidates = [];
        await visitTenantAutomationCatalogue(tx, input.tenantId, (id, data) => {
          const doc = normalizeAutomationDoc(id, data, input.tenantId);
          if (input.matches!(doc, lead.data()!)) candidates.push(doc);
          if (candidates.length > 120) throw new Error("PROPOSAL_AUTOMATION_PLAN_TOO_LARGE");
        }, assertActive);
      }
    }
    if (candidates.length > 120) throw new Error("PROPOSAL_AUTOMATION_PLAN_TOO_LARGE");
    const frozen = candidates.map(plan);
    for (const accepted of frozen) {
      const current = await tx.get(adminDb.collection("automations").doc(accepted.id));
      if (!current.exists || current.data()?.tenantId !== input.tenantId || digest(plan(normalizeAutomationDoc(current.id, current.data()!, input.tenantId))) !== digest(accepted)) {
        throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_CHANGED");
      }
    }
    const hasCrm = frozen.some(automation => automation.actions.some(supportsAtomicCrmEffect));
    let crmState: Record<string, unknown> = {};
    if (hasCrm) {
      const lead = (await tx.get(adminDb.collection("leads").doc(input.leadId))).data();
      if (lead?.tenantId !== input.tenantId) throw new Error("PROPOSAL_CRM_LEAD_REVOKED");
      let pipeline = null;
      try { pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId); }
      catch (error) { if (!(error instanceof TenantPipelineConfigurationError)) throw error; }
      crmState = { proposalCrmProtocolVersion: 1, proposalCrmBaseline: crmMutationBaseline(lead),
        proposalCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.crmFieldOwnership?.[field] || null])),
        proposalCrmPipeline: pipeline };
    }
    assertActive();
    tx.update(source.ref, { automationApprovalPlans: frozen, automationApprovalProtocol: 1,
      ...(readStageHookProgress(source.data()!)?.version === 2 && frozen.every(automation => automation.actions.every(supportsReceiptBackedAutomationAction))
        ? { approvalReceiptRecoveryProtocol: 1 } : {}),
      ...(source.data()?.stageRunRecoveryProtocol === 2 ? { stageApprovalCandidatesClosed: true, stageApprovalCandidates: FieldValue.delete() } : {}), ...crmState });
    return frozen;
  });
}

/** A proposal task/note is an internal record, never proof of notification,
 * acceptance or payment. Its occurrence, records and receipt share one commit. */
export async function commitProposalAutomationInternalRecords(input: {
  tenantId: string; leadId: string; claim: ProposalAutomationClaim;
  automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction;
  scheduled?: { id: string; token: string };
}) {
  return commitBusinessAutomationInternalRecords(input);
}

/** One atomic data/receipt executor. Authorization remains with the actual
 * producer; stage hooks never masquerade as approved proposals. */
export async function commitBusinessAutomationInternalRecords(input: {
  tenantId: string; leadId: string; claim: ProposalAutomationClaim;
  automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction;
  scheduled?: { id: string; token: string }; stageSource?: StageAutomationSource;
}) {
  const stage = input.stageSource, namespace = stage ? "stage" : "proposal";
  const invalid = (code: string) => new Error(`${stage ? "CRM_STAGE" : "PROPOSAL"}_${code}`);
  if (!supportsAtomicAutomationEffect(input.action) ||
      !Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0 ||
      stage && (stage.id !== input.claim.id || stage.token !== input.claim.token) ||
      (input.scheduled ? Number(input.action.waitInHours || 0) <= 0 : Number(input.action.waitInHours || 0) !== 0)) {
    throw invalid("INTERNAL_ACTION_INVALID");
  }
  const id = `${stage ? "stage_effect_" : "proposal_effect_"}${digest(stage
    ? [input.tenantId, stage.kind, stage.id, input.automation.id, input.actionIndex]
    : [input.tenantId, input.claim.id, input.automation.id, input.actionIndex])}`;
  const sourceMetadata = stage ? { stageSourceId: stage.id, stageSourceKind: stage.kind } : { proposalSourceId: input.claim.id };
  const receiptType = stage ? "automation_stage_internal_effect" : "automation_proposal_internal_effect";
  return adminDb.runTransaction(async tx => {
    const stageAuthority = stage ? await (await import("@/lib/server/automation-stage-delivery")).authorizeStageAutomationInternalRecords(tx,
      { tenantId: input.tenantId, leadId: input.leadId, source: stage, automationId: input.automation.id, actionIndex: input.actionIndex, action: input.action, scheduled: input.scheduled }) : null;
    const scheduled = input.scheduled ? await tx.get(adminDb.collection("jobs").doc(input.scheduled.id)) : null;
    const authority = !stage && scheduled ? await assertProposalAutomationSchedule(tx, scheduled.id, scheduled.data() || {}, "effect", input.scheduled!.token) : null;
    const source = stageAuthority?.source || authority?.source || await assertProposalAutomationSource(tx, { ...input, ...input.claim });
    if (authority && (source.id !== input.claim.id || scheduled!.data()?.tenantId !== input.tenantId || scheduled!.data()?.leadId !== input.leadId ||
        scheduled!.data()?.automationId !== input.automation.id || scheduled!.data()?.actionIndex !== input.actionIndex ||
        !isDeepStrictEqual(scheduled!.data()?.action, input.action))) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_CHANGED");
    const binding = stageAuthority || (authority ? { key: digest(input.automation.id), planDigest: authority.manifest.planDigest }
      : await authorizeProposalAutomationReservation(tx, { tenantId: input.tenantId, sourceId: source.id,
        token: input.claim.token, automationId: input.automation.id }));
    const row = source.data()!, accepted = (stage ? row.stageAutomationPlans : row.automationApprovalPlans).find((item: TenantAutomationDoc) => item.id === input.automation.id) as TenantAutomationDoc;
    const reservation = (stage ? row.stageUsageReservations : row.proposalUsageReservations)?.[binding.key];
    if (!isDeepStrictEqual(actionAt(accepted, input.actionIndex), input.action) || digest(plan(input.automation)) !== binding.planDigest ||
        !reservation || reservation.allowed !== true || reservation.automationId !== accepted.id || reservation.planDigest !== binding.planDigest ||
        !Number.isFinite(reservation.limit) || !Number.isFinite(reservation.currentUsage) || !millis(row.createdAt)) {
      throw invalid("INTERNAL_PLAN_OR_QUOTA_CHANGED");
    }
    const receiptRef = adminDb.collection("jobs").doc(id), receipt = await tx.get(receiptRef);
    const fingerprint = digest([binding.planDigest, input.actionIndex, input.action]);
    if (receipt.exists) {
      const previous = receipt.data()!;
      if (previous.type !== receiptType || previous.protocolVersion !== 1 || previous.status !== "done" ||
          previous.tenantId !== input.tenantId || previous.leadId !== input.leadId || Object.entries(sourceMetadata).some(([key, value]) => previous[key] !== value) ||
          previous.automationId !== accepted.id || previous.actionIndex !== input.actionIndex || previous.fingerprint !== fingerprint ||
          (previous.scheduledJobId || null) !== (input.scheduled?.id || null)) {
        throw invalid("INTERNAL_RECEIPT_CHANGED");
      }
      if (scheduled) tx.update(scheduled.ref, { internalEffectExecutorVersion: 1, internalEffectExecutorToken: input.scheduled!.token });
      return { executed: previous.outcome ? ["applied", "unchanged"].includes(previous.outcome) : true, event: null, receiptId: id };
    }
    const priorAudit = await tx.get(adminDb.collection("leads").doc(input.leadId).collection("events").doc(id));
    const projections = row[`${namespace}CrmProjection`] || {};
    if (priorAudit.exists || Object.values(projections).some(value => value && typeof value === "object" && "receiptId" in value && value.receiptId === id)) throw invalid("INTERNAL_RECEIPT_MISSING");
    if (!supportsAtomicCrmEffect(input.action)) {
      const occupied = await Promise.allSettled([tx.get(adminDb.collection("lead_tasks").doc(id)), tx.get(adminDb.collection("lead_notes").doc(id))]);
      for (const read of occupied) { if (read.status === "rejected") throw read.reason; if (read.value.exists) throw invalid("INTERNAL_RECEIPT_MISSING"); }
    }
    const lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
    if (lead.data()?.tenantId !== input.tenantId) throw invalid("INTERNAL_LEAD_REVOKED");
    if (supportsAtomicCrmEffect(input.action)) {
      if (row[`${namespace}CrmProtocolVersion`] !== 1 || !row[`${namespace}CrmBaseline`] || !row[`${namespace}CrmBaselineOwnership`]) throw invalid("CRM_BASELINE_MISSING");
      const action = input.action, currentLead = lead.data()!;
      const field: OwnedCrmField = action.type === "move_stage" ? "pipelineStage" : action.type === "add_tag" ? "tags" : "priority";
      const before = crmFieldValue(currentLead, field), own = row[`${namespace}CrmProjection`]?.[field];
      const manuallyOwned = isCrmFieldManuallyOwned(currentLead, field);
      let currentOwn = false;
      if (own && !manuallyOwned && isDeepStrictEqual(before, own.value) && isDeepStrictEqual(currentLead.crmFieldOwnership?.[field], own.owner)) {
        currentOwn = await (stage ? assertStageCrmProjection : assertProposalCrmProjection)(tx, { source: row, sourceId: source.id, lead: currentLead, field });
      }
      let outcome = manuallyOwned ? "blocked_manual" : !currentOwn &&
        (!isDeepStrictEqual(row[`${namespace}CrmBaseline`][field], before) ||
          !isDeepStrictEqual(row[`${namespace}CrmBaselineOwnership`][field], currentLead.crmFieldOwnership?.[field] || null)) ? "blocked_stale" : "applied";
      let after: unknown = before;
      const requested: unknown = action.type === "move_stage" ? normalizePipelineStageId(action.stageId, "") : action.type === "add_tag" ? action.tag?.trim().toLowerCase() : action.priority;
      let pipelineVersion: string | null = null;
      if (field === "pipelineStage") {
        let pipeline = null;
        try { pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId); }
        catch (error) { if (!(error instanceof TenantPipelineConfigurationError)) throw error; }
        pipelineVersion = pipeline?.version || null;
        if (!pipeline || !row[`${namespace}CrmPipeline`] || row[`${namespace}CrmPipeline`].version !== pipeline.version ||
            !isDeepStrictEqual(row[`${namespace}CrmPipeline`].stages, pipeline.stages) || !pipeline.stages.some(stage => stage.id === requested)) outcome = "blocked_pipeline";
      }
      if (outcome === "applied") {
        if (field === "tags") {
          const tags = Array.isArray(before) ? before : typeof before === "string" ? before.split(",").map(tag => tag.trim()).filter(Boolean) : [];
          if (typeof requested !== "string" || !requested || requested.length > 32 || tags.some(tag => typeof tag !== "string") ||
              before !== null && typeof before !== "string" && !Array.isArray(before)) outcome = "blocked_invalid";
          else if (tags.some(tag => tag.toLowerCase() === requested)) outcome = "unchanged";
          else if (tags.length >= 12) outcome = "blocked_capacity";
          else after = [...tags, requested];
        } else if (typeof requested !== "string" || !requested || field === "priority" && !["low", "medium", "high"].includes(requested)) outcome = "blocked_invalid";
        else if (requested === before) outcome = "unchanged";
        else after = requested;
      }
      const applied = outcome === "applied";
      if (applied) {
        const owner = { source: stage ? "stage_automation" : "proposal_automation", locked: false, ...sourceMetadata, automationId: accepted.id,
          actionIndex: input.actionIndex, automationEffectId: id, value: after, updatedAt: FieldValue.serverTimestamp() };
        tx.update(lead.ref, { [field]: after, ...(field === "pipelineStage" ? { stage: after, stageUpdatedAt: FieldValue.serverTimestamp() } : {}),
          [`crmFieldOwnership.${field}`]: owner, updatedAt: FieldValue.serverTimestamp() });
        tx.update(source.ref, { [`${namespace}CrmProjection.${field}`]: { receiptId: id, value: after, owner } });
      }
      tx.create(lead.ref.collection("events").doc(id), { tenantId: input.tenantId, type: applied ? `automation_${field}_changed` : "automation_crm_mutation_not_applied",
        title: applied ? "Automacao atualizou campo do CRM" : "Automacao preservou campo do CRM", field, before, after, requested: requested ?? null,
        outcome, pipelineVersion, actorId: `automation:${accepted.id}`, actorName: accepted.name, automationId: accepted.id,
        automationEffectId: id, ...sourceMetadata, trigger: stage ? businessAutomationTrigger(stage.kind) : scheduled ? "scheduled_action" : "budget_approved", createdAt: FieldValue.serverTimestamp() });
      tx.create(receiptRef, { tenantId: input.tenantId, type: receiptType, protocolVersion: 1, status: "done", leadId: input.leadId,
        ...sourceMetadata, automationId: accepted.id, actionIndex: input.actionIndex, actionType: action.type, fingerprint,
        field, before, after, requested: requested ?? null, outcome, pipelineVersion, scheduledJobId: input.scheduled?.id || null,
        completionMeaning: "crm_mutation_evaluated_not_external_conversion", createdAt: FieldValue.serverTimestamp() });
      if (scheduled) tx.update(scheduled.ref, { internalEffectExecutorVersion: 1, internalEffectExecutorToken: input.scheduled!.token });
      return { executed: applied || outcome === "unchanged", event: null, receiptId: id };
    }
    const action = input.action, isAlert = action.type === "alert_human", isNote = action.type === "add_note";
    const hours = Number(action.dueInHours || 0);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 30 || isNote && !action.text?.trim() ||
        action.type === "create_task" && !action.title?.trim()) throw invalid("INTERNAL_PAYLOAD_INVALID");
    const title = action.title || `${isAlert ? "Handoff humano" : "Follow-up automatico"} para ${String(lead.data()?.nome || "Lead").slice(0, 180)}`;
    const taskId = isNote ? null : id, noteId = isNote || isAlert && action.text ? id : null;
    if (taskId) tx.create(adminDb.collection("lead_tasks").doc(taskId), withCommercialTaskIndex({
      tenantId: input.tenantId, leadId: input.leadId, title,
      type: isAlert ? "alerta_humano" : action.type === "follow_up" ? "follow_up" : action.taskType || "follow_up",
      priority: action.priority || (isAlert ? "high" : lead.data()?.priority || "medium"),
      dueAt: hours || isAlert ? new Date((stageAuthority?.manifest?.executeAfterMs || authority?.manifest.executeAfterMs || millis(row.createdAt)) + hours * 3600_000) : null, status: "pending",
      source: "tenant_automation", reasonCode: action.reasonCode || (isAlert ? "human_alert" : action.type === "follow_up" ? "follow_up_due" : "automation_task"),
      ...(isAlert ? { ownerUserId: action.ownerUserId || null, ownerName: action.ownerName || null } : {}),
      createdBy: `automation:${accepted.id}`, createdByName: accepted.name, automationGenerated: true,
      automationId: accepted.id, automationName: accepted.name, automationEffectId: id, ...sourceMetadata,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }));
    if (noteId) tx.create(adminDb.collection("lead_notes").doc(noteId), {
      tenantId: input.tenantId, leadId: input.leadId, text: action.text || "", authorId: `automation:${accepted.id}`,
      authorName: accepted.name, automationGenerated: true, automationId: accepted.id, automationEffectId: id, ...sourceMetadata,
      ...(isAlert ? { reasonCode: action.reasonCode || "human_alert" } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(lead.ref.collection("events").doc(id), {
      tenantId: input.tenantId, type: isAlert ? "automation_human_task_created" : isNote ? "automation_note_added" : "automation_task_created",
      title: isAlert ? "Automacao criou pendencia humana" : isNote ? "Automacao adicionou nota" : "Automacao criou tarefa",
      detail: isNote ? (action.text || "").slice(0, 240) : title, actorId: `automation:${accepted.id}`, actorName: accepted.name,
      automationId: accepted.id, automationEffectId: id, ...sourceMetadata, taskId, noteId,
      trigger: stage ? businessAutomationTrigger(stage.kind) : scheduled ? "scheduled_action" : "budget_approved", createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(receiptRef, { tenantId: input.tenantId, type: receiptType, protocolVersion: 1, status: "done",
      leadId: input.leadId, ...sourceMetadata, automationId: accepted.id, actionIndex: input.actionIndex,
      actionType: action.type, fingerprint, taskId, noteId, completionMeaning: "internal_records_committed_not_human_notified",
      scheduledJobId: input.scheduled?.id || null,
      createdAt: FieldValue.serverTimestamp() });
    if (scheduled) tx.update(scheduled.ref, { internalEffectExecutorVersion: 1, internalEffectExecutorToken: input.scheduled!.token });
    return { executed: true, event: null, receiptId: id };
  });
}

async function assertInternalPlan(tx: FirebaseFirestore.Transaction, source: FirebaseFirestore.DocumentData, input: {
  tenantId: string; automationId: string; index: number; action: TenantAutomationAction; planDigest?: string;
}) {
  const plans = source.automationApprovalPlans;
  const candidates = Array.isArray(plans) ? plans.filter(item => item.id === input.automationId) : [];
  const accepted = candidates[0] as TenantAutomationDoc | undefined;
  if (source.automationApprovalProtocol !== 1 || candidates.length !== 1 || !accepted || accepted.tenantId !== input.tenantId ||
      accepted.trigger !== "budget_approved" || !Number.isSafeInteger(input.index) || input.index < 0 ||
      !input.action || typeof input.action !== "object" || !supportsAtomicAutomationEffect(input.action) ||
      !isDeepStrictEqual(actionAt(accepted, input.index), input.action) || Number(input.action.waitInHours) <= 0 ||
      input.planDigest !== undefined && digest(plan(accepted)) !== input.planDigest) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_PLAN_CHANGED");
  const current = await tx.get(adminDb.collection("automations").doc(input.automationId));
  if (current.data()?.tenantId !== input.tenantId || digest(plan(normalizeAutomationDoc(current.id, current.data()!, input.tenantId))) !== digest(plan(accepted))) {
    throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_REVOKED");
  }
  return accepted;
}

export async function scheduleProposalAutomationInternalRecords(input: {
  tenantId: string; leadId: string; claim: ProposalAutomationClaim; automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction;
}) {
  const id = `proposal_schedule_${digest([input.tenantId, input.claim.id, input.automation.id, input.actionIndex])}`;
  return adminDb.runTransaction(async tx => {
    const source = await assertProposalAutomationSource(tx, { ...input, ...input.claim }), row = source.data()!;
    const automation = await assertInternalPlan(tx, row, { tenantId: input.tenantId, automationId: input.automation.id,
      index: input.actionIndex, action: input.action, planDigest: digest(plan(input.automation)) });
    const existing = await tx.get(adminDb.collection("jobs").doc(id)), start = millis(row.createdAt), wait = Number(input.action.waitInHours);
    const reservation = row.proposalUsageReservations?.[digest(automation.id)];
    if (!start || !Number.isFinite(wait) || wait <= 0 || wait > 24 * 30 || !reservation || reservation.allowed !== true ||
        reservation.automationId !== automation.id || reservation.planDigest !== digest(plan(automation))) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_QUOTA_OR_DEADLINE_INVALID");
    const manifest = { chatId: null, automationId: automation.id, actionIndex: input.actionIndex, planDigest: digest(plan(automation)),
      routingDigest: null, executeAfterMs: Math.trunc(start + wait * 3600_000), internalEffectProtocolVersion: 1 };
    if (existing.exists || row.automationApprovalSchedules?.[id]) {
      if (!existing.exists || !isDeepStrictEqual(row.automationApprovalSchedules?.[id], manifest) || existing.data()?.proposalScheduleProtocol !== 1 ||
          existing.data()?.automationProposalSourceId !== source.id || existing.data()?.internalEffectProtocolVersion !== 1 ||
          existing.data()?.leadId !== input.leadId || existing.data()?.tenantId !== input.tenantId || existing.data()?.chatId !== null ||
          existing.data()?.automationId !== automation.id || existing.data()?.actionIndex !== input.actionIndex ||
          !isDeepStrictEqual(existing.data()?.action, input.action) || millis(existing.data()?.executeAfter) !== manifest.executeAfterMs) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_RECEIPT_CHANGED");
      return id;
    }
    tx.create(existing.ref, { tenantId: input.tenantId, type: "automation_scheduled_action", status: "pending", attempts: 0,
      proposalScheduleProtocol: 1, automationProposalSourceId: source.id, internalEffectProtocolVersion: 1,
      leadId: input.leadId, chatId: null, automationId: automation.id, automationName: automation.name, trigger: "budget_approved",
      actionIndex: input.actionIndex, action: input.action, executeAfter: new Date(manifest.executeAfterMs),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(source.ref, { [`automationApprovalSchedules.${id}`]: manifest });
    return id;
  });
}

export async function commitScheduledProposalAutomationInternalRecords(input: {
  tenantId: string; leadId: string; scheduledJobId: string; token: string; action: TenantAutomationAction;
}) {
  const scheduled = await adminDb.collection("jobs").doc(input.scheduledJobId).get(), row = scheduled.data();
  if (!row || !isProposalAutomationSchedule(scheduled.id, row)) return null;
  if (row.tenantId !== input.tenantId || typeof row.automationProposalSourceId !== "string" || !row.automationProposalSourceId ||
      row.automationProposalSourceId.includes("/")) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_SOURCE_INVALID");
  const source = (await adminDb.collection("jobs").doc(row.automationProposalSourceId).get()).data();
  const automation = Array.isArray(source?.automationApprovalPlans)
    ? source.automationApprovalPlans.find((item: TenantAutomationDoc) => item.id === row.automationId) : null;
  if (!automation) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_PLAN_MISSING");
  return commitProposalAutomationInternalRecords({ tenantId: input.tenantId, leadId: input.leadId,
    claim: { id: row.automationProposalSourceId, token: "" }, automation, action: input.action, actionIndex: row.actionIndex,
    scheduled: { id: scheduled.id, token: input.token } });
}

export async function queueProposalAutomationMessage(input: {
  tenantId: string; leadId: string; chatId: string; claim: ProposalAutomationClaim;
  automation: TenantAutomationDoc; actionIndex: number; text: string;
  scheduled?: { id: string; token: string };
}) {
  const text = normalizeOutboundText(input.text);
  const chatSource = (await adminDb.collection("chats").doc(input.chatId).get()).data();
  const channelId = chatSource?.channelId;
  if (!chatSource || typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new Error("PROPOSAL_AUTOMATION_CHANNEL_MISSING");
  const channelSource = (await adminDb.collection("tenant_channels").doc(channelId).get()).data();
  if (!channelSource || channelSource.tenantId !== input.tenantId || channelSource.status !== "active") throw new Error("PROPOSAL_AUTOMATION_CHANNEL_REVOKED");
  const acceptedRouting = routingDigest(chatSource, channelSource);
  const key = digest([input.tenantId, input.claim.id, input.automation.id, input.actionIndex]);
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: `proposal-${key}`, clientRequestId: `proposal-${key}` });
  const metadata = { automationProposalProtocol: 1, automationProposalSourceId: input.claim.id,
    automationSourceLeadId: input.leadId, automationId: input.automation.id, automationActionIndex: input.actionIndex,
    automationProposalPlanDigest: digest(plan(input.automation)), automationProposalRoutingDigest: acceptedRouting,
    ...(input.scheduled ? { proposalScheduledJobId: input.scheduled.id, proposalScheduledGuardVersion: 1 } : {}) };
  const sourceForEnqueue = async (tx: FirebaseFirestore.Transaction) => {
    if (!input.scheduled) return { source: await assertProposalAutomationSource(tx, { ...input, ...input.claim }), scheduled: null };
    const scheduled = await tx.get(adminDb.collection("jobs").doc(input.scheduled.id));
    const authority = await assertProposalAutomationSchedule(tx, input.scheduled.id, scheduled.data() || {}, "enqueue", input.scheduled.token);
    if (scheduled.data()?.chatId !== input.chatId || scheduled.data()?.automationId !== input.automation.id ||
        scheduled.data()?.actionIndex !== input.actionIndex || scheduled.data()?.leadId !== input.leadId ||
        scheduled.data()?.automationProposalSourceId !== input.claim.id ||
        normalizeOutboundText(scheduled.data()?.action?.text || "") !== text) throw new Error("PROPOSAL_SCHEDULE_PAYLOAD_CHANGED");
    return { source: authority.source, scheduled };
  };
  // Enqueue replay returns before beforeCommit; authorize even that receipt path.
  await adminDb.runTransaction(async tx => {
    const { source } = await sourceForEnqueue(tx);
    await assertPlan(tx, source.data()!, { ...metadata, tenantId: input.tenantId, text });
  });
  return commitChatOutboundEnqueue({ tenantId: input.tenantId, chatId: input.chatId, identity,
    actor: { id: `automation:${input.automation.id}`, name: input.automation.name }, replyToId: null, preview: text,
    stateId: getChatStateDocId(input.tenantId, input.chatId), pauseAi: false,
    fingerprint: createChatOutboundFingerprint(["proposal-automation-v1", input.tenantId, input.chatId, text, metadata]),
    beforeCommit: async (batch, chat) => {
      if (chat.leadId !== input.leadId || chat.isGroup === true) throw new Error("PROPOSAL_AUTOMATION_CHAT_CHANGED");
      const versions = await adminDb.runTransaction(async tx => {
        const { source, scheduled } = await sourceForEnqueue(tx);
        await assertPlan(tx, source.data()!, { ...metadata, tenantId: input.tenantId, text });
        const budget = await tx.get(adminDb.collection("orcamentos").doc(source.data()!.budgetId));
        const lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
        const configuration = await tx.get(adminDb.collection("automations").doc(input.automation.id));
        const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
        if (!channel.exists || channel.data()?.tenantId !== input.tenantId || routingDigest(chat, channel.data()!) !== acceptedRouting) throw new Error("PROPOSAL_AUTOMATION_ROUTING_CHANGED");
        return [source, budget, lead, configuration, channel, ...(scheduled ? [scheduled] : [])];
      });
      for (const snapshot of versions) {
        if (!snapshot.updateTime) throw new Error("PROPOSAL_AUTOMATION_SOURCE_MISSING");
        batch.update(snapshot.ref, { tenantId: input.tenantId }, { lastUpdateTime: snapshot.updateTime });
      }
    },
    build: chat => ({ message: { type: "text", text, channel: String(chat.channel || "whatsapp"), automationGenerated: true, aiGenerated: false, ...metadata },
      job: { kind: "text", text, origin: "automation", ...metadata } }),
  });
}

async function assertPlan(tx: FirebaseFirestore.Transaction, source: FirebaseFirestore.DocumentData, job: Record<string, unknown>) {
  const plans = source.automationApprovalPlans;
  if (source.automationApprovalProtocol !== 1 || !Array.isArray(plans)) throw new Error("PROPOSAL_AUTOMATION_PLAN_MISSING");
  const accepted = plans.find(item => item.id === job.automationId) as TenantAutomationDoc | undefined;
  const index = Number(job.automationActionIndex);
  const action = accepted && actionAt(accepted, index);
  const delayed = job.proposalScheduledJobId !== undefined;
  if (!accepted || !Number.isSafeInteger(index) || index < 0 || digest(plan(accepted)) !== job.automationProposalPlanDigest ||
      action?.type !== "send_message" || (delayed ? Number(action.waitInHours || 0) <= 0 : Number(action.waitInHours || 0) !== 0) ||
      normalizeOutboundText(action?.text || "") !== job.text) throw new Error("PROPOSAL_AUTOMATION_PAYLOAD_CHANGED");
  const current = await tx.get(adminDb.collection("automations").doc(accepted.id));
  if (!current.exists || current.data()?.tenantId !== job.tenantId || digest(plan(normalizeAutomationDoc(current.id, current.data()!, String(job.tenantId)))) !== digest(plan(accepted))) {
    throw new Error("PROPOSAL_AUTOMATION_CONFIGURATION_REVOKED");
  }
  return accepted;
}

export async function scheduleProposalAutomationMessage(input: {
  tenantId: string; leadId: string; chatId: string; claim: ProposalAutomationClaim;
  automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction;
}) {
  const id = `proposal_schedule_${digest([input.tenantId, input.claim.id, input.automation.id, input.actionIndex])}`;
  return adminDb.runTransaction(async tx => {
    const source = await assertProposalAutomationSource(tx, { ...input, ...input.claim });
    const existing = await tx.get(adminDb.collection("jobs").doc(id));
    const accepted = await assertPlan(tx, source.data()!, { tenantId: input.tenantId, automationId: input.automation.id,
      automationActionIndex: input.actionIndex, automationProposalPlanDigest: digest(plan(input.automation)),
      proposalScheduledJobId: id, text: normalizeOutboundText(input.action.text || "") });
    if (!isDeepStrictEqual(actionAt(accepted, input.actionIndex), input.action)) throw new Error("PROPOSAL_SCHEDULE_ACTION_CHANGED");
    const chat = await tx.get(adminDb.collection("chats").doc(input.chatId)), channelId = chat.data()?.channelId;
    if (chat.data()?.tenantId !== input.tenantId || chat.data()?.leadId !== input.leadId || chat.data()?.isGroup === true ||
        typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new Error("PROPOSAL_SCHEDULE_CHAT_INVALID");
    const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
    if (channel.data()?.tenantId !== input.tenantId || channel.data()?.status !== "active") throw new Error("PROPOSAL_SCHEDULE_CHANNEL_INVALID");
    const start = millis(source.data()?.createdAt), wait = Number(input.action.waitInHours);
    if (!start || !Number.isFinite(wait) || wait <= 0 || wait > 24 * 30) throw new Error("PROPOSAL_SCHEDULE_DEADLINE_INVALID");
    const executeAfterMs = Math.trunc(start + wait * 3600_000);
    const manifest = { chatId: input.chatId, automationId: input.automation.id, actionIndex: input.actionIndex,
      planDigest: digest(plan(accepted)), routingDigest: routingDigest(chat.data()!, channel.data()!), executeAfterMs };
    const previous = source.data()?.automationApprovalSchedules?.[id];
    if (existing.exists || previous) {
      if (!existing.exists || !isDeepStrictEqual(previous, manifest) || existing.data()?.automationProposalSourceId !== source.id ||
          existing.data()?.proposalScheduleProtocol !== 1 || !isDeepStrictEqual(existing.data()?.action, input.action) ||
          existing.data()?.chatId !== input.chatId || existing.data()?.leadId !== input.leadId || existing.data()?.automationId !== input.automation.id ||
          existing.data()?.actionIndex !== input.actionIndex || millis(existing.data()?.executeAfter) !== executeAfterMs) throw new Error("PROPOSAL_SCHEDULE_RECEIPT_CHANGED");
      return id;
    }
    tx.create(existing.ref, { tenantId: input.tenantId, type: "automation_scheduled_action", status: "pending", attempts: 0,
      proposalScheduleProtocol: 1, automationProposalSourceId: source.id, leadId: input.leadId, chatId: input.chatId,
      automationId: input.automation.id, automationName: input.automation.name, trigger: "budget_approved", actionIndex: input.actionIndex,
      action: input.action, executeAfter: new Date(executeAfterMs), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(source.ref, { [`automationApprovalSchedules.${id}`]: manifest });
    return id;
  });
}

/** The source stores the accepted schedule, so editing only a job cannot renew
 * its destination, payload, deadline or authority. Same guard at all boundaries. */
export async function assertProposalAutomationSchedule(tx: FirebaseFirestore.Transaction, id: string, row: FirebaseFirestore.DocumentData,
  phase: "claim" | "enqueue" | "quota" | "delivery" | "effect", token?: string) {
  if (row.proposalScheduleProtocol !== 1 || row.type !== "automation_scheduled_action" || row.trigger !== "budget_approved" ||
      typeof row.automationProposalSourceId !== "string" || !row.automationProposalSourceId || row.automationProposalSourceId.includes("/")) throw new Error("PROPOSAL_SCHEDULE_PROTOCOL_INVALID");
  const raw = await tx.get(adminDb.collection("jobs").doc(row.automationProposalSourceId));
  if (raw.data()?.tenantId === row.tenantId && raw.data()?.status === "processing" && millis(raw.data()?.leaseUntil) > Date.now()) throw new InboundAutomationPreparingError();
  const source = await assertProposalAutomationSource(tx, { id: row.automationProposalSourceId, tenantId: row.tenantId, leadId: row.leadId, delivery: true });
  const accepted = source.data()?.automationApprovalSchedules?.[id];
  if (id !== `proposal_schedule_${digest([row.tenantId, source.id, row.automationId, row.actionIndex])}` || !accepted ||
      accepted.chatId !== row.chatId || accepted.automationId !== row.automationId || accepted.actionIndex !== row.actionIndex ||
      millis(row.executeAfter) !== accepted.executeAfterMs || accepted.executeAfterMs > Date.now()) throw new Error("PROPOSAL_SCHEDULE_MANIFEST_CHANGED");
  if (row.action?.type !== "send_message") {
    const automation = await assertInternalPlan(tx, source.data()!, { tenantId: row.tenantId, automationId: row.automationId,
      index: row.actionIndex, action: row.action, planDigest: accepted.planDigest });
    const due = Math.trunc(millis(source.data()?.createdAt) + Number(row.action.waitInHours) * 3600_000);
    const reservation = source.data()?.proposalUsageReservations?.[digest(row.automationId)];
    if (accepted.internalEffectProtocolVersion !== 1 || row.internalEffectProtocolVersion !== 1 || accepted.routingDigest !== null || row.chatId !== null ||
        due !== accepted.executeAfterMs || !Number.isFinite(due) || !reservation || reservation.allowed !== true ||
        reservation.automationId !== row.automationId || reservation.planDigest !== accepted.planDigest ||
        !Number.isFinite(reservation.limit) || !Number.isFinite(reservation.currentUsage)) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_MANIFEST_CHANGED");
    if (phase === "enqueue" || phase === "delivery") throw new Error("PROPOSAL_INTERNAL_SCHEDULE_CANNOT_SEND");
    if (phase === "quota" || phase === "effect") {
      if (row.status !== "processing" || row.claimToken !== token || millis(row.leaseUntil) <= Date.now() ||
          row.internalEffectExecutorVersion !== 1 || row.internalEffectExecutorToken !== token) throw new Error("PROPOSAL_INTERNAL_SCHEDULE_CLAIM_LOST");
    }
    return { source, automation, reservation, manifest: accepted };
  }
  if (phase === "effect") throw new Error("PROPOSAL_SCHEDULE_NOT_INTERNAL");
  const automation = await assertPlan(tx, source.data()!, { tenantId: row.tenantId, automationId: row.automationId,
    automationActionIndex: row.actionIndex, automationProposalPlanDigest: accepted.planDigest, proposalScheduledJobId: id,
    text: normalizeOutboundText(row.action?.text || "") });
  const action = actionAt(automation, row.actionIndex), due = Math.trunc(millis(source.data()?.createdAt) + Number(action.waitInHours) * 3600_000);
  if (!isDeepStrictEqual(action, row.action) || due !== accepted.executeAfterMs) throw new Error("PROPOSAL_SCHEDULE_ACTION_CHANGED");
  const chat = await tx.get(adminDb.collection("chats").doc(row.chatId)), channelId = chat.data()?.channelId;
  if (chat.data()?.tenantId !== row.tenantId || chat.data()?.leadId !== row.leadId || chat.data()?.isGroup === true ||
      typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new Error("PROPOSAL_SCHEDULE_CHAT_REVOKED");
  const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
  if (channel.data()?.tenantId !== row.tenantId || channel.data()?.status !== "active" ||
      routingDigest(chat.data()!, channel.data()!) !== accepted.routingDigest) throw new Error("PROPOSAL_SCHEDULE_ROUTING_REVOKED");
  const state = (await tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(row.tenantId, row.chatId)))).data();
  if (millis(state?.pausedUntil) > Date.now() || state?.aiEnabled === false && state?.humanOwnerUserId) throw new Error("PROPOSAL_SCHEDULE_HUMAN_PAUSE");
  if (phase === "enqueue" || phase === "quota") {
    if (row.status !== "processing" || row.claimToken !== token || millis(row.leaseUntil) <= Date.now()) throw new Error("PROPOSAL_SCHEDULE_CLAIM_LOST");
  }
  const reservation = source.data()?.proposalUsageReservations?.[digest(row.automationId)];
  if (!reservation || reservation.allowed !== true || reservation.automationId !== row.automationId || reservation.planDigest !== accepted.planDigest ||
      !Number.isFinite(reservation.limit) || !Number.isFinite(reservation.currentUsage)) throw new Error("PROPOSAL_SCHEDULE_QUOTA_MISSING");
  if (phase === "delivery") {
    if (row.status !== "done") {
      if (["pending", "retrying", "processing"].includes(row.status) && row.schedulerProtocolVersion === 1 && Number(row.attempts) < 3) throw new InboundAutomationPreparingError();
      throw new Error("PROPOSAL_SCHEDULE_NOT_COMPLETED");
    }
    const key = digest([row.tenantId, source.id, row.automationId, row.actionIndex]);
    const identity = createChatOutboundIdentity({ tenantId: row.tenantId, chatId: `proposal-${key}`, clientRequestId: `proposal-${key}` });
    if (row.outboundJobId !== identity.jobId || row.messageId !== identity.messageId) throw new Error("PROPOSAL_SCHEDULE_DELIVERY_RECEIPT_INVALID");
  }
  return { source, automation, reservation, manifest: accepted };
}

export async function queueScheduledProposalAutomationMessage(input: { tenantId: string; chatId: string; scheduledJobId: string;
  automationId: string; text: string; schedulerClaimToken?: string }) {
  const row = await adminDb.runTransaction(async tx => {
    const scheduled = await tx.get(adminDb.collection("jobs").doc(input.scheduledJobId)), row = scheduled.data()!;
    const authorized = await assertProposalAutomationSchedule(tx, input.scheduledJobId, row || {}, "enqueue", input.schedulerClaimToken);
    if (row.tenantId !== input.tenantId || row.chatId !== input.chatId || row.automationId !== input.automationId ||
        normalizeOutboundText(row.action?.text || "") !== normalizeOutboundText(input.text)) throw new Error("PROPOSAL_SCHEDULE_INPUT_CHANGED");
    return { leadId: String(row.leadId), sourceId: String(row.automationProposalSourceId), actionIndex: Number(row.actionIndex), automation: authorized.automation };
  });
  return queueProposalAutomationMessage({ tenantId: input.tenantId, leadId: row.leadId, chatId: input.chatId,
    claim: { id: row.sourceId, token: "" }, automation: row.automation, actionIndex: row.actionIndex,
    text: input.text, scheduled: { id: input.scheduledJobId, token: input.schedulerClaimToken! } });
}

export async function assertProposalAutomationDeliveryAllowed(job: Record<string, unknown>, tx: FirebaseFirestore.Transaction) {
  const fingerprint = proposalAutomationFingerprint(job);
  if (!fingerprint) return;
  if (fingerprint !== job.requestFingerprint) throw new Error("PROPOSAL_AUTOMATION_FINGERPRINT_CHANGED");
  const raw = await tx.get(adminDb.collection("jobs").doc(String(job.automationProposalSourceId)));
  if (raw.data()?.tenantId === job.tenantId && raw.data()?.status === "processing" &&
      typeof raw.data()?.leaseUntil?.toMillis === "function" && raw.data()!.leaseUntil.toMillis() > Date.now()) throw new InboundAutomationPreparingError();
  const source = await assertProposalAutomationSource(tx, { id: String(job.automationProposalSourceId), tenantId: String(job.tenantId), leadId: String(job.automationSourceLeadId), delivery: true });
  if (job.proposalScheduledJobId !== undefined || job.proposalScheduledGuardVersion !== undefined) {
    if (job.proposalScheduledGuardVersion !== 1 || typeof job.proposalScheduledJobId !== "string" || !job.proposalScheduledJobId.startsWith("proposal_schedule_")) throw new Error("PROPOSAL_SCHEDULE_PROTOCOL_INVALID");
    const scheduled = await tx.get(adminDb.collection("jobs").doc(job.proposalScheduledJobId));
    const row = scheduled.data() || {};
    const authority = await assertProposalAutomationSchedule(tx, scheduled.id, row, "delivery");
    if (row.automationProposalSourceId !== source.id || row.chatId !== job.chatId || row.leadId !== job.automationSourceLeadId ||
        row.automationId !== job.automationId || row.actionIndex !== job.automationActionIndex ||
        authority.manifest.planDigest !== job.automationProposalPlanDigest || authority.manifest.routingDigest !== job.automationProposalRoutingDigest ||
        normalizeOutboundText(row.action?.text || "") !== job.text) throw new Error("PROPOSAL_SCHEDULE_OUTBOX_CHANGED");
  }
  const chat = await tx.get(adminDb.collection("chats").doc(String(job.chatId)));
  if (chat.data()?.tenantId !== job.tenantId || chat.data()?.leadId !== job.automationSourceLeadId || chat.data()?.isGroup === true) throw new Error("PROPOSAL_AUTOMATION_CHAT_REVOKED");
  const channelId = chat.data()?.channelId;
  if (typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new Error("PROPOSAL_AUTOMATION_CHANNEL_MISSING");
  const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
  if (!channel.exists || channel.data()?.tenantId !== job.tenantId || routingDigest(chat.data()!, channel.data()!) !== job.automationProposalRoutingDigest) throw new Error("PROPOSAL_AUTOMATION_ROUTING_REVOKED");
  const state = await tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(String(job.tenantId), String(job.chatId))));
  const control = state.data();
  if ((typeof control?.pausedUntil?.toMillis === "function" && control.pausedUntil.toMillis() > Date.now()) ||
      (control?.aiEnabled === false && control?.humanOwnerUserId)) throw new Error("PROPOSAL_AUTOMATION_HUMAN_PAUSE");
  await assertPlan(tx, source.data()!, job);
}
import { businessAutomationTrigger } from "@/lib/server/crm/stage-source-contract";
