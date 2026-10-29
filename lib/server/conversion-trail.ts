import { FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import type { StageAutomationSource } from "@/lib/server/automation-stage-delivery";
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
  stageSource?: StageAutomationSource;
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
  const receiptId = input.stageSource ? `stage_trail_${createHash("sha256").update(JSON.stringify([tenantId, leadId, input.stageSource.kind, input.stageSource.id])).digest("hex")}` : null;
  const leadEvents = adminDb.collection("leads").doc(leadId).collection("events");
  const leadEventRef = receiptId ? leadEvents.doc(receiptId) : leadEvents.doc();

  const txResult = await adminDb.runTransaction(async (tx) => {
    const parent = input.stageSource ? await (await import("@/lib/server/automation-stage-delivery")).assertStageHookSource(tx, { tenantId, leadId, source: input.stageSource }) : null;
    const signature = createHash("sha256").update(JSON.stringify([tenantId, leadId, step, source, actorId, actorName, detail])).digest("hex");
    const audit = parent ? await tx.get(leadEventRef) : null;
    if (parent?.data()?.stageConversionTrailReceipt) {
      const receipt = parent.data()!.stageConversionTrailReceipt;
      if (receipt.version !== 1 || receipt.signature !== signature || !audit?.exists || audit.data()?.tenantId !== tenantId || audit.data()?.stageOccurrenceId !== input.stageSource!.id || audit.data()?.stageTrailSignature !== signature) throw new Error("CRM_STAGE_TRAIL_RECEIPT_CHANGED");
      return { firstOccurrence: false };
    }
    if (audit?.exists) throw new Error("CRM_STAGE_TRAIL_RECEIPT_MISSING");
    const trailSnap = await tx.get(trailRef);
    if (trailSnap.exists && (trailSnap.data()?.tenantId !== tenantId || trailSnap.data()?.leadId !== leadId || trailSnap.data()?.step !== step)) throw new Error("CRM_STAGE_TRAIL_SCOPE_CHANGED");
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

    if (firstOccurrence || parent) {
      tx.set(leadEventRef, {
        ...(parent ? { tenantId, stageOccurrenceId: input.stageSource!.id, stageTrailSignature: signature } : {}),
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

    if (parent) tx.update(parent.ref, { stageConversionTrailReceipt: { version: 1, signature, step, createdAt: FieldValue.serverTimestamp() } });
    return { firstOccurrence };
  });

  return { recorded: true, firstOccurrence: txResult.firstOccurrence };
}
