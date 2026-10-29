import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("runtime, preview e avaliacao usam o mesmo compositor e recibo", async () => {
  const [runtime, preview, evaluation, composer] = await Promise.all([
    readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-ai-evaluation-baseline-live.mts", import.meta.url), "utf8"),
    readFile(new URL("../lib/server/ai/response-composer.ts", import.meta.url), "utf8"),
  ]);
  for (const source of [runtime, preview, evaluation]) {
    assert.match(source, /composeAiResponse/);
    assert.match(source, /responseValidation/);
  }
  assert.match(runtime, /responseValidationTrace: input\.responseValidationTrace/);
  assert.match(composer, /AI_RESPONSE_COMPOSER_VERSION/);
  assert.match(composer, /enforceConversationTurnPolicy/);
  assert.match(composer, /enforceRelationshipPrivacyBoundary/);
});

test("bateria oficial possui prova para whatsapp, instagram, facebook e site", async () => {
  const evaluation = await readFile(new URL("../lib/ai-evaluation.ts", import.meta.url), "utf8");
  for (const channel of ["whatsapp", "instagram", "facebook", "site"]) {
    assert.match(evaluation, new RegExp(`channel: "${channel}"`));
  }
  assert.match(evaluation, /2026-10-11-response-composer-v1/);
});
