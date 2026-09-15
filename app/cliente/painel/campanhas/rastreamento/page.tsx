"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Check, Copy, DollarSign, Globe2, KeyRound, Loader2, RefreshCw, Save, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, MetricCard, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";
import { AdsOperatorNav } from "../components/ads-operator-nav";

type TrackingPayload = {
  config: {
    enabled: boolean;
    publicWriteKey: string;
    allowedDomains: string[];
    consentMode: "required" | "implicit";
    lastEventAt?: string | null;
    lastEventName?: string;
  };
  summary: { total: number; pageViews: number; conversions: number; sales: number; revenue: number };
  events: Array<{ id: string; name: string; occurredAt?: string | null; path: string; value: number; currency: string; source: string; campaign: string }>;
};

type RevenueGraphPayload = {
  scope: "team" | "own";
  incomplete?: boolean;
  totals: { visitors: number; sessions: number; pageViews: number; leads: number; conversations: number; qualified: number; meetings: number; proposals: number; won: number; customers: number; revenue: number; potentialValue: number; spend: number; roas: number };
  stages: Array<{ id: string; label: string; value: number; conversionFromPrevious: number | null }>;
  campaigns: Array<{ key: string; source: string; campaign: string; visitors: number; leads: number; qualified: number; meetings: number; proposals: number; won: number; customers: number; revenue: number; spend: number; roas: number; leadToSaleRate: number }>;
  coverage: { leadsInCohort: number; trackedEvents: number; linkedTrackedEvents: number };
};

const eventLabels: Record<string, string> = {
  page_view: "Pagina visitada",
  cta_clicked: "Botao clicado",
  whatsapp_clicked: "Clique no WhatsApp",
  form_started: "Formulario iniciado",
  form_submitted: "Formulario enviado",
  product_viewed: "Produto visualizado",
  checkout_started: "Checkout iniciado",
  purchase_completed: "Venda concluida",
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RastreamentoPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_settings");
  const [payload, setPayload] = useState<TrackingPayload | null>(null);
  const [graph, setGraph] = useState<RevenueGraphPayload | null>(null);
  const [rangeDays, setRangeDays] = useState(30);
  const [domains, setDomains] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [consentMode, setConsentMode] = useState<"required" | "implicit">("required");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!tenant?.tenantId) return;
    if (!quiet) setLoading(true);
    try {
      const [response, graphResponse] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/growth/tracking`),
        authedFetch(`/api/tenant/${tenant.tenantId}/growth/revenue-graph?rangeDays=${rangeDays}`),
      ]);
      const [data, graphData] = await Promise.all([
        response.json() as Promise<TrackingPayload & { error?: string }>,
        graphResponse.json() as Promise<RevenueGraphPayload & { error?: string }>,
      ]);
      if (!response.ok) throw new Error(data.error || "Falha ao carregar o rastreamento.");
      if (!graphResponse.ok) throw new Error(graphData.error || "Falha ao carregar a jornada de receita.");
      setPayload(data);
      setGraph(graphData);
      setDomains(data.config.allowedDomains.join("\n"));
      setEnabled(data.config.enabled);
      setConsentMode(data.config.consentMode);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o rastreamento.");
    } finally {
      setLoading(false);
    }
  }, [rangeDays, tenant?.tenantId]);

  useEffect(() => { void load(); }, [load]);

  const snippet = useMemo(() => {
    if (!payload?.config.publicWriteKey || typeof window === "undefined") return "Salve a configuracao para gerar o codigo.";
    return `<script async src="${window.location.origin}/altum-tracker.js" data-key="${payload.config.publicWriteKey}" data-consent-mode="${consentMode}"></script>`;
  }, [consentMode, payload?.config.publicWriteKey]);

  async function save() {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/tracking`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, consentMode, allowedDomains: domains.split(/[\n,]/).map((item) => item.trim()).filter(Boolean) }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao salvar.");
      await load(true);
      setNotice("Rastreamento salvo. O novo codigo ja pode ser instalado no site.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally { setSaving(false); }
  }

  async function rotateKey() {
    if (!tenant?.tenantId || !canManage) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/growth/tracking`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "rotate_key" }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Falha ao trocar a chave.");
      await load(true);
      setNotice("Chave trocada. Atualize o codigo nos sites instalados.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao trocar a chave."); }
    finally { setSaving(false); }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-primary)]" /></div>;
  const config = payload?.config;
  return (
    <div className="client-daily-page space-y-4">
      <AdsOperatorNav active="tracking" />
      <section className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_12%,var(--cliente-card)),var(--cliente-card)_60%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-5 shadow-[var(--cliente-shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><div className="flex gap-2"><StateBadge label="Altum Tracking" tone="info" /><StateBadge label={config?.enabled ? "Coleta ativa" : "Coleta pausada"} tone={config?.enabled ? "success" : "warning"} /></div><h1 className="mt-3 text-2xl font-extrabold text-[var(--cliente-card-text)]">Do clique ate a receita.</h1><p className="mt-2 max-w-2xl text-sm text-[var(--cliente-card-text-muted)]">Instale uma vez para a Altum entender origem, navegacao, conversao e venda sem depender apenas dos paineis de anuncios.</p></div>
          <div className="flex items-center gap-2"><select value={rangeDays} onChange={(event) => setRangeDays(Number(event.target.value))} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold"><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select><button type="button" onClick={() => void load(true)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs font-bold"><RefreshCw className="h-4 w-4" /> Atualizar</button></div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Visitantes" value={String(graph?.totals.visitors || 0)} icon={Globe2} trend={`${graph?.totals.pageViews || 0} paginas vistas`} tone="brand" />
        <MetricCard label="Leads adquiridos" value={String(graph?.totals.leads || 0)} icon={Users} trend={`${graph?.totals.qualified || 0} qualificados`} tone="success" />
        <MetricCard label="Vendas ganhas" value={String(graph?.totals.won || 0)} icon={ShieldCheck} trend={`${graph?.totals.customers || 0} com pagamento`} tone="ai" />
        <MetricCard label="Receita atribuida" value={money(graph?.totals.revenue || 0)} icon={DollarSign} trend={`ROAS ${Number(graph?.totals.roas || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x`} tone="brand" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PanelCard className="p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><CardTitle title="Jornada ate a receita" subtitle={`Leads captados nos ultimos ${rangeDays} dias e o resultado comercial atual dessa entrada.`} /><div className="flex gap-2"><StateBadge label={graph?.scope === "team" ? "Toda a empresa" : "Minha carteira"} tone="info" />{graph?.incomplete ? <StateBadge label="Amostra parcial" tone="warning" /> : null}</div></div>
          <div className="mt-5 grid gap-2 md:grid-cols-4">
            {(graph?.stages || []).map((stage, index) => {
              const largest = Math.max(0, ...(graph?.stages || []).map((item) => item.value));
              const width = largest && stage.value ? Math.max(8, Math.min(100, (stage.value / largest) * 100)) : 0;
              return <div key={stage.id} className="relative overflow-hidden rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3"><div className="absolute inset-y-0 left-0 bg-[color:color-mix(in_srgb,var(--cliente-primary)_10%,transparent)]" style={{ width: `${width}%` }} /><div className="relative"><p className="text-[11px] font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">{stage.label}</p><p className="mt-1 text-xl font-black text-[var(--cliente-card-text)]">{stage.value}</p><p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{index === 0 ? "Inicio observado" : stage.conversionFromPrevious == null ? "Sem base anterior" : `${stage.conversionFromPrevious}% da etapa anterior`}</p></div></div>;
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--cliente-card-text-soft)]"><span>{graph?.coverage.trackedEvents || 0} eventos observados</span><span>•</span><span>{graph?.coverage.linkedTrackedEvents || 0} ligados diretamente a leads</span><span>•</span><span>{graph?.coverage.leadsInCohort || 0} leads na coorte</span></div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <CardTitle title="Resultado financeiro" subtitle="Receita paga ligada aos leads adquiridos no periodo." />
          <div className="mt-5 rounded-2xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-success)_14%,var(--cliente-card)),var(--cliente-card))] p-5"><div className="flex items-center gap-3"><span className="rounded-xl bg-[var(--cliente-success-soft)] p-2.5 text-[var(--cliente-success)]"><TrendingUp className="h-5 w-5" /></span><div><p className="text-xs font-bold text-[var(--cliente-card-text-soft)]">Receita recebida</p><p className="text-2xl font-black text-[var(--cliente-card-text)]">{money(graph?.totals.revenue || 0)}</p></div></div><div className="mt-4 grid grid-cols-2 gap-3"><div><p className="text-xs text-[var(--cliente-card-text-soft)]">Investimento</p><p className="font-black">{money(graph?.totals.spend || 0)}</p></div><div><p className="text-xs text-[var(--cliente-card-text-soft)]">Valor potencial</p><p className="font-black">{money(graph?.totals.potentialValue || 0)}</p></div></div></div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <CardTitle title="Campanhas que viraram negocio" subtitle="Compare investimento, qualidade comercial e receita atribuida." />
        <div className="mt-4 overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[minmax(220px,1.5fr)_90px_90px_90px_110px_110px] gap-3 border-b border-[var(--cliente-border)] px-3 pb-2 text-[11px] font-bold uppercase text-[var(--cliente-card-text-soft)]"><span>Origem e campanha</span><span>Leads</span><span>Qualificados</span><span>Vendas</span><span>Receita</span><span>ROAS</span></div>{graph?.campaigns.length ? graph.campaigns.slice(0, 12).map((campaign) => <div key={campaign.key} className="grid grid-cols-[minmax(220px,1.5fr)_90px_90px_90px_110px_110px] items-center gap-3 border-b border-[var(--cliente-border)] px-3 py-3 text-sm last:border-0"><div className="min-w-0"><p className="truncate font-bold text-[var(--cliente-card-text)]">{campaign.campaign}</p><p className="text-xs text-[var(--cliente-card-text-soft)]">{campaign.source}</p></div><span>{campaign.leads}</span><span>{campaign.qualified}</span><span>{campaign.won}</span><span className="font-bold">{money(campaign.revenue)}</span><span className="font-bold text-[var(--cliente-primary)]">{campaign.roas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}x</span></div>) : <div className="py-10 text-center text-sm text-[var(--cliente-card-text-soft)]">Ainda nao existem campanhas ou origens suficientes para comparar.</div>}</div></div>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <PanelCard className="p-5 md:p-6">
          <CardTitle title="Configurar coleta" subtitle="Autorize apenas os dominios que pertencem a esta empresa." />
          <label className="mt-5 block text-xs font-bold text-[var(--cliente-card-text-muted)]">Dominios permitidos</label>
          <textarea value={domains} onChange={(event) => setDomains(event.target.value)} disabled={!canManage} rows={4} placeholder="minhaempresa.com.br" className="mt-2 w-full rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3 text-sm outline-none focus:border-[var(--cliente-primary)]" />
          <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Um dominio por linha. Subdominios tambem serao aceitos.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="rounded-xl border border-[var(--cliente-border)] p-4"><span className="flex items-center justify-between gap-3 text-sm font-bold">Ativar coleta<input type="checkbox" checked={enabled} disabled={!canManage} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4" /></span><span className="mt-1 block text-xs text-[var(--cliente-card-text-soft)]">Comeca a receber eventos dos dominios acima.</span></label>
            <label className="rounded-xl border border-[var(--cliente-border)] p-4"><span className="text-sm font-bold">Consentimento</span><select value={consentMode} disabled={!canManage} onChange={(event) => setConsentMode(event.target.value as "required" | "implicit")} className="mt-2 w-full rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 text-sm"><option value="required">Aguardar consentimento</option><option value="implicit">Coletar ao carregar</option></select></label>
          </div>
          {canManage ? <button type="button" onClick={() => void save()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar e gerar codigo</button> : null}
        </PanelCard>

        <PanelCard className="p-5">
          <CardTitle title="Saude da instalacao" subtitle="A confirmacao aparece assim que o primeiro evento chegar." />
          <div className="mt-4 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4"><div className="flex items-center gap-3"><Activity className={config?.lastEventAt ? "h-5 w-5 text-[var(--cliente-success)]" : "h-5 w-5 text-[var(--cliente-warning)]"} /><div><p className="text-sm font-bold">{config?.lastEventAt ? "Dados chegando" : "Aguardando primeiro acesso"}</p><p className="text-xs text-[var(--cliente-card-text-soft)]">{config?.lastEventAt ? new Date(config.lastEventAt).toLocaleString("pt-BR") : "Instale o codigo e abra o site."}</p></div></div></div>
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--cliente-card-text-soft)]"><KeyRound className="h-4 w-4" /> Chave publica {config?.publicWriteKey ? "criada" : "pendente"}</div>
          {canManage && config?.publicWriteKey ? <button type="button" onClick={() => void rotateKey()} disabled={saving} className="mt-4 text-xs font-bold text-[var(--cliente-primary)]">Trocar chave de instalacao</button> : null}
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><CardTitle title="Instalar no site" subtitle="Cole antes do fechamento da tag </body> em todas as paginas." /><button type="button" onClick={() => void copySnippet()} disabled={!config?.publicWriteKey} className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] px-3 py-2 text-xs font-bold disabled:opacity-50">{copied ? <Check className="h-4 w-4 text-[var(--cliente-success)]" /> : <Copy className="h-4 w-4" />}{copied ? "Copiado" : "Copiar codigo"}</button></div>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100"><code>{snippet}</code></pre>
        {consentMode === "required" ? <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">Depois que o visitante aceitar cookies, execute <code className="rounded bg-[var(--cliente-surface-muted)] px-1.5 py-1">Altum.consent(&quot;granted&quot;)</code>.</p> : null}
        <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">Para registrar uma venda: <code className="rounded bg-[var(--cliente-surface-muted)] px-1.5 py-1">Altum.track(&quot;purchase_completed&quot;, &#123; value: 299.90, currency: &quot;BRL&quot; &#125;)</code></p>
      </PanelCard>

      <PanelCard className="p-5 md:p-6">
        <CardTitle title="Eventos recebidos" subtitle="Use esta lista para validar a instalacao e acompanhar a jornada real." />
        <div className="mt-4 divide-y divide-[var(--cliente-border)]">
          {payload?.events.length ? payload.events.map((event) => <div key={event.id} className="grid gap-2 py-3 text-sm md:grid-cols-[200px_1fr_180px_150px]"><div><p className="font-bold text-[var(--cliente-card-text)]">{eventLabels[event.name] || event.name}</p><p className="text-xs text-[var(--cliente-card-text-soft)]">{event.occurredAt ? new Date(event.occurredAt).toLocaleString("pt-BR") : "--"}</p></div><p className="truncate text-[var(--cliente-card-text-muted)]">{event.path || "Pagina nao informada"}</p><p className="truncate text-xs text-[var(--cliente-card-text-soft)]">{event.campaign || event.source || "Acesso direto"}</p><p className="text-right font-bold">{event.value > 0 ? money(event.value) : "--"}</p></div>) : <div className="py-10 text-center text-sm text-[var(--cliente-card-text-soft)]">Nenhum evento recebido ainda.</div>}
        </div>
      </PanelCard>
    </div>
  );
}
