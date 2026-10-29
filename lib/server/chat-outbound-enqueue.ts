import { FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { ChatOutboundIdempotencyError, createChatOutboundFingerprint, type createChatOutboundIdentity } from "@/lib/server/chat-outbound-idempotency";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { assertChatStateScope } from "@/lib/chat-state-scope";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { prepareAiExecutionAuthority } from "@/lib/server/ai/execution-authority";

type Identity = ReturnType<typeof createChatOutboundIdentity>;
type Row = Record<string, unknown>;
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function code(error: unknown) { return Number(error && typeof error === "object" && "code" in error ? error.code : NaN); }
function millis(value: unknown): number { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }

export function chatOutboundEnqueueLockId(tenantId: string, chatId: string) {
  return `enqueue_${createChatOutboundFingerprint([tenantId, chatId])}`;
}

/**
 * Optimistic atomic enqueue. No read locks are held while several instances
 * compete for a chat's next sequence. A stale snapshot rejects the WHOLE batch.
 */
export async function commitChatOutboundEnqueue(input: {
  tenantId: string; chatId: string; identity: Identity; fingerprint: string;
  actor: { id: string; name: string }; replyToId: string | null;
  preview: string; stateId: string; pauseAi?: boolean;
  internalOnly?: boolean;
  beforeCommit?: (batch: FirebaseFirestore.WriteBatch, chat: Row) => Promise<void>;
  build: (chat: Row) => { message: Row; job: Row };
}) {
  const { tenantId, chatId, identity, fingerprint } = input;
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(identity.jobId);
  const messageRef = adminDb.collection("messages").doc(identity.messageId);
  const chatRef = adminDb.collection("chats").doc(chatId);
  const replyRef = input.replyToId ? adminDb.collection("messages").doc(input.replyToId) : null;
  const stateRef = !input.internalOnly && input.pauseAi !== false
    ? adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)) : null;
  const replay = (data: Row) => {
    if (clean(data.tenantId) !== tenantId || clean(data.chatId) !== chatId || clean(data.requestFingerprint) !== fingerprint) throw new ChatOutboundIdempotencyError();
    return { ...identity, status: clean(data.status) || "ready", replayed: true };
  };
  const deadline = Date.now() + 15_000;
  const lockRef = adminDb.collection("chat_outbound_locks").doc(chatOutboundEnqueueLockId(tenantId, chatId));
  const token = randomUUID();
  let lockVersion: FirebaseFirestore.Timestamp | undefined;
  // A distributed, create-only short lease prevents an N-squared CAS stampede.
  // It is not process-local serialization. CAS remains for legacy/concurrent
  // chat writers; the commit also deletes this exact lease version atomically.
  while (!lockVersion) {
    try {
      const created = await lockRef.create({ tenantId, chatId, kind: "enqueue", token, leaseUntil: new Date(Date.now() + 30_000) });
      lockVersion = created.writeTime;
    } catch (error) {
      const [held, completed] = await adminDb.getAll(lockRef, jobRef);
      if (completed.exists) return replay(completed.data() || {});
      if (held.exists && held.data()?.token === token) { lockVersion = held.updateTime; continue; }
      if (![6, 9, 10].includes(code(error)) || Date.now() >= deadline) throw error;
      if (held.exists && held.updateTime && millis(held.data()?.leaseUntil) <= Date.now()) {
        try {
          const taken = await lockRef.update({ token, leaseUntil: new Date(Date.now() + 30_000) }, { lastUpdateTime: held.updateTime });
          lockVersion = taken.writeTime;
        } catch (takeoverError) { if (![5, 6, 9, 10].includes(code(takeoverError))) throw takeoverError; }
      }
      if (!lockVersion) await new Promise((resolve) => setTimeout(resolve, 25 + Math.random() * 125));
    }
  }
  let releasedByCommit = false;
  try {
  for (let attempt = 0; ; attempt++) {
    const [job, chat, message, reply] = await adminDb.getAll(jobRef, chatRef, messageRef, ...(replyRef ? [replyRef] : []));
    if (job.exists) return replay(job.data() || {});
    const executionVersions = await prepareAiExecutionAuthority(tenantId, chatId);
    const state = stateRef ? await stateRef.get() : null;
    if (state) assertChatStateScope(state.data(), tenantId, chatId);
    if (!chat.exists || clean(chat.data()?.tenantId) !== tenantId) throw new Error("Conversa nao encontrada para esta empresa.");
    if (message.exists) throw new Error("Mensagem de envio sem operacao correspondente; reconciliacao necessaria.");
    if (replyRef && (!reply?.exists || clean(reply.data()?.tenantId) !== tenantId || clean(reply.data()?.chatId) !== chatId)) throw new Error("Mensagem respondida nao pertence a esta conversa.");
    if (!chat.updateTime) throw new Error("Conversa sem versao para enfileirar com seguranca.");
    const chatData = chat.data() || {};
    const currentSequence = input.internalOnly ? 0 : Number(chatData.outboundSequence || 0);
    if (!Number.isSafeInteger(currentSequence) || currentSequence < 0 || currentSequence >= Number.MAX_SAFE_INTEGER) throw new Error("Sequencia de envio invalida; reconciliacao necessaria.");
    const { message: messageData, job: jobData } = input.build(chatData);
    const batch = adminDb.batch();
    if (!input.internalOnly) batch.create(messageRef, {
      ...messageData, tenantId, chatId, sender: "agent", senderId: input.actor.id, senderName: input.actor.name,
      status: "sending", deliveryStatus: "queued", deliveryError: "", deliveryErrorCode: "",
      clientRequestId: identity.clientRequestId, outboundJobId: identity.jobId,
      ...(input.replyToId ? { replyToId: input.replyToId } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(jobRef, {
      ...jobData, tenantId, chatId, messageId: input.internalOnly ? null : identity.messageId, replyToId: input.replyToId,
      actorId: input.actor.id, actorName: input.actor.name, clientRequestId: identity.clientRequestId,
      requestFingerprint: fingerprint, sequence: currentSequence + 1,
      predecessorJobId: input.internalOnly ? null : clean(chatData.outboundTailJobId) || null,
      status: "ready", attempts: 0, dueAt: new Date(), deliveryProtocolVersion: 1,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    if (input.internalOnly) batch.update(chatRef, { tenantId }, { lastUpdateTime: chat.updateTime });
    else batch.update(chatRef, {
      lastMessage: input.preview, lastMessageTime: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      outboundSequence: currentSequence + 1, outboundTailJobId: identity.jobId,
      ...buildOutgoingChatOperationalPatch({ status: "open", assignedTo: clean(chatData.assignedTo || chatData.ownerId) || (input.pauseAi === false ? null : input.actor.id) }),
    }, { lastUpdateTime: chat.updateTime });
    if (replyRef && reply?.updateTime) {
      // Logical no-op with a version precondition: deletion/reassignment of the
      // quoted message must reject this entire enqueue, not pass a stale check.
      batch.update(replyRef, { chatId }, { lastUpdateTime: reply.updateTime });
    }
    if (stateRef && state) {
      const statePatch = {
      tenantId, chatId, aiEnabled: false, pausedUntil: new Date(Date.now() + 30 * 60_000),
      humanOwnerUserId: input.actor.id, updatedAt: FieldValue.serverTimestamp(),
      updatedBy: input.actor.id, updatedByName: input.actor.name,
      };
      if (state.exists) batch.update(stateRef, statePatch, { lastUpdateTime: state.updateTime! });
      else batch.create(stateRef, statePatch);
    }
    await input.beforeCommit?.(batch, chatData);
    for (const version of executionVersions) batch.update(version.ref, { tenantId }, { lastUpdateTime: version.updateTime! });
    batch.delete(lockRef, { lastUpdateTime: lockVersion });
    try {
      await batch.commit();
      releasedByCommit = true;
      return { ...identity, status: "queued" as const, replayed: false };
    } catch (error) {
      // Also resolve a successful commit whose acknowledgement was lost. Never
      // retry the provider or replace an already-persisted message here.
      const committed = await jobRef.get();
      if (committed.exists) return replay(committed.data() || {});
      const currentLease = await lockRef.get();
      if (!currentLease.exists || currentLease.data()?.token !== token || !currentLease.updateTime?.isEqual(lockVersion)) throw new Error("Posse da gravacao de envio expirou; repita com a mesma identificacao.");
      if (![6, 9, 10].includes(code(error)) || attempt >= 31 || Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.min(200, 10 * 2 ** Math.min(attempt, 4)) * (0.5 + Math.random())));
    }
  }
  } finally {
    if (!releasedByCommit) {
      // A stale holder must never delete a lease subsequently acquired by another instance.
      await lockRef.delete({ lastUpdateTime: lockVersion }).catch((error) => {
        if (![5, 9].includes(code(error))) console.error("Falha ao liberar reserva de gravacao; lease recuperavel.");
      });
    }
  }
}
