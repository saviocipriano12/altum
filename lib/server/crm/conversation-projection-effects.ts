import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import type { PipelineStageDefinition } from "@/lib/pipeline";
import type { ConversationCommercialFence } from "@/lib/server/crm/conversation-commercial-context";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { CONVERSATION_STAGE_JOB_TYPE, conversationStageTransitionId, conversationStageSourceFingerprint, conversationStageOwnerFingerprint } from "@/lib/server/crm/conversation-stage-transition";

export type ConversationProjectionTask = {
  title: string; type: string; priority: string; dueAt: Date | null; reasonCode: string; taskKey: string;
};
export type ConversationProjectionPlan = {
  fence: ConversationCommercialFence; stages: PipelineStageDefinition[]; tasks: ConversationProjectionTask[];
  actorId: string; actorName: string; stageChange?: { previous: string; next: string };
};
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const generation = (value: FirebaseFirestore.Timestamp) => [value.seconds, value.nanoseconds];

/** Called only inside the guarded lead projection transaction. This function
 * reads every dependency before returning synchronous writes to that same tx.
 * External effects remain a separate, causally authorized delivery concern. */
export async function prepareConversationProjectionEffects(tx: FirebaseFirestore.Transaction, lead: FirebaseFirestore.DocumentData, plan: ConversationProjectionPlan): Promise<(() => void) | null> {
  const { tenantId, leadId, chatId, messageId } = plan.fence;
  const pipeline = await loadTenantPipelineInTransaction(tx, tenantId);
  if (digest(pipeline.stages) !== digest(plan.stages)) return null;
  if (plan.stageChange && !pipeline.stages.some(stage => stage.id === plan.stageChange!.next && !stage.isTerminal)) return null;
  const source = [tenantId, leadId, generation(plan.fence.leadGeneration), chatId, generation(plan.fence.chatGeneration), messageId,
    ...(plan.fence.selectionId ? [plan.fence.selectionId] : [])];
  const leadRef = adminDb.collection("leads").doc(leadId);
  const stageEventRef = plan.stageChange ? leadRef.collection("events").doc(`crm_stage_observation_${digest(source)}`) : null;
  const transitionRef = plan.stageChange ? adminDb.collection("jobs").doc(conversationStageTransitionId(plan.fence)) : null;
  const fingerprint = plan.stageChange ? conversationStageSourceFingerprint(plan.fence, plan.stageChange.previous, plan.stageChange.next, pipeline.version) : null;
  const taskPlans = plan.tasks.map(task => ({ task, ref: adminDb.collection("lead_tasks").doc(`crm_observation_task_${digest([...source, task.taskKey])}`) }));
  const pending = taskPlans.length ? await tx.get(adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", leadId).where("status", "==", "pending")) : null;
  const taskSnapshots = taskPlans.length ? await tx.getAll(...taskPlans.map(item => item.ref)) : [];
  const stageEvent = stageEventRef ? await tx.get(stageEventRef) : null;
  const transition = transitionRef ? await tx.get(transitionRef) : null;
  if (transition?.exists && (transition.data()?.type !== CONVERSATION_STAGE_JOB_TYPE || transition.data()?.tenantId !== tenantId || transition.data()?.leadId !== leadId || transition.data()?.sourceFingerprint !== fingerprint)) throw new Error("CRM_PROJECTION_OCCURRENCE_CONFLICT");
  if (stageEvent?.exists && (stageEvent.data()?.tenantId !== tenantId || stageEvent.data()?.evidenceMessageId !== messageId || stageEvent.data()?.previousStage !== plan.stageChange?.previous || stageEvent.data()?.nextStage !== plan.stageChange?.next)) throw new Error("CRM_PROJECTION_EVENT_BINDING_CONFLICT");
  const existing = pending?.docs.map(doc => doc.data()) || [];
  const freshTasks = taskPlans.filter(({ task, ref }, index) => {
    const saved = taskSnapshots[index];
    if (saved.exists) {
      if (saved.data()?.tenantId !== tenantId || saved.data()?.leadId !== leadId || saved.data()?.sourceMessageId !== messageId || saved.data()?.sourceChatId !== chatId) throw new Error("CRM_PROJECTION_TASK_BINDING_CONFLICT");
      // A completed, rescheduled or edited task remains the seller's decision.
      return false;
    }
    if (existing.some(row => row.taskKey === task.taskKey || row.reasonCode === task.reasonCode)) return false;
    existing.push({ taskKey: task.taskKey, reasonCode: task.reasonCode, id: ref.id });
    return true;
  });
  return () => {
    if (stageEventRef && !stageEvent?.exists) tx.create(stageEventRef, {
      tenantId, type: "crm_stage_auto_advanced", title: "CRM avancou etapa automaticamente",
      detail: `${plan.stageChange!.previous} -> ${plan.stageChange!.next}`, previousStage: plan.stageChange!.previous, nextStage: plan.stageChange!.next,
      reasonCode: "qualification_stage_upgrade", evidenceMessageId: messageId, sourceChatId: chatId,
      stageTransitionId: transitionRef!.id,
      actorId: plan.actorId, actorName: plan.actorName, createdAt: FieldValue.serverTimestamp(),
    });
    if (transitionRef && !transition?.exists) {
      tx.create(transitionRef, { type: CONVERSATION_STAGE_JOB_TYPE, protocolVersion: 1, tenantId, leadId,
        sourceEventId: stageEventRef!.id, previousStage: plan.stageChange!.previous, nextStage: plan.stageChange!.next,
        pipelineVersion: pipeline.version, conversationFence: plan.fence, sourceFingerprint: fingerprint,
        ownerFingerprint: conversationStageOwnerFingerprint(lead), actorId: plan.actorId, actorName: plan.actorName,
        outcome: "applied", status: "ready", attempts: 0, completionMeaning: "conversation_stage_committed_effects_pending",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(leadRef, { aiCommercialStageTransitionId: transitionRef.id });
    }
    for (const { task, ref } of freshTasks) {
      tx.create(ref, withCommercialTaskIndex({
        tenantId, leadId, contactId: plan.fence.contactId, ...task, status: "pending", version: 1,
        source: "crm_automation", automationGenerated: true, sourceMessageId: messageId, sourceChatId: chatId,
        ownerUserId: lead.assignedTo || lead.ownerId || lead.ownerUserId || null, ownerName: lead.ownerName || lead.owner || null,
        createdBy: plan.actorId, createdByName: plan.actorName, completedAt: null, canceledAt: null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }));
      tx.create(leadRef.collection("events").doc(`task_created_${ref.id}`), {
        tenantId, type: "crm_task_created", title: "CRM criou retorno", detail: `${task.type}: ${task.title}`,
        reasonCode: task.reasonCode, taskId: ref.id, evidenceMessageId: messageId, sourceChatId: chatId,
        actorId: plan.actorId, actorName: plan.actorName, createdAt: FieldValue.serverTimestamp(),
      });
    }
  };
}
