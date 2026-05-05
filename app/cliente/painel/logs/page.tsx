"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  Cable,
  FileText,
  Loader2,
  RefreshCcw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, MetricCard, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type AiLog = {
  id: string;
  chatId?: string;
  decision?: "respond" | "ask_more" | "handoff" | "skip";
  reason?: string;
  confidence?: number | null;
  createdAt?: unknown;
  input?: string;
  output?: string;
};

type ExecutionItem = {
  id: string;
  automationId?: string;
  automationName?: string;
  trigger?: string;
  leadId?: string;
  chatId?: string;
  channel?: string | null;
  matched?: boolean;
  status?: string;
  actionsExecuted?: number;
  detail?: string;
  lastError?: string;
  updatedAt?: unknown;
};

type QueueItem = {
  id: string;
  chatId: string;
  status: "pending" | "processing" | "retrying" | "done" | "dead_letter";
  attempts: number;
  lastError?: string;
  updatedAt?: unknown;
};

type AutomationSummaryResponse = {
  summary?: {
    queue?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
    };
    scheduled?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
    };
    processedTotal?: number;
    waitingReplyBacklog?: number;
    slaBreached?: number;
  };
  recentExecutions?: ExecutionItem[];
  recentQueue?: QueueItem[];
  error?: string;
};

function toDate(value: unknown) {
  if (!value) return null;
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

function formatDateTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "Sem data";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function decisionTone(decision?: string) {
  if (decision === "handoff") return "warning" as const;
  if (decision === "ask_more") return "info" as const;
  if (decision === "skip") return "neutral" as const;
  return "success" as const;
}

function executionTone(status?: string) {
  if (status === "error") return "danger" as const;
  if (status === "skipped") return "warning" as const;
  if (status === "done") return "success" as const;
  return "neutral" as const;
}

function queueTone(status?: string) {
  if (status === "dead_letter") return "danger" as const;
  if (status === "retrying") return "warning" as const;
  if (status === "processing") return "info" as const;
  if (status === "done") return "success" as const;
  return "neutral" as const;
}

function decisionLabel(decision?: string) {
  if (decision === "handoff") return "transferencia";
  if (decision === "ask_more") return "pedir mais dados";
  if (decision === "skip") return "ignorar";
  return "responder";
}

function executionStatusLabel(status?: string) {
  if (status === "done") return "concluido";
  if (status === "error") return "erro";
  if (status === "skipped") return "ignorado";
  if (status === "pending") return "pendente";
  return status || "pendente";
}

function queueStatusLabel(status?: string) {
  if (status === "pending") return "pendente";
  if (status === "processing") return "processando";
  if (status === "retrying") return "nova tentativa";
  if (status === "dead_letter") return "falha repetida";
  if (status === "done") return "concluido";
  return status || "pendente";
}

function confidenceLabel(value?: number | null) {
  if (typeof value !== "number") return "--";
  return `${Math.round(value * 100)}%`;
}

export default function ClienteLogsPage() {
  const { tenant } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchFromQuery = searchParams.get("q") || "";
  const aiFromQuery = searchParams.get("ai") || "all";
  const executionFromQuery = searchParams.get("execution") || "all";
  const queueFromQuery = searchParams.get("queue") || "all";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [summary, setSummary] = useState<AutomationSummaryResponse>({});
  const [aiFilter, setAiFilter] = useState<"all" | "handoff" | "low_confidence">(
    aiFromQuery === "handoff" || aiFromQuery === "low_confidence" ? aiFromQuery : "all"
  );
  const [executionFilter, setExecutionFilter] = useState<"all" | "done" | "error" | "skipped">(
    executionFromQuery === "done" || executionFromQuery === "error" || executionFromQuery === "skipped"
      ? executionFromQuery
      : "all"
  );
  const [queueFilter, setQueueFilter] = useState<"all" | QueueItem["status"]>(
    queueFromQuery === "pending" ||
      queueFromQuery === "processing" ||
      queueFromQuery === "retrying" ||
      queueFromQuery === "done" ||
      queueFromQuery === "dead_letter"
      ? queueFromQuery
      : "all"
  );
  const [search, setSearch] = useState(searchFromQuery);

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [logsRes, summaryRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/ai-logs`),
        authedFetch(`/api/tenant/${tenant.tenantId}/automation-summary`),
      ]);

      const logsPayload = (await logsRes.json()) as { items?: AiLog[]; error?: string };
      const summaryPayload = (await summaryRes.json()) as AutomationSummaryResponse;

      if (!logsRes.ok) throw new Error(logsPayload.error || "Falha ao carregar logs da IA.");
      if (!summaryRes.ok) throw new Error(summaryPayload.error || "Falha ao carregar logs operacionais.");

      setLogs(logsPayload.items || []);
      setSummary(summaryPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar central de logs.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchFromQuery !== search) setSearch(searchFromQuery);
    const nextAi = aiFromQuery === "handoff" || aiFromQuery === "low_confidence" ? aiFromQuery : "all";
    if (nextAi !== aiFilter) setAiFilter(nextAi);
    const nextExecution =
      executionFromQuery === "done" || executionFromQuery === "error" || executionFromQuery === "skipped"
        ? executionFromQuery
        : "all";
    if (nextExecution !== executionFilter) setExecutionFilter(nextExecution);
    const nextQueue =
      queueFromQuery === "pending" ||
      queueFromQuery === "processing" ||
      queueFromQuery === "retrying" ||
      queueFromQuery === "done" ||
      queueFromQuery === "dead_letter"
        ? queueFromQuery
        : "all";
    if (nextQueue !== queueFilter) setQueueFilter(nextQueue);
  }, [aiFilter, aiFromQuery, executionFilter, executionFromQuery, queueFilter, queueFromQuery, search, searchFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search.trim()) next.set("q", search.trim());
    if (aiFilter !== "all") next.set("ai", aiFilter);
    if (executionFilter !== "all") next.set("execution", executionFilter);
    if (queueFilter !== "all") next.set("queue", queueFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/logs?${nextQuery}` : "/cliente/painel/logs");
  }, [aiFilter, executionFilter, queueFilter, router, search, searchParams]);

  const filteredAiLogs = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return logs.filter((item) => {
      if (aiFilter === "handoff" && item.decision !== "handoff") return false;
      if (aiFilter === "low_confidence" && !(typeof item.confidence === "number" && item.confidence < 0.55)) return false;
      if (
        normalizedSearch &&
        !`${item.reason || ""} ${item.input || ""} ${item.output || ""} ${item.decision || ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [aiFilter, logs, search]);

  const filteredExecutions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (summary.recentExecutions || []).filter((item) => {
      if (executionFilter !== "all" && item.status !== executionFilter) return false;
      if (
        normalizedSearch &&
        !`${item.automationName || ""} ${item.trigger || ""} ${item.detail || ""} ${item.lastError || ""}`
          .toLowerCase()
          .includes(normalizedSearch)
      ) {
        return false;
      }
      return true;
    });
  }, [executionFilter, search, summary.recentExecutions]);

  const filteredQueue = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (summary.recentQueue || []).filter((item) => {
      if (queueFilter !== "all" && item.status !== queueFilter) return false;
      if (normalizedSearch && !`${item.chatId} ${item.status} ${item.lastError || ""}`.toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });
  }, [queueFilter, search, summary.recentQueue]);

  const metrics = useMemo(() => {
    const handoffs = logs.filter((item) => item.decision === "handoff").length;
    const lowConfidence = logs.filter((item) => typeof item.confidence === "number" && item.confidence < 0.55).length;
    const executionErrors = (summary.recentExecutions || []).filter((item) => item.status === "error").length;
    const queueDeadLetters = Number(summary.summary?.queue?.deadLetter || 0) + Number(summary.summary?.scheduled?.deadLetter || 0);
    return {
      totalAi: logs.length,
      handoffs,
      lowConfidence,
      executionErrors,
      queueDeadLetters,
    };
  }, [logs, summary.recentExecutions, summary.summary?.queue?.deadLetter, summary.summary?.scheduled?.deadLetter]);
  const focusSignals = useMemo<
    Array<{
      id: string;
      title: string;
      detail: string;
      badge: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
      href: string;
    }>
  >(() => {
    return [
      {
        id: "dead_letter",
        title: "Falhas repetidas na fila",
        detail: "Tarefas que falharam varias vezes e pedem intervencao manual.",
        badge: String(metrics.queueDeadLetters),
        tone: metrics.queueDeadLetters ? "danger" : "success",
        href: "/cliente/painel/automacoes",
      },
      {
        id: "low_confidence",
        title: "IA com baixa confianca",
        detail: "Respostas que indicam necessidade de revisar prompt, KB ou guardrails.",
        badge: String(metrics.lowConfidence),
        tone: metrics.lowConfidence ? "warning" : "success",
        href: "/cliente/painel/ia?risk=low_confidence",
      },
      {
        id: "handoff",
        title: "Escaladas recentes",
        detail: "Conversas que sairam do piloto automatico e exigem humano.",
        badge: String(metrics.handoffs),
        tone: metrics.handoffs ? "info" : "neutral",
        href: "/cliente/painel/handoffs",
      },
      {
        id: "sla",
        title: "SLA em risco",
        detail: "Fila com impacto direto na experiencia do contato e do time comercial.",
        badge: String(summary.summary?.slaBreached || 0),
        tone: summary.summary?.slaBreached ? "danger" : "success",
        href: "/cliente/painel/inbox?queue=sla_breached",
      },
    ];
  }, [metrics.handoffs, metrics.lowConfidence, metrics.queueDeadLetters, summary.summary?.slaBreached]);

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center text-[var(--cliente-card-text-muted)]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Falha ao carregar logs operacionais"
        description={error}
        action={
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2 text-sm text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
          >
            Tentar novamente
          </button>
        }
      />
    );
  }

  return (
    <div className="logs-refined client-daily-page space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <PanelCard className="p-5 md:p-6">
          <SectionHeader
            title="Logs operacionais"
            subtitle="Auditoria continua da IA, automacoes e fila que sustenta a operacao comercial da conta."
            action={
              <button
                type="button"
                onClick={() => void loadData()}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-medium text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
              >
                <RefreshCcw className="h-4 w-4" />
                Atualizar
              </button>
            }
          />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Logs IA" value={String(metrics.totalAi)} icon={Bot} trend="ultima janela operacional" />
            <MetricCard label="Transferencias" value={String(metrics.handoffs)} icon={AlertTriangle} trend="escaladas humanas" />
            <MetricCard label="Baixa confianca" value={String(metrics.lowConfidence)} icon={ShieldAlert} trend="respostas de risco" />
            <MetricCard label="Erros execucao" value={String(metrics.executionErrors)} icon={Cable} trend="automacoes recentes" />
            <MetricCard label="Falhas repetidas" value={String(metrics.queueDeadLetters)} icon={FileText} trend="fila precisa revisao" />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {focusSignals.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="logs-focus-card block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:bg-[var(--cliente-panel-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.detail}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </Link>
            ))}
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6">
          <SectionHeader title="Pulso da fila" subtitle="Leitura rapida do que esta segurando a operacao agora." />
          <div className="space-y-3">
            <HealthRow label="Fila pendente" value={String(summary.summary?.queue?.pending || 0)} />
            <HealthRow label="Nova tentativa" value={String(summary.summary?.queue?.retrying || 0)} danger={Boolean(summary.summary?.queue?.retrying)} />
            <HealthRow label="Agendadas falhas" value={String(summary.summary?.scheduled?.deadLetter || 0)} danger={Boolean(summary.summary?.scheduled?.deadLetter)} />
            <HealthRow label="SLA estourado" value={String(summary.summary?.slaBreached || 0)} danger={Boolean(summary.summary?.slaBreached)} />
            <HealthRow label="Backlog sem resposta" value={String(summary.summary?.waitingReplyBacklog || 0)} danger={Boolean(summary.summary?.waitingReplyBacklog)} />
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <SectionHeader title="Filtro unico" subtitle="Use a mesma busca para cruzar IA, automacoes e fila." />
        <label className="flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
          <Search className="h-4 w-4" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar motivo, automacao, gatilho, erro ou conversa"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
          />
        </label>
      </PanelCard>

      <section className="grid gap-4 xl:grid-cols-3">
        <PanelCard className="p-5 md:p-6 xl:col-span-1">
          <SectionHeader title="IA" subtitle="Decisoes recentes do agente." />
          <div className="mb-4 grid gap-2 md:grid-cols-3 xl:grid-cols-1">
            <FilterButton label="Todos" active={aiFilter === "all"} onClick={() => setAiFilter("all")} />
            <FilterButton label="Transferencias" active={aiFilter === "handoff"} onClick={() => setAiFilter("handoff")} />
            <FilterButton label="Baixa confianca" active={aiFilter === "low_confidence"} onClick={() => setAiFilter("low_confidence")} />
          </div>
          <div className="space-y-3">
            {filteredAiLogs.length ? (
              filteredAiLogs.slice(0, 10).map((item) => (
                <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge label={decisionLabel(item.decision)} tone={decisionTone(item.decision)} />
                        <StateBadge label={`conf. ${confidenceLabel(item.confidence)}`} tone={decisionTone(item.decision)} />
                      </div>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{item.reason || item.input || "Log sem detalhe"}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(item.createdAt)}</p>
                    </div>
                    {item.chatId ? (
                      <Link href={`/cliente/painel/inbox?chatId=${encodeURIComponent(item.chatId)}`} className="text-xs text-[var(--cliente-accent)] hover:brightness-110">
                        Conversas
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Sem logs de IA neste recorte" description="Ajuste os filtros ou aguarde novas decisoes do agente." />
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6 xl:col-span-1">
          <SectionHeader title="Execucoes" subtitle="Automacoes recentes e seus resultados." />
          <div className="mb-4 grid gap-2 md:grid-cols-4 xl:grid-cols-1">
            <FilterButton label="Todos" active={executionFilter === "all"} onClick={() => setExecutionFilter("all")} />
            <FilterButton label="Concluido" active={executionFilter === "done"} onClick={() => setExecutionFilter("done")} />
            <FilterButton label="Erro" active={executionFilter === "error"} onClick={() => setExecutionFilter("error")} />
            <FilterButton label="Ignorado" active={executionFilter === "skipped"} onClick={() => setExecutionFilter("skipped")} />
          </div>
          <div className="space-y-3">
            {filteredExecutions.length ? (
              filteredExecutions.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge label={executionStatusLabel(item.status)} tone={executionTone(item.status)} />
                        <StateBadge label={item.trigger || "gatilho"} tone="neutral" />
                      </div>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{item.automationName || "Automacao"}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.detail || item.lastError || "Sem detalhe"}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(item.updatedAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Link href="/cliente/painel/automacoes" className="text-xs text-[var(--cliente-accent)] hover:brightness-110">
                        Automacoes
                      </Link>
                      {item.chatId ? (
                        <Link href={`/cliente/painel/inbox?chatId=${encodeURIComponent(item.chatId)}`} className="text-xs text-[var(--cliente-accent)] hover:brightness-110">
                          Conversas
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Sem execucoes neste recorte" description="As proximas automacoes processadas aparecem aqui." />
            )}
          </div>
        </PanelCard>

        <PanelCard className="p-5 md:p-6 xl:col-span-1">
          <SectionHeader title="Fila" subtitle="Itens da operacao conversacional." />
          <div className="mb-4 grid gap-2 md:grid-cols-5 xl:grid-cols-1">
            <FilterButton label="Todos" active={queueFilter === "all"} onClick={() => setQueueFilter("all")} />
            <FilterButton label="Pendente" active={queueFilter === "pending"} onClick={() => setQueueFilter("pending")} />
            <FilterButton label="Processando" active={queueFilter === "processing"} onClick={() => setQueueFilter("processing")} />
            <FilterButton label="Nova tentativa" active={queueFilter === "retrying"} onClick={() => setQueueFilter("retrying")} />
            <FilterButton label="Falha repetida" active={queueFilter === "dead_letter"} onClick={() => setQueueFilter("dead_letter")} />
          </div>
          <div className="space-y-3">
            {filteredQueue.length ? (
              filteredQueue.map((item) => (
                <article key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StateBadge label={queueStatusLabel(item.status)} tone={queueTone(item.status)} />
                        <StateBadge label={`${item.attempts} tentativa(s)`} tone="neutral" />
                      </div>
                      <p className="mt-2 text-sm text-[var(--cliente-card-text)]">Chat {item.chatId.slice(0, 12)}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.lastError || "Sem erro registrado"}</p>
                      <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{formatDateTime(item.updatedAt)}</p>
                    </div>
                    <Link href={`/cliente/painel/inbox?chatId=${encodeURIComponent(item.chatId)}`} className="text-xs text-[var(--cliente-accent)] hover:brightness-110">
                      Conversas
                    </Link>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Fila limpa neste recorte" description="Nenhum item recente corresponde ao filtro atual." />
            )}
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5 md:p-6">
        <SectionHeader title="Guia rapido" subtitle="A partir do log, caia no modulo certo e resolva o gargalo." />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <QuickLink href="/cliente/painel/inbox?queue=awaiting_reply" title="Fila aguardando resposta" description="Checar conversas que podem gerar nova tentativa, atraso ou nova transferencia." />
          <QuickLink href="/cliente/painel/automacoes" title="Revisar automacoes" description="Atuar em execucoes com erro, regras puladas e cadencias que travaram." />
          <QuickLink href="/cliente/painel/ia" title="Ajustar IA" description="Reforcar conhecimento e guardrails nos pontos de baixa confianca." />
          <QuickLink href="/cliente/painel/handoffs" title="Assumir escaladas" description="Distribuir transferencias humanas e aliviar o backlog operacional." />
        </div>
      </PanelCard>
    </div>
  );
}

function HealthRow({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="logs-health-row flex items-center justify-between rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3">
      <span className="text-sm text-[var(--cliente-card-text-muted)]">{label}</span>
      <StateBadge label={value} tone={danger ? "danger" : "neutral"} />
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`logs-filter-button rounded-xl border px-3 py-2 text-left text-sm transition ${
        active
          ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
          : "border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="logs-quick-link block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:bg-[var(--cliente-panel-soft)]"
    >
      <p className="text-sm font-medium text-white">{title}</p>
      <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{description}</p>
    </Link>
  );
}
