"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type LeadItem = {
  id: string;
  nome?: string;
  empresa?: string;
  owner?: string;
  ownerId?: string;
};

type AppointmentItem = {
  id: string;
  leadId?: string | null;
  leadName?: string | null;
  leadCompany?: string | null;
  title?: string;
  type?: string;
  status?: string;
  startAt?: string;
  endAt?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  notes?: string | null;
  ownerUserId?: string | null;
  ownerName?: string | null;
};

function formatDateTime(value?: string | null) {
  if (!value) return "Sem horario";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toStatusTone(status?: string) {
  if (status === "completed") return "success" as const;
  if (status === "canceled" || status === "no_show") return "danger" as const;
  if (status === "confirmed") return "info" as const;
  return "warning" as const;
}

export default function ClienteAgendaPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode } = useClienteShell();
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromQuery = searchParams.get("status") || "all";
  const ownerFromQuery = searchParams.get("owner") || "all";
  const canOperate = hasCapability("edit_leads");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [statusFilter, setStatusFilter] = useState(statusFromQuery || "all");
  const [ownerFilter, setOwnerFilter] = useState(ownerFromQuery || "all");
  const [form, setForm] = useState({
    leadId: "",
    title: "",
    type: "reuniao",
    status: "scheduled",
    startAt: "",
    endAt: "",
    location: "",
    meetingUrl: "",
    notes: "",
    ownerUserId: "",
  });

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    try {
      setLoading(true);
      setError(null);
      const [appointmentsRes, leadsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/appointments`),
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
      ]);
      const appointmentsPayload = (await appointmentsRes.json()) as { items?: AppointmentItem[]; error?: string };
      const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };

      if (!appointmentsRes.ok || !leadsRes.ok) {
        setError(appointmentsPayload.error || leadsPayload.error || "Falha ao carregar agenda.");
        return;
      }
      setItems(appointmentsPayload.items || []);
      setLeads(leadsPayload.items || []);
    } catch {
      setError("Falha ao carregar agenda.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (ownerFilter !== "all") next.set("owner", ownerFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/agenda?${nextQuery}` : "/cliente/painel/agenda");
  }, [ownerFilter, router, searchParams, statusFilter]);

  const summary = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return {
      total: items.length,
      today: items.filter((item) => {
        const date = item.startAt ? new Date(item.startAt).getTime() : 0;
        return date > 0 && date <= today.getTime() && item.status !== "completed" && item.status !== "canceled";
      }).length,
      upcoming: items.filter((item) => {
        const date = item.startAt ? new Date(item.startAt).getTime() : 0;
        return date > now && item.status !== "completed" && item.status !== "canceled";
      }).length,
      completed: items.filter((item) => item.status === "completed").length,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (ownerFilter !== "all" && item.ownerUserId !== ownerFilter) return false;
      return true;
    });
  }, [items, ownerFilter, statusFilter]);

  const ownerOptions = useMemo(() => {
    return Array.from(
      new Map(
        [
          ...items
            .filter((item) => item.ownerUserId)
            .map((item) => [String(item.ownerUserId), String(item.ownerName || "Sem responsavel")] as const),
          ...leads
            .filter((item) => item.ownerId)
            .map((item) => [String(item.ownerId), String(item.owner || "Sem responsavel")] as const),
        ]
      )
    ).map(([value, label]) => ({ value, label }));
  }, [items, leads]);

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          leadId: form.leadId || null,
          endAt: form.endAt || null,
          location: form.location || null,
          meetingUrl: form.meetingUrl || null,
          notes: form.notes || null,
          ownerUserId: form.ownerUserId || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar agendamento.");
        return;
      }
      setForm({
        leadId: "",
        title: "",
        type: "reuniao",
        status: "scheduled",
        startAt: "",
        endAt: "",
        location: "",
        meetingUrl: "",
        notes: "",
        ownerUserId: "",
      });
      setNotice("Agendamento criado.");
      await loadData();
    } catch {
      setError("Falha ao criar agendamento.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointmentId: string, status: string) {
    if (!tenant?.tenantId || !canOperate) return;
    const res = await authedFetch(`/api/tenant/${tenant.tenantId}/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(payload.error || "Falha ao atualizar agendamento.");
      return;
    }
    setNotice("Agendamento atualizado.");
    await loadData();
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Agenda"
        subtitle="Reunioes, agendamentos e slots operacionais ligados aos leads do tenant."
        action={<StateBadge label="Agenda comercial" tone="info" />}
      />

      {error ? <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Agendamentos" value={String(summary.total)} icon={CalendarClock} trend="historico do tenant" />
        <MetricCard label="Hoje" value={String(summary.today)} icon={Clock3} trend="pedem acompanhamento" />
        <MetricCard label="Proximos" value={String(summary.upcoming)} icon={Video} trend="janela futura" />
        <MetricCard label="Concluidos" value={String(summary.completed)} icon={CheckCircle2} trend="ciclo fechado" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {experienceMode === "completo" ? (
        <PanelCard className="p-5">
          <form onSubmit={createAppointment} className="space-y-3">
            <CardTitle title="Novo agendamento" subtitle="Reuniao, call de fechamento ou atendimento operacional." />
            <select
              value={form.leadId}
              onChange={(event) => {
                const nextLeadId = event.target.value;
                const lead = leads.find((item) => item.id === nextLeadId);
                setForm((current) => ({
                  ...current,
                  leadId: nextLeadId,
                  ownerUserId: current.ownerUserId || lead?.ownerId || "",
                  title: current.title || (lead?.nome ? `Reuniao com ${lead.nome}` : current.title),
                }));
              }}
              disabled={!canOperate}
              className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
            >
              <option value="">Sem lead vinculado</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.nome || "Lead"} {lead.empresa ? `• ${lead.empresa}` : ""}
                </option>
              ))}
            </select>
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              disabled={!canOperate}
              placeholder="Ex: Reuniao de fechamento"
              className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none">
                <option value="reuniao">reuniao</option>
                <option value="call">call</option>
                <option value="demo">demo</option>
                <option value="visita">visita</option>
              </select>
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none">
                <option value="scheduled">scheduled</option>
                <option value="confirmed">confirmed</option>
                <option value="completed">completed</option>
                <option value="canceled">canceled</option>
                <option value="no_show">no_show</option>
              </select>
              <select value={form.ownerUserId} onChange={(event) => setForm((current) => ({ ...current, ownerUserId: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none">
                <option value="">Responsavel automatico</option>
                {ownerOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="datetime-local" value={form.startAt} onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
              <input type="datetime-local" value={form.endAt} onChange={(event) => setForm((current) => ({ ...current, endAt: event.target.value }))} disabled={!canOperate} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
            </div>
            <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} disabled={!canOperate} placeholder="Local ou sala" className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
            <input value={form.meetingUrl} onChange={(event) => setForm((current) => ({ ...current, meetingUrl: event.target.value }))} disabled={!canOperate} placeholder="https://meet.google.com/..." className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Observacoes operacionais do encontro" rows={4} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none" />
            <button type="submit" disabled={!canOperate || saving || !form.title.trim() || !form.startAt} className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--cliente-accent-strong)] disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar agendamento
            </button>
          </form>
        </PanelCard>
        ) : (
          <PanelCard className="p-5">
            <CardTitle title="Criacao rapida" subtitle="Modo essencial ativo: formulario completo oculto para reduzir ruido." />
            <p className="mt-3 text-sm text-[var(--cliente-card-text-soft)]">
              Troque para modo completo no topo para criar agendamento com todos os campos.
            </p>
          </PanelCard>
        )}

        <PanelCard className="p-5">
          <CardTitle title="Agenda operacional" subtitle="Acompanhamento por status e ownership." />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none">
              <option value="all">Todos os status</option>
              <option value="scheduled">scheduled</option>
              <option value="confirmed">confirmed</option>
              <option value="completed">completed</option>
              <option value="canceled">canceled</option>
              <option value="no_show">no_show</option>
            </select>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2.5 text-sm text-white outline-none">
              <option value="all">Todos os responsaveis</option>
              {ownerOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 space-y-3">
            {filteredItems.length === 0 ? (
              <EmptyState title="Nenhum agendamento neste recorte" description="Crie a primeira reuniao para ligar comercial, CRM e follow-up numa agenda real." />
            ) : (
              filteredItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title || "Agendamento"}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-white/42">
                        {item.leadName || "Sem lead"} • {formatDateTime(item.startAt)}
                      </p>
                    </div>
                    <StateBadge label={item.status || "scheduled"} tone={toStatusTone(item.status)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/56">
                    {item.ownerName ? <span>{item.ownerName}</span> : null}
                    {item.type ? <span>• {item.type}</span> : null}
                    {item.location ? <span>• {item.location}</span> : null}
                  </div>
                  {item.notes ? <p className="mt-3 text-sm text-white/60">{item.notes}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.leadId ? (
                      <>
                        <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/82 transition hover:bg-white/[0.06]">
                          Abrir lead
                        </Link>
                        <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/82 transition hover:bg-white/[0.06]">
                          Ver conversa
                        </Link>
                      </>
                    ) : null}
                    {item.meetingUrl ? (
                      <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/82 transition hover:bg-white/[0.06]">
                        Abrir reuniao
                      </a>
                    ) : null}
                  </div>
                  {canOperate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {["scheduled", "confirmed", "completed", "canceled", "no_show"].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => void updateStatus(item.id, status)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            item.status === status
                              ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent)]/10 text-[var(--cliente-accent)]"
                              : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

