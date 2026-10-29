import { createHash } from "node:crypto";
import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantCapability, TenantAccessError, type TenantMembership } from "@/lib/server/tenant";
import { assertAssignedCommercialRecordAccess, hasTeamWideCommercialAccess } from "@/lib/server/commercial-access";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import { isCrmFieldManuallyOwned, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";

export const crmDraftTypes = new Set(["update_lead", "assign_lead", "create_proposal"]);
export class CrmDraftMutationConflict extends Error {}
function clean(value: unknown, max = 180) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function crmDraftFingerprint(draft: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(canonical([draft.tenantId, draft.type, draft.proposedChange]))).digest("hex");
}

/** No intermediate applying state: data, ownership, audit and receipt commit
 * together. Generated content stays identified as MCP, even when a human
 * explicitly approves its application. No messages or financial effects here. */
export async function applyApprovedCrmDraft(input: {
  tenantId: string; draftId: string; expectedDraftVersion: Timestamp; membership: TenantMembership;
  actorId: string; actorName: string; viaMcp: boolean;
}) {
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(input.draftId) || input.membership.tenantId !== input.tenantId || input.membership.userId !== input.actorId) throw new CrmDraftMutationConflict("Contexto de aplicacao invalido.");
  const draftRef = adminDb.collection("mcp_action_drafts").doc(input.draftId);
  const key = createHash("sha256").update(JSON.stringify([input.tenantId, input.draftId])).digest("hex"), eventId = `mcp_crm_${key}`;
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(draftRef), draft = snapshot.data();
    if (!draft || draft.tenantId !== input.tenantId || !crmDraftTypes.has(draft.type)) throw new CrmDraftMutationConflict("Rascunho fora deste contexto.");
    assertTenantCapability(input.membership, draft.type === "create_proposal" ? "manage_commercial" : "edit_leads");
    const proposed = record(draft.proposedChange), leadId = clean(proposed.leadId), fingerprint = crmDraftFingerprint(draft);
    if (!leadId || leadId !== proposed.leadId || leadId.includes("/")) throw new CrmDraftMutationConflict("Cliente da alteracao invalido.");
    const leadRef = adminDb.collection("leads").doc(leadId), leadSnapshot = await tx.get(leadRef), lead = leadSnapshot.data();
    if (!lead || lead.tenantId !== input.tenantId) throw new CrmDraftMutationConflict("Cliente nao encontrado nesta empresa.");
    assertAssignedCommercialRecordAccess(input.membership, input.actorId, lead);
    const receipt = record(draft.crmMutation);
    if (draft.status === "applied" && receipt.protocol === 1) {
      if (receipt.fingerprint !== fingerprint || receipt.leadId !== leadId || receipt.eventId !== eventId) throw new CrmDraftMutationConflict("Recibo e rascunho divergem; revise a alteracao.");
      return { replayed: true, application: record(draft.application) };
    }
    if (draft.status !== "approved_pending_apply" || draft.appliedAt || !snapshot.updateTime?.isEqual(input.expectedDraftVersion) ||
        draft.reviewedChangeFingerprint !== fingerprint) throw new CrmDraftMutationConflict("O rascunho mudou ou precisa ser aprovado novamente.");
    const humanReview = draft.reviewDecision === "human_review" && typeof draft.reviewedBy === "string" && draft.reviewedBy && typeof draft.reviewedAt?.toMillis === "function";
    if (humanReview && (draft.reviewedLeadId !== leadId || !draft.reviewedLeadVersion?.isEqual?.(leadSnapshot.updateTime))) throw new CrmDraftMutationConflict("O cliente mudou apos a aprovacao. Revise e aprove novamente.");
    const humanDecisionBy = !input.viaMcp ? input.actorId : humanReview ? String(draft.reviewedBy) : null;
    let patch: Record<string, unknown> = {}, application: Record<string, unknown>;
    const blockedFields: string[] = [];
    if (draft.type === "assign_lead") {
      const ownerId = clean(proposed.ownerUserId);
      if (!ownerId || ownerId !== proposed.ownerUserId || ownerId.includes("/")) throw new CrmDraftMutationConflict("Atribuicao invalida.");
      if (ownerId !== input.actorId && !hasTeamWideCommercialAccess(input.membership)) throw new TenantAccessError("commercial_assignment_denied", "Somente gestores podem atribuir para outra pessoa.");
      const owner = (await tx.get(adminDb.collection("tenant_users").doc(`${input.tenantId}_${ownerId}`))).data();
      if (!owner || owner.tenantId !== input.tenantId || owner.status !== "active") throw new CrmDraftMutationConflict("Responsavel nao esta ativo nesta empresa.");
      patch = { ownerId, assignedTo: ownerId, ownerUserId: ownerId, owner: clean(owner.name) || clean(owner.email) };
      application = { leadId, patch };
    } else if (draft.type === "update_lead") {
      const raw = record(proposed.patch);
      const textFields: Array<[string, string, number]> = [["name", "nome", 180], ["company", "empresa", 180], ["email", "email", 180], ["status", "status", 40], ["priority", "priority", 20], ["heat", "heat", 20], ["notes", "notes", 6000]];
      for (const [source, destination, max] of textFields) if (raw[source] !== undefined) patch[destination] = clean(raw[source], max);
      if (raw.phone !== undefined) patch.telefone = normalizePhoneBR(clean(raw.phone, 40));
      if (typeof raw.potentialValue === "number" && Number.isFinite(raw.potentialValue)) { patch.potentialValue = raw.potentialValue; patch.valorPotencial = raw.potentialValue; }
      if (Array.isArray(raw.tags)) patch.tags = raw.tags.map(tag => clean(tag, 40)).filter(Boolean).slice(0, 30);
      if (raw.customFields && typeof raw.customFields === "object") patch.customFields = { ...record(lead.customFields), ...record(raw.customFields) };
      if (raw.pipelineStage !== undefined) {
        const stage = normalizePipelineStageId(raw.pipelineStage, ""), pipeline = await loadTenantPipelineInTransaction(tx, input.tenantId);
        if (!pipeline.stages.some(item => item.id === stage)) throw new CrmDraftMutationConflict("A etapa aprovada nao existe no funil desta empresa.");
        patch.pipelineStage = stage; patch.stage = stage; patch.stageUpdatedAt = FieldValue.serverTimestamp();
      }
      if (patch.priority !== undefined && !["low", "medium", "high"].includes(String(patch.priority))) throw new CrmDraftMutationConflict("Prioridade invalida.");
      if (!humanDecisionBy) for (const field of ownedCrmFields) if (isCrmFieldManuallyOwned(lead, field) && patch[field] !== undefined) {
        blockedFields.push(field); delete patch[field];
        if (field === "pipelineStage") { delete patch.stage; delete patch.stageUpdatedAt; }
      }
      const semanticPatch = { ...patch }; delete semanticPatch.stageUpdatedAt;
      application = { leadId, patch: semanticPatch, blockedFields };
    } else {
      const title = clean(proposed.title), total = proposed.totalValue == null ? null : Number(proposed.totalValue), validUntil = proposed.validUntil == null ? null : clean(proposed.validUntil, 10);
      if (!title || (total !== null && (!Number.isFinite(total) || total < 0 || total > 1_000_000_000))) throw new CrmDraftMutationConflict("Titulo ou valor da proposta invalido.");
      const settings = (await tx.get(adminDb.collection("tenant_settings").doc(input.tenantId))).data();
      if (settings?.tenantId && settings.tenantId !== input.tenantId) throw new CrmDraftMutationConflict("Configuracao de outra empresa.");
      const proposalId = `proposal_${key}`;
      tx.create(adminDb.collection("orcamentos").doc(proposalId), { tenantId: input.tenantId, clientId: input.tenantId, clientName: clean(settings?.name) || "Cliente",
        leadId, leadName: clean(lead.nome) || "Lead", leadCompany: clean(lead.empresa) || null, titulo: title,
        tipo: clean(proposed.type, 80) || "Proposta comercial", status: "Rascunho", valorTotal: total, validade: validUntil,
        resumo: clean(proposed.summary, 4000) || null, ownerId: clean(lead.ownerId || lead.assignedTo) || input.actorId, owner: clean(lead.owner || lead.ownerName) || input.actorName,
        createdBy: input.actorId, createdByName: input.actorName, source: "mcp", sourceDraftId: input.draftId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      application = { proposalId, leadId, proposalStatus: "Rascunho", totalValue: total, validUntil };
    }
    const before = Object.fromEntries(Object.keys(patch).filter(field => field !== "stageUpdatedAt").map(field => [field, lead[field] ?? null]));
    const manualFields = ownedCrmFields.filter(field => patch[field] !== undefined);
    if (Object.keys(patch).length) tx.set(leadRef, { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actorId, updatedByName: input.actorName }, { merge: true });
    for (const field of manualFields) tx.update(leadRef, { [`crmFieldOwnership.${field}`]: { source: humanDecisionBy ? "manual" : "approved_mcp",
      locked: Boolean(humanDecisionBy), actorId: humanDecisionBy || input.actorId, authoredBy: "mcp", sourceDraftId: input.draftId,
      appliedBy: input.actorId, updatedAt: FieldValue.serverTimestamp() } });
    tx.create(leadRef.collection("events").doc(eventId), { tenantId: input.tenantId, type: draft.type === "create_proposal" ? "budget_created" : "mcp_crm_mutation_applied",
      title: draft.type === "create_proposal" ? "Proposta criada" : "Alteracao aprovada aplicada", draftId: input.draftId, generatedBy: "mcp",
      ...(draft.type === "create_proposal" ? { budgetId: application.proposalId, detail: "Proposta criada pelo MCP apos aprovacao." } : {}),
      actorId: input.actorId, actorName: input.actorName, reviewedBy: draft.reviewedBy || null, blockedFields, before, application, createdAt: FieldValue.serverTimestamp() });
    tx.create(adminDb.collection("audit_logs").doc(eventId), { tenantId: input.tenantId, type: "mcp_supervised_action_applied", action: draft.type,
      actorId: input.actorId, actorName: input.actorName, draftId: input.draftId, before, after: application, generatedBy: "mcp", createdAt: FieldValue.serverTimestamp() });
    tx.update(draftRef, { status: "applied", application, appliedAt: FieldValue.serverTimestamp(), appliedBy: input.actorId, appliedByName: input.actorName,
      crmMutation: { protocol: 1, fingerprint, leadId, eventId, authoredBy: "mcp", humanDecisionBy, blockedFields, completionMeaning: "internal_records_committed_no_external_delivery" }, updatedAt: FieldValue.serverTimestamp() });
    return { replayed: false, application };
  });
}
