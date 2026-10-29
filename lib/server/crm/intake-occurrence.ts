import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { getTenantBillingAccessDenial } from "@/lib/tenant-billing-access";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { crmDraftFingerprint } from "@/lib/server/crm/draft-mutation";
import { newStageHookProgress, readStageHookProgress, canResumeStageHooks, canInitializeStageHooks } from "@/lib/server/crm/stage-hook-progress";
import { createStageHookRunner, stageHookErrorNeedsReview } from "@/lib/server/crm/stage-hook-execution";

export const INTAKE_CREATED_JOB_TYPE = "crm_lead_created_occurrence";
function validId(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/"); }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }
export function intakeCreationJobId(eventId: string) {
  if (!validId(eventId)) throw new Error("CRM_STAGE_INTAKE_EVENT_INVALID");
  return `crm_intake_created_${eventId}`;
}

function assignedOwner(lead: FirebaseFirestore.DocumentData) { return String(lead.assignedTo || lead.ownerId || lead.ownerUserId || lead.assignedUserId || lead.responsavelId || "").trim(); }
async function assertAgencyCreationActor(tx: FirebaseFirestore.Transaction, tenantId: string, actorId: string, lead: FirebaseFirestore.DocumentData) {
  if (!validId(actorId)) throw new Error("CRM_STAGE_CREATION_ACTOR_INVALID");
  const actor = (await tx.get(adminDb.collection("users").doc(actorId))).data();
  if (!actor || actor.status === "blocked" || !["admin", "agency_owner", "agency_admin", "agency_agent", "closer", "sdr"].includes(actor.role)) throw new Error("CRM_STAGE_CREATION_AGENCY_ROLE_REVOKED");
  if (!["admin", "agency_owner", "agency_admin"].includes(actor.role) && assignedOwner(lead) !== actorId) throw new Error("CRM_STAGE_CREATION_AGENCY_ASSIGNMENT_REVOKED");
  await assertLeadCreationActor(tx, tenantId, actorId, lead, !assignedOwner(lead));
}
export async function assertLeadCreationActor(tx: FirebaseFirestore.Transaction, tenantId: string, actorId: string, lead: FirebaseFirestore.DocumentData, allowUnassigned = false, requiredCapability: "edit_leads" | "manage_settings" | "manage_commercial" = "edit_leads") {
  if (!validId(actorId)) throw new Error("CRM_STAGE_CREATION_ACTOR_INVALID");
  // Keep every source read by the existing access helpers in the effect's
  // transaction so a concurrent revocation also invalidates its commit.
  const reads = await Promise.allSettled([
    tx.get(adminDb.collection("tenant_users").where("userId", "==", actorId).where("tenantId", "==", tenantId).limit(2)),
    tx.get(adminDb.collection("tenant_users").doc(`${tenantId}_${actorId}`)),
    tx.get(adminDb.collection("users").doc(actorId)),
    tx.get(adminDb.collection("client_portal_users").doc(actorId)),
    tx.get(adminDb.collection("tenants").doc(tenantId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(tenantId)),
  ]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const user = reads[2];
  if (user.status !== "fulfilled" || user.value.data()?.status === "blocked") throw new Error("CRM_STAGE_CREATION_ACTOR_REVOKED");
  try {
    const membership = await assertTenantAccess(actorId, tenantId);
    await assertTenantModule(tenantId, "crm");
    if (!hasTenantCapability(membership, requiredCapability)) throw new Error("CRM_STAGE_CREATION_CAPABILITY_REVOKED");
    if (!allowUnassigned) assertAssignedCommercialRecordAccess(membership, actorId, lead);
  } catch (error) {
    if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_CREATION_ACCESS_REVOKED");
    throw error;
  }
}

/** Authenticated creation shares the creation receipts, with its own human
 * authority. Caller supplies the actual audit reference before the transaction. */
export async function commitManualLeadCreationOccurrence(tx: FirebaseFirestore.Transaction, input: {
  leadRef: FirebaseFirestore.DocumentReference; eventRef: FirebaseFirestore.DocumentReference;
  record: FirebaseFirestore.DocumentData; actorId: string; actorName: string;
  producer?: "agency_leads";
  approval?: { draftId: string; fingerprint: string; reviewedBy: string; reviewDecision: string };
}) {
  const { leadRef, eventRef, record, actorId, actorName } = input;
  const agency = input.producer === "agency_leads";
  if (!validId(record.tenantId) || eventRef.parent.parent?.path !== leadRef.path ||
      (agency ? Boolean(input.approval) : !["manual", "mcp"].includes(record.sourceType) || (record.sourceType === "mcp") !== Boolean(input.approval))) throw new Error("CRM_STAGE_CREATION_CONTEXT_INVALID");
  if (agency) await assertAgencyCreationActor(tx, record.tenantId, actorId, record);
  else await assertLeadCreationActor(tx, record.tenantId, actorId, record, !assignedOwner(record));
  const id = intakeCreationJobId(eventRef.id), creationAuthority = agency ? "agency_actor" : "tenant_actor";
  const producer = agency ? { creationProducer: "agency_leads" } : {}, sourceId = agency ? record.sourceId || null : null;
  const approval = input.approval ? { sourceDraftId: input.approval.draftId, draftFingerprint: input.approval.fingerprint,
    draftReviewedBy: input.approval.reviewedBy, draftReviewDecision: input.approval.reviewDecision, authoredBy: "mcp" } : {};
  const saved: FirebaseFirestore.DocumentData = { ...record, ...approval, ...producer, intakeCreationEventId: eventRef.id, creationAuthority };
  tx.create(leadRef, saved);
  tx.create(eventRef, { tenantId: record.tenantId, type: "system", title: "Contato criado", detail: `Cadastrado manualmente por ${actorName}.`,
    actorId, actorName, creationAuthority, initialOwnerId: assignedOwner(record) || null, intakeCreated: true, intakeWorkflows: "enabled", creationJobId: id,
    ...approval, ...producer, sourceType: record.sourceType, sourceId, createdAt: FieldValue.serverTimestamp() });
  tx.create(adminDb.collection("jobs").doc(id), { tenantId: record.tenantId, type: INTAKE_CREATED_JOB_TYPE, protocolVersion: 1,
    leadId: leadRef.id, sourceEventId: eventRef.id, ...approval, ...producer, sourceType: record.sourceType, sourceId, creationAuthority,
    channel: record.channel || "manual", workflowDecision: "enabled", initialStage: record.pipelineStage,
    actorId, actorName, initialOwnerId: assignedOwner(record) || null, status: "ready", attempts: 0, completionMeaning: "lead_creation_committed_automation_pending",
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  return saved;
}

/** Only live producers opt in. History import and legacy identity lookup do not
 * turn an old customer into a new automation occurrence. */
export async function commitSocialLeadCreationOccurrence(tx: FirebaseFirestore.Transaction, input: {
  leadRef: FirebaseFirestore.DocumentReference; eventRef: FirebaseFirestore.DocumentReference;
  record: FirebaseFirestore.DocumentData; channelId: string; actorId: string; actorName: string;
}) {
  const { record, leadRef, eventRef } = input;
  if (!validId(record.tenantId) || !validId(input.channelId) || !["instagram", "messenger"].includes(record.channel) ||
      !["meta_webhook", "meta_messenger_sync"].includes(input.actorId) || eventRef.parent.parent?.path !== leadRef.path) throw new Error("CRM_STAGE_SOCIAL_CREATION_CONTEXT_INVALID");
  const channel = (await tx.get(adminDb.collection("tenant_channels").doc(input.channelId))).data();
  if (!channel || channel.tenantId !== record.tenantId || channel.type !== record.channel || channel.status !== "active") throw new Error("CRM_STAGE_SOCIAL_CHANNEL_REVOKED");
  const sourceType = record.channel === "instagram" ? "instagram_dm" : "facebook_messenger";
  if (record.sourceType !== sourceType || !validId(record.externalProfileId)) throw new Error("CRM_STAGE_SOCIAL_CREATION_SOURCE_INVALID");
  const id = intakeCreationJobId(eventRef.id), createdAt = FieldValue.serverTimestamp();
  const proof = { creationAuthority: "social_channel", creationChannelId: input.channelId,
    creationAccountId: typeof channel.externalAccountId === "string" ? channel.externalAccountId : "",
    creationPageId: typeof channel.pageId === "string" ? channel.pageId : "", sourceProfileId: record.externalProfileId };
  tx.create(leadRef, { ...record, ...proof, intakeCreationEventId: eventRef.id, createdAt });
  tx.create(eventRef, { tenantId: record.tenantId, type: "system", title: "Lead criado", detail: `Lead criado automaticamente a partir de ${record.channel}.`,
    ...proof, actorId: input.actorId, actorName: input.actorName, intakeCreated: true, intakeWorkflows: "enabled", creationJobId: id,
    sourceType, sourceId: record.sourceId || null, createdAt });
  tx.create(adminDb.collection("jobs").doc(id), { tenantId: record.tenantId, type: INTAKE_CREATED_JOB_TYPE, protocolVersion: 1,
    ...proof, leadId: leadRef.id, sourceEventId: eventRef.id, sourceType, sourceId: record.sourceId || null, channel: record.channel,
    actorId: input.actorId, actorName: input.actorName, workflowDecision: "enabled", initialStage: record.pipelineStage,
    status: "ready", attempts: 0, completionMeaning: "lead_creation_committed_automation_pending", createdAt, updatedAt: createdAt });
  return id;
}

async function assertAuthority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_INTAKE_HOOK_PROGRESS_INVALID");
  if (row.protocolVersion !== 1 || row.workflowDecision !== "enabled" || ![row.tenantId, row.leadId, row.sourceEventId].every(validId) ||
      id !== intakeCreationJobId(row.sourceEventId)) throw new Error("CRM_STAGE_INTAKE_PROTOCOL_INVALID");
  const reads = await Promise.allSettled([
    tx.get(adminDb.collection("leads").doc(row.leadId)),
    tx.get(adminDb.collection("leads").doc(row.leadId).collection("events").doc(row.sourceEventId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId)),
    tx.get(adminDb.collection("tenants").doc(row.tenantId)),
  ]);
  for (const read of reads) if (read.status === "rejected") throw read.reason;
  const [leadRead, eventRead, , tenantRead] = reads;
  if (leadRead.status !== "fulfilled" || eventRead.status !== "fulfilled" || tenantRead.status !== "fulfilled") throw new Error("CRM_STAGE_INTAKE_READ_INVALID");
  const lead = leadRead.value.data(), event = eventRead.value.data();
  if (!lead || lead.tenantId !== row.tenantId || lead.intakeCreationEventId !== row.sourceEventId ||
      !millis(row.createdAt) || !lead.createdAt?.isEqual?.(row.createdAt) ||
      !event || event.tenantId !== row.tenantId || event.intakeCreated !== true || event.intakeWorkflows !== "enabled" ||
      event.creationJobId !== id || !event.createdAt?.isEqual?.(row.createdAt) ||
      event.sourceType !== row.sourceType || event.sourceId !== row.sourceId || isCrmFieldManuallyOwned(lead, "pipelineStage") ||
      tenantRead.value.exists && getTenantBillingAccessDenial(tenantRead.value.data()!)) throw new Error("CRM_STAGE_INTAKE_AUTHORITY_CHANGED");
  const authority = row.creationAuthority || "service";
  if (!["service", "tenant_actor", "social_channel", "agency_actor"].includes(authority) || (event.creationAuthority || "service") !== authority ||
      (lead.creationAuthority || "service") !== authority) throw new Error("CRM_STAGE_CREATION_AUTHORITY_CHANGED");
  if (authority === "agency_actor" || row.creationProducer || lead.creationProducer || event.creationProducer) {
    if (authority !== "agency_actor" || [row, lead, event].some(value => value.creationProducer !== "agency_leads") ||
        event.actorId !== row.actorId || event.initialOwnerId !== row.initialOwnerId || lead.sourceType !== row.sourceType ||
        (lead.sourceId || null) !== row.sourceId || assignedOwner(lead) !== (row.initialOwnerId || "")) throw new Error("CRM_STAGE_CREATION_AGENCY_PRODUCER_CHANGED");
    await assertAgencyCreationActor(tx, row.tenantId, row.actorId, lead);
  }
  if (authority === "social_channel" || row.creationChannelId || lead.creationChannelId || event.creationChannelId) {
    if (authority !== "social_channel" || !validId(row.creationChannelId) ||
        !["meta_webhook", "meta_messenger_sync"].includes(row.actorId) || event.actorId !== row.actorId ||
        !["instagram", "messenger"].includes(row.channel) || lead.channel !== row.channel || lead.externalProfileId !== row.sourceProfileId ||
        row.sourceType !== (row.channel === "instagram" ? "instagram_dm" : "facebook_messenger") ||
        [lead, event].some(value => ["creationChannelId", "creationAccountId", "creationPageId", "sourceProfileId"].some(key => value[key] !== row[key]))) throw new Error("CRM_STAGE_SOCIAL_CREATION_PROOF_INVALID");
    const channel = (await tx.get(adminDb.collection("tenant_channels").doc(row.creationChannelId))).data();
    if (!channel || channel.tenantId !== row.tenantId || channel.type !== row.channel || channel.status !== "active" ||
        (channel.externalAccountId || "") !== row.creationAccountId || (channel.pageId || "") !== row.creationPageId) throw new Error("CRM_STAGE_SOCIAL_CHANNEL_REVOKED");
    const chats = await tx.get(adminDb.collection("chats").where("tenantId", "==", row.tenantId).where("leadId", "==", row.leadId).where("channelId", "==", row.creationChannelId).limit(2));
    if (chats.empty) throw new Error("SOCIAL_CREATION_CONVERSATION_PENDING");
    if (!chats.docs.some(chat => chat.data().channel === row.channel && chat.data().contactExternalId === row.sourceProfileId)) throw new Error("CRM_STAGE_SOCIAL_CONVERSATION_CHANGED");
  }
  if (authority === "tenant_actor") {
    if (event.actorId !== row.actorId || event.initialOwnerId !== row.initialOwnerId) throw new Error("CRM_STAGE_CREATION_ACTOR_CHANGED");
    await assertLeadCreationActor(tx, row.tenantId, row.actorId, lead, row.initialOwnerId === null && !assignedOwner(lead));
  }
  if ((authority !== "agency_actor" && row.sourceType === "mcp") || row.sourceDraftId || lead.sourceDraftId || event.sourceDraftId) {
    if (authority !== "tenant_actor" || row.sourceType !== "mcp" || lead.sourceType !== "mcp" || !validId(row.sourceDraftId) ||
        [lead, event].some(value => value.sourceDraftId !== row.sourceDraftId || value.draftFingerprint !== row.draftFingerprint ||
          value.draftReviewedBy !== row.draftReviewedBy || value.draftReviewDecision !== row.draftReviewDecision)) throw new Error("CRM_STAGE_CREATION_APPROVAL_INVALID");
    const draft = (await tx.get(adminDb.collection("mcp_action_drafts").doc(row.sourceDraftId))).data();
    if (!draft || draft.tenantId !== row.tenantId || draft.type !== "create_lead" || draft.status !== "applied" ||
        crmDraftFingerprint(draft) !== row.draftFingerprint || draft.reviewedChangeFingerprint !== row.draftFingerprint ||
        draft.reviewedBy !== row.draftReviewedBy || draft.reviewDecision !== row.draftReviewDecision ||
        draft.appliedBy !== row.actorId || draft.creationMutation?.protocol !== 1 || draft.creationMutation?.creationJobId !== id ||
        draft.creationMutation?.fingerprint !== row.draftFingerprint || draft.application?.leadId !== row.leadId) throw new Error("CRM_STAGE_CREATION_APPROVAL_REVOKED");
    if (row.draftReviewDecision === "human_review") await assertLeadCreationActor(tx, row.tenantId, row.draftReviewedBy, lead, true, "manage_settings");
    else if (row.draftReviewDecision === "autonomous_policy") {
      const settings = (await tx.get(adminDb.collection("tenant_settings").doc(row.tenantId))).data();
      if (settings?.mcp?.writeMode !== "autonomous" || draft.autonomousEligible !== true || draft.source !== "mcp" ||
          draft.userId !== row.actorId || row.draftReviewedBy !== row.actorId) throw new Error("CRM_STAGE_CREATION_POLICY_REVOKED");
    } else throw new Error("CRM_STAGE_CREATION_REVIEW_INVALID");
  }
  try { await assertTenantModule(row.tenantId, "crm"); }
  catch (error) {
    if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_INTAKE_MODULE_REVOKED");
    throw error;
  }
}

/** Creation is proved by the existing intake audit and original creation stamp,
 * never by the person's identity or by pretending a stage/order was created. */
export async function assertIntakeAutomationSource(tx: FirebaseFirestore.Transaction, input: {
  id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean;
}) {
  if (![input.id, input.tenantId, input.leadId].every(validId)) throw new Error("CRM_STAGE_INTAKE_SOURCE_INVALID");
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== INTAKE_CREATED_JOB_TYPE || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_INTAKE_SOURCE_REVOKED");
  await assertAuthority(tx, row, input.id);
  return source;
}

export async function processIntakeCreation(id: string, tenantId?: string) {
  if (!validId(id)) throw new Error("CRM_STAGE_INTAKE_JOB_INVALID");
  const ref = adminDb.collection("jobs").doc(id), token = randomUUID();
  const row = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.type !== INTAKE_CREATED_JOB_TYPE || tenantId && current.tenantId !== tenantId) return null;
    const expired = current.status === "processing" && millis(current.leaseUntil) <= Date.now();
    if (expired && !canResumeStageHooks(current)) {
      tx.update(ref, { status: "reconciliation_required", lastError: "Criacao interrompida apos inicio; revisar recibos antes de retomar.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    if (current.status !== "ready" && !expired) return null;
    try {
      if (current.stageHookProgress !== undefined ? !canResumeStageHooks(current) : !canInitializeStageHooks(current)) throw new Error("CRM_STAGE_INTAKE_HOOK_PROGRESS_INVALID");
      await assertAuthority(tx, current, id);
    }
    catch (error) {
      if (!(error instanceof Error && error.message.startsWith("CRM_STAGE_"))) throw error;
      tx.update(ref, { status: "reconciliation_required", lastError: "Origem, autorizacao ou controle humano alterados.", updatedAt: FieldValue.serverTimestamp() }); return null;
    }
    tx.update(ref, { status: "processing", claimToken: token, attempts: Number(current.attempts || 0) + 1,
      ...(current.stageHookProgress === undefined ? { stageHookProgress: newStageHookProgress(current) } : {}),
      leaseUntil: new Date(Date.now() + 60_000), updatedAt: FieldValue.serverTimestamp() });
    return current;
  });
  if (!row) return { processed: false };
  const runHook = createStageHookRunner({ ref, authorize: tx => assertIntakeAutomationSource(tx, { id, tenantId: row.tenantId, leadId: row.leadId, token }) });
  let completed = false, needsReview = false;
  try {
    const { runLeadAutomations } = await import("@/lib/server/automations");
    await runHook("automations", () => runLeadAutomations({ tenantId: row.tenantId, leadId: row.leadId, trigger: "lead_created", actorId: row.actorId, actorName: row.actorName,
      channel: row.channel, strictErrors: true, stageSource: { kind: "intake", id, token } }));
    completed = true;
  } catch (error) { needsReview = stageHookErrorNeedsReview(error); }
  const finalized = await adminDb.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (!current || current.status !== "processing" || current.claimToken !== token) return false;
    const confirmed = completed && readStageHookProgress(current)?.steps.every(step => step.status === "done") === true && millis(current.leaseUntil) > Date.now();
    let resumable = !confirmed && !needsReview && canResumeStageHooks(current);
    if (resumable) { try { await assertAuthority(tx, current, id); } catch (error) { if (!stageHookErrorNeedsReview(error)) throw error; resumable = false; } }
    tx.update(ref, { status: confirmed ? "done" : resumable ? "ready" : "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
      completionMeaning: confirmed ? "lead_created_automation_registered_not_provider_delivery" : resumable ? "lead_created_receipts_preserved_automation_pending" : "lead_created_partial_actions_need_reconciliation" });
    return confirmed;
  });
  return { processed: true, completed: finalized };
}

export async function processPendingIntakeCreations(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const query = (status: string) => {
    let q = adminDb.collection("jobs").where("type", "==", INTAKE_CREATED_JOB_TYPE).where("status", "==", status);
    if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId);
    return q;
  };
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const source of [...ready.docs, ...expired.docs]) {
    try { const result = await processIntakeCreation(source.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; }
    catch { failed++; }
  }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
