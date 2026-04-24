"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Flame,
  Loader2,
  MessageSquareText,
  PhoneCall,
  Save,
  Search,
  Sparkles,
  Upload,
  UserRound,
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

type LeadImportSummary = {
  totalRows?: number;
  processed?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  delimiter?: string;
  importBatchId?: string;
  importBatchTag?: string;
  sourceLabel?: string;
};

type LeadImportRowResult = {
  row: number;
  status: "created" | "updated" | "skipped" | "error";
  leadId?: string;
  message?: string;
};

type LeadImportPayload = {
  ok?: boolean;
  summary?: LeadImportSummary;
  rows?: LeadImportRowResult[];
  rowsTruncated?: boolean;
  error?: string;
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

function readConsentOption(value: string) {
  if (value === "sim") return true;
  if (value === "nao") return false;
  return null;
}

function buildLeadTemplateCsv() {
  const headers = [
    "nome",
    "telefone",
    "email",
    "empresa",
    "origem",
    "channel",
    "tags",
    "mensagem",
    "consent_whatsapp",
    "consent_email",
  ];
  const sampleRows = [
    ["Maria Souza", "5511999999999", "maria@empresa.com", "Empresa Alpha", "Base legado", "whatsapp", "vip;recorrente", "Cliente pediu proposta", "sim", "sim"],
    ["Joao Lima", "5511988888888", "joao@empresa.com", "Empresa Beta", "Evento 2026", "whatsapp", "morno", "", "sim", "indefinido"],
  ];

  return [headers.join(","), ...sampleRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(","))].join("\n");
}

export default function ClienteCrmPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const stageFromQuery = searchParams.get("stage");
  const heatFromQuery = searchParams.get("heat");
  const priorityFromQuery = searchParams.get("priority");
  const sourceFromQuery = searchParams.get("source");
  const channelFromQuery = searchParams.get("channel");
  const canOperate = hasCapability("edit_leads");
  const canManageAutomations = hasCapability("manage_automations");

  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [importingCsv, setImportingCsv] = useState(false);
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
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importSourceLabel, setImportSourceLabel] = useState("Importacao CRM");
  const [importDefaultChannel, setImportDefaultChannel] = useState("whatsapp");
  const [importDefaultConsentWhatsApp, setImportDefaultConsentWhatsApp] = useState("sim");
  const [importDefaultConsentEmail, setImportDefaultConsentEmail] = useState("indefinido");
  const [importSummary, setImportSummary] = useState<LeadImportSummary | null>(null);
  const [importRows, setImportRows] = useState<LeadImportRowResult[]>([]);
  const [importRowsTruncated, setImportRowsTruncated] = useState(false);
  const [creatingImportCampaign, setCreatingImportCampaign] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [showAdvancedLeadInsights, setShowAdvancedLeadInsights] = useState(false);

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

  useEffect(() => {
    if (experienceMode !== "completo") {
      setShowAdvancedLeadInsights(false);
    }
  }, [experienceMode]);

  useEffect(() => {
    setShowAdvancedLeadInsights(false);
  }, [selectedLeadId]);

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
            title: "Contatos quentes pedindo acao",
            detail: `${hotLeads.length} contato(s) com alta temperatura exigem cadencia curta no CRM.`,
            href: "/cliente/painel/crm?heat=quente",
            tone: "danger" as const,
            badge: "quente",
          }
        : null,
      proposalLeads.length
        ? {
            id: "proposal",
            title: "Contatos em proposta",
            detail: `${proposalLeads.length} contato(s) estao na etapa de proposta e merecem retorno comercial.`,
            href: "/cliente/painel/crm?stage=proposta",
            tone: "warning" as const,
            badge: "proposta",
          }
        : null,
      highPriorityLeads.length
        ? {
            id: "priority",
            title: "Prioridade alta no pipeline",
            detail: `${highPriorityLeads.length} contato(s) estao marcados como prioridade alta.`,
            href: "/cliente/painel/crm?priority=high",
            tone: "info" as const,
            badge: "prioridade",
          }
        : null,
      neglectedHotLeads.length
        ? {
            id: "neglected",
            title: "Contatos quentes sem historico recente",
            detail: `${neglectedHotLeads.length} contato(s) quentes ainda nao mostram interacao recente consolidada.`,
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
  const hasAdvancedLeadInsights = Boolean(
    leadQualification ||
      leadStagePolicy ||
      leadHandoff ||
      customFieldEntries.length ||
      aiCaptureChecklistEntries.length ||
      aiFieldEvidenceEntries.length ||
      selectedLeadAiLogs.length
  );
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
        setError(payload.error || "Falha ao atualizar etapa.");
        return;
      }

      await refreshCurrent();
    } catch {
      setError("Falha ao atualizar etapa do contato.");
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

  async function importLeadBase(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate || !importFile) return;

    setImportingCsv(true);
    setError(null);
    setImportNotice(null);

    try {
      const csvContent = await importFile.text();
      if (!csvContent.trim()) {
        setError("Arquivo CSV vazio. Selecione um arquivo com dados.");
        return;
      }

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent,
          defaultSourceLabel: importSourceLabel.trim() || "Importacao CRM",
          defaultChannel: importDefaultChannel.trim() || "whatsapp",
          defaultConsentWhatsApp: readConsentOption(importDefaultConsentWhatsApp),
          defaultConsentEmail: readConsentOption(importDefaultConsentEmail),
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as LeadImportPayload;
      if (!res.ok) {
        setError(payload.error || "Falha ao importar base.");
        return;
      }

      setImportSummary(payload.summary || null);
      setImportRows(payload.rows || []);
      setImportRowsTruncated(Boolean(payload.rowsTruncated));
      setImportNotice(`Base importada com sucesso. Lote ${payload.summary?.importBatchId || "--"}.`);
      await refreshCurrent();
    } catch {
      setError("Falha ao importar arquivo CSV.");
    } finally {
      setImportingCsv(false);
    }
  }

  async function createCampaignFromImportedBase() {
    if (!tenant?.tenantId || !canManageAutomations || !importSummary?.importBatchTag) return;

    setCreatingImportCampaign(true);
    setError(null);
    setImportNotice(null);
    try {
      const recipientsTarget = Math.max(
        1,
        Math.min(500, Number(importSummary.processed || importSummary.totalRows || 50))
      );
      const campaignName = `Outbound base ${importSummary.importBatchTag}`;
      const messageTemplate =
        "Oi {nome}, aqui e da ALTUM. Vi que ja tivemos contato e queria te atualizar com uma condicao especial desta semana.";

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: campaignName,
          status: "draft",
          messageTemplate,
          maxRecipients: recipientsTarget,
          filters: {
            tags: [importSummary.importBatchTag],
            stageIds: [],
            ownerIds: [],
            sources: [],
            heat: [],
          },
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; campaignId?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar campanha a partir da base.");
        return;
      }

      setImportNotice("Campanha criada com a base importada. Redirecionando para disparos.");
      const campaignId = String(payload.campaignId || "").trim();
      if (campaignId) {
        router.push(`/cliente/painel/campanhas?campaignId=${encodeURIComponent(campaignId)}`);
      } else {
        router.push("/cliente/painel/campanhas");
      }
    } catch {
      setError("Falha ao criar campanha da base importada.");
    } finally {
      setCreatingImportCampaign(false);
    }
  }

  function downloadImportTemplate() {
    const content = buildLeadTemplateCsv();
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo-importacao-leads-altum.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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

  const importResultPreview = importRows.slice(0, 10);
  const importPanel = (
    <PanelCard className="p-4">
      <CardTitle
        title="Importar base de contatos"
        subtitle="Suba CSV para entrar no CRM com deduplicacao por telefone/email/id externo."
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={downloadImportTemplate}
          disabled={!canOperate || importingCsv}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-60"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar modelo CSV
        </button>
        <Link
          href="/cliente/painel/campanhas"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          Ir para disparos
        </Link>
        <p className="text-xs text-[var(--cliente-card-text-soft)]">
          Colunas principais: nome, telefone, email, empresa, origem, channel, tags.
        </p>
      </div>
      <form onSubmit={importLeadBase} className="mt-4 space-y-3">
        <label className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)]">
          <span className="truncate">{importFile?.name || "Selecionar arquivo CSV"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={!canOperate || importingCsv}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setImportFile(file);
              setImportSummary(null);
              setImportRows([]);
              setImportRowsTruncated(false);
              setImportNotice(null);
            }}
            className="hidden"
          />
          <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2 py-1 text-xs">
            <Upload className="h-3.5 w-3.5" />
            escolher
          </span>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={importSourceLabel}
            onChange={(event) => setImportSourceLabel(event.target.value)}
            disabled={!canOperate || importingCsv}
            placeholder="Origem padrao"
            className="rounded-xl border client-input px-3 py-2 text-sm"
          />
          <select
            value={importDefaultChannel}
            onChange={(event) => setImportDefaultChannel(event.target.value)}
            disabled={!canOperate || importingCsv}
            className="rounded-xl border client-input px-3 py-2 text-sm"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="site_chat">Site chat</option>
            <option value="email">Email</option>
          </select>
          <select
            value={importDefaultConsentWhatsApp}
            onChange={(event) => setImportDefaultConsentWhatsApp(event.target.value)}
            disabled={!canOperate || importingCsv}
            className="rounded-xl border client-input px-3 py-2 text-sm"
          >
            <option value="sim">Consentimento WhatsApp: sim</option>
            <option value="nao">Consentimento WhatsApp: nao</option>
            <option value="indefinido">Consentimento WhatsApp: indefinido</option>
          </select>
          <select
            value={importDefaultConsentEmail}
            onChange={(event) => setImportDefaultConsentEmail(event.target.value)}
            disabled={!canOperate || importingCsv}
            className="rounded-xl border client-input px-3 py-2 text-sm"
          >
            <option value="indefinido">Consentimento email: indefinido</option>
            <option value="sim">Consentimento email: sim</option>
            <option value="nao">Consentimento email: nao</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={!canOperate || importingCsv || !importFile}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {importingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Importar CSV no CRM
        </button>
        <p className="text-[11px] text-[var(--cliente-card-text-soft)]">
          Dedupe automatico por `source_id`, telefone, email e `external_profile_id`.
        </p>
      </form>

      {importSummary ? (
        <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Resultado da importacao</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <QuickContext
              title="Processadas"
              value={`${importSummary.processed || 0}/${importSummary.totalRows || 0}`}
              detail={`criadas ${importSummary.created || 0} | atualizadas ${importSummary.updated || 0}`}
            />
            <QuickContext
              title="Ignoradas"
              value={String(importSummary.skipped || 0)}
              detail={`erros ${importSummary.errors || 0}`}
            />
            <QuickContext
              title="Lote"
              value={importSummary.importBatchId || "--"}
              detail={`delimitador ${importSummary.delimiter || ","}`}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
            Tag automatica da base: {importSummary.importBatchTag || "--"}
          </p>

          {canManageAutomations && importSummary.importBatchTag ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void createCampaignFromImportedBase()}
                disabled={creatingImportCampaign}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/16 disabled:opacity-55"
              >
                {creatingImportCampaign ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquareText className="h-3.5 w-3.5" />}
                Criar campanha com essa base
              </button>
            </div>
          ) : null}

          {importResultPreview.length > 0 ? (
            <div className="mt-3 space-y-2">
              {importResultPreview.map((item) => (
                <div
                  key={`${item.row}_${item.status}_${item.leadId || ""}`}
                  className="rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs"
                >
                  <span className="font-semibold text-[var(--cliente-card-text)]">Linha {item.row}</span>{" "}
                  <span className="text-[var(--cliente-card-text-soft)]">
                    {item.status}
                    {item.leadId ? ` | ${item.leadId}` : ""}
                    {item.message ? ` | ${item.message}` : ""}
                  </span>
                </div>
              ))}
              {importRowsTruncated ? (
                <p className="text-[11px] text-[var(--cliente-card-text-soft)]">
                  Resultado completo truncado para manter a tela leve.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {importNotice ? (
        <p className="mt-3 text-xs text-emerald-100">{importNotice}</p>
      ) : null}
    </PanelCard>
  );

  if (!loading && leads.length === 0) {
    return (
      <div className="client-daily-page space-y-4">
        <SectionHeader title="CRM" subtitle="Gestao comercial, retornos e visao real de cada contato." />
        {importPanel}
        <EmptyState title="Nenhum contato encontrado" description="Quando novos contatos entrarem no tenant, o CRM operacional aparecera aqui." />
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-4">
      <SectionHeader
        title="CRM"
        subtitle={
          experienceMode === "essencial"
            ? "Operacao comercial diaria com foco em lista de contatos, proximo passo e decisao."
            : "Visao completa de pipeline, qualificacao, tarefas e contexto comercial."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {loadingDetail ? <StateBadge label="sincronizando contato" tone="info" /> : null}
            <div className="inline-flex rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-1">
              <button
                type="button"
                onClick={() => setExperienceMode("essencial")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  experienceMode === "essencial"
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                }`}
              >
                Modo simples
              </button>
              <button
                type="button"
                onClick={() => setExperienceMode("completo")}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  experienceMode === "completo"
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                }`}
              >
                Modo completo
              </button>
            </div>
          </div>
        }
      />

      <section className={`grid gap-3 sm:grid-cols-2 ${experienceMode === "completo" ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        <MetricCard label="Contatos ativos" value={crmStats.active.toLocaleString("pt-BR")} icon={UserRound} trend="fora do perdido" />
        <MetricCard label="Contatos quentes" value={crmStats.hot.toLocaleString("pt-BR")} icon={Flame} trend="temperatura alta em operacao" />
        {experienceMode === "completo" ? (
          <MetricCard label="Pontuacao media" value={crmStats.avgScore.toLocaleString("pt-BR")} icon={Sparkles} trend="qualidade media da base" />
        ) : null}
        <MetricCard label="Potencial aberto" value={formatMoney(crmStats.openValue)} icon={ClipboardList} trend="valor estimado em pipeline" />
      </section>

      {experienceMode === "completo" ? importPanel : null}

      {experienceMode === "completo" ? (
        <section className="grid gap-4 xl:grid-cols-3">
        <PanelCard className="p-5">
          <CardTitle title="Foco comercial" subtitle="Recortes rapidos para atacar o pipeline agora" />
          <div className="mt-4 space-y-3">
            {focusSignals.length === 0 ? (
              <EmptyState
                title="Sem gargalos comerciais evidentes"
                description="A base atual nao mostra concentracao anormal de contatos quentes, propostas ou prioridades altas."
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
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
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
            <QuickContext title="Contato selecionado" value={selectedLead?.nome || "Nenhum"} detail="mantido no link atual" />
            <QuickContext title="Etapa" value={stageFilter === "all" ? "Todos" : getPipelineStageLabel(stageFilter)} detail="filtro do funil" />
            <QuickContext title="Temperatura" value={heatFilter === "all" ? "Todas" : heatFilter} detail="ritmo do atendimento" />
            <QuickContext title="Prioridade" value={priorityFilter === "all" ? "Todas" : priorityFilter} detail="foco da equipe" />
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
      ) : (
        <section className="grid gap-4 xl:grid-cols-2">
          <PanelCard className="p-5">
            <CardTitle title="Leitura rapida do funil" subtitle="Somente o essencial para decidir o proximo passo." />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <QuickContext title="Contato em foco" value={selectedLead?.nome || "Nenhum"} detail={selectedLead?.empresa || "Sem empresa"} />
              <QuickContext title="Etapa atual" value={selectedLead ? getPipelineStageLabel(selectedLead.pipelineStage || selectedLead.stage || "captado") : "Sem etapa"} detail="movimente sem abrir telas extras" />
              <QuickContext title="Valor potencial" value={formatMoney(selectedLead?.potentialValue)} detail="estimativa do pipeline" />
              <QuickContext title="Ultimo toque" value={formatRelative(selectedLead?.chatSummary?.lastInteractionAt)} detail={formatDateTime(selectedLead?.chatSummary?.lastInteractionAt)} />
            </div>
          </PanelCard>
          <PanelCard className="p-5">
            <CardTitle title="Acoes de hoje" subtitle="Atalhos mais usados do CRM operacional." />
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <Link
                href={selectedLead ? `/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}` : "/cliente/painel/inbox"}
                className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span className="inline-flex items-center gap-2">
                  <MessageSquareText className="h-4 w-4 text-[var(--cliente-accent)]" />
                  Abrir conversa
                </span>
                <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
              </Link>
              <Link
                href={selectedLead ? `/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}` : "/cliente/painel/comercial"}
                className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <span className="inline-flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[var(--cliente-accent)]" />
                  Ir para comercial
                </span>
                <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
              </Link>
            </div>
          </PanelCard>
        </section>
      )}

      {experienceMode === "essencial" ? (
        <section className="grid min-h-[74vh] grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
          <PanelCard className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-[var(--cliente-border)] p-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle title="Contatos" subtitle={`${filteredLeads.length} em foco`} />
                <StateBadge label={`${leads.length} total`} tone="info" />
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
                <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar contato..."
                  className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
              </label>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)} className="rounded-xl border client-input px-3 py-2 text-sm">
                  <option value="all">Todas as etapas</option>
                  {stageOptions.map((option) => (
                    <option key={option} value={option}>
                      {getPipelineStageLabel(option)}
                    </option>
                  ))}
                </select>
                <select value={heatFilter} onChange={(event) => setHeatFilter(event.target.value)} className="rounded-xl border client-input px-3 py-2 text-sm">
                  <option value="all">Todas as temperaturas</option>
                  {HEAT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="rounded-xl border client-input px-3 py-2 text-sm">
                  <option value="all">Todas as prioridades</option>
                  {PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
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
                      <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{lead.nome || "Contato"}</p>
                      <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
                        {lead.empresa || lead.email || lead.telefone || "Sem contato"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StateBadge label={getPipelineStageLabel(stage)} tone="info" />
                        {lead.priority ? <StateBadge label={lead.priority} tone={getPriorityTone(lead.priority)} /> : null}
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
                      <h3 className="text-xl font-semibold text-[var(--cliente-card-text)]">{selectedLead.nome || "Contato"}</h3>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                        {selectedLead.empresa || selectedLead.email || selectedLead.telefone || "Sem contato principal"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedLead.heat ? <StateBadge label={selectedLead.heat} tone={getHeatTone(selectedLead.heat)} /> : null}
                      {selectedLead.priority ? <StateBadge label={selectedLead.priority} tone={getPriorityTone(selectedLead.priority)} /> : null}
                      {typeof selectedLead.score === "number" ? <StateBadge label={`pontuacao ${selectedLead.score}`} tone="info" /> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    <Link
                      href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`}
                      className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                    >
                      <span>Inbox</span>
                      <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                    </Link>
                    <Link
                      href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`}
                      className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
                    >
                      <span>Comercial</span>
                      <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setExperienceMode("completo")}
                      className="inline-flex items-center justify-between rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-3 text-sm text-[var(--cliente-accent)] transition hover:brightness-95"
                    >
                      <span>Ver completo</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                    <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Mover etapa</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={nextStage} onChange={(event) => setNextStage(event.target.value)} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
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
                        Salvar
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Selecione um contato para abrir o detalhe.</p>
              )}
            </PanelCard>

            <section className="grid gap-4 xl:grid-cols-2">
              <PanelCard className="p-4">
                <CardTitle title="Proximo passo" subtitle="Retorno rapido para nao perder o momento." />
                <form onSubmit={createTask} className="mt-3 space-y-2">
                  <input
                    value={taskForm.title}
                    onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))}
                    disabled={!canOperate}
                    placeholder="Ex: Retornar proposta hoje"
                    className="w-full rounded-xl border client-input px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="datetime-local"
                      value={taskForm.dueAt}
                      onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))}
                      disabled={!canOperate}
                      className="rounded-xl border client-input px-3 py-2 text-sm"
                    />
                    <select
                      value={taskForm.priority}
                      onChange={(event) => setTaskForm((current) => ({ ...current, priority: event.target.value }))}
                      disabled={!canOperate}
                      className="rounded-xl border client-input px-3 py-2 text-sm"
                    >
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button type="submit" disabled={!taskForm.title.trim() || savingTask || !canOperate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50">
                    {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Criar retorno
                  </button>
                </form>
                <div className="mt-3 space-y-2">
                  {(detail?.tasks || []).slice(0, 4).map((task) => (
                    <button key={task.id} type="button" onClick={() => void toggleTask(task.id, task.status === "done" ? "pending" : "done")} disabled={!canOperate} className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-left transition hover:bg-[var(--cliente-panel-soft)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                        <StateBadge label={task.status || "pending"} tone={task.status === "done" ? "success" : "warning"} />
                      </div>
                    </button>
                  ))}
                </div>
              </PanelCard>

              <PanelCard className="p-4">
                <CardTitle title="Notas e historico" subtitle="Contexto rapido do contato." />
                <form onSubmit={createNote} className="mt-3 space-y-2">
                  <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canOperate} placeholder="Adicionar nota curta..." className="min-h-[84px] w-full rounded-xl border client-input px-3 py-3 text-sm" />
                  <button type="submit" disabled={!noteText.trim() || savingNote || !canOperate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50">
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Salvar nota
                  </button>
                </form>
                <div className="mt-3 space-y-2">
                  {(detail?.notes || []).slice(0, 3).map((note) => (
                    <div key={note.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                      <p className="text-xs text-[var(--cliente-card-text)]">{note.text || "-"}</p>
                      <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">{formatDateTime(note.createdAt)}</p>
                    </div>
                  ))}
                  {(detail?.timeline || selectedLead?.timeline || []).slice(0, 4).map((event) => (
                    <div key={event.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
                      <p className="text-xs text-[var(--cliente-card-text)]">{event.title || event.type || "Evento"}</p>
                      <p className="mt-1 text-[10px] text-[var(--cliente-card-text-soft)]">{formatDateTime(event.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </PanelCard>
            </section>
          </div>
        </section>
      ) : (
      <section className="grid min-h-[74vh] grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
        <PanelCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Base de contatos" subtitle={`${filteredLeads.length} visiveis`} />
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
                <option value="all">Todas as etapas</option>
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
                        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{lead.nome || "Contato"}</p>
                        <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">
                          {lead.empresa || lead.email || lead.telefone || "Sem contato"}
                        </p>
                      </div>
                      {lead.heat ? <StateBadge label={lead.heat} tone={getHeatTone(lead.heat)} /> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StateBadge label={getPipelineStageLabel(stage)} tone="info" />
                      {lead.priority ? <StateBadge label={lead.priority} tone={getPriorityTone(lead.priority)} /> : null}
                      {typeof lead.score === "number" ? <StateBadge label={`pontuacao ${lead.score}`} tone="neutral" /> : null}
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
                    <h3 className="text-xl font-semibold text-[var(--cliente-card-text)]">{selectedLead.nome || "Contato"}</h3>
                    <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
                      {selectedLead.email || selectedLead.telefone || "Sem contato principal"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.heat ? <StateBadge label={selectedLead.heat} tone={getHeatTone(selectedLead.heat)} /> : null}
                    {selectedLead.priority ? <StateBadge label={selectedLead.priority} tone={getPriorityTone(selectedLead.priority)} /> : null}
                    {typeof selectedLead.score === "number" ? <StateBadge label={`pontuacao ${selectedLead.score}`} tone="info" /> : null}
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
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{selectedConversationSummary.total || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedConversationSummary.open || 0} abertas</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Pendencias</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{selectedConversationSummary.pending || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedConversationSummary.unassigned || 0} sem responsavel</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Prioridade</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{selectedConversationSummary.highPriority || 0}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">conversas quentes</p>
                  </div>
                  <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Ultimo toque</p>
                    <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{formatRelative(selectedConversationSummary.lastInteractionAt)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(selectedConversationSummary.lastInteractionAt)}</p>
                  </div>
                </div>

                {hasAdvancedLeadInsights ? (
                  <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-[var(--cliente-card-text-muted)]">
                        Detalhes de IA, rastreabilidade e governanca ficam ocultos para reduzir ruido visual.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAdvancedLeadInsights((current) => !current)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          showAdvancedLeadInsights
                            ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
                        }`}
                      >
                        {showAdvancedLeadInsights ? "Ocultar detalhes avancados" : "Mostrar detalhes avancados"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {showAdvancedLeadInsights && (leadQualification || leadStagePolicy || leadHandoff) ? (
                  <div className="mt-4 grid gap-3 xl:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <CardTitle title="Qualificacao IA" subtitle="Score operacional com motivo explicito." />
                        {leadQualification?.band ? (
                          <StateBadge label={leadQualification.label || leadQualification.band} tone={getQualificationTone(leadQualification.band)} />
                        ) : null}
                      </div>
                      <p className="mt-4 text-3xl font-semibold text-[var(--cliente-card-text)]">{leadQualification?.score ?? selectedLead.score ?? "--"}</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
                        Proximo passo: {leadQualification?.nextAction ? humanizeAiNextAction(leadQualification.nextAction) : "Sem recomendacao"}
                      </p>
                      {leadQualification?.recommendedStage ? (
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                          Etapa sugerida: {getPipelineStageLabel(leadQualification.recommendedStage, pipelineStages.length ? pipelineStages : undefined)}
                        </p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {(leadQualification?.reasons || []).slice(0, 3).map((reason) => (
                          <div key={reason.code} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                            <p className="text-xs font-medium text-[var(--cliente-card-text)]">{reason.label}</p>
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
                        <CardTitle title="Governanca da etapa" subtitle="SLA, retorno e responsavel da etapa atual." />
                        {leadStagePolicy?.slaBreached ? <StateBadge label="SLA vencido" tone="danger" /> : <StateBadge label="em janela" tone="info" />}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <QuickContext
                          title="Etapa"
                          value={leadStagePolicy?.stageLabel || getPipelineStageLabel(selectedLead.pipelineStage || selectedLead.stage || "captado", pipelineStages.length ? pipelineStages : undefined)}
                          detail={leadStagePolicy?.ownerName ? `Responsavel: ${leadStagePolicy.ownerName}` : "Sem responsavel fixo"}
                        />
                        <QuickContext
                          title="Retorno"
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
                        <CardTitle title="Transferencia para humano" subtitle="Contexto pronto para assumirmos sem perder historico." />
                        <StateBadge label={leadHandoff?.status === "ready" ? "pronto" : "monitorando"} tone={leadHandoff?.status === "ready" ? "danger" : "info"} />
                      </div>
                      <p className="mt-4 text-sm text-[var(--cliente-card-text)]">{leadHandoff?.reasonLabel || "Aguardando gatilho de transferencia."}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{leadHandoff?.summary || "Sem resumo de transferencia ainda."}</p>
                      {leadHandoff?.recommendedOwnerName ? (
                        <p className="mt-2 text-xs text-[var(--cliente-card-text-muted)]">Responsavel sugerido: {leadHandoff.recommendedOwnerName}</p>
                      ) : null}
                      <div className="mt-3 space-y-2">
                        {(leadHandoff?.transcript || []).slice(-2).map((item) => (
                          <div key={item.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{item.author || "Contato"}</p>
                            <p className="mt-1 text-sm text-[var(--cliente-card-text)]">{item.text || "--"}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}

                {showAdvancedLeadInsights && customFieldEntries.length ? (
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
                          <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{formatCustomFieldValue(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showAdvancedLeadInsights && (aiCaptureChecklistEntries.length || aiFieldEvidenceEntries.length) ? (
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
                              <p className="text-xs text-[var(--cliente-card-text)]">{item.key.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
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
                              <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{item.value}</p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Fonte: {humanizeEvidenceSource(item.source)}
                              </p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Intencao: {item.intent || "--"} | Etapa: {item.stateAfter || "--"}
                              </p>
                              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                                Proxima acao: {item.nextAction ? humanizeAiNextAction(item.nextAction) : "--"}
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

                {showAdvancedLeadInsights && selectedLeadAiLogs.length ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <CardTitle
                        title="Pulso operacional da IA"
                        subtitle="Ultimos proximos passos e campos estruturados para este contato."
                      />
                      <StateBadge label={`${selectedLeadAiLogs.length} sinais`} tone="info" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {selectedLeadAiLogs.map((log) => (
                        <div key={log.id} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-[var(--cliente-card-text)]">{humanizeAiNextAction(log.nextAction)}</p>
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
                              Aplicar no retorno
                            </button>
                            {suggestPipelineStageForAiAction(log.nextAction, stageOptions) ? (
                              <button
                                type="button"
                                onClick={() => applyAiStageSuggestion(log)}
                                disabled={!canOperate}
                                className="rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-accent)] transition hover:brightness-95 disabled:opacity-50"
                              >
                                Preparar etapa
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
                  <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Mover etapa</p>
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
                      Salvar etapa
                    </button>
                  </div>
                </div>

                {schedulingAdapter ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle title="Agenda comercial" subtitle="Integracao inicial pronta para Google Calendar." />
                      <StateBadge
                        label={schedulingAdapter.syncReady ? "Google pronto" : "nao configurado"}
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
                    <input value={profileForm.nome} onChange={(event) => setProfileForm((current) => ({ ...current, nome: event.target.value }))} disabled={!canOperate} placeholder="Nome do contato" className="rounded-xl border client-input px-3 py-2 text-sm" />
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
                    <input value={profileForm.score} onChange={(event) => setProfileForm((current) => ({ ...current, score: event.target.value }))} disabled={!canOperate} placeholder="Pontuacao" className="rounded-xl border client-input px-3 py-2 text-sm" />
                    <input value={profileForm.potentialValue} onChange={(event) => setProfileForm((current) => ({ ...current, potentialValue: event.target.value }))} disabled={!canOperate} placeholder="Valor potencial" className="rounded-xl border client-input px-3 py-2 text-sm" />
                  </div>
                  <input value={profileForm.tagsInput} onChange={(event) => setProfileForm((current) => ({ ...current, tagsInput: event.target.value }))} disabled={!canOperate} placeholder="Tags separadas por virgula" className="w-full rounded-xl border client-input px-3 py-2 text-sm" />

                  <textarea value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Resumo comercial, contexto e observacoes" className="min-h-[120px] w-full rounded-xl border client-input px-3 py-3 text-sm" />

                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-[var(--cliente-card-text-muted)]">
                      Potencial atual: <span className="font-semibold text-[var(--cliente-card-text)]">{formatMoney(selectedLead.potentialValue)}</span>
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
                  <CardTitle title="Conversas relacionadas" subtitle="Contexto de atendimento conectado ao contato" />
                  <div className="mt-4 space-y-2">
                    {(detail?.relatedChats || []).length === 0 ? (
                      <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao existe conversa vinculada a este contato.</p>
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
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Selecione um contato para abrir o detalhe.</p>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <CardTitle title="Historico do contato" subtitle="Eventos, movimentacoes e historico recente" />
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
            <CardTitle title="Retornos e tarefas" subtitle="Acompanhe o proximo passo comercial" />

            <form onSubmit={createTask} className="mt-4 space-y-3">
              <input value={taskForm.title} onChange={(event) => setTaskForm((current) => ({ ...current, title: event.target.value }))} disabled={!canOperate} placeholder="Ex: Retornar proposta ou ligar amanha" className="w-full rounded-xl border client-input px-3 py-2 text-sm" />
              <div className="grid gap-3 sm:grid-cols-3">
                <input type="datetime-local" value={taskForm.dueAt} onChange={(event) => setTaskForm((current) => ({ ...current, dueAt: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm" />
                <select value={taskForm.type} onChange={(event) => setTaskForm((current) => ({ ...current, type: event.target.value }))} disabled={!canOperate} className="rounded-xl border client-input px-3 py-2 text-sm">
                  <option value="follow_up">retorno</option>
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
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhum retorno criado para este contato.</p>
              ) : (
                (detail?.tasks || []).map((task) => (
                  <button key={task.id} type="button" onClick={() => void toggleTask(task.id, task.status === "done" ? "pending" : "done")} disabled={!canOperate} className="w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-left transition hover:bg-[var(--cliente-panel-soft)] disabled:cursor-default">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{task.type === "follow_up" ? "retorno" : task.type || "retorno"} {task.dueAt ? `| ${formatDateTime(task.dueAt)}` : ""}</p>
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
            <CardTitle title="Notas do contato" subtitle="Contexto comercial e memoria operacional" />

            <form onSubmit={createNote} className="mt-4 space-y-3">
              <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canOperate} placeholder="Registrar objeccoes, contexto, proximos passos..." className="min-h-[96px] w-full rounded-xl border client-input px-3 py-3 text-sm" />
              <button type="submit" disabled={!noteText.trim() || savingNote || !canOperate} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50">
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Adicionar nota
              </button>
            </form>

            <div className="mt-4 space-y-2">
              {(detail?.notes || []).length === 0 ? (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhuma nota interna para este contato.</p>
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
      )}

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
      <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );
}



