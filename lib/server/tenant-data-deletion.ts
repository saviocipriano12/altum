import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { getChatStateDocId } from "@/lib/server/ai/agent";

type TrashSnapshotDoc = {
  collection: string;
  id: string;
  data: Record<string, unknown>;
};

async function snapshotQuery(collection: string, tenantId: string, field: string, value: string, limit = 400) {
  const snap = await adminDb
    .collection(collection)
    .where("tenantId", "==", tenantId)
    .where(field, "==", value)
    .limit(limit)
    .get();
  return snap.docs.map((doc) => ({
    collection,
    id: doc.id,
    data: doc.data() as Record<string, unknown>,
  })) satisfies TrashSnapshotDoc[];
}

async function createTrashItem(input: {
  tenantId: string;
  entity: "chat" | "lead";
  entityId: string;
  label: string;
  documents: TrashSnapshotDoc[];
  parentTrashId?: string;
}) {
  const ref = adminDb.collection("tenant_trash").doc();
  await ref.set({
    tenantId: input.tenantId,
    entity: input.entity,
    entityId: input.entityId,
    label: input.label,
    parentTrashId: input.parentTrashId || null,
    status: "creating",
    documentCount: input.documents.length,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  const writer = adminDb.bulkWriter();
  for (const document of input.documents) {
    writer.set(ref.collection("documents").doc(), document);
  }
  await writer.close();
  await ref.update({
    status: "active",
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

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

export async function deleteTenantChat(input: { tenantId: string; chatId: string; parentTrashId?: string }) {
  const chatRef = adminDb.collection("chats").doc(input.chatId);
  const chatSnap = await chatRef.get();
  if (!chatSnap.exists) return { deleted: false, related: 0 };
  if (String(chatSnap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Conversa fora do tenant informado.");
  }

  const chatData = chatSnap.data() as Record<string, unknown>;
  const chatStateRef = adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId));
  const [messages, notes, jobs, handoffs, chatStateSnap] = await Promise.all([
    snapshotQuery("messages", input.tenantId, "chatId", input.chatId),
    snapshotQuery("chat_notes", input.tenantId, "chatId", input.chatId),
    snapshotQuery("ai_jobs", input.tenantId, "chatId", input.chatId),
    snapshotQuery("handoff_events", input.tenantId, "chatId", input.chatId),
    chatStateRef.get(),
  ]);
  const documents: TrashSnapshotDoc[] = [
    { collection: "chats", id: input.chatId, data: chatData },
    ...messages,
    ...notes,
    ...jobs,
    ...handoffs,
    ...(chatStateSnap.exists
      ? [{ collection: "chat_state", id: chatStateSnap.id, data: chatStateSnap.data() as Record<string, unknown> }]
      : []),
  ];
  const trashId = await createTrashItem({
    tenantId: input.tenantId,
    entity: "chat",
    entityId: input.chatId,
    label: String(chatData.contactName || chatData.contactPhone || "Conversa"),
    documents,
    parentTrashId: input.parentTrashId,
  });

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
  return { deleted: true, related: counts.reduce((sum, count) => sum + count, 0), trashId };
}

export async function deleteTenantLead(input: { tenantId: string; leadId: string }) {
  const leadRef = adminDb.collection("leads").doc(input.leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) return { deleted: false, related: 0, chats: 0 };
  if (String(leadSnap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Lead fora do tenant informado.");
  }
  const leadData = leadSnap.data() as Record<string, unknown>;

  const [notes, tasks, events, appointments, budgets, finance] = await Promise.all([
    snapshotQuery("lead_notes", input.tenantId, "leadId", input.leadId),
    snapshotQuery("lead_tasks", input.tenantId, "leadId", input.leadId),
    snapshotQuery("lead_events", input.tenantId, "leadId", input.leadId),
    snapshotQuery("appointments", input.tenantId, "leadId", input.leadId),
    snapshotQuery("budgets", input.tenantId, "leadId", input.leadId),
    snapshotQuery("finance_entries", input.tenantId, "leadId", input.leadId),
  ]);
  const eventSubcollection = await leadRef.collection("events").limit(400).get();
  const trashId = await createTrashItem({
    tenantId: input.tenantId,
    entity: "lead",
    entityId: input.leadId,
    label: String(leadData.nome || leadData.empresa || leadData.telefone || "Contato"),
    documents: [
      { collection: "leads", id: input.leadId, data: leadData },
      ...notes,
      ...tasks,
      ...events,
      ...appointments,
      ...budgets,
      ...finance,
      ...eventSubcollection.docs.map((doc) => ({
        collection: `leads/${input.leadId}/events`,
        id: doc.id,
        data: doc.data() as Record<string, unknown>,
      })),
    ],
  });

  const chatsSnap = await adminDb
    .collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("leadId", "==", input.leadId)
    .limit(200)
    .get();
  let chatRelated = 0;
  for (const chat of chatsSnap.docs) {
    const result = await deleteTenantChat({
      tenantId: input.tenantId,
      chatId: chat.id,
      parentTrashId: trashId,
    });
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
    trashId,
  };
}

export async function listTenantTrash(tenantId: string) {
  const snap = await adminDb.collection("tenant_trash").where("tenantId", "==", tenantId).limit(200).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const createdAt = data.createdAt && typeof data.createdAt === "object" && "toDate" in data.createdAt
        ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
        : null;
      const expiresAt = data.expiresAt && typeof data.expiresAt === "object" && "toDate" in data.expiresAt
        ? (data.expiresAt as { toDate: () => Date }).toDate().toISOString()
        : null;
      return {
        id: doc.id,
        entity: String(data.entity || ""),
        entityId: String(data.entityId || ""),
        parentTrashId: String(data.parentTrashId || ""),
        label: String(data.label || "Item apagado"),
        documentCount: Number(data.documentCount || 0),
        createdAt,
        expiresAt,
      };
    })
    .filter((item) => !item.parentTrashId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function restoreTrashRef(input: { tenantId: string; ref: FirebaseFirestore.DocumentReference }) {
  const ref = input.ref;
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Item da lixeira nao encontrado.");
  }
  const documentsSnap = await ref.collection("documents").limit(5000).get();
  const legacyDocuments = Array.isArray(snap.data()?.documents)
    ? (snap.data()?.documents as TrashSnapshotDoc[])
    : [];
  const documents = documentsSnap.empty
    ? legacyDocuments
    : documentsSnap.docs.map((doc) => doc.data() as TrashSnapshotDoc);
  const writer = adminDb.bulkWriter();
  for (const item of documents) {
    if (!item.collection || !item.id || !item.data) continue;
    writer.set(adminDb.collection(item.collection).doc(item.id), {
      ...item.data,
      restoredAt: FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
  await adminDb.recursiveDelete(ref);
  return { restored: documents.length };
}

export async function restoreTenantTrash(input: { tenantId: string; trashId: string }) {
  const ref = adminDb.collection("tenant_trash").doc(input.trashId);
  const children = await adminDb
    .collection("tenant_trash")
    .where("parentTrashId", "==", input.trashId)
    .limit(200)
    .get();
  let restored = 0;
  for (const child of children.docs.filter((doc) => String(doc.data().tenantId || "") === input.tenantId)) {
    restored += (await restoreTrashRef({ tenantId: input.tenantId, ref: child.ref })).restored;
  }
  restored += (await restoreTrashRef({ tenantId: input.tenantId, ref })).restored;
  return { restored };
}

export async function deleteTenantTrashPermanently(input: { tenantId: string; trashId: string }) {
  const ref = adminDb.collection("tenant_trash").doc(input.trashId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.tenantId || "") !== input.tenantId) {
    throw new Error("Item da lixeira nao encontrado.");
  }
  const children = await adminDb
    .collection("tenant_trash")
    .where("parentTrashId", "==", input.trashId)
    .limit(200)
    .get();
  const tenantChildren = children.docs.filter((doc) => String(doc.data().tenantId || "") === input.tenantId);
  await Promise.all([
    ...tenantChildren.map((child) => adminDb.recursiveDelete(child.ref)),
    adminDb.recursiveDelete(ref),
  ]);
  return { deleted: 1 + tenantChildren.length };
}

export async function purgeExpiredTenantTrash() {
  const snap = await adminDb.collection("tenant_trash").where("expiresAt", "<=", new Date()).limit(200).get();
  if (snap.empty) return { purged: 0 };
  await Promise.all(snap.docs.map((doc) => adminDb.recursiveDelete(doc.ref)));
  return { purged: snap.size };
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
