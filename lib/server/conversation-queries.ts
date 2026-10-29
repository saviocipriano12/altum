import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { decodeConversationCursor } from "@/lib/server/conversation-pagination";

export async function listRecentChats(
  tenantId: string,
  pageLimit: number,
  cursor: ReturnType<typeof decodeConversationCursor>
) {
  let query: FirebaseFirestore.Query = adminDb
    .collection("chats")
    .where("tenantId", "==", tenantId)
    .orderBy("lastMessageTime", "desc")
    .orderBy(FieldPath.documentId(), "desc");
  if (cursor) {
    query = query.startAfter(Timestamp.fromMillis(cursor.timestampMs), cursor.documentId);
  }
  // Never fall back to an unordered slice. Returning an explicit index error
  // is safer than showing an incomplete inbox as if it were authoritative.
  return query.limit(pageLimit + 1).get();
}

export type MessagePageDirection = "initial" | "older" | "newer";

export async function listChatMessages(input: {
  chatId: string;
  direction: MessagePageDirection;
  cursor: ReturnType<typeof decodeConversationCursor>;
  legacySinceMs: number | null;
  limit: number;
}) {
  const ascending = input.direction === "newer";
  let query: FirebaseFirestore.Query = adminDb
    .collection("messages")
    .where("chatId", "==", input.chatId)
    .orderBy("createdAt", ascending ? "asc" : "desc")
    .orderBy(FieldPath.documentId(), ascending ? "asc" : "desc");

  if (input.cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(input.cursor.timestampMs),
      input.cursor.documentId
    );
  } else if (input.direction === "newer" && input.legacySinceMs) {
    query = query.where("createdAt", ">", Timestamp.fromMillis(input.legacySinceMs));
  }

  // One extra document proves whether another page exists. We intentionally
  // fail when the required index is missing: an unordered fallback can hide
  // or duplicate messages and is not a safe degradation for a sales inbox.
  return query.limit(input.limit + 1).get();
}

