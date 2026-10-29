import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("producao, preview e avaliacao usam o mesmo plano canonico", async () => {
  const [agent, preview, liveEvaluation] = await Promise.all([
    readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tenant/[tenantId]/ai-preview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/verify-ai-evaluation-baseline-live.mts", import.meta.url), "utf8"),
  ]);
  for (const source of [agent, preview, liveEvaluation]) {
    assert.match(source, /compileAiActionPlan/);
    assert.match(source, /actionPlan/);
  }
  assert.match(agent, /claimAiActionExecution/);
  assert.match(agent, /completeAiActionExecution/);
  assert.match(agent, /ensureAiActionApprovals/);
  assert.match(agent, /checkoutActionAuthorized/);
  assert.match(preview, /shadowMode: true/);
  assert.match(liveEvaluation, /shadowMode: true/);
});

test("efeitos sensiveis continuam atras de aprovacao explicita", async () => {
  const plan = await readFile(new URL("../lib/server/ai/action-plan.ts", import.meta.url), "utf8");
  assert.match(plan, /financial_action_requires_approval/);
  assert.match(plan, /contractual_draft_requires_review/);
  assert.match(plan, /copilot_never_executes_mutation/);
  assert.match(plan, /shadow_mode_no_side_effects/);
});
