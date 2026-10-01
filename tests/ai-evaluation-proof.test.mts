import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("gate only accepts official, current server-side evaluation proofs", async () => {
  const previewRoute = await readFile(
    new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url),
    "utf8"
  );
  const evaluationRoute = await readFile(
    new URL("../app/api/tenant/[tenantId]/ai-evaluations/route.ts", import.meta.url),
    "utf8"
  );

  assert.match(previewRoute, /evaluationScenarioId/);
  assert.match(previewRoute, /message: evaluationScenario\.message/);
  assert.match(previewRoute, /collection\("ai_evaluation_previews"\)/);
  assert.match(evaluationRoute, /proofId/);
  assert.match(evaluationRoute, /proofData\?\.tenantId === tenantId/);
  assert.match(evaluationRoute, /proofData\?\.createdBy === user\.uid/);
  assert.match(evaluationRoute, /proofData\?\.scenarioId === scenarioId/);
  assert.match(evaluationRoute, /proofCreatedAt >= settingsUpdatedAt/);
  assert.match(evaluationRoute, /30 \* 60 \* 1000/);
});

test("provider fallback is evidence for investigation, never approval for automatic rollout", async () => {
  const evaluationSource = await readFile(new URL("../lib/ai-evaluation.ts", import.meta.url), "utf8");
  assert.match(evaluationSource, /hasProviderFallback/);
  assert.match(evaluationSource, /!hasProviderFallback/);
});

test("preview uses the same Blueprint AI policy as the production runtime", async () => {
  const previewRoute = await readFile(
    new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url),
    "utf8"
  );
  assert.match(previewRoute, /DEFAULT_GUARDRAILS/);
  assert.match(previewRoute, /blueprintAiPolicy\.guardrails/);
  assert.match(previewRoute, /blueprintAiPolicy\.handoffWhen/);
  assert.match(previewRoute, /resolvedToneOfVoice/);
  assert.match(previewRoute, /resolvedBusinessSummary/);
});

test("respostas transacionais sem oferta definida nao podem ser sobrescritas pelo modelo", async () => {
  const agentSource = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  assert.match(agentSource, /offer_selection_required_/);
  assert.match(agentSource, /controlledReply \|\| llmResult\?\.responseText \|\| choice\.responseText/);
});
