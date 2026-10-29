import { AsyncLocalStorage } from "node:async_hooks";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { aiCommercialSelectionId } from "@/lib/ai-commercial-selection";
import { observationSnapshotVersion } from "@/lib/server/crm/observation-receipt-identity";
import { CONVERSATION_TURN_COLLECTION, getConversationTurnDocId, getLegacyConversationTurnDocId } from "./turn-coordinator";

export const AI_EXECUTION_LEASE_MS = 90_000;
export type AiExecutionAuthority = {
  id: string; tenantId: string; chatId: string; messageId: string; attempts: number;
  claimToken: string; originNotAfter: string; chatGeneration: FirebaseFirestore.Timestamp;
  commercialSelectionId?: string | null;
};
const authority = new AsyncLocalStorage<AiExecutionAuthority | undefined>();
export class AiExecutionAuthorityError extends Error {
  readonly code = "AI_EXECUTION_AUTHORITY_REVOKED";
  constructor() { super("Execucao da IA perdeu a autorizacao para agir nesta conversa."); }
}
export function withAiExecutionAuthority<T>(context: AiExecutionAuthority, action: () => T): T {
  return authority.run(context, action);
}
/** Durable workers authorize their own occurrence/lease, independently from
 * whichever request happened to wake them. Never inherit that request's claim. */
export function withoutAiExecutionAuthority<T>(action: () => T): T {
  return authority.run(undefined, action);
}

/** Optional only for callers outside the incoming-message queue. The queued
 * agent carries one authority across awaits; model/tool data cannot replace it. */
export async function prepareAiExecutionAuthority(tenantId: string, chatId: string, tx?: FirebaseFirestore.Transaction) {
  const context = authority.getStore();
  if (!context) return [];
  if (tenantId !== context.tenantId || chatId !== context.chatId) throw new AiExecutionAuthorityError();
  const refs = [adminDb.collection("jobs").doc(context.id),
    adminDb.collection(CONVERSATION_TURN_COLLECTION).doc(getConversationTurnDocId(tenantId, chatId)),
    adminDb.collection("chats").doc(chatId),
    adminDb.collection("ai_conversation_turns").doc(getLegacyConversationTurnDocId(tenantId, chatId))];
  const [root, turn, chat, legacy] = await Promise.all(refs.map(ref => tx ? tx.get(ref) : ref.get()));
  const job = root.data(), coordinator = turn.data(), old = legacy.data();
  const lockedAt = job?.lockedAt?.toMillis?.() || job?.lockedAt?.getTime?.() || 0;
  if (!root.exists || observationSnapshotVersion(root.createTime) !== context.originNotAfter || job?.type !== "ai_incoming_message" ||
      job.tenantId !== tenantId || job.chatId !== chatId || job.messageId !== context.messageId || job.status !== "processing" ||
      job.executionPhase !== "executing" || job.claimToken !== context.claimToken || job.attempts !== context.attempts ||
      lockedAt <= Date.now() - AI_EXECUTION_LEASE_MS || !chat.exists || chat.data()?.tenantId !== tenantId || !chat.createTime?.isEqual(context.chatGeneration) ||
      aiCommercialSelectionId(chat.data()) !== (context.commercialSelectionId ?? null) ||
      coordinator?.tenantId !== tenantId || coordinator.chatId !== chatId || coordinator.latestMessageId !== context.messageId ||
      coordinator.lockJobId !== context.id || coordinator.lockClaimToken !== context.claimToken ||
      old?.tenantId === tenantId && old.chatId === chatId && old.latestMessageId !== context.messageId) throw new AiExecutionAuthorityError();
  // The enqueue already puts a generation/version precondition on its chat.
  // Return the remaining reads for the SAME atomic batch, including v1 revocation.
  return [root, turn, ...(old?.tenantId === tenantId && old.chatId === chatId ? [legacy] : [])];
}
