import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { readUnambiguousConversationLead } from "@/lib/server/crm/conversation-commercial-context";
import { supportsAtomicCrmEffect, supportsReceiptBackedAutomationAction } from "@/lib/automation-effect-contract";
import { crmMutationBaseline, ownedCrmFields } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { newStageHookProgress, readStageHookProgress } from "@/lib/server/crm/stage-hook-progress";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { isTenantBillingBlocked, TenantAccessError } from "@/lib/server/tenant";
import { processAutomationSignalOccurrence } from "@/lib/server/crm/automation-signal-execution";
import type { TenantAutomationDoc } from "@/lib/server/automations";

const jobType = "automation_waiting_reply_runtime";
const valid = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 500 && value === value.trim() && !value.includes("/");
const millis = (value: unknown): number => value instanceof Date ? value.getTime() : value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function identity(row: FirebaseFirestore.DocumentData) { return `waiting_runtime_${digest([row.tenantId, row.automationId, row.chatId, row.waitingKey])}`; }

async function authority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  if (row.runtimeProtocolVersion !== 3 || row.protocolVersion !== 1 || ![row.tenantId, row.leadId, row.chatId, row.automationId].every(valid) || identity(row) !== id ||
      !Number.isSafeInteger(Number(row.waitingKey)) || Number(row.waitingKey) <= 0 || millis(row.waitingSince) !== Number(row.waitingKey) ||
      !Number.isSafeInteger(row.lastAgentAt) || !Number.isSafeInteger(row.slaDueAtMillis) || typeof row.slaBreached !== "boolean" ||
      row.stageAutomationProtocolVersion !== 1 || row.stageInternalEffectProtocolVersion !== 1 || !Array.isArray(row.stageAutomationPlans) || row.stageAutomationPlans.length !== 1 ||
      row.stageAutomationPlans[0]?.id !== row.automationId || row.stageAutomationPlans[0]?.tenantId !== row.tenantId || row.stageAutomationPlans[0]?.trigger !== "waiting_for_reply" ||
      row.stageHookProgress !== undefined && !readStageHookProgress(row)) throw new Error("CRM_STAGE_WAITING_PROTOCOL_INVALID");
  const target = await readUnambiguousConversationLead(tx, { tenantId: row.tenantId, chatId: row.chatId });
  const chat = (await tx.get(adminDb.collection("chats").doc(row.chatId))).data();
  // Enqueue already updates the operational reply timestamp. Recognize only
  // this occurrence's own atomic job/timestamp, never any reply by tail ID alone.
  let ownQueuedReply = false;
  if (chat && millis(chat.lastAgentMessageAt) !== row.lastAgentAt && valid(chat.outboundTailJobId)) {
    const queued = (await tx.get(adminDb.collection("chat_outbound_jobs").doc(chat.outboundTailJobId))).data();
    ownQueuedReply = !!queued && queued.tenantId === row.tenantId && queued.chatId === row.chatId && queued.origin === "automation" &&
      queued.stageAutomationProtocol === 1 && queued.stageAutomationSourceKind === "waiting" && queued.stageAutomationSourceId === id &&
      queued.automationSourceLeadId === row.leadId && queued.automationId === row.automationId &&
      typeof chat.lastAgentMessageAt?.isEqual === "function" && chat.lastAgentMessageAt.isEqual(queued.createdAt);
  }
  if (!target.ok || target.leadId !== row.leadId || !target.generation.isEqual(row.leadGeneration) || !target.chatGeneration.isEqual(row.chatGeneration) ||
      target.contactId !== row.contactId || (target.contactGeneration === null ? row.contactGeneration !== null : !target.contactGeneration.isEqual(row.contactGeneration)) ||
      !chat || ["resolved", "archived"].includes(String(chat.status || "").toLowerCase()) || !millis(chat.lastClientMessageAt) ||
      String(millis(chat.lastClientMessageAt)) !== row.waitingKey ||
      !ownQueuedReply && (millis(chat.lastAgentMessageAt) !== row.lastAgentAt || millis(chat.lastAgentMessageAt) >= millis(chat.lastClientMessageAt)) ||
      millis(chat.slaDueAt) !== row.slaDueAtMillis ||
      String(chat.channel || "").toLowerCase() !== row.channel) throw new Error("CRM_STAGE_WAITING_SOURCE_REVOKED");
  await tx.get(adminDb.collection("tenant_entitlements").doc(row.tenantId));
  await tx.get(adminDb.collection("tenants").doc(row.tenantId));
  try { await assertTenantModule(row.tenantId, "crm"); if (await isTenantBillingBlocked(row.tenantId)) throw new Error("CRM_STAGE_WAITING_TENANT_BLOCKED"); }
  catch (error) { if (error instanceof TenantAccessError) throw new Error("CRM_STAGE_WAITING_MODULE_REVOKED"); throw error; }
}

/** The cause is a persisted waiting interval, not an invented customer message.
 * Old runtimes remain fences: their uncertain effects never gain new receipts. */
export async function admitWaitingReplyOccurrence(input: {
  tenantId: string; automationId: string; leadId: string; chatId: string; waitingKey: string;
  normalize: (id: string, data: FirebaseFirestore.DocumentData, tenantId: string) => TenantAutomationDoc;
  matches: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData, chat: FirebaseFirestore.DocumentData) => boolean;
}) {
  if (![input.tenantId, input.automationId, input.leadId, input.chatId, input.waitingKey].every(valid)) throw new Error("CRM_STAGE_WAITING_INPUT_INVALID");
  const id = identity(input), ref = adminDb.collection("jobs").doc(id);
  const legacyId = `${input.tenantId}_${input.automationId}_${input.chatId}_${input.waitingKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").trim().slice(0, 240);
  const legacyRef = adminDb.collection("jobs").doc(legacyId);
  return adminDb.runTransaction(async tx => {
    const [existing, legacy] = await Promise.all([tx.get(ref), tx.get(legacyRef)]);
    const same = (row: FirebaseFirestore.DocumentData) => row.tenantId === input.tenantId && row.automationId === input.automationId && row.chatId === input.chatId && row.leadId === input.leadId && row.waitingKey === input.waitingKey;
    if (existing.exists) {
      const row = existing.data()!;
      if (!same(row) || row.type !== jobType) throw new Error("CRM_STAGE_WAITING_IDENTITY_CHANGED");
      if (row.runtimeProtocolVersion !== 3) return null;
      return row.status === "ready" || row.status === "processing" && millis(row.leaseUntil) <= Date.now() ? id : null;
    }
    if (legacy.exists && same(legacy.data()!)) return null;
    const chat = (await tx.get(adminDb.collection("chats").doc(input.chatId))).data();
    const target = await readUnambiguousConversationLead(tx, input);
    const config = await tx.get(adminDb.collection("automations").doc(input.automationId));
    const lead = (await tx.get(adminDb.collection("leads").doc(input.leadId))).data();
    if (!chat || !target.ok || target.leadId !== input.leadId || !lead || !config.exists || config.data()?.tenantId !== input.tenantId) return null;
    const automation = input.normalize(config.id, config.data()!, input.tenantId);
    if (automation.trigger !== "waiting_for_reply" || !input.matches(automation, lead, chat)) return null;
    const plans = [JSON.parse(JSON.stringify(automation)) as TenantAutomationDoc];
    const row = { type: jobType, protocolVersion: 1, runtimeProtocolVersion: 3, stageAutomationProtocolVersion: 1, stageInternalEffectProtocolVersion: 1, stageAutomationPlans: plans,
      tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId, automationId: input.automationId,
      waitingKey: input.waitingKey, waitingSince: chat.lastClientMessageAt, lastAgentAt: millis(chat.lastAgentMessageAt), slaDueAtMillis: millis(chat.slaDueAt),
      slaBreached: !!millis(chat.slaDueAt) && millis(chat.slaDueAt) <= Date.now(), channel: String(chat.channel || "").toLowerCase(),
      leadGeneration: target.generation, chatGeneration: target.chatGeneration, contactId: target.contactId, contactGeneration: target.contactGeneration,
      actorId: "automation_watchdog", actorName: "Automation Watchdog", status: "ready", attempts: 0 };
    await authority(tx, row, id);
    const crm = automation.actions.some(supportsAtomicCrmEffect), pipeline = crm ? await loadTenantPipelineInTransaction(tx, input.tenantId) : null;
    tx.create(ref, { ...row, stageHookProgress: newStageHookProgress(row),
      ...(automation.actions.every(supportsReceiptBackedAutomationAction) ? { stageRunRecoveryProtocol: 2 } : {}),
      ...(crm ? { stageCrmProtocolVersion: 1, stageCrmBaseline: crmMutationBaseline(lead), stageCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.crmFieldOwnership?.[field] || null])), stageCrmPipeline: pipeline } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (!legacy.exists) tx.create(legacyRef, { tenantId: input.tenantId, type: "automation_waiting_reply_legacy_fence", automationId: input.automationId, chatId: input.chatId, leadId: input.leadId,
      waitingKey: input.waitingKey, status: "claimed", runtimeCanonicalId: id, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return id;
  });
}
export async function assertWaitingReplyAutomationSource(tx: FirebaseFirestore.Transaction, input: { id: string; tenantId: string; leadId: string; token?: string; delivery?: boolean }) {
  const source = await tx.get(adminDb.collection("jobs").doc(input.id)), row = source.data();
  if (!row || row.type !== jobType || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
      (input.delivery ? row.status !== "done" : row.status !== "processing" || row.claimToken !== input.token || millis(row.leaseUntil) <= Date.now())) throw new Error("CRM_STAGE_WAITING_SOURCE_REVOKED");
  await authority(tx, row, input.id); return source;
}
export async function processWaitingReplyOccurrence(id: string, tenantId?: string) {
  return processAutomationSignalOccurrence(id, tenantId, { type: jobType, kind: "waiting", trigger: "waiting_for_reply", authorize: authority, completionMeaning: "waiting_actions_registered_not_provider_delivery" });
}
export async function processPendingWaitingReplyOccurrences(input?: { tenantId?: string; limit?: number }) {
  const query = (status: string) => { let q = adminDb.collection("jobs").where("type", "==", jobType).where("status", "==", status); if (input?.tenantId) q = q.where("tenantId", "==", input.tenantId); return q; };
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  const [ready, expired] = await Promise.all([query("ready").limit(limit).get(), query("processing").where("leaseUntil", "<=", new Date()).orderBy("leaseUntil").limit(limit).get()]);
  let processed = 0, completed = 0, failed = 0;
  for (const doc of [...ready.docs, ...expired.docs]) { if (doc.data().runtimeProtocolVersion !== 3) continue; try { const result = await processWaitingReplyOccurrence(doc.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; } }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
