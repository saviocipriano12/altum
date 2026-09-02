"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckSquare,
  ChevronRight,
  Clock3,
  Download,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Square,
  Trophy,
} from "lucide-react";
import {
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
import {
  ClientActionButton,
  ClientBadge,
  ClientEmptyState,
  MetricCard,
  PanelCard,
} from "@/app/cliente/painel/components/ui";
import { getPipelineStageLabel, normalizePipelineStageId } from "@/lib/pipeline";

type ReportSection = "overview" | "sellers" | "ads" | "conversations" | "leads" | "funnel";

type LeadItem = {
  id: string;
  nome?: string;
  owner?: string;
  ownerId?: string;
  pipelineStage?: string;
  stage?: string;
  heat?: string;
  potentialValue?: number;
  score?: number | null;
  sourceLabel?: string;
  origem?: string;
  campaignName?: string;
};

type ChatItem = {
  id: string;
  channel?: string;
  status?: string;
  queueStatus?: string;
  assignedTo?: string;
  ownerId?: string;
  assignedUserName?: string;
  ownerName?: string;
  unreadCount?: number;
};

type AttributionGroup = {
  key: string;
  label: string;
  source?: string | null;
  lastTouchLeads?: number;
  firstTouchLeads?: number;
  qualifiedLeads?: number;
  wonLeads?: number;
  meetings?: number;
  spend?: number;
  cpl?: number;
  campaignCount?: number | null;
};

type MetricsSummaryPayload = {
  scope?: "team" | "own";
  metrics?: {
    conversionRate?: number;
    avgFirstResponseMinutes?: number;
    conversations?: number;
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
    cpl?: number;
  };
  operations?: {
    activeChats?: number;
    overdueChats?: number;
    unassignedChats?: number;
    pendingChats?: number;
    teamPerformance?: Array<{
      ownerId?: string;
      ownerName?: string;
      activeChats?: number;
      pendingChats?: number;
      overdueChats?: number;
      avgFirstResponseMinutes?: number;
      responseSamples?: number;
      humanReplies?: number;
      handledChats?: number;
      awaitingReplyChats?: number;
      responseCoveragePct?: number;
      lastHumanReplyAt?: unknown;
      totalLeads?: number;
      wonLeads?: number;
    }>;
  };
  commercialAttribution?: {
    byChannel?: AttributionGroup[];
    byCampaign?: AttributionGroup[];
  };
};

const REPORT_SECTIONS: Array<{ id: ReportSection; label: string; description: string }> = [
  { id: "overview", label: "Resumo executivo", description: "Resultado, leads e conversas." },
  { id: "sellers", label: "Vendedores", description: "Ranking comercial por responsavel." },
  { id: "ads", label: "Ads e campanhas", description: "Gasto, leads, CPL e vendas." },
  { id: "conversations", label: "Conversas", description: "Fila, canais e pendencias." },
  { id: "leads", label: "Leads", description: "Temperatura e valor potencial." },
  { id: "funnel", label: "Funil", description: "Oportunidades por etapa." },
];

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

function clean(value: unknown, max = 120) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function ownerKey(lead: LeadItem) {
  return clean(lead.ownerId || lead.owner, 100) || "unassigned";
}

function ownerName(lead: LeadItem) {
  return clean(lead.owner, 80) || "Sem responsavel";
}

function stageOf(lead: LeadItem) {
  return normalizePipelineStageId(lead.pipelineStage || lead.stage || "captado");
}

function isWon(lead: LeadItem) {
  return ["ganho", "won", "closed_won"].includes(stageOf(lead));
}

function reportDateLabel() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function responseTimeLabel(minutes?: number, samples?: number) {
  if (!samples || !Number.isFinite(minutes) || !minutes) return "Sem amostra";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

export default function ClienteRelatoriosPage() {
  const { tenant } = useClienteTenant();
  const tenantId = tenant?.tenantId;
  const workspaceName = tenant?.tenantName || tenant?.clientName || "Operacao Altum";

  const [metrics, setMetrics] = useState<MetricsSummaryPayload>({});
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedSections, setSelectedSections] = useState<ReportSection[]>([
    "overview",
    "sellers",
    "ads",
    "conversations",
    "leads",
    "funnel",
  ]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const metricsRes = await authedFetch(`/api/tenant/${tenantId}/metrics-summary`);
      const metricsPayload = (await metricsRes.json().catch(() => ({}))) as MetricsSummaryPayload & { error?: string };
      if (!metricsRes.ok) throw new Error(metricsPayload.error || "Falha ao carregar metricas.");
      setMetrics(metricsPayload || {});
      // O resumo executivo precisa aparecer antes de rankings e historicos.
      // Esses dois conjuntos nao bloqueiam a tela e preservam o detalhamento
      // completo assim que terminam de carregar.
      void Promise.all([
        authedFetch(`/api/tenant/${tenantId}/leads`),
        authedFetch(`/api/tenant/${tenantId}/chats`),
      ]).then(async ([leadsRes, chatsRes]) => {
        const [leadsPayload, chatsPayload] = await Promise.all([
          leadsRes.json().catch(() => ({})) as Promise<{ items?: LeadItem[] }>,
          chatsRes.json().catch(() => ({})) as Promise<{ items?: ChatItem[] }>,
        ]);
        if (leadsRes.ok) setLeads(leadsPayload.items || []);
        if (chatsRes.ok) setChats(chatsPayload.items || []);
      }).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar relatorio.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = metrics.metrics || {};
  const traffic = metrics.traffic || {};
  const operations = metrics.operations || {};
  const campaigns = metrics.commercialAttribution?.byCampaign || [];
  const spend = num(traffic.spend);
  const totalLeads = num(summary.totalLeads) || num(traffic.leads) || leads.length;
  const wonLeads = num(summary.wonLeads) || leads.filter(isWon).length;
  const qualifiedLeads = num(summary.qualifiedLeads);
  const paidRevenue = num(summary.paidRevenue) || leads.filter(isWon).reduce((sum, lead) => sum + num(lead.potentialValue), 0);
  const conversion = totalLeads ? wonLeads / totalLeads : num(summary.conversionRate);
  const activeChats = num(operations.activeChats) || chats.length;

  const teamPerformanceByOwner = useMemo(
    () => new Map((operations.teamPerformance || []).filter((item) => item.ownerId).map((item) => [String(item.ownerId), item])),
    [operations.teamPerformance]
  );

  const sellerRanking = useMemo(() => {
    const ranking = new Map<string, { id: string; name: string; leads: number; won: number; hot: number; value: number; score: number }>();
    for (const lead of leads) {
      const key = ownerKey(lead);
      const current = ranking.get(key) || { id: key, name: key === "unassigned" ? "Sem responsavel" : ownerName(lead), leads: 0, won: 0, hot: 0, value: 0, score: 0 };
      current.leads += 1;
      current.won += isWon(lead) ? 1 : 0;
      current.hot += String(lead.heat || "").toLowerCase() === "quente" ? 1 : 0;
      current.value += num(lead.potentialValue);
      current.score += num(lead.score);
      ranking.set(key, current);
    }
    for (const [ownerId, performance] of teamPerformanceByOwner) {
      if (ranking.has(ownerId)) continue;
      ranking.set(ownerId, {
        id: ownerId,
        name: performance.ownerName || "Vendedor",
        leads: num(performance.totalLeads),
        won: num(performance.wonLeads),
        hot: 0,
        value: 0,
        score: 0,
      });
    }
    ranking.delete("unassigned");
    return Array.from(ranking.values())
      .map((item) => {
        const performance = teamPerformanceByOwner.get(item.id);
        return {
          ...item,
          name: performance?.ownerName || item.name,
          activeChats: num(performance?.activeChats),
          pendingChats: num(performance?.pendingChats),
          overdueChats: num(performance?.overdueChats),
          avgFirstResponseMinutes: num(performance?.avgFirstResponseMinutes),
          responseSamples: num(performance?.responseSamples),
          humanReplies: num(performance?.humanReplies),
          handledChats: num(performance?.handledChats),
          awaitingReplyChats: num(performance?.awaitingReplyChats),
          responseCoveragePct: num(performance?.responseCoveragePct),
          conversion: item.leads ? item.won / item.leads : 0,
        };
      })
      .sort((a, b) => b.won - a.won || b.value - a.value || a.avgFirstResponseMinutes - b.avgFirstResponseMinutes || b.hot - a.hot)
      .slice(0, 8);
  }, [leads, teamPerformanceByOwner]);

  const funnelData = useMemo(() => {
    const stages = new Map<string, { name: string; oportunidades: number; valor: number }>();
    for (const lead of leads) {
      const stage = stageOf(lead);
      const current = stages.get(stage) || { name: getPipelineStageLabel(stage), oportunidades: 0, valor: 0 };
      current.oportunidades += 1;
      current.valor += num(lead.potentialValue);
      stages.set(stage, current);
    }
    return Array.from(stages.values());
  }, [leads]);

  const campaignData = campaigns.slice(0, 8).map((campaign) => ({
      name: clean(campaign.label || campaign.key || "Campanha", 18),
      leads: num(campaign.lastTouchLeads) || num(campaign.firstTouchLeads),
      vendas: num(campaign.wonLeads),
      gasto: num(campaign.spend),
      cpl: num(campaign.cpl),
    }));

  function toggleSection(section: ReportSection) {
    setSelectedSections((current) =>
      current.includes(section) ? current.filter((item) => item !== section) : [...current, section]
    );
  }

  function buildReportHtml() {
    const sectionSet = new Set(selectedSections);
    const reportAttention = [
      num(operations.overdueChats) > 0
        ? `${num(operations.overdueChats)} conversa(s) estao fora do prazo de resposta.`
        : "Nenhuma conversa esta fora do prazo agora.",
      num(operations.unassignedChats) > 0
        ? `${num(operations.unassignedChats)} conversa(s) ainda estao sem responsavel.`
        : "Todas as conversas abertas possuem responsavel.",
      num(operations.pendingChats) > 0
        ? `${num(operations.pendingChats)} conversa(s) aguardam uma proxima resposta.`
        : "A fila de conversas esta em dia.",
    ];
    const sellerRows = sellerRanking
      .map((seller, index) => `<tr><td><span class="rank">${index + 1}</span>${escapeHtml(seller.name)}</td><td>${seller.leads}</td><td>${seller.won}</td><td>${pct(seller.conversion)}</td><td>${responseTimeLabel(seller.avgFirstResponseMinutes, seller.responseSamples)}</td><td>${brl(seller.value)}</td></tr>`)
      .join("");
    const campaignRows = campaignData
      .map((campaign) => `<tr><td>${escapeHtml(campaign.name)}</td><td>${brl(campaign.gasto)}</td><td>${campaign.leads}</td><td>${brl(campaign.cpl)}</td><td>${campaign.vendas}</td></tr>`)
      .join("");
    const funnelRows = funnelData
      .map((stage) => `<tr><td>${escapeHtml(stage.name)}</td><td>${stage.oportunidades}</td><td>${brl(stage.valor)}</td></tr>`)
      .join("");

    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatorio Altum - ${escapeHtml(workspaceName)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:0;color:#13213a;background:#edf2f8}
    main{max-width:1120px;margin:32px auto;background:#fff;border:1px solid #dbe4f0;border-radius:26px;overflow:hidden;box-shadow:0 18px 56px rgba(30,41,59,.10)}
    .hero{padding:34px 38px;background:linear-gradient(122deg,#173f78,#1c5eaa 58%,#4f46e5);color:#fff}.brand{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.76}.hero h1{font-size:32px;letter-spacing:-.04em;margin:13px 0 6px}.hero p{margin:0;color:rgba(255,255,255,.78);font-size:14px}.content{padding:6px 38px 38px}
    h2{font-size:17px;letter-spacing:-.015em;margin:32px 0 12px;color:#172b4d}.section-note{font-size:13px;line-height:1.6;color:#60718d;margin:-6px 0 14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}
    .card{border:1px solid #dce6f2;border-radius:16px;padding:15px 16px;background:linear-gradient(145deg,#fff,#f8fbff)}.label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6a7c98;font-weight:800}.value{font-size:25px;letter-spacing:-.04em;color:#142545;font-weight:850;margin-top:8px}
    .attention{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:24px}.attention div{border-radius:14px;padding:13px 14px;background:#fff8e7;border:1px solid #f5dfaa;color:#78540a;font-size:13px;line-height:1.45}.attention div:first-child{background:#fff1f2;border-color:#fecdd3;color:#9f1239}.attention div:last-child{background:#eef7ff;border-color:#c8e1fa;color:#1d4e89}
    table{width:100%;border-collapse:separate;border-spacing:0;margin-top:8px;border:1px solid #dce6f2;border-radius:15px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid #e8eef6;padding:12px 13px;font-size:13px}th{background:#f6f9fd;color:#58708e;font-size:10px;letter-spacing:.07em;text-transform:uppercase}tr:last-child td{border-bottom:0}td:first-child{font-weight:700;color:#1d3150}.rank{display:inline-flex;width:21px;height:21px;margin-right:8px;align-items:center;justify-content:center;border-radius:50%;background:#e8f0ff;color:#2459a8;font-size:10px;font-weight:850}
    .lead-summary{border-left:4px solid #4f46e5;background:#f5f3ff;border-radius:0 14px 14px 0;padding:15px 17px;color:#3f3a83;font-size:14px;line-height:1.6}
    .footer{margin-top:32px;padding-top:18px;border-top:1px solid #e5edf6;color:#75859d;font-size:11px;display:flex;justify-content:space-between;gap:16px}
    @media(max-width:760px){main{margin:0;border-radius:0}.hero,.content{padding-left:20px;padding-right:20px}.grid,.attention{grid-template-columns:repeat(2,1fr)}.attention{grid-template-columns:1fr}.hero h1{font-size:26px}}
    @media print{body{background:#fff}main{margin:0;box-shadow:none;border:0;border-radius:0}.hero{print-color-adjust:exact;-webkit-print-color-adjust:exact}.card,.attention div{print-color-adjust:exact;-webkit-print-color-adjust:exact}section{break-inside:avoid}}
  </style>
</head>
<body>
<main>
  <header class="hero"><div class="brand">Altum · inteligência comercial</div><h1>${escapeHtml(workspaceName)}</h1><p>Relatório executivo · gerado em ${escapeHtml(reportDateLabel())}</p></header>
  <div class="content">
    ${sectionSet.has("overview") ? `<section><h2>Resumo do período</h2><p class="section-note">Resultado comercial, geração de demanda e eficiência do funil.</p><div class="grid"><div class="card"><div class="label">Receita registrada</div><div class="value">${brl(paidRevenue)}</div></div><div class="card"><div class="label">Leads recebidos</div><div class="value">${totalLeads}</div></div><div class="card"><div class="label">Vendas ganhas</div><div class="value">${wonLeads}</div></div><div class="card"><div class="label">Conversão</div><div class="value">${pct(conversion)}</div></div></div><div class="attention">${reportAttention.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div></section>` : ""}
    ${sectionSet.has("sellers") ? `<section><h2>Desempenho da equipe</h2><p class="section-note">Ranking baseado em vendas, carteira e velocidade de primeira resposta humana.</p><table><thead><tr><th>Responsável</th><th>Leads</th><th>Vendas</th><th>Conversão</th><th>Resposta média</th><th>Valor potencial</th></tr></thead><tbody>${sellerRows || "<tr><td colspan='6'>Sem vendedores atribuídos no período.</td></tr>"}</tbody></table></section>` : ""}
    ${sectionSet.has("ads") ? `<section><h2>Campanhas e mídia paga</h2><p class="section-note">Leitura de investimento, geração de leads e resultado comercial atribuído.</p><table><thead><tr><th>Campanha</th><th>Investimento</th><th>Leads</th><th>CPL</th><th>Vendas</th></tr></thead><tbody>${campaignRows || "<tr><td colspan='5'>Sem campanhas atribuídas no período.</td></tr>"}</tbody></table></section>` : ""}
    ${sectionSet.has("conversations") ? `<section><h2>Saúde do atendimento</h2><div class="grid"><div class="card"><div class="label">Conversas ativas</div><div class="value">${activeChats}</div></div><div class="card"><div class="label">Aguardando resposta</div><div class="value">${num(operations.pendingChats)}</div></div><div class="card"><div class="label">Sem responsável</div><div class="value">${num(operations.unassignedChats)}</div></div><div class="card"><div class="label">Fora do prazo</div><div class="value">${num(operations.overdueChats)}</div></div></div></section>` : ""}
    ${sectionSet.has("leads") ? `<section><h2>Qualidade da carteira</h2><div class="lead-summary"><strong>${qualifiedLeads}</strong> lead(s) qualificado(s), <strong>${leads.filter((lead) => String(lead.heat || "").toLowerCase() === "quente").length}</strong> oportunidade(s) quente(s) e <strong>${brl(leads.reduce((sum, lead) => sum + num(lead.potentialValue), 0))}</strong> em valor potencial.</div></section>` : ""}
    ${sectionSet.has("funnel") ? `<section><h2>Funil comercial</h2><p class="section-note">Distribuição da carteira por etapa e valor potencial.</p><table><thead><tr><th>Etapa</th><th>Oportunidades</th><th>Valor potencial</th></tr></thead><tbody>${funnelRows || "<tr><td colspan='3'>Sem oportunidades no funil.</td></tr>"}</tbody></table></section>` : ""}
    <footer class="footer"><span>Altum · operação comercial com IA</span><span>Dados sujeitos às integrações configuradas no período.</span></footer>
  </div>
</main>
</body>
</html>`;
  }

  function downloadReport() {
    const blob = new Blob([buildReportHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-altum-${new Date().toISOString().slice(0, 10)}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-primary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <section className="overflow-hidden rounded-[24px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_10%,var(--cliente-card)),var(--cliente-card)_58%,color-mix(in_srgb,var(--cliente-ai)_8%,var(--cliente-card)))] p-5 shadow-[var(--cliente-shadow-soft)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <ClientBadge label="apresentavel" tone="info" />
            <h1 className="mt-3 text-2xl font-black tracking-normal text-[var(--cliente-card-text)] md:text-3xl">Relatorios comerciais</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">
              Monte um resumo com vendedores, ads, conversas, leads e funil para usar em reunioes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ClientActionButton tone="secondary" onClick={() => void load()}>
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </ClientActionButton>
            <ClientActionButton tone="primary" onClick={downloadReport} disabled={!selectedSections.length}>
              <Download className="h-4 w-4" />
              Baixar relatorio
            </ClientActionButton>
          </div>
        </div>
      </section>

      {error ? <PanelCard tone="danger" className="p-4 text-sm font-bold text-[var(--cliente-danger)]">{error}</PanelCard> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Receita" value={brl(paidRevenue)} icon={BarChart3} trend={`${wonLeads} venda(s)`} tone="success" />
        <MetricCard label="Leads" value={String(totalLeads)} icon={BarChart3} trend={`${qualifiedLeads} qualificados`} tone="brand" />
        <MetricCard label="Conversas" value={String(activeChats)} icon={BarChart3} trend={`${num(operations.pendingChats)} pendentes`} tone="warning" />
        <MetricCard label="Conversao" value={pct(conversion)} icon={BarChart3} trend={`${brl(spend)} investidos`} tone="ai" />
      </section>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <PanelCard className="p-5">
          <h2 className="text-lg font-black text-[var(--cliente-card-text)]">Blocos do relatorio</h2>
          <div className="mt-4 space-y-2">
            {REPORT_SECTIONS.map((section) => {
              const checked = selectedSections.includes(section.id);
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => toggleSection(section.id)}
                  className={`flex w-full items-start gap-3 rounded-[16px] border p-3 text-left transition ${checked ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)]" : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] hover:bg-[var(--cliente-surface-hover)]"}`}
                >
                  {checked ? <CheckSquare className="mt-0.5 h-4 w-4 text-[var(--cliente-primary)]" /> : <Square className="mt-0.5 h-4 w-4 text-[var(--cliente-card-text-soft)]" />}
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[var(--cliente-card-text)]">{section.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-[var(--cliente-card-text-soft)]">{section.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Link href={`/cliente/painel/relatorios/dia/${new Date().toISOString().slice(0, 10)}`} className="mt-4 inline-flex w-full items-center justify-center rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-panel-soft)]">
            Relatorio diario
          </Link>
        </PanelCard>

        <div className="space-y-5">
          {selectedSections.includes("ads") || selectedSections.includes("overview") ? (
            <PanelCard className="p-5">
              <h2 className="text-lg font-black text-[var(--cliente-card-text)]">Campanhas e conversao</h2>
              <div className="mt-4 h-[280px]">
                {campaignData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campaignData} margin={{ left: -18, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="var(--cliente-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--cliente-card-text-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--cliente-card-text-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
                      <Bar dataKey="leads" name="Leads" fill="var(--cliente-primary)" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="vendas" name="Vendas" fill="var(--cliente-success)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ClientEmptyState title="Sem campanhas atribuidas" description="Quando Meta, Google, UTM ou formularios chegarem com dados, o grafico aparece aqui." />
                )}
              </div>
            </PanelCard>
          ) : null}

          {selectedSections.includes("funnel") ? (
            <PanelCard className="p-5">
              <h2 className="text-lg font-black text-[var(--cliente-card-text)]">Funil comercial</h2>
              <div className="mt-4 h-[280px]">
                {funnelData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={funnelData} margin={{ left: -18, right: 10, top: 10, bottom: 0 }}>
                      <CartesianGrid stroke="var(--cliente-border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: "var(--cliente-card-text-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "var(--cliente-card-text-soft)", fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={{ border: "1px solid var(--cliente-border)", borderRadius: 14, background: "var(--cliente-card)", color: "var(--cliente-card-text)" }} />
                      <Bar dataKey="oportunidades" name="Oportunidades" fill="var(--cliente-ai)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ClientEmptyState title="Sem oportunidades no funil" description="A leitura aparece quando houver leads nas etapas." />
                )}
              </div>
            </PanelCard>
          ) : null}

          {selectedSections.includes("sellers") ? (
            <PanelCard className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-[var(--cliente-card-text)]">
                    {metrics.scope === "own" ? "Meu desempenho comercial" : "Operação por vendedor"}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                    {metrics.scope === "own"
                      ? "Sua carteira, velocidade de resposta e vendas no período."
                      : "Resultado e disciplina de atendimento, sem misturar respostas da IA com respostas humanas."}
                  </p>
                </div>
                {metrics.scope !== "own" ? <ClientBadge label="gestão da equipe" tone="info" /> : null}
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {sellerRanking.length ? (
                  sellerRanking.map((seller, index) => (
                    <article key={`${seller.name}-${index}`} className="rounded-[20px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--cliente-primary-soft)] text-sm font-black text-[var(--cliente-primary)]">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-[var(--cliente-card-text)]">{seller.name}</p>
                            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{seller.leads} leads · {seller.won} vendas · {pct(seller.conversion)}</p>
                          </div>
                        </div>
                        <Trophy className={`h-4 w-4 shrink-0 ${index === 0 ? "text-amber-500" : "text-[var(--cliente-card-text-muted)]"}`} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-2xl bg-[var(--cliente-card)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cliente-card-text-muted)]">Vendido</p>
                          <p className="mt-1 text-sm font-black text-[var(--cliente-card-text)]">{brl(seller.value)}</p>
                        </div>
                        <div className="rounded-2xl bg-[var(--cliente-card)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cliente-card-text-muted)]">1ª resposta</p>
                          <p className="mt-1 text-sm font-black text-[var(--cliente-card-text)]">{responseTimeLabel(seller.avgFirstResponseMinutes, seller.responseSamples)}</p>
                        </div>
                        <div className="rounded-2xl bg-[var(--cliente-card)] p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cliente-card-text-muted)]">Atendidos</p>
                          <p className="mt-1 text-sm font-black text-[var(--cliente-card-text)]">{seller.handledChats}</p>
                        </div>
                        <div className={`rounded-2xl p-3 ${seller.awaitingReplyChats || seller.overdueChats ? "bg-[var(--cliente-warning-soft)]" : "bg-[var(--cliente-success-soft)]"}`}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--cliente-card-text-muted)]">Aguardando</p>
                          <p className="mt-1 text-sm font-black text-[var(--cliente-card-text)]">{seller.awaitingReplyChats}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="inline-flex items-center gap-1.5 text-[var(--cliente-card-text-soft)]">
                          <MessageCircleMore className="h-3.5 w-3.5" /> {seller.humanReplies} respostas humanas
                        </span>
                        <span className={`inline-flex items-center gap-1.5 font-bold ${seller.overdueChats ? "text-[var(--cliente-warning)]" : "text-[var(--cliente-success)]"}`}>
                          <Clock3 className="h-3.5 w-3.5" /> {seller.overdueChats ? `${seller.overdueChats} fora do prazo` : "fila em dia"}
                        </span>
                      </div>
                      <Link
                        href={`/cliente/painel/inbox?assignee=${encodeURIComponent(seller.id)}`}
                        className="mt-4 inline-flex w-full items-center justify-between rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-primary)] hover:text-[var(--cliente-primary)]"
                      >
                        {metrics.scope === "own" ? "Abrir minhas conversas" : "Ver conversas deste vendedor"}
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </article>
                  ))
                ) : (
                  <div className="lg:col-span-2"><ClientEmptyState title="Sem vendedores atribuidos" description="Atribua responsáveis aos leads para montar a leitura da equipe." /></div>
                )}
              </div>
            </PanelCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}
