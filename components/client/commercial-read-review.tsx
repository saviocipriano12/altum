"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { commercialReadNotice } from "@/lib/crm-read-state";
type Item = { id: string; revision: string; sourceRevision: string; leadGeneration: string; contextRevision: string; title: string; href: string; occurredAtMs: number; kind: string };
export function CommercialReadReview({ tenantId, leadId, state, onSaved }: { tenantId: string; leadId: string; state?: unknown; onSaved: () => void }) {
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [items, setItems] = useState<Item[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null), [note, setNote] = useState(""), [confirmed, setConfirmed] = useState(false);
  const scope = JSON.stringify([tenantId, leadId]), active = useRef(scope), lock = useRef(false);
  active.current = scope;
  useEffect(() => { active.current = scope; return () => { active.current = "unmounted"; }; }, [scope]);
  const endpoint = `/api/tenant/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/read-issues`;
  async function load(next?: string) {
    if (lock.current) return;
    const expected = scope; lock.current = true; setBusy(true); setError(""); setOpened(true); setSelected(null); setItems([]); setCursor(null);
    try {
      const response = await authedFetch(`${endpoint}${next ? `?cursor=${encodeURIComponent(next)}` : ""}`, { signal: AbortSignal.timeout(15000) }), result = await response.json();
      if (active.current !== expected) return;
      if (!response.ok) throw new Error(result.error || "Não foi possível abrir as pendências.");
      setItems(result.items); setCursor(result.nextCursor);
    } catch (error) { if (active.current === expected) setError(error instanceof Error ? error.message : "Falha ao carregar."); }
    finally { if (active.current === expected) { lock.current = false; setBusy(false); } }
  }
  async function save() {
    if (!selected || lock.current || !confirmed || !note.trim()) return;
    const expected = scope; lock.current = true; setBusy(true); setError("");
    try {
      const response = await authedFetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, revision: selected.revision, sourceRevision: selected.sourceRevision,
          leadGeneration: selected.leadGeneration, contextRevision: selected.contextRevision, note, confirmed }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (active.current !== expected) return;
      if (!response.ok) throw new Error(result.error || "Não foi possível registrar a conferência.");
      setSelected(null); setNote(""); setConfirmed(false); setOpened(false); onSaved();
    } catch (error) { if (active.current === expected) setError(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { if (active.current === expected) { lock.current = false; setBusy(false); } }
  }
  if (!opened && !commercialReadNotice(state)) return null;
  return <div className="mt-3 text-xs">
    {!opened ? <button type="button" onClick={() => { void load(); }} className="font-semibold text-[var(--cliente-primary)]">Conferir pendências de leitura</button> :
      <div className="space-y-3 rounded-2xl border border-[var(--cliente-border)] p-3">
        <p className="font-semibold">Mensagens que precisam de conferência</p>
        <p>Abra a conversa, confira o conteúdo e corrija os dados comerciais antes de registrar a revisão.</p>
        {!busy && !items.length && !error ? <p>Nenhuma pendência acessível neste lote.</p> : null}
        {items.map(item => <div key={item.id} className="space-y-2 border-t border-[var(--cliente-border)] pt-2">
          <p className="font-semibold">{item.title}</p>
          <p>{({ audio: "Áudio", image: "Imagem", video: "Vídeo", document: "Documento" } as Record<string, string>)[item.kind] || "Mensagem"} · {new Date(item.occurredAtMs).toLocaleString("pt-BR")}</p>
          <div className="flex flex-wrap gap-3"><Link href={item.href} target="_blank" rel="noopener noreferrer" className="underline">Abrir conversa</Link>
            <button type="button" disabled={busy} onClick={() => { setSelected(item); setNote(""); setConfirmed(false); setError(""); }} className="font-semibold">Registrar conferência</button></div>
        </div>)}
        {selected ? <div className="space-y-2 border-t border-[var(--cliente-border)] pt-3">
          <p className="font-semibold">Conferência da mensagem selecionada</p>
          <p>{selected.title} · {new Date(selected.occurredAtMs).toLocaleString("pt-BR")}</p>
          <label className="block">O que você conferiu ou corrigiu?
            <textarea value={note} maxLength={600} disabled={busy} onChange={event => setNote(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2" /></label>
          <label className="flex gap-2"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Conferi a mensagem e registrei as correções necessárias na ficha.</label>
          <p>A revisão fica registrada como conferência humana. Os campos do CRM são corrigidos em “Revisar informações comerciais”.</p>
          <button type="button" disabled={busy || !confirmed || !note.trim()} onClick={() => { void save(); }} className="font-semibold text-[var(--cliente-primary)]">Salvar conferência</button>
        </div> : null}
        {error ? <p role="alert" className="text-red-600">{error}</p> : null}
        {busy ? <p role="status">Aguarde…</p> : null}
        <div className="flex flex-wrap gap-3 font-semibold">
          <button type="button" disabled={busy} onClick={() => { void load(); }}>Atualizar lista</button>
          {cursor ? <button type="button" disabled={busy} onClick={() => { void load(cursor); }}>Próximo lote</button> : null}
          <button type="button" disabled={busy} onClick={() => { setOpened(false); setSelected(null); }}>Fechar</button>
        </div>
      </div>}
  </div>;
}
