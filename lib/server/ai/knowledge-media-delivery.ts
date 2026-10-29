import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isMetaConversationChannelType } from "@/app/lib/server/meta-channel";
import { queueAiConversationText } from "./text-delivery";
import { assertKnowledgeMediaSource, normalizeKnowledgeMedia, AiKnowledgeMediaPreparationError, AiKnowledgeMediaPendingError, type KnowledgeMediaRequest } from "./knowledge-media-outbox";
export async function deliverAiKnowledgeMedia(input: KnowledgeMediaRequest & {
  tenantId: string; chatId: string; sourceMessageId: string; agentName: string;
}) {
  const request = normalizeKnowledgeMedia(input);
  if (!input.sourceMessageId.trim()) throw new Error("Material sem mensagem de origem.");
  const chat = await adminDb.collection("chats").doc(input.chatId).get();
  if (!chat.exists || chat.data()?.tenantId !== input.tenantId) throw new Error("Conversa fora do tenant.");
  await assertKnowledgeMediaSource(input.tenantId, request);
  const outbound = await import("@/lib/server/chat-outbound");
  const caption = isMetaConversationChannelType(String(chat.data()?.channel || ""))
    ? await queueAiConversationText({ ...input, slot: "asset_caption", text: request.caption }) : null;
  const key = createHash("sha256").update(JSON.stringify(["ai-knowledge-v1", input.sourceMessageId, "asset"])).digest("hex");
  const accepted = await outbound.queueTenantChatKnowledgeMedia({ ...input, ...request, aiSourceMessageId: input.sourceMessageId,
    actor: { id: "altum_ai", name: input.agentName }, clientRequestId: `ai-asset-${key}` });
  if (caption) {
    await outbound.processChatOutboundJobs({ jobId: caption.jobId, limit: 1 });
    if ((await adminDb.collection("chat_outbound_jobs").doc(caption.jobId).get()).data()?.status !== "completed") throw new AiKnowledgeMediaPendingError();
  }
  await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data();
  if (job?.status !== "completed") {
    if (job?.status === "dead_letter" && job.mediaPreparationFailed === true && !job.providerAttemptStartedAt) throw new AiKnowledgeMediaPreparationError(String(job.error));
    throw new AiKnowledgeMediaPendingError();
  }
  const message = (await adminDb.collection("messages").doc(accepted.messageId).get()).data();
  if (!message || message.tenantId !== input.tenantId || message.chatId !== input.chatId || !message.mediaUrl) throw new AiKnowledgeMediaPendingError();
  return { messageId: accepted.messageId, jobId: accepted.jobId, externalMessageId: String(message.metaMessageId || "") || null };
}
