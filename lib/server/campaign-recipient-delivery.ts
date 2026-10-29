import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getWhatsAppChannelForTenant, isOfficialWhatsAppProvider } from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "./messaging/registry";
import { resolveCanonicalWhatsAppChat } from "./whatsapp-chat-identity";
import { queueTenantCampaignRecipient, processChatOutboundJobs } from "./chat-outbound";
import { createChatOutboundIdentity } from "./chat-outbound-idempotency";
import { normalizeCampaignRequest, campaignDeliveryId, campaignRecipientRequestId, campaignRequestFingerprint,
  CampaignRecipientBlockedError, CampaignRecipientPendingError, type CampaignRecipientRequest } from "./campaign-recipient-contract";

export async function deliverCampaignRecipient(input: {
  tenantId: string; campaignId: string; runId: string; leadId: string; actor: { id: string; name: string };
  prepare: () => Promise<Omit<CampaignRecipientRequest, "provider" | "phoneNumberId">>;
}) {
  const ref = adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(input.tenantId, input.runId, input.leadId));
  let stored = await ref.get();
  if (!stored.exists) {
    const prepared = await input.prepare();
    if (prepared.runId !== input.runId || prepared.campaignId !== input.campaignId || prepared.leadId !== input.leadId) throw new CampaignRecipientBlockedError("Referencia diferente do destinatario solicitado.");
    const channel = await getWhatsAppChannelForTenant(input.tenantId, { channelId: prepared.channelId, allowAgencyFallback: false });
    if (!channel || channel.id !== prepared.channelId) throw new CampaignRecipientBlockedError("Canal WhatsApp indisponivel.");
    const request = normalizeCampaignRequest({ ...prepared, phoneNumberId: channel.phoneNumberId || "",
      provider: isOfficialWhatsAppProvider(channel.provider) ? "meta_whatsapp" : getWhatsAppMessagingProvider(channel).id });
    const lead = await adminDb.collection("leads").doc(input.leadId).get();
    if (lead.data()?.tenantId !== input.tenantId) throw new CampaignRecipientBlockedError("Contato fora da empresa.");
    if (/@g\.us$/i.test(String(lead.data()?.telefone || ""))) throw new CampaignRecipientBlockedError("Grupos nao recebem campanhas de leads.", "recipient_unavailable");
    const canonical = await resolveCanonicalWhatsAppChat({ tenantId: input.tenantId, channelId: request.channelId, phone: request.phone, requireExactChannel: true,
      createData: { tenantId: input.tenantId, leadId: input.leadId, channel: "whatsapp", channelId: request.channelId, channelPhoneNumberId: request.phoneNumberId,
        contactPhone: request.phone, contactPhoneNormalized: request.phone, contactName: request.leadName, status: "open", source: "outbound_campaign",
        ownerId: String(lead.data()?.ownerId || lead.data()?.assignedTo || input.actor.id), ownerName: String(lead.data()?.ownerName || lead.data()?.owner || input.actor.name),
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessageTime: FieldValue.serverTimestamp(), lastMessage: "" } });
    try { await queueTenantCampaignRecipient({ tenantId: input.tenantId, chatId: canonical.chatRef.id, request, actor: input.actor }); }
    catch (error) { if (!(await ref.get()).exists) throw error; } // A concurrent caller may have accepted the only payload.
    stored = await ref.get();
  }
  const data = stored.data();
  if (!data || data.tenantId !== input.tenantId || data.campaignId !== input.campaignId || data.runId !== input.runId || data.leadId !== input.leadId || typeof data.chatId !== "string") throw new CampaignRecipientBlockedError("Entrega fora do tenant ou execucao original.");
  const request = normalizeCampaignRequest(data as CampaignRecipientRequest), fingerprint = campaignRequestFingerprint(input.tenantId, data.chatId, request);
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId, chatId: data.chatId, clientRequestId: campaignRecipientRequestId(input.tenantId, input.runId, input.leadId) });
  if (data.requestFingerprint !== fingerprint || data.outboundJobId !== identity.jobId || data.localMessageId !== identity.messageId) throw new CampaignRecipientBlockedError("Entrega alterada apos aceite.");
  const jobRef = adminDb.collection("chat_outbound_jobs").doc(identity.jobId), before = await jobRef.get();
  if (!before.exists || before.data()?.tenantId !== input.tenantId || before.data()?.chatId !== data.chatId || before.data()?.requestFingerprint !== fingerprint) throw new CampaignRecipientBlockedError("Tarefa aceita removida ou alterada; nao sera recriada.");
  await processChatOutboundJobs({ jobId: identity.jobId, limit: 1 });
  const [job, message] = await adminDb.getAll(jobRef, adminDb.collection("messages").doc(identity.messageId));
  if (job.data()?.status === "dead_letter") throw new CampaignRecipientBlockedError(String(job.data()?.error || "Entrega bloqueada."));
  if (job.data()?.status !== "completed") throw new CampaignRecipientPendingError(ref.id);
  if (message.data()?.tenantId !== input.tenantId || message.data()?.chatId !== data.chatId || !message.data()?.metaMessageId) throw new CampaignRecipientPendingError(ref.id);
  return { ...identity, deliveryId: ref.id, chatId: data.chatId, metaMessageId: String(message.data()!.metaMessageId), phoneNumberId: String(message.data()!.channelPhoneNumberId || request.phoneNumberId),
    persistedText: String(message.data()!.text), templateName: message.data()!.templateName || null, templateLanguage: message.data()!.templateLanguage || null, templateParams: message.data()!.templateParams || [] };
}
