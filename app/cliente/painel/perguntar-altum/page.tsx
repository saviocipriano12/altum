"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, CalendarCheck, CalendarDays, Database, Loader2, Megaphone, Send, Sparkles, Target } from "lucide-react";
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
  suggestedQuestions?: string[];
};

const STARTER_QUESTIONS = [
  "O que preciso fazer hoje?",
  "Quais clientes podem virar venda agora?",
  "Onde estou perdendo vendas?",
  "Quais campanhas trouxeram dinheiro ou bons leads?",
  "Quais conversas precisam de resposta?",
  "Quem devo reativar esta semana?",
  "O que falta para a IA vender melhor?",
];

const EXECUTIVE_COMMANDS = [
  {
    title: "Abrir o dia",
    detail: "Prioridade real para executar agora.",
    question: "O que preciso fazer hoje para proteger vendas e atendimento?",
    icon: CalendarCheck,
    tone: "info",
  },
  {
    title: "Encontrar dinheiro",
    detail: "Clientes, propostas e oportunidades quentes.",
    question: "Onde existe dinheiro parado na operacao e qual proxima acao devo tomar?",
    icon: Target,
    tone: "success",
  },
  {
    title: "Ler campanhas",
    detail: "Midia, leads, conversas e venda.",
    question: "Quais campanhas merecem continuar, pausar ou ajustar com base em leads, conversas e vendas?",
    icon: Megaphone,
    tone: "ai",
  },
  {
    title: "Recuperar base",
    detail: "Retencao, recompra e clientes parados.",
    question: "Quem devo reativar esta semana e com qual argumento comercial?",
    icon: CalendarDays,
    tone: "warning",
  },
] as const;

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
        "Pergunte sobre trafego, conversas, clientes, campanhas, agenda, vendas, retencao e IA. Eu leio os dados da conta e devolvo uma resposta pratica para decidir o proximo passo.",
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
  const suggestions = lastAssistant?.suggestedQuestions?.length ? lastAssistant.suggestedQuestions : STARTER_QUESTIONS;

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
          suggestedQuestions: payload.suggestedQuestions || [],
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
    <div className="perguntar-refined client-daily-page space-y-4">
      <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-ai)_10%,var(--cliente-card)),var(--cliente-card)_58%,color-mix(in_srgb,var(--cliente-primary)_8%,var(--cliente-card)))] p-4 shadow-[var(--cliente-shadow-soft)] md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              <StateBadge label="Perguntar a Altum" tone="ai" />
              <StateBadge label="trafego, venda e retencao" tone="info" />
            </div>
            <h1 className="mt-4 text-2xl font-black leading-tight tracking-normal text-[var(--cliente-card-text)] md:text-3xl">
              Converse com a operacao e saia com uma acao.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-muted)]">
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

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {EXECUTIVE_COMMANDS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => void askAltum(item.question)}
              disabled={!canAsk || loading}
              className="group rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-4 text-left shadow-[var(--cliente-shadow-soft)] transition hover:-translate-y-0.5 hover:border-[color:color-mix(in_srgb,var(--cliente-ai)_24%,var(--cliente-border))] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                  <Icon className="h-5 w-5" />
                </span>
                <StateBadge label="executar" tone={item.tone} />
              </div>
              <p className="mt-4 text-sm font-black text-[var(--cliente-card-text)]">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{item.detail}</p>
            </button>
          );
        })}
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
                  <p className="text-sm text-[var(--cliente-card-text-muted)]">Analista comercial da sua operacao</p>
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
                placeholder="Pergunte: onde esta meu maior gargalo hoje?"
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
            <CardTitle title="Perguntas prontas" subtitle="Atalhos para trafego, atendimento, venda e retencao." />
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
            <CardTitle title="Numeros da resposta" subtitle="Indicadores que sustentam a recomendacao." />
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
            <CardTitle title="Dados usados" subtitle="Areas da conta consultadas para responder." />
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
