import assert from "node:assert/strict";
import test from "node:test";
import { deriveDeterministicConversationFields } from "../lib/server/ai/deterministic-field-extraction.ts";

test("extrai negocio, objetivo e canais sem depender do modelo", () => {
  assert.deepEqual(
    deriveDeterministicConversationFields("Sou uma clínica e quero organizar atendimento e vendas pelo WhatsApp e Instagram"),
    {
      businessType: "clinica",
      primaryGoal: "organizar a operacao comercial",
      currentChannels: "whatsapp, instagram",
    }
  );
});

test("o campo deterministico cobre oportunidade comercial expressa", () => {
  const fields = deriveDeterministicConversationFields("Tenho uma agência pequena e quero gerar mais oportunidades");
  assert.equal(fields.businessType, "agencia");
  assert.equal(fields.primaryGoal, "gerar mais leads qualificados");
});
