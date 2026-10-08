import assert from "node:assert/strict";
import test from "node:test";
import {
  OPENCLAW_RUNTIME_SOURCE,
  openClawRuntimeEventSchema,
  runtimeEventDocumentId,
  signOpenClawRuntimeBody,
  verifyOpenClawRuntimeBearer,
  verifyOpenClawRuntimeSignature,
} from "../lib/server/agent-os/openclaw-runtime.ts";

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
