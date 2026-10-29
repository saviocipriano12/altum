import { FieldPath } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { canAccessAssignedCommercialRecord, assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import type { TenantMembership } from "@/lib/server/tenant";
import { normalizeCommercialActivity } from "@/lib/crm-activity";
import { commercialTaskIndex, commercialTaskIndexMatches } from "@/lib/crm-task-index";
import { filterCommercialActivities, type ActivityFilters } from "@/lib/crm-activity-filter";
import { ActivityPageError, assertActivityPageKey, decodeActivityPageCursor, encodeActivityPageCursor } from "./activity-page-cursor";
import { commercialActivityQueryScope } from "./activity-query-scope";

export const ACTIVITY_PAGE_SCAN_LIMIT = 200;
const validId = (value: string) => !!value && value === value.trim() && value.length <= 180 && !value.includes("/");
export async function commercialTaskPagingAvailable(tenantId: string) {
  const control = (await adminDb.collection("tenant_entitlements").doc(tenantId).get()).data();
  if (control?.taskIndexReadProtocol !== 1) return false;
  if (control.taskIndexWriteProtocol !== 1 || typeof control.taskIndexCoverageRevision !== "string" || !control.taskIndexCoverageRevision || control.taskIndexCoverageRevision.length > 100)
    throw new ActivityPageError(409, "activity_index_not_ready", "A consulta de retornos precisa de revisão antes de continuar.");
  assertActivityPageKey(); return true;
}
/** Explicit opt-in reader. Never infer rollout readiness from a preview or new-task coverage. */
export async function readCommercialTaskPage(input: {
  tenantId: string; userId: string; membership: TenantMembership; filters: ActivityFilters;
  leadId?: string; pageSize: number; cursor?: string;
}) {
  if (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50 ||
    input.leadId !== undefined && !validId(input.leadId)) throw new ActivityPageError(400, "invalid_activity_page", "Página de retornos inválida.");
  assertActivityPageKey();
  const control = (await adminDb.collection("tenant_entitlements").doc(input.tenantId).get()).data();
  const revision = control?.taskIndexCoverageRevision;
  if (control?.taskIndexReadProtocol !== 1 || control?.taskIndexWriteProtocol !== 1 ||
    typeof revision !== "string" || !revision || revision.length > 100)
    throw new ActivityPageError(409, "activity_index_not_ready", "Esta carteira ainda usa a consulta compatível de retornos.");
  const scope = commercialActivityQueryScope({ ...input, coverageRevision: revision });
  const now = Date.now(), previous = input.cursor ? decodeActivityPageCursor(input.cursor, scope, now) : null;
  const startedAt = previous?.startedAt ?? now, expiresAt = previous?.expiresAt ?? now + 600000;
  if (input.leadId) {
    const parent = (await adminDb.collection("leads").doc(input.leadId).get()).data();
    if (!parent || parent.tenantId !== input.tenantId) throw new ActivityPageError(404, "lead_not_found", "Oportunidade não encontrada.");
    assertAssignedCommercialRecordAccess(input.membership, input.userId, parent);
  }
  // Include indexed review cases. Filtering issue == null would silently hide them.
  let query: FirebaseFirestore.Query = adminDb.collection("lead_tasks").where("tenantId", "==", input.tenantId).where("crmTaskIndex.version", "==", 1);
  if (input.leadId) query = query.where("leadId", "==", input.leadId);
  query = query.orderBy("crmTaskIndex.openRank").orderBy("crmTaskIndex.dueOrder").orderBy(FieldPath.documentId());
  if (previous) query = query.startAfter(...previous.after);
  const page = await query.limit(ACTIVITY_PAGE_SCAN_LIMIT + 1).get();
  const candidates = page.docs.slice(0, ACTIVITY_PAGE_SCAN_LIMIT);
  const leadIds = [...new Set(candidates.map(doc => String(doc.data().leadId || "")).filter(validId))];
  const parents = leadIds.length ? await adminDb.getAll(...leadIds.map(id => adminDb.collection("leads").doc(id))) : [];
  const leads = new Map(parents.filter(doc => doc.exists && doc.data()?.tenantId === input.tenantId &&
    canAccessAssignedCommercialRecord(input.membership, input.userId, doc.data()!)).map(doc => [doc.id, doc.data()!]));
  const items = [], reviewItems = [];
  let consumed = 0, last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (const snapshot of candidates) {
    consumed++; last = snapshot;
    const row = snapshot.data(), parent = leads.get(String(row.leadId || ""));
    if (!parent) continue;
    const index = commercialTaskIndex(row);
    if (index.issue || !commercialTaskIndexMatches(row, index)) {
      reviewItems.push({ recordId: snapshot.id, leadId: String(row.leadId), title: typeof row.title === "string" ? row.title : "Retorno comercial",
        issue: index.issue || "inconsistent_index", revision: `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` });
      if (reviewItems.length + items.length >= input.pageSize) break;
      continue;
    }
    const activity = { ...normalizeCommercialActivity("task", snapshot.id, { ...row, leadName: parent.nome || parent.empresa || null }, parent), revision: `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` };
    if (filterCommercialActivities([activity], input.filters, input.userId, new Date(startedAt)).length) items.push(activity);
    if (reviewItems.length + items.length >= input.pageSize) break;
  }
  const hasMore = consumed < page.size;
  const reviewSeen = Boolean(previous?.reviewSeen || reviewItems.length);
  if (hasMore && last && (![0, 1].includes(last.data().crmTaskIndex.openRank) || !Number.isSafeInteger(last.data().crmTaskIndex.dueOrder)))
    throw new ActivityPageError(409, "activity_order_requires_review", "A ordenação dos retornos precisa de revisão antes de continuar.");
  const nextCursor = hasMore && last ? encodeActivityPageCursor({ version: 1, scope, startedAt, expiresAt, reviewSeen,
    after: [last.data().crmTaskIndex.openRank, last.data().crmTaskIndex.dueOrder, last.id] }) : null;
  const contextIds = [...new Set([...items.map(row => row.leadId!), ...reviewItems.map(row => row.leadId)])];
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const contextLeads = contextIds.map(id => {
    const row = leads.get(id)!;
    return { id, nome: text(row.nome), empresa: text(row.empresa), opportunityTitle: text(row.opportunityTitle || row.title),
      ownerId: text(row.assignedTo || row.ownerId || row.ownerUserId || row.assignedUserId || row.responsavelId), owner: text(row.owner) };
  });
  return { contractVersion: 2, source: "task", queryScope: scope, items, reviewItems, nextCursor, hasMore,
    leads: contextLeads, leadsCoverage: "page",
    coverage: hasMore ? "partial" : reviewSeen ? "review_required" : "end_reached",
    coverageMeaning: "query_end_not_snapshot_or_global_index_audit",
    consistency: "live_keyset", refreshBefore: new Date(expiresAt).toISOString(),
    // Diagnostic counts are bounded reads, never a total of accessible business records.
    pageWork: { taskDocumentsRead: page.size, leadDocumentsRead: parents.length, taskDocumentsConsumed: consumed },
  };
}
