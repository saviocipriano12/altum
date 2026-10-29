import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import { matchesConversationCommercialFence, type ConversationCommercialFence } from "./conversation-commercial-context";

export class AgentCommercialContextChanged extends Error {
  constructor(reason = "CRM_AGENT_COMMERCIAL_CONTEXT_CHANGED") { super(reason); }
}

export type AgentCommercialTaskInput = {
  tenantId: string; leadId: string; conversationFence?: ConversationCommercialFence;
  title: string; type: string; priority: string; dueAt?: Date | null; reasonCode: string; taskKey: string;
};

/** The observation, task, assignee and audit are committed under the same source.
 * Stable identity also preserves a seller's completion/edit on a later retry. */
export async function ensureConversationAgentTask(input: AgentCommercialTaskInput) {
  const fence = input.conversationFence;
  if (!fence || fence.tenantId !== input.tenantId || fence.leadId !== input.leadId) throw new AgentCommercialContextChanged();
  const generation = (stamp: FirebaseFirestore.Timestamp) => [stamp.seconds, stamp.nanoseconds];
  const identity = [input.tenantId, input.leadId, generation(fence.leadGeneration), fence.chatId, generation(fence.chatGeneration), fence.messageId, input.taskKey];
  const taskRef = adminDb.collection("lead_tasks").doc(`agent_task_${createHash("sha256").update(JSON.stringify(identity)).digest("hex")}`);
  const leadRef = adminDb.collection("leads").doc(input.leadId);
  return adminDb.runTransaction(async tx => {
    if (!await matchesConversationCommercialFence(tx, fence)) throw new AgentCommercialContextChanged();
    const lead = (await tx.get(leadRef)).data()!;
    const saved = await tx.get(taskRef);
    if (saved.exists) {
      if (saved.data()?.tenantId !== input.tenantId || saved.data()?.leadId !== input.leadId || saved.data()?.sourceMessageId !== fence.messageId) throw new Error("CRM_AGENT_TASK_IDENTITY_CONFLICT");
      return null;
    }
    const pending = await tx.get(adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("leadId", "==", input.leadId).where("status", "==", "pending"));
    if (pending.docs.some(row => row.data().taskKey === input.taskKey || row.data().reasonCode === input.reasonCode)) return null;
    tx.create(taskRef, withCommercialTaskIndex({
      tenantId: input.tenantId, leadId: input.leadId, contactId: fence.contactId,
      title: input.title, type: input.type, priority: input.priority, dueAt: input.dueAt || null,
      reasonCode: input.reasonCode, taskKey: input.taskKey, status: "pending", version: 1,
      source: "ai_sales_agent", sourceMessageId: fence.messageId, sourceChatId: fence.chatId,
      sourceLeadGeneration: fence.leadGeneration,
      ownerUserId: lead.assignedTo || lead.ownerId || lead.ownerUserId || null,
      ownerName: lead.ownerName || lead.owner || null,
      createdBy: "ai_sales_agent", createdByName: "AI Sales Agent", completedAt: null, canceledAt: null,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }));
    tx.create(leadRef.collection("events").doc(`task_created_${taskRef.id}`), {
      tenantId: input.tenantId, type: "crm_task_created", title: "IA criou retorno", taskId: taskRef.id,
      detail: `${input.type}: ${input.title}`, reasonCode: input.reasonCode,
      evidenceMessageId: fence.messageId, sourceChatId: fence.chatId,
      actorId: "ai_sales_agent", actorName: "AI Sales Agent", createdAt: FieldValue.serverTimestamp(),
    });
    return taskRef.id;
  });
}
