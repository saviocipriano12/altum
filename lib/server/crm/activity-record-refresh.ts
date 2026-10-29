import { adminDb } from "@/app/lib/server/firebase-admin";
import { canAccessAssignedCommercialRecord } from "@/lib/server/commercial-access";
import type { TenantMembership } from "@/lib/server/tenant";
import { normalizeCommercialActivity } from "@/lib/crm-activity";
import { commercialTaskIndex, commercialTaskIndexMatches } from "@/lib/crm-task-index";
import { isExactCrmRecordId } from "@/lib/crm-observation-identity";
import { filterCommercialActivities, type ActivityFilters } from "@/lib/crm-activity-filter";
import { ActivityPageError, assertActivityPageKey } from "./activity-page-cursor";
import { commercialActivityQueryScope } from "./activity-query-scope";

/** Current records only: this is not discovery of arrivals or a source of authorization. */
export async function refreshCommercialTaskRecords(input: { tenantId: string; userId: string; membership: TenantMembership;
  filters: ActivityFilters; pageSize: number; expectedScope: unknown; recordIds: unknown }) {
  if (!Array.isArray(input.recordIds) || input.recordIds.length > 100 || !input.recordIds.every(id => isExactCrmRecordId(id, 300)) ||
    typeof input.expectedScope !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedScope) ||
    !Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 50)
    throw new ActivityPageError(400, "invalid_activity_refresh", "Consulta de atualização inválida.");
  const ids = [...new Set(input.recordIds as string[])];
  const control = (await adminDb.collection("tenant_entitlements").doc(input.tenantId).get()).data();
  const revision = control?.taskIndexCoverageRevision;
  if (control?.taskIndexReadProtocol !== 1 || control?.taskIndexWriteProtocol !== 1 || typeof revision !== "string" || !revision || revision.length > 100)
    throw new ActivityPageError(409, "activity_index_not_ready", "Atualize a lista de retornos antes de continuar.");
  assertActivityPageKey();
  const scope = commercialActivityQueryScope({ ...input, coverageRevision: revision });
  if (scope !== input.expectedScope) throw new ActivityPageError(409, "activity_query_changed", "A consulta ou seu acesso mudou. Atualize os retornos para conferir.");
  const snapshots = ids.length ? await adminDb.getAll(...ids.map(id => adminDb.collection("lead_tasks").doc(id))) : [];
  const current = snapshots.filter(doc => doc.exists && doc.data()?.tenantId === input.tenantId);
  const parentIds = [...new Set(current.map(doc => doc.data()!.leadId).filter(id => isExactCrmRecordId(id, 180)))];
  const parents = parentIds.length ? await adminDb.getAll(...parentIds.map(id => adminDb.collection("leads").doc(id))) : [];
  const leads = new Map(parents.filter(doc => doc.exists && doc.data()?.tenantId === input.tenantId &&
    canAccessAssignedCommercialRecord(input.membership, input.userId, doc.data()!)).map(doc => [doc.id, doc.data()!]));
  const items = [], reviewItems = [], retained = new Set<string>(), now = new Date();
  for (const snapshot of current) {
    const row = snapshot.data()!, parent = leads.get(String(row.leadId || "")); if (!parent) continue;
    const index = commercialTaskIndex(row), recordRevision = `${snapshot.updateTime!.seconds}:${snapshot.updateTime!.nanoseconds}`;
    if (index.issue || !commercialTaskIndexMatches(row, index)) {
      retained.add(snapshot.id); reviewItems.push({ recordId: snapshot.id, leadId: String(row.leadId),
        title: typeof row.title === "string" ? row.title : "Retorno comercial", issue: index.issue || "inconsistent_index", revision: recordRevision });
      continue;
    }
    const activity = { ...normalizeCommercialActivity("task", snapshot.id, { ...row, leadName: parent.nome || parent.empresa || null }, parent), revision: recordRevision };
    if (filterCommercialActivities([activity], input.filters, input.userId, now).length) { items.push(activity); retained.add(snapshot.id); }
  }
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const contextIds = [...new Set([...items.map(row => row.leadId!), ...reviewItems.map(row => row.leadId)])];
  const contextLeads = contextIds.map(id => { const row = leads.get(id)!; return { id, nome: text(row.nome), empresa: text(row.empresa),
    opportunityTitle: text(row.opportunityTitle || row.title), ownerId: text(row.assignedTo || row.ownerId || row.ownerUserId || row.assignedUserId || row.responsavelId), owner: text(row.owner) }; });
  return { contractVersion: 1, queryScope: scope, items, reviewItems, removedIds: ids.filter(id => !retained.has(id)),
    leads: contextLeads, leadsCoverage: "requested", checkedAt: new Date().toISOString(),
    readWork: { taskDocumentsRead: snapshots.length, leadDocumentsRead: parents.length } };
}
