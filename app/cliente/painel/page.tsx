"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MessageSquare,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { motion, type Variants } from "framer-motion";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import {
  CardTitle,
  ClientBadge,
  ClientEmptyState,
  ClientPageHeader,
  MetricCard,
  PanelCard,
} from "@/app/cliente/painel/components/ui";
import { getPipelineStageLabel, normalizePipelineStageId } from "@/lib/pipeline";

type DashboardData = {
  contract?: {
    title?: string;
    status?: string;
    monthlyValue?: number;
    nextDueDate?: string;
  } | null;
  kpis?: {
    spend?: number;
    leads?: number;
    cpl?: number;
    paid?: number;
    pending?: number;
    budgets?: number;
  };
  finance?: Array<{
    id: string;
    descricao?: string;
    valor?: number;
    status?: string;
    createdAt?: unknown;
  }>;
  error?: string;
};

type LeadItem = {
  id: string;
  nome?: string;
  stage?: string;
  pipelineStage?: string;
  timeline?: Array<{
    id: string;
    title?: string;
    detail?: string;
    createdAt?: unknown;
  }>;
};

type ChatItem = {
  id: string;
  contactName?: string;
  channel?: string;
  aiState?: {
    aiEnabled?: boolean;
    pausedUntil?: unknown;
  } | null;
  updatedAt?: unknown;
};

type AiSettings = {
  enabled?: boolean;
  guardrails?: string[];
};

type KbDocList = {
  items?: Array<{ id: string }>;
};

type MetricsSummaryPayload = {
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    roi?: number;
    conversations?: number;
    totalLeads?: number;
  };
  ai?: {
    responded?: number;
    handoff?: number;
    avgConfidence?: number;
  };
  operations?: {
    activeChats?: number;
    overdueChats?: number;
    unassignedChats?: number;
    pendingChats?: number;
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
  blockers?: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
};

type FollowUpItem = {
  id: string;
  leadId: string;
  title: string;
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

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  createdAt: Date | null;
  href: string;
  tone: "info" | "warning" | "neutral";
};

type PriorityItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badge: string;
};

const FUNNEL_ORDER = ["captado", "contato", "qualificacao", "proposta", "fechamento", "ganho", "perdido"];

const SECTION_REVEAL: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
};

const STAGGER_REVEAL: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
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

function brl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Sem horário";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ymdToBr(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "sem data";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function normalizeStage(value?: string) {
  return normalizePipelineStageId(value || "captado");
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function getLastLeadActivity(lead: LeadItem) {
  const timelineDates = (lead.timeline || []).map((item) => toDate(item.createdAt)).filter(Boolean) as Date[];
  if (!timelineDates.length) return null;
  return timelineDates.sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function isActiveOpportunity(stage: string) {
  return stage !== "ganho" && stage !== "perdido";
}

export default function ClientePainelOverviewPage() {
  const { tenant } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const tenantId = tenant?.tenantId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [ai, setAi] = useState<AiSettings>({});
  const [kbCount, setKbCount] = useState(0);
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummaryPayload>({});
  const [automationSummary, setAutomationSummary] = useState<AutomationSummaryPayload>({});
  const [readiness, setReadiness] = useState<ReadinessPayload>({});
  const [followUps, setFollowUps] = useState<FollowUpsResponse>({});
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [snapshotNow, setSnapshotNow] = useState(0);

  useEffect(() => {
    setExperienceMode("essencial");
  }, [setExperienceMode]);

  const loadOverview = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!tenantId) return;

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const criticalRequests = await Promise.allSettled([
        authedFetch("/api/client-portal/dashboard").then(async (response) => ({ ok: response.ok, payload: (await response.json()) as DashboardData })),
        authedFetch(`/api/tenant/${tenantId}/chats`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { items?: ChatItem[] } })),
        authedFetch(`/api/tenant/${tenantId}/follow-ups`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as FollowUpsResponse })),
        authedFetch(`/api/tenant/${tenantId}/appointments`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { items?: AppointmentItem[] } })),
      ]);

      const [dashboardResult, chatsResult, followUpsResult, appointmentsResult] = criticalRequests;

      if (dashboardResult.status === "fulfilled") {
        if (dashboardResult.value.ok) {
          setDashboard(dashboardResult.value.payload);
        } else if (!silent) {
          setError(dashboardResult.value.payload.error || "Falha ao carregar o início.");
        }
      } else if (!silent) {
        setError("Falha ao carregar o início.");
      }

      if (chatsResult.status === "fulfilled" && chatsResult.value.ok) setChats(chatsResult.value.payload.items || []);
      if (followUpsResult.status === "fulfilled" && followUpsResult.value.ok) setFollowUps(followUpsResult.value.payload || {});
      if (appointmentsResult.status === "fulfilled" && appointmentsResult.value.ok) setAppointments(appointmentsResult.value.payload.items || []);

      setSnapshotNow(Date.now());
      if (!silent) setLoading(false);

      const detailRequests = await Promise.allSettled([
        authedFetch(`/api/tenant/${tenantId}/leads`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { items?: LeadItem[]; error?: string } })),
        authedFetch(`/api/tenant/${tenantId}/settings/ai`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as { ai?: AiSettings } })),
        authedFetch(`/api/tenant/${tenantId}/kb-docs`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as KbDocList })),
        authedFetch(`/api/tenant/${tenantId}/metrics-summary`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as MetricsSummaryPayload })),
        authedFetch(`/api/tenant/${tenantId}/automation-summary`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as AutomationSummaryPayload })),
        authedFetch(`/api/tenant/${tenantId}/readiness`).then(async (response) => ({ ok: response.ok, payload: (await response.json()) as ReadinessPayload })),
      ]);

      const [leadsResult, aiResult, kbResult, metricsResult, automationResult, readinessResult] = detailRequests;

      if (leadsResult.status === "fulfilled" && leadsResult.value.ok) setLeads(leadsResult.value.payload.items || []);
      if (aiResult.status === "fulfilled" && aiResult.value.ok) setAi(aiResult.value.payload.ai || {});
      if (kbResult.status === "fulfilled" && kbResult.value.ok) setKbCount((kbResult.value.payload.items || []).length);
      if (metricsResult.status === "fulfilled" && metricsResult.value.ok) setMetricsSummary(metricsResult.value.payload || {});
      if (automationResult.status === "fulfilled" && automationResult.value.ok) setAutomationSummary(automationResult.value.payload || {});
      if (readinessResult.status === "fulfilled" && readinessResult.value.ok) setReadiness(readinessResult.value.payload || {});

      setSnapshotNow(Date.now());
    },
    [tenantId]
  );

  useAdaptivePolling({
    enabled: Boolean(tenantId),
    onTick: () => void loadOverview({ silent: true }),
    fastIntervalMs: 90000,
    slowIntervalMs: 300000,
    runOnMount: false,
    source: "overview",
  });

  useEffect(() => {
    if (!tenantId) return;
    void loadOverview();
  }, [loadOverview, tenantId]);

  const kpis = dashboard?.kpis;
  const metricKpis = metricsSummary.metrics || {};
  const aiMetrics = metricsSummary.ai || {};
  const operationMetrics = metricsSummary.operations || {};
  const automationMetrics = automationSummary.summary || {};
  const financeMetrics = automationMetrics.finance || {};
  const followUpSummary = followUps.summary || {};
  const greeting = getGreeting();
  const workspaceName = tenant?.tenantName || tenant?.clientName || "sua operação";
  const pilotReady = readiness.summary?.pilotReady === true;
  const readinessScore = Number(readiness.summary?.readinessScore || 0);

  const activeLeads = useMemo(
    () => leads.filter((lead) => isActiveOpportunity(normalizeStage(lead.pipelineStage || lead.stage))).length,
    [leads]
  );

  const newLeads = useMemo(() => {
    const sevenDaysAgo = snapshotNow - 7 * 24 * 60 * 60 * 1000;
    return leads.filter((lead) => {
      const lastActivity = getLastLeadActivity(lead);
      if (lastActivity) return lastActivity.getTime() >= sevenDaysAgo;
      return normalizeStage(lead.pipelineStage || lead.stage) === "captado";
    }).length;
  }, [leads, snapshotNow]);

  const stalledOpportunities = useMemo(() => {
    const sevenDaysAgo = snapshotNow - 7 * 24 * 60 * 60 * 1000;
    return leads.filter((lead) => {
      const stage = normalizeStage(lead.pipelineStage || lead.stage);
      if (!isActiveOpportunity(stage) || stage === "captado") return false;
      const lastActivity = getLastLeadActivity(lead);
      return !lastActivity || lastActivity.getTime() < sevenDaysAgo;
    }).length;
  }, [leads, snapshotNow]);

  const waitingConversations = Number(
    automationMetrics.waitingReplyBacklog || operationMetrics.pendingChats || operationMetrics.activeChats || chats.length || 0
  );
  const overdueConversations = Number(automationMetrics.slaBreached || operationMetrics.overdueChats || 0);
  const unassignedConversations = Number(operationMetrics.unassignedChats || 0);
  const overdueTasks = Number(followUpSummary.overdue || 0);
  const dueTodayTasks = Number(followUpSummary.dueToday || 0);
  const openProposals = Math.max(Number(kpis?.budgets || 0), Number(followUpSummary.proposal || 0));

  const aiPausedChats = useMemo(() => {
    return chats.filter((chat) => {
      if (!chat.aiState) return false;
      if (chat.aiState.aiEnabled === false) return true;
      const pausedUntil = toDate(chat.aiState.pausedUntil);
      return Boolean(pausedUntil && pausedUntil.getTime() > snapshotNow);
    }).length;
  }, [chats, snapshotNow]);

  const funnel = useMemo(() => {
    const base = new Map(FUNNEL_ORDER.map((stage) => [stage, 0]));

    for (const lead of leads) {
      const stage = normalizeStage(lead.pipelineStage || lead.stage);
      base.set(stage, (base.get(stage) || 0) + 1);
    }

    const total = Math.max(activeLeads, 1);
    return FUNNEL_ORDER.filter((stage) => stage !== "perdido").map((stage) => {
      const totalStage = base.get(stage) || 0;
      return {
        stage,
        total: totalStage,
        pct: Math.round((totalStage / total) * 100),
      };
    });
  }, [activeLeads, leads]);

  const priorityItems = useMemo<PriorityItem[]>(() => {
    const items: PriorityItem[] = [];

    if (overdueConversations > 0) {
      items.push({
        id: "reply-now",
        title: "Responder conversas em risco",
        description: `${overdueConversations} conversa(s) podem perder timing de atendimento.`,
        href: "/cliente/painel/inbox?queue=sla_breached",
        tone: "danger",
        badge: "urgente",
      });
    }

    if (unassignedConversations > 0) {
      items.push({
        id: "assign-owner",
        title: "Assumir conversas sem responsável",
        description: `${unassignedConversations} conversa(s) ainda estão sem dono definido.`,
        href: "/cliente/painel/inbox?queue=unassigned",
        tone: "warning",
        badge: "fila",
      });
    }

    if (overdueTasks > 0) {
      items.push({
        id: "overdue-tasks",
        title: "Revisar tarefas vencidas",
        description: `${overdueTasks} follow-up(s) estão vencidos e precisam de ação.`,
        href: "/cliente/painel/follow-ups?status=pending",
        tone: "warning",
        badge: "agenda",
      });
    }

    if (stalledOpportunities > 0) {
      items.push({
        id: "stalled-opportunities",
        title: "Retomar oportunidades paradas",
        description: `${stalledOpportunities} oportunidade(s) estão sem avançar há mais de 7 dias.`,
        href: "/cliente/painel/crm",
        tone: "info",
        badge: "pipeline",
      });
    }

    if (openProposals > 0) {
      items.push({
        id: "open-proposals",
        title: "Acompanhar propostas abertas",
        description: `${openProposals} proposta(s) precisam de retorno comercial.`,
        href: "/cliente/painel/comercial",
        tone: "info",
        badge: "propostas",
      });
    }

    if (!pilotReady && readiness.blockers?.[0]) {
      items.push({
        id: `readiness-${readiness.blockers[0].id}`,
        title: readiness.blockers[0].title,
        description: readiness.blockers[0].description,
        href: readiness.blockers[0].href,
        tone: readiness.blockers[0].tone,
        badge: "implantação",
      });
    }

    if (ai.enabled === false || kbCount === 0) {
      items.push({
        id: "assistant-setup",
        title: ai.enabled === false ? "Ativar Assistente Altum" : "Completar base de conhecimento",
        description:
          ai.enabled === false
            ? "A IA está desativada e pode deixar o atendimento mais manual."
            : "Adicione contexto comercial para melhorar respostas e transferências.",
        href: "/cliente/painel/ia",
        tone: ai.enabled === false ? "warning" : "info",
        badge: "ia",
      });
    }

    return items.slice(0, 6);
  }, [ai.enabled, kbCount, openProposals, overdueConversations, overdueTasks, pilotReady, readiness.blockers, stalledOpportunities, unassignedConversations]);

  const nextAppointments = useMemo(() => {
    return appointments
      .filter((item) => {
        if (!item.startAt) return false;
        const date = new Date(item.startAt);
        if (Number.isNaN(date.getTime())) return false;
        return date.getTime() >= snapshotNow && item.status !== "canceled" && item.status !== "completed";
      })
      .sort((a, b) => new Date(a.startAt || "").getTime() - new Date(b.startAt || "").getTime())
      .slice(0, 4);
  }, [appointments, snapshotNow]);

  const todayTasks = useMemo(() => {
    return (followUps.items || [])
      .filter((item) => item.status !== "done" && (item.overdue || item.dueToday))
      .sort((a, b) => {
        const aTime = toDate(a.dueAt)?.getTime() || 0;
        const bTime = toDate(b.dueAt)?.getTime() || 0;
        return aTime - bTime;
      })
      .slice(0, 4);
  }, [followUps.items]);

  const activities = useMemo<ActivityItem[]>(() => {
    const leadActivities = leads
      .flatMap((lead) =>
        (lead.timeline || []).map((event) => ({
          id: `${lead.id}-${event.id}`,
          title: event.title || "Atualização de oportunidade",
          detail: `${lead.nome || "Contato"} - ${event.detail || getPipelineStageLabel(lead.pipelineStage || lead.stage || "captado")}`,
          createdAt: toDate(event.createdAt),
          href: `/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`,
          tone: "info" as const,
        }))
      )
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));

    const financeActivities = (dashboard?.finance || []).map((item) => ({
      id: item.id,
      title: item.descricao || "Atualização financeira",
      detail: `${String(item.status || "pendente")} - ${brl(Number(item.valor || 0))}`,
      createdAt: toDate(item.createdAt),
      href: "/cliente/painel/comercial",
      tone: "neutral" as const,
    }));

    return [...leadActivities, ...financeActivities]
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 5);
  }, [dashboard?.finance, leads]);

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <div className="rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--cliente-primary)]" />
        </div>
      </div>
    );
  }

  if (!dashboard || error) {
    return <ClientEmptyState title="Não foi possível carregar o início" description={error || "Tente novamente em alguns segundos."} />;
  }

  return (
    <div className="client-daily-page space-y-5 sm:space-y-6">
      <ClientPageHeader
        title="Início"
        subtitle={`${greeting}. Aqui estão as prioridades da ${workspaceName} para hoje.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ClientBadge label={pilotReady ? "Operação pronta" : `Implantação ${readinessScore}%`} tone={pilotReady ? "success" : "warning"} />
            <ClientBadge label={ai.enabled === false ? "Assistente em revisão" : "Assistente ativo"} tone={ai.enabled === false ? "warning" : "ai"} />
          </div>
        }
      />

      {Number(financeMetrics.dueSoonCount || 0) > 0 ? (
        <FinanceAlert financeMetrics={financeMetrics} />
      ) : null}

      <motion.section variants={STAGGER_REVEAL} initial="hidden" animate="show" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <motion.div variants={SECTION_REVEAL}>
          <OverviewHero
            waitingConversations={waitingConversations}
            activeLeads={activeLeads}
            overdueTasks={overdueTasks}
            openProposals={openProposals}
          />
        </motion.div>

        <motion.div variants={SECTION_REVEAL}>
          <PriorityPanel priorityItems={priorityItems} />
        </motion.div>
      </motion.section>

      <motion.section variants={STAGGER_REVEAL} initial="hidden" animate="show" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiLink href="/cliente/painel/inbox?queue=assigned_waiting">
          <MetricCard label="Conversas aguardando" value={String(waitingConversations)} icon={MessageSquare} trend={`${unassignedConversations} sem responsável`} tone="success" />
        </KpiLink>
        <KpiLink href="/cliente/painel/crm">
          <MetricCard label="Leads ativos" value={String(activeLeads)} icon={Target} trend={`${newLeads} novos nos últimos dias`} tone="brand" />
        </KpiLink>
        <KpiLink href="/cliente/painel/crm">
          <MetricCard label="Oportunidades paradas" value={String(stalledOpportunities)} icon={Clock3} trend="sem avançar há mais de 7 dias" tone="warning" />
        </KpiLink>
        <KpiLink href="/cliente/painel/follow-ups?status=pending">
          <MetricCard label="Tarefas vencidas" value={String(overdueTasks)} icon={CheckCircle2} trend={`${dueTodayTasks} para hoje`} tone="warning" />
        </KpiLink>
        <KpiLink href="/cliente/painel/comercial">
          <MetricCard label="Propostas abertas" value={String(openProposals)} icon={FileText} trend={`Receita pendente ${brl(Number(kpis?.pending || 0))}`} tone="ai" />
        </KpiLink>
      </motion.section>

      <motion.section variants={STAGGER_REVEAL} initial="hidden" animate="show" className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <motion.div variants={SECTION_REVEAL}>
          <DailyWorkPanel nextAppointments={nextAppointments} todayTasks={todayTasks} />
        </motion.div>

        <motion.div variants={SECTION_REVEAL}>
          <FunnelPanel funnel={funnel} />
        </motion.div>
      </motion.section>

      <motion.section variants={STAGGER_REVEAL} initial="hidden" animate="show" className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <motion.div variants={SECTION_REVEAL}>
          <AltumInsightsPanel
            aiEnabled={ai.enabled}
            aiMetrics={aiMetrics}
            automationMetrics={automationMetrics}
            aiPausedChats={aiPausedChats}
            kbCount={kbCount}
            guardrailsCount={ai.guardrails?.length || 0}
            pilotReady={pilotReady}
            readinessScore={readinessScore}
          />
        </motion.div>

        <motion.div variants={SECTION_REVEAL}>
          <PerformancePanel
            metricKpis={metricKpis}
            kpis={kpis}
            dashboard={dashboard}
            newLeads={newLeads}
            waitingConversations={waitingConversations}
            activities={activities}
            experienceMode={experienceMode}
          />
        </motion.div>
      </motion.section>
    </div>
  );
}

function FinanceAlert({ financeMetrics }: { financeMetrics: NonNullable<AutomationSummaryPayload["summary"]>["finance"] }) {
  return (
    <Link
      href="/cliente/painel/comercial?financeStatus=pendente"
      prefetch={false}
      className="block rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-warning)_24%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-warning)_12%,white),white_74%)] p-4 shadow-[0_16px_34px_-24px_rgba(249,115,22,0.24)] transition hover:-translate-y-0.5 hover:brightness-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-warning)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Pendências financeiras próximas do vencimento</p>
        <ClientBadge label="financeiro" tone="warning" />
      </div>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">
        {Number(financeMetrics?.dueSoonCount || 0)} cobrança(s) vencem em breve, somando {brl(Number(financeMetrics?.dueSoonTotal || 0))}.
      </p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Próximo vencimento: {ymdToBr(financeMetrics?.nextDueDate)}</p>
    </Link>
  );
}

function OverviewHero({
  waitingConversations,
  activeLeads,
  overdueTasks,
  openProposals,
}: {
  waitingConversations: number;
  activeLeads: number;
  overdueTasks: number;
  openProposals: number;
}) {
  return (
    <PanelCard tone="spotlight" className="overflow-hidden p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/84 sm:text-[11px] sm:tracking-[0.18em]">
            <Sparkles className="h-3.5 w-3.5" />
            Prioridades de hoje
          </div>
          <h2 className="mt-3 text-[1.55rem] font-semibold tracking-[-0.03em] text-white sm:mt-4 sm:text-[1.9rem] md:text-[2.35rem]">
            Atenda rápido, mova oportunidades e não perca follow-ups.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/74 sm:mt-3">
            A visão inicial agora foca no que muda o dia: responder clientes, destravar oportunidades, revisar agenda e acompanhar propostas.
          </p>
        </div>

        <div className="grid w-full gap-2 sm:min-w-[260px] sm:grid-cols-2 sm:gap-3 xl:w-[320px]">
          <HeroStat label="Conversas aguardando" value={String(waitingConversations)} />
          <HeroStat label="Leads ativos" value={String(activeLeads)} />
          <HeroStat label="Tarefas vencidas" value={String(overdueTasks)} />
          <HeroStat label="Propostas abertas" value={String(openProposals)} />
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:mt-5 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
        <QuickLink href="/cliente/painel/inbox" title="Abrir conversas" description="Responder clientes e puxar o atendimento para frente." icon={MessageSquare} tone="success" />
        <QuickLink href="/cliente/painel/crm" title="Ver oportunidades" description="Listar contatos, contextos e próximos passos comerciais." icon={Target} tone="brand" />
        <QuickLink href="/cliente/painel/agenda" title="Revisar agenda" description="Conferir compromissos, follow-ups e vencimentos." icon={CalendarClock} tone="warning" />
        <QuickLink href="/cliente/painel/ia" title="Assistente Altum" description="Ajustar comportamento, conhecimento e automações." icon={Bot} tone="ai" />
      </div>
    </PanelCard>
  );
}

function PriorityPanel({ priorityItems }: { priorityItems: PriorityItem[] }) {
  return (
    <PanelCard tone="brand" className="h-full p-5">
      <CardTitle title="Ações recomendadas" subtitle="Leitura curta para decidir o próximo passo" />
      <div className="mt-4 space-y-3">
        {priorityItems.length === 0 ? (
          <ClientEmptyState title="Tudo sob controle por agora" description="Sem alertas críticos no momento. Você pode seguir para conversas, agenda ou relatórios." />
        ) : (
          priorityItems.map((item) => <PriorityRow key={item.id} item={item} />)
        )}
      </div>
    </PanelCard>
  );
}

function KpiLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} prefetch={false} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)] focus-visible:ring-offset-2">
      <motion.div variants={SECTION_REVEAL}>{children}</motion.div>
    </Link>
  );
}

function DailyWorkPanel({ nextAppointments, todayTasks }: { nextAppointments: AppointmentItem[]; todayTasks: FollowUpItem[] }) {
  return (
    <PanelCard className="p-5">
      <CardTitle title="Agenda e follow-ups" subtitle="O que vence agora e o que já está marcado" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <SectionEyebrow>Próximos compromissos</SectionEyebrow>
          <div className="mt-3 space-y-2">
            {nextAppointments.length === 0 ? (
              <EmptySlot text="Nenhum compromisso futuro encontrado." />
            ) : (
              nextAppointments.map((item) => <AppointmentCard key={item.id} item={item} />)
            )}
          </div>
        </div>

        <div>
          <SectionEyebrow>Tarefas para agir</SectionEyebrow>
          <div className="mt-3 space-y-2">
            {todayTasks.length === 0 ? (
              <EmptySlot text="Nenhum follow-up vencido ou para hoje." />
            ) : (
              todayTasks.map((item) => <TaskCard key={item.id} item={item} />)
            )}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

function FunnelPanel({ funnel }: { funnel: Array<{ stage: string; total: number; pct: number }> }) {
  return (
    <PanelCard tone="brand" className="h-full p-5">
      <CardTitle title="Clientes & oportunidades" subtitle="Mesmo dado, com foco em avançar negócio" />
      <div className="mt-4 space-y-3">
        {funnel.map((item) => (
          <Link
            key={item.stage}
            href={`/cliente/painel/crm?stage=${encodeURIComponent(item.stage)}`}
            prefetch={false}
            className="block rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)]"
          >
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[var(--cliente-card-text)]">{getPipelineStageLabel(item.stage)}</span>
              <span className="text-[var(--cliente-card-text-soft)]">{item.total} oportunidade(s)</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-[var(--cliente-border)]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,var(--cliente-primary),var(--cliente-primary-hover))]"
                style={{ width: `${Math.max(item.pct, item.total > 0 ? 8 : 0)}%` }}
              />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <MiniPanelLink href="/cliente/painel/pipeline" label="Kanban" value="Mover etapas e encontrar gargalos" />
        <MiniPanelLink href="/cliente/painel/comercial" label="Propostas" value="Acompanhar valores e status comercial" />
      </div>
    </PanelCard>
  );
}

function AltumInsightsPanel({
  aiEnabled,
  aiMetrics,
  automationMetrics,
  aiPausedChats,
  kbCount,
  guardrailsCount,
  pilotReady,
  readinessScore,
}: {
  aiEnabled?: boolean;
  aiMetrics: NonNullable<MetricsSummaryPayload["ai"]>;
  automationMetrics: NonNullable<AutomationSummaryPayload["summary"]>;
  aiPausedChats: number;
  kbCount: number;
  guardrailsCount: number;
  pilotReady: boolean;
  readinessScore: number;
}) {
  return (
    <PanelCard tone="ai" className="p-5">
      <CardTitle title="Insights da Altum" subtitle="Como o assistente ajuda no atendimento e nas vendas" />
      <div className="mt-4 space-y-3">
        <InsightRow
          label="Respostas automáticas"
          value={String(aiMetrics.responded || 0)}
          detail={aiEnabled === false ? "Assistente desativado no momento" : "Conversas atendidas com apoio da IA"}
          tone={aiEnabled === false ? "warning" : "ai"}
        />
        <InsightRow
          label="Confiança média"
          value={Number(aiMetrics.avgConfidence || 0).toFixed(2)}
          detail={`${automationMetrics.guardrails || guardrailsCount} regras da IA e ${automationMetrics.kbDocs || kbCount} itens de conhecimento`}
          tone="ai"
        />
        <InsightRow
          label="Conversas humanas"
          value={String(automationMetrics.pausedConversations || aiPausedChats)}
          detail="Atendimentos em que o time assumiu o contexto"
          tone="info"
        />
        <InsightRow
          label="Automações ativas"
          value={String(automationMetrics.activeAutomations || 0)}
          detail={pilotReady ? "Operação pronta para escalar" : `Implantação em ${readinessScore}%`}
          tone={pilotReady ? "success" : "warning"}
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <MiniPanelLink href="/cliente/painel/ia" label="Assistente Altum" value="Ajustar comportamento e conhecimento" />
        <MiniPanelLink href="/cliente/painel/automacoes" label="Automações" value="Revisar fluxos, esperas e retomadas" />
      </div>
    </PanelCard>
  );
}

function PerformancePanel({
  metricKpis,
  kpis,
  dashboard,
  newLeads,
  waitingConversations,
  activities,
  experienceMode,
}: {
  metricKpis: NonNullable<MetricsSummaryPayload["metrics"]>;
  kpis?: DashboardData["kpis"];
  dashboard: DashboardData;
  newLeads: number;
  waitingConversations: number;
  activities: ActivityItem[];
  experienceMode: string;
}) {
  return (
    <PanelCard className="p-5">
      <CardTitle title="Resumo de desempenho" subtitle="Performance suficiente para decidir rápido" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard label="Conversão" value={pct(Number(metricKpis.conversionRate || 0))} icon={TrendingUp} trend={`${newLeads} leads novos`} tone="brand" />
        <MetricCard label="Tempo de 1ª resposta" value={`${Number(metricKpis.avgFirstResponseMinutes || 0).toFixed(1)} min`} icon={Clock3} trend={`${waitingConversations} aguardando`} tone="success" />
        <MetricCard label="Investimento" value={brl(Number(kpis?.spend || 0))} icon={Wallet} trend={`CPL ${brl(Number(kpis?.cpl || 0))}`} tone="warning" />
        <MetricCard label="Receita recebida" value={brl(Number(kpis?.paid || 0))} icon={FileText} trend={`Contrato ${dashboard.contract?.status || "ativo"}`} tone="ai" />
      </div>

      {experienceMode === "completo" ? (
        <div className="mt-5 space-y-2">
          <SectionEyebrow>Mais detalhes</SectionEyebrow>
          {activities.length === 0 ? (
            <EmptySlot text="Sem eventos recentes para exibir." />
          ) : (
            activities.map((item) => <ActivityCard key={item.id} item={item} />)
          )}
        </div>
      ) : null}
    </PanelCard>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-white/14 bg-white/12 px-3 py-2.5 backdrop-blur-sm sm:rounded-[22px] sm:px-4 sm:py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/68 sm:text-[11px] sm:tracking-[0.14em]">{label}</p>
      <p className="mt-1 text-[1.2rem] font-semibold tracking-[-0.03em] text-white sm:mt-2 sm:text-[1.42rem]">{value}</p>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
  icon: Icon,
  tone,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof MessageSquare;
  tone: "brand" | "ai" | "success" | "warning";
}) {
  const toneClasses = {
    brand: "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-primary)_8%,white),white_72%)]",
    ai: "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-ai)_8%,white),white_72%)]",
    success: "border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-success)_8%,white),white_72%)]",
    warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-warning)_8%,white),white_72%)]",
  }[tone];
  const iconClasses = {
    brand: "border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
    ai: "border-[color:color-mix(in_srgb,var(--cliente-ai)_16%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
    success: "border-[color:color-mix(in_srgb,var(--cliente-success)_16%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
    warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_16%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]",
  }[tone];

  return (
    <Link
      href={href}
      prefetch={false}
      className={`group rounded-[20px] border p-3 shadow-[0_18px_34px_-30px_rgba(15,23,42,0.24)] transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)] sm:rounded-[24px] sm:p-4 ${toneClasses}`}
    >
      <div className={`inline-flex rounded-[14px] border p-2 shadow-[0_12px_24px_-18px_var(--cliente-primary-glow)] sm:rounded-[16px] sm:p-2.5 ${iconClasses}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 sm:mt-4">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)] transition group-hover:text-[var(--cliente-primary)]" />
      </div>
      <p className="mt-1.5 text-sm leading-5 text-[var(--cliente-card-text-soft)] sm:mt-2 sm:leading-6">{description}</p>
    </Link>
  );
}

function PriorityRow({ item }: { item: PriorityItem }) {
  const toneClasses = {
    neutral: "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]",
    success: "border-[color:color-mix(in_srgb,var(--cliente-success)_16%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-success)_7%,white),white_78%)]",
    warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-warning)_8%,white),white_78%)]",
    danger: "border-[color:color-mix(in_srgb,var(--cliente-danger)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-danger)_8%,white),white_80%)]",
    info: "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--cliente-primary)_8%,white),white_78%)]",
  }[item.tone];

  return (
    <Link
      href={item.href}
      prefetch={false}
      className={`block rounded-[22px] border px-4 py-4 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)] ${toneClasses}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
        <ClientBadge label={item.badge} tone={item.tone} />
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-soft)]">{item.description}</p>
    </Link>
  );
}

function AppointmentCard({ item }: { item: AppointmentItem }) {
  return (
    <Link
      href="/cliente/painel/agenda"
      prefetch={false}
      className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.title || item.leadName || "Compromisso"}</p>
        <ClientBadge label={item.type || "agenda"} tone="info" />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
        {formatDateTime(item.startAt)}
        {item.ownerName ? ` - ${item.ownerName}` : ""}
      </p>
    </Link>
  );
}

function TaskCard({ item }: { item: FollowUpItem }) {
  return (
    <Link
      href={item.leadId ? `/cliente/painel/crm?leadId=${encodeURIComponent(item.leadId)}` : "/cliente/painel/follow-ups"}
      prefetch={false}
      className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.title}</p>
        <ClientBadge label={item.overdue ? "vencida" : "hoje"} tone={item.overdue ? "warning" : "info"} />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
        {(item.lead?.nome || "Contato sem nome")} - {item.lead?.pipelineStage ? getPipelineStageLabel(item.lead.pipelineStage) : "sem etapa"}
      </p>
    </Link>
  );
}

function ActivityCard({ item }: { item: ActivityItem }) {
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)]"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.title}</p>
        <ClientBadge label={item.tone === "warning" ? "atenção" : item.tone === "neutral" ? "comercial" : "crm"} tone={item.tone} />
      </div>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{item.detail}</p>
      <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">
        {item.createdAt ? item.createdAt.toLocaleString("pt-BR") : "sem data"}
      </p>
    </Link>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">{children}</p>;
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-4 text-sm text-[var(--cliente-card-text-soft)]">
      {text}
    </div>
  );
}

function MiniPanelLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="rounded-[20px] border border-[var(--cliente-border)] bg-[linear-gradient(180deg,var(--cliente-card),var(--cliente-surface-muted))] px-4 py-3 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.18)] transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cliente-primary)]"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{value}</p>
    </Link>
  );
}

function InsightRow({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "info" | "ai";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[22px] border border-[var(--cliente-border)] bg-[linear-gradient(180deg,var(--cliente-card),var(--cliente-surface-muted))] px-4 py-3 shadow-[0_16px_30px_-28px_rgba(15,23,42,0.18)]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold tracking-[-0.03em] text-[var(--cliente-card-text)]">{value}</p>
        <div className="mt-1 flex justify-end">
          <ClientBadge label={tone === "ai" ? "altum" : tone === "warning" ? "atenção" : tone === "success" ? "ok" : "ativo"} tone={tone} />
        </div>
      </div>
    </div>
  );
}
