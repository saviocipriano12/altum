import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { HandoffAckAuthorization } from "./handoff-delivery";

/** A source turn and message slot refer to one durable delivery, not one LLM attempt. */
export type AiConversationTextInput = {
  tenantId: string; chatId: string; sourceMessageId: string; slot: "primary" | "secondary" | "checkout" | "asset_caption" | "asset_failure" | "handoff_ack";
  text: string; agentName: string; freshUntil?: Date;
  handoffAckAuthorization?: HandoffAckAuthorization;
};
export async function queueAiConversationText(input: AiConversationTextInput) {
  if (input.handoffAckAuthorization && input.slot !== "handoff_ack") throw new Error("Autorizacao restrita a confirmacao do encaminhamento.");
  if (!input.sourceMessageId.trim()) throw new Error("Resposta da IA sem mensagem de origem.");
  const key = createHash("sha256").update(JSON.stringify(["ai-text-v1", input.sourceMessageId, input.slot])).digest("hex");
  // Dynamic import avoids a static agent -> outbox -> agent initialization cycle.
  const outbound = await import("@/lib/server/chat-outbound");
  return outbound.queueTenantChatText({ tenantId: input.tenantId, chatId: input.chatId,
    text: input.text, origin: "ai", aiSourceMessageId: input.sourceMessageId,
    aiDeliveryExpiresAt: input.freshUntil, handoffAckAuthorization: input.handoffAckAuthorization,
    actor: { id: "altum_ai", name: input.agentName }, clientRequestId: `ai-text-${key}` });
}
export async function deliverAiConversationText(input: AiConversationTextInput) {
  const accepted = await queueAiConversationText(input);
  const outbound = await import("@/lib/server/chat-outbound");
  await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const job = await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get();
  if (job.data()?.status !== "completed") {
    // The durable outbox owns retry/reconciliation. Never fall back to direct send.
    throw new Error("Resposta da IA registrada na fila, mas a entrega ainda nao foi confirmada.");
  }
  const message = await adminDb.collection("messages").doc(accepted.messageId).get();
  return { messageId: accepted.messageId, jobId: accepted.jobId,
    externalMessageId: typeof message.data()?.metaMessageId === "string" ? message.data()!.metaMessageId as string : null };
}
