import { createHash } from "node:crypto";
import { getApps } from "firebase-admin/app";
import { DocumentReference, FieldPath, FieldValue, GeoPoint, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { commercialTaskIndex, commercialTaskIndexMatches, type CommercialTaskIndex } from "@/lib/crm-task-index";
import { isExactCrmRecordId } from "@/lib/crm-observation-identity";
import { observationSnapshotVersion } from "./observation-receipt-identity";

export type TaskIndexPlanEntry = {
  taskId: string; generation: string; revision: string; sourceFingerprint: string;
  action: "update" | "unchanged" | "review"; index: CommercialTaskIndex; reviewReason?: string | null;
};
function canonical(value: unknown): unknown {
  if (value instanceof Date) return ["date", value.toISOString()];
  if (value instanceof Timestamp) return ["timestamp", value.seconds, value.nanoseconds];
  if (value instanceof GeoPoint) return ["geopoint", value.latitude, value.longitude];
  if (value instanceof DocumentReference) {
    if (!value.isEqual(adminDb.doc(value.path))) throw new Error("CRM_TASK_INDEX_FOREIGN_REFERENCE_REVIEW");
    return ["reference", getApps()[0]?.options.projectId, value.path];
  }
  if (Buffer.isBuffer(value)) return ["bytes", value.toString("base64")];
  if (Array.isArray(value)) return ["array", value.map(canonical)];
  if (value && typeof value === "object") return ["object", Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])])];
  return [typeof value, String(value)];
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
/** Excludes only the derived index. No names/messages enter migration output. */
export function taskIndexSourceFingerprint(row: Record<string, unknown>) {
  return digest(Object.fromEntries(Object.entries(row).filter(([key]) => key !== "crmTaskIndex")));
}
function assertLab(tenantId: string) {
  if (!isExactCrmRecordId(tenantId) || !tenantId.startsWith("qa_") || !getApps()[0]?.options.projectId?.startsWith("demo-") ||
      !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw new Error("CRM_TASK_INDEX_LOCAL_LAB_ONLY");
}
export async function previewTaskIndexPage(input: { tenantId: string; cursor?: string; limit?: number }) {
  assertLab(input.tenantId);
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 || input.cursor !== undefined && !isExactCrmRecordId(input.cursor, 300)) throw new Error("CRM_TASK_INDEX_INVALID_PAGE");
  const query = adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).orderBy(FieldPath.documentId());
  const page = await (input.cursor ? query.startAfter(input.cursor) : query).limit(limit + 1).get();
  const entries: TaskIndexPlanEntry[] = page.docs.slice(0, limit).map(snapshot => {
    const row = snapshot.data(), index = commercialTaskIndex(row);
    let sourceFingerprint = "", reviewReason: string | null = index.issue;
    try { sourceFingerprint = taskIndexSourceFingerprint(row); } catch { reviewReason = "unsupported_legacy_value"; }
    return { taskId: snapshot.id, generation: observationSnapshotVersion(snapshot.createTime), revision: observationSnapshotVersion(snapshot.updateTime),
      sourceFingerprint, index, reviewReason,
      action: reviewReason ? "review" : commercialTaskIndexMatches(row, index) ? "unchanged" : "update" };
  });
  return { tenantId: input.tenantId, entries, startCursor: input.cursor || null, nextCursor: page.size > limit ? entries.at(-1)!.taskId : null,
    reachedEnd: page.size <= limit, coverageComplete: !input.cursor && page.size <= limit, meaning: "one_preview_page_not_global_readiness" as const };
}
export async function applyTaskIndexEntry(tenantId: string, entry: TaskIndexPlanEntry) {
  assertLab(tenantId);
  if (!isExactCrmRecordId(entry.taskId, 300) || entry.action !== "update" || entry.index?.issue !== null) throw new Error("CRM_TASK_INDEX_ENTRY_REQUIRES_REVIEW");
  const ref = adminDb.collection("lead_tasks").doc(entry.taskId);
  const auditId = `crm_task_index_${digest([tenantId, entry.taskId, entry.generation, entry.revision])}`;
  const auditRef = adminDb.collection("audit_logs").doc(auditId);
  return adminDb.runTransaction(async tx => {
    const [snapshot, audit] = await Promise.all([tx.get(ref), tx.get(auditRef)]), row = snapshot.data();
    if (audit.exists) {
      if (audit.data()?.tenantId !== tenantId || audit.data()?.action !== "crm_task_index_backfill" || audit.data()?.status !== "applied" ||
          audit.data()?.sourceFingerprint !== entry.sourceFingerprint) throw new Error("CRM_TASK_INDEX_OCCURRENCE_CONFLICT");
      return { auditId, applied: false };
    }
    if (!row || row.tenantId !== tenantId || observationSnapshotVersion(snapshot.createTime) !== entry.generation ||
        observationSnapshotVersion(snapshot.updateTime) !== entry.revision || taskIndexSourceFingerprint(row) !== entry.sourceFingerprint ||
        digest(commercialTaskIndex(row)) !== digest(entry.index)) throw new Error("CRM_TASK_INDEX_SOURCE_CHANGED");
    tx.update(ref, { crmTaskIndex: commercialTaskIndex(row) });
    tx.create(auditRef, { tenantId, action: "crm_task_index_backfill", targetType: "lead_task", targetId: entry.taskId, status: "applied",
      taskGeneration: entry.generation, sourceRevision: entry.revision, sourceFingerprint: entry.sourceFingerprint,
      hadIndex: Object.hasOwn(row, "crmTaskIndex"), beforeIndex: row.crmTaskIndex ?? null, afterIndex: entry.index,
      actorId: "local_qa_migration", createdAt: FieldValue.serverTimestamp() });
    return { auditId, applied: true };
  });
}
export async function rollbackTaskIndexEntry(tenantId: string, auditId: string) {
  assertLab(tenantId);
  if (!isExactCrmRecordId(auditId)) throw new Error("CRM_TASK_INDEX_INVALID_AUDIT");
  const auditRef = adminDb.collection("audit_logs").doc(auditId);
  return adminDb.runTransaction(async tx => {
    const audit = await tx.get(auditRef), saved = audit.data();
    if (!saved || saved.tenantId !== tenantId || saved.action !== "crm_task_index_backfill" || !isExactCrmRecordId(saved.targetId, 300)) throw new Error("CRM_TASK_INDEX_INVALID_AUDIT");
    if (saved.status === "rolled_back") return { rolledBack: false };
    if (saved.status !== "applied") throw new Error("CRM_TASK_INDEX_OCCURRENCE_CONFLICT");
    const ref = adminDb.collection("lead_tasks").doc(saved.targetId), snapshot = await tx.get(ref), row = snapshot.data();
    if (!row || row.tenantId !== tenantId || observationSnapshotVersion(snapshot.createTime) !== saved.taskGeneration ||
        taskIndexSourceFingerprint(row) !== saved.sourceFingerprint || digest(row.crmTaskIndex) !== digest(saved.afterIndex)) throw new Error("CRM_TASK_INDEX_ROLLBACK_CONFLICT");
    tx.update(ref, { crmTaskIndex: saved.hadIndex ? saved.beforeIndex : FieldValue.delete() });
    tx.update(auditRef, { status: "rolled_back", rolledBackAt: FieldValue.serverTimestamp() });
    return { rolledBack: true };
  });
}
