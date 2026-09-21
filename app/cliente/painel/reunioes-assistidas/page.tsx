"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  Copy,
  FileText,
  Languages,
  Link as LinkIcon,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
  Sparkles,
  Upload,
  Video,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { auth, storage } from "@/firebaseConfig";
import { ref as storageRef, uploadBytesResumable } from "firebase/storage";
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

type MeetingBotSession = {
  id: string;
  meetingUrl?: string;
  platform?: string;
  status?: string;
  transcript?: string;
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

function buildMeetingDocumentText(session: AssistedMeeting) {
  if (session.markdown?.trim()) return session.markdown.trim();
  const summary = session.summary;
  if (!summary) return session.title || "Reuniao assistida";
  return [
    `# ${session.title || "Reuniao assistida"}`,
    "",
    `Resumo: ${summary.executiveSummary}`,
    `Necessidade: ${summary.leadNeed}`,
    "",
    "Proximos passos:",
    ...summary.nextSteps.map((item) => `- ${item}`),
    "",
    "Coaching do vendedor:",
    ...summary.sellerCoaching.map((item) => `- ${item}`),
    "",
    `Follow-up sugerido: ${summary.followUpMessage}`,
    `CRM: ${summary.crmUpdate}`,
  ].join("\n");
}

export default function AssistedMeetingsPage() {
  const { tenant } = useClienteTenant();
  const isAltumAdmin = tenant?.tenantRole === "agency_owner" || tenant?.tenantRole === "agency_admin";

  if (!isAltumAdmin) return <AssistedMeetingsComingSoon />;
  return <AssistedMeetingsWorkspace />;
}

function AssistedMeetingsComingSoon() {
  return (
    <CrmWorkspace className="assisted-meetings-coming-soon">
      <section className="relative isolate overflow-hidden rounded-[28px] border border-indigo-200/70 bg-[linear-gradient(135deg,#eef2ff_0%,#ffffff_52%,#f5f3ff_100%)] px-5 py-12 shadow-[0_28px_80px_-54px_rgba(79,70,229,0.65)] sm:px-8 sm:py-16 lg:px-12">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-violet-300/20 blur-3xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] text-white shadow-[0_22px_45px_-22px_rgba(79,70,229,0.9)]">
            <Video className="h-7 w-7" />
          </span>
          <span className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            Em breve
          </span>
          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Reuniões com IA estão chegando à Altum.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Em breve, a Altum poderá acompanhar suas reuniões, organizar os pontos importantes e transformar cada conversa em próximos passos claros para sua equipe comercial.
          </p>
          <div className="mx-auto mt-8 grid max-w-2xl gap-3 text-left sm:grid-cols-3">
            {[
              "Resumo automático",
              "Próximas ações",
              "Histórico no CRM",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm backdrop-blur">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-indigo-600" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </CrmWorkspace>
  );
}

function AssistedMeetingsWorkspace() {
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
  const shouldKeepListeningRef = useRef(false);
  const recognitionRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveNotes, setLiveNotes] = useState("");
  const [coaching, setCoaching] = useState(false);
  const [coach, setCoach] = useState<LiveMeetingCoach | null>(null);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [transcribingMedia, setTranscribingMedia] = useState(false);
  const [transcribingMediaName, setTranscribingMediaName] = useState("");
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
      shouldKeepListeningRef.current = false;
      if (recognitionRestartRef.current) clearTimeout(recognitionRestartRef.current);
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

  async function copyActiveSession() {
    if (!activeSession) return;
    try {
      await navigator.clipboard.writeText(buildMeetingDocumentText(activeSession));
      setNotice("Documento da reuniao copiado.");
    } catch {
      setError("Nao foi possivel copiar o documento da reuniao.");
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
    if (recognitionRestartRef.current) clearTimeout(recognitionRestartRef.current);
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
      if (event.error === "no-speech") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "audio-capture") {
        shouldKeepListeningRef.current = false;
        setListening(false);
      }
      setError(event.error ? `Falha na captura de áudio: ${event.error}` : "Falha na captura de áudio.");
    };
    recognition.onend = () => {
      if (!shouldKeepListeningRef.current) {
        setListening(false);
        return;
      }
      recognitionRestartRef.current = setTimeout(() => {
        try {
          recognition.start();
          setListening(true);
        } catch {
          shouldKeepListeningRef.current = false;
          setListening(false);
          setError("A escuta foi interrompida pelo navegador. Clique em Ouvir reunião para continuar.");
        }
      }, 350);
    };
    recognitionRef.current = recognition;
    setError(null);
    setSpeechSupported(true);
    shouldKeepListeningRef.current = true;
    setListening(true);
    try {
      recognition.start();
    } catch {
      shouldKeepListeningRef.current = false;
      setListening(false);
      setError("Não foi possível iniciar o microfone. Verifique a permissão do navegador.");
    }
  }

  function stopListening() {
    shouldKeepListeningRef.current = false;
    if (recognitionRestartRef.current) clearTimeout(recognitionRestartRef.current);
    recognitionRef.current?.stop();
    setListening(false);
    setInterimTranscript("");
  }

  async function transcribeMedia(file: File | null) {
    if (!tenant?.tenantId || !file || transcribingMedia) return;
    setTranscribingMedia(true);
    setTranscribingMediaName(file.name);
    setError(null);
    setNotice(null);
    try {
      if (file.size > 24 * 1024 * 1024) throw new Error("Use uma gravação de até 24 MB.");
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Sua sessão expirou. Entre novamente para transcrever.");
      const extension = (file.name.split(".").pop() || "webm").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "webm";
      const uniqueId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const storagePath = `meeting-media/${tenant.tenantId}/${currentUser.uid}/${uniqueId}.${extension}`;
      let response: Response;
      try {
        const upload = uploadBytesResumable(storageRef(storage, storagePath), file, {
          contentType: file.type || "application/octet-stream",
          customMetadata: { tenantId: tenant.tenantId, uploadedBy: currentUser.uid },
        });
        await new Promise<void>((resolve, reject) => upload.on("state_changed", undefined, reject, resolve));
        response = await authedFetch(`/api/tenant/${tenant.tenantId}/assisted-meetings/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ storagePath, fileName: file.name, contentType: file.type, language: form.language }),
        });
      } catch (uploadError) {
        if (file.size > 4 * 1024 * 1024) throw uploadError;
        const data = new FormData();
        data.append("media", file);
        data.append("language", form.language);
        response = await authedFetch(`/api/tenant/${tenant.tenantId}/assisted-meetings/transcribe`, { method: "POST", body: data });
      }
      const payload = (await response.json().catch(() => ({}))) as { transcript?: string; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "Falha ao transcrever a gravação.");
      setForm((current) => ({
        ...current,
        transcript: [current.transcript, payload.transcript].filter(Boolean).join("\n\n"),
      }));
      setNotice("Gravação transcrita. Revise o texto e gere a análise para atualizar o CRM.");
    } catch (transcriptionError) {
      setError(transcriptionError instanceof Error ? transcriptionError.message : "Falha ao transcrever a gravação.");
    } finally {
      setTranscribingMedia(false);
      setTranscribingMediaName("");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
    }
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
          <>
            <a
              href="#sala-ao-vivo"
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_16px_28px_-24px_var(--cliente-accent-glow)] transition hover:-translate-y-0.5"
            >
              <Video className="h-4 w-4" />
              Comecar chamada
            </a>
            <CrmButton type="button" onClick={() => void loadData()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </CrmButton>
          </>
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

      <InternalMeetingBotPanel
        tenantId={tenant?.tenantId || ""}
        meetingUrl={form.meetingUrl || selectedAppointment?.meetingUrl || ""}
        language={form.language}
        onTranscript={(transcript) => {
          setForm((current) => ({ ...current, transcript }));
          setNotice("Transcrição do bot importada. Selecione o lead e gere a análise para atualizar o CRM.");
        }}
      />

      <div id="sala-ao-vivo" className="scroll-mt-24">
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
          onChangeMeetingUrl={(meetingUrl) => setForm((current) => ({ ...current, meetingUrl }))}
        />
      </div>

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
                <span className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[var(--cliente-card-text-soft)]">
                  <span>Transcrição da reunião</span>
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={!canOperate || transcribingMedia}
                    className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold text-[var(--cliente-primary)] transition hover:bg-[var(--cliente-primary-soft)] disabled:opacity-50"
                  >
                    {transcribingMedia ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    {transcribingMedia ? `Transcrevendo ${transcribingMediaName}` : "Importar áudio ou vídeo"}
                  </button>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="audio/*,video/*"
                    className="hidden"
                    onChange={(event) => void transcribeMedia(event.target.files?.[0] || null)}
                  />
                </span>
                <CrmTextarea
                  value={form.transcript}
                  onChange={(event) => setForm((current) => ({ ...current, transcript: event.target.value }))}
                  className="min-h-64"
                  placeholder="Cole a transcrição, importe uma gravação ou use a escuta ao vivo..."
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
            <CrmSectionTitle
              eyebrow="Resultado"
              title="Resumo gerado"
              description="O documento fica salvo no lead e aparece no historico comercial."
              action={
                activeSession?.summary ? (
                  <CrmButton type="button" onClick={copyActiveSession}>
                    <Copy className="h-4 w-4" />
                    Copiar documento
                  </CrmButton>
                ) : null
              }
            />
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

function InternalMeetingBotPanel({
  tenantId,
  meetingUrl,
  language,
  onTranscript,
}: {
  tenantId: string;
  meetingUrl: string;
  language: string;
  onTranscript: (transcript: string) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [session, setSession] = useState<MeetingBotSession | null>(null);
  const [busy, setBusy] = useState<"start" | "refresh" | "stop" | "finalize" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    if (!tenantId) return;
    const response = await authedFetch(`/api/tenant/${tenantId}/assisted-meetings/bot`);
    const payload = (await response.json().catch(() => ({}))) as { configured?: boolean; items?: MeetingBotSession[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Falha ao consultar a infraestrutura de reuniões.");
    setConfigured(Boolean(payload.configured));
    setSession(payload.items?.[0] || null);
  }, [tenantId]);

  useEffect(() => {
    void loadSessions().catch((loadError) => setMessage(loadError instanceof Error ? loadError.message : "Falha ao consultar reuniões."));
  }, [loadSessions]);

  async function startBot() {
    if (!meetingUrl.trim() || busy) {
      setMessage("Informe primeiro o link do Google Meet ou Zoom no formulário abaixo.");
      return;
    }
    setBusy("start");
    setMessage(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/assisted-meetings/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl, language }),
      });
      const payload = (await response.json().catch(() => ({}))) as { item?: MeetingBotSession; error?: string; detail?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || payload.detail || "Falha ao enviar o bot.");
      setSession(payload.item);
      setMessage("Bot Altum enviado. Autorize a entrada dele na sala.");
    } catch (startError) {
      setMessage(startError instanceof Error ? startError.message : "Falha ao enviar o bot.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshBot() {
    if (!session?.id || busy) return;
    setBusy("refresh");
    setMessage(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/assisted-meetings/bot/${session.id}`);
      const payload = (await response.json().catch(() => ({}))) as { item?: MeetingBotSession; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "Falha ao atualizar o bot.");
      setSession({ ...session, ...payload.item });
    } catch (refreshError) {
      setMessage(refreshError instanceof Error ? refreshError.message : "Falha ao atualizar o bot.");
    } finally {
      setBusy(null);
    }
  }

  async function stopBot() {
    if (!session?.id || busy) return;
    setBusy("stop");
    setMessage(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/assisted-meetings/bot/${session.id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { item?: MeetingBotSession; error?: string };
      if (!response.ok || !payload.item) throw new Error(payload.error || "Falha ao encerrar o bot.");
      setSession({ ...session, ...payload.item });
      setMessage("Saída solicitada. Aguarde a gravação ser concluída antes de processar.");
    } catch (stopError) {
      setMessage(stopError instanceof Error ? stopError.message : "Falha ao encerrar o bot.");
    } finally {
      setBusy(null);
    }
  }

  async function finalizeBot() {
    if (!session?.id || busy) return;
    setBusy("finalize");
    setMessage(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenantId}/assisted-meetings/bot/${session.id}/finalize`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { item?: MeetingBotSession; error?: string };
      if (!response.ok || !payload.item?.transcript) throw new Error(payload.error || "A transcrição ainda não está pronta.");
      setSession({ ...session, ...payload.item });
      onTranscript(payload.item.transcript);
      setMessage("Gravação transcrita pela OpenAI e pronta para análise.");
    } catch (finalizeError) {
      setMessage(finalizeError instanceof Error ? finalizeError.message : "Falha ao processar a gravação.");
    } finally {
      setBusy(null);
    }
  }

  const running = session && !["completed", "failed", "processed"].includes(String(session.status || ""));

  return (
    <CrmPanel className="border-indigo-200/80 bg-[linear-gradient(135deg,var(--cliente-card),var(--cliente-ai-soft))]">
      <CrmSectionTitle
        eyebrow="Teste interno"
        title="Bot Altum para Google Meet e Zoom"
        description="O bot entra como participante, grava o áudio na infraestrutura da Altum e usa a OpenAI apenas para transcrever depois da reunião."
        action={<CrmBadge tone={configured ? "green" : "orange"}>{configured ? "infraestrutura conectada" : "aguardando configuração"}</CrmBadge>}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{session?.meetingUrl || meetingUrl || "Informe um link do Meet ou Zoom"}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
            {session ? `Status: ${session.status || "solicitado"}` : "Disponível somente para testes da equipe Altum durante o lançamento."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running ? (
            <CrmButton type="button" tone="purple" disabled={!configured || Boolean(busy)} onClick={() => void startBot()}>
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Enviar bot
            </CrmButton>
          ) : (
            <CrmButton type="button" tone="danger" disabled={Boolean(busy)} onClick={() => void stopBot()}>
              {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MicOff className="h-4 w-4" />}
              Encerrar captura
            </CrmButton>
          )}
          {session ? (
            <CrmButton type="button" disabled={Boolean(busy)} onClick={() => void refreshBot()}>
              {busy === "refresh" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar status
            </CrmButton>
          ) : null}
          {session && ["completed", "failed", "stopping"].includes(String(session.status || "")) ? (
            <CrmButton type="button" tone="green" disabled={Boolean(busy)} onClick={() => void finalizeBot()}>
              {busy === "finalize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Processar gravação
            </CrmButton>
          ) : null}
        </div>
      </div>
      {message ? <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text-soft)]">{message}</p> : null}
    </CrmPanel>
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
  onChangeMeetingUrl,
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
  onChangeMeetingUrl: (value: string) => void;
}) {
  const liveText = [liveTranscript, interimTranscript].filter(Boolean).join("\n");
  const [activeRoomUrl, setActiveRoomUrl] = useState(meetingUrl);
  const canEmbedRoom = /^https:\/\/meet\.jit\.si\/[A-Za-z0-9_-]+/i.test(activeRoomUrl);
  const roomReady = Boolean(activeRoomUrl);

  useEffect(() => {
    if (meetingUrl && meetingUrl !== activeRoomUrl) setActiveRoomUrl(meetingUrl);
  }, [activeRoomUrl, meetingUrl]);

  function createMeetingRoom() {
    const slug = `altum-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://meet.jit.si/${slug}`;
    setActiveRoomUrl(url);
    onChangeMeetingUrl(url);
  }

  async function copyMeetingLink() {
    if (!activeRoomUrl) return;
    await navigator.clipboard.writeText(activeRoomUrl);
  }

  return (
    <CrmPanel className="overflow-hidden p-0">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="p-4 lg:p-5">
          <div className="mb-4 overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_22%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_55%,color-mix(in_srgb,var(--cliente-success)_10%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)]">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.48fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CrmBadge tone={roomReady ? "green" : "orange"}>{roomReady ? "sala pronta" : "crie a sala"}</CrmBadge>
                  <CrmBadge tone={listening ? "green" : "purple"}>{listening ? "IA escutando" : "copiloto disponivel"}</CrmBadge>
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-normal text-[var(--cliente-card-text)]">
                  {roomReady ? "Sua chamada de video esta pronta." : "Comece uma reuniao com IA em um clique."}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                  {roomReady
                    ? "Entre na sala, envie o convite para o lead e ative a escuta para a Altum transcrever, orientar e gerar o resumo final."
                    : "A Altum cria a sala, ajuda o vendedor durante a conversa e salva tudo no lead quando a reuniao terminar."}
                </p>
                {roomReady ? (
                  <div className="mt-4 flex min-w-0 items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-white/70 p-2">
                    <LinkIcon className="h-4 w-4 shrink-0 text-[var(--cliente-primary)]" />
                    <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{activeRoomUrl}</p>
                  </div>
                ) : null}
              </div>
              <div className="grid content-center gap-2 sm:grid-cols-2 xl:grid-cols-1">
                {roomReady ? (
                  <a
                    href={activeRoomUrl}
                    target="_blank"
                    className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-primary)] px-4 py-3 text-sm font-black text-white shadow-[0_16px_28px_-24px_var(--cliente-accent-glow)] transition hover:-translate-y-0.5"
                  >
                    <Video className="h-4 w-4" />
                    Entrar na chamada
                  </a>
                ) : (
                  <CrmButton type="button" tone="primary" className="w-full justify-center py-3" onClick={createMeetingRoom}>
                    <Video className="h-4 w-4" />
                    Criar sala de video
                  </CrmButton>
                )}
                {roomReady ? (
                  <CrmButton type="button" className="w-full justify-center py-3" onClick={() => void copyMeetingLink()}>
                    <LinkIcon className="h-4 w-4" />
                    Copiar convite
                  </CrmButton>
                ) : null}
                <CrmButton type="button" tone={listening ? "danger" : "green"} className="w-full justify-center py-3" onClick={listening ? onStop : onStart}>
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {listening ? "Parar escuta da IA" : "Ouvir reuniao"}
                </CrmButton>
                <CrmButton type="button" tone="purple" className="w-full justify-center py-3" onClick={onCoach} disabled={coaching}>
                  {coaching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Orientar agora
                </CrmButton>
              </div>
            </div>
          </div>

          <CrmSectionTitle
            eyebrow="Sala assistida"
            title="Chamada de video dentro da Altum"
            description="Use o microfone para capturar a conversa, peça direcionamento para a IA e gere o resumo final no lead ao terminar."
            action={
              <div className="flex flex-wrap gap-2">
                <CrmButton type="button" tone="primary" onClick={createMeetingRoom}>
                  <Video className="h-4 w-4" />
                  {activeRoomUrl ? "Criar nova sala" : "Criar sala agora"}
                </CrmButton>
                {activeRoomUrl ? (
                  <a
                    href={activeRoomUrl}
                    target="_blank"
                    className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Entrar
                  </a>
                ) : null}
                {activeRoomUrl ? (
                  <CrmButton type="button" onClick={() => void copyMeetingLink()}>
                    <LinkIcon className="h-4 w-4" />
                    Copiar link
                  </CrmButton>
                ) : null}
              </div>
            }
          />

          <div className="mt-4 overflow-hidden rounded-[22px] border border-[var(--cliente-border)] bg-slate-950 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[14px] bg-blue-600 text-white">
                  <Video className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">Sala de video da reuniao</p>
                  <p className="truncate text-xs text-white/60">
                    {activeRoomUrl ? "Entre por aqui e envie o link para o lead." : "Crie uma sala para iniciar a chamada sem sair da Altum."}
                  </p>
                </div>
              </div>
              {activeRoomUrl ? <CrmBadge tone="green">sala pronta</CrmBadge> : <CrmBadge tone="orange">aguardando</CrmBadge>}
            </div>
            {canEmbedRoom ? (
              <iframe
                title="Sala de video Altum"
                src={`${activeRoomUrl}#config.prejoinPageEnabled=true&config.disableDeepLinking=true`}
                allow="camera; microphone; fullscreen; display-capture; clipboard-write"
                allowFullScreen
                className="h-[430px] w-full bg-slate-950 lg:h-[540px]"
              />
            ) : (
              <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 px-6 py-10 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-blue-600 text-white">
                  <Video className="h-7 w-7" />
                </span>
                <div>
                  <p className="text-lg font-black text-white">Comece uma chamada</p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/60">
                    Crie uma sala de video da Altum, envie o link para o lead e clique em Ouvir reuniao para ativar o copiloto.
                  </p>
                </div>
                <CrmButton type="button" tone="primary" onClick={createMeetingRoom}>
                  <Video className="h-4 w-4" />
                  Criar sala agora
                </CrmButton>
              </div>
            )}
          </div>

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
