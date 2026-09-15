"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, DollarSign, Images, Loader2, MousePointerClick, Pause, RefreshCw, Sparkles, Target } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClientActionButton, MetricCard, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";
import { AdsOperatorNav } from "../components/ads-operator-nav";
import { CampaignAiBox } from "../components/campaign-ai-box";
import { MetaActionBuilder } from "../components/meta-action-builder";

type Channel = { id: string; name: string; accountId: string; ready: boolean };
type Row = { id: string; name: string; campaignId?: string; campaignName?: string; adSetId?: string; adSetName?: string; status: string; impressions: number; clicks: number; spend: number; leads: number; ctr: number; cpc: number; frequency: number; roas: number };
type Recommendation = { id: string; severity: "high" | "medium" | "opportunity"; title: string; detail: string; evidence: string[]; nextAction?: { tool: string; arguments: Record<string, unknown> } };
type Report = { accountId: string; channelId: string; currency: string; from: string; to: string; campaigns: Row[]; adSets: Row[]; ads: Row[]; totals: { campaigns: number; impressions: number; clicks: number; spend: number; leads: number; purchaseValue: number; ctr: number; cpc: number; cpl: number; roas: number }; recommendations: Recommendation[] };
type Payload = { channels: Channel[]; reports: Array<{ channelId: string; generatedAt: string | null; report: Report | null }> };
type Tab = "campaigns" | "adSets" | "ads";

const tabs: Array<{ id: Tab; label: string }> = [{ id: "campaigns", label: "Campanhas" }, { id: "adSets", label: "Conjuntos" }, { id: "ads", label: "Anúncios e criativos" }];
const money = (value: number, currency = "BRL") => value.toLocaleString("pt-BR", { style: "currency", currency });
const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

function performance(row: Row) {
  if (row.spend > 0 && row.leads === 0) return { label: "Atenção", tone: "danger" as const, detail: "Há gasto sem lead no período." };
  if (row.roas >= 2) return { label: "Bom retorno", tone: "success" as const, detail: "O retorno está saudável." };
  if (row.frequency >= 4) return { label: "Criativo cansando", tone: "warning" as const, detail: "A frequência pede revisão do criativo." };
  return { label: "Em observação", tone: "neutral" as const, detail: "Acompanhe antes de ampliar o investimento." };
}

export default function MetaAdsOperatorPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canSync = hasCapability("manage_channels");
  const canDraft = canSync && hasCapability("manage_settings");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [channelId, setChannelId] = useState("");
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [drafting, setDrafting] = useState("");
  const [tab, setTab] = useState<Tab>("campaigns");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!tenant?.tenantId) return;
    if (!quiet) setLoading(true);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/meta-ads/operator`);
      const data = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao carregar o Meta Ads.");
      setPayload(data);
      setChannelId((current) => current || data.channels[0]?.id || "");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o Meta Ads.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => { void load(); }, [load]);
  const channel = payload?.channels.find((item) => item.id === channelId) || payload?.channels[0];
  const saved = payload?.reports.find((item) => item.channelId === channel?.id);
  const report = saved?.report || null;
  const rows = report?.[tab] || [];
  const activeCampaigns = report?.campaigns.filter((item) => item.status === "ACTIVE").length || 0;
  const verdict = !report ? null : report.totals.spend > 0 && report.totals.leads === 0
    ? { title: "O investimento ainda não gerou leads", detail: "Revise público, oferta, página e criativos antes de aumentar a verba.", tone: "danger" as const }
    : report.totals.roas >= 2
      ? { title: "As campanhas estão trazendo retorno", detail: "Priorize as campanhas vencedoras e acompanhe a frequência dos criativos.", tone: "success" as const }
      : { title: "Há resultado, mas ainda existe espaço para otimizar", detail: "Comece pelas decisões sugeridas e pelas campanhas com gasto sem retorno.", tone: "warning" as const };

  async function sync() {
    if (!tenant?.tenantId || !channel || !canSync) return;
    setSyncing(true); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/meta-ads/operator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: channel.id, rangeDays }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao consultar o Meta Ads.");
      await load(true);
      setNotice("Dados atualizados diretamente do Meta Ads.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar o Meta Ads.");
    } finally {
      setSyncing(false);
    }
  }

  async function createDraft(tool: string, args: Record<string, unknown>, key: string) {
    if (!tenant?.tenantId || !channel || !canDraft) return;
    setDrafting(key); setError(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, arguments: { platform: "meta_ads", adAccountId: report?.accountId || channel.accountId, reason: "Ação preparada no Operador Meta Ads.", evidence: ["Conta e desempenho conferidos no relatório mais recente da Altum."], ...args } }) });
      const data = (await response.json()) as { error?: string; href?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao criar rascunho.");
      if (data.href) window.location.assign(data.href);
      else setNotice("Rascunho criado para revisão.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao criar rascunho.");
    } finally {
      setDrafting("");
    }
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#0866FF]" /></div>;

  return (
    <div className="client-daily-page space-y-4">
      <AdsOperatorNav active="meta" />
      <section className="rounded-[22px] border border-[#0866FF]/20 bg-[linear-gradient(135deg,color-mix(in_srgb,#0866FF_11%,var(--cliente-card)),var(--cliente-card)_65%,color-mix(in_srgb,#d62976_7%,var(--cliente-card)))] p-5 shadow-[var(--cliente-shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <div className="flex flex-wrap gap-2"><StateBadge label="Meta Ads" tone="info" /><StateBadge label={channel?.ready ? "Conta pronta" : "Conexão pendente"} tone={channel?.ready ? "success" : "warning"} /><StateBadge label="Mudanças com aprovação" tone="ai" /></div>
            <h1 className="mt-3 text-2xl font-extrabold">Operação Meta Ads</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">Entenda o resultado do investimento, encontre o que exige atenção e gerencie campanhas, conjuntos e criativos.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {payload?.channels.length ? <label className="text-[11px] font-bold text-[var(--cliente-card-text-soft)]">Conta<select value={channel?.id || ""} onChange={(event) => setChannelId(event.target.value)} className="mt-1 block rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold">{payload.channels.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.accountId}</option>)}</select></label> : null}
            <label className="text-[11px] font-bold text-[var(--cliente-card-text-soft)]">Período<select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="mt-1 block rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold"><option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option></select></label>
            <ClientActionButton tone="primary" disabled={!channel?.ready || !canSync || syncing} onClick={() => void sync()}>{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Atualizar dados</ClientActionButton>
          </div>
        </div>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div> : null}
      {!payload?.channels.length ? <PanelCard tone="warning" className="p-6"><h2 className="font-bold">Conecte uma conta Meta Ads</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">A Altum precisa da conta conectada para consultar e gerenciar dados reais.</p><Link href="/cliente/painel/configuracoes/canais" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--cliente-primary)]">Abrir configurações <ArrowRight className="h-4 w-4" /></Link></PanelCard> : null}
      {channel && !report ? <PanelCard className="p-8 text-center"><Images className="mx-auto h-8 w-8 text-[#0866FF]" /><h2 className="mt-3 font-bold">Primeira leitura pendente</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Atualize os dados para montar o diagnóstico desta conta.</p></PanelCard> : null}

      {report ? <>
        <PanelCard tone={verdict?.tone} className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="rounded-2xl bg-white/65 p-3">{verdict?.tone === "success" ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}</span><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Leitura rápida do período</p><h2 className="mt-1 text-lg font-extrabold">{verdict?.title}</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{verdict?.detail}</p></div></div><a href="#decisions" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--cliente-primary)]">Ver o que fazer <ArrowRight className="h-4 w-4" /></a></div>
        </PanelCard>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Investimento" value={money(report.totals.spend, report.currency)} icon={DollarSign} trend={`${activeCampaigns} campanha(s) ativa(s)`} tone="brand" />
          <MetricCard label="Leads gerados" value={number(report.totals.leads)} icon={Target} trend={`Custo por lead ${money(report.totals.cpl, report.currency)}`} tone="success" />
          <MetricCard label="Retorno sobre anúncios" value={`${number(report.totals.roas)}x`} icon={BarChart3} trend={`${money(report.totals.purchaseValue, report.currency)} em compras`} tone="ai" />
          <MetricCard label="Interesse nos anúncios" value={`${number(report.totals.ctr)}%`} icon={MousePointerClick} trend={`${number(report.totals.clicks)} cliques`} />
        </section>

        <PanelCard className="p-5 md:p-6">
          <div id="decisions" className="scroll-mt-24">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--cliente-ai)]" /><h2 className="text-lg font-extrabold">O que merece atenção agora</h2></div><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Cada sugestão mostra o motivo e permite preparar a ação com segurança.</p></div><a href="#campaign-ai" className="text-sm font-bold text-[var(--cliente-ai)]">Perguntar à Altum</a></div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">{report.recommendations.length ? report.recommendations.map((item) => <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4"><div className="flex items-start justify-between gap-3"><div><StateBadge label={item.severity === "high" ? "Prioridade alta" : item.severity === "opportunity" ? "Oportunidade" : "Revisar"} tone={item.severity === "high" ? "danger" : item.severity === "opportunity" ? "success" : "warning"} /><h3 className="mt-2 font-bold">{item.title}</h3></div>{item.severity === "high" ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" /> : null}</div><p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p><p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{item.evidence.join(" · ")}</p>{item.nextAction && canDraft ? <button type="button" onClick={() => void createDraft(item.nextAction!.tool, item.nextAction!.arguments, item.id)} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[var(--cliente-primary)]">{drafting === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Preparar ação para revisão</button> : null}</article>) : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">Nenhum alerta relevante pelos critérios atuais. Continue acompanhando o resultado e a frequência.</div>}</div>
          </div>
        </PanelCard>

        {canDraft ? <MetaActionBuilder campaigns={report.campaigns} adSets={report.adSets} busy={Boolean(drafting)} onSubmit={(tool, args) => void createDraft(tool, args, "builder")} /> : null}

        {tenant?.tenantId ? <CampaignAiBox tenantId={tenant.tenantId} platform="Meta Ads" campaigns={report.campaigns.map((item) => ({ id: item.id, name: item.name, context: `estado ${item.status}; gasto ${money(item.spend, report.currency)}; leads ${number(item.leads)}; CTR ${number(item.ctr)}%; frequência ${number(item.frequency)}; ROAS ${number(item.roas)}x` }))} /> : null}

        <PanelCard className="overflow-hidden">
          <div className="border-b border-[var(--cliente-border)] p-5"><h2 className="text-lg font-extrabold">Detalhes para gestão</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Abra o nível necessário para entender onde o resultado está sendo criado ou perdido.</p><div className="mt-4 flex gap-1 overflow-x-auto">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${tab === item.id ? "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]" : "text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"}`}>{item.label} <span className="ml-1 opacity-60">{report[item.id].length}</span></button>)}</div></div>
          {rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-[var(--cliente-border)] text-left text-xs text-[var(--cliente-card-text-soft)]"><th className="p-4">Nome</th><th className="p-4">Leitura</th><th className="p-4">Estado</th><th className="p-4 text-right">Gasto</th><th className="p-4 text-right">Leads</th><th className="p-4 text-right">CTR</th><th className="p-4 text-right">Frequência</th><th className="p-4 text-right">ROAS</th><th className="p-4 text-right">Ações</th></tr></thead><tbody>{rows.map((item) => { const health = performance(item); const canChangeCampaign = tab === "campaigns" && canDraft && item.status === "ACTIVE"; const canChangeAdSet = tab === "adSets" && canDraft; return <tr key={item.id} className="border-b border-[var(--cliente-border)] align-top last:border-0 hover:bg-[var(--cliente-surface-muted)]"><td className="p-4"><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.campaignName || "Campanha"}{item.adSetName ? ` · ${item.adSetName}` : ""}</p></td><td className="p-4"><StateBadge label={health.label} tone={health.tone} /><p className="mt-1 max-w-40 text-xs text-[var(--cliente-card-text-soft)]">{health.detail}</p></td><td className="p-4"><StateBadge label={item.status === "ACTIVE" ? "Ativa" : item.status || "Sem estado"} tone={item.status === "ACTIVE" ? "success" : "neutral"} /></td><td className="p-4 text-right font-semibold">{money(item.spend, report.currency)}</td><td className="p-4 text-right">{number(item.leads)}</td><td className="p-4 text-right">{number(item.ctr)}%</td><td className="p-4 text-right">{number(item.frequency)}</td><td className="p-4 text-right font-bold">{number(item.roas)}x</td><td className="p-4 text-right">{canChangeCampaign ? <button type="button" onClick={() => void createDraft("draft_campaign_pause", { campaignId: item.id }, `pause-${item.id}`)} className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">{drafting === `pause-${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}Pausar</button> : canChangeAdSet ? <button type="button" onClick={() => void createDraft("draft_meta_ad_set_status", { campaignId: item.campaignId, adSetId: item.id, status: item.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }, `status-${item.id}`)} className={`text-xs font-bold ${item.status === "ACTIVE" ? "text-rose-600" : "text-emerald-600"}`}>{drafting === `status-${item.id}` ? "Preparando..." : item.status === "ACTIVE" ? "Pausar" : "Ativar"}</button> : <a href="#campaign-ai" className="text-xs font-bold text-[var(--cliente-ai)]">Analisar</a>}</td></tr>; })}</tbody></table></div> : <div className="p-8 text-center text-sm text-[var(--cliente-card-text-muted)]">Nenhum item retornado neste nível e período.</div>}
        </PanelCard>
      </> : null}
    </div>
  );
}
