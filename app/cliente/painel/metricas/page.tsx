"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  DollarSign,
  Download,
  Gauge,
  LineChart,
  Loader2,
  Megaphone,
  MessageCircle,
  MousePointerClick,
  PieChart,
  RefreshCw,
  Target,
  UsersRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import {
  CardTitle,
  ClientActionButton,
  EmptyState,
  MetricCard,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type AttributionGroup = {
  key: string;
  label: string;
  source?: string | null;
  lastTouchLeads: number;
  firstTouchLeads: number;
  assistedLeads: number;
  qualifiedLeads: number;
  wonLeads: number;
  meetings: number;
  hotLeads: number;
  avgScore: number;
  qualityRate: number;
  winRate: number;
  spend: number;
  clicks: number;
  impressions: number;
  paidLeads: number;
  cpl: number;
  qualifiedCpl: number;
  costPerMeeting: number;
  costPerSale: number;
  campaignCount?: number | null;
};

type MetricsSummaryResponse = {
  rangeDays?: number;
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    roi?: number;
    cpl?: number;
    qualifiedCpl?: number;
    costPerMeeting?: number;
    costPerSale?: number;
    growth?: number;
    conversations?: number;
    handoffChats?: number;
    siteChatConversations?: number;
    wonLeads?: number;
    qualifiedLeads?: number;
    meetings?: number;
    totalLeads?: number;
    paidRevenue?: number;
  };
  comparisons?: {
    leadsDeltaPct?: number;
    conversionDeltaPct?: number;
    roiDeltaPct?: number;
    cplDeltaPct?: number;
    qualifiedCplDeltaPct?: number;
    meetingCostDeltaPct?: number;
    saleCostDeltaPct?: number;
    qualifiedLeadsDeltaPct?: number;
    meetingsDeltaPct?: number;
    spendDeltaPct?: number;
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
  funnel?: Array<{
    stage: string;
    label: string;
    total: number;
    value: number;
  }>;
  channels?: Array<{
    channel: string;
    total: number;
    won: number;
    conversionRate: number;
  }>;
  commercialAttribution?: {
    byChannel?: AttributionGroup[];
    byCampaign?: AttributionGroup[];
  };
  trafficSeries?: Array<{
    key: string;
    label: string;
    spend: number;
    leads: number;
    clicks: number;
    impressions: number;
  }>;
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
  windows?: {
    current?: { start?: string; end?: string };
    previous?: { start?: string; end?: string };
  };
  error?: string;
};

type ReadinessPayload = {
  operationalHealth?: {
    status?: "healthy" | "degraded" | "down";
    label?: string;
    reason?: string;
  };
  operationalAlerts?: Array<{
    id: string;
    type: string;
    severity: "info" | "warning" | "high";
    title: string;
    detail: string;
    probableCause: string;
    recommendedAction: string;
    href: string;
    source: string;
    lastOccurredAt?: string | null;
  }>;
};

const RANGE_OPTIONS = [7, 30, 90] as const;

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function compactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1000000).toFixed(1)} mi`;
  if (abs >= 1000) return `${value < 0 ? "-" : ""}R$ ${(abs / 1000).toFixed(1)} mil`;
  return currency(value);
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function deltaLabel(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function ratioLabel(value: number) {
  return `${value.toFixed(2)}x`;
}

function channelLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized.includes("google")) return "Google Ads";
  if (normalized.includes("meta") || normalized.includes("facebook") || normalized.includes("instagram")) return "Meta Ads";
  if (normalized === "site_chat") return "Chat do site";
  if (normalized === "site_form") return "Formulario";
  if (normalized === "nao_informado") return "Nao informado";
  return value.replaceAll("_", " ");
}

function formatDateRange(start?: string, end?: string) {
  if (!start || !end) return "Periodo atual";
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return `${startDate.toLocaleDateString("pt-BR")} ate ${endDate.toLocaleDateString("pt-BR")}`;
}

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function queueHref(filter: "all" | "sla_breached" | "unassigned" | "assigned_waiting") {
  if (filter === "all") return "/cliente/painel/inbox";
  return `/cliente/painel/inbox?queue=${encodeURIComponent(filter)}`;
}

export default function ClienteMetricasPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rangeFromQuery = Number(searchParams.get("range") || 30);
  const [rangeDays, setRangeDays] = useState<(typeof RANGE_OPTIONS)[number]>(
    RANGE_OPTIONS.includes(rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      ? (rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      : 30
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<MetricsSummaryResponse>({});
  const [readiness, setReadiness] = useState<ReadinessPayload>({});

  const canSyncCampaigns = hasCapability("manage_channels");

  const loadMetrics = useCallback(
    async (silent = false) => {
      if (!tenant?.tenantId) return;

      try {
        if (!silent) {
          setLoading(true);
          setError(null);
        }

        const [res, readinessRes] = await Promise.all([
          authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary?rangeDays=${rangeDays}`),
          authedFetch(`/api/tenant/${tenant.tenantId}/readiness`),
        ]);
        const payload = (await res.json()) as MetricsSummaryResponse;
        const readinessPayload = (await readinessRes.json().catch(() => ({}))) as ReadinessPayload;

        if (!res.ok) {
          if (!silent) setError(payload.error || "Falha ao carregar metricas.");
          return;
        }

        setData(payload);
        setReadiness(readinessRes.ok ? readinessPayload : {});
        setError(null);
      } catch {
        if (!silent) setError("Falha ao carregar metricas.");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [rangeDays, tenant?.tenantId]
  );

  useEffect(() => {
    void loadMetrics(false);
  }, [loadMetrics]);

  useAdaptivePolling({
    enabled: Boolean(tenant?.tenantId),
    onTick: () => loadMetrics(true),
    fastIntervalMs: 30000,
    slowIntervalMs: 120000,
    runOnMount: false,
    source: "metricas",
  });

  useEffect(() => {
    const nextRange = RANGE_OPTIONS.includes(rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      ? (rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      : 30;
    setRangeDays((current) => (current === nextRange ? current : nextRange));
  }, [rangeFromQuery]);

  const metrics = data.metrics || {};
  const traffic = data.traffic || {};
  const comparisons = data.comparisons || {};
  const operations = data.operations || {};
  const queueBreakdown = operations.queueBreakdown || {};
  const funnel = useMemo(() => data.funnel || [], [data.funnel]);
  const channels = useMemo(() => data.commercialAttribution?.byChannel || [], [data.commercialAttribution?.byChannel]);
  const campaigns = useMemo(() => data.commercialAttribution?.byCampaign || [], [data.commercialAttribution?.byCampaign]);
  const trafficSeries = useMemo(() => data.trafficSeries || [], [data.trafficSeries]);
  const windows = data.windows || {};
  const alerts = useMemo(() => readiness.operationalAlerts || [], [readiness.operationalAlerts]);

  const revenue = Number(metrics.paidRevenue || 0);
  const spend = Number(traffic.spend || 0);
  const profit = revenue - spend;
  const totalLeads = Number(metrics.totalLeads || 0);
  const qualifiedLeads = Number(metrics.qualifiedLeads || 0);
  const meetings = Number(metrics.meetings || 0);
  const wonLeads = Number(metrics.wonLeads || 0);
  const conversionRate = Number(metrics.conversionRate || 0);
  const roi = Number(metrics.roi || 0);
  const cpl = Number(metrics.cpl || traffic.cpl || 0);
  const costPerSale = Number(metrics.costPerSale || 0);
  const maxFunnel = useMemo(() => Math.max(1, ...funnel.map((item) => item.total || 0)), [funnel]);
  const maxSeriesLeads = useMemo(() => Math.max(1, ...trafficSeries.map((item) => item.leads || 0)), [trafficSeries]);
  const maxSeriesSpend = useMemo(() => Math.max(1, ...trafficSeries.map((item) => item.spend || 0)), [trafficSeries]);
  const decisionSnapshot = useMemo(() => {
    const bestCampaign =
      [...campaigns].sort((a, b) => {
        const saleDiff = Number(b.wonLeads || 0) - Number(a.wonLeads || 0);
        if (saleDiff !== 0) return saleDiff;
        const meetingDiff = Number(b.meetings || 0) - Number(a.meetings || 0);
        if (meetingDiff !== 0) return meetingDiff;
        return Number(b.qualifiedLeads || 0) - Number(a.qualifiedLeads || 0);
      })[0] || null;
    const bestChannel =
      [...channels].sort((a, b) => {
        const saleDiff = Number(b.wonLeads || 0) - Number(a.wonLeads || 0);
        if (saleDiff !== 0) return saleDiff;
        return Number(b.qualityRate || 0) - Number(a.qualityRate || 0);
      })[0] || null;
    const bottleneck =
      Number(operations.overdueChats || 0) > 0
        ? `${operations.overdueChats} conversa(s) fora do prazo`
        : Number(operations.unassignedChats || 0) > 0
          ? `${operations.unassignedChats} conversa(s) sem responsavel`
          : spend > 0 && roi < 1
            ? `retorno abaixo de 1x com ${currency(spend)} investidos`
            : totalLeads > 0 && conversionRate < 10
              ? `conversao baixa em ${percent(conversionRate)}`
              : "sem gargalo critico no periodo";
    const nextDecision =
      Number(operations.overdueChats || 0) > 0 || Number(operations.unassignedChats || 0) > 0
        ? "Arrumar atendimento antes de aumentar investimento."
        : spend > 0 && roi >= 1
          ? "Dobrar nas campanhas e canais que ja geraram venda."
          : totalLeads > 0
            ? "Melhorar oferta, qualificacao e follow-up antes de escalar midia."
            : "Criar captura e campanha para gerar os primeiros sinais.";

    return { bestCampaign, bestChannel, bottleneck, nextDecision };
  }, [campaigns, channels, conversionRate, operations.overdueChats, operations.unassignedChats, roi, spend, totalLeads]);

  const executiveRead = useMemo(() => {
    const items: string[] = [];

    if (spend > 0) {
      items.push(
        roi >= 1
          ? `A operacao retornou ${ratioLabel(roi)} sobre ${currency(spend)} investidos.`
          : `O retorno ainda esta abaixo de 1x com ${currency(spend)} investidos.`
      );
    } else {
      items.push("Ainda nao ha investimento de midia registrado nesta janela.");
    }

    if (totalLeads > 0) {
      items.push(`${totalLeads} contatos entraram, ${qualifiedLeads} qualificados e ${wonLeads} venda(s) registradas.`);
    } else {
      items.push("Nenhum contato novo entrou no periodo selecionado.");
    }

    if (Number(operations.overdueChats || 0) > 0) {
      items.push(`${operations.overdueChats} conversa(s) estao fora do prazo e podem afetar vendas.`);
    } else {
      items.push("Nao ha atendimento atrasado relevante no momento.");
    }

    return items;
  }, [operations.overdueChats, qualifiedLeads, roi, spend, totalLeads, wonLeads]);

  const priorityActions = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      detail: string;
      href: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
      badge: string;
    }> = [];

    if (Number(operations.overdueChats || 0) > 0) {
      items.push({
        id: "sla",
        title: "Responder conversas atrasadas",
        detail: `${operations.overdueChats || 0} conversa(s) fora do prazo.`,
        href: queueHref("sla_breached"),
        tone: "danger",
        badge: "urgente",
      });
    }

    if (Number(operations.unassignedChats || 0) > 0) {
      items.push({
        id: "owner",
        title: "Distribuir conversas sem responsavel",
        detail: `${operations.unassignedChats || 0} conversa(s) sem dono.`,
        href: queueHref("unassigned"),
        tone: "warning",
        badge: "fila",
      });
    }

    if (spend > 0 && roi < 1) {
      items.push({
        id: "roi",
        title: "Revisar campanhas com baixo retorno",
        detail: `ROI atual de ${ratioLabel(roi)} com ${currency(spend)} investidos.`,
        href: "/cliente/painel/campanhas",
        tone: "warning",
        badge: "retorno",
      });
    }

    if (totalLeads > 0 && conversionRate < 10) {
      items.push({
        id: "conversion",
        title: "Melhorar conversao do funil",
        detail: `Taxa de venda em ${percent(conversionRate)} nesta janela.`,
        href: "/cliente/painel/crm",
        tone: "info",
        badge: "funil",
      });
    }

    for (const alert of alerts.slice(0, 2)) {
      items.push({
        id: alert.id,
        title: alert.title,
        detail: alert.recommendedAction || alert.detail,
        href: alert.href,
        tone: alert.severity === "high" ? "danger" : alert.severity === "warning" ? "warning" : "info",
        badge: alert.type.replaceAll("_", " "),
      });
    }

    return items.slice(0, 5);
  }, [alerts, conversionRate, operations.overdueChats, operations.unassignedChats, roi, spend, totalLeads]);

  async function handleSyncCampaigns() {
    if (!tenant?.tenantId || !canSyncCampaigns) return;

    setSyncing(true);
    setNotice(null);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: rangeDays >= 30 ? 30 : 7 }),
      });
      const payload = (await res.json()) as { error?: string; synced?: number };

      if (!res.ok) {
        setError(payload.error || "Falha ao sincronizar campanhas.");
        return;
      }

      setNotice(`Atualizacao concluida: ${payload.synced || 0} campanha(s) revisadas.`);
      await loadMetrics(false);
    } catch {
      setError("Falha ao sincronizar campanhas.");
    } finally {
      setSyncing(false);
    }
  }

  function exportCsv() {
    const escapeCell = (value: unknown) => {
      const text = String(value ?? "");
      if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replaceAll('"', '""')}"`;
      return text;
    };
    const rows = [
      ["secao", "campo", "valor"],
      ["resultado", "receita", revenue],
      ["resultado", "investimento", spend],
      ["resultado", "lucro_estimado", profit],
      ["resultado", "roi", roi],
      ["aquisicao", "contatos", totalLeads],
      ["aquisicao", "qualificados", qualifiedLeads],
      ["vendas", "reunioes", meetings],
      ["vendas", "vendas", wonLeads],
      ["vendas", "conversao", conversionRate],
      ["midia", "cpl", cpl],
      ["midia", "custo_por_venda", costPerSale],
      ["operacao", "conversas_ativas", operations.activeChats || 0],
      ["operacao", "fora_do_prazo", operations.overdueChats || 0],
      ["operacao", "sem_responsavel", operations.unassignedChats || 0],
    ];
    const csv = `${rows.map((row) => row.map(escapeCell).join(",")).join("\n")}\n`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `metricas-altum-${tenant?.tenantId || "conta"}-${rangeDays}d.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function handleRangeChange(option: (typeof RANGE_OPTIONS)[number]) {
    setRangeDays(option);
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", String(option));
    router.replace(`/cliente/painel/metricas?${next.toString()}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (error) {
    return <EmptyState title="Falha ao carregar metricas" description={error} />;
  }

  return (
    <div className="metricas-refined client-daily-page space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_52%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)] md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge label="Decidir" tone="info" />
              <StateBadge label={formatDateRange(windows.current?.start, windows.current?.end)} tone="neutral" />
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-3xl">
              Decisoes sobre dinheiro, campanha e atendimento.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
              Trafego, conversas, funil e receita em uma leitura comercial unica.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleRangeChange(option)}
                className={`rounded-[14px] border px-3 py-2 text-xs font-bold transition ${
                  rangeDays === option
                    ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-hover)]"
                }`}
              >
                {option} dias
              </button>
            ))}
            <ClientActionButton type="button" tone="secondary" onClick={exportCsv}>
              <Download className="h-4 w-4" />
              Exportar
            </ClientActionButton>
            {canSyncCampaigns ? (
              <ClientActionButton type="button" tone="secondary" onClick={() => void handleSyncCampaigns()} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Atualizar anuncios
              </ClientActionButton>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <HeroMetric label="Receita gerada" value={compactCurrency(revenue)} detail={`ROI ${ratioLabel(roi)}`} icon={DollarSign} tone={revenue > 0 ? "success" : "neutral"} />
          <HeroMetric label="Gasto em midia" value={compactCurrency(spend)} detail={`CPL ${currency(cpl)}`} icon={Megaphone} tone={spend > 0 ? "info" : "neutral"} />
          <HeroMetric label="Contatos" value={String(totalLeads)} detail={`${qualifiedLeads} qualificados`} icon={UsersRound} tone="info" />
          <HeroMetric label="Vendas" value={String(wonLeads)} detail={`${percent(conversionRate)} conversao`} icon={Target} tone={wonLeads > 0 ? "success" : "warning"} />
        </div>
      </section>

      {notice ? <div className="rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div> : null}

      <DecisionBoard
        bestCampaign={decisionSnapshot.bestCampaign}
        bestChannel={decisionSnapshot.bestChannel}
        bottleneck={decisionSnapshot.bottleneck}
        nextDecision={decisionSnapshot.nextDecision}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Lucro estimado" value={compactCurrency(profit)} icon={profit >= 0 ? ArrowUpRight : ArrowDownRight} trend="receita menos midia" tone={profit >= 0 ? "success" : "warning"} />
        <MetricCard label="Reunioes" value={String(meetings)} icon={CalendarDays} trend={`custo ${currency(Number(metrics.costPerMeeting || 0))}`} tone="brand" />
        <MetricCard label="Custo por venda" value={costPerSale ? currency(costPerSale) : "Sem vendas"} icon={Gauge} trend={deltaLabel(Number(comparisons.saleCostDeltaPct || 0))} tone={costPerSale ? "warning" : "neutral"} />
        <MetricCard label="Tempo de resposta" value={`${Number(metrics.avgFirstResponseMinutes || 0).toFixed(1)} min`} icon={Clock3} trend={`${operations.activeChats || 0} conversas ativas`} tone={Number(metrics.avgFirstResponseMinutes || 0) <= 5 ? "success" : "warning"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Veredito da operacao" subtitle="Sinais que explicam resultado e prioridade." />
              <StateBadge label={`${rangeDays} dias`} tone="info" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {executiveRead.map((item) => (
                <div key={item} className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <CheckCircle2 className="h-5 w-5 text-[var(--cliente-primary)]" />
                  <p className="mt-3 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{item}</p>
                </div>
              ))}
            </div>
          </PanelCard>

          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Aquisicao e resultado" subtitle="Contatos, gasto e vendas no mesmo grafico operacional." />
              <Link href="/cliente/painel/campanhas" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Ver campanhas
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {trafficSeries.length ? (
                trafficSeries.map((point) => (
                  <div key={point.key} className="grid gap-2 md:grid-cols-[72px_minmax(0,1fr)_132px] md:items-center">
                    <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">{point.label}</span>
                    <div className="space-y-1">
                      <BarLine value={point.leads} max={maxSeriesLeads} className="bg-[var(--cliente-primary)]" />
                      <BarLine value={point.spend} max={maxSeriesSpend} className="bg-[var(--cliente-ai)]" />
                    </div>
                    <span className="text-xs text-[var(--cliente-card-text-muted)]">
                      {point.leads} contatos | {compactCurrency(point.spend)}
                    </span>
                  </div>
                ))
              ) : (
                <EmptyState title="Sem serie no periodo" description="Assim que houver contatos ou midia sincronizada, a evolucao aparece aqui." />
              )}
            </div>
          </PanelCard>

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <PanelCard className="p-5">
              <CardTitle title="Funil de vendas" subtitle="Onde os contatos estao parando." />
              <div className="mt-4 space-y-3">
                {funnel.length ? (
                  funnel.map((stage) => (
                    <Link key={stage.stage} href={`/cliente/painel/crm?stage=${encodeURIComponent(stage.stage)}`} className="block rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-[var(--cliente-card-text)]">{stage.label}</p>
                        <p className="text-sm text-[var(--cliente-card-text-muted)]">{stage.total}</p>
                      </div>
                      <div className="mt-2">
                        <BarLine value={stage.total} max={maxFunnel} className="bg-[var(--cliente-primary)]" />
                      </div>
                      <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Valor potencial: {currency(Number(stage.value || 0))}</p>
                    </Link>
                  ))
                ) : (
                  <EmptyState title="Sem funil consolidado" description="Os contatos aparecem aqui quando entram no CRM." />
                )}
              </div>
            </PanelCard>

            <PanelCard className="p-5">
              <CardTitle title="Canais que geram negocio" subtitle="Volume, custo e retorno por origem." />
              <div className="mt-4 space-y-2">
                {channels.length ? (
                  channels.slice(0, 7).map((channel) => (
                    <ChannelRow key={channel.key} item={channel} />
                  ))
                ) : (
                  <EmptyState title="Sem atribuicao por canal" description="Conecte anuncios ou preencha origem dos contatos para comparar canais." />
                )}
              </div>
            </PanelCard>
          </section>

          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Campanhas com impacto" subtitle="Quais campanhas trouxeram contato, reuniao ou venda." />
              <Link href="/cliente/painel/campanhas" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Central de campanhas
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {campaigns.length ? (
                campaigns.slice(0, 8).map((campaign) => (
                  <CampaignRow key={campaign.key} item={campaign} />
                ))
              ) : (
                <EmptyState title="Sem campanhas atribuidas" description="Quando Meta, Google, UTMs ou formularios gerarem contatos, as campanhas aparecem aqui." />
              )}
            </div>
          </PanelCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="warning" className="p-5">
            <CardTitle title="Acoes prioritarias" subtitle="O que mexe no resultado primeiro." />
            <div className="mt-4 space-y-2">
              {priorityActions.length ? (
                priorityActions.map((action) => (
                  <Link key={action.id} href={action.href} className="block rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[var(--cliente-card-text)]">{action.title}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">{action.detail}</p>
                      </div>
                      <StateBadge label={action.badge} tone={action.tone} />
                    </div>
                  </Link>
                ))
              ) : (
                <p className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
                  Nenhuma acao critica agora. Acompanhe campanhas e funil.
                </p>
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Operacao hoje" subtitle="Sinais que afetam venda em tempo real." />
            <div className="mt-4 grid gap-2">
              <OperationalRow href={queueHref("all")} label="Conversas ativas" value={String(operations.activeChats || 0)} tone="info" />
              <OperationalRow href={queueHref("sla_breached")} label="Fora do prazo" value={String(operations.overdueChats || 0)} tone={Number(operations.overdueChats || 0) > 0 ? "danger" : "success"} />
              <OperationalRow href={queueHref("unassigned")} label="Sem responsavel" value={String(operations.unassignedChats || 0)} tone={Number(operations.unassignedChats || 0) > 0 ? "warning" : "success"} />
              <OperationalRow href={queueHref("assigned_waiting")} label="Aguardando resposta" value={String(queueBreakdown.assignedWaiting || 0)} tone="warning" />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Qualidade da aquisicao" subtitle="Quanto custa chegar em venda." />
            <div className="mt-4 space-y-2">
              <SimpleStat label="Custo por contato" value={currency(cpl)} icon={MousePointerClick} />
              <SimpleStat label="Custo por qualificado" value={currency(Number(metrics.qualifiedCpl || 0))} icon={UsersRound} />
              <SimpleStat label="Custo por reuniao" value={currency(Number(metrics.costPerMeeting || 0))} icon={CalendarDays} />
              <SimpleStat label="Custo por venda" value={costPerSale ? currency(costPerSale) : "Sem venda"} icon={Target} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Atalhos uteis" subtitle="Ir direto para a acao." />
            <div className="mt-4 grid gap-2">
              <Shortcut href="/cliente/painel/campanhas" icon={Megaphone} label="Ajustar campanhas" />
              <Shortcut href="/cliente/painel/crm" icon={PieChart} label="Ver oportunidades" />
              <Shortcut href="/cliente/painel/inbox" icon={MessageCircle} label="Responder conversas" />
              <Shortcut href={`/cliente/painel/relatorios/dia/${todayDateKey()}`} icon={LineChart} label="Fechamento do dia" />
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function DecisionBoard({
  bestCampaign,
  bestChannel,
  bottleneck,
  nextDecision,
}: {
  bestCampaign: AttributionGroup | null;
  bestChannel: AttributionGroup | null;
  bottleneck: string;
  nextDecision: string;
}) {
  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle title="Decisao executiva" subtitle="A leitura que o gestor precisa antes de mexer em dinheiro, equipe ou campanha." />
        <StateBadge label="acao recomendada" tone="info" />
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        <DecisionTile
          icon={Megaphone}
          label="Melhor campanha"
          title={bestCampaign?.label || "Sem campanha vencedora"}
          detail={
            bestCampaign
              ? `${bestCampaign.wonLeads} venda(s), ${bestCampaign.meetings} reunioes, ${bestCampaign.qualifiedLeads} qualificados`
              : "Ainda falta atribuicao de campanha para comparar resultado."
          }
          href="/cliente/painel/campanhas"
          tone={bestCampaign?.wonLeads ? "success" : "warning"}
        />
        <DecisionTile
          icon={PieChart}
          label="Melhor canal"
          title={bestChannel ? channelLabel(bestChannel.label) : "Sem canal vencedor"}
          detail={
            bestChannel
              ? `${bestChannel.lastTouchLeads} contatos, ${bestChannel.wonLeads} venda(s), ${percent(bestChannel.winRate)} conversao`
              : "Preencha origem ou conecte anuncios para medir canais."
          }
          href="/cliente/painel/campanhas"
          tone={bestChannel?.wonLeads ? "success" : "info"}
        />
        <DecisionTile
          icon={Gauge}
          label="Gargalo principal"
          title={bottleneck}
          detail="Resolva este ponto antes de escalar a proxima campanha."
          href="/cliente/painel/inbox"
          tone={bottleneck.includes("sem gargalo") ? "success" : "warning"}
        />
        <DecisionTile
          icon={Target}
          label="Proxima decisao"
          title={nextDecision}
          detail="Use esta acao como prioridade da semana."
          href="/cliente/painel/perguntar-altum"
          tone="info"
        />
      </div>
    </PanelCard>
  );
}

function DecisionTile({
  icon: Icon,
  label,
  title,
  detail,
  href,
  tone,
}: {
  icon: typeof DollarSign;
  label: string;
  title: string;
  detail: string;
  href: string;
  tone: "success" | "info" | "warning";
}) {
  const iconClass = tone === "success" ? "text-[var(--cliente-success)]" : tone === "warning" ? "text-[var(--cliente-warning)]" : "text-[var(--cliente-primary)]";

  return (
    <Link href={href} className="block rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 line-clamp-2 text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
        </div>
        <Icon className={`h-5 w-5 shrink-0 ${iconClass}`} />
      </div>
      <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{detail}</p>
    </Link>
  );
}

function HeroMetric({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof DollarSign;
  tone: "success" | "info" | "warning" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
      : tone === "warning"
        ? "border-amber-500/24 bg-amber-500/12 text-amber-700 dark:text-amber-200"
        : tone === "info"
          ? "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-200"
          : "border-[var(--cliente-border)] bg-[var(--cliente-card)] text-[var(--cliente-card-text)]";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
          <p className="mt-3 text-3xl font-black leading-none tracking-normal">{value}</p>
          <p className="mt-2 text-xs opacity-75">{detail}</p>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
    </div>
  );
}

function BarLine({ value, max, className }: { value: number; max: number; className: string }) {
  return (
    <div className="h-2 rounded-full bg-[var(--cliente-border)]">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${Math.max(3, (value / max) * 100)}%` }} />
    </div>
  );
}

function ChannelRow({ item }: { item: AttributionGroup }) {
  return (
    <Link href={`/cliente/painel/crm?source=${encodeURIComponent(item.label)}`} className="block rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[var(--cliente-card-text)]">{channelLabel(item.label)}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.lastTouchLeads} contatos | {item.qualifiedLeads} qualificados | {item.wonLeads} vendas</p>
        </div>
        <StateBadge label={`${percent(item.winRate)}`} tone={item.wonLeads > 0 ? "success" : "neutral"} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="Gasto" value={compactCurrency(item.spend)} />
        <MiniStat label="CPL" value={currency(item.cpl)} />
        <MiniStat label="Reuniões" value={String(item.meetings)} />
      </div>
    </Link>
  );
}

function CampaignRow({ item }: { item: AttributionGroup }) {
  return (
    <div className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{item.label}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.source || "Origem não informada"}</p>
        </div>
        <StateBadge label={`${item.lastTouchLeads} contatos`} tone="info" />
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <MiniStat label="Gasto" value={compactCurrency(item.spend)} />
        <MiniStat label="Qualificados" value={String(item.qualifiedLeads)} />
        <MiniStat label="Vendas" value={String(item.wonLeads)} />
        <MiniStat label="Custo/venda" value={item.costPerSale ? currency(item.costPerSale) : "-"} />
      </div>
    </div>
  );
}

function OperationalRow({ href, label, value, tone }: { href: string; label: string; value: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 transition hover:bg-[var(--cliente-surface-hover)]">
      <p className="text-sm font-bold text-[var(--cliente-card-text)]">{label}</p>
      <StateBadge label={value} tone={tone} />
    </Link>
  );
}

function SimpleStat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof DollarSign }) {
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[14px] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="text-xs text-[var(--cliente-card-text-soft)]">{label}</p>
        <p className="text-sm font-black text-[var(--cliente-card-text)]">{value}</p>
      </div>
    </div>
  );
}

function Shortcut({ href, icon: Icon, label }: { href: string; icon: typeof Megaphone; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]">
      <Icon className="h-4 w-4 text-[var(--cliente-primary)]" />
      {label}
    </Link>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-xs font-black text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}
