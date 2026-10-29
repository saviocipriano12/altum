import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";

/** One closed-window follow-up per source turn, independent of worker/LLM retries. */
export async function deliverAiConversationTemplate(input: {
  tenantId: string; chatId: string; sourceMessageId: string; agentName: string;
  templateName: string; languageCode?: string; bodyParams?: string[];
}) {
  if (!input.sourceMessageId.trim()) throw new Error("Template da IA sem mensagem de origem.");
  const key = createHash("sha256").update(JSON.stringify(["ai-template-v1", input.sourceMessageId, "followup"])).digest("hex");
  const outbound = await import("@/lib/server/chat-outbound");
  const accepted = await outbound.queueTenantChatTemplate({ ...input, origin: "ai", aiSourceMessageId: input.sourceMessageId,
    actor: { id: "altum_ai", name: input.agentName }, clientRequestId: `ai-template-${key}` });
  await outbound.processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const job = await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get();
  if (job.data()?.status !== "completed") throw new Error("Template da IA registrado na fila, mas a entrega ainda nao foi confirmada.");
  const message = await adminDb.collection("messages").doc(accepted.messageId).get();
  return { messageId: accepted.messageId, jobId: accepted.jobId,
    externalMessageId: typeof message.data()?.metaMessageId === "string" ? message.data()!.metaMessageId as string : null,
    persistedText: typeof message.data()?.text === "string" ? message.data()!.text as string : "" };
}
