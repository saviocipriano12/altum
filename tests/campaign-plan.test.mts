import test from "node:test";
import assert from "node:assert/strict";
import { buildCampaignPlan } from "../lib/server/agent-os/campaign-plan.ts";

test("plano de campanha conecta estratégia, ativos e medição sem exigir provider", () => {
  const plan = buildCampaignPlan({
    title: "Missão: lançar oferta consultiva",
    objective: "Monte uma campanha para captar conversas qualificadas.",
    brand: { audience: "donos de pequenas empresas", positioning: "consultoria prática", tone: "claro", offers: ["diagnóstico comercial"], restrictions: ["sem promessas de faturamento"] },
  });
  assert.equal(plan.assetMatrix.length, 5);
  assert.equal(plan.funnel.length, 3);
  assert.match(plan.hypothesis, /diagnóstico comercial/);
});
