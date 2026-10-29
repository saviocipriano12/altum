import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  AI_EVALUATION_SCENARIOS,
  AI_EVALUATION_SCENARIO_VERSION,
  summarizeAiEvaluation,
  type AiEvaluationRunItem,
} from "../lib/ai-evaluation.ts";
import {
  compareAiEvaluationRuns,
  selectAiEvaluationReferenceBaseline,
  type AiEvaluationComparableRun,
} from "../lib/ai-evaluation-baseline.ts";

const PROJECT_ID = "demo-altum-ai-baseline";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_baseline_${suffix}`;
const otherTenantId = `tenant_other_${suffix}`;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;

function buildRun(id: string, runTenantId: string, failed: string[] = []): AiEvaluationComparableRun {
  const failedIds = new Set(failed);
  const items: AiEvaluationRunItem[] = AI_EVALUATION_SCENARIOS.map((scenario) => ({
    scenarioId: scenario.id,
    label: scenario.label,
    preview: { runtime: { source: "model", latencyMs: 500, estimatedCostUsd: 0.001 } },
    verdict: failedIds.has(scenario.id)
      ? { passed: false, issues: ["falha_controlada"] }
      : { passed: true, issues: [] },
  }));
  return {
    id,
    tenantId: runTenantId,
    scenarioVersion: AI_EVALUATION_SCENARIO_VERSION,
    summary: summarizeAiEvaluation(items),
    results: items.map((item) => ({
      scenarioId: item.scenarioId,
      passed: item.verdict?.passed === true,
      latencyMs: item.preview?.runtime?.latencyMs,
      estimatedCostUsd: item.preview?.runtime?.estimatedCostUsd,
    })),
  };
}

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
});

after(async () => {
  const snap = await adminDb.collection("ai_evaluation_runs").get();
  await Promise.all(
    snap.docs
      .filter((doc) => String(doc.data().testSuffix || "") === suffix)
      .map((doc) => doc.ref.delete())
  );
});

test("Firestore keeps tenant baseline selection and persisted comparison isolated", async () => {
  const approved = buildRun(`approved_${suffix}`, tenantId);
  const newerBlocked = buildRun(`blocked_${suffix}`, tenantId, ["human_handoff"]);
  const otherTenant = buildRun(`other_${suffix}`, otherTenantId);
  const collection = adminDb.collection("ai_evaluation_runs");

  await collection.doc(approved.id).set({ ...approved, testSuffix: suffix, createdAt: new Date(1000) });
  await collection.doc(newerBlocked.id).set({ ...newerBlocked, testSuffix: suffix, createdAt: new Date(3000) });
  await collection.doc(otherTenant.id).set({ ...otherTenant, testSuffix: suffix, createdAt: new Date(4000) });

  const tenantSnap = await collection.where("tenantId", "==", tenantId).get();
  const selected = selectAiEvaluationReferenceBaseline(
    tenantSnap.docs.map((doc) => ({
      run: doc.data() as AiEvaluationComparableRun,
      createdAtMs: doc.data().createdAt.toDate().getTime(),
    })),
    { tenantId }
  );
  assert.equal(selected?.id, approved.id);

  const candidate = buildRun(`candidate_${suffix}`, tenantId);
  const comparison = compareAiEvaluationRuns(selected, candidate);
  await collection.doc(candidate.id).set({
    ...candidate,
    baselineComparison: comparison,
    testSuffix: suffix,
    createdAt: new Date(5000),
  });

  const persisted = await collection.doc(candidate.id).get();
  assert.equal(persisted.data()?.baselineComparison?.baselineRunId, approved.id);
  assert.equal(persisted.data()?.baselineComparison?.candidateRunId, candidate.id);
  assert.equal(persisted.data()?.baselineComparison?.status, "ready");
  assert.equal(persisted.data()?.baselineComparison?.schemaVersion, 1);
});
