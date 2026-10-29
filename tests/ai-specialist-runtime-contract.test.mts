import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("runtime e preview executam o mesmo supervisor antes do especialista", async () => {
  const [runtime, preview] = await Promise.all([
    source("../lib/server/ai/agent.ts"),
    source("../app/api/tenant/[tenantId]/ai-preview/route.ts"),
  ]);
  for (const value of [runtime, preview]) {
    assert.match(value, /superviseAiSpecialist\(/);
    assert.match(value, /specialistSupervisorInstruction\(/);
    assert.match(value, /effectiveAssistantRole/);
    assert.match(value, /specialistDecisionKey/);
    assert.match(value, /compileAiSpecialistExecutionContract/);
    assert.match(value, /validateAiSpecialistOutput/);
  }
});

test("runtime persiste transferencia e observabilidade do supervisor", async () => {
  const [agent, state] = await Promise.all([
    source("../lib/server/ai/agent.ts"),
    source("../lib/server/ai/runtime-state.ts"),
  ]);
  assert.match(agent, /specialistTrace/);
  assert.match(agent, /configuredRole: specialistDecision\.configuredRole/);
  assert.match(agent, /activeSpecialist: specialistDecision\.selectedSpecialist/);
  assert.match(state, /specialistSupervisorVersion/);
  assert.match(state, /specialistTransferReason/);
});

test("o supervisor nao executa ferramenta ou acao externa", async () => {
  const supervisor = await source("../lib/server/ai/specialist-supervisor.ts");
  assert.doesNotMatch(supervisor, /adminDb|fetch\(|sendMeta|sendWhatsApp|executeAltumAgentActions/);
  assert.match(supervisor, /idempotencyKey/);
  assert.match(supervisor, /allowedTransfer/);
});

test("timeout e saida restrita usam o mesmo contrato no roteador", async () => {
  const [router, execution] = await Promise.all([
    source("../lib/server/ai/router.ts"),
    source("../lib/server/ai/specialist-execution.ts"),
  ]);
  assert.match(router, /AI_SPECIALIST_TIMEOUT_MS/);
  assert.match(execution, /fallback_required/);
  assert.match(execution, /tool_not_allowed/);
});
