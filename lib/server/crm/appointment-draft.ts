import {createHash} from "node:crypto";
import {FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/app/lib/server/firebase-admin";
import {assertTransactionalTenantAuthority} from "@/lib/server/tenant-operation-authority";
import {assertAssignedCommercialRecordAccess} from "@/lib/server/commercial-access";
import {crmDraftFingerprint, CrmDraftMutationConflict} from "@/lib/server/crm/draft-mutation";
import {appointmentDateIso, AppointmentChangeError, createCommercialAppointmentInTransaction} from "@/lib/server/crm/appointment-mutation";

const clean = (value: unknown, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const requiredScopes = ["calendar:write", "crm:read"];
const timestampMatches = (value: unknown, expected: FirebaseFirestore.Timestamp | undefined) => Boolean(expected && value && typeof value === "object" &&
  "isEqual" in value && typeof value.isEqual === "function" && value.isEqual(expected));

/** Approval, appointment, reservation, history and receipt share one commit. */
export async function applyApprovedAppointmentDraft(input: {
  tenantId: string; draftId: string; expectedDraft: FirebaseFirestore.DocumentSnapshot;
  actorId: string; actorName: string; viaMcp: boolean; scopes: string[];
}) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(input.draftId)) throw new CrmDraftMutationConflict("Rascunho inválido.");
  const draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
  if (input.expectedDraft.ref.path !== draftRef.path) throw new CrmDraftMutationConflict("Referência do rascunho inválida.");
  const key = createHash("sha256").update(JSON.stringify([input.tenantId, input.draftId])).digest("hex");
  const appointmentRef = adminDb.collection("appointments").doc(`mcp_appointment_${key}`);
  return adminDb.runTransaction(async tx => {
    const membership = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: input.actorId, capability: "edit_leads", module: "crm"});
    const snapshot = await tx.get(draftRef), draft = snapshot.data();
    if (!draft || draft.tenantId !== input.tenantId || draft.type !== "create_appointment" || !snapshot.createTime?.isEqual(input.expectedDraft.createTime!)) throw new CrmDraftMutationConflict("O vínculo do rascunho mudou.");
    if (input.viaMcp && requiredScopes.some(scope => !input.scopes.includes(scope))) throw new CrmDraftMutationConflict("A conexão não permite aplicar este agendamento.");
    const fingerprint = crmDraftFingerprint(draft), proposed = record(draft.proposedChange);
    const leadId = clean(proposed.leadId);
    if (proposed.leadId !== undefined && (!leadId || leadId !== proposed.leadId || leadId.includes("/"))) throw new CrmDraftMutationConflict("Cliente do agendamento inválido.");
    const lead = leadId ? await tx.get(adminDb.collection("leads").doc(leadId)) : null;
    if (lead) {
      if (!lead.exists || lead.data()?.tenantId !== input.tenantId) throw new CrmDraftMutationConflict("Cliente indisponível nesta empresa.");
      assertAssignedCommercialRecordAccess(membership, input.actorId, lead.data()!);
    }
    const existing = await tx.get(appointmentRef), receipt = record(draft.appointmentMutation);
    if (draft.status === "applied" && receipt.protocol === 1) {
      const saved = existing.data();
      if (receipt.fingerprint !== fingerprint || receipt.appointmentId !== appointmentRef.id || record(draft.application).appointmentId !== appointmentRef.id ||
        !timestampMatches(receipt.draftGeneration, snapshot.createTime) ||
        !saved || saved.tenantId !== input.tenantId || saved.sourceDraftId !== input.draftId || !timestampMatches(saved.sourceDraftGeneration, snapshot.createTime) ||
        saved.leadId !== (leadId || null) || lead && !timestampMatches(saved.sourceLeadGeneration, lead.createTime)) throw new CrmDraftMutationConflict("Recibo ou compromisso indisponível. A repetição não recria registros removidos.");
      assertAssignedCommercialRecordAccess(membership, input.actorId, saved);
      return {replayed: true, application: record(draft.application)};
    }
    if (existing.exists || draft.status !== "approved_pending_apply" || draft.appliedAt || !snapshot.updateTime?.isEqual(input.expectedDraft.updateTime!) ||
      draft.reviewedChangeFingerprint !== fingerprint || !clean(draft.reviewedBy) || clean(draft.reviewedBy) !== draft.reviewedBy || String(draft.reviewedBy).includes("/") || typeof draft.reviewedAt?.toMillis !== "function") throw new CrmDraftMutationConflict("O agendamento mudou ou precisa ser aprovado novamente.");
    if (lead && (draft.reviewedLeadId !== leadId || !timestampMatches(draft.reviewedLeadVersion, lead.updateTime) || !timestampMatches(draft.reviewedLeadGeneration, lead.createTime))) throw new CrmDraftMutationConflict("O cliente mudou após a aprovação. Revise novamente.");
    if (draft.reviewDecision === "human_review") {
      const reviewer = await assertTransactionalTenantAuthority(tx, {tenantId: input.tenantId, userId: String(draft.reviewedBy), capability: "manage_settings", module: "crm"});
      if (lead) assertAssignedCommercialRecordAccess(reviewer, String(draft.reviewedBy), lead.data()!);
    } else if (draft.reviewDecision === "autonomous_policy" && input.viaMcp) {
      const settings = (await tx.get(adminDb.collection("tenant_settings").doc(input.tenantId))).data();
      if (settings?.mcp?.writeMode !== "autonomous" || draft.source !== "mcp" || draft.userId !== input.actorId || draft.reviewedBy !== input.actorId || draft.autonomousEligible !== true ||
        !Array.isArray(draft.requiredScopes) || requiredScopes.some(scope => !draft.requiredScopes.includes(scope)) || draft.requiredScopes.some((scope: unknown) => typeof scope !== "string" || !input.scopes.includes(scope))) throw new CrmDraftMutationConflict("A política de aplicação foi revogada.");
    } else throw new CrmDraftMutationConflict("Aprovação do agendamento inválida.");
    const title = clean(proposed.title), startAt = appointmentDateIso(proposed.startAt);
    // Preserve the existing manual/MCP default duration, only after an explicit valid start.
    const endAt = proposed.endAt === undefined && startAt ? new Date(Date.parse(startAt) + 3600000).toISOString() : appointmentDateIso(proposed.endAt);
    const ownerUserId = clean(proposed.ownerUserId);
    if (!title || !startAt || !endAt || proposed.ownerUserId !== undefined && (!ownerUserId || proposed.ownerUserId !== ownerUserId || ownerUserId.includes("/"))) throw new AppointmentChangeError(400, "invalid_appointment_draft", "Informe título, responsável e horários válidos.");
    const created = await createCommercialAppointmentInTransaction(tx, {tenantId: input.tenantId, userId: input.actorId, userName: input.actorName,
      leadId, ...(lead ? {expectedLead: lead} : {}), ownerUserId: ownerUserId || null,
      data: {title, type: clean(proposed.type, 80) || "reuniao", status: "scheduled", startAt, endAt,
        location: clean(proposed.location, 240) || null, meetingUrl: clean(proposed.meetingUrl, 1200) || null, notes: clean(proposed.notes, 4000) || null}},
      appointmentRef, {draftId: input.draftId, draftGeneration: snapshot.createTime!});
    const application = {appointmentId: created.appointmentId, startAt, endAt};
    tx.update(draftRef, {status: "applied", application, appliedAt: FieldValue.serverTimestamp(), appliedBy: input.actorId, appliedByName: input.actorName,
      appointmentMutation: {protocol: 1, fingerprint, appointmentId: created.appointmentId, draftGeneration: snapshot.createTime!, authoredBy: "mcp",
        reviewedBy: draft.reviewedBy, completionMeaning: "appointment_committed_not_customer_confirmation"}, updatedAt: FieldValue.serverTimestamp()});
    tx.create(adminDb.collection("audit_logs").doc(`mcp_appointment_${key}`), {tenantId: input.tenantId, type: "mcp_supervised_action_applied", action: "create_appointment",
      actorId: input.actorId, actorName: input.actorName, draftId: input.draftId, after: application, generatedBy: "mcp", createdAt: FieldValue.serverTimestamp()});
    return {replayed: false, application};
  });
}
