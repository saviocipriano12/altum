"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Loader2, Plus, RefreshCw } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CrmButton, CrmInput, CrmSelect, formatCrmDate } from "@/app/cliente/painel/components/crm-workspace";
import { selectNextCommercialActivity, type CommercialActivity } from "@/lib/crm-activity";
import { CrmDetailRequests, crmDetailScope } from "@/lib/crm-detail-refresh";
import { fetchInboxJson } from "@/lib/inbox-request";
import { activityViewPreference } from "@/lib/crm-activity-filter";
import { readClientPreference, writeClientPreference } from "@/lib/client-storage";
import { ActivityLeadPicker } from "./activity-lead-picker";
import { activityLeadLabel, applyConfirmedActivityRefresh, readActivityWindow, reconcileConfirmedActivities, type ActivityLeadOption, type ActivityFeedPage, type ActivityWindow, type ActivityRecordRefresh } from "@/lib/crm-activity-window";

type LeadOption = ActivityLeadOption;
type ScrollAnchor = { positions: Array<{ id: string; top: number }>; container: HTMLElement | null };
function captureActivityAnchor(root: HTMLElement | null): ScrollAnchor | null {
  if (!root) return null;
  const positions = [...root.querySelectorAll<HTMLElement>("[data-activity-id]")].map(element => ({ id: element.dataset.activityId!, rect: element.getBoundingClientRect() }))
    .filter(row => row.rect.bottom > 0 && row.rect.top < window.innerHeight).slice(0, 5).map(row => ({ id: row.id, top: row.rect.top }));
  let container = root.parentElement;
  while (container && !(/auto|scroll/.test(window.getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight)) container = container.parentElement;
  return positions.length ? { positions, container } : null;
}
type Draft = { title: string; dueAt: string; ownerUserId: string };
function localInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
type Props = {
  leadId?: string; leads?: LeadOption[]; onChanged?: () => void | Promise<void>;
  onNextActivityChange?: (item: CommercialActivity | null) => void;
  isActive?: boolean;
};
export function CommercialActivities(props: Props) {
  const { tenant } = useClienteTenant();
  const scope = JSON.stringify([tenant?.tenantId, tenant?.userId, props.leadId, tenant?.tenantRole, [...(tenant?.capabilities || [])].sort()]);
  return <ScopedCommercialActivities key={scope} {...props} />;
}
function ScopedCommercialActivities({ leadId, leads = [], onChanged, onNextActivityChange, isActive = true }: Props) {
  const { tenant, hasCapability } = useClienteTenant(), id = useId();
  const canAssign = hasCapability("view_team_records") || hasCapability("manage_users") || hasCapability("manage_settings") || ["client_owner", "client_admin", "agency_owner", "agency_admin", "agency_agent"].includes(tenant?.tenantRole || "");
  const [items, setItems] = useState<CommercialActivity[]>([]), [loading, setLoading] = useState(true);
  const [feedLeads, setFeedLeads] = useState<LeadOption[]>([]);
  const [page, setPage] = useState<Pick<ActivityWindow, "paged" | "nextCursor" | "reviewItems" | "coverage">>({ paged: false, nextCursor: null, reviewItems: [], coverage: "complete" });
  const windowRef = useRef<{ key: string; value: ActivityWindow } | null>(null), appendLock = useRef(false);
  const listRef = useRef<HTMLElement>(null), pendingAnchor = useRef<ScrollAnchor | null>(null);
  const [serverCanEdit, setServerCanEdit] = useState(false);
  const canEdit = hasCapability("edit_leads") && serverCanEdit;
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState("");
  const [filter, setFilter] = useState("pending"), [limit, setLimit] = useState(20), [formOpen, setFormOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("all"), [dueFilter, setDueFilter] = useState("all");
  const [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const queryKey = JSON.stringify(leadId ? [] : [filter, ownerFilter, dueFilter, query]);
  const activeQuery = useRef(queryKey); activeQuery.current = queryKey;
  const latestLoad = useRef<((background?: boolean, append?: boolean) => Promise<void>) | null>(null);
  const [loadedQuery, setLoadedQuery] = useState("");
  const [filtersReady, setFiltersReady] = useState(Boolean(leadId));
  const preferenceKey = JSON.stringify(["altum:crm:routine", tenant?.tenantId, tenant?.userId]);
  useEffect(() => {
    if (leadId) return;
    const saved = activityViewPreference(readClientPreference(preferenceKey));
    setFilter(saved.status); setOwnerFilter(saved.owner); setDueFilter(saved.due); setFiltersReady(true);
  }, [leadId, preferenceKey]);
  useEffect(() => {
    if (!leadId && filtersReady) writeClientPreference(preferenceKey, JSON.stringify({ status: filter, owner: ownerFilter, due: dueFilter }));
  }, [leadId, filtersReady, preferenceKey, filter, ownerFilter, dueFilter]);
  useEffect(() => { const timer = window.setTimeout(() => { setQuery(search.trim()); setLimit(20); }, 300); return () => window.clearTimeout(timer); }, [search]);
  const [selectedLead, setSelectedLead] = useState(leadId || "");
  const [selectedCustomer, setSelectedCustomer] = useState<LeadOption | null>(null);
  const [draft, setDraft] = useState<Draft>({ title: "", dueAt: "", ownerUserId: "" });
  const [editing, setEditing] = useState<CommercialActivity | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (formOpen) formRef.current?.scrollIntoView({ block: "nearest" }); }, [formOpen, editing?.id]);
  useLayoutEffect(() => {
    const anchor = pendingAnchor.current; pendingAnchor.current = null;
    if (!anchor || !listRef.current) return;
    const elements = [...listRef.current.querySelectorAll<HTMLElement>("[data-activity-id]")];
    for (const position of anchor.positions) {
      const element = elements.find(item => item.dataset.activityId === position.id); if (!element) continue;
      const delta = element.getBoundingClientRect().top - position.top;
      if (anchor.container) anchor.container.scrollTop += delta; else window.scrollBy(0, delta);
      break;
    }
  }, [items, page.reviewItems]);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const requests = useRef(new CrmDetailRequests()), writeLock = useRef(false);
  const writeController = useRef<AbortController | null>(null);
  const scope = crmDetailScope(tenant?.tenantId, tenant?.userId, leadId || null);
  const pauseRefresh = useRef(false); pauseRefresh.current = formOpen || Boolean(busy);
  const active = useRef(false);
  const viewActive = useRef(isActive); viewActive.current = isActive;
  const callbacks = useRef({ onChanged, onNextActivityChange });
  useEffect(() => { callbacks.current = { onChanged, onNextActivityChange }; }, [onChanged, onNextActivityChange]);
  const readRecordChanges = useCallback(async (ids: string[], expectedScope: string, controller: AbortController, current: () => boolean) => {
    if (!tenant?.tenantId || !current()) throw new DOMException("Consulta substituída", "AbortError");
    const params = new URLSearchParams({ source: "task", pageSize: "20", status: filter, owner: ownerFilter, due: dueFilter, q: query,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo" });
    const { response, payload } = await fetchInboxJson<ActivityRecordRefresh>(signal => authedFetch(`/api/tenant/${tenant.tenantId}/activities/refresh?${params}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordIds: ids, expectedScope }),
      signal: AbortSignal.any([signal, controller.signal]),
    }), 15000);
    if (!current()) throw new DOMException("Consulta substituída", "AbortError");
    if (!response.ok) {
      if ([401,403].includes(response.status) || payload.code === "activity_query_changed") {
        setItems([]); setFeedLeads([]); setServerCanEdit(false); windowRef.current = null;
        setPage({ paged: false, nextCursor: null, reviewItems: [], coverage: "complete" });
      }
      throw Error(payload.error || "Não foi possível conferir o retorno.");
    }
    return payload;
  }, [tenant?.tenantId, filter, ownerFilter, dueFilter, query]);
  const load = useCallback(async (background = false, append = false) => {
    if (!tenant?.tenantId || !active.current || !viewActive.current || !filtersReady || activeQuery.current !== queryKey) return;
    if (background && (pauseRefresh.current || writeLock.current)) return;
    if (append && appendLock.current) return;
    if (append) appendLock.current = true;
    const ticket = requests.current.begin(scope, background); if (!ticket) return;
    const current = () => active.current && activeQuery.current === queryKey && requests.current.accepts(ticket, scope);
    if (!background) setLoading(true);
    try {
      const previous = windowRef.current?.key === queryKey ? windowRef.current.value : undefined;
      let result = await readActivityWindow({ previous, append, refreshPages: previous?.paged ? previous.pages : 1, fetchPage: async cursor => {
        const params = new URLSearchParams({ source: "task", ...(leadId ? { leadId } : {}) });
        if (!leadId) {
          params.set("status", filter); params.set("owner", ownerFilter); params.set("due", dueFilter); params.set("q", query);
          params.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo");
          if (cursor) { params.set("pageSize", "20"); params.set("cursor", cursor); } else params.set("paging", "auto");
        }
        const { response, payload } = await fetchInboxJson<ActivityFeedPage>(signal =>
          authedFetch(`/api/tenant/${tenant.tenantId}/activities?${params}`, { signal: AbortSignal.any([signal, ticket.controller.signal]) }), 15000);
        if (!current()) throw new DOMException("Consulta substituída", "AbortError");
        if (!response.ok) {
          if ([401,403,404].includes(response.status)) {
            setItems([]); setFeedLeads([]); setPage({ paged: false, nextCursor: null, reviewItems: [], coverage: "complete" });
            windowRef.current = null; setServerCanEdit(false); callbacks.current.onNextActivityChange?.(null);
          }
          throw new Error(payload.error || "Falha ao carregar retornos.");
        }
        return payload;
      } });
      if (!current()) return;
      result = await reconcileConfirmedActivities(previous, result, (ids, expectedScope) => readRecordChanges(ids, expectedScope, ticket.controller, current));
      if (!current()) return;
      if (previous) pendingAnchor.current = captureActivityAnchor(listRef.current);
      windowRef.current = { key: queryKey, value: result };
      setItems(result.items); setFeedLeads(result.leads); setServerCanEdit(result.canEdit); setError("");
      setPage({ paged: result.paged, nextCursor: result.nextCursor, reviewItems: result.reviewItems, coverage: result.coverage });
      setLoadedQuery(queryKey);
      if (leadId) callbacks.current.onNextActivityChange?.(selectNextCommercialActivity(result.items.filter(row => row.origin !== "ai")));
    } catch (error) { if (current()) setError(error instanceof Error ? error.message : "Falha ao carregar retornos."); }
    finally { if (current()) setLoading(false); requests.current.finish(ticket); if (append) appendLock.current = false; }
  }, [tenant?.tenantId, leadId, scope, filtersReady, filter, ownerFilter, dueFilter, query, queryKey, readRecordChanges]);
  latestLoad.current = load;
  useEffect(() => { active.current = true; const manager = requests.current; return () => { active.current = false; manager.cancelScope(scope); writeController.current?.abort(); }; }, [scope]);
  useEffect(() => { const manager = requests.current; void load(); return () => manager.cancelScope(scope); }, [load, scope]);
  useEffect(() => { if (isActive) void load(true); }, [isActive, load]);
  useEffect(() => {
    const changed = (event: Event) => { const detail = (event as CustomEvent).detail;
      if (detail?.tenantId === tenant?.tenantId && detail.origin !== id && (!leadId || detail.leadId === leadId)) void load(true); };
    const focused = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(focused, 20000);
    window.addEventListener("altum:crm-activity-changed", changed); window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", focused); window.removeEventListener("altum:crm-activity-changed", changed); window.removeEventListener("focus", focused); };
  }, [id, tenant?.tenantId, leadId, load]);
  const dataCurrent = Boolean(leadId) || loadedQuery === queryKey;
  const visible = useMemo(() => dataCurrent ? items.filter(item => filter === "all" || item.status === filter) : [], [items, filter, dataCurrent]);
  const pending = dataCurrent ? items.filter(item => item.status === "pending") : [], overdue = pending.filter(item => item.dueAt && Date.parse(item.dueAt) < Date.now()).length;
  const leadOptions = feedLeads.length ? feedLeads : leads;
  const leadById = useMemo(() => new Map(leadOptions.map(item => [item.id, item])), [leadOptions]);
  const selected = leadById.get(editing?.leadId || leadId || selectedLead) || (!editing && selectedCustomer?.id === selectedLead ? selectedCustomer : null);
  const ownerOptions = new Map<string, string>();
  if (tenant?.userId) ownerOptions.set(tenant.userId, "Eu");
  if (canAssign && selected?.ownerId) ownerOptions.set(selected.ownerId, selected.owner || "Responsável pela oportunidade");
  if (editing?.ownerUserId) ownerOptions.set(editing.ownerUserId, editing.ownerName || "Responsável atual");
  const resetForm = () => { setEditing(null); setDraft({ title: "", dueAt: "", ownerUserId: "" }); setFormOpen(false); request.current = null; };
  async function changed(activityLeadId: string, taskId?: string) {
    if (!active.current) return;
    const previous = activeQuery.current === queryKey && windowRef.current?.key === queryKey ? windowRef.current.value : undefined;
    if (!leadId && tenant?.tenantId && taskId && previous?.paged && previous.queryScope) {
      const tracked = { ...previous, confirmedIds: [...new Set([...(previous.confirmedIds || []), taskId])] };
      windowRef.current = { key: queryKey, value: tracked };
      const ticket = requests.current.begin(scope)!;
      const current = () => active.current && activeQuery.current === queryKey && requests.current.accepts(ticket, scope);
      try {
        const payload = await readRecordChanges([taskId], previous.queryScope, ticket.controller, current);
        if (!current()) return;
        const result = applyConfirmedActivityRefresh(tracked, [taskId], payload);
        pendingAnchor.current = captureActivityAnchor(listRef.current); windowRef.current = { key: queryKey, value: result };
        setItems(result.items); setFeedLeads(result.leads); setServerCanEdit(result.canEdit);
        setPage({ paged: result.paged, nextCursor: result.nextCursor, reviewItems: result.reviewItems, coverage: result.coverage });
      } catch { if (current()) setError("O retorno foi salvo. Não foi possível atualizar a lista; atualize para conferir, sem criar outro retorno."); }
      finally { requests.current.finish(ticket); }
    } else await latestLoad.current?.();
    if (!active.current) return;
    window.dispatchEvent(new CustomEvent("altum:crm-activity-changed", { detail: { tenantId: tenant?.tenantId, leadId: activityLeadId, origin: id } }));
    try { await callbacks.current.onChanged?.(); }
    catch { if (active.current) setError("O retorno foi salvo. Não foi possível atualizar a ficha; atualize a tela para conferir."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); const target = editing?.leadId || leadId || selectedLead;
    if (!tenant?.tenantId || !target || !canEdit || writeLock.current) return;
    writeLock.current = true;
    const controller = new AbortController(); writeController.current = controller;
    setBusy("form"); setError(""); setNotice("");
    try {
      const body = { title: draft.title.trim(), dueAt: draft.dueAt ? new Date(draft.dueAt).toISOString() : null,
        ownerUserId: draft.ownerUserId || tenant.userId, ...(editing ? { expectedVersion: editing.version, expectedRevision: editing.revision } : {}) };
      const signature = JSON.stringify({ leadId: target, ...body });
      if (!editing && request.current?.payload !== signature) request.current = { payload: signature, key: crypto.randomUUID() };
      const { response, payload } = await fetchInboxJson<{ taskId?: string; error?: string }>(signal => authedFetch(`/api/tenant/${tenant.tenantId}/leads/${encodeURIComponent(target)}/tasks${editing ? `/${encodeURIComponent(editing.recordId)}` : ""}`, {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...(!editing ? { requestId: request.current!.key } : {}) }), signal: AbortSignal.any([signal, controller.signal]),
      }), 15000);
      if (!active.current) return;
      if (!response.ok) {
        if (response.status === 409 && editing) { await load(); throw new Error(`${payload.error || "Retorno alterado."} Cancele esta edição e abra o retorno novamente para revisar os dados atuais.`); }
        throw new Error(payload.error || "Falha ao salvar retorno.");
      }
      const wasEditing = Boolean(editing), savedTaskId = editing?.recordId || payload.taskId;
      resetForm(); await changed(target, savedTaskId); setNotice(wasEditing ? "Retorno atualizado na ficha e na Agenda." : "Retorno criado na ficha e na Agenda.");
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Falha ao salvar retorno."); }
    finally { writeLock.current = false; if (active.current) setBusy(""); }
  }
  async function status(item: CommercialActivity, value: "pending" | "done" | "canceled") {
    if (!tenant?.tenantId || !item.leadId || !canEdit || writeLock.current) return;
    writeLock.current = true;
    const controller = new AbortController(); writeController.current = controller;
    setBusy(item.id); setError(""); setNotice("");
    try {
      const { response, payload } = await fetchInboxJson<{ error?: string }>(signal => authedFetch(`/api/tenant/${tenant.tenantId}/leads/${encodeURIComponent(item.leadId!)}/tasks/${encodeURIComponent(item.recordId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: value, expectedVersion: item.version, expectedRevision: item.revision }),
        signal: AbortSignal.any([signal, controller.signal]),
      }), 15000);
      if (!active.current) return;
      if (!response.ok) throw new Error(payload.error || "Falha ao atualizar retorno.");
      await changed(item.leadId, item.recordId); setNotice(value === "done" ? "Retorno concluído." : value === "canceled" ? "Retorno cancelado." : "Retorno reaberto.");
    } catch (error) { if (active.current) setError(error instanceof Error ? error.message : "Falha ao atualizar retorno."); }
    finally { writeLock.current = false; if (active.current) setBusy(""); }
  }
  return <section ref={listRef} aria-labelledby={`${id}-heading`} className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id={`${id}-heading`} className="text-base font-bold text-[var(--cliente-card-text)]">Retornos comerciais</h2>
        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{!dataCurrent ? loading ? "Consultando retornos…" : "Consulta não atualizada" : leadId ? `${pending.length} em aberto` : page.paged ? `${visible.length} retornos carregados` : `${visible.length} retornos neste filtro`}{overdue ? ` · ${overdue} atrasados` : ""}{pending.some(item => !item.dueAt) ? ` · ${pending.filter(item => !item.dueAt).length} sem prazo` : ""}</p></div>
      <div className="flex flex-wrap gap-2">
        <CrmButton type="button" onClick={() => void load()} disabled={Boolean(busy)} aria-label="Atualizar retornos"><RefreshCw className="h-4 w-4" /></CrmButton>
        {canEdit && !formOpen ? <CrmButton type="button" tone="primary" onClick={() => { resetForm(); setFormOpen(true); }}><Plus className="h-4 w-4" />Novo retorno</CrmButton> : null}
      </div>
    </div>
    {error ? <p role="alert" className="rounded-xl bg-[var(--cliente-danger-soft)] p-3 text-sm text-[var(--cliente-danger)]">{error} <button type="button" onClick={() => void load()} className="ml-1 underline">Atualizar retornos</button></p> : null}
    {notice ? <p role="status" className="text-sm text-[var(--cliente-success)]">{notice}</p> : null}
    {formOpen && canEdit ? <form ref={formRef} onSubmit={save} className="space-y-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      {!leadId && !editing ? page.paged && tenant?.tenantId ? <ActivityLeadPicker tenantId={tenant.tenantId} value={selectedCustomer} disabled={Boolean(busy)} onChange={value => { if (value?.id !== selectedLead) setDraft(current => ({ ...current, ownerUserId: "" })); setSelectedCustomer(value); setSelectedLead(value?.id || ""); }} /> : <label className="block text-xs font-semibold">Cliente ou oportunidade<CrmSelect value={selectedLead} onChange={event => { setSelectedLead(event.target.value); setSelectedCustomer(leadById.get(event.target.value) || null); }} required className="mt-1 w-full"><option value="">Selecione</option>{leadOptions.map(item => <option key={item.id} value={item.id}>{activityLeadLabel(item)}</option>)}</CrmSelect></label> : null}
      <label className="block text-xs font-semibold">O que precisa ser feito<CrmInput value={draft.title} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} required maxLength={180} autoFocus className="mt-1 w-full" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 text-xs font-semibold">Prazo (horário local)<CrmInput type="datetime-local" value={draft.dueAt} onChange={event => setDraft(current => ({ ...current, dueAt: event.target.value }))} className="mt-1 w-full min-w-0" /><span className="mt-1 block font-normal text-[var(--cliente-card-text-soft)]">Sem data, fica como pendência de planejamento.</span></label>
        <label className="block min-w-0 text-xs font-semibold">Responsável<CrmSelect value={draft.ownerUserId || tenant?.userId || ""} onChange={event => setDraft(current => ({ ...current, ownerUserId: event.target.value }))} disabled={!canAssign} className="mt-1 w-full">{[...ownerOptions].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</CrmSelect></label>
      </div>
      <div className="flex flex-wrap gap-2"><CrmButton type="submit" tone="primary" disabled={Boolean(busy) || !draft.title.trim()}>{busy === "form" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar retorno</CrmButton><CrmButton type="button" onClick={resetForm} disabled={Boolean(busy)}>Cancelar edição</CrmButton></div>
    </form> : null}
    <div className="flex flex-wrap items-end gap-3">
      {!leadId ? <label className="min-w-48 flex-1 text-xs text-[var(--cliente-card-text-soft)]">Buscar retorno ou cliente<CrmInput type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={120} disabled={Boolean(busy) || formOpen} className="mt-1 w-full" /></label> : null}
      <label className="text-xs text-[var(--cliente-card-text-soft)]">Mostrar<CrmSelect value={filter} disabled={Boolean(busy) || formOpen} className="mt-1 block" onChange={event => { setFilter(event.target.value); setLimit(20); }}><option value="pending">Em aberto</option><option value="done">Concluídos</option><option value="canceled">Cancelados</option><option value="all">Todos</option></CrmSelect></label>
      {!leadId ? <><label className="text-xs text-[var(--cliente-card-text-soft)]">Responsável<CrmSelect value={ownerFilter} disabled={Boolean(busy) || formOpen} className="mt-1 block" onChange={event => { setOwnerFilter(event.target.value); setLimit(20); }}><option value="all">Carteira acessível</option><option value="mine">Meus retornos</option></CrmSelect></label>
      <label className="text-xs text-[var(--cliente-card-text-soft)]">Prazo<CrmSelect value={dueFilter} disabled={Boolean(busy) || formOpen} className="mt-1 block" onChange={event => { setDueFilter(event.target.value); setLimit(20); }}><option value="all">Todos os prazos</option><option value="overdue">Atrasados</option><option value="today">Hoje</option><option value="undated">Sem prazo</option></CrmSelect></label></> : null}
    </div>
    {loading && !items.length ? <p role="status" className="text-sm text-[var(--cliente-card-text-soft)]">Carregando retornos…</p> : null}
    {dataCurrent && !loading && !visible.length && !page.reviewItems.length && !error ? <p className="py-3 text-sm text-[var(--cliente-card-text-soft)]">{page.paged && page.nextCursor ? "Nenhum retorno nesta parte da busca. Continue para consultar os próximos." : "Nenhum retorno neste filtro."}</p> : null}
    {dataCurrent && page.reviewItems.length ? <div className="space-y-2 rounded-xl border border-[var(--cliente-border)] p-3"><h3 className="text-sm font-semibold">Retornos para revisar</h3>{page.reviewItems.map(item => <article key={item.recordId} data-activity-id={`review:${item.recordId}`} className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><p className="font-medium">{item.title}</p><p className="text-xs text-[var(--cliente-warning)]">{item.issue === "invalid_due_at" ? "Confira o prazo informado." : item.issue === "invalid_status" ? "Confira se este retorno está aberto, concluído ou cancelado." : "Confira os dados deste retorno antes de continuar."}</p></div><Link className="text-xs text-[var(--cliente-primary)] underline" href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`}>Abrir cliente para revisar</Link></article>)}</div> : null}
    <div className="divide-y divide-[var(--cliente-border)]">{visible.slice(0,page.paged ? visible.length : limit).map(item => <article key={item.id} data-activity-id={item.id} className="min-w-0 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1 basis-48">
        <p className="break-words text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
        {!leadId && item.leadId ? <Link className="mt-1 inline-block text-xs text-[var(--cliente-primary)] underline" href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`}>{leadById.has(item.leadId) ? activityLeadLabel(leadById.get(item.leadId)!) : item.leadName || "Abrir oportunidade"}</Link> : null}
        <p className={`mt-1 text-xs ${item.status === "pending" && item.dueAt && Date.parse(item.dueAt) < Date.now() ? "text-[var(--cliente-warning)]" : "text-[var(--cliente-card-text-soft)]"}`}>{item.dueAt ? formatCrmDate(item.dueAt) : "Sem prazo definido"} · {item.ownerName || (item.ownerUserId === tenant?.userId ? "Eu" : "Responsável não informado")}{item.status !== "pending" ? ` · ${item.status === "done" ? "Concluído" : "Cancelado"}` : ""}</p>
      </div>{canEdit ? <div className="flex flex-wrap gap-2">
        <CrmButton type="button" disabled={Boolean(busy)} onClick={() => void status(item, item.status === "pending" ? "done" : "pending")}>{busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : item.status === "pending" ? <CheckCircle2 className="h-4 w-4" /> : null}{item.status === "pending" ? "Concluir" : "Reabrir"}</CrmButton>
        <CrmButton type="button" disabled={Boolean(busy)} aria-label={`Editar retorno ${item.title}`} onClick={() => { setEditing(item); setDraft({ title: item.title, dueAt: localInput(item.dueAt), ownerUserId: item.ownerUserId || tenant?.userId || "" }); setFormOpen(true); setError(""); }}>Editar</CrmButton>
        {item.status === "pending" ? <CrmButton type="button" disabled={Boolean(busy)} aria-label={`Cancelar retorno ${item.title}`} onClick={() => void status(item, "canceled")}>Cancelar</CrmButton> : null}
      </div> : null}</div>
    </article>)}</div>
    {dataCurrent && page.paged && page.nextCursor ? <CrmButton type="button" disabled={loading || Boolean(busy) || formOpen || search.trim() !== query} onClick={() => void load(false, true)}>{loading ? "Consultando…" : visible.length ? "Carregar mais retornos" : "Continuar busca"}</CrmButton> : null}
    {dataCurrent && page.paged && !page.nextCursor && (visible.length || page.reviewItems.length) ? <p className="text-xs text-[var(--cliente-card-text-soft)]">Fim dos resultados consultados. Atualize para conferir novos retornos.</p> : null}
    {!page.paged && visible.length > limit ? <CrmButton type="button" disabled={loading || Boolean(busy) || formOpen} onClick={() => setLimit(current => current + 20)}>Mostrar mais retornos ({visible.length - limit})</CrmButton> : null}
  </section>;
}
