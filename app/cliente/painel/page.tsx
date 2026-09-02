"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LineChart,
  Loader2,
  MessageSquare,
  MousePointerClick,
  RefreshCw,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import {
  CardTitle,
  ClientActionButton,
  ClientBadge,
  ClientEmptyState,
  MetricCard,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";
import { getPipelineStageLabel, normalizePipelineStageId } from "@/lib/pipeline";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "ai";

type DashboardData = {
  kpis?: {
    spend?: number;
    leads?: number;
    cpl?: number;
    paid?: number;
    pending?: number;
    budgets?: number;
  };
  contract?: {
    status?: string;
    monthlyValue?: number;
    nextDueDate?: string;
  } | null;
  error?: string;
};

type LeadItem = {
  id: string;
  nome?: string;
  name?: string;
  stage?: string;
  pipelineStage?: string;
  value?: number;
  score?: number;
  updatedAt?: unknown;
  createdAt?: unknown;
  timeline?: Array<{
    id?: string;
    title?: string;
    detail?: string;
    createdAt?: unknown;
  }>;
};

type ChatItem = {
  id: string;
  contactName?: string;
  customerName?: string;
  name?: string;
  channel?: string;
  status?: string;
  updatedAt?: unknown;
  lastMessageAt?: unknown;
  aiState?: {
    aiEnabled?: boolean;
    pausedUntil?: unknown;
  } | null;
};

type FollowUpItem = {
  id: string;
  leadId?: string;
  title?: string;
  status?: "pending" | "done";
  dueAt?: unknown;
  overdue?: boolean;
  dueToday?: boolean;
  lead?: {
    nome?: string;
    pipelineStage?: string;
  } | null;
};

type FollowUpsResponse = {
  summary?: {
    overdue?: number;
    dueToday?: number;
    pending?: number;
    proposal?: number;
  };
  items?: FollowUpItem[];
};

type AppointmentItem = {
  id: string;
  leadId?: string | null;
  leadName?: string | null;
  title?: string;
  type?: string;
  status?: string;
  startAt?: string;
  ownerName?: string | null;
};

type AttributionGroup = {
  key: string;
  label: string;
  source?: string | null;
  lastTouchLeads?: number;
  firstTouchLeads?: number;
  assistedLeads?: number;
  qualifiedLeads?: number;
  wonLeads?: number;
  meetings?: number;
  hotLeads?: number;
  avgScore?: number;
  qualityRate?: number;
  winRate?: number;
  spend?: number;
  clicks?: number;
  impressions?: number;
  paidLeads?: number;
  cpl?: number;
  qualifiedCpl?: number;
  costPerMeeting?: number;
  costPerSale?: number;
  campaignCount?: number | null;
};

type MetricsSummaryPayload = {
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    roi?: number;
    cpl?: number;
    qualifiedCpl?: number;
    costPerMeeting?: number;
    costPerSale?: number;
    conversations?: number;
    handoffChats?: number;
    wonLeads?: number;
    qualifiedLeads?: number;
    meetings?: number;
    totalLeads?: number;
    paidRevenue?: number;
  };
  traffic?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    ctr?: number;
    cpc?: number;
    cpl?: number;
  };
  operations?: {
    activeChats?: number;
    overdueChats?: number;
    unassignedChats?: number;
    pendingChats?: number;
    queueBreakdown?: {
      triage?: number;
      unassigned?: number;
      assigned?: number;
      assignedWaiting?: number;
      slaBreached?: number;
    };
  };
  ai?: {
    responded?: number;
    handoff?: number;
    avgConfidence?: number;
  };
  commercialAttribution?: {
    byChannel?: AttributionGroup[];
    byCampaign?: AttributionGroup[];
  };
};

type AutomationSummaryPayload = {
  summary?: {
    activeAutomations?: number;
    pausedConversations?: number;
    kbDocs?: number;
    guardrails?: number;
    waitingReplyBacklog?: number;
    slaBreached?: number;
    finance?: {
      dueSoonCount?: number;
      dueSoonTotal?: number;
      nextDueDate?: string | null;
    };
  };
};

type ReadinessPayload = {
  summary?: {
    pilotReady?: boolean;
    readinessScore?: number;
  };
  onboarding?: {
    progressPct?: number;
    completed?: number;
    total?: number;
  };
  blockers?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
};

type PriorityItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  badge: string;
  tone: Tone;
};

type CycleItem = {
  id: string;
  title: string;
  value: string;
  detail: string;
  result: string;
  href: string;
  icon: typeof TrendingUp;
  tone: "brand" | "success" | "ai" | "warning";
};

type LiveMetricItem = {
  label: string;
  value: string;
  detail: string;
  href: string;
  icon: typeof TrendingUp;
  tone: "brand" | "success" | "ai" | "warning" | "info";
};

const ACTIVE_STAGES = new Set(["captado", "contato", "qualificacao", "proposta", "fechamento"]);
const WON_STAGES = new Set(["ganho", "won", "closed_won"]);
const QUALIFIED_STAGES = new Set(["qualificacao", "proposta", "fechamento", "ganho"]);

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value || 0);
}

function pct(value: number) {
  const normalized = value > 1 ? value : value * 100;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

function formatDateTime(value?: string | null) {
  const date = toDate(value);
  if (!date) return "Sem horario";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatClock(value: number) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "sem data";
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes || 1} min atras`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h atras`;
  const days = Math.round(hours / 24);
  return `${days} d atras`;
}

function leadName(lead: LeadItem) {
  return lead.nome || lead.name || "Cliente sem nome";
}

function chatName(chat: ChatItem) {
  return chat.contactName || chat.customerName || chat.name || "Contato sem nome";
}

function normalizeStage(stage?: string) {
  return normalizePipelineStageId(stage || "captado");
}

function lastLeadActivity(lead: LeadItem) {
  const timelineDates = (lead.timeline || [])
    .map((item) => toDate(item.createdAt))
    .filter(Boolean) as Date[];
  const directDates = [toDate(lead.updatedAt), toDate(lead.createdAt)].filter(Boolean) as Date[];
  return [...timelineDates, ...directDates].sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

async function readJson<T>(url: string) {
  const response = await authedFetch(url);
  const payload = (await response.json()) as T;
  return { ok: response.ok, payload };
}

export default function ClientePainelOverviewPage() {
  const { tenant } = useClienteTenant();
  const tenantId = tenant?.tenantId;
  const [showDesktopCharts, setShowDesktopCharts] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpsResponse>({});
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummaryPayload>({});
  const [automationSummary, setAutomationSummary] = useState<AutomationSummaryPayload>({});
  const [readiness, setReadiness] = useState<ReadinessPayload>({});
  const [snapshotAt, setSnapshotAt] = useState<number>(() => Date.now());

  const loadOverview = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!tenantId) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }

      const results = await Promise.allSettled([
        readJson<DashboardData>("/api/client-portal/dashboard"),
        readJson<{ items?: ChatItem[] }>(`/api/tenant/${tenantId}/chats`),
        readJson<FollowUpsResponse>(`/api/tenant/${tenantId}/follow-ups`),
        readJson<{ items?: AppointmentItem[] }>(`/api/tenant/${tenantId}/appointments`),
        readJson<{ items?: LeadItem[]; error?: string }>(`/api/tenant/${tenantId}/leads`),
        readJson<MetricsSummaryPayload>(`/api/tenant/${tenantId}/metrics-summary`),
        readJson<AutomationSummaryPayload>(`/api/tenant/${tenantId}/automation-summary`),
        readJson<ReadinessPayload>(`/api/tenant/${tenantId}/readiness`),
      ]);

      const [dashboardResult, chatsResult, followUpsResult, appointmentsResult, leadsResult, metricsResult, automationResult, readinessResult] =
        results;

      if (dashboardResult.status === "fulfilled" && dashboardResult.value.ok) {
        setDashboard(dashboardResult.value.payload || {});
      } else if (!silent) {
        setError(
          dashboardResult.status === "fulfilled" && "error" in dashboardResult.value.payload
            ? dashboardResult.value.payload.error || "Falha ao carregar o inicio."
            : "Falha ao carregar o inicio."
        );
      }

      if (chatsResult.status === "fulfilled" && chatsResult.value.ok) setChats(chatsResult.value.payload.items || []);
      if (followUpsResult.status === "fulfilled" && followUpsResult.value.ok) setFollowUps(followUpsResult.value.payload || {});
      if (appointmentsResult.status === "fulfilled" && appointmentsResult.value.ok) setAppointments(appointmentsResult.value.payload.items || []);
      if (leadsResult.status === "fulfilled" && leadsResult.value.ok) setLeads(leadsResult.value.payload.items || []);
      if (metricsResult.status === "fulfilled" && metricsResult.value.ok) setMetricsSummary(metricsResult.value.payload || {});
      if (automationResult.status === "fulfilled" && automationResult.value.ok) setAutomationSummary(automationResult.value.payload || {});
      if (readinessResult.status === "fulfilled" && readinessResult.value.ok) setReadiness(readinessResult.value.payload || {});

      setSnapshotAt(Date.now());
      setLoading(false);
      setRefreshing(false);
    },
    [tenantId]
  );

  useAdaptivePolling({
    enabled: Boolean(tenantId),
    onTick: () => void loadOverview({ silent: true }),
    fastIntervalMs: 90000,
    slowIntervalMs: 300000,
    runOnMount: false,
    source: "cliente-overview-growth",
  });

  useEffect(() => {
    if (!tenantId) return;
    void loadOverview();
  }, [loadOverview, tenantId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 640px)");
    const sync = () => setShowDesktopCharts(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const metrics = metricsSummary.metrics || {};
  const traffic = metricsSummary.traffic || {};
  const operations = metricsSummary.operations || {};
  const queueBreakdown = operations.queueBreakdown || {};
  const aiMetrics = metricsSummary.ai || {};
  const automation = automationSummary.summary || {};
  const finance = automation.finance || {};
  const followUpSummary = followUps.summary || {};
  const campaigns = metricsSummary.commercialAttribution?.byCampaign || [];
  const workspaceName = tenant?.tenantName || tenant?.clientName || "sua operacao";

  const activeLeads = useMemo(
    () => leads.filter((lead) => ACTIVE_STAGES.has(normalizeStage(lead.pipelineStage || lead.stage))).length,
    [leads]
  );

  const wonLeads = useMemo(
    () => num(metrics.wonLeads) || leads.filter((lead) => WON_STAGES.has(normalizeStage(lead.pipelineStage || lead.stage))).length,
    [leads, metrics.wonLeads]
  );

  const qualifiedLeads = useMemo(
    () =>
      num(metrics.qualifiedLeads) ||
      leads.filter((lead) => QUALIFIED_STAGES.has(normalizeStage(lead.pipelineStage || lead.stage))).length,
    [leads, metrics.qualifiedLeads]
  );

  const staleOpportunities = useMemo(() => {
    const sevenDaysAgo = snapshotAt - 7 * 24 * 60 * 60 * 1000;
    return leads
      .filter((lead) => ACTIVE_STAGES.has(normalizeStage(lead.pipelineStage || lead.stage)))
      .filter((lead) => {
        const lastActivity = lastLeadActivity(lead);
        return !lastActivity || lastActivity.getTime() < sevenDaysAgo;
      });
  }, [leads, snapshotAt]);

  const upcomingAppointments = useMemo(
    () =>
      appointments
        .filter((item) => {
          const date = toDate(item.startAt);
          return date ? date.getTime() >= snapshotAt - 2 * 60 * 60 * 1000 : true;
        })
        .sort((a, b) => num(toDate(a.startAt)?.getTime()) - num(toDate(b.startAt)?.getTime()))
        .slice(0, 4),
    [appointments, snapshotAt]
  );

  const pendingTasks = useMemo(
    () =>
      (followUps.items || [])
        .filter((item) => item.status !== "done")
        .sort((a, b) => num(toDate(a.dueAt)?.getTime()) - num(toDate(b.dueAt)?.getTime()))
        .slice(0, 4),
    [followUps.items]
  );

  const recentChats = useMemo(
    () =>
      chats
        .slice()
        .sort((a, b) => num(toDate(b.updatedAt || b.lastMessageAt)?.getTime()) - num(toDate(a.updatedAt || a.lastMessageAt)?.getTime()))
        .slice(0, 4),
    [chats]
  );

  const topOpportunities = useMemo(
    () =>
      leads
        .filter((lead) => ACTIVE_STAGES.has(normalizeStage(lead.pipelineStage || lead.stage)))
        .sort((a, b) => num(b.score) - num(a.score) || num(b.value) - num(a.value))
        .slice(0, 4),
    [leads]
  );

  const spend = num(traffic.spend) || num(dashboard.kpis?.spend);
  const totalLeads = num(metrics.totalLeads) || num(traffic.leads) || num(dashboard.kpis?.leads) || leads.length;
  const paidRevenue = num(metrics.paidRevenue) || num(dashboard.kpis?.paid);
  const cpl = num(traffic.cpl) || num(metrics.cpl) || num(dashboard.kpis?.cpl);
  const meetings = num(metrics.meetings) || appointments.length;
  const activeChats = num(operations.activeChats) || chats.length;
  const pendingChats = num(operations.pendingChats) || num(queueBreakdown.assignedWaiting) || num(automation.waitingReplyBacklog);
  const overdueChats = num(operations.overdueChats) || num(queueBreakdown.slaBreached) || num(automation.slaBreached);
  const unassignedChats = num(operations.unassignedChats) || num(queueBreakdown.unassigned);
  const aiResponded = num(aiMetrics.responded);
  const handoffs = num(aiMetrics.handoff) || num(metrics.handoffChats);
  const followUpPending = num(followUpSummary.pending);
  const followUpOverdue = num(followUpSummary.overdue);
  const followUpToday = num(followUpSummary.dueToday);
  const campaignCount = campaigns.reduce((total, item) => total + Math.max(1, num(item.campaignCount)), 0);
  const readinessScore = num(readiness.summary?.readinessScore);
  const pilotReady = readiness.summary?.pilotReady === true;
  const effectiveCampaignCount = campaignCount || campaigns.length;
  const lastUpdatedLabel = formatClock(snapshotAt);
  const chartTextColor = "var(--cliente-card-text-soft)";
  const chartGridColor = "var(--cliente-border)";

  const campaignChartData = (() => {
    const fromCampaigns = campaigns
      .slice(0, 6)
      .map((campaign) => ({
        name: (campaign.label || campaign.key || "Campanha").slice(0, 16),
        leads: num(campaign.lastTouchLeads) || num(campaign.firstTouchLeads),
        vendas: num(campaign.wonLeads),
        reunioes: num(campaign.meetings),
        gasto: num(campaign.spend),
      }))
      .filter((item) => item.leads || item.vendas || item.reunioes || item.gasto);

    if (fromCampaigns.length) return fromCampaigns;

    return [
      { name: "Contatos", leads: totalLeads, vendas: wonLeads, reunioes: meetings, gasto: spend },
      { name: "Conversas", leads: activeChats, vendas: wonLeads, reunioes: meetings, gasto: 0 },
      { name: "Qualificados", leads: qualifiedLeads, vendas: wonLeads, reunioes: meetings, gasto: 0 },
      { name: "Vendas", leads: wonLeads, vendas: wonLeads, reunioes: meetings, gasto: 0 },
    ];
  })();

  const stageChartData = (() => {
    const stageMap = new Map<string, { name: string; oportunidades: number; valor: number }>();

    for (const lead of leads) {
      const stage = normalizeStage(lead.pipelineStage || lead.stage);
      const current = stageMap.get(stage) || {
        name: getPipelineStageLabel(stage),
        oportunidades: 0,
        valor: 0,
      };
      current.oportunidades += 1;
      current.valor += num(lead.value);
      stageMap.set(stage, current);
    }

    const items = Array.from(stageMap.values());
    if (items.length) return items.slice(0, 8);

    return [
      { name: "Captados", oportunidades: totalLeads, valor: 0 },
      { name: "Qualificados", oportunidades: qualifiedLeads, valor: 0 },
      { name: "Reunioes", oportunidades: meetings, valor: 0 },
      { name: "Ganhos", oportunidades: wonLeads, valor: paidRevenue },
    ];
  })();

  const liveMetrics: LiveMetricItem[] = [
    {
      label: "Gasto em anuncios",
      value: brl(spend),
      detail: effectiveCampaignCount ? `${effectiveCampaignCount} campanha(s) com leitura` : "Campanhas ainda sem leitura",
      href: "/cliente/painel/campanhas",
      icon: TrendingUp,
      tone: "brand",
    },
    {
      label: "Resultado vendido",
      value: brl(paidRevenue),
      detail: `${wonLeads} venda(s) e ${meetings} reunioes`,
      href: "/cliente/painel/crm",
      icon: Wallet,
      tone: "success",
    },
    {
      label: "Conversas geradas",
      value: String(activeChats),
      detail: `${totalLeads} contato(s), ${pendingChats} aguardando resposta`,
      href: "/cliente/painel/inbox",
      icon: MessageSquare,
      tone: pendingChats ? "warning" : "success",
    },
    {
      label: "IA trabalhando",
      value: String(aiResponded),
      detail: `${handoffs} conversa(s) foram para humano`,
      href: "/cliente/painel/ia",
      icon: Bot,
      tone: "ai",
    },
  ];

  const cycle: CycleItem[] = [
    {
      id: "traffic",
      title: "Trafego",
      value: brl(spend),
      detail: `${totalLeads} contatos atribuidos`,
      result: cpl ? `CPL ${brl(cpl)}` : "Custo ainda sem leitura",
      href: "/cliente/painel/campanhas",
      icon: TrendingUp,
      tone: "brand",
    },
    {
      id: "engagement",
      title: "Engajamento",
      value: String(activeChats),
      detail: `${pendingChats} aguardando resposta`,
      result: `${aiResponded} respostas da IA`,
      href: "/cliente/painel/inbox",
      icon: MessageSquare,
      tone: "success",
    },
    {
      id: "conversion",
      title: "Conversao",
      value: brl(paidRevenue),
      detail: `${qualifiedLeads} qualificados, ${meetings} reunioes`,
      result: `${wonLeads} vendas ganhas`,
      href: "/cliente/painel/crm",
      icon: Target,
      tone: "ai",
    },
    {
      id: "retention",
      title: "Retencao",
      value: String(followUpPending),
      detail: `${followUpToday} para hoje`,
      result: followUpOverdue ? `${followUpOverdue} atrasados` : "Base sob controle",
      href: "/cliente/painel/follow-ups",
      icon: CalendarDays,
      tone: "warning",
    },
  ];

  const mobileQuickActions = [
    {
      href: "/cliente/painel/inbox?status=pending",
      label: "Responder agora",
      detail: pendingChats ? `${pendingChats} aguardando` : "abrir fila",
      tone: "success" as const,
    },
    {
      href: "/cliente/painel/crm",
      label: "Mover oportunidades",
      detail: activeLeads ? `${activeLeads} em aberto` : "abrir carteira",
      tone: "info" as const,
    },
    {
      href: "/cliente/painel/agenda",
      label: "Ver agenda",
      detail: meetings ? `${meetings} compromisso(s)` : "sem reunioes",
      tone: "warning" as const,
    },
    {
      href: "/cliente/painel/perguntar-altum",
      label: "Perguntar a Altum",
      detail: "insights e prioridade",
      tone: "ai" as const,
    },
  ];

  const priorityActions = (() => {
    const items: PriorityItem[] = [];

    if (overdueChats > 0) {
      items.push({
        id: "sla",
        title: "Responder conversas fora do prazo",
        detail: `${overdueChats} conversa${overdueChats === 1 ? "" : "s"} pode perder venda agora.`,
        href: "/cliente/painel/inbox?queue=sla_breached",
        badge: "urgente",
        tone: "danger",
      });
    }

    if (pendingChats > 0) {
      items.push({
        id: "waiting",
        title: "Atender quem esta esperando",
        detail: `${pendingChats} conversa${pendingChats === 1 ? "" : "s"} aguardando humano ou IA.`,
        href: "/cliente/painel/inbox?queue=assigned_waiting",
        badge: "atender",
        tone: "warning",
      });
    }

    if (unassignedChats > 0) {
      items.push({
        id: "unassigned",
        title: "Distribuir conversas sem responsavel",
        detail: `${unassignedChats} contato${unassignedChats === 1 ? "" : "s"} sem dono comercial.`,
        href: "/cliente/painel/inbox?queue=unassigned",
        badge: "fila",
        tone: "warning",
      });
    }

    if (followUpOverdue > 0) {
      items.push({
        id: "followups",
        title: "Recuperar retornos atrasados",
        detail: `${followUpOverdue} retorno${followUpOverdue === 1 ? "" : "s"} parado no funil.`,
        href: "/cliente/painel/follow-ups",
        badge: "reter",
        tone: "warning",
      });
    }

    if (staleOpportunities.length > 0) {
      items.push({
        id: "stale",
        title: "Dar proxima acao para oportunidades",
        detail: `${staleOpportunities.length} cliente${staleOpportunities.length === 1 ? "" : "s"} ativo sem movimento recente.`,
        href: "/cliente/painel/crm",
        badge: "vender",
        tone: "info",
      });
    }

    if (campaigns.length === 0 && totalLeads > 0) {
      items.push({
        id: "attribution",
        title: "Organizar origem dos contatos",
        detail: "Existem leads, mas a campanha ainda nao aparece com clareza.",
        href: "/cliente/painel/configuracoes/canais",
        badge: "campanhas",
        tone: "info",
      });
    }

    const blocker = (readiness.blockers || [])[0];
    if (blocker) {
      items.push({
        id: `blocker-${blocker.id}`,
        title: blocker.title,
        detail: blocker.description,
        href: blocker.href,
        badge: "configurar",
        tone: blocker.tone,
      });
    }

    if (!items.length) {
      items.push({
        id: "ask",
        title: "Perguntar onde crescer primeiro",
        detail: "A operacao nao tem bloqueio critico agora. Use a Altum para decidir o proximo movimento.",
        href: "/cliente/painel/perguntar-altum",
        badge: "decidir",
        tone: "ai",
      });
    }

    return items.slice(0, 5);
  })();

  if (loading) {
    return (
      <div className="flex min-h-[64vh] items-center justify-center">
        <div className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-6 py-5 shadow-[var(--cliente-shadow-soft)]">
          <div className="flex items-center gap-3 text-sm font-semibold text-[var(--cliente-card-text)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-primary)]" />
            Carregando operacao comercial
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <PanelCard tone="danger" className="p-6">
        <CardTitle title="Inicio indisponivel" subtitle={error} />
        <div className="mt-4">
          <ClientActionButton tone="danger" onClick={() => void loadOverview()}>
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </ClientActionButton>
        </div>
      </PanelCard>
    );
  }

  return (
    <div className="dashboard-refined client-daily-page space-y-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] sm:pb-10">
      <section className="grid gap-3 sm:hidden">
        <PanelCard tone="spotlight" className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1 text-[11px] font-semibold text-white/88">
                  Hoje
                </span>
                <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1 text-[11px] font-semibold text-white/88">
                  {lastUpdatedLabel}
                </span>
              </div>
              <h1 className="mt-3 text-xl font-extrabold leading-tight text-white">{workspaceName}</h1>
              <p className="mt-2 text-sm leading-5 text-white/76">Operacao comercial com foco no que precisa acontecer agora.</p>
            </div>
            <ClientBadge label={priorityActions.length ? "agir" : "ok"} tone={priorityActions.length ? priorityActions[0]?.tone || "ai" : "success"} />
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[var(--cliente-card-text)]">Proxima acao</p>
              <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{priorityActions[0]?.detail}</p>
            </div>
            <ClientBadge label={priorityActions[0]?.badge || "agir"} tone={priorityActions[0]?.tone || "ai"} />
          </div>
          <p className="mt-3 text-lg font-extrabold leading-tight text-[var(--cliente-card-text)]">{priorityActions[0]?.title}</p>
          <Link
            href={priorityActions[0]?.href || "/cliente/painel/perguntar-altum"}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--cliente-primary-hover)]"
          >
            Resolver agora
            <ArrowRight className="h-4 w-4" />
          </Link>
        </PanelCard>
      </section>

      <section className="hidden gap-4 sm:grid xl:grid-cols-[1fr_360px]">
        <PanelCard tone="spotlight" className="p-4 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 md:gap-5">
            <div className="min-w-0 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1 text-xs font-semibold text-white/88">
                  Hoje em tempo real
                </span>
                <span className="rounded-full border border-white/18 bg-white/14 px-3 py-1 text-xs font-semibold text-white/88">
                  atualizado {lastUpdatedLabel}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-extrabold leading-tight text-white md:mt-4 md:text-[2.45rem]">
                {workspaceName}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-5 text-white/76 md:text-base">
                O que a operacao gastou, gerou, respondeu e vendeu hoje.
              </p>
            </div>

            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:w-[520px]">
              <HeroNumber label="Gasto" value={brl(spend)} />
              <HeroNumber label="Receita" value={brl(paidRevenue)} />
              <HeroNumber label="Campanhas" value={String(effectiveCampaignCount)} />
              <HeroNumber label="Conversas" value={String(activeChats)} />
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--cliente-card-text)]">Proxima acao</p>
                <ClientBadge label={priorityActions[0]?.badge || "decidir"} tone={priorityActions[0]?.tone || "ai"} />
              </div>
              <h2 className="mt-3 text-lg font-extrabold leading-tight text-[var(--cliente-card-text)]">{priorityActions[0]?.title}</h2>
              <p className="mt-2 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{priorityActions[0]?.detail}</p>
            </div>
            <Link
              href={priorityActions[0]?.href || "/cliente/painel/perguntar-altum"}
              className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-hover)]"
            >
              Resolver agora
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-3 sm:hidden">
        <PanelCard className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[var(--cliente-card-text)]">Trabalho do dia</p>
              <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">
                Atalhos para responder, vender, acompanhar e decidir sem navegar pelo painel inteiro.
              </p>
            </div>
            <ClientBadge label={priorityActions.length ? "agir" : "ok"} tone={priorityActions.length ? priorityActions[0]?.tone || "ai" : "success"} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {mobileQuickActions.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[18px] border p-3 transition ${
                  item.tone === "success"
                    ? "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)]"
                    : item.tone === "warning"
                      ? "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)]"
                      : item.tone === "ai"
                        ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,transparent)] bg-[var(--cliente-ai-soft)]"
                        : "border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,transparent)] bg-[var(--cliente-primary-soft)]"
                }`}
              >
                <p className="text-sm font-black text-[var(--cliente-card-text)]">{item.label}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.detail}</p>
              </Link>
            ))}
          </div>
        </PanelCard>
      </section>

      <section className="hidden gap-3 sm:grid md:grid-cols-2 xl:grid-cols-4">
        {liveMetrics.map((item) => (
          <LiveMetricCard key={item.label} item={item} />
        ))}
      </section>

      {showDesktopCharts ? (
        <section className="client-advanced-layer grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <PanelCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Crescimento por origem" subtitle="Leads, reunioes e vendas com leitura visual." />
              <Link href="/cliente/painel/campanhas" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Campanhas
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={campaignChartData} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--cliente-primary)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--cliente-primary)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--cliente-success)" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="var(--cliente-success)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="var(--cliente-primary)" strokeWidth={2.5} fill="url(#leadsGradient)" />
                  <Area type="monotone" dataKey="vendas" name="Vendas" stroke="var(--cliente-success)" strokeWidth={2.5} fill="url(#salesGradient)" />
                  <Area type="monotone" dataKey="reunioes" name="Reunioes" stroke="var(--cliente-ai)" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Funil em movimento" subtitle="Onde estao as oportunidades agora." />
              <Link href="/cliente/painel/pipeline" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Funil
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageChartData} margin={{ left: -18, right: 8, top: 10, bottom: 0 }}>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
                  <Bar dataKey="oportunidades" name="Oportunidades" radius={[8, 8, 0, 0]} fill="var(--cliente-primary)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </PanelCard>
        </section>
      ) : (
        <section className="client-advanced-layer grid gap-4 sm:hidden">
          <PanelCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <CardTitle title="Campanhas e impacto" subtitle="Leitura rapida para decidir sem abrir relatorio." />
              <Link href="/cliente/painel/campanhas" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Ver
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <TinyStat label="Campanhas" value={String(campaignCount || campaigns.length)} />
              <TinyStat label="CPL" value={cpl ? brl(cpl) : "Sem dado"} />
              <TinyStat label="Leads" value={String(totalLeads)} />
              <TinyStat label="Vendas" value={String(wonLeads)} />
            </div>
          </PanelCard>

          <PanelCard className="p-4">
            <div className="flex items-start justify-between gap-3">
              <CardTitle title="Funil agora" subtitle="Oportunidades em andamento no celular." />
              <Link href="/cliente/painel/pipeline" className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Abrir
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {stageChartData.slice(0, 4).map((item) => (
                <div key={item.name} className="flex items-center justify-between rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">{item.name}</p>
                  <ClientBadge label={String(item.oportunidades)} tone="info" />
                </div>
              ))}
            </div>
          </PanelCard>
        </section>
      )}

      <PanelCard className="client-advanced-layer p-4 md:hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[var(--cliente-card-text)]">Leitura rapida</p>
            <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">
              A agencia investiu {brl(spend)}, gerou {totalLeads} contato(s), a IA respondeu {aiResponded} vez(es), humanos assumiram {handoffs} conversa(s) e o negocio registrou {brl(paidRevenue)} em receita.
            </p>
          </div>
          <ClientBadge label={pilotReady ? "online" : "setup"} tone={pilotReady ? "success" : "warning"} />
        </div>
      </PanelCard>

      <section className="client-advanced-layer grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cycle.map((item) => (
          <CycleCard key={item.id} item={item} />
        ))}
      </section>

      <section className="client-overview-workspace grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="space-y-5">
          <PanelCard className="client-advanced-layer p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle title="Fila de dinheiro" subtitle="O que mexe no resultado antes do resto." />
              <ClientActionButton tone="secondary" onClick={() => void loadOverview({ silent: true })} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Atualizar
              </ClientActionButton>
            </div>
            <div className="mt-5 grid gap-3">
              {priorityActions.map((item) => (
                <PriorityRow key={item.id} item={item} />
              ))}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Campanhas e impacto" subtitle="Leads, reunioes e vendas por origem comercial." />
              <Link
                href="/cliente/painel/campanhas"
                className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]"
              >
                Ver campanhas
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
              <MetricCard label="Campanhas lidas" value={String(campaignCount || campaigns.length)} icon={LineChart} trend="Meta, Google, UTMs e formularios" tone="brand" />
              <MetricCard label="Custo por lead" value={cpl ? brl(cpl) : "Sem dado"} icon={MousePointerClick} trend={`${num(traffic.clicks)} cliques registrados`} tone="warning" />
              <MetricCard label="Conversao" value={pct(num(metrics.conversionRate))} icon={Target} trend={`${wonLeads} vendas ganhas`} tone="success" />
            </div>

            <div className="mt-5 space-y-2">
              {campaigns.length ? (
                campaigns.slice(0, 6).map((campaign) => <CampaignRow key={campaign.key} item={campaign} />)
              ) : (
                <ClientEmptyState
                  title="Campanhas ainda sem atribuicao"
                  description="Quando os contatos chegarem com UTM, Meta, Google ou formulario, o impacto aparece aqui."
                />
              )}
            </div>
          </PanelCard>

          <section className="grid gap-5 lg:grid-cols-3">
            <WorkPanel
              title="Conversas"
              subtitle={`${activeChats} ativas`}
              href="/cliente/painel/inbox"
              empty="Nenhuma conversa recente."
            >
              {recentChats.map((chat) => (
                <ChatRow key={chat.id} item={chat} />
              ))}
            </WorkPanel>

            <WorkPanel
              title="Oportunidades"
              subtitle={`${activeLeads} em aberto`}
              href="/cliente/painel/crm"
              empty="Nenhuma oportunidade ativa."
            >
              {topOpportunities.map((lead) => (
                <LeadRow key={lead.id} item={lead} />
              ))}
            </WorkPanel>

            <WorkPanel
              title="Agenda"
              subtitle={`${upcomingAppointments.length} proximas`}
              href="/cliente/painel/agenda"
              empty="Nenhum compromisso proximo."
            >
              {upcomingAppointments.map((appointment) => (
                <AppointmentRow key={appointment.id} item={appointment} />
              ))}
            </WorkPanel>
          </section>
        </div>

        <aside className="client-advanced-layer space-y-5 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="ai" className="p-5">
            <CardTitle title="IA em operacao" subtitle="Automacao trabalhando no atendimento e no funil." />
            <div className="mt-5 grid gap-3">
              <SignalRow label="Respostas da IA" value={String(aiResponded)} tone="ai" icon={Bot} />
              <SignalRow label="Escaladas para humano" value={String(handoffs)} tone={handoffs ? "warning" : "success"} icon={MessageSquare} />
              <SignalRow label="Automacoes ativas" value={String(num(automation.activeAutomations))} tone="info" icon={CheckCircle2} />
              <SignalRow label="Base de conhecimento" value={String(num(automation.kbDocs))} tone="ai" icon={Bot} />
            </div>
            <div className="mt-4 grid gap-2">
              <MiniLink href="/cliente/painel/ia" label="Ajustar Assistente Altum" />
              <MiniLink href="/cliente/painel/perguntar-altum" label="Perguntar sobre o negocio" />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Retencao e retornos" subtitle="Clientes que precisam voltar para o ciclo." />
            <div className="mt-4 grid gap-3">
              <SignalRow label="Retornos pendentes" value={String(followUpPending)} tone="warning" icon={CalendarDays} />
              <SignalRow label="Hoje" value={String(followUpToday)} tone="info" icon={Clock3} />
              <SignalRow label="Atrasados" value={String(followUpOverdue)} tone={followUpOverdue ? "danger" : "success"} icon={AlertTriangle} />
              <SignalRow label="Financeiro proximo" value={brl(num(finance.dueSoonTotal))} tone={num(finance.dueSoonCount) ? "warning" : "success"} icon={Wallet} />
            </div>
            <div className="mt-4 space-y-2">
              {pendingTasks.length ? (
                pendingTasks.map((task) => <FollowUpRow key={task.id} item={task} />)
              ) : (
                <p className="rounded-[16px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
                  Sem retorno pendente agora.
                </p>
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Saude da operacao" subtitle="Pronto para rodar sem depender de tecnico." />
            <div className="mt-4 rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-[var(--cliente-card-text)]">
                    {pilotReady ? "Pronta para crescer" : "Falta fechar a implantacao"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{readinessScore}% de prontidao</p>
                </div>
                <StateBadge label={pilotReady ? "ok" : "pendente"} tone={pilotReady ? "success" : "warning"} />
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--cliente-border)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--cliente-primary),var(--cliente-success))]"
                  style={{ width: `${Math.min(100, Math.max(0, readinessScore))}%` }}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              {!pilotReady ? <MiniLink href="/cliente/painel/onboarding" label={`Continuar implantacao (${num(readiness.onboarding?.progressPct)}%)`} /> : null}
              <MiniLink href="/cliente/painel/configuracoes/canais" label="Canais e pixels" />
              <MiniLink href="/cliente/painel/configuracoes/integracoes" label="Integracoes nativas" />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function HeroNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/14 bg-white/12 px-3 py-3">
      <p className="text-[11px] font-semibold text-white/68">{label}</p>
      <p className="mt-1.5 text-lg font-extrabold text-white">{value}</p>
    </div>
  );
}

function LiveMetricCard({ item }: { item: LiveMetricItem }) {
  const Icon = item.icon;
  const toneClasses = {
    brand: "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)] border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)]",
    success: "bg-[var(--cliente-success-soft)] text-[var(--cliente-success)] border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)]",
    ai: "bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)] border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)]",
    warning: "bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)] border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)]",
    info: "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)] border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)]",
  }[item.tone];

  return (
    <Link href={item.href} className="group">
      <PanelCard className="h-full p-4 transition group-hover:border-[var(--cliente-border-strong)] group-hover:bg-[var(--cliente-surface-hover)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-normal text-[var(--cliente-card-text-soft)]">{item.label}</p>
            <p className="mt-2 text-2xl font-black tracking-normal text-[var(--cliente-card-text)]">{item.value}</p>
          </div>
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClasses}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
        <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{item.detail}</p>
      </PanelCard>
    </Link>
  );
}

function CycleCard({ item }: { item: CycleItem }) {
  const Icon = item.icon;
  const toneClasses = {
    brand: "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] text-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)]",
    success: "border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)] text-[var(--cliente-success)] bg-[var(--cliente-success-soft)]",
    ai: "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] text-[var(--cliente-ai)] bg-[var(--cliente-ai-soft)]",
    warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] text-[var(--cliente-warning)] bg-[var(--cliente-warning-soft)]",
  }[item.tone];

  return (
    <Link href={item.href} className="group">
      <PanelCard className="h-full p-4 transition group-hover:border-[var(--cliente-border-strong)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--cliente-card-text-soft)]">{item.title}</p>
            <p className="mt-2 text-2xl font-extrabold text-[var(--cliente-card-text)]">{item.value}</p>
          </div>
          <span className={`rounded-[14px] border p-2.5 ${toneClasses}`}>
            <Icon className="h-4.5 w-4.5" />
          </span>
        </div>
        <p className="mt-3 text-sm font-semibold text-[var(--cliente-card-text)]">{item.detail}</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--cliente-card-text-soft)]">{item.result}</p>
          <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)] transition group-hover:text-[var(--cliente-primary)]" />
        </div>
      </PanelCard>
    </Link>
  );
}

function PriorityRow({ item }: { item: PriorityItem }) {
  return (
    <Link
      href={item.href}
      className="group rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3.5 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--cliente-card-text)]">{item.title}</p>
          <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">{item.detail}</p>
        </div>
        <ClientBadge label={item.badge} tone={item.tone} />
      </div>
    </Link>
  );
}

function CampaignRow({ item }: { item: AttributionGroup }) {
  const leads = num(item.lastTouchLeads) || num(item.firstTouchLeads);
  const won = num(item.wonLeads);
  const meetings = num(item.meetings);
  const spend = num(item.spend);

  return (
    <div className="rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.label || item.key || "Campanha sem nome"}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.source || "origem atribuida"}</p>
        </div>
        <StateBadge label={won ? "vendeu" : meetings ? "reuniao" : "leads"} tone={won ? "success" : meetings ? "info" : "neutral"} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TinyStat label="Gasto" value={brl(spend)} />
        <TinyStat label="Leads" value={String(leads)} />
        <TinyStat label="Reunioes" value={String(meetings)} />
        <TinyStat label="Vendas" value={String(won)} />
      </div>
    </div>
  );
}

function WorkPanel({
  title,
  subtitle,
  href,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  href: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <CardTitle title={title} subtitle={subtitle} />
        <Link href={href} className="rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 text-[var(--cliente-card-text-soft)] transition hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-primary)]">
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-4 space-y-2">
        {children.length ? children : <p className="rounded-[16px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text-soft)]">{empty}</p>}
      </div>
    </PanelCard>
  );
}

function ChatRow({ item }: { item: ChatItem }) {
  return (
    <Link href={`/cliente/painel/inbox?chatId=${encodeURIComponent(item.id)}`} className="block rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{chatName(item)}</p>
        <ClientBadge label={item.aiState?.aiEnabled === false ? "humano" : "IA"} tone={item.aiState?.aiEnabled === false ? "info" : "ai"} />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.channel || "canal"} - {relativeTime(item.updatedAt || item.lastMessageAt)}</p>
    </Link>
  );
}

function LeadRow({ item }: { item: LeadItem }) {
  const stage = normalizeStage(item.pipelineStage || item.stage);
  return (
    <Link href={`/cliente/painel/crm?leadId=${encodeURIComponent(item.id)}`} className="block rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{leadName(item)}</p>
        <ClientBadge label={num(item.score) ? `${num(item.score)} pts` : "lead"} tone="info" />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{getPipelineStageLabel(stage)} - {relativeTime(lastLeadActivity(item))}</p>
    </Link>
  );
}

function AppointmentRow({ item }: { item: AppointmentItem }) {
  return (
    <Link href="/cliente/painel/agenda" className="block rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.title || item.leadName || "Compromisso"}</p>
        <ClientBadge label={item.type || "agenda"} tone="info" />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(item.startAt)}{item.ownerName ? ` - ${item.ownerName}` : ""}</p>
    </Link>
  );
}

function FollowUpRow({ item }: { item: FollowUpItem }) {
  return (
    <Link href={item.leadId ? `/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}` : "/cliente/painel/follow-ups"} className="block rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{item.title || "Retorno"}</p>
        <ClientBadge label={item.overdue ? "atrasado" : item.dueToday ? "hoje" : "pendente"} tone={item.overdue ? "danger" : item.dueToday ? "info" : "warning"} />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.lead?.nome || "Contato"} - {formatDateTime(toDate(item.dueAt)?.toISOString())}</p>
    </Link>
  );
}

function SignalRow({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  tone: Tone;
  icon: typeof Bot;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 text-[var(--cliente-primary)]">
          <Icon className="h-4 w-4" />
        </span>
        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{label}</p>
      </div>
      <ClientBadge label={value} tone={tone} />
    </div>
  );
}

function TinyStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2">
      <p className="text-[10px] font-bold text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function MiniLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]">
      {label}
      <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
    </Link>
  );
}
