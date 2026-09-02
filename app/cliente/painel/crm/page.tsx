"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  DollarSign,
  Bot,
  FileText,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shuffle,
  Trash2,
  Upload,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CustomerProfileDrawer } from "@/app/cliente/painel/components/customer-profile-drawer";
import {
  CrmAvatar,
  CrmBadge,
  CrmButton,
  CrmEmpty,
  CrmHero,
  CrmInput,
  CrmLinkButton,
  CrmMetric,
  CrmNotice,
  CrmPanel,
  CrmSectionTitle,
  CrmSelect,
  CrmTextarea,
  CrmWorkspace,
  formatCrmDate,
  formatCrmMoney,
  toCrmDate,
} from "@/app/cliente/painel/components/crm-workspace";
import { getPipelineStageLabel, normalizePipelineStageId, type PipelineStageDefinition } from "@/lib/pipeline";
import type { SalesJourneyRecommendation } from "@/lib/sales-journey";

type LeadTask = {
  id: string;
  title?: string;
  type?: string;
  status?: string;
  priority?: string;
  dueAt?: unknown;
};

type LeadNote = {
  id: string;
  text?: string;
  authorName?: string;
  createdAt?: unknown;
};

type RelatedChat = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  channel?: string;
  status?: string;
  priority?: string;
  ownerName?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  unreadCount?: number;
};

type LeadQualification = {
  score?: number;
  label?: string;
  recommendedStage?: string;
  nextAction?: string;
};

type LeadCommercialDossier = {
  id?: string;
  title?: string;
  status?: string;
  trigger?: string;
  triggerLabel?: string;
  leadName?: string | null;
  company?: string | null;
  source?: string | null;
  score?: number | null;
  temperature?: string | null;
  objective?: string | null;
  recommendedOffer?: string | null;
  nextAction?: string | null;
  diagnosis?: string | null;
  personalizedPlan?: string | null;
  sellerNextMove?: string | null;
  materialToSend?: string | null;
  proposalOutline?: string | null;
  summary?: string;
  sellerBrief?: string;
  painPoints?: string[];
  objections?: string[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
  recentConversation?: string[];
  markdown?: string;
  sourceChatId?: string | null;
  appointmentId?: string | null;
  updatedByName?: string | null;
  updatedAt?: unknown;
};

type LeadDocument = {
  id: string;
  type?: string;
  title?: string;
  status?: string;
  triggerLabel?: string;
  appointmentId?: string | null;
  sourceChatId?: string | null;
  summary?: string | Record<string, unknown>;
  sellerBrief?: string;
  markdown?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type LeadItem = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  photoUrl?: string;
  profilePhotoUrl?: string;
  contactPhotoUrl?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  sourceLabel?: string;
  sourceType?: string;
  campaignName?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  first_touch?: Record<string, unknown>;
  last_touch?: Record<string, unknown>;
  attribution?: Record<string, unknown>;
  customFields?: Record<string, string | number | boolean | null>;
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
  notes?: string;
  qualification?: LeadQualification;
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
  aiConversationStage?: string;
  aiNextAction?: string;
  aiRecommendedOffer?: string;
  aiResponseGoal?: string;
  aiCommercialTemperature?: string;
  aiLeadSummary?: string;
  aiPlannerConfidence?: number | null;
  commercialDossier?: LeadCommercialDossier | null;
  commercialDossierUpdatedAt?: unknown;
  salesJourney?: SalesJourneyRecommendation | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  chatSummary?: {
    total?: number;
    open?: number;
    pending?: number;
    resolved?: number;
    unresolved?: number;
    highPriority?: number;
    unassigned?: number;
    lastInteractionAt?: unknown;
  };
};

type LeadDetailPayload = {
  lead: LeadItem;
  notes?: LeadNote[];
  tasks?: LeadTask[];
  documents?: LeadDocument[];
  relatedChats?: RelatedChat[];
  timeline?: Array<{
    id: string;
    title?: string;
    detail?: string;
    type?: string;
    createdAt?: unknown;
  }>;
  conversationSummary?: {
    total?: number;
    open?: number;
    pending?: number;
    resolved?: number;
    highPriority?: number;
    unassigned?: number;
    lastInteractionAt?: unknown;
  };
  appointments?: Array<{
    id: string;
    title?: string;
    status?: string;
    startAt?: unknown;
    createdAt?: unknown;
  }>;
  orders?: Array<{
    id: string;
    provider?: string;
    orderNumber?: string;
    totalPrice?: number | null;
    currency?: string;
    status?: string;
    paymentStatus?: string;
    fulfillmentStatus?: string;
    trackingCode?: string;
    trackingUrl?: string;
    purchasedProductNames?: string[];
    orderedAt?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  }>;
  qualification?: LeadQualification;
  stagePolicy?: {
    stageLabel?: string;
    ownerName?: string | null;
    slaBreached?: boolean;
  };
  salesJourney?: SalesJourneyRecommendation | null;
  error?: string;
};

type LeadImportPayload = {
  ok?: boolean;
  summary?: {
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: number;
  };
  error?: string;
};

type MetricsSummaryPayload = {
  operations?: {
    teamPerformance?: Array<{
      ownerId?: string;
      ownerName?: string;
      activeChats?: number;
      overdueChats?: number;
      pendingChats?: number;
      totalLeads?: number;
      wonLeads?: number;
      winRate?: number;
      avgFirstResponseMinutes?: number;
      responseSamples?: number;
    }>;
  };
};

type ViewKey = "list" | "pipeline" | "analytics";
const CRM_PAGE_SIZE = 80;
type FocusFilter = "all" | "today" | "needs_response" | "proposal" | "no_owner" | "hot";

const EMPTY_LEAD_FORM = {
  nome: "",
  email: "",
  telefone: "",
  empresa: "",
  origem: "manual",
  channel: "manual",
  priority: "medium",
  heat: "morno",
  potentialValue: "",
  notes: "",
};

const heatOptions = ["frio", "morno", "quente"];
const priorityOptions = ["low", "medium", "high"];
const wonStageIds = new Set(["ganho", "won", "closed_won"]);

function heatTone(value?: string) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "quente") return "red" as const;
  if (normalized === "morno") return "orange" as const;
  if (normalized === "frio") return "neutral" as const;
  return "blue" as const;
}

function normalizeStage(lead: LeadItem) {
  return normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
}

function ownerKey(lead: LeadItem) {
  return String(lead.ownerId || lead.owner || "").trim();
}

function ownerName(lead: LeadItem) {
  return cleanCrmText(lead.owner, 80) || "Sem responsavel";
}

function leadChannel(lead: LeadItem) {
  return (
    cleanCrmText(lead.channel, 60) ||
    cleanCrmText(lead.sourceType, 60) ||
    cleanCrmText(lead.utmSource, 60) ||
    cleanCrmText(lead.origem, 60) ||
    "nao_registrado"
  ).toLowerCase();
}

function formatChannel(value: string) {
  const labels: Record<string, string> = {
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    messenger: "Messenger",
    facebook: "Facebook",
    meta: "Meta",
    google: "Google",
    site_chat: "Chat do site",
    site_form: "Formulario",
    nao_registrado: "Sem origem",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function formatResponseTime(minutes?: number, samples?: number) {
  if (!samples || !Number.isFinite(minutes) || !minutes) return "sem amostra";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function isToday(value: unknown) {
  const date = toCrmDate(value);
  if (!date) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function leadNeedsResponse(lead: LeadItem) {
  return Number(lead.chatSummary?.pending || lead.chatSummary?.unresolved || 0) > 0 || Number(lead.chatSummary?.highPriority || 0) > 0;
}

function leadPhotoUrl(lead?: LeadItem | null) {
  if (!lead) return null;
  const customFields = readCrmRecord(lead.customFields);
  return (
    cleanCrmText(lead.photoUrl, 1000) ||
    cleanCrmText(lead.profilePhotoUrl, 1000) ||
    cleanCrmText(lead.contactPhotoUrl, 1000) ||
    cleanCrmText(customFields.photoUrl, 1000) ||
    cleanCrmText(customFields.profilePhotoUrl, 1000) ||
    cleanCrmText(customFields.contactPhotoUrl, 1000) ||
    null
  );
}

function cleanCrmText(value: unknown, max = 180) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function readCrmRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveLeadAttribution(lead?: LeadItem | null) {
  const attribution = readCrmRecord(lead?.attribution);
  const firstTouch = readCrmRecord(lead?.first_touch || attribution.firstTouch);
  const lastTouch = readCrmRecord(lead?.last_touch || attribution.lastTouch);
  const customFields = readCrmRecord(lead?.customFields);
  const source =
    cleanCrmText(lead?.sourceLabel) ||
    cleanCrmText(lead?.origem) ||
    cleanCrmText(lead?.utmSource || attribution.source || lastTouch.source || firstTouch.source) ||
    cleanCrmText(lead?.channel);
  const medium = cleanCrmText(lead?.utmMedium || attribution.medium || lastTouch.medium || firstTouch.medium);
  const campaign =
    cleanCrmText(lead?.campaignName) ||
    cleanCrmText(lead?.utmCampaign || attribution.campaign || lastTouch.campaign || firstTouch.campaign) ||
    cleanCrmText(customFields.campaign || customFields.utm_campaign);
  const content = cleanCrmText(lead?.utmContent || attribution.content || lastTouch.content || firstTouch.content);
  const clickId =
    cleanCrmText(lead?.gclid || attribution.gclid || lastTouch.gclid || firstTouch.gclid) ||
    cleanCrmText(lead?.fbclid || attribution.fbclid || lastTouch.fbclid || firstTouch.fbclid);

  return {
    source: source || "Nao registrado",
    medium: medium || "Nao registrado",
    campaign: campaign || "Sem campanha",
    content: content || "Sem criativo",
    clickId: clickId ? "Registrado" : "Nao registrado",
    firstTouchLabel:
      cleanCrmText(firstTouch.campaign || firstTouch.source || firstTouch.sourceLabel) || "Nao registrado",
    lastTouchLabel:
      cleanCrmText(lastTouch.campaign || lastTouch.source || lastTouch.sourceLabel) || "Nao registrado",
  };
}

function resolveLeadAiEvidence(lead?: LeadItem | null) {
  const evidence = lead?.aiFieldEvidence || {};
  const getValue = (keys: string[]) => {
    for (const key of keys) {
      const value = cleanCrmText(evidence[key]?.value, 160);
      if (value) return value;
    }
    return "Nao capturado";
  };

  return [
    { label: "Interesse", value: getValue(["serviceInterest", "activeTopic", "primaryGoal", "custom.servico_interesse"]) },
    { label: "Urgencia", value: getValue(["urgency", "custom.urgencia"]) },
    { label: "Orcamento", value: getValue(["budgetBand", "custom.orcamento"]) },
    { label: "Decisor", value: getValue(["decisionMaker", "custom.decisor"]) },
  ];
}

function formatAiAction(value?: string | null) {
  const clean = cleanCrmText(value, 120);
  if (!clean) return "Definir proxima acao comercial";
  const labels: Record<string, string> = {
    assumir_handoff_humano: "Humano deve assumir",
    qualificar_contexto_minimo: "Qualificar melhor",
    aprofundar_oportunidade: "Aprofundar oportunidade",
    tratar_objecao_suave: "Tratar objecao",
    preparar_proposta_comercial: "Preparar proposta",
    agendar_proximo_passo: "Agendar proximo passo",
    conduzir_para_proximo_passo: "Conduzir proximo passo",
  };
  return labels[clean] || clean.replaceAll("_", " ");
}

function getTemperatureTone(value?: string | null) {
  const normalized = cleanCrmText(value, 40).toLowerCase();
  if (normalized === "hot") return "red" as const;
  if (normalized === "warm") return "orange" as const;
  if (normalized === "cold") return "neutral" as const;
  return "blue" as const;
}

function formatTemperature(value?: string | null) {
  const normalized = cleanCrmText(value, 40).toLowerCase();
  if (normalized === "hot") return "quente";
  if (normalized === "warm") return "morno";
  if (normalized === "cold") return "frio";
  return "em leitura";
}

function formatLeadDocumentType(value?: string) {
  const normalized = cleanCrmText(value, 80).toLowerCase();
  const labels: Record<string, string> = {
    commercial_dossier: "Dossie comercial",
    assisted_meeting: "Reuniao assistida",
    meeting_summary: "Resumo de reuniao",
    lead_summary: "Resumo do lead",
  };
  return labels[normalized] || cleanCrmText(value, 80) || "Documento IA";
}

function getLeadDocumentTitle(document: LeadDocument) {
  return (
    cleanCrmText(document.title, 120) ||
    formatLeadDocumentType(document.type || document.id) ||
    "Documento gerado pela IA"
  );
}

function getLeadDocumentSummary(document: LeadDocument) {
  if (typeof document.summary === "string") return cleanCrmText(document.summary, 260);
  if (document.summary && typeof document.summary === "object") {
    const summary = document.summary as Record<string, unknown>;
    return (
      cleanCrmText(summary.executiveSummary, 260) ||
      cleanCrmText(summary.summary, 260) ||
      cleanCrmText(summary.nextStep, 260) ||
      cleanCrmText(summary.recommendedStage, 260)
    );
  }
  return (
    cleanCrmText(document.sellerBrief, 260) ||
    cleanCrmText(String(document.markdown || "").replace(/[#*_`>|-]/g, " "), 260) ||
    "Documento salvo pela IA para orientar o atendimento comercial."
  );
}

function getLeadDocumentBody(document: LeadDocument) {
  const summary = getLeadDocumentSummary(document);
  return cleanCrmText(document.markdown, 5000) || summary;
}

export default function ClienteCrmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const leadFromQuery = searchParams.get("leadId");
  const viewFromQuery = (searchParams.get("view") || "list") as ViewKey;
  const { tenant, hasCapability } = useClienteTenant();
  const canOperate = hasCapability("edit_leads");

  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [totalLeadCount, setTotalLeadCount] = useState(0);
  const [nextLeadOffset, setNextLeadOffset] = useState<number | null>(null);
  const [stages, setStages] = useState<PipelineStageDefinition[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummaryPayload>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leadFromQuery);
  const [detail, setDetail] = useState<LeadDetailPayload | null>(null);
  const [view, setView] = useState<ViewKey>(viewFromQuery === "pipeline" ? "pipeline" : viewFromQuery === "analytics" ? "analytics" : "list");
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [heatFilter, setHeatFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingStage, setSavingStage] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLead, setSavingLead] = useState(false);
  const [savingNewLead, setSavingNewLead] = useState(false);
  const [deletingLeads, setDeletingLeads] = useState(false);
  const [distributingLeads, setDistributingLeads] = useState(false);
  const [showLeadDrawer, setShowLeadDrawer] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [nextStage, setNextStage] = useState("captado");
  const [taskTitle, setTaskTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [editing, setEditing] = useState(false);
  const [creatingLead, setCreatingLead] = useState(false);
  const [leadForm, setLeadForm] = useState({ ...EMPTY_LEAD_FORM });
  const [newLeadForm, setNewLeadForm] = useState({ ...EMPTY_LEAD_FORM, pipelineStage: "captado" });

  const load = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const [leadsRes, pipelineRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/leads?limit=${CRM_PAGE_SIZE}&view=compact`),
        authedFetch(`/api/tenant/${tenant.tenantId}/pipeline`),
      ]);
      const leadsPayload = (await leadsRes.json()) as {
        items?: LeadItem[];
        error?: string;
        pagination?: { total?: number; nextOffset?: number | null; hasMore?: boolean };
      };
      const pipelinePayload = (await pipelineRes.json().catch(() => ({}))) as { stages?: PipelineStageDefinition[] };
      if (!leadsRes.ok || leadsPayload.error) throw new Error(leadsPayload.error || "Falha ao carregar CRM.");
      const nextLeads = leadsPayload.items || [];
      setLeads(nextLeads);
      setTotalLeadCount(Number(leadsPayload.pagination?.total ?? nextLeads.length));
      setNextLeadOffset(leadsPayload.pagination?.hasMore ? Number(leadsPayload.pagination.nextOffset || nextLeads.length) : null);
      setStages(pipelinePayload.stages || []);
      setSelectedLeadId((current) => leadFromQuery || current || nextLeads[0]?.id || null);
      // Metricas sao importantes para decisao, mas nao devem atrasar a lista
      // e o funil. Carregam assim que a operacao ja esta visivel.
      void authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary`)
        .then(async (metricsRes) => {
          if (!metricsRes.ok) return;
          const metricsPayload = (await metricsRes.json().catch(() => ({}))) as MetricsSummaryPayload;
          setMetricsSummary(metricsPayload || {});
        })
        .catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar CRM.");
    } finally {
      setLoading(false);
    }
  }, [leadFromQuery, tenant?.tenantId]);

  const loadMoreLeads = useCallback(async () => {
    if (!tenant?.tenantId || nextLeadOffset === null || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/leads?limit=${CRM_PAGE_SIZE}&view=compact&offset=${encodeURIComponent(String(nextLeadOffset))}`
      );
      const payload = (await res.json()) as {
        items?: LeadItem[];
        error?: string;
        pagination?: { total?: number; nextOffset?: number | null; hasMore?: boolean };
      };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao carregar mais clientes.");
      const incoming = payload.items || [];
      setLeads((current) => {
        const byId = new Map(current.map((lead) => [lead.id, lead]));
        incoming.forEach((lead) => byId.set(lead.id, lead));
        return Array.from(byId.values()).sort(
          (a, b) => (toCrmDate(b.updatedAt)?.getTime() || 0) - (toCrmDate(a.updatedAt)?.getTime() || 0)
        );
      });
      setTotalLeadCount(Number(payload.pagination?.total ?? totalLeadCount));
      setNextLeadOffset(payload.pagination?.hasMore ? Number(payload.pagination.nextOffset || nextLeadOffset + incoming.length) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar mais clientes.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextLeadOffset, tenant?.tenantId, totalLeadCount]);

  const loadDetail = useCallback(async (leadId: string | null) => {
    if (!tenant?.tenantId || !leadId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}`);
      const payload = (await res.json()) as LeadDetailPayload;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao carregar ficha.");
      setDetail(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar ficha.");
    } finally {
      setDetailLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (leadFromQuery) setSelectedLeadId(leadFromQuery);
  }, [leadFromQuery]);

  useEffect(() => {
    if (!selectedLeadId) setShowLeadDrawer(false);
  }, [selectedLeadId]);

  useEffect(() => {
    loadDetail(selectedLeadId);
  }, [loadDetail, selectedLeadId]);

  const selectedLead = useMemo(() => leads.find((lead) => lead.id === selectedLeadId) || detail?.lead || null, [detail?.lead, leads, selectedLeadId]);

  useEffect(() => {
    if (!selectedLead) return;
    const stage = normalizeStage(selectedLead);
    setNextStage(stage);
    setLeadForm({
      nome: selectedLead.nome || "",
      email: selectedLead.email || "",
      telefone: selectedLead.telefone || "",
      empresa: selectedLead.empresa || "",
      origem: selectedLead.origem || "",
      channel: selectedLead.channel || "",
      priority: selectedLead.priority || "medium",
      heat: selectedLead.heat || "morno",
      potentialValue: selectedLead.potentialValue ? String(selectedLead.potentialValue) : "",
      notes: selectedLead.notes || "",
    });
  }, [selectedLead]);

  const stageOptions = useMemo(() => {
    const fromPipeline = stages.map((stage) => stage.id).filter(Boolean);
    const fromLeads = leads.map(normalizeStage);
    return Array.from(new Set(["captado", ...fromPipeline, ...fromLeads]));
  }, [leads, stages]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const stage = normalizeStage(lead);
      if (stageFilter !== "all" && stage !== stageFilter) return false;
      if (heatFilter !== "all" && String(lead.heat || "").toLowerCase() !== heatFilter) return false;
      if (ownerFilter !== "all" && ownerKey(lead) !== ownerFilter) return false;
      if (channelFilter !== "all" && leadChannel(lead) !== channelFilter) return false;
      if (focusFilter === "today" && !isToday(lead.createdAt)) return false;
      if (focusFilter === "needs_response" && !leadNeedsResponse(lead)) return false;
      if (focusFilter === "proposal" && !normalizeStage(lead).includes("proposta")) return false;
      if (focusFilter === "no_owner" && ownerKey(lead)) return false;
      if (focusFilter === "hot" && String(lead.heat || "").toLowerCase() !== "quente" && lead.aiCommercialTemperature !== "hot") return false;
      if (!term) return true;
      return `${lead.nome || ""} ${lead.empresa || ""} ${lead.email || ""} ${lead.telefone || ""} ${lead.owner || ""} ${lead.origem || ""} ${lead.sourceLabel || ""} ${lead.campaignName || ""}`.toLowerCase().includes(term);
    });
  }, [channelFilter, focusFilter, heatFilter, leads, ownerFilter, search, stageFilter]);

  const availableOwners = useMemo(() => {
    const owners = new Map<string, string>();
    for (const lead of leads) {
      const key = ownerKey(lead);
      if (key) owners.set(key, ownerName(lead));
    }
    return Array.from(owners.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [leads]);

  const availableChannels = useMemo(() => {
    return Array.from(new Set(leads.map(leadChannel)))
      .filter(Boolean)
      .sort((a, b) => formatChannel(a).localeCompare(formatChannel(b), "pt-BR"));
  }, [leads]);

  const performanceByOwner = useMemo(() => {
    return new Map(
      (metricsSummary.operations?.teamPerformance || [])
        .filter((item) => item.ownerId)
        .map((item) => [String(item.ownerId), item])
    );
  }, [metricsSummary.operations?.teamPerformance]);

  const sellerRanking = useMemo(() => {
    const ranking = new Map<
      string,
      {
        id: string;
        name: string;
        leads: number;
        won: number;
        hot: number;
        pending: number;
        value: number;
        scoreSum: number;
        activeChats: number;
        overdueChats: number;
        avgFirstResponseMinutes: number;
        responseSamples: number;
      }
    >();

    for (const lead of leads) {
      const key = ownerKey(lead) || "unassigned";
      const current =
        ranking.get(key) ||
        {
          id: key,
          name: key === "unassigned" ? "Sem responsavel" : ownerName(lead),
          leads: 0,
          won: 0,
          hot: 0,
          pending: 0,
          value: 0,
          scoreSum: 0,
          activeChats: 0,
          overdueChats: 0,
          avgFirstResponseMinutes: 0,
          responseSamples: 0,
        };

      current.leads += 1;
      current.value += lead.potentialValue || 0;
      current.scoreSum += Number(lead.score || lead.qualification?.score || 0);
      if (wonStageIds.has(normalizeStage(lead))) current.won += 1;
      if (String(lead.heat || "").toLowerCase() === "quente" || lead.aiCommercialTemperature === "hot") current.hot += 1;
      current.pending += Number(lead.chatSummary?.pending || lead.chatSummary?.unresolved || 0);
      ranking.set(key, current);
    }

    return Array.from(ranking.values())
      .map((item) => {
        const performance = performanceByOwner.get(item.id);
        return {
          ...item,
          name: performance?.ownerName || item.name,
          pending: Number(performance?.pendingChats ?? item.pending),
          activeChats: Number(performance?.activeChats || 0),
          overdueChats: Number(performance?.overdueChats || 0),
          avgFirstResponseMinutes: Number(performance?.avgFirstResponseMinutes || 0),
          responseSamples: Number(performance?.responseSamples || 0),
          conversion: item.leads ? item.won / item.leads : 0,
          avgScore: item.leads ? item.scoreSum / item.leads : 0,
        };
      })
      .sort((a, b) => b.won - a.won || b.value - a.value || a.avgFirstResponseMinutes - b.avgFirstResponseMinutes || b.hot - a.hot)
      .slice(0, 6);
  }, [leads, performanceByOwner]);

  const summary = useMemo(() => {
    const totalValue = filteredLeads.reduce((sum, lead) => sum + (lead.potentialValue || 0), 0);
    const hot = filteredLeads.filter((lead) => String(lead.heat || "").toLowerCase() === "quente").length;
    const noOwner = filteredLeads.filter((lead) => !lead.owner && !lead.ownerId).length;
    const proposal = filteredLeads.filter((lead) => normalizeStage(lead).includes("proposta")).length;
    return { total: filteredLeads.length, totalValue, hot, noOwner, proposal };
  }, [filteredLeads]);

  const prioritySummary = useMemo(() => {
    const today = leads.filter((lead) => isToday(lead.createdAt)).length;
    const needsResponse = leads.filter((lead) => leadNeedsResponse(lead)).length;
    const proposal = leads.filter((lead) => normalizeStage(lead).includes("proposta")).length;
    const noOwner = leads.filter((lead) => !ownerKey(lead)).length;
    const hot = leads.filter((lead) => String(lead.heat || "").toLowerCase() === "quente" || lead.aiCommercialTemperature === "hot").length;
    return { today, needsResponse, proposal, noOwner, hot };
  }, [leads]);

  const hasActiveFilters = Boolean(
    search.trim() ||
    stageFilter !== "all" ||
    heatFilter !== "all" ||
    ownerFilter !== "all" ||
    channelFilter !== "all" ||
    focusFilter !== "all"
  );

  const leadsByStage = useMemo(() => {
    return stageOptions.map((stage) => {
      const items = filteredLeads.filter((lead) => normalizeStage(lead) === stage);
      return { stage, items, totalValue: items.reduce((sum, lead) => sum + (lead.potentialValue || 0), 0) };
    });
  }, [filteredLeads, stageOptions]);

  const visibleUnassignedLeadIds = useMemo(
    () =>
      filteredLeads
        .filter((lead) => !ownerKey(lead))
        .map((lead) => lead.id),
    [filteredLeads]
  );

  function selectLead(leadId: string) {
    setSelectedLeadId(leadId);
    const next = new URLSearchParams(searchParams.toString());
    next.set("leadId", leadId);
    if (view !== "list") next.set("view", view);
    router.replace(`/cliente/painel/crm?${next.toString()}`);
  }

  function setViewAndUrl(nextView: ViewKey) {
    setView(nextView);
    const next = new URLSearchParams(searchParams.toString());
    if (nextView === "list") next.delete("view");
    else next.set("view", nextView);
    router.replace(`/cliente/painel/crm?${next.toString()}`);
  }

  function clearFilters() {
    setSearch("");
    setStageFilter("all");
    setHeatFilter("all");
    setOwnerFilter("all");
    setChannelFilter("all");
    setFocusFilter("all");
  }

  async function updateStage(leadId = selectedLeadId, stage = nextStage) {
    if (!tenant?.tenantId || !leadId || !stage || !canOperate) return;
    setSavingStage(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${leadId}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao atualizar etapa.");
      setNotice("Etapa atualizada.");
      await load();
      await loadDetail(leadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar etapa.");
    } finally {
      setSavingStage(false);
    }
  }

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !canOperate) return;
    setSavingLead(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...leadForm, potentialValue: Number(leadForm.potentialValue || 0) }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao salvar contato.");
      setNotice("Contato atualizado.");
      setEditing(false);
      await load();
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar contato.");
    } finally {
      setSavingLead(false);
    }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedLeadId || !taskTitle.trim() || !canOperate) return;
    setSavingTask(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${selectedLeadId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle.trim(), status: "pending", priority: "medium", type: "follow_up" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao criar tarefa.");
      setTaskTitle("");
      setNotice("Tarefa criada.");
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar tarefa.");
    } finally {
      setSavingTask(false);
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
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao salvar nota.");
      setNoteText("");
      setNotice("Nota salva.");
      await loadDetail(selectedLeadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar nota.");
    } finally {
      setSavingNote(false);
    }
  }

  async function importLeadBase(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !importFile || !canOperate) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const csvContent = await importFile.text();
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvContent }),
      });
      const payload = (await res.json().catch(() => ({}))) as LeadImportPayload;
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao importar base.");
      const created = payload.summary?.created ?? 0;
      const updated = payload.summary?.updated ?? 0;
      setNotice(`Importacao concluida: ${created} criados e ${updated} atualizados.`);
      setImportFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar base.");
    } finally {
      setImporting(false);
    }
  }

  function toggleLeadSelection(leadId: string) {
    setSelectedLeadIds((current) =>
      current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]
    );
  }

  function toggleAllVisibleLeads() {
    const visibleIds = filteredLeads.map((lead) => lead.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedLeadIds.includes(id));
    setSelectedLeadIds(allSelected ? [] : visibleIds);
  }

  async function deleteSelectedLeads() {
    if (!tenant?.tenantId || !selectedLeadIds.length || !canOperate) return;
    if (!window.confirm(`Apagar definitivamente ${selectedLeadIds.length} contato(s), conversas e dados relacionados?`)) return;
    setDeletingLeads(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedLeadIds }),
      });
      const payload = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao apagar contatos.");
      setNotice(`${payload.deleted || 0} contato(s) apagado(s) definitivamente.`);
      setSelectedLeadIds([]);
      setSelectedLeadId(null);
      setDetail(null);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao apagar contatos.");
    } finally {
      setDeletingLeads(false);
    }
  }

  const selectedJourney = detail?.salesJourney || selectedLead?.salesJourney || null;
  const selectedNextAction =
    selectedJourney?.actionLabel || (cleanCrmText(selectedLead?.aiNextAction)
      ? formatAiAction(selectedLead?.aiNextAction)
      : detail?.qualification?.nextAction ||
        selectedLead?.qualification?.nextAction ||
        (detail?.stagePolicy?.slaBreached ? "Retomar contato agora: este cliente esta sem retorno." : "Definir proxima acao comercial."));
  const selectedOrigin = [selectedLead?.origem, selectedLead?.channel].filter(Boolean).join(" / ") || "Origem nao registrada";
  const selectedAttribution = useMemo(() => resolveLeadAttribution(selectedLead), [selectedLead]);
  const selectedAiEvidence = useMemo(() => resolveLeadAiEvidence(selectedLead), [selectedLead]);
  const selectedCommercialDossier = detail?.lead?.commercialDossier || selectedLead?.commercialDossier || null;
  const selectedConversationSummary = detail?.conversationSummary || selectedLead?.chatSummary || {};
  const selectedTimeline = detail?.timeline || [];
  const selectedAppointments = detail?.appointments || [];
  const selectedDocuments = detail?.documents || [];
  const selectedOrders = detail?.orders || [];
  const selectedRevenue = selectedOrders.reduce((total, order) => total + Number(order.totalPrice || 0), 0);

  async function copyLeadDocument(document: LeadDocument) {
    try {
      await navigator.clipboard.writeText(getLeadDocumentBody(document));
      setNotice("Documento da IA copiado.");
    } catch {
      setError("Nao foi possivel copiar o documento.");
    }
  }

  async function createLead(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !canOperate || savingNewLead) return;
    if (!newLeadForm.nome.trim() && !newLeadForm.telefone.trim() && !newLeadForm.email.trim()) {
      setError("Informe ao menos nome, telefone ou e-mail.");
      return;
    }

    setSavingNewLead(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newLeadForm,
          potentialValue: Number(newLeadForm.potentialValue || 0),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { leadId?: string; error?: string };
      if (res.status === 409 && payload.leadId) {
        setCreatingLead(false);
        setSelectedLeadId(payload.leadId);
        setNotice("Este contato ja estava no CRM. Abrimos a ficha existente.");
        router.replace(`/cliente/painel/crm?leadId=${encodeURIComponent(payload.leadId)}`);
        await load();
        setSelectedLeadId(payload.leadId);
        await loadDetail(payload.leadId);
        return;
      }
      if (!res.ok || !payload.leadId) throw new Error(payload.error || "Falha ao criar contato.");

      setCreatingLead(false);
      setNewLeadForm({ ...EMPTY_LEAD_FORM, pipelineStage: "captado" });
      setSelectedLeadId(payload.leadId);
      setNotice("Contato criado. A ficha comercial ja esta pronta para a proxima acao.");
      router.replace(`/cliente/painel/crm?leadId=${encodeURIComponent(payload.leadId)}`);
      await load();
      setSelectedLeadId(payload.leadId);
      await loadDetail(payload.leadId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar contato.");
    } finally {
      setSavingNewLead(false);
    }
  }

  async function distributeLeads() {
    if (!tenant?.tenantId || !canOperate) return;
    const targetIds = selectedLeadIds.length ? selectedLeadIds : visibleUnassignedLeadIds;
    if (!targetIds.length) {
      setNotice("Nao ha oportunidades visiveis sem responsavel para distribuir.");
      return;
    }

    setDistributingLeads(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: targetIds,
          onlyUnassigned: selectedLeadIds.length === 0,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { assigned?: number; error?: string; message?: string };
      if (!res.ok || payload.error) throw new Error(payload.error || "Falha ao distribuir oportunidades.");
      setSelectedLeadIds([]);
      setNotice(
        payload.assigned
          ? `${payload.assigned} oportunidade(s) distribuida(s) entre vendedores.`
          : payload.message || "Nenhuma oportunidade elegivel para distribuicao."
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao distribuir oportunidades.");
    } finally {
      setDistributingLeads(false);
    }
  }

  return (
    <CrmWorkspace>
      <CrmHero
        active={view === "pipeline" ? "Funil" : "Lista"}
        title="Clientes, oportunidades e proxima acao."
        description="Lista, funil e resposta comercial em uma rotina simples para usar no celular."
        assistantTitle="Prioridade comercial"
        assistantSubtitle="quem merece atencao agora"
        assistantText="A Altum ajuda a puxar quem entrou hoje, quem precisa de resposta, o que esta em proposta e o que ficou sem responsavel."
        action={
          <>
            <CrmButton type="button" onClick={load} className="min-w-max">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Atualizar
            </CrmButton>
            <CrmLinkButton href="/cliente/painel/inbox?status=pending" tone="green" className="min-w-max">
              Precisa resposta
            </CrmLinkButton>
            <CrmButton type="button" tone={view === "list" ? "primary" : "secondary"} onClick={() => setViewAndUrl("list")} className="min-w-max">
              Lista
            </CrmButton>
            <CrmButton type="button" tone={view === "pipeline" ? "primary" : "secondary"} onClick={() => setViewAndUrl("pipeline")} className="min-w-max">
              Kanban
            </CrmButton>
            <CrmLinkButton href="/cliente/painel/agenda" className="hidden min-w-max sm:inline-flex">
              Agenda
            </CrmLinkButton>
            <CrmLinkButton href="/cliente/painel/comercial" tone="primary" className="hidden min-w-max sm:inline-flex">
              Propostas
            </CrmLinkButton>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <CrmMetric label="Clientes na visao atual" value={String(summary.total)} detail={`${totalLeadCount} na base`} icon={UsersRound} tone="blue" />
          <CrmMetric label="Valor em carteira" value={formatCrmMoney(summary.totalValue)} detail="oportunidades abertas" icon={DollarSign} tone="green" />
          <CrmMetric label="Precisam resposta" value={String(prioritySummary.needsResponse)} detail="filtre e responda" icon={MessageSquareText} tone={prioritySummary.needsResponse ? "purple" : "neutral"} />
          <CrmMetric label="Sem responsavel" value={String(prioritySummary.noOwner)} detail="distribuir hoje" icon={ClipboardList} tone={prioritySummary.noOwner ? "orange" : "neutral"} />
        </div>
      </CrmHero>

      {error ? <CrmNotice tone="red">{error}</CrmNotice> : null}
      {notice ? <CrmNotice tone="green">{notice}</CrmNotice> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(4,minmax(0,1fr))_220px]">
        {[
          {
            id: "today" as FocusFilter,
            label: "Entraram hoje",
            value: prioritySummary.today,
            detail: "novos contatos para abordar",
          },
          {
            id: "needs_response" as FocusFilter,
            label: "Precisam resposta",
            value: prioritySummary.needsResponse,
            detail: "conversas ou pendencias abertas",
          },
          {
            id: "proposal" as FocusFilter,
            label: "Em proposta",
            value: prioritySummary.proposal,
            detail: "pedem avancar o fechamento",
          },
          {
            id: "no_owner" as FocusFilter,
            label: "Sem responsavel",
            value: prioritySummary.noOwner,
            detail: "distribuir para a equipe",
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "needs_response") {
                router.push("/cliente/painel/inbox?status=pending");
                return;
              }
              setFocusFilter(item.id);
              setViewAndUrl("list");
            }}
            className={`rounded-[18px] border p-4 text-left transition ${
              focusFilter === item.id
                ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)] shadow-[0_20px_40px_-30px_rgba(37,99,235,0.35)]"
                : "border-[var(--cliente-border)] bg-[var(--cliente-card)] hover:bg-[var(--cliente-panel-soft)] hover:shadow-[0_18px_34px_-30px_rgba(15,23,42,0.16)]"
            }`}
          >
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">{item.label}</p>
            <p className="mt-2 text-2xl font-black text-[var(--cliente-card-text)]">{item.value}</p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.detail}</p>
          </button>
        ))}
        <Link
          href="/cliente/painel/agenda"
          className="col-span-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4 transition hover:bg-[var(--cliente-panel-soft)] lg:col-span-1"
        >
          <p className="text-[11px] font-black uppercase text-[var(--cliente-warning)]">Agenda</p>
          <p className="mt-2 text-lg font-black text-[var(--cliente-card-text)]">Reunioes e retornos</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Ver compromissos marcados, retornos e proximas acoes do dia.</p>
        </Link>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <CrmPanel padded={false} className="overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-5">
            <CrmSectionTitle
              eyebrow="Carteira comercial"
              title={view === "pipeline" ? "Kanban de oportunidades" : "Lista de clientes e oportunidades"}
              description="Lista, filtros, prioridade comercial e painel lateral para agir rapido sem sair da tela."
              action={canOperate ? (
                <CrmButton type="button" tone="primary" onClick={() => setCreatingLead(true)}>
                  <Plus className="h-4 w-4" />
                  Novo cliente
                </CrmButton>
              ) : <CrmBadge tone="orange">somente leitura</CrmBadge>}
            />
            <div className="mt-5 flex flex-col gap-3 xl:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-muted)]" />
                <CrmInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato, empresa, telefone..." className="w-full pl-9" />
              </div>
              <CrmSelect value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
                <option value="all">Todas etapas</option>
                {stageOptions.map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
              </CrmSelect>
              <CrmSelect value={heatFilter} onChange={(event) => setHeatFilter(event.target.value)}>
                <option value="all">Temperatura</option>
                {heatOptions.map((heat) => <option key={heat} value={heat}>{heat}</option>)}
              </CrmSelect>
              <CrmSelect value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
                <option value="all">Todos vendedores</option>
                {availableOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </CrmSelect>
              <CrmSelect value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="all">Todas origens</option>
                {availableChannels.map((channel) => <option key={channel} value={channel}>{formatChannel(channel)}</option>)}
              </CrmSelect>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["list", "pipeline"] as ViewKey[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setViewAndUrl(item)}
                  className={`rounded-full border px-3 py-2 text-xs font-black transition ${view === item ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary)] text-white" : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"}`}
                >
                  {item === "list" ? "Lista" : "Kanban"}
                </button>
              ))}
              {focusFilter !== "all" ? <CrmBadge tone="purple">Filtro rapido: {focusFilter.replaceAll("_", " ")}</CrmBadge> : null}
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-black text-[var(--cliente-card-text-soft)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  Limpar filtros
                </button>
              ) : null}
              {canOperate && selectedLeadIds.length ? (
                <button
                  type="button"
                  onClick={() => void deleteSelectedLeads()}
                  disabled={deletingLeads}
                  className="inline-flex items-center gap-2 rounded-[14px] bg-rose-600 px-3 py-2 text-xs font-black text-white transition hover:bg-rose-700 disabled:opacity-60 sm:ml-auto"
                >
                  {deletingLeads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Apagar {selectedLeadIds.length}
                </button>
              ) : null}
              {canOperate ? (
                <button
                  type="button"
                  onClick={() => void distributeLeads()}
                  disabled={distributingLeads || (!selectedLeadIds.length && !visibleUnassignedLeadIds.length)}
                  className={`${selectedLeadIds.length ? "" : "sm:ml-auto"} inline-flex items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-black text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-55`}
                >
                  {distributingLeads ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shuffle className="h-4 w-4" />}
                  {selectedLeadIds.length ? `Distribuir ${selectedLeadIds.length}` : `Distribuir ${visibleUnassignedLeadIds.length} sem responsavel`}
                </button>
              ) : null}
            </div>
          </div>

          {view === "list" ? (
            <div>
              <div className="hidden border-b border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-5 py-3 text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)] lg:grid lg:grid-cols-[36px_minmax(0,1fr)_140px_120px_140px_130px_140px]">
                <input
                  type="checkbox"
                  aria-label="Selecionar contatos visiveis"
                  checked={filteredLeads.length > 0 && filteredLeads.every((lead) => selectedLeadIds.includes(lead.id))}
                  onChange={toggleAllVisibleLeads}
                  className="h-4 w-4 accent-[var(--cliente-primary)]"
                />
                <span>Contato</span>
                <span>Etapa</span>
                <span>Temperatura</span>
                <span>Origem</span>
                <span>Valor</span>
                <span>Responsavel</span>
              </div>
              <div className="divide-y divide-[var(--cliente-border)]">
              {loading ? <div className="p-5"><CrmEmpty title="Carregando clientes" /></div> : null}
              {!loading && filteredLeads.length === 0 ? <div className="p-5"><CrmEmpty title="Nenhum contato encontrado" /></div> : null}
              {filteredLeads.map((lead) => {
                const stage = normalizeStage(lead);
                return (
                  <div
                    key={lead.id}
                    onClick={() => selectLead(lead.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") selectLead(lead.id);
                    }}
                    className={`flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left transition hover:bg-[var(--cliente-surface-muted)] lg:grid lg:grid-cols-[36px_minmax(0,1fr)_140px_120px_140px_130px_140px] lg:items-center lg:gap-4 ${selectedLeadId === lead.id ? "bg-[var(--cliente-primary-soft)] shadow-[inset_4px_0_0_var(--cliente-primary)]" : ""}`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${lead.nome || "contato"}`}
                      checked={selectedLeadIds.includes(lead.id)}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleLeadSelection(lead.id)}
                      className="mt-2 h-4 w-4 shrink-0 accent-[var(--cliente-primary)] lg:mt-0"
                    />
                    <div className="min-w-0 flex-1 lg:contents">
                      <div className="min-w-0">
                        <CrmAvatar
                          name={lead.nome}
                          subtitle={lead.empresa || lead.telefone || lead.email || "Sem empresa"}
                          photoUrl={leadPhotoUrl(lead)}
                        />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {leadNeedsResponse(lead) ? <CrmBadge tone="orange">precisa resposta</CrmBadge> : null}
                          {!ownerKey(lead) ? <CrmBadge tone="neutral">sem responsavel</CrmBadge> : null}
                          {isToday(lead.createdAt) ? <CrmBadge tone="green">entrou hoje</CrmBadge> : null}
                        </div>
                        <p className="mt-2 line-clamp-1 text-xs text-[var(--cliente-card-text-soft)]">
                          {lead.salesJourney?.actionLabel || formatAiAction(lead.aiNextAction || lead.qualification?.nextAction)}
                        </p>
                      </div>
                      <div className="mt-2 lg:mt-0"><CrmBadge tone="blue">{getPipelineStageLabel(stage)}</CrmBadge></div>
                      <div className="mt-2 lg:mt-0"><CrmBadge tone={heatTone(lead.heat)}>{lead.heat || "sem temp."}</CrmBadge></div>
                      <p className="mt-2 truncate text-xs font-bold text-[var(--cliente-card-text-soft)] lg:mt-0">{formatChannel(leadChannel(lead))}</p>
                      <p className="mt-2 text-sm font-black text-[var(--cliente-card-text)] lg:mt-0">{formatCrmMoney(lead.potentialValue)}</p>
                      <p className="mt-1 truncate text-xs font-bold text-[var(--cliente-card-text-soft)] lg:mt-0">{lead.owner || "Sem responsavel"}</p>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          ) : null}

          {view === "pipeline" ? (
            <div className="client-scrollbar min-h-[calc(100vh-18rem)] overflow-x-auto overflow-y-hidden p-4">
              <div className="flex min-w-max gap-4 pb-2">
              {leadsByStage.map((column) => (
                <section key={column.stage} className="flex max-h-[calc(100vh-18rem)] w-[320px] shrink-0 flex-col rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]">
                  <div className="border-b border-[var(--cliente-border)] p-4">
                    <p className="text-sm font-black text-[var(--cliente-card-text)]">{getPipelineStageLabel(column.stage)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{column.items.length} oportunidades | {formatCrmMoney(column.totalValue)}</p>
                  </div>
                  <div className="client-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {column.items.length === 0 ? <CrmEmpty title="Sem itens" /> : null}
                    {column.items.map((lead) => (
                      <div
                        key={lead.id}
                        className={`rounded-[16px] border bg-[var(--cliente-card)] p-3 shadow-[0_14px_28px_-24px_rgba(15,23,42,0.18)] transition hover:border-[var(--cliente-border-strong)] hover:shadow-[0_20px_40px_-28px_rgba(15,23,42,0.24)] ${selectedLeadId === lead.id ? "border-[var(--cliente-primary)]" : "border-[var(--cliente-border)]"}`}
                      >
                        <button type="button" onClick={() => selectLead(lead.id)} className="w-full text-left">
                          <CrmAvatar
                            name={lead.nome}
                            subtitle={lead.empresa || lead.telefone || lead.email || "Sem empresa"}
                            photoUrl={leadPhotoUrl(lead)}
                            size="sm"
                          />
                          <div className="mt-3 flex flex-wrap gap-2">
                            <CrmBadge>{formatCrmMoney(lead.potentialValue)}</CrmBadge>
                            {leadNeedsResponse(lead) ? <CrmBadge tone="orange">responder</CrmBadge> : null}
                            {!ownerKey(lead) ? <CrmBadge tone="neutral">sem dono</CrmBadge> : null}
                          </div>
                          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                            {lead.salesJourney?.actionLabel || formatAiAction(lead.aiNextAction || lead.qualification?.nextAction)}
                          </p>
                        </button>
                        <div className="mt-3 flex gap-2">
                          {lead.heat ? <CrmBadge tone={heatTone(lead.heat)}>{lead.heat}</CrmBadge> : null}
                        </div>
                        <CrmSelect
                          value={column.stage}
                          onChange={(event) => updateStage(lead.id, event.target.value)}
                          disabled={!canOperate || savingStage}
                          className="mt-3 h-10 w-full text-xs"
                        >
                          {stageOptions.map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
                        </CrmSelect>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <Link
                            href={`/cliente/painel/inbox?leadId=${encodeURIComponent(lead.id)}`}
                            className="inline-flex items-center justify-center rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                          >
                            Conversa
                          </Link>
                          <button
                            type="button"
                            onClick={() => selectLead(lead.id)}
                            className="inline-flex items-center justify-center rounded-[12px] border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
                          >
                            Detalhes
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
              </div>
            </div>
          ) : null}

          {view === "analytics" ? (
            <div className="grid gap-4 p-5 md:grid-cols-2">
              {leadsByStage.map((column) => (
                <CrmPanel key={column.stage} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[var(--cliente-card-text)]">{getPipelineStageLabel(column.stage)}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatCrmMoney(column.totalValue)}</p>
                    </div>
                    <CrmBadge tone="blue">{column.items.length}</CrmBadge>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-[var(--cliente-border)]">
                    <div className="h-full rounded-full bg-[var(--cliente-primary)]" style={{ width: `${Math.min(100, Math.max(4, (column.items.length / Math.max(1, filteredLeads.length)) * 100))}%` }} />
                  </div>
                </CrmPanel>
              ))}
            </div>
          ) : null}

          {nextLeadOffset !== null ? (
            <div className="border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-5 py-4 text-center">
              <CrmButton type="button" tone="secondary" onClick={() => void loadMoreLeads()} disabled={loadingMore}>
                {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                Carregar mais clientes ({leads.length} de {totalLeadCount})
              </CrmButton>
            </div>
          ) : null}
        </CrmPanel>

        <aside className="hidden space-y-4 xl:sticky xl:top-[132px] xl:block xl:self-start">
          {view === "analytics" ? (
            <CrmPanel>
              <CrmSectionTitle eyebrow="Gestao" title="Ranking de vendedores" description="Vendas, carteira, pendencias e tempo de primeira resposta por responsavel." />
              <div className="mt-4 space-y-2">
                {sellerRanking.length ? (
                  sellerRanking.map((seller, index) => (
                    <button
                      key={seller.id}
                      type="button"
                      onClick={() => setOwnerFilter(seller.id === "unassigned" ? "all" : seller.id)}
                      className="w-full rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-left transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{index + 1}. {seller.name}</p>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{seller.leads} lead(s) | {seller.won} ganho(s) | {Math.round(seller.conversion * 100)}% conversao</p>
                        </div>
                        <CrmBadge tone={seller.pending ? "orange" : "green"}>{seller.pending ? `${seller.pending} pend.` : "em dia"}</CrmBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <SalesFact label="Valor" value={formatCrmMoney(seller.value)} />
                        <SalesFact label="Quentes" value={String(seller.hot)} />
                        <SalesFact label="Resp. media" value={formatResponseTime(seller.avgFirstResponseMinutes, seller.responseSamples)} />
                        <SalesFact label="Em atendimento" value={String(seller.activeChats)} />
                      </div>
                    </button>
                  ))
                ) : (
                  <CrmEmpty title="Sem vendedores atribuidos" description="Quando os leads tiverem responsavel, o ranking aparece aqui." />
                )}
              </div>
            </CrmPanel>
          ) : null}

          <CrmPanel>
            <CrmSectionTitle eyebrow="Painel lateral" title="Detalhes e acoes" description="Ao clicar em um cliente, o contexto comercial abre aqui para agir sem sair da tela." />
            {selectedLead ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-[20px] border border-[var(--cliente-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-primary)_8%,var(--cliente-card)),var(--cliente-card))] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CrmAvatar
                      name={selectedLead.nome}
                      subtitle={selectedLead.empresa || selectedLead.email || selectedLead.telefone}
                      size="lg"
                      photoUrl={leadPhotoUrl(selectedLead)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <CrmBadge tone="blue">{getPipelineStageLabel(normalizeStage(selectedLead))}</CrmBadge>
                      {selectedLead.heat ? <CrmBadge tone={heatTone(selectedLead.heat)}>{selectedLead.heat}</CrmBadge> : null}
                      {detail?.stagePolicy?.slaBreached ? <CrmBadge tone="orange">sem retorno</CrmBadge> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SalesFact label="Valor" value={formatCrmMoney(selectedLead.potentialValue)} />
                    <SalesFact label="Score" value={String(selectedLead.score ?? detail?.qualification?.score ?? "--")} />
                    <SalesFact label="Responsavel" value={selectedLead.owner || detail?.stagePolicy?.ownerName || "Sem responsavel"} />
                    <SalesFact label="Origem" value={selectedOrigin} />
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                      Conversa
                    </Link>
                    <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                      Proposta
                    </Link>
                    <Link href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-xs font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                      Agenda
                    </Link>
                    <CrmButton type="button" onClick={() => setEditing(true)} disabled={!canOperate}>Editar</CrmButton>
                  </div>

                  {selectedLead.telefone ? (
                    <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-success)] px-4 py-3 text-sm font-black text-white transition hover:brightness-95">
                      <MessageSquareText className="h-4 w-4" />
                      Atender na Altum
                    </Link>
                  ) : null}
                </div>

                {selectedOrders.length ? (
                  <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-success)_24%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-success)_8%,var(--cliente-card)),var(--cliente-card))] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black uppercase text-[var(--cliente-success)]">Compras e receita</p>
                        <p className="mt-2 text-sm font-bold text-[var(--cliente-card-text)]">
                          {selectedOrders.length} pedido(s) vinculados a este cliente
                        </p>
                      </div>
                      <CrmBadge tone="green">{formatCrmMoney(selectedRevenue)}</CrmBadge>
                    </div>
                    <div className="mt-4 space-y-2">
                      {selectedOrders.slice(0, 3).map((order) => (
                        <div key={order.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">
                                Pedido {order.orderNumber || order.id.slice(-8)}
                              </p>
                              <p className="mt-1 truncate text-[11px] text-[var(--cliente-card-text-soft)]">
                                {(order.purchasedProductNames || []).join(", ") || order.provider || "E-commerce"}
                              </p>
                            </div>
                            <span className="shrink-0 text-xs font-black text-[var(--cliente-card-text)]">{formatCrmMoney(order.totalPrice)}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <CrmBadge tone={String(order.paymentStatus || "").toLowerCase().includes("paid") ? "green" : "orange"}>
                              {order.paymentStatus || order.status || "em andamento"}
                            </CrmBadge>
                            {order.trackingCode ? <CrmBadge tone="blue">rastreio {order.trackingCode}</CrmBadge> : null}
                            <span className="text-[11px] text-[var(--cliente-card-text-muted)]">
                              {formatCrmDate(order.orderedAt || order.updatedAt || order.createdAt, "sem data")}
                            </span>
                          </div>
                          {order.trackingUrl?.startsWith("https://") ? (
                            <a
                              href={order.trackingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-3 inline-flex text-xs font-black text-[var(--cliente-primary)] hover:underline"
                            >
                              Acompanhar entrega
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase text-[var(--cliente-card-text-soft)]">Proximo passo</p>
                      <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">{selectedNextAction}</p>
                    </div>
                    <CrmBadge tone={detail?.stagePolicy?.slaBreached ? "orange" : "purple"}>{detail?.stagePolicy?.slaBreached ? "agir hoje" : "proxima acao"}</CrmBadge>
                  </div>
                  {selectedJourney ? (
                    <div className="mt-4 rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CrmBadge tone="purple">{selectedJourney.lifecycleLabel}</CrmBadge>
                        <CrmBadge tone="blue">{selectedJourney.motionLabel}</CrmBadge>
                        <CrmBadge tone={selectedJourney.urgency === "now" || selectedJourney.urgency === "today" ? "orange" : "neutral"}>
                          {selectedJourney.urgency === "now" ? "agora" : selectedJourney.urgency === "today" ? "hoje" : selectedJourney.urgency === "waiting" ? "aguardando" : "programar"}
                        </CrmBadge>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text)]">{selectedJourney.reason}</p>
                      <p className="mt-3 text-xs font-black text-[var(--cliente-ai)]">Como abordar</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{selectedJourney.messageBrief}</p>
                      <div className="mt-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                        <p className="text-xs leading-5 text-[var(--cliente-card-text)]">{selectedJourney.suggestedMessage}</p>
                        <CrmButton
                          type="button"
                          tone="secondary"
                          className="mt-2"
                          onClick={() => navigator.clipboard.writeText(selectedJourney.suggestedMessage).then(() => setNotice("Mensagem sugerida copiada."))}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copiar sugestao
                        </CrmButton>
                      </div>
                      {selectedJourney.requiresTemplate ? (
                        <p className="mt-2 text-xs font-bold text-orange-700">WhatsApp fora da janela de atendimento: use um template aprovado.</p>
                      ) : selectedJourney.dueAt && selectedJourney.urgency !== "now" ? (
                        <p className="mt-2 text-[11px] text-[var(--cliente-card-text-muted)]">Momento recomendado: {formatCrmDate(selectedJourney.dueAt)}</p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                    <CrmSelect value={nextStage} onChange={(event) => setNextStage(event.target.value)} disabled={!canOperate}>
                      {stageOptions.map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
                    </CrmSelect>
                    <CrmButton type="button" tone="primary" disabled={!canOperate || savingStage} onClick={() => updateStage()}>
                      {savingStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar etapa
                    </CrmButton>
                  </div>
                  {!selectedJourney && (detail?.qualification?.nextAction || detail?.qualification?.label || selectedLead.qualification?.nextAction) ? (
                    <div className="mt-4 rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black uppercase text-[var(--cliente-ai)]">Sugestao da Altum</p>
                        {detail?.qualification?.label ? <CrmBadge tone="purple">{detail.qualification.label}</CrmBadge> : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text)]">
                        {detail?.qualification?.nextAction || selectedLead.qualification?.nextAction || "Revise o contexto e defina o proximo passo comercial."}
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,var(--cliente-border))] bg-[var(--cliente-card)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase text-[var(--cliente-primary)]">Origem e campanha</p>
                      <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">{selectedAttribution.campaign}</p>
                    </div>
                    <CrmBadge tone={selectedAttribution.clickId === "Registrado" ? "green" : "orange"}>
                      {selectedAttribution.clickId === "Registrado" ? "click rastreado" : "sem click id"}
                    </CrmBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SalesFact label="Fonte" value={selectedAttribution.source} />
                    <SalesFact label="Meio" value={selectedAttribution.medium} />
                    <SalesFact label="Primeiro toque" value={selectedAttribution.firstTouchLabel} />
                    <SalesFact label="Ultimo toque" value={selectedAttribution.lastTouchLabel} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                    Criativo/conteudo: {selectedAttribution.content}. Essa leitura alimenta campanhas e relatorios quando UTMs, gclid ou fbclid chegam corretamente.
                  </p>
                </div>

                <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_22%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_10%,var(--cliente-card)),var(--cliente-card))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-black uppercase text-[var(--cliente-primary)]">
                        <FileText className="h-3.5 w-3.5" />
                        Resumo comercial
                      </p>
                      <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">
                        {selectedCommercialDossier?.title || selectedLead.aiRecommendedOffer || "Contexto pronto para atendimento e venda"}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                        {selectedCommercialDossier?.sellerBrief || selectedCommercialDossier?.summary || selectedLead.aiLeadSummary || "Sem resumo comercial consolidado ainda."}
                      </p>
                    </div>
                    <CrmBadge tone="green">{selectedCommercialDossier?.triggerLabel || "ao vivo"}</CrmBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SalesFact label="Objetivo" value={selectedCommercialDossier?.objective || "Confirmar contexto"} />
                    <SalesFact label="Oferta" value={selectedCommercialDossier?.recommendedOffer || selectedLead.aiRecommendedOffer || "Validar"} />
                    <SalesFact label="Proximo passo" value={formatAiAction(selectedCommercialDossier?.nextAction || selectedLead.aiNextAction)} />
                    <SalesFact label="Atualizado" value={formatCrmDate(selectedCommercialDossier?.updatedAt, "agora")} />
                  </div>
                  {(selectedCommercialDossier?.diagnosis || selectedCommercialDossier?.personalizedPlan || selectedCommercialDossier?.sellerNextMove) ? (
                    <div className="mt-4 rounded-[16px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-3">
                      <p className="text-[10px] font-black uppercase text-[var(--cliente-ai)]">Plano da IA</p>
                      {selectedCommercialDossier?.diagnosis ? <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text)]"><span className="font-black">Diagnostico:</span> {selectedCommercialDossier.diagnosis}</p> : null}
                      {selectedCommercialDossier?.personalizedPlan ? <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text)]"><span className="font-black">Plano:</span> {selectedCommercialDossier.personalizedPlan}</p> : null}
                      {selectedCommercialDossier?.sellerNextMove ? <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text)]"><span className="font-black">Vendedor:</span> {selectedCommercialDossier.sellerNextMove}</p> : null}
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Dores</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(selectedCommercialDossier?.painPoints || []).slice(0, 4).map((item) => (
                          <CrmBadge key={item} tone="orange">{item}</CrmBadge>
                        ))}
                        {!(selectedCommercialDossier?.painPoints || []).length ? <CrmBadge>sem dores</CrmBadge> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Perguntas pendentes</p>
                      <div className="mt-2 space-y-1">
                        {(selectedCommercialDossier?.questionsToAsk || []).slice(0, 3).map((item) => (
                          <p key={item} className="text-xs leading-5 text-[var(--cliente-card-text-soft)]">- {item}</p>
                        ))}
                        {!(selectedCommercialDossier?.questionsToAsk || []).length ? <p className="text-xs text-[var(--cliente-card-text-soft)]">Nenhuma pergunta critica pendente.</p> : null}
                      </div>
                    </div>
                  </div>
                  {(selectedCommercialDossier?.talkingPoints || []).length ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Roteiro recomendado</p>
                      {(selectedCommercialDossier?.talkingPoints || []).slice(0, 4).map((item) => (
                        <p key={item} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--cliente-card-text)]">
                          {item}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-black uppercase text-[var(--cliente-ai)]">
                        <Bot className="h-3.5 w-3.5" />
                        IA aplicada
                      </p>
                      <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">{formatAiAction(selectedLead.aiNextAction)}</p>
                    </div>
                    <CrmBadge tone={getTemperatureTone(selectedLead.aiCommercialTemperature)}>{formatTemperature(selectedLead.aiCommercialTemperature)}</CrmBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SalesFact label="Oferta" value={selectedLead.aiRecommendedOffer || "Nao definida"} />
                    <SalesFact label="Objetivo IA" value={selectedLead.aiResponseGoal || "Nao definido"} />
                    <SalesFact label="Confianca" value={typeof selectedLead.aiPlannerConfidence === "number" ? `${Math.round(selectedLead.aiPlannerConfidence * 100)}%` : "--"} />
                    <SalesFact label="Captura" value={selectedLead.aiCaptureChecklist ? "Em andamento" : "Sem checklist"} />
                  </div>
                  {selectedAiEvidence.length ? (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {selectedAiEvidence.slice(0, 4).map((item) => (
                        <SalesFact key={item.label} label={item.label} value={item.value} />
                      ))}
                    </div>
                  ) : null}
                  {selectedLead.aiLeadSummary ? <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{selectedLead.aiLeadSummary}</p> : null}
                </div>

                <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black uppercase text-[var(--cliente-card-text-soft)]">Atendimento e agenda</p>
                    <CrmBadge tone="blue">{Number(selectedConversationSummary.total || detail?.relatedChats?.length || 0)} conversa(s)</CrmBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <SalesFact label="Pendentes" value={String(selectedConversationSummary.pending || 0)} />
                    <SalesFact label="Resolvidas" value={String(selectedConversationSummary.resolved || 0)} />
                    <SalesFact label="Alta prioridade" value={String(selectedConversationSummary.highPriority || 0)} />
                    <SalesFact label="Ultima interacao" value={formatCrmDate(selectedConversationSummary.lastInteractionAt, "sem data")} />
                  </div>
                  {selectedAppointments.length ? (
                    <div className="mt-3 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                      <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Proxima reuniao</p>
                      <p className="mt-1 text-xs font-bold text-[var(--cliente-card-text)]">{formatCrmDate(selectedAppointments[0]?.startAt || selectedAppointments[0]?.createdAt, "sem data")}</p>
                    </div>
                  ) : null}
                  {detail?.relatedChats?.length ? (
                    <div className="mt-3 space-y-2">
                      {detail.relatedChats.slice(0, 3).map((chat) => (
                        <Link
                          key={chat.id}
                          href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}&chatId=${encodeURIComponent(chat.id)}`}
                          className="block rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 transition hover:bg-[var(--cliente-panel-soft)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">{chat.contactName || chat.contactPhone || "Conversa"}</p>
                            {chat.unreadCount ? <CrmBadge tone="green">{chat.unreadCount} novas</CrmBadge> : null}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{chat.lastMessage || chat.channel || "Abrir historico"}</p>
                          <p className="mt-1 text-[11px] text-[var(--cliente-card-text-muted)]">{formatCrmDate(chat.lastMessageTime, "sem data")}</p>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>

                {(selectedDocuments.length || selectedTimeline.length) ? (
                  <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase text-[var(--cliente-card-text-soft)]">Documentos e historico</p>
                      <CrmBadge tone="neutral">{selectedDocuments.length + selectedTimeline.length}</CrmBadge>
                    </div>
                    {selectedDocuments.length ? (
                      <div className="mt-4 space-y-2">
                        {selectedDocuments.slice(0, 3).map((document) => (
                          <div key={document.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">{getLeadDocumentTitle(document)}</p>
                                <p className="mt-1 text-[11px] font-bold text-[var(--cliente-card-text-muted)]">
                                  {formatLeadDocumentType(document.type)} | {formatCrmDate(document.updatedAt || document.createdAt, "sem data")}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => copyLeadDocument(document)}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--cliente-border)] text-[var(--cliente-card-text-soft)] transition hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
                                aria-label="Copiar documento da IA"
                                title="Copiar documento"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{getLeadDocumentSummary(document)}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {selectedTimeline.length ? (
                      <div className="mt-4 space-y-2">
                        {selectedTimeline.slice(0, 5).map((event) => (
                          <div key={event.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-black text-[var(--cliente-card-text)]">{event.title || event.type || "Evento"}</p>
                              <span className="shrink-0 text-[10px] font-bold text-[var(--cliente-card-text-muted)]">{formatCrmDate(event.createdAt, "--")}</span>
                            </div>
                            {event.detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{event.detail}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5"><CrmEmpty title="Selecione um cliente" /></div>
            )}
          </CrmPanel>

          <CrmPanel>
            <CrmSectionTitle eyebrow="Rotina" title="Atividades e pendencias" description="Registre proxima acao, acompanhe tarefas abertas e deixe observacoes da negociacao." />
            {detailLoading ? <div className="mt-4"><CrmEmpty title="Carregando ficha" /></div> : null}
            {selectedLead ? (
              <div className="mt-4 space-y-4">
                <form onSubmit={createTask} className="space-y-2">
                  <CrmInput value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} disabled={!canOperate} placeholder="Criar proxima acao" className="w-full" />
                  <CrmButton type="submit" disabled={!canOperate || savingTask || !taskTitle.trim()} className="w-full">
                    {savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Criar tarefa
                  </CrmButton>
                </form>
                <form onSubmit={createNote} className="space-y-2">
                  <CrmTextarea value={noteText} onChange={(event) => setNoteText(event.target.value)} disabled={!canOperate} placeholder="Adicionar nota interna" rows={3} className="w-full" />
                  <CrmButton type="submit" disabled={!canOperate || savingNote || !noteText.trim()} className="w-full">
                    {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Salvar nota
                  </CrmButton>
                </form>
                <div className="space-y-2">
                  {(detail?.tasks || []).slice(0, 4).map((task) => (
                    <div key={task.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-xs font-black text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                      <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{task.status || "pending"} | {formatCrmDate(task.dueAt, "sem prazo")}</p>
                    </div>
                  ))}
                  {(detail?.notes || []).slice(0, 3).map((note) => (
                    <div key={note.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <p className="text-xs text-[var(--cliente-card-text)]">{note.text || "-"}</p>
                      <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{formatCrmDate(note.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
          ) : null}

        </CrmPanel>

          <CrmPanel>
            <CrmSectionTitle eyebrow="Base" title="Importar contatos" />
            <form onSubmit={importLeadBase} className="mt-4 space-y-3">
              <input type="file" accept=".csv,text/csv" disabled={!canOperate} onChange={(event) => setImportFile(event.target.files?.[0] || null)} className="block w-full rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm text-[var(--cliente-card-text)]" />
              <CrmButton type="submit" tone="primary" disabled={!canOperate || importing || !importFile} className="w-full">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Importar base
              </CrmButton>
            </form>
          </CrmPanel>
        </aside>
      </section>

      {selectedLead ? (
        <div className="xl:hidden">
          <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-30">
            <button
              type="button"
              onClick={() => setShowLeadDrawer(true)}
              className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-[var(--cliente-border)] bg-[color:color-mix(in_srgb,var(--cliente-card)_94%,white)] px-4 py-3 text-left shadow-[var(--cliente-shadow-hard)] backdrop-blur"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--cliente-primary)]">Ficha do cliente</p>
                <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{selectedLead.nome || "Contato selecionado"}</p>
                <p className="truncate text-xs text-[var(--cliente-card-text-soft)]">{selectedNextAction}</p>
              </div>
              <CrmBadge tone="blue">{getPipelineStageLabel(normalizeStage(selectedLead))}</CrmBadge>
            </button>
          </div>
        </div>
      ) : null}

      <CustomerProfileDrawer
        open={creatingLead}
        onClose={() => setCreatingLead(false)}
        title="Novo cliente ou oportunidade"
        subtitle="Cadastre o essencial agora e complete a ficha durante a venda."
        status={getPipelineStageLabel(newLeadForm.pipelineStage)}
        footer={
          <CrmButton form="lead-create-form" type="submit" tone="primary" disabled={!canOperate || savingNewLead} className="w-full">
            {savingNewLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar cliente
          </CrmButton>
        }
      >
        <form id="lead-create-form" onSubmit={createLead} className="space-y-5">
          <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
            Nome, telefone ou e-mail já são suficientes. A oportunidade entra no funil e fica atribuída a você.
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Dados principais</p>
            <CrmInput autoFocus value={newLeadForm.nome} onChange={(event) => setNewLeadForm((current) => ({ ...current, nome: event.target.value }))} disabled={!canOperate} placeholder="Nome do cliente" className="w-full" />
            <CrmInput value={newLeadForm.empresa} onChange={(event) => setNewLeadForm((current) => ({ ...current, empresa: event.target.value }))} disabled={!canOperate} placeholder="Empresa (opcional)" className="w-full" />
            <div className="grid gap-3 sm:grid-cols-2">
              <CrmInput value={newLeadForm.telefone} onChange={(event) => setNewLeadForm((current) => ({ ...current, telefone: event.target.value }))} disabled={!canOperate} placeholder="WhatsApp ou telefone" className="w-full" />
              <CrmInput type="email" value={newLeadForm.email} onChange={(event) => setNewLeadForm((current) => ({ ...current, email: event.target.value }))} disabled={!canOperate} placeholder="E-mail" className="w-full" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Oportunidade</p>
            <CrmSelect value={newLeadForm.pipelineStage} onChange={(event) => setNewLeadForm((current) => ({ ...current, pipelineStage: event.target.value }))} disabled={!canOperate} className="w-full">
              {(stageOptions.length ? stageOptions : ["captado"]).map((stage) => <option key={stage} value={stage}>{getPipelineStageLabel(stage)}</option>)}
            </CrmSelect>
            <CrmInput type="number" min="0" step="0.01" value={newLeadForm.potentialValue} onChange={(event) => setNewLeadForm((current) => ({ ...current, potentialValue: event.target.value }))} disabled={!canOperate} placeholder="Valor potencial (opcional)" className="w-full" />
            <CrmTextarea value={newLeadForm.notes} onChange={(event) => setNewLeadForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Contexto, necessidade ou próximo passo" rows={5} className="w-full" />
          </div>
        </form>
      </CustomerProfileDrawer>

      <CustomerProfileDrawer
        open={editing && Boolean(selectedLead)}
        onClose={() => setEditing(false)}
        title={selectedLead?.nome || "Contato"}
        subtitle={selectedLead?.empresa || selectedLead?.telefone || selectedLead?.email}
        photoUrl={leadPhotoUrl(selectedLead)}
        status={selectedLead ? getPipelineStageLabel(normalizeStage(selectedLead)) : undefined}
        meta={
          selectedLead ? (
            <div className="grid grid-cols-2 gap-2">
              <SalesFact label="Responsavel" value={selectedLead.owner || detail?.stagePolicy?.ownerName || "Sem responsavel"} />
              <SalesFact label="Valor" value={formatCrmMoney(selectedLead.potentialValue)} />
              <SalesFact label="Temperatura" value={selectedLead.heat || "sem leitura"} />
              <SalesFact label="Origem" value={selectedOrigin} />
            </div>
          ) : null
        }
        footer={
          <CrmButton form="lead-edit-form" type="submit" tone="primary" disabled={!canOperate || savingLead} className="w-full">
            {savingLead ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar contato
          </CrmButton>
        }
      >
        <form id="lead-edit-form" onSubmit={saveLead} className="space-y-5">
          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Dados principais</p>
            <CrmInput value={leadForm.nome} onChange={(event) => setLeadForm((current) => ({ ...current, nome: event.target.value }))} disabled={!canOperate} placeholder="Nome" className="w-full" />
            <CrmInput value={leadForm.empresa} onChange={(event) => setLeadForm((current) => ({ ...current, empresa: event.target.value }))} disabled={!canOperate} placeholder="Empresa" className="w-full" />
            <div className="grid grid-cols-2 gap-3">
              <CrmInput value={leadForm.telefone} onChange={(event) => setLeadForm((current) => ({ ...current, telefone: event.target.value }))} disabled={!canOperate} placeholder="Telefone" className="w-full" />
              <CrmInput value={leadForm.email} onChange={(event) => setLeadForm((current) => ({ ...current, email: event.target.value }))} disabled={!canOperate} placeholder="E-mail" className="w-full" />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Leitura comercial</p>
            <div className="grid grid-cols-2 gap-3">
              <CrmSelect value={leadForm.priority} onChange={(event) => setLeadForm((current) => ({ ...current, priority: event.target.value }))} disabled={!canOperate}>
                {priorityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </CrmSelect>
              <CrmSelect value={leadForm.heat} onChange={(event) => setLeadForm((current) => ({ ...current, heat: event.target.value }))} disabled={!canOperate}>
                {heatOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </CrmSelect>
            </div>
            <CrmInput type="number" value={leadForm.potentialValue} onChange={(event) => setLeadForm((current) => ({ ...current, potentialValue: event.target.value }))} disabled={!canOperate} placeholder="Valor potencial" className="w-full" />
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">Observacoes</p>
            <CrmTextarea value={leadForm.notes} onChange={(event) => setLeadForm((current) => ({ ...current, notes: event.target.value }))} disabled={!canOperate} placeholder="Resumo comercial, contexto e acordos" rows={6} className="w-full" />
          </div>
        </form>
      </CustomerProfileDrawer>

      <CustomerProfileDrawer
        open={showLeadDrawer && Boolean(selectedLead)}
        onClose={() => setShowLeadDrawer(false)}
        title={selectedLead?.nome || "Contato"}
        subtitle={selectedLead?.empresa || selectedLead?.telefone || selectedLead?.email}
        photoUrl={leadPhotoUrl(selectedLead)}
        status={selectedLead ? getPipelineStageLabel(normalizeStage(selectedLead)) : undefined}
        meta={
          selectedLead ? (
            <div className="grid grid-cols-2 gap-2">
              <SalesFact label="Valor" value={formatCrmMoney(selectedLead.potentialValue)} />
              <SalesFact label="Origem" value={selectedOrigin} />
              <SalesFact label="Responsavel" value={selectedLead.owner || detail?.stagePolicy?.ownerName || "Sem responsavel"} />
              <SalesFact label="Score" value={String(selectedLead.score ?? detail?.qualification?.score ?? "--")} />
            </div>
          ) : null
        }
      >
        {selectedLead ? (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Link href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                Conversa
              </Link>
              <Link href={`/cliente/painel/comercial?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                Proposta
              </Link>
              <Link href={`/cliente/painel/agenda?leadId=${encodeURIComponent(selectedLead.id)}`} className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
                Agenda
              </Link>
              <button
                type="button"
                onClick={() => {
                  setShowLeadDrawer(false);
                  setEditing(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]"
              >
                Editar ficha
              </button>
            </div>

            {selectedLead.telefone ? (
              <Link
                href={`/cliente/painel/inbox?leadId=${encodeURIComponent(selectedLead.id)}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-[var(--cliente-success)] px-4 py-3 text-sm font-black text-white transition hover:brightness-95"
              >
                <MessageSquareText className="h-4 w-4" />
                Atender na Altum
              </Link>
            ) : null}

            <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Proxima acao</p>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">{selectedNextAction}</p>
              {selectedLead.aiLeadSummary ? <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{selectedLead.aiLeadSummary}</p> : null}
            </div>

            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,var(--cliente-border))] bg-[var(--cliente-card)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase text-[var(--cliente-primary)]">Origem e campanha</p>
                  <p className="mt-2 text-sm font-bold text-[var(--cliente-card-text)]">{selectedAttribution.campaign}</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{selectedAttribution.source}</p>
                </div>
                <CrmBadge tone={selectedAttribution.clickId === "Registrado" ? "green" : "orange"}>
                  {selectedAttribution.clickId === "Registrado" ? "click rastreado" : "sem click id"}
                </CrmBadge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <SalesFact label="Meio" value={selectedAttribution.medium} />
                <SalesFact label="Criativo" value={selectedAttribution.content} />
                <SalesFact label="Primeiro toque" value={selectedAttribution.firstTouchLabel} />
                <SalesFact label="Ultimo toque" value={selectedAttribution.lastTouchLabel} />
              </div>
            </div>

            <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase text-[var(--cliente-ai)]">IA aplicada</p>
                <CrmBadge tone={getTemperatureTone(selectedLead.aiCommercialTemperature)}>{formatTemperature(selectedLead.aiCommercialTemperature)}</CrmBadge>
              </div>
              <p className="mt-2 text-sm font-bold leading-6 text-[var(--cliente-card-text)]">{formatAiAction(selectedLead.aiNextAction)}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <SalesFact label="Oferta" value={selectedLead.aiRecommendedOffer || "Nao definida"} />
                <SalesFact label="Objetivo" value={selectedLead.aiResponseGoal || "Nao definido"} />
                <SalesFact label="Confianca" value={typeof selectedLead.aiPlannerConfidence === "number" ? `${Math.round(selectedLead.aiPlannerConfidence * 100)}%` : "--"} />
                <SalesFact label="Captura" value={selectedLead.aiCaptureChecklist ? "Em andamento" : "Sem checklist"} />
              </div>
              {selectedAiEvidence.length ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {selectedAiEvidence.slice(0, 4).map((item) => (
                    <SalesFact key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Atendimento e agenda</p>
                <CrmBadge tone="blue">{Number(selectedConversationSummary.total || detail?.relatedChats?.length || 0)} conversa(s)</CrmBadge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <SalesFact label="Pendentes" value={String(selectedConversationSummary.pending || 0)} />
                <SalesFact label="Resolvidas" value={String(selectedConversationSummary.resolved || 0)} />
                <SalesFact label="Alta prioridade" value={String(selectedConversationSummary.highPriority || 0)} />
                <SalesFact label="Ultima interacao" value={formatCrmDate(selectedConversationSummary.lastInteractionAt, "sem data")} />
              </div>
              {selectedAppointments.length ? (
                <div className="mt-4 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Proxima reuniao</p>
                  <p className="mt-1 text-xs font-bold text-[var(--cliente-card-text)]">{formatCrmDate(selectedAppointments[0]?.startAt || selectedAppointments[0]?.createdAt, "sem data")}</p>
                </div>
              ) : null}
            </div>

            {(selectedCommercialDossier?.painPoints?.length || selectedCommercialDossier?.questionsToAsk?.length || selectedDocuments.length || selectedTimeline.length) ? (
              <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
                <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">Contexto de venda</p>
                {selectedCommercialDossier?.painPoints?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedCommercialDossier.painPoints.slice(0, 4).map((item) => (
                      <CrmBadge key={item} tone="orange">{item}</CrmBadge>
                    ))}
                  </div>
                ) : null}
                {selectedCommercialDossier?.questionsToAsk?.length ? (
                  <div className="mt-3 space-y-1">
                    {selectedCommercialDossier.questionsToAsk.slice(0, 3).map((item) => (
                      <p key={item} className="text-xs leading-5 text-[var(--cliente-card-text-soft)]">- {item}</p>
                    ))}
                  </div>
                ) : null}
                {selectedDocuments.length ? (
                  <div className="mt-4 space-y-2">
                    {selectedDocuments.slice(0, 2).map((document) => (
                      <div key={document.id} className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">{getLeadDocumentTitle(document)}</p>
                            <p className="mt-1 text-[11px] text-[var(--cliente-card-text-muted)]">{formatLeadDocumentType(document.type)}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyLeadDocument(document)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-[var(--cliente-border)] text-[var(--cliente-card-text-soft)] transition hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
                            aria-label="Copiar documento da IA"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{getLeadDocumentSummary(document)}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </CustomerProfileDrawer>
    </CrmWorkspace>
  );
}

function SalesFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2">
      <p className="text-[10px] font-black uppercase text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 truncate text-xs font-bold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}
