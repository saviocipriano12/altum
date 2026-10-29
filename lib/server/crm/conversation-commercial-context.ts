import { adminDb } from "@/app/lib/server/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import { prepareAiExecutionAuthority } from "@/lib/server/ai/execution-authority";
import { isExactCrmRecordId } from "@/lib/crm-observation-identity";
import { observationSnapshotVersion as version } from "./observation-receipt-identity";
import { ContactLinkError, contactLinkReader, contactLinkedLeadIds, isContactRecordId } from "@/lib/server/crm/contact-links";

type CommercialTarget =
  | { ok: true; leadId: string; generation: FirebaseFirestore.Timestamp; chatGeneration: FirebaseFirestore.Timestamp; contactId: string | null; contactGeneration: FirebaseFirestore.Timestamp | null; selectionId?: string; selectedAfter?: FirebaseFirestore.Timestamp }
  | { ok: false; reason: "no_commercial_lead" | "lead_missing" | "opportunity_context_required" | "contact_identity_review" };

/** A phone match never chooses a purchase. Explicit human selections require
 * their committed event, current identity generations and a new-message boundary.
 * The legacy single-record path keeps its existing source identities. */
export async function readUnambiguousConversationLead(tx: FirebaseFirestore.Transaction, input: { tenantId: string; chatId: string }): Promise<CommercialTarget> {
  if (!isContactRecordId(input.tenantId) || !isContactRecordId(input.chatId)) return { ok: false, reason: "no_commercial_lead" };
  const chatSnapshot = await tx.get(adminDb.collection("chats").doc(input.chatId)), chat = chatSnapshot.data();
  if (!chat || chat.tenantId !== input.tenantId || chat.isGroup === true || chat.conversationType === "group" || !isContactRecordId(chat.leadId)) return { ok: false, reason: "no_commercial_lead" };
  const snapshot = await tx.get(adminDb.collection("leads").doc(chat.leadId)), lead = snapshot.data();
  if (!lead || lead.tenantId !== input.tenantId) return { ok: false, reason: "lead_missing" };
  const selection = chat.commercialContext;
  if (selection !== undefined && (!selection || selection.version !== 1 || !isExactCrmRecordId(selection.id) ||
      !["opportunity", "relationship"].includes(selection.mode) || selection.chatGeneration !== version(chatSnapshot.createTime) ||
      !(selection.selectedAt instanceof Timestamp) || selection.selectedAt.toMillis() < chatSnapshot.createTime!.toMillis()))
    return { ok: false, reason: "opportunity_context_required" };
  if (selection) {
    const event = await tx.get(chatSnapshot.ref.collection("commercial_context_events").doc(selection.id)), proof = event.data();
    if (!proof || proof.tenantId !== input.tenantId || proof.chatId !== input.chatId || proof.type !== "commercial_context_selected" ||
        proof.selection?.id !== selection.id || proof.selection?.mode !== selection.mode || proof.selection?.leadId !== selection.leadId ||
        proof.selection?.leadGeneration !== selection.leadGeneration || proof.selection?.contactId !== selection.contactId ||
        proof.selection?.contactGeneration !== selection.contactGeneration || proof.selection?.chatGeneration !== selection.chatGeneration ||
        proof.selection?.actorId !== selection.actorId || !(proof.selection?.selectedAt instanceof Timestamp) ||
        !proof.selection.selectedAt.isEqual(selection.selectedAt)) return { ok: false, reason: "opportunity_context_required" };
  }
  if (selection?.mode === "relationship") return { ok: false, reason: "no_commercial_lead" };
  if (selection && (selection.leadId !== snapshot.id || selection.leadGeneration !== version(snapshot.createTime)))
    return { ok: false, reason: "opportunity_context_required" };
  if (!selection && lead.recordKind === "opportunity") return { ok: false, reason: "opportunity_context_required" };
  let contactId: string | null = null, contactGeneration: FirebaseFirestore.Timestamp | null = null;
  if (lead.contactId) {
    try {
      const person = await contactLinkReader(input.tenantId, tx)(lead.contactId), linked = contactLinkedLeadIds(person.data()!);
      contactId = person.id; contactGeneration = person.createTime!;
      if (!linked.includes(snapshot.id)) return { ok: false, reason: "contact_identity_review" };
      // Retain a stale association for review rather than assuming that removing
      // a purchase makes the remaining conversation commercially unambiguous.
      if (!selection && linked.some(id => id !== snapshot.id)) return { ok: false, reason: "opportunity_context_required" };
    } catch (error) {
      if (error instanceof ContactLinkError) return { ok: false, reason: "contact_identity_review" };
      throw error;
    }
  }
  if (selection && (selection.contactId !== contactId || selection.contactGeneration !== version(contactGeneration)))
    return { ok: false, reason: "contact_identity_review" };
  return { ok: true, leadId: snapshot.id, generation: snapshot.createTime!, chatGeneration: chatSnapshot.createTime!, contactId, contactGeneration,
    ...(selection ? { selectionId: selection.id, selectedAfter: selection.selectedAt } : {}) };
}

/** Stored occurrence time, rather than a client-supplied message date, bounds a purchase. */
export function messageInCommercialTarget(message: FirebaseFirestore.DocumentSnapshot, target: Extract<CommercialTarget, { ok: true }>) {
  if (!message.exists || message.data()?.leadId && message.data()?.leadId !== target.leadId) return false;
  if (!target.selectionId) return true;
  const time = message.createTime, after = target.selectedAfter;
  const raw = message.data()?.createdAt ?? message.data()?.receivedAt;
  let occurred: Timestamp | null = null;
  try {
    occurred = raw instanceof Timestamp ? raw : raw instanceof Date && Number.isFinite(raw.getTime()) ? Timestamp.fromDate(raw)
      : typeof raw === "number" && Number.isFinite(raw) ? Timestamp.fromMillis(raw) : null;
  } catch { /* Malformed/out-of-range imported dates cannot authorize an update. */ }
  const later = (value: FirebaseFirestore.Timestamp) => !!after && (value.seconds > after.seconds || value.seconds === after.seconds && value.nanoseconds > after.nanoseconds);
  // A delayed history import may be stored today but still describe yesterday's
  // purchase. Neither a forged future date nor a late storage write is enough.
  return !!time && !!occurred && later(time) && later(occurred);
}

export async function getUnambiguousConversationLead(input: { tenantId: string; chatId: string }) {
  return adminDb.runTransaction(tx => readUnambiguousConversationLead(tx, input), { readOnly: true });
}

export type ConversationCommercialFence = {
  tenantId: string; chatId: string; leadId: string; leadGeneration: FirebaseFirestore.Timestamp;
  chatGeneration: FirebaseFirestore.Timestamp; contactId: string | null; contactGeneration: FirebaseFirestore.Timestamp | null;
  messageId: string; messageVersion: FirebaseFirestore.Timestamp;
  selectionId?: string;
};

export async function readMatchingCommercialFenceTarget(tx: FirebaseFirestore.Transaction, fence: ConversationCommercialFence) {
  await prepareAiExecutionAuthority(fence.tenantId, fence.chatId, tx);
  const target = await readUnambiguousConversationLead(tx, fence);
  if (!target.ok || target.leadId !== fence.leadId || !target.generation.isEqual(fence.leadGeneration) ||
      !target.chatGeneration.isEqual(fence.chatGeneration) || target.contactId !== fence.contactId ||
      (target.contactGeneration === null ? fence.contactGeneration !== null : !fence.contactGeneration || !target.contactGeneration.isEqual(fence.contactGeneration)) ||
      (target.selectionId || "") !== (fence.selectionId || "")) return null;
  const message = await tx.get(adminDb.collection("messages").doc(fence.messageId));
  const row = message.data();
  return row?.tenantId === fence.tenantId && row?.chatId === fence.chatId && messageInCommercialTarget(message, target) && message.updateTime?.isEqual(fence.messageVersion) === true ? target : null;
}

export async function matchesConversationCommercialFence(tx: FirebaseFirestore.Transaction, fence: ConversationCommercialFence) {
  return !!await readMatchingCommercialFenceTarget(tx, fence);
}
