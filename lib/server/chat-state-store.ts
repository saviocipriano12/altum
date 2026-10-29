import { adminDb } from "@/app/lib/server/firebase-admin";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { assertChatStateScope, ChatStateContextError } from "@/lib/chat-state-scope";
import { FieldValue } from "firebase-admin/firestore";
import { buildManualQueuePatch } from "@/lib/server/chat-operations";
import { prepareAiExecutionAuthority } from "@/lib/server/ai/execution-authority";

type StateWriteOptions = { expectedVersion?: FirebaseFirestore.Timestamp; expectedChatGeneration?: FirebaseFirestore.Timestamp };

export async function prepareChatStateWrite(tx: FirebaseFirestore.Transaction, tenantId: string, chatId: string, options?: StateWriteOptions) {
  await prepareAiExecutionAuthority(tenantId, chatId, tx);
  const ref = adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)), chatRef = adminDb.collection("chats").doc(chatId);
  const [snapshot, chat] = await Promise.all([tx.get(ref), tx.get(chatRef)]);
  assertChatStateScope(snapshot.data(), tenantId, chatId);
  if (!chat.exists || chat.data()?.tenantId !== tenantId || options?.expectedChatGeneration && !chat.createTime?.isEqual(options.expectedChatGeneration)) throw new ChatStateContextError();
  const versionMatches = !options?.expectedVersion || snapshot.updateTime?.isEqual(options.expectedVersion) === true;
  return { ref, snapshot, chatRef, chat, tenantId, chatId, versionMatches };
}

export function applyChatStateWrite(tx: FirebaseFirestore.Transaction, prepared: Awaited<ReturnType<typeof prepareChatStateWrite>>, patch: FirebaseFirestore.DocumentData) {
  if (!prepared.versionMatches) return false;
  assertChatStateScope({ ...patch, tenantId: patch.tenantId ?? prepared.tenantId, chatId: patch.chatId ?? prepared.chatId }, prepared.tenantId, prepared.chatId);
  tx.set(prepared.ref, { ...patch, tenantId: prepared.tenantId, chatId: prepared.chatId }, { merge: true });
  return true;
}

export function writeScopedChatState(tenantId: string, chatId: string, patch: FirebaseFirestore.DocumentData, options?: StateWriteOptions) {
  return adminDb.runTransaction(async tx => applyChatStateWrite(tx, await prepareChatStateWrite(tx, tenantId, chatId, options), patch));
}

/** The human decision, assignment and visible system message commit together. */
export function commitHumanChatControl(input: {
  tenantId: string; chatId: string; expectedChatGeneration: FirebaseFirestore.Timestamp;
  action: "pause" | "takeover" | "resume";
  actor: { id: string; name: string }; owner: { id: string; name: string }; pausedUntil: Date | null;
}) {
  const messageRef = adminDb.collection("messages").doc();
  return adminDb.runTransaction(async tx => {
    const prepared = await prepareChatStateWrite(tx, input.tenantId, input.chatId, { expectedChatGeneration: input.expectedChatGeneration });
    const chat = prepared.chat.data()!;
    if (input.action === "resume" && chat.isGroup === true) throw new ChatStateContextError();
    const resume = input.action === "resume";
    applyChatStateWrite(tx, prepared, {
      aiEnabled: resume, pausedUntil: resume ? null : input.pausedUntil,
      humanOwnerUserId: resume ? null : input.owner.id,
      pauseReason: resume ? null : input.action === "takeover" ? "human_takeover" : "manual_pause",
      updatedBy: input.actor.id, updatedByName: input.actor.name, updatedAt: FieldValue.serverTimestamp(),
    });
    if (!resume) tx.update(prepared.chatRef, {
      assignedTo: input.owner.id, assignedUserName: input.owner.name, ownerId: input.owner.id, ownerName: input.owner.name,
      updatedAt: FieldValue.serverTimestamp(),
      ...buildManualQueuePatch({ status: String(chat.status || "open"), assignedTo: input.owner.id,
        lastClientMessageAt: chat.lastClientMessageAt, lastAgentMessageAt: chat.lastAgentMessageAt, slaDueAt: chat.slaDueAt }),
    });
    tx.create(messageRef, {
      tenantId: input.tenantId, chatId: input.chatId, sender: "system", type: "text",
      text: resume ? `IA retomada por ${input.actor.name}.` : input.action === "takeover"
        ? `Handoff assumido por ${input.owner.name}. IA pausada temporariamente.` : `IA pausada por ${input.owner.name}.`,
      createdAt: FieldValue.serverTimestamp(),
    });
    return chat;
  });
}
