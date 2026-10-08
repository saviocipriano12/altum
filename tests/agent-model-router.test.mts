import test from "node:test";
import assert from "node:assert/strict";
import { routeCapability } from "../lib/server/agent-os/model-router.ts";

const providers = [
  { slug: "premium", capabilities: ["GENERATE_TEXT"], availability: "PAID" as const, qualityRank: 10 },
  { slug: "local", capabilities: ["GENERATE_TEXT"], availability: "SELF_HOSTED" as const, qualityRank: 6 },
  { slug: "quota", capabilities: ["GENERATE_TEXT"], availability: "FREE_TIER" as const, qualityRank: 5 },
];

test("FREE_FIRST prioriza a cota gratuita antes de infraestrutura e pago", () => {
  assert.deepEqual(routeCapability({ capability: "GENERATE_TEXT", mode: "FREE_FIRST", providers }).map((item) => item.slug), ["quota", "local", "premium"]);
});

test("LOCAL_ONLY nunca libera um provider externo", () => {
  assert.deepEqual(routeCapability({ capability: "GENERATE_TEXT", mode: "LOCAL_ONLY", providers }).map((item) => item.slug), ["local"]);
});
