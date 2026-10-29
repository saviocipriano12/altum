import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertWhatsAppDeliveryStateScope, readWhatsAppDeliveryHistory, shouldApplyWhatsAppDelivery, whatsAppEventFromState,
  whatsappDeliveryPatch, whatsappDeliveryStateRef } from "@/lib/server/whatsapp-delivery-status";

/** Save campaign acceptance while retaining receipts received before this record. */
export async function persistCampaignDeliveryAcknowledgement(ref: DocumentReference, data: Record<string, unknown>) {
  await adminDb.runTransaction(transaction => appendCampaignDeliveryAcknowledgement(transaction, ref, data));
}
export async function appendCampaignDeliveryAcknowledgement(transaction: Transaction, ref: DocumentReference, data: Record<string, unknown>) {
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data() || {};
    if (snapshot.exists && (existing.tenantId !== data.tenantId || existing.campaignId !== data.campaignId ||
      (existing.metaMessageId && existing.metaMessageId !== data.metaMessageId) ||
      (existing.outboundJobId && existing.outboundJobId !== data.outboundJobId))) {
      throw new Error("Confirmacao de campanha fora da empresa, campanha ou envio original.");
    }
    const externalId = String(data.metaMessageId || "");
    const phoneNumberId = String(data.channelPhoneNumberId || "");
    const stateRef = externalId && phoneNumberId ? whatsappDeliveryStateRef(String(data.tenantId || ""), phoneNumberId, externalId) : null;
    const state = stateRef ? await transaction.get(stateRef) : null;
    assertWhatsAppDeliveryStateScope(state?.data(), data.tenantId, phoneNumberId, externalId);
    if (state?.data()?.localCampaignDeliveryId && state.data()?.localCampaignDeliveryId !== ref.id) throw new Error("Recibo ja vinculado a outra entrega de campanha.");
    const history = stateRef && state?.data()?.legacyHistoryReconciled !== true
      ? await readWhatsAppDeliveryHistory(transaction, { tenantId: String(data.tenantId || ""), phoneNumberId, messageId: externalId, current: state?.data() }) : null;
    const patch = { ...data };
    const previous = whatsAppEventFromState(existing, externalId);
    if (previous && !shouldApplyWhatsAppDelivery(existing, { messageId: externalId, status: "sent", timestampMs: null, recipientId: "", errorCode: "", errorMessage: "" })) {
      Object.assign(patch, whatsappDeliveryPatch(previous, phoneNumberId));
    }
    const receipt = history?.receipt || whatsAppEventFromState(state?.data(), externalId);
    if (receipt && shouldApplyWhatsAppDelivery(patch, receipt)) Object.assign(patch, whatsappDeliveryPatch(receipt, phoneNumberId));
    transaction.set(ref, patch, { merge: true });
    if (stateRef) transaction.set(stateRef, { recordType: "state", tenantId: data.tenantId, phoneNumberId, metaMessageId: externalId,
      localCampaignDeliveryId: ref.id, ...(data.chatId ? { chatId: data.chatId } : {}),
      legacyHistoryReconciled: true, ...(history ? { historyReceiptCount: history.scanned } : {}),
      status: patch.deliveryStatus || patch.status, deliveryStatus: patch.deliveryStatus || patch.status,
      deliveryAt: patch.deliveryAt || state?.data()?.deliveryAt || null,
      deliveryError: patch.deliveryError || "", deliveryErrorCode: patch.deliveryErrorCode || "", deliveryRecipientId: patch.deliveryRecipientId || "",
      createdAt: state?.data()?.createdAt || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
