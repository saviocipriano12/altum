import {createHash} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {hasTenantCapability, TenantAccessError} from "@/lib/server/tenant";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import {assertAssignedCommercialRecordAccess} from "@/lib/server/commercial-access";
import {balanceLeadAssignments, eligibleLeadSellers, randomLeadAssignments, type LeadAssignmentMember} from "@/lib/lead-assignment";
import {normalizePipelineStageId} from "@/lib/pipeline";
import {prepareAppointmentOwnerTransfers} from "@/lib/server/crm/appointment-mutation";

export class AssignmentChangeError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}
export type AssignmentMode = "balanced" | "random" | "specific" | "unassign";
type Assignment = {leadId: string; userId: string | null; userName: string | null};
const clean = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const idValid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 180 && value.trim() === value && !value.includes("/");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ownerId = (row: Record<string, unknown>) => clean(row.ownerId || row.ownerUserId || row.assignedTo || row.assignedUserId);
const ownerName = (row: Record<string, unknown>) => clean(row.ownerName || row.owner || row.assignedUserName, 140) || null;
const closed = (row: Record<string, unknown>) => ["ganho", "perdido", "won", "lost", "closed_won", "closed_lost"].includes(normalizePipelineStageId(row.pipelineStage || row.stage || "")) || ["archived", "deleted"].includes(clean(row.status).toLowerCase());
const collections = ["chats", "appointments", "lead_tasks", "orcamentos", "financeiro"] as const;
const mutableFields = ["ownerId", "ownerUserId", "assignedTo", "assignedUserId", "owner", "ownerName", "assignedUserName", "assignedAt", "assignedBy", "assignedByName", "assignmentMode", "assignmentOccurrenceId"];
const timestampEqual = (value: unknown, expected: FirebaseFirestore.Timestamp | undefined) => Boolean(expected && value && typeof value === "object" && "isEqual" in value && typeof value.isEqual === "function" && value.isEqual(expected));
// The immutable receipt is created in the same commit as the target update.
// Compare their Firestore write revisions, not a serverTimestamp field (which
// can have different precision from updateTime in the emulator/runtime).
const unchanged = (snapshot: FirebaseFirestore.DocumentSnapshot, receipt: FirebaseFirestore.DocumentData, receiptVersion: FirebaseFirestore.Timestamp) => snapshot.exists &&
  timestampEqual(receipt.generation, snapshot.createTime) && timestampEqual(receiptVersion, snapshot.updateTime);

async function manager(tx: FirebaseFirestore.Transaction, tenantId: string, userId: string) {
  const membership = await assertTransactionalTenantAuthority(tx, {tenantId, userId, capability: "edit_leads", module: "crm"});
  if (!["view_team_records", "manage_users", "manage_settings"].some(capability => hasTenantCapability(membership, capability as "view_team_records" | "manage_users" | "manage_settings"))) throw new TenantAccessError("tenant_capability_denied", "Somente dono ou gestor pode distribuir oportunidades.");
  return membership;
}
async function linkedRecords(tx: FirebaseFirestore.Transaction, tenantId: string, leadIds: string[]) {
  const result: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  const queries: FirebaseFirestore.Query[] = [];
  for (let offset = 0; offset < leadIds.length; offset += 10) for (const collection of collections) queries.push(adminDb.collection(collection).where("tenantId", "==", tenantId).where("leadId", "in", leadIds.slice(offset, offset + 10)));
  const snapshots = await Promise.all(queries.map(query => tx.get(query)));
  for (const snapshot of snapshots) result.push(...snapshot.docs);
  return result.filter(doc => (doc.ref.parent.id !== "chats" || !["resolved", "archived", "closed", "merged"].includes(clean(doc.data().status).toLowerCase())) &&
    (doc.ref.parent.id !== "lead_tasks" || doc.data().status === "pending"));
}
async function receiver(tx: FirebaseFirestore.Transaction, tenantId: string, userId: string) {
  return assertTransactionalTenantAuthority(tx, {tenantId, userId, capability: "edit_leads", module: "crm"});
}
function beforeFields(row: FirebaseFirestore.DocumentData) {
  return Object.fromEntries(mutableFields.filter(field => Object.prototype.hasOwnProperty.call(row, field)).map(field => [field, row[field]]));
}
function ownershipPatch(assignment: Assignment, actor: {id: string; name: string}, occurrenceId: string, mode: string) {
  return {ownerId: assignment.userId, ownerUserId: assignment.userId, assignedTo: assignment.userId, assignedUserId: assignment.userId,
    owner: assignment.userName, ownerName: assignment.userName, assignedUserName: assignment.userName,
    assignedAt: assignment.userId ? FieldValue.serverTimestamp() : null, assignedBy: actor.id, assignedByName: actor.name,
    assignmentMode: mode, assignmentOccurrenceId: occurrenceId, updatedAt: FieldValue.serverTimestamp()};
}

export async function distributeCommercialLeads(input: {
  tenantId: string; actorId: string; actorName: string; leadIds: string[]; mode: AssignmentMode;
  onlyUnassigned: boolean; assigneeUserId?: string; teamId?: string; requestId?: string;
}) {
  if (!idValid(input.tenantId) || !idValid(input.actorId) || input.leadIds.some(id => !idValid(id)) || input.leadIds.length > 100 ||
    input.requestId !== undefined && !idValid(input.requestId)) throw new AssignmentChangeError(400, "assignment_input_invalid", "Identificadores da distribuição inválidos.");
  const fingerprint = hash([input.leadIds.slice().sort(), input.mode, input.onlyUnassigned, input.assigneeUserId || null, input.teamId || null]);
  const auditRef = input.requestId ? adminDb.collection("audit_logs").doc(`assignment_${hash([input.tenantId, input.actorId, input.requestId])}`) : adminDb.collection("audit_logs").doc();
  return adminDb.runTransaction(async tx => {
    await manager(tx, input.tenantId, input.actorId);
    const existing = await tx.get(auditRef);
    if (existing.exists) {
      const audit = existing.data()!;
      if (audit.tenantId !== input.tenantId || audit.actorId !== input.actorId || audit.requestFingerprint !== fingerprint || audit.assignmentProtocol !== 1) throw new AssignmentChangeError(409, "assignment_request_conflict", "Este pedido já foi usado para outra distribuição.");
      return {...audit.result, replayed: true};
    }
    const [members, leads] = await Promise.all([tx.get(adminDb.collection("tenant_users").where("tenantId", "==", input.tenantId)), tx.get(adminDb.collection("leads").where("tenantId", "==", input.tenantId))]);
    const memberData = await Promise.all(members.docs.map(async doc => {
      const row = doc.data(), userId = clean(row.userId);
      if (!idValid(userId)) return null;
      const user = (await tx.get(adminDb.collection("users").doc(userId))).data() || {};
      return {userId, name: clean(user.name || row.name || row.email, 140) || "Vendedor", role: clean(row.role), accessProfile: clean(row.accessProfile),
        status: [row.status, user.status].some(value => ["blocked", "inactive"].includes(clean(value).toLowerCase())) ? "blocked" : "active",
        capabilities: Array.isArray(row.capabilities) ? row.capabilities : [], availability: clean(row.availability), presenceState: clean(row.presenceState),
        teamId: clean(row.teamId || row.team), maxOpenChats: typeof row.maxOpenChats === "number" ? row.maxOpenChats : null} satisfies LeadAssignmentMember;
    }));
    const sellers = eligibleLeadSellers(memberData.filter((row): row is NonNullable<typeof row> => Boolean(row)));
    const selected = input.mode === "specific" ? sellers.find(seller => seller.userId === input.assigneeUserId) : null;
    if (input.mode !== "unassign" && !sellers.length) throw new AssignmentChangeError(400, "assignment_no_sellers", "Nenhum vendedor ativo está disponível.");
    if (input.mode === "specific" && !selected) throw new AssignmentChangeError(400, "assignment_seller_invalid", "Escolha um vendedor ativo. Gestores e administradores não recebem leads.");
    const requested = new Set(input.leadIds), candidates = leads.docs.filter(doc => (!requested.size || requested.has(doc.id)) && !closed(doc.data()) && (!input.onlyUnassigned || !ownerId(doc.data()))).slice(0, 100);
    const candidateIds = new Set(candidates.map(doc => doc.id)), loads = new Map(sellers.map(seller => [seller.userId, 0]));
    for (const lead of leads.docs) if (!closed(lead.data()) && !candidateIds.has(lead.id)) {const owner = ownerId(lead.data()); if (loads.has(owner)) loads.set(owner, loads.get(owner)! + 1);}
    const assignments: Assignment[] = input.mode === "unassign" ? candidates.map(doc => ({leadId: doc.id, userId: null, userName: null})) : selected ? candidates.map(doc => ({leadId: doc.id, userId: selected.userId, userName: selected.name})) :
      input.mode === "random" ? randomLeadAssignments({leadIds: [...candidateIds], sellers, currentLoads: loads, teamId: input.teamId}) : balanceLeadAssignments({leadIds: [...candidateIds], sellers, currentLoads: loads, teamId: input.teamId});
    const byLead = new Map(assignments.map(assignment => [assignment.leadId, assignment]));
    const targets = candidates.filter(doc => byLead.has(doc.id));
    const linked = await linkedRecords(tx, input.tenantId, [...byLead.keys()]);
    const receiverIds = [...new Set(assignments.map(row => row.userId).filter((id): id is string => Boolean(id)))];
    const receivers = new Map(await Promise.all(receiverIds.map(async id => [id, await receiver(tx, input.tenantId, id)] as const)));
    const channels = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of linked) if (doc.ref.parent.id === "chats" && idValid(doc.data().channelId) && !channels.has(doc.data().channelId)) {
      const channel = (await tx.get(adminDb.collection("tenant_channels").doc(doc.data().channelId))).data();
      if (!channel || channel.tenantId !== input.tenantId) throw new AssignmentChangeError(409, "assignment_channel_changed", "O canal da conversa precisa de revisão antes da transferência.");
      channels.set(doc.data().channelId, channel);
    }
    for (const doc of [...targets, ...linked]) {
      const row = doc.data(), assignment = byLead.get(doc.ref.parent.id === "leads" ? doc.id : row.leadId)!;
      if (assignment.userId) {
        const channel = channels.get(row.channelId);
        assertAssignedCommercialRecordAccess(receivers.get(assignment.userId)!, assignment.userId, {...row, ...ownershipPatch(assignment, {id: input.actorId, name: input.actorName}, auditRef.id, input.mode),
          ...(channel ? {channelScope: channel.channelScope, channelOwnerUserId: channel.ownerUserId} : {})});
      }
    }
    const appointmentOwners = new Map(linked.filter(doc => doc.ref.parent.id === "appointments").map(doc => [doc.id, byLead.get(doc.data().leadId)!.userId]));
    const reserve = await prepareAppointmentOwnerTransfers(tx, input.tenantId, appointmentOwners);
    const previousAssignments = targets.map(doc => ({leadId: doc.id, userId: ownerId(doc.data()) || null, userName: ownerName(doc.data())}));
    for (const doc of [...targets, ...linked]) {
      const row = doc.data(), leadId = doc.ref.parent.id === "leads" ? doc.id : row.leadId, assignment = byLead.get(leadId)!;
      const lead = targets.find(target => target.id === leadId)!;
      tx.create(auditRef.collection("assignment_records").doc(hash(doc.ref.path)), {tenantId: input.tenantId, leadId, leadGeneration: lead.createTime!, path: doc.ref.path,
        generation: doc.createTime!, appliedAt: FieldValue.serverTimestamp(), before: beforeFields(row)});
      tx.update(doc.ref, {...ownershipPatch(assignment, {id: input.actorId, name: input.actorName}, auditRef.id, input.mode), ...(["appointments", "lead_tasks"].includes(doc.ref.parent.id) ? {version: Number(row.version || 0) + 1} : {})});
    }
    for (const assignment of assignments) tx.create(adminDb.collection("leads").doc(assignment.leadId).collection("events").doc(`assignment_${auditRef.id}`), {
      tenantId: input.tenantId, type: "lead_assignment", title: input.mode === "unassign" ? "Responsável removido" : "Responsável alterado", detail: assignment.userName ? `Responsável: ${assignment.userName}` : "Oportunidade sem responsável",
      ownerUserId: assignment.userId, actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp()});
    reserve();
    const result = {ok: true, tenantId: input.tenantId, mode: input.mode, assigned: assignments.length, relatedRecordsUpdated: linked.length, auditId: auditRef.id, undoAvailable: assignments.length > 0, items: assignments};
    tx.create(auditRef, {tenantId: input.tenantId, action: "lead_assignment", assignmentProtocol: 1, requestFingerprint: fingerprint, actorId: input.actorId, actorName: input.actorName,
      mode: input.mode, assignments, previousAssignments, relatedRecordsUpdated: linked.length, result, createdAt: FieldValue.serverTimestamp()});
    return {...result, replayed: false};
  });
}

export async function undoCommercialLeadDistribution(input: {tenantId: string; actorId: string; actorName: string; auditId: string}) {
  if (![input.tenantId, input.actorId, input.auditId].every(idValid)) throw new AssignmentChangeError(400, "assignment_input_invalid", "Distribuição inválida.");
  const auditRef = adminDb.collection("audit_logs").doc(input.auditId);
  return adminDb.runTransaction(async tx => {
    await manager(tx, input.tenantId, input.actorId);
    const auditSnapshot = await tx.get(auditRef), audit = auditSnapshot.data();
    if (!audit || audit.tenantId !== input.tenantId || audit.action !== "lead_assignment") throw new AssignmentChangeError(404, "assignment_not_found", "Distribuição não encontrada.");
    if (audit.undoneAt) return {...audit.undoResult, replayed: true};
    if (audit.assignmentProtocol !== 1) throw new AssignmentChangeError(409, "assignment_legacy_review_required", "Esta distribuição antiga não possui comprovantes suficientes para desfazer com segurança.");
    if (!audit.createdAt?.toMillis || Date.now() - audit.createdAt.toMillis() > 15 * 60_000) throw new AssignmentChangeError(409, "assignment_undo_expired", "O prazo seguro de 15 minutos para desfazer terminou.");
    const receipts = (await tx.get(auditRef.collection("assignment_records"))).docs;
    if (receipts.some(doc => {
      const row = doc.data(), parts = typeof row.path === "string" ? row.path.split("/") : [];
      return row.tenantId !== input.tenantId || !idValid(row.leadId) || parts.length !== 2 || !["leads", ...collections].includes(parts[0]) || !idValid(parts[1]) || !row.before || typeof row.before !== "object" || Array.isArray(row.before);
    })) throw new AssignmentChangeError(409, "assignment_receipt_invalid", "Os comprovantes desta distribuição precisam de revisão.");
    const snapshots = await Promise.all(receipts.map(async receipt => ({receipt: receipt.data(), receiptVersion: receipt.updateTime, snapshot: await tx.get(adminDb.doc(receipt.data().path))})));
    const assignments = (Array.isArray(audit.assignments) ? audit.assignments : []) as Assignment[];
    if (assignments.length > 100 || assignments.some(row => !idValid(row.leadId))) throw new AssignmentChangeError(409, "assignment_receipt_invalid", "O comprovante da distribuição precisa de revisão.");
    const linked = await linkedRecords(tx, input.tenantId, assignments.map(row => row.leadId));
    const safe = assignments.filter(assignment => {
      const group = snapshots.filter(row => row.receipt.leadId === assignment.leadId), parent = group.find(row => row.snapshot.ref.path === `leads/${assignment.leadId}`);
      return parent && unchanged(parent.snapshot, parent.receipt, parent.receiptVersion) && group.every(row => unchanged(row.snapshot, row.receipt, row.receiptVersion) && row.snapshot.data()?.tenantId === input.tenantId &&
        (row.snapshot.ref.parent.id === "leads" ? row.snapshot.id === assignment.leadId : row.snapshot.data()?.leadId === assignment.leadId) &&
        row.snapshot.data()?.assignmentOccurrenceId === input.auditId && timestampEqual(row.receipt.leadGeneration, parent.snapshot.createTime)) &&
        linked.filter(doc => doc.data().leadId === assignment.leadId).every(doc => group.some(row => row.snapshot.ref.path === doc.ref.path));
    });
    if (!safe.length) throw new AssignmentChangeError(409, "assignment_changed_after_distribution", "As oportunidades ou seus registros foram alterados depois da distribuição. Nenhuma alteração foi desfeita.");
    const safeIds = new Set(safe.map(row => row.leadId)), rows = snapshots.filter(row => safeIds.has(row.receipt.leadId));
    const restoreOwnerIds = [...new Set(rows.map(row => ownerId(row.receipt.before || {})).filter(Boolean))];
    const receivers = new Map(await Promise.all(restoreOwnerIds.map(async id => [id, await receiver(tx, input.tenantId, id)] as const)));
    const channels = new Map<string, FirebaseFirestore.DocumentData>();
    for (const row of rows) if (row.snapshot.ref.parent.id === "chats" && idValid(row.snapshot.data()?.channelId) && !channels.has(row.snapshot.data()!.channelId)) {
      const channel = (await tx.get(adminDb.collection("tenant_channels").doc(row.snapshot.data()!.channelId))).data();
      if (!channel || channel.tenantId !== input.tenantId) throw new AssignmentChangeError(409, "assignment_channel_changed", "O canal mudou após a distribuição e precisa de revisão.");
      channels.set(row.snapshot.data()!.channelId, channel);
    }
    for (const row of rows) {
      const owner = ownerId(row.receipt.before || {});
      const channel = channels.get(row.snapshot.data()?.channelId);
      const restored = {...row.snapshot.data()}; for (const field of mutableFields) delete restored[field]; Object.assign(restored, row.receipt.before);
      if (owner) assertAssignedCommercialRecordAccess(receivers.get(owner)!, owner, {...restored,
        ...(channel ? {channelScope: channel.channelScope, channelOwnerUserId: channel.ownerUserId} : {})});
    }
    const appointmentOwners = new Map(rows.filter(row => row.snapshot.ref.parent.id === "appointments").map(row => [row.snapshot.id, clean(row.receipt.before?.ownerUserId) || null]));
    const reserve = await prepareAppointmentOwnerTransfers(tx, input.tenantId, appointmentOwners);
    for (const row of rows) {
      const before = row.receipt.before || {}, patch = Object.fromEntries(mutableFields.map(field => [field, Object.prototype.hasOwnProperty.call(before, field) ? before[field] : FieldValue.delete()]));
      tx.update(row.snapshot.ref, {...patch, updatedAt: FieldValue.serverTimestamp(), ...(["appointments", "lead_tasks"].includes(row.snapshot.ref.parent.id) ? {version: Number(row.snapshot.data()?.version || 0) + 1} : {})});
    }
    for (const assignment of safe) tx.create(adminDb.collection("leads").doc(assignment.leadId).collection("events").doc(`assignment_undo_${input.auditId}`), {
      tenantId: input.tenantId, type: "lead_assignment_undo", title: "Distribuição desfeita", actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp()});
    reserve();
    const result = {ok: true, restored: safe.length, skipped: assignments.length - safe.length, relatedRecordsUpdated: rows.filter(row => row.snapshot.ref.parent.id !== "leads").length};
    tx.update(auditRef, {undoneAt: FieldValue.serverTimestamp(), undoneBy: input.actorId, undoneByName: input.actorName, restoredLeadIds: [...safeIds], undoResult: result});
    return {...result, replayed: false};
  });
}
