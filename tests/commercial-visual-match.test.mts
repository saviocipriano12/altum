import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialVisualMatchBoost,
  decideCommercialVisualMatches,
} from "../lib/commercial-visual-match.ts";

test("aceita somente produtos conhecidos e remove baixa confianca", () => {
  const decision = decideCommercialVisualMatches([
    { id: "produto-a", confidence: 0.81, reason: "mesma forma" },
    { id: "produto-b", confidence: 0.4 },
    { id: "fora-do-catalogo", confidence: 0.99 },
  ], ["produto-a", "produto-b"]);
  assert.equal(decision.status, "strong_match");
  assert.deepEqual(decision.matches.map((item) => item.id), ["produto-a"]);
});

test("similaridade media nunca vira afirmacao de produto identico", () => {
  const decision = decideCommercialVisualMatches([
    { id: "produto-a", confidence: 0.61 },
  ], ["produto-a"]);
  assert.equal(decision.status, "similar_options");
  assert.match(decision.customerGuidance, /opcoes parecidas/i);
  assert.ok(commercialVisualMatchBoost(0.61) < commercialVisualMatchBoost(0.81));
});

test("sem correspondencia confiavel pede detalhes ou humano", () => {
  const decision = decideCommercialVisualMatches([], ["produto-a"]);
  assert.equal(decision.status, "no_reliable_match");
  assert.equal(decision.matches.length, 0);
  assert.match(decision.customerGuidance, /confirmacao humana/i);
});
