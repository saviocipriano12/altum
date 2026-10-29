import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { readUnambiguousConversationLead, messageInCommercialTarget } from "./conversation-commercial-context";
import { observationSnapshotVersion as version } from "./observation-receipt-identity";
export type ObservationSourceBinding = { version: 1; messageGeneration: string; messageRevision: string | null;
  chatGeneration: string; commercialContext: string; bornAt: string };
const validVersion = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 40 || !/^\d+:\d{1,9}$/.test(value)) return false;
  const [seconds, nanos] = value.split(":").map(Number);
  return Number.isSafeInteger(seconds) && Number.isInteger(nanos) && nanos < 1_000_000_000;
};
export function normalizeObservationBinding(value: unknown): ObservationSourceBinding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !validVersion(row.messageGeneration) || !validVersion(row.chatGeneration) || !validVersion(row.bornAt) ||
      row.messageRevision !== null && !validVersion(row.messageRevision) || typeof row.commercialContext !== "string" || !/^[a-f0-9]{64}$/.test(row.commercialContext)) return null;
  return row as ObservationSourceBinding;
}
export function versionAfter(a: string, b: string) {
  const [as, an] = a.split(":").map(Number), [bs, bn] = b.split(":").map(Number);
  return as > bs || as === bs && an > bn;
}
export function sameObservationOccurrence(a: ObservationSourceBinding, b: ObservationSourceBinding) {
  return a.messageGeneration === b.messageGeneration && a.chatGeneration === b.chatGeneration && a.commercialContext === b.commercialContext;
}
export function observationSourceBinding(message: FirebaseFirestore.DocumentSnapshot, chat: FirebaseFirestore.DocumentSnapshot,
  target: Awaited<ReturnType<typeof readUnambiguousConversationLead>>): ObservationSourceBinding {
  const births = [version(message.createTime), version(chat.createTime), ...(target.ok ? [version(target.generation), version(target.contactGeneration), version(target.selectedAfter)] : [])].filter(Boolean);
  return { version: 1, messageGeneration: version(message.createTime), messageRevision: version(message.updateTime), chatGeneration: version(chat.createTime),
    bornAt: births.reduce((latest, next) => versionAfter(next, latest) ? next : latest),
    commercialContext: createHash("sha256").update(JSON.stringify(target.ok ?
      [target.leadId, version(target.generation), target.contactId, version(target.contactGeneration), ...(target.selectionId ? [target.selectionId, version(target.selectedAfter)] : [])] : [chat.data()?.leadId || null, target.reason])).digest("hex") };
}
export async function readObservationSourceBinding(tx: FirebaseFirestore.Transaction, input: { tenantId: string; chatId: string; messageId: string }) {
  const [message, chat] = await Promise.all([tx.get(adminDb.collection("messages").doc(input.messageId)), tx.get(adminDb.collection("chats").doc(input.chatId))]);
  if (!message.exists || !chat.exists || message.data()?.tenantId !== input.tenantId || message.data()?.chatId !== input.chatId || chat.data()?.tenantId !== input.tenantId ||
      message.data()?.leadId && message.data()?.leadId !== chat.data()?.leadId) return null;
  const target = await readUnambiguousConversationLead(tx, input);
  if (target.ok && !messageInCommercialTarget(message, target) || chat.data()?.commercialContext !== undefined && !target.ok) return null;
  return { binding: observationSourceBinding(message, chat, target), message, chat,
    explicitLead: target.ok && message.data()?.leadId === target.leadId };
}
