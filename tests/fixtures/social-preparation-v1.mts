// Historical v1 claim copied verbatim before migration; source SHA256 7511c854c0377ba0dd7bc97a31655f16e7d2a345462be4697ec753b13fe4bdf8.
// Only the exported function name differs. Used solely against synthetic fixtures.
import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../../app/lib/server/firebase-admin.ts";

function cleanText(value: unknown, max = 400) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toEpochMs(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (typeof value === "object" && value) {
    if ("toDate" in value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().getTime();
    }
    if ("_seconds" in value && typeof (value as { _seconds?: unknown })._seconds === "number") {
      return (value as { _seconds: number })._seconds * 1000;
    }
    if ("seconds" in value && typeof (value as { seconds?: unknown }).seconds === "number") {
      return (value as { seconds: number }).seconds * 1000;
    }
  }
  return 0;
}

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `social_${Date.now()}`;
}

function buildSocialLogId(tenantId: string, channelType: string, eventId: string) {
  return sanitizeId(`${tenantId}_${channelType}_${eventId}`, 240);
}

export async function claimSocialEventV1(input: {
  tenantId: string;
  channelId: string;
  channelType: string;
  eventId: string;
  eventType: string;
  actorId: string;
  actorName: string;
  text: string;
  entryId?: string | null;
  actorUsername?: string | null;
  commentId?: string | null;
  postId?: string | null;
  parentId?: string | null;
  timestamp?: number | null;
  field?: string | null;
}) {
  const logRef = adminDb.collection("social_automation_logs").doc(
    buildSocialLogId(input.tenantId, input.channelType, input.eventId)
  );

  const claimToken = randomUUID();
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(logRef);
    if (snap.exists) {
      const data = snap.data() as Record<string, unknown>;
      const status = cleanText(data.status, 80);
      if (data.tenantId !== input.tenantId || data.channelType !== input.channelType || data.eventId !== input.eventId ||
        data.actorId !== input.actorId || data.eventType !== input.eventType || String(data.commentId || "") !== String(input.commentId || "") ||
        (data.channelId && data.channelId !== input.channelId)) throw new Error("Falha de integridade: evento social fora do escopo original.");
      if (status === "processed" || status === "sent" || status.startsWith("ignored_")) {
        return { shouldProcess: false };
      }
      if (data.deliveryJobId) return { shouldProcess: false };
      if (data.preparationProtocol !== 1) throw new Error("Evento social legado sem prova de envio; revisao necessaria.");
      if (toEpochMs(data.claimUntil) > Date.now()) return { shouldProcess: false };
    }

    tx.set(
      logRef,
      {
        tenantId: input.tenantId,
        channelId: input.channelId,
        channelType: input.channelType,
        eventId: input.eventId,
        eventType: input.eventType,
        entryId: cleanText(input.entryId, 180) || null,
        actorId: input.actorId,
        actorName: input.actorName,
        actorUsername: cleanText(input.actorUsername, 180) || null,
        text: input.text,
        commentId: cleanText(input.commentId, 180) || null,
        postId: cleanText(input.postId, 180) || null,
        parentId: cleanText(input.parentId, 180) || null,
        timestamp: typeof input.timestamp === "number" && Number.isFinite(input.timestamp) ? input.timestamp : null,
        field: cleanText(input.field, 80) || null,
        status: "claimed",
        preparationProtocol: 1,
        claimToken,
        claimUntil: new Date(Date.now() + 5 * 60000),
        updatedAt: FieldValue.serverTimestamp(),
        ...(!snap.exists ? { createdAt: FieldValue.serverTimestamp(), automationEventProtocol: 1 } : {}),
      },
      { merge: true }
    );

    return { shouldProcess: true };
  });

  return { logRef, shouldProcess: result.shouldProcess, claimToken };
}
