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
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";

const jobType = "automation_waiting_reply_runtime";
const valid = (value: unknown): value is string => typeof value === "string" && !!value && value.length <= 500 && value === value.trim() && !value.includes("/");
const millis = (value: unknown): number => value instanceof Date ? value.getTime() : value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function identity(row: FirebaseFirestore.DocumentData) {
  return row.runtimeProtocolVersion === 4
    ? `waiting_batch_${digest([row.tenantId, row.chatId, row.waitingKey, [...row.automationIds].sort()])}`
    : `waiting_runtime_${digest([row.tenantId, row.automationId, row.chatId, row.waitingKey])}`;
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, stable(item)]));
  return value;
}
function manifest(plans: TenantAutomationDoc[]) {
  return digest(stable(plans.map(({ id, tenantId, name, description, trigger, enabled, status, conditions, actions }) => ({ id, tenantId, name, description, trigger, enabled, status, conditions, actions }))));
}

async function authority(tx: FirebaseFirestore.Transaction, row: FirebaseFirestore.DocumentData, id: string) {
  const plans = row.stageAutomationPlans;
  const recipe = Array.isArray(plans) && plans.length > 0 && plans.length <= 120 && plans.every(plan => plan && valid(plan.id) && plan.tenantId === row.tenantId && plan.trigger === "waiting_for_reply" && Array.isArray(plan.actions));
  const binding = row.runtimeProtocolVersion === 3 ? recipe && valid(row.automationId) && plans.length === 1 && plans[0].id === row.automationId
    : row.runtimeProtocolVersion === 4 && recipe && Array.isArray(row.automationIds) && row.automationIds.every(valid) && new Set(row.automationIds).size === plans.length &&
      JSON.stringify(row.automationIds) === JSON.stringify(plans.map(plan => plan.id)) && row.waitingPlanFingerprint === manifest(plans);
  if (!binding || row.protocolVersion !== 1 || ![row.tenantId, row.leadId, row.chatId].every(valid) || identity(row) !== id ||
      !Number.isSafeInteger(Number(row.waitingKey)) || Number(row.waitingKey) <= 0 || millis(row.waitingSince) !== Number(row.waitingKey) ||
      !Number.isSafeInteger(row.lastAgentAt) || !Number.isSafeInteger(row.slaDueAtMillis) || typeof row.slaBreached !== "boolean" ||
      row.stageAutomationProtocolVersion !== 1 || row.stageInternalEffectProtocolVersion !== 1 ||
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
      queued.automationSourceLeadId === row.leadId && (row.runtimeProtocolVersion === 4 ? row.automationIds.includes(queued.automationId) : queued.automationId === row.automationId) &&
      typeof chat.lastAgentMessageAt?.isEqual === "function" && chat.lastAgentMessageAt.isEqual(queued.createdAt);
  }
  // A preceding reply in this batch can be acknowledged while a sibling is
  // still queued. Its immutable acceptance timestamp, not mutable updatedAt
  // or the tail ID alone, must explain the current operational reply time.
  if (chat && !ownQueuedReply && valid(chat.lastAgentMessageId)) {
    const messageId = chat.lastAgentMessageId;
    const message = (await tx.get(adminDb.collection("messages").doc(messageId))).data();
    if (message && message.tenantId === row.tenantId && message.chatId === row.chatId && message.sender === "agent" && message.automationGenerated === true &&
        message.stageAutomationProtocol === 1 && message.stageAutomationSourceKind === "waiting" && message.stageAutomationSourceId === id &&
        message.automationSourceLeadId === row.leadId && (row.runtimeProtocolVersion === 4 ? row.automationIds.includes(message.automationId) : message.automationId === row.automationId) &&
        typeof chat.lastAgentMessageAt?.isEqual === "function" && chat.lastAgentMessageAt.isEqual(message.agentAcknowledgedAt) && valid(message.outboundJobId)) {
      const acknowledged = (await tx.get(adminDb.collection("chat_outbound_jobs").doc(message.outboundJobId))).data();
      ownQueuedReply = !!acknowledged && acknowledged.messageId === messageId && acknowledged.tenantId === row.tenantId && acknowledged.chatId === row.chatId &&
        acknowledged.origin === "automation" && acknowledged.stageAutomationProtocol === 1 && acknowledged.stageAutomationSourceKind === "waiting" &&
        acknowledged.stageAutomationSourceId === id && acknowledged.automationSourceLeadId === row.leadId && acknowledged.automationId === message.automationId;
    }
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
type WaitingAdmission = {
  tenantId: string; leadId: string; chatId: string; waitingKey: string; requestedAutomationId?: string;
  normalize: (id: string, data: FirebaseFirestore.DocumentData, tenantId: string) => TenantAutomationDoc;
  matches: (automation: TenantAutomationDoc, lead: FirebaseFirestore.DocumentData, chat: FirebaseFirestore.DocumentData) => boolean;
};
export async function admitWaitingReplyOccurrence(input: WaitingAdmission & { automationId: string }) {
  return admitWaitingReplyBatch({ ...input, requestedAutomationId: input.automationId,
    matches: (plan, lead, chat) => plan.id === input.automationId && input.matches(plan, lead, chat) });
}

/** Freeze the currently due, not-yet-admitted rules before any of their effects.
 * Later thresholds can admit a new batch; each rule keeps its original fence. */
export async function admitWaitingReplyBatch(input: WaitingAdmission) {
  if (![input.tenantId, input.leadId, input.chatId, input.waitingKey].every(valid)) throw new Error("CRM_STAGE_WAITING_INPUT_INVALID");
  return adminDb.runTransaction(async tx => {
    const chatRef = adminDb.collection("chats").doc(input.chatId), chat = (await tx.get(chatRef)).data();
    const target = await readUnambiguousConversationLead(tx, input);
    const lead = (await tx.get(adminDb.collection("leads").doc(input.leadId))).data();
    if (!chat || !target.ok || target.leadId !== input.leadId || !lead || lead.tenantId !== input.tenantId || String(millis(chat.lastClientMessageAt)) !== input.waitingKey) return null;
    const sources = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    const source = async (id: string) => {
      let snap = sources.get(id); if (!snap) { snap = await tx.get(adminDb.collection("jobs").doc(id)); sources.set(id, snap); } return snap;
    };
    const pending = (id: string, row: FirebaseFirestore.DocumentData | undefined): string | null | undefined => {
      if (!row || row.tenantId !== input.tenantId || row.chatId !== input.chatId || row.waitingKey !== input.waitingKey || row.type !== jobType || ![3, 4].includes(row.runtimeProtocolVersion)) throw new Error("CRM_STAGE_WAITING_ADMISSION_CHANGED");
      if (!["ready", "processing"].includes(row.status)) return undefined;
      if (input.requestedAutomationId && !row.stageAutomationPlans?.some((plan: TenantAutomationDoc) => plan.id === input.requestedAutomationId)) return null;
      return row.status === "ready" || millis(row.leaseUntil) <= Date.now() ? id : null;
    };
    const pointer = chat.waitingAutomationAdmission;
    if (pointer?.waitingKey === input.waitingKey && valid(pointer.sourceId)) {
      const snap = await source(pointer.sourceId);
      if (snap.exists) { const current = pending(snap.id, snap.data()); if (current !== undefined) return current; }
    }
    if (["resolved", "archived"].includes(String(chat.status || "").toLowerCase()) || !millis(chat.lastClientMessageAt) || millis(chat.lastAgentMessageAt) >= millis(chat.lastClientMessageAt)) return null;
    const candidates: TenantAutomationDoc[] = [];
    await visitTenantAutomationCatalogue(tx, input.tenantId, (id, data) => {
      const plan = input.normalize(id, data, input.tenantId);
      if (plan.trigger === "waiting_for_reply" && input.matches(plan, lead, chat)) candidates.push(JSON.parse(JSON.stringify(plan)));
    }, () => {});
    const slots = candidates.map(plan => {
      const binding = { ...input, automationId: plan.id };
      const canonical = adminDb.collection("jobs").doc(identity(binding));
      const legacyId = `${input.tenantId}_${plan.id}_${input.chatId}_${input.waitingKey}`.replace(/[^a-zA-Z0-9_-]/g, "_").trim().slice(0, 240);
      return { plan, canonical, legacy: adminDb.collection("jobs").doc(legacyId) };
    });
    const refs = [...new Map(slots.flatMap(slot => [slot.canonical, slot.legacy]).map(ref => [ref.path, ref])).values()];
    const saved = new Map<string, FirebaseFirestore.DocumentSnapshot>();
    for (let offset = 0; offset < refs.length; offset += 100) for (const snap of await tx.getAll(...refs.slice(offset, offset + 100))) saved.set(snap.ref.path, snap);
    const fresh: typeof slots = [];
    for (const slot of slots) {
      const same = (row: FirebaseFirestore.DocumentData) => row.tenantId === input.tenantId && row.automationId === slot.plan.id && row.chatId === input.chatId && row.waitingKey === input.waitingKey;
      const canonical = saved.get(slot.canonical.path)!, legacy = saved.get(slot.legacy.path)!;
      if (canonical.exists) {
        const row = canonical.data()!;
        if (!same(row) || row.leadId !== input.leadId) throw new Error("CRM_STAGE_WAITING_IDENTITY_CHANGED");
        if (row.type === jobType && row.runtimeProtocolVersion === 3) { const current = pending(canonical.id, row); if (current !== undefined) return current; }
        if (row.runtimeProtocolVersion === 4 && valid(row.runtimeCanonicalId)) {
          const previous = await source(row.runtimeCanonicalId);
          if (previous.exists) { const current = pending(previous.id, previous.data()); if (current !== undefined) return current; }
        }
        continue;
      }
      if (legacy.exists && same(legacy.data()!)) continue;
      fresh.push(slot);
      if (fresh.length > 120) throw new Error("CRM_STAGE_WAITING_PLAN_TOO_LARGE");
    }
    if (!fresh.length) return null;
    const plans = fresh.map(slot => slot.plan);
    const row = { type: jobType, protocolVersion: 1, runtimeProtocolVersion: 4, stageAutomationProtocolVersion: 1, stageInternalEffectProtocolVersion: 1, stageAutomationPlans: plans,
      automationIds: plans.map(plan => plan.id), waitingPlanFingerprint: manifest(plans), tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId,
      waitingKey: input.waitingKey, waitingSince: chat.lastClientMessageAt, lastAgentAt: millis(chat.lastAgentMessageAt), slaDueAtMillis: millis(chat.slaDueAt),
      slaBreached: !!millis(chat.slaDueAt) && millis(chat.slaDueAt) <= Date.now(), channel: String(chat.channel || "").toLowerCase(),
      leadGeneration: target.generation, chatGeneration: target.chatGeneration, contactId: target.contactId, contactGeneration: target.contactGeneration,
      actorId: "automation_watchdog", actorName: "Automation Watchdog", status: "ready", attempts: 0 };
    const id = identity(row), ref = adminDb.collection("jobs").doc(id);
    if ((await tx.get(ref)).exists) throw new Error("CRM_STAGE_WAITING_BATCH_CONFLICT");
    await authority(tx, row, id);
    const crm = plans.some(plan => plan.actions.some(supportsAtomicCrmEffect)), pipeline = crm ? await loadTenantPipelineInTransaction(tx, input.tenantId) : null;
    tx.create(ref, { ...row, stageHookProgress: newStageHookProgress(row),
      ...(plans.every(plan => plan.actions.every(supportsReceiptBackedAutomationAction)) ? { stageRunRecoveryProtocol: 2 } : {}),
      ...(crm ? { stageCrmProtocolVersion: 1, stageCrmBaseline: crmMutationBaseline(lead), stageCrmBaselineOwnership: Object.fromEntries(ownedCrmFields.map(field => [field, lead.crmFieldOwnership?.[field] || null])), stageCrmPipeline: pipeline } : {}),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(chatRef, { waitingAutomationAdmission: { waitingKey: input.waitingKey, sourceId: id } });
    const writtenFences = new Set<string>();
    for (const slot of fresh) {
      const fence = { tenantId: input.tenantId, type: "automation_waiting_reply_legacy_fence", runtimeProtocolVersion: 4,
        automationId: slot.plan.id, chatId: input.chatId, leadId: input.leadId, waitingKey: input.waitingKey, status: "claimed", runtimeCanonicalId: id,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      tx.create(slot.canonical, fence);
      writtenFences.add(slot.canonical.path);
      if (!saved.get(slot.legacy.path)!.exists && !writtenFences.has(slot.legacy.path)) { tx.create(slot.legacy, fence); writtenFences.add(slot.legacy.path); }
    }
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
  for (const doc of [...ready.docs, ...expired.docs]) { if (![3, 4].includes(doc.data().runtimeProtocolVersion)) continue; try { const result = await processWaitingReplyOccurrence(doc.id, input?.tenantId); if (result.processed) processed++; if ("completed" in result && result.completed) completed++; } catch { failed++; } }
  return { scanned: ready.size + expired.size, processed, completed, failed };
}
