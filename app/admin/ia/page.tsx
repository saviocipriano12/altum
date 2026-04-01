"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";
import { humanizeAiNextAction } from "@/lib/ai-next-actions";
import { getBusinessProfile, normalizeBusinessProfileId } from "@/lib/business-profiles";
import {
  Bot,
  BrainCircuit,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  User,
  Activity,
  CalendarClock,
  HandCoins,
  Handshake,
} from "lucide-react";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ProposedAction = {
  type: "create_activity";
  requiresConfirmation: boolean;
  payload: {
    descricao?: string;
    data?: string;
    clientId?: string;
    ownerId?: string;
    clienteNome?: string;
  };
  preview?: {
    title?: string;
    description?: string;
  };
};

type AskResponse = {
  mode: "client" | "global";
  answer: string;
  actionProposal?: ProposedAction | null;
};

type AdminAiSignalsResponse = {
  summary?: {
    totalSignals?: number;
    handoffs?: number;
    proposalSignals?: number;
    scheduleSignals?: number;
    qualificationSignals?: number;
    recommendationSignals?: number;
    objectionSignals?: number;
    activeTenants?: number;
  };
  tenants?: Array<{
    tenantId: string;
    tenantName: string;
    legacyClientId: string;
    businessProfileId: string;
    totalSignals: number;
    handoffs: number;
    proposalSignals: number;
    scheduleSignals: number;
    qualificationSignals: number;
    recommendationSignals?: number;
    objectionSignals?: number;
    lastSignalAt?: unknown;
  }>;
  topActions?: Array<{
    key: string;
    count: number;
  }>;
  recent?: Array<{
    id: string;
    tenantId: string;
    tenantName: string;
    legacyClientId: string;
    businessProfileId: string;
    chatId: string;
    leadId: string;
    decision: "respond" | "ask_more" | "handoff" | "skip";
    nextAction: string;
    provider: string;
    model: string;
    confidence: number | null;
    plannerIntent?: string;
    responseGoal?: string;
    stateAfter?: string;
    recommendedOffer?: string;
    objectionType?: string;
    commercialTemperature?: string;
    createdAt?: unknown;
  }>;
};

type AdminAiJobsSummaryResponse = {
  counts?: {
    pending?: number;
    processing?: number;
    retrying?: number;
    done?: number;
    deadLetter?: number;
  };
  total?: number;
};

type AdminAiUsageSummaryResponse = {
  currentMonth?: {
    runs?: number;
    estimatedCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    avgLatencyMs?: number;
    failures?: number;
    fallbacks?: number;
  };
  last7Days?: {
    runs?: number;
    estimatedCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    avgLatencyMs?: number;
    failures?: number;
    fallbacks?: number;
  };
  last30Days?: {
    runs?: number;
    estimatedCostUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    avgLatencyMs?: number;
    failures?: number;
    fallbacks?: number;
  };
  providers?: Array<{
    provider: string;
    runs: number;
    estimatedCostUsd: number;
  }>;
  topTenants?: Array<{
    tenantId: string;
    tenantName: string;
    runs: number;
    estimatedCostUsd: number;
  }>;
  expensiveRuns?: Array<{
    id: string;
    tenantName: string;
    provider: string;
    model: string;
    scope: string;
    estimatedCostUsd: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    createdAt?: unknown;
  }>;
};

type AdminAiLearningSummaryResponse = {
  summary?: {
    totalRuns?: number;
    avgConfidence?: number;
    lowConfidenceRuns?: number;
    avgQualityScore?: number;
    lowQualityRuns?: number;
  };
  topIntents?: Array<{ key: string; count: number }>;
  topGoals?: Array<{ key: string; count: number }>;
  topOffers?: Array<{ key: string; count: number }>;
  topObjections?: Array<{ key: string; count: number }>;
  topActions?: Array<{ key: string; count: number }>;
  temperatures?: Array<{ key: string; count: number }>;
};

type AdminAiInternalNotificationsResponse = {
  items?: Array<{
    id: string;
    tenantId: string;
    chatId: string;
    leadId: string;
    type: string;
    severity: string;
    title: string;
    detail: string;
    status: string;
    createdAt?: unknown;
  }>;
};

const SUGGESTIONS = [
  "Como esta o cliente Vitta Prime?",
  "Me de um resumo geral da empresa hoje.",
  "Quais atividades estao pendentes na minha carteira?",
  "Crie atividade de follow-up para o cliente Pedraum.",
];

export default function AdminIAPage() {
  const { profile } = useAuth();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [signalsLoading, setSignalsLoading] = useState(true);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const [signals, setSignals] = useState<AdminAiSignalsResponse>({});
  const [usage, setUsage] = useState<AdminAiUsageSummaryResponse>({});
  const [jobs, setJobs] = useState<AdminAiJobsSummaryResponse>({});
  const [learning, setLearning] = useState<AdminAiLearningSummaryResponse>({});
  const [internalNotifications, setInternalNotifications] = useState<AdminAiInternalNotificationsResponse>({});
  const [selectedTenantId, setSelectedTenantId] = useState("all");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "boot",
      role: "assistant",
      content:
        "Assistente ALTUM online. Eu respondo com dados internos e posso sugerir acoes operacionais com confirmacao.",
    },
  ]);
  const [pendingAction, setPendingAction] = useState<ProposedAction | null>(null);

  const canSend = input.trim().length > 0 && !loading;

  const capabilities = useMemo(
    () => [
      "Resumo por cliente: status, projetos, financeiro, atividades e leads.",
      "Resumo geral da operacao conforme seu escopo de permissao.",
      "Sugestao de acao com confirmacao antes de escrever dados.",
    ],
    []
  );

  useEffect(() => {
    async function loadSignals() {
      try {
        setSignalsLoading(true);
        setSignalsError(null);

        const [signalsResponse, usageResponse, jobsResponse, learningResponse, notificationsResponse] = await Promise.all([
          authedFetch("/api/admin/ai/signals"),
          authedFetch("/api/admin/ai/usage-summary"),
          authedFetch("/api/admin/ai/jobs/summary"),
          authedFetch("/api/admin/ai/learning-summary"),
          authedFetch("/api/admin/ai/internal-notifications"),
        ]);
        const signalsData = (await signalsResponse.json().catch(() => ({}))) as AdminAiSignalsResponse & { error?: string };
        const usageData = (await usageResponse.json().catch(() => ({}))) as AdminAiUsageSummaryResponse & { error?: string };
        const jobsData = (await jobsResponse.json().catch(() => ({}))) as AdminAiJobsSummaryResponse & { error?: string };
        const learningData = (await learningResponse.json().catch(() => ({}))) as AdminAiLearningSummaryResponse & { error?: string };
        const notificationsData = (await notificationsResponse.json().catch(() => ({}))) as AdminAiInternalNotificationsResponse & { error?: string };
        if (!signalsResponse.ok) {
          throw new Error(signalsData.error || "Falha ao carregar sinais da IA.");
        }
        if (!usageResponse.ok) {
          throw new Error(usageData.error || "Falha ao carregar custos da IA.");
        }
        if (!jobsResponse.ok) {
          throw new Error(jobsData.error || "Falha ao carregar fila da IA.");
        }
        if (!learningResponse.ok) {
          throw new Error(learningData.error || "Falha ao carregar aprendizado da IA.");
        }
        if (!notificationsResponse.ok) {
          throw new Error(notificationsData.error || "Falha ao carregar notificacoes internas da IA.");
        }

        setSignals(signalsData);
        setUsage(usageData);
        setJobs(jobsData);
        setLearning(learningData);
        setInternalNotifications(notificationsData);
      } catch (error) {
        setSignalsError(error instanceof Error ? error.message : "Falha ao carregar sinais da IA.");
      } finally {
        setSignalsLoading(false);
      }
    }

    void loadSignals();
  }, []);

  const signalSummary = useMemo(() => signals.summary || {}, [signals.summary]);
  const usageCurrentMonth = useMemo(() => usage.currentMonth || {}, [usage.currentMonth]);
  const usageLast7Days = useMemo(() => usage.last7Days || {}, [usage.last7Days]);
  const jobCounts = useMemo(() => jobs.counts || {}, [jobs.counts]);
  const learningSummary = useMemo(() => learning.summary || {}, [learning.summary]);
  const topLearnedObjections = useMemo(() => learning.topObjections || [], [learning.topObjections]);
  const topLearnedOffers = useMemo(() => learning.topOffers || [], [learning.topOffers]);
  const tenantSignals = useMemo(() => signals.tenants || [], [signals.tenants]);
  const recentSignals = useMemo(() => signals.recent || [], [signals.recent]);
  const recentInternalNotifications = useMemo(() => internalNotifications.items || [], [internalNotifications.items]);
  const filteredRecentSignals = useMemo(
    () =>
      selectedTenantId === "all"
        ? recentSignals
        : recentSignals.filter((item) => item.tenantId === selectedTenantId),
    [recentSignals, selectedTenantId]
  );
  const selectedTenant = useMemo(
    () => tenantSignals.find((tenant) => tenant.tenantId === selectedTenantId) || null,
    [selectedTenantId, tenantSignals]
  );
  const topActions = useMemo(() => {
    const source = selectedTenantId === "all" ? recentSignals : filteredRecentSignals;
    return Array.from(
      source.reduce((acc, item) => {
        const key = item.nextAction || "sem_acao";
        acc.set(key, (acc.get(key) || 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [filteredRecentSignals, recentSignals, selectedTenantId]);

  async function ask(question: string) {
    const cleaned = question.trim();
    if (!cleaned) return;

    setMessages((prev) => [
      ...prev,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content: cleaned,
      },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response = await authedFetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: cleaned }),
      });

      const data = (await response.json()) as AskResponse | { error?: string };
      if (!response.ok || !("answer" in data)) {
        throw new Error((data as { error?: string }).error || "Falha na IA");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
        },
      ]);

      setPendingAction(data.actionProposal || null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          content: `Nao consegui responder agora: ${message}`,
        },
      ]);
      setPendingAction(null);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    setConfirming(true);

    try {
      const response = await authedFetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: {
            type: pendingAction.type,
            confirm: true,
            payload: pendingAction.payload,
          },
        }),
      });

      const data = (await response.json()) as
        | { ok: boolean; activity?: { id: string; descricao?: string } }
        | { error?: string };

      if (!response.ok || !("ok" in data)) {
        throw new Error((data as { error?: string }).error || "Falha ao executar acao");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-action-${Date.now()}`,
          role: "assistant",
          content: `Acao executada com sucesso. Atividade criada: ${data.activity?.id || "-"}.`,
        },
      ]);
      setPendingAction(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-action-error-${Date.now()}`,
          role: "assistant",
          content: `Nao consegui executar a acao: ${message}`,
        },
      ]);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#0d1117] via-[#0a0f13] to-black p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-blue-300/80">
              Assistente Operacional
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
              <BrainCircuit className="h-7 w-7 text-blue-400" />
              IA da ALTUM
            </h1>
            <p className="text-sm text-white/60 max-w-3xl">
              Responde com dados da plataforma e pode executar acoes com confirmacao.
            </p>
          </div>
          <div className="text-xs text-white/60 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            Usuario: <span className="text-white/90">{profile?.name || "Operador"}</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SignalMetric label="Sinais recentes" value={String(signalSummary.totalSignals || 0)} icon={Activity} />
        <SignalMetric label="Handoffs" value={String(signalSummary.handoffs || 0)} icon={Handshake} />
        <SignalMetric label="Propostas" value={String(signalSummary.proposalSignals || 0)} icon={HandCoins} />
        <SignalMetric label="Agendamentos" value={String(signalSummary.scheduleSignals || 0)} icon={CalendarClock} />
        <SignalMetric label="Recomendacoes" value={String(signalSummary.recommendationSignals || 0)} icon={Lightbulb} />
        <SignalMetric label="Tenants ativos" value={String(signalSummary.activeTenants || 0)} icon={Sparkles} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SignalMetric label="Custo estimado no mes" value={`US$ ${Number(usageCurrentMonth.estimatedCostUsd || 0).toFixed(2)}`} icon={HandCoins} />
        <SignalMetric label="Execucoes no mes" value={String(usageCurrentMonth.runs || 0)} icon={Bot} />
        <SignalMetric label="Custo ultimos 7 dias" value={`US$ ${Number(usageLast7Days.estimatedCostUsd || 0).toFixed(2)}`} icon={Activity} />
        <SignalMetric label="Tokens ultimos 7 dias" value={String((Number(usageLast7Days.inputTokens || 0) + Number(usageLast7Days.outputTokens || 0)).toLocaleString("pt-BR"))} icon={BrainCircuit} />
        <SignalMetric label="Fila pendente" value={String(jobCounts.pending || 0)} icon={Send} />
        <SignalMetric label="Dead letters" value={String(jobCounts.deadLetter || 0)} icon={Loader2} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#0f0f10] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Learning loop</p>
              <h2 className="mt-1 text-lg font-semibold text-white">O que a IA esta aprendendo</h2>
            </div>
            <div className="text-xs text-white/55">
              ultimos 14 dias
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniPill label="runs" value={learningSummary.totalRuns || 0} tone="blue" />
            <MiniPill label="conf media" value={learningSummary.avgConfidence || 0} tone="emerald" />
            <MiniPill label="baixa conf" value={learningSummary.lowConfidenceRuns || 0} tone="amber" />
            <MiniPill label="qualidade" value={learningSummary.avgQualityScore || 0} tone="violet" />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/45">Objecoes dominantes</p>
              <div className="mt-3 space-y-2">
                {topLearnedObjections.length ? topLearnedObjections.map((item) => (
                  <div key={`obj-${item.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                    <span>{item.key}</span>
                    <span className="text-white/45">{item.count}</span>
                  </div>
                )) : <p className="text-sm text-white/45">Sem objecoes dominantes ainda.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-white/45">Ofertas mais sugeridas</p>
              <div className="mt-3 space-y-2">
                {topLearnedOffers.length ? topLearnedOffers.map((item) => (
                  <div key={`offer-${item.key}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/75">
                    <span>{item.key}</span>
                    <span className="text-white/45">{item.count}</span>
                  </div>
                )) : <p className="text-sm text-white/45">Sem ofertas dominantes ainda.</p>}
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Sinais internos</p>
              <h2 className="mt-1 text-lg font-semibold text-white">O que a IA pediu para o time</h2>
            </div>
            <div className="text-xs text-white/55">tempo real operacional</div>
          </div>
          <div className="mt-4 space-y-3">
            {recentInternalNotifications.length ? recentInternalNotifications.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-white/55">
                      tenant {item.tenantId} · lead {item.leadId || "-"} · chat {item.chatId || "-"}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[11px] ${
                    item.severity === "high"
                      ? "border border-rose-400/25 bg-rose-500/10 text-rose-100"
                      : item.severity === "warning"
                        ? "border border-amber-400/25 bg-amber-500/10 text-amber-100"
                        : "border border-blue-400/25 bg-blue-500/10 text-blue-100"
                  }`}>
                    {item.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/75">{item.detail}</p>
                <p className="mt-2 text-[11px] text-white/40">{formatDateTime(item.createdAt)}</p>
              </div>
            )) : <p className="text-sm text-white/45">Sem notificacoes internas recentes.</p>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-white/10 bg-[#0f0f10] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Supervisao da ALTUM</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Tenants com mais sinais da IA</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedTenantId}
                onChange={(event) => setSelectedTenantId(event.target.value)}
                className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75 outline-none"
              >
                <option value="all">Todos os tenants</option>
                {tenantSignals.map((tenant) => (
                  <option key={tenant.tenantId} value={tenant.tenantId}>
                    {tenant.tenantName}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/65">
                {signalsLoading ? "Atualizando..." : `${tenantSignals.length} tenant(s) no radar`}
              </div>
            </div>
          </div>

          {signalsError ? (
            <p className="mt-4 text-sm text-rose-200">{signalsError}</p>
          ) : signalsLoading ? (
            <div className="mt-6 inline-flex items-center gap-2 text-sm text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando sinais operacionais...
            </div>
          ) : tenantSignals.length === 0 ? (
            <p className="mt-4 text-sm text-white/55">Nenhum sinal recente da IA no recorte atual.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {(selectedTenant ? [selectedTenant] : tenantSignals).map((tenant) => {
                const businessProfile = getBusinessProfile(normalizeBusinessProfileId(tenant.businessProfileId));
                return (
                <div key={tenant.tenantId} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{tenant.tenantName}</p>
                      <p className="mt-1 text-xs text-white/50">
                        Tenant {tenant.tenantId} Â· modo {businessProfile.label}
                      </p>
                    </div>
                    <div className="text-right text-xs text-white/55">
                      <p>{tenant.totalSignals} sinais</p>
                      <p>{formatDateTime(tenant.lastSignalAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-6">
                    <MiniPill label="handoff" value={tenant.handoffs} tone="amber" />
                    <MiniPill label="proposta" value={tenant.proposalSignals} tone="blue" />
                    <MiniPill label="agenda" value={tenant.scheduleSignals} tone="emerald" />
                    <MiniPill label="qualificacao" value={tenant.qualificationSignals} tone="violet" />
                    <MiniPill label="recomendacao" value={tenant.recommendationSignals || 0} tone="emerald" />
                    <MiniPill label="objecoes" value={tenant.objectionSignals || 0} tone="amber" />
                  </div>
                  {tenant.legacyClientId ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/admin/clientes/${tenant.legacyClientId}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/75 transition hover:bg-white/10"
                      >
                        Abrir cliente
                      </Link>
                      <Link
                        href={`/admin/clientes/${tenant.legacyClientId}/portal`}
                        className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100 transition hover:bg-blue-500/15"
                      >
                        Abrir portal
                      </Link>
                    </div>
                  ) : null}
                </div>
              )})}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Pulso da inteligencia</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Ultimos sinais</h2>
          </div>

          <div className="mt-4 space-y-3">
            {filteredRecentSignals.length === 0 ? (
              <p className="text-sm text-white/55">Sem sinais recentes para mostrar.</p>
            ) : (
              filteredRecentSignals.slice(0, 10).map((item) => {
                const businessProfile = getBusinessProfile(normalizeBusinessProfileId(item.businessProfileId));
                return (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.tenantName}</p>
                      <p className="mt-1 text-xs text-white/55">
                        {humanizeAiNextAction(item.nextAction)} Â· {humanizeDecision(item.decision)} Â· {businessProfile.label}
                      </p>
                    </div>
                    <span className="text-[11px] text-white/45">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="mt-2 text-xs text-white/50">
                    lead {item.leadId || "-"} Â· chat {item.chatId || "-"} Â· {item.provider || "provider"} / {item.model || "model"}
                  </p>
                  {item.plannerIntent || item.responseGoal || item.stateAfter || item.recommendedOffer || item.objectionType || item.commercialTemperature ? (
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/65">
                      {item.plannerIntent ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">intencao: {item.plannerIntent}</span>
                      ) : null}
                      {item.responseGoal ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">objetivo: {item.responseGoal}</span>
                      ) : null}
                      {item.stateAfter ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">estado: {item.stateAfter}</span>
                      ) : null}
                      {item.recommendedOffer ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">oferta: {item.recommendedOffer}</span>
                      ) : null}
                      {item.objectionType ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">objecao: {item.objectionType}</span>
                      ) : null}
                      {item.commercialTemperature ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">temperatura: {item.commercialTemperature}</span>
                      ) : null}
                    </div>
                  ) : null}
                  {item.legacyClientId ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/admin/clientes/${item.legacyClientId}`}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-white/75 transition hover:bg-white/10"
                      >
                        Cliente
                      </Link>
                      <Link
                        href={`/admin/clientes/${item.legacyClientId}/portal`}
                        className="rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-100 transition hover:bg-blue-500/15"
                      >
                        Portal
                      </Link>
                    </div>
                  ) : null}
                </div>
              )})
            )}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs uppercase tracking-wide text-white/55">Acoes mais frequentes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {topActions.length === 0 ? (
                <span className="text-xs text-white/45">Sem recorrencia suficiente ainda.</span>
              ) : (
                topActions.map((action) => (
                  <span
                    key={action.key}
                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/75"
                  >
                    {humanizeAiNextAction(action.key)} Â· {action.count}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-2xl border border-white/10 bg-[#0f0f10] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Custos e provedores</p>
            <h2 className="mt-1 text-lg font-semibold text-white">O que esta gerando uso de IA</h2>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(usage.providers || []).slice(0, 6).map((item) => (
              <div key={item.provider} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-semibold text-white">{item.provider}</p>
                <p className="mt-1 text-xs text-white/55">{item.runs} execucao(oes)</p>
                <p className="mt-2 text-sm text-emerald-200">US$ {Number(item.estimatedCostUsd || 0).toFixed(4)}</p>
              </div>
            ))}
            {!(usage.providers || []).length ? (
              <p className="text-sm text-white/55">Sem dados de custo suficientes ainda. As novas execucoes vao alimentar este painel.</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Tenants com maior consumo</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Onde a IA esta pesando mais</h2>
          </div>
          <div className="mt-4 space-y-3">
            {(usage.topTenants || []).slice(0, 8).map((item) => (
              <div key={item.tenantId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-sm font-semibold text-white">{item.tenantName}</p>
                <p className="mt-1 text-xs text-white/55">{item.runs} execucao(oes)</p>
                <p className="mt-2 text-sm text-amber-200">US$ {Number(item.estimatedCostUsd || 0).toFixed(4)}</p>
              </div>
            ))}
            {!(usage.topTenants || []).length ? (
              <p className="text-sm text-white/55">Ainda nao ha volume suficiente para ranquear tenants por custo.</p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-[#0f0f10] p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => ask(suggestion)}
                disabled={loading}
                className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] text-white/80 hover:bg-white/10 transition disabled:opacity-60"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/30 p-3 h-[430px] overflow-y-auto space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-2 ${
                  message.role === "assistant" ? "items-start" : "items-start justify-end"
                }`}
              >
                {message.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4 text-blue-300" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] whitespace-pre-line rounded-xl px-3 py-2 text-sm ${
                    message.role === "assistant"
                      ? "bg-white/5 border border-white/10 text-white/85"
                      : "bg-blue-600/20 border border-blue-500/40 text-blue-100"
                  }`}
                >
                  {message.content}
                </div>
                {message.role === "user" && (
                  <div className="h-7 w-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-white/70" />
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="inline-flex items-center gap-2 text-xs text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                IA consultando dados...
              </div>
            )}
          </div>

          {pendingAction && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-2">
              <p className="text-xs uppercase tracking-wide text-emerald-200">
                Acao sugerida (requer confirmacao)
              </p>
              <p className="text-sm text-emerald-100">
                {pendingAction.preview?.title || "Criar atividade"}
              </p>
              <p className="text-xs text-emerald-100/80">
                {pendingAction.preview?.description || pendingAction.payload?.descricao || "-"}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={confirmAction}
                  disabled={confirming}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {confirming ? "Executando..." : "Confirmar acao"}
                </button>
                <button
                  onClick={() => setPendingAction(null)}
                  disabled={confirming}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs text-white/75 hover:bg-white/10 transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canSend) void ask(input);
            }}
            className="rounded-xl border border-white/10 bg-black/20 p-2 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Pergunte sobre clientes, financeiro, projetos ou peca para criar follow-up..."
              className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-white/35"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500 transition disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar
            </button>
          </form>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#111] p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-300" />
              O que esta IA ja faz
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-white/75">
              {capabilities.map((item) => (
                <li key={item} className="leading-relaxed">
                  - {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/10 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-100 flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Proximos upgrades
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-emerald-100/85">
              <li>- Disparo de follow-up no WhatsApp com aprovacao.</li>
              <li>- Resumo diario automatico do CEO.</li>
              <li>- Alertas de risco de churn por cliente.</li>
              <li>- Recomendacao de prioridade por chance de fechamento.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}

function formatDateTime(value?: unknown) {
  if (!value) return "Sem data";
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (typeof value === "number") {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "Sem data";
}

function humanizeDecision(value: "respond" | "ask_more" | "handoff" | "skip") {
  if (value === "respond") return "respondeu";
  if (value === "ask_more") return "qualificou";
  if (value === "handoff") return "escalou";
  return "ignorou";
}

function SignalMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f10] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/45">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-2 text-blue-200">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function MiniPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "emerald" | "violet";
}) {
  const tones: Record<typeof tone, string> = {
    amber: "border-amber-400/20 bg-amber-500/10 text-amber-100",
    blue: "border-blue-400/20 bg-blue-500/10 text-blue-100",
    emerald: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
    violet: "border-violet-400/20 bg-violet-500/10 text-violet-100",
  };

  return (
    <div className={`rounded-xl border px-3 py-2 text-xs ${tones[tone]}`}>
      <span className="block uppercase tracking-wide opacity-70">{label}</span>
      <span className="mt-1 block text-sm font-semibold">{value}</span>
    </div>
  );
}


