import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { isExactCrmRecordId as valid } from "@/lib/crm-observation-identity";
import { commercialRecordIdentity } from "@/lib/crm-commercial-record";
import { assertTransactionalTenantAuthority } from "@/lib/server/tenant-operation-authority";
import { assertTenantCapability } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { contactLinkReader, contactLinkedLeadIds } from "./contact-links";
import { observationSnapshotVersion as version } from "./observation-receipt-identity";

export class ConversationSelectionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Actor = { tenantId: string; chatId: string; userId: string; userName: string };
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const changed = () => new ConversationSelectionError(409, "commercial_context_changed", "A conversa ou o vínculo do cliente mudou. Atualize antes de escolher a negociação.");

async function authority(tx: FirebaseFirestore.Transaction, actor: Actor, write: boolean) {
  if (![actor.tenantId, actor.chatId, actor.userId].every(id => valid(id))) throw new ConversationSelectionError(400, "invalid_context", "Conversa inválida.");
  const membership = await assertTransactionalTenantAuthority(tx, { ...actor, module: "crm", ...(write ? { capability: "edit_leads" as const } : {}) });
  await assertTenantModule(actor.tenantId, "inbox");
  if (write) assertTenantCapability(membership, "respond_inbox");
  const chat = await tx.get(adminDb.collection("chats").doc(actor.chatId)), row = chat.data();
  if (!row || row.tenantId !== actor.tenantId) throw new ConversationSelectionError(404, "chat_not_found", "Conversa não encontrada.");
  if (row.isGroup === true || row.conversationType === "group" || /@g\.us$/i.test(String(row.groupJid || row.contactPhone || "")))
    throw new ConversationSelectionError(409, "group_context_unsupported", "Conversas em grupo não podem ser vinculadas a uma negociação individual.");
  const access = { ...row };
  if (row.channelId) {
    if (!valid(row.channelId)) throw changed();
    const channel = await tx.get(adminDb.collection("tenant_channels").doc(row.channelId));
    if (channel.data()?.tenantId !== actor.tenantId) throw changed();
    access.channelScope = channel.data()?.channelScope; access.channelOwnerUserId = channel.data()?.ownerUserId;
  }
  assertAssignedCommercialRecordAccess(membership, actor.userId, access);
  if (!valid(row.leadId)) throw changed();
  const lead = await tx.get(adminDb.collection("leads").doc(row.leadId));
  if (lead.data()?.tenantId !== actor.tenantId) throw changed();
  assertAssignedCommercialRecordAccess(membership, actor.userId, lead.data()!);
  return { membership, chat, lead };
}

export async function readConversationSelection(actor: Actor) {
  return adminDb.runTransaction(async tx => {
    const { chat, lead } = await authority(tx, actor, false);
    return { revision: version(chat.updateTime), lead: { id: lead.id, ...commercialRecordIdentity(lead.data()!) },
      selection: chat.data()!.commercialContext || null,
      answeringAgentContext: chat.data()!.commercialContext ? "requires_isolated_memory" : "legacy_policy",
      historyBoundary: chat.data()!.commercialContext ? "new_messages_only" : "legacy_history" };
  }, { readOnly: true });
}

/** Explicit human association only. No reply, replay, model call or AI resume. */
export async function selectConversationContext(actor: Actor, body: unknown) {
  const input = object(body);
  if (Object.keys(input).some(key => !["revision", "requestId", "mode", "leadId"].includes(key)) ||
      typeof input.revision !== "string" || !/^\d+:\d{1,9}$/.test(input.revision) || !valid(input.requestId) ||
      !["opportunity", "relationship"].includes(String(input.mode)) ||
      (input.mode === "opportunity" ? !valid(input.leadId) : input.leadId !== null))
    throw new ConversationSelectionError(400, "invalid_selection", "Escolha uma negociação ou atendimento sem negociação e atualize a conversa antes de salvar.");
  return adminDb.runTransaction(async tx => {
    const { chat, lead, membership } = await authority(tx, actor, true), row = chat.data()!;
    const id = `context_${hash([actor.tenantId, actor.chatId, version(chat.createTime), actor.userId, input.requestId])}`;
    const ref = chat.ref.collection("commercial_context_events").doc(id), previous = await tx.get(ref);
    const requestHash = hash([input.mode, input.leadId]);
    if (previous.exists) {
      if (previous.data()?.tenantId !== actor.tenantId || previous.data()?.requestHash !== requestHash || previous.data()?.actorId !== actor.userId) throw changed();
      if (input.mode === "opportunity") {
        const target = await tx.get(adminDb.collection("leads").doc(input.leadId as string));
        if (target.data()?.tenantId !== actor.tenantId) throw changed();
        assertAssignedCommercialRecordAccess(membership, actor.userId, target.data()!);
      }
      return { selectionId: id, deduped: true, isCurrent: row.commercialContext?.id === id, automaticAnswerReady: false };
    }
    if (version(chat.updateTime) !== input.revision) throw changed();
    const reader = contactLinkReader(actor.tenantId, tx), sourceContactId = lead.data()!.contactId;
    let person: FirebaseFirestore.DocumentSnapshot | null = null;
    if (sourceContactId) {
      person = await reader(sourceContactId);
      if (!contactLinkedLeadIds(person.data()!).includes(lead.id)) throw changed();
    }
    let target = lead;
    if (input.mode === "opportunity") {
      target = await tx.get(adminDb.collection("leads").doc(input.leadId as string));
      if (target.data()?.tenantId !== actor.tenantId) throw new ConversationSelectionError(404, "opportunity_not_found", "Negociação não encontrada.");
      assertAssignedCommercialRecordAccess(membership, actor.userId, target.data()!);
      if (target.id !== lead.id) {
        if (!person || !target.data()?.contactId || !contactLinkedLeadIds(person.data()!).includes(target.id)) throw changed();
        const targetPerson = await reader(target.data()!.contactId);
        if (targetPerson.id !== person.id || !targetPerson.createTime!.isEqual(person.createTime!)) throw changed();
      }
    }
    const selection = { version: 1, id, mode: input.mode, leadId: input.mode === "opportunity" ? target.id : null,
      leadGeneration: input.mode === "opportunity" ? version(target.createTime) : null,
      contactId: person?.id || null, contactGeneration: version(person?.createTime), chatGeneration: version(chat.createTime),
      actorId: actor.userId, actorName: actor.userName, selectedAt: FieldValue.serverTimestamp() };
    tx.update(chat.ref, { commercialContext: selection,
      ...(input.mode === "opportunity" ? { leadId: target.id } : {}), updatedAt: FieldValue.serverTimestamp() });
    tx.create(ref, { tenantId: actor.tenantId, chatId: actor.chatId, type: "commercial_context_selected", requestHash,
      before: { leadId: lead.id, selectionId: row.commercialContext?.id || null }, selection,
      actorId: actor.userId, actorName: actor.userName, createdAt: FieldValue.serverTimestamp() });
    return { selectionId: id, deduped: false, isCurrent: true, automaticAnswerReady: false };
  });
}
