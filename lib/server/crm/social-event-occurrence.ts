import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";
import { readUnambiguousConversationLead } from "@/lib/server/crm/conversation-commercial-context";
import { supportsAtomicCrmEffect, supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";
import { crmMutationBaseline, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { newStageHookProgress, readStageHookProgress } from "@/lib/server/crm/stage-hook-progress";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { isTenantBillingBlocked, TenantAccessError } from "@/lib/server/tenant";
import { normalizeTenantSocialAutomationConfig, isWithinSocialActiveHours } from "@/lib/server/social/config";
import { processAutomationSignalOccurrence } from "@/lib/server/crm/automation-signal-execution";
import type { TenantAutomationDoc } from "@/lib/server/automations";

const jobType = "crm_social_event_occurrence";
const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const millis = (value: unknown): number => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
const signature = (row: FirebaseFirestore.DocumentData) => digest([row.tenantId, row.channelId, row.channelType, row.entryId, row.eventType, row.actorId, row.commentId || row.eventId, row.postId || null, row.text || ""]);
const canonical = (row: FirebaseFirestore.DocumentData) => `crm_social_event_${digest([row.tenantId, row.channelId, row.eventType, row.actorId, row.commentId || row.eventId])}`;

async function authority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.protocolVersion !== 1 || ![row.tenantId, row.leadId, row.chatId, row.socialLogId, row.channelId].every(valid) ||
      row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_SOCIAL_PROTOCOL_INVALID");
  const log = await tx.get(adminDb.collection("social_automation_logs").doc(row.socialLogId));
  const target = await readUnambiguousConversationLead(tx, { tenantId: row.tenantId, chatId: row.chatId });
  const chat = await tx.get(adminDb.collection("chats").doc(row.chatId));
  const channel = await tx.get(adminDb.collection("tenant_channels").doc(row.channelId));
  const source = log.data(), binding = channel.data();
  if (!source || canonical(source) !== id || source.tenantId !== row.tenantId || signature(source) !== row.socialFingerprint ||
      !log.createTime?.isEqual(row.socialLogGeneration) || source.preparationProtocol !== 1 && source.preparationProtocol !== 2 ||
      row.admissionProtocol === 1 && (source.preparationProtocol !== 2 || source.automationEventProtocol !== 1) ||
      source.automationOccurrenceId && source.automationOccurrenceId !== id ||
      !target.ok || target.leadId !== row.leadId || !target.generation.isEqual(row.leadGeneration) || !target.chatGeneration.isEqual(row.chatGeneration) ||
      chat.data()?.channelId !== row.channelId || chat.data()?.contactExternalId !== source.actorId ||
      !binding || binding.tenantId !== row.tenantId || binding.status !== "active" || binding.type !== source.channelType ||
      ![binding.externalAccountId, binding.pageId].includes(source.entryId)) throw new Error("CRM_STAGE_SOCIAL_SOURCE_REVOKED");
  const contactId = `${row.tenantId}_${source.channelType}_${source.actorId}`.replace(/[^a-zA-Z0-9_-]/g, "_").trim().slice(0, 240);
  const contact = await tx.get(adminDb.collection("social_automation_contacts").doc(contactId));
  if (contact.exists && (contact.data()?.tenantId !== row.tenantId || contact.data()?.actorId !== source.actorId || contact.data()?.optedOut === true)) throw new Error("CRM_STAGE_SOCIAL_CONTACT_REVOKED");
  const config = await tx.get(adminDb.collection("social_automations").doc(row.tenantId));
  const settings = await tx.get(adminDb.collection("tenant_settings").doc(row.tenantId));
  const normalized = normalizeTenantSocialAutomationConfig(row.tenantId, config.data(), { ...settings.data(), tenantId: row.tenantId });
  if (!normalized.enabled || !isWithinSocialActiveHours(normalized.activeHours)) throw new Error("CRM_STAGE_SOCIAL_POLICY_REVOKED");
  await tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId));
  await tx.get(adminDb.collection("tenants").doc(row.tenantId));
  try { await assertTenantModule(row.tenantId, "crm"); if (await isTenantBillingBlocked(row.tenantId)) throw new Error("CRM_STAGE_SOCIAL_TENANT_BLOCKED"); }
  catch (error) { if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_SOCIAL_MODULE_REVOKED"); throw error; }
}

/** Public engagement has its own source. Never manufacture a client message or
 * let a public comment authorize a generic private-message action. */
export async function admitSocialEventOccurrence(input: {
  tenantId: string; leadId: string; chatId: string; socialLogId: string; claimToken: string;
  normalize: (id: string, data: FirebaseFirestore.DocumentData, tenantId: string) => TenantAutomationDoc;
  matches: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData, channel: string) => boolean;
}) {
  if (![input.tenantId, input.leadId, input.chatId, input.socialLogId, input.claimToken].every(valid)) throw new Error("CRM_STAGE_SOCIAL_INPUT_INVALID");
  return adminDb.runTransaction(async tx => {
    const log = await tx.get(adminDb.collection("social_automation_logs").doc(input.socialLogId)), source = log.data();
    if (!source || source.tenantId !== input.tenantId || source.claimToken !== input.claimToken || source.status !== "claimed" || millis(source.claimUntil) <= Date.now()) throw new Error("CRM_STAGE_SOCIAL_CLAIM_REVOKED");
    const id = canonical(source), ref = adminDb.collection("jobs").doc(id), existing = await tx.get(ref);
    if (existing.exists) { const previous = existing.data()!; if (previous.type !== jobType || previous.socialFingerprint !== signature(source) || previous.leadId !== input.leadId || previous.chatId !== input.chatId) throw new Error("CRM_STAGE_SOCIAL_EVENT_CHANGED"); await authority(tx, previous, id); return id; }
    const target = await readUnambiguousConversationLead(tx, input);
    if (!target.ok || target.leadId !== input.leadId) throw new Error("CRM_STAGE_SOCIAL_TARGET_AMBIGUOUS");
    const row = { type: jobType, protocolVersion: 1, admissionProtocol: source.preparationProtocol === 2 && source.automationEventProtocol === 1 ? 1 : 0, tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId, socialLogId: log.id,
      socialLogGeneration: log.createTime!, socialFingerprint: signature(source), channelId: source.channelId, channel: source.channelType,
      leadGeneration: target.generation, chatGeneration: target.chatGeneration, actorId: "meta_social_webhook", actorName: "Meta Social Webhook", status: "ready", attempts: 0 };
    await authority(tx, row, id);
    if (row.admissionProtocol !== 1) {
      // An old social preparation may already have run generic effects without
      // receipts. Keep its public-reply workflow, but never grant those effects
      // a new execution merely because the webhook was retried after migration.
      tx.create(ref, { ...row, status: "reconciliation_required", completionMeaning: "legacy_social_effects_require_review",
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(log.ref, { automationOccurrenceId: id, leadId: input.leadId, chatId: input.chatId }); return id;
    }
    const lead = (await tx.get(adminDb.collection("leads").doc(input.leadId))).data()!, plans: TenantAutomationDoc[] = [];
    await visitTenantAutomationCatalogue(tx, input.tenantId, (configId, data) => {
      const doc = input.normalize(configId, data, input.tenantId);
      if (input.matches(doc, lead, row.channel)) plans.push(JSON.parse(JSON.stringify(doc)));
      if (plans.length > 120) throw new Error("CRM_STAGE_SOCIAL_PLAN_TOO_LARGE");
    }, () => {});
    const crm = plans.some(plan => plan.actions.some(supportsAtomicCrmEffect)), pipeline = crm ? await loadTenantPipelineInTransaction(tx, input.tenantId) : null;
    tx.create(ref, { ...row, stageHookProgress: newStageHookProgress(row), stageAutomationProtocolVersion: 1, stageInternalEffectProtocolVersion: 1, stageAutomationPlans: plans,
      ...(plans.every(plan => plan.actions.every(supportsReceiptBackedAutomationAction)) ? { stageRunRecoveryProtocol: 2 } : {}),
      ...(crm ? { stageCrmProtocolVersion: 1, stageCrmBaseline: crmMutationBaseline(lead), stageCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.crmFieldOwnership?.[field] || null])), stageCrmPipeline: pipeline } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(log.ref, { automationOccurrenceId: id, leadId: input.leadId, chatId: input.chatId }); return id;
  });
}

export async function assertSocialEventAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== jobType || row.admissionProtocol !== 1 || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_SOCIAL_SOURCE_REVOKED");
  await authority(tx, row, input.id); return source;
}
export async function processSocialEventOccurrence(id: string, tenantId?: string) {
  return processAutomationSignalOccurrence(id, tenantId, { type: jobType, kind: "socialEvent", trigger: "message_received", authorize: authority, completionMeaning: "social_internal_actions_not_private_message_or_reply_delivery" });
}
export async function processPendingSocialEventOccurrences(input?: { tenantId?: string; limit?: number }) {
  const query = (status: string) => { let scoped = adminDb.collection("jobs").where("type", "==", jobType).where("status", "==", status); if (input?.tenantId) scoped = scoped.where("tenantId", "==", input.tenantId); return scoped; };
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const doc of [...ready.docs, ...expired.docs]) { try { const result = await processSocialEventOccurrence(doc.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; } }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
