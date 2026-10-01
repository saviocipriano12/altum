import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
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

export async function recordCommercialAgentAction(input: {
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
}) {
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
