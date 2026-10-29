import { adminDb } from "@/app/lib/server/firebase-admin";
import { getWhatsAppChannelById } from "@/app/lib/server/whatsapp-channel";
import { isEvolutionWhatsAppProvider } from "./registry";
import { parseEvolutionWebhook } from "./evolution-webhook";
import { persistExternalWhatsAppMessage } from "./whatsapp-external-message";

/** Recovery only: published webhooks remain the primary message transport.
 * Never send, mark read, run AI, change accounts or import another recipient. */
export async function reconcileExternalWhatsAppMessages(tenantId: string, chatId: string) {
  const chatRef = adminDb.collection("chats").doc(chatId);
  const chat = (await chatRef.get()).data();
  if (!chat || chat.tenantId !== tenantId || chat.channel !== "whatsapp") return { status: "not_applicable", imported: 0 };
  const channel = await getWhatsAppChannelById(String(chat.channelId || ""));
  if (!channel || channel.tenantId !== tenantId || !isEvolutionWhatsAppProvider(channel.provider)) return { status: "not_applicable", imported: 0 };
  const leaseRef = adminDb.collection("chat_external_sync").doc(`${tenantId}_${chatId}`);
  const granted = await adminDb.runTransaction(async tx => {
    const data = (await tx.get(leaseRef)).data();
    if (data && (data.tenantId !== tenantId || data.chatId !== chatId)) throw new Error("Sincronizacao fora do escopo.");
    if ((data?.nextAttemptAt?.toMillis?.() || 0) > Date.now()) return false;
    tx.set(leaseRef, { tenantId, chatId, nextAttemptAt: new Date(Date.now() + 10_000) }, { merge: true });
    return true;
  });
  if (!granted) return { status: "throttled", imported: 0 };
  const rawPhone = String(chat.groupJid || chat.contactPhone || "");
  const phone = rawPhone.includes("@") ? rawPhone : rawPhone.replace(/\D/g, "");
  const jid = phone.includes("@") ? phone : `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
  const response = await fetch(`${String(channel.gatewayEndpoint).replace(/\/+$/, "")}/chat/findMessages/${encodeURIComponent(channel.sessionId || channel.id)}`, {
    method: "POST", headers: { apikey: channel.accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ where: { key: { fromMe: true } }, sort: "desc", page: 1, offset: 100 }), signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return { status: "unavailable", imported: 0 };
  const payload = await response.json() as { messages?: { records?: unknown[] }; records?: unknown[] };
  const rows = payload.messages?.records || payload.records || [];
  if (!Array.isArray(rows)) return { status: "unavailable", imported: 0 };
  const existing = await adminDb.collection("messages").where("chatId", "==", chatId).orderBy("createdAt", "desc").limit(200).get();
  const ids = new Set(existing.docs.map(doc => String(doc.data().metaMessageId || doc.data().inboundMetaMessageId || "")));
  const since = Math.max(Date.now() - 24 * 60 * 60_000, (existing.docs[0]?.data().createdAt?.toMillis?.() || 0) - 5 * 60_000);
  let imported = 0;
  for (const raw of rows.slice(0, 100).reverse()) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const key = row.key as Record<string, unknown> | undefined;
    // Mobile sends frequently use @lid while API sends use @s.whatsapp.net.
    if (key?.remoteJid !== jid && key?.remoteJidAlt !== jid) continue;
    const event = parseEvolutionWebhook({ event: "messages.upsert", data: row });
    if (event?.kind !== "message" || !event.fromMe || event.from !== phone || !event.occurredAtMs || event.occurredAtMs < since || ids.has(event.messageId)) continue;
    // Re-read before writing: the chat may have been deleted or reassigned to another account.
    const latest = (await chatRef.get()).data();
    if (latest?.tenantId !== tenantId || latest.channelId !== channel.id || latest.contactPhone !== chat.contactPhone) throw new Error("Conversa alterada durante sincronizacao.");
    const result = await persistExternalWhatsAppMessage(channel, event, { prepareMedia: false, expectedChatId: chatId });
    if (result.status === "ok_external_message") imported++;
    ids.add(event.messageId);
  }
  await leaseRef.set({ lastCompletedAt: new Date(), lastImported: imported }, { merge: true });
  return { status: "ok", imported, recentWindowOnly: true };
}
