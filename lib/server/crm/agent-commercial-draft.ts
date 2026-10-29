import {createHash} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {matchesConversationCommercialFence, type ConversationCommercialFence} from "./conversation-commercial-context";
import {AgentCommercialContextChanged} from "./agent-commercial-task";
import {prepareConversationCommercialAction} from "@/lib/server/commercial-agent-actions";
import {prepareNeutralDraftOutcome} from "@/lib/server/ai/learning-outcomes";

export type ConversationDraftInput = {
  tenantId: string; leadId: string; conversationFence?: ConversationCommercialFence;
  kind: "proposal" | "appointment"; title: string; summary: string | null;
  slot?: {startAt: string; endAt: string};
};

/** A stable draft, its review, audit and neutral outcome share one source/commit. */
export async function createConversationCommercialDraft(input: ConversationDraftInput) {
  const fence = input.conversationFence;
  if (!fence || fence.tenantId !== input.tenantId || fence.leadId !== input.leadId) throw new AgentCommercialContextChanged();
  if (input.slot && (!Number.isFinite(Date.parse(input.slot.startAt)) || !Number.isFinite(Date.parse(input.slot.endAt)) || Date.parse(input.slot.endAt) <= Date.parse(input.slot.startAt))) throw new Error("CRM_DRAFT_SLOT_INVALID");
  const generation = (stamp: FirebaseFirestore.Timestamp) => [stamp.seconds, stamp.nanoseconds];
  const id = `agent_draft_${createHash("sha256").update(JSON.stringify([input.tenantId, input.leadId, generation(fence.leadGeneration), fence.chatId, generation(fence.chatGeneration), fence.messageId, input.kind])).digest("hex")}`;
  const collection = input.kind === "proposal" ? "orcamentos" : "appointments";
  const ref = adminDb.collection(collection).doc(id), leadRef = adminDb.collection("leads").doc(input.leadId);
  const eventRef = leadRef.collection("events").doc(`draft_created_${id}`);
  return adminDb.runTransaction(async tx => {
    if (!await matchesConversationCommercialFence(tx, fence)) throw new AgentCommercialContextChanged();
    const saved = await tx.get(ref), lead = (await tx.get(leadRef)).data()!, receipt = await tx.get(eventRef);
    if (saved.exists) {
      if (saved.data()?.tenantId !== input.tenantId || saved.data()?.leadId !== input.leadId || saved.data()?.sourceMessageId !== fence.messageId || !saved.data()?.sourceLeadGeneration?.isEqual(fence.leadGeneration)) throw new Error("CRM_AGENT_DRAFT_IDENTITY_CONFLICT");
      return id;
    }
    if (receipt.exists) {
      if (receipt.data()?.tenantId !== input.tenantId || receipt.data()?.referenceId !== id || receipt.data()?.referenceCollection !== collection) throw new Error("CRM_AGENT_DRAFT_RECEIPT_CONFLICT");
      // An accepted draft was subsequently removed; reprocessing is not restore.
      throw new AgentCommercialContextChanged();
    }
    const ownerId = lead.assignedTo || lead.ownerId || lead.ownerUserId || null, ownerName = lead.ownerName || lead.owner || null;
    const leadName = lead.nome || lead.name || null, leadCompany = lead.empresa || lead.company || null;
    const action = await prepareConversationCommercialAction(tx, {
      tenantId: input.tenantId, leadId: input.leadId, chatId: fence.chatId, conversationFence: fence,
      type: input.kind === "proposal" ? "review_proposal" : "review_appointment",
      title: input.kind === "proposal" ? "Revisar proposta preparada pela IA" : "Confirmar horário sugerido pela IA",
      detail: input.summary, referenceCollection: collection, referenceId: id,
      dedupeKey: `${input.kind}:${id}`, payload: {requiresCustomerConfirmation: input.kind === "appointment"},
    }, {collection, id});
    const writeOutcome = await prepareNeutralDraftOutcome(tx, {tenantId: input.tenantId, leadId: input.leadId,
      referenceId: id, type: input.kind, sourceMessageId: fence.messageId, sourceLeadGeneration: fence.leadGeneration});
    const common = {tenantId: input.tenantId, leadId: input.leadId, leadName, leadCompany,
      source: "altum_agent_v2", sourceChatId: fence.chatId, sourceMessageId: fence.messageId, sourceLeadGeneration: fence.leadGeneration,
      createdBy: "ai_sales_agent", createdByName: "AI Sales Agent", version: 1, reviewActionId: action.result.id,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()};
    tx.create(ref, input.kind === "proposal" ? {...common, clientId: input.tenantId, clientName: "Cliente ALTUM",
      titulo: input.title, tipo: "Proposta consultiva", status: "Rascunho", valorTotal: null, validade: null,
      resumo: input.summary, ownerId, owner: ownerName} : {...common, title: leadName ? `Reunião com ${leadName}` : input.title, type: "reuniao", status: "draft",
      startAt: input.slot?.startAt || null, endAt: input.slot?.endAt || null, slotSource: input.slot ? "provided_for_review" : null, requiresCustomerConfirmation: true,
      location: null, meetingUrl: null, notes: input.summary, ownerUserId: ownerId, ownerName});
    action.write(); writeOutcome();
    tx.create(eventRef, {
      tenantId: input.tenantId, type: input.kind === "proposal" ? "ai_proposal_draft_prepared" : "ai_appointment_draft_prepared",
      title: input.kind === "proposal" ? "Rascunho de proposta preparado" : "Sugestão de agenda preparada",
      referenceId: id, referenceCollection: collection, evidenceMessageId: fence.messageId, sourceChatId: fence.chatId,
      actorId: "ai_sales_agent", actorName: "AI Sales Agent", createdAt: FieldValue.serverTimestamp(),
    });
    return id;
  });
}
