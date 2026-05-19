"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  Search,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  ClientActionButton,
  EmptyState,
  MetricCard,
  PanelCard,
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

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Marcado" },
  { value: "confirmed", label: "Confirmado" },
  { value: "completed", label: "Concluido" },
  { value: "canceled", label: "Cancelado" },
  { value: "no_show", label: "Nao compareceu" },
] as const;

const TYPE_OPTIONS = [
  { value: "reuniao", label: "Reuniao" },
  { value: "call", label: "Ligacao" },
  { value: "demo", label: "Demonstracao" },
  { value: "visita", label: "Visita" },
] as const;

function formatDateTime(value?: string | null) {
  if (!value) return "Sem horario";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status?: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || "Marcado";
}

function typeLabel(type?: string) {
  return TYPE_OPTIONS.find((item) => item.value === type)?.label || "Reuniao";
}

function statusTone(status?: string) {
  if (status === "completed") return "success" as const;
  if (status === "canceled" || status === "no_show") return "danger" as const;
  if (status === "confirmed") return "info" as const;
  return "warning" as const;
}

function isSameDay(value?: string | null) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

function isOpenAppointment(item: AppointmentItem) {
  return item.status !== "completed" && item.status !== "canceled" && item.status !== "no_show";
}

function appointmentTime(item: AppointmentItem) {
  return item.startAt ? new Date(item.startAt).getTime() : 0;
}

function makeDefaultStart() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 60);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export default function ClienteAgendaPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadIdFromQuery = searchParams.get("leadId") || "";
  const viewFromQuery = searchParams.get("view") || "today";
  const canOperate = hasCapability("edit_leads");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [view, setView] = useState(viewFromQuery);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    leadId: leadIdFromQuery,
    title: "",
    type: "reuniao",
    startAt: makeDefaultStart(),
    location: "",
    meetingUrl: "",
    notes: "",
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
    const nextView = ["today", "next", "confirm", "done", "all"].includes(viewFromQuery) ? viewFromQuery : "today";
    setView((current) => (current === nextView ? current : nextView));
  }, [viewFromQuery]);

  useEffect(() => {
    if (!leadIdFromQuery) return;
    setForm((current) => (current.leadId === leadIdFromQuery ? current : { ...current, leadId: leadIdFromQuery }));
  }, [leadIdFromQuery]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => appointmentTime(a) - appointmentTime(b));
  }, [items]);

  const now = Date.now();
  const nextSevenDays = now + 7 * 24 * 60 * 60 * 1000;

  const summary = useMemo(() => {
    const open = items.filter(isOpenAppointment);
    return {
      today: open.filter((item) => isSameDay(item.startAt)).length,
      next: open.filter((item) => {
        const time = appointmentTime(item);
        return time > now && time <= nextSevenDays;
      }).length,
      confirm: open.filter((item) => item.status === "scheduled").length,
      done: items.filter((item) => item.status === "completed").length,
    };
  }, [items, nextSevenDays, now]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sortedItems.filter((item) => {
      if (view === "today" && !isSameDay(item.startAt)) return false;
      if (view === "next") {
        const time = appointmentTime(item);
        if (!isOpenAppointment(item) || time <= now || time > nextSevenDays) return false;
      }
      if (view === "confirm" && item.status !== "scheduled") return false;
      if (view === "done" && item.status !== "completed") return false;
      if (term) {
        const haystack = `${item.title || ""} ${item.leadName || ""} ${item.leadCompany || ""} ${item.ownerName || ""} ${item.location || ""}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [nextSevenDays, now, search, sortedItems, view]);

  const ownerOptions = useMemo(() => {
    return Array.from(
      new Map(
        leads
          .filter((lead) => lead.ownerId)
          .map((lead) => [String(lead.ownerId), String(lead.owner || "Responsavel")] as const)
      )
    ).map(([value, label]) => ({ value, label }));
  }, [leads]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === form.leadId), [form.leadId, leads]);

  function setViewAndUrl(nextView: string) {
    setView(nextView);
    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextView);
    router.replace(`/cliente/painel/agenda?${next.toString()}`);
  }

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
          leadId: form.leadId || null,
          title: form.title.trim(),
          type: form.type,
          status: "scheduled",
          startAt: form.startAt,
          endAt: null,
          location: form.location || null,
          meetingUrl: form.meetingUrl || null,
          notes: form.notes || null,
          ownerUserId: selectedLead?.ownerId || null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setError(payload.error || "Falha ao criar compromisso.");
        return;
      }

      setForm({
        leadId: leadIdFromQuery || "",
        title: "",
        type: "reuniao",
        startAt: makeDefaultStart(),
        location: "",
        meetingUrl: "",
        notes: "",
      });
      setNotice("Compromisso criado na agenda.");
      await loadData();
    } catch {
      setError("Falha ao criar compromisso.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointmentId: string, status: string) {
    if (!tenant?.tenantId || !canOperate) return;
    try {
      setBusyId(appointmentId);
      setError(null);
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar compromisso.");
        return;
      }
      setNotice("Agenda atualizada.");
      await loadData();
    } catch {
      setError("Falha ao atualizar compromisso.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="agenda-refined client-daily-page space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,#2563eb_18%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,#eff6ff_86%,var(--cliente-card)),color-mix(in_srgb,#ecfdf5_68%,var(--cliente-panel-soft)))] p-5 shadow-[0_24px_70px_-48px_rgba(37,99,235,0.5)] md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Agenda" tone="info" />
              <StateBadge label="Compromissos e reunioes" tone="success" />
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--cliente-card-text)] md:text-5xl">
              O que esta marcado, quem precisa confirmar e qual compromisso vem agora.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)] md:text-base">
              Uma agenda simples para o time saber onde entrar, quem atender e quando concluir cada compromisso.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/cliente/painel/follow-ups" className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
              Ver retornos
            </Link>
            <Link href="/cliente/painel/crm" className="inline-flex items-center gap-2 rounded-[16px] bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1d4ed8]">
              Abrir clientes
            </Link>
          </div>
        </div>
      </section>

      {error ? <div className="rounded-[22px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-[22px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Hoje" value={String(summary.today)} icon={CalendarDays} trend="compromissos do dia" tone="brand" />
        <MetricCard label="Proximos 7 dias" value={String(summary.next)} icon={Clock3} trend="agenda futura" tone="neutral" />
        <MetricCard label="Para confirmar" value={String(summary.confirm)} icon={CalendarClock} trend="ainda nao confirmado" tone={summary.confirm ? "warning" : "success"} />
        <MetricCard label="Concluidos" value={String(summary.done)} icon={CheckCircle2} trend="reunioes finalizadas" tone="success" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle title="Compromissos" subtitle="Escolha um recorte e execute a agenda." />
            <label className="flex min-w-[240px] items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, empresa ou local"
                className="w-full bg-transparent text-sm text-[var(--cliente-card-text)] outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-5">
            {[
              { value: "today", label: "Hoje" },
              { value: "next", label: "Proximos" },
              { value: "confirm", label: "Confirmar" },
              { value: "done", label: "Concluidos" },
              { value: "all", label: "Todos" },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setViewAndUrl(option.value)}
                className={`rounded-[16px] border px-3 py-2.5 text-sm font-bold transition ${
                  view === option.value
                    ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_11%,var(--cliente-card))] text-[#2563eb]"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-hover)]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            {filteredItems.length ? (
              filteredItems.map((item) => (
                <article key={item.id} className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:bg-[var(--cliente-surface-hover)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-black text-[var(--cliente-card-text)]">{item.title || typeLabel(item.type)}</p>
                        <StateBadge label={statusLabel(item.status)} tone={statusTone(item.status)} />
                      </div>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                        {formatDateTime(item.startAt)} {item.leadName ? `| ${item.leadName}` : ""}
                      </p>
                    </div>
                    <StateBadge label={typeLabel(item.type)} tone="info" />
                  </div>

                  <div className="mt-3 grid gap-2 md:grid-cols-3">
                    <InfoPill icon={UserRound} label={item.ownerName || "Sem responsavel"} />
                    <InfoPill icon={MapPin} label={item.location || "Sem local definido"} />
                    <InfoPill icon={Video} label={item.meetingUrl ? "Link de reuniao pronto" : "Sem link de reuniao"} />
                  </div>

                  {item.notes ? <p className="mt-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{item.notes}</p> : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.leadId ? (
                      <>
                        <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
                          Abrir cliente
                        </Link>
                        <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(item.leadId)}`} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
                          Ver conversa
                        </Link>
                      </>
                    ) : null}
                    {item.meetingUrl ? (
                      <a href={item.meetingUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-[#2563eb]/25 bg-[#2563eb]/10 px-3 py-2 text-xs font-bold text-[#2563eb] transition hover:bg-[#2563eb]/15">
                        Entrar na reuniao
                      </a>
                    ) : null}
                    {canOperate && item.status !== "completed" ? (
                      <button type="button" onClick={() => void updateStatus(item.id, "completed")} disabled={busyId === item.id} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60">
                        {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Concluir
                      </button>
                    ) : null}
                    {canOperate && item.status === "scheduled" ? (
                      <button type="button" onClick={() => void updateStatus(item.id, "confirmed")} disabled={busyId === item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)] disabled:opacity-60">
                        Confirmar
                      </button>
                    ) : null}
                    {canOperate && isOpenAppointment(item) ? (
                      <button type="button" onClick={() => void updateStatus(item.id, "canceled")} disabled={busyId === item.id} className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 transition hover:bg-red-500/15 disabled:opacity-60">
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Nada neste recorte" description="Troque o filtro ou crie um compromisso para o cliente certo." />
            )}
          </div>
        </PanelCard>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="brand" className="p-5">
            <form onSubmit={createAppointment} className="space-y-3">
              <CardTitle title="Marcar compromisso" subtitle="Poucos campos, sem complicar a rotina." />
              <select
                value={form.leadId}
                onChange={(event) => {
                  const nextLeadId = event.target.value;
                  const lead = leads.find((item) => item.id === nextLeadId);
                  setForm((current) => ({
                    ...current,
                    leadId: nextLeadId,
                    title: current.title || (lead?.nome ? `Reuniao com ${lead.nome}` : current.title),
                  }));
                }}
                disabled={!canOperate}
                className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none"
              >
                <option value="">Sem cliente vinculado</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.nome || "Cliente"} {lead.empresa ? `- ${lead.empresa}` : ""}
                  </option>
                ))}
              </select>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                disabled={!canOperate}
                placeholder="Ex: Reuniao de fechamento"
                className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} disabled={!canOperate} className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none">
                  {TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input type="datetime-local" value={form.startAt} onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))} disabled={!canOperate} className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none" />
              </div>
              <input value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} disabled={!canOperate} placeholder="Local ou cidade" className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none" />
              <input value={form.meetingUrl} onChange={(event) => setForm((current) => ({ ...current, meetingUrl: event.target.value }))} disabled={!canOperate} placeholder="Link da reuniao, se tiver" className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none" />
              <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="O que precisa ser lembrado antes da conversa?" rows={4} className="client-input w-full rounded-2xl border px-3 py-2.5 text-sm outline-none" />
              <ClientActionButton type="submit" tone="primary" disabled={!canOperate || saving || !form.title.trim() || !form.startAt} className="w-full justify-center">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Salvar na agenda
              </ClientActionButton>
            </form>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Responsaveis" subtitle="Use para conferir quem esta cuidando dos clientes." />
            <div className="mt-4 space-y-2">
              {ownerOptions.length ? (
                ownerOptions.slice(0, 6).map((owner) => (
                  <div key={owner.value} className="flex items-center justify-between rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
                    <span className="text-sm font-bold text-[var(--cliente-card-text)]">{owner.label}</span>
                    <StateBadge label="time" tone="neutral" />
                  </div>
                ))
              ) : (
                <p className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
                  Os responsaveis aparecem quando os clientes forem atribuidos no CRM.
                </p>
              )}
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function InfoPill({ icon: Icon, label }: { icon: typeof UserRound; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)]">
      <Icon className="h-4 w-4 text-[#2563eb]" />
      <span className="truncate">{label}</span>
    </div>
  );
}
