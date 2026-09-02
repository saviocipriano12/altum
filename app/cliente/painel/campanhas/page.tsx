"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bot,
  DollarSign,
  Globe2,
  Loader2,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  CardTitle,
  EmptyState,
  MetricCard,
  PanelCard,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type CampaignStatus = "draft" | "active" | "paused";

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  channel: "whatsapp";
  messageTemplate: string;
  maxRecipients: number;
  filters: {
    stageIds: string[];
    ownerIds: string[];
    sources: string[];
    tags: string[];
    heat: string[];
  };
  lastRunAt?: string | null;
  lastRunSummary?: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  } | null;
};


type RunItem = {
  id: string;
  campaignId: string;
  campaignName: string;
  createdAt?: string | null;
  summary: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  };
};


type PaidCampaign = {
  key: string;
  label: string;
  source?: string | null;
  lastTouchLeads: number;
  firstTouchLeads?: number;
  assistedLeads?: number;
  qualifiedLeads: number;
  wonLeads: number;
  meetings: number;
  hotLeads?: number;
  qualityRate?: number;
  winRate?: number;
  spend: number;
  clicks: number;
  impressions: number;
  paidLeads: number;
  cpl: number;
  qualifiedCpl: number;
  costPerMeeting: number;
  costPerSale: number;
};

type MetricsSummary = {
  metrics?: {
    totalLeads: number;
    qualifiedLeads: number;
    meetings: number;
    wonLeads: number;
    paidRevenue: number;
    roi: number;
    conversations?: number;
    handoffChats?: number;
  };
  traffic?: {
    impressions: number;
    clicks: number;
    spend: number;
    leads: number;
    ctr: number;
    cpc: number;
    cpl: number;
  };
  commercialAttribution?: {
    byCampaign?: PaidCampaign[];
    byChannel?: Array<PaidCampaign & { campaignCount?: number | null }>;
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
    aiBreakdown?: {
      active?: number;
      paused?: number;
      humanOwned?: number;
    };
  };
};

type ConversionHealthItem = {
  channelId: string;
  type: "meta_ads" | "google_ads";
  displayName: string;
  ready: boolean;
  status: string;
  issues: string[];
  configuredEvents: string[];
  recent: {
    processed: number;
    failed: number;
    claimed: number;
    skipped: number;
    total: number;
    lastStatus?: string;
    lastError?: string;
    lastEventAt?: string | null;
  };
};

type ConversionHealthResponse = {
  checkedAt?: string;
  ok?: boolean;
  summary?: {
    total: number;
    ready: number;
    failedRecent: number;
    processedRecent: number;
  };
  issues?: string[];
  items?: ConversionHealthItem[];
  error?: string;
};

type CampaignOverviewItem = {
  key: string;
  campaignId: string;
  name: string;
  platform: string;
  channelId: string;
  accountLabel: string;
  status: "active" | "idle" | "stale";
  latestDateRef: string;
  last7: { impressions: number; clicks: number; spend: number; leads: number };
  last30: { impressions: number; clicks: number; spend: number; leads: number };
  cpl30: number;
  cpc30: number;
};

type CampaignOverviewResponse = {
  checkedAt?: string;
  summary?: {
    total: number;
    active: number;
    idle: number;
    stale: number;
    spend30: number;
    leads30: number;
  };
  items?: CampaignOverviewItem[];
  error?: string;
};

type CaptureFormsPayload = {
  forms?: Array<{
    id: string;
    name: string;
    status?: string;
    submissionsCount?: number;
    lastSubmissionAt?: string | null;
  }>;
  recentSubmissions?: Array<{
    id: string;
    formName: string;
    leadName: string;
    createdAt?: string | null;
  }>;
  topCampaigns?: Array<{ label: string; total: number }>;
  formPerformance?: Array<{ id: string; name: string; total: number; lastSubmissionAt?: string | null }>;
};

type CatalogDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  content?: string;
  mediaUrl?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
};

function formatDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleString("pt-BR");
}

function money(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value?: number | null) {
  return `${Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export default function ClienteCampanhasPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations");
  const canSyncCampaigns = hasCapability("view_metrics") || hasCapability("manage_channels");

  const [loading, setLoading] = useState(true);
  const [syncingCampaigns, setSyncingCampaigns] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [conversionHealth, setConversionHealth] = useState<ConversionHealthResponse | null>(null);
  const [campaignOverview, setCampaignOverview] = useState<CampaignOverviewResponse | null>(null);
  const [formsPayload, setFormsPayload] = useState<CaptureFormsPayload | null>(null);
  const [catalogDocs, setCatalogDocs] = useState<CatalogDoc[]>([]);
  const paidCampaigns = useMemo(() => metrics?.commercialAttribution?.byCampaign || [], [metrics?.commercialAttribution?.byCampaign]);
  const activeForms = formsPayload?.forms?.filter((form) => form.status === "active").length || 0;
  const totalFormSubmissions = formsPayload?.forms?.reduce((sum, form) => sum + Number(form.submissionsCount || 0), 0) || 0;
  const growthSnapshot = useMemo(() => {
    const bestPaidCampaign =
      [...paidCampaigns].sort((a, b) => {
        const saleDiff = Number(b.wonLeads || 0) - Number(a.wonLeads || 0);
        if (saleDiff !== 0) return saleDiff;
        const meetingDiff = Number(b.meetings || 0) - Number(a.meetings || 0);
        if (meetingDiff !== 0) return meetingDiff;
        return Number(b.lastTouchLeads || 0) - Number(a.lastTouchLeads || 0);
      })[0] || null;
    const activeOutbound = items.find((item) => item.status === "active") || items[0] || null;
    const latestForm =
      [...(formsPayload?.forms || [])].sort((a, b) => {
        const aDate = a.lastSubmissionAt ? new Date(a.lastSubmissionAt).getTime() : 0;
        const bDate = b.lastSubmissionAt ? new Date(b.lastSubmissionAt).getTime() : 0;
        return bDate - aDate;
      })[0] || null;
    const readyConnectors = conversionHealth?.summary?.ready || 0;
    const failedRecent = conversionHealth?.summary?.failedRecent || 0;
    const conversionReady = paidCampaigns.length > 0 && (metrics?.traffic?.leads || 0) > 0 && readyConnectors > 0 && failedRecent === 0;

    return {
      bestPaidCampaign,
      activeOutbound,
      latestForm,
      conversionReady,
    };
  }, [conversionHealth?.summary?.failedRecent, conversionHealth?.summary?.ready, formsPayload?.forms, items, metrics?.traffic?.leads, paidCampaigns]);

  const conversionHealthSummary = useMemo(() => {
    const total = conversionHealth?.summary?.total || 0;
    const ready = conversionHealth?.summary?.ready || 0;
    const failed = conversionHealth?.summary?.failedRecent || 0;
    const processed = conversionHealth?.summary?.processedRecent || 0;
    const issues = conversionHealth?.issues || [];
    if (!total) {
      return {
        label: "Sem pixel conectado",
        detail: "Meta Ads ou Google Ads ainda nao estao prontos para receber conversoes.",
        tone: "warning" as const,
        total,
        ready,
        failed,
        processed,
        issues,
      };
    }
    if (ready === total && failed === 0) {
      return {
        label: "Retorno saudavel",
        detail: `${processed} conversao(oes) processada(s) recentemente.`,
        tone: "success" as const,
        total,
        ready,
        failed,
        processed,
        issues,
      };
    }
    return {
      label: ready > 0 ? "Ajuste recomendado" : "Retorno pendente",
      detail: issues[0] || "Revise os conectores antes de escalar investimento.",
      tone: failed > 0 ? ("danger" as const) : ("warning" as const),
      total,
      ready,
      failed,
      processed,
      issues,
    };
  }, [conversionHealth]);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const campaignsRes = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`);
      const campaignsPayload = (await campaignsRes.json()) as { items?: Campaign[]; runs?: RunItem[]; error?: string };
      if (!campaignsRes.ok) {
        setError(campaignsPayload.error || "Falha ao carregar campanhas outbound.");
        setItems([]);
        setRuns([]);
        return;
      }

      setItems(campaignsPayload.items || []);
      setRuns(campaignsPayload.runs || []);
      void Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/metrics-summary?rangeDays=30`),
        authedFetch(`/api/tenant/${tenant.tenantId}/capture/forms`),
        authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/conversions/health`),
        authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/overview`),
      ]).then(async ([metricsRes, formsRes, kbRes, conversionHealthRes, campaignOverviewRes]) => {
        const [metricsPayload, formsData, kbPayload, conversionHealthPayload, campaignOverviewPayload] = await Promise.all([
          metricsRes.json().catch(() => null) as Promise<MetricsSummary | null>,
          formsRes.json().catch(() => null) as Promise<CaptureFormsPayload | null>,
          kbRes.json().catch(() => ({})) as Promise<{ items?: CatalogDoc[] }>,
          conversionHealthRes.json().catch(() => null) as Promise<ConversionHealthResponse | null>,
          campaignOverviewRes.json().catch(() => null) as Promise<CampaignOverviewResponse | null>,
        ]);
        setMetrics(metricsRes.ok ? metricsPayload : null);
        setConversionHealth(conversionHealthRes.ok ? conversionHealthPayload : null);
        setCampaignOverview(campaignOverviewRes.ok ? campaignOverviewPayload : null);
        setFormsPayload(formsRes.ok ? formsData : null);
        setCatalogDocs((kbPayload.items || []).filter((item) => item.type === "catalog"));
      }).catch(() => undefined);
    } catch {
      setError("Falha ao carregar central de campanhas.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    const sent = items.reduce((sum, item) => sum + Number(item.lastRunSummary?.sent || 0), 0);
    const active = items.filter((item) => item.status === "active").length;
    return {
      total: items.length,
      active,
      sent,
      runs: runs.length,
      paidCampaigns: campaignOverview?.summary?.total || paidCampaigns.length,
      activePaidCampaigns: campaignOverview?.summary?.active || 0,
      spend: metrics?.traffic?.spend || 0,
      paidLeads: metrics?.traffic?.leads || 0,
    };
  }, [campaignOverview?.summary?.active, campaignOverview?.summary?.total, items, metrics?.traffic?.leads, metrics?.traffic?.spend, paidCampaigns.length, runs.length]);

  async function handleSyncPaidCampaigns() {
    if (!tenant?.tenantId || !canSyncCampaigns) return;
    setSyncingCampaigns(true);
    setError(null);
    setNotice(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/campaigns/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 30 }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string; synced?: number; failed?: number };
      if (!res.ok) {
        setError(payload.error || "Falha ao sincronizar campanhas.");
        return;
      }
      await loadData();
      setNotice(`Campanhas atualizadas: ${payload.synced || 0} fonte(s) sincronizada(s), ${payload.failed || 0} falha(s).`);
    } catch {
      setError("Falha ao sincronizar campanhas.");
    } finally {
      setSyncingCampaigns(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  return (
    <div className="campanhas-refined client-daily-page space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_52%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)] md:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Crescimento" tone="info" />
              <StateBadge label="Trafego -> venda" tone="ai" />
            </div>
            <h1 className="mt-4 max-w-3xl text-2xl font-extrabold leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-[2rem]">
              Campanhas conectadas ao atendimento e ao dinheiro.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-muted)]">
              Anuncios, UTMs, formularios, WhatsApp e ofertas em uma leitura comercial.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {canManage ? (
                <Link
                  href="/cliente/painel/disparos"
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[var(--cliente-primary-hover)]"
                >
                  <Plus className="h-4 w-4" />
                  Novo disparo
                </Link>
              ) : null}
              <Link
                href="/cliente/painel/captacao"
                className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)]"
              >
                Formularios e captacao
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              {canSyncCampaigns ? (
                <button
                  type="button"
                  onClick={() => void handleSyncPaidCampaigns()}
                  disabled={syncingCampaigns}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw className={syncingCampaigns ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                  Sincronizar anuncios
                </button>
              ) : null}
              <Link
                href="/cliente/painel/configuracoes/integracoes"
                className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:-translate-y-0.5 hover:bg-[var(--cliente-surface-hover)]"
              >
                Integracoes de anuncios
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <HeroStat label="Investimento 30d" value={money(summary.spend)} detail={`${summary.paidLeads} leads pagos registrados`} icon={DollarSign} tone="info" />
            <HeroStat label="WhatsApp ativo" value={`${summary.active}/${summary.total}`} detail={`${summary.sent} mensagens enviadas`} icon={MessageCircle} tone="success" />
          </div>
        </div>
      </section>

      {error ? <div className="rounded-[24px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">{error}</div> : null}
      {notice ? <div className="rounded-[24px] border border-emerald-400/18 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Campanhas pagas" value={String(summary.paidCampaigns)} icon={BarChart3} trend={`${summary.activePaidCampaigns} ativa(s) nos ultimos 7 dias`} tone="brand" />
        <MetricCard label="Gasto em midia" value={money(summary.spend)} icon={DollarSign} trend={`CPL ${money(metrics?.traffic?.cpl || 0)}`} tone="brand" />
        <MetricCard label="Campanhas WhatsApp" value={String(summary.total)} icon={Megaphone} trend={`${summary.active} ativa(s)`} tone="ai" />
        <MetricCard label="Retorno para pixels" value={`${conversionHealthSummary.ready}/${conversionHealthSummary.total}`} icon={ShieldCheck} trend={conversionHealthSummary.label} tone={conversionHealthSummary.tone === "danger" ? "danger" : conversionHealthSummary.tone} />
      </section>

      <GrowthCommandCenter
        bestPaidCampaign={growthSnapshot.bestPaidCampaign}
        activeOutbound={growthSnapshot.activeOutbound}
        latestForm={growthSnapshot.latestForm}
        conversionReady={growthSnapshot.conversionReady}
        traffic={metrics?.traffic}
      />

      <CampaignRealityPanel
        campaigns={paidCampaigns}
        overview={campaignOverview}
        metricsSummary={metrics}
        health={conversionHealth}
        summary={conversionHealthSummary}
        traffic={metrics?.traffic}
        canSync={canSyncCampaigns}
        syncing={syncingCampaigns}
        onSync={() => void handleSyncPaidCampaigns()}
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Visao por canal" subtitle="O que esta trazendo contatos e oportunidades para a operacao." />
              <StateBadge label="30 dias" tone="info" />
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <ChannelTile icon={MessageCircle} title="WhatsApp" value={`${summary.sent} envios`} detail={`${runs.length} rodada(s) registradas`} href="/cliente/painel/disparos" />
              <ChannelTile icon={BarChart3} title="Anuncios e UTM" value={money(summary.spend)} detail={`${paidCampaigns.length} campanha(s) com dados`} href="#midia" />
              <ChannelTile icon={Globe2} title="Formularios" value={`${totalFormSubmissions} entradas`} detail={`${activeForms} formulario(s) ativo(s)`} href="/cliente/painel/captacao" />
            </div>
          </PanelCard>

          <div id="midia">
          <PanelCard className="p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title="Campanhas pagas e UTMs" subtitle="Gasto, cliques, leads, reunioes e vendas conectados ao comercial." />
              <Link href="/cliente/painel/configuracoes/integracoes" className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)]">
                Configurar fontes
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MiniMetric label="Impressoes" value={String(metrics?.traffic?.impressions || 0)} />
              <MiniMetric label="Cliques" value={String(metrics?.traffic?.clicks || 0)} />
              <MiniMetric label="CTR" value={`${metrics?.traffic?.ctr || 0}%`} />
              <MiniMetric label="CPC" value={money(metrics?.traffic?.cpc || 0)} />
            </div>

            <div className="mt-5 space-y-2">
              {paidCampaigns.length ? (
                paidCampaigns.slice(0, 8).map((campaign) => (
                  <PaidCampaignRow key={campaign.key} campaign={campaign} />
                ))
              ) : (
                <EmptyState
                  title="Nenhuma campanha paga sincronizada"
                  description="Conecte Meta, Google ou envie UTMs para comparar gasto, leads, reunioes e vendas dentro da Altum."
                  action={
                    <Link href="/cliente/painel/configuracoes/integracoes" className="inline-flex items-center gap-2 rounded-[16px] bg-[#2563eb] px-4 py-2.5 text-sm font-bold text-white">
                      Conectar integracoes
                    </Link>
                  }
                />
              )}
            </div>
          </PanelCard>
          </div>

          <PanelCard tone="success" className="p-5 md:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle title="Disparos em Massa" subtitle="Os envios de WhatsApp agora ficam em uma central propria, com numero remetente, publico, upload e historico." />
              </div>
              <Link href="/cliente/painel/disparos" className="inline-flex items-center gap-2 rounded-[16px] bg-[var(--cliente-success)] px-4 py-2.5 text-sm font-bold text-white">
                Abrir central <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </PanelCard>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <PanelCard tone="ai" className="p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_22%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                <Bot className="h-5 w-5" />
              </span>
              <CardTitle title="Proximos movimentos" subtitle="Acoes que ajudam a transformar campanha em venda." />
            </div>
            <div className="mt-4 space-y-2">
              <GrowthAction href="/cliente/painel/configuracoes/canais" title="Garantir pixel e conversoes" detail="Meta, Google e UTMs precisam voltar para a Altum." tone="info" />
              <GrowthAction href="/cliente/painel/captacao" title="Criar captura para novos leads" detail="Formulario ou pagina simples para cada campanha." tone="success" />
              <GrowthAction href="/cliente/painel/disparos" title="Reativar contatos parados" detail="Chame a base certa pelo WhatsApp com objetivo claro." tone="ai" />
              <GrowthAction href="/cliente/painel/metricas" title="Ver o que gerou dinheiro" detail="Compare leads, reunioes, vendas e custo por resultado." tone="warning" />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Canais conectados" subtitle="Resumo das frentes de campanha que a Altum consegue ler." />
            <div className="mt-4 space-y-2">
              <IntegrationRow label="Campanhas WhatsApp" value={`${summary.total} campanha(s)`} ready={summary.total > 0} />
              <IntegrationRow label="Meta/Google/UTM" value={`${paidCampaigns.length} campanha(s)`} ready={paidCampaigns.length > 0} />
              <IntegrationRow label="Formularios" value={`${activeForms} ativo(s)`} ready={activeForms > 0} />
              <IntegrationRow label="Catalogo de ofertas" value={`${catalogDocs.length} item(ns)`} ready={catalogDocs.length > 0} />
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Historico WhatsApp" subtitle="Ultimas rodadas de disparo." />
            <div className="mt-4 space-y-2">
              {runs.length ? (
                runs.slice(0, 6).map((run) => (
                  <div key={run.id} className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-bold text-[var(--cliente-card-text)]">{run.campaignName}</p>
                      <StateBadge label={`${run.summary.sent}`} tone="success" />
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(run.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--cliente-card-text-soft)]">Ainda nao houve disparos.</p>
              )}
            </div>
          </PanelCard>
        </aside>
      </section>
    </div>
  );
}

function HeroStat({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof Megaphone; tone: "info" | "success" }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-200"
      : "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-200";

  return (
    <div className={`rounded-[24px] border p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.35)] ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-75">{label}</p>
          <p className="mt-3 text-2xl font-black leading-none tracking-normal">{value}</p>
          <p className="mt-2 text-xs opacity-75">{detail}</p>
        </div>
        <Icon className="h-5 w-5 opacity-80" />
      </div>
    </div>
  );
}

function CampaignRealityPanel({
  campaigns,
  overview,
  metricsSummary,
  health,
  summary,
  traffic,
  canSync,
  syncing,
  onSync,
}: {
  campaigns: PaidCampaign[];
  overview: CampaignOverviewResponse | null;
  metricsSummary: MetricsSummary | null;
  health: ConversionHealthResponse | null;
  summary: {
    label: string;
    detail: string;
    tone: "success" | "warning" | "danger";
    total: number;
    ready: number;
    failed: number;
    processed: number;
    issues: string[];
  };
  traffic?: MetricsSummary["traffic"];
  canSync: boolean;
  syncing: boolean;
  onSync: () => void;
}) {
  const topCampaigns = campaigns.slice(0, 5);
  const activeOverview = (overview?.items || []).filter((item) => item.status === "active");
  const visibleOverview = activeOverview.length ? activeOverview.slice(0, 5) : (overview?.items || []).slice(0, 5);
  const totalSales = campaigns.reduce((sum, item) => sum + Number(item.wonLeads || 0), 0);
  const totalMeetings = campaigns.reduce((sum, item) => sum + Number(item.meetings || 0), 0);
  const healthItems = health?.items || [];
  const aiResponded = metricsSummary?.ai?.responded || 0;
  const humanOwned = metricsSummary?.operations?.aiBreakdown?.humanOwned || metricsSummary?.metrics?.handoffChats || 0;
  const conversations = metricsSummary?.metrics?.conversations || 0;
  const revenue = metricsSummary?.metrics?.paidRevenue || 0;

  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle
          title="Campanhas ativas e retorno de dados"
          subtitle="A leitura diaria para saber onde investir, onde pausar e se os pixels estao aprendendo com vendas reais."
        />
        <div className="flex flex-wrap gap-2">
          <StateBadge label={`${activeOverview.length} campanha(s) ativa(s)`} tone={activeOverview.length > 0 ? "success" : "warning"} />
          <StateBadge label={summary.label} tone={summary.tone} />
          {canSync ? (
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={syncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              Atualizar
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <MiniMetric label="Investimento" value={money(traffic?.spend || 0)} />
        <MiniMetric label="Leads pagos" value={String(traffic?.leads || 0)} />
        <MiniMetric label="Reunioes" value={String(totalMeetings)} />
        <MiniMetric label="Vendas" value={String(totalSales)} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <MiniMetric label="Conversas" value={String(conversations)} />
        <MiniMetric label="IA respondeu" value={String(aiResponded)} />
        <MiniMetric label="Humano assumiu" value={String(humanOwned)} />
        <MiniMetric label="Receita paga" value={money(revenue)} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-2">
          {topCampaigns.length || visibleOverview.length ? (
            <>
              {topCampaigns.map((campaign) => <ActiveCampaignRow key={campaign.key} campaign={campaign} />)}
              {visibleOverview
                .filter((item) => !topCampaigns.some((campaign) => campaign.label.toLowerCase() === item.name.toLowerCase()))
                .map((item) => <CampaignOverviewRow key={item.key} item={item} />)}
            </>
          ) : (
            <EmptyState
              title="Nenhuma campanha ativa com leitura comercial"
              description="Quando Meta, Google, UTMs ou formularios trouxerem leads, a Altum mostra investimento, atendimento, reunioes e vendas aqui."
            />
          )}
        </div>

        <div className="rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <div className="flex items-start gap-3">
            <span className={`rounded-[18px] border p-3 ${
              summary.tone === "success"
                ? "border-[color:color-mix(in_srgb,var(--cliente-success)_20%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"
                : summary.tone === "danger"
                  ? "border-[color:color-mix(in_srgb,var(--cliente-danger)_20%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]"
                  : "border-[color:color-mix(in_srgb,var(--cliente-warning)_20%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
            }`}>
              {summary.tone === "success" ? <ShieldCheck className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-black text-[var(--cliente-card-text)]">{summary.label}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{summary.detail}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MiniMetric label="Prontos" value={`${summary.ready}/${summary.total}`} />
            <MiniMetric label="Enviados" value={String(summary.processed)} />
            <MiniMetric label="Falhas" value={String(summary.failed)} />
          </div>

          <div className="mt-4 space-y-2">
            {healthItems.length ? (
              healthItems.map((item) => <ConversionConnectorRow key={item.channelId} item={item} />)
            ) : (
              <Link
                href="/cliente/painel/configuracoes/canais"
                className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
              >
                Conectar Meta Ads ou Google Ads
              </Link>
            )}
          </div>
        </div>
      </div>
    </PanelCard>
  );
}

function ActiveCampaignRow({ campaign }: { campaign: PaidCampaign }) {
  const hasSale = Number(campaign.wonLeads || 0) > 0;
  const hasMeeting = Number(campaign.meetings || 0) > 0;
  const tone = hasSale ? "success" : hasMeeting ? "warning" : "info";

  return (
    <div className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge label={campaign.source || "UTM"} tone="info" />
            <StateBadge label={hasSale ? "gerou venda" : hasMeeting ? "gerou reuniao" : "em leitura"} tone={tone} />
          </div>
          <p className="mt-3 truncate text-base font-black text-[var(--cliente-card-text)]">{campaign.label}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
            {campaign.lastTouchLeads} leads, {campaign.qualifiedLeads} qualificados, {campaign.meetings} reunioes, {campaign.wonLeads} vendas.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniMetric label="Gasto" value={money(campaign.spend)} />
          <MiniMetric label="CPL" value={money(campaign.cpl)} />
          <MiniMetric label="Custo venda" value={campaign.wonLeads > 0 ? money(campaign.costPerSale) : "--"} />
          <MiniMetric label="Conversao" value={percent(campaign.winRate)} />
        </div>
      </div>
    </div>
  );
}

function CampaignOverviewRow({ item }: { item: CampaignOverviewItem }) {
  const statusLabel =
    item.status === "active" ? "ativa" : item.status === "idle" ? "sem movimento recente" : "sem dados recentes";
  const tone = item.status === "active" ? "success" : item.status === "idle" ? "warning" : "neutral";

  return (
    <div className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge label={item.platform === "google_ads" ? "Google Ads" : item.platform === "meta_ads" ? "Meta Ads" : "Midia paga"} tone="info" />
            <StateBadge label={statusLabel} tone={tone} />
          </div>
          <p className="mt-3 truncate text-base font-black text-[var(--cliente-card-text)]">{item.name}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
            Ultimo sinal em {item.latestDateRef || "--"} no conector {item.accountLabel || item.channelId || "--"}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <MiniMetric label="7d gasto" value={money(item.last7.spend)} />
          <MiniMetric label="7d leads" value={String(item.last7.leads)} />
          <MiniMetric label="30d gasto" value={money(item.last30.spend)} />
          <MiniMetric label="30d CPL" value={item.last30.leads > 0 ? money(item.cpl30) : "--"} />
        </div>
      </div>
    </div>
  );
}

function ConversionConnectorRow({ item }: { item: ConversionHealthItem }) {
  return (
    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">{item.displayName}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
            {item.configuredEvents.length ? `${item.configuredEvents.length} evento(s) configurado(s)` : "Eventos ainda nao configurados"}
          </p>
        </div>
        <StateBadge label={item.ready ? "pronto" : "pendente"} tone={item.ready ? "success" : "warning"} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniMetric label="OK" value={String(item.recent.processed)} />
        <MiniMetric label="Falha" value={String(item.recent.failed)} />
        <MiniMetric label="Ultimo" value={formatDate(item.recent.lastEventAt)} />
      </div>
      {item.issues.length ? (
        <p className="mt-3 text-xs leading-5 text-[var(--cliente-danger)]">{item.issues[0]}</p>
      ) : null}
    </div>
  );
}

function GrowthCommandCenter({
  bestPaidCampaign,
  activeOutbound,
  latestForm,
  conversionReady,
  traffic,
}: {
  bestPaidCampaign: PaidCampaign | null;
  activeOutbound: Campaign | null;
  latestForm: NonNullable<CaptureFormsPayload["forms"]>[number] | null;
  conversionReady: boolean;
  traffic?: MetricsSummary["traffic"];
}) {
  return (
    <PanelCard className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle
          title="Mesa de crescimento"
          subtitle="Campanhas ativas, entrada de leads e retorno para anuncios em uma leitura simples."
        />
        <StateBadge label={conversionReady ? "conversoes com sinal" : "conversoes pendentes"} tone={conversionReady ? "success" : "warning"} />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        <CampaignSignalCard
          icon={BarChart3}
          label="Campanha paga em destaque"
          title={bestPaidCampaign?.label || "Nenhuma campanha paga ativa"}
          detail={
            bestPaidCampaign
              ? `${money(bestPaidCampaign.spend)} investidos, ${bestPaidCampaign.lastTouchLeads} leads, ${bestPaidCampaign.meetings} reunioes, ${bestPaidCampaign.wonLeads} vendas`
              : "Conecte Meta, Google ou UTMs para enxergar gasto, leads e vendas."
          }
          href="/cliente/painel/configuracoes/canais"
          tone={bestPaidCampaign ? "info" : "warning"}
        />
        <CampaignSignalCard
          icon={MessageCircle}
          label="WhatsApp comercial"
          title={activeOutbound?.name || "Nenhuma campanha WhatsApp"}
          detail={
            activeOutbound
              ? `${activeOutbound.status === "active" ? "Ativa" : "Pausada"} - ${activeOutbound.lastRunSummary?.sent || 0} envios na ultima rodada`
              : "Crie uma campanha de reativacao, proposta ou pos-venda."
          }
          href="/cliente/painel/disparos"
          tone={activeOutbound?.status === "active" ? "success" : "ai"}
        />
        <CampaignSignalCard
          icon={Globe2}
          label="Captura de leads"
          title={latestForm?.name || "Nenhuma captura recebendo lead"}
          detail={
            latestForm
              ? `${latestForm.submissionsCount || 0} entradas - ultima em ${formatDate(latestForm.lastSubmissionAt)}`
              : "Crie pagina ou formulario para cada campanha preservar origem e UTM."
          }
          href="/cliente/painel/captacao"
          tone={latestForm ? "success" : "warning"}
        />
        <CampaignSignalCard
          icon={Target}
          label="Retorno para anuncios"
          title={conversionReady ? "Origem e leads detectados" : "Falta sinal de conversao"}
          detail={
            conversionReady
              ? `${traffic?.leads || 0} leads pagos, CPL ${money(traffic?.cpl || 0)} e dados prontos para decisao.`
              : "Quando lead, reuniao e venda voltarem para Meta/Google, a campanha aprende melhor."
          }
          href="/cliente/painel/configuracoes/canais"
          tone={conversionReady ? "success" : "warning"}
        />
      </div>
    </PanelCard>
  );
}

function CampaignSignalCard({
  icon: Icon,
  label,
  title,
  detail,
  href,
  tone,
}: {
  icon: typeof Megaphone;
  label: string;
  title: string;
  detail: string;
  href: string;
  tone: "info" | "success" | "warning" | "ai";
}) {
  const toneClass =
    tone === "success"
      ? "text-[var(--cliente-success)]"
      : tone === "warning"
        ? "text-[var(--cliente-warning)]"
        : tone === "ai"
          ? "text-[var(--cliente-ai)]"
          : "text-[#2563eb]";

  const content = (
    <div className="h-full rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 line-clamp-2 text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
        </div>
        <Icon className={`h-5 w-5 shrink-0 ${toneClass}`} />
      </div>
      <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{detail}</p>
    </div>
  );

  if (href.startsWith("#")) return <a href={href}>{content}</a>;
  return <Link href={href}>{content}</Link>;
}

function ChannelTile({ icon: Icon, title, value, detail, href }: { icon: typeof Megaphone; title: string; value: string; detail: string; href: string }) {
  const content = (
    <div className="h-full rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,#2563eb_26%,var(--cliente-border))] hover:bg-[var(--cliente-surface-hover)]">
      <Icon className="h-5 w-5 text-[#2563eb]" />
      <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-2 text-xl font-black tracking-normal text-[var(--cliente-card-text)]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{detail}</p>
    </div>
  );

  if (href.startsWith("#")) return <a href={href}>{content}</a>;
  return <Link href={href}>{content}</Link>;
}

function GrowthAction({
  href,
  title,
  detail,
  tone,
}: {
  href: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "ai";
}) {
  return (
    <Link
      href={href}
      className="block rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3 transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{detail}</p>
        </div>
        <StateBadge label="acao" tone={tone} />
      </div>
    </Link>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-base font-black text-[var(--cliente-card-text)]">{value}</p>
    </div>
  );
}

function PaidCampaignRow({ campaign }: { campaign: PaidCampaign }) {
  return (
    <div className="rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge label={campaign.source || "campanha"} tone="info" />
            <StateBadge label={`${campaign.lastTouchLeads} leads`} tone="success" />
          </div>
          <p className="mt-3 truncate text-base font-black text-[var(--cliente-card-text)]">{campaign.label}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
            {campaign.qualifiedLeads} qualificados | {campaign.meetings} reunioes | {campaign.wonLeads} vendas
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">{money(campaign.spend)}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">CPL {money(campaign.cpl)}</p>
        </div>
      </div>
    </div>
  );
}

/*
function CampaignObjectiveStep({
  state,
  catalogDocs,
  selectedOffer,
  onCreate,
  onChange,
}: {
  state: CampaignEditorState;
  catalogDocs: CatalogDoc[];
  selectedOffer: CatalogDoc | null;
  onCreate: (objective: CampaignObjective) => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Objetivo da campanha" subtitle="Comece pelo movimento comercial, nao pelo texto." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {OBJECTIVES.map((objective) => {
          const active = state.objective === objective.id;
          return (
            <button
              key={objective.id}
              type="button"
              onClick={() => {
                onChange({
                  objective: objective.id,
                  offerId: objective.id === "oferta" ? state.offerId || catalogDocs[0]?.id || "" : state.offerId,
                  messageTemplate: buildObjectiveMessage(objective.id, objective.id === "oferta" ? selectedOffer || catalogDocs[0] : null),
                });
                if (!state.id && !state.name) onCreate(objective.id);
              }}
              className={`rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 ${
                active ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_10%,var(--cliente-card))]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
              }`}
            >
              <StateBadge label={objective.label} tone={objective.tone} />
              <p className="mt-3 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{objective.detail}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Nome da campanha" value={state.name} onChange={(value) => onChange({ name: value })} placeholder="Reativacao leads quentes" />
        <SelectField
          label="Oferta do catalogo"
          value={state.offerId}
          onChange={(value) => onChange({ offerId: value, messageTemplate: buildObjectiveMessage(state.objective, catalogDocs.find((item) => item.id === value) || null) })}
          options={[{ value: "", label: "Sem oferta especifica" }, ...catalogDocs.slice(0, 40).map((item) => ({ value: item.id, label: item.productName || "Item sem nome" }))]}
        />
      </div>
    </PanelCard>
  );
}

function CampaignAudienceStep({
  state,
  users,
  pipelineStages,
  allowAdvanced,
  onToggleStage,
  onAdvanced,
  onChange,
}: {
  state: CampaignEditorState;
  users: Array<{ userId?: string; name?: string }>;
  pipelineStages: Array<{ id: string; label?: string }>;
  allowAdvanced: boolean;
  onToggleStage: (stageId: string) => void;
  onAdvanced: () => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Publico" subtitle="Escolha quem recebe. Quanto melhor o filtro, melhor a campanha." />
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Etapas do funil</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {pipelineStages.map((stage) => {
            const active = state.filters.stageIds.includes(stage.id);
            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onToggleStage(stage.id)}
                className={`rounded-full border px-3 py-2 text-xs font-bold transition ${
                  active ? "border-[#2563eb] bg-[color:color-mix(in_srgb,#2563eb_10%,var(--cliente-card))] text-[#2563eb]" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)]"
                }`}
              >
                {stage.label || stage.id}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Limite de envio" value={String(state.maxRecipients)} onChange={(value) => onChange({ maxRecipients: Math.max(1, Math.min(500, Number(value || 1) || 1)) })} placeholder="50" />
        <SelectField
          label="Temperatura"
          value={state.filters.heat[0] || ""}
          options={[
            { value: "", label: "Qualquer temperatura" },
            { value: "frio", label: "Frio" },
            { value: "morno", label: "Morno" },
            { value: "quente", label: "Quente" },
          ]}
          onChange={(value) => onChange({ filters: { ...state.filters, heat: value ? [value] : [] } })}
        />
      </div>

      {allowAdvanced ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="Origens" value={listValue(state.filters.sources)} onChange={(value) => onChange({ filters: { ...state.filters, sources: parseList(value) } })} placeholder="meta_ads, google_ads, site" />
          <Field label="Tags" value={listValue(state.filters.tags)} onChange={(value) => onChange({ filters: { ...state.filters, tags: parseList(value) } })} placeholder="reativacao, vip, proposta" />
          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Responsaveis alvo</span>
            <select
              multiple
              value={state.filters.ownerIds}
              onChange={(event) => onChange({ filters: { ...state.filters, ownerIds: Array.from(event.target.selectedOptions).map((option) => option.value) } })}
              className="client-input min-h-[112px] w-full rounded-xl border px-3 py-2.5 text-sm"
            >
              {users.map((user) => (
                <option key={user.userId} value={user.userId}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="mt-4 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-muted)]">
          Filtros avancados ficam no modo completo.
          <button type="button" onClick={onAdvanced} className="ml-2 font-bold text-[#2563eb]">
            Abrir completo
          </button>
        </div>
      )}
    </PanelCard>
  );
}

function CampaignMessageStep({
  state,
  selectedOffer,
  canManage,
  onPreset,
  onGenerate,
  onChange,
}: {
  state: CampaignEditorState;
  selectedOffer: CatalogDoc | null;
  canManage: boolean;
  onPreset: () => void;
  onGenerate: () => void;
  onChange: (patch: Partial<CampaignEditorState>) => void;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle title="Mensagem" subtitle="Escreva como um atendimento comercial humano, com contexto e proximo passo." />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onGenerate} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)]">
            <Wand2 className="h-3.5 w-3.5" />
            Gerar variacao
          </button>
          {canManage ? (
            <button type="button" onClick={onPreset} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)]">
              <Sparkles className="h-3.5 w-3.5" />
              Preset
            </button>
          ) : null}
        </div>
      </div>
      {selectedOffer ? (
        <div className="mt-4 rounded-[18px] border border-[color:color-mix(in_srgb,#2563eb_18%,var(--cliente-border))] bg-[color:color-mix(in_srgb,#2563eb_7%,var(--cliente-card))] p-3">
          <p className="text-sm font-bold text-[var(--cliente-card-text)]">{selectedOffer.productName}</p>
          <p className="mt-1 line-clamp-2 text-xs text-[var(--cliente-card-text-muted)]">{selectedOffer.targetProfile || selectedOffer.productCategory || "Oferta do catalogo"}</p>
        </div>
      ) : null}
      <textarea
        value={state.messageTemplate}
        onChange={(event) => onChange({ messageTemplate: event.target.value })}
        placeholder="Oi {nome}, aqui e da equipe..."
        className="client-input mt-4 min-h-[190px] w-full rounded-[20px] border px-4 py-3 text-sm leading-6 outline-none"
      />
      <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Variaveis: {"{nome}"}, {"{empresa}"}, {"{telefone}"}, {"{email}"}, {"{stage}"}, {"{origem}"}.</p>
    </PanelCard>
  );
}

function CampaignReviewStep({ readiness, audiencePreview, state }: { readiness: { checks: Array<{ label: string; done: boolean }>; score: number }; audiencePreview: AudiencePreview | null; state: CampaignEditorState }) {
  return (
    <PanelCard className="p-4">
      <CardTitle title="Revisao antes do envio" subtitle="Evite disparos sem publico, sem permissao ou com mensagem fraca." />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2">
            <CheckCircle2 className={check.done ? "h-4 w-4 text-[var(--cliente-success)]" : "h-4 w-4 text-[var(--cliente-warning)]"} />
            <p className="text-sm font-semibold text-[var(--cliente-card-text-muted)]">{check.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MiniMetric label="Status" value={state.status} />
        <MiniMetric label="Limite" value={String(state.maxRecipients)} />
        <MiniMetric label="Pronto" value={`${readiness.score}%`} />
      </div>
      {audiencePreview ? (
        <div className="mt-4 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">Audiencia simulada</p>
          <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
            {audiencePreview.summary.estimatedSend} envios estimados, {audiencePreview.summary.blockedByConsent} bloqueados por consentimento e {audiencePreview.summary.missingPhone} sem telefone.
          </p>
        </div>
      ) : null}
    </PanelCard>
  );
}

function WhatsAppPreview({ message, selectedOffer }: { message: string; selectedOffer: CatalogDoc | null }) {
  return (
    <PanelCard className="overflow-hidden">
      <div className="border-b border-[var(--cliente-border)] bg-[#075e54] px-4 py-3 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/18 text-xs font-black">MA</span>
          <div>
            <p className="text-sm font-bold">Marina</p>
            <p className="text-xs text-white/72">preview WhatsApp</p>
          </div>
        </div>
      </div>
      <div className="bg-[linear-gradient(180deg,#e8f3ee,#dceae4)] p-4 dark:bg-[linear-gradient(180deg,#10231d,#0b1915)]">
        <div className="ml-auto max-w-[92%] rounded-[18px] rounded-br-sm bg-[#dcf8c6] px-4 py-3 text-sm leading-6 text-[#123025] shadow-[0_16px_30px_-26px_rgba(15,23,42,0.5)]">
          {interpolatePreview(message) || "Sua mensagem aparece aqui."}
        </div>
        {selectedOffer?.mediaUrl ? (
          <div className="ml-auto mt-2 max-w-[92%] rounded-[18px] bg-[#dcf8c6] px-4 py-3 text-xs font-bold text-[#123025]">
            Material da oferta disponivel para envio
          </div>
        ) : null}
      </div>
    </PanelCard>
  );
}

*/
function IntegrationRow({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <div>
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{value}</p>
      </div>
      <StateBadge label={ready ? "ok" : "pendente"} tone={ready ? "success" : "warning"} />
    </div>
  );
}
