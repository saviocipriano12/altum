import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENCLAW_RUNTIME_SOURCE,
  openClawMissionEnvelopeSchema,
  openClawRuntimeEventSchema,
  runtimeEventDocumentId,
  signOpenClawRuntimeBody,
  verifyOpenClawRuntimeBearer,
  verifyOpenClawRuntimeSignature,
} from "@/lib/server/agent-os/openclaw-runtime";

test("OpenClaw runtime keeps a pinned, MIT source of record", () => {
  assert.equal(OPENCLAW_RUNTIME_SOURCE.repository, "openclaw/openclaw");
  assert.equal(OPENCLAW_RUNTIME_SOURCE.license, "MIT");
  assert.match(OPENCLAW_RUNTIME_SOURCE.commit, /^[a-f0-9]{40}$/);
});

test("runtime model gateway accepts only the private bearer credential", () => {
  const secret = "a".repeat(32);
  assert.equal(verifyOpenClawRuntimeBearer(`Bearer ${secret}`, secret), true);
  assert.equal(verifyOpenClawRuntimeBearer("Bearer another-secret", secret), false);
  assert.equal(verifyOpenClawRuntimeBearer(null, secret), false);
});

test("runtime callbacks require a recent body-bound HMAC signature", () => {
  const secret = "a".repeat(32);
  const body = JSON.stringify({ protocol: "altum.openclaw.event.v1" });
  const timestamp = "1791393210";
  const signature = signOpenClawRuntimeBody(body, secret, timestamp);
  assert.equal(verifyOpenClawRuntimeSignature({ body, secret, timestamp, signature, now: 1791393210_000 }), true);
  assert.equal(verifyOpenClawRuntimeSignature({ body: `${body} `, secret, timestamp, signature, now: 1791393210_000 }), false);
  assert.equal(verifyOpenClawRuntimeSignature({ body, secret, timestamp: "1790000000", signature, now: 1791393210_000 }), false);
});

const mission = {
  id: "mission-1",
  tenantId: "tenant-1",
  conversationId: null,
  title: "Planejar campanha",
  objective: "Criar um plano verificável.",
  template: "marketing",
  risk: "low" as const,
  budgetBrl: 0,
  constraints: [],
};

test("runtime envelope persists task attribution with the mission", () => {
  const parsed = openClawMissionEnvelopeSchema.parse({
    protocol: "altum.openclaw.mission.v1",
    dispatchId: "dispatch-1",
    operation: "execute",
    mission,
    task: {
      id: "task-1",
      title: "Pesquisar público",
      agent: "Research Agent",
      capability: "WEB_RESEARCH",
      agentCandidateId: "market-research-synthesist",
      agentCandidateSource: "Ado77/agency-agents",
      agentCandidateStatus: "review_required",
    },
    policy: { externalActionsRequireApproval: true, secretHandling: "altum_vault_only", artifactDelivery: "altum_private_library" },
    callback: { url: "https://altum.example/api/internal/agent-runtime/events", signatureHeader: "x-altum-runtime-signature", timestampHeader: "x-altum-runtime-timestamp" },
  });
  assert.equal(parsed.task?.id, "task-1");
  assert.equal(parsed.task?.agentCandidateStatus, "review_required");
});

test("runtime envelope remains readable for dispatches created before task attribution", () => {
  const parsed = openClawMissionEnvelopeSchema.parse({
    protocol: "altum.openclaw.mission.v1",
    dispatchId: "dispatch-before-task-context",
    operation: "plan",
    mission,
    policy: { externalActionsRequireApproval: true, secretHandling: "altum_vault_only", artifactDelivery: "altum_private_library" },
    callback: { url: "https://altum.example/api/internal/agent-runtime/events", signatureHeader: "x-altum-runtime-signature", timestampHeader: "x-altum-runtime-timestamp" },
  });
  assert.equal(parsed.task, null);
});

test("runtime events may carry task attribution while remaining compatible with old dispatches", () => {
  const base = {
    protocol: "altum.openclaw.event.v1",
    eventId: "event-12345",
    dispatchId: "dispatch-1",
    missionId: "mission-1",
    tenantId: "tenant-1",
    type: "mission.progress",
    occurredAt: "2026-10-12T12:00:00.000Z",
  };
  assert.equal(openClawRuntimeEventSchema.parse({ ...base, taskId: "task-1" }).taskId, "task-1");
  assert.equal(openClawRuntimeEventSchema.parse(base).taskId, undefined);
});

test("runtime events are tenant-scoped and idempotently addressable", () => {
  const event = openClawRuntimeEventSchema.parse({
    protocol: "altum.openclaw.event.v1",
    eventId: "runtime-event-0001",
    dispatchId: "dispatch-0001",
    missionId: "mission-0001",
    tenantId: "tenant-0001",
    type: "mission.await_approval",
    occurredAt: "2026-10-07T12:00:00.000Z",
    message: "A publicação está pronta para sua decisão.",
    progress: 72,
    approval: {
      title: "Publicar campanha",
      summary: "A publicação externa exige confirmação.",
      actionType: "PUBLISH_CONTENT",
      risk: "high",
    },
  });
  assert.equal(runtimeEventDocumentId(event), runtimeEventDocumentId(event));
  assert.notEqual(runtimeEventDocumentId(event), runtimeEventDocumentId({ ...event, eventId: "runtime-event-0002" }));
  assert.equal(openClawRuntimeEventSchema.safeParse({ ...event, dispatchId: "" }).success, false);
});
