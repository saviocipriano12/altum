import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyConversationTurn,
  detectVerifiedCommercialFactRequest,
  enforceConversationTurnPolicy,
  keepConversationQuestionLimit,
  knowledgeScoreThreshold,
} from "../lib/server/ai/conversation-policy.ts";

test("transactional facts are identified before the model can improvise them", () => {
  assert.equal(detectVerifiedCommercialFactRequest("Qual o preco desse produto?"), "price");
  assert.equal(detectVerifiedCommercialFactRequest("Tem disponivel a pronta entrega?"), "inventory");
  assert.equal(detectVerifiedCommercialFactRequest("Parcela no cartao?"), "payment");
  assert.equal(detectVerifiedCommercialFactRequest("Qual e o prazo de entrega?"), "delivery");
  assert.equal(detectVerifiedCommercialFactRequest("Como funciona a devolucao?"), "commercial_policy");
  assert.equal(detectVerifiedCommercialFactRequest("Oi, quero entender melhor o servico"), null);
});

test("greetings do not retrieve or pitch the catalog", () => {
  const policy = classifyConversationTurn("Opa");
  assert.equal(policy.kind, "greeting");
  assert.equal(policy.shouldRetrieveKnowledge, false);
  assert.equal(policy.allowCatalog, false);
});

test("a correction resets the previous commercial topic", () => {
  const policy = classifyConversationTurn("Mas eu não pedi consultoria");
  assert.equal(policy.kind, "correction");
  assert.equal(policy.resetCommercialTopic, true);
  assert.equal(policy.shouldRetrieveKnowledge, false);
});

test("conversation requests stay conversational", () => {
  const policy = classifyConversationTurn("Você pode conversar primeiro?");
  assert.equal(policy.kind, "conversation_request");
  assert.equal(policy.shouldRetrieveKnowledge, false);
  assert.equal(policy.mustAcknowledgeFirst, true);
});

test("a direct request for help is not downgraded to an empty greeting", () => {
  const policy = classifyConversationTurn("Oi, preciso de ajuda mas nao sei com quem falar");
  assert.equal(policy.kind, "direct_question");
  assert.equal(policy.shouldRetrieveKnowledge, true);
  assert.equal(policy.maxQuestions, 1);
});

test("explicit product requests may use catalog evidence", () => {
  const policy = classifyConversationTurn("Tem foto e preço desse produto?");
  assert.equal(policy.kind, "product_request");
  assert.equal(policy.shouldRetrieveKnowledge, true);
  assert.equal(policy.allowCatalog, true);
});

test("knowledge retrieval uses a real relevance floor", () => {
  assert.ok(knowledgeScoreThreshold("keyword") > 0.35);
  assert.ok(knowledgeScoreThreshold("hybrid") > 0.35);
  assert.ok(knowledgeScoreThreshold("semantic") > 0.35);
});

test("a correction cannot keep pitching the rejected topic", () => {
  assert.equal(
    enforceConversationTurnPolicy({
      inboundText: "Mas eu não pedi consultoria",
      outboundText: "Nossa consultoria faz um diagnóstico e depois envia uma proposta.",
    }),
    "Você tem razão — eu entendi errado. Vamos deixar isso de lado. Sobre o que você gostaria de conversar?"
  );
});

test("a greeting cannot be turned into an immediate qualification script", () => {
  assert.equal(
    enforceConversationTurnPolicy({
      inboundText: "Opa",
      outboundText: "Para eu te direcionar, qual e o seu nicho e o seu orcamento?",
    }),
    "Oi! Tudo bem? Pode falar — como posso te ajudar?"
  );
});

test("a wellbeing exchange stays relational instead of forcing discovery", () => {
  assert.equal(
    enforceConversationTurnPolicy({
      inboundText: "Tudo bem?",
      outboundText: "Tudo certo. Qual resultado comercial voce quer destravar?",
    }),
    "Tudo certo por aqui 😊 E com você?"
  );
});

test("thanks are acknowledged without another sales question", () => {
  assert.equal(
    enforceConversationTurnPolicy({
      inboundText: "Obrigado",
      outboundText: "Perfeito. Qual o principal gargalo do seu atendimento?",
    }),
    "Imagina! Se precisar, estou por aqui."
  );
});

test("a resposta final mantém no máximo uma pergunta útil", () => {
  assert.equal(
    keepConversationQuestionLimit(
      "Entendi seu momento. Qual é a prioridade agora? Você anuncia onde? Qual é o orçamento?"
    ),
    "Entendi seu momento. Qual é a prioridade agora?"
  );

  const outbound = enforceConversationTurnPolicy({
    inboundText: "Quero organizar meu atendimento",
    outboundText: "Faz sentido. Quantas pessoas atendem hoje? Usa WhatsApp? Já tem CRM?",
  });
  assert.equal((outbound.match(/\?/g) || []).length, 1);
});
