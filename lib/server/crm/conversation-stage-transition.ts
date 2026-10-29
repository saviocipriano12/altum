import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isContactRecordId } from "@/lib/server/crm/contact-links";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction, TenantPipelineConfigurationError } from "@/lib/server/crm/pipeline";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { isTenantBillingBlocked, TenantAccessError } from "@/lib/server/tenant";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

export const CONVERSATION_STAGE_JOB_TYPE = "crm_conversation_stage_transition";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const instant = (value: Timestamp) => [value.seconds, value.nanoseconds];
const millis = (value: unknown) => value instanceof Timestamp ? value.toMillis() : 0;
function evidenceMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 240 && value === value.trim() && !value.includes("/") && value !== "." && value !== "..";
}
export function conversationStageTransitionId(fence: ConversationCommercialFence) {
  return `crm_conversation_stage_${digest([fence.tenantId, fence.leadId, instant(fence.leadGeneration), fence.chatId, instant(fence.chatGeneration), fence.messageId,
    ...(fence.selectionId ? [fence.selectionId] : [])])}`;
}
export function conversationStageSourceFingerprint(fence: ConversationCommercialFence, previous: string, next: string, pipelineVersion: string) {
  return digest([conversationStageTransitionId(fence), instant(fence.messageVersion), fence.contactId, fence.contactGeneration ? instant(fence.contactGeneration) : null, previous, next, pipelineVersion]);
}
export function conversationStageOwnerFingerprint(lead: FirebaseFirestore.DocumentData) {
  return digest([lead.assignedTo || null, lead.ownerId || null, lead.ownerUserId || null]);
}
function fenceFor(row: FirebaseFirestore.DocumentData): ConversationCommercialFence {
  const fence = row.conversationFence;
  if (!fence || ![fence.tenantId, fence.leadId, fence.chatId].every(isContactRecordId) || !evidenceMessageId(fence.messageId) ||
      ![fence.leadGeneration, fence.chatGeneration, fence.messageVersion].every(value => value instanceof Timestamp) ||
      !(fence.contactId === null ? fence.contactGeneration === null : isContactRecordId(fence.contactId) && fence.contactGeneration instanceof Timestamp)) throw new Error("CRM_STAGE_CONVERSATION_PROTOCOL_INVALID");
  return fence;
}
async function authority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_CONVERSATION_HOOK_PROGRESS_INVALID");
  const fence = fenceFor(row);
  if (row.protocolVersion !== 1 || row.outcome !== "applied" || fence.tenantId !== row.tenantId || fence.leadId !== row.leadId ||
      conversationStageTransitionId(fence) !== id || ![row.sourceEventId, row.previousStage, row.nextStage].every(isContactRecordId) ||
      conversationStageSourceFingerprint(fence, row.previousStage, row.nextStage, row.pipelineVersion) !== row.sourceFingerprint) throw new Error("CRM_STAGE_CONVERSATION_PROTOCOL_INVALID");
  if (!await matchesConversationCommercialFence(tx, fence)) throw new Error("CRM_STAGE_CONVERSATION_CONTEXT_CHANGED");
  const [leadSnap, event, pipeline] = await Promise.all([
    tx.get(adminDb.collection("leads").doc(row.leadId)),
    tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(row.sourceEventId)),
    loadTenantPipelineInTransaction(tx, row.tenantId),
    tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId)),
    tx.get(adminDb.collection("tenants").doc(row.tenantId)),
  ]);
  const lead = leadSnap.data(), source = event.data();
  if (!lead || lead.tenantId !== row.tenantId || lead.aiCommercialStageTransitionId !== id ||
      (lead.pipelineStage || lead.stage) !== row.nextStage || isCrmFieldManuallyOwned(lead, "pipelineStage") ||
      conversationStageOwnerFingerprint(lead) !== row.ownerFingerprint || pipeline.version !== row.pipelineVersion ||
      !pipeline.stages.some(stage => stage.id === row.nextStage && !stage.isTerminal) ||
      !source || source.tenantId !== row.tenantId || source.stageTransitionId !== id || source.evidenceMessageId !== fence.messageId ||
      source.previousStage !== row.previousStage || source.nextStage !== row.nextStage) throw new Error("CRM_STAGE_CONVERSATION_AUTHORITY_CHANGED");
  try {
    await assertTenantModule(row.tenantId, "crm");
    if (await isTenantBillingBlocked(row.tenantId)) throw new Error("CRM_STAGE_CONVERSATION_TENANT_BLOCKED");
  } catch (error) {
    if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_CONVERSATION_MODULE_REVOKED");
    throw error;
  }
}
export async function assertConversationStageAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  if (![input.id, input.tenantId, input.leadId].every(isContactRecordId)) throw new Error("CRM_STAGE_CONVERSATION_SOURCE_INVALID");
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== CONVERSATION_STAGE_JOB_TYPE || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token)) throw new Error("CRM_STAGE_CONVERSATION_SOURCE_REVOKED");
  if (!input.delivery && millis(row.leaseUntil) <= Date.now()) throw new Error("CRM_STAGE_CONVERSATION_LEASE_EXPIRED");
  await authority(tx, row, input.id); return source;
}
export async function processConversationStageTransition(id: string, tenantId?: string) {
  if (!isContactRecordId(id)) throw new Error("CRM_STAGE_CONVERSATION_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== CONVERSATION_STAGE_JOB_TYPE || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) {
      tx.update(ref, { status: "reconciliation_required", lastError: "Efeitos da analise interrompidos; revisar recibos antes de retomar.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    if (current.status !== "ready" && !expired) return null;
    try {
      if (current.stageHookProgress !== undefined ? !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("CRM_STAGE_CONVERSATION_HOOK_PROGRESS_INVALID");
      await authority(tx, current, id);
    }
    catch (error) {
      if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", lastError: "Contexto, acesso ou funil alterado antes dos efeitos.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
    return current;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertConversationStageAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false, needsReview = false;
  try {
    const { runPipelineStageSideEffects } = await import("@/lib/server/crm/stage-effects");
    await runPipelineStageSideEffects({ tenantId: row.tenantId, leadId: row.leadId, previousStage: row.previousStage, nextStage: row.nextStage,
      actorId: row.actorId, actorName: row.actorName, source: "crm_conversation_stage_advance", strict: true,
      metadata: { evidenceMessageId: row.conversationFence.messageId, stageTransitionId: id }, automationSource: { kind: "conversation", id, token },
      beforeEffect: async () => { await adminDb.runTransaction(tx => assertConversationStageAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }), { readOnly: true }); },
      runHook,
    });
    completed = true;
  } catch (error) {
    // Expiry stops this worker immediately. It does not itself revoke the
    // business source: finalization still checks this token, live authority
    // and receipt-backed resumability before allowing another claim.
    const ownLeaseExpired = error instanceof Error && error.message === "CRM_STAGE_CONVERSATION_LEASE_EXPIRED";
    needsReview = !ownLeaseExpired && (stageHookErrorNeedsReview(error) || error instanceof TenantPipelineConfigurationError);
  }
  const confirmed = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    let valid = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    if (valid) {
      try { await authority(tx, current, id); }
      catch (error) { if (!(error instanceof TenantPipelineConfigurationError) && !(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error; valid = false; }
    }
    let resumable = !valid && !needsReview && canResumeStageHooks(current);
    if (resumable) { try { await authority(tx, current, id); } catch (error) { if (!(error instanceof TenantPipelineConfigurationError) && !stageHookErrorNeedsReview(error)) throw error; resumable = false; } }
    tx.update(ref, { status: valid ? "done" : resumable ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
      completionMeaning: valid ? "conversation_stage_effects_registered_not_provider_delivery" : resumable ? "conversation_stage_receipts_preserved_hook_pending" : "conversation_stage_partial_effects_need_reconciliation" });
    return valid;
  });
  return { processed: true, completed: confirmed };
}
export async function processPendingConversationStageTransitions(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => {
    let q = adminDb.collection("jobs").where("type", "==", CONVERSATION_STAGE_JOB_TYPE).where("status", "==", status);
    if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId); return q;
  };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const source of [...ready.docs, ...expired.docs]) {
    try { const result = await processConversationStageTransition(source.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; }
    catch { failed++; }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
