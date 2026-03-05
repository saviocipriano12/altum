import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

const META_TOKEN = process.env.META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_ID;
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

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

    if (!META_TOKEN || !PHONE_NUMBER_ID) {
      return NextResponse.json(
        { error: "Configuracao Meta WhatsApp ausente no servidor." },
        { status: 500 }
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
      contactName?: string;
      ownerId?: string;
      assignedTo?: string;
    };

    if ((chat.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      return NextResponse.json({ error: "Chat sem telefone valido." }, { status: 400 });
    }

    const response = await fetch(
      `https://graph.facebook.com/${VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${META_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error?.message || "Erro na API da Meta." },
        { status: 400 }
      );
    }

    await Promise.all([
      chatRef.set(
        {
          lastMessage: text,
          lastMessageTime: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          status: "open",
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
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
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
    return NextResponse.json({ error: "Falha ao enviar mensagem." }, { status: 500 });
  }
}
