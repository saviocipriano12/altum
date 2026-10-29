import type { CommercialActivity } from "./crm-activity";

export type ActivityFilters = {
  status: "pending" | "done" | "canceled" | "suggested" | "all";
  owner: "mine" | "all";
  due: "all" | "overdue" | "today" | "undated";
  q: string;
  timeZone: string;
};
export class ActivityFilterError extends Error {}
const statuses = ["pending", "done", "canceled", "suggested", "all"];
const dates = ["all", "overdue", "today", "undated"];
export function parseActivityFilters(params: URLSearchParams): ActivityFilters {
  const status = params.get("status") || "all", owner = params.get("owner") || "all", due = params.get("due") || "all";
  const q = (params.get("q") || "").trim(), timeZone = params.get("timeZone") || "America/Sao_Paulo";
  if (!statuses.includes(status) || !["mine", "all"].includes(owner) || !dates.includes(due) || q.length > 120 || timeZone.length > 100)
    throw new ActivityFilterError("Filtros de retornos inválidos.");
  try { new Intl.DateTimeFormat("en-CA", { timeZone }).format(0); }
  catch { throw new ActivityFilterError("Fuso horário inválido."); }
  return { status, owner, due, q, timeZone } as ActivityFilters;
}
const normalized = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
export function filterCommercialActivities(items: CommercialActivity[], filters: ActivityFilters, userId: string, now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: filters.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const today = day.format(now), term = normalized(filters.q);
  return items.filter(item => {
    if (filters.status !== "all" && item.status !== filters.status || filters.owner === "mine" && item.ownerUserId !== userId) return false;
    if (term && !normalized([item.title, item.leadName, item.ownerName, item.type].filter(Boolean).join(" ")).includes(term)) return false;
    if (filters.due === "undated") return !item.dueAt;
    if (filters.due === "all") return true;
    if (item.status !== "pending" || !item.dueAt) return false;
    const date = new Date(item.dueAt);
    if (!Number.isFinite(date.getTime())) return false;
    return filters.due === "overdue" ? date.getTime() < now.getTime() : day.format(date) === today;
  });
}
/** Save only view choices; search text and customer data stay out of preferences. */
export function activityViewPreference(value: string | null): Pick<ActivityFilters, "status" | "owner" | "due"> {
  const fallback = { status: "pending", owner: "all", due: "all" } as const;
  try {
    const row = JSON.parse(value || "null");
    if (!row || !statuses.includes(row.status) || row.status === "suggested" || !["mine", "all"].includes(row.owner) || !dates.includes(row.due)) return fallback;
    return { status: row.status, owner: row.owner, due: row.due };
  } catch { return fallback; }
}
