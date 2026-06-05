import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { runPipelineStageSideEffects } from "@/lib/server/crm/stage-effects";
import { dispatchLeadConversionEvents } from "@/lib/server/pixels/conversions";

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function setLeadPipelineStageWithEffects(input: {
  tenantId: string;
  leadId: string;
  nextStage: string;
  actorId?: string | null;
  actorName?: string | null;
  source?: string;
  metadata?: Record<string, unknown>;
  patch?: Record<string, unknown>;
}) {
  const tenantId = clean(input.tenantId);
  const leadId = clean(input.leadId);
  const nextStage = normalizePipelineStageId(input.nextStage || "captado");

  if (!tenantId || !leadId || !nextStage) {
    return { ok: false, skipped: true, reason: "missing_required_fields" };
  }

  const leadRef = adminDb.collection("leads").doc(leadId);
  const snap = await leadRef.get();
  if (!snap.exists) {
    return { ok: false, skipped: true, reason: "lead_not_found" };
  }

  const lead = snap.data() as Record<string, unknown>;
  if (clean(lead.tenantId, 180) !== tenantId) {
    return { ok: false, skipped: true, reason: "tenant_mismatch" };
  }

  const previousStage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
  const stagePatch: Record<string, unknown> = {
    ...(input.patch || {}),
    pipelineStage: nextStage,
    stage: nextStage,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (nextStage === "ganho" && !lead.wonAt) {
    stagePatch.wonAt = FieldValue.serverTimestamp();
  }

  await leadRef.set(stagePatch, { merge: true });

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
    });
    return { ok: true, previousStage, nextStage };
  }

  if (nextStage === "ganho") {
    await dispatchLeadConversionEvents({ tenantId, leadId, reason: "sale_won" }).catch((error) => {
      console.error("Falha ao confirmar conversao de venda em etapa ja ganha:", error);
    });
  }

  return { ok: true, skipped: true, previousStage, nextStage };
}
