import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";
import { getWhatsAppChannelForTenant, sendMetaTextMessage } from "@/app/lib/server/whatsapp-channel";

type Body = {
  text?: string;
};

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    await assertTenantAccess(user.uid, tenantId);

    const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: false });
    if (!channel) {
      return NextResponse.json(
        { error: "Canal WhatsApp ativo nao configurado para este tenant." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Body;
    const text = (body.text || "").trim();
    if (!text) {
      return NextResponse.json({ error: "Campo obrigatorio: text." }, { status: 400 });
    }

    const chatRef = adminDb.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const chat = chatSnap.data() as {
      tenantId?: string;
      contactPhone?: string;
    };

    if ((chat.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      return NextResponse.json({ error: "Chat sem telefone valido." }, { status: 400 });
    }

    const payload = await sendMetaTextMessage({ channel, to: phone, text });

    await Promise.all([
      chatRef.set(
        {
          lastMessage: text,
          lastMessageTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          status: "open",
          channelPhoneNumberId: channel.phoneNumberId,
        },
        { merge: true }
      ),
      adminDb.collection("messages").add({
        chatId,
        tenantId,
        text,
        sender: "agent",
        senderId: user.uid,
        senderName: user.name,
        type: "text",
        status: "sent",
        channelPhoneNumberId: channel.phoneNumberId,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      phoneNumberId: channel.phoneNumberId,
      metaMessageId: payload?.messages?.[0]?.id || null,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao enviar mensagem manual do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar mensagem." },
      { status: 500 }
    );
  }
}
