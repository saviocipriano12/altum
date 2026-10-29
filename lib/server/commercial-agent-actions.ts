import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import {matchesConversationCommercialFence, type ConversationCommercialFence} from "@/lib/server/crm/conversation-commercial-context";
import {AgentCommercialContextChanged} from "@/lib/server/crm/agent-commercial-task";
import {
  commercialAgentActionPolicy,
  resolveCommercialAgentDeadlines,
  type CommercialAgentActionStatus,
  type CommercialAgentActionType,
  validateCommercialAgentAction,
} from "@/lib/commercial-agent-action";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function actionId(parts: unknown[]) {
  return crypto.createHash("sha256").update(parts.map((part) => String(part || "").trim()).join("|")).digest("hex").slice(0, 32);
}

export type RecordCommercialAgentActionInput = {
  conversationFence?: ConversationCommercialFence;
  tenantId: string;
  leadId: string;
  chatId?: string | null;
  type: CommercialAgentActionType;
  title: string;
  detail?: string | null;
  referenceCollection?: string | null;
  referenceId?: string | null;
  dedupeKey: string;
  amount?: number | null;
  currency?: string | null;
  payload?: Record<string, unknown>;
  actorVersion?: string | null;
  executed?: boolean;
};

/** Prepare the review in the same transaction as a newly created draft. */
export async function prepareConversationCommercialAction(tx: FirebaseFirestore.Transaction, input: RecordCommercialAgentActionInput,
  preparedReference?: {collection: string; id: string}) {
  const fence = input.conversationFence;
  if (!fence || fence.tenantId !== input.tenantId || fence.leadId !== input.leadId || fence.chatId !== input.chatId || !await matchesConversationCommercialFence(tx, fence)) throw new AgentCommercialContextChanged();
  const validation = validateCommercialAgentAction(input);
  if (!validation.valid) throw new Error(`commercial_agent_action_invalid:${validation.issues.join(",")}`);
  const allowedReference = {follow_up_task: "lead_tasks", review_proposal: "orcamentos", review_appointment: "appointments", review_charge: "financeiro"}[input.type];
  if (input.referenceCollection !== allowedReference || !input.referenceId || input.referenceId.includes("/")) throw new Error("CRM_AGENT_ACTION_REFERENCE_INVALID");
  const prepared = preparedReference?.collection === input.referenceCollection && preparedReference.id === input.referenceId;
  let acceptedReviewId: unknown;
  if (!prepared) {
    const reference = await tx.get(adminDb.collection(allowedReference).doc(input.referenceId));
    if (!reference.exists || reference.data()?.tenantId !== input.tenantId || reference.data()?.leadId !== input.leadId) throw new AgentCommercialContextChanged();
    const generation = reference.data()?.sourceLeadGeneration;
    acceptedReviewId = reference.data()?.reviewActionId;
    if (generation && (typeof generation.isEqual !== "function" || !generation.isEqual(fence.leadGeneration))) throw new AgentCommercialContextChanged();
  }
  const id = `agent_review_${crypto.createHash("sha256").update(JSON.stringify([input.tenantId, input.leadId,
    [fence.leadGeneration.seconds, fence.leadGeneration.nanoseconds], fence.chatId,
    [fence.chatGeneration.seconds, fence.chatGeneration.nanoseconds], fence.messageId, input.type, input.dedupeKey])).digest("hex")}`;
  const ref = adminDb.collection("commercial_agent_actions").doc(id), snap = await tx.get(ref);
  const policy = commercialAgentActionPolicy(input.type);
  if (snap.exists) {
    if (snap.data()?.tenantId !== input.tenantId || snap.data()?.leadId !== input.leadId || snap.data()?.referenceId !== input.referenceId || snap.data()?.referenceCollection !== input.referenceCollection) throw new Error("CRM_AGENT_ACTION_IDENTITY_CONFLICT");
    return {result: {id, status: snap.data()!.status as CommercialAgentActionStatus, policy}, write: () => {}};
  }
  if (acceptedReviewId === id) throw new AgentCommercialContextChanged("CRM_AGENT_REVIEW_REMOVED_AFTER_ACCEPTANCE");
  const status: CommercialAgentActionStatus = input.executed && policy.canAutoExecute ? "executed" : "pending_approval";
  const deadlines = resolveCommercialAgentDeadlines(input.type, new Date());
  return {result: {id, status, policy}, write: () => tx.create(ref, {
    tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId, type: input.type, status,
    risk: policy.risk, requiresApproval: policy.requiresApproval, canAutoExecute: policy.canAutoExecute,
    externalSideEffect: policy.externalSideEffect, slaMinutes: policy.slaMinutes, expiryMinutes: policy.expiryMinutes,
    ...deadlines, title: clean(input.title, 180), detail: clean(input.detail, 1000) || null,
    referenceCollection: input.referenceCollection, referenceId: input.referenceId,
    amount: typeof input.amount === "number" ? input.amount : null, currency: clean(input.currency, 12) || "BRL",
    payload: input.payload || {}, dedupeKey: clean(input.dedupeKey, 180),
    sourceMessageId: fence.messageId, sourceLeadGeneration: fence.leadGeneration,
    actorId: "ai_sales_agent", actorName: "Agente Comercial Altum", actorVersion: clean(input.actorVersion, 80) || "commercial-agent-v1",
    executedAt: status === "executed" ? FieldValue.serverTimestamp() : null,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })};
}

export async function recordCommercialAgentAction(input: RecordCommercialAgentActionInput) {
  if (input.conversationFence) return adminDb.runTransaction(async tx => {
    const action = await prepareConversationCommercialAction(tx, input); action.write(); return action.result;
  });
  const validation = validateCommercialAgentAction(input);
  if (!validation.valid) throw new Error(`commercial_agent_action_invalid:${validation.issues.join(",")}`);
  const policy = commercialAgentActionPolicy(input.type);
  const ref = adminDb.collection("commercial_agent_actions").doc(actionId([
    input.tenantId, input.leadId, input.type, input.dedupeKey,
  ]));
  const snap = await ref.get();
  const status: CommercialAgentActionStatus = input.executed && policy.canAutoExecute ? "executed" : "pending_approval";
  const persistedStatus = snap.exists
    ? (clean(snap.data()?.status, 40) || status) as CommercialAgentActionStatus
    : status;
  const deadlines = resolveCommercialAgentDeadlines(input.type, new Date());
  await ref.set({
    tenantId: clean(input.tenantId, 180),
    leadId: clean(input.leadId, 180),
    chatId: clean(input.chatId, 180) || null,
    type: input.type,
    status: persistedStatus,
    risk: policy.risk,
    requiresApproval: policy.requiresApproval,
    canAutoExecute: policy.canAutoExecute,
    externalSideEffect: policy.externalSideEffect,
    slaMinutes: policy.slaMinutes,
    expiryMinutes: policy.expiryMinutes,
    dueAt: snap.exists ? snap.data()?.dueAt || deadlines.dueAt : deadlines.dueAt,
    expiresAt: snap.exists ? snap.data()?.expiresAt || deadlines.expiresAt : deadlines.expiresAt,
    title: clean(input.title, 180),
    detail: clean(input.detail, 1000) || null,
    referenceCollection: clean(input.referenceCollection, 80) || null,
    referenceId: clean(input.referenceId, 180) || null,
    amount: typeof input.amount === "number" ? input.amount : null,
    currency: clean(input.currency, 12) || "BRL",
    payload: input.payload || {},
    dedupeKey: clean(input.dedupeKey, 180),
    actorId: "ai_sales_agent",
    actorName: "Agente Comercial Altum",
    actorVersion: clean(input.actorVersion, 80) || "commercial-agent-v1",
    executedAt: status === "executed" ? FieldValue.serverTimestamp() : null,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: snap.exists ? snap.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });
  return { id: ref.id, status: persistedStatus, policy };
}
