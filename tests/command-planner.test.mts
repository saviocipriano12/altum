import test from "node:test";
import assert from "node:assert/strict";
import { planCommand } from "../lib/server/agent-os/command-planner.ts";

test("pedido para analisar um anexo cria missão supervisionada", () => {
  const plan = planCommand("Analise a planilha anexada e encontre as melhores oportunidades.");
  assert.equal(plan.shouldCreateMission, true);
  assert.equal(plan.template, "custom");
});

test("pedido de vídeo cria missão criativa", () => {
  const plan = planCommand("Crie um vídeo realista para lançar nossa nova oferta.");
  assert.equal(plan.shouldCreateMission, true);
  assert.equal(plan.template, "creative");
});

test("pedidos naturais de execução também criam missões", () => {
  for (const message of ["Faça uma landing page", "Desenvolva um site para a loja", "Construa um sistema", "Produza um vídeo UGC"]) {
    assert.equal(planCommand(message).shouldCreateMission, true, message);
  }
});

test("envio e publicação são sinalizados como alto risco", () => {
  assert.equal(planCommand("Prepare uma campanha e envie aos clientes").risk, "high");
  assert.equal(planCommand("Crie os anúncios e publique hoje").risk, "high");
  assert.equal(planCommand("Crie os anúncios em rascunho").risk, "low");
  assert.equal(planCommand("Faça o envio da proposta para os contatos").risk, "high");
  assert.equal(planCommand("Prepare uma publicação para Instagram").risk, "high");
  assert.equal(planCommand("Faça a transferência bancária").risk, "high");
  assert.equal(planCommand("Organize a exclusão dos dados antigos").risk, "high");
});
