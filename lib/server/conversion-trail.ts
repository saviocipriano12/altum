import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";

export type LeadConversionStep =
  | "captado"
  | "qualificado"
  | "handoff"
  | "proposta"
  | "fechamento"
  | "ganho";

type RecordLeadConversionStepInput = {
  tenantId: string;
  leadId: string;
  step: LeadConversionStep;
  source: string;
  actorId?: string;
  actorName?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function sanitizeDocId(value: string, max = 220) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, max) || `conv_${Date.now()}`;
}

export function mapPipelineStageToConversionStep(stage: unknown): LeadConversionStep | null {
  const normalized = normalizePipelineStageId(stage || "captado");
  if (normalized === "qualificacao") return "qualificado";
  if (normalized === "proposta") return "proposta";
  if (normalized === "fechamento") return "fechamento";
  if (normalized === "ganho") return "ganho";
  return null;
}

export async function recordLeadConversionStep(input: RecordLeadConversionStepInput) {
  const tenantId = clean(input.tenantId, 140);
  const leadId = clean(input.leadId, 180);
  const step = clean(input.step, 40).toLowerCase() as LeadConversionStep;

  if (!tenantId || !leadId || !step) return { recorded: false, firstOccurrence: false };

  const source = clean(input.source, 80) || "unknown";
  const actorId = clean(input.actorId, 140);
  const actorName = clean(input.actorName, 140);
  const detail = clean(input.detail, 320);
  const metadata =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? input.metadata
      : {};

  const docId = sanitizeDocId(`trail_${tenantId}_${leadId}_${step}`);
  const trailRef = adminDb.collection("lead_conversion_trails").doc(docId);
  const leadEventRef = adminDb.collection("leads").doc(leadId).collection("events").doc();

  const txResult = await adminDb.runTransaction(async (tx) => {
    const trailSnap = await tx.get(trailRef);
    const firstOccurrence = !trailSnap.exists;
    const previousOccurrences = trailSnap.exists
      ? Math.max(0, Number((trailSnap.data() as Record<string, unknown>).occurrences || 0))
      : 0;

    tx.set(
      trailRef,
      {
        tenantId,
        leadId,
        step,
        source,
        actorId: actorId || null,
        actorName: actorName || null,
        detail: detail || null,
        metadata,
        occurrences: previousOccurrences + 1,
        firstAt: trailSnap.exists ? (trailSnap.data() as Record<string, unknown>).firstAt : FieldValue.serverTimestamp(),
        lastAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: trailSnap.exists ? (trailSnap.data() as Record<string, unknown>).createdAt : FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (firstOccurrence) {
      tx.set(leadEventRef, {
        type: "conversion_step",
        title: `Conversao registrada: ${step}`,
        detail: detail || `Lead atingiu etapa ${step}.`,
        step,
        source,
        actorId: actorId || null,
        actorName: actorName || null,
        metadata,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return { firstOccurrence };
  });

  return { recorded: true, firstOccurrence: txResult.firstOccurrence };
}
