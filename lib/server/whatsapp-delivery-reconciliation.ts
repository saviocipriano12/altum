import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { persistChatMessageAcknowledgement } from "@/lib/server/chat-message-acknowledgement";

function decodeCursor(value: string | null | undefined, tenantId: string) {
  if (!value) return null;
  try {
    if (value.length > 3000) throw new Error();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed.v !== 1 || parsed.tenantId !== tenantId || typeof parsed.id !== "string" || !parsed.id || parsed.id.includes("/") || parsed.id.length > 1500) throw new Error();
    return parsed.id as string;
  } catch { throw new Error("Cursor de reconciliacao invalido ou de outra empresa."); }
}

/** Metadata repair only: never imports dispatch, provider or outbound processing. */
export async function reconcileTenantWhatsAppDeliveryReceipts(input: {
  tenantId: string; cursor?: string | null; limit?: number; actorId: string;
}) {
  const tenantId = input.tenantId.trim();
  if (!tenantId || tenantId.length > 180 || !input.actorId.trim()) throw new Error("Empresa e operador obrigatorios.");
  const limit = input.limit ?? 10;
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new Error("Limite deve ser um inteiro entre 1 e 25.");
  const cursor = decodeCursor(input.cursor, tenantId);
  let query = adminDb.collection("messages").where("tenantId", "==", tenantId).orderBy(FieldPath.documentId()).limit(limit + 1);
  if (cursor) query = query.startAfter(cursor);
  const page = await query.get();
  const rows = page.docs.slice(0, limit);
  const results: Array<{ messageId: string; status: "reconciled" | "skipped" | "failed"; reason?: string }> = [];
  for (const row of rows) {
    const data = row.data();
    if (data.sender !== "agent" || !data.metaMessageId || !data.channelPhoneNumberId || !data.chatId || (data.channel && data.channel !== "whatsapp") ||
      ![data.status, data.deliveryStatus].some((status) => ["sent", "delivered", "read", "failed"].includes(String(status)))) {
      results.push({ messageId: row.id, status: "skipped", reason: "Sem comprovacao de envio WhatsApp ou vinculo completo." });
      continue;
    }
    try {
      await persistChatMessageAcknowledgement(row.ref, {
        tenantId, chatId: data.chatId, metaMessageId: data.metaMessageId,
        channelPhoneNumberId: data.channelPhoneNumberId, status: "sent", deliveryStatus: "sent",
      }, { merge: true, reconcile: true, forceHistory: true });
      results.push({ messageId: row.id, status: "reconciled" });
    } catch (error) {
      results.push({ messageId: row.id, status: "failed", reason: error instanceof Error ? error.message : "Falha ao reconciliar." });
    }
  }
  const hasMore = page.size > limit;
  const nextCursor = hasMore && rows.length ? Buffer.from(JSON.stringify({ v: 1, tenantId, id: rows[rows.length - 1].id })).toString("base64url") : null;
  const counts = { scanned: rows.length, reconciled: results.filter((row) => row.status === "reconciled").length,
    skipped: results.filter((row) => row.status === "skipped").length, failed: results.filter((row) => row.status === "failed").length };
  await adminDb.collection("audit_logs").add({ tenantId, actorId: input.actorId, action: "whatsapp_delivery_reconciliation",
    ...counts, cursor: input.cursor || null, nextCursor, hasMore, failedMessageIds: results.filter((row) => row.status === "failed").map((row) => row.messageId),
    createdAt: FieldValue.serverTimestamp() });
  return { ...counts, hasMore, nextCursor, results };
}
