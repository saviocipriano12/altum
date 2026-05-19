"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Database, Loader2, Send, Sparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, ClientActionButton, PanelCard, StateBadge } from "@/app/cliente/painel/components/ui";

type InsightResponse = {
  title?: string;
  answer?: string;
  metrics?: Record<string, number>;
  sources?: Array<{ collection: string }>;
  suggestedQuestions?: string[];
  error?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  title?: string;
  sources?: Array<{ collection: string }>;
  metrics?: Record<string, number>;
};

const STARTER_QUESTIONS = [
  "O que preciso fazer hoje?",
  "Quais clientes devo priorizar agora?",
  "Onde estou perdendo vendas?",
  "Quais campanhas trouxeram melhores contatos?",
  "Quais conversas precisam de resposta?",
  "O que falta para a IA vender melhor?",
];

function metricLabel(key: string) {
  const labels: Record<string, string> = {
    leads: "Oportunidades",
    recentLeads: "Leads recentes",
    openChats: "Conversas abertas",
    pendingTasks: "Tarefas pendentes",
    overdueTasks: "Tarefas vencidas",
    kbDocs: "Conhecimento",
    catalogDocs: "Produtos/servicos",
    aiHandoffs: "Escaladas",
    lowConfidence: "Baixa confianca",
    campaignSpend30d: "Investimento 30d",
    paidFinance: "Recebido",
    pendingFinance: "Pendente",
  };
  return labels[key] || key;
}

function metricValue(key: string, value: number) {
  if (key.toLowerCase().includes("finance") || key.toLowerCase().includes("spend")) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  return String(value);
}

function sourceLabel(collection: string) {
  const labels: Record<string, string> = {
    leads: "Clientes",
    chats: "Conversas",
    lead_tasks: "Retornos",
    appointments: "Agenda",
    kb_docs: "Base e ofertas",
    ai_logs: "Assistente",
    financeiro: "Financeiro",
    campaigns: "Campanhas",
    campaign_snapshots: "Campanhas",
    ecommerce_connections: "E-commerce",
  };
  return labels[collection] || collection.replaceAll("_", " ");
}

export default function PerguntarAltumPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      title: "Perguntar a Altum",
      text:
        "Pergunte sobre clientes, conversas, campanhas, produtos, agenda, vendas e IA. Eu leio os dados da conta e devolvo uma resposta pratica para decidir o proximo passo.",
      sources: [
        { collection: "leads" },
        { collection: "chats" },
        { collection: "kb_docs" },
        { collection: "ai_logs" },
      ],
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAsk = hasCapability("manage_ai") || hasCapability("manage_settings") || hasCapability("view_reports");

  const lastAssistant = useMemo(() => [...messages].reverse().find((item) => item.role === "assistant"), [messages]);
  const suggestions = STARTER_QUESTIONS;

  async function askAltum(nextQuestion?: string) {
    const text = (nextQuestion || question).trim();
    if (!tenant?.tenantId || !text || loading) return;

    const userMessage: Message = {
      id: `user_${Date.now()}`,
      role: "user",
      text,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setLoading(true);
    setError(null);

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/business-insights/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const payload = (await res.json()) as InsightResponse;
      if (!res.ok) throw new Error(payload.error || "Falha ao perguntar para a Altum.");

      setMessages((current) => [
        ...current,
        {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          title: payload.title || "Resposta da Altum",
          text: payload.answer || "Nao encontrei uma resposta clara com os dados atuais.",
          sources: payload.sources || [],
          metrics: payload.metrics || {},
        },
      ]);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Falha ao perguntar para a Altum.");
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askAltum();
  }

  return (
    <div className="client-daily-page space-y-6">
      <section className="overflow-hidden rounded-[30px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,#f5f3ff_82%,var(--cliente-card)),color-mix(in_srgb,#eff6ff_72%,var(--cliente-panel-soft)))] p-5 shadow-[0_24px_70px_-48px_rgba(124,58,237,0.42)] md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Perguntar a Altum" tone="ai" />
              <StateBadge label="decisao com dados" tone="info" />
            </div>
            <h1 className="mt-5 text-3xl font-black leading-tight tracking-[-0.03em] text-[var(--cliente-card-text)] md:text-5xl">
              Pergunte como gestor e receba uma resposta com proximo passo.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)] md:text-base">
              Use a Altum para entender prioridades, gargalos, campanhas, clientes parados e oportunidades que merecem atencao agora.
            </p>
          </div>
          <Link
            href="/cliente/painel/metricas"
            className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 py-2.5 text-sm font-bold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-hover)]"
          >
            Ver relatorios
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <PanelCard className="flex min-h-[68vh] flex-col overflow-hidden p-0">
          <div className="border-b border-[var(--cliente-border)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Altum</p>
                  <p className="text-sm text-[var(--cliente-card-text-muted)]">Respostas para decidir e agir</p>
                </div>
              </div>
              <StateBadge label="dados da conta" tone="ai" />
            </div>
          </div>

          <div className="client-scrollbar flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[88%] rounded-[24px] border p-4 ${
                  message.role === "user"
                    ? "ml-auto border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-primary)] text-white"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text)]"
                }`}
              >
                {message.title && message.role === "assistant" ? (
                  <p className="mb-2 text-sm font-semibold text-[var(--cliente-card-text)]">{message.title}</p>
                ) : null}
                <p className={`whitespace-pre-line text-sm leading-6 ${message.role === "user" ? "text-white" : "text-[var(--cliente-card-text-muted)]"}`}>
                  {message.text}
                </p>
                {message.role === "assistant" && message.sources?.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {message.sources.map((source) => (
                      <StateBadge key={`${message.id}_${source.collection}`} label={sourceLabel(source.collection)} tone="neutral" />
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {loading ? (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-sm text-[var(--cliente-card-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin text-[var(--cliente-ai)]" />
                Lendo os dados da operacao...
              </div>
            ) : null}
          </div>

          <form onSubmit={submit} className="border-t border-[var(--cliente-border)] p-4 md:p-5">
            {error ? (
              <p className="mb-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-100">
                {error}
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                disabled={!canAsk || loading}
                placeholder="Pergunte: quais clientes devo priorizar hoje?"
                className="client-input rounded-2xl border px-4 py-3 text-sm outline-none"
              />
              <ClientActionButton type="submit" tone="ai" disabled={!canAsk || loading || !question.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Perguntar
              </ClientActionButton>
            </div>
          </form>
        </PanelCard>

        <div className="space-y-4">
          <PanelCard tone="ai" className="p-5">
            <CardTitle title="Perguntas prontas" subtitle="Atalhos para decidir mais rapido." />
            <div className="mt-4 space-y-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void askAltum(item)}
                  disabled={!canAsk || loading}
                  className="w-full rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3 text-left text-sm font-medium text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="Numeros da resposta" subtitle="Indicadores que ajudam a conferir a leitura." />
            <div className="mt-4 grid gap-2">
              {lastAssistant?.metrics && Object.keys(lastAssistant.metrics).length ? (
                Object.entries(lastAssistant.metrics)
                  .filter(([, value]) => typeof value === "number")
                  .slice(0, 8)
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5">
                      <span className="text-sm text-[var(--cliente-card-text-muted)]">{metricLabel(key)}</span>
                      <span className="text-sm font-semibold text-[var(--cliente-card-text)]">{metricValue(key, value)}</span>
                    </div>
                  ))
              ) : (
                <p className="text-sm text-[var(--cliente-card-text-muted)]">As metricas aparecem depois da primeira pergunta.</p>
              )}
            </div>
          </PanelCard>

          <PanelCard className="p-5">
            <CardTitle title="De onde veio" subtitle="A resposta mostra quais areas da conta foram consultadas." />
            <div className="mt-4 flex flex-wrap gap-2">
              {(lastAssistant?.sources || []).map((source) => (
                <span key={source.collection} className="inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--cliente-card-text-muted)]">
                  <Database className="h-3.5 w-3.5 text-[var(--cliente-primary)]" />
                  {sourceLabel(source.collection)}
                </span>
              ))}
            </div>
          </PanelCard>

          <PanelCard tone="spotlight" className="p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Use como rotina diaria</p>
                <p className="mt-2 text-sm leading-6 text-white/76">
                  Comece perguntando o que fazer hoje, depois aprofunde por cliente, campanha, conversa ou produto.
                </p>
              </div>
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}
