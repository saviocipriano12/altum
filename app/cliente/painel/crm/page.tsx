"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Flame,
  Loader2,
  MessageSquareText,
  PhoneCall,
  Save,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import { getBusinessProfile, type BusinessProfileId } from "@/lib/business-profiles";
import { buildAiTaskPreset, humanizeAiNextAction, suggestPipelineStageForAiAction } from "@/lib/ai-next-actions";
import { getPipelineStageLabel, normalizePipelineStageId, type PipelineStageDefinition } from "@/lib/pipeline";

type TimelineEvent = {
  id: string;
  title?: string;
  detail?: string;
  type?: string;
  createdAt?: unknown;
};

type LeadNote = {
  id: string;
  text?: string;
  authorName?: string;
  createdAt?: unknown;
};

type LeadTask = {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  dueAt?: unknown;
  createdAt?: unknown;
};

type AppointmentItem = {
  id: string;
  title?: string;
  status?: string;
  startAt?: unknown;
  ownerName?: string | null;
};

type QualificationReason = {
  code: string;
  label: string;
  detail: string;
  direction: "positive" | "negative";
};

type LeadQualification = {
  score?: number;
  band?: "cold" | "warming" | "sales_ready" | "handoff";
  label?: string;
  recommendedStage?: string;
  nextAction?: string;
  missingFields?: string[];
  reasons?: QualificationReason[];
};

type LeadStagePolicy = {
  stageLabel?: string;
  slaHours?: number | null;
  followUpHours?: number | null;
  ownerName?: string | null;
  slaDueAt?: string | null;
  slaBreached?: boolean;
};

type LeadHandoff = {
  status?: "monitoring" | "ready";
  reasonCode?: string;
  reasonLabel?: string;
  summary?: string;
  recommendedOwnerName?: string | null;
  transcript?: Array<{
    id: string;
    text?: string;
    author?: string;
    sentAt?: unknown;
  }>;
};

type LeadSchedulingAdapter = {
  provider?: "google_calendar";
  status?: "not_configured" | "ready";
  syncReady?: boolean;
  suggestedEvent?: {
    title?: string;
    startAt?: string;
    description?: string;
  };
};

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  status?: string;
  pipelineStage?: string;
  stage?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  heat?: string;
  priority?: string;
  potentialValue?: number | null;
  tags?: string[];
  customFields?: Record<string, string | number | boolean | null>;
  aiFieldEvidence?: Record<
    string,
    {
      value?: string;
      source?: "agent_extracted" | "conversation_context" | "derived" | string;
      confidence?: number;
      intent?: string | null;
      stateAfter?: string | null;
      nextAction?: string | null;
      capturedAt?: unknown;
    }
  >;
  aiCaptureChecklist?: {
    nome?: boolean;
    tipoEmpresa?: boolean;
    objetivo?: boolean;
    orcamento?: boolean;
    urgencia?: boolean;
    decisor?: boolean;
    canaisAtuais?: boolean;
    cidade?: boolean;
    tamanhoTime?: boolean;
    servicoInteresse?: boolean;
    updatedAt?: unknown;
  };
  notes?: string;
  qualification?: LeadQualification;
  handoff?: LeadHandoff;
  chatSummary?: {
    total?: number;
    open?: number;
    pending?: number;
    unresolved?: number;
    highPriority?: number;
    lastInteractionAt?: unknown;
  };
  timeline?: TimelineEvent[];
};

type RelatedChat = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  channel?: string;
  status?: string;
  priority?: string;
  queueStatus?: string;
  ownerName?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  unreadCount?: number;
};

type LeadDetailPayload = {
  lead: LeadItem;
  notes?: LeadNote[];
  tasks?: LeadTask[];
  appointments?: AppointmentItem[];
  timeline?: TimelineEvent[];
  relatedChats?: RelatedChat[];
  qualification?: LeadQualification;
  stagePolicy?: LeadStagePolicy;
  handoff?: LeadHandoff;
  schedulingAdapter?: LeadSchedulingAdapter;
  conversationSummary?: {
    total?: number;
    open?: number;
    pending?: number;
    resolved?: number;
    highPriority?: number;
    unassigned?: number;
    lastInteractionAt?: unknown;
  };
  error?: string;
};

type SettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

type PipelinePayload = {
  stages?: PipelineStageDefinition[];
};

type AiSignalLog = {
  id: string;
  leadId?: string;
  chatId?: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  confidence?: number | null;
  nextAction?: string | null;
  extractedFields?: Record<string, string> | null;
  createdAt?: unknown;
};

const PRIORITY_OPTIONS = ["low", "medium", "high"];
const HEAT_OPTIONS = ["frio", "morno", "quente"];

function toDate(value: unknown) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  return null;
}

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRelative(value: unknown) {
  const date = toDate(value);
  if (!date) return "sem atividade";
  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h`;
  return `${Math.round(diffMinutes / 1440)}d`;
}

function formatChannelLabel(channel?: string) {
  if (channel === "site_chat") return "Site chat";
  if (channel === "site_form") return "Site form";
  if (channel === "meta_ads") return "Meta Ads";
  if (channel === "google_ads") return "Google Ads";
  if (!channel) return "WhatsApp";
  return channel.replaceAll("_", " ");
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 10);
}

function getPriorityTone(priority?: string) {
  if (priority === "high") return "danger" as const;
  if (priority === "medium") return "warning" as const;
  return "neutral" as const;
}

function getHeatTone(heat?: string) {
  if (heat === "quente") return "danger" as const;
  if (heat === "morno") return "warning" as const;
  if (heat === "frio") return "info" as const;
  return "neutral" as const;
}

function getQualificationTone(band?: string) {
  if (band === "handoff") return "danger" as const;
  if (band === "sales_ready") return "success" as const;
  if (band === "warming") return "warning" as const;
  return "neutral" as const;
}

function formatCustomFieldValue(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() || "--";
  return "--";
}

function humanizeEvidenceSource(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "agent_extracted") return "extraido da conversa";
  if (normalized === "conversation_context") return "contexto da conversa";
  if (normalized === "derived") return "derivado por regra";
  return normalized || "origem desconhecida";
}

function getEvidenceConfidenceTone(confidence?: number | null) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "neutral" as const;
  if (confidence >= 0.82) return "success" as const;
  if (confidence >= 0.66) return "info" as const;
  return "warning" as const;
}

function nextLocalDateTime(daysAhead = 1) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  date.setHours(10, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ClienteCrmPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const stageFromQuery = searchParams.get("stage");
  const heatFromQuery = searchParams.get("heat");
  const priorityFromQuery = searchParams.get("priority");
  const sourceFromQuery = searchParams.get("source");
  const channelFromQuery = searchParams.get("channel");
  const canOperate = hasCapability("edit_leads");

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [aiLogs, setAiLogs] = useState<AiSignalLog[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStageDefinition[]>([]);
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetailPayload | null>(null);
  const [nextStage, setNextStage] = useState<string>("captado");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [heatFilter, setHeatFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [profileForm, setProfileForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    origem: "",
    channel: "",
    priority: "medium",
    heat: "morno",
    score: "",
    potentialValue: "",
    notes: "",
    tagsInput: "",
  });
  const [noteText, setNoteText] = useState("");
  const [taskForm, setTaskForm] = useState({
    title: "",
    dueAt: "",
    type: "follow_up",
    priority: "medium",
  });

  const loadLeads = useCallback(async () => {
    if (!tenant?.tenantId) return [] as LeadItem[];

    setLoading(true);
    try {
      const [res, settingsRes, aiLogsRes, pipelineRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`),
      ]);
      const payload = (await res.json()) as { items?: LeadItem[]; error?: string };
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as SettingsPayload;
      const aiLogsPayload = (await aiLogsRes.json().catch(() => ({}))) as { items?: AiSignalLog[] };
      const pipelinePayload = (await pipelineRes.json().catch(() => ({}))) as PipelinePayload;

      if (!res.ok) {
        setError(payload.error || "Falha ao carregar leads.");
        setLeads([]);
        setAiLogs([]);
        return [];
      }

      const nextLeads = payload.items || [];
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setLeads(nextLeads);
      setAiLogs(aiLogsRes.ok ? aiLogsPayload.items || [] : []);
      setPipelineStages(pipelineRes.ok ? pipelinePayload.stages || [] : []);
      setSelectedLeadId((current) => {
        if (current && nextLeads.some((lead) => lead.id === current)) return current;
        if (leadFromQuery && nextLeads.some((lead) => lead.id === leadFromQuery)) return leadFromQuery;
        return nextLeads[0]?.id || null;
      });
      return nextLeads;
    } catch {
      setError("Falha ao carregar CRM do tenant.");
      setLeads([]);
      setAiLogs([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId, leadFromQuery]);

  const loadLeadDetail = useCallback(
    async (leadId: string) => {
      if (!tenant?.tenantId) return;

      setLoadingDetail(true);
      try {
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}`);
        const payload = (await res.json()) as LeadDetailPayload;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar detalhe do lead.");
          setDetail(null);
          return;
        }

        setDetail(payload);
        setNextStage(normalizePipelineStageId(payload.lead.pipelineStage || payload.lead.stage || "captado"));
        setProfileForm({
          nome: payload.lead.nome || "",
          email: payload.lead.email || "",
          telefone: payload.lead.telefone || "",
          empresa: payload.lead.empresa || "",
          origem: payload.lead.origem || "",
          channel: payload.lead.channel || "",
          priority: payload.lead.priority || "medium",
          heat: payload.lead.heat || "morno",
          score:
            typeof payload.lead.score === "number"
              ? String(payload.lead.score)
              : typeof payload.qualification?.score === "number"
                ? String(payload.qualification.score)
                : "",
          potentialValue:
            typeof payload.lead.potentialValue === "number" ? String(payload.lead.potentialValue) : "",
          notes: payload.lead.notes || "",
          tagsInput: (payload.lead.tags || []).join(", "),
        });
      } catch {
        setError("Falha ao carregar detalhe do lead.");
      } finally {
        setLoadingDetail(false);
      }
    },
    [tenant?.tenantId]
  );

  useEffect(() => {
    setStageFilter(stageFromQuery || "all");
    setHeatFilter(heatFromQuery || "all");
    setPriorityFilter(priorityFromQuery || "all");
    setSourceFilter(sourceFromQuery || "all");
    setChannelFilter(channelFromQuery || "all");
  }, [stageFromQuery, heatFromQuery, priorityFromQuery, sourceFromQuery, channelFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedLeadId) next.set("leadId", selectedLeadId);
    if (stageFilter !== "all") next.set("stage", stageFilter);
    if (heatFilter !== "all") next.set("heat", heatFilter);
    if (priorityFilter !== "all") next.set("priority", priorityFilter);
    if (sourceFilter !== "all") next.set("source", sourceFilter);
    if (channelFilter !== "all") next.set("channel", channelFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/crm?${nextQuery}` : "/cliente/painel/crm");
  }, [
    channelFilter,
    heatFilter,
    priorityFilter,
    router,
    searchParams,
    selectedLeadId,
    sourceFilter,
    stageFilter,
  ]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    if (!selectedLeadId) {
      setDetail(null);
      return;
    }

    void loadLeadDetail(selectedLeadId);
  }, [selectedLeadId, loadLeadDetail]);

  const selectedLead = useMemo(
    () => leads.find((item) => item.id === selectedLeadId) || detail?.lead || null,
    [leads, selectedLeadId, detail]
  );
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const stageOptions = useMemo(
    () =>
      (pipelineStages.length ? pipelineStages.map((stage) => stage.id) : businessProfile.pipeline.stages).map((stage) =>
        normalizePipelineStageId(stage)
      ),
    [businessProfile, pipelineStages]
  );
  const selectedLeadAiLogs = useMemo(() => {
    if (!selectedLead) return [] as AiSignalLog[];
    return aiLogs
      .filter((item) => item.leadId === selectedLead.id && (item.nextAction || item.extractedFields))
      .slice(0, 3);
  }, [aiLogs, selectedLead]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      if (
        stageFilter !== "all" &&
        normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado") !== stageFilter
      ) {
        return false;
      }

      if (heatFilter !== "all" && (lead.heat || "morno") !== heatFilter) return false;
      if (priorityFilter !== "all" && (lead.priority || "medium") !== priorityFilter) return false;
      if (sourceFilter !== "all" && (lead.origem || "").toLowerCase() !== sourceFilter.toLowerCase()) return false;
      if (channelFilter !== "all" && (lead.channel || "").toLowerCase() !== channelFilter.toLowerCase()) return false;

      if (!search.trim()) return true;
      const term = search.trim().toLowerCase();
      return [
        lead.nome,
        lead.email,
        lead.telefone,
        lead.empresa,
        lead.origem,
        lead.channel,
        lead.owner,
        ...(lead.tags || []),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [channelFilter, heatFilter, leads, priorityFilter, search, sourceFilter, stageFilter]);

  const sourceOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map((lead) => String(lead.origem || "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [leads]
  );

  const channelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map((lead) => String(lead.channel || "").trim().toLowerCase())
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [leads]
  );

  const crmStats = useMemo(() => {
    const hot = leads.filter((lead) => lead.heat === "quente").length;
    const withScore = leads.filter((lead) => typeof lead.score === "number");
    const avgScore = withScore.length
      ? Math.round(withScore.reduce((acc, lead) => acc + Number(lead.score || 0), 0) / withScore.length)
      : 0;
    const openValue = leads.reduce((acc, lead) => acc + Number(lead.potentialValue || 0), 0);
    const active = leads.filter(
      (lead) => normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado") !== "perdido"
    ).length;
    return { hot, avgScore, openValue, active };
  }, [leads]);

  const focusSignals = useMemo(() => {
    const hotLeads = leads.filter((lead) => lead.heat === "quente");
    const proposalLeads = leads.filter(
      (lead) => normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado") === "proposta"
    );
    const highPriorityLeads = leads.filter((lead) => lead.priority === "high");
    const neglectedHotLeads = hotLeads.filter((lead) => !lead.chatSummary?.lastInteractionAt);

    return [
      hotLeads.length
        ? {
            id: "hot",
            title: "Leads quentes pedindo ataque",
            detail: `${hotLeads.length} lead(s) com alta temperatura exigem cadencia curta no CRM.`,
            href: "/cliente/painel/crm?heat=quente",
            tone: "danger" as const,
            badge: "quente",
          }
        : null,
      proposalLeads.length
        ? {
            id: "proposal",
            title: "Leads em proposta",
            detail: `${proposalLeads.length} lead(s) estao na etapa de proposta e merecem follow-up comercial.`,
            href: "/cliente/painel/crm?stage=proposta",
            tone: "warning" as const,
            badge: "proposta",
          }
        : null,
      highPriorityLeads.length
        ? {
            id: "priority",
            title: "Prioridade alta no pipeline",
            detail: `${highPriorityLeads.length} lead(s) estao marcados como prioridade alta.`,
            href: "/cliente/painel/crm?priority=high",
            tone: "info" as const,
            badge: "prioridade",
          }
        : null,
      neglectedHotLeads.length
        ? {
            id: "neglected",
            title: "Leads quentes sem historico recente",
            detail: `${neglectedHotLeads.length} lead(s) quentes ainda nao mostram interacao recente consolidada.`,
            href: "/cliente/painel/crm?heat=quente",
            tone: "warning" as const,
            badge: "retomar",
          }
        : null,
    ].filter(Boolean) as Array<{
      id: string;
      title: string;
      detail: string;
      href: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
      badge: string;
    }>;
  }, [leads]);

  const selectedConversationSummary = useMemo(
    () =>
      detail?.conversationSummary || {
        total: selectedLead?.chatSummary?.total || 0,
        open: selectedLead?.chatSummary?.open || 0,
        pending: selectedLead?.chatSummary?.pending || 0,
        highPriority: selectedLead?.chatSummary?.highPriority || 0,
        unassigned: 0,
        lastInteractionAt: selectedLead?.chatSummary?.lastInteractionAt || null,
      },
    [detail?.conversationSummary, selectedLead]
  );
  const customFieldEntries = useMemo(
    () =>
      Object.entries(detail?.lead?.customFields || {}).filter(([, value]) => {
        if (typeof value === "boolean") return true;
        return String(value ?? "").trim().length > 0;
      }),
    [detail?.lead?.customFields]
  );
  const aiFieldEvidenceEntries = useMemo(() => {
    const source = detail?.lead?.aiFieldEvidence || selectedLead?.aiFieldEvidence || {};
    return Object.entries(source)
      .map(([field, raw]) => {
        const evidence =
          raw && typeof raw === "object"
            ? (raw as {
                value?: unknown;
                source?: unknown;
                confidence?: unknown;
                intent?: unknown;
                stateAfter?: unknown;
                nextAction?: unknown;
                capturedAt?: unknown;
              })
            : null;
        const value = typeof evidence?.value === "string" ? evidence.value.trim() : "";
        const sourceLabel = typeof evidence?.source === "string" ? evidence.source : "";
        const confidence =
          typeof evidence?.confidence === "number" && Number.isFinite(evidence.confidence)
            ? evidence.confidence
            : null;
        const intent = typeof evidence?.intent === "string" ? evidence.intent.trim() : "";
        const stateAfter = typeof evidence?.stateAfter === "string" ? evidence.stateAfter.trim() : "";
        const nextAction = typeof evidence?.nextAction === "string" ? evidence.nextAction.trim() : "";
        const capturedAt = evidence?.capturedAt;

        return {
          field,
          value: value || "--",
          source: sourceLabel,
          confidence,
          intent,
          stateAfter,
          nextAction,
          capturedAt,
        };
      })
      .sort((a, b) => {
        const confidenceA = typeof a.confidence === "number" ? a.confidence : -1;
        const confidenceB = typeof b.confidence === "number" ? b.confidence : -1;
        return confidenceB - confidenceA;
      });
  }, [detail?.lead?.aiFieldEvidence, selectedLead?.aiFieldEvidence]);
  const aiCaptureChecklistEntries = useMemo(() => {
    const checklist = detail?.lead?.aiCaptureChecklist || selectedLead?.aiCaptureChecklist;
    if (!checklist || typeof checklist !== "object") return [] as Array<{ key: string; done: boolean }>;
    const orderedKeys = [
      "nome",
      "tipoEmpresa",
      "objetivo",
      "orcamento",
      "urgencia",
      "decisor",
      "canaisAtuais",
      "cidade",
      "tamanhoTime",
      "servicoInteresse",
    ] as const;
    return orderedKeys.map((key) => ({ key, done: Boolean(checklist[key]) }));
  }, [detail?.lead?.aiCaptureChecklist, selectedLead?.aiCaptureChecklist]);
  const leadQualification = detail?.qualification || detail?.lead?.qualification || selectedLead?.qualification || null;
  const leadStagePolicy = detail?.stagePolicy || null;
  const leadHandoff = detail?.handoff || detail?.lead?.handoff || selectedLead?.handoff || null;
  const schedulingAdapter = detail?.schedulingAdapter || null;
  const nextAppointment = useMemo(
    () =>
      [...(detail?.appointments || [])]
        .sort((a, b) => new Date(String(a.startAt || 0)).getTime() - new Date(String(b.startAt || 0)).getTime())[0] || null,
    [detail?.appointments]
  );

  async function refreshCurrent() {
    const currentId = selectedLeadId;
    await loadLeads();
    if (currentId) {
      await loadLeadDetail(currentId);
    }
  }

  async function updateStage() {
    if (!tenant?.tenantId || !selectedLead || !nextStage || !canOperate) return;

    setSavingStage(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLead.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: nextStage }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar stage.");
        return;
      }

      await refreshCurrent();
    } catch {
      setError("Falha ao atualizar stage do lead.");
    } finally {
      setSavingStage(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !canOperate) return;

    setSavingProfile(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...profileForm,
          score: profileForm.score ? Number(profileForm.score) : null,
          potentialValue: profileForm.potentialValue ? Number(profileForm.potentialValue) : null,
          tags: parseTags(profileForm.tagsInput),
        }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao salvar lead.");
        return;
      }

      await refreshCurrent();
    } catch {
      setError("Falha ao atualizar perfil do lead.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createNote(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !noteText.trim() || !canOperate) return;

    setSavingNote(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: noteText.trim() }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar nota.");
        return;
      }

      setNoteText("");
      await loadLeadDetail(selectedLeadId);
    } catch {
      setError("Falha ao registrar nota do lead.");
    } finally {
      setSavingNote(false);
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !taskForm.title.trim() || !canOperate) return;

    setSavingTask(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskForm),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar tarefa.");
        return;
      }

      setTaskForm({ title: "", dueAt: "", type: "follow_up", priority: "medium" });
      await loadLeadDetail(selectedLeadId);
    } catch {
      setError("Falha ao criar tarefa do lead.");
    } finally {
      setSavingTask(false);
    }
  }

  function applyAiTaskSuggestion(log: AiSignalLog) {
    if (!selectedLead) return;
    const preset = buildAiTaskPreset(log.nextAction, selectedLead.nome);
    setTaskForm((current) => ({
      ...current,
      title: preset.title,
      type: preset.type,
      priority: preset.priority,
      dueAt: current.dueAt || nextLocalDateTime(1),
    }));
    setError(null);
  }

  function applyAiStageSuggestion(log: AiSignalLog) {
    const suggested = suggestPipelineStageForAiAction(log.nextAction, stageOptions);
    if (!suggested) return;
    setNextStage(suggested);
    setError(null);
  }

  async function toggleTask(taskId: string, nextStatus: "pending" | "done") {
    if (!tenant?.tenantId || !selectedLeadId || !canOperate) return;

    setError(null);
    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/tasks/${taskId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        }
      );

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar tarefa.");
        return;
      }

      await loadLeadDetail(selectedLeadId);
    } catch {
      setError("Falha ao atualizar tarefa.");
    }
  }

  if (!loading && leads.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title="CRM" subtitle="Gestao comercial, follow-ups e profundidade real de lead." />
        <EmptyState title="Nenhum lead encontrado" description="Quando novos leads entrarem no tenant, o CRM operacional aparecera aqui." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="CRM"
        subtitle="Perfil 360 do lead, pipeline, tarefas e notas internas em um unico workspace."
        action={loadingDetail ? <StateBadge label="sincronizando lead" tone="info" /> : undefined}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Leads ativos" value={crmStats.active.toLocaleString("pt-BR")} icon={UserRound} trend="fora do perdido" />
        <MetricCard label="Leads quentes" value={crmStats.hot.toLocaleString("pt-BR")} icon={Flame} trend="heat alto em operacao" />
        <MetricCard label="Score medio" value={crmStats.avgScore.toLocaleString("pt-BR")} icon={Sparkles} trend="qualidade media da base" />
        <MetricCard label="Potencial aberto" value={formatMoney(crmStats.openValue)} icon={ClipboardList} trend="valor estimado em pipeline" />
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <PanelCard className="p-5">
          <CardTitle title="Foco comercial" subtitle="Recortes rapidos para atacar o pipeline agora" />
          <div className="mt-4 space-y-3">
            {focusSignals.length === 0 ? (
              <EmptyState
                title="Sem gargalos comerciais evidentes"
                description="A base atual nao mostra concentracao anormal de leads quentes, propostas ou prioridades altas."
              />
            ) : (
              focusSignals.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Compartilhar contexto" subtitle="Seu recorte atual fica refletido na URL do CRM." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QuickContext title="Lead selecionado" value={selectedLead?.nome || "Nenhum"} detail="mantido no link atual" />
            <QuickContext title="Stage" value={stageFilter === "all" ? "Todos" : getPipelineStageLabel(stageFilter)} detail="filtro de pipeline" />
            <QuickContext title="Temperatura" value={heatFilter === "all" ? "Todas" : heatFilter} detail="heat operacional" />
            <QuickContext title="Prioridade" value={priorityFilter === "all" ? "Todas" : priorityFilter} detail="foco do desk" />
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title={`Modo do negocio: ${businessProfile.label}`} subtitle="Campos e tags sugeridos pelo perfil ativo do tenant." />
          <p className="mt-4 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.description}</p>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Campos que merecem foco</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.crm.leadFields.map((field) => (
                <StateBadge key={field} label={field.replaceAll("_", " ")} tone="info" />
              ))}
            </div>
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--cliente-card-text-soft)]">Tags sugeridas</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.crm.suggestedTags.map((tag) => (
                <StateBadge key={tag} label={tag} tone="neutral" />
              ))}
            </div>
          </div>
        </PanelCard>
      </section>

      <section className="grid min-h-[74vh] grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <PanelCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Base de leads" subtitle={`${filteredLeads.length} visiveis`} />
              <StateBadge label={`${leads.length} no tenant`} tone="info" />
            </div>
            <label className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
              <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, origem, empresa..."
                className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>

            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className="rounded-xl border client-input px-3 py-2 text-sm"
              >
                <option value="all">Todos os stages</option>
                {stageOptions.map((option) => (
                  <option key={option} value={option}>
                    {getPipelineStageLabel(option)}
                  </option>
                ))}
              </select>
              <select
                value={heatFilter}
                onChange={(event) => setHeatFilter(event.target.value)}
                className="rounded-xl border client-input px-3 py-2 text-sm"
              >
                <option value="all">Todas as temperaturas</option>
                {HEAT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
                className="rounded-xl border client-input px-3 py-2 text-sm"
              >
                <option value="all">Todas as prioridades</option>
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className="rounded-xl border client-input px-3 py-2 text-sm"
              >
                <option value="all">Todas as origens</option>
                {sourceOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <select
                value={channelFilter}
                onChange={(event) => setChannelFilter(event.target.value)}
                className="rounded-xl border client-input px-3 py-2 text-sm"
              >
                <option value="all">Todos os canais</option>
                {channelOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatChannelLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-[var(--cliente-card-text-muted)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              filteredLeads.map((lead) => {
                const stage = normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
                return (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`w-full border-b border-[var(--cliente-border)] px-4 py-4 text-left transition ${
                      selectedLeadId === lead.id ? "bg-[var(--cliente-accent-soft)]" : "hover:bg-[var(--cliente-surface-muted)]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{lead.nome || "Lead"}</p>
                        <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
                          {lead.empresa || lead.email || lead.telefone || "Sem contato"}
                        </p>
                      </div>
                      {lead.heat ? <StateBadge label={lead.heat} tone={getHeatTone(lead.heat)} /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StateBadge label={getPipelineStageLabel(stage)} tone="info" />
                      {lead.priority ? <StateBadge label={lead.priority} tone={getPriorityTone(lead.priority)} /> : null}
                      {typeof lead.score === "number" ? <StateBadge label={`score ${lead.score}`} tone="neutral" /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--cliente-card-text-soft)]">
                      <span>{lead.chatSummary?.unresolved || 0} conversas ativas</span>
                      <span>{lead.chatSummary?.highPriority || 0} prioritarias</span>
                      <span>{formatRelative(lead.chatSummary?.lastInteractionAt)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard className="p-4">
            {selectedLead ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-white">{selectedLead.nome || "Lead"}</h3>
                    <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                      {selectedLead.email || selectedLead.telefone || "Sem contato principal"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.heat ? <StateBadge label={selectedLead.heat} tone={getHeatTone(selectedLead.heat)} /> : null}
                    {selectedLead.priority ? <StateBadge label={selectedLead.priority} tone={getPriorityTone(selectedLead.priority)} /> : null}
                    {typeof selectedLead.score === "number" ? <StateBadge label={`score ${selectedLead.score}`} tone="info" /> : null}
                    {selectedLead.origem ? <StateBadge label={selectedLead.origem} tone="neutral" /> : null}
                    {selectedLead.channel ? <StateBadge label={formatChannelLabel(selectedLead.channel)} tone="neutral" /> : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <Link
                    href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`}
                    className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <MessageSquareText className="h-4 w-4 text-[var(--cliente-accent)]" />
                      Abrir no inbox
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                  </Link>
                  <Link
                    href={`/cliente/painel/pipeline?leadId=${encodeURIComponent(selectedLead.id)}`}
                    className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[var(--cliente-accent)]" />
                      Ver no pipeline
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                  </Link>
                  <Link
                    href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`}
                    className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-[var(--cliente-accent)]" />
                      Gerar proposta
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                  </Link>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Conversas</p>
                    <p className="mt-2 text-lg font-semibold text-white">{selectedConversationSummary.total || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedConversationSummary.open || 0} abertas</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Pendencias</p>
                    <p className="mt-2 text-lg font-semibold text-white">{selectedConversationSummary.pending || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedConversationSummary.unassigned || 0} sem responsavel</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Prioridade</p>
                    <p className="mt-2 text-lg font-semibold text-white">{selectedConversationSummary.highPriority || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">conversas quentes</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Ultimo toque</p>
                    <p className="mt-2 text-lg font-semibold text-white">{formatRelative(selectedConversationSummary.lastInteractionAt)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(selectedConversationSummary.lastInteractionAt)}</p>
                  </div>
                </div>

                {leadQualification || leadStagePolicy || leadHandoff ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle title="Qualificacao IA" subtitle="Score operacional com motivo explicito." />
                        {leadQualification?.band ? (
                          <StateBadge label={leadQualification.label || leadQualification.band} tone={getQualificationTone(leadQualification.band)} />
                        ) : null}
                      </div>
                      <p className="mt-4 text-3xl font-semibold text-white">{leadQualification?.score ?? selectedLead.score ?? "--"}</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
                        Proximo passo: {leadQualification?.nextAction ? humanizeAiNextAction(leadQualification.nextAction) : "Sem recomendacao"}
                      </p>
                      {leadQualification?.recommendedStage ? (
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                          Stage sugerido: {getPipelineStageLabel(leadQualification.recommendedStage, pipelineStages.length ? pipelineStages : undefined)}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {(leadQualification?.reasons || []).slice(0, 3).map((reason) => (
                          <div key={reason.code} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                            <p className="text-xs font-medium text-white">{reason.label}</p>
                            <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{reason.detail}</p>
                          </div>
                        ))}
                        {leadQualification?.missingFields?.length ? (
                          <p className="text-[11px] text-amber-100">
                            Faltando: {leadQualification.missingFields.join(", ").replaceAll("_", " ")}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle title="Governanca da etapa" subtitle="SLA, follow-up e ownership do stage atual." />
                        {leadStagePolicy?.slaBreached ? <StateBadge label="SLA vencido" tone="danger" /> : <StateBadge label="em janela" tone="info" />}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <QuickContext
                          title="Etapa"
                          value={leadStagePolicy?.stageLabel || getPipelineStageLabel(selectedLead.pipelineStage || selectedLead.stage || "captado", pipelineStages.length ? pipelineStages : undefined)}
                          detail={leadStagePolicy?.ownerName ? `Responsavel: ${leadStagePolicy.ownerName}` : "Sem responsavel fixo"}
                        />
                        <QuickContext
                          title="Follow-up"
                          value={leadStagePolicy?.followUpHours ? `${leadStagePolicy.followUpHours}h` : "--"}
                          detail={leadStagePolicy?.slaHours ? `SLA da etapa: ${leadStagePolicy.slaHours}h` : "Sem SLA configurado"}
                        />
                      </div>
                      <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">
                        Vencimento do SLA: {leadStagePolicy?.slaDueAt ? formatDateTime(leadStagePolicy.slaDueAt) : "Nao configurado"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle title="Handoff humano" subtitle="Contexto pronto para assumirmos sem perder historico." />
                        <StateBadge label={leadHandoff?.status === "ready" ? "pronto" : "monitorando"} tone={leadHandoff?.status === "ready" ? "danger" : "info"} />
                      </div>
                      <p className="mt-4 text-sm text-[var(--cliente-card-text)]">{leadHandoff?.reasonLabel || "Aguardando gatilho de handoff."}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{leadHandoff?.summary || "Sem resumo de handoff ainda."}</p>
                      {leadHandoff?.recommendedOwnerName ? (
                        <p className="mt-2 text-xs text-[var(--cliente-card-text-muted)]">Responsavel sugerido: {leadHandoff.recommendedOwnerName}</p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {(leadHandoff?.transcript || []).slice(-2).map((item) => (
                          <div key={item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{item.author || "Contato"}</p>
                            <p className="mt-1 text-sm text-white">{item.text || "--"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {customFieldEntries.length ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle
                        title="Dados capturados"
                        subtitle="Informacoes que vieram da landing, formulario ou qualificacao automatica."
                      />
                      <StateBadge label={`${customFieldEntries.length} campos`} tone="info" />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {customFieldEntries.map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                            {key.replaceAll("_", " ")}
                          </p>
                          <p className="mt-2 text-sm text-white">{formatCustomFieldValue(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {aiCaptureChecklistEntries.length || aiFieldEvidenceEntries.length ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle
                        title="Rastreabilidade IA"
                        subtitle="Origem e confianca de cada dado comercial preenchido automaticamente."
                      />
                      <StateBadge label={`${aiFieldEvidenceEntries.length} evidencias`} tone="info" />
                    </div>

                    {aiCaptureChecklistEntries.length ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                          Checklist de captura
                        </p>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {aiCaptureChecklistEntries.map((item) => (
                            <div
                              key={item.key}
                              className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2"
                            >
                              <p className="text-xs text-white">{item.key.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
                              <StateBadge label={item.done ? "ok" : "pendente"} tone={item.done ? "success" : "warning"} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {aiFieldEvidenceEntries.length ? (
                      <div className="mt-4">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                          Evidencias por campo
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {aiFieldEvidenceEntries.map((item) => (
                            <div
                              key={item.field}
                              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                                  {item.field.replaceAll("_", " ").replaceAll(".", " / ")}
                                </p>
                                <StateBadge
                                  label={
                                    typeof item.confidence === "number"
                                      ? `conf ${Math.round(item.confidence * 100)}%`
                                      : "conf --"
                                  }
                                  tone={getEvidenceConfidenceTone(item.confidence)}
                                />
                              </div>
                              <p className="mt-2 text-sm text-white">{item.value}</p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Fonte: {humanizeEvidenceSource(item.source)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Intent: {item.intent || "--"} · Stage: {item.stateAfter || "--"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Next action: {item.nextAction ? humanizeAiNextAction(item.nextAction) : "--"}
                              </p>
                              <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">
                                Capturado em: {formatDateTime(item.capturedAt)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {selectedLeadAiLogs.length ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle
                        title="Pulso operacional da IA"
                        subtitle="Ultimos proximos passos e campos estruturados para este lead."
                      />
                      <StateBadge label={`${selectedLeadAiLogs.length} sinais`} tone="info" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedLeadAiLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-white">{humanizeAiNextAction(log.nextAction)}</p>
                            <p className="text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(log.createdAt)}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {Object.entries(log.extractedFields || {}).slice(0, 5).map(([field, value]) => (
                              <span
                                key={`${log.id}_${field}`}
                                className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1 text-xs text-[var(--cliente-card-text-muted)]"
                              >
                                {field}: {value}
                              </span>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => applyAiTaskSuggestion(log)}
                              disabled={!canOperate}
                              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50"
                            >
                              Aplicar no follow-up
                            </button>
                            {suggestPipelineStageForAiAction(log.nextAction, stageOptions) ? (
                              <button
                                type="button"
                                onClick={() => applyAiStageSuggestion(log)}
                                disabled={!canOperate}
                                className="rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-accent)] transition hover:brightness-95 disabled:opacity-50"
                              >
                                Preparar stage
                              </button>
                            ) : null}
                            {log.nextAction === "assumir_handoff_humano" ? (
                              <Link
                                href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`}
                                className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-100 transition hover:bg-amber-500/15"
                              >
                                Ir para inbox
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Mover stage</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={nextStage}
                      onChange={(event) => setNextStage(event.target.value)}
                      disabled={!canOperate}
                      className="rounded-xl border client-input px-3 py-2 text-sm"
                    >
                      {stageOptions.map((stage) => (
                        <option key={stage} value={stage}>
                          {getPipelineStageLabel(stage)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => void updateStage()}
                      disabled={savingStage || !canOperate}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-3 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
                    >
                      {savingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar stage
                    </button>
                  </div>
                </div>

                {schedulingAdapter ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle title="Agenda comercial" subtitle="Adapter inicial pronto para Google Calendar." />
                      <StateBadge
                        label={schedulingAdapter.syncReady ? "google pronto" : "nao configurado"}
                        tone={schedulingAdapter.syncReady ? "success" : "warning"}
                      />
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <QuickContext
                        title="Sugestao"
                        value={schedulingAdapter.suggestedEvent?.title || "Reuniao comercial"}
                        detail={schedulingAdapter.suggestedEvent?.startAt ? formatDateTime(schedulingAdapter.suggestedEvent.startAt) : "Sem horario sugerido"}
                      />
                      <QuickContext
                        title="Proximo agendamento"
                        value={nextAppointment?.title || "Nenhum"}
                        detail={nextAppointment?.startAt ? formatDateTime(nextAppointment.startAt) : "Criar na agenda"}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                      {schedulingAdapter.suggestedEvent?.description || "Sem payload sugerido."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`}
                        className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                      >
                        Abrir agenda
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ) : null}

                <form onSubmit={saveProfile} className="mt-4 space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <input value={profileForm.nome} onChange={(event) => setProfileForm((current) => ({ ...current, nome: event.target.value }))} disabled={!canOperate} placeholder="Nome do lead" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.empresa} onChange={(event) => setProfileForm((current) => ({ ...current, empresa: event.target.value }))} disabled={!canOperate} placeholder="Empresa" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.email} onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))} disabled={!canOperate} placeholder="E-mail" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.telefone} onChange={(event) => setProfileForm((current) => ({ ...current, telefone: event.target.value }))} disabled={!canOperate} placeholder="Telefone" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.origem} onChange={(event) => setProfileForm((current) => ({ ...current, origem: event.target.value }))} disabled={!canOperate} placeholder="Origem" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.channel} onChange={(event) => setProfileForm((current) => ({ ...current, channel: event.target.value }))} disabled={!canOperate} placeholder="Canal" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <select value={profileForm.priority} onChange={(event) => setProfileForm((current) => ({ ...current, priority: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
                      {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <select value={profileForm.heat} onChange={(event) => setProfileForm((current) => ({ ...current, heat: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
                      {HEAT_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    <input value={profileForm.score} onChange={(event) => setProfileForm((current) => ({ ...current, score: event.target.value }))} disabled={!canOperate} placeholder="Score" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.potentialValue} onChange={(event) => setProfileForm((current) => ({ ...current, potentialValue: event.target.value }))} disabled={!canOperate} placeholder="Valor potencial" className="rounded-xl border client-input px-3 py-2 text-sm" />
                  </div>
                  <input value={profileForm.tagsInput} onChange={(event) => setProfileForm((current) => ({ ...current, tagsInput: event.target.value }))} disabled={!canOperate} placeholder="Tags separadas por virgula" className="w-full rounded-xl border client-input px-3 py-2 text-sm" />

                  <textarea value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Resumo comercial, contexto e observacoes" className="min-h-[120px] w-full rounded-xl border client-input px-3 py-3 text-sm" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[var(--cliente-card-text-muted)]">
                      Potencial atual: <span className="font-semibold text-white">{formatMoney(selectedLead.potentialValue)}</span>
                    </div>
                    <button
                      type="submit"
                      disabled={savingProfile || !canOperate}
                      className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
                    >
                      {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar perfil
                    </button>
                  </div>
                </form>

                <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                  <CardTitle title="Conversas relacionadas" subtitle="Contexto de atendimento conectado ao lead" />
                  <div className="mt-4 space-y-2">
                    {(detail?.relatedChats || []).length === 0 ? (
                      <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao existe conversa vinculada a este lead.</p>
                    ) : (
                      (detail?.relatedChats || []).map((chat) => (
                        <Link
                          key={chat.id}
                          href={`/cliente/painel/inbox?chatId=${encodeURIComponent(chat.id)}&leadId=${encodeURIComponent(selectedLead.id)}`}
                          className="block rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:bg-[var(--cliente-panel-soft)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-medium text-[var(--cliente-card-text)]">{chat.contactName || selectedLead.nome || "Contato"}</p>
                                <StateBadge label={formatChannelLabel(chat.channel)} tone="neutral" />
                              </div>
                              <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
                                {chat.lastMessage || chat.contactPhone || "Sem mensagem recente"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-[var(--cliente-card-text-soft)]">{formatRelative(chat.lastMessageTime)}</p>
                              {typeof chat.unreadCount === "number" && chat.unreadCount > 0 ? (
                                <p className="mt-1 text-[11px] text-amber-100">{chat.unreadCount} sem resposta</p>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <StateBadge label={chat.status || "open"} tone={chat.status === "resolved" ? "success" : chat.status === "pending" ? "warning" : "info"} />
                            {chat.priority ? <StateBadge label={chat.priority} tone={getPriorityTone(chat.priority)} /> : null}
                            {chat.ownerName ? <StateBadge label={chat.ownerName} tone="neutral" /> : null}
                            {chat.contactPhone ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--cliente-card-text-soft)]">
                                <PhoneCall className="h-3.5 w-3.5" />
                                {chat.contactPhone}
                              </span>
                            ) : null}
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Selecione um lead para abrir o detalhe.</p>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <CardTitle title="Timeline do lead" subtitle="Eventos, movimentacoes e historico recente" />
            <div className="mt-4 max-h-[36vh] space-y-2 overflow-y-auto">
              {(detail?.timeline || selectedLead?.timeline || []).length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem eventos ainda.</p>
              ) : (
                (detail?.timeline || selectedLead?.timeline || []).map((event) => (
                  <div key={event.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                    <p className="text-sm text-[var(--cliente-card-text)]">{event.title || event.type || "Evento"}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{event.detail || "Sem detalhe"}</p>
                    <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">{formatDateTime(event.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>

        <div className="space-y-4">
          <PanelCard className="p-4">
            <CardTitle title="Follow-ups e tarefas" subtitle="Acompanhe o proximo passo comercial" />

            <form onSubmit={createTask} className="mt-4 space-y-3">
              <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} disabled={!canOperate} placeholder="Ex: Retornar proposta ou ligar amanha" className="w-full rounded-xl border client-input px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-3">
                <input type="datetime-local" value={taskForm.dueAt} onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm" />
                <select value={taskForm.type} onChange={(event) => setTaskForm((current) => ({ ...current, type: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
                  <option value="follow_up">follow_up</option>
                  <option value="ligacao">ligacao</option>
                  <option value="reuniao">reuniao</option>
                  <option value="pendencia">pendencia</option>
                </select>
                <select value={taskForm.priority} onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
                  {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <button type="submit" disabled={!taskForm.title.trim() || savingTask || !canOperate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50">
                {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                Criar tarefa
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {(detail?.tasks || []).length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhum follow-up criado para este lead.</p>
              ) : (
                (detail?.tasks || []).map((task) => (
                  <button key={task.id} type="button" onClick={() => void toggleTask(task.id, task.status === "done" ? "pending" : "done")} disabled={!canOperate} className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-left transition hover:bg-[var(--cliente-panel-soft)] disabled:cursor-default">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{task.type || "follow_up"} {task.dueAt ? `· ${formatDateTime(task.dueAt)}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <StateBadge label={task.status || "pending"} tone={task.status === "done" ? "success" : "warning"} />
                        {task.priority ? <StateBadge label={task.priority} tone={getPriorityTone(task.priority)} /> : null}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-4">
            <CardTitle title="Notas do lead" subtitle="Contexto comercial e memoria operacional" />

            <form onSubmit={createNote} className="mt-4 space-y-3">
              <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canOperate} placeholder="Registrar objeccoes, contexto, proximos passos..." className="min-h-[96px] w-full rounded-xl border client-input px-3 py-3 text-sm" />
              <button type="submit" disabled={!noteText.trim() || savingNote || !canOperate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50">
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Adicionar nota
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {(detail?.notes || []).length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhuma nota interna para este lead.</p>
              ) : (
                (detail?.notes || []).map((note) => (
                  <div key={note.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        <UserRound className="h-3.5 w-3.5" />
                        {note.authorName || "Equipe"}
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{formatDateTime(note.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text)]">{note.text || "-"}</p>
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</div> : null}
    </div>
  );
}

function QuickContext({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );
}


