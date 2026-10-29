import {createHash} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {matchesConversationCommercialFence, type ConversationCommercialFence} from "./conversation-commercial-context";
import {AgentCommercialContextChanged} from "./agent-commercial-task";

export type ConversationAgentSignal = {
  tenantId: string; leadId: string; chatId: string; conversationFence?: ConversationCommercialFence;
  event: {type: string; title: string; detail: string};
  note?: string;
  evidenceKind?: "ai_interpretation" | "operational_event";
  notification: {type: string; severity: "info" | "warning" | "high"; title: string; detail: string};
};

/** Distinguish AI interpretations from observed internal operations. Neither
 * becomes a literal customer quote. Commit all records as one occurrence. */
export async function commitConversationAgentSignal(input: ConversationAgentSignal) {
  const fence = input.conversationFence;
  if (!fence || fence.tenantId !== input.tenantId || fence.leadId !== input.leadId || fence.chatId !== input.chatId) throw new AgentCommercialContextChanged();
  const generation = (stamp: FirebaseFirestore.Timestamp) => [stamp.seconds, stamp.nanoseconds];
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const id = `agent_signal_${hash([input.tenantId, input.leadId, generation(fence.leadGeneration), input.chatId, generation(fence.chatGeneration), fence.messageId, generation(fence.messageVersion), input.event.type])}`;
  const fingerprint = hash([input.event, input.note || null, input.notification, input.evidenceKind || "ai_interpretation"]);
  const eventRef = adminDb.collection("leads").doc(input.leadId).collection("events").doc(id);
  const noteRef = input.note ? adminDb.collection("lead_notes").doc(id) : null;
  const notificationRef = adminDb.collection("ai_internal_notifications").doc(id);
  return adminDb.runTransaction(async tx => {
    if (!await matchesConversationCommercialFence(tx, fence)) throw new AgentCommercialContextChanged();
    const event = await tx.get(eventRef), notification = await tx.get(notificationRef), note = noteRef ? await tx.get(noteRef) : null;
    if (event.exists) {
      if (event.data()?.tenantId !== input.tenantId || event.data()?.signalFingerprint !== fingerprint) throw new Error("CRM_AGENT_SIGNAL_RECEIPT_CONFLICT");
      // Human edits, dismissals or deletions after acceptance are never undone.
      return false;
    }
    if (notification.exists || note?.exists) throw new Error("CRM_AGENT_SIGNAL_PARTIAL_CONFLICT");
    const source = {tenantId: input.tenantId, leadId: input.leadId, sourceChatId: input.chatId,
      sourceMessageId: fence.messageId, sourceLeadGeneration: fence.leadGeneration,
      sourceMessageVersion: fence.messageVersion, signalFingerprint: fingerprint, evidenceKind: input.evidenceKind || "ai_interpretation"};
    tx.create(eventRef, {...source, ...input.event, evidenceMessageId: fence.messageId,
      actorId: "ai_sales_agent", actorName: "AI Sales Agent", createdAt: FieldValue.serverTimestamp()});
    if (noteRef) tx.create(noteRef, {...source, text: input.note, authorId: "ai_sales_agent", authorName: "AI Sales Agent",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    tx.create(notificationRef, {...source, ...input.notification, chatId: input.chatId, status: "open", source: "altum_agent_v2",
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    return true;
  });
}
