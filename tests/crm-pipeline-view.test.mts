import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { crmPipelineStageOptions } from "../lib/crm-pipeline-view.ts";
import { getPipelineStageLabel, type PipelineStageDefinition } from "../lib/pipeline.ts";
const stages: PipelineStageDefinition[] = [
  { id: "contato", label: "Escolhendo modelo", position: 1, color: "#112233", description: "" },
  { id: "novo_pedido", label: "Novo pedido", position: 0, color: "#112233", description: "" },
  { id: "ganho", label: "Pedido confirmado", position: 2, color: "#112233", description: "" },
];
test("Kanban follows saved names and order rather than standard labels or a forced Captado column", () => {
  const ids = crmPipelineStageOptions(stages, ["contato", "novo_pedido"]);
  assert.deepEqual(ids, ["novo_pedido", "contato", "ganho"]);
  assert.deepEqual(ids.map((id) => getPipelineStageLabel(id, stages)), ["Novo pedido", "Escolhendo modelo", "Pedido confirmado"]);
  assert.equal(stages[0].id, "contato", "must not mutate loaded configuration");
});
test("renamed stages change labels without moving or losing leads; removed legacy populated stages remain visible", () => {
  const renamed = stages.map((stage) => stage.id === "contato" ? { ...stage, label: "Escolhendo tamanho" } : stage);
  assert.equal(getPipelineStageLabel("contato", renamed), "Escolhendo tamanho");
  assert.deepEqual(crmPipelineStageOptions(renamed, ["contato", "captado", "captado"]), ["novo_pedido", "contato", "ganho", "captado"]);
});
test("tenant configurations do not share labels and missing config keeps a usable default", () => {
  assert.equal(getPipelineStageLabel("contato", [{ ...stages[0], label: "Atendimento clinico" }]), "Atendimento clinico");
  assert.equal(getPipelineStageLabel("contato", stages), "Escolhendo modelo");
  assert.ok(crmPipelineStageOptions([], []).includes("captado"));
});
test("desktop/mobile CRM pass saved stages to labels and refresh on return or save", async () => {
  const source = await readFile("app/cliente/painel/crm/page.tsx", "utf8");
  assert.match(source, /resolvePipelineStageLabel\(id, stages\)/);
  assert.match(source, /stages=\{stages\}/);
  assert.match(source, /crmPipelineStageOptions\(stages, leads.map\(normalizeStage\)\)/);
  assert.match(source, /window.addEventListener\("focus", onRefresh\)/);
  assert.match(source, /activePipelineTenant.current !== tenantId/);
});
