"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Video,
  XCircle,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmInput,
  CrmMetric,
  CrmNotice,
  CrmPanel,
  CrmSectionTitle,
  CrmSelect,
  CrmTextarea,
  CrmWorkspace,
  formatCrmDate,
  toCrmDate,
} from "@/app/cliente/painel/components/crm-workspace";

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

const typeOptions = [
  { value: "reuniao", label: "Reuniao" },
  { value: "call", label: "Ligacao" },
  { value: "demo", label: "Demonstracao" },
  { value: "visita", label: "Visita" },
];

function makeDefaultStart() {
  const date = new Date();
  date.setMinutes(date.getMinutes() + 60);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

function isOpen(item: AppointmentItem) {
  return item.status !== "completed" && item.status !== "canceled" && item.status !== "no_show";
}

function isToday(value?: string | null) {
  const date = toCrmDate(value);
  if (!date) return false;
  return date.toDateString() === new Date().toDateString();
}

function isPastOpen(item: AppointmentItem) {
  const date = toCrmDate(item.startAt);
  return Boolean(date && isOpen(item) && date.getTime() < Date.now());
}

function statusTone(status?: string) {
  if (status === "completed") return "green" as const;
  if (status === "canceled" || status === "no_show") return "red" as const;
  if (status === "confirmed") return "blue" as const;
  return "orange" as const;
}

function statusLabel(status?: string) {
  if (status === "completed") return "concluido";
  if (status === "confirmed") return "confirmado";
  if (status === "canceled") return "cancelado";
  if (status === "no_show") return "nao compareceu";
  return "marcado";
}

export default function ClienteAgendaPage() {
  const searchParams = useSearchParams();
  const leadIdFromQuery = searchParams.get("leadId") || "";
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("edit_leads");

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setLoading(true);
    setError(null);
    try {
      const [appointmentsRes, leadsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/appointments`),
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
      ]);
      const appointmentsPayload = (await appointmentsRes.json()) as { items?: AppointmentItem[]; error?: string };
      const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
      if (!appointmentsRes.ok || !leadsRes.ok || appointmentsPayload.error || leadsPayload.error) {
        throw new Error(appointmentsPayload.error || leadsPayload.error || "Falha ao carregar agenda.");
      }
      setAppointments(appointmentsPayload.items || []);
      setLeads(leadsPayload.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar agenda.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (leadIdFromQuery) setForm((current) => ({ ...current, leadId: leadIdFromQuery }));
  }, [leadIdFromQuery]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === form.leadId), [form.leadId, leads]);
  const upcoming = appointments.filter(isOpen);
  const todayCount = appointments.filter((item) => isOpen(item) && isToday(item.startAt)).length;
  const completedCount = appointments.filter((item) => item.status === "completed").length;
  const overdueCount = appointments.filter(isPastOpen).length;
  const confirmationCount = appointments.filter((item) => item.status === "scheduled").length;
  const nextAppointment = upcoming
    .filter((item) => !isPastOpen(item))
    .sort((a, b) => (toCrmDate(a.startAt)?.getTime() || 0) - (toCrmDate(b.startAt)?.getTime() || 0))[0] || null;

  const filteredAppointments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return appointments
      .filter((item) => {
        if (status === "open" && !isOpen(item)) return false;
        if (status !== "all" && status !== "open" && item.status !== status) return false;
        if (!term) return true;
        return `${item.title || ""} ${item.leadName || ""} ${item.leadCompany || ""} ${item.ownerName || ""}`.toLowerCase().includes(term);
      })
      .sort((a, b) => (toCrmDate(a.startAt)?.getTime() || 0) - (toCrmDate(b.startAt)?.getTime() || 0));
  }, [appointments, search, status]);

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
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
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao criar compromisso.");
      setForm({ leadId: leadIdFromQuery || "", title: "", type: "reuniao", startAt: makeDefaultStart(), location: "", meetingUrl: "", notes: "" });
      setNotice("Compromisso criado na agenda.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar compromisso.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(appointmentId: string, nextStatus: string) {
    if (!tenant?.tenantId || !canOperate) return;
    setBusyId(appointmentId);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar compromisso.");
      setNotice("Agenda atualizada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar compromisso.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CrmWorkspace className="agenda-refined">
      <CrmHero
        active="Agenda"
        title="Agenda que protege vendas e proximos passos."
        description="Compromissos, confirmacoes e retornos conectados aos clientes."
        assistantTitle="Preparacao comercial"
        assistantSubtitle="Antes da conversa"
        assistantText="A Altum mantem cada compromisso ligado ao cliente certo para o time chegar com contexto."
        action={
          <CrmButton type="button" onClick={loadData}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </CrmButton>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CrmMetric label="Hoje" value={String(todayCount)} detail="compromissos abertos" icon={CalendarDays} tone="blue" />
          <CrmMetric label="Proximos" value={String(upcoming.length)} detail="agenda futura" icon={Clock3} tone="orange" />
          <CrmMetric label="Concluidos" value={String(completedCount)} detail="historico recente" icon={CheckCircle2} tone="green" />
          <CrmMetric label="Atrasados" value={String(overdueCount)} detail="precisam decisao" icon={AlertTriangle} tone={overdueCount ? "red" : "green"} />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      <AgendaCommandCenter
        nextAppointment={nextAppointment}
        overdueCount={overdueCount}
        todayCount={todayCount}
        confirmationCount={confirmationCount}
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <CrmPanel padded={false} className="overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-5">
            <CrmSectionTitle eyebrow="Agenda" title="Compromissos" description="Confirme, conclua ou reagende sem perder contexto." />
            <div className="mt-5 flex flex-col gap-3 lg:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-muted)]" />
                <CrmInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar compromisso, cliente, empresa..." className="w-full pl-9" />
              </div>
              <CrmSelect value={status} onChange={(event) => setStatus(event.target.value)} className="lg:w-[220px]">
                <option value="open">Abertos</option>
                <option value="scheduled">Marcados</option>
                <option value="confirmed">Confirmados</option>
                <option value="completed">Concluidos</option>
                <option value="canceled">Cancelados</option>
                <option value="all">Todos</option>
              </CrmSelect>
            </div>
          </div>

          <div className="divide-y divide-[var(--cliente-border)]">
            {loading ? <div className="p-5"><CrmEmpty title="Carregando agenda" /></div> : null}
            {!loading && filteredAppointments.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhum compromisso encontrado" /></div> : null}
            {filteredAppointments.map((item) => (
              <article key={item.id} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--cliente-surface-muted)] lg:grid-cols-[minmax(0,1fr)_190px_210px] lg:items-center">
                <div className="min-w-0">
                  <CrmAvatar name={item.leadName || item.title || "Compromisso"} subtitle={item.leadCompany || item.ownerName || "Sem empresa"} />
                  <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{item.title || "Compromisso comercial"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CrmBadge tone={statusTone(item.status)}>{statusLabel(item.status)}</CrmBadge>
                    {item.location ? <CrmBadge><MapPin className="mr-1 h-3 w-3" />{item.location}</CrmBadge> : null}
                    {item.meetingUrl ? <CrmBadge tone="blue"><Video className="mr-1 h-3 w-3" />online</CrmBadge> : null}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Quando</p>
                  <p className="mt-1 text-sm font-bold text-[var(--cliente-card-text)]">{formatCrmDate(item.startAt, "Sem horario")}</p>
                  {item.ownerName ? <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.ownerName}</p> : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {item.leadId ? (
                    <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center justify-center rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                      Ficha
                    </Link>
                  ) : null}
                  {item.leadId ? (
                    <Link href={`/cliente/painel/reunioes-assistidas?appointmentId=${encodeURIComponent(item.id)}&leadId=${encodeURIComponent(item.leadId)}`} className="inline-flex items-center justify-center rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] hover:bg-[var(--cliente-panel-soft)]">
                      IA da reuniao
                    </Link>
                  ) : null}
                  {canOperate && item.status === "scheduled" ? (
                    <CrmButton type="button" disabled={busyId === item.id} onClick={() => updateStatus(item.id, "confirmed")}>Confirmar</CrmButton>
                  ) : null}
                  {canOperate && isOpen(item) ? (
                    <CrmButton type="button" tone="green" disabled={busyId === item.id} onClick={() => updateStatus(item.id, "completed")}>
                      {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Concluir
                    </CrmButton>
                  ) : null}
                  {canOperate && isOpen(item) ? (
                    <CrmButton type="button" tone="danger" disabled={busyId === item.id} onClick={() => updateStatus(item.id, "canceled")}>
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </CrmButton>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </CrmPanel>

        <CrmPanel className="xl:sticky xl:top-[132px] xl:self-start">
          <CrmSectionTitle eyebrow="Novo" title="Criar compromisso" description="Vincule uma reuniao ou ligacao a um contato." action={!canOperate ? <CrmBadge tone="orange">somente leitura</CrmBadge> : null} />
          <form onSubmit={createAppointment} className="mt-5 space-y-3">
            <CrmSelect value={form.leadId} onChange={(event) => setForm((current) => ({ ...current, leadId: event.target.value }))} disabled={!canOperate} className="w-full">
              <option value="">Sem contato vinculado</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.nome || "Contato"} {lead.empresa ? `- ${lead.empresa}` : ""}</option>
              ))}
            </CrmSelect>
            <CrmInput value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} disabled={!canOperate} placeholder="Titulo do compromisso" className="w-full" />
            <div className="grid gap-3 md:grid-cols-2">
              <CrmSelect value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} disabled={!canOperate} className="w-full">
                {typeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </CrmSelect>
              <CrmInput type="datetime-local" value={form.startAt} onChange={(event) => setForm((current) => ({ ...current, startAt: event.target.value }))} disabled={!canOperate} className="w-full" />
            </div>
            <CrmInput value={form.location} onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} disabled={!canOperate} placeholder="Local ou cidade" className="w-full" />
            <CrmInput value={form.meetingUrl} onChange={(event) => setForm((current) => ({ ...current, meetingUrl: event.target.value }))} disabled={!canOperate} placeholder="Link da reuniao" className="w-full" />
            <CrmTextarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Notas para preparar a conversa" rows={4} className="w-full" />
            <CrmButton type="submit" tone="primary" disabled={!canOperate || saving || !form.title.trim() || !form.startAt} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar na agenda
            </CrmButton>
          </form>
        </CrmPanel>
      </section>
    </CrmWorkspace>
  );
}

function AgendaCommandCenter({
  nextAppointment,
  overdueCount,
  todayCount,
  confirmationCount,
}: {
  nextAppointment: AppointmentItem | null;
  overdueCount: number;
  todayCount: number;
  confirmationCount: number;
}) {
  const leadId = nextAppointment?.leadId || "";

  return (
    <CrmPanel className="p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <CrmSectionTitle
            eyebrow="Hoje"
            title="Comando da agenda"
            description="O que precisa acontecer para reunioes e retornos virarem avanco comercial."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <AgendaSignal icon={CalendarDays} label="Hoje" value={String(todayCount)} detail="compromissos abertos" tone="blue" />
            <AgendaSignal icon={AlertTriangle} label="Atrasados" value={String(overdueCount)} detail="reagendar ou concluir" tone={overdueCount ? "red" : "green"} />
            <AgendaSignal icon={Target} label="Confirmar" value={String(confirmationCount)} detail="evitar no-show" tone={confirmationCount ? "orange" : "green"} />
          </div>
        </div>

        <div className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Proximo compromisso</p>
              <p className="mt-2 truncate text-base font-black text-[var(--cliente-card-text)]">
                {nextAppointment?.title || nextAppointment?.leadName || "Nada marcado agora"}
              </p>
              <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">
                {nextAppointment
                  ? `${formatCrmDate(nextAppointment.startAt, "Sem horario")} ${nextAppointment.leadCompany ? `| ${nextAppointment.leadCompany}` : ""}`
                  : "Quando uma reuniao for criada, ela aparece aqui com atalho para a ficha."}
              </p>
            </div>
            <CrmBadge tone={nextAppointment ? statusTone(nextAppointment.status) : "neutral"}>
              {nextAppointment ? statusLabel(nextAppointment.status) : "livre"}
            </CrmBadge>
          </div>

          {nextAppointment ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {leadId ? (
                <Link
                  href={`/cliente/painel/crm?leadId=${encodeURIComponent(leadId)}`}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-xs font-black text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  Ficha
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {leadId ? (
                <Link
                  href={`/cliente/painel/inbox?leadId=${encodeURIComponent(leadId)}`}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-xs font-black text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  Conversa
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {nextAppointment.meetingUrl ? (
                <Link
                  href={nextAppointment.meetingUrl}
                  target="_blank"
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-3 py-2.5 text-xs font-black text-white transition hover:bg-[var(--cliente-primary-hover)]"
                >
                  Abrir reuniao
                  <Video className="h-3.5 w-3.5" />
                </Link>
              ) : null}
              {leadId ? (
                <Link
                  href={`/cliente/painel/reunioes-assistidas?appointmentId=${encodeURIComponent(nextAppointment.id)}&leadId=${encodeURIComponent(leadId)}`}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-xs font-black text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  Preparar com IA
                  <Sparkles className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </CrmPanel>
  );
}

function AgendaSignal({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
  tone: "blue" | "green" | "orange" | "red";
}) {
  return (
    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 text-2xl font-black text-[var(--cliente-card-text)]">{value}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
        </div>
        <span className={`inline-flex rounded-[14px] border p-2 ${tone === "green" ? "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]" : tone === "orange" ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]" : tone === "red" ? "border-[color:color-mix(in_srgb,var(--cliente-danger)_22%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]" : "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}
