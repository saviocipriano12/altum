"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Languages,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Sparkles,
  Video,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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

type LiveMeetingCoach = {
  nextBestAction: string;
  sellerPrompts: string[];
  questionsToAvoid: string[];
  risks: string[];
  translation: string;
  followUpDraft: string;
  qualificationHint: {
    temperature: "frio" | "morno" | "quente";
    confidence: number;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
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
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveNotes, setLiveNotes] = useState("");
  const [coaching, setCoaching] = useState(false);
  const [coach, setCoach] = useState<LiveMeetingCoach | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [form, setForm] = useState({
    appointmentId: searchParams.get("appointmentId") || "",
    leadId: searchParams.get("leadId") || "",
    title: "",
    objective: "Transformar a conversa em uma venda, proposta ou proximo passo claro.",
    language: "pt_BR",
    meetingUrl: "",
    notes: "",
    transcript: "",
    translateTo: "",
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

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

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
          transcript: [form.transcript, liveTranscript].filter(Boolean).join("\n\n"),
          notes: [form.notes, liveNotes].filter(Boolean).join("\n\n"),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { item?: AssistedMeeting; error?: string };
      if (!res.ok || payload.error || !payload.item) throw new Error(payload.error || "Falha ao gerar resumo da reuniao.");
      setActiveSession(payload.item);
      setForm((current) => ({ ...current, transcript: "", notes: "" }));
      setLiveTranscript("");
      setLiveNotes("");
      setInterimTranscript("");
      setNotice("Reuniao analisada, lead atualizado e brief salvo no CRM.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao gerar resumo da reuniao.");
    } finally {
      setSaving(false);
    }
  }

  function startListening() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setSpeechSupported(false);
      setError("Este navegador nao liberou transcricao por voz. Cole a transcricao ou use as notas da reuniao.");
      return;
    }
    recognitionRef.current?.abort();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = form.language === "en_US" ? "en-US" : form.language === "es" ? "es-ES" : "pt-BR";
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript || "";
        if (event.results[index]?.isFinal) finalText += `${transcript} `;
        else interimText += `${transcript} `;
      }
      if (finalText.trim()) {
        setLiveTranscript((current) => `${current}${current ? "\n" : ""}${finalText.trim()}`);
      }
      setInterimTranscript(interimText.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      setError(event.error ? `Falha na captura de audio: ${event.error}` : "Falha na captura de audio.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    setSpeechSupported(true);
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
    setInterimTranscript("");
  }

  async function requestLiveCoach() {
    if (!tenant?.tenantId || coaching) return;
    const transcript = [form.transcript, liveTranscript, interimTranscript].filter(Boolean).join("\n\n");
    const notes = [form.notes, liveNotes].filter(Boolean).join("\n\n");
    if (!transcript.trim() && !notes.trim()) {
      setError("Fale, cole a transcricao ou escreva notas antes de pedir orientacao da IA.");
      return;
    }
    setCoaching(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/assisted-meetings/live-coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: form.leadId || selectedAppointment?.leadId || null,
          transcript,
          notes,
          objective: form.objective,
          language: form.language,
          translateTo: form.translateTo,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { coach?: LiveMeetingCoach; error?: string };
      if (!response.ok || !payload.coach) throw new Error(payload.error || "Falha ao orientar reuniao.");
      setCoach(payload.coach);
      setNotice("IA atualizou a orientacao da reuniao.");
    } catch (coachError) {
      setError(coachError instanceof Error ? coachError.message : "Falha ao orientar reuniao.");
    } finally {
      setCoaching(false);
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

      <LiveMeetingRoom
        listening={listening}
        speechSupported={speechSupported}
        interimTranscript={interimTranscript}
        liveTranscript={liveTranscript}
        liveNotes={liveNotes}
        coach={coach}
        coaching={coaching}
        language={form.language}
        translateTo={form.translateTo}
        meetingUrl={form.meetingUrl || selectedAppointment?.meetingUrl || ""}
        onStart={startListening}
        onStop={stopListening}
        onCoach={() => void requestLiveCoach()}
        onChangeNotes={setLiveNotes}
        onChangeLanguage={(language) => setForm((current) => ({ ...current, language }))}
        onChangeTranslateTo={(translateTo) => setForm((current) => ({ ...current, translateTo }))}
      />

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
                <CrmButton type="submit" tone="purple" disabled={!canOperate || saving || !([form.transcript, form.notes, liveTranscript, liveNotes].some((value) => value.trim()))}>
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

function LiveMeetingRoom({
  listening,
  speechSupported,
  interimTranscript,
  liveTranscript,
  liveNotes,
  coach,
  coaching,
  language,
  translateTo,
  meetingUrl,
  onStart,
  onStop,
  onCoach,
  onChangeNotes,
  onChangeLanguage,
  onChangeTranslateTo,
}: {
  listening: boolean;
  speechSupported: boolean;
  interimTranscript: string;
  liveTranscript: string;
  liveNotes: string;
  coach: LiveMeetingCoach | null;
  coaching: boolean;
  language: string;
  translateTo: string;
  meetingUrl: string;
  onStart: () => void;
  onStop: () => void;
  onCoach: () => void;
  onChangeNotes: (value: string) => void;
  onChangeLanguage: (value: string) => void;
  onChangeTranslateTo: (value: string) => void;
}) {
  const liveText = [liveTranscript, interimTranscript].filter(Boolean).join("\n");

  return (
    <CrmPanel className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-4 lg:p-5">
          <CrmSectionTitle
            eyebrow="Sala assistida"
            title="Apoio ao vivo para vender melhor na reuniao"
            description="Use o microfone para capturar a conversa, peça direcionamento para a IA e gere o resumo final no lead ao terminar."
            action={
              <div className="flex flex-wrap gap-2">
                {meetingUrl ? (
                  <a
                    href={meetingUrl}
                    target="_blank"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Abrir chamada
                  </a>
                ) : null}
                <CrmButton type="button" tone={listening ? "danger" : "green"} onClick={listening ? onStop : onStart}>
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {listening ? "Parar escuta" : "Ouvir reuniao"}
                </CrmButton>
                <CrmButton type="button" tone="purple" onClick={onCoach} disabled={coaching}>
                  {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Orientar agora
                </CrmButton>
              </div>
            }
          />

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Idioma falado</span>
              <CrmSelect value={language} onChange={(event) => onChangeLanguage(event.target.value)}>
                <option value="pt_BR">Portugues Brasil</option>
                <option value="en_US">Ingles</option>
                <option value="es">Espanhol</option>
              </CrmSelect>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Traduzir apoio para</span>
              <CrmSelect value={translateTo} onChange={(event) => onChangeTranslateTo(event.target.value)}>
                <option value="">Sem traducao</option>
                <option value="pt_BR">Portugues Brasil</option>
                <option value="en_US">Ingles</option>
                <option value="es">Espanhol</option>
              </CrmSelect>
            </label>
            <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
              <div className="flex items-center gap-2">
                <Radio className={`h-4 w-4 ${listening ? "text-emerald-500" : "text-[var(--cliente-card-text-soft)]"}`} />
                <p className="text-sm font-black text-[var(--cliente-card-text)]">{listening ? "Escutando agora" : "Escuta parada"}</p>
              </div>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                {speechSupported ? "A transcricao entra no documento final." : "Use notas ou cole a transcricao manualmente."}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-[var(--cliente-card-text)]">Transcricao ao vivo</p>
                <CrmBadge tone={listening ? "green" : "neutral"}>{listening ? "capturando" : "aguardando"}</CrmBadge>
              </div>
              <div className="mt-3 min-h-56 whitespace-pre-wrap rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                {liveText || "Quando iniciar a escuta, a fala reconhecida aparece aqui."}
              </div>
            </div>

            <label className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
              <span className="text-sm font-black text-[var(--cliente-card-text)]">Notas rapidas do vendedor</span>
              <CrmTextarea
                value={liveNotes}
                onChange={(event) => onChangeNotes(event.target.value)}
                className="mt-3 min-h-56"
                placeholder="Anote decisor, dor, verba, prazo, objeccao, combinado e qualquer ponto que a IA precisa considerar."
              />
            </label>
          </div>
        </div>

        <aside className="border-t border-[var(--cliente-border)] bg-[linear-gradient(180deg,var(--cliente-ai-soft),var(--cliente-card))] p-4 lg:border-l lg:border-t-0 lg:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-[16px] bg-[var(--cliente-ai)] text-white">
                <Languages className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-black text-[var(--cliente-card-text)]">Copiloto da chamada</p>
                <p className="text-xs text-[var(--cliente-card-text-soft)]">Direcionamento em tempo real</p>
              </div>
            </div>
            {coach ? <CrmBadge tone={temperatureTone(coach.qualificationHint.temperature)}>{coach.qualificationHint.temperature}</CrmBadge> : null}
          </div>

          {coach ? (
            <div className="mt-4 space-y-3">
              <ResultBlock icon={Sparkles} title="Proxima melhor acao" text={coach.nextBestAction} />
              <ResultList icon={MessageSquareText} title="Fale assim" items={coach.sellerPrompts} />
              <ResultList icon={ClipboardList} title="Evite agora" items={coach.questionsToAvoid} />
              <ResultList icon={FileText} title="Riscos percebidos" items={coach.risks} />
              {coach.translation ? <ResultBlock icon={Languages} title="Traducao / entendimento" text={coach.translation} /> : null}
            </div>
          ) : (
            <div className="mt-4 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
              <p className="text-sm font-bold text-[var(--cliente-card-text)]">Sem orientacao ainda</p>
              <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                Capture alguns minutos da conversa ou escreva notas e clique em Orientar agora.
              </p>
            </div>
          )}
        </aside>
      </div>
    </CrmPanel>
  );
}

function ResultBlock({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text?: string }) {
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

function ResultList({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items?: string[] }) {
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
