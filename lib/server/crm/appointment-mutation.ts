import {FieldValue} from "firebase-admin/firestore";
import {createHash} from "node:crypto";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import {assertAssignedCommercialRecordAccess, hasTeamWideCommercialAccess} from "@/lib/server/commercial-access";
import {evaluateCommercialAgentSla} from "@/lib/commercial-agent-action";

export class AppointmentChangeError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}
export function appointmentDateIso(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const day = value.slice(0, 10), calendar = new Date(`${day}T12:00:00Z`), date = new Date(value);
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === day && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export async function prepareAppointmentReservation(tx: FirebaseFirestore.Transaction, input: {
  tenantId: string; appointmentId: string; status: string; startAt: string | null; endAt: string | null;
  leadId: string; ownerUserId: string | null;
}) {
  const gateRef = adminDb.collection("tenant_settings").doc(input.tenantId), gate = await tx.get(gateRef);
  if (gate.exists && gate.data()?.tenantId && gate.data()?.tenantId !== input.tenantId) throw new AppointmentChangeError(409, "calendar_identity_conflict", "A configuração da agenda precisa de revisão.");
  if (["scheduled", "confirmed"].includes(input.status)) {
    if (!input.startAt || !input.endAt) throw new AppointmentChangeError(400, "appointment_date_required", "Defina início e fim do compromisso.");
    const start = Date.parse(input.startAt), end = Date.parse(input.endAt);
    const appointments = await tx.get(adminDb.collection("appointments").where("tenantId", "==", input.tenantId));
    const conflict = appointments.docs.some(row => {
      if (row.id === input.appointmentId) return false;
      const other = row.data(); if (!["scheduled", "confirmed"].includes(String(other.status || "scheduled"))) return false;
      const otherStart = Date.parse(String(other.startAt || "")), otherEnd = other.endAt ? Date.parse(String(other.endAt)) : otherStart + 3600000;
      return otherStart < end && start < otherEnd && (Boolean(input.leadId && other.leadId === input.leadId) || Boolean(input.ownerUserId && other.ownerUserId === input.ownerUserId));
    });
    if (conflict) throw new AppointmentChangeError(409, "appointment_conflict", "Esse horário já está ocupado para o responsável ou cliente.");
  }
  return () => tx.set(gateRef, {tenantId: input.tenantId, crmCalendarMutationVersion: FieldValue.increment(1)}, {merge: true});
}

/** Validate the resulting calendar, including simultaneous transfers/swaps. */
export async function prepareAppointmentOwnerTransfers(tx: FirebaseFirestore.Transaction, tenantId: string, owners: ReadonlyMap<string, string | null>) {
  if (!owners.size) return () => {};
  const reserve = await prepareAppointmentReservation(tx, {tenantId, appointmentId: "", status: "canceled", startAt: null, endAt: null, leadId: "", ownerUserId: null});
  const snapshot = await tx.get(adminDb.collection("appointments").where("tenantId", "==", tenantId));
  const rows: Array<{id: string; data: FirebaseFirestore.DocumentData}> = snapshot.docs.map(doc => ({id: doc.id, data: {...doc.data(), ownerUserId: owners.has(doc.id) ? owners.get(doc.id) : doc.data().ownerUserId}}));
  for (const row of rows) {
    if (!owners.has(row.id) || !["scheduled", "confirmed"].includes(String(row.data.status || "scheduled"))) continue;
    const start = appointmentDateIso(row.data.startAt), end = row.data.endAt ? appointmentDateIso(row.data.endAt) : start ? new Date(Date.parse(start) + 3600000).toISOString() : null;
    if (!start || !end || Date.parse(end) <= Date.parse(start)) throw new AppointmentChangeError(409, "appointment_transfer_date_invalid", "Revise o horário do compromisso antes de transferir o responsável.");
    const conflict = rows.some(other => {
      if (other.id === row.id || !["scheduled", "confirmed"].includes(String(other.data.status || "scheduled"))) return false;
      const otherStart = Date.parse(String(other.data.startAt || "")), otherEnd = other.data.endAt ? Date.parse(String(other.data.endAt)) : otherStart + 3600000;
      return otherStart < Date.parse(end) && Date.parse(start) < otherEnd &&
        (Boolean(row.data.leadId && row.data.leadId === other.data.leadId) || Boolean(row.data.ownerUserId && row.data.ownerUserId === other.data.ownerUserId));
    });
    if (conflict) throw new AppointmentChangeError(409, "appointment_conflict", "A transferência criaria um conflito na agenda. Escolha outro responsável ou ajuste o horário.");
  }
  return reserve;
}

export type CommercialAppointmentCreationInput = {
  tenantId: string; userId: string; userName: string; leadId: string; expectedLead?: FirebaseFirestore.DocumentSnapshot;
  ownerUserId?: string | null; requestId?: string;
  data: {title: string; type: string; status: string; startAt: string; endAt: string; location: string | null; meetingUrl: string | null; notes: string | null};
};
export async function createManualAppointment(input: CommercialAppointmentCreationInput) {
  const key = input.requestId ? createHash("sha256").update(JSON.stringify([input.tenantId, input.userId, input.requestId])).digest("hex") : null;
  const ref = key ? adminDb.collection("appointments").doc(`manual_${key}`) : adminDb.collection("appointments").doc();
  return adminDb.runTransaction(tx => createCommercialAppointmentInTransaction(tx, input, ref));
}

/** Read current authority/ownership and reserve before committing the creation.
 * Callers may read approval records first and append their receipts after this returns. */
export async function createCommercialAppointmentInTransaction(tx: FirebaseFirestore.Transaction, input: CommercialAppointmentCreationInput,
  ref: FirebaseFirestore.DocumentReference, provenance?: {draftId: string; draftGeneration: FirebaseFirestore.Timestamp}) {
  const validId = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 180 && value === value.trim() && !value.includes("/");
  if (!validId(input.tenantId) || !validId(input.userId) || input.leadId && !validId(input.leadId) || input.ownerUserId && !validId(input.ownerUserId)) throw new AppointmentChangeError(400, "appointment_context_invalid", "Contexto do compromisso inválido.");
  if (input.requestId !== undefined && (typeof input.requestId !== "string" || !input.requestId.trim() || input.requestId !== input.requestId.trim() || input.requestId.length > 180 || input.requestId.includes("/"))) throw new AppointmentChangeError(400, "appointment_request_invalid", "Identificador do pedido inválido.");
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const requestHash = hash([input.leadId, input.ownerUserId || null, input.data]);
  const receiptRef = adminDb.collection("audit_logs").doc(`appointment_created_${ref.id}`);
  const membership = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.userId, capability: "edit_leads", module: "crm"});
  const leadRef = input.leadId ? adminDb.collection("leads").doc(input.leadId) : null, lead = leadRef ? await tx.get(leadRef) : null;
  if (leadRef) {
    if (!lead?.exists || lead.data()?.tenantId !== input.tenantId) throw new AppointmentChangeError(404, "appointment_lead_changed", "Cliente não encontrado nesta empresa.");
    assertAssignedCommercialRecordAccess(membership, input.userId, lead.data()!);
    if (input.expectedLead && !lead.createTime?.isEqual(input.expectedLead.createTime!)) throw new AppointmentChangeError(409, "appointment_lead_changed", "O cliente mudou. Atualize antes de agendar.");
  }
  const saved = await tx.get(ref), receipt = await tx.get(receiptRef);
  if (saved.exists) {
    const row = saved.data()!;
    if (row.tenantId !== input.tenantId || row.creationRequestHash !== requestHash || row.leadId !== (input.leadId || null)) throw new AppointmentChangeError(409, "appointment_request_conflict", "Este pedido já foi usado para outro compromisso.");
    assertAssignedCommercialRecordAccess(membership, input.userId, row);
    if (lead && row.sourceLeadGeneration && (typeof row.sourceLeadGeneration.isEqual !== "function" || !row.sourceLeadGeneration.isEqual(lead.createTime))) throw new AppointmentChangeError(409, "appointment_lead_changed", "O vínculo deste compromisso mudou.");
    return {appointmentId: ref.id, deduped: true, ownerName: row.ownerName || null};
  }
  if (receipt.exists) throw new AppointmentChangeError(409, "appointment_request_removed", "Este compromisso foi removido. Crie um novo pedido para agendar novamente.");
  const ownerId = input.ownerUserId || lead?.data()?.ownerId || input.userId;
  if (ownerId !== input.userId && !hasTeamWideCommercialAccess(membership)) throw new AppointmentChangeError(403, "appointment_owner_denied", "Somente gestores podem agendar para outro vendedor.");
  const owner = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: ownerId, capability: "edit_leads", module: "crm"});
  if (lead) assertAssignedCommercialRecordAccess(owner, ownerId, lead.data()!);
  const ownerUser = await tx.get(adminDb.collection("users").doc(ownerId));
  const ownerName = ownerUser.data()?.name || (ownerId === input.userId ? input.userName : lead?.data()?.owner || null);
  const startAt = appointmentDateIso(input.data.startAt), endAt = appointmentDateIso(input.data.endAt);
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) throw new AppointmentChangeError(400, "invalid_appointment_range", "Informe início e fim válidos para o compromisso.");
  const reserve = await prepareAppointmentReservation(tx, {tenantId: input.tenantId, appointmentId: ref.id, status: input.data.status, startAt, endAt, leadId: input.leadId, ownerUserId: ownerId});
  tx.create(ref, {tenantId: input.tenantId, ...input.data, startAt, endAt, leadId: input.leadId || null,
    leadName: lead?.data()?.nome || null, leadCompany: lead?.data()?.empresa || null,
    sourceLeadGeneration: lead?.createTime || null, ownerUserId: ownerId, ownerName,
    creationRequestHash: requestHash, source: provenance ? "mcp" : "manual", version: 1,
    ...(provenance ? {sourceDraftId: provenance.draftId, sourceDraftGeneration: provenance.draftGeneration} : {}),
    createdBy: input.userId, createdByName: input.userName, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  reserve();
  tx.create(receiptRef, {tenantId: input.tenantId, leadId: input.leadId || null, actorId: input.userId, action: "appointment_created",
    targetCollection: "appointments", targetId: ref.id, creationRequestHash: requestHash,
    sourceLeadGeneration: lead?.createTime || null, postCommitStatus: provenance ? "not_requested" : "pending", createdAt: FieldValue.serverTimestamp()});
  if (leadRef) tx.create(leadRef.collection("events").doc(`appointment_created_${ref.id}`), {tenantId: input.tenantId, type: "appointment_created", title: "Compromisso criado",
    appointmentId: ref.id, detail: input.data.title, actorId: input.userId, actorName: input.userName, createdAt: FieldValue.serverTimestamp()});
  return {appointmentId: ref.id, deduped: false, ownerName};
}
export async function commitAppointmentChange(input: {
  tenantId: string; appointmentId: string; userId: string; userName: string;
  expected: FirebaseFirestore.DocumentSnapshot; patch: Record<string, unknown>;
  expectedVersion?: number; expectedRevision?: string; detail: string;
  review?: {snapshot: FirebaseFirestore.DocumentSnapshot; decision: "approved" | "rejected"; note?: string};
}) {
  const ref = adminDb.collection("appointments").doc(input.appointmentId);
  return adminDb.runTransaction(async tx => {
    const membership = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.userId, capability: "edit_leads", module: "crm"});
    const snapshot = await tx.get(ref), current = snapshot.data();
    if (!current || current.tenantId !== input.tenantId) throw new AppointmentChangeError(404, "appointment_not_found", "Compromisso não encontrado.");
    assertAssignedCommercialRecordAccess(membership, input.userId, current);
    if (input.review && current.status !== "draft") throw new AppointmentChangeError(409, "appointment_review_state_changed", "O compromisso já foi tratado. Atualize a fila de revisões.");
    const version = Number(current.version || 0), revision = `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
    if (!snapshot.createTime?.isEqual(input.expected.createTime!) || !snapshot.updateTime?.isEqual(input.expected.updateTime!) ||
      input.expectedVersion !== undefined && input.expectedVersion !== version || input.expectedRevision !== undefined && input.expectedRevision !== revision) throw new AppointmentChangeError(409, "appointment_version_conflict", "Este compromisso mudou. Atualize a agenda antes de salvar.");
    const leadId = typeof current.leadId === "string" ? current.leadId : "";
    const lead = leadId ? await tx.get(adminDb.collection("leads").doc(leadId)) : null;
    if (leadId) {
      if (!lead?.exists || lead.data()?.tenantId !== input.tenantId) throw new AppointmentChangeError(409, "appointment_lead_changed", "O cliente deste compromisso precisa de revisão.");
      assertAssignedCommercialRecordAccess(membership, input.userId, lead.data()!);
      if (current.sourceLeadGeneration && (typeof current.sourceLeadGeneration.isEqual !== "function" || !current.sourceLeadGeneration.isEqual(lead.createTime))) throw new AppointmentChangeError(409, "appointment_lead_changed", "O vínculo do compromisso precisa de revisão.");
    }
    const patch = {...input.patch}, next = {...current, ...patch};
    if (Object.prototype.hasOwnProperty.call(patch, "ownerUserId") && patch.ownerUserId !== current.ownerUserId) {
      if (!hasTeamWideCommercialAccess(membership)) throw new AppointmentChangeError(403, "appointment_transfer_denied", "Somente gestores podem transferir compromissos.");
      if (patch.ownerUserId) {
        const owner = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: String(patch.ownerUserId), capability: "edit_leads", module: "crm"});
        if (lead) assertAssignedCommercialRecordAccess(owner, String(patch.ownerUserId), lead.data()!);
      }
    }
    const scheduled = ["scheduled", "confirmed"].includes(String(next.status)) || current.status === "draft" && ["completed", "no_show"].includes(String(next.status));
    const start = appointmentDateIso(next.startAt), end = appointmentDateIso(next.endAt);
    if (scheduled && (!start || !end || Date.parse(end) <= Date.parse(start))) throw new AppointmentChangeError(400, "appointment_date_required", "Defina início e fim válidos na Agenda antes de confirmar o compromisso.");
    const reserve = await prepareAppointmentReservation(tx, {tenantId: input.tenantId, appointmentId: ref.id, status: String(next.status), startAt: start, endAt: end, leadId, ownerUserId: next.ownerUserId || null});
    const reviews = await tx.get(adminDb.collection("commercial_agent_actions").where("tenantId", "==", input.tenantId).where("referenceId", "==", ref.id));
    if (input.review) {
      const review = reviews.docs.find(row => row.id === input.review!.snapshot.id);
      if (!review || review.data().status !== "pending_approval" || !review.updateTime.isEqual(input.review.snapshot.updateTime!)) throw new AppointmentChangeError(409, "commercial_action_changed", "Esta revisão já foi alterada.");
      const data = review.data();
      if (data.type !== "review_appointment" || data.leadId !== leadId || data.referenceCollection !== "appointments") throw new AppointmentChangeError(409, "commercial_action_reference_changed", "O vínculo desta revisão mudou.");
      if (evaluateCommercialAgentSla({...data, type: "review_appointment", status: "pending_approval", createdAt: data.createdAt}).state === "expired") throw new AppointmentChangeError(409, "commercial_action_expired", "Esta revisão expirou. Atualize a agenda.");
    }
    tx.update(ref, {...patch, version: version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.userId, updatedByName: input.userName});
    reserve();
    if (current.status === "draft" && ["scheduled", "canceled"].includes(String(next.status))) for (const review of reviews.docs) {
      const data = review.data();
      if (data.type === "review_appointment" && data.leadId === leadId && data.status === "pending_approval") tx.update(review.ref, {
        status: next.status === "scheduled" ? "approved" : "rejected", reviewedBy: input.userId, reviewedByName: input.userName,
        ...(input.review ? {reviewNote: input.review.note || null} : {}), reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (leadId) tx.create(adminDb.collection("leads").doc(leadId).collection("events").doc(`appointment_${ref.id}_${version + 1}`), {
      tenantId: input.tenantId, type: "appointment_updated", title: "Compromisso atualizado", detail: input.detail, appointmentId: ref.id,
      actorId: input.userId, actorName: input.userName, createdAt: FieldValue.serverTimestamp(),
    });
    return {version: version + 1, status: next.status};
  });
}
