import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";
import { isCrmFieldManuallyOwned } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { commitOrderPipelineTransition, processOrderPipelineTransition, protectedStagePatch, type StageTransitionInput } from "@/lib/server/crm/order-stage-transition";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function setLeadPipelineStageWithEffects(input: StageTransitionInput) {
  if (input.orderSource) {
    const result = await commitOrderPipelineTransition({ ...input, orderSource: input.orderSource });
    await processOrderPipelineTransition(result.id, input.tenantId);
    return { ok: true, skipped: result.outcome !== "applied", ...result };
  }
  const tenantId = clean(input.tenantId);
  const leadId = clean(input.leadId);
  const nextStage = normalizePipelineStageId(input.nextStage, "");

  if (!tenantId || !leadId || !nextStage) {
    return { ok: false, skipped: true, reason: "missing_required_fields" };
  }

  const leadRef = adminDb.collection("leads").doc(leadId);
  const mutation = await adminDb.runTransaction(async tx => {
    const snap = await tx.get(leadRef), lead = snap.data();
    if (!lead || lead.tenantId !== tenantId) return { applied: false, previousStage: "", reason: "lead_not_found_or_foreign" };
    const previousStage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
    if (isCrmFieldManuallyOwned(lead, "pipelineStage")) return { applied: false, previousStage, reason: "manual_field_owned" };
    const pipeline = await loadTenantPipelineInTransaction(tx, tenantId);
    if (!pipeline.stages.some(stage => stage.id === nextStage)) return { applied: false, previousStage, reason: "stage_not_in_tenant_pipeline" };
    tx.set(leadRef, { ...protectedStagePatch(input.patch, lead), pipelineStage: nextStage, stage: nextStage,
      ...(previousStage !== nextStage ? { stageUpdatedAt: FieldValue.serverTimestamp() } : {}),
      ...(nextStage === "ganho" && !lead.wonAt ? { wonAt: FieldValue.serverTimestamp() } : {}), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { applied: true, previousStage, reason: "" };
  });
  if (!mutation.applied) return { ok: Boolean(mutation.previousStage), skipped: true, reason: mutation.reason };
  const previousStage = mutation.previousStage;

  if (previousStage !== nextStage) {
    await runPipelineStageSideEffects({
      tenantId,
      leadId,
      previousStage,
      nextStage,
      actorId: input.actorId,
      actorName: input.actorName,
      source: input.source,
      metadata: input.metadata,
      skipConversionDispatch: input.skipConversionDispatch,
    });
    return { ok: true, previousStage, nextStage };
  }

  if (nextStage === "ganho" && !input.skipConversionDispatch) {
    await dispatchLeadConversionEvents({ tenantId, leadId, reason: "sale_won" }).catch((error) => {
      console.error("Falha ao confirmar conversao de venda em etapa ja ganha:", error);
    });
  }

  return { ok: true, skipped: true, previousStage, nextStage };
}
