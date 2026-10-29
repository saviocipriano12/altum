"use client";

import {useEffect, useRef, useState, type FormEvent} from "react";
import {CrmButton, CrmInput} from "./crm-workspace";

function localDate(value?: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
}
export function AppointmentTimeDialog({appointment, busy, error, onDismiss, onConfirm}: {
  appointment: {title?: string; startAt?: string | null; endAt?: string | null}; busy: boolean; error: string | null;
  onDismiss: () => void; onConfirm: (startAt: string, endAt: string) => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(() => localDate(appointment.startAt));
  const [end, setEnd] = useState(() => localDate(appointment.endAt));
  const [validation, setValidation] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {element.close(); if (previous?.isConnected) previous.focus();};
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const startDate = new Date(start), endDate = new Date(end);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
      setValidation("Escolha início e fim válidos. O fim deve ser depois do início."); return;
    }
    setValidation(null); await onConfirm(startDate.toISOString(), endDate.toISOString());
  }
  return <dialog ref={dialog} aria-labelledby="appointment-time-title" onCancel={event => {event.preventDefault(); if (!busy) onDismiss();}}
    className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-5 text-[var(--cliente-card-text)] shadow-xl backdrop:bg-slate-950/40">
    <form onSubmit={event => void submit(event)} className="space-y-4">
      <div><h2 id="appointment-time-title" className="text-lg font-bold">Definir data e horário</h2><p className="mt-1 text-sm">{appointment.title || "Compromisso com o cliente"}</p><p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Escolha o horário combinado com o cliente. Horário local do seu dispositivo.</p></div>
      <label className="block text-sm font-semibold">Início<CrmInput required type="datetime-local" value={start} onChange={event => setStart(event.target.value)} disabled={busy} className="mt-1 w-full" /></label>
      <label className="block text-sm font-semibold">Fim<CrmInput required type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} disabled={busy} className="mt-1 w-full" /></label>
      {validation || error ? <p role="alert" className="text-sm text-[var(--cliente-danger)]">{validation || error}</p> : null}
      <div className="flex justify-end gap-2"><CrmButton type="button" onClick={onDismiss} disabled={busy}>Voltar</CrmButton><CrmButton type="submit" tone="primary" disabled={busy}>{busy ? "Salvando…" : "Agendar"}</CrmButton></div>
    </form>
  </dialog>;
}
