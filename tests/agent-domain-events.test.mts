import assert from "node:assert/strict";
import test from "node:test";
import {
  agentDomainEventSchema,
  newAgentDomainEventId,
} from "@/lib/server/agent-os/agent-domain-events";

const base = {
  schemaVersion: 1,
  eventId: "evt_12345678",
  occurredAt: "2026-10-12T12:00:00.000Z",
  tenantId: "tenant_a",
  actor: { type: "system", id: "altum-agent-os" },
  correlationId: "mission_123",
  causationId: null,
};

test("domain events require tenant identity and a versioned lifecycle payload", () => {
  const event = agentDomainEventSchema.parse({
    ...base,
    type: "task.status_changed",
    missionId: "mission_123",
    taskId: "task_123",
    payload: {
      from: "ready",
      to: "claimed",
      reason: "runtime reservou a tarefa",
    },
  });
  assert.equal(event.tenantId, "tenant_a");
  assert.equal(event.payload.to, "claimed");
  assert.throws(() => agentDomainEventSchema.parse({ ...event, tenantId: "" }));
});

test("execution lifecycle events carry a dispatch and immutable attempt number", () => {
  const event = agentDomainEventSchema.parse({
    ...base,
    type: "task_execution.status_changed",
    missionId: "mission_123",
    taskId: "task_123",
    dispatchId: "dispatch_123",
    payload: { from: "claimed", to: "running", attempt: 2, reason: null },
  });
  assert.equal(event.dispatchId, "dispatch_123");
  assert.equal(event.payload.attempt, 2);
  assert.throws(() =>
    agentDomainEventSchema.parse({
      ...event,
      payload: { ...event.payload, attempt: 0 },
    }),
  );
});

test("generated event ids retain a stable, traceable prefix", () => {
  assert.match(
    newAgentDomainEventId("task-status", 100),
    /^task-status_2s_[a-f0-9]{8}$/,
  );
});
