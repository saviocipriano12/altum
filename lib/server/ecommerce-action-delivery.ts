import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { normalizeOutboundTemplate } from "./chat-outbound-template";
import { createChatOutboundIdentity, createChatOutboundFingerprint, ChatOutboundIdempotencyError } from "./chat-outbound-idempotency";
import { queueTenantChatTemplate, processChatOutboundJobs } from "./chat-outbound";
import { prepareAutomaticShopifyAction, validateEcommerceDeliveryAuthority, EcommerceActionAuthorizationError, type EcommerceDeliveryAuthority } from "./commerce/shopify-action-authority";
import { readAuthorizedShopifyOccurrence } from "./commerce/shopify-occurrence";
import { commerceSnapshotDigest } from "./commerce/event-identity";

export class EcommerceDeliveryPendingError extends Error {
  constructor(readonly jobId: string, readonly chatId: string) {
    super("Envio ecommerce registrado, mas a entrega ainda nao foi confirmada. Nao envie novamente por outro caminho.");
    this.name = "EcommerceDeliveryPendingError";
  }
}

/** One accepted payload and chat per commercial action, shared by manual/automatic callers. */
export async function deliverEcommerceActionTemplate(input: {
  tenantId: string; actionId: string; templateName: string; languageCode?: string; bodyParams?: string[];
  actor: { id: string; name: string };
  automatic?: boolean;
}) {
  const template = normalizeOutboundTemplate(input);
  if (input.automatic) await prepareAutomaticShopifyAction(input.tenantId, input.actionId);
  const actionRef = adminDb.collection("ecommerce_commercial_actions").doc(input.actionId);
  const key = createHash("sha256").update(JSON.stringify(["ecommerce-action-template-v1", input.tenantId, input.actionId])).digest("hex");
  const requestId = `ecommerce-${key}`;
  const pinned = await adminDb.runTransaction(async tx => {
    const action = await tx.get(actionRef), data = action.data();
    if (!action.exists || data?.tenantId !== input.tenantId) throw new Error("Acao ecommerce fora do tenant.");
    if (data.lastSendError === "legacy_delivery_outcome_requires_review") throw new Error("Entrega antiga desconhecida exige reconciliacao antes de qualquer novo envio.");
    if (data.status === "processing" && data.deliveryProtocolVersion !== 1) throw new Error("Acao antiga em processamento exige conferencia antes de novo envio.");
    const phone = normalizePhone(String(data.customerPhone || ""));
    if (!/^\d{10,15}$/.test(phone) || /@g\.us/i.test(String(data.customerPhone || ""))) throw new Error("Acao sem telefone valido para WhatsApp.");
    const fingerprint = createChatOutboundFingerprint(["ecommerce-action-template-v1", input.tenantId, input.actionId, phone, String(data.leadId || ""), template]);
    const binding = data.whatsappDelivery as { chatId?: string; fingerprint?: string; jobId?: string; messageId?: string; ecommerceAuthority?: EcommerceDeliveryAuthority } | undefined;
    if (binding && (binding.fingerprint !== fingerprint || !binding.chatId)) throw new ChatOutboundIdempotencyError();
    if (!binding && ["done", "sent"].includes(String(data.status)) && data.whatsappSentAt) {
      throw new Error("Esta acao ja possui envio anterior sem recibo da fila. Confira a entrega antes de enviar novamente.");
    }
    let chatRef = binding?.chatId ? adminDb.collection("chats").doc(binding.chatId) : null;
    if (!chatRef) {
      const existing = await tx.get(adminDb.collection("chats").where("tenantId", "==", input.tenantId).where("contactPhone", "==", phone).limit(50));
      if (existing.size === 50) throw new Error("Identidade do contato exige revisao; busca de conversas incompleta.");
      const whatsapp = existing.docs.filter(row => (!row.data().channel || row.data().channel === "whatsapp") && row.data().isGroup !== true);
      if (whatsapp.length > 1) throw new Error("Mais de uma conversa WhatsApp para este contato. Revise a identidade antes do envio ecommerce.");
      chatRef = whatsapp[0]?.ref || adminDb.collection("chats").doc(`ecommerce-${key}`);
    }
    const chat = await tx.get(chatRef);
    if (chat.exists && (chat.data()?.tenantId !== input.tenantId || (chat.data()?.channel && chat.data()?.channel !== "whatsapp") || normalizePhone(String(chat.data()?.contactPhone || "")) !== phone || chat.data()?.isGroup === true)) {
      throw new Error("Conversa ecommerce fora do tenant ou destinatario aceito.");
    }
    if (binding && !chat.exists) throw new Error("Conversa do envio aceito removida. Nao sera substituida automaticamente.");
    if (data.leadId) {
      const lead = await tx.get(adminDb.collection("leads").doc(String(data.leadId)));
      if (!lead.exists || lead.data()?.tenantId !== input.tenantId) throw new Error("Lead da acao ecommerce fora do tenant.");
    }
    let ecommerceAuthority = binding?.ecommerceAuthority;
    if (data.sourceProtocolVersion === 1) {
      if (binding && !ecommerceAuthority) throw new EcommerceActionAuthorizationError("GUARD_MISSING");
      const source = await readAuthorizedShopifyOccurrence(tx, String(data.sourceEventId), input.tenantId);
      ecommerceAuthority ||= { protocolVersion: 1, actionId: input.actionId, sourceEventId: data.sourceEventId,
        actionFingerprint: data.sourceActionFingerprint, sourceClaimToken: source.occurrence.claimToken,
        automatic: input.automatic === true, configurationDigest: input.automatic ? source.occurrence.actionPlan?.configurationDigest : null,
        templateDigest: commerceSnapshotDigest(template) };
      await validateEcommerceDeliveryAuthority(tx, input.tenantId, data, ecommerceAuthority, chatRef.id, template);
    }
    if (!chat.exists) tx.create(chatRef, { tenantId: input.tenantId, channel: "whatsapp", contactPhone: phone, contactPhoneNormalized: phone,
      contactName: String(data.customerName || phone), leadId: data.leadId || null, status: "open", ownerName: input.actor.name,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessageTime: FieldValue.serverTimestamp(), lastMessage: "" });
    else if (!chat.data()?.channel) tx.set(chatRef, { channel: "whatsapp", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: chatRef.id, clientRequestId: requestId });
    if (binding && (binding.jobId !== identity.jobId || binding.messageId !== identity.messageId)) throw new Error("Vinculo de entrega ecommerce alterado apos aceite.");
    if (!binding) tx.set(actionRef, { whatsappDelivery: { chatId: chatRef.id, fingerprint, jobId: identity.jobId, messageId: identity.messageId, ...(ecommerceAuthority ? { ecommerceAuthority } : {}) },
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { chatId: chatRef.id, leadId: String(data.leadId || ""), ecommerceAuthority, ...identity };
  });
  const accepted = await queueTenantChatTemplate({ tenantId: input.tenantId, chatId: pinned.chatId, ...template, headerMedia: template.headerMedia || undefined, actor: input.actor, clientRequestId: requestId, ecommerceAuthority: pinned.ecommerceAuthority });
  await processChatOutboundJobs({ jobId: accepted.jobId, limit: 1 });
  const [job, message] = await adminDb.getAll(adminDb.collection("chat_outbound_jobs").doc(accepted.jobId), adminDb.collection("messages").doc(accepted.messageId));
  if (job.data()?.tenantId !== input.tenantId || job.data()?.chatId !== pinned.chatId || message.data()?.tenantId !== input.tenantId || message.data()?.chatId !== pinned.chatId) throw new Error("Recibo ecommerce fora do tenant.");
  if (job.data()?.status !== "completed") {
    if (job.data()?.status === "dead_letter") {
      if (String(job.data()?.error || "").startsWith("ECOMMERCE_AUTHORITY_")) throw new EcommerceActionAuthorizationError("DELIVERY_BLOCKED");
      throw new Error(String(job.data()?.error || "Envio ecommerce bloqueado."));
    }
    throw new EcommerceDeliveryPendingError(accepted.jobId, pinned.chatId);
  }
  const metaMessageId = String(message.data()?.metaMessageId || "");
  if (!metaMessageId) throw new EcommerceDeliveryPendingError(accepted.jobId, pinned.chatId);
  return { chatId: pinned.chatId, leadId: pinned.leadId, jobId: accepted.jobId, messageId: accepted.messageId, metaMessageId,
    actor: { id: String(job.data()?.actorId || ""), name: String(job.data()?.actorName || "") } };
}
