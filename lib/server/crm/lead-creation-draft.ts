import { createHash } from "node:crypto";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantAccess, assertTenantCapability, TenantAccessError, type TenantMembership } from "@/lib/server/tenant";
import { assertTenantLimitAvailable, assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertAssignedCommercialRecordAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { normalizePhone, normalizePhoneBR } from "@/app/lib/server/phone";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { CrmDraftMutationConflict, crmDraftFingerprint } from "@/lib/server/crm/draft-mutation";
import { assertLeadCreationActor, commitManualLeadCreationOccurrence, intakeCreationJobId } from "@/lib/server/crm/intake-occurrence";

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

/** Creation, review receipt and pending automation share a commit; there is no
 * intermediate applying state whose crash could leave a second creation behind. */
export async function applyApprovedLeadCreationDraft(input: {
  tenantId: string; draftId: string; expectedDraftVersion: Timestamp; membership: TenantMembership;
  actorId: string; actorName: string; viaMcp: boolean;
}) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(input.draftId) || input.membership.tenantId !== input.tenantId || input.membership.userId !== input.actorId) throw new CrmDraftMutationConflict("Contexto de criacao invalido.");
  const key = createHash("sha256").update(JSON.stringify([input.tenantId, input.draftId])).digest("hex");
  const leadRef = adminDb.collection("leads").doc(`mcp_lead_${key}`), eventRef = leadRef.collection("events").doc(`mcp_creation_${key}`);
  const creationJobId = intakeCreationJobId(eventRef.id), draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(draftRef), draft = snapshot.data();
    if (!draft || draft.tenantId !== input.tenantId || draft.type !== "create_lead") throw new CrmDraftMutationConflict("Rascunho fora desta empresa.");
    const fingerprint = crmDraftFingerprint(draft), proposed = record(draft.proposedChange);
    const membership = await assertTenantAccess(input.actorId, input.tenantId);
    assertTenantCapability(membership, "edit_leads"); await assertTenantModule(input.tenantId, "crm");
    const existing = await tx.get(leadRef);
    if (draft.status === "applied" && draft.creationMutation?.protocol === 1) {
      const receipt = draft.creationMutation, lead = existing.data();
      if (receipt.fingerprint !== fingerprint || receipt.creationJobId !== creationJobId || receipt.leadId !== leadRef.id ||
          !lead || lead.tenantId !== input.tenantId || lead.sourceDraftId !== input.draftId || lead.intakeCreationEventId !== eventRef.id || draft.application?.leadId !== leadRef.id) throw new CrmDraftMutationConflict("Recibo da criacao mudou ou cliente indisponivel; revise antes de retomar.");
      assertAssignedCommercialRecordAccess(membership, input.actorId, lead);
      return { replayed: true, application: record(draft.application), creationJobId };
    }
    if (existing.exists || draft.status !== "approved_pending_apply" || draft.appliedAt || !snapshot.updateTime?.isEqual(input.expectedDraftVersion) ||
        draft.reviewedChangeFingerprint !== fingerprint || !draft.reviewedBy || typeof draft.reviewedAt?.toMillis !== "function" ||
        !["human_review", "autonomous_policy"].includes(draft.reviewDecision) || draft.reviewDecision === "autonomous_policy" && !input.viaMcp) throw new CrmDraftMutationConflict("O rascunho mudou ou precisa de nova aprovacao.");
    const pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId);
    const stage = proposed.pipelineStage === undefined ? pipeline.stages[0]?.id || "" : normalizePipelineStageId(proposed.pipelineStage, "");
    if (!pipeline.stages.some(item => item.id === stage)) throw new CrmDraftMutationConflict("Etapa aprovada nao existe no funil da empresa.");
    const name = clean(proposed.name), email = clean(proposed.email).toLowerCase(), phone = normalizePhoneBR(clean(proposed.phone, 60));
    if (!name && !email && !phone) throw new CrmDraftMutationConflict("Informe nome, telefone ou email.");
    // The query participates in the commit, including the empty result: two
    // approved drafts cannot concurrently bypass duplicate/contact limits.
    const leads = await tx.get(adminDb.collection("leads").where("tenantId", "==", input.tenantId));
    if (leads.docs.some(doc => { const value = doc.data(); return Boolean(email && clean(value.email).toLowerCase() === email || phone && normalizePhone(String(value.telefone || "")) === normalizePhone(phone)); })) throw new CrmDraftMutationConflict("Este contato ja existe no CRM.");
    await assertTenantLimitAvailable({ tenantId: input.tenantId, limitId: "contacts", currentUsage: leads.size, increment: 1 });
    let ownerId = clean(proposed.ownerUserId), ownerName = "";
    if (ownerId) {
      if (ownerId.includes("/") || ownerId !== input.actorId && !hasTeamWideCommercialAccess(membership)) throw new CrmDraftMutationConflict("Atribuicao nao autorizada.");
      const owner = (await tx.get(adminDb.collection("tenant_users").doc(`${input.tenantId}_${ownerId}`))).data();
      if (!owner || owner.tenantId !== input.tenantId || owner.status !== "active") throw new CrmDraftMutationConflict("Responsavel nao esta ativo nesta empresa.");
      ownerName = clean(owner.name) || clean(owner.email);
    } else if (!hasTeamWideCommercialAccess(membership)) { ownerId = input.actorId; ownerName = input.actorName; }
    if (draft.reviewDecision === "human_review") {
      await assertLeadCreationActor(tx, input.tenantId, draft.reviewedBy, {}, true, "manage_settings");
    } else {
      const settings = (await tx.get(adminDb.collection("tenant_settings").doc(input.tenantId))).data();
      if (settings?.mcp?.writeMode !== "autonomous" || draft.source !== "mcp" || draft.userId !== input.actorId || draft.reviewedBy !== input.actorId || draft.autonomousEligible !== true) throw new CrmDraftMutationConflict("Politica autonoma revogada.");
    }
    const potentialValue = typeof proposed.potentialValue === "number" && Number.isFinite(proposed.potentialValue) ? Math.max(0, proposed.potentialValue) : 0;
    const saved = await commitManualLeadCreationOccurrence(tx, { leadRef, eventRef, actorId: input.actorId, actorName: input.actorName,
      approval: { draftId: input.draftId, fingerprint, reviewedBy: draft.reviewedBy, reviewDecision: draft.reviewDecision },
      record: { tenantId: input.tenantId, nome: name || "Contato sem nome", email, telefone: phone, empresa: clean(proposed.company),
        origem: clean(proposed.source, 120) || "mcp", channel: clean(proposed.channel, 80) || "mcp", sourceType: "mcp", status: "novo",
        stage, pipelineStage: stage, priority: clean(proposed.priority, 40) || "medium", heat: clean(proposed.heat, 20) || "morno",
        potentialValue, valorPotencial: potentialValue, notes: clean(proposed.notes, 4000), ownerId: ownerId || null, ownerUserId: ownerId || null,
        assignedTo: ownerId || null, owner: ownerName || null, ownerName: ownerName || null, assignedUserName: ownerName || null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() } });
    const application = { leadId: leadRef.id, name: saved.nome, pipelineStage: stage, ownerUserId: ownerId || null };
    tx.create(adminDb.collection("audit_logs").doc(eventRef.id), { tenantId: input.tenantId, type: "mcp_supervised_action_applied", action: "create_lead",
      actorId: input.actorId, actorName: input.actorName, draftId: input.draftId, after: application, generatedBy: "mcp", createdAt: FieldValue.serverTimestamp() });
    tx.update(draftRef, { status: "applied", application, appliedAt: FieldValue.serverTimestamp(), appliedBy: input.actorId, appliedByName: input.actorName,
      creationMutation: { protocol: 1, fingerprint, leadId: leadRef.id, eventId: eventRef.id, creationJobId,
        authoredBy: "mcp", reviewedBy: draft.reviewedBy, completionMeaning: "customer_and_automation_occurrence_committed_not_provider_delivery" }, updatedAt: FieldValue.serverTimestamp() });
    return { replayed: false, application, creationJobId };
  }).catch(error => {
    if (error instanceof Error && /^CRM_STAGE_CREATION_(ACTOR|CAPABILITY|ACCESS)_/.test(error.message)) {
      throw new TenantAccessError("creation_authority_revoked", "Acesso para aplicar a criacao foi revogado.");
    }
    throw error;
  });
}
