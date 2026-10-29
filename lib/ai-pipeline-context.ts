import type { PipelineStageDefinition } from "@/lib/pipeline";

const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
export function isAutomaticPipelineStage(stage: PipelineStageDefinition) {
  return !stage.isTerminal && !/\b(ganh[oa]|perdid[oa]|cancelad[oa]|venda concluida|sem resposta)\b/.test(fold(stage.label));
}

export function buildAiPipelineContext(stages: PipelineStageDefinition[]) {
  if (!stages.length) return "";
  return ["Funil atual da empresa (ordem, identificador, nome e significado):",
    JSON.stringify(stages.map((stage) => ({ id: stage.id, nome: stage.label, significado: stage.description, terminal: !isAutomaticPipelineStage(stage) }))),
    "Use estas etapas e seus significados, nunca um funil padrao. Identifique a etapa pela evidencia da conversa, nao pela posicao da coluna. Nao avance automaticamente apenas porque chegou uma mensagem.",
    "Quando houver evidencia clara, proponha pipelineStage: {id:'identificador exato', evidence:'trecho literal do cliente', confidence:0.9}. Nao proponha etapas terminais, venda ganha/perdida ou sem resposta. Em duvida, omita. A plataforma valida e aplica apenas as mudancas autorizadas. Nao exponha esse controle interno ao cliente.",
  ].join("\n");
}

export function resolveAiPipelineProposal(proposal: unknown, stages: PipelineStageDefinition[], inboundText: string) {
  if (!proposal || typeof proposal !== "object") return null;
  const data = proposal as Record<string, unknown>;
  const stage = stages.find((item) => item.id === data.id);
  const evidence = typeof data.evidence === "string" ? fold(data.evidence).slice(0, 600) : "";
  return stage && isAutomaticPipelineStage(stage) && typeof data.confidence === "number" && data.confidence >= 0.85 && data.confidence <= 1 && evidence.length >= 5 && fold(inboundText).includes(evidence) ? stage.id : null;
}
