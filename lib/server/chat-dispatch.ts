import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { buildOutgoingChatOperationalPatch } from "@/lib/server/chat-operations";
import { getWhatsAppChannelForTenant, sendMetaTextMessage } from "@/app/lib/server/whatsapp-channel";
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
    channel?: string;
    channelId?: string;
    channelExternalAccountId?: string;
    contactExternalId?: string;
    assignedTo?: string;
    ownerId?: string;
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
    const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: false });
    if (!channel) {
      throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
    }

    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      throw new Error("Chat sem telefone valido.");
    }

    const payload = await sendMetaTextMessage({ channel, to: phone, text });
    metaMessageId = payload?.messages?.[0]?.id || null;
    phoneNumberId = channel.phoneNumberId;
  }

  const writes: Promise<unknown>[] = [
    chatRef.set(
      {
        lastMessage: text,
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
      text,
      sender: "agent",
      senderId: input.actor.id,
      senderName: input.actor.name,
      type: "text",
      status: "sent",
      channel: normalizedChannel,
      ...(metaChannelId ? { channelId: metaChannelId } : {}),
      ...(metaMessageId ? { metaMessageId } : {}),
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
  };
}
