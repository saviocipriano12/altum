import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { buildWatchdogChatPatch } from "@/lib/server/chat-operations";

function clean(value: unknown, max = 140) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

type WatchdogChat = {
  id: string;
  ref: FirebaseFirestore.DocumentReference;
  status?: unknown;
  assignedTo?: unknown;
  ownerId?: unknown;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
  slaBreachedAt?: unknown;
  queueStatus?: unknown;
  slaState?: unknown;
};

function toMillis(value: unknown) {
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

export async function processInboxWatchdog(input?: { tenantId?: string; limit?: number }) {
  const tenantId = clean(input?.tenantId, 140);
  const limit = Math.max(1, Math.min(400, Number(input?.limit || 120)));

  const snap = tenantId
    ? await adminDb.collection("chats").where("tenantId", "==", tenantId).limit(800).get()
    : await adminDb.collection("chats").limit(1200).get();

  const chats = snap.docs
    .map(
      (doc): WatchdogChat => ({
        id: doc.id,
        ref: doc.ref,
        ...(doc.data() as Record<string, unknown>),
      })
    )
    .sort((a, b) => toMillis(a.slaDueAt) - toMillis(b.slaDueAt))
    .slice(0, limit);

  let scanned = 0;
  let updated = 0;
  let breached = 0;
  const batch = adminDb.batch();

  for (const chat of chats) {
    scanned += 1;

    const patch = buildWatchdogChatPatch({
      status: clean(chat.status, 80),
      assignedTo: clean(chat.assignedTo, 140) || clean(chat.ownerId, 140) || undefined,
      lastClientMessageAt: chat.lastClientMessageAt,
      lastAgentMessageAt: chat.lastAgentMessageAt,
      slaDueAt: chat.slaDueAt,
      slaBreachedAt: chat.slaBreachedAt,
    });

    const nextQueueStatus = String(patch.queueStatus || "");
    const nextSlaState = String(patch.slaState || "");
    const currentQueueStatus = clean(chat.queueStatus, 80);
    const currentSlaState = clean(chat.slaState, 80);
    const shouldWrite =
      nextQueueStatus !== currentQueueStatus ||
      nextSlaState !== currentSlaState ||
      (nextSlaState === "breached" && !chat.slaBreachedAt);

    if (!shouldWrite) continue;

    if (nextSlaState === "breached") {
      breached += 1;
    }

    batch.set(
      chat.ref,
      {
        ...patch,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    updated += 1;
  }

  if (updated > 0) {
    await batch.commit();
  }

  return { scanned, updated, breached };
}
