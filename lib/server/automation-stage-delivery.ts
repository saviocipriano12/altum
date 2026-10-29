import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertProposalStageAutomationSource } from "@/lib/server/crm/proposal-mutation";
import { assertOrderStageAutomationSource } from "@/lib/server/crm/order-stage-transition";
import { assertManualStageAutomationSource } from "@/lib/server/crm/manual-stage-transition";
import { assertConversationStageAutomationSource } from "@/lib/server/crm/conversation-stage-transition";
import { assertIntakeAutomationSource } from "@/lib/server/crm/intake-occurrence";
import { assertFinancePaidAutomationSource } from "@/lib/server/crm/finance-paid-occurrence";
import { assertFinanceStageAutomationSource } from "@/lib/server/crm/finance-stage-transition";
import { isStageAutomationSourceKind, stageAutomationSourceType, stageAutomationSourceKindForType, businessAutomationTrigger, type StageAutomationSourceKind } from "@/lib/server/crm/stage-source-contract";
import { TenantAccessError } from "@/lib/server/tenant";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { normalizeAutomationDoc, type TenantAutomationDoc, type TenantAutomationAction } from "@/lib/server/automations";
import { supportsAtomicAutomationEffect, supportsAtomicCrmEffect, supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";
import { readStageHookProgress, canReplayStageAutomationHook } from "@/lib/server/crm/stage-hook-progress";
import { crmMutationBaseline, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { commitChatOutboundEnqueue } from "@/lib/server/chat-outbound-enqueue";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "@/lib/server/chat-outbound-idempotency";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { InboundAutomationPreparingError } from "@/lib/server/automation-inbound-execution";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";
import { assertAiSignalAutomationSource } from "@/lib/server/crm/ai-signal-occurrence";
import { assertSocialEventAutomationSource } from "@/lib/server/crm/social-event-occurrence";
import { assertWaitingReplyAutomationSource } from "@/lib/server/crm/waiting-reply-occurrence";

export type StageAutomationSource = { kind: StageAutomationSourceKind; id: string; token: string };
type SourceInput = { tenantId: string; leadId: string; source: StageAutomationSource };
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function plan(doc: TenantAutomationDoc) {
  const { id, tenantId, name, description, trigger, enabled, status, conditions, actions } = doc;
  return { id, tenantId, name, description, trigger, enabled, status, conditions, actions };
}
function actionAt(doc: TenantAutomationDoc, index: number) { return [...doc.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0))[index]; }
export class StageAutomationAuthorizationError extends Error {}
export function isStageAutomationAuthorizationError(error: unknown) {
  return error instanceof StageAutomationAuthorizationError || error instanceof Error && error.message.startsWith("CRM_STAGE_");
}
function millis(value: unknown): number {
  return value instanceof Date ? value.getTime() : value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}
export function isStageAutomationSchedule(id: string, row: Record<string, unknown>) {
  return id.startsWith("stage_schedule_") || row.stageScheduleProtocol !== undefined || row.stageSourceId !== undefined || row.stageSourceKind !== undefined;
}

async function parent(tx: FirebaseFirestore.Transaction, input: SourceInput, delivery = false) {
  if (!input.source || !isStageAutomationSourceKind(input.source.kind)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_SOURCE_INVALID");
  try {
    const args = { id: input.source.id, token: input.source.token, tenantId: input.tenantId, leadId: input.leadId, delivery };
    const result = await (input.source.kind === "proposal" ? assertProposalStageAutomationSource(tx, args)
      : input.source.kind === "aiSignal" ? assertAiSignalAutomationSource(tx, args)
      : input.source.kind === "socialEvent" ? assertSocialEventAutomationSource(tx, args)
      : input.source.kind === "waiting" ? assertWaitingReplyAutomationSource(tx, args)
      : input.source.kind === "intake" ? assertIntakeAutomationSource(tx, args)
      : input.source.kind === "finance" || input.source.kind === "billing" ? assertFinancePaidAutomationSource(tx, args)
      : input.source.kind === "financeStage" ? assertFinanceStageAutomationSource(tx, args)
      : input.source.kind === "manual" ? assertManualStageAutomationSource(tx, args)
      : input.source.kind === "conversation" ? assertConversationStageAutomationSource(tx, args) : assertOrderStageAutomationSource(tx, args));
    if (result.data()?.type !== stageAutomationSourceType(input.source.kind)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_SOURCE_KIND_CHANGED");
    return result;
  } catch (error) {
    if (error instanceof TenantAccessError || error instanceof TenantPipelineConfigurationError ||
        error instanceof Error && /^(PROPOSAL_|CRM_STAGE_)/.test(error.message)) throw new StageAutomationAuthorizationError(error.message);
    throw error;
  }
}

/** Transactional authority for a causal CRM hook, using the same parent fence
 * as automation actions rather than deriving permission from the lead alone. */
export async function assertStageHookSource(tx: FirebaseFirestore.Transaction, input: SourceInput) {
  return parent(tx, input);
}

async function acceptedPlan(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, tenantId: string, automationId: string) {
  const candidates = Array.isArray(row.stageAutomationPlans) ? row.stageAutomationPlans.filter(item => item.id === automationId) : [];
  const accepted = candidates[0] as TenantAutomationDoc | undefined;
  if (row.stageAutomationProtocolVersion !== 1 || candidates.length !== 1 || !accepted || accepted.tenantId !== tenantId ||
      accepted.trigger !== businessAutomationTrigger(stageAutomationSourceKindForType(row.type))) {
    throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PLAN_MISSING");
  }
  const config = await tx.get(adminDb.collection("automations").doc(automationId));
  if (!config.exists || config.data()?.tenantId !== tenantId || digest(plan(normalizeAutomationDoc(config.id, config.data()!, tenantId))) !== digest(plan(accepted))) {
    throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CONFIGURATION_REVOKED");
  }
  return { accepted, config, planDigest: digest(plan(accepted)), key: digest(automationId) };
}

/** Freeze even an empty eligible set on the existing business occurrence.
 * There is no new queue, synthetic proposal, or event invented from a lead ID. */
export async function freezeStageAutomationPlans(input: SourceInput & {
  previousStage: string; nextStage: string; matches: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData) => boolean;
}) {
  return adminDb.runTransaction(async tx => {
    const source = await parent(tx, input), row = source.data()!;
    if (businessAutomationTrigger(input.source.kind) === "lead_stage_changed" &&
        (normalizePipelineStageId(row.previousStage || "captado") !== input.previousStage || row.nextStage !== input.nextStage)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CONTEXT_CHANGED");
    if (row.stageAutomationPlans !== undefined) {
      if (row.stageAutomationProtocolVersion !== 1 || !Array.isArray(row.stageAutomationPlans)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PLAN_INVALID");
      return row.stageAutomationPlans as TenantAutomationDoc[];
    }
    const lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
    if (lead.data()?.tenantId !== input.tenantId) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_LEAD_REVOKED");
    const progress = readStageHookProgress(row);
    const captureApproval = progress?.version === 2 && row.type === "crm_proposal_mutation" && row.approved === true;
    const frozen: ReturnType<typeof plan>[] = [];
    const candidates: Array<{ id: string; tenantId: string; enabled: boolean; status: TenantAutomationDoc["status"]; conditions: TenantAutomationDoc["conditions"]; planDigest: string }> = [];
    const assertActive = () => {
      if (millis(row.leaseUntil) <= Date.now()) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_SOURCE_LEASE_EXPIRED");
    };
    await visitTenantAutomationCatalogue(tx, input.tenantId, (id, data) => {
      const doc = normalizeAutomationDoc(id, data, input.tenantId);
      if (input.matches(doc, lead.data()!)) {
        frozen.push(plan(doc));
        if (frozen.length > 120) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PLAN_TOO_LARGE");
      }
      if (captureApproval && doc.trigger === "budget_approved") {
        candidates.push({ id: doc.id, tenantId: doc.tenantId, enabled: doc.enabled, status: doc.status, conditions: doc.conditions, planDigest: digest(plan(doc)) });
        if (candidates.length > 120) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_APPROVAL_SCOPE_TOO_LARGE");
      }
    }, assertActive);
    const recoverable = progress?.version === 2 && progress.steps.find(step => step.status !== "done")?.name === "automations" &&
      frozen.every(automation => automation.actions.every(supportsReceiptBackedAutomationAction));
    let approvalScope: Record<string, unknown> = {};
    if (recoverable && row.type === "crm_proposal_mutation" && row.approved === true) {
      const { stageApprovalCandidateFingerprint } = await import("@/lib/server/automation-proposal-delivery");
      approvalScope = { stageApprovalCandidateProtocol: 1, stageApprovalCandidates: candidates, stageApprovalCandidateFingerprint: stageApprovalCandidateFingerprint(candidates) };
    }
    let crmState: Record<string, unknown> = {};
    if (frozen.some(automation => automation.actions.some(supportsAtomicCrmEffect))) {
      let pipeline = null;
      try { pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId); }
      catch (error) { if (!(error instanceof TenantPipelineConfigurationError)) throw error; }
      crmState = { stageCrmProtocolVersion: 1, stageCrmBaseline: crmMutationBaseline(lead.data()!),
        stageCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.data()!.crmFieldOwnership?.[field] || null])),
        stageCrmPipeline: pipeline };
    }
    assertActive();
    tx.update(source.ref, { stageAutomationProtocolVersion: 1, stageInternalEffectProtocolVersion: 1, stageAutomationPlans: frozen,
      ...(recoverable ? { stageRunRecoveryProtocol: 2 } : {}), ...approvalScope, ...crmState });
    return frozen;
  });
}

/** The business-effect executor shares atomic writes with proposal approvals,
 * but keeps stage source IDs, plans and receipts distinct; never a fake proposal. */
export async function authorizeStageAutomationInternalRecords(tx: FirebaseFirestore.Transaction, input: SourceInput & {
  automationId: string; actionIndex: number; action: TenantAutomationAction; scheduled?: { id: string; token: string };
}) {
  if (input.scheduled) {
    const scheduled = await tx.get(adminDb.collection("jobs").doc(input.scheduled.id));
    const authority = await assertStageAutomationSchedule(tx, scheduled.id, scheduled.data() || {}, "effect", input.scheduled.token);
    const row = scheduled.data()!;
    if (row.tenantId !== input.tenantId || row.leadId !== input.leadId || row.stageSourceId !== input.source.id || row.stageSourceKind !== input.source.kind ||
        row.automationId !== input.automationId || row.actionIndex !== input.actionIndex || !isDeepStrictEqual(row.action, input.action)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_INPUT_CHANGED");
    return { source: authority.source, key: authority.key, planDigest: authority.planDigest, manifest: authority.manifest };
  }
  const source = await parent(tx, input), row = source.data()!, binding = await acceptedPlan(tx, row, input.tenantId, input.automationId);
  const run = row.stageAutomationRuns?.[binding.key];
  if (row.stageInternalEffectProtocolVersion !== 1 || !supportsAtomicAutomationEffect(input.action) ||
      !Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0 || Number(input.action.waitInHours || 0) !== 0 ||
      !isDeepStrictEqual(actionAt(binding.accepted, input.actionIndex), input.action) || run?.status !== "processing" ||
      run.automationId !== input.automationId || run.planDigest !== binding.planDigest) throw new StageAutomationAuthorizationError("STAGE_INTERNAL_ACTION_REVOKED");
  return { source, key: binding.key, planDigest: binding.planDigest, manifest: null };
}

export async function commitStageAutomationInternalRecords(input: SourceInput & {
  automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction; scheduled?: { id: string; token: string };
}) {
  const { commitBusinessAutomationInternalRecords } = await import("@/lib/server/automation-proposal-delivery");
  return commitBusinessAutomationInternalRecords({ ...input, claim: input.source, stageSource: input.source });
}

/** Reuse the original run's quota, identity and time. No second queue/cron. */
export async function scheduleStageAutomationAction(input: SourceInput & {
  automation: TenantAutomationDoc; actionIndex: number; action: TenantAutomationAction; chatId?: string | null;
}) {
  const id = `stage_schedule_${digest([input.tenantId, input.source.kind, input.source.id, input.automation.id, input.actionIndex])}`;
  return adminDb.runTransaction(async tx => {
    const source = await parent(tx, input), row = source.data()!, binding = await acceptedPlan(tx, row, input.tenantId, input.automation.id);
    const action = actionAt(binding.accepted, input.actionIndex), wait = Number(action?.waitInHours), start = millis(row.createdAt);
    const run = row.stageAutomationRuns?.[binding.key], quota = row.stageUsageReservations?.[binding.key];
    if (!Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0 || !isDeepStrictEqual(action, input.action) ||
        binding.planDigest !== digest(plan(input.automation)) || !Number.isFinite(wait) || wait <= 0 || wait > 720 || !start ||
        !(action?.type === "send_message" || supportsAtomicAutomationEffect(action)) || run?.status !== "processing" ||
        run.planDigest !== binding.planDigest || run.automationId !== input.automation.id || !quota || quota.allowed !== true ||
        quota.automationId !== input.automation.id || quota.planDigest !== binding.planDigest || !Number.isFinite(quota.limit) || !Number.isFinite(quota.currentUsage)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_PLAN_OR_QUOTA_CHANGED");
    const message = action.type === "send_message", chatId = message ? input.chatId : null;
    let routingDigest: string | null = null;
    if (message) {
      if (typeof chatId !== "string" || !chatId || chatId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CHAT_INVALID");
      const chat = await tx.get(adminDb.collection("chats").doc(chatId)), channelId = chat.data()?.channelId;
      if (chat.data()?.tenantId !== input.tenantId || chat.data()?.leadId !== input.leadId || chat.data()?.isGroup === true ||
          typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CHAT_REVOKED");
      const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
      if (channel.data()?.tenantId !== input.tenantId || channel.data()?.status !== "active") throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CHANNEL_REVOKED");
      routingDigest = routing(chat.data()!, channel.data()!);
    } else if (row.stageInternalEffectProtocolVersion !== 1) throw new StageAutomationAuthorizationError("STAGE_INTERNAL_SCHEDULE_LEGACY_PLAN");
    const existing = await tx.get(adminDb.collection("jobs").doc(id));
    const manifest = { chatId: chatId || null, automationId: input.automation.id, actionIndex: input.actionIndex, planDigest: binding.planDigest,
      routingDigest, executeAfterMs: Math.trunc(start + wait * 3600_000), internalEffectProtocolVersion: message ? null : 1 };
    if (existing.exists || row.stageAutomationSchedules?.[id]) {
      const previous = existing.data();
      if (!previous || previous.type !== "automation_scheduled_action" || previous.tenantId !== input.tenantId || previous.leadId !== input.leadId ||
          previous.stageScheduleProtocol !== 1 || previous.stageSourceId !== input.source.id || previous.stageSourceKind !== input.source.kind ||
          previous.chatId !== manifest.chatId || previous.automationId !== input.automation.id || previous.actionIndex !== input.actionIndex ||
          !isDeepStrictEqual(previous.action, action) || millis(previous.executeAfter) !== manifest.executeAfterMs ||
          !isDeepStrictEqual(row.stageAutomationSchedules?.[id], manifest)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_RECEIPT_CHANGED");
      return id;
    }
    tx.create(existing.ref, { tenantId: input.tenantId, type: "automation_scheduled_action", trigger: businessAutomationTrigger(input.source.kind), status: "pending", attempts: 0,
      stageScheduleProtocol: 1, stageSourceId: input.source.id, stageSourceKind: input.source.kind, leadId: input.leadId, chatId: manifest.chatId,
      automationId: input.automation.id, automationName: input.automation.name, actionIndex: input.actionIndex, action,
      ...(message ? {} : { internalEffectProtocolVersion: 1 }), executeAfter: new Date(manifest.executeAfterMs),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(source.ref, { [`stageAutomationSchedules.${id}`]: manifest });
    return id;
  });
}

export async function assertStageAutomationSchedule(tx: FirebaseFirestore.Transaction, id: string, row: FirebaseFirestore.DocumentData,
  phase: "claim" | "quota" | "enqueue" | "effect" | "delivery", token?: string) {
  if (row.type !== "automation_scheduled_action" || row.trigger !== businessAutomationTrigger(row.stageSourceKind) || row.stageScheduleProtocol !== 1 ||
      typeof row.stageSourceId !== "string" || !row.stageSourceId || row.stageSourceId.includes("/") || !isStageAutomationSourceKind(row.stageSourceKind)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_PROTOCOL_INVALID");
  const raw = await tx.get(adminDb.collection("jobs").doc(row.stageSourceId)), initial = raw.data();
  if (initial && initial.tenantId === row.tenantId && initial.status === "processing" && millis(initial.leaseUntil) > Date.now()) throw new InboundAutomationPreparingError();
  const source = await parent(tx, { tenantId: row.tenantId, leadId: row.leadId, source: { kind: row.stageSourceKind, id: row.stageSourceId, token: "" } }, true);
  const root = source.data()!, binding = await acceptedPlan(tx, root, row.tenantId, row.automationId), action = actionAt(binding.accepted, row.actionIndex);
  const manifest = root.stageAutomationSchedules?.[id], wait = Number(action?.waitInHours), start = millis(root.createdAt);
  const run = root.stageAutomationRuns?.[binding.key], reservation = root.stageUsageReservations?.[binding.key];
  if (id !== `stage_schedule_${digest([row.tenantId, row.stageSourceKind, row.stageSourceId, row.automationId, row.actionIndex])}` ||
      !Number.isSafeInteger(row.actionIndex) || row.actionIndex < 0 || !manifest || manifest.automationId !== row.automationId || manifest.actionIndex !== row.actionIndex ||
      manifest.planDigest !== binding.planDigest || manifest.chatId !== row.chatId || !isDeepStrictEqual(action, row.action) || !Number.isFinite(wait) || wait <= 0 || wait > 720 || !start ||
      Math.trunc(start + wait * 3600_000) !== manifest.executeAfterMs || millis(row.executeAfter) !== manifest.executeAfterMs || manifest.executeAfterMs > Date.now() ||
      run?.status !== "done" || run.automationId !== row.automationId || run.planDigest !== binding.planDigest || !reservation || reservation.allowed !== true ||
      reservation.automationId !== row.automationId || reservation.planDigest !== binding.planDigest || !Number.isFinite(reservation.limit) || !Number.isFinite(reservation.currentUsage)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_MANIFEST_REVOKED");
  if (action.type === "send_message") {
    if (phase === "effect") throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_NOT_INTERNAL");
    if (typeof row.chatId !== "string" || !row.chatId || row.chatId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CHAT_INVALID");
    const chat = await tx.get(adminDb.collection("chats").doc(row.chatId)), channelId = chat.data()?.channelId;
    if (chat.data()?.tenantId !== row.tenantId || chat.data()?.leadId !== row.leadId || chat.data()?.isGroup === true ||
        typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CHAT_REVOKED");
    const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
    if (channel.data()?.tenantId !== row.tenantId || channel.data()?.status !== "active" || !sameRouting(chat.data()!, channel.data()!, manifest.routingDigest)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_ROUTING_REVOKED");
    const state = (await tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(row.tenantId, row.chatId)))).data();
    if (millis(state?.pausedUntil) > Date.now() || state?.aiEnabled === false && state?.humanOwnerUserId) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_HUMAN_PAUSE");
  } else if (!supportsAtomicAutomationEffect(action) || manifest.internalEffectProtocolVersion !== 1 || row.internalEffectProtocolVersion !== 1 ||
      root.stageInternalEffectProtocolVersion !== 1 || row.chatId !== null || manifest.routingDigest !== null || phase === "enqueue" || phase === "delivery") throw new StageAutomationAuthorizationError("STAGE_INTERNAL_SCHEDULE_INVALID");
  if (["quota", "enqueue", "effect"].includes(phase) && (row.status !== "processing" || row.claimToken !== token || millis(row.leaseUntil) <= Date.now() ||
      action.type !== "send_message" && (row.internalEffectExecutorVersion !== 1 || row.internalEffectExecutorToken !== token))) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_CLAIM_LOST");
  if (phase === "delivery") {
    if (row.status !== "done") {
      if (row.status === "processing" && millis(row.leaseUntil) > Date.now() || ["pending", "retrying", "processing"].includes(row.status) && row.schedulerProtocolVersion === 1 && Number(row.attempts) < 3) throw new InboundAutomationPreparingError();
      throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_NOT_COMPLETED");
    }
    const key = digest([row.tenantId, row.stageSourceKind, source.id, row.automationId, row.actionIndex]);
    const identity = createChatOutboundIdentity({ tenantId: row.tenantId, chatId: `stage-${key}`, clientRequestId: `stage-${key}` });
    if (row.outboundJobId !== identity.jobId || row.messageId !== identity.messageId) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_DELIVERY_RECEIPT_CHANGED");
  }
  return { source, config: binding.config, automation: binding.accepted, key: binding.key, planDigest: binding.planDigest, reservation, manifest };
}

export async function commitScheduledStageAutomationInternalRecords(input: { tenantId: string; leadId: string; scheduledJobId: string; token: string; action: TenantAutomationAction }) {
  const scheduled = await adminDb.collection("jobs").doc(input.scheduledJobId).get(), row = scheduled.data();
  if (!isStageAutomationSchedule(scheduled.id, row || {})) return null;
  const authority = await adminDb.runTransaction(tx => assertStageAutomationSchedule(tx, scheduled.id, row || {}, "effect", input.token));
  if (row?.tenantId !== input.tenantId || row.leadId !== input.leadId) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_INPUT_CHANGED");
  return commitStageAutomationInternalRecords({ tenantId: input.tenantId, leadId: input.leadId, source: { kind: row.stageSourceKind, id: row.stageSourceId, token: "" },
    automation: authority.automation, actionIndex: row.actionIndex, action: input.action, scheduled: { id: scheduled.id, token: input.token } });
}

export async function authorizeStageAutomationReservation(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; sourceId: string; token: string; automationId: string; sourceKind?: StageAutomationSourceKind;
}) {
  const initial = await tx.get(adminDb.collection("jobs").doc(input.sourceId));
  const source = await parent(tx, { tenantId: input.tenantId, leadId: String(initial.data()?.leadId || ""),
    source: { kind: input.sourceKind!, id: input.sourceId, token: input.token } });
  const binding = await acceptedPlan(tx, source.data()!, input.tenantId, input.automationId);
  return { key: binding.key, planDigest: binding.planDigest };
}

/** v1 remains review-only after interruption. v2 is admitted only with the
 * shared receipt-capable executor and immutable stage plans. */
export async function beginStageAutomationRun(input: SourceInput & { automationId: string }) {
  return adminDb.runTransaction(async tx => {
    const source = await parent(tx, input), row = source.data()!, binding = await acceptedPlan(tx, row, input.tenantId, input.automationId);
    const quota = row.stageUsageReservations?.[binding.key];
    if (!quota || quota.allowed !== true || quota.automationId !== input.automationId || quota.planDigest !== binding.planDigest ||
        !Number.isFinite(quota.limit) || !Number.isFinite(quota.currentUsage)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_QUOTA_MISSING");
    const previous = row.stageAutomationRuns?.[binding.key];
    if (previous) {
      if (previous.planDigest !== binding.planDigest || previous.automationId !== input.automationId) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PARTIAL_RUN_REQUIRES_RECONCILIATION");
      if (previous.status === "done") return { key: binding.key, token: previous.token as string, replayed: true };
      if (!canReplayStageAutomationHook(row) || previous.recoveryProtocolVersion !== 2 || !["processing", "reconciliation_required"].includes(previous.status) ||
          !Number.isSafeInteger(previous.attempts) || previous.attempts < 1 || previous.attempts >= 3) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PARTIAL_RUN_REQUIRES_RECONCILIATION");
      const token = randomUUID();
      tx.update(source.ref, { [`stageAutomationRuns.${binding.key}.token`]: token, [`stageAutomationRuns.${binding.key}.status`]: "processing",
        [`stageAutomationRuns.${binding.key}.attempts`]: previous.attempts + 1 });
      return { key: binding.key, token, replayed: false };
    }
    const token = randomUUID();
    tx.update(source.ref, { [`stageAutomationRuns.${binding.key}`]: { automationId: input.automationId, planDigest: binding.planDigest, token,
      ...(canReplayStageAutomationHook(row) ? { recoveryProtocolVersion: 2, attempts: 1 } : {}),
      status: "processing", completionMeaning: "actions_started_not_provider_delivery", createdAt: FieldValue.serverTimestamp() } });
    return { key: binding.key, token, replayed: false };
  });
}

export async function finishStageAutomationRun(input: SourceInput & { automationId: string; run: { key: string; token: string }; failed?: boolean }) {
  return adminDb.runTransaction(async tx => {
    const source = input.failed ? await tx.get(adminDb.collection("jobs").doc(input.source.id)) : await parent(tx, input);
    const row = source.data(), run = row?.stageAutomationRuns?.[input.run.key];
    if (!row || row.type !== stageAutomationSourceType(input.source.kind) ||
        row.tenantId !== input.tenantId || row.leadId !== input.leadId || row.status !== "processing" || row.claimToken !== input.source.token || !(row.leaseUntil?.toMillis?.() > Date.now()) ||
        !run || run.token !== input.run.token || run.automationId !== input.automationId || run.status !== "processing") return false;
    tx.update(source.ref, { [`stageAutomationRuns.${input.run.key}.status`]: input.failed ? "reconciliation_required" : "done",
      [`stageAutomationRuns.${input.run.key}.completionMeaning`]: input.failed ? "partial_actions_need_reconciliation" : "actions_registered_not_provider_delivery" });
    return true;
  });
}

function routing(chat: FirebaseFirestore.DocumentData, channel: FirebaseFirestore.DocumentData) {
  return digest([chat.channel || "whatsapp", chat.channelId || null, chat.contactPhone || null, chat.contactExternalId || null,
    chat.channelPhoneNumberId || null, chat.channelExternalAccountId || null, channel.tenantId, channel.type, channel.provider || null,
    channel.status || null, channel.phoneNumberId || null, channel.externalAccountId || null, channel.pageId || null,
    channel.ownerUserId || null, channel.channelScope || null, channel.metadata?.sessionId || null, channel.metadata?.gatewayEndpoint || null]);
}
function sameRouting(chat: FirebaseFirestore.DocumentData, channel: FirebaseFirestore.DocumentData, expected: string) {
  if (routing(chat, channel) === expected) return true;
  // Delivery fills this optional mirror from the already bound channel. A
  // missing mirror and that exact channel number describe the same route.
  // Keep old digests valid; any different number/channel still changes them.
  const phone = channel.phoneNumberId;
  if (typeof phone !== "string" || !phone || chat.channelPhoneNumberId && chat.channelPhoneNumberId !== phone) return false;
  return routing({ ...chat, channelPhoneNumberId: chat.channelPhoneNumberId ? null : phone }, channel) === expected;
}
export function stageAutomationFingerprint(job: Record<string, unknown>) {
  if (!String(job.clientRequestId || "").startsWith("stage-") && job.stageAutomationProtocol === undefined && job.stageAutomationSourceId === undefined) return null;
  if (job.stageAutomationProtocol !== 1 || job.origin !== "automation" || job.replyToId != null || !isStageAutomationSourceKind(job.stageAutomationSourceKind) ||
      ![job.tenantId, job.chatId, job.stageAutomationSourceId, job.automationSourceLeadId, job.automationId, job.stageAutomationPlanDigest, job.stageAutomationRoutingDigest]
        .every(value => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/")) ||
      !Number.isSafeInteger(job.automationActionIndex) || Number(job.automationActionIndex) < 0) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_PROTOCOL_INVALID");
  const delayed = job.stageScheduledJobId !== undefined || job.stageScheduledGuardVersion !== undefined;
  if (delayed && (job.stageScheduledGuardVersion !== 1 || typeof job.stageScheduledJobId !== "string" || !/^stage_schedule_[a-f0-9]{64}$/.test(job.stageScheduledJobId))) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_PROTOCOL_INVALID");
  return createChatOutboundFingerprint(["stage-automation-v1", job.tenantId, job.chatId, normalizeOutboundText(job.text), {
    stageAutomationProtocol: 1, stageAutomationSourceId: job.stageAutomationSourceId, stageAutomationSourceKind: job.stageAutomationSourceKind,
    automationSourceLeadId: job.automationSourceLeadId, automationId: job.automationId, automationActionIndex: job.automationActionIndex,
    stageAutomationPlanDigest: job.stageAutomationPlanDigest, stageAutomationRoutingDigest: job.stageAutomationRoutingDigest,
    ...(delayed ? { stageScheduledJobId: job.stageScheduledJobId, stageScheduledGuardVersion: job.stageScheduledGuardVersion } : {}) }]);
}

async function authorizeMessage(tx: FirebaseFirestore.Transaction, input: SourceInput & { automationId: string; index: number; text: string; planDigest: string; scheduled?: { id: string; token: string } }) {
  if (input.scheduled) {
    const scheduled = await tx.get(adminDb.collection("jobs").doc(input.scheduled.id)), row = scheduled.data();
    const authority = await assertStageAutomationSchedule(tx, scheduled.id, row || {}, "enqueue", input.scheduled.token);
    if (!row || row.tenantId !== input.tenantId || row.leadId !== input.leadId || row.stageSourceId !== input.source.id || row.stageSourceKind !== input.source.kind ||
        row.automationId !== input.automationId || row.actionIndex !== input.index || authority.planDigest !== input.planDigest ||
        normalizeOutboundText(row.action?.text || "") !== input.text) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_INPUT_CHANGED");
    return { source: authority.source, config: authority.config, scheduled };
  }
  const source = await parent(tx, input), binding = await acceptedPlan(tx, source.data()!, input.tenantId, input.automationId), action = actionAt(binding.accepted, input.index);
  const run = source.data()?.stageAutomationRuns?.[binding.key], quota = source.data()?.stageUsageReservations?.[binding.key];
  if (binding.planDigest !== input.planDigest || !Number.isSafeInteger(input.index) || input.index < 0 || action?.type !== "send_message" ||
      Number(action.waitInHours || 0) !== 0 || normalizeOutboundText(action.text || "") !== input.text || !run || run.status !== "processing" ||
      run.automationId !== input.automationId || run.planDigest !== binding.planDigest || !quota || quota.allowed !== true ||
      quota.automationId !== input.automationId || quota.planDigest !== binding.planDigest || !Number.isFinite(quota.limit) ||
      !Number.isFinite(quota.currentUsage)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_ACTION_CHANGED");
  return { source, config: binding.config, scheduled: null };
}

export async function queueStageAutomationMessage(input: SourceInput & { chatId: string; automation: TenantAutomationDoc; actionIndex: number; text: string; scheduled?: { id: string; token: string } }) {
  const text = normalizeOutboundText(input.text), chat = (await adminDb.collection("chats").doc(input.chatId).get()).data();
  if (!chat || chat.tenantId !== input.tenantId || chat.leadId !== input.leadId || chat.isGroup === true || typeof chat.channelId !== "string" || !chat.channelId || chat.channelId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CHAT_INVALID");
  const channel = (await adminDb.collection("tenant_channels").doc(chat.channelId).get()).data();
  if (channel?.tenantId !== input.tenantId || channel.status !== "active") throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CHANNEL_REVOKED");
  const key = digest([input.tenantId, input.source.kind, input.source.id, input.automation.id, input.actionIndex]);
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: `stage-${key}`, clientRequestId: `stage-${key}` });
  const metadata = { stageAutomationProtocol: 1, stageAutomationSourceId: input.source.id, stageAutomationSourceKind: input.source.kind,
    automationSourceLeadId: input.leadId, automationId: input.automation.id, automationActionIndex: input.actionIndex,
    stageAutomationPlanDigest: digest(plan(input.automation)), stageAutomationRoutingDigest: routing(chat, channel),
    ...(input.scheduled ? { stageScheduledJobId: input.scheduled.id, stageScheduledGuardVersion: 1 } : {}) };
  const authorization = { ...input, automationId: input.automation.id, index: input.actionIndex, text, planDigest: metadata.stageAutomationPlanDigest };
  await adminDb.runTransaction(tx => authorizeMessage(tx, authorization));
  return commitChatOutboundEnqueue({ tenantId: input.tenantId, chatId: input.chatId, identity,
    actor: { id: `automation:${input.automation.id}`, name: input.automation.name }, replyToId: null, preview: text, pauseAi: false,
    stateId: getChatStateDocId(input.tenantId, input.chatId), fingerprint: stageAutomationFingerprint({ tenantId: input.tenantId, chatId: input.chatId, origin: "automation", text, ...metadata })!,
    beforeCommit: async (batch, currentChat) => {
      if (currentChat.leadId !== input.leadId || currentChat.isGroup === true) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CHAT_CHANGED");
      const versions = await adminDb.runTransaction(async tx => {
        const authority = await authorizeMessage(tx, authorization), lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
        const currentChannel = await tx.get(adminDb.collection("tenant_channels").doc(chat.channelId));
        if (currentChannel.data()?.tenantId !== input.tenantId || !sameRouting(currentChat, currentChannel.data()!, metadata.stageAutomationRoutingDigest)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_ROUTING_CHANGED");
        return [authority.source, authority.config, lead, currentChannel, ...(authority.scheduled ? [authority.scheduled] : [])];
      });
      for (const version of versions) {
        if (!version.updateTime) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_SOURCE_MISSING");
        batch.update(version.ref, { tenantId: input.tenantId }, { lastUpdateTime: version.updateTime });
      }
    },
    build: currentChat => ({ message: { type: "text", text, channel: currentChat.channel || "whatsapp", automationGenerated: true, aiGenerated: false, ...metadata },
      job: { kind: "text", text, origin: "automation", ...metadata } }),
  });
}

export async function queueScheduledStageAutomationMessage(input: { tenantId: string; chatId: string; scheduledJobId: string; automationId: string; text: string; schedulerClaimToken?: string }) {
  const accepted = await adminDb.runTransaction(async tx => {
    const scheduled = await tx.get(adminDb.collection("jobs").doc(input.scheduledJobId)), row = scheduled.data();
    const authority = await assertStageAutomationSchedule(tx, scheduled.id, row || {}, "enqueue", input.schedulerClaimToken);
    if (!row || row.tenantId !== input.tenantId || row.chatId !== input.chatId || row.automationId !== input.automationId ||
        normalizeOutboundText(row.action?.text || "") !== normalizeOutboundText(input.text)) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_INPUT_CHANGED");
    return { leadId: String(row.leadId), source: { kind: row.stageSourceKind as StageAutomationSource["kind"], id: String(row.stageSourceId), token: "" },
      automation: authority.automation, actionIndex: Number(row.actionIndex) };
  });
  return queueStageAutomationMessage({ tenantId: input.tenantId, chatId: input.chatId, ...accepted, text: input.text,
    scheduled: { id: input.scheduledJobId, token: input.schedulerClaimToken || "" } });
}

export async function assertStageAutomationDeliveryAllowed(job: Record<string, unknown>, tx: FirebaseFirestore.Transaction) {
  const fingerprint = stageAutomationFingerprint(job);
  if (!fingerprint) return;
  if (fingerprint !== job.requestFingerprint) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_FINGERPRINT_CHANGED");
  const raw = await tx.get(adminDb.collection("jobs").doc(String(job.stageAutomationSourceId))), initial = raw.data();
  if (initial && initial.tenantId === job.tenantId && initial.status === "processing" && initial.leaseUntil?.toMillis?.() > Date.now()) throw new InboundAutomationPreparingError();
  const source = await parent(tx, { tenantId: String(job.tenantId), leadId: String(job.automationSourceLeadId),
    source: { kind: job.stageAutomationSourceKind as StageAutomationSource["kind"], id: String(job.stageAutomationSourceId), token: "" } }, true);
  const binding = await acceptedPlan(tx, source.data()!, String(job.tenantId), String(job.automationId)), action = actionAt(binding.accepted, Number(job.automationActionIndex));
  const run = source.data()?.stageAutomationRuns?.[binding.key], quota = source.data()?.stageUsageReservations?.[binding.key];
  const delayed = job.stageScheduledJobId !== undefined;
  if (delayed) {
    const scheduled = await tx.get(adminDb.collection("jobs").doc(String(job.stageScheduledJobId))), row = scheduled.data();
    const authority = await assertStageAutomationSchedule(tx, scheduled.id, row || {}, "delivery");
    if (!row || row.stageSourceId !== source.id || row.stageSourceKind !== job.stageAutomationSourceKind || row.leadId !== job.automationSourceLeadId ||
        row.chatId !== job.chatId || row.automationId !== job.automationId || row.actionIndex !== job.automationActionIndex ||
        authority.manifest.planDigest !== job.stageAutomationPlanDigest || authority.manifest.routingDigest !== job.stageAutomationRoutingDigest ||
        normalizeOutboundText(row.action?.text || "") !== job.text) throw new StageAutomationAuthorizationError("STAGE_SCHEDULE_OUTBOX_CHANGED");
  }
  if (binding.planDigest !== job.stageAutomationPlanDigest || action?.type !== "send_message" || (!delayed && Number(action.waitInHours || 0) !== 0) ||
      normalizeOutboundText(action.text || "") !== job.text || run?.status !== "done" || run.automationId !== job.automationId || run.planDigest !== binding.planDigest ||
      !quota || quota.allowed !== true || quota.automationId !== job.automationId || quota.planDigest !== binding.planDigest ||
      !Number.isFinite(quota.limit) || !Number.isFinite(quota.currentUsage)) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_ACTION_REVOKED");
  const chat = await tx.get(adminDb.collection("chats").doc(String(job.chatId))), channelId = chat.data()?.channelId;
  if (chat.data()?.tenantId !== job.tenantId || chat.data()?.leadId !== job.automationSourceLeadId || chat.data()?.isGroup === true || typeof channelId !== "string" || !channelId || channelId.includes("/")) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_CHAT_REVOKED");
  const channel = await tx.get(adminDb.collection("tenant_channels").doc(channelId));
  if (channel.data()?.tenantId !== job.tenantId || !sameRouting(chat.data()!, channel.data()!, String(job.stageAutomationRoutingDigest))) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_ROUTING_REVOKED");
  const control = (await tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(String(job.tenantId), String(job.chatId))))).data();
  if (control?.pausedUntil?.toMillis?.() > Date.now() || control?.aiEnabled === false && control?.humanOwnerUserId) throw new StageAutomationAuthorizationError("STAGE_AUTOMATION_HUMAN_PAUSE");
}
