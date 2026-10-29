import assert from "node:assert/strict";
import test from "node:test";
import { validateCommercialExtraction as validate, extractCommercialFactsWithModel as extract, type SemanticMessage } from "../lib/server/crm/semantic-extraction.ts";
const messages: SemanticMessage[] = [
  { id: "seller", sender: "agent", text: "O plano custa 9000 reais", kind: "text" },
  { id: "audio", sender: "client", text: "Consigo separar uns 3000 reais. Aqui sou eu que bato o martelo.", kind: "audio_transcription" },
  { id: "correction", sender: "client", text: "Corrigindo: tenho 2000 reais disponíveis.", kind: "text" },
];
const fact = (overrides: Record<string, unknown> = {}) => ({ field: "budgetBand", value: "3000 reais", messageId: "audio", excerpt: "Consigo separar uns 3000 reais.", confidence: 0.95, ...overrides });
test("semantic interpretation retains literal buyer evidence and distinguishes an audio transcript", () => {
  const result = validate({ facts: [fact(), fact({ field: "decisionMaker", value: "sou eu que bato o martelo", excerpt: "Aqui sou eu que bato o martelo." })] }, messages);
  assert.equal(result.facts.length, 2); assert.equal(result.facts[0].kind, "audio_transcription"); assert.equal(result.facts[0].messageId, "audio");
});
test("seller quote, invented message, rewritten quote and unsupported normalized value are rejected", () => {
  const result = validate({ facts: [fact({ messageId: "seller", value: "9000 reais", excerpt: "O plano custa 9000 reais" }), fact({ messageId: "absent" }),
    fact({ excerpt: "Meu orçamento é 3000 reais" }), fact({ value: "R$ 3.000" }), fact({ confidence: 0.5 }), fact({ field: "pipelineStage" })] }, messages);
  assert.equal(result.facts.length, 0); assert.equal(result.rejected.length, 6);
});
test("a later correction wins regardless of model output order", () => {
  const corrected = fact({ messageId: "correction", value: "2000 reais", excerpt: "tenho 2000 reais disponíveis." });
  for (const facts of [[fact(), corrected], [corrected, fact()]]) assert.equal(validate({ facts }, messages).facts[0].value, "2000 reais");
});
test("invalid shapes and duplicate source identities fail closed", () => {
  assert.throws(() => validate({}, messages), /INVALID_RESPONSE/);
  assert.throws(() => validate({ facts: [] }, [messages[0], messages[0]]), /DUPLICATE_SOURCE/);
  assert.deepEqual(validate({ facts: [] }, messages), { facts: [], rejected: [] });
});
test("a literal statement of unknown timing is not a confirmed deadline or urgency", () => {
  const source = [{ id: "unknown", sender: "client" as const, kind: "text" as const, text: "Não tenho prazo definido ainda" }];
  const result = validate({ facts: ["deadline", "urgency"].map(field => fact({ field, messageId: "unknown", value: source[0].text, excerpt: source[0].text })) }, source);
  assert.equal(result.facts.length, 0); assert.deepEqual(result.rejected, ["unspecified_deadline", "unspecified_deadline"]);
});
test("model lowercasing recovers the original customer span without weakening evidence matching", () => {
  const result = validate({ facts: [fact({ field: "decisionMaker", value: "aqui sou eu que bato o martelo", excerpt: "Aqui sou eu que bato o martelo" })] }, messages);
  assert.equal(result.facts[0].value, "Aqui sou eu que bato o martelo");
  assert.equal(result.facts[0].excerpt, "Aqui sou eu que bato o martelo");
  assert.equal(validate({ facts: [fact({ value: "aqui eu tomo todas as decisões", excerpt: "Aqui sou eu que bato o martelo" })] }, messages).facts.length, 0);
});
test("repeated alternatives in the same message cannot reintroduce a rejected ambiguous field", () => {
  const source = [{ id: "options", sender: "client" as const, text: "3000 reais ou 5000 reais", kind: "text" as const }];
  const base = { messageId: "options", excerpt: source[0].text };
  const result = validate({ facts: [fact({ ...base, value: "3000 reais" }), fact({ ...base, value: "5000 reais" }), fact({ ...base, value: "3000 reais" })] }, source);
  assert.equal(result.facts.length, 0);
});
test("provider path sends a strict schema and returns source-validated facts", async () => {
  const prior = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init?.body)); assert.equal(body.response_format.json_schema.strict, true); assert.equal(body.max_completion_tokens, 2200);
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ facts: [fact()] }) } }], usage: { prompt_tokens: 100, completion_tokens: 40 } });
  };
  try { const result = await extract({ messages, businessContext: "Loja fictícia", model: "gpt-4.1-mini", apiKey: "synthetic-test-key" }); assert.equal(result.facts[0].value, "3000 reais"); assert.equal(result.inputTokens, 100); }
  finally { globalThis.fetch = prior; }
});
test("refusal and truncated output cannot be accepted as a completed extraction", async () => {
  const prior = globalThis.fetch;
  try {
    for (const choice of [{ finish_reason: "length", message: { content: "{}" } }, { finish_reason: "stop", message: { refusal: "refused" } }]) {
      globalThis.fetch = async () => Response.json({ choices: [choice] });
      await assert.rejects(extract({ messages, businessContext: "", model: "gpt-4.1-mini", apiKey: "synthetic-test-key" }), /INCOMPLETE_OR_REFUSED/);
    }
  } finally { globalThis.fetch = prior; }
});
