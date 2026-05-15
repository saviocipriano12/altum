import { runLeadAutomations } from "@/lib/server/automations";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { trackLeadStageOutcome } from "@/lib/server/ai/learning-outcomes";
import { mapPipelineStageToConversionStep, recordLeadConversionStep } from "@/lib/server/conversion-trail";
import { normalizePipelineStageId } from "@/lib/pipeline";

function clean(value: unknown, max = 160) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function conversionDetail(step: string, nextStage: string) {
  if (step === "qualificado") return "Lead qualificado no pipeline.";
  if (step === "proposta") return "Lead avancou para proposta.";
  if (step === "fechamento") return "Lead avancou para fechamento.";
  if (step === "ganho") return "Lead marcado como ganho.";
  return `Lead entrou na etapa ${nextStage}.`;
}

export async function runPipelineStageSideEffects(input: {
  tenantId: string;
  leadId: string;
  previousStage: string;
  nextStage: string;
  actorId?: string | null;
  actorName?: string | null;
  source?: string;
  forced?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const tenantId = clean(input.tenantId, 180);
  const leadId = clean(input.leadId, 180);
  const previousStage = normalizePipelineStageId(input.previousStage || "captado");
  const nextStage = normalizePipelineStageId(input.nextStage || "captado");
  const actorId = clean(input.actorId, 180) || "crm_automation";
  const actorName = clean(input.actorName, 180) || "CRM Automation";
  const source = clean(input.source, 120) || "pipeline_stage_update";

  if (!tenantId || !leadId || !nextStage || previousStage === nextStage) {
    return { ok: true, skipped: true };
  }

  await Promise.all([
    runLeadAutomations({
      tenantId,
      trigger: "lead_stage_changed",
      leadId,
      actorId,
      actorName,
      previousStage,
      nextStage,
    }).catch((error) => {
      console.error("Falha ao rodar automacoes por mudanca de etapa:", error);
    }),
    trackLeadStageOutcome({
      tenantId,
      leadId,
      previousStage,
      nextStage,
    }).catch((error) => {
      console.error("Falha ao registrar aprendizado de etapa:", error);
    }),
  ]);

  if (nextStage === "qualificacao") {
    await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_qualified" }).catch((error) => {
      console.error("Falha ao disparar conversao de lead qualificado:", error);
    });
  }

  if (nextStage === "ganho") {
    await dispatchLeadConversionEvents({ tenantId, leadId, reason: "sale_won" }).catch((error) => {
      console.error("Falha ao disparar conversao de venda:", error);
    });
  }

  const conversionStep = mapPipelineStageToConversionStep(nextStage);
  if (conversionStep) {
    await recordLeadConversionStep({
      tenantId,
      leadId,
      step: conversionStep,
      source,
      actorId,
      actorName,
      detail: conversionDetail(conversionStep, nextStage),
      metadata: {
        previousStage,
        nextStage,
        forced: input.forced === true,
        ...(input.metadata || {}),
      },
    }).catch((error) => {
      console.error("Falha ao registrar trilha de conversao por etapa:", error);
    });
  }

  return { ok: true, previousStage, nextStage };
}

