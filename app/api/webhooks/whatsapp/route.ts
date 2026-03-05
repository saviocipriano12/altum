import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {
  extractWebhookPhoneNumberId,
  getWhatsAppChannelByPhoneNumberId,
  getWhatsAppChannelByVerifyToken,
  verifyMetaSignature,
} from "@/app/lib/server/whatsapp-channel";
import { normalizePhone } from "@/app/lib/server/phone";

async function resolveLeadOwner(phone: string, tenantId: string) {
  const scopedSnap = await adminDb
    .collection("leads")
    .where("telefone", "==", phone)
    .where("tenantId", "==", tenantId)
    .limit(1)
    .get();

  if (!scopedSnap.empty) {
    const leadDoc = scopedSnap.docs[0];
    const leadData = leadDoc.data() as { ownerId?: string; tenantId?: string };
    return {
      ownerId: leadData.ownerId || null,
      leadId: leadDoc.id,
      tenantId: leadData.tenantId || tenantId,
    };
  }

  if (tenantId === "ALTUM_AGENCY") {
    const legacySnap = await adminDb
      .collection("leads")
      .where("telefone", "==", phone)
      .limit(1)
      .get();

    if (!legacySnap.empty) {
      const leadDoc = legacySnap.docs[0];
      const leadData = leadDoc.data() as { ownerId?: string; tenantId?: string };
      return {
        ownerId: leadData.ownerId || null,
        leadId: leadDoc.id,
        tenantId: leadData.tenantId || tenantId,
      };
    }
  }

  return {
    ownerId: null as string | null,
    leadId: null as string | null,
    tenantId,
  };
}

async function resolveOwnerName(ownerId: string | null) {
  if (!ownerId) return null;
  const userSnap = await adminDb.collection("users").doc(ownerId).get();
  if (!userSnap.exists) return null;
  const userData = userSnap.data() as { name?: string };
  return userData.name || null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new Response("Forbidden", { status: 403 });
  }

  const channel = await getWhatsAppChannelByVerifyToken(token);
  if (!channel) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(challenge, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const phoneNumberId = extractWebhookPhoneNumberId(body);
    if (!phoneNumberId) {
      return NextResponse.json({ status: "ignored_no_phone_number_id" });
    }

    const channel = await getWhatsAppChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      return NextResponse.json({ status: "ignored_unknown_channel" });
    }

    if (!verifyMetaSignature(rawBody, signature, channel.appSecret)) {
      return NextResponse.json({ error: "Assinatura invalida." }, { status: 401 });
    }

    const message =
      (body.entry as Array<Record<string, unknown>> | undefined)?.[0]?.changes &&
      Array.isArray((body.entry as Array<Record<string, unknown>> | undefined)?.[0]?.changes)
        ? (((body.entry as Array<Record<string, unknown>>)[0].changes as Array<Record<string, unknown>>)[0]
            ?.value as Record<string, unknown> | undefined)?.messages?.[0]
        : undefined;

    if (!message || typeof message !== "object") {
      return NextResponse.json({ status: "ignored_no_message" });
    }

    const valueObj =
      (body.entry as Array<Record<string, unknown>> | undefined)?.[0]?.changes &&
      Array.isArray((body.entry as Array<Record<string, unknown>> | undefined)?.[0]?.changes)
        ? (((body.entry as Array<Record<string, unknown>>)[0].changes as Array<Record<string, unknown>>)[0]
            ?.value as Record<string, unknown> | undefined)
        : undefined;

    const from = normalizePhone(String((message as { from?: unknown }).from || ""));
    const text = String((message as { text?: { body?: unknown } }).text?.body || "").trim();
    const contactName =
      String(
        (valueObj as { contacts?: Array<{ profile?: { name?: unknown } }> } | undefined)?.contacts?.[0]
          ?.profile?.name || ""
      ) ||
      from ||
      "Contato";

    if (!from) {
      return NextResponse.json({ status: "ignored_invalid_phone" });
    }

    const ownerFromLead = await resolveLeadOwner(from, channel.tenantId);
    const ownerName = await resolveOwnerName(ownerFromLead.ownerId);

    const chatsRef = adminDb.collection("chats");
    const chatQuery = await chatsRef
      .where("contactPhone", "==", from)
      .where("tenantId", "==", channel.tenantId)
      .limit(1)
      .get();

    let chatId: string;
    let currentOwnerId = ownerFromLead.ownerId;
    const tenantId = channel.tenantId;

    if (chatQuery.empty) {
      const newChat = await chatsRef.add({
        contactName,
        contactPhone: from,
        contactPhoneNormalized: from,
        lastMessage: text,
        lastMessageTime: FieldValue.serverTimestamp(),
        status: "open",
        ownerId: ownerFromLead.ownerId,
        ownerName,
        leadId: ownerFromLead.leadId,
        tenantId,
        channelPhoneNumberId: channel.phoneNumberId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      chatId = newChat.id;
    } else {
      const chatDoc = chatQuery.docs[0];
      const chatData = chatDoc.data() as {
        ownerId?: string;
        leadId?: string;
        assignedTo?: string;
        tenantId?: string;
      };
      chatId = chatDoc.id;
      currentOwnerId = chatData.ownerId || chatData.assignedTo || ownerFromLead.ownerId;

      await chatDoc.ref.set(
        {
          contactName,
          lastMessage: text,
          lastMessageTime: FieldValue.serverTimestamp(),
          status: "open",
          updatedAt: FieldValue.serverTimestamp(),
          ownerId: currentOwnerId,
          ownerName: currentOwnerId ? await resolveOwnerName(currentOwnerId) : null,
          leadId: chatData.leadId || ownerFromLead.leadId,
          tenantId,
          channelPhoneNumberId: channel.phoneNumberId,
        },
        { merge: true }
      );
    }

    await adminDb.collection("messages").add({
      chatId,
      text,
      sender: "client",
      type: "text",
      ownerId: currentOwnerId,
      tenantId,
      channelPhoneNumberId: channel.phoneNumberId,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      status: "ok",
      chatId,
      tenantId,
      phoneNumberId: channel.phoneNumberId,
    });
  } catch (error) {
    console.error("Erro no webhook WhatsApp:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
