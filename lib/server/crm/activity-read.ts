import { adminDb } from "@/app/lib/server/firebase-admin";
import { readQueryPages } from "@/lib/server/query-pages";
import { canAccessAssignedCommercialRecord, assertAssignedCommercialRecordAccess } from "@/lib/server/commercial-access";
import { TenantAccessError, type TenantMembership } from "@/lib/server/tenant";
import { normalizeCommercialActivity, selectNextCommercialActivity, type CommercialActivity } from "@/lib/crm-activity";
import { TaskMutationError } from "@/lib/server/crm/activity-mutation";
import { filterCommercialActivities, type ActivityFilters } from "@/lib/crm-activity-filter";

export async function readCommercialActivities(input: { tenantId: string; userId: string; membership: TenantMembership; leadId?: string; source?: CommercialActivity["source"]; filters?: ActivityFilters }) {
  const leads = new Map<string, FirebaseFirestore.DocumentData>();
  if (input.leadId) {
    if (input.leadId.includes("/") || input.leadId.length > 180) throw new TaskMutationError(400, "invalid_lead_id", "Oportunidade invalida.");
    const row = (await adminDb.collection("leads").doc(input.leadId).get()).data();
    if (!row) throw new TaskMutationError(404, "lead_not_found", "Oportunidade nao encontrada.");
    if (row.tenantId !== input.tenantId) throw new TenantAccessError("lead_tenant_mismatch", "Oportunidade fora desta empresa.");
    assertAssignedCommercialRecordAccess(input.membership, input.userId, row); leads.set(input.leadId, row);
  } else {
    const rows = await readQueryPages(adminDb.collection("leads").where("tenantId", "==", input.tenantId));
    for (const doc of rows.docs) if (canAccessAssignedCommercialRecord(input.membership, input.userId, doc.data())) leads.set(doc.id, doc.data());
  }
  const sourceQuery = (collection: string) => {
    let query = adminDb.collection(collection).where("tenantId", "==", input.tenantId);
    if (input.leadId) query = query.where("leadId", "==", input.leadId);
    return readQueryPages(query);
  };
  const [tasks, appointments] = await Promise.all([
    input.source === "appointment" ? Promise.resolve({ docs: [] }) : sourceQuery("lead_tasks"),
    input.source === "task" ? Promise.resolve({ docs: [] }) : sourceQuery("appointments"),
  ]);
  const items: CommercialActivity[] = [];
  for (const doc of tasks.docs) {
    const row = doc.data(), lead = leads.get(String(row.leadId || ""));
    if (lead) items.push({ ...normalizeCommercialActivity("task", doc.id, row, lead), revision: `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}` });
  }
  for (const doc of appointments.docs) {
    const row = doc.data(), lead = leads.get(String(row.leadId || ""));
    if ((!row.leadId || lead) && canAccessAssignedCommercialRecord(input.membership, input.userId, row)) items.push({ ...normalizeCommercialActivity("appointment", doc.id, row, lead), revision: `${doc.updateTime.seconds}:${doc.updateTime.nanoseconds}` });
  }
  items.sort((a,b) => Number(a.status !== "pending") - Number(b.status !== "pending") || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.id.localeCompare(b.id));
  const text = (value: unknown) => typeof value === "string" ? value : "";
  const options = [...leads].map(([id, row]) => ({ id, nome: text(row.nome), empresa: text(row.empresa), opportunityTitle: text(row.opportunityTitle || row.title),
    ownerId: text(row.assignedTo || row.ownerId || row.ownerUserId || row.assignedUserId || row.responsavelId), owner: text(row.owner) }));
  const filtered = input.filters ? filterCommercialActivities(items, input.filters, input.userId) : items;
  return { items: filtered, leads: options, nextActivity: selectNextCommercialActivity(filtered), coverage: "complete", contractVersion: 1 };
}
