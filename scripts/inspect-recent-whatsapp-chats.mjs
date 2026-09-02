import crypto from "node:crypto";
import nextEnv from "@next/env";
import { cert, deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

nextEnv.loadEnvConfig(process.cwd());

const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawCredential) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY nao encontrada em .env.local.");
}

const tenantId = process.argv[2];
if (!tenantId) {
  throw new Error("Uso: node scripts/inspect-recent-whatsapp-chats.mjs <tenantId>");
}

function asDate(value) {
  if (value && typeof value.toDate === "function") return value.toDate();
  const date = new Date(value || 0);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function identity(value) {
  const text = String(value || "");
  if (!text) return "empty";
  const digest = crypto.createHash("sha256").update(text).digest("hex").slice(0, 10);
  return `len:${text.length} last4:${text.slice(-4)} sha:${digest}`;
}

const app = initializeApp(
  { credential: cert(JSON.parse(rawCredential)) },
  `inspect-whatsapp-${Date.now()}`
);

try {
  const db = getFirestore(app);
  const chatSnapshot = await db.collection("chats").where("tenantId", "==", tenantId).limit(500).get();
  const chats = chatSnapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((chat) => String(chat.channel || "").toLowerCase() === "whatsapp")
    .sort((left, right) => asDate(right.lastMessageTime || right.updatedAt) - asDate(left.lastMessageTime || left.updatedAt))
    .slice(0, 25);

  console.log(`RECENT_WHATSAPP_CHATS count=${chats.length}`);
  for (const chat of chats) {
    const messages = await db.collection("messages").where("chatId", "==", chat.id).limit(100).get();
    const media = messages.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .filter((message) => ["image", "video", "audio", "document"].includes(String(message.type || "").toLowerCase()));
    console.log(JSON.stringify({
      chatId: chat.id,
      contactPhone: identity(chat.contactPhone),
      contactPhoneNormalized: identity(chat.contactPhoneNormalized),
      hasContactPhone: Object.hasOwn(chat, "contactPhone"),
      hasContactPhoneNormalized: Object.hasOwn(chat, "contactPhoneNormalized"),
      contactName: String(chat.contactName || "").slice(0, 60),
      channelId: String(chat.channelId || ""),
      leadId: String(chat.leadId || ""),
      lastMessage: String(chat.lastMessage || "").slice(0, 80),
      lastMessageAt: asDate(chat.lastMessageTime || chat.updatedAt).toISOString(),
      createdAt: asDate(chat.createdAt).toISOString(),
      messageCount: messages.size,
      media: media.map((message) => ({
        id: message.id,
        type: String(message.type || ""),
        mime: String(message.mediaMimeType || ""),
        hasMediaUrl: Boolean(message.mediaUrl),
        hasMediaId: Boolean(message.mediaId),
        processingError: String(message.mediaProcessingError || "").slice(0, 240),
      })),
    }));
  }
} finally {
  await deleteApp(app);
}
