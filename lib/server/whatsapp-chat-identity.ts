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
  return safeId(`whatsapp_${clean(input.tenantId)}_${clean(input.channelId)}_${clean(input.phone, 40)}`);
}

export async function resolveCanonicalWhatsAppChat(input: {
  tenantId: string;
  channelId: string;
  phone: string;
  createData: Record<string, unknown>;
}) {
  const identityId = whatsappChatIdentityId(input);
  const identityRef = adminDb.collection("chat_identities").doc(identityId);
  const chatsRef = adminDb.collection("chats");
  const candidates = await chatsRef
    .where("contactPhone", "==", input.phone)
    .where("tenantId", "==", input.tenantId)
    .limit(20)
    .get();
  const matching = candidates.docs
    .filter((document) => clean(document.data().channelId) === input.channelId)
    .sort((left, right) => toMillis(left.data().createdAt) - toMillis(right.data().createdAt));

  const result = await adminDb.runTransaction(async (transaction) => {
    const identitySnapshot = await transaction.get(identityRef);
    const mappedChatId = clean(identitySnapshot.data()?.chatId);
    if (mappedChatId) {
      const mappedRef = chatsRef.doc(mappedChatId);
      const mappedSnapshot = await transaction.get(mappedRef);
      if (mappedSnapshot.exists) {
        return { chatRef: mappedRef, created: false };
      }
    }

    const legacyCandidate = matching[0] as QueryDocumentSnapshot | undefined;
    const chatRef: DocumentReference = legacyCandidate?.ref || chatsRef.doc(identityId);
    const chatSnapshot = legacyCandidate || await transaction.get(chatRef);
    const created = !chatSnapshot.exists;
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
