"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  ChartColumn,
  Clock3,
  Funnel,
  Handshake,
  Loader2,
  Megaphone,
  MessageSquare,
  Settings2,
  Sparkles,
  Wallet,
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
import { getPipelineStageLabel, normalizePipelineStageId } from "@/lib/pipeline";

type DashboardData = {
  contract?: {
    title?: string;
    status?: string;
    monthlyValue?: number;
    dueDay?: number;
    nextDueDate?: string;
  } | null;
  kpis?: {
    impressions?: number;
    clicks?: number;
    spend?: number;
    leads?: number;
    ctr?: number;
    cpc?: number;
    cpl?: number;
    paid?: number;
    pending?: number;
    projects?: number;
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
  status?: string;
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

type ActivityItem = {
  id: string;
  source: "finance" | "lead";
  title: string;
  detail: string;
  createdAt: Date | null;
  href: string;
};

type MetricsSummaryPayload = {
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    roi?: number;
    growth?: number;
    conversations?: number;
    handoffChats?: number;
    siteChatConversations?: number;
    wonLeads?: number;
    totalLeads?: number;
    paidRevenue?: number;
  };
  ai?: {
    responded?: number;
    askMore?: number;
    handoff?: number;
    skipped?: number;
    avgConfidence?: number;
    avgLatencyMs?: number;
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
    aiBreakdown?: {
      active?: number;
      paused?: number;
      humanOwned?: number;
    };
    channelOperations?: Array<{
      channel: string;
      activeChats: number;
      overdueChats: number;
      unassignedChats: number;
      handoffChats: number;
    }>;
    teamPerformance?: Array<{
      ownerId: string;
      ownerName: string;
      activeChats: number;
      overdueChats: number;
      pendingChats: number;
      handoffChats: number;
      totalLeads: number;
      wonLeads: number;
      winRate: number;
    }>;
  };
  comparisons?: {
    leadsDeltaPct?: number;
    conversionDeltaPct?: number;
    roiDeltaPct?: number;
    spendDeltaPct?: number;
  };
};

type AutomationSummaryPayload = {
  summary?: {
    activeAutomations?: number;
    monitoredConversations?: number;
    pausedConversations?: number;
    kbDocs?: number;
    guardrails?: number;
    aiEnabled?: boolean;
    waitingReplyBacklog?: number;
    slaBreached?: number;
    queue?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
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
    badge: string;
    tone: "neutral" | "success" | "warning" | "danger" | "info";
  }>;
};

type PriorityAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badge: string;
};

const FUNNEL_ORDER = [
  "captado",
  "contato",
  "qualificacao",
  "proposta",
  "fechamento",
  "ganho",
  "perdido",
];

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
  return `${Number(value || 0).toFixed(2)}%`;
}

function normalizeStage(value?: string) {
  return normalizePipelineStageId(value || "captado");
}

function formatChannelLabel(channel?: string) {
  if (channel === "site_chat") return "Site chat";
  if (channel === "site_form") return "Site form";
  if (channel === "meta_ads") return "Meta Ads";
  if (channel === "google_ads") return "Google Ads";
  if (!channel) return "WhatsApp";
  return channel.replaceAll("_", " ");
}

export default function ClientePainelOverviewPage() {
  const { tenant } = useClienteTenant();
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

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [dashboardRes, leadsRes, chatsRes, aiRes, kbRes, metricsRes, automationRes, readinessRes] = await Promise.all([
          authedFetch("/api/client-portal/dashboard"),
          authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
          authedFetch(`/api/tenant/${tenant.tenantId}/chats`),
          authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`),
          authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
          authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary`),
          authedFetch(`/api/tenant/${tenant.tenantId}/automation-summary`),
          authedFetch(`/api/tenant/${tenant.tenantId}/readiness`),
        ]);

        const dashboardPayload = (await dashboardRes.json()) as DashboardData;
        const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
        const chatsPayload = (await chatsRes.json()) as { items?: ChatItem[]; error?: string };
        const aiPayload = (await aiRes.json()) as { ai?: AiSettings; error?: string };
        const kbPayload = (await kbRes.json()) as KbDocList;
        const metricsPayload = (await metricsRes.json()) as MetricsSummaryPayload;
        const automationPayload = (await automationRes.json()) as AutomationSummaryPayload;
        const readinessPayload = (await readinessRes.json()) as ReadinessPayload;

        if (!mounted) return;

        if (!dashboardRes.ok) {
          setError(dashboardPayload.error || "Falha ao carregar dashboard.");
        } else {
          setDashboard(dashboardPayload);
        }

        if (leadsRes.ok) setLeads(leadsPayload.items || []);
        if (chatsRes.ok) setChats(chatsPayload.items || []);
        if (aiRes.ok) setAi(aiPayload.ai || {});
        if (kbRes.ok) setKbCount((kbPayload.items || []).length);
        if (metricsRes.ok) setMetricsSummary(metricsPayload || {});
        if (automationRes.ok) setAutomationSummary(automationPayload || {});
        if (readinessRes.ok) setReadiness(readinessPayload || {});
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar dados do dashboard.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId]);

  const kpis = dashboard?.kpis;

  const funnel = useMemo(() => {
    const base = new Map(FUNNEL_ORDER.map((stage) => [stage, 0]));

    for (const lead of leads) {
      const stage = normalizeStage(lead.pipelineStage || lead.stage);
      base.set(stage, (base.get(stage) || 0) + 1);
    }

    const total = leads.length || 1;

    return FUNNEL_ORDER.map((stage) => {
      const totalStage = base.get(stage) || 0;
      return {
        stage,
        total: totalStage,
        pct: Math.round((totalStage / total) * 100),
      };
    });
  }, [leads]);

  const activities = useMemo(() => {
    const leadEvents: ActivityItem[] = leads
      .flatMap((lead) => (lead.timeline || []).map((event) => ({ lead, event })))
      .map(({ lead, event }) => ({
        id: `${lead.id}_${event.id}`,
        source: "lead" as const,
        title: event.title || "Evento de lead",
        detail: `${lead.nome || "Lead"} | ${event.detail || "Atualizacao de pipeline"}`,
        createdAt: toDate(event.createdAt),
        href: `/cliente/painel/crm?leadId=${encodeURIComponent(lead.id)}`,
      }));

    const financeEvents: ActivityItem[] = (dashboard?.finance || []).map((item) => ({
      id: item.id,
      source: "finance" as const,
      title: item.descricao || "Lancamento financeiro",
      detail: `${String(item.status || "pendente")} | ${brl(Number(item.valor || 0))}`,
      createdAt: toDate(item.createdAt),
      href: "/cliente/painel/comercial",
    }));

    return [...leadEvents, ...financeEvents]
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, 8);
  }, [dashboard?.finance, leads]);

  const aiPausedChats = useMemo(() => {
    return chats.filter((chat) => {
      if (!chat.aiState) return false;
      if (chat.aiState.aiEnabled === false) return true;
      const pausedUntil = toDate(chat.aiState.pausedUntil);
      return Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
    }).length;
  }, [chats]);

  const operationStatusTone = ai.enabled === false ? "warning" : "success";
  const metricKpis = metricsSummary.metrics || {};
  const operationMetrics = metricsSummary.operations || {};
  const aiMetrics = metricsSummary.ai || {};
  const comparisonMetrics = metricsSummary.comparisons || {};
  const automationMetrics = automationSummary.summary || {};
  const queueBreakdown = operationMetrics.queueBreakdown || {};
  const channelOperations = operationMetrics.channelOperations || [];
  const pilotReady = readiness.summary?.pilotReady === true;
  const readinessScore = Number(readiness.summary?.readinessScore || 0);

  const priorityActions = useMemo<PriorityAction[]>(() => {
    const items: PriorityAction[] = [];

    if (!pilotReady && readiness.blockers?.[0]) {
      items.push({
        id: `readiness_${readiness.blockers[0].id}`,
        title: readiness.blockers[0].title,
        description: readiness.blockers[0].description,
        href: readiness.blockers[0].href,
        tone: readiness.blockers[0].tone,
        badge: "go-live",
      });
    }

    if (Number(automationMetrics.slaBreached || operationMetrics.overdueChats || 0) > 0) {
      items.push({
        id: "sla",
        title: "SLA estourado no inbox",
        description: `${automationMetrics.slaBreached || operationMetrics.overdueChats || 0} conversas exigem resposta imediata do time.`,
        href: "/cliente/painel/inbox?queue=sla_breached",
        tone: "danger",
        badge: "urgente",
      });
    }

    if (Number(operationMetrics.unassignedChats || 0) > 0) {
      items.push({
        id: "unassigned",
        title: "Conversas sem responsavel",
        description: `${operationMetrics.unassignedChats || 0} conversas precisam de atribuicao para nao travar o atendimento.`,
        href: "/cliente/painel/inbox?queue=unassigned",
        tone: "warning",
        badge: "fila",
      });
    }

    if (Number(automationMetrics.waitingReplyBacklog || 0) > 0) {
      items.push({
        id: "waiting_reply",
        title: "Backlog aguardando resposta",
        description: `${automationMetrics.waitingReplyBacklog || 0} conversas seguem abertas sem retorno do time.`,
        href: "/cliente/painel/inbox?queue=assigned_waiting",
        tone: "warning",
        badge: "follow-up",
      });
    }

    if (ai.enabled === false || kbCount === 0) {
      items.push({
        id: "ai_setup",
        title: ai.enabled === false ? "IA desativada no tenant" : "Base comercial da IA esta vazia",
        description:
          ai.enabled === false
            ? "Reative o agente para manter cobertura automatica do atendimento."
            : "Cadastre FAQ, servicos e politicas para melhorar respostas e handoff.",
        href: "/cliente/painel/ia",
        tone: ai.enabled === false ? "warning" : "info",
        badge: "ia",
      });
    }

    if (Number(automationMetrics.activeAutomations || 0) === 0) {
      items.push({
        id: "automations",
        title: "Sem automacoes publicadas",
        description: "Ative playbooks de follow-up e operacao para reduzir fila manual.",
        href: "/cliente/painel/automacoes",
        tone: "info",
        badge: "setup",
      });
    }

    if (Number(metricKpis.totalLeads || leads.length || 0) === 0) {
      items.push({
        id: "capture",
        title: "Sem leads no periodo",
        description: "Publique formularios e widget para reaquecer o topo de funil.",
        href: "/cliente/painel/captacao",
        tone: "neutral",
        badge: "captacao",
      });
    }

    return items.slice(0, 5);
  }, [
    ai.enabled,
    automationMetrics.activeAutomations,
    automationMetrics.slaBreached,
    automationMetrics.waitingReplyBacklog,
    kbCount,
    leads.length,
    metricKpis.totalLeads,
    operationMetrics.overdueChats,
    operationMetrics.unassignedChats,
    pilotReady,
    readiness.blockers,
  ]);

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (!dashboard || error) {
    return (
      <EmptyState
        title="Nao foi possivel carregar o dashboard executivo"
        description={error || "Tente novamente em alguns segundos."}
      />
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Visao geral"
        subtitle="Uma leitura executiva do que esta pronto, do que pede atencao e do que fazer agora no tenant."
        action={
          <StateBadge
            label={pilotReady ? "Pronto para operar" : ai.enabled === false ? "IA limitada" : "Operacao acompanhada"}
            tone={pilotReady ? "success" : operationStatusTone}
          />
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <PanelCard className="overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--cliente-card-text-muted)]">
                <Sparkles className="h-3.5 w-3.5" />
                Workspace ALTUM
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--cliente-card-text)] md:text-3xl">
                {tenant?.tenantName || tenant?.clientName || "Cliente"} em modo operacional premium
              </h3>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">
                Veja atendimento, pipeline, IA e sinais de performance em uma leitura mais simples, com foco no que fazer primeiro.
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-1 text-xs text-[var(--cliente-card-text-muted)]">
                <span>Prontidao</span>
                <StateBadge
                  label={pilotReady ? `pronto ${readinessScore}%` : `em implantacao ${readinessScore}%`}
                  tone={pilotReady ? "success" : readinessScore >= 70 ? "info" : "warning"}
                />
              </div>
            </div>

            <div className="min-w-[220px] rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Resumo rapido</p>
              <div className="mt-3 space-y-3">
                <HeroStat label="Leads ativos" value={(kpis?.leads || 0).toLocaleString("pt-BR")} />
                <HeroStat label="Conversas abertas" value={String(operationMetrics.activeChats || chats.length)} />
                <HeroStat label="Backlog resposta" value={String(automationMetrics.waitingReplyBacklog || 0)} />
                <HeroStat label="Canal IA" value={ai.enabled === false ? "Restrito" : "Rodando"} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <QuickLink
              href="/cliente/painel/inbox"
              title="Assumir atendimento"
              description="Abrir conversas com takeover e contexto imediato."
              icon={MessageSquare}
            />
            <QuickLink
              href="/cliente/painel/pipeline"
              title="Atualizar pipeline"
              description="Mover leads, revisar gargalos e acelerar fechamento."
              icon={Funnel}
            />
            <QuickLink
              href="/cliente/painel/ia"
              title="Refinar agente"
              description="Ajustar guardrails, tom de voz e base comercial."
              icon={Bot}
            />
            <QuickLink
              href="/cliente/painel/captacao"
              title="Escalar captacao"
              description="Publicar formularios, widget e entrada de leads no site."
              icon={Megaphone}
            />
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Agenda imediata" subtitle="Prioridades guiadas para agir agora" />
          <div className="mt-4 space-y-3">
            {priorityActions.length === 0 ? (
              <>
                <FocusRow
                  href="/cliente/painel/inbox"
                  label="Atendimento"
                  value={aiPausedChats > 0 ? `${aiPausedChats} conversas em takeover` : "Fluxo assistido pela IA"}
                  tone={aiPausedChats > 0 ? "warning" : "success"}
                />
                <FocusRow
                  href="/cliente/painel/crm"
                  label="Pipeline"
                  value={Number(metricKpis.conversionRate || 0) > 0 ? `${pct(Number(metricKpis.conversionRate || 0))} de conversao no periodo` : "Topo de funil dominante"}
                  tone="info"
                />
              </>
            ) : (
              priorityActions.map((item) => (
                <FocusRow
                  key={item.id}
                  href={item.href}
                  label={item.title}
                  value={item.description}
                  tone={item.tone}
                  badgeLabel={item.badge}
                />
              ))
            )}
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Link
              href="/cliente/painel/configuracoes"
              className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
            >
              <span className="inline-flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-[var(--cliente-accent)]" />
                Revisar configuracoes essenciais
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
            </Link>
            <Link
              href="/cliente/painel/metricas"
              className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
            >
              <span className="inline-flex items-center gap-2">
                <ChartColumn className="h-4 w-4 text-[var(--cliente-accent)]" />
                Abrir metricas consolidadas
              </span>
              <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
            </Link>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Link href="/cliente/painel/crm" className="block">
          <MetricCard
            label="Leads"
            value={(kpis?.leads || 0).toLocaleString("pt-BR")}
            icon={Activity}
            trend="captacao"
          />
        </Link>
        <Link href="/cliente/painel/inbox" className="block">
          <MetricCard
            label="Conversas"
            value={String(metricKpis.conversations || chats.length)}
            icon={MessageSquare}
            trend={`${operationMetrics.unassignedChats || 0} sem responsavel`}
          />
        </Link>
        <Link href="/cliente/painel/inbox?status=open" className="block">
          <MetricCard
            label="SLA risco"
            value={String(automationMetrics.slaBreached || operationMetrics.overdueChats || 0)}
            icon={Megaphone}
            trend={`${automationMetrics.waitingReplyBacklog || 0} aguardando resposta`}
          />
        </Link>
        <Link href="/cliente/painel/metricas" className="block">
          <MetricCard
            label="Investimento"
            value={brl(Number(kpis?.spend || 0))}
            icon={Wallet}
            trend={`CPL ${brl(Number(kpis?.cpl || 0))}`}
          />
        </Link>
        <Link href="/cliente/painel/comercial" className="block">
          <MetricCard
            label="Receita"
            value={brl(Number(kpis?.paid || 0))}
            icon={Handshake}
            trend={`Pendente ${brl(Number(kpis?.pending || 0))}`}
          />
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <PanelCard className="p-4">
          <CardTitle title="Funil visual" subtitle="Distribuicao dos leads por etapa comercial" />
          <div className="mt-4 space-y-3">
            {funnel.map((item) => (
              <Link key={item.stage} href={`/cliente/painel/crm?stage=${encodeURIComponent(item.stage)}`} className="block space-y-1.5 rounded-xl px-2 py-2 transition hover:bg-[var(--cliente-surface-muted)]">
                <div className="flex items-center justify-between text-xs text-[var(--cliente-card-text-soft)]">
                  <span className="uppercase tracking-wide">{getPipelineStageLabel(item.stage)}</span>
                  <span>
                    {item.total} leads ({item.pct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[var(--cliente-border)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--cliente-accent)] to-[var(--cliente-accent-strong)]"
                    style={{ width: `${Math.max(4, item.pct)}%` }}
                  />
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <CardTitle title="Saude da automacao" subtitle="Estado atual do motor de atendimento e IA" />
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
              <span className="text-[var(--cliente-card-text-soft)]">IA global</span>
              <StateBadge
                label={ai.enabled === false ? "desativada" : "ativa"}
                tone={ai.enabled === false ? "warning" : "success"}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
              <span className="text-[var(--cliente-card-text-soft)]">Guardrails configurados</span>
              <span className="font-semibold text-[var(--cliente-card-text)]">{automationMetrics.guardrails || (ai.guardrails || []).length}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
              <span className="text-[var(--cliente-card-text-soft)]">Base de conhecimento</span>
              <span className="font-semibold text-[var(--cliente-card-text)]">{automationMetrics.kbDocs || kbCount} docs</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
              <span className="text-[var(--cliente-card-text-soft)]">Conversas com takeover</span>
              <span className="font-semibold text-[var(--cliente-card-text)]">{automationMetrics.pausedConversations || aiPausedChats}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
              <span className="text-[var(--cliente-card-text-soft)]">Fila de automacao</span>
              <span className="font-semibold text-[var(--cliente-card-text)]">{automationMetrics.queue?.pending || 0} pendentes</span>
            </div>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <PanelCard className="p-4">
          <CardTitle title="Atividades recentes" subtitle="Ultimos eventos de financeiro e CRM" />
          <div className="mt-4 space-y-2">
            {activities.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem eventos recentes para exibir.</p>
            ) : (
              activities.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--cliente-card-text)]">{item.title}</p>
                    <StateBadge label={item.source} tone={item.source === "lead" ? "info" : "neutral"} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-[var(--cliente-card-text-soft)]">
                    <Clock3 className="h-3 w-3" />
                    {item.createdAt ? item.createdAt.toLocaleString("pt-BR") : "sem data"}
                  </p>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <CardTitle title="Metricas resumidas" subtitle="Resumo executivo do periodo" />
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--cliente-border)]">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Impressoes" value={(kpis?.impressions || 0).toLocaleString("pt-BR")} />
                <Row label="Cliques" value={(kpis?.clicks || 0).toLocaleString("pt-BR")} />
                <Row label="CTR" value={pct(Number(kpis?.ctr || 0))} />
                <Row label="CPC" value={brl(Number(kpis?.cpc || 0))} />
                <Row label="CPL" value={brl(Number(kpis?.cpl || 0))} />
                <Row label="Projetos ativos" value={String(Number(kpis?.projects || 0))} />
                <Row label="Orcamentos" value={String(Number(kpis?.budgets || 0))} />
                <Row label="Tempo medio de 1a resposta" value={`${Number(metricKpis.avgFirstResponseMinutes || 0).toFixed(1)} min`} />
                <Row label="ROI" value={`${Number(metricKpis.roi || 0).toFixed(2)}x`} />
                <Row label="Conversao" value={pct(Number(metricKpis.conversionRate || 0))} />
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href="/cliente/painel/metricas" className="block">
              <PanelCard className="border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                  <Megaphone className="h-3.5 w-3.5" />
                  Midia
                </div>
                <p className="mt-2 text-base font-semibold">{brl(Number(kpis?.spend || 0))}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  Delta {formatDelta(comparisonMetrics.spendDeltaPct, "investimento")}
                </p>
              </PanelCard>
            </Link>
            <Link href="/cliente/painel/crm" className="block">
              <PanelCard className="border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]">
                <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                  <Funnel className="h-3.5 w-3.5" />
                  Conversao
                </div>
                <p className="mt-2 text-base font-semibold">{(kpis?.leads || 0).toLocaleString("pt-BR")} leads</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                  Delta {formatDelta(comparisonMetrics.conversionDeltaPct, "conversao")}
                </p>
              </PanelCard>
            </Link>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CTR" value={pct(Number(kpis?.ctr || 0))} icon={ChartColumn} />
        <MetricCard label="CPC" value={brl(Number(kpis?.cpc || 0))} icon={Wallet} />
        <MetricCard label="CPL" value={brl(Number(kpis?.cpl || 0))} icon={Bot} />
        <MetricCard
          label="Contrato"
          value={dashboard.contract?.status || "nao informado"}
          icon={Handshake}
          trend={dashboard.contract?.title || ""}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="p-4">
          <CardTitle title="Mesa operacional" subtitle="Fila, SLA e responsaveis com maior carga" />
          <div className="mt-4 space-y-3">
            <FocusRow
              href="/cliente/painel/inbox?queue=assigned_waiting"
              label="Fila sem resposta"
              value={`${automationMetrics.waitingReplyBacklog || 0} conversas aguardando retorno`}
              tone={Number(automationMetrics.waitingReplyBacklog || 0) > 0 ? "warning" : "success"}
            />
            <FocusRow
              href="/cliente/painel/inbox?queue=sla_breached"
              label="SLA estourado"
              value={`${automationMetrics.slaBreached || operationMetrics.overdueChats || 0} conversas em risco`}
              tone={Number(automationMetrics.slaBreached || operationMetrics.overdueChats || 0) > 0 ? "danger" : "success"}
            />
            <FocusRow
              href="/cliente/painel/inbox?queue=unassigned"
              label="Sem responsavel"
              value={`${operationMetrics.unassignedChats || 0} conversas na fila`}
              tone={Number(operationMetrics.unassignedChats || 0) > 0 ? "warning" : "success"}
            />
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <MiniStatLink
              href="/cliente/painel/inbox?queue=triage"
              label="Triagem"
              value={String(queueBreakdown.triage || 0)}
            />
            <MiniStatLink
              href="/cliente/painel/inbox?queue=assigned"
              label="Em atendimento"
              value={String(queueBreakdown.assigned || 0)}
            />
            <MiniStatLink
              href="/cliente/painel/inbox?ai=ai_active"
              label="IA ativa"
              value={String(operationMetrics.aiBreakdown?.active || 0)}
            />
            <MiniStatLink
              href="/cliente/painel/inbox?ai=human_owned"
              label="Takeover humano"
              value={String(operationMetrics.aiBreakdown?.humanOwned || 0)}
            />
          </div>

          <div className="mt-4 space-y-2">
            {(operationMetrics.teamPerformance || []).length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem performance operacional suficiente para exibir responsaveis.</p>
            ) : (
              operationMetrics.teamPerformance?.slice(0, 5).map((owner) => (
                <Link
                  key={owner.ownerId}
                  href={`/cliente/painel/inbox?assignedUser=${encodeURIComponent(owner.ownerId)}`}
                  className="block rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[var(--cliente-card-text)]">{owner.ownerName}</p>
                    <StateBadge
                      label={`${owner.activeChats} chats`}
                      tone={owner.overdueChats > 0 ? "warning" : "info"}
                    />
                  </div>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                    {owner.totalLeads} leads / {owner.wonLeads} ganhos / win rate {owner.winRate}%
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">
                    {owner.pendingChats} aguardando / {owner.handoffChats} handoffs
                  </p>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <CardTitle title="Performance da IA" subtitle="Como o agente esta atuando no periodo" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetricCard label="IA respondeu" value={String(aiMetrics.responded || 0)} trend="respostas automaticas" />
            <MetricCard label="Handoffs" value={String(aiMetrics.handoff || metricKpis.handoffChats || 0)} trend="escaladas para humano" />
            <MetricCard label="Confianca media" value={`${Number(aiMetrics.avgConfidence || 0).toFixed(2)}`} trend="assertividade do agente" />
            <MetricCard label="Latencia media" value={`${Math.round(Number(aiMetrics.avgLatencyMs || 0))} ms`} trend="tempo de resposta" />
          </div>

          <div className="mt-4 space-y-2">
            {channelOperations.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem canais operacionais suficientes para leitura comparativa.</p>
            ) : (
              channelOperations.slice(0, 4).map((item) => (
                <Link
                  key={item.channel}
                  href={`/cliente/painel/inbox?channel=${encodeURIComponent(item.channel)}`}
                  className="flex items-center justify-between rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div>
                    <p className="font-medium text-[var(--cliente-card-text)]">{formatChannelLabel(item.channel)}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                      {item.activeChats} ativos / {item.unassignedChats} sem dono / {item.handoffChats} handoffs
                    </p>
                  </div>
                  <StateBadge
                    label={item.overdueChats > 0 ? `${item.overdueChats} em risco` : "estavel"}
                    tone={item.overdueChats > 0 ? "warning" : "success"}
                  />
                </Link>
              ))
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[var(--cliente-border)] last:border-none">
      <td className="px-3 py-2 text-[var(--cliente-card-text-soft)]">{label}</td>
      <td className="px-3 py-2 text-right font-medium text-[var(--cliente-card-text)]">{value}</td>
    </tr>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
      <span className="text-sm text-[var(--cliente-card-text-soft)]">{label}</span>
      <span className="text-sm font-semibold text-[var(--cliente-card-text)]">{value}</span>
    </div>
  );
}

function formatDelta(value: number | undefined, subject: string) {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${numeric.toFixed(1)}% em ${subject}`;
}

function QuickLink({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof MessageSquare;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
    >
      <div className="inline-flex rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-accent)]">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{title}</p>
        <ArrowRight className="h-4 w-4 text-[var(--cliente-card-text-soft)] transition group-hover:text-[var(--cliente-accent)]" />
      </div>
      <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-soft)]">{description}</p>
    </Link>
  );
}

function FocusRow({
  href,
  label,
  value,
  tone,
  badgeLabel,
}: {
  href?: string;
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badgeLabel?: string;
}) {
  const resolvedBadgeLabel =
    badgeLabel || (tone === "warning" ? "atencao" : tone === "success" ? "ok" : tone === "danger" ? "risco" : "monitorar");

  const content = (
    <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{label}</p>
        <StateBadge label={resolvedBadgeLabel} tone={tone} />
      </div>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{value}</p>
    </div>
  );

  if (!href) return content;

  return <Link href={href}>{content}</Link>;
}

function MiniStatLink({
  href,
  label,
  value,
}: {
  href: string;
  label: string;
  value: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-accent-soft)]"
    >
      <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--cliente-card-text)]">{value}</p>
    </Link>
  );
}

