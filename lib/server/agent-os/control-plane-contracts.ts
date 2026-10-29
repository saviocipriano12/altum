import { z } from "zod";
import {
  MISSION_RISKS,
  MISSION_STATUSES,
  MISSION_TEMPLATES,
} from "@/lib/server/agent-os/missions";
import { TASK_EXECUTION_STATUSES } from "@/lib/server/agent-os/task-execution";
import { TASK_STATUSES } from "@/lib/server/agent-os/task-lifecycle";

const id = z.string().trim().min(1).max(180);
const isoDateTime = z.string().datetime();

/** Every object that can influence a client outcome is scoped before use. */
export const tenantScopeSchema = z.object({
  tenantId: id,
});

export const objectiveSchema = tenantScopeSchema.extend({
  id,
  title: z.string().trim().min(4).max(160),
  statement: z.string().trim().min(12).max(4_000),
  status: z.enum(["draft", "active", "achieved", "cancelled"]),
  successMetrics: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(120),
        target: z.string().trim().min(1).max(240),
      }),
    )
    .max(20),
  createdAt: isoDateTime,
});

export const programSchema = tenantScopeSchema.extend({
  id,
  objectiveId: id,
  title: z.string().trim().min(4).max(160),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]),
  missionIds: z.array(id).max(200),
  createdAt: isoDateTime,
});

export const missionRecordSchema = tenantScopeSchema.extend({
  id,
  programId: id.nullable(),
  objectiveId: id.nullable(),
  title: z.string().trim().min(4).max(160),
  objective: z.string().trim().min(12).max(4_000),
  template: z.enum(MISSION_TEMPLATES),
  status: z.enum(MISSION_STATUSES),
  risk: z.enum(MISSION_RISKS),
  budgetBrl: z.number().finite().min(0),
  spentBrl: z.number().finite().min(0),
  constraints: z.array(z.string().trim().min(1).max(300)).max(24),
  createdAt: isoDateTime,
});

export const taskRecordSchema = tenantScopeSchema.extend({
  id,
  missionId: id,
  sequence: z.number().int().min(1),
  title: z.string().trim().min(3).max(240),
  status: z.enum(TASK_STATUSES),
  capability: z.string().trim().min(2).max(120),
  requiresApproval: z.boolean(),
  agentCandidateId: id.nullable(),
  createdAt: isoDateTime,
});

export const executionRecordSchema = tenantScopeSchema.extend({
  id,
  dispatchId: id,
  missionId: id,
  taskId: id.nullable(),
  runtime: z.string().trim().min(1).max(80),
  status: z.enum(TASK_EXECUTION_STATUSES),
  attempt: z.number().int().min(1),
  createdAt: isoDateTime,
});

export const evidenceSchema = tenantScopeSchema.extend({
  id,
  missionId: id,
  taskId: id.nullable(),
  executionId: id.nullable(),
  kind: z.enum(["source", "artifact", "receipt", "measurement", "approval"]),
  label: z.string().trim().min(2).max(240),
  uri: z.string().url().max(2_000).nullable(),
  capturedAt: isoDateTime,
});

export type Objective = z.infer<typeof objectiveSchema>;
export type Program = z.infer<typeof programSchema>;
export type MissionRecord = z.infer<typeof missionRecordSchema>;
export type TaskRecord = z.infer<typeof taskRecordSchema>;
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
