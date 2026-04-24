"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  BarChart3,
  ChartNoAxesCombined,
  CircleGauge,
  Download,
  Loader2,
  Radar,
  RefreshCw,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import { getBusinessProfile, type BusinessProfileId } from "@/lib/business-profiles";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type MetricsSummaryResponse = {
  rangeDays?: number;
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
  comparisons?: {
    leadsDeltaPct?: number;
    conversionDeltaPct?: number;
    roiDeltaPct?: number;
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
  conversationChannels?: Array<{
    channel: string;
    total: number;
  }>;
  trafficSeries?: Array<{
    key: string;
    label: string;
    spend: number;
    leads: number;
    clicks: number;
    impressions: number;
  }>;
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
  windows?: {
    current?: { start?: string; end?: string };
    previous?: { start?: string; end?: string };
  };
  error?: string;
};

type TenantSettingsResponse = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

type ReadinessPayload = {
  summary?: {
    readinessScore?: number;
    operationalStatus?: "healthy" | "degraded" | "down";
  };
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

type PrioritySignal = {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  badge: string;
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value: number) {
  return `${value.toFixed(1)}%`;
}

function deltaLabel(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function latencyLabel(value: number) {
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatDateRange(start?: string, end?: string) {
  if (!start || !end) return "janela indisponivel";
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  return `${startDate.toLocaleDateString("pt-BR")} - ${endDate.toLocaleDateString("pt-BR")}`;
}

function channelLabel(value: string) {
  if (value === "whatsapp") return "WhatsApp";
  if (value === "instagram") return "Instagram";
  if (value === "facebook") return "Facebook";
  if (value === "messenger") return "Messenger";
  if (value === "google_ads") return "Google Ads";
  if (value === "meta_ads") return "Meta Ads";
  if (value === "site") return "Site";
  if (value === "site_chat") return "Site Chat";
  if (value === "site_form") return "Site Form";
  if (value === "nao_informado") return "Nao informado";
  return value.replaceAll("_", " ");
}

function queueHref(filter: "all" | "sla_breached" | "unassigned" | "assigned_waiting" | "assigned" | "triage") {
  if (filter === "all") return "/cliente/painel/inbox";
  return `/cliente/painel/inbox?queue=${encodeURIComponent(filter)}`;
}

export default function ClienteMetricasPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
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
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const canSyncCampaigns = hasCapability("manage_channels");
  const allowAdvanced = experienceMode === "completo";

  const loadMetrics = useCallback(async (silent = false) => {
    if (!tenant?.tenantId) return;

    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const [res, settingsRes, readinessRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary?rangeDays=${rangeDays}`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
        authedFetch(`/api/tenant/${tenant.tenantId}/readiness`),
      ]);
      const payload = (await res.json()) as MetricsSummaryResponse;
      const settingsPayload = (await settingsRes.json()) as TenantSettingsResponse;
      const readinessPayload = (await readinessRes.json()) as ReadinessPayload;

      if (!res.ok) {
        if (!silent) setError(payload.error || "Falha ao carregar metricas.");
        return;
      }

      setData(payload);
      setReadiness(readinessRes.ok ? readinessPayload : {});
      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setError(null);
    } catch {
      if (!silent) setError("Falha ao carregar metricas.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [rangeDays, tenant?.tenantId]);

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
      const payload = (await res.json()) as { error?: string; synced?: number; failed?: number };

      if (!res.ok) {
        setError(payload.error || "Falha ao sincronizar campanhas.");
        return;
      }

      setNotice(`Sync concluido: ${payload.synced || 0} snapshot(s) atualizados.`);
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
      if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return `"${text.replaceAll('"', '""')}"`;
      }
      return text;
    };

    const lines: string[] = [];
    const pushRow = (...cols: unknown[]) => {
      lines.push(cols.map((col) => escapeCell(col)).join(","));
    };

    pushRow("secao", "campo", "valor", "detalhe");
    pushRow("operacao", "status_operacional", operationalStatus, operationalHealth.reason || "");
    pushRow("operacao", "score_readiness", readiness.summary?.readinessScore || 0, "go-live");
    pushRow("funil", "leads", metrics.totalLeads || 0, "");
    pushRow("funil", "ganhos", metrics.wonLeads || 0, "");
    pushRow("funil", "conversao_pct", Number(metrics.conversionRate || 0).toFixed(2), "");
    pushRow("ia", "responded", ai.responded || 0, "");
    pushRow("ia", "handoff", ai.handoff || 0, "");
    pushRow("ia", "ask_more", ai.askMore || 0, "");
    pushRow("ia", "falhas_skip", ai.skipped || 0, "");
    pushRow("midia", "investimento", Number(traffic.spend || 0).toFixed(2), "BRL");
    pushRow("midia", "leads", traffic.leads || 0, "");
    pushRow("midia", "cpl", Number(traffic.cpl || 0).toFixed(2), "BRL");
    pushRow("midia", "ctr_pct", Number(traffic.ctr || 0).toFixed(2), "");
    pushRow("operacao", "sla_vencido", operations.overdueChats || 0, "");
    pushRow("operacao", "sem_dono", operations.unassignedChats || 0, "");

    for (const alert of todayActions) {
      pushRow("alerta", alert.title, alert.detail, `${alert.cause} | Acao: ${alert.action}`);
    }

    const csvContent = `${lines.join("\n")}\n`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const tenantId = tenant?.tenantId || "tenant";
    anchor.href = url;
    anchor.download = `cockpit-executivo-${tenantId}-${rangeDays}d.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  const metrics = data.metrics || {};
  const traffic = data.traffic || {};
  const comparisons = data.comparisons || {};
  const funnel = useMemo(() => data.funnel || [], [data.funnel]);
  const channels = data.channels || [];
  const trafficSeries = useMemo(() => data.trafficSeries || [], [data.trafficSeries]);
  const ai = data.ai || {};
  const operations = data.operations || {};
  const queueBreakdown = operations.queueBreakdown || {};
  const aiBreakdown = operations.aiBreakdown || {};
  const channelOperations = operations.channelOperations || [];
  const windows = data.windows || {};
  const operationalHealth = readiness.operationalHealth || {};
  const operationalStatus = operationalHealth.status || readiness.summary?.operationalStatus || "healthy";
  const operationalAlerts = useMemo(() => readiness.operationalAlerts || [], [readiness.operationalAlerts]);
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);

  const maxSpend = useMemo(() => Math.max(1, ...trafficSeries.map((item) => item.spend || 0)), [trafficSeries]);
  const maxFunnel = useMemo(() => Math.max(1, ...funnel.map((item) => item.total || 0)), [funnel]);
  const totalAiInteractions = useMemo(
    () => (ai.responded || 0) + (ai.askMore || 0) + (ai.handoff || 0) + (ai.skipped || 0),
    [ai.askMore, ai.handoff, ai.responded, ai.skipped]
  );
  const goodSignals = useMemo(() => {
    const items: string[] = [];
    if (Number(metrics.conversionRate || 0) >= 15) items.push("Conversao acima da linha minima esperada.");
    if (Number(metrics.avgFirstResponseMinutes || 0) > 0 && Number(metrics.avgFirstResponseMinutes || 0) <= 5) {
      items.push("Tempo de resposta dentro da meta operacional.");
    }
    if (Number(ai.responded || 0) >= Number(ai.handoff || 0)) items.push("IA sustentando atendimento sem excesso de transferencia.");
    if (operationalStatus === "healthy") items.push("Saude operacional estavel para escalar operacao.");
    return items.slice(0, 3);
  }, [ai.handoff, ai.responded, metrics.avgFirstResponseMinutes, metrics.conversionRate, operationalStatus]);

  const todayActions = useMemo(() => {
    const mapped = operationalAlerts.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      cause: item.probableCause,
      action: item.recommendedAction,
      href: item.href,
      tone: item.severity === "high" ? ("danger" as const) : item.severity === "warning" ? ("warning" as const) : ("info" as const),
      badge: item.type.replaceAll("_", " "),
    }));
    return mapped.slice(0, 5);
  }, [operationalAlerts]);
  const prioritySignals = useMemo<PrioritySignal[]>(() => {
    const items: PrioritySignal[] = [];

    if (Number(operations.overdueChats || 0) > 0) {
      items.push({
        id: "sla",
        title: "SLA vencido acima do ideal",
        detail: `${operations.overdueChats || 0} conversas precisam de resposta imediata.`,
        href: "/cliente/painel/inbox?queue=sla_breached",
        tone: "danger",
        badge: "urgente",
      });
    }

    if (Number(operations.unassignedChats || 0) > 0) {
      items.push({
        id: "unassigned",
        title: "Fila sem responsavel",
        detail: `${operations.unassignedChats || 0} conversas ainda nao foram distribuidas.`,
        href: "/cliente/painel/inbox?queue=unassigned",
        tone: "warning",
        badge: "fila",
      });
    }

    if (Number(metrics.avgFirstResponseMinutes || 0) > 5) {
      items.push({
        id: "response_time",
        title: "Tempo de resposta acima da meta",
        detail: `${Number(metrics.avgFirstResponseMinutes || 0).toFixed(1)} min de media no periodo.`,
        href: "/cliente/painel/inbox?queue=assigned_waiting",
        tone: "warning",
        badge: "tempo",
      });
    }

    if (Number(metrics.conversionRate || 0) < 10 && Number(metrics.totalLeads || 0) > 0) {
      items.push({
        id: "conversion",
        title: "Conversao abaixo do esperado",
        detail: `${percent(Number(metrics.conversionRate || 0))} de conversao na janela atual.`,
        href: "/cliente/painel/crm",
        tone: "info",
        badge: "funil",
      });
    }

    if (Number(ai.handoff || 0) > Number(ai.responded || 0)) {
      items.push({
        id: "ai_handoff",
        title: "IA escalando em excesso",
        detail: `${ai.handoff || 0} transferencias contra ${ai.responded || 0} respostas automaticas.`,
        href: "/cliente/painel/ia",
        tone: "warning",
        badge: "ia",
      });
    }

    if (Number(metrics.roi || 0) < 1 && Number(traffic.spend || 0) > 0) {
      items.push({
        id: "roi",
        title: "ROI abaixo de 1x",
        detail: `${Number(metrics.roi || 0).toFixed(2)}x na janela atual com ${currency(Number(traffic.spend || 0))} investidos.`,
        href: "/cliente/painel/comercial?financeStatus=pago",
        tone: "warning",
        badge: "retorno",
      });
    }

    return items.slice(0, 5);
  }, [
    ai.handoff,
    ai.responded,
    metrics.avgFirstResponseMinutes,
    metrics.conversionRate,
    metrics.roi,
    metrics.totalLeads,
    operations.overdueChats,
    operations.unassignedChats,
    traffic.spend,
  ]);

  useEffect(() => {
    const nextRange = RANGE_OPTIONS.includes(rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      ? (rangeFromQuery as (typeof RANGE_OPTIONS)[number])
      : 30;
    setRangeDays((current) => (current === nextRange ? current : nextRange));
  }, [rangeFromQuery]);

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
    <div className="client-daily-page space-y-4">
      <SectionHeader
        title="Metricas"
        subtitle="Leitura clara de desempenho, atendimento e operacao para decidir rapido o que manter e o que ajustar."
        action={
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handleRangeChange(option)}
                className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                  rangeDays === option
                    ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-panel-soft)]"
                }`}
              >
                {option} dias
              </button>
            ))}
            {canSyncCampaigns ? (
              <button
                type="button"
                onClick={handleSyncCampaigns}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Atualizar campanhas
              </button>
            ) : null}
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar CSV
            </button>
            <StateBadge
              label={`situacao ${operationalStatus}`}
              tone={operationalStatus === "down" ? "danger" : operationalStatus === "degraded" ? "warning" : "success"}
            />
            <button
              type="button"
              onClick={() => setExperienceMode(allowAdvanced ? "essencial" : "completo")}
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              {allowAdvanced ? "Modo essencial" : "Modo completo"}
            </button>
          </div>
        }
      />

      {notice ? <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{notice}</div> : null}
      {!allowAdvanced ? (
        <PanelCard className="p-5">
          <CardTitle
            title="Modo essencial ativo"
            subtitle="Exibindo apenas KPIs e alertas principais para leitura diaria mais rapida."
          />
          <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
            Para abrir funil completo, canais, motor de IA e visoes por equipe, ative o modo completo.
          </p>
          <button
            type="button"
            onClick={() => setExperienceMode("completo")}
            className="mt-4 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
          >
            Abrir modo completo
          </button>
        </PanelCard>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <CardTitle title="O que esta bom" subtitle="Sinais positivos para manter no plano de hoje." />
          <div className="mt-4 space-y-3">
            {goodSignals.length === 0 ? (
              <EmptyState title="Sem sinais fortes nesta janela" description="A operacao esta mista; vale priorizar os alertas para recuperar ritmo." />
            ) : (
              goodSignals.map((signal, index) => (
                <div key={`${signal}_${index}`} className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                  <p className="text-sm text-emerald-100">{signal}</p>
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="O que agir hoje" subtitle="Alertas com causa raiz e acao recomendada para destravar resultado." />
          <div className="mt-4 space-y-3">
            {todayActions.length === 0 ? (
              <EmptyState title="Sem alertas criticos" description="Nenhum alerta de quota, auth, canal ou conversao na janela atual." />
            ) : (
              todayActions.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                      <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Causa: {item.cause}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Acao recomendada: {item.action}</p>
                    </div>
                    <StateBadge label={item.badge} tone={item.tone} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Link href="/cliente/painel/crm" className="block">
          <MetricCard
            label="Contatos"
            value={String(metrics.totalLeads || 0)}
            icon={ChartNoAxesCombined}
            trend={deltaLabel(Number(comparisons.leadsDeltaPct || 0))}
          />
        </Link>
        <Link href="/cliente/painel/crm?stage=ganho" className="block">
          <MetricCard
            label="Conversao"
            value={percent(Number(metrics.conversionRate || 0))}
            icon={Radar}
            trend={deltaLabel(Number(comparisons.conversionDeltaPct || 0))}
          />
        </Link>
        <Link href="/cliente/painel/inbox" className="block">
          <MetricCard
            label="Tempo medio"
            value={`${Number(metrics.avgFirstResponseMinutes || 0).toFixed(1)} min`}
            icon={CircleGauge}
            trend={`${metrics.conversations || 0} conversas`}
          />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pago" className="block">
          <MetricCard
            label="ROI"
            value={`${Number(metrics.roi || 0).toFixed(2)}x`}
            icon={ArrowUpRight}
            trend={deltaLabel(Number(comparisons.roiDeltaPct || 0))}
          />
        </Link>
        <Link href="/cliente/painel/comercial?financeStatus=pago" className="block">
          <MetricCard
            label="Receita"
            value={currency(Number(metrics.paidRevenue || 0))}
            icon={BarChart3}
            trend={`investimento ${currency(Number(traffic.spend || 0))}`}
          />
        </Link>
        <Link href="/cliente/painel/logs" className="block">
          <MetricCard
            label="Operacao"
            value={operationalStatus}
            icon={ChartNoAxesCombined}
            trend={operationalHealth.reason || "situacao operacional"}
          />
        </Link>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <CardTitle title="Alertas executivos" subtitle="O que pede decisao ou acao do time agora" />
          <div className="mt-4 space-y-3">
            {prioritySignals.length === 0 ? (
              <EmptyState
                title="Sem gargalos relevantes nesta janela"
                description="A operacao esta sem sinais criticos de fila, IA ou retorno no periodo atual."
              />
            ) : (
              prioritySignals.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
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
          <CardTitle title="Resumo de janela" subtitle="Comparacao rapida para compartilhamento e decisao" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <InsightCard
              href="/cliente/painel/metricas"
              title="Janela atual"
              value={formatDateRange(windows.current?.start, windows.current?.end)}
              detail="dados considerados"
            />
            <InsightCard
              href="/cliente/painel/metricas"
              title="Janela anterior"
              value={formatDateRange(windows.previous?.start, windows.previous?.end)}
              detail="base de comparacao"
            />
            <InsightCard
              href="/cliente/painel/crm?stage=ganho"
              title="Contatos ganhos"
              value={String(metrics.wonLeads || 0)}
              detail="oportunidades convertidas"
            />
            <InsightCard
              href="/cliente/painel/inbox"
              title="Conversas abertas"
              value={String(metrics.conversations || 0)}
              detail="atendimento em andamento"
            />
          </div>
        </PanelCard>
      </section>

      {allowAdvanced ? (
        <>
      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <PanelCard className="p-5">
          <CardTitle title={`Modo do negocio: ${businessProfile.label}`} subtitle="Leitura operacional do tenant para contextualizar os KPIs desta janela." />
          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{businessProfile.description}</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Movimento central: {businessProfile.commercialMotion}</p>
              </div>
              <StateBadge label={businessProfile.id} tone="info" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Metricas naturais</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.metrics.join(" | ")}</p>
              </div>
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Campos que mais pesam no CRM</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.crm.leadFields.join(" | ")}</p>
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Leitura executiva do modo" subtitle="Como interpretar desempenho deste tenant a partir do perfil operacional ativo." />
          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <ul className="space-y-2 text-sm text-[var(--cliente-card-text-muted)]">
              <li>Olhe primeiro para: {businessProfile.metrics.slice(0, 2).join(" e ")}.</li>
              <li>O atendimento deve conduzir o contato para: {businessProfile.pipeline.stages.slice(1, 3).join(" -> ")}.</li>
              <li>O CRM precisa capturar contexto em: {businessProfile.crm.leadFields.slice(0, 3).join(", ")}.</li>
            </ul>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <PanelCard className="p-5">
          <CardTitle title="Saude da operacao" subtitle="Backlog, SLA e distribuicao em tempo real" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Link href={queueHref("all")} className="block">
              <MetricTile label="Fila ativa" value={String(operations.activeChats || 0)} tone="info" />
            </Link>
            <Link href={queueHref("sla_breached")} className="block">
              <MetricTile label="SLA vencido" value={String(operations.overdueChats || 0)} tone="warning" />
            </Link>
            <Link href={queueHref("unassigned")} className="block">
              <MetricTile label="Sem dono" value={String(operations.unassignedChats || 0)} tone="danger" />
            </Link>
            <Link href="/cliente/painel/inbox?status=pending" className="block">
              <MetricTile label="Pendentes" value={String(operations.pendingChats || 0)} tone="neutral" />
            </Link>
            <Link href={queueHref("assigned")} className="block">
              <MetricTile label="Em atendimento" value={String(queueBreakdown.assigned || 0)} tone="success" />
            </Link>
            <Link href={queueHref("assigned_waiting")} className="block">
              <MetricTile
                label="Aguardando resposta"
                value={String(queueBreakdown.assignedWaiting || 0)}
                tone="warning"
              />
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link href="/cliente/painel/inbox?ai=ai_active" className="block">
              <MetricTile label="IA ativa" value={String(aiBreakdown.active || 0)} tone="success" />
            </Link>
            <Link href="/cliente/painel/inbox?ai=ai_paused" className="block">
              <MetricTile label="IA pausada" value={String(aiBreakdown.paused || 0)} tone="warning" />
            </Link>
            <Link href="/cliente/painel/inbox?ai=human_owned" className="block">
              <MetricTile label="Atendimento humano" value={String(aiBreakdown.humanOwned || 0)} tone="danger" />
            </Link>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Produtividade da equipe" subtitle="Carga operacional e resultado comercial por operador" />
          <div className="mt-4 space-y-3">
            {(operations.teamPerformance || []).length ? (
              (operations.teamPerformance || []).map((owner) => (
                <Link
                  key={owner.ownerId}
                  href={`/cliente/painel/inbox?assignedUser=${encodeURIComponent(owner.ownerId)}`}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{owner.ownerName}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        {owner.activeChats} chats ativos | {owner.totalLeads} contatos no periodo
                      </p>
                    </div>
                    <StateBadge
                      label={`${owner.winRate.toFixed(1)}% taxa de ganho`}
                      tone={owner.winRate >= 20 ? "success" : owner.winRate > 0 ? "info" : "neutral"}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-[var(--cliente-card-text-muted)] sm:grid-cols-3">
                    <div>
                      Ganhos: <span className="text-[var(--cliente-card-text)]">{owner.wonLeads}</span>
                    </div>
                    <div>
                      Pendentes: <span className="text-[var(--cliente-card-text)]">{owner.pendingChats}</span>
                    </div>
                    <div>
                      SLA vencido: <span className="text-[var(--cliente-card-text)]">{owner.overdueChats}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
                    Transferencias: <span className="text-[var(--cliente-card-text)]">{owner.handoffChats}</span>
                  </div>
                </Link>
              ))
            ) : (
              <EmptyState
                title="Sem produtividade consolidada"
                description="Assim que os operadores assumirem contatos e conversas, a distribuicao passa a aparecer aqui."
              />
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <PanelCard className="p-5">
          <CardTitle title="Canais de atendimento" subtitle="Distribuicao atual das conversas por canal" />
          <div className="mt-4 space-y-2">
            {channelOperations.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-muted)]">Nenhum canal conversacional encontrado.</p>
            ) : (
              channelOperations.map((channel) => (
                <Link
                  key={channel.channel}
                  href={`/cliente/painel/inbox?channel=${encodeURIComponent(channel.channel)}`}
                  className="flex items-center justify-between rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--cliente-card-text)]">{channelLabel(channel.channel)}</p>
                    <p className="text-xs text-[var(--cliente-card-text-soft)]">
                      {channel.activeChats} ativos | {channel.unassignedChats} sem dono | {channel.overdueChats} em SLA
                    </p>
                  </div>
                  <StateBadge
                    label={`${channel.handoffChats} transferencia`}
                    tone={channel.handoffChats > 0 ? "warning" : "neutral"}
                  />
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Leitura de atendimento" subtitle="Peso atual do chat do site e transferencias na operacao" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/cliente/painel/inbox?channel=site_chat" className="block">
              <MetricTile label="Chat do site" value={String(metrics.siteChatConversations || 0)} tone="info" />
            </Link>
            <Link href="/cliente/painel/inbox" className="block">
              <MetricTile label="Transferencias" value={String(metrics.handoffChats || 0)} tone="warning" />
            </Link>
          </div>
          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Leitura rapida</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              {Number(metrics.siteChatConversations || 0) > 0
                ? "O chat do site ja participa da operacao e deve entrar na rotina de monitoramento do inbox."
                : "Ainda nao ha conversas de chat do site ativas nesta base."}
            </p>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <CardTitle title="Serie de trafego e contatos" subtitle={formatDateRange(windows.current?.start, windows.current?.end)} />
            <StateBadge label={`${rangeDays} dias`} tone="info" />
          </div>

          <div className="mt-4 space-y-3">
            {trafficSeries.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-muted)]">Sem serie para o periodo selecionado.</p>
            ) : (
              trafficSeries.map((point) => (
                <div key={point.key} className="grid grid-cols-[60px_1fr_auto] items-center gap-3">
                  <span className="text-xs text-[var(--cliente-card-text-soft)]">{point.label}</span>
                  <div className="h-2 rounded-full bg-[var(--cliente-border)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--cliente-accent)] to-[var(--cliente-accent)]/70"
                      style={{ width: `${Math.max(4, (point.spend / maxSpend) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-[var(--cliente-card-text-muted)]">
                    {currency(point.spend)} | {point.leads} contatos
                  </span>
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Performance de trafego" subtitle="Resumo consolidado da janela selecionada" />
          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--cliente-border)]">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Impressoes" value={String(traffic.impressions || 0)} />
                <Row label="Cliques" value={String(traffic.clicks || 0)} />
                <Row label="Contatos atribuidos" value={String(traffic.leads || 0)} />
                <Row label="CTR" value={percent(Number(traffic.ctr || 0))} />
                <Row label="CPC" value={currency(Number(traffic.cpc || 0))} />
                <Row label="CPL" value={currency(Number(traffic.cpl || 0))} />
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href={`/cliente/painel/metricas?range=${rangeDays}`} className="block">
              <InsightCard
                title="Variacao de investimento"
                value={deltaLabel(Number(comparisons.spendDeltaPct || 0))}
                detail="versus janela anterior"
              />
            </Link>
            <Link href="/cliente/painel/crm" className="block">
              <InsightCard title="Crescimento" value={percent(Number(metrics.growth || 0))} detail="captacao comparada" />
            </Link>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <PanelCard className="p-5">
          <CardTitle title="Funil comercial" subtitle="Distribuicao por etapa e valor potencial" />
          <div className="mt-4 space-y-3">
            {funnel.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-muted)]">Sem dados de funil para este tenant.</p>
            ) : (
              funnel.map((stage) => (
                <Link
                  key={stage.stage}
                  href={`/cliente/painel/crm?stage=${encodeURIComponent(stage.stage)}`}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-[var(--cliente-card-text)]">{stage.label}</span>
                    <span className="text-[var(--cliente-card-text-muted)]">{stage.total} contatos</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[var(--cliente-border)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--cliente-accent)] to-[var(--cliente-accent)]/70"
                      style={{ width: `${Math.max(4, (stage.total / maxFunnel) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--cliente-card-text-soft)]">
                    <span>Volume relativo do funil</span>
                    <span>{currency(Number(stage.value || 0))}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Canais com retorno" subtitle="Origem, volume e taxa de ganho" />
          <div className="mt-4 space-y-2">
            {channels.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-muted)]">Ainda nao ha canais suficientes para comparacao.</p>
            ) : (
              channels.map((channel) => (
                <Link
                  key={channel.channel}
                  href={`/cliente/painel/inbox?channel=${encodeURIComponent(channel.channel)}`}
                  className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-[var(--cliente-card-text)]">{channelLabel(channel.channel)}</p>
                      <p className="text-xs text-[var(--cliente-card-text-soft)]">{channel.total} contatos na janela atual</p>
                    </div>
                    <StateBadge
                      label={`${channel.won} ganhos`}
                      tone={channel.won > 0 ? "success" : "neutral"}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <MiniStat label="Conversao" value={percent(Number(channel.conversionRate || 0))} />
                    <MiniStat label="Volume" value={String(channel.total || 0)} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <PanelCard className="p-5">
          <CardTitle title="Motor de IA" subtitle="Resposta automatica, transferencia e latencia do agente" />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href="/cliente/painel/ia" className="block">
              <MetricTile label="Respondeu" value={String(ai.responded || 0)} tone="info" />
            </Link>
            <Link href="/cliente/painel/ia" className="block">
              <MetricTile label="Pediu contexto" value={String(ai.askMore || 0)} tone="warning" />
            </Link>
            <Link href="/cliente/painel/inbox" className="block">
              <MetricTile label="Transferencia" value={String(ai.handoff || 0)} tone="danger" />
            </Link>
            <Link href="/cliente/painel/ia" className="block">
              <MetricTile label="Ignorou" value={String(ai.skipped || 0)} tone="neutral" />
            </Link>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-[var(--cliente-border)]">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Confianca media" value={percent(Number((ai.avgConfidence || 0) * 100))} />
                <Row label="Latencia media" value={latencyLabel(Number(ai.avgLatencyMs || 0))} />
                <Row label="Interacoes analisadas" value={String(totalAiInteractions)} />
                <Row label="Conversas com transferencia" value={String(metrics.handoffChats || 0)} />
              </tbody>
            </table>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Leitura executiva" subtitle="Resumo para gestor em uma unica vista" />
          <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Diagnostico rapido</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--cliente-card-text-muted)]">
              <li>
                {Number(metrics.conversionRate || 0) >= 15
                  ? "Conversao do funil acima da linha minima esperada."
                  : "Conversao ainda baixa; revisar qualificacao e velocidade de resposta."}
              </li>
              <li>
                {Number(metrics.avgFirstResponseMinutes || 0) <= 5
                  ? "Tempo de primeira resposta competitivo para operacao inbound."
                  : "Tempo de primeira resposta pede ajuste em distribuicao ou automacao."}
              </li>
              <li>
                {Number(ai.handoff || 0) > Number(ai.responded || 0)
                  ? "IA esta transferindo mais do que deveria; revisar guardrails e base de conhecimento."
                  : "IA sustentando boa parte do atendimento sem excesso de transferencia."}
              </li>
            </ul>
          </div>
        </PanelCard>
      </section>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-[var(--cliente-border)] last:border-none">
      <td className="px-3 py-2 text-[var(--cliente-card-text-muted)]">{label}</td>
      <td className="px-3 py-2 text-right font-medium text-[var(--cliente-card-text)]">{value}</td>
    </tr>
  );
}

function InsightCard({
  href,
  title,
  value,
  detail,
}: {
  href?: string;
  title: string;
  value: string;
  detail: string;
}) {
  const content = (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{title}</p>
      <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );

  if (!href) return content;
  return <Link href={href}>{content}</Link>;
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  return (
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{label}</p>
        <StateBadge label={label} tone={tone} />
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}


