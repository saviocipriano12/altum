import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("runtime vincula memoria a identidade do contato e ordem do evento", async () => {
  const runtime = await source("../lib/server/ai/agent.ts");
  assert.match(runtime, /buildRelationshipIdentityKey\(\{ tenantId, kind: "phone"/);
  assert.match(runtime, /buildRelationshipIdentityKey\(\{ tenantId, kind: "email"/);
  assert.match(runtime, /kind: "provider"/);
  assert.match(runtime, /getLeadMemory\(tenantId, leadId, relationshipIdentityKey\)/);
  assert.match(runtime, /sourceOccurredAtMs: relationshipOccurredAtMs/);
  assert.match(runtime, /sourceMessageId: messageId/);
  assert.match(runtime, /identityKey: relationshipIdentityKey/);
});

test("producao e preview aplicam evidencias e bloqueio de pergunta repetida", async () => {
  const [runtime, preview, composer] = await Promise.all([
    source("../lib/server/ai/agent.ts"),
    source("../app/api/tenant/[tenantId]/ai-preview/route.ts"),
    source("../lib/server/ai/response-composer.ts"),
  ]);
  for (const value of [runtime, preview]) {
    assert.match(value, /relationshipFactsForPrompt/);
    assert.match(value, /composeAiResponse/);
    assert.match(value, /fatos confirmados/);
    assert.match(value, /hipoteses/);
  }
  assert.match(composer, /removeAnsweredRelationshipQuestions/);
  assert.match(composer, /enforceRelationshipPrivacyBoundary/);
});

test("observabilidade registra revisao, evidencias e descartes da memoria", async () => {
  const runtime = await source("../lib/server/ai/agent.ts");
  assert.match(runtime, /relationshipTrace/);
  assert.match(runtime, /confirmedFactKeys/);
  assert.match(runtime, /hypothesisFactKeys/);
  assert.match(runtime, /ignoredUpdateReasons/);
  assert.match(runtime, /identityBound/);
});

test("avaliacao real usa estado relacional canonico antes de julgar memoria", async () => {
  const liveVerifier = await source("../scripts/verify-ai-evaluation-baseline-live.mts");
  assert.match(liveVerifier, /prepareScenarioLeadMemory/);
  assert.match(liveVerifier, /mergeRelationshipState/);
  assert.match(liveVerifier, /scenarioLeadMemory\?\.relationshipState/);
  assert.match(liveVerifier, /composeAiResponse/);
});
