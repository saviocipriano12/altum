import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("AI worker has the Firestore indexes required for ordered claims and accurate dead-letter alerts", async () => {
  const queueSource = await readFile(new URL("../lib/server/ai/queue.ts", import.meta.url), "utf8");
  const indexesSource = await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8");

  assert.match(queueSource, /where\("type", "==", JOB_TYPE\)\s*\.orderBy\("availableAt", "asc"\)\s*\.orderBy\("priority", "asc"\)/);
  assert.match(queueSource, /where\("tenantId", "==", tenantId\)\s*\.where\("type", "==", JOB_TYPE\)\s*\.where\("status", "==", "dead_letter"\)\s*\.count\(\)/);
  assert.match(indexesSource, /"collectionGroup": "jobs"[\s\S]*?"fieldPath": "type"[\s\S]*?"fieldPath": "availableAt"[\s\S]*?"fieldPath": "priority"/);
  assert.match(indexesSource, /"collectionGroup": "jobs"[\s\S]*?"fieldPath": "tenantId"[\s\S]*?"fieldPath": "type"[\s\S]*?"fieldPath": "status"/);
});

test("AI rollout quality reads the latest evaluation rather than an unordered sample", async () => {
  const settingsSource = await readFile(new URL("../app/api/tenant/[tenantId]/settings/ai/route.ts", import.meta.url), "utf8");
  const indexesSource = await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8");

  assert.match(settingsSource, /collection\("ai_evaluation_runs"\)\s*\.where\("tenantId", "==", tenantId\)\s*\.orderBy\("createdAt", "desc"\)\s*\.limit\(30\)/);
  assert.match(indexesSource, /"collectionGroup": "ai_evaluation_runs"[\s\S]*?"fieldPath": "tenantId"[\s\S]*?"fieldPath": "createdAt"[\s\S]*?"order": "DESCENDING"/);
});

test("AI settings keep the operation available when quality status cannot be read", async () => {
  const settingsSource = await readFile(new URL("../app/api/tenant/[tenantId]/settings/ai/route.ts", import.meta.url), "utf8");

  assert.match(settingsSource, /async function getLatestAiEvaluationGateForRead\(tenantId: string\)[\s\S]*?catch \(error\)[\s\S]*?available: false/);
  assert.match(settingsSource, /getLatestAiEvaluationGateForRead\(tenantId\)/);
  assert.match(settingsSource, /rolloutQuality\.available && isEvaluationFreshForSettings/);
});

test("AI can always be paused or disabled even when the rollout-quality history is unavailable", async () => {
  const settingsSource = await readFile(new URL("../app/api/tenant/[tenantId]/settings/ai/route.ts", import.meta.url), "utf8");

  assert.match(
    settingsSource,
    /const requiresRolloutQualityGate\s*=\s*requestedRollout\.mode === "automatic"\s*&&\s*requestedRollout\.rolloutPercent > current\.rolloutPercent/
  );
  assert.match(
    settingsSource,
    /const latestEvaluation = requiresRolloutQualityGate\s*\? await getLatestAiEvaluationGate\(tenantId\)\s*:\s*null/
  );
});
