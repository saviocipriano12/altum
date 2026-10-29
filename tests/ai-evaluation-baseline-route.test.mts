import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("tenant evaluation persists comparison against the latest approved baseline", async () => {
  const route = await readFile(
    new URL("../app/api/tenant/[tenantId]/ai-evaluations/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(route, /where\("tenantId", "==", tenantId\)/);
  assert.match(route, /selectAiEvaluationReferenceBaseline/);
  assert.match(route, /compareAiEvaluationRuns\(baselineRun, candidateRun\)/);
  assert.match(route, /baselineComparison,/);
  assert.match(route, /tenantContextFingerprint/);
  assert.match(route, /summarizeAiEvaluationStability/);
  assert.match(route, /item\.fingerprint === tenantContextFingerprint/);
});
