import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import type { TenantAutomationAction } from "@/lib/server/automations";
import { inboundAutomationSourceKey, InboundAutomationPreparingError, type InboundAutomationClaim } from "@/lib/server/automation-inbound-execution";
import { supportsAtomicAutomationEffect, supportsAtomicCrmEffect, supportsRecoverableInboundAction } from "@/lib/automation-effect-contract";
import { crmFieldValue, isCrmFieldManuallyOwned, type OwnedCrmField } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { normalizePipelineStageId } from "@/lib/pipeline";
export { supportsAtomicAutomationEffect } from "@/lib/automation-effect-contract";
export class AutomationInternalEffectAuthorizationError extends Error {}
async function authorizedPipeline(tx: FirebaseFirestore.Transaction, tenantId: string) {
  try { return await loadTenantPipelineInTransaction(tx, tenantId); }
  catch (error) {
    if (!(error instanceof TenantPipelineConfigurationError)) throw error;
    throw new AutomationInternalEffectAuthorizationError(error.message);
  }
}

/** Internal data, receipt and commercial event commit together. A task is not a
 * notification or a human acceptance. No provider/network effect occurs here. */
export async function commitInboundAutomationInternalEffect(input: {
  tenantId: string; chatId: string; leadId: string; sourceMessageId: string;
  claim: InboundAutomationClaim; actionIndex: number; action: TenantAutomationAction;
  scheduled?: { id: string; token: string };
}) {
  if (!supportsAtomicAutomationEffect(input.action) || !Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0) {
    throw new AutomationInternalEffectAuthorizationError("Efeito interno sem contrato atomico.");
  }
  const id = `automation_effect_${createHash("sha256").update(JSON.stringify([input.claim.id, input.actionIndex])).digest("hex")}`;
  const receiptRef = adminDb.collection("jobs").doc(id);
  return adminDb.runTransaction(async tx => {
    const [run, receipt, lead, chat, source, config, scheduled] = await Promise.all([
      tx.get(adminDb.collection("jobs").doc(input.claim.id)), tx.get(receiptRef),
      tx.get(adminDb.collection("leads").doc(input.leadId)), tx.get(adminDb.collection("chats").doc(input.chatId)),
      tx.get(adminDb.collection("messages").doc(input.sourceMessageId)), tx.get(adminDb.collection("automations").doc(input.claim.plan.id)),
      input.scheduled ? tx.get(adminDb.collection("jobs").doc(input.scheduled.id)) : Promise.resolve(null),
    ]);
    const row = run.data(), sourceData = source.data(), chatData = chat.data();
    const actions = Array.isArray(row?.plan?.actions) ? [...row.plan.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)) : [];
    if (!row || row.type !== "automation_inbound_execution" || row.tenantId !== input.tenantId || row.chatId !== input.chatId || row.leadId !== input.leadId ||
        row.sourceMessageId !== input.sourceMessageId || row.automationId !== input.claim.plan.id ||
        (!input.scheduled && (row.claimToken !== input.claim.token || row.status !== "processing" ||
          typeof row.leaseUntil?.toMillis !== "function" || row.leaseUntil.toMillis() <= Date.now() || Number(input.action.waitInHours || 0) > 0)) ||
        !isDeepStrictEqual(actions[input.actionIndex], input.action) || !lead.exists || lead.data()?.tenantId !== input.tenantId ||
        !sourceData || sourceData.tenantId !== input.tenantId || sourceData.chatId !== input.chatId || sourceData.sender !== "client" ||
        (sourceData.leadId && sourceData.leadId !== input.leadId) || sourceData.isGroup === true ||
        !chatData || chatData.tenantId !== input.tenantId || chatData.leadId !== input.leadId || chatData.isGroup === true ||
        (sourceData.channelId && sourceData.channelId !== chatData.channelId) ||
        row.sourceEventKey !== inboundAutomationSourceKey(input.tenantId, input.sourceMessageId, sourceData, chatData) ||
        !config.exists || config.data()?.tenantId !== input.tenantId || config.data()?.enabled === false || config.data()?.status === "paused" ||
        typeof row.automationConfigVersion?.isEqual !== "function" || !row.automationConfigVersion.isEqual(config.updateTime) ||
        typeof row.createdAt?.toMillis !== "function") {
      throw new AutomationInternalEffectAuthorizationError("Fonte/plano do efeito interno revogado, alterado ou sem posse valida.");
    }
    const scheduledData = scheduled?.data();
    if (input.scheduled && (!scheduledData || scheduledData.type !== "automation_scheduled_action" || scheduledData.tenantId !== input.tenantId ||
        scheduledData.leadId !== input.leadId || scheduledData.chatId !== input.chatId || scheduledData.sourceMessageId !== input.sourceMessageId ||
        scheduledData.inboundExecutionId !== input.claim.id || scheduledData.automationId !== row.automationId ||
        scheduledData.actionIndex !== input.actionIndex || !isDeepStrictEqual(scheduledData.action, input.action) ||
        scheduledData.status !== "processing" || scheduledData.claimToken !== input.scheduled.token ||
        typeof scheduledData.leaseUntil?.toMillis !== "function" || scheduledData.leaseUntil.toMillis() <= Date.now() ||
        typeof scheduledData.executeAfter?.toMillis !== "function" || scheduledData.executeAfter.toMillis() > Date.now())) {
      throw new AutomationInternalEffectAuthorizationError("Fonte/plano do efeito agendado revogado, alterado ou sem posse valida.");
    }
    if (input.scheduled && row.status !== "done") {
      if (row.status === "processing" && actions.length > 0 &&
          actions.every(action => supportsRecoverableInboundAction(action, Number(row.executionProtocolVersion))) &&
          (row.leaseUntil?.toMillis?.() > Date.now() || Number(row.attempts || 1) < 3)) throw new InboundAutomationPreparingError();
      throw new AutomationInternalEffectAuthorizationError("Execucao original exige conciliacao antes do efeito agendado.");
    }
    const fingerprint = createHash("sha256").update(JSON.stringify(actions[input.actionIndex])).digest("hex");
    if (receipt.exists) {
      const previous = receipt.data()!;
      if (previous.type !== "automation_internal_effect" || previous.tenantId !== input.tenantId || previous.inboundExecutionId !== input.claim.id ||
          previous.leadId !== input.leadId || previous.chatId !== input.chatId || previous.actionIndex !== input.actionIndex ||
          previous.fingerprint !== fingerprint || previous.status !== "done" ||
          (input.scheduled && previous.scheduledJobId !== input.scheduled.id)) throw new AutomationInternalEffectAuthorizationError("Recibo do efeito interno conflitante.");
      return { executed: previous.outcome ? previous.outcome === "applied" || previous.outcome === "unchanged" : true, event: null, receiptId: id };
    }
    if (supportsAtomicCrmEffect(input.action)) {
      if (row.executionProtocolVersion !== 4 || !row.crmBaseline) {
        throw new AutomationInternalEffectAuthorizationError("Mutacao CRM legada sem contrato/recibo comprovado.");
      }
      const action = input.action;
      const field: OwnedCrmField = action.type === "move_stage" ? "pipelineStage" : action.type === "add_tag" ? "tags" : "priority";
      const currentLead = lead.data()!, before = crmFieldValue(currentLead, field);
      const owner = currentLead.crmFieldOwnership?.[field];
      // Only an earlier receipted action of this same accepted run can advance
      // the baseline. A different actor/run or untracked edit is a conflict.
      const ownPrevious = owner?.source === "automation" && owner.inboundExecutionId === run.id &&
        Number.isSafeInteger(owner.actionIndex) && owner.actionIndex < input.actionIndex && isDeepStrictEqual(owner.value, before);
      let outcome = isCrmFieldManuallyOwned(currentLead, field) ? "blocked_manual"
        : !isDeepStrictEqual(row.crmBaseline[field], before) && !ownPrevious ? "blocked_stale" : "applied";
      let after: unknown = before;
      let requested: unknown = action.type === "move_stage" ? normalizePipelineStageId(action.stageId, "") : action.type === "add_tag" ? action.tag : action.priority;
      let pipelineVersion: string | null = null;
      if (field === "pipelineStage") {
        const pipeline = await authorizedPipeline(tx, input.tenantId);
        pipelineVersion = pipeline.version;
        if (!row.crmPipeline || row.crmPipeline.version !== pipeline.version || !isDeepStrictEqual(row.crmPipeline.stages, pipeline.stages) ||
            !pipeline.stages.some(stage => stage.id === requested)) outcome = "blocked_pipeline";
      }
      if (outcome === "applied") {
        if (field === "tags") {
          const tags = Array.isArray(before) ? before : typeof before === "string" ? before.split(",").map(tag => tag.trim()).filter(Boolean) : [];
          const tag = typeof action.tag === "string" ? action.tag.trim().toLowerCase() : "";
          requested = tag;
          if (!tag || tag.length > 32 || tags.some(tag => typeof tag !== "string") || (before !== null && typeof before !== "string" && !Array.isArray(before))) outcome = "blocked_invalid";
          else if (tags.some(entry => String(entry).toLowerCase() === tag)) outcome = "unchanged";
          else if (tags.length >= 12) outcome = "blocked_capacity";
          else after = [...tags, tag];
        } else if (typeof requested !== "string" || !requested.trim() || (field === "priority" && !["low", "medium", "high"].includes(requested))) {
          outcome = "blocked_invalid";
        } else if (requested === before) outcome = "unchanged";
        else after = requested;
      }
      const applied = outcome === "applied";
      if (applied) tx.update(lead.ref, {
        [field]: after,
        ...(field === "pipelineStage" ? { stage: after, stageUpdatedAt: FieldValue.serverTimestamp() } : {}),
        [`crmFieldOwnership.${field}`]: { source: "automation", locked: false, inboundExecutionId: run.id,
          actionIndex: input.actionIndex, automationEffectId: id, value: after, updatedAt: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(lead.ref.collection("events").doc(id), {
        tenantId: input.tenantId, type: applied ? `automation_${field}_changed` : "automation_crm_mutation_not_applied",
        title: applied ? "Automacao atualizou campo do CRM" : "Automacao preservou campo do CRM",
        field, before, after, requested: requested ?? null, outcome, pipelineVersion,
        actorId: `automation:${row.automationId}`, actorName: String(row.plan.name || "Automacao"), automationId: row.automationId,
        automationEffectId: id, sourceMessageId: input.sourceMessageId, trigger: input.scheduled ? "scheduled_action" : "message_received",
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(receiptRef, { tenantId: input.tenantId, type: "automation_internal_effect", status: "done", inboundExecutionId: input.claim.id,
        leadId: input.leadId, chatId: input.chatId, actionIndex: input.actionIndex, actionType: action.type, fingerprint,
        scheduledJobId: input.scheduled?.id || null, completionMeaning: "crm_mutation_evaluated_not_external_conversion",
        field, before, after, requested: requested ?? null, outcome, pipelineVersion, createdAt: FieldValue.serverTimestamp() });
      if (scheduled) tx.update(scheduled.ref, { internalEffectProtocolVersion: 1, internalEffectExecutorVersion: 1,
        internalEffectExecutorToken: input.scheduled!.token, updatedAt: FieldValue.serverTimestamp() });
      return { executed: applied || outcome === "unchanged", event: null, receiptId: id };
    }
    const action = input.action, isAlert = action.type === "alert_human", isNote = action.type === "add_note";
    const name = String(lead.data()?.nome || "Lead").slice(0, 180), automationName = String(row.plan.name || "Automacao");
    const title = action.title || (isAlert ? `Handoff humano para ${name}` : `Follow-up automatico para ${name}`);
    const hours = Math.max(0, Math.min(24 * 30, Number(action.dueInHours || 0)));
    const dueBase = scheduledData ? scheduledData.executeAfter.toMillis() : row.createdAt.toMillis();
    const dueAt = hours || isAlert ? new Date(dueBase + hours * 3600_000) : null;
    const taskId = isNote ? null : id, noteId = isNote || (isAlert && action.text) ? id : null;
    if (taskId) tx.create(adminDb.collection("lead_tasks").doc(taskId), withCommercialTaskIndex({
      tenantId: input.tenantId, leadId: input.leadId, title,
      type: isAlert ? "alerta_humano" : action.type === "follow_up" ? "follow_up" : action.taskType || "follow_up",
      priority: action.priority || (isAlert ? "high" : lead.data()?.priority || "medium"), dueAt, status: "pending",
      source: "tenant_automation", reasonCode: action.reasonCode || (isAlert ? "human_alert" : action.type === "follow_up" ? "follow_up_due" : "automation_task"),
      ...(isAlert ? { ownerUserId: action.ownerUserId || null, ownerName: action.ownerName || null } : {}),
      createdBy: `automation:${row.automationId}`, createdByName: automationName, automationGenerated: true,
      automationId: row.automationId, automationName, automationEffectId: id,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }));
    if (noteId) tx.create(adminDb.collection("lead_notes").doc(noteId), {
      tenantId: input.tenantId, leadId: input.leadId, text: action.text || "", authorId: `automation:${row.automationId}`,
      authorName: automationName, automationGenerated: true, automationId: row.automationId, automationEffectId: id,
      ...(isAlert ? { reasonCode: action.reasonCode || "human_alert" } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(lead.ref.collection("events").doc(id), {
      tenantId: input.tenantId, type: isAlert ? "automation_human_task_created" : isNote ? "automation_note_added" : "automation_task_created",
      title: isAlert ? "Automacao criou pendencia humana" : isNote ? "Automacao adicionou nota" : "Automacao criou tarefa",
      detail: isNote ? (action.text || "").slice(0, 240) : title, actorId: `automation:${row.automationId}`, actorName: automationName,
      automationId: row.automationId, automationEffectId: id, taskId, noteId, trigger: input.scheduled ? "scheduled_action" : "message_received", createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(receiptRef, { tenantId: input.tenantId, type: "automation_internal_effect", status: "done", inboundExecutionId: input.claim.id,
      leadId: input.leadId, chatId: input.chatId, actionIndex: input.actionIndex, actionType: action.type, fingerprint, taskId, noteId,
      scheduledJobId: input.scheduled?.id || null,
      completionMeaning: "internal_records_committed_not_human_notified", createdAt: FieldValue.serverTimestamp() });
    if (scheduled) tx.update(scheduled.ref, { internalEffectProtocolVersion: 1, internalEffectExecutorVersion: 1,
      internalEffectExecutorToken: input.scheduled!.token, updatedAt: FieldValue.serverTimestamp() });
    return { executed: true, event: null, receiptId: id };
  });
}

/** Legacy triggers do not yet provide a durable causal event. Keep that debt
 * explicit, but apply their CRM write against current data transactionally so
 * they cannot bypass human ownership or the tenant's actual funnel. This is
 * NOT an idempotency receipt or proof of replay-safe legacy fan-out. */
export async function commitLegacyAutomationCrmEffect(input: {
  tenantId: string; leadId: string; automationId: string; automationName: string; trigger: string; action: TenantAutomationAction;
}) {
  if (!supportsAtomicCrmEffect(input.action)) throw new AutomationInternalEffectAuthorizationError("Mutacao CRM sem contrato.");
  const ref = adminDb.collection("leads").doc(input.leadId), event = ref.collection("events").doc();
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref), lead = snapshot.data();
    if (!lead || lead.tenantId !== input.tenantId) throw new AutomationInternalEffectAuthorizationError("Lead CRM fora da empresa.");
    const field: OwnedCrmField = input.action.type === "move_stage" ? "pipelineStage" : input.action.type === "add_tag" ? "tags" : "priority";
    const before = crmFieldValue(lead, field);
    if (isCrmFieldManuallyOwned(lead, field)) return { executed: false, event: null };
    let after: unknown = before;
    if (field === "pipelineStage") {
      const pipeline = await authorizedPipeline(tx, input.tenantId);
      const target = normalizePipelineStageId(input.action.stageId, "");
      if (!pipeline.stages.some(stage => stage.id === target)) return { executed: false, event: null };
      after = target;
    } else if (field === "priority") {
      if (!["low", "medium", "high"].includes(input.action.priority || "")) return { executed: false, event: null };
      after = input.action.priority;
    } else {
      const tags = Array.isArray(before) ? before : typeof before === "string" ? before.split(",").map(tag => tag.trim()).filter(Boolean) : [];
      const tag = input.action.tag?.trim().toLowerCase();
      if (!tag || tags.some(entry => typeof entry !== "string") || (before !== null && typeof before !== "string" && !Array.isArray(before))) return { executed: false, event: null };
      if (tags.some(entry => String(entry).toLowerCase() === tag)) return { executed: true, event: null };
      if (tags.length >= 12) return { executed: false, event: null };
      after = [...tags, tag];
    }
    if (isDeepStrictEqual(before, after)) return { executed: true, event: null };
    tx.update(ref, { [field]: after, ...(field === "pipelineStage" ? { stage: after, stageUpdatedAt: FieldValue.serverTimestamp() } : {}),
      [`crmFieldOwnership.${field}`]: { source: "automation_legacy", locked: false, automationId: input.automationId,
        value: after, updatedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() });
    tx.create(event, { tenantId: input.tenantId, type: `automation_${field}_changed`, title: "Automacao atualizou campo do CRM",
      field, before, after, actorId: `automation:${input.automationId}`, actorName: input.automationName,
      automationId: input.automationId, trigger: input.trigger, causalIdentityPending: true, createdAt: FieldValue.serverTimestamp() });
    return { executed: true, event: null };
  });
}

/** Reconstruct context only from the persisted schedule/root; the transaction
 * above re-reads and authorizes every reference before committing the effect. */
export async function commitScheduledAutomationInternalEffect(input: {
  tenantId: string; leadId: string; chatId: string; scheduledJobId: string; claimToken: string; action: TenantAutomationAction;
}) {
  const scheduled = await adminDb.collection("jobs").doc(input.scheduledJobId).get(), entry = scheduled.data();
  if (!entry?.inboundExecutionId && !/^automation_scheduled_[a-f0-9]{64}$/.test(input.scheduledJobId)) return null;
  if (!entry || entry.tenantId !== input.tenantId || typeof entry.inboundExecutionId !== "string" || entry.inboundExecutionId.includes("/") ||
      typeof entry.sourceMessageId !== "string" || entry.sourceMessageId.includes("/") || !Number.isSafeInteger(entry.actionIndex)) {
    throw new AutomationInternalEffectAuthorizationError("Fonte/plano do efeito agendado invalido.");
  }
  const run = await adminDb.collection("jobs").doc(entry.inboundExecutionId).get(), row = run.data();
  if (!row?.plan || row.tenantId !== input.tenantId) throw new AutomationInternalEffectAuthorizationError("Fonte/plano do efeito agendado ausente.");
  return commitInboundAutomationInternalEffect({ tenantId: input.tenantId, chatId: input.chatId, leadId: input.leadId,
    sourceMessageId: entry.sourceMessageId, actionIndex: entry.actionIndex, action: input.action,
    claim: { id: run.id, token: "", plan: row.plan }, scheduled: { id: input.scheduledJobId, token: input.claimToken } });
}
