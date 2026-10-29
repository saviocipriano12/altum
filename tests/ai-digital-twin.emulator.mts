import assert from "node:assert/strict";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "altum-digital-twin-test";
process.env.FIREBASE_CONFIG ||= JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });

const { buildAiDigitalTwinSnapshot } = await import("../lib/ai-digital-twin.ts");
const { persistAiDigitalTwinRun } = await import("../lib/server/ai/digital-twin-store.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");

function payload(tenantId: string, fingerprint: string) {
  const snapshot = buildAiDigitalTwinSnapshot({ tenantId, baselineRunId: "baseline", candidateRunId: "candidate", candidateLearningFingerprint: "learning" });
  return {
    tenantId,
    createdBy: "tester",
    snapshot,
    comparison: {
      schemaVersion: "ai-digital-twin-v1",
      fingerprint,
      status: "ready",
      candidateFingerprint: "learning",
      baselineRunId: "baseline",
      candidateRunId: "candidate",
      reasons: [],
    },
  };
}

test("recibo do gemeo e idempotente e isolado por tenant", async () => {
  const first = await persistAiDigitalTwinRun(payload("tenant-a", "receipt-a"));
  const replay = await persistAiDigitalTwinRun(payload("tenant-a", "receipt-a"));
  assert.equal(first.status, "created");
  assert.equal(replay.status, "duplicate");
  const stored = await adminDb.collection("ai_digital_twin_runs").doc("receipt-a").get();
  assert.equal(stored.data()?.tenantId, "tenant-a");
  assert.equal(stored.data()?.snapshot.containsRawCustomerText, false);
  assert.equal(stored.data()?.snapshot.externalEffects, "blocked");
  await assert.rejects(() => persistAiDigitalTwinRun(payload("tenant-b", "receipt-a")), /tenant_conflict/);
});

test("escopo invalido nao e persistido", async () => {
  const input = payload("tenant-a", "receipt-invalid");
  await assert.rejects(() => persistAiDigitalTwinRun({ ...input, tenantId: "tenant-b" }), /invalid_digital_twin_scope/);
  assert.equal((await adminDb.collection("ai_digital_twin_runs").doc("receipt-invalid").get()).exists, false);
});
