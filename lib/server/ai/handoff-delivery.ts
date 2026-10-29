import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getChatStateDocId } from "./agent";
import { prepareConversationTurn, writeConversationTurn } from "./conversation-turn-store";
import { deliverAiConversationText } from "./text-delivery";
import { normalizePhone } from "@/app/lib/server/phone";

export type HandoffAckAuthorization = { token: string; sourceMessageId: string; pausedUntilMs: number; ownerId: string | null };
export class HandoffPauseConflictError extends Error { constructor() { super("Pausa de encaminhamento substituida por controle humano ou nova mensagem."); this.name = "HandoffPauseConflictError"; } }
export function normalizeHandoffAckAuthorization(value: unknown): HandoffAckAuthorization | null {
  if (value == null) return null;
  const data = value as HandoffAckAuthorization;
  if (!data || typeof data !== "object" || typeof data.token !== "string" || !/^[a-f0-9-]{36}$/.test(data.token) ||
    typeof data.sourceMessageId !== "string" || !data.sourceMessageId || data.sourceMessageId.length > 240 ||
    !Number.isSafeInteger(data.pausedUntilMs) || data.pausedUntilMs <= 0 || (data.ownerId !== null && (typeof data.ownerId !== "string" || data.ownerId.length > 180))) throw new Error("Falha de integridade: autorizacao de encaminhamento invalida.");
  return { token: data.token, sourceMessageId: data.sourceMessageId, pausedUntilMs: data.pausedUntilMs, ownerId: data.ownerId };
}
export const handoffAcknowledgementRequestId = (sourceId: string) => `ai-text-${createHash("sha256").update(JSON.stringify(["ai-text-v1", sourceId, "handoff_ack"])).digest("hex")}`;
const millis = (value: unknown): number => value instanceof Date ? value.getTime() : value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
export function handoffPauseMatches(state: Record<string, unknown>, proof: HandoffAckAuthorization) {
  const stored = state.handoffAckAuthorization as HandoffAckAuthorization | undefined;
  return state.aiEnabled === false && state.pauseReason === "handoff_requested" && state.updatedBy === "altum_ai_handoff" &&
    state.handoffPauseToken === proof.token && state.handoffSourceMessageId === proof.sourceMessageId &&
    millis(state.pausedUntil) === proof.pausedUntilMs && (state.humanOwnerUserId || null) === proof.ownerId &&
    stored?.token === proof.token && stored.sourceMessageId === proof.sourceMessageId && stored.pausedUntilMs === proof.pausedUntilMs && stored.ownerId === proof.ownerId;
}
/** Issue permission for ONE acknowledgement without replacing any human pause.
 * Replays reuse the original token/deadline; they cannot renew a revoked grant. */
export async function pauseForAiHandoff(input: { tenantId: string; chatId: string; sourceMessageId: string }) {
  if (!input.tenantId || !input.chatId || !input.sourceMessageId) throw new Error("Encaminhamento sem empresa/conversa/origem.");
  const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId));
  return adminDb.runTransaction(async transaction => {
    const [chat, state, preparedTurn] = await Promise.all([transaction.get(adminDb.collection("chats").doc(input.chatId)), transaction.get(stateRef),
      prepareConversationTurn(transaction, input.tenantId, input.chatId)]);
    const turn = preparedTurn.snapshot;
    if (!chat.exists || chat.data()?.tenantId !== input.tenantId || (state.exists && (state.data()?.tenantId !== input.tenantId || state.data()?.chatId !== input.chatId))) throw new Error("Encaminhamento fora do tenant.");
    if (turn.exists && (turn.data()?.tenantId !== input.tenantId || turn.data()?.chatId !== input.chatId)) throw new Error("Coordenacao fora do tenant.");
    if (preparedTurn.migrateLegacy) writeConversationTurn(transaction, preparedTurn, {}, false);
    if (turn.data()?.latestMessageId && turn.data()?.latestMessageId !== input.sourceMessageId) return null;
    const current = state.data() || {};
    if (current.handoffSourceMessageId === input.sourceMessageId && current.handoffPauseToken) {
      const proof = normalizeHandoffAckAuthorization(current.handoffAckAuthorization);
      return proof && proof.pausedUntilMs > Date.now() && handoffPauseMatches(current, proof) ? proof : null;
    }
    if (current.aiEnabled === false || current.humanOwnerUserId || millis(current.pausedUntil) > Date.now()) return null;
    const proof: HandoffAckAuthorization = { token: randomUUID(), sourceMessageId: input.sourceMessageId, pausedUntilMs: Date.now() + 30 * 60000,
      ownerId: String(chat.data()?.assignedTo || chat.data()?.ownerId || "") || null };
    transaction.set(stateRef, { tenantId: input.tenantId, chatId: input.chatId, aiEnabled: false, pausedUntil: new Date(proof.pausedUntilMs),
      humanOwnerUserId: proof.ownerId, pauseReason: "handoff_requested", updatedBy: "altum_ai_handoff", updatedByName: "Assistente Altum",
      handoffPauseToken: proof.token, handoffSourceMessageId: input.sourceMessageId, handoffAckAuthorization: proof, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return proof;
  });
}
export async function deliverAiHandoffAcknowledgement(input: { tenantId: string; chatId: string; sourceMessageId: string; agentName: string; text: string; authorization?: HandoffAckAuthorization | null; authorizePause?: boolean }) {
  let sent: { messageId: string; jobId: string; externalMessageId: string | null };
  if (input.authorizePause) {
    const outbound = await import("@/lib/server/chat-outbound");
    const accepted = await outbound.queueTenantHandoffAcknowledgement(input);
    await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
    if ((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.status !== "completed") throw new Error("Resposta da IA registrada na fila, mas a entrega ainda nao foi confirmada.");
    const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data();
    sent = { messageId: accepted.messageId, jobId: accepted.jobId, externalMessageId: String(message?.metaMessageId || "") || null };
  } else sent = await deliverAiConversationText({ ...input, slot: "handoff_ack", handoffAckAuthorization: input.authorization || undefined });
  const recorded = (await adminDb.collection("messages").doc(sent.messageId).get()).data();
  if (!recorded || recorded.tenantId !== input.tenantId || recorded.chatId !== input.chatId || recorded.sender !== "agent") throw new Error("Confirmacao do encaminhamento pendente de reconciliacao.");
  const notice = adminDb.collection("messages").doc(`${sent.messageId}_handoff`);
  try { await notice.create({ tenantId: input.tenantId, chatId: input.chatId, sender: "system", type: "text", senderName: "Assistente Altum",
    text: input.authorization || input.authorizePause ? "Encaminhamento humano registrado; acompanhe a tarefa e os alertas da equipe." : "Tentativa de encaminhamento sem confirmacao; confira as pendencias.", handoffAckMessageId: sent.messageId,
    createdAt: FieldValue.serverTimestamp() }); }
  catch (error) {
    const existing = await notice.get();
    if (!existing.exists || existing.data()?.tenantId !== input.tenantId || existing.data()?.chatId !== input.chatId || existing.data()?.handoffAckMessageId !== sent.messageId) throw error;
  }
  return sent;
}
export class HandoffAlertPendingError extends Error { constructor() { super("Alerta de encaminhamento pendente de confirmacao."); this.name = "HandoffAlertPendingError"; } }
export async function deliverAiHandoffAlert(input: {
  tenantId: string; chatId: string; sourceMessageId: string; channelId: string; phoneNumberId?: string; recipientPhone: string; text: string;
}) {
  const recipientPhone = normalizePhone(input.recipientPhone);
  const key = createHash("sha256").update(JSON.stringify(["handoff-alert-v1", input.sourceMessageId, recipientPhone])).digest("hex");
  const outbound = await import("@/lib/server/chat-outbound");
  const accepted = await outbound.queueTenantHandoffAlert({ ...input, recipientPhone, clientRequestId: `handoff-alert-${key}` });
  await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data();
  if (job?.status !== "completed") {
    if (job?.status === "dead_letter") throw new Error(String(job.error || "Falha ao preparar alerta de encaminhamento."));
    throw new HandoffAlertPendingError();
  }
  return { jobId: accepted.jobId, externalMessageId: String(job.externalMessageId || "") || null };
}
