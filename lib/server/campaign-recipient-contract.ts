import { FieldValue, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { isOfficialWhatsAppProvider } from "@/app/lib/server/whatsapp-channel";
import { normalizeOutboundText } from "./chat-outbound-payload";
import { normalizeOutboundTemplate } from "./chat-outbound-template";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "./chat-outbound-idempotency";
import { evaluateWhatsAppBulkCompliance } from "./whatsapp-compliance";
import { appendCampaignDeliveryAcknowledgement } from "./campaign-delivery-acknowledgement";
import { parsePublicChatAssetUrl } from "./chat-public-asset";
import type { CampaignRunPlan } from "./campaign-run-admission";

export type CampaignPayload = { kind: "text"; text: string } | { kind: "template"; text: string; template: ReturnType<typeof normalizeOutboundTemplate> }
  | { kind: "media"; text: string; source: { url: string; type: "image" | "video" | "document"; filename: string } };
export type CampaignRecipientRequest = { campaignId: string; runId: string; leadId: string; channelId: string; phone: string; phoneNumberId: string; provider: string;
  payload: CampaignPayload; context: Record<string, unknown>; leadName: string; leadSource: string };
export class CampaignDeliveryDeferredError extends Error { constructor(readonly retryAt = new Date(Date.now() + 60000), readonly reasonCode = "paused") { super(reasonCode === "scheduled" ? "Campanha aguardando o horario aceito." : "Campanha pausada. A entrega aguarda retomada."); this.name = "CampaignDeliveryDeferredError"; } }
export class CampaignRecipientBlockedError extends Error { constructor(reason: string, readonly reasonCode = "blocked") { super(`Falha de integridade: campanha bloqueada. ${reason}`); this.name = "CampaignRecipientBlockedError"; } }
export class CampaignRecipientPendingError extends Error { constructor(readonly deliveryId: string) { super("Entrega da campanha registrada, mas ainda sem confirmacao."); this.name = "CampaignRecipientPendingError"; } }
export const campaignDeliveryId = (tenantId: string, runId: string, leadId: string) => `campaign_delivery_${createChatOutboundFingerprint([tenantId, runId, leadId])}`;
export const campaignRecipientRequestId = (tenantId: string, runId: string, leadId: string) => `campaign-${createChatOutboundFingerprint([tenantId, runId, leadId])}`;
const providerKey = (raw: unknown) => isOfficialWhatsAppProvider(String(raw || "meta_whatsapp")) ? "meta_whatsapp" : /^(evolution|evolution_api)$/i.test(String(raw)) ? "evolution" : "legacy_gateway";
export function normalizeCampaignRequest(value: CampaignRecipientRequest): CampaignRecipientRequest {
  for (const key of ["campaignId", "runId", "leadId", "channelId"] as const) if (typeof value[key] !== "string" || !value[key] || value[key].length > 180 || value[key].includes("/")) throw new CampaignRecipientBlockedError("Referencia invalida.");
  if (!/^\d{10,15}$/.test(value.phone) || typeof value.phoneNumberId !== "string" || !["meta_whatsapp", "evolution", "legacy_gateway"].includes(value.provider)) throw new CampaignRecipientBlockedError("Destinatario invalido.");
  const text = normalizeOutboundText(value.payload.text);
  let payload: CampaignPayload;
  if (value.payload.kind === "text") payload = { kind: "text", text };
  else if (value.payload.kind === "template") payload = { kind: "template", text, template: normalizeOutboundTemplate(value.payload.template) };
  else if (value.payload.kind === "media" && ["image", "video", "document"].includes(value.payload.source.type)) {
    if (text.length > 1024 || typeof value.payload.source.filename !== "string" || value.payload.source.filename.length > 180) throw new CampaignRecipientBlockedError("Legenda ou nome de arquivo acima do limite.");
    payload = { kind: "media", text, source: { ...value.payload.source, url: parsePublicChatAssetUrl(value.payload.source.url).href } };
  } else throw new CampaignRecipientBlockedError("Tipo de mensagem invalido.");
  return { campaignId: value.campaignId, runId: value.runId, leadId: value.leadId, channelId: value.channelId, phone: value.phone, phoneNumberId: value.phoneNumberId,
    provider: value.provider, payload, context: value.context, leadName: value.leadName, leadSource: value.leadSource };
}
export const campaignRequestFingerprint = (tenantId: string, chatId: string, request: CampaignRecipientRequest) => createChatOutboundFingerprint(["campaign-recipient-v1", tenantId, chatId, normalizeCampaignRequest(request)]);

async function check(request: CampaignRecipientRequest, tenantId: string, chatId: string, jobId: string, tx?: Transaction, admission = false) {
  const read = (collection: string, id: string) => { const ref = adminDb.collection(collection).doc(id); return tx ? tx.get(ref) : ref.get(); };
  const [campaign, run, lead, chat, channel] = await Promise.all([read("outbound_campaigns", request.campaignId), read("outbound_campaign_runs", request.runId),
    read("leads", request.leadId), read("chats", chatId), read("tenant_channels", request.channelId)]);
  const plan = run.data()?.admissionPlan as CampaignRunPlan | undefined;
  if (campaign.data()?.tenantId !== tenantId || campaign.data()?.activeRunId !== request.runId || run.data()?.tenantId !== tenantId || run.data()?.campaignId !== request.campaignId ||
    run.data()?.admissionProtocol !== 1 || !plan || run.data()?.admissionPlanHash !== createChatOutboundFingerprint([plan]) || plan.campaign.channelId !== request.channelId ||
    !plan.jobs.some(job => job.leadIds.includes(request.leadId)) || ["completed", "failed"].includes(String(run.data()?.status))) throw new CampaignRecipientBlockedError("Execucao alterada ou fora do tenant.");
  if (!admission && campaign.data()?.status === "paused") throw new CampaignDeliveryDeferredError();
  const planned = plan.jobs.find(job => job.leadIds.includes(request.leadId));
  if (!admission && planned && new Date(planned.dueAt).getTime() > Date.now()) throw new CampaignDeliveryDeferredError(new Date(planned.dueAt), "scheduled");
  if (lead.data()?.tenantId !== tenantId || /@g\.us$/i.test(String(lead.data()?.telefone || "")) || normalizePhone(String(lead.data()?.telefone || "")) !== request.phone ||
    chat.data()?.tenantId !== tenantId || chat.data()?.channel !== "whatsapp" || chat.data()?.channelId !== request.channelId ||
    normalizePhone(String(chat.data()?.contactPhone || "")) !== request.phone || chat.data()?.isGroup === true || (chat.data()?.leadId && chat.data()?.leadId !== request.leadId) ||
    channel.data()?.tenantId !== tenantId || channel.data()?.type !== "whatsapp" || channel.data()?.status !== "active" ||
    providerKey(channel.data()?.provider) !== request.provider || String(channel.data()?.phoneNumberId || "") !== request.phoneNumberId) throw new CampaignRecipientBlockedError("Canal ou destinatario alterado.");
  const compliance = evaluateWhatsAppBulkCompliance(lead.data()!);
  const chatCompliance = evaluateWhatsAppBulkCompliance(chat.data()!);
  if (!compliance.allowed || !chatCompliance.allowed) throw new CampaignRecipientBlockedError(compliance.reason || chatCompliance.reason, "compliance");
  if (lead.data()?.campaignDeliveryReservation && lead.data()?.campaignDeliveryReservation.jobId !== jobId) throw new CampaignRecipientBlockedError("Outra entrega do contato ainda exige confirmacao.");
  return { lead, chat, run, campaign };
}
export async function appendCampaignRecipientAcceptance(batch: WriteBatch, input: { tenantId: string; chatId: string; jobId: string; messageId: string; request: CampaignRecipientRequest }) {
  const checked = await check(input.request, input.tenantId, input.chatId, input.jobId, undefined, true);
  const deliveryId = campaignDeliveryId(input.tenantId, input.request.runId, input.request.leadId), ref = adminDb.collection("outbound_campaign_deliveries").doc(deliveryId);
  batch.create(ref, { tenantId: input.tenantId, ...input.request, chatId: input.chatId, outboundJobId: input.jobId, localMessageId: input.messageId,
    requestFingerprint: campaignRequestFingerprint(input.tenantId, input.chatId, input.request), status: "queued", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  // CAS all policy/identity reads, not just the chat's queue sequence.
  batch.update(checked.lead.ref, { tenantId: input.tenantId }, { lastUpdateTime: checked.lead.updateTime! });
  batch.update(checked.run.ref, { tenantId: input.tenantId }, { lastUpdateTime: checked.run.updateTime! });
  batch.update(checked.campaign.ref, { tenantId: input.tenantId }, { lastUpdateTime: checked.campaign.updateTime! });
  if (!checked.chat.data()?.leadId) batch.update(checked.chat.ref, { leadId: input.request.leadId });
}
export async function assertCampaignRecipientAllowed(job: Record<string, unknown>, tx?: Transaction) {
  if (job.kind !== "campaign_delivery") return;
  const request = normalizeCampaignRequest(job.campaignRequest as CampaignRecipientRequest), tenantId = String(job.tenantId), chatId = String(job.chatId);
  const identity = createChatOutboundIdentity({ tenantId, chatId, clientRequestId: campaignRecipientRequestId(tenantId, request.runId, request.leadId) });
  if (job.requestFingerprint !== campaignRequestFingerprint(tenantId, chatId, request) || job.messageId !== identity.messageId || job.clientRequestId !== identity.clientRequestId) throw new CampaignRecipientBlockedError("Entrega alterada apos aceite.");
  const deliveryRef = adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(tenantId, request.runId, request.leadId));
  if (job.campaignDeliveryId !== deliveryRef.id) throw new CampaignRecipientBlockedError("Identificacao da entrega alterada.");
  const delivery = tx ? await tx.get(deliveryRef) : await deliveryRef.get();
  if (delivery.data()?.tenantId !== tenantId || delivery.data()?.outboundJobId !== identity.jobId || delivery.data()?.chatId !== chatId || delivery.data()?.requestFingerprint !== job.requestFingerprint) throw new CampaignRecipientBlockedError("Vinculo da entrega alterado.");
  const checked = await check(request, tenantId, chatId, identity.jobId, tx);
  if (tx) tx.update(checked.lead.ref, { campaignDeliveryReservation: { jobId: identity.jobId, deliveryId: deliveryRef.id, since: FieldValue.serverTimestamp() } });
}

export async function persistCampaignRecipientResult(input: { jobId: string; leaseToken: string; lockId: string }) {
  await adminDb.runTransaction(async tx => {
    const [job, lock] = await Promise.all([tx.get(adminDb.collection("chat_outbound_jobs").doc(input.jobId)), tx.get(adminDb.collection("chat_outbound_locks").doc(input.lockId))]);
    const data = job.data();
    if (!data || data.status !== "processing" || data.leaseToken !== input.leaseToken || lock.data()?.leaseToken !== input.leaseToken || lock.data()?.jobId !== input.jobId ||
      lock.data()?.tenantId !== data.tenantId || lock.data()?.chatId !== data.chatId) throw new Error("Posse da entrega de campanha perdida antes do recibo.");
    const request = normalizeCampaignRequest(data.campaignRequest);
    if (data.requestFingerprint !== campaignRequestFingerprint(data.tenantId, data.chatId, request)) throw new CampaignRecipientBlockedError("Conteudo alterado antes do recibo.");
    const deliveryRef = adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(data.tenantId, request.runId, request.leadId));
    const leadRef = adminDb.collection("leads").doc(request.leadId), chatRef = adminDb.collection("chats").doc(data.chatId), eventRef = adminDb.collection("lead_events").doc(deliveryRef.id);
    const [message, lead, chat, event, delivery] = await Promise.all([tx.get(adminDb.collection("messages").doc(data.messageId)), tx.get(leadRef), tx.get(chatRef), tx.get(eventRef), tx.get(deliveryRef)]);
    if (!message.data()?.metaMessageId || message.data()?.tenantId !== data.tenantId || message.data()?.chatId !== data.chatId || lead.data()?.tenantId !== data.tenantId || chat.data()?.tenantId !== data.tenantId ||
      delivery.data()?.tenantId !== data.tenantId || delivery.data()?.outboundJobId !== input.jobId ||
      (lead.data()?.campaignDeliveryReservation && lead.data()?.campaignDeliveryReservation.jobId !== input.jobId) || (event.exists && event.data()?.tenantId !== data.tenantId)) throw new CampaignRecipientBlockedError("Recibo fora do contato original.");
    const context = { ...request.context, deliveryId: deliveryRef.id, chatId: data.chatId, phone: request.phone, leadId: request.leadId, runId: request.runId,
      campaignId: request.campaignId, channelId: request.channelId, metaMessageId: message.data()!.metaMessageId, channelPhoneNumberId: message.data()!.channelPhoneNumberId || null,
      intendedText: request.payload.text, persistedText: message.data()!.text, status: "sent", sentAt: FieldValue.serverTimestamp(), sentBy: data.actorId, sentByName: data.actorName };
    await appendCampaignDeliveryAcknowledgement(tx, deliveryRef, { tenantId: data.tenantId, ...context, outboundJobId: input.jobId,
      localMessageId: data.messageId, leadName: request.leadName, leadSource: request.leadSource, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const patch = { lastOutboundCampaignContext: context, lastOutboundCampaignId: request.campaignId,
      lastOutboundCampaignName: request.context.campaignName || "Campanha", lastOutboundCampaignAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    tx.update(leadRef, { ...patch, campaignDeliveryReservation: FieldValue.delete() });
    tx.update(chatRef, { ...patch, aiCampaignFollowupMode: true });
    if (!event.exists) tx.create(eventRef, { tenantId: data.tenantId, leadId: request.leadId, type: "outbound_campaign_sent", title: `Campanha outbound: ${request.context.campaignName || "Campanha"}`,
      detail: "Mensagem de campanha confirmada com recibo persistente.", actorId: data.actorId, actorName: data.actorName, createdAt: FieldValue.serverTimestamp() });
  });
}
