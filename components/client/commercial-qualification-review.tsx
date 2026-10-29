"use client";

import { useEffect, useRef, useState } from "react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { crmQualificationFields } from "@/lib/crm-qualification-fields";

export function CommercialQualificationReview({ tenantId, leadId, canEdit, onSaved, onEditingChange }: {
  tenantId: string; leadId: string; canEdit: boolean; onSaved: () => void;
  onEditingChange?: (editing: boolean) => void;
}) {
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({}), [revision, setRevision] = useState("");
  const [manualFields, setManualFields] = useState<string[]>([]), [releaseFields, setReleaseFields] = useState<string[]>([]);
  const baseline = useRef<Record<string, string>>({}), scope = JSON.stringify([tenantId, leadId]), current = useRef(scope);
  current.current = scope;
  const editingCallback = useRef(onEditingChange);
  editingCallback.current = onEditingChange;
  useEffect(() => {
    current.current = scope;
    return () => { current.current = "unmounted"; editingCallback.current?.(false); };
  }, [scope]);
  if (!canEdit) return null;
  const endpoint = `/api/tenant/${encodeURIComponent(tenantId)}/leads/${encodeURIComponent(leadId)}/qualification`;
  async function open() {
    const expected = scope;
    setOpened(true); setBusy(true); setError(""); setRevision(""); editingCallback.current?.(true);
    try {
      const response = await authedFetch(endpoint, { signal: AbortSignal.timeout(15_000) }), result = await response.json();
      if (current.current !== expected) return;
      if (!response.ok) throw new Error(result.error || "Não foi possível abrir a revisão.");
      setFields(result.fields); baseline.current = result.fields; setRevision(result.revision);
      setManualFields(result.manualFields || []); setReleaseFields([]);
    } catch (error) { if (current.current === expected) setError(error instanceof Error ? error.message : "Falha ao carregar."); }
    finally { if (current.current === expected) setBusy(false); }
  }
  async function save() {
    const expected = scope;
    const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== baseline.current[key]));
    if (!Object.keys(changed).length && !releaseFields.length) { setError("Altere um campo ou selecione uma liberação para salvar."); return; }
    setBusy(true); setError("");
    try {
      const response = await authedFetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision, fields: changed, releaseFields }), signal: AbortSignal.timeout(15_000) });
      const result = await response.json();
      if (current.current !== expected) return;
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar a revisão.");
      setOpened(false); editingCallback.current?.(false); onSaved();
    } catch (error) { if (current.current === expected) setError(error instanceof Error ? error.message : "Falha ao salvar."); }
    finally { if (current.current === expected) setBusy(false); }
  }
  return <div className="mt-3 min-w-0">
    {!opened ? <button type="button" onClick={() => { void open(); }} className="text-xs font-semibold text-[var(--cliente-primary)]">Revisar informações comerciais</button> :
      <div className="space-y-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
        <p className="text-xs text-[var(--cliente-card-text-soft)]">Correções da equipe ficam protegidas contra substituição pela IA. Deixe vazio para retirar uma informação incorreta.</p>
        <p className="text-xs text-[var(--cliente-card-text-soft)]">Ao liberar um campo, o valor atual permanece até uma nova mensagem trazer informação comprovada.</p>
        {revision ? crmQualificationFields.map(field => <div key={field.key} className="text-xs text-[var(--cliente-card-text)]">
          <label>{field.label}<input value={fields[field.key] || ""} maxLength={320} disabled={busy} onChange={event => { setFields(current => ({ ...current, [field.key]: event.target.value })); setReleaseFields(current => current.filter(key => key !== field.key)); }}
            className="mt-1 w-full min-w-0 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2" />
          </label>
          {manualFields.includes(field.key) ? <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={releaseFields.includes(field.key)} disabled={busy || fields[field.key] !== baseline.current[field.key]}
              onChange={event => setReleaseFields(current => event.target.checked ? [...current, field.key] : current.filter(key => key !== field.key))} />
            Permitir atualização pela IA
          </label> : null}
        </div>) : null}
        {error ? <p role="alert" className="text-xs text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          <button type="button" disabled={busy || !revision} onClick={() => { void save(); }} className="text-[var(--cliente-primary)]">{busy ? "Aguarde…" : "Salvar correções"}</button>
          <button type="button" disabled={busy} onClick={() => { setOpened(false); editingCallback.current?.(false); }}>Fechar revisão</button>
        </div>
      </div>}
  </div>;
}
