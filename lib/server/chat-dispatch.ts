import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { getTenantSettings } from "@/lib/server/tenant";
import {
  getWhatsAppChannelForTenant,
  isOfficialWhatsAppProvider,
  sendMetaAudioMessage,
  sendMetaMediaIdMessage,
  sendMetaMediaLinkMessage,
  sendMetaTemplateMessage,
  sendMetaTextMessage,
  type WhatsAppTemplateHeaderMedia,
  uploadWhatsAppMedia,
} from "@/app/lib/server/whatsapp-channel";
import {
  getMetaChannelForTenant,
  isMetaConversationChannelType,
  sendMetaConversationText,
} from "@/app/lib/server/meta-channel";
import { getChatStateDocId } from "@/lib/server/ai/agent";

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

function buildTemplateMessageText(templateName: string, bodyParams: string[]) {
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

export async function sendTenantChatText(input: {
  tenantId: string;
  chatId: string;
  text: string;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const text = String(input.text || "").trim();

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

    if (!channel) {
      throw new Error(`Canal ${normalizedChannel} ativo nao configurado para este tenant.`);
    }

    const payload = await sendMetaConversationText({ channel, recipientId, text });
    metaMessageId = String(payload?.message_id || payload?.messageId || "").trim() || null;
    metaChannelId = channel.id;
  } else if (!isSiteChat) {
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: false,
      channelId: String(chat.channelId || "").trim() || null,
      phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
    });
    if (!channel) {
      throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
    }

    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      throw new Error("Chat sem telefone valido.");
    }

    const serviceWindowClosed =
      isOfficialWhatsAppProvider(channel.provider) &&
      isWhatsAppServiceWindowClosed(chat.lastClientMessageAt);
    if (serviceWindowClosed) {
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

      const templatePayload = await sendMetaTemplateMessage({
        channel,
        to: phone,
        templateName,
        languageCode: templateLanguage,
        bodyParams: templateParams,
      });
      metaMessageId = templatePayload?.messages?.[0]?.id || null;
      outboundType = "template";
      persistedText = buildTemplateMessageText(templateName, templateParams);
    } else {
      const payload = await sendMetaTextMessage({ channel, to: phone, text });
      metaMessageId = payload?.messages?.[0]?.id || null;
    }
    phoneNumberId = channel.phoneNumberId;
  }

  const writes: Promise<unknown>[] = [
    chatRef.set(
      {
        lastMessage: persistedText,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        channel: normalizedChannel,
        ...(metaChannelId ? { channelId: metaChannelId } : {}),
        ...(phoneNumberId ? { channelPhoneNumberId: phoneNumberId } : {}),
        ...buildOutgoingChatOperationalPatch({
          status: "open",
          assignedTo: String(chat.assignedTo || chat.ownerId || input.actor.id),
        }),
      },
      { merge: true }
    ),
    adminDb.collection("messages").add({
      chatId,
      tenantId,
      text: persistedText,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: outboundType,
      status: "sent",
      ...(outboundType === "template" ? { deliveryStatus: "sent" } : {}),
      channel: normalizedChannel,
      ...(metaChannelId ? { channelId: metaChannelId } : {}),
      ...(metaMessageId ? { metaMessageId } : {}),
      ...(templateName ? { templateName } : {}),
      ...(templateLanguage ? { templateLanguage } : {}),
      ...(templateParams.length ? { templateParams } : {}),
      ...(phoneNumberId ? { channelPhoneNumberId: phoneNumberId } : {}),
      createdAt: FieldValue.serverTimestamp(),
    }),
  ];

  if (input.pauseAi) {
    const pauseMinutes = Math.max(1, Math.min(12 * 60, Number(input.pauseMinutes || 30)));
    writes.push(
      adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set(
        {
          tenantId,
          chatId,
          aiEnabled: false,
          pausedUntil: new Date(Date.now() + pauseMinutes * 60 * 1000),
          humanOwnerUserId: input.actor.id,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.actor.id,
          updatedByName: input.actor.name,
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);

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
  };
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
    throw new Error("Envio de midia pelo painel esta disponivel para WhatsApp oficial.");
  }
  if (isWhatsAppServiceWindowClosed(chat.lastClientMessageAt)) {
    throw new Error("Janela de 24h encerrada. Use um template aprovado para retomar o contato.");
  }

  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: false,
    channelId: String(chat.channelId || "").trim() || null,
    phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
  });
  if (!channel) {
    throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  }

  const phone = normalizePhone(chat.contactPhone);
  if (!phone) {
    throw new Error("Chat sem telefone valido.");
  }

  const upload = await uploadWhatsAppMedia({
    channel,
    buffer: input.buffer,
    filename,
    contentType,
  });

  const payload =
    mediaType === "audio"
      ? await sendMetaAudioMessage({ channel, to: phone, mediaId: upload.mediaId })
      : await sendMetaMediaIdMessage({
          channel,
          to: phone,
          mediaId: upload.mediaId,
          mediaType,
          caption,
          filename: mediaType === "document" ? filename : undefined,
        });

  const metaMessageId = payload?.messages?.[0]?.id || null;
  const persistedText = previewForMedia(mediaType, caption, filename);

  const writes: Promise<unknown>[] = [
    chatRef.set(
      {
        lastMessage: persistedText,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        channel: normalizedChannel,
        channelPhoneNumberId: channel.phoneNumberId,
        ...buildOutgoingChatOperationalPatch({
          status: "open",
          assignedTo: String(chat.assignedTo || chat.ownerId || input.actor.id),
        }),
      },
      { merge: true }
    ),
    adminDb.collection("messages").add({
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
      mediaId: upload.mediaId,
      mediaName: filename,
      mediaMimeType: contentType,
      mediaSize: input.buffer.length,
      ...(caption ? { caption } : {}),
      channelPhoneNumberId: channel.phoneNumberId,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ];

  if (input.pauseAi) {
    const pauseMinutes = Math.max(1, Math.min(12 * 60, Number(input.pauseMinutes || 30)));
    writes.push(
      adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set(
        {
          tenantId,
          chatId,
          aiEnabled: false,
          pausedUntil: new Date(Date.now() + pauseMinutes * 60 * 1000),
          humanOwnerUserId: input.actor.id,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.actor.id,
          updatedByName: input.actor.name,
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);

  return {
    tenantId,
    chatId,
    channel: normalizedChannel,
    phoneNumberId: channel.phoneNumberId,
    metaMessageId,
    mediaId: upload.mediaId,
    mediaType,
    persistedText,
  };
}

export async function sendTenantChatMediaLink(input: {
  tenantId: string;
  chatId: string;
  mediaType: Exclude<ChatMediaType, "audio">;
  mediaUrl: string;
  filename?: string;
  contentType?: string;
  caption?: string;
  actor: ChatDispatchActor;
}) {
  const tenantId = String(input.tenantId || "").trim();
  const chatId = String(input.chatId || "").trim();
  const mediaUrl = String(input.mediaUrl || "").trim();
  const filename = String(input.filename || "arquivo").trim().slice(0, 180) || "arquivo";
  const contentType = String(input.contentType || "application/octet-stream").trim().slice(0, 180);
  const caption = String(input.caption || "").trim().slice(0, 1024);

  if (!tenantId || !chatId || !mediaUrl) {
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
    assignedTo?: string;
    ownerId?: string;
    lastClientMessageAt?: unknown;
  };
  if ((chat.tenantId || "") !== tenantId) throw new Error("Chat fora do tenant informado.");

  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: false,
    channelId: String(chat.channelId || "").trim() || null,
    phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
  });
  if (!channel) throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  if (isOfficialWhatsAppProvider(channel.provider) && isWhatsAppServiceWindowClosed(chat.lastClientMessageAt)) {
    throw new Error("Janela de 24h encerrada. Inclua a midia no cabecalho de um template aprovado.");
  }

  const phone = normalizePhone(chat.contactPhone);
  if (!phone) throw new Error("Chat sem telefone valido.");

  const payload = await sendMetaMediaLinkMessage({
    channel,
    to: phone,
    mediaUrl,
    mediaType: input.mediaType,
    caption,
    filename: input.mediaType === "document" ? filename : undefined,
  });
  const metaMessageId = String(
    (payload as { messages?: Array<{ id?: string }>; messageId?: string })?.messages?.[0]?.id ||
      (payload as { messageId?: string })?.messageId ||
      ""
  ).trim() || null;
  const persistedText = previewForMedia(input.mediaType, caption, filename);

  await Promise.all([
    chatRef.set(
      {
        lastMessage: persistedText,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        channel: "whatsapp",
        channelPhoneNumberId: channel.phoneNumberId,
        ...buildOutgoingChatOperationalPatch({
          status: "open",
          assignedTo: String(chat.assignedTo || chat.ownerId || input.actor.id),
        }),
      },
      { merge: true }
    ),
    adminDb.collection("messages").add({
      chatId,
      tenantId,
      text: persistedText,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: input.mediaType,
      status: "sent",
      deliveryStatus: "sent",
      channel: "whatsapp",
      ...(metaMessageId ? { metaMessageId } : {}),
      mediaUrl,
      mediaName: filename,
      mediaMimeType: contentType,
      ...(caption ? { caption } : {}),
      channelPhoneNumberId: channel.phoneNumberId,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return { metaMessageId, persistedText, mediaUrl };
}

export async function sendTenantChatTemplate(input: {
  tenantId: string;
  chatId: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
  headerMedia?: WhatsAppTemplateHeaderMedia | null;
  actor: ChatDispatchActor;
  pauseAi?: boolean;
  pauseMinutes?: number;
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

  const channel = await getWhatsAppChannelForTenant(tenantId, {
    allowAgencyFallback: false,
    channelId: String(chat.channelId || "").trim() || null,
    phoneNumberId: String(chat.channelPhoneNumberId || "").trim() || null,
  });
  if (!channel) {
    throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
  }

  const phone = normalizePhone(chat.contactPhone);
  if (!phone) {
    throw new Error("Chat sem telefone valido.");
  }

  const payload = await sendMetaTemplateMessage({
    channel,
    to: phone,
    templateName,
    languageCode,
    bodyParams,
    headerMedia,
  });
  const metaMessageId = payload?.messages?.[0]?.id || null;
  const text = buildTemplateMessageText(templateName, bodyParams);

  const writes: Promise<unknown>[] = [
    chatRef.set(
      {
        lastMessage: text,
        lastMessageTime: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        channel: normalizedChannel,
        channelPhoneNumberId: channel.phoneNumberId,
        ...buildOutgoingChatOperationalPatch({
          status: "open",
          assignedTo: String(chat.assignedTo || chat.ownerId || input.actor.id),
        }),
      },
      { merge: true }
    ),
    adminDb.collection("messages").add({
      chatId,
      tenantId,
      text,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: "template",
      status: "sent",
      deliveryStatus: "sent",
      channel: normalizedChannel,
      templateName,
      templateLanguage: languageCode,
      templateParams: bodyParams,
      ...(headerMedia ? { templateHeaderMedia: headerMedia } : {}),
      ...(metaMessageId ? { metaMessageId } : {}),
      channelPhoneNumberId: channel.phoneNumberId,
      createdAt: FieldValue.serverTimestamp(),
    }),
  ];

  if (input.pauseAi) {
    const pauseMinutes = Math.max(1, Math.min(12 * 60, Number(input.pauseMinutes || 30)));
    writes.push(
      adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set(
        {
          tenantId,
          chatId,
          aiEnabled: false,
          pausedUntil: new Date(Date.now() + pauseMinutes * 60 * 1000),
          humanOwnerUserId: input.actor.id,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: input.actor.id,
          updatedByName: input.actor.name,
        },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);

  return {
    tenantId,
    chatId,
    channel: normalizedChannel,
    metaMessageId,
    phoneNumberId: channel.phoneNumberId,
    templateName,
    languageCode,
    headerMedia,
  };
}
