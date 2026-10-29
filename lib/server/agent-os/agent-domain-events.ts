import { z } from "zod";
import { MISSION_STATUSES } from "@/lib/server/agent-os/missions";
import { TASK_EXECUTION_STATUSES } from "@/lib/server/agent-os/task-execution";
import { TASK_STATUSES } from "@/lib/server/agent-os/task-lifecycle";

export const AGENT_DOMAIN_EVENT_VERSION = 1 as const;

const eventIdentitySchema = z.object({
  schemaVersion: z.literal(AGENT_DOMAIN_EVENT_VERSION),
  eventId: z.string().trim().min(8).max(180),
  occurredAt: z.string().datetime(),
  tenantId: z.string().trim().min(1).max(180),
  actor: z.object({
    type: z.enum(["user", "runtime", "system"]),
    id: z.string().trim().min(1).max(180),
  }),
  correlationId: z.string().trim().min(1).max(180).nullable(),
  causationId: z.string().trim().min(1).max(180).nullable(),
});

const missionEventSchema = eventIdentitySchema.extend({
  type: z.enum(["mission.created", "mission.status_changed"]),
  missionId: z.string().trim().min(1).max(180),
  payload: z.object({
    from: z.enum(MISSION_STATUSES).nullable(),
    to: z.enum(MISSION_STATUSES),
    reason: z.string().trim().min(1).max(1_000).nullable(),
  }),
});

const taskEventSchema = eventIdentitySchema.extend({
  type: z.literal("task.status_changed"),
  missionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(180),
  payload: z.object({
    from: z.enum(TASK_STATUSES),
    to: z.enum(TASK_STATUSES),
    reason: z.string().trim().min(1).max(1_000).nullable(),
  }),
});

const executionEventSchema = eventIdentitySchema.extend({
  type: z.literal("task_execution.status_changed"),
  missionId: z.string().trim().min(1).max(180),
  taskId: z.string().trim().min(1).max(180).nullable(),
  dispatchId: z.string().trim().min(1).max(180),
  payload: z.object({
    from: z.enum(TASK_EXECUTION_STATUSES).nullable(),
    to: z.enum(TASK_EXECUTION_STATUSES),
    attempt: z.number().int().min(1),
    reason: z.string().trim().min(1).max(1_000).nullable(),
  }),
});

export const agentDomainEventSchema = z.discriminatedUnion("type", [
  missionEventSchema,
  taskEventSchema,
  executionEventSchema,
]);

export type AgentDomainEvent = z.infer<typeof agentDomainEventSchema>;

/**
 * Event documents are append-only facts. Firestore state can be rebuilt or
 * reconciled from them without accepting an event that lacks tenant identity.
 */
export function parseAgentDomainEvent(input: unknown): AgentDomainEvent {
  return agentDomainEventSchema.parse(input);
}

export function newAgentDomainEventId(prefix: string, now = Date.now()) {
  const cleanPrefix =
    prefix
      .trim()
      .replace(/[^a-z0-9_-]/gi, "")
      .slice(0, 36) || "event";
  return `${cleanPrefix}_${now.toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}
