import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertAssignedCommercialRecordAccess, canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import { commercialReadNotice, type CommercialReadState } from "@/lib/crm-read-state";
import { isConversationMessageId } from "@/lib/conversation-source-link";
import { QualificationReviewError } from "./qualification-review";

type Context = { tenantId: string; leadId: string; userId: string; userName: string };
const valid = (value: unknown): value is string => typeof value === "string" && !!value && value === value.trim() && value.length <= 180 && !value.includes("/");
const revision = (snap: FirebaseFirestore.DocumentSnapshot) => `${snap.updateTime!.seconds}:${snap.updateTime!.nanoseconds}`;
async function authority(tx: FirebaseFirestore.Transaction, context: Context) {
  if (![context.tenantId, context.leadId, context.userId].every(valid)) throw new QualificationReviewError(400, "invalid_context", "Cliente inválido.");
  const membership = await assertTransactionalTenantAuthority(tx, { ...context, module: "crm", capability: "edit_leads" });
  const lead = await tx.get(adminDb.collection("leads").doc(context.leadId));
  if (!lead.exists || lead.data()?.tenantId !== context.tenantId) throw new QualificationReviewError(404, "lead_not_found", "Cliente não encontrado.");
  assertAssignedCommercialRecordAccess(membership, context.userId, lead.data()!);
  return { lead, membership };
}
async function source(tx: FirebaseFirestore.Transaction, context: Context, membership: Awaited<ReturnType<typeof authority>>["membership"], state: CommercialReadState) {
  if (!valid(state?.chatId) || !isConversationMessageId(state?.messageId)) return null;
  const chat = await tx.get(adminDb.collection("chats").doc(state.chatId));
  if (!chat.exists || chat.data()?.tenantId !== context.tenantId || chat.data()?.leadId !== context.leadId) return null;
  const access = { ...chat.data() };
  let channelGeneration = "";
  if (access.channelId) {
    if (!valid(access.channelId)) return null;
    const channel = await tx.get(adminDb.collection("tenant_channels").doc(access.channelId));
    if (channel.data()?.tenantId !== context.tenantId) return null;
    channelGeneration = `${channel.id}:${channel.createTime!.seconds}:${channel.createTime!.nanoseconds}`;
    access.channelScope = channel.data()?.channelScope; access.channelOwnerUserId = channel.data()?.ownerUserId;
  }
  if (!canAccessAssignedCommercialRecord(membership, context.userId, access)) return null;
  const message = await tx.get(adminDb.collection("messages").doc(state.messageId));
  if (!message.exists || message.data()?.tenantId !== context.tenantId || message.data()?.chatId !== state.chatId ||
      message.data()?.leadId && message.data()?.leadId !== context.leadId || message.createTime!.toMillis() !== state.sourceCreatedAtMs) return null;
  const order = `${String(message.createTime!.seconds).padStart(12, "0")}:${String(message.createTime!.nanoseconds).padStart(9, "0")}`;
  if (state.sourceOrder && state.sourceOrder !== order) return null;
  const contextRevision = createHash("sha256").update(`${chat.id}:${chat.createTime!.seconds}:${chat.createTime!.nanoseconds}:${channelGeneration}`).digest("hex");
  return { message, contextRevision };
}

export async function listCommercialReadIssues(context: Context, cursor?: string) {
  if (cursor && !/^[a-f0-9]{64}$/.test(cursor)) throw new QualificationReviewError(400, "invalid_cursor", "Página inválida.");
  return adminDb.runTransaction(async tx => {
    const { lead, membership } = await authority(tx, context), summary = lead.data()?.aiCommercialReadState;
    if (summary?.issuesVersion !== 1 || typeof summary.issuesScope !== "string") return { items: [], nextCursor: null };
    let query = lead.ref.collection("commercial_read_issues").where("scope", "==", summary.issuesScope).where("resolved", "==", false).orderBy(FieldPath.documentId()).limit(21);
    if (cursor) query = query.startAfter(cursor);
    const rows = await tx.get(query), items = [];
    for (const issue of rows.docs.slice(0, 20)) {
      const state = issue.data().state as CommercialReadState;
      const sourceContext = await source(tx, context, membership, state), notice = commercialReadNotice(state);
      if (!sourceContext || !notice) continue;
      items.push({ id: issue.id, revision: revision(issue), sourceRevision: revision(sourceContext.message),
        leadGeneration: `${lead.createTime!.seconds}:${lead.createTime!.nanoseconds}`, contextRevision: sourceContext.contextRevision, title: notice.title,
        href: notice.href, occurredAtMs: state.occurredAtMs, kind: String(sourceContext.message.data()?.type || "text") });
    }
    return { items, nextCursor: rows.size > 20 ? rows.docs[19].id : null };
  }, { readOnly: true });
}

export async function reviewCommercialReadIssue(context: Context, body: unknown) {
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  if (typeof input.id !== "string" || !/^[a-f0-9]{64}$/.test(input.id) || typeof input.revision !== "string" || !/^\d+:\d{1,9}$/.test(input.revision) ||
      typeof input.sourceRevision !== "string" || !/^\d+:\d{1,9}$/.test(input.sourceRevision) ||
      typeof input.leadGeneration !== "string" || !/^\d+:\d{1,9}$/.test(input.leadGeneration) ||
      typeof input.contextRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.contextRevision) ||
      typeof input.note !== "string" || !input.note.trim() || input.note.trim().length > 600 || input.confirmed !== true)
    throw new QualificationReviewError(400, "invalid_review", "Confirme a conferência e registre uma observação de até 600 caracteres.");
  const note = input.note.trim();
  return adminDb.runTransaction(async tx => {
    const { lead, membership } = await authority(tx, context), summary = lead.data()!.aiCommercialReadState;
    if (`${lead.createTime!.seconds}:${lead.createTime!.nanoseconds}` !== input.leadGeneration)
      throw new QualificationReviewError(409, "lead_changed", "O cliente foi recriado ou restaurado. Reabra a lista de pendências.");
    const ref = lead.ref.collection("commercial_read_issues").doc(input.id as string), issue = await tx.get(ref);
    if (!issue.exists || issue.data()?.scope !== summary?.issuesScope || issue.data()?.resolved !== false || revision(issue) !== input.revision)
      throw new QualificationReviewError(409, "issue_changed", "A pendência mudou. Atualize a lista antes de conferir.");
    const sourceContext = await source(tx, context, membership, issue.data()!.state);
    if (!sourceContext || revision(sourceContext.message) !== input.sourceRevision || sourceContext.contextRevision !== input.contextRevision)
      throw new QualificationReviewError(409, "source_changed", "A mensagem mudou ou não está mais acessível. Atualize a lista.");
    const message = sourceContext.message;
    const other = await tx.get(lead.ref.collection("commercial_read_issues").where("scope", "==", summary.issuesScope).where("resolved", "==", false).limit(2));
    const remaining = other.docs.find(row => row.id !== ref.id)?.data()?.state || null;
    tx.update(ref, { resolved: true, resolution: "manual", reviewedSourceRevision: revision(message),
      reviewedBy: context.userId, reviewNote: note, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(lead.ref, { "aiCommercialReadState.pendingCount": Math.max(0, Number(summary.pendingCount || 0) - 1),
      "aiCommercialReadState.pendingSource": remaining, updatedAt: FieldValue.serverTimestamp() });
    const event = lead.ref.collection("events").doc();
    tx.create(event, { tenantId: context.tenantId, type: "commercial_read_reviewed", title: "Mensagem conferida pela equipe",
      detail: note, actorId: context.userId, actorName: context.userName,
      messageId: message.id, chatId: issue.data()!.state.chatId, issueId: issue.id, createdAt: FieldValue.serverTimestamp() });
    return { eventId: event.id };
  });
}
