import { createHash } from "node:crypto";
import { FieldValue, type DocumentReference, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

type SocialChannel = "instagram" | "messenger";

function clean(value: unknown, max = 220) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().getTime();
  return Number.MAX_SAFE_INTEGER;
}

export function socialChatIdentityId(input: { tenantId: string; channel: SocialChannel; channelId: string; externalProfileId: string }) {
  return `social_chat_${createHash("sha256").update(JSON.stringify([
    clean(input.tenantId, 180), input.channel, clean(input.channelId), clean(input.externalProfileId, 320),
  ])).digest("hex").slice(0, 48)}`;
}

export async function resolveCanonicalSocialChat(input: {
  tenantId: string;
  channel: SocialChannel;
  channelId: string;
  externalProfileId: string;
  createData: Record<string, unknown>;
}) {
  const identityId = socialChatIdentityId(input);
  const identityRef = adminDb.collection("chat_identities").doc(identityId);
  const chatsRef = adminDb.collection("chats");
  const candidates = await chatsRef
    .where("tenantId", "==", input.tenantId)
    .where("channel", "==", input.channel)
    .where("contactExternalId", "==", input.externalProfileId)
    .limit(20)
    .get();
  const exact = candidates.docs.filter((document) => clean(document.data().channelId) === input.channelId);
  const legacy = exact.length === 0 && candidates.docs.length === 1 && !clean(candidates.docs[0]?.data().channelId)
    ? [candidates.docs[0]]
    : [];
  const matching = [...exact, ...legacy].sort((left, right) => toMillis(left.data().createdAt) - toMillis(right.data().createdAt));

  const result = await adminDb.runTransaction(async (transaction) => {
    const identity = await transaction.get(identityRef);
    if (identity.exists && (identity.data()?.tenantId !== input.tenantId || identity.data()?.channel !== input.channel || identity.data()?.channelId !== input.channelId)) throw new Error("social_chat_identity_scope_invalid");
    const mappedChatId = clean(identity.data()?.chatId);
    if (mappedChatId) {
      const mappedRef = chatsRef.doc(mappedChatId);
      const mapped = await transaction.get(mappedRef);
      if (mapped.exists) {
        if (mapped.data()?.tenantId !== input.tenantId || mapped.data()?.channel !== input.channel ||
          (mapped.data()?.channelId && mapped.data()?.channelId !== input.channelId) || mapped.data()?.contactExternalId !== input.externalProfileId) throw new Error("social_chat_mapping_scope_invalid");
        return { chatRef: mappedRef, created: false };
      }
    }
    const legacyCandidate = matching[0] as QueryDocumentSnapshot | undefined;
    const chatRef: DocumentReference = legacyCandidate?.ref || chatsRef.doc(identityId);
    const chat = legacyCandidate || await transaction.get(chatRef);
    const created = !chat.exists;
    if (created) transaction.set(chatRef, input.createData);
    transaction.set(identityRef, {
      tenantId: input.tenantId,
      channel: input.channel,
      channelId: input.channelId,
      contactExternalId: input.externalProfileId,
      chatId: chatRef.id,
      identityVersion: 2,
      createdAt: identity.exists ? identity.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { chatRef, created };
  });

  const duplicateRefs = matching.filter((document) => document.id !== result.chatRef.id).map((document) => document.ref);
  for (const duplicateRef of duplicateRefs) {
    let migratedMessages = 0;
    let complete = false;
    for (let page = 0; page < 20; page += 1) {
      const messages = await adminDb.collection("messages")
        .where("chatId", "==", duplicateRef.id)
        .limit(400)
        .get();
      if (messages.empty) {
        complete = true;
        break;
      }
      const batch = adminDb.batch();
      if (messages.docs.some(message => message.data().tenantId !== input.tenantId)) throw new Error("social_chat_message_scope_invalid");
      messages.docs.forEach((message) => batch.set(message.ref, {
        chatId: result.chatRef.id,
        previousChatId: duplicateRef.id,
        identityMigratedAt: FieldValue.serverTimestamp(),
      }, { merge: true }));
      await batch.commit();
      migratedMessages += messages.size;
    }
    if (complete) {
      await Promise.all([
        duplicateRef.set({
          mergedIntoChatId: result.chatRef.id,
          identityStatus: "merged_alias",
          identityVersion: 2,
          mergedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
        adminDb.collection("audit_logs").doc(`social_chat_merge_${duplicateRef.id}_${result.chatRef.id}`).set({
          tenantId: input.tenantId,
          action: "social_chat_identity_merged",
          sourceChatId: duplicateRef.id,
          targetChatId: result.chatRef.id,
          migratedMessages,
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true }),
      ]);
    }
  }

  return {
    ...result,
    duplicateRefs,
  };
}
