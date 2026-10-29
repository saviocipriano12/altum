"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { CrmButton, CrmInput, CrmSelect } from "./crm-workspace";
import { CrmDetailRequests } from "@/lib/crm-detail-refresh";
import { fetchInboxJson } from "@/lib/inbox-request";
import { activityLeadLabel, type ActivityLeadOption } from "@/lib/crm-activity-window";

export function ActivityLeadPicker({ tenantId, value, onChange, disabled }: {
  tenantId: string; value: ActivityLeadOption | null; onChange: (value: ActivityLeadOption | null) => void; disabled?: boolean;
}) {
  const id = useId(), [search, setSearch] = useState(""), [query, setQuery] = useState("");
  const [options, setOptions] = useState<ActivityLeadOption[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const requests = useRef(new CrmDetailRequests()), active = useRef(false), appendLock = useRef(false);
  const callback = useRef(onChange); callback.current = onChange;
  const scope = JSON.stringify([tenantId, query]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const load = useCallback(async (next?: string) => {
    if (!active.current || next && appendLock.current) return;
    if (next) appendLock.current = true;
    const ticket = requests.current.begin(scope)!;
    const current = () => active.current && requests.current.accepts(ticket, scope);
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ q: query, pageSize: "20", ...(next ? { cursor: next } : {}) });
      const { response, payload } = await fetchInboxJson<{ options?: ActivityLeadOption[]; nextCursor?: string | null; error?: string }>(signal =>
        authedFetch(`/api/tenant/${tenantId}/activities/clients?${params}`, { signal: AbortSignal.any([signal, ticket.controller.signal]) }), 15000);
      if (!current()) return;
      if (!response.ok) {
        if ([401,403].includes(response.status)) { setOptions([]); callback.current(null); }
        throw Error(payload.error || "Não foi possível buscar os clientes.");
      }
      if (!Array.isArray(payload.options)) throw Error("Não foi possível conferir os clientes recebidos.");
      setOptions(previous => [...new Map([...(next ? previous : []), ...payload.options!].map(row => [row.id, row])).values()]);
      setCursor(payload.nextCursor || null); setLoaded(scope);
    } catch (error) { if (current()) setError(error instanceof Error ? error.message : "Não foi possível buscar os clientes."); }
    finally { if (current()) setLoading(false); requests.current.finish(ticket); if (next) appendLock.current = false; }
  }, [tenantId, query, scope]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { const manager = requests.current; void load(); return () => manager.cancelScope(scope); }, [load, scope]);
  const current = loaded === scope && search.trim() === query;
  const choices = [...new Map([...(value ? [value] : []), ...(current ? options : [])].map(row => [row.id, row])).values()];
  return <div className="space-y-2">
    <label htmlFor={`${id}-search`} className="block text-xs font-semibold">Buscar cliente<CrmInput id={`${id}-search`} type="search" maxLength={120} value={search} onChange={event => setSearch(event.target.value)} disabled={disabled} className="mt-1 w-full" /></label>
    <label htmlFor={`${id}-choice`} className="block text-xs font-semibold">Cliente ou oportunidade<CrmSelect id={`${id}-choice`} value={value?.id || ""} onChange={event => callback.current(choices.find(row => row.id === event.target.value) || null)} disabled={disabled} required className="mt-1 w-full"><option value="">Selecione</option>{choices.map(row => <option key={row.id} value={row.id}>{activityLeadLabel(row)}{value?.id === row.id ? " (selecionado)" : ""}</option>)}</CrmSelect></label>
    {loading || !current && !error ? <p role="status" className="text-xs text-[var(--cliente-card-text-soft)]">Buscando clientes…</p> : null}
    {error ? <p role="alert" className="text-xs text-[var(--cliente-danger)]">{error} <button type="button" disabled={disabled || loading} onClick={() => void load()} className="underline">Tentar novamente</button></p> : null}
    {current && !loading && !error && !options.length ? <p className="text-xs text-[var(--cliente-card-text-soft)]">{cursor ? "Nenhum cliente nesta parte da busca. Continue para consultar os próximos." : "Nenhum cliente encontrado nesta busca."}</p> : null}
    {current && cursor && !error ? <CrmButton type="button" disabled={disabled || loading} onClick={() => void load(cursor)}>{loading ? "Buscando…" : options.length ? "Carregar mais clientes" : "Continuar busca"}</CrmButton> : null}
  </div>;
}
