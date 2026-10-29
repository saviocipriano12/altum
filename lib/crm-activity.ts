export type CommercialActivity = {
  id: string; source: "task" | "appointment"; recordId: string; leadId: string | null; contactId: string | null;
  title: string; type: string; ownerUserId: string | null; ownerName: string | null; dueAt: string | null;
  status: "pending" | "done" | "canceled" | "suggested"; rawStatus: string; version: number;
  leadName: string | null; origin: "manual" | "ai" | "legacy";
  revision?: string;
};
export function activityDateIso(value: unknown): string | null {
  if (value == null || value === "") return null;
  let date: Date;
  if (value instanceof Date) date = value;
  else if (typeof value === "object" && "toDate" in value && typeof value.toDate === "function") date = value.toDate();
  else if (typeof value === "object" && ("_seconds" in value || "seconds" in value)) date = new Date(Number("_seconds" in value ? value._seconds : value.seconds) * 1000);
  else if (typeof value === "number") date = new Date(value < 1e12 ? value * 1000 : value);
  else if (typeof value === "string") date = new Date(value);
  else return null;
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function text(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
export function commercialActivityStatus(rawStatus: string): CommercialActivity["status"] {
  return ["done", "completed"].includes(rawStatus) ? "done" : ["canceled", "cancelled", "no_show"].includes(rawStatus) ? "canceled" : rawStatus === "draft" ? "suggested" : "pending";
}
export function normalizeCommercialActivity(source: CommercialActivity["source"], id: string, row: Record<string, unknown>, lead?: Record<string, unknown>): CommercialActivity {
  const rawStatus = String(row.status || (source === "task" ? "pending" : "scheduled"));
  return { id: `${source}:${id}`, recordId: id, source, leadId: text(row.leadId), contactId: text(row.contactId || lead?.contactId),
    title: text(row.title) || (source === "task" ? "Retorno comercial" : "Compromisso"), type: text(row.type) || (source === "task" ? "follow_up" : "reuniao"),
    ownerUserId: text(row.ownerUserId || row.assignedTo || row.ownerId || row.assignedUserId || row.responsavelId || lead?.assignedTo || lead?.ownerId || lead?.ownerUserId || lead?.assignedUserId || lead?.responsavelId),
    ownerName: text(row.ownerName || lead?.owner), dueAt: activityDateIso(source === "task" ? row.dueAt : row.startAt),
    status: commercialActivityStatus(rawStatus),
    rawStatus, version: Number(row.version || 0), leadName: text(row.leadName || lead?.nome || lead?.empresa),
    origin: row.source === "manual" ? "manual" : ["ai", "agent"].includes(String(row.source)) ? "ai" : "legacy" };
}
export function selectNextCommercialActivity(items: CommercialActivity[]) {
  return items.filter(item => item.status === "pending").sort((a,b) => {
    const rank = { manual: 0, legacy: 1, ai: 2 };
    return rank[a.origin] - rank[b.origin] || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.id.localeCompare(b.id);
  })[0] || null;
}
