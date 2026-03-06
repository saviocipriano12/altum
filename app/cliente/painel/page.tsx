"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  ChartColumn,
  Clock3,
  Funnel,
  Handshake,
  Loader2,
  Megaphone,
  MessageSquare,
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
  const stage = String(value || "captado").trim().toLowerCase();
  return stage || "captado";
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

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const [dashboardRes, leadsRes, chatsRes, aiRes, kbRes] = await Promise.all([
          authedFetch("/api/client-portal/dashboard"),
          authedFetch(`/api/tenant/${tenant.tenantId}/leads`),
          authedFetch(`/api/tenant/${tenant.tenantId}/chats`),
          authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`),
          authedFetch(`/api/tenant/${tenant.tenantId}/kb-docs`),
        ]);

        const dashboardPayload = (await dashboardRes.json()) as DashboardData;
        const leadsPayload = (await leadsRes.json()) as { items?: LeadItem[]; error?: string };
        const chatsPayload = (await chatsRes.json()) as { items?: ChatItem[]; error?: string };
        const aiPayload = (await aiRes.json()) as { ai?: AiSettings; error?: string };
        const kbPayload = (await kbRes.json()) as KbDocList;

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
        detail: `${lead.nome || "Lead"} · ${event.detail || "Atualizacao de pipeline"}`,
        createdAt: toDate(event.createdAt),
      }));

    const financeEvents: ActivityItem[] = (dashboard?.finance || []).map((item) => ({
      id: item.id,
      source: "finance" as const,
      title: item.descricao || "Lancamento financeiro",
      detail: `${String(item.status || "pendente")} · ${brl(Number(item.valor || 0))}`,
      createdAt: toDate(item.createdAt),
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

  if (loading) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
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
        title="Client Operating System"
        subtitle="Visao executiva de operacao, funil, atendimento e automacao em tempo real."
        action={<StateBadge label={ai.enabled === false ? "IA limitada" : "Operacao estavel"} tone={operationStatusTone} />}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Leads" value={(kpis?.leads || 0).toLocaleString("pt-BR")} icon={Activity} trend="captacao" />
        <MetricCard label="Conversas" value={chats.length.toLocaleString("pt-BR")} icon={MessageSquare} trend={`${aiPausedChats} com IA pausada`} />
        <MetricCard label="Investimento" value={brl(Number(kpis?.spend || 0))} icon={Wallet} trend={`CPL ${brl(Number(kpis?.cpl || 0))}`} />
        <MetricCard label="Receita" value={brl(Number(kpis?.paid || 0))} icon={Handshake} trend={`Pendente ${brl(Number(kpis?.pending || 0))}`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <PanelCard className="p-4">
          <CardTitle title="Funil visual" subtitle="Distribuicao dos leads por etapa comercial" />
          <div className="mt-4 space-y-3">
            {funnel.map((item) => (
              <div key={item.stage} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-white/62">
                  <span className="uppercase tracking-wide">{item.stage}</span>
                  <span>
                    {item.total} leads ({item.pct}%)
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500"
                    style={{ width: `${Math.max(4, item.pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <CardTitle title="Saude da automacao" subtitle="Estado atual do motor de atendimento e IA" />
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-white/65">IA global</span>
              <StateBadge label={ai.enabled === false ? "desativada" : "ativa"} tone={ai.enabled === false ? "warning" : "success"} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-white/65">Guardrails configurados</span>
              <span className="font-semibold text-white">{(ai.guardrails || []).length}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-white/65">Base de conhecimento</span>
              <span className="font-semibold text-white">{kbCount} docs</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <span className="text-white/65">Conversas com takeover</span>
              <span className="font-semibold text-white">{aiPausedChats}</span>
            </div>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <PanelCard className="p-4">
          <CardTitle title="Atividades recentes" subtitle="Ultimos eventos de financeiro e CRM" />
          <div className="mt-4 space-y-2">
            {activities.length === 0 ? (
              <p className="text-sm text-white/52">Sem eventos recentes para exibir.</p>
            ) : (
              activities.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white/90">{item.title}</p>
                    <StateBadge label={item.source} tone={item.source === "lead" ? "info" : "neutral"} />
                  </div>
                  <p className="mt-1 text-xs text-white/58">{item.detail}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-white/45">
                    <Clock3 className="h-3 w-3" />
                    {item.createdAt ? item.createdAt.toLocaleString("pt-BR") : "sem data"}
                  </p>
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-4">
          <CardTitle title="Metricas resumidas" subtitle="Resumo executivo do periodo" />
          <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Impressoes" value={(kpis?.impressions || 0).toLocaleString("pt-BR")} />
                <Row label="Cliques" value={(kpis?.clicks || 0).toLocaleString("pt-BR")} />
                <Row label="CTR" value={pct(Number(kpis?.ctr || 0))} />
                <Row label="CPC" value={brl(Number(kpis?.cpc || 0))} />
                <Row label="CPL" value={brl(Number(kpis?.cpl || 0))} />
                <Row label="Projetos ativos" value={String(Number(kpis?.projects || 0))} />
                <Row label="Orcamentos" value={String(Number(kpis?.budgets || 0))} />
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <PanelCard className="border-white/10 bg-white/[0.03] p-3">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <Megaphone className="h-3.5 w-3.5" />
                Midia
              </div>
              <p className="mt-2 text-base font-semibold">{brl(Number(kpis?.spend || 0))}</p>
            </PanelCard>
            <PanelCard className="border-white/10 bg-white/[0.03] p-3">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <Funnel className="h-3.5 w-3.5" />
                Conversao
              </div>
              <p className="mt-2 text-base font-semibold">{(kpis?.leads || 0).toLocaleString("pt-BR")} leads</p>
            </PanelCard>
          </div>
        </PanelCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="CTR" value={pct(Number(kpis?.ctr || 0))} icon={ChartColumn} />
        <MetricCard label="CPC" value={brl(Number(kpis?.cpc || 0))} icon={Wallet} />
        <MetricCard label="CPL" value={brl(Number(kpis?.cpl || 0))} icon={Bot} />
        <MetricCard label="Contrato" value={dashboard.contract?.status || "nao informado"} icon={Handshake} trend={dashboard.contract?.title || ""} />
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-white/10 last:border-none">
      <td className="px-3 py-2 text-white/58">{label}</td>
      <td className="px-3 py-2 text-right font-medium text-white/92">{value}</td>
    </tr>
  );
}
