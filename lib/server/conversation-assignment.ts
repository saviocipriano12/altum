import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { RouteAuthError } from "@/app/lib/server/route-auth";
import { getChatStateDocId } from "@/lib/server/ai/agent";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";

/** Ownership and AI control must change together, including return to the queue. */
export async function persistConversationAssignment(input: {
  tenantId: string; chatId: string; expectedOwner: string; patch: Record<string, unknown>; actorId: string; actorName: string;
}) {
  const chatRef = adminDb.collection("chats").doc(input.chatId);
  const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId));
  await adminDb.runTransaction(async (tx) => {
    const chat = await tx.get(chatRef);
    if (!chat.exists || chat.data()?.tenantId !== input.tenantId) throw new RouteAuthError(404, "chat_not_found", "Conversa não encontrada.");
    const data = chat.data()!;
    if (String(data.assignedTo || data.ownerId || "") !== input.expectedOwner) throw new RouteAuthError(409, "assignment_changed", "O responsável mudou. Atualize a conversa antes de continuar.");
    const state = await tx.get(stateRef);
    if (state.exists && (state.data()?.tenantId !== input.tenantId || state.data()?.chatId !== input.chatId)) throw new RouteAuthError(409, "assignment_state_mismatch", "Não foi possível atualizar o atendimento.");
    const leadRef = data.leadId ? adminDb.collection("leads").doc(String(data.leadId)) : null;
    const lead = leadRef ? await tx.get(leadRef) : null;
    const owner = String(input.patch.assignedTo || "") || null;
    tx.update(chatRef, { ...input.patch, ...buildManualQueuePatch({ ...data, status: String(input.patch.status || data.status || "open"), assignedTo: owner }) });
    tx.set(stateRef, {
      tenantId: input.tenantId, chatId: input.chatId, aiEnabled: false,
      humanOwnerUserId: owner, pausedUntil: null,
      pauseReason: owner ? "human_transfer" : "returned_to_queue",
      updatedBy: input.actorId, updatedByName: input.actorName, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (leadRef && lead?.exists && lead.data()?.tenantId === input.tenantId) tx.update(leadRef, {
      ownerId: owner, owner: owner ? input.patch.ownerName || null : null, updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
