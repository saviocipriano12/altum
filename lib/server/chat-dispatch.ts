import { isWhatsAppGroup, resolveWhatsAppRecipient } from "@/lib/whatsapp-conversation";
﻿import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { getTenantSettings } from "@/lib/server/tenant";
import {
  AGENCY_WHATSAPP_ENV_CHANNEL_ID,
  getWhatsAppChannelForTenant,
  isOfficialWhatsAppProvider,
  type WhatsAppTemplateHeaderMedia,
} from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "@/lib/server/messaging/registry";
import {
  getMetaChannelForTenant,
  isMetaConversationChannelType,
  sendMetaConversationText,
  sendMetaConversationMedia,
} from "@/app/lib/server/meta-channel";
import {
  enqueueConversationCommercialObservation,
  processConversationCommercialObservationJobs,
} from "@/lib/server/crm/conversation-observation-queue";
import { assertTenantStorageAvailable } from "@/lib/server/tenant-usage";
import { saveChatMediaBuffer } from "@/lib/server/firebase-storage";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { persistChatMessageAcknowledgement } from "@/lib/server/chat-message-acknowledgement";
import { AiVoicePreparationError } from "@/lib/server/ai/voice-delivery-errors";

export type ChatDispatchActor = {
  id: string;
  name: string;
};

export type ChatMediaType = "image" | "video" | "document" | "audio";

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function parseTextLines(value: unknown, maxItems = 12) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|;|\|/)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, maxItems);
  }

  return [] as string[];
}

function resolveFollowUpTemplateConfig(settings: Awaited<ReturnType<typeof getTenantSettings>>) {
  const ai =
    settings && typeof settings.ai === "object" && settings.ai
      ? (settings.ai as Record<string, unknown>)
      : {};

  return {
    enabled: ai.whatsappTemplateFollowUpEnabled !== false,
    templateName: String(ai.whatsappTemplateFollowUpName || "follow_up_geral").trim(),
    languageCode: String(ai.whatsappTemplateFollowUpLanguage || "pt_BR").trim() || "pt_BR",
    params: parseTextLines(ai.whatsappTemplateFollowUpParams, 12),
  };
}

function interpolateTemplateParams(params: string[], chat: { contactName?: string; contactPhone?: string }) {
  const firstName = String(chat.contactName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  const normalizedPhone = normalizePhone(chat.contactPhone) || "";

  return params
    .map((item) =>
      item
        .replace(/\{\{\s*nome\s*\}\}/gi, firstName)
        .replace(/\{\{\s*first_name\s*\}\}/gi, firstName)
        .replace(/\{\{\s*telefone\s*\}\}/gi, normalizedPhone)
        .trim()
    )
    .filter(Boolean)
    .slice(0, 20);
}

function isWhatsAppServiceWindowClosed(value: unknown) {
  const lastClientMessageAt = toDate(value);
  if (!lastClientMessageAt) return true;
  return Date.now() - lastClientMessageAt.getTime() > 23.5 * 60 * 60 * 1000;
}

function shouldAllowAgencyWhatsAppFallback(channelId: unknown) {
  return String(channelId || "").trim() === AGENCY_WHATSAPP_ENV_CHANNEL_ID;
}

function buildTemplateMessageText(templateName: string, bodyParams: string[], displayText?: string | null) {
  const explicit = String(displayText || "").trim();
  if (explicit) return explicit.slice(0, 4000);
  const params = bodyParams.filter(Boolean);
  if (!params.length) return `Template enviado: ${templateName}`;
  return `Template enviado: ${templateName}\nVariaveis: ${params.join(" | ")}`;
}

function normalizeTemplateHeaderMedia(value: WhatsAppTemplateHeaderMedia | null | undefined) {
  if (!value) return null;
  const type = String(value.type || "").trim().toLowerCase();
  if (type !== "image" && type !== "video" && type !== "document") return null;
  const link = String(value.link || "").trim();
  const id = String(value.id || "").trim();
  if (!link && !id) return null;
  return {
    type,
    ...(link ? { link } : {}),
    ...(id ? { id } : {}),
    ...(value.filename ? { filename: String(value.filename).trim().slice(0, 180) } : {}),
  } satisfies WhatsAppTemplateHeaderMedia;
}

function deliveryChatPatch(input: { text: string; channel: string; channelId?: string | null; phoneNumberId?: string | null; assignedTo: string }) {
  return { lastMessage: input.text, lastMessageTime: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    channel: input.channel, ...(input.channelId ? { channelId: input.channelId } : {}),
    ...(input.phoneNumberId ? { channelPhoneNumberId: input.phoneNumberId } : {}),
    ...buildOutgoingChatOperationalPatch({ status: "open", assignedTo: input.assignedTo }) };
}
function deliveryPausePatch(input: { tenantId: string; chatId: string; pauseAi?: boolean; pauseMinutes?: number; actor: ChatDispatchActor }) {
  if (!input.pauseAi) return undefined;
  const minutes = Math.max(1, Math.min(12 * 60, Number(input.pauseMinutes || 30)));
  return { tenantId: input.tenantId, chatId: input.chatId, aiEnabled: false, pausedUntil: new Date(Date.now() + minutes * 60_000),
    humanOwnerUserId: input.actor.id, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actor.id, updatedByName: input.actor.name };
}

export async function sendTenantChatText(input: {
  tenantId: string;
  chatId: string;
  text: string;
  allowTemplateFallback?: boolean;
  aiGenerated?: boolean;
  automationGenerated?: boolean;
  replyToId?: string | null;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
  messageId?: string | null;
  onDeliveryAttempt?: () => void | Promise<void>;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const text = String(input.text || "").trim();
  const replyToId = String(input.replyToId || "").trim().slice(0, 180);
  const persistedMessageId = String(input.messageId || "").trim().slice(0, 240);

  if (!tenantId || !chatId || !text) {
    throw new Error("tenantId, chatId e text sao obrigatorios.");
  }

  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new Error("Chat nao encontrado.");
  }

  const chat = chatSnap.data() as {
    tenantId?: string;
    contactPhone?: string;
    contactName?: string;
    channel?: string;
    channelId?: string;
    channelExternalAccountId?: string;
    contactExternalId?: string;
    assignedTo?: string;
    ownerId?: string;
    channelPhoneNumberId?: string;
    lastClientMessageAt?: unknown;
  };

  if ((chat.tenantId || "") !== tenantId) {
    throw new Error("Chat fora do tenant informado.");
  }

  // Validate the referenced conversation before any channel can accept delivery.
  // The enqueue check is not sufficient: the reference may change while queued.
  if (replyToId) {
    const repliedSnap = await adminDb.collection("messages").doc(replyToId).get();
    const replied = repliedSnap.data() as { chatId?: string; tenantId?: string } | undefined;
    if (!repliedSnap.exists || replied?.chatId !== chatId || replied?.tenantId !== tenantId) {
      throw new Error("Mensagem respondida nao pertence a esta conversa.");
    }
  }

  const normalizedChannel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  const isSiteChat = normalizedChannel === "site_chat";
  const isMetaChannel = isMetaConversationChannelType(normalizedChannel);

  let metaMessageId: string | null = null;
  let phoneNumberId: string | null = null;
  let metaChannelId: string | null = null;
  let outboundType: "text" | "template" = "text";
  let persistedText = text;
  let templateName: string | null = null;
  let templateLanguage: string | null = null;
  let templateParams: string[] = [];

  if (isMetaChannel) {
    const recipientId = String(chat.contactExternalId || "").trim();
    if (!recipientId) {
      throw new Error("Chat sem identificador do contato.");
    }

    const channel = await getMetaChannelForTenant(tenantId, normalizedChannel, {
      channelId: String(chat.channelId || "").trim() || null,
      externalAccountId: String(chat.channelExternalAccountId || "").trim() || null,
    });

    if (!channel || (chat.channelId && channel.id !== String(chat.channelId).trim()) ||
      (chat.channelExternalAccountId && ![channel.externalAccountId, channel.pageId].includes(String(chat.channelExternalAccountId).trim()))) {
      throw new Error(`Canal ${normalizedChannel} ativo nao configurado para este tenant.`);
    }

    await input.onDeliveryAttempt?.();
    const payload = await sendMetaConversationText({ channel, recipientId, text });
    metaMessageId = String(payload?.message_id || payload?.messageId || "").trim() || null;
    metaChannelId = channel.id;
  } else if (!isSiteChat) {
    const chatChannelId = String(chat.channelId || "").trim() || null;
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: shouldAllowAgencyWhatsAppFallback(chatChannelId),
      channelId: chatChannelId,
      phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
    });
    if (!channel) {
      throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
    }

    const phone = resolveWhatsAppRecipient(chat.contactPhone, channel.provider, normalizePhone);
    if (!phone) {
      throw new Error("Chat sem telefone valido.");
    }

    const serviceWindowClosed =
      isOfficialWhatsAppProvider(channel.provider) &&
      isWhatsAppServiceWindowClosed(chat.lastClientMessageAt);
    if (serviceWindowClosed) {
      if (input.allowTemplateFallback === false) throw new Error("Janela de 24h encerrada. Escolha um template aprovado para a campanha.");
      const templateConfig = resolveFollowUpTemplateConfig(await getTenantSettings(tenantId));
      if (!templateConfig.enabled) {
        throw new Error(
          "Janela de 24h encerrada e follow-up automatico por template esta desativado neste tenant."
        );
      }
      if (!templateConfig.templateName) {
        throw new Error(
          "Janela de 24h encerrada. Configure o template padrao de follow-up para o numero deste cliente."
        );
      }

      templateName = templateConfig.templateName;
      templateLanguage = templateConfig.languageCode;
      templateParams = interpolateTemplateParams(templateConfig.params, chat);

      const provider = getWhatsAppMessagingProvider(channel);
      await input.onDeliveryAttempt?.();
      const templatePayload = await provider.sendTemplate({
        to: phone,
        templateName,
        languageCode: templateLanguage,
        bodyParams: templateParams,
      });
      metaMessageId = templatePayload.externalMessageId;
      outboundType = "template";
      persistedText = buildTemplateMessageText(templateName, templateParams);
    } else {
      await input.onDeliveryAttempt?.();
      const payload = await getWhatsAppMessagingProvider(channel).sendText({ to: phone, text });
      metaMessageId = payload.externalMessageId;
    }
    phoneNumberId = channel.phoneNumberId;
  }

  const messageRef = persistedMessageId
    ? adminDb.collection("messages").doc(persistedMessageId)
    : adminDb.collection("messages").doc();
  const acknowledgement = await persistChatMessageAcknowledgement(messageRef, {
      chatId,
      tenantId,
      text: persistedText,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      ...(input.aiGenerated ? { aiGenerated: true } : {}),
      ...(input.automationGenerated ? { automationGenerated: true } : {}),
      type: outboundType,
      status: "sent",
      deliveryStatus: "sent",
      deliveryError: "",
      deliveryErrorCode: "",
      channel: normalizedChannel,
      ...(replyToId ? { replyToId } : {}),
      ...(metaChannelId ? { channelId: metaChannelId } : {}),
      ...(metaMessageId ? { metaMessageId } : {}),
      ...(templateName ? { templateName } : {}),
      ...(templateLanguage ? { templateLanguage } : {}),
      ...(templateParams.length ? { templateParams } : {}),
      ...(phoneNumberId ? { channelPhoneNumberId: phoneNumberId } : {}),
      ...(persistedMessageId
        ? { updatedAt: FieldValue.serverTimestamp() }
        : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: Boolean(persistedMessageId),
      chatPatch: deliveryChatPatch({ text: persistedText, channel: normalizedChannel, channelId: metaChannelId, phoneNumberId: phoneNumberId,
        assignedTo: String(chat.assignedTo || chat.ownerId || (input.aiGenerated || input.automationGenerated ? "" : input.actor.id)) }),
      pausePatch: deliveryPausePatch({ ...input, tenantId, chatId }) });

  // A resposta humana pausa somente a resposta automatica. O observador segue
  // registrando compromissos comerciais, proximo passo e evidencia no CRM.
  if (acknowledgement === "live") {
    const crmObservation = await enqueueConversationCommercialObservation({
      tenantId,
      chatId,
      messageId: messageRef.id,
      actorId: input.actor.id,
      actorName: input.actor.name,
      source: input.automationGenerated ? "automation_outbound" : input.aiGenerated ? "ai_outbound" : "human_outbound",
    });
    await processConversationCommercialObservationJobs({ jobId: crmObservation.jobId, limit: 1 }).catch((error) => {
      console.error("Falha ao processar observacao da resposta humana para CRM:", error);
    });
  }

  return {
    tenantId,
    chatId,
    channel: normalizedChannel,
    metaMessageId,
    phoneNumberId,
    metaChannelId,
    outboundType,
    templateName,
    templateLanguage,
    templateParams,
    persistedText,
    messageId: messageRef.id,
  };
}

/** Internal handoff destination: no message/chat/CRM side effects in the lead's history. */
export async function sendTenantHandoffAlert(input: {
  tenantId: string; chatId: string; channelId: string; phoneNumberId: string; recipientPhone: string; text: string;
  onDeliveryAttempt: () => Promise<void>;
}) {
  const chat = await adminDb.collection("chats").doc(input.chatId).get();
  if (!chat.exists || chat.data()?.tenantId !== input.tenantId) throw new Error("Conversa fora do tenant.");
  const channel = await getWhatsAppChannelForTenant(input.tenantId, { channelId: input.channelId,
    phoneNumberId: input.phoneNumberId || null, allowAgencyFallback: input.tenantId === "ALTUM_AGENCY" || shouldAllowAgencyWhatsAppFallback(input.channelId) });
  if (!channel || channel.id !== input.channelId || (input.phoneNumberId && channel.phoneNumberId !== input.phoneNumberId)) throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  const phone = normalizePhone(input.recipientPhone);
  if (!/^\d{10,15}$/.test(phone)) throw new Error("Alerta sem telefone valido.");
  const text = normalizeOutboundText(input.text);
  await input.onDeliveryAttempt();
  const sent = await getWhatsAppMessagingProvider(channel).sendText({ to: phone, text });
  if (!sent.externalMessageId) throw new Error("Confirmacao do alerta sem identificador. Reconciliacao necessaria.");
  return sent;
}

function previewForMedia(type: ChatMediaType, caption: string, filename: string) {
  if (caption) return caption;
  if (type === "image") return "[Imagem enviada]";
  if (type === "video") return "[Video enviado]";
  if (type === "audio") return "[Audio enviado]";
  return filename ? `[Documento enviado: ${filename}]` : "[Documento enviado]";
}

export async function sendTenantChatMedia(input: {
  tenantId: string;
  chatId: string;
  mediaType: ChatMediaType;
  buffer: Buffer;
  filename: string;
  contentType: string;
  caption?: string;
  replyToId?: string | null;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const mediaType = input.mediaType;
  const filename = String(input.filename || "arquivo").trim().slice(0, 180) || "arquivo";
  const contentType = String(input.contentType || "application/octet-stream").trim().slice(0, 180);
  const caption = String(input.caption || "").trim().slice(0, 1024);
  const replyToId = String(input.replyToId || "").trim().slice(0, 180);

  if (!tenantId || !chatId || !input.buffer?.length) {
    throw new Error("tenantId, chatId e arquivo sao obrigatorios.");
  }
  if (!["image", "video", "document", "audio"].includes(mediaType)) {
    throw new Error("Tipo de midia invalido.");
  }

  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new Error("Chat nao encontrado.");
  }

  const chat = chatSnap.data() as {
    tenantId?: string;
    contactPhone?: string;
    channel?: string;
    channelId?: string;
    channelPhoneNumberId?: string;
    assignedTo?: string;
    ownerId?: string;
    lastClientMessageAt?: unknown;
  };

  if ((chat.tenantId || "") !== tenantId) {
    throw new Error("Chat fora do tenant informado.");
  }

  const normalizedChannel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  if (normalizedChannel !== "whatsapp") {
    throw new Error("Envio de midia pelo painel esta disponivel para WhatsApp.");
  }
  await assertTenantStorageAvailable(tenantId, input.buffer.length);

  const chatChannelId = String(chat.channelId || "").trim() || null;
  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: shouldAllowAgencyWhatsAppFallback(chatChannelId),
    channelId: chatChannelId,
    phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
  });
  if (!channel) {
    throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  }
  if (isOfficialWhatsAppProvider(channel.provider) && isWhatsAppServiceWindowClosed(chat.lastClientMessageAt)) {
    throw new Error("Janela de 24h encerrada. Use um template aprovado para retomar o contato.");
  }

  const phone = resolveWhatsAppRecipient(chat.contactPhone, channel.provider, normalizePhone);
  if (!phone) {
    throw new Error("Chat sem telefone valido.");
  }

  if (replyToId) {
    const repliedSnap = await adminDb.collection("messages").doc(replyToId).get();
    const replied = repliedSnap.data() as { chatId?: string; tenantId?: string } | undefined;
    if (!repliedSnap.exists || replied?.chatId !== chatId || replied?.tenantId !== tenantId) {
      throw new Error("Mensagem respondida nao pertence a esta conversa.");
    }
  }

  const messageRef = adminDb.collection("messages").doc();
  const storedMediaPath = await saveChatMediaBuffer({
    tenantId,
    chatId,
    messageId: messageRef.id,
    data: input.buffer,
    contentType,
    filename,
  });

  const payload = await getWhatsAppMessagingProvider(channel).sendMedia({
    to: phone,
    mediaType,
    buffer: input.buffer,
    filename,
    contentType,
    caption,
    voice: mediaType === "audio",
  });

  const metaMessageId = payload.externalMessageId;
  const persistedText = previewForMedia(mediaType, caption, filename);

  await persistChatMessageAcknowledgement(messageRef, {
      chatId,
      tenantId,
      text: persistedText,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: mediaType,
      status: "sent",
      deliveryStatus: "sent",
      channel: normalizedChannel,
      ...(metaMessageId ? { metaMessageId } : {}),
      ...(payload.mediaId ? { mediaId: payload.mediaId } : {}),
      mediaName: filename,
      mediaMimeType: contentType,
      mediaSize: input.buffer.length,
      mediaUrl: storedMediaPath,
      ...(caption ? { caption } : {}),
      ...(replyToId ? { replyToId } : {}),
      channelPhoneNumberId: channel.phoneNumberId,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false,
      chatPatch: deliveryChatPatch({ text: persistedText, channel: normalizedChannel, channelId: null, phoneNumberId: channel.phoneNumberId,
        assignedTo: String(chat.assignedTo || chat.ownerId || input.actor.id) }),
      pausePatch: deliveryPausePatch({ ...input, tenantId, chatId }) });

  return {
    tenantId,
    chatId,
    channel: normalizedChannel,
    phoneNumberId: channel.phoneNumberId,
    metaMessageId,
    mediaId: payload.mediaId || null,
    mediaType,
    persistedText,
  };
}

export async function sendTenantChatMediaLink(input: {
  tenantId: string;
  chatId: string;
  mediaType: ChatMediaType;
  mediaUrl: string;
  deliveryBuffer?: Buffer;
  /** Signed URL of the verified immutable copy; resolved only for legacy gateways. */
  legacyMediaUrl?: () => Promise<string>;
  deliveryFilename?: string;
  aiGenerated?: boolean;
  displayText?: string;
  storedMediaPath?: string;
  mediaSize?: number;
  filename?: string;
  contentType?: string;
  deliveryContentType?: string;
  caption?: string;
  replyToId?: string | null;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
  messageId?: string | null;
  onDeliveryAttempt?: () => void | Promise<void>;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  const filename = String(input.filename || "arquivo").trim().slice(0, 180) || "arquivo";
  const contentType = String(input.contentType || "application/octet-stream").trim().slice(0, 180);
  const deliveryContentType = String(input.deliveryContentType || contentType).trim().slice(0, 180);
  const caption = String(input.caption || "").trim().slice(0, 1024);
  const storedMediaPath = String(input.storedMediaPath || "").trim();
  const replyToId = String(input.replyToId || "").trim().slice(0, 180);
  const mediaSize = Math.max(0, Number(input.mediaSize || 0));
  const persistedMessageId = String(input.messageId || "").trim();
  const persistedText = input.displayText == null ? previewForMedia(input.mediaType, caption, filename) : normalizeOutboundText(input.displayText);

  if (!tenantId || !chatId || (!mediaUrl && !input.deliveryBuffer?.length)) {
    throw new Error("tenantId, chatId e mediaUrl sao obrigatorios.");
  }

  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) throw new Error("Chat nao encontrado.");
  const chat = chatSnap.data() as {
    tenantId?: string;
    contactPhone?: string;
    channel?: string;
    channelId?: string;
    channelPhoneNumberId?: string;
    channelExternalAccountId?: string;
    contactExternalId?: string;
    assignedTo?: string;
    ownerId?: string;
    lastClientMessageAt?: unknown;
  };
  if ((chat.tenantId || "") !== tenantId) throw new Error("Chat fora do tenant informado.");

  if (replyToId) {
    const repliedSnap = await adminDb.collection("messages").doc(replyToId).get();
    const replied = repliedSnap.data() as { chatId?: string; tenantId?: string } | undefined;
    if (!repliedSnap.exists || replied?.chatId !== chatId || replied?.tenantId !== tenantId) {
      throw new Error("Mensagem respondida nao pertence a esta conversa.");
    }
  }

  const normalizedChannel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  let metaMessageId: string | null = null, phoneNumberId: string | null = null, metaChannelId: string | null = null;
  if (isMetaConversationChannelType(normalizedChannel)) {
    if (input.mediaType === "audio") throw new Error("Tipo de midia invalido para este canal.");
    const recipientId = String(chat.contactExternalId || "").trim();
    if (!recipientId) throw new Error("Chat sem identificador do contato.");
    const channel = await getMetaChannelForTenant(tenantId, normalizedChannel, { channelId: String(chat.channelId || "").trim() || null,
      externalAccountId: String(chat.channelExternalAccountId || "").trim() || null });
    if (!channel || (chat.channelId && channel.id !== String(chat.channelId).trim()) ||
      (chat.channelExternalAccountId && ![channel.externalAccountId, channel.pageId].includes(String(chat.channelExternalAccountId).trim()))) throw new Error(`Canal ${normalizedChannel} ativo nao configurado para este tenant.`);
    await input.onDeliveryAttempt?.();
    const payload = await sendMetaConversationMedia({ channel, recipientId, mediaUrl, mediaType: input.mediaType });
    metaMessageId = String(payload?.message_id || payload?.messageId || "").trim() || null; metaChannelId = channel.id;
  } else if (normalizedChannel === "whatsapp") {
    const chatChannelId = String(chat.channelId || "").trim() || null;
    const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: shouldAllowAgencyWhatsAppFallback(chatChannelId), channelId: chatChannelId,
      phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null });
    if (!channel) throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
    if (isOfficialWhatsAppProvider(channel.provider) && isWhatsAppServiceWindowClosed(chat.lastClientMessageAt)) throw new Error("Janela de 24h encerrada. Inclua a midia no cabecalho de um template aprovado.");
    const phone = resolveWhatsAppRecipient(chat.contactPhone, channel.provider, normalizePhone);
    if (!phone) throw new Error("Chat sem telefone valido.");
    const provider = getWhatsAppMessagingProvider(channel);
    let providerMediaUrl = mediaUrl;
    if (provider.id === "legacy_gateway") {
      if (input.mediaType === "audio") {
        const reason = "Este gateway legado nao suporta resposta em audio. Nenhum envio foi iniciado.";
        if (input.aiGenerated) throw new AiVoicePreparationError(reason);
        throw new Error(reason);
      }
      if (input.legacyMediaUrl) providerMediaUrl = await input.legacyMediaUrl();
      if (!providerMediaUrl) throw new Error("Gateway legado exige URL do material verificado antes do envio.");
    }
    await input.onDeliveryAttempt?.();
    const payload = await provider.sendMedia({ to: phone, ...(input.deliveryBuffer && provider.id !== "legacy_gateway" ? { buffer: input.deliveryBuffer } : { mediaUrl: providerMediaUrl }),
      mediaType: input.mediaType, caption, filename: input.deliveryBuffer ? String(input.deliveryFilename || filename).trim().slice(0, 180) : input.mediaType === "document" ? filename : undefined,
      contentType: deliveryContentType, voice: input.mediaType === "audio" });
    metaMessageId = payload.externalMessageId; phoneNumberId = channel.phoneNumberId;
  } else if (normalizedChannel !== "site_chat") throw new Error("Tipo de midia invalido para este canal.");
  await persistChatMessageAcknowledgement(persistedMessageId ? adminDb.collection("messages").doc(persistedMessageId) : adminDb.collection("messages").doc(), {
      chatId,
      tenantId,
      text: persistedText,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: input.mediaType,
      ...(input.aiGenerated ? { aiGenerated: true } : {}),
      status: "sent",
      deliveryStatus: "sent",
      deliveryError: "",
      deliveryErrorCode: "",
      deliveryUpdatedAt: FieldValue.serverTimestamp(),
      channel: normalizedChannel,
      ...(metaMessageId ? { metaMessageId } : {}),
      mediaUrl: storedMediaPath || mediaUrl,
      mediaName: filename,
      mediaMimeType: contentType,
      ...(mediaSize ? { mediaSize } : {}),
      ...(caption ? { caption } : {}),
      ...(replyToId ? { replyToId } : {}),
      ...(phoneNumberId ? { channelPhoneNumberId: phoneNumberId } : {}),
      ...(metaChannelId ? { channelId: metaChannelId } : {}),
      ...(persistedMessageId
        ? { updatedAt: FieldValue.serverTimestamp() }
        : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true,
      chatPatch: deliveryChatPatch({ text: persistedText, channel: normalizedChannel, channelId: metaChannelId, phoneNumberId: phoneNumberId,
        assignedTo: String(chat.assignedTo || chat.ownerId || (input.aiGenerated ? "" : input.actor.id)) }),
      pausePatch: deliveryPausePatch({ ...input, tenantId, chatId }) });

  return { metaMessageId, phoneNumberId, persistedText, mediaUrl: storedMediaPath || mediaUrl, messageId: persistedMessageId || null };
}

export async function sendTenantChatTemplate(input: {
  tenantId: string;
  chatId: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerMedia?: WhatsAppTemplateHeaderMedia | null;
  displayText?: string | null;
  aiGenerated?: boolean;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
  messageId?: string | null;
  onDeliveryAttempt?: () => void | Promise<void>;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const templateName = String(input.templateName || "").trim();
  const languageCode = String(input.languageCode || "pt_BR").trim() || "pt_BR";
  const bodyParams = (input.bodyParams || [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 20);
  const headerMedia = normalizeTemplateHeaderMedia(input.headerMedia);

  if (!tenantId || !chatId || !templateName) {
    throw new Error("tenantId, chatId e templateName sao obrigatorios.");
  }

  const chatRef = adminDb.collection("chats").doc(chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) {
    throw new Error("Chat nao encontrado.");
  }

  const chat = chatSnap.data() as {
    tenantId?: string;
    contactPhone?: string;
    channel?: string;
    channelId?: string;
    channelPhoneNumberId?: string;
    assignedTo?: string;
    ownerId?: string;
  };

  if ((chat.tenantId || "") !== tenantId) {
    throw new Error("Chat fora do tenant informado.");
  }

  const normalizedChannel = String(chat.channel || "whatsapp").trim().toLowerCase() || "whatsapp";
  if (normalizedChannel !== "whatsapp") {
    throw new Error("Templates de follow-up estao disponiveis apenas para conversas WhatsApp.");
  }

  const chatChannelId = String(chat.channelId || "").trim() || null;
  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: shouldAllowAgencyWhatsAppFallback(chatChannelId),
    channelId: chatChannelId,
    phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
  });
  if (!channel) {
    throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  }

  if (isWhatsAppGroup(chat.contactPhone)) throw new Error("Templates nao sao usados em grupos do WhatsApp.");
  const phone = resolveWhatsAppRecipient(chat.contactPhone, channel.provider, normalizePhone);
  if (!phone) {
    throw new Error("Chat sem telefone valido.");
  }

  await input.onDeliveryAttempt?.();
  const payload = await getWhatsAppMessagingProvider(channel).sendTemplate({
    to: phone,
    templateName,
    languageCode,
    bodyParams,
    headerMedia,
  });
  const metaMessageId = payload.externalMessageId;
  const text = buildTemplateMessageText(templateName, bodyParams, input.displayText);
  const messageRef = input.messageId ? adminDb.collection("messages").doc(input.messageId) : adminDb.collection("messages").doc();

  await persistChatMessageAcknowledgement(messageRef, {
      chatId,
      tenantId,
      text,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: "template",
      ...(input.aiGenerated ? { aiGenerated: true } : {}),
      status: "sent",
      deliveryStatus: "sent",
      channel: normalizedChannel,
      templateName,
      templateLanguage: languageCode,
      templateParams: bodyParams,
      ...(headerMedia ? { templateHeaderMedia: headerMedia } : {}),
      ...(metaMessageId ? { metaMessageId } : {}),
      channelPhoneNumberId: channel.phoneNumberId,
      ...(input.messageId ? { updatedAt: FieldValue.serverTimestamp() } : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: Boolean(input.messageId),
      chatPatch: deliveryChatPatch({ text: text, channel: normalizedChannel, channelId: null, phoneNumberId: channel.phoneNumberId,
        assignedTo: String(chat.assignedTo || chat.ownerId || (input.aiGenerated ? "" : input.actor.id)) }),
      pausePatch: deliveryPausePatch({ ...input, tenantId, chatId }) });

  return {
    tenantId,
    chatId,
    channel: normalizedChannel,
    metaMessageId,
    phoneNumberId: channel.phoneNumberId,
    templateName,
    languageCode,
    headerMedia,
    persistedText: text,
  };
}
