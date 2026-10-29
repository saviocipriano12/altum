import { FieldValue, type Transaction, type WriteBatch } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getMetaChannelForTenant } from "@/app/lib/server/meta-channel";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "../chat-outbound-idempotency";
import { normalizeOutboundText } from "../chat-outbound-payload";
import { isWithinSocialActiveHours, normalizeTenantSocialAutomationConfig, textTriggersSocialOptOut } from "./config";

export type SocialReply = { logId: string; eventId: string; channelId: string; channelType: "instagram" | "messenger";
  accountId: string; pageId: string; actorId: string; commentId: string; postId: string; text: string;
  mode: "public_comment" | "private_comment"; ruleId: string; ruleFingerprint: string };
export const socialContactId = (tenantId: string, type: string, actorId: string) => `${tenantId}_${type}_${actorId}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);
export const socialReplyKey = (reply: SocialReply) => `social-${createChatOutboundFingerprint([reply.channelId, reply.commentId])}`;
export const socialCommentIdentity = (tenantId: string, channelId: string, commentId: string) => createChatOutboundIdentity({ tenantId,
  chatId: `social_${createChatOutboundFingerprint([channelId, commentId])}`, clientRequestId: `social-${createChatOutboundFingerprint([channelId, commentId])}` });
export const socialReplyIdentity = (tenantId: string, reply: SocialReply) => socialCommentIdentity(tenantId, reply.channelId, reply.commentId);
export const socialReplyFingerprint = (tenantId: string, chatId: string, reply: SocialReply) => createChatOutboundFingerprint(["social-reply-v1", tenantId, chatId, normalizeSocialReply(reply)]);
const blocked = (reason: string) => new Error(`Falha de integridade: resposta social bloqueada. ${reason}`);
export function normalizeSocialReply(value: SocialReply): SocialReply {
  if (!value || !["instagram", "messenger"].includes(value.channelType) || !["public_comment", "private_comment"].includes(value.mode) ||
    (value.mode === "private_comment" && value.channelType !== "instagram")) throw blocked("Tipo invalido.");
  for (const key of ["logId", "eventId", "channelId", "accountId", "actorId", "commentId"] as const) {
    if (typeof value[key] !== "string" || !value[key] || value[key].length > (key === "logId" ? 240 : 220) || /[\/\x00-\x1f]/.test(value[key])) throw blocked("Referencia invalida.");
  }
  if (![value.pageId, value.postId, value.ruleId, value.ruleFingerprint].every(v => typeof v === "string" && v.length <= 220 && !/[\/\x00-\x1f]/.test(v))) throw blocked("Referencia opcional invalida.");
  return { logId: value.logId, eventId: value.eventId, channelId: value.channelId, channelType: value.channelType,
    accountId: value.accountId, pageId: value.pageId, actorId: value.actorId, commentId: value.commentId, postId: value.postId,
    mode: value.mode, ruleId: value.ruleId, ruleFingerprint: value.ruleFingerprint, text: normalizeOutboundText(value.text) };
}

async function check(tenantId: string, chatId: string, reply: SocialReply, tx?: Transaction) {
  const read = (collection: string, id: string) => { const ref = adminDb.collection(collection).doc(id); return tx ? tx.get(ref) : ref.get(); };
  const [log, channel, chat, configDoc, contact] = await Promise.all([read("social_automation_logs", reply.logId), read("tenant_channels", reply.channelId),
    read("chats", chatId), read("social_automations", tenantId), read("social_automation_contacts", socialContactId(tenantId, reply.channelType, reply.actorId))]);
  const source = log.data(), account = channel.data(), conversation = chat.data();
  const metadata = account?.metadata || {};
  if (source?.tenantId !== tenantId || source.channelId !== reply.channelId || source.channelType !== reply.channelType || source.eventType !== "comment" ||
    source.eventId !== reply.eventId || source.commentId !== reply.commentId || source.actorId !== reply.actorId || String(source.postId || "") !== reply.postId ||
    account?.tenantId !== tenantId || account.type !== reply.channelType || account.status !== "active" ||
    String(account.externalAccountId || metadata.instagramBusinessId || account.pageId || metadata.pageId || "") !== reply.accountId ||
    String(account.pageId || metadata.pageId || "") !== reply.pageId || conversation?.tenantId !== tenantId || conversation.channel !== reply.channelType ||
    conversation.channelId !== reply.channelId || conversation.contactExternalId !== reply.actorId ||
    (conversation.channelExternalAccountId && conversation.channelExternalAccountId !== reply.accountId)) throw blocked("Canal, comentario ou destinatario alterado.");
  if (contact.exists && (contact.data()?.tenantId !== tenantId || contact.data()?.channelType !== reply.channelType || contact.data()?.actorId !== reply.actorId)) throw blocked("Consentimento fora do contato original.");
  if (!configDoc.exists || (configDoc.data()?.tenantId && configDoc.data()?.tenantId !== tenantId)) throw blocked("Configuracao indisponivel.");
  const config = normalizeTenantSocialAutomationConfig(tenantId, configDoc.data());
  if (!config.enabled || !isWithinSocialActiveHours(config.activeHours) || contact.data()?.optedOut === true || textTriggersSocialOptOut(String(source.text || ""), config.optOutKeywords) ||
    [reply.accountId, reply.pageId].includes(reply.actorId)) throw blocked("Automacao desativada, horario ou consentimento revogado.");
  if (reply.ruleId) {
    const rule = config.commentRules.find(item => item.id === reply.ruleId);
    if (!rule?.enabled || createChatOutboundFingerprint([rule]) !== reply.ruleFingerprint ||
      (reply.channelType === "instagram" && rule.privateReply ? "private_comment" : "public_comment") !== reply.mode) throw blocked("Regra alterada ou revogada.");
  } else if (!config.commentAutoReply || reply.mode !== "public_comment") throw blocked("Resposta publica desativada.");
  return { log, configDoc, contact, channel, chat, config };
}

export async function appendSocialReplyAcceptance(batch: WriteBatch, input: { tenantId: string; chatId: string; reply: SocialReply; claimToken: string; jobId: string }) {
  const checked = await check(input.tenantId, input.chatId, input.reply);
  const data = checked.log.data()!;
  if (data.claimToken !== input.claimToken || data.deliveryJobId || data.status !== "claimed" || !data.claimUntil?.toDate || data.claimUntil.toDate().getTime() <= Date.now()) throw blocked("Posse do preparo perdida.");
  batch.create(adminDb.collection("social_reply_deliveries").doc(input.jobId), { tenantId: input.tenantId, channelId: input.reply.channelId,
    commentId: input.reply.commentId, logId: input.reply.logId, chatId: input.chatId, jobId: input.jobId,
    requestFingerprint: socialReplyFingerprint(input.tenantId, input.chatId, input.reply), status: "queued", createdAt: FieldValue.serverTimestamp() });
  batch.update(checked.log.ref, { status: "queued", deliveryProtocol: 1, deliveryJobId: input.jobId, deliveryChatId: input.chatId,
    acceptedReply: input.reply, replyFingerprint: socialReplyFingerprint(input.tenantId, input.chatId, input.reply), responseText: input.reply.text,
    chatId: input.chatId, leadId: checked.chat.data()?.leadId || null, automationRuleId: input.reply.ruleId || null,
    automationRuleName: checked.config.commentRules.find(rule => rule.id === input.reply.ruleId)?.name || null,
    claimToken: null, claimUntil: null, updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: checked.log.updateTime! });
  for (const doc of [checked.configDoc, checked.channel]) batch.update(doc.ref, { tenantId: input.tenantId }, { lastUpdateTime: doc.updateTime! });
  // If absent, create a consent row atomically; concurrent opt-out must reject this commit.
  if (checked.contact.exists) batch.update(checked.contact.ref, { tenantId: input.tenantId }, { lastUpdateTime: checked.contact.updateTime! });
  else batch.create(checked.contact.ref, { tenantId: input.tenantId, channelType: input.reply.channelType, actorId: input.reply.actorId, optedOut: false });
}

export async function assertSocialReplyAllowed(job: Record<string, unknown>, tx?: Transaction) {
  if (job.kind !== "social_reply") return;
  const reply = normalizeSocialReply(job.socialReply as SocialReply), tenantId = String(job.tenantId), chatId = String(job.chatId);
  const identity = socialReplyIdentity(tenantId, reply);
  if (job.requestFingerprint !== socialReplyFingerprint(tenantId, chatId, reply) || job.clientRequestId !== identity.clientRequestId ||
    (reply.mode === "private_comment" ? job.messageId !== identity.messageId : job.messageId !== null)) throw blocked("Conteudo aceito alterado.");
  const checked = await check(tenantId, chatId, reply, tx), source = checked.log.data()!;
  const ledgerRef = adminDb.collection("social_reply_deliveries").doc(identity.jobId), ledger = tx ? await tx.get(ledgerRef) : await ledgerRef.get();
  if (ledger.data()?.tenantId !== tenantId || ledger.data()?.logId !== reply.logId || ledger.data()?.chatId !== chatId || ledger.data()?.requestFingerprint !== job.requestFingerprint) throw blocked("Registro da entrega alterado.");
  if (source.deliveryJobId !== identity.jobId || source.replyFingerprint !== job.requestFingerprint || source.deliveryChatId !== chatId) throw blocked("Vinculo alterado.");
}

export async function sendSocialReply(job: Record<string, unknown>, beforeSend: () => Promise<void>) {
  const reply = normalizeSocialReply(job.socialReply as SocialReply);
  const channel = await getMetaChannelForTenant(String(job.tenantId), reply.channelType, { channelId: reply.channelId });
  if (!channel || channel.id !== reply.channelId || (channel.externalAccountId || channel.pageId) !== reply.accountId || String(channel.pageId || "") !== reply.pageId) throw blocked("Canal indisponivel.");
  const target = reply.mode === "private_comment" ? `${encodeURIComponent(reply.accountId)}/messages` : `${encodeURIComponent(reply.commentId)}/${reply.channelType === "instagram" ? "replies" : "comments"}`;
  await beforeSend();
  const response = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v21.0"}/${target}`, {
    method: "POST", headers: { Authorization: `Bearer ${channel.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(reply.mode === "private_comment" ? { recipient: { comment_id: reply.commentId }, message: { text: reply.text } } : { message: reply.text }),
    signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string; message_id?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || "Falha da Meta ao responder comentario.");
  const id = reply.mode === "private_comment" ? payload.message_id : payload.id;
  if (typeof id !== "string" || !id.trim() || id.length > 220) throw new Error("Confirmacao social sem identificador. Reconciliacao necessaria.");
  return id;
}

export async function persistSocialReplyResult(input: { jobId: string; lockId: string; leaseToken: string; externalId: string }) {
  return adminDb.runTransaction(async tx => {
    const jobRef = adminDb.collection("chat_outbound_jobs").doc(input.jobId), lockRef = adminDb.collection("chat_outbound_locks").doc(input.lockId);
    const [job, lock] = await Promise.all([tx.get(jobRef), tx.get(lockRef)]), data = job.data();
    if (!data || data.status !== "processing" || data.leaseToken !== input.leaseToken || lock.data()?.leaseToken !== input.leaseToken || lock.data()?.jobId !== input.jobId ||
      lock.data()?.tenantId !== data.tenantId || lock.data()?.chatId !== data.chatId) throw new Error("Posse da resposta social perdida antes do recibo.");
    const reply = normalizeSocialReply(data.socialReply), logRef = adminDb.collection("social_automation_logs").doc(reply.logId);
    const log = await tx.get(logRef), ledgerRef = adminDb.collection("social_reply_deliveries").doc(input.jobId), ledger = await tx.get(ledgerRef);
    const messageRef = data.messageId ? adminDb.collection("messages").doc(data.messageId) : null, message = messageRef ? await tx.get(messageRef) : null;
    if (data.requestFingerprint !== socialReplyFingerprint(data.tenantId, data.chatId, reply) || log.data()?.tenantId !== data.tenantId || log.data()?.deliveryJobId !== input.jobId ||
      log.data()?.replyFingerprint !== data.requestFingerprint || ledger.data()?.tenantId !== data.tenantId || ledger.data()?.logId !== reply.logId ||
      ledger.data()?.requestFingerprint !== data.requestFingerprint || (messageRef && (message?.data()?.tenantId !== data.tenantId || message?.data()?.chatId !== data.chatId ||
        (message?.data()?.metaMessageId && message?.data()?.metaMessageId !== input.externalId)))) throw blocked("Recibo fora do envio original.");
    tx.update(logRef, { status: "sent", externalMessageId: input.externalId, responseText: reply.text, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), error: "" });
    tx.update(ledgerRef, { status: "sent", externalMessageId: input.externalId, updatedAt: FieldValue.serverTimestamp() });
    const receiptStatus = ["read", "delivered"].includes(message?.data()?.deliveryStatus) ? message?.data()?.deliveryStatus : "sent";
    if (messageRef) tx.update(messageRef, { metaMessageId: input.externalId, status: receiptStatus, deliveryStatus: receiptStatus, deliveryError: "", deliveryErrorCode: "", updatedAt: FieldValue.serverTimestamp() });
    tx.update(jobRef, { status: "completed", externalMessageId: input.externalId, completedAt: FieldValue.serverTimestamp(), leaseUntil: null, leaseToken: null, error: "", errorCode: "", updatedAt: FieldValue.serverTimestamp() });
    tx.update(lockRef, { leaseUntil: new Date(0), releasedAt: FieldValue.serverTimestamp() });
    return true;
  });
}
