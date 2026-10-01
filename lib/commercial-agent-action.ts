export const COMMERCIAL_AGENT_ACTION_TYPES = [
  "follow_up_task",
  "review_proposal",
  "review_appointment",
  "review_charge",
] as const;

export type CommercialAgentActionType = (typeof COMMERCIAL_AGENT_ACTION_TYPES)[number];
export type CommercialAgentActionStatus =
  | "executed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "executing"
  | "execution_failed";
export type CommercialAgentRisk = "low" | "medium" | "high";

export function normalizeCommercialAgentActionType(value: unknown): CommercialAgentActionType | "" {
  const normalized = String(value || "").trim().toLowerCase();
  return (COMMERCIAL_AGENT_ACTION_TYPES as readonly string[]).includes(normalized)
    ? normalized as CommercialAgentActionType
    : "";
}

export function commercialAgentActionPolicy(type: CommercialAgentActionType) {
  if (type === "follow_up_task") {
    return { risk: "low" as CommercialAgentRisk, requiresApproval: false, canAutoExecute: true, externalSideEffect: false, slaMinutes: 0, expiryMinutes: 0 };
  }
  if (type === "review_charge") {
    return { risk: "high" as CommercialAgentRisk, requiresApproval: true, canAutoExecute: false, externalSideEffect: true, slaMinutes: 60, expiryMinutes: 24 * 60 };
  }
  if (type === "review_appointment") {
    return { risk: "medium" as CommercialAgentRisk, requiresApproval: true, canAutoExecute: false, externalSideEffect: false, slaMinutes: 30, expiryMinutes: 12 * 60 };
  }
  return { risk: "medium" as CommercialAgentRisk, requiresApproval: true, canAutoExecute: false, externalSideEffect: false, slaMinutes: 120, expiryMinutes: 72 * 60 };
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value === "object" && "_seconds" in value) {
    const seconds = Number(value._seconds);
    if (Number.isFinite(seconds)) return seconds * 1000;
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export function resolveCommercialAgentDeadlines(type: CommercialAgentActionType, createdAt: unknown) {
  const policy = commercialAgentActionPolicy(type);
  const createdAtMs = toMillis(createdAt) || Date.now();
  return {
    dueAt: policy.slaMinutes ? new Date(createdAtMs + policy.slaMinutes * 60_000) : null,
    expiresAt: policy.expiryMinutes ? new Date(createdAtMs + policy.expiryMinutes * 60_000) : null,
  };
}

export function evaluateCommercialAgentSla(input: {
  type: CommercialAgentActionType;
  status: CommercialAgentActionStatus;
  createdAt: unknown;
  dueAt?: unknown;
  expiresAt?: unknown;
  escalationLevel?: unknown;
  now?: number;
}) {
  const policy = commercialAgentActionPolicy(input.type);
  const fallback = resolveCommercialAgentDeadlines(input.type, input.createdAt);
  const dueAt = toMillis(input.dueAt) || toMillis(fallback.dueAt);
  const expiresAt = toMillis(input.expiresAt) || toMillis(fallback.expiresAt);
  const now = input.now ?? Date.now();
  const currentLevel = Math.max(0, Number(input.escalationLevel) || 0);
  if (input.status !== "pending_approval" || !policy.requiresApproval) {
    return { state: "inactive" as const, dueAt, expiresAt, escalationLevel: currentLevel };
  }
  if (expiresAt && now >= expiresAt) {
    return { state: "expired" as const, dueAt, expiresAt, escalationLevel: currentLevel };
  }
  if (dueAt && now >= dueAt) {
    const secondEscalationAt = dueAt + Math.max(30, policy.slaMinutes) * 60_000;
    const escalationLevel = now >= secondEscalationAt ? 2 : 1;
    return {
      state: escalationLevel > currentLevel ? "escalate" as const : "overdue" as const,
      dueAt,
      expiresAt,
      escalationLevel,
    };
  }
  return { state: "on_time" as const, dueAt, expiresAt, escalationLevel: currentLevel };
}

export function validateCommercialAgentAction(input: {
  type: CommercialAgentActionType;
  leadId?: unknown;
  referenceId?: unknown;
  amount?: unknown;
}) {
  const issues: string[] = [];
  if (!String(input.leadId || "").trim()) issues.push("missing_lead");
  if (input.type !== "follow_up_task" && !String(input.referenceId || "").trim()) issues.push("missing_reference");
  if (input.type === "review_charge") {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) issues.push("invalid_amount");
  }
  return { valid: issues.length === 0, issues, policy: commercialAgentActionPolicy(input.type) };
}
