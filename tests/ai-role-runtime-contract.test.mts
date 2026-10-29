import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("runtime e preview compilam e aplicam o mesmo contrato operacional", async () => {
  const [runtime, preview] = await Promise.all([
    source("../lib/server/ai/agent.ts"),
    source("../app/api/tenant/[tenantId]/ai-preview/route.ts"),
  ]);

  for (const value of [runtime, preview]) {
    assert.match(value, /compileTenantAiContext\(/);
    assert.match(value, /roleContract: tenantContext\.roleContract/);
    assert.match(value, /tenantContext\.fingerprint/);
  }
  assert.match(preview, /composeAiResponse/);
});

test("avaliacao oficial prova papel efetivo, prontidao e matriz de fingerprints", async () => {
  const [evaluation, route] = await Promise.all([
    source("../lib/ai-evaluation.ts"),
    source("../app/api/tenant/[tenantId]/ai-evaluations/route.ts"),
  ]);

  assert.match(evaluation, /contrato de papel incorreto/);
  assert.match(evaluation, /papel sem prontidao operacional/);
  assert.match(route, /buildAiEvaluationContextFingerprint/);
  assert.match(route, /roleContractFingerprint/);
  assert.match(route, /effectiveAssistantRole/);
});

test("mudanca de versao da suite invalida rollout aprovado anteriormente", async () => {
  const settingsRoute = await source("../app/api/tenant/[tenantId]/settings/ai/route.ts");
  assert.match(settingsRoute, /expectedScenarioVersion: AI_EVALUATION_SCENARIO_VERSION/);
  assert.match(settingsRoute, /scenarioVersion: evaluation\.scenarioVersion/);
});

test("log de decisao persiste diagnostico do contrato por tenant", async () => {
  const runtime = await source("../lib/server/ai/agent.ts");
  assert.match(runtime, /tenantContextDiagnostics: input\.tenantContextDiagnostics/);
  assert.match(runtime, /roleContractVersion\?: string/);
  assert.match(runtime, /roleReadiness\?: "ready" \| "restricted"/);
  assert.match(runtime, /missingRoleSignals\?: string\[\]/);
});
