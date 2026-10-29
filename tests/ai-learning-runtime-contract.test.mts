import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const tenantLearning = await readFile(new URL("../lib/server/ai/tenant-learning.ts", import.meta.url), "utf8");
const learningLoop = await readFile(new URL("../lib/server/ai/learning-loop.ts", import.meta.url), "utf8");
const previewRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url), "utf8");
const evaluationRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-evaluations/route.ts", import.meta.url), "utf8");
const feedbackRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-learning/feedback/route.ts", import.meta.url), "utf8");

test("runtime nao aprende com contadores ou com a propria resposta", () => {
  assert.doesNotMatch(tenantLearning, /ai_tenant_learning_daily/);
  assert.match(tenantLearning, /item\.status === "approved"/);
  assert.match(learningLoop, /learningEligibility: "observation_only"/);
  assert.match(learningLoop, /source: "agent"/);
  assert.match(learningLoop, /selfGenerated: true/);
});

test("recomendacao sombra participa da avaliacao oficial antes de promocao", () => {
  assert.match(previewRoute, /learningRecommendationFingerprint/);
  assert.match(previewRoute, /includeShadowFingerprint/);
  assert.match(evaluationRoute, /recomendacao_de_aprendizado_nao_aplicada_na_prova/);
  assert.match(evaluationRoute, /learningRecommendationFingerprint: requestedLearningFingerprint/);
});

test("feedback operacional exige tenant, permissao, lead e chave idempotente", () => {
  assert.match(feedbackRoute, /assertTenantAccess/);
  assert.match(feedbackRoute, /assertTenantCapability\(membership, "edit_leads"\)/);
  assert.match(feedbackRoute, /assertLeadCommercialAccess/);
  assert.match(feedbackRoute, /dedupeKey: `feedback:\$\{eventId\}`/);
});
