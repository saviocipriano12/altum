import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getChatStateDocId } from "@/lib/server/ai/agent";

async function deleteQuery(collection: string, tenantId: string, field: string, value: string) {
  const snap = await adminDb
    .collection(collection)
    .where("tenantId", "==", tenantId)
    .where(field, "==", value)
    .limit(1000)
    .get();
  if (snap.empty) return 0;
  const writer = adminDb.bulkWriter();
  snap.docs.forEach((doc) => writer.delete(doc.ref));
  await writer.close();
  return snap.size;
}

export async function deleteTenantChat(input: { tenantId: string; chatId: string }) {
  const chatRef = adminDb.collection("chats").doc(input.chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) return { deleted: false, related: 0 };
  if (String(chatSnap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Conversa fora do tenant informado.");
  }

  const counts = await Promise.all([
    deleteQuery("messages", input.tenantId, "chatId", input.chatId),
    deleteQuery("chat_notes", input.tenantId, "chatId", input.chatId),
    deleteQuery("ai_jobs", input.tenantId, "chatId", input.chatId),
    deleteQuery("handoff_events", input.tenantId, "chatId", input.chatId),
  ]);
  await Promise.all([
    adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId)).delete(),
    adminDb.recursiveDelete(chatRef),
  ]);
  return { deleted: true, related: counts.reduce((sum, count) => sum + count, 0) };
}

export async function deleteTenantLead(input: { tenantId: string; leadId: string }) {
  const leadRef = adminDb.collection("leads").doc(input.leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return { deleted: false, related: 0, chats: 0 };
  if (String(leadSnap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Lead fora do tenant informado.");
  }

  const chatsSnap = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("leadId", "==", input.leadId)
    .limit(200)
    .get();
  let chatRelated = 0;
  for (const chat of chatsSnap.docs) {
    const result = await deleteTenantChat({ tenantId: input.tenantId, chatId: chat.id });
    chatRelated += result.related;
  }

  const counts = await Promise.all([
    deleteQuery("lead_notes", input.tenantId, "leadId", input.leadId),
    deleteQuery("lead_tasks", input.tenantId, "leadId", input.leadId),
    deleteQuery("lead_events", input.tenantId, "leadId", input.leadId),
    deleteQuery("appointments", input.tenantId, "leadId", input.leadId),
    deleteQuery("budgets", input.tenantId, "leadId", input.leadId),
    deleteQuery("finance_entries", input.tenantId, "leadId", input.leadId),
  ]);
  await adminDb.recursiveDelete(leadRef);
  return {
    deleted: true,
    related: chatRelated + counts.reduce((sum, count) => sum + count, 0),
    chats: chatsSnap.size,
  };
}

export async function recordDeletionAudit(input: {
  tenantId: string;
  actorId: string;
  actorName: string;
  entity: "chat" | "lead";
  ids: string[];
}) {
  await adminDb.collection("deletion_audits").add({
    tenantId: input.tenantId,
    actorId: input.actorId,
    actorName: input.actorName,
    entity: input.entity,
    count: input.ids.length,
    entityIds: input.ids.slice(0, 100),
    createdAt: FieldValue.serverTimestamp(),
  });
}
