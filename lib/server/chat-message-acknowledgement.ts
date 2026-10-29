import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { externalWhatsAppMessageId } from "@/lib/server/messaging/whatsapp-external-identity";
import { tenantTrashSnapshotId } from "@/lib/server/tenant-trash-identity";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { metaOutgoingMessageId } from "@/lib/server/meta-outgoing-message";
import { assertWhatsAppDeliveryStateScope, readWhatsAppDeliveryHistory, shouldApplyWhatsAppDelivery, whatsAppEventFromState, whatsappDeliveryPatch, whatsappDeliveryStateRef } from "@/lib/server/whatsapp-delivery-status";

/** A provider acceptance is weaker than a delivery receipt already persisted. */
export async function persistChatMessageAcknowledgement(
  ref: DocumentReference,
  data: Record<string, unknown>,
  options: { merge: boolean; reconcile?: boolean; forceHistory?: boolean; chatPatch?: Record<string, unknown>; pausePatch?: Record<string, unknown> },
) {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() || {};
    const chatRef = data.chatId ? adminDb.collection("chats").doc(String(data.chatId)) : null;
    const chat = chatRef ? await transaction.get(chatRef) : null;
    if (!chat?.exists) {
      if (options.reconcile) throw new Error("Conversa removida durante a reconciliacao; nenhuma correcao aplicada.");
      const manifests = await transaction.get(adminDb.collection("tenant_trash").where("tenantId", "==", data.tenantId)
        .where("entity", "==", "chat").where("entityId", "==", data.chatId).where("status", "==", "active").limit(2));
      if (manifests.size !== 1 || manifests.docs[0].data().manifestComplete !== true) throw new Error("Confirmacao de envio apos exclusao sem manifesto inequivoco; conferir recibos.");
      const documents = manifests.docs[0].ref.collection("documents");
      const messageRef = documents.doc(tenantTrashSnapshotId({ collection: "messages", id: ref.id }));
      const archivedMessage = await transaction.get(messageRef), message = archivedMessage.data();
      const jobId = message?.data?.outboundJobId;
      if (message?.collection !== "messages" || message.id !== ref.id || message.data?.tenantId !== data.tenantId || message.data?.chatId !== data.chatId ||
          typeof jobId !== "string" || !jobId || jobId.includes("/")) throw new Error("Confirmacao de envio sem mensagem arquivada correspondente.");
      const jobRef = documents.doc(tenantTrashSnapshotId({ collection: "chat_outbound_jobs", id: jobId }));
      const archivedJob = await transaction.get(jobRef), job = archivedJob.data();
      const externalId = String(data.metaMessageId || "");
      if (job?.collection !== "chat_outbound_jobs" || job.id !== jobId || job.data?.tenantId !== data.tenantId || job.data?.chatId !== data.chatId ||
          job.data?.messageId !== ref.id || !job.data?.providerAttemptStartedAt || !job.data?.leaseToken ||
          job.data.providerAttemptId !== job.data.leaseToken || !(Number(job.data.providerAttemptCount) >= 1) || !externalId ||
          message.data.metaMessageId && message.data.metaMessageId !== externalId) throw new Error("Confirmacao de envio sem tentativa arquivada comprovada.");
      const receipt = { ...data };
      if (message.data.metaMessageId === externalId && ["delivered", "read", "failed"].includes(String(message.data.deliveryStatus))) {
        for (const field of ["status", "deliveryStatus", "deliveryAt", "deliveryUpdatedAt", "deliveryError", "deliveryErrorCode", "deliveryRecipientId"]) {
          if (field in message.data) receipt[field] = message.data[field]; else delete receipt[field];
        }
      }
      transaction.update(messageRef, { data: { ...message.data, ...receipt, lateAcknowledgedAt: FieldValue.serverTimestamp() } });
      transaction.update(jobRef, { data: { ...job.data, status: "completed", externalMessageId: externalId,
        completedAt: job.data.completedAt || FieldValue.serverTimestamp(), lateAcknowledgedAt: FieldValue.serverTimestamp() } });
      return "trash" as const;
    }
    if (chat.data()?.tenantId !== data.tenantId) throw new Error("Confirmacao de envio fora da empresa original.");
    if (options.reconcile && (!snapshot.exists || existing.sender !== "agent" || existing.metaMessageId !== data.metaMessageId || existing.channelPhoneNumberId !== data.channelPhoneNumberId ||
      ![existing.status, existing.deliveryStatus].some((status) => ["sent", "delivered", "read", "failed"].includes(String(status))))) {
      throw new Error("Mensagem alterada durante a reconciliacao; nenhuma correcao aplicada.");
    }
    if (snapshot.exists && (existing.tenantId !== data.tenantId || existing.chatId !== data.chatId)) {
      throw new Error("Confirmacao de envio fora da empresa ou conversa original.");
    }
    const patch = { ...data };
    // The native echo can reach us before the send API returns its receipt.
    // Reading its deterministic document also serializes the opposite race.
    const socialEchoRef = ["instagram", "messenger"].includes(String(data.channel)) && data.channelId && data.metaMessageId
      ? adminDb.collection("messages").doc(metaOutgoingMessageId(String(data.tenantId), String(data.channelId), String(data.metaMessageId))) : null;
    const socialEcho = socialEchoRef && socialEchoRef.id !== ref.id ? await transaction.get(socialEchoRef) : null;
    if (socialEcho?.exists && (socialEcho.data()?.tenantId !== data.tenantId || socialEcho.data()?.chatId !== data.chatId ||
      socialEcho.data()?.channelId !== data.channelId || socialEcho.data()?.metaMessageId !== data.metaMessageId ||
      !["meta_native_echo", "meta_history_recovery"].includes(String(socialEcho.data()?.source)))) throw new Error("Eco Meta fora da conversa original.");
    const phoneNumberId = String(data.channelPhoneNumberId || "");
    const externalId = String(data.metaMessageId || "");
    const stateRef = phoneNumberId && externalId ? whatsappDeliveryStateRef(String(data.tenantId || ""), phoneNumberId, externalId) : null;
    const state = stateRef ? await transaction.get(stateRef) : null;
    assertWhatsAppDeliveryStateScope(state?.data(), data.tenantId, phoneNumberId, externalId);
    const previousId = String(state?.data()?.localMessageId || "");
    const externalRef = previousId && previousId !== ref.id ? adminDb.collection("messages").doc(previousId) : null;
    const external = externalRef ? await transaction.get(externalRef) : null;
    if (externalRef && (previousId !== externalWhatsAppMessageId(String(data.tenantId), String(external?.data()?.channelId || ""), externalId) ||
      (data.channelId && data.channelId !== external?.data()?.channelId) ||
      external?.data()?.source !== "whatsapp_external" || external.data()?.tenantId !== data.tenantId || external.data()?.chatId !== data.chatId || external.data()?.metaMessageId !== externalId)) {
      throw new Error("Recibo ja vinculado a outra mensagem.");
    }
    const pauseRef = options.pausePatch ? adminDb.collection("chat_state").doc(getChatStateDocId(String(data.tenantId), String(data.chatId))) : null;
    const pause = pauseRef ? await transaction.get(pauseRef) : null;
    if (pause?.exists && (pause.data()?.tenantId !== data.tenantId || pause.data()?.chatId !== data.chatId)) throw new Error("Pausa de envio fora da empresa ou conversa original.");
    const history = stateRef && (options.forceHistory || state?.data()?.legacyHistoryReconciled !== true)
      ? await readWhatsAppDeliveryHistory(transaction, { tenantId: String(data.tenantId || ""), phoneNumberId, messageId: externalId, current: state?.data() })
      : null;
    const status = String(existing.deliveryStatus || existing.status || "").toLowerCase();
    if (data.metaMessageId && existing.metaMessageId === data.metaMessageId && ["delivered", "read", "failed"].includes(status)) {
      patch.status = status;
      patch.deliveryStatus = status;
      for (const field of ["deliveryAt", "deliveryUpdatedAt", "deliveryError", "deliveryErrorCode", "deliveryRecipientId"]) {
        if (field in existing) patch[field] = existing[field];
        else delete patch[field];
      }
    }
    const earlyReceipt = history?.receipt || whatsAppEventFromState(state?.data(), externalId);
    if (earlyReceipt && shouldApplyWhatsAppDelivery(patch, earlyReceipt)) Object.assign(patch, whatsappDeliveryPatch(earlyReceipt, phoneNumberId));
    // Bind the operational reply timestamp to this exact provider acceptance.
    // updatedAt can later change with delivery receipts, so it is not evidence
    // of which message last changed lastAgentMessageAt.
    const recordsAgentReply = data.sender === "agent" && options.chatPatch?.lastAgentMessageAt !== undefined;
    if (recordsAgentReply) patch.agentAcknowledgedAt = FieldValue.serverTimestamp();
    transaction.set(ref, patch, { merge: options.merge });
    if (socialEcho?.exists && socialEchoRef) transaction.delete(socialEchoRef);
    if (options.chatPatch) transaction.update(chat.ref, { ...options.chatPatch, ...(recordsAgentReply ? { lastAgentMessageId: ref.id } : {}) });
    if (pauseRef && options.pausePatch) transaction.set(pauseRef, options.pausePatch, { merge: true });
    if (externalRef) transaction.delete(externalRef);
    if (stateRef) transaction.set(stateRef, { recordType: "state", tenantId: data.tenantId,
      legacyHistoryReconciled: true, ...(history ? { historyReceiptCount: history.scanned } : {}),
      phoneNumberId, metaMessageId: externalId, localMessageId: ref.id, chatId: data.chatId,
      status: patch.status, deliveryStatus: patch.deliveryStatus, deliveryAt: patch.deliveryAt || state?.data()?.deliveryAt || null,
      deliveryError: patch.deliveryError || "", deliveryErrorCode: patch.deliveryErrorCode || "",
      deliveryRecipientId: patch.deliveryRecipientId || "", createdAt: state?.data()?.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (chat?.exists && chat.data()?.tenantId === data.tenantId && existing.outboundJobId && chat.data()?.outboundTailJobId === existing.outboundJobId) {
      transaction.set(chat.ref, { lastOutboundMetaMessageId: externalId, lastOutboundDeliveryStatus: patch.deliveryStatus || patch.status,
        lastOutboundDeliveryAt: patch.deliveryAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return "live" as const;
  });
}
