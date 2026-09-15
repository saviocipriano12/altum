"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BarChart3, Bot, CheckCircle2, Copy, DollarSign, ExternalLink, Loader2, MousePointerClick, RefreshCw, Search, Sparkles, Target } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ClientActionButton, MetricCard, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";
import { AdsOperatorNav } from "../components/ads-operator-nav";
import { CampaignAiBox } from "../components/campaign-ai-box";

type Channel = { id: string; name: string; accountId: string; status: string; connectionStatus: string; ready: boolean };
type Recommendation = { id: string; type: string; severity: "high" | "medium" | "opportunity"; title: string; detail: string; evidence: string[]; campaignId?: string; campaignName?: string; nextAction?: { tool: string; arguments: Record<string, unknown> } };
type Campaign = { id: string; name: string; status: string; channelType: string; dailyBudget: number; impressions: number; clicks: number; spend: number; conversions: number; ctr: number; cpc: number; cpa: number; roas: number };
type Keyword = { campaignId: string; adGroupId: string; criterionId: string; campaignName: string; adGroupName: string; text: string; matchType: string; status: string; qualityScore: number | null; clicks: number; spend: number; conversions: number };
type SearchTerm = { campaignName: string; adGroupName: string; term: string; clicks: number; spend: number; conversions: number };
type Ad = { id: string; campaignName: string; adGroupName: string; status: string; strength: string; headlines: string[]; descriptions: string[]; finalUrls: string[]; impressions: number; clicks: number; spend: number; conversions: number };
type Report = { accountId: string; channelId: string; currency: string; from: string; to: string; campaigns: Campaign[]; keywords: Keyword[]; searchTerms: SearchTerm[]; ads: Ad[]; recommendations: Recommendation[]; totals: { campaigns: number; activeCampaigns: number; impressions: number; clicks: number; spend: number; conversions: number; conversionValue: number; ctr: number; cpc: number; cpa: number; roas: number }; coverage: { campaignRows: number; keywordRows: number; searchTermRows: number; adRows: number; searchTermsExcludePerformanceMax: boolean } };
type Payload = { channels: Channel[]; reports: Array<{ id: string; channelId: string; generatedAt: string | null; report: Report | null }> };
type Tab = "campaigns" | "keywords" | "terms" | "ads";

const statusLabels: Record<string, string> = { ENABLED: "Ativa", PAUSED: "Pausada", REMOVED: "Removida", GOOD: "Boa", EXCELLENT: "Excelente", AVERAGE: "Media", POOR: "Baixa" };
const matchLabels: Record<string, string> = { EXACT: "Exata", PHRASE: "Frase", BROAD: "Ampla" };

function compact(value: number) { return value.toLocaleString("pt-BR", { maximumFractionDigits: 1 }); }
function money(value: number, currency = "BRL") { return value.toLocaleString("pt-BR", { style: "currency", currency }); }
function when(value: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : "Ainda nao atualizado"; }
function severityTone(value: Recommendation["severity"]): "danger" | "warning" | "success" { return value === "high" ? "danger" : value === "opportunity" ? "success" : "warning"; }

export default function GoogleAdsOperatorPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canSync = hasCapability("manage_channels");
  const canDraft = canSync && hasCapability("manage_settings");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [channelId, setChannelId] = useState("");
  const [rangeDays, setRangeDays] = useState(30);
  const [tab, setTab] = useState<Tab>("campaigns");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [builder, setBuilder] = useState("campaign");
  const [builderName, setBuilderName] = useState("");
  const [builderCampaignId, setBuilderCampaignId] = useState("");
  const [builderAdGroupId, setBuilderAdGroupId] = useState("");
  const [builderBudget, setBuilderBudget] = useState(50);
  const [builderHeadlines, setBuilderHeadlines] = useState("");
  const [builderDescriptions, setBuilderDescriptions] = useState("");
  const [builderUrl, setBuilderUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!tenant?.tenantId) return;
    if (!quiet) setLoading(true);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/google-ads/operator`);
      const data = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao carregar o operador Google Ads.");
      setPayload(data);
      setChannelId((current) => current || data.channels[0]?.id || "");
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar o operador Google Ads."); }
    finally { setLoading(false); }
  }, [tenant?.tenantId]);

  useEffect(() => { void load(); }, [load]);
  const selectedChannel = payload?.channels.find((item) => item.id === channelId) || payload?.channels[0];
  const saved = payload?.reports.find((item) => item.channelId === selectedChannel?.id);
  const report = saved?.report || null;
  const currency = report?.currency || "BRL";

  async function sync() {
    if (!tenant?.tenantId || !selectedChannel || !canSync) return;
    setSyncing(true); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/google-ads/operator`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: selectedChannel.id, rangeDays }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao consultar o Google Ads.");
      await load(true); setNotice("Dados atualizados diretamente do Google Ads.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar o Google Ads."); }
    finally { setSyncing(false); }
  }

  async function copyForAi(item: Recommendation) {
    const action = item.nextAction ? `Use a ferramenta ${item.nextAction.tool} com estes argumentos: ${JSON.stringify(item.nextAction.arguments)}.` : "Analise esta recomendacao e proponha o proximo passo sem executar mudancas automaticamente.";
    await navigator.clipboard.writeText(`Na empresa selecionada da Altum, avalie: ${item.title}. Evidencias: ${item.evidence.join("; ")}. ${action}`);
    setNotice("Instrucao copiada. Cole no ChatGPT, Codex ou Claude conectado ao MCP da Altum.");
  }

  async function createDraft(item: Recommendation) {
    if (!tenant?.tenantId || !item.nextAction || !canDraft) return;
    setDraftingId(item.id); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.nextAction) });
      const data = await response.json() as { error?: string; href?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao preparar a mudanca.");
      setNotice("Rascunho criado. Revise e aprove antes de aplicar no Google Ads.");
      if (data.href) window.location.assign(data.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao preparar a mudanca."); }
    finally { setDraftingId(null); }
  }

  async function createManualDraft(tool: string, args: Record<string, unknown>, loadingId = "builder") {
    if (!tenant?.tenantId || !selectedChannel || !canDraft) return;
    setDraftingId(loadingId); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/mcp/drafts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, arguments: { platform: "google_ads", adAccountId: report?.accountId || selectedChannel.accountId, reason: "Acao preparada pelo gestor no Operador Google Ads.", evidence: ["Conta, campanha e estrutura conferidas no ultimo relatorio da Altum."], ...args } }) });
      const data = await response.json() as { error?: string; href?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao criar o rascunho.");
      if (data.href) window.location.assign(data.href);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao criar o rascunho."); setDraftingId(null); }
  }

  function submitBuilder() {
    if (builder === "campaign") return void createManualDraft("draft_google_campaign_create", { name: builderName, dailyBudget: builderBudget, channelType: "SEARCH" });
    if (builder === "group") return void createManualDraft("draft_google_ad_group_create", { campaignId: builderCampaignId, name: builderName });
    if (builder === "bidding") return void createManualDraft("draft_google_bidding_strategy", { campaignId: builderCampaignId, strategy: "MAXIMIZE_CONVERSIONS" });
    return void createManualDraft("draft_google_responsive_search_ad", { campaignId: builderCampaignId, adGroupId: builderAdGroupId, headlines: builderHeadlines.split("\n").map((item) => item.trim()).filter(Boolean), descriptions: builderDescriptions.split("\n").map((item) => item.trim()).filter(Boolean), finalUrls: [builderUrl] });
  }

  const tabs = useMemo(() => [
    { id: "campaigns" as const, label: "Campanhas", count: report?.campaigns.length || 0 },
    { id: "keywords" as const, label: "Palavras-chave", count: report?.keywords.length || 0 },
    { id: "terms" as const, label: "Termos pesquisados", count: report?.searchTerms.length || 0 },
    { id: "ads" as const, label: "Anuncios", count: report?.ads.length || 0 },
  ], [report]);
  const verdict = !report ? null : report.totals.spend > 0 && report.totals.conversions === 0
    ? { title: "O investimento ainda não gerou conversões", detail: "Revise buscas, palavras-chave, oferta e página antes de aumentar a verba.", tone: "danger" as const }
    : report.totals.roas >= 2
      ? { title: "As campanhas estão trazendo retorno", detail: "Proteja as campanhas vencedoras e amplie o investimento com controle.", tone: "success" as const }
      : { title: "Há resultado, mas ainda existe espaço para otimizar", detail: "Comece pelas decisões sugeridas e pelos termos que consomem verba sem converter.", tone: "warning" as const };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-primary)]" /></div>;
  return <div className="client-daily-page space-y-4">
    <AdsOperatorNav active="google" />
    <section className="rounded-[22px] border border-[#4285F4]/20 bg-[linear-gradient(135deg,color-mix(in_srgb,#4285F4_11%,var(--cliente-card)),var(--cliente-card)_58%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-5 shadow-[var(--cliente-shadow-soft)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl"><div className="flex flex-wrap gap-2"><StateBadge label="Google Ads" tone="info" /><StateBadge label={selectedChannel?.ready ? "Conta pronta" : "Conexao pendente"} tone={selectedChannel?.ready ? "success" : "warning"} /><StateBadge label="Mudancas com aprovacao" tone="ai" /></div><h1 className="mt-3 text-2xl font-extrabold text-[var(--cliente-card-text)]">Operador de campanhas Google Ads</h1><p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Veja campanha, busca, palavra-chave e anuncio no mesmo lugar. A Altum encontra oportunidades e prepara a acao para a IA, mantendo a aprovacao humana antes de alterar a conta.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {payload?.channels.length ? <select aria-label="Conta Google Ads" value={selectedChannel?.id || ""} onChange={(event) => setChannelId(event.target.value)} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-xs font-bold text-[var(--cliente-card-text)]">{payload.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name} · {channel.accountId || "sem ID"}</option>)}</select> : null}
          <select aria-label="Periodo" value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-xs font-bold text-[var(--cliente-card-text)]"><option value={7}>7 dias</option><option value={14}>14 dias</option><option value={30}>30 dias</option></select>
          <ClientActionButton tone="primary" onClick={() => void sync()} disabled={!selectedChannel?.ready || !canSync || syncing}>{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Consultar Google</ClientActionButton>
        </div>
      </div>
    </section>

    {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
    {notice ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}
    {!payload?.channels.length ? <PanelCard tone="warning" className="p-6"><h2 className="font-bold">Conecte uma conta Google Ads</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">O operador precisa de uma conta ativa para consultar dados reais.</p><Link href="/cliente/painel/configuracoes/canais" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[var(--cliente-primary)]">Abrir canais <ExternalLink className="h-4 w-4" /></Link></PanelCard> : null}
    {payload?.channels.length && !report ? <PanelCard className="p-8 text-center"><Search className="mx-auto h-8 w-8 text-[#4285F4]" /><h2 className="mt-3 text-lg font-bold">Primeira leitura pendente</h2><p className="mx-auto mt-2 max-w-xl text-sm text-[var(--cliente-card-text-muted)]">Clique em Consultar Google para gerar o primeiro diagnostico desta conta.</p></PanelCard> : null}

    {report ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[var(--cliente-card-text-muted)]"><span>Janela {report.from.split("-").reverse().join("/")} a {report.to.split("-").reverse().join("/")}</span><span>Atualizado em {when(saved?.generatedAt || null)}</span></div>
      <PanelCard tone={verdict?.tone} className="p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><span className="rounded-2xl bg-white/65 p-3">{verdict?.tone === "success" ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}</span><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Leitura rápida do período</p><h2 className="mt-1 text-lg font-extrabold">{verdict?.title}</h2><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{verdict?.detail}</p></div></div><a href="#decisions" className="inline-flex items-center gap-2 text-sm font-bold text-[var(--cliente-primary)]">Ver o que fazer <ArrowRight className="h-4 w-4" /></a></div></PanelCard>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Investimento" value={money(report.totals.spend, currency)} icon={DollarSign} trend={`${report.totals.activeCampaigns} de ${report.totals.campaigns} campanhas ativas`} tone="brand" />
        <MetricCard label="Conversoes" value={compact(report.totals.conversions)} icon={Target} trend={`CPA ${money(report.totals.cpa, currency)}`} tone="success" />
        <MetricCard label="ROAS" value={`${compact(report.totals.roas)}x`} icon={BarChart3} trend={`${money(report.totals.conversionValue, currency)} em valor`} tone="ai" />
        <MetricCard label="Cliques" value={compact(report.totals.clicks)} icon={MousePointerClick} trend={`CTR ${compact(report.totals.ctr)}% · CPC ${money(report.totals.cpc, currency)}`} tone="neutral" />
      </section>

      {canDraft ? <PanelCard className="p-5 md:p-6"><div className="flex items-center gap-2"><Bot className="h-5 w-5 text-[var(--cliente-ai)]" /><h2 className="text-lg font-extrabold">Preparar nova acao</h2></div><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">A acao nasce como rascunho e so chega ao Google depois da revisao e aprovacao.</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Tipo<select value={builder} onChange={(event) => setBuilder(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm text-[var(--cliente-card-text)]"><option value="campaign">Nova campanha de pesquisa</option><option value="group">Novo grupo de anuncios</option><option value="ad">Novo anuncio responsivo</option><option value="bidding">Maximizar conversoes</option></select></label>{builder !== "campaign" ? <label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Campanha<select value={builderCampaignId} onChange={(event) => setBuilderCampaignId(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm text-[var(--cliente-card-text)]"><option value="">Selecione</option>{report.campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}{builder === "campaign" || builder === "group" ? <label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Nome<input value={builderName} onChange={(event) => setBuilderName(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm text-[var(--cliente-card-text)]" /></label> : null}{builder === "campaign" ? <label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Orcamento diario<input type="number" min={1} value={builderBudget} onChange={(event) => setBuilderBudget(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm text-[var(--cliente-card-text)]" /></label> : null}{builder === "ad" ? <><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">ID do grupo<input value={builderAdGroupId} onChange={(event) => setBuilderAdGroupId(event.target.value)} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)]">URL final<input value={builderUrl} onChange={(event) => setBuilderUrl(event.target.value)} placeholder="https://" className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)] md:col-span-2">Titulos, um por linha<textarea value={builderHeadlines} onChange={(event) => setBuilderHeadlines(event.target.value)} rows={4} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-[var(--cliente-card-text-soft)] md:col-span-2">Descricoes, uma por linha<textarea value={builderDescriptions} onChange={(event) => setBuilderDescriptions(event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm" /></label></> : null}</div><ClientActionButton tone="ai" className="mt-4" onClick={submitBuilder} disabled={draftingId === "builder"}>{draftingId === "builder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Criar rascunho para revisao</ClientActionButton></PanelCard> : null}

      <PanelCard className="p-5 md:p-6">
        <div id="decisions" className="scroll-mt-24"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--cliente-ai)]" /><h2 className="text-lg font-extrabold">O que merece atenção agora</h2></div><p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">Cada sugestão mostra o motivo e permite preparar a ação com segurança.</p></div><a href="#campaign-ai" className="inline-flex items-center gap-2 text-xs font-bold text-[var(--cliente-ai)]"><Bot className="h-4 w-4" /> Perguntar à Altum</a></div>
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {report.recommendations.length ? report.recommendations.slice(0, 12).map((item) => <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4"><div className="flex items-start justify-between gap-3"><div><StateBadge label={item.severity === "high" ? "Atencao alta" : item.severity === "opportunity" ? "Oportunidade" : "Revisar"} tone={severityTone(item.severity)} /><h3 className="mt-2 text-sm font-bold text-[var(--cliente-card-text)]">{item.title}</h3></div>{item.severity === "high" ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />}</div><p className="mt-2 text-sm leading-5 text-[var(--cliente-card-text-muted)]">{item.detail}</p><p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{item.evidence.join(" · ")}</p><div className="mt-3 flex flex-wrap gap-3">{item.nextAction && canDraft ? <button type="button" disabled={draftingId === item.id} onClick={() => void createDraft(item)} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--cliente-primary)] disabled:opacity-60">{draftingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Criar rascunho</button> : null}<button type="button" onClick={() => void copyForAi(item)} className="inline-flex items-center gap-2 text-xs font-bold text-[var(--cliente-ai)]"><Copy className="h-3.5 w-3.5" /> Enviar para outra IA</button></div></article>) : <div className="xl:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">Nenhum alerta pelos criterios atuais. Continue acompanhando a janela e a receita atribuida.</div>}
        </div></div>
      </PanelCard>

      {tenant?.tenantId ? <CampaignAiBox tenantId={tenant.tenantId} platform="Google Ads" campaigns={report.campaigns.map((item) => ({ id: item.id, name: item.name, context: `estado ${item.status}; gasto ${money(item.spend, currency)}; conversões ${compact(item.conversions)}; CTR ${compact(item.ctr)}%; CPA ${money(item.cpa, currency)}; ROAS ${compact(item.roas)}x` }))} /> : null}

      <PanelCard className="overflow-hidden">
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--cliente-border)] p-2">{tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold ${tab === item.id ? "bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]" : "text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"}`}>{item.label} <span className="ml-1 opacity-65">{item.count}</span></button>)}</div>
        <div className="overflow-x-auto">
          {tab === "campaigns" ? <table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--cliente-border)] text-xs text-[var(--cliente-card-text-soft)]"><th className="p-4">Campanha</th><th className="p-4">Estado</th><th className="p-4 text-right">Orcamento/dia</th><th className="p-4 text-right">Gasto</th><th className="p-4 text-right">Cliques</th><th className="p-4 text-right">Conversoes</th><th className="p-4 text-right">ROAS</th></tr></thead><tbody>{report.campaigns.map((item) => <tr key={item.id} className="border-b border-[var(--cliente-border)] last:border-0"><td className="p-4"><p className="font-bold">{item.name}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.channelType}</p></td><td className="p-4"><StateBadge label={statusLabels[item.status] || item.status} tone={item.status === "ENABLED" ? "success" : "neutral"} /></td><td className="p-4 text-right">{money(item.dailyBudget, currency)}</td><td className="p-4 text-right font-semibold">{money(item.spend, currency)}</td><td className="p-4 text-right">{compact(item.clicks)}</td><td className="p-4 text-right">{compact(item.conversions)}</td><td className="p-4 text-right font-bold">{compact(item.roas)}x</td></tr>)}</tbody></table> : null}
          {tab === "keywords" ? <table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--cliente-border)] text-xs text-[var(--cliente-card-text-soft)]"><th className="p-4">Palavra-chave</th><th className="p-4">Campanha / grupo</th><th className="p-4">Correspondencia</th><th className="p-4 text-right">Qualidade</th><th className="p-4 text-right">Gasto</th><th className="p-4 text-right">Conversoes</th><th className="p-4"></th></tr></thead><tbody>{report.keywords.map((item) => <tr key={item.criterionId} className="border-b border-[var(--cliente-border)] last:border-0"><td className="p-4 font-bold">{item.text}</td><td className="p-4"><p>{item.campaignName}</p><p className="text-xs text-[var(--cliente-card-text-soft)]">{item.adGroupName}</p></td><td className="p-4">{matchLabels[item.matchType] || item.matchType}</td><td className="p-4 text-right">{item.qualityScore ? `${item.qualityScore}/10` : "—"}</td><td className="p-4 text-right">{money(item.spend, currency)}</td><td className="p-4 text-right">{compact(item.conversions)}</td><td className="p-4 text-right">{canDraft && item.status === "ENABLED" ? <button type="button" onClick={() => void createManualDraft("draft_google_keyword_pause", { campaignId: item.campaignId, adGroupId: item.adGroupId, criterionId: item.criterionId }, `keyword-${item.criterionId}`)} className="text-xs font-bold text-rose-600">Pausar</button> : null}</td></tr>)}</tbody></table> : null}
          {tab === "terms" ? <table className="min-w-full text-left text-sm"><thead><tr className="border-b border-[var(--cliente-border)] text-xs text-[var(--cliente-card-text-soft)]"><th className="p-4">Busca feita pela pessoa</th><th className="p-4">Campanha / grupo</th><th className="p-4 text-right">Cliques</th><th className="p-4 text-right">Gasto</th><th className="p-4 text-right">Conversoes</th></tr></thead><tbody>{report.searchTerms.map((item, index) => <tr key={`${item.term}-${index}`} className="border-b border-[var(--cliente-border)] last:border-0"><td className="p-4 font-bold">{item.term}</td><td className="p-4"><p>{item.campaignName}</p><p className="text-xs text-[var(--cliente-card-text-soft)]">{item.adGroupName}</p></td><td className="p-4 text-right">{compact(item.clicks)}</td><td className="p-4 text-right">{money(item.spend, currency)}</td><td className="p-4 text-right">{compact(item.conversions)}</td></tr>)}</tbody></table> : null}
          {tab === "ads" ? <div className="grid gap-3 p-4 lg:grid-cols-2">{report.ads.map((item) => <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-xs text-[var(--cliente-card-text-soft)]">{item.campaignName} · {item.adGroupName}</p><h3 className="mt-1 font-bold">{item.headlines[0] || `Anuncio ${item.id}`}</h3></div><StateBadge label={statusLabels[item.strength] || item.strength} tone={item.strength === "GOOD" || item.strength === "EXCELLENT" ? "success" : "warning"} /></div><p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.descriptions[0] || "Sem descricao responsiva retornada."}</p><div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--cliente-card-text-soft)]"><span>{compact(item.impressions)} impressoes</span><span>{compact(item.clicks)} cliques</span><span>{money(item.spend, currency)}</span><span>{compact(item.conversions)} conversoes</span></div></article>)}</div> : null}
        </div>
        {tab === "terms" && report.coverage.searchTermsExcludePerformanceMax ? <p className="border-t border-[var(--cliente-border)] p-4 text-xs text-[var(--cliente-card-text-soft)]">O relatorio de termos pesquisados do Google nao cobre campanhas Performance Max.</p> : null}
      </PanelCard>
    </> : null}
  </div>;
}
