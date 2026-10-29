import {createHash} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import {assertAssignedCommercialRecordAccess} from "@/lib/server/commercial-access";
import {appointmentDateIso, prepareAppointmentReservation} from "@/lib/server/crm/appointment-mutation";
import type {AssistedMeetingSummary} from "@/lib/server/ai/meeting-assistant";

export class AssistedMeetingChangeError extends Error {
  constructor(public status: number, public code: string, message: string) {super(message);}
}
export type AssistedMeetingInput = {
  tenantId: string; actorId: string; actorName: string; leadId: string; appointmentId: string;
  requestId?: string; data: {title: string; transcript: string; notes: string; objective: string; language: string; meetingUrl: string | null; completeAppointment: boolean};
};
const validId = (id: unknown): id is string => typeof id === "string" && id.length > 0 && id.length <= 180 && id.trim() === id && !id.includes("/");
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function refFor(input: AssistedMeetingInput) {
  if (![input.tenantId, input.actorId, input.leadId].every(validId) || input.appointmentId && !validId(input.appointmentId) || input.requestId !== undefined && !validId(input.requestId)) throw new AssistedMeetingChangeError(400, "meeting_context_invalid", "Contexto da reunião inválido.");
  return input.requestId ? adminDb.collection("assisted_meetings").doc(`meeting_${hash([input.tenantId, input.actorId, input.requestId])}`) : adminDb.collection("assisted_meetings").doc();
}
async function context(tx: FirebaseFirestore.Transaction, input: AssistedMeetingInput) {
  const membership = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.actorId, capability: "edit_leads", module: "assisted_meetings"});
  await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.actorId, capability: "edit_leads", module: "crm"});
  const lead = await tx.get(adminDb.collection("leads").doc(input.leadId));
  const appointment = input.appointmentId ? await tx.get(adminDb.collection("appointments").doc(input.appointmentId)) : null;
  if (!lead.exists || lead.data()?.tenantId !== input.tenantId) throw new AssistedMeetingChangeError(409, "meeting_lead_changed", "O cliente mudou. Atualize antes de analisar a reunião.");
  assertAssignedCommercialRecordAccess(membership, input.actorId, lead.data()!);
  if (appointment) {
    if (!appointment.exists || appointment.data()?.tenantId !== input.tenantId || appointment.data()?.leadId !== input.leadId) throw new AssistedMeetingChangeError(409, "meeting_appointment_changed", "O compromisso não está vinculado a este cliente.");
    const generation = appointment.data()?.sourceLeadGeneration;
    const predatesParent = appointment.createTime!.seconds < lead.createTime!.seconds || appointment.createTime!.seconds === lead.createTime!.seconds && appointment.createTime!.nanoseconds < lead.createTime!.nanoseconds;
    if (generation ? typeof generation.isEqual !== "function" || !generation.isEqual(lead.createTime) : predatesParent) throw new AssistedMeetingChangeError(409, "meeting_appointment_changed", "O vínculo deste compromisso precisa de revisão.");
    assertAssignedCommercialRecordAccess(membership, input.actorId, appointment.data()!);
  }
  return {lead, appointment};
}
function sameRevision(current: FirebaseFirestore.DocumentSnapshot, expected: FirebaseFirestore.DocumentSnapshot) {
  return current.ref.path === expected.ref.path && current.createTime?.isEqual(expected.createTime!) && current.updateTime?.isEqual(expected.updateTime!);
}
function replay(saved: FirebaseFirestore.DocumentSnapshot, input: AssistedMeetingInput, current: Awaited<ReturnType<typeof context>>) {
  if (!saved.exists) return false;
  const row = saved.data()!;
  if (row.tenantId !== input.tenantId || row.requestFingerprint !== hash([input.leadId, input.appointmentId, input.data]) || row.leadId !== input.leadId ||
    typeof row.sourceLeadGeneration?.isEqual !== "function" || !row.sourceLeadGeneration.isEqual(current.lead.createTime) ||
    current.appointment && (typeof row.sourceAppointmentGeneration?.isEqual !== "function" || !row.sourceAppointmentGeneration.isEqual(current.appointment.createTime))) throw new AssistedMeetingChangeError(409, "meeting_request_conflict", "O pedido ou vínculo desta reunião mudou. A repetição não altera o registro salvo.");
  return true;
}
export async function observeAssistedMeeting(input: AssistedMeetingInput) {
  const sessionRef = refFor(input);
  return adminDb.runTransaction(async tx => {
    const current = await context(tx, input), saved = await tx.get(sessionRef);
    const receipt = await tx.get(adminDb.collection("audit_logs").doc(`assisted_meeting_${sessionRef.id}`));
    if (!saved.exists && receipt.exists) throw new AssistedMeetingChangeError(409, "meeting_request_removed", "Este registro foi removido. Crie um novo pedido para registrar outra reunião.");
    return {sessionRef, ...current, replayed: replay(saved, input, current)};
  });
}
export async function commitAssistedMeeting(input: AssistedMeetingInput & {
  observed: Awaited<ReturnType<typeof observeAssistedMeeting>>; summary: AssistedMeetingSummary; markdown: string;
}) {
  const sessionRef = input.observed.sessionRef;
  return adminDb.runTransaction(async tx => {
    const current = await context(tx, input), saved = await tx.get(sessionRef);
    if (replay(saved, input, current)) return {id: sessionRef.id, replayed: true};
    const receipt = await tx.get(adminDb.collection("audit_logs").doc(`assisted_meeting_${sessionRef.id}`));
    if (receipt.exists) throw new AssistedMeetingChangeError(409, "meeting_request_removed", "Este registro foi removido. Use um novo pedido.");
    if (!sameRevision(current.lead, input.observed.lead) || Boolean(current.appointment) !== Boolean(input.observed.appointment) || current.appointment && !sameRevision(current.appointment, input.observed.appointment!)) throw new AssistedMeetingChangeError(409, "meeting_source_changed", "O cliente ou compromisso foi alterado durante a análise. Atualize os dados antes de tentar novamente.");
    const appointment = current.appointment?.data(), modelAnalysis = input.summary.analysisMode === "model";
    if (input.data.completeAppointment && !current.appointment) throw new AssistedMeetingChangeError(400, "meeting_completion_requires_appointment", "Selecione o compromisso que foi realizado.");
    if (input.data.completeAppointment && (!appointment || !["scheduled", "confirmed", "completed"].includes(String(appointment.status)) || !appointmentDateIso(appointment.startAt) || !appointmentDateIso(appointment.endAt) || Date.parse(appointment.endAt) <= Date.parse(appointment.startAt))) throw new AssistedMeetingChangeError(409, "meeting_completion_invalid", "Revise o estado e os horários do compromisso antes de concluir.");
    const reserve = input.data.completeAppointment ? await prepareAppointmentReservation(tx, {tenantId: input.tenantId, appointmentId: input.appointmentId, status: "completed", startAt: appointmentDateIso(appointment?.startAt), endAt: appointmentDateIso(appointment?.endAt), leadId: input.leadId, ownerUserId: appointment?.ownerUserId || null}) : () => {};
    const title = input.data.title || appointment?.title || "Reunião assistida", meetingUrl = input.data.meetingUrl || appointment?.meetingUrl || null;
    const source = {tenantId: input.tenantId, leadId: input.leadId, sourceLeadGeneration: current.lead.createTime!, sourceLeadRevision: current.lead.updateTime!,
      appointmentId: input.appointmentId || null, sourceAppointmentGeneration: current.appointment?.createTime || null, sourceAppointmentRevision: current.appointment?.updateTime || null};
    const summary = {...input.summary, analysisMode: modelAnalysis ? "model" : "fallback"};
    const stamp = {createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: input.actorId, createdByName: input.actorName};
    tx.create(sessionRef, {...source, ...input.data, title, meetingUrl, leadName: current.lead.data()?.nome || null, summary, markdown: input.markdown,
      requestFingerprint: hash([input.leadId, input.appointmentId, input.data]), dossierStatus: modelAnalysis ? "pending" : "not_requested", ...stamp});
    tx.update(current.lead.ref, {lastAssistedMeetingId: sessionRef.id, lastAssistedMeetingAt: FieldValue.serverTimestamp(),
      ...(modelAnalysis ? {aiLeadSummary: summary.executiveSummary, aiCommercialTemperature: summary.qualification.temperature, aiNextAction: summary.nextSteps[0] || summary.crmUpdate,
        aiMeetingAnalysisSourceId: sessionRef.id, aiMeetingAnalysisNeedsReview: true} : {}), updatedAt: FieldValue.serverTimestamp()});
    tx.create(current.lead.ref.collection("documents").doc(`assisted_meeting_${sessionRef.id}`), {...source, ...stamp, type: "assisted_meeting", title, summary, markdown: input.markdown, analysisNeedsReview: true});
    tx.create(current.lead.ref.collection("events").doc(`assisted_meeting_${sessionRef.id}`), {...source, type: "assisted_meeting_summary", title: modelAnalysis ? "Reunião analisada por IA" : "Registro de reunião salvo para revisão", detail: summary.executiveSummary,
      assistedMeetingId: sessionRef.id, actorId: input.actorId, actorName: input.actorName, createdAt: FieldValue.serverTimestamp()});
    tx.create(adminDb.collection("lead_notes").doc(`assisted_meeting_${sessionRef.id}`), {...source, ...stamp, title: "Resumo de reunião assistida", body: input.markdown, source: "assisted_meeting", assistedMeetingId: sessionRef.id});
    tx.create(adminDb.collection("audit_logs").doc(`assisted_meeting_${sessionRef.id}`), {...source, action: "assisted_meeting_committed", sessionId: sessionRef.id, actorId: input.actorId, createdAt: FieldValue.serverTimestamp()});
    if (current.appointment) tx.update(current.appointment.ref, {...(input.data.completeAppointment ? {status: "completed"} : {}), aiMeetingSummary: summary, assistedMeetingId: sessionRef.id, version: Number(appointment?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorId, updatedByName: input.actorName});
    reserve();
    return {id: sessionRef.id, replayed: false};
  });
}
