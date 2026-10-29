import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceSchema,
  executionRecordSchema,
  missionRecordSchema,
  objectiveSchema,
  programSchema,
  taskRecordSchema,
} from "@/lib/server/agent-os/control-plane-contracts";
import { missionCreateSchema } from "@/lib/server/agent-os/missions";

const createdAt = "2026-10-12T12:00:00.000Z";

test("control-plane contracts require explicit tenant scope for every business object", () => {
  const objective = objectiveSchema.parse({
    id: "objective_1",
    tenantId: "tenant_a",
    title: "Gerar demanda",
    statement: "Aumentar reuniões qualificadas de forma sustentável.",
    status: "active",
    successMetrics: [{ name: "reuniões", target: "20/mês" }],
    createdAt,
  });
  const program = programSchema.parse({
    id: "program_1",
    tenantId: "tenant_a",
    objectiveId: objective.id,
    title: "Aquisição",
    status: "active",
    missionIds: [],
    createdAt,
  });
  assert.equal(program.tenantId, objective.tenantId);
  assert.throws(() => programSchema.parse({ ...program, tenantId: "" }));
});

test("mission, task, execution and evidence contracts preserve the same tenant identity", () => {
  const mission = missionRecordSchema.parse({
    id: "mission_1",
    tenantId: "tenant_a",
    programId: null,
    objectiveId: null,
    title: "Campanha piloto",
    objective: "Criar um plano completo de aquisição com evidências.",
    template: "marketing",
    status: "planned",
    risk: "medium",
    budgetBrl: 100,
    spentBrl: 0,
    constraints: [],
    createdAt,
  });
  const task = taskRecordSchema.parse({
    id: "task_1",
    tenantId: mission.tenantId,
    missionId: mission.id,
    sequence: 1,
    title: "Pesquisar mercado",
    status: "ready",
    capability: "WEB_RESEARCH",
    requiresApproval: false,
    agentCandidateId: null,
    createdAt,
  });
  const execution = executionRecordSchema.parse({
    id: "execution_1",
    dispatchId: "dispatch_1",
    tenantId: task.tenantId,
    missionId: mission.id,
    taskId: task.id,
    runtime: "openclaw",
    status: "queued",
    attempt: 1,
    createdAt,
  });
  const evidence = evidenceSchema.parse({
    id: "evidence_1",
    tenantId: execution.tenantId,
    missionId: mission.id,
    taskId: task.id,
    executionId: execution.id,
    kind: "artifact",
    label: "Plano de campanha",
    uri: "https://altum.example/artifacts/1",
    capturedAt: createdAt,
  });
  assert.equal(evidence.tenantId, mission.tenantId);
});

test("mission input preserves optional objective and program references", () => {
  const input = missionCreateSchema.parse({
    tenantId: "tenant_a",
    objectiveId: "objective_1",
    programId: "program_1",
    title: "Campanha piloto",
    objective: "Criar um plano completo de aquisição com evidências.",
  });
  assert.equal(input.objectiveId, "objective_1");
  assert.equal(input.programId, "program_1");
});
