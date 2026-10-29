import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { AiDigitalTwinSnapshot } from "@/lib/ai-digital-twin";
import { AI_DIGITAL_TWIN_VERSION } from "@/lib/ai-digital-twin";

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function persistAiDigitalTwinRun(input: {
  tenantId: string;
  createdBy: string;
  createdByName?: string | null;
  snapshot: AiDigitalTwinSnapshot;
  comparison: Record<string, unknown> & {
    fingerprint?: unknown;
    status?: unknown;
    candidateFingerprint?: unknown;
    baselineRunId?: unknown;
    candidateRunId?: unknown;
  };
}) {
  const tenantId = clean(input.tenantId, 140);
  const fingerprint = clean(input.comparison.fingerprint, 160);
  if (!tenantId || input.snapshot.tenantId !== tenantId || input.snapshot.schemaVersion !== AI_DIGITAL_TWIN_VERSION || !fingerprint) {
    throw new Error("invalid_digital_twin_scope");
  }
  const ref = adminDb.collection("ai_digital_twin_runs").doc(fingerprint);
  return adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) {
      if (existing.data()?.tenantId !== tenantId) throw new Error("digital_twin_tenant_conflict");
      return { id: ref.id, status: "duplicate" as const };
    }
    transaction.create(ref, {
      tenantId,
      createdBy: clean(input.createdBy, 180),
      createdByName: clean(input.createdByName, 180) || null,
      snapshot: input.snapshot,
      comparison: input.comparison,
      status: clean(input.comparison.status, 40),
      candidateFingerprint: clean(input.comparison.candidateFingerprint, 160) || null,
      baselineRunId: clean(input.comparison.baselineRunId, 160),
      candidateRunId: clean(input.comparison.candidateRunId, 160),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, status: "created" as const };
  });
}
