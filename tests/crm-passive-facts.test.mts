import assert from "node:assert/strict";
import test from "node:test";
import { extractObservedCommercialFacts as facts } from "../lib/server/crm/conversation-facts.ts";
import { normalizePipelineStages, validateCustomizedPipelineStages } from "../lib/pipeline.ts";
import { parseEvolutionInbound } from "../lib/server/messaging/evolution-webhook.ts";
import { readGatewayWhatsAppGroup } from "../lib/server/messaging/whatsapp-group.ts";

test("buyer budget is explicit, never a telephone, year or quoted seller price", () => {
  for (const text of ["Meu telefone é 11999998888", "Estamos no ano 2026", "Tenho 250 funcionários", "O vendedor cobrou R$ 5000", "Qual o orçamento de 5000?", "Se eu posso investir 5000", "Não posso investir 5000"]) assert.equal(facts(text).budgetBand, undefined, text);
  assert.equal(facts("Meu orçamento é R$ 5.000 reais").budgetBand, "5.000 reais");
  assert.equal(facts("Posso investir até 8 mil").budgetBand, "8 mil");
});

test("CRM keeps specific facts without mentioned-in-conversation placeholders", () => {
  assert.equal(facts("Minha cidade é São Paulo").city, "São Paulo");
  assert.equal(facts("Quero uma proposta para minha empresa em Recife").city, "Recife");
  assert.equal(facts("Preciso de ajuda para minha empresa").city, undefined);
  assert.equal(facts("Meu objetivo é reduzir o tempo de atendimento").primaryGoal, "reduzir o tempo de atendimento");
  assert.equal(facts("Quero contratar manutenção do ar condicionado").serviceInterest, "manutenção do ar condicionado");
  assert.equal(facts("Meu problema é perder pedidos depois das 18h").need, "perder pedidos depois das 18h");
  assert.equal(facts("Preciso começar até sexta-feira").deadline, "até sexta-feira");
  assert.equal(facts("Nossa equipe de 4 vendedores").teamSize, "4 vendedores");
  assert.equal(facts("Não sou o dono").decisionMaker, undefined);
  assert.equal(facts("Não moro em Recife").city, undefined);
  assert.equal(facts("Não achei caro").dominantObjection, undefined);
  assert.deepEqual(facts("Qual sua cidade e orçamento?"), {});
});

test("custom funnel rejects duplicates and invalid input before fallback can erase it", () => {
  const stages = ["Recepção", "Visita técnica", "Contrato"].map((label, position) => ({ id: `custom_${position}`, label, position }));
  assert.equal(validateCustomizedPipelineStages(stages), null);
  assert.deepEqual(normalizePipelineStages(stages).map((stage) => stage.label), stages.map((stage) => stage.label));
  assert.ok(validateCustomizedPipelineStages(stages.slice(0, 2)));
  assert.ok(validateCustomizedPipelineStages([{ id: "novo", label: "A" }, { id: "captado", label: "B" }, { id: "ganho", label: "C" }]));
  assert.ok(validateCustomizedPipelineStages(undefined));
});

test("alternate group identity cannot become the participant's individual CRM identity", () => {
  const parsed = parseEvolutionInbound({ event: "messages.upsert", data: {
    key: { id: "group-alt", remoteJid: "123@lid", remoteJidAlt: "123456@g.us", participant: "5511999999999@s.whatsapp.net" },
    pushName: "Participante", group: { subject: "Equipe Comercial" }, message: { conversation: "Olá" },
  } });
  assert.equal(parsed?.isGroup, true);
  assert.equal(parsed?.from, "123456@g.us");
  assert.equal(parsed?.groupName, "Equipe Comercial");
  const missing = parseEvolutionInbound({ data: { key: { participant: "5511999999999@s.whatsapp.net" }, message: { conversation: "Olá" } } });
  assert.equal(missing, null);
});

test("legacy gateways preserve group identity instead of normalizing it into a lead phone", () => {
  const group = readGatewayWhatsAppGroup({ from: "123456@g.us", groupName: "Clientes", participantJid: "5511999999999@s.whatsapp.net" });
  assert.equal(group.isGroup, true);
  assert.equal(group.groupJid, "123456@g.us");
  assert.equal(group.groupName, "Clientes");
  assert.equal(readGatewayWhatsAppGroup({ from: "5511999999999", to: "123456@g.us" }).groupJid, "123456@g.us");
  const invalid = readGatewayWhatsAppGroup({ isGroup: true, from: "5511999999999" });
  assert.equal(invalid.isGroup, true);
  assert.equal(invalid.groupJid, "");
  assert.equal(readGatewayWhatsAppGroup({ from: "5511999999999" }).isGroup, false);
});
