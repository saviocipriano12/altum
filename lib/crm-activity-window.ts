import type { CommercialActivity } from "./crm-activity";

export type ActivityLeadOption = { id: string; nome?: string; empresa?: string; opportunityTitle?: string; ownerId?: string; owner?: string };
export type ActivityReviewItem = { recordId: string; leadId: string; title: string; issue: string; revision: string };
export type ActivityFeedPage = { contractVersion?: number; items?: CommercialActivity[]; leads?: ActivityLeadOption[];
  reviewItems?: ActivityReviewItem[]; nextCursor?: string | null; coverage?: string; queryScope?: string; canEdit?: boolean; error?: string; code?: string };
export type ActivityWindow = { items: CommercialActivity[]; leads: ActivityLeadOption[]; reviewItems: ActivityReviewItem[];
  paged: boolean; pages: number; nextCursor: string | null; canEdit: boolean; coverage: string; queryScope?: string; confirmedIds?: string[] };
export type ActivityRecordRefresh = { queryScope: string; items: CommercialActivity[]; reviewItems: ActivityReviewItem[];
  removedIds: string[]; leads: ActivityLeadOption[]; canEdit: boolean; error?: string; code?: string };
const encoder = new TextEncoder();
function orderedActivities(items: CommercialActivity[]) {
  return items.sort((a, b) => {
    const rank = Number(a.status !== "pending") - Number(b.status !== "pending");
    const date = (a.dueAt ? Date.parse(a.dueAt) : Number.MAX_SAFE_INTEGER) - (b.dueAt ? Date.parse(b.dueAt) : Number.MAX_SAFE_INTEGER);
    if (rank || date) return rank || date;
    const left = encoder.encode(a.recordId), right = encoder.encode(b.recordId);
    for (let index = 0; index < Math.min(left.length, right.length); index++) if (left[index] !== right[index]) return left[index] - right[index];
    return left.length - right.length;
  });
}

/** Stage a full refresh before replacing the visible window. Failed reads never mutate it. */
export async function readActivityWindow(input: {
  previous?: ActivityWindow; append?: boolean; refreshPages?: number;
  fetchPage: (cursor?: string) => Promise<ActivityFeedPage>;
}): Promise<ActivityWindow> {
  if (input.append && (!input.previous?.paged || !input.previous.nextCursor)) throw Error("Atualize os retornos antes de continuar.");
  if (input.refreshPages !== undefined && (!Number.isSafeInteger(input.refreshPages) || input.refreshPages < 1)) throw Error("Atualize a consulta de retornos.");
  const target = input.append ? 1 : Math.max(1, input.refreshPages || 1);
  const items = new Map((input.append ? input.previous!.items : []).map(row => [row.id, row]));
  const reviews = new Map((input.append ? input.previous!.reviewItems : []).map(row => [row.recordId, row]));
  const leads = new Map((input.append ? input.previous!.leads : []).map(row => [row.id, row]));
  let cursor = input.append ? input.previous!.nextCursor : null;
  const seen = new Set<string>(); let final: ActivityFeedPage = {}, pages = input.append ? input.previous!.pages : 0;
  if (cursor) seen.add(cursor);
  let canEdit = input.append ? input.previous!.canEdit : true;
  let queryScope = input.append ? input.previous!.queryScope : undefined;
  for (let index = 0; index < target; index++) {
    const page = await input.fetchPage(cursor || undefined); final = page;
    if (!Array.isArray(page.items)) throw Error("Não foi possível conferir os retornos recebidos. Atualize a consulta.");
    if (page.contractVersion !== undefined && ![1, 2].includes(page.contractVersion)) throw Error("A consulta mudou. Atualize os retornos para continuar.");
    canEdit = canEdit && page.canEdit === true;
    if (page.contractVersion !== 2) {
      if (input.append || index > 0) throw Error("A consulta mudou. Atualize os retornos para continuar.");
      return { items: page.items, leads: page.leads || [], reviewItems: [], paged: false, pages: 1, nextCursor: null, canEdit, coverage: page.coverage || "complete" };
    }
    if (page.reviewItems !== undefined && !Array.isArray(page.reviewItems) || page.nextCursor != null && (typeof page.nextCursor !== "string" || !page.nextCursor))
      throw Error("Não foi possível conferir a continuação dos retornos.");
    if (queryScope && queryScope !== page.queryScope) throw Error("A consulta mudou. Atualize os retornos para continuar.");
    queryScope = page.queryScope;
    for (const row of page.items) { items.set(row.id, row); reviews.delete(row.recordId); }
    for (const row of page.reviewItems || []) { reviews.set(row.recordId, row); items.delete(`task:${row.recordId}`); }
    for (const row of page.leads || []) leads.set(row.id, row);
    pages++; cursor = page.nextCursor || null;
    if (!cursor) break;
    if (seen.has(cursor)) throw Error("A consulta não avançou. Atualize os retornos para continuar.");
    seen.add(cursor);
  }
  return { items: orderedActivities([...items.values()]), leads: [...leads.values()], reviewItems: [...reviews.values()], paged: true,
    pages, nextCursor: cursor, canEdit, coverage: final.coverage || "partial", queryScope,
    confirmedIds: input.append ? input.previous!.confirmedIds : undefined };
}
/** Merge only a server-confirmed mutation's records; discovery still uses normal refresh. */
export function applyConfirmedActivityRefresh(previous: ActivityWindow, requested: string[], response: ActivityRecordRefresh): ActivityWindow {
  if (!previous.paged || !previous.queryScope || response.queryScope !== previous.queryScope || !Array.isArray(response.items) ||
    !Array.isArray(response.reviewItems) || !Array.isArray(response.removedIds) || !Array.isArray(response.leads)) throw Error("Atualize a consulta para conferir o retorno salvo.");
  const allowed = new Set(requested), seen = new Set<string>();
  const classify = (id: string) => { if (!allowed.has(id) || seen.has(id)) throw Error("Não foi possível conferir todos os retornos salvos."); seen.add(id); };
  for (const row of response.items) { if (row.source !== "task" || row.id !== `task:${row.recordId}`) throw Error("Resposta de retorno inválida."); classify(row.recordId); }
  for (const row of response.reviewItems) classify(row.recordId);
  for (const id of response.removedIds) classify(id);
  if (seen.size !== allowed.size) throw Error("Não foi possível conferir todos os retornos salvos.");
  const items = new Map(previous.items.filter(row => !allowed.has(row.recordId)).map(row => [row.id, row]));
  const reviews = new Map(previous.reviewItems.filter(row => !allowed.has(row.recordId)).map(row => [row.recordId, row]));
  const leads = new Map(previous.leads.map(row => [row.id, row]));
  for (const row of response.items) items.set(row.id, row);
  for (const row of response.reviewItems) reviews.set(row.recordId, row);
  for (const row of response.leads) leads.set(row.id, row);
  const retainedLeads = new Set([...items.values()].map(row => row.leadId));
  for (const row of reviews.values()) retainedLeads.add(row.leadId);
  const confirmedIds = new Set(previous.confirmedIds || []);
  for (const id of requested) { if (response.removedIds.includes(id)) confirmedIds.delete(id); else confirmedIds.add(id); }
  return { ...previous, items: orderedActivities([...items.values()]), reviewItems: [...reviews.values()],
    leads: [...leads.values()].filter(row => retainedLeads.has(row.id)), canEdit: previous.canEdit && response.canEdit === true, confirmedIds: [...confirmedIds] };
}
/** A newly saved return can sort beyond the refreshed prefix. Re-read it rather
 * than silently dropping it or keeping stale facts after ownership changes. */
export async function reconcileConfirmedActivities(previous: ActivityWindow | undefined, next: ActivityWindow,
  fetchRecords: (ids: string[], scope: string) => Promise<ActivityRecordRefresh>): Promise<ActivityWindow> {
  if (!next.paged || !next.queryScope || !previous?.confirmedIds?.length) return next;
  const confirmedIds = [...new Set(previous.confirmedIds)], present = new Set([...next.items.map(row => row.recordId), ...next.reviewItems.map(row => row.recordId)]);
  const missing = confirmedIds.filter(id => !present.has(id));
  let result: ActivityWindow = { ...next, confirmedIds };
  for (let offset = 0; offset < missing.length; offset += 100) {
    const ids = missing.slice(offset, offset + 100), response = await fetchRecords(ids, next.queryScope);
    result = applyConfirmedActivityRefresh(result, ids, response);
  }
  return result;
}
export function activityLeadLabel(row: ActivityLeadOption) {
  const name = row.nome || row.empresa || "Contato sem nome";
  return row.opportunityTitle ? `${name} · ${row.opportunityTitle}` : name;
}
