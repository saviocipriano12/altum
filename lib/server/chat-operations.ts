import { FieldValue } from "firebase-admin/firestore";

const DEFAULT_FIRST_RESPONSE_SLA_MINUTES = 15;

function cleanString(value: unknown, max = 120) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function resolveFirstResponseSlaMinutes(settings?: Record<string, unknown> | null) {
  const rules =
    settings?.rules && typeof settings.rules === "object"
      ? (settings.rules as Record<string, unknown>)
      : {};
  const inboxRules =
    rules.inbox && typeof rules.inbox === "object"
      ? (rules.inbox as Record<string, unknown>)
      : {};

  const explicit = Number(inboxRules.firstResponseSlaMinutes || rules.firstResponseSlaMinutes);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(24 * 60, Math.max(5, Math.round(explicit)));
  }

  return DEFAULT_FIRST_RESPONSE_SLA_MINUTES;
}

export function computeQueueStatus(input: {
  status?: string | null;
  assignedTo?: string | null;
  waitingForReply?: boolean;
  slaBreached?: boolean;
}) {
  const status = cleanString(input.status || "open", 40).toLowerCase() || "open";
  const assignedTo = cleanString(input.assignedTo, 140);

  if (status === "resolved") return "resolved";
  if (status === "archived") return "archived";
  if (status === "pending" && !assignedTo) return "triage";
  if (input.waitingForReply && input.slaBreached) return "sla_breached";
  if (!assignedTo) return "unassigned";
  if (input.waitingForReply) return "assigned_waiting";
  return "assigned";
}

export function buildIncomingChatOperationalPatch(input: {
  status?: string | null;
  assignedTo?: string | null;
  slaMinutes?: number;
}) {
  const slaMinutes = Math.max(5, Math.min(24 * 60, Math.round(input.slaMinutes || DEFAULT_FIRST_RESPONSE_SLA_MINUTES)));
  const assignedTo = cleanString(input.assignedTo, 140) || null;
  const status = cleanString(input.status || "open", 40).toLowerCase() || "open";

  return {
    status: status === "resolved" || status === "archived" ? "open" : status,
    lastClientMessageAt: FieldValue.serverTimestamp(),
    slaDueAt: new Date(Date.now() + slaMinutes * 60 * 1000),
    queueStatus: computeQueueStatus({
      status,
      assignedTo,
      waitingForReply: true,
    }),
  };
}

export function buildOutgoingChatOperationalPatch(input: {
  status?: string | null;
  assignedTo?: string | null;
}) {
  const status = cleanString(input.status || "open", 40).toLowerCase() || "open";
  const assignedTo = cleanString(input.assignedTo, 140) || null;

  return {
    status,
    lastAgentMessageAt: FieldValue.serverTimestamp(),
    queueStatus: computeQueueStatus({
      status,
      assignedTo,
      waitingForReply: false,
    }),
  };
}

export function buildManualQueuePatch(input: {
  status?: string | null;
  assignedTo?: string | null;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
}) {
  const assignedTo = cleanString(input.assignedTo, 140) || null;
  const status = cleanString(input.status || "open", 40).toLowerCase() || "open";
  const lastClient = toDate(input.lastClientMessageAt);
  const lastAgent = toDate(input.lastAgentMessageAt);
  const slaDueAt = toDate(input.slaDueAt);
  const waitingForReply = Boolean(
    lastClient && (!lastAgent || lastAgent.getTime() < lastClient.getTime())
  );
  const slaBreached = Boolean(waitingForReply && slaDueAt && slaDueAt.getTime() <= Date.now());

  return {
    queueStatus: computeQueueStatus({ status, assignedTo, waitingForReply, slaBreached }),
  };
}

export function buildWatchdogChatPatch(input: {
  status?: string | null;
  assignedTo?: string | null;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
  slaBreachedAt?: unknown;
}) {
  const status = cleanString(input.status || "open", 40).toLowerCase() || "open";
  const assignedTo = cleanString(input.assignedTo, 140) || null;
  const lastClient = toDate(input.lastClientMessageAt);
  const lastAgent = toDate(input.lastAgentMessageAt);
  const slaDueAt = toDate(input.slaDueAt);
  const hasHistoricalBreach = Boolean(toDate(input.slaBreachedAt));
  const waitingForReply = Boolean(
    lastClient && (!lastAgent || lastAgent.getTime() < lastClient.getTime())
  );
  const slaBreached = Boolean(waitingForReply && slaDueAt && slaDueAt.getTime() <= Date.now());

  const slaState =
    status === "resolved" || status === "archived"
      ? "closed"
      : !lastClient
        ? "idle"
        : !waitingForReply
          ? "replied"
          : slaBreached
            ? "breached"
            : "waiting";

  return {
    queueStatus: computeQueueStatus({ status, assignedTo, waitingForReply, slaBreached }),
    slaState,
    slaBreachedAt: slaBreached ? (hasHistoricalBreach ? input.slaBreachedAt || null : FieldValue.serverTimestamp()) : null,
  };
}

export function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
