import { adminDb } from "@/app/lib/server/firebase-admin";
import { getUnambiguousConversationLead, messageInCommercialTarget } from "./conversation-commercial-context";
import { observedMessageContent } from "@/lib/server/ai/inbound-enrichment-source";
import { isExactCrmRecordId } from "@/lib/crm-observation-identity";

type Chat = Record<string, unknown> & { id: string };
/** Keep the legacy view, but never reuse an explicitly different purchase or a
 * selected purchase's cached pre-selection transcript/last-response fields. */
export async function purchaseConversationWindow(tenantId: string, leadId: string, chat: Chat, includeMessages = false) {
  if (chat.tenantId !== tenantId || !isExactCrmRecordId(chat.id)) return null;
  if (chat.leadId && chat.leadId !== leadId) return null;
  const selected = chat.commercialContext !== undefined;
  const target = selected ? await getUnambiguousConversationLead({ tenantId, chatId: chat.id }) : null;
  if (selected && (!target?.ok || target.leadId !== leadId || target.selectionId !== (chat.commercialContext as { id?: unknown })?.id)) return null;
  if (!selected && !includeMessages) return { chat, messages: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
  const query = adminDb.collection("messages").where("tenantId", "==", tenantId).where("chatId", "==", chat.id);
  const snapshot = await (selected ? query.orderBy("createdAt", "desc").limit(80) : query.limit(12)).get();
  const messages = snapshot.docs.filter(message => {
    if (target?.ok && !messageInCommercialTarget(message, target)) return false;
    const row = message.data();
    if (row.leadId && row.leadId !== leadId) return false;
    if (!selected) return true;
    return ["client", "agent"].includes(String(row.sender)) && !(row.sender === "agent" && ["queued", "pending", "sending", "failed", "cancelled"].includes(String(row.deliveryStatus || row.status)));
  }).sort((a, b) => a.createTime.seconds - b.createTime.seconds || a.createTime.nanoseconds - b.createTime.nanoseconds);
  if (!selected) return { chat, messages };
  const latest = messages.at(-1), client = messages.filter(row => row.data().sender === "client").at(-1), agent = messages.filter(row => row.data().sender === "agent").at(-1);
  const current: Chat = { id: chat.id, tenantId, leadId, channel: chat.channel, status: chat.status, priority: chat.priority,
    ownerId: chat.ownerId, ownerUserId: chat.ownerUserId, assignedTo: chat.assignedTo, contactName: chat.contactName,
    commercialContext: chat.commercialContext, lastMessage: latest ? observedMessageContent(latest.data(), latest.createTime).text : "",
    lastMessageTime: latest?.createTime || null, lastClientMessageAt: client?.createTime || null, lastAgentMessageAt: agent?.createTime || null };
  return { chat: current, messages };
}
