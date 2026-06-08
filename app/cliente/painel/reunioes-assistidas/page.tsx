"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
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
} from "@/app/cliente/painel/components/crm-workspace";

type LeadItem = {
  id: string;
  nome?: string;
  empresa?: string;
  telefone?: string;
};

type AppointmentItem = {
  id: string;
  leadId?: string | null;
  leadName?: string | null;
  leadCompany?: string | null;
  title?: string;
  status?: string;
  startAt?: string;
  meetingUrl?: string | null;
  notes?: string | null;
};

type MeetingSummary = {
  executiveSummary: string;
  leadNeed: string;
  painPoints: string[];
  objections: string[];
  buyingSignals: string[];
  nextSteps: string[];
  sellerCoaching: string[];
  followUpMessage: string;
  crmUpdate: string;
  qualification: {
    temperature: "frio" | "morno" | "quente";
    confidence: number;
    recommendedStage: string;
  };
};

type AssistedMeeting = {
  id: string;
  appointmentId?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  title?: string;
  objective?: string;
  language?: string;
  meetingUrl?: string | null;
  summary?: MeetingSummary | null;
  markdown?: string;
  createdAt?: string | null;
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function statusLabel(status?: string) {
  if (status === "completed") return "concluida";
  if (status === "confirmed") return "confirmada";
  if (status === "canceled") return "cancelada";
  if (status === "no_show") return "nao compareceu";
  return "marcada";
}

function temperatureTone(value?: string) {
  if (value === "quente") return "green" as const;
  if (value === "frio") return "blue" as const;
  return "orange" as const;
}

export default function AssistedMeetingsPage() {
  const searchParams = useSearchParams();
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("edit_leads");
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [sessions, setSessions] = useState<AssistedMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<AssistedMeeting | null>(null);
  const [form, setForm] = useState({
    appointmentId: searchParams.get("appointmentId") || "",
    leadId: searchParams.get("leadId") || "",
    title: "",
    objective: "Transformar a conversa em uma venda, proposta ou proximo passo claro.",
    language: "pt_BR",
    meetingUrl: "",
    notes: "",
    transcript: "",
  });

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [appointmentsRes, leadsRes, sessionsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/appointments`),
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
        authedFetch(`/api/tenant/${tenant.tenantId}/assisted-meetings`),
      ]);
      const appointmentsPayload = (await appointmentsRes.json().catch(() => ({}))) as { items?: AppointmentItem[]; error?: string };
      const leadsPayload = (await leadsRes.json().catch(() => ({}))) as { items?: LeadItem[]; error?: string };
      const sessionsPayload = (await sessionsRes.json().catch(() => ({}))) as { items?: AssistedMeeting[]; error?: string };
      if (!appointmentsRes.ok || !leadsRes.ok || !sessionsRes.ok) {
        throw new Error(appointmentsPayload.error || leadsPayload.error || sessionsPayload.error || "Falha ao carregar reunioes assistidas.");
      }
      setAppointments(appointmentsPayload.items || []);
      setLeads(leadsPayload.items || []);
      setSessions(sessionsPayload.items || []);
      setActiveSession((current) => current || sessionsPayload.items?.[0] || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar reunioes assistidas.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedAppointment = useMemo(
    () => appointments.find((item) => item.id === form.appointmentId) || null,
    [appointments, form.appointmentId]
  );
  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === (form.leadId || selectedAppointment?.leadId || "")) || null,
    [form.leadId, leads, selectedAppointment?.leadId]
  );

  useEffect(() => {
    if (!selectedAppointment) return;
    setForm((current) => ({
      ...current,
      leadId: current.leadId || selectedAppointment.leadId || "",
      title: current.title || selectedAppointment.title || "",
      meetingUrl: current.meetingUrl || selectedAppointment.meetingUrl || "",
    }));
  }, [selectedAppointment]);

  const pendingAppointments = appointments.filter((item) => item.status !== "completed" && item.status !== "canceled");
  const completedSessions = sessions.length;
  const hotSessions = sessions.filter((item) => item.summary?.qualification.temperature === "quente").length;
  const latest = sessions[0] || null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/assisted-meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: form.appointmentId || null,
          leadId: form.leadId || selectedAppointment?.leadId || null,
          title: form.title,
          objective: form.objective,
          language: form.language,
          meetingUrl: form.meetingUrl || selectedAppointment?.meetingUrl || null,
          transcript: form.transcript,
          notes: form.notes,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { item?: AssistedMeeting; error?: string };
      if (!res.ok || payload.error || !payload.item) throw new Error(payload.error || "Falha ao gerar resumo da reuniao.");
      setActiveSession(payload.item);
      setForm((current) => ({ ...current, transcript: "", notes: "" }));
      setNotice("Reuniao analisada, lead atualizado e brief salvo no CRM.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao gerar resumo da reuniao.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <CrmWorkspace className="assisted-meetings-refined">
      <CrmHero
        active="Reunioes IA"
        title="Reunioes assistidas por IA, do preparo ao follow-up."
        description="Transforme conversa comercial em resumo, coaching, proximo passo e atualizacao real do CRM."
        assistantTitle="Copiloto comercial"
        assistantSubtitle="Depois da chamada"
        assistantText="A Altum registra o que foi falado, identifica sinais de compra e deixa o vendedor com um roteiro claro para continuar."
        assistantBadge="novo"
        action={
          <CrmButton type="button" onClick={() => void loadData()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Atualizar
          </CrmButton>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <CrmMetric label="Reunioes abertas" value={String(pendingAppointments.length)} detail="Aguardando analise ou conclusao" icon={Video} tone="blue" />
          <CrmMetric label="Analisadas" value={String(completedSessions)} detail="Resumo salvo no CRM" icon={CheckCircle2} tone="green" />
          <CrmMetric label="Quentes" value={String(hotSessions)} detail="Sinais fortes de compra" icon={Sparkles} tone="orange" />
          <CrmMetric label="Ultima analise" value={latest ? formatCrmDate(latest.createdAt) : "Nenhuma"} detail={latest?.leadName || "Sem reuniao analisada"} icon={ClipboardList} tone="purple" />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <CrmPanel>
          <CrmSectionTitle
            eyebrow="Nova analise"
            title="Gerar resumo e atualizar o lead"
            description="Cole a transcricao da chamada ou anote os pontos principais. A Altum cria o documento e alimenta o CRM."
          />
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Reuniao da agenda</span>
                <CrmSelect
                  value={form.appointmentId}
                  onChange={(event) => setForm((current) => ({ ...current, appointmentId: event.target.value }))}
                >
                  <option value="">Selecionar reuniao</option>
                  {appointments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title || item.leadName || "Reuniao"} - {statusLabel(item.status)} - {formatCrmDate(item.startAt)}
                    </option>
                  ))}
                </CrmSelect>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Lead</span>
                <CrmSelect
                  value={form.leadId || selectedAppointment?.leadId || ""}
                  onChange={(event) => setForm((current) => ({ ...current, leadId: event.target.value }))}
                >
                  <option value="">Selecionar lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.nome || lead.empresa || lead.telefone || "Lead"}
                    </option>
                  ))}
                </CrmSelect>
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Titulo</span>
                <CrmInput value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Reuniao comercial" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Link da chamada</span>
                <CrmInput value={form.meetingUrl} onChange={(event) => setForm((current) => ({ ...current, meetingUrl: event.target.value }))} placeholder="Meet, Zoom ou WhatsApp" />
              </label>
            </div>

            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Objetivo comercial</span>
              <CrmTextarea
                value={form.objective}
                onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
                className="min-h-20"
                placeholder="Ex.: entender dor, validar investimento e conduzir para proposta."
              />
            </label>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Transcricao da reuniao</span>
                <CrmTextarea
                  value={form.transcript}
                  onChange={(event) => setForm((current) => ({ ...current, transcript: event.target.value }))}
                  className="min-h-64"
                  placeholder="Cole aqui a transcricao do Meet/Zoom, ou o que foi falado na reuniao..."
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Notas do vendedor</span>
                <CrmTextarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  className="min-h-64"
                  placeholder="Dores, objeccoes, combinados, valor falado, decisores, prazo..."
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--cliente-card-text)]">{selectedLead?.nome || selectedAppointment?.leadName || "Lead ainda nao selecionado"}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  {selectedLead?.empresa || selectedAppointment?.leadCompany || "Escolha um lead para salvar o resumo no CRM."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {clean(form.meetingUrl || selectedAppointment?.meetingUrl) ? (
                  <a
                    href={form.meetingUrl || selectedAppointment?.meetingUrl || "#"}
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-white px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Abrir chamada
                  </a>
                ) : null}
                <CrmButton type="submit" tone="purple" disabled={!canOperate || saving || !(form.transcript.trim() || form.notes.trim())}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  Gerar analise
                </CrmButton>
              </div>
            </div>
          </form>
        </CrmPanel>

        <div className="space-y-4">
          <CrmPanel>
            <CrmSectionTitle eyebrow="Resultado" title="Resumo gerado" description="O documento fica salvo no lead e aparece no historico comercial." />
            {activeSession?.summary ? (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <CrmBadge tone={temperatureTone(activeSession.summary.qualification.temperature)}>
                    {activeSession.summary.qualification.temperature}
                  </CrmBadge>
                  <CrmBadge tone="purple">{activeSession.summary.qualification.confidence}% confianca</CrmBadge>
                  <CrmBadge tone="blue">{activeSession.summary.qualification.recommendedStage}</CrmBadge>
                </div>
                <ResultBlock icon={FileText} title="Resumo executivo" text={activeSession.summary.executiveSummary} />
                <ResultList icon={Sparkles} title="Proximos passos" items={activeSession.summary.nextSteps} />
                <ResultList icon={MessageSquareText} title="Coaching do vendedor" items={activeSession.summary.sellerCoaching} />
                <ResultBlock icon={ClipboardList} title="Follow-up sugerido" text={activeSession.summary.followUpMessage} />
              </div>
            ) : (
              <div className="mt-4">
                <CrmEmpty title="Nenhuma analise selecionada" description="Gere a primeira reuniao assistida ou escolha uma do historico." />
              </div>
            )}
          </CrmPanel>

          <CrmPanel>
            <CrmSectionTitle eyebrow="Historico" title="Reunioes analisadas" />
            <div className="mt-4 space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => setActiveSession(session)}
                  className={`w-full rounded-[16px] border p-3 text-left transition ${
                    activeSession?.id === session.id
                      ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-card)] hover:bg-[var(--cliente-panel-soft)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{session.title || "Reuniao assistida"}</p>
                      <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{session.leadName || "Lead"} - {formatCrmDate(session.createdAt)}</p>
                    </div>
                    {session.summary?.qualification.temperature ? (
                      <CrmBadge tone={temperatureTone(session.summary.qualification.temperature)}>{session.summary.qualification.temperature}</CrmBadge>
                    ) : null}
                  </div>
                </button>
              ))}
              {!sessions.length ? <CrmEmpty title="Sem reunioes analisadas" description="Os resumos gerados vao aparecer aqui." /> : null}
            </div>
          </CrmPanel>
        </div>
      </div>
    </CrmWorkspace>
  );
}

function ResultBlock({ icon: Icon, title, text }: { icon: typeof FileText; title: string; text?: string }) {
  return (
    <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--cliente-primary)]" />
        <p className="text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--cliente-card-text-soft)]">{text || "Ainda sem informacao."}</p>
    </div>
  );
}

function ResultList({ icon: Icon, title, items }: { icon: typeof FileText; title: string; items?: string[] }) {
  return (
    <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--cliente-primary)]" />
        <p className="text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
      </div>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
        {(items && items.length ? items : ["Ainda sem itens."]).map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--cliente-primary)]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
