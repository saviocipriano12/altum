import { isWhatsAppGroup } from "@/lib/whatsapp-conversation";
import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { getWhatsAppChannelForTenant } from "@/app/lib/server/whatsapp-channel";
import { getWhatsAppMessagingProvider } from "@/lib/server/messaging/registry";
import { getChatStateDocId } from "@/lib/server/ai/agent";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess, assertLeadCommercialAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";

type Body = {
  text?: string;
  chatId?: string;
  to?: string;
  leadId?: string;
  channelId?: string;
};

type Destination = {
  phone: string;
  text: string;
  tenantId: string;
  chatId: string | null;
  chatRef: DocumentReference | null;
  ownerId: string | null;
  contactName: string;
  leadId: string | null;
  isNew: boolean;
};

async function resolveDestination(input: {
  tenantId: string;
  user: { uid: string; name: string };
  body: Body;
  channelId: string;
}): Promise<Destination> {
  const text = (input.body.text || "").trim();
  if (!text) {
    throw new RouteAuthError(400, "invalid_payload", "Campo obrigatorio: text.");
  }

  if (input.body.chatId) {
    const chatRef = adminDb.collection("chats").doc(input.body.chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      throw new RouteAuthError(404, "chat_not_found", "Chat nao encontrado.");
    }

    const chat = chatSnap.data() as {
      tenantId?: string;
      contactPhone?: string;
      contactName?: string;
      ownerId?: string;
      assignedTo?: string;
    };

    if ((chat.tenantId || "") !== input.tenantId) {
      throw new RouteAuthError(403, "forbidden_tenant", "Chat fora do tenant informado.");
    }

    if (isWhatsAppGroup(chat.contactPhone)) throw new RouteAuthError(400, "group_requires_chat_dispatch", "Envie pela conversa do grupo para preservar o canal e destinatario.");
    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      throw new RouteAuthError(400, "invalid_phone", "Chat sem telefone valido.");
    }

    return {
      phone,
      text,
      tenantId: input.tenantId,
      chatId: input.body.chatId,
      chatRef,
      ownerId: chat.ownerId || chat.assignedTo || input.user.uid,
      contactName: chat.contactName || phone,
      leadId: input.body.leadId || null,
      isNew: false,
    };
  }

  let phone = normalizePhone(input.body.to);
  let ownerId: string | null = input.user.uid;
  let contactName = phone || "Contato";

  if (input.body.leadId) {
    const leadRef = adminDb.collection("leads").doc(input.body.leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
    }

    const lead = leadSnap.data() as {
      tenantId?: string;
      telefone?: string;
      nome?: string;
      ownerId?: string;
    };

    if ((lead.tenantId || "") !== input.tenantId) {
      throw new RouteAuthError(403, "forbidden_tenant", "Lead fora do tenant informado.");
    }

    phone = phone || normalizePhone(lead.telefone);
    contactName = lead.nome || contactName;
    ownerId = lead.ownerId || ownerId;
  }

  if (!phone) {
    throw new RouteAuthError(400, "invalid_phone", "Telefone nao informado.");
  }

  const existingChat = await adminDb
    .collection("chats")
    .where("contactPhone", "==", phone)
    .where("tenantId", "==", input.tenantId)
    .limit(20)
    .get();

  const matchingChat = existingChat.docs.find((doc) => {
    const data = doc.data() as { channelId?: string };
    return String(data.channelId || "") === input.channelId;
  });
  if (matchingChat) {
    const found = matchingChat;
    return {
      phone,
      text,
      tenantId: input.tenantId,
      chatId: found.id,
      chatRef: found.ref,
      ownerId,
      contactName,
      leadId: input.body.leadId || null,
      isNew: false,
    };
  }

  const created = await adminDb.collection("chats").add({
    tenantId: input.tenantId,
    contactName,
    contactPhone: phone,
    contactPhoneNormalized: phone,
    status: "open",
    ownerId,
    ownerName: input.user.name,
    channel: "whatsapp",
    channelId: input.channelId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
    ...(input.body.leadId ? { leadId: input.body.leadId } : {}),
  });

  return {
    phone,
    text,
    tenantId: input.tenantId,
    chatId: created.id,
    chatRef: created,
    ownerId,
    contactName,
    leadId: input.body.leadId || null,
    isNew: true,
  };
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "respond_inbox");

    const body = (await req.json()) as Body;
    if (body.chatId) {
      await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId: body.chatId });
    } else if (body.leadId) {
      await assertLeadCommercialAccess({ membership, userId: user.uid, tenantId, leadId: body.leadId });
    }
    const channel = await getWhatsAppChannelForTenant(tenantId, {
      allowAgencyFallback: false,
      channelId: body.channelId || null,
    });
    if (!channel) {
      return NextResponse.json(
        { error: "Canal WhatsApp ativo nao configurado para este tenant." },
        { status: 400 }
      );
    }
    if (
      channel.channelScope === "personal" &&
      channel.ownerUserId !== user.uid &&
      !hasTeamWideCommercialAccess(membership)
    ) {
      return NextResponse.json(
        { error: "Este WhatsApp pessoal pertence a outro vendedor." },
        { status: 403 }
      );
    }
    const destination = await resolveDestination({
      tenantId,
      user: { uid: user.uid, name: user.name },
      body,
      channelId: channel.id,
    });

    const provider = getWhatsAppMessagingProvider(channel);
    if (destination.isNew && provider.id === "meta_cloud" && destination.chatRef && destination.chatId) {
      await destination.chatRef.set(
        {
          tenantId,
          leadId: destination.leadId,
          contactName: destination.contactName,
          contactPhone: destination.phone,
          contactPhoneNormalized: destination.phone,
          channel: "whatsapp",
          channelId: channel.id,
          channelPhoneNumberId: channel.phoneNumberId,
          status: "open",
          ownerId: destination.ownerId,
          ownerName: user.name,
          requiresTemplate: true,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastMessageTime: FieldValue.serverTimestamp(),
          lastMessage: "Conversa pronta para iniciar com template aprovado.",
        },
        { merge: true }
      );
      return NextResponse.json({
        ok: true,
        tenantId,
        chatId: destination.chatId,
        phoneNumberId: channel.phoneNumberId,
        requiresTemplate: true,
        message: "A API oficial exige um template aprovado para iniciar esta conversa.",
      });
    }

    const data = await provider.sendText({
      to: destination.phone,
      text: destination.text,
    });

    if (destination.chatRef && destination.chatId) {
      await Promise.all([
        destination.chatRef.set(
          {
            tenantId,
            ownerId: destination.ownerId,
            ownerName: user.name,
            channelPhoneNumberId: channel.phoneNumberId,
            channelId: channel.id,
            lastMessage: destination.text,
            lastMessageTime: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            status: "open",
            requiresTemplate: false,
            ...(destination.leadId ? { leadId: destination.leadId } : {}),
          },
          { merge: true }
        ),
        adminDb.collection("messages").add({
          chatId: destination.chatId,
          tenantId,
          text: destination.text,
          sender: "agent",
          senderId: user.uid,
          senderName: user.name,
          status: "sent",
          deliveryStatus: "sent",
          type: "text",
          ...(data.externalMessageId ? { metaMessageId: data.externalMessageId } : {}),
          channelPhoneNumberId: channel.phoneNumberId,
          channelId: channel.id,
          createdAt: FieldValue.serverTimestamp(),
        }),
        adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, destination.chatId)).set(
          {
            tenantId,
            chatId: destination.chatId,
            aiEnabled: false,
            pausedUntil: new Date(Date.now() + 30 * 60 * 1000),
            humanOwnerUserId: user.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: user.uid,
            updatedByName: user.name,
          },
          { merge: true }
        ),
      ]);
    }

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId: destination.chatId,
      phoneNumberId: channel.phoneNumberId,
      metaMessageId: data.externalMessageId,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }

    console.error("Erro em /api/tenant/[tenantId]/whatsapp/send:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar WhatsApp." },
      { status: 500 }
    );
  }
}
