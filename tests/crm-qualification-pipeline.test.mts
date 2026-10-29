import test from "node:test";
import assert from "node:assert/strict";
import { normalizePipelineStages } from "../lib/pipeline.ts";
import { evaluateLeadQualification } from "../lib/server/crm/qualification.ts";

const stages = normalizePipelineStages([
  { id: "captado", label: "Entrada" },
  { id: "provador", label: "Escolhendo pecas", description: "Qualificacao do interesse" },
  { id: "reserva", label: "Separacao humana" },
]);
test("qualification uses the configured stage description rather than discarding tenant semantics", () => {
  const result = evaluateLeadQualification({ lead: { nome: "Cliente QA", pipelineStage: "captado" }, stages,
    aiSignals: [{ nextAction: "aprofundar_oportunidade", confidence: 0.99 }] });
  assert.equal(result.recommendedStage, "provador");
});
test("unmapped qualification never invents a default column or chooses the next custom column", () => {
  const opaque = stages.map(stage => ({ ...stage, label: "Etapa", description: "" }));
  for (const lead of [
    { pipelineStage: "captado" },
    { pipelineStage: "reserva", nome: "QA", telefone: "5511000000000", email: "qa@example.invalid", empresa: "QA", potentialValue: 5000 },
  ]) {
    assert.equal(evaluateLeadQualification({ lead, stages: opaque,
      aiSignals: [{ nextAction: "aprofundar_oportunidade", confidence: 0.99 }] }).recommendedStage, lead.pipelineStage);
  }
});
test("a terminal configured stage is not recommended by AI discovery", () => {
  assert.equal(evaluateLeadQualification({ lead: { pipelineStage: "captado" },
    stages: stages.map(stage => ({ ...stage, isTerminal: stage.id === "provador" })),
    aiSignals: [{ nextAction: "aprofundar_oportunidade" }] }).recommendedStage, "captado");
});
test("canonical IDs do not erase the tenant terminal flag", () => {
  const terminal = normalizePipelineStages([
    { id: "captado", label: "Entrada" },
    { id: "qualificacao", label: "Qualificacao encerrada", isTerminal: true },
    { id: "reserva", label: "Separacao" },
  ]);
  assert.equal(evaluateLeadQualification({ lead: { pipelineStage: "captado" }, stages: terminal,
    aiSignals: [{ nextAction: "aprofundar_oportunidade" }] }).recommendedStage, "captado");
});
