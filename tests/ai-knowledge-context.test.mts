import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCommercialKnowledgeFields } from "../lib/commercial-knowledge-fields.ts";
import { buildKnowledgePromptContext } from "../lib/server/ai/knowledge-context.ts";

test("catalog knowledge preserves structured commercial facts for the conversation agent", () => {
  const prompt = buildKnowledgePromptContext([
    {
      id: "offer-1",
      type: "catalog",
      content: "Resumo curto que nao deve substituir os dados estruturados.",
      productName: "Implantacao Comercial",
      productCategory: "Servico",
      targetProfile: "Empresas B2B com vendas desorganizadas",
      priceFrom: 2500,
      currency: "BRL",
      description: "Diagnostico, configuracao do funil e treinamento da equipe.",
      benefits: "Visibilidade do funil, SLA e follow-up consistente.",
      objections: "Nao e indicado quando a empresa ainda nao tem equipe minima.",
      whenRecommend: "Quando ha perda de leads ou falta de processo.",
      whenNotRecommend: "Nao usar para empresas sem processo comercial minimo.",
      whenHuman: "Negociacao fora da tabela ou duvida juridica.",
      stockDelivery: "Inicio em ate 5 dias uteis apos alinhamento.",
      deliverables: "Mapa do processo, configuracao e treinamento.",
      proofAndCases: "Case autorizado: reducao de tempo de resposta registrada no onboarding.",
      demonstration: "Apresente o mapa do funil e a fila de atendimento em uma demonstracao guiada.",
      paymentConditions: "Pagamento em 3 parcelas, conforme proposta aprovada.",
      supportAndSla: "Suporte em dias uteis, com retorno inicial em ate um dia util.",
    },
  ]);

  assert.match(prompt, /Implantacao Comercial/);
  assert.match(prompt, /Visibilidade do funil, SLA e follow-up consistente/);
  assert.match(prompt, /Nao e indicado quando a empresa ainda nao tem equipe minima/);
  assert.match(prompt, /Negociacao fora da tabela ou duvida juridica/);
  assert.match(prompt, /Inicio em ate 5 dias uteis apos alinhamento/);
  assert.match(prompt, /Mapa do processo, configuracao e treinamento/);
  assert.match(prompt, /Nao usar para empresas sem processo comercial minimo/);
  assert.match(prompt, /demonstracao guiada/);
  assert.match(prompt, /Pagamento em 3 parcelas/);
  assert.match(prompt, /retorno inicial em ate um dia util/);
});

test("catalog knowledge does not invent fields that were not configured", () => {
  const prompt = buildKnowledgePromptContext([
    { id: "offer-2", type: "catalog", content: "Produto simples", productName: "Plano Base" },
  ]);

  assert.match(prompt, /Produto simples/);
  assert.doesNotMatch(prompt, /Beneficios:/);
  assert.doesNotMatch(prompt, /Quando chamar humano:/);
  assert.match(prompt, /Disponibilidade: nao informado/);
});

test("commercial knowledge normalization retains structured data and supports partial updates", () => {
  const complete = normalizeCommercialKnowledgeFields({
    description: "  Uma oferta completa para o catalogo.  ",
    benefits: "Mais clareza e velocidade.",
    useInAi: false,
  });
  const partial = normalizeCommercialKnowledgeFields(
    { objections: "Precisa de equipe minima." },
    { onlyPresent: true }
  );

  assert.equal(complete.description, "Uma oferta completa para o catalogo.");
  assert.equal(complete.benefits, "Mais clareza e velocidade.");
  assert.equal(complete.useInAi, false);
  assert.deepEqual(partial, { objections: "Precisa de equipe minima." });
});
