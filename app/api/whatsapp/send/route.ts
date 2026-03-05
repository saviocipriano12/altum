import { NextResponse } from "next/server";
import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isAdmin, requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { normalizePhone } from "@/app/lib/server/phone";
import { getTenantForCurrentUser } from "@/lib/server/tenant";

const META_TOKEN = process.env.META_WA_TOKEN || process.env.NEXT_PUBLIC_META_WA_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_ID || process.env.NEXT_PUBLIC_META_PHONE_ID;
const VERSION = process.env.META_GRAPH_VERSION || "v21.0";

type Body = {
  chatId?: string;
  text?: string;
  to?: string;
  leadId?: string;
  tenantId?: string;
};

async function resolveDestination(
  user: Awaited<ReturnType<typeof requireRequestUser>>,
  body: Body
) {
  const text = (body.text || "").trim();
  if (!text) {
    throw new RouteAuthError(400, "invalid_payload", "Campo obrigatorio: text.");
  }

  if (body.chatId) {
    const chatRef = adminDb.collection("chats").doc(body.chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      throw new RouteAuthError(404, "chat_not_found", "Chat nao encontrado.");
    }

    const chat = chatSnap.data() as {
      contactPhone?: string;
      ownerId?: string;
      assignedTo?: string;
      contactName?: string;
      tenantId?: string;
    };

    const ownerId = chat.ownerId || chat.assignedTo || null;
    if (!isAdmin(user) && ownerId && ownerId !== user.uid) {
      throw new RouteAuthError(403, "forbidden_chat", "Voce nao tem permissao para enviar neste chat.");
    }

    const phone = normalizePhone(chat.contactPhone);
    if (!phone) {
      throw new RouteAuthError(400, "chat_without_phone", "Chat sem telefone valido.");
    }

    let tenantId = chat.tenantId || (body.tenantId || "").trim() || null;
    if (!tenantId) {
      tenantId = (await getTenantForCurrentUser(ownerId || user.uid)) || null;
    }

    return {
      phone,
      text,
      chatId: body.chatId,
      chatRef,
      ownerId: ownerId || user.uid,
      contactName: chat.contactName || phone,
      tenantId,
    };
  }

  let phone = normalizePhone(body.to);
  let chatId: string | null = null;
  let chatRef: DocumentReference | null = null;
  let ownerId = user.uid;
  let contactName = phone || "Contato";
  let tenantId = (body.tenantId || "").trim() || null;

  if (body.leadId) {
    const leadRef = adminDb.collection("leads").doc(body.leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      throw new RouteAuthError(404, "lead_not_found", "Lead nao encontrado.");
    }

    const lead = leadSnap.data() as {
      telefone?: string;
      nome?: string;
      ownerId?: string;
      tenantId?: string;
    };

    ownerId = lead.ownerId || user.uid;
    if (!isAdmin(user) && ownerId !== user.uid) {
      throw new RouteAuthError(403, "forbidden_lead", "Voce nao tem permissao neste lead.");
    }

    phone = phone || normalizePhone(lead.telefone);
    contactName = lead.nome || contactName;
    tenantId = lead.tenantId || tenantId;
  }

  if (!tenantId) {
    tenantId = (await getTenantForCurrentUser(ownerId || user.uid)) || null;
  }

  if (!phone) {
    throw new RouteAuthError(400, "invalid_phone", "Telefone nao informado.");
  }

  const chatQuery = tenantId
    ? await adminDb
        .collection("chats")
        .where("contactPhone", "==", phone)
        .where("tenantId", "==", tenantId)
        .limit(1)
        .get()
    : await adminDb
        .collection("chats")
        .where("contactPhone", "==", phone)
        .limit(1)
        .get();

  if (!chatQuery.empty) {
    const found = chatQuery.docs[0];
    const foundData = found.data() as { ownerId?: string; assignedTo?: string; tenantId?: string };
    const foundOwner = foundData.ownerId || foundData.assignedTo || null;

    if (!isAdmin(user) && foundOwner && foundOwner !== user.uid) {
      throw new RouteAuthError(403, "forbidden_chat", "Chat pertence a outro usuario.");
    }

    chatId = found.id;
    chatRef = found.ref;
    ownerId = foundOwner || ownerId;
    tenantId = foundData.tenantId || tenantId;
  } else {
    const created = await adminDb.collection("chats").add({
      contactName,
      contactPhone: phone,
      contactPhoneNormalized: phone,
      status: "open",
      ownerId,
      ownerName: user.name,
      tenantId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageTime: FieldValue.serverTimestamp(),
      lastMessage: "",
    });
    chatId = created.id;
    chatRef = created;
  }

  return { phone, text, chatId, chatRef, ownerId, contactName, tenantId };
}

export async function POST(req: Request) {
  try {
    const user = await requireRequestUser(req);

    if (!META_TOKEN || !PHONE_NUMBER_ID) {
      return NextResponse.json(
        { error: "Configuracao da Meta nao encontrada no servidor." },
        { status: 500 }
      );
    }

    const body = (await req.json()) as Body;
    const destination = await resolveDestination(user, body);

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
          to: destination.phone,
          type: "text",
          text: { body: destination.text },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || "Erro na API da Meta." },
        { status: 400 }
      );
    }

    if (destination.chatId && destination.chatRef) {
      await Promise.all([
        destination.chatRef.update({
          ownerId: destination.ownerId,
          ownerName: user.name,
          tenantId: destination.tenantId,
          lastMessage: destination.text,
          lastMessageTime: FieldValue.serverTimestamp(),
          status: "open",
          updatedAt: FieldValue.serverTimestamp(),
        }),
        adminDb.collection("messages").add({
          chatId: destination.chatId,
          text: destination.text,
          sender: "agent",
          senderId: user.uid,
          type: "text",
          status: "sent",
          tenantId: destination.tenantId,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ]);
    }

    return NextResponse.json({
      success: true,
      data,
      chatId: destination.chatId,
      tenantId: destination.tenantId,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    console.error("Erro interno no envio WhatsApp:", error);
    return NextResponse.json(
      { error: "Erro interno no envio WhatsApp." },
      { status: 500 }
    );
  }
}
