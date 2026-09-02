import assert from "node:assert/strict";
import test from "node:test";
import { generateBusinessBlueprint } from "../lib/business-blueprint.ts";
import { interpretBusinessBriefWithRules } from "../lib/server/business-blueprint-ai.ts";

function input(salesMotion: "appointment" | "direct_checkout" | "consultative") {
  return {
    company: { name: "Empresa Teste", segment: salesMotion === "appointment" ? "Barbearia" : "Comércio", audience: "clientes locais", toneOfVoice: "direto e cordial" },
    offer: { offeringType: "services" as const, summary: "serviços e produtos selecionados" },
    sales: { salesMotion, serviceStyle: "ai_assisted" as const, specialRules: ["Não confirmar sem consultar disponibilidade"], operationNarrative: "O cliente chega pelo WhatsApp e conclui por PIX." },
  };
}

test("blueprint de agendamento cria jornada de horario, não proposta genérica", () => {
  const blueprint = generateBusinessBlueprint(input("appointment"));
  assert.equal(blueprint.salesMotion, "appointment");
  assert.ok(blueprint.pipeline.some((stage) => stage.id === "horario_oferecido"));
  assert.ok(blueprint.pipeline.some((stage) => stage.id === "agendado"));
  assert.equal(blueprint.closing.primaryAction, "Oferecer horários");
});

test("blueprint de compra direta gera checkout e cadência curta", () => {
  const blueprint = generateBusinessBlueprint(input("direct_checkout"));
  assert.ok(blueprint.pipeline.some((stage) => stage.id === "checkout_enviado"));
  assert.equal(blueprint.cadence.firstFollowUpHours, 4);
  assert.match(blueprint.closing.primaryAction, /checkout/i);
});

test("blueprint é determinístico e carrega regras do negócio", () => {
  const first = generateBusinessBlueprint(input("consultative"));
  const second = generateBusinessBlueprint(input("consultative"));
  assert.equal(first.fingerprint, second.fingerprint);
  assert.ok(first.aiPolicy.guardrails.some((item) => /disponibilidade/i.test(item)));
  assert.equal(first.aiPolicy.autonomy, "hybrid");
});

test("automações geradas não enviam mensagem sem revisão", () => {
  const blueprint = generateBusinessBlueprint(input("direct_checkout"));
  const actionTypes = blueprint.automations.flatMap((automation) => automation.actions.map((action) => action.type));
  assert.equal(actionTypes.includes("send_message"), false);
});

test("fallback local entende operação de agendamento sem inventar dados", () => {
  const interpreted = interpretBusinessBriefWithRules({ brief: "Somos uma barbearia. Clientes chegam pelo Instagram e WhatsApp, escolhem corte e recebem dois horarios. Pagam por PIX." });
  assert.equal(interpreted.company.segment, "barbearia");
  assert.equal(interpreted.sales.salesMotion, "appointment");
  assert.deepEqual(interpreted.sales.leadSources.sort(), ["instagram", "whatsapp"]);
  assert.match(interpreted.offer.paymentMethods, /pix/);
  assert.ok(interpreted.missingInformation.includes("nome da empresa"));
});
