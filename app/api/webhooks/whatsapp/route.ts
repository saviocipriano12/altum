import crypto from "crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;

function verifyMetaSignature(rawBody: string, signatureHeader: string | null) {
  if (!META_APP_SECRET) return true;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const signature = signatureHeader.slice(7);
  const expected = crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

async function resolveLeadOwner(phone: string) {
  const leadSnap = await adminDb
    .collection("leads")
    .where("telefone", "==", phone)
    .limit(1)
    .get();

  if (leadSnap.empty) {
    return {
      ownerId: null as string | null,
      leadId: null as string | null,
      tenantId: null as string | null,
    };
  }

  const leadDoc = leadSnap.docs[0];
  const leadData = leadDoc.data() as { ownerId?: string; tenantId?: string };
  return {
    ownerId: leadData.ownerId || null,
    leadId: leadDoc.id,
    tenantId: leadData.tenantId || null,
  };
}

async function resolveOwnerName(ownerId: string | null) {
  if (!ownerId) return null;
  const userSnap = await adminDb.collection("users").doc(ownerId).get();
  if (!userSnap.exists) return null;
  const userData = userSnap.data() as { name?: string };
  return userData.name || null;
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-hub-signature-256");

    if (!verifyMetaSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Assinatura invalida." }, { status: 401 });
    }

    const body = JSON.parse(rawBody);
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ status: "ignored" });
    }

    const from = normalizePhone(message.from);
    const text = (message.text?.body || "").trim();
    const contactName =
      body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || from || "Contato";

    if (!from) {
      return NextResponse.json({ status: "ignored" });
    }

    const ownerFromLead = await resolveLeadOwner(from);
    const ownerName = await resolveOwnerName(ownerFromLead.ownerId);

    const chatsRef = adminDb.collection("chats");
    const chatQuery = ownerFromLead.tenantId
      ? await chatsRef
          .where("contactPhone", "==", from)
          .where("tenantId", "==", ownerFromLead.tenantId)
          .limit(1)
          .get()
      : await chatsRef.where("contactPhone", "==", from).limit(1).get();

    let chatId: string;
    let currentOwnerId = ownerFromLead.ownerId;
    let tenantId = ownerFromLead.tenantId;

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
      tenantId = chatData.tenantId || ownerFromLead.tenantId;

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
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ status: "ok", chatId });
  } catch (error) {
    console.error("Erro no webhook WhatsApp:", error);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
