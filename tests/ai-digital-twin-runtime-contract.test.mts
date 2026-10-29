import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const simulationRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-simulations/route.ts", import.meta.url), "utf8");
const evaluationRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-evaluations/route.ts", import.meta.url), "utf8");
const promotionRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-learning/recommendations/route.ts", import.meta.url), "utf8");
const twinStore = await readFile(new URL("../lib/server/ai/digital-twin-store.ts", import.meta.url), "utf8");

test("simulacao exige identidade, tenant, modulo e capacidade de gerenciar IA", () => {
  assert.match(simulationRoute, /requireRequestUser/);
  assert.match(simulationRoute, /assertTenantAccess/);
  assert.match(simulationRoute, /assertTenantModule\(tenantId, "ai"\)/);
  assert.match(simulationRoute, /assertTenantCapability\(membership, "manage_ai"\)/);
});

test("gemeo compara somente baterias oficiais persistidas e executa em sombra", () => {
  assert.match(simulationRoute, /collection\("ai_evaluation_runs"\)/);
  assert.match(evaluationRoute, /actionPlanExecutionMode/);
  assert.match(evaluationRoute, /providerFallbackTriggered/);
  assert.match(simulationRoute, /compareAiDigitalTwinRuns/);
  assert.match(simulationRoute, /persistAiDigitalTwinRun/);
});

test("recibo e idempotente, transacional, escopado por tenant e sem conversa bruta", () => {
  assert.match(twinStore, /runTransaction/);
  assert.match(twinStore, /existing\.data\(\)\?\.tenantId !== tenantId/);
  assert.match(twinStore, /input\.snapshot\.tenantId !== tenantId/);
  assert.match(twinStore, /input\.snapshot\.schemaVersion !== AI_DIGITAL_TWIN_VERSION/);
  assert.doesNotMatch(twinStore, /messages|conversationText|customerText/);
});

test("promocao do aprendizado exige bateria e gemeo ligados ao mesmo fingerprint", () => {
  assert.match(promotionRoute, /digitalTwinRunId/);
  assert.match(promotionRoute, /collection\("ai_digital_twin_runs"\)/);
  assert.match(promotionRoute, /evaluateTenantLearningPromotion/);
  assert.match(promotionRoute, /approvedDigitalTwinRunId/);
});
