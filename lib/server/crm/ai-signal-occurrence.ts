import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { inboundAutomationSourceKey } from "@/lib/server/automation-inbound-execution";
import { readUnambiguousConversationLead, matchesConversationCommercialFence, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";
import { supportsAtomicCrmEffect, supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";
import { crmMutationBaseline, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { isTenantBillingBlocked, TenantAccessError } from "@/lib/server/tenant";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { newStageHookProgress, readStageHookProgress } from "@/lib/server/crm/stage-hook-progress";
import type { TenantAutomationDoc } from "@/lib/server/automations";

const jobType = "crm_ai_signal_occurrence";
const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/");
const millis = (value: unknown): number => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function authority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData) {
  if (row.protocolVersion !== 1 || ![row.tenantId, row.chatId, row.leadId, row.sourceMessageId].every(valid) ||
      !row.conversationFence || !await matchesConversationCommercialFence(tx, row.conversationFence) ||
      row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_AI_SIGNAL_CONTEXT_CHANGED");
  const source = await tx.get(adminDb.collection("messages").doc(row.sourceMessageId));
  const chat = await tx.get(adminDb.collection("chats").doc(row.chatId));
  if (source.data()?.sender !== "client" || source.data()?.isGroup === true ||
      row.sourceEventKey !== inboundAutomationSourceKey(row.tenantId, row.sourceMessageId, source.data()!, chat.data()!)) throw new Error("CRM_STAGE_AI_SIGNAL_SOURCE_CHANGED");
  const state = await tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(row.tenantId, row.chatId)));
  if (state.exists && (state.data()?.tenantId !== row.tenantId || state.data()?.chatId !== row.chatId || state.data()?.humanOwnerUserId || state.data()?.aiEnabled === false)) throw new Error("CRM_STAGE_AI_SIGNAL_HUMAN_CONTROL");
  // Policy reads join the effect transaction, so revocation invalidates its commit.
  await tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId));
  await tx.get(adminDb.collection("tenants").doc(row.tenantId));
  try { await assertTenantModule(row.tenantId, "crm"); if (await isTenantBillingBlocked(row.tenantId)) throw new Error("CRM_STAGE_AI_SIGNAL_TENANT_BLOCKED"); }
  catch (error) {
    if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_AI_SIGNAL_POLICY_REVOKED");
    throw error;
  }
}

/** Freeze the signal and complete eligible plans before any effect. A retry of
 * the same inbound event cannot add another decision or newly enabled rule. */
export async function admitAiSignalOccurrence(input: {
  tenantId: string; leadId: string; chatId: string; sourceMessageId: string; aiNextAction: string;
  normalize: (id: string, data: FirebaseFirestore.DocumentData, tenantId: string) => TenantAutomationDoc;
  matches: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData, channel: string) => boolean;
}) {
  if (![input.tenantId, input.leadId, input.chatId, input.sourceMessageId].every(valid) || !input.aiNextAction || input.aiNextAction.length > 80) throw new Error("CRM_STAGE_AI_SIGNAL_INPUT_INVALID");
  return adminDb.runTransaction(async tx => {
    const target = await readUnambiguousConversationLead(tx, input);
    const message = await tx.get(adminDb.collection("messages").doc(input.sourceMessageId)), chat = await tx.get(adminDb.collection("chats").doc(input.chatId));
    if (!target.ok || target.leadId !== input.leadId || message.data()?.sender !== "client" || message.data()?.tenantId !== input.tenantId ||
        message.data()?.chatId !== input.chatId || message.data()?.leadId && message.data()?.leadId !== input.leadId || !message.updateTime) throw new Error("CRM_STAGE_AI_SIGNAL_SOURCE_INVALID");
    const sourceEventKey = inboundAutomationSourceKey(input.tenantId, input.sourceMessageId, message.data()!, chat.data()!);
    const id = `crm_ai_signal_${digest([input.tenantId, sourceEventKey])}`, ref = adminDb.collection("jobs").doc(id), existing = await tx.get(ref);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.type !== jobType || row.tenantId !== input.tenantId || row.leadId !== input.leadId || row.chatId !== input.chatId || row.aiNextAction !== input.aiNextAction) throw new Error("CRM_STAGE_AI_SIGNAL_DECISION_CHANGED");
      await authority(tx, row); return id;
    }
    const fence: ConversationCommercialFence = { tenantId: input.tenantId, chatId: input.chatId, leadId: input.leadId, leadGeneration: target.generation,
      chatGeneration: target.chatGeneration, contactId: target.contactId, contactGeneration: target.contactGeneration, messageId: input.sourceMessageId, messageVersion: message.updateTime,
      ...(target.selectionId ? { selectionId: target.selectionId } : {}) };
    const row = { type: jobType, protocolVersion: 1, tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId,
      sourceMessageId: input.sourceMessageId, sourceEventKey, aiNextAction: input.aiNextAction, channel: String(chat.data()?.channel || ""),
      actorId: "ai_sales_agent", actorName: "AI Sales Agent", conversationFence: fence, status: "ready", attempts: 0 };
    await authority(tx, row);
    const lead = (await tx.get(adminDb.collection("leads").doc(input.leadId))).data()!;
    const plans: TenantAutomationDoc[] = [];
    await visitTenantAutomationCatalogue(tx, input.tenantId, (configId, data) => {
      const automation = input.normalize(configId, data, input.tenantId);
      if (!input.matches(automation, lead, row.channel)) return;
      // Message actions are forbidden for an AI signal, including delayed ones.
      // Keep their definitions for audit; executeActions skips them before scheduling.
      plans.push(JSON.parse(JSON.stringify(automation)));
      if (plans.length > 120) throw new Error("CRM_STAGE_AI_SIGNAL_PLAN_TOO_LARGE");
    }, () => {});
    const crm = plans.some(plan => plan.actions.some(supportsAtomicCrmEffect));
    const pipeline = crm ? await loadTenantPipelineInTransaction(tx, input.tenantId) : null;
    tx.create(ref, { ...row, stageHookProgress: newStageHookProgress(row), stageAutomationProtocolVersion: 1, stageInternalEffectProtocolVersion: 1,
      stageAutomationPlans: plans, ...(plans.every(plan => plan.actions.every(supportsReceiptBackedAutomationAction)) ? { stageRunRecoveryProtocol: 2 } : {}),
      ...(crm ? { stageCrmProtocolVersion: 1, stageCrmBaseline: crmMutationBaseline(lead),
        stageCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.crmFieldOwnership?.[field] || null])), stageCrmPipeline: pipeline } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return id;
  });
}

export async function assertAiSignalAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== jobType || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_AI_SIGNAL_SOURCE_REVOKED");
  await authority(tx, row); return source;
}

export async function processAiSignalOccurrence(id: string, tenantId?: string) {
  const { processAutomationSignalOccurrence } = await import("@/lib/server/crm/automation-signal-execution");
  return processAutomationSignalOccurrence(id, tenantId, { type: jobType, kind: "aiSignal", trigger: "ai_next_action",
    completionMeaning: "ai_signal_internal_actions_not_learning_or_delivery", authorize: authority });
}

export async function processPendingAiSignalOccurrences(input?: { tenantId?: string; limit?: number }) {
  const query = (status: string) => { let scoped = adminDb.collection("jobs").where("type", "==", jobType).where("status", "==", status); if (input?.tenantId) scoped = scoped.where("tenantId", "==", input.tenantId); return scoped; };
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const doc of [...ready.docs, ...expired.docs]) { try { const result = await processAiSignalOccurrence(doc.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; } }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
