import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { getChatStateDocId } from "@/lib/server/ai/agent";
import { tenantTrashSnapshotId as snapshotId } from "@/lib/server/tenant-trash-identity";
import { assertDeletionAuthority, type TenantDeletionAuthority } from "@/lib/server/tenant-deletion-authority";
import { readQueryPages } from "@/lib/server/query-pages";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";

type TrashSnapshotDoc = { collection: string; id: string; data: Record<string, unknown>; sourceCreateTime?: FirebaseFirestore.Timestamp };
const PAGE = 400;

export class TenantDeletionConflict extends Error {
  constructor(message = "Registro alterado durante a exclusao. Nenhuma versao mais recente sera removida; atualize os dados e revise a lixeira.") { super(message); }
}

type DeletionGuard = { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; sourceCreateTime?: FirebaseFirestore.Timestamp };

function sameOriginal(snapshot: FirebaseFirestore.DocumentSnapshot, archived: Pick<TrashSnapshotDoc, "data" | "sourceCreateTime">) {
  return snapshot.exists && isDeepStrictEqual(snapshot.data(), archived.data) &&
    (!archived.sourceCreateTime || !!snapshot.createTime?.isEqual(archived.sourceCreateTime));
}

async function assertUnchangedDocuments(documents: TrashSnapshotDoc[]) {
  for (let offset = 0; offset < documents.length; offset += 200) {
    const page = documents.slice(offset, offset + 200);
    const current = await adminDb.getAll(...page.map(item => adminDb.collection(item.collection).doc(item.id)));
    if (current.some((snapshot, index) => snapshot.exists && !sameOriginal(snapshot, page[index]))) throw new TenantDeletionConflict();
  }
}

function clean(value: unknown, max = 900) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function storageBucket() {
  const name = clean(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 240);
  if (!name) throw new Error("Bucket do Firebase Storage nao configurado para expurgo.");
  return adminStorage.bucket(name);
}
async function queryAll(collection: string, tenantId: string, field: string, value: string) {
  const rows: TrashSnapshotDoc[] = []; let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  do {
    let query: FirebaseFirestore.Query = adminDb.collection(collection).where("tenantId", "==", tenantId).where(field, "==", value).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    rows.push(...snap.docs.map((doc) => ({ collection, id: doc.id, data: doc.data() as Record<string, unknown>, sourceCreateTime: doc.createTime })));
    cursor = snap.size === PAGE ? snap.docs[snap.docs.length - 1] : null;
  } while (cursor);
  return rows;
}
async function subcollectionAll(path: string) {
  const rows: TrashSnapshotDoc[] = []; let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  do {
    let query: FirebaseFirestore.Query = adminDb.collection(path).orderBy(FieldPath.documentId()).limit(PAGE);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    rows.push(...snap.docs.map((doc) => ({ collection: path, id: doc.id, data: doc.data() as Record<string, unknown>, sourceCreateTime: doc.createTime })));
    cursor = snap.size === PAGE ? snap.docs[snap.docs.length - 1] : null;
  } while (cursor);
  return rows;
}
function storagePaths(documents: TrashSnapshotDoc[], tenantId: string, entityId: string) {
  const prefix = `chat-media/${tenantId}/${entityId}/`; const found = new Set<string>();
  const walk = (value: unknown, depth = 0) => {
    if (depth > 6 || value == null) return;
    if (typeof value === "string") { if (value.startsWith(prefix) && !value.includes("..") && !value.startsWith("http")) found.add(value); return; }
    if (Array.isArray(value)) return value.forEach((item) => walk(item, depth + 1));
    if (typeof value === "object") Object.values(value as Record<string, unknown>).forEach((item) => walk(item, depth + 1));
  };
  documents.forEach((item) => walk(item.data)); return [...found].sort();
}
async function retentionDays(tenantId: string) {
  const snap = await adminDb.collection("tenant_settings").doc(tenantId).get();
  const configured = Number(snap.data()?.dataRetention?.trashDays || snap.data()?.trashRetentionDays || 30);
  return Math.max(7, Math.min(365, Number.isFinite(configured) ? Math.round(configured) : 30));
}
async function createTrashItem(input: { tenantId: string; entity: "chat" | "lead"; entityId: string; label: string; documents: TrashSnapshotDoc[]; parentTrashId?: string }) {
  const original = input.documents.find(item => item.collection === (input.entity === "lead" ? "leads" : "chats") && item.id === input.entityId);
  if (!original?.sourceCreateTime) throw new Error("Documento original sem identidade de criacao.");
  // The manifest itself is the durable reservation. Never steal an interrupted
  // generation: its archived records may already be the only surviving copies.
  const generation = `${original.sourceCreateTime.seconds}:${original.sourceCreateTime.nanoseconds}`;
  const operationId = createHash("sha256").update(`${input.tenantId}\0${input.entity}\0${input.entityId}\0${generation}`).digest("hex");
  const ref = adminDb.collection("tenant_trash").doc(`operation_${operationId}`);
  const paths = input.entity === "chat" ? storagePaths(input.documents, input.tenantId, input.entityId) : [];
  const counts = input.documents.reduce<Record<string, number>>((acc, item) => ({ ...acc, [item.collection]: (acc[item.collection] || 0) + 1 }), {});
  const days = await retentionDays(input.tenantId);
  try {
    await ref.create({ tenantId: input.tenantId, entity: input.entity, entityId: input.entityId, label: input.label, parentTrashId: input.parentTrashId || null, schemaVersion: 2, status: "creating", deletionState: "preparing", manifestComplete: false, expectedDocumentCount: input.documents.length, expectedStorageObjectCount: paths.length, collectionCounts: counts, retentionDays: days, createdAt: FieldValue.serverTimestamp(), expiresAt: new Date(Date.now() + days * 86400000) });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 6) throw new TenantDeletionConflict("Ja existe uma exclusao deste registro em andamento ou aguardando recuperacao. Revise a lixeira antes de tentar novamente.");
    throw error;
  }
  const writer = adminDb.bulkWriter();
  const writes = [
    ...input.documents.map(item => writer.set(ref.collection("documents").doc(snapshotId(item)), item)),
    ...paths.map(path => writer.set(ref.collection("storage_objects").doc(createHash("sha256").update(path).digest("hex")), { path })),
  ];
  // Drain every write before marking preparation failed. Recovery may only
  // verify a stopped writer, never race a writer that can still append copies.
  const outcomes = await Promise.allSettled([...writes, writer.close()]);
  const failed = outcomes.find(result => result.status === "rejected");
  if (failed?.status === "rejected") {
    await ref.update({ status: "incomplete", deletionState: "preparation_failed", updatedAt: FieldValue.serverTimestamp() });
    throw failed.reason;
  }
  const [docCount, objectCount] = await Promise.all([ref.collection("documents").count().get(), ref.collection("storage_objects").count().get()]);
  const storedDocumentCount = docCount.data().count; const storedStorageObjectCount = objectCount.data().count;
  const complete = storedDocumentCount === input.documents.length && storedStorageObjectCount === paths.length;
  await ref.update({ status: complete ? "active" : "incomplete", deletionState: complete ? "prepared" : "preparation_failed", manifestComplete: complete, documentCount: storedDocumentCount, storageObjectCount: storedStorageObjectCount, updatedAt: FieldValue.serverTimestamp() });
  if (!complete) throw new Error("Manifesto da lixeira incompleto; nenhum dado original foi removido.");
  return ref;
}
async function manifestDocuments(ref: FirebaseFirestore.DocumentReference) {
  const rows: TrashSnapshotDoc[] = []; let cursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  do { let q: FirebaseFirestore.Query = ref.collection("documents").orderBy(FieldPath.documentId()).limit(PAGE); if (cursor) q = q.startAfter(cursor); const s = await q.get(); rows.push(...s.docs.map((d) => d.data() as TrashSnapshotDoc)); cursor = s.size === PAGE ? s.docs[s.docs.length - 1] : null; } while (cursor);
  return rows;
}
async function assertComplete(ref: FirebaseFirestore.DocumentReference, tenantId: string) {
  const snap = await ref.get(); if (!snap.exists || clean(snap.data()?.tenantId, 180) !== tenantId) throw new Error("Item da lixeira nao encontrado.");
  const data = snap.data()!; const count = (await ref.collection("documents").count().get()).data().count;
  if (data.manifestComplete !== true || clean(data.status, 40) !== "active" || count !== Number(data.expectedDocumentCount)) throw new Error("Manifesto incompleto: restauracao ou expurgo bloqueado.");
  return data;
}
async function deleteManifestOriginals(ref: FirebaseFirestore.DocumentReference, parentGuard?: DeletionGuard, remainingQueries: FirebaseFirestore.Query[] = [], authority?: TenantDeletionAuthority) {
  const documents = await manifestDocuments(ref), manifest = (await ref.get()).data()!;
  const rootCollection = manifest.entity === "lead" ? "leads" : "chats";
  const root = documents.find(item => item.collection === rootCollection && item.id === manifest.entityId);
  if (!root) throw new TenantDeletionConflict();
  const guard: DeletionGuard = { ref: adminDb.collection(root.collection).doc(root.id), data: root.data, sourceCreateTime: root.sourceCreateTime };
  const targets = documents.filter(item => item !== root).concat(root);
  try {
    // Validate the entire snapshot before the first deletion. Every subsequent
    // page repeats the root/parent guard, so a reassignment invalidates its commit.
    await assertUnchangedDocuments(targets);
    for (let offset = 0; offset < targets.length; offset += 200) {
      const page = targets.slice(offset, offset + 200), finalPage = offset + 200 >= targets.length;
      await adminDb.runTransaction(async tx => {
        const [currentRoot, currentParent, currentPage, remaining] = await Promise.all([
          tx.get(guard.ref), parentGuard ? tx.get(parentGuard.ref) : Promise.resolve(null),
          Promise.all(page.map(item => tx.get(adminDb.collection(item.collection).doc(item.id)))),
          finalPage ? Promise.all(remainingQueries.map(query => tx.get(query.limit(201)))) : Promise.resolve([]),
        ]);
        if (!sameOriginal(currentRoot, guard) || (parentGuard && (!currentParent || !sameOriginal(currentParent, parentGuard)))) throw new TenantDeletionConflict();
        const pagePaths = new Set(page.map(item => `${item.collection}/${item.id}`));
        if (remaining.some(snapshot => snapshot.docs.some(doc => !pagePaths.has(doc.ref.path)))) throw new TenantDeletionConflict();
        for (let index = 0; index < currentPage.length; index++) {
          if (currentPage[index].exists && !sameOriginal(currentPage[index], page[index])) throw new TenantDeletionConflict();
        }
        if (authority) await assertDeletionAuthority(tx, { tenantId: manifest.tenantId, authority,
          entity: manifest.entity, record: currentRoot.data()!, parent: currentParent?.data() });
        for (const snapshot of currentPage) if (snapshot.exists) tx.delete(snapshot.ref);
        tx.update(ref, { deletionState: finalPage ? "completed" : "deleting", deletedDocumentCount: offset + page.length, updatedAt: FieldValue.serverTimestamp() });
      });
    }
    return documents.length;
  } catch (error) {
    await ref.update({ deletionState: error instanceof TenantDeletionConflict ? "conflict" : "interrupted", deletionError: error instanceof Error ? error.message : "Falha ao concluir exclusao.", updatedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}

/** Older lead manifests omitted internal jobs. Move only this deleted lead's
 * surviving records into its existing manifest before restore or purge. Each
 * page commits the proof, removals and counts together; retries keep the IDs. */
async function absorbLegacyLeadJobs(ref: FirebaseFirestore.DocumentReference, tenantId: string, allowRestorationResume = false) {
  const initial = await assertComplete(ref, tenantId);
  if (initial.entity !== "lead") return;
  const leadId = clean(initial.entityId, 180);
  if (!leadId || leadId.includes("/")) throw new Error("Manifesto de cliente sem identidade valida.");
  let cursor: string | null = null;
  do {
    const afterId: string | null = cursor;
    cursor = await adminDb.runTransaction(async tx => {
      const [root, lead] = await Promise.all([tx.get(ref), tx.get(adminDb.collection("leads").doc(leadId))]);
      const data = root.data();
      if (!data || data.tenantId !== tenantId || data.entity !== "lead" || data.entityId !== leadId ||
          data.status !== "active" || data.manifestComplete !== true) throw new Error("Manifesto alterado durante revisao de execucoes antigas.");
      if (lead.exists) {
        const archivedLead = (await tx.get(ref.collection("documents").doc(snapshotId({ collection: "leads", id: leadId })))).data() as TrashSnapshotDoc | undefined;
        const originalStillPresent = archivedLead?.sourceCreateTime && lead.createTime?.isEqual(archivedLead.sourceCreateTime) && isDeepStrictEqual(lead.data(), archivedLead.data);
        if (!allowRestorationResume || !archivedLead || archivedLead.collection !== "leads" || archivedLead.id !== leadId ||
            (!originalStillPresent && !isUnchangedRestoration(lead.data()!, archivedLead, ref.id, new Map()))) {
          throw new Error("Cliente ja existe fora da lixeira; revisar antes de restaurar ou expurgar execucoes antigas.");
        }
      }
      let query: FirebaseFirestore.Query = adminDb.collection("jobs").where("tenantId", "==", tenantId).where("leadId", "==", leadId)
        .orderBy(FieldPath.documentId()).limit(200);
      if (afterId) query = query.startAfter(afterId);
      const page = await tx.get(query), jobs = page.docs.filter(job => !job.data().chatId);
      const targets = jobs.map(job => ref.collection("documents").doc(snapshotId({ collection: "jobs", id: job.id })));
      const archived = await Promise.all(targets.map(target => tx.get(target)));
      let added = 0;
      const absorbed: number[] = [];
      for (let index = 0; index < jobs.length; index++) {
        const job = jobs[index], previous = archived[index].data();
        if (lead.exists && previous && previous.collection === "jobs" && previous.id === job.id &&
            (isDeepStrictEqual(previous.data, job.data()) || isUnchangedRestoration(job.data(), previous as TrashSnapshotDoc, ref.id, new Map()))) continue;
        if (lead.exists) throw new Error("Execucao ativa diverge do recibo arquivado; conciliar antes de restaurar ou expurgar.");
        if (previous && (previous.collection !== "jobs" || previous.id !== job.id || !isDeepStrictEqual(previous.data, job.data()))) {
          throw new Error("Execucao ativa diverge do recibo arquivado; conciliar antes de restaurar ou expurgar.");
        }
        if (!previous) added++;
        absorbed.push(index);
      }
      for (const index of absorbed) {
        const job = jobs[index];
        if (!archived[index].exists) tx.create(targets[index], { collection: "jobs", id: job.id, data: job.data() });
        tx.delete(job.ref);
      }
      if (absorbed.length) tx.update(ref, { expectedDocumentCount: Number(data.expectedDocumentCount) + added,
        documentCount: Number(data.expectedDocumentCount) + added,
        collectionCounts: { ...(data.collectionCounts || {}), jobs: Number(data.collectionCounts?.jobs || 0) + added },
        legacyJobRepairVersion: 1, legacyJobsAbsorbed: Number(data.legacyJobsAbsorbed || 0) + absorbed.length,
        updatedAt: FieldValue.serverTimestamp() });
      return page.size === 200 ? page.docs[page.docs.length - 1].id : null;
    });
  } while (cursor);
}

export async function deleteTenantChat(input: { tenantId: string; chatId: string; parentTrashId?: string; parentGuard?: DeletionGuard; authority?: TenantDeletionAuthority; authorize?: (chat: Record<string, unknown>) => void | Promise<void> }) {
  const chatRef = adminDb.collection("chats").doc(input.chatId); const chat = await chatRef.get();
  if (!chat.exists) return { deleted: false, related: 0 }; if (clean(chat.data()?.tenantId, 180) !== input.tenantId) throw new Error("Conversa fora do tenant informado.");
  await input.authorize?.(chat.data() as Record<string, unknown>);
  const stateRef = adminDb.collection("chat_state").doc(getChatStateDocId(input.tenantId, input.chatId));
  const [messages, notes, aiJobs, jobs, handoffs, observations, outbound, uploads, outboundLocks, externalSync, turns, canonicalTurns, state] = await Promise.all([
    queryAll("messages", input.tenantId, "chatId", input.chatId), queryAll("chat_notes", input.tenantId, "chatId", input.chatId), queryAll("ai_jobs", input.tenantId, "chatId", input.chatId), queryAll("jobs", input.tenantId, "chatId", input.chatId), queryAll("handoff_events", input.tenantId, "chatId", input.chatId), queryAll("crm_observation_jobs", input.tenantId, "chatId", input.chatId), queryAll("chat_outbound_jobs", input.tenantId, "chatId", input.chatId), queryAll("chat_media_uploads", input.tenantId, "chatId", input.chatId), queryAll("chat_outbound_locks", input.tenantId, "chatId", input.chatId), queryAll("chat_external_sync", input.tenantId, "chatId", input.chatId), queryAll("ai_conversation_turns", input.tenantId, "chatId", input.chatId), queryAll("ai_conversation_turns_v2", input.tenantId, "chatId", input.chatId), stateRef.get(),
  ]);
  const ownState = state.exists && state.data()?.tenantId === input.tenantId && state.data()?.chatId === input.chatId;
  const documents: TrashSnapshotDoc[] = [{ collection: "chats", id: input.chatId, data: chat.data() as Record<string, unknown>, sourceCreateTime: chat.createTime! }, ...messages, ...notes, ...aiJobs, ...jobs, ...handoffs, ...observations, ...outbound, ...uploads, ...outboundLocks, ...externalSync, ...turns, ...canonicalTurns, ...(ownState ? [{ collection: "chat_state", id: state.id, data: state.data() as Record<string, unknown>, sourceCreateTime: state.createTime! }] : [])];
  const trashRef = await createTrashItem({ tenantId: input.tenantId, entity: "chat", entityId: input.chatId, label: clean(chat.data()?.contactName || chat.data()?.contactPhone, 180) || "Conversa", documents, parentTrashId: input.parentTrashId });
  const chatCollections = ["messages", "chat_notes", "ai_jobs", "jobs", "handoff_events", "crm_observation_jobs", "chat_outbound_jobs", "chat_media_uploads", "chat_outbound_locks", "chat_external_sync", "ai_conversation_turns", "ai_conversation_turns_v2"];
  const deleted = await deleteManifestOriginals(trashRef, input.parentGuard, chatCollections.map(collection => adminDb.collection(collection).where("tenantId", "==", input.tenantId).where("chatId", "==", input.chatId)), input.authority);
  return { deleted: true, related: deleted - 1, trashId: trashRef.id };
}
export async function deleteTenantLead(input: { tenantId: string; leadId: string; authority?: TenantDeletionAuthority; authorize?: (lead: Record<string, unknown>) => void }) {
  const leadRef = adminDb.collection("leads").doc(input.leadId); const lead = await leadRef.get(); if (!lead.exists) return { deleted: false, related: 0, chats: 0 }; if (clean(lead.data()?.tenantId, 180) !== input.tenantId) throw new Error("Lead fora do tenant informado.");
  input.authorize?.(lead.data() as Record<string, unknown>);
  const collections = ["lead_notes", "lead_tasks", "lead_events", "appointments", "orcamentos", "financeiro", "budgets", "finance_entries"];
  const [related, events, leadJobs, readIssues] = await Promise.all([Promise.all(collections.map((name) => queryAll(name, input.tenantId, "leadId", input.leadId))), subcollectionAll(`leads/${input.leadId}/events`), queryAll("jobs", input.tenantId, "leadId", input.leadId), subcollectionAll(`leads/${input.leadId}/commercial_read_issues`)]);
  // Chat-linked work belongs to the child chat manifest. Internal causal roots
  // and receipts have no chatId and must follow the lead, preserving their IDs.
  const internalJobs = leadJobs.filter(item => !item.data.chatId);
  const trashRef = await createTrashItem({ tenantId: input.tenantId, entity: "lead", entityId: input.leadId, label: clean(lead.data()?.nome || lead.data()?.empresa || lead.data()?.telefone, 180) || "Contato", documents: [{ collection: "leads", id: input.leadId, data: lead.data() as Record<string, unknown>, sourceCreateTime: lead.createTime! }, ...related.flat(), ...events, ...internalJobs, ...readIssues] });
  try {
    // Check parent records before touching any child conversation.
    await assertUnchangedDocuments(await manifestDocuments(trashRef));
    const parentGuard = { ref: leadRef, data: lead.data() as Record<string, unknown>, sourceCreateTime: lead.createTime! };
    const chats = await queryAll("chats", input.tenantId, "leadId", input.leadId); let chatRelated = 0; for (const chat of chats) { const result = await deleteTenantChat({ tenantId: input.tenantId, chatId: chat.id, parentTrashId: trashRef.id, parentGuard, authority: input.authority }); chatRelated += result.related; }
    const remainingQueries = [...collections, "jobs", "chats"].map(collection => adminDb.collection(collection).where("tenantId", "==", input.tenantId).where("leadId", "==", input.leadId));
    remainingQueries.push(leadRef.collection("events"));
    remainingQueries.push(leadRef.collection("commercial_read_issues"));
    const deleted = await deleteManifestOriginals(trashRef, undefined, remainingQueries, input.authority); return { deleted: true, related: chatRelated + deleted - 1, chats: chats.length, trashId: trashRef.id };
  } catch (error) {
    await trashRef.update({ deletionState: error instanceof TenantDeletionConflict ? "conflict" : "interrupted", deletionError: error instanceof Error ? error.message : "Exclusao interrompida.", updatedAt: FieldValue.serverTimestamp() });
    throw error;
  }
}
export async function listTenantTrash(tenantId: string) {
  const snap = await readQueryPages(adminDb.collection("tenant_trash").where("tenantId", "==", tenantId));
  const iso = (v: unknown) => v && typeof v === "object" && "toDate" in v ? (v as {toDate:()=>Date}).toDate().toISOString() : null;
  const children = new Map<string, FirebaseFirestore.DocumentData[]>();
  for (const doc of snap.docs) {
    const parentId = clean(doc.data().parentTrashId, 180);
    if (parentId) { const rows = children.get(parentId) || []; rows.push(doc.data()); children.set(parentId, rows); }
  }
  return snap.docs.filter(doc => !clean(doc.data().parentTrashId, 180)).map(doc => {
    const d = doc.data(), tree = [d, ...(children.get(doc.id) || [])];
    const complete = tree.every(row => row.status === "active" && row.manifestComplete === true);
    const preparing = tree.some(row => row.status === "creating");
    const preparationFailed = tree.some(row => row.deletionState === "preparation_failed");
    const needsReview = !complete || tree.some(row => row.deletionState && row.deletionState !== "completed");
    const canPurge = complete && !needsReview;
    const canRecover = !preparing && (complete || tree.every(row => (row.status === "active" && row.manifestComplete === true) || row.deletionState === "preparation_failed"));
    const recoveryMessage = preparing ? "A cópia de segurança está sendo preparada. Atualize para acompanhar."
      : preparationFailed ? "A preparação foi interrompida. Verifique se a cópia está completa para recuperar."
      : needsReview ? "A exclusão não terminou. Recupere os registros; alterações recentes serão preservadas."
      : "";
    return { id: doc.id, entity: clean(d.entity, 40), entityId: clean(d.entityId, 180), parentTrashId: clean(d.parentTrashId, 180), label: clean(d.label, 180) || "Item apagado",
      documentCount: tree.reduce((total, row) => total + Number(row.documentCount || 0), 0), storageObjectCount: tree.reduce((total, row) => total + Number(row.storageObjectCount || 0), 0),
      status: clean(d.status, 40), deletionState: clean(d.deletionState, 40), needsReview, canPurge, canRecover, preparationFailed,
      recoveryMessage, createdAt: iso(d.createdAt), expiresAt: iso(d.expiresAt) };
  }).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function recoverFailedPreparation(ref: FirebaseFirestore.DocumentReference, tenantId: string) {
  const initial = await ref.get(), data = initial.data();
  if (!data || data.tenantId !== tenantId) throw new Error("Item da lixeira nao encontrado.");
  if (data.deletionState !== "preparation_failed") return;
  const [documents, objects] = await Promise.all([ref.collection("documents").count().get(), ref.collection("storage_objects").count().get()]);
  if (documents.data().count !== data.expectedDocumentCount || objects.data().count !== data.expectedStorageObjectCount) {
    throw new TenantDeletionConflict("Copia de seguranca incompleta. Os registros originais foram preservados; solicite revisao antes de recuperar este item.");
  }
  await adminDb.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || !current.updateTime?.isEqual(initial.updateTime!)) throw new TenantDeletionConflict("Recuperacao em andamento ou item alterado. Atualize a lixeira.");
    // Only a drained, failed preparation can be repaired. A running or crashed
    // writer in 'creating' is deliberately not taken over by this path.
    tx.update(ref, { status: "active", manifestComplete: true, deletionState: "interrupted",
      documentCount: documents.data().count, storageObjectCount: objects.data().count, preparationRecoveredAt: FieldValue.serverTimestamp() });
  });
}
const RESUMABLE_JOB_STATUSES = new Set(["ready", "pending", "retrying", "processing"]);
function restoredDocument(item: TrashSnapshotDoc, trashId: string, outbound: Map<string, TrashSnapshotDoc>) {
  const data = { ...item.data, restoredAt: FieldValue.serverTimestamp() };
  if (item.collection === "lead_tasks") return withCommercialTaskIndex(data);
  if (item.collection === "leads") return { ...data, restorationTrashId: trashId };
  const requiresReview = RESUMABLE_JOB_STATUSES.has(String(item.data.status));
  if (item.collection === "chat_outbound_jobs" && requiresReview) {
    return { ...data, status: "reconciliation_required", restorationPreviousStatus: item.data.status,
      restorationTrashId: trashId, error: "Envio anterior a exclusao; revisar antes de retomar.",
      errorCode: "RESTORED_DELIVERY_REQUIRES_REVIEW", reconciliationReason: "restored_from_trash" };
  }
  if (item.collection === "messages") {
    const job = outbound.get(String(item.data.outboundJobId));
    if (job && job.data.messageId === item.id && job.data.tenantId === item.data.tenantId && job.data.chatId === item.data.chatId &&
        RESUMABLE_JOB_STATUSES.has(String(job.data.status)) &&
        ![item.data.status, item.data.deliveryStatus].some(status => ["sent", "delivered", "read"].includes(String(status)))) {
      return { ...data, status: "pending_confirmation", deliveryStatus: "confirmation_pending",
        deliveryError: "Envio anterior a exclusao; revisar antes de retomar.", deliveryErrorCode: "RESTORED_DELIVERY_REQUIRES_REVIEW" };
    }
  }
  if (item.collection === "jobs" && requiresReview) {
    // Restoring records is not authorization to resume an old business action.
    // Preserve terminal receipts and attempts; uncertain effects stay quarantined.
    return { ...data, status: "reconciliation_required", restorationPreviousStatus: item.data.status,
      restorationTrashId: trashId, lastError: "Acao anterior a exclusao; revisar recibos e autorizacao antes de retomar." };
  }
  return data;
}
function isUnchangedRestoration(current: Record<string, unknown>, item: TrashSnapshotDoc, trashId: string, outbound: Map<string, TrashSnapshotDoc>) {
  if (!current.restoredAt || typeof current.restoredAt !== "object" || !("toMillis" in current.restoredAt)) return false;
  const expected: Record<string, unknown> = { ...restoredDocument(item, trashId, outbound) };
  const actual = { ...current };
  delete expected.restoredAt; delete actual.restoredAt;
  if (isDeepStrictEqual(actual, expected)) return true;
  // A partially completed restoration from the previous writer may already
  // contain the exact archived task plus restoredAt. Upgrade only that copy;
  // business edits or arbitrary metadata changes still require reconciliation.
  return item.collection === "lead_tasks" && isDeepStrictEqual(actual, item.data);
}
async function restoreRef(tenantId: string, ref: FirebaseFirestore.DocumentReference) {
  await assertComplete(ref, tenantId);
  const documents = await manifestDocuments(ref);
  const outbound = new Map(documents.filter(item => item.collection === "chat_outbound_jobs").map(item => [item.id, item]));
  const targets = documents.map(item => adminDb.collection(item.collection).doc(item.id));
  const existing: FirebaseFirestore.DocumentSnapshot[] = [];
  for (let offset = 0; offset < targets.length; offset += PAGE) existing.push(...await adminDb.getAll(...targets.slice(offset, offset + PAGE)));
  existing.forEach((snapshot, index) => {
    if (snapshot.exists && !isDeepStrictEqual(snapshot.data(), documents[index].data) &&
        !isUnchangedRestoration(snapshot.data()!, documents[index], ref.id, outbound)) {
      throw new Error("Registro ativo alterado; conciliar antes de retomar restauracao.");
    }
  });
  const writer = adminDb.bulkWriter();
  const writes = documents.map((item, index) => existing[index].exists
    ? writer.update(targets[index], restoredDocument(item, ref.id, outbound), { lastUpdateTime: existing[index].updateTime! })
    : writer.create(targets[index], restoredDocument(item, ref.id, outbound)));
  await Promise.all([...writes, writer.close()]);
  await adminDb.recursiveDelete(ref); return documents.length;
}
export async function restoreTenantTrash(input: { tenantId: string; trashId: string; actorId?: string; actorName?: string }) {
  const ref = adminDb.collection("tenant_trash").doc(input.trashId);
  const children = await adminDb.collection("tenant_trash").where("parentTrashId", "==", input.trashId).get();
  await recoverFailedPreparation(ref, input.tenantId);
  for (const child of children.docs) { await recoverFailedPreparation(child.ref, input.tenantId); await assertComplete(child.ref, input.tenantId); }
  await absorbLegacyLeadJobs(ref, input.tenantId, true);
  let restored = 0;
  for (const child of children.docs) restored += await restoreRef(input.tenantId, child.ref);
  restored += await restoreRef(input.tenantId, ref);
  await adminDb.collection("deletion_audits").add({ tenantId: input.tenantId, trashId: input.trashId, action: "restored_from_trash",
    actorId: input.actorId || "system", actorName: input.actorName || "Sistema", restored, createdAt: FieldValue.serverTimestamp() });
  return { restored };
}
async function storageManifest(ref: FirebaseFirestore.DocumentReference) { const snap = await ref.collection("storage_objects").get(); return snap.docs.map((doc) => clean(doc.data().path, 900)).filter(Boolean); }
export async function deleteTenantTrashPermanently(input: { tenantId: string; trashId: string; actorId?: string; actorName?: string }) {
  const root = adminDb.collection("tenant_trash").doc(input.trashId); const children = await adminDb.collection("tenant_trash").where("parentTrashId", "==", input.trashId).get(); const refs = [...children.docs.map((d) => d.ref), root]; const manifests = [] as Array<{ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData; paths: string[]}>;
  for (const ref of refs) {
    const data = await assertComplete(ref, input.tenantId);
    if (data.deletionState && data.deletionState !== "completed") throw new TenantDeletionConflict("Exclusao incompleta: recupere ou concilie os registros antes de excluir a copia de seguranca.");
  }
  await absorbLegacyLeadJobs(root, input.tenantId);
  for (const ref of refs) manifests.push({ ref, data: await assertComplete(ref, input.tenantId), paths: await storageManifest(ref) });
  const paths = [...new Set(manifests.flatMap((item) => item.paths))]; await Promise.all(paths.map((path) => storageBucket().file(path).delete({ ignoreNotFound: true })));
  const documentCount = manifests.reduce((sum, item) => sum + Number(item.data.expectedDocumentCount || 0), 0); const certificateId = `trash_purge_${input.trashId}`;
  await adminDb.collection("deletion_certificates").doc(certificateId).set({ tenantId: input.tenantId, trashId: input.trashId, entity: manifests.at(-1)?.data.entity || null, entityId: manifests.at(-1)?.data.entityId || null, documentCount, storageObjectCount: paths.length, actorId: input.actorId || "retention_worker", actorName: input.actorName || "Retencao automatica", status: "completed", purgedAt: FieldValue.serverTimestamp() }, { merge: true });
  for (const item of manifests) await adminDb.recursiveDelete(item.ref); return { deleted: refs.length, documentCount, storageObjectCount: paths.length, certificateId };
}
export async function purgeExpiredTenantTrash(input?: { tenantId?: string }) {
  let query = adminDb.collection("tenant_trash").where("expiresAt", "<=", new Date());
  if (input?.tenantId) query = query.where("tenantId", "==", input.tenantId);
  const ordered = query.orderBy("expiresAt").orderBy(FieldPath.documentId());
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let purged = 0, needsReview = 0, failed = 0;
  for (;;) {
    const page = await (cursor ? ordered.startAfter(cursor) : ordered).limit(200).get();
    for (const doc of page.docs.filter(item => !clean(item.data().parentTrashId, 180))) {
      const data = doc.data();
      if (data.status !== "active" || data.manifestComplete !== true || (data.deletionState && data.deletionState !== "completed")) { needsReview++; continue; }
      try { await deleteTenantTrashPermanently({ tenantId: clean(data.tenantId, 180), trashId: doc.id }); purged++; }
      catch (error) { if (error instanceof TenantDeletionConflict) needsReview++; else failed++; }
    }
    if (page.size < 200) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { purged, needsReview, failed, coverageComplete: true };
}
export async function recordDeletionAudit(input: { tenantId: string; actorId: string; actorName: string; entity: "chat" | "lead"; ids: string[] }) { await adminDb.collection("deletion_audits").add({ ...input, count: input.ids.length, entityIds: input.ids.slice(0, 100), action: "moved_to_trash", createdAt: FieldValue.serverTimestamp() }); }
