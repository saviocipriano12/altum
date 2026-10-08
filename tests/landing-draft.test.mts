import assert from "node:assert/strict";
import test from "node:test";
import { buildLandingDraft } from "../lib/server/agent-os/landing-draft";

test("cria um rascunho de landing sem inventar resultados ou depoimentos", () => {
  const draft = buildLandingDraft({ title: "Missão: Landing para diagnóstico", objective: "Criar uma página para captar pedidos de diagnóstico.", brand: { positioning: "Diagnóstico comercial simples", audience: "empresas locais", offers: ["Diagnóstico de vendas"] } });
  assert.equal(draft.landing.heroTitle, "Landing para diagnóstico");
  assert.match(draft.landing.heroDescription, /Diagnóstico comercial simples/);
  assert.deepEqual(draft.landing.testimonials, []);
  assert.equal(draft.landing.metrics[0]?.value, "Personalizado");
});
