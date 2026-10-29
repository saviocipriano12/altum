import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

function clean(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 220);
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().getTime();
  }
  return Number.MAX_SAFE_INTEGER;
}

export function whatsappChatIdentityId(input: { tenantId: string; channelId: string; phone: string }) {
  if (/@g\.us$/i.test(input.phone)) return "whatsapp_group_" + createHash("sha256").update(JSON.stringify([input.tenantId, input.channelId, input.phone.toLowerCase()])).digest("hex");
  return safeId(`whatsapp_${clean(input.tenantId)}_${clean(input.channelId)}_${clean(input.phone, 40)}`);
}

export async function resolveCanonicalWhatsAppChat(input: {
  tenantId: string;
  channelId: string;
  phone: string;
  createData: Record<string, unknown>;
  requireExactChannel?: boolean;
}) {
  const identityId = whatsappChatIdentityId(input);
  const identityRef = adminDb.collection("chat_identities").doc(identityId);
  const chatsRef = adminDb.collection("chats");
  const candidates = await chatsRef
    .where("contactPhone", "==", input.phone)
    .where("tenantId", "==", input.tenantId)
    .limit(20)
    .get();
  const exact = candidates.docs.filter((document) => clean(document.data().channelId) === input.channelId);
  const legacy = !input.requireExactChannel && exact.length === 0 && candidates.docs.length === 1 && !clean(candidates.docs[0]?.data().channelId)
    ? [candidates.docs[0]]
    : [];
  const matching = [...exact, ...legacy]
    .sort((left, right) => toMillis(left.data().createdAt) - toMillis(right.data().createdAt));

  const result = await adminDb.runTransaction(async (transaction) => {
    const identitySnapshot = await transaction.get(identityRef);
    const mappedChatId = clean(identitySnapshot.data()?.chatId);
    if (mappedChatId) {
      const mappedRef = chatsRef.doc(mappedChatId);
      const mappedSnapshot = await transaction.get(mappedRef);
      if (mappedSnapshot.exists) {
        const mapped = mappedSnapshot.data() || {};
        if (clean(mapped.tenantId) !== input.tenantId || clean(mapped.contactPhone, 40) !== input.phone
          || (clean(mapped.channelId) !== input.channelId && (input.requireExactChannel || clean(mapped.channelId)))) {
          throw new Error("Identidade WhatsApp aponta para outra empresa, canal ou contato.");
        }
        return { chatRef: mappedRef, created: false };
      }
    }

    const legacyCandidate = matching[0] as QueryDocumentSnapshot | undefined;
    const chatRef: DocumentReference = legacyCandidate?.ref || chatsRef.doc(identityId);
    const chatSnapshot = await transaction.get(chatRef);
    const created = !chatSnapshot.exists;
    if (!created) {
      const existing = chatSnapshot.data() || {};
      if (clean(existing.tenantId) !== input.tenantId || clean(existing.contactPhone, 40) !== input.phone
        || (clean(existing.channelId) !== input.channelId && (input.requireExactChannel || clean(existing.channelId)))) {
        throw new Error("Conversa WhatsApp fora do escopo solicitado.");
      }
    }
    if (created) transaction.set(chatRef, input.createData);

    transaction.set(identityRef, {
      tenantId: input.tenantId,
      channel: "whatsapp",
      channelId: input.channelId,
      contactPhone: input.phone,
      chatId: chatRef.id,
      createdAt: identitySnapshot.exists ? identitySnapshot.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { chatRef, created };
  });

  return {
    ...result,
    duplicateRefs: matching.filter((document) => document.id !== result.chatRef.id).map((document) => document.ref),
  };
}
