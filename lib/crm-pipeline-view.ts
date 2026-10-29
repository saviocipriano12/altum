import { getDefaultPipelineStages, normalizePipelineStageId, type PipelineStageDefinition } from "./pipeline";

/** Saved tenant order first; retain legacy populated stages so no lead disappears. */
export function crmPipelineStageOptions(stages: PipelineStageDefinition[], leadStages: string[]) {
  const configured = (stages.length ? stages : getDefaultPipelineStages()).slice().sort((a, b) => a.position - b.position);
  return Array.from(new Set([...configured.map((stage) => stage.id), ...leadStages.map((stage) => normalizePipelineStageId(stage))]));
}
