"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Bot, Database, Loader2, Send, Sparkles } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { CardTitle, ClientActionButton, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

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
  "Onde estou perdendo oportunidades?",
  "Quais produtos precisam de mais contexto?",
  "Como estao minhas conversas no WhatsApp?",
  "O que a IA nao esta sabendo responder?",
  "Como estao minhas campanhas?",
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

export default function PerguntarAltumPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "intro",
      role: "assistant",
      title: "Perguntar a Altum",
      text:
        "Pergunte sobre operacao, conversas, clientes, campanhas, produtos, conhecimento e IA. Eu respondo com base nos dados do tenant e mostro as fontes usadas.",
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
    <div className="client-daily-page space-y-5">
      <SectionHeader
        title="Perguntar a Altum"
        subtitle="Converse com a inteligencia da operacao para entender prioridades, gargalos e dados do negocio."
        action={
          <Link
            href="/cliente/painel/metricas"
            className="inline-flex items-center gap-2 rounded-[16px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-hover)]"
          >
            Ver relatorios
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <PanelCard className="flex min-h-[68vh] flex-col overflow-hidden p-0">
          <div className="border-b border-[var(--cliente-border)] p-4 md:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_20%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]">
                  <Bot className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Altum Insights</p>
                  <p className="text-sm text-[var(--cliente-card-text-muted)]">Respostas baseadas nos dados da conta</p>
                </div>
              </div>
              <StateBadge label="fontes internas" tone="ai" />
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
                      <StateBadge key={`${message.id}_${source.collection}`} label={source.collection} tone="neutral" />
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
                placeholder="Pergunte: quais oportunidades devo priorizar hoje?"
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
            <CardTitle title="Perguntas rapidas" subtitle="Comece por leituras que ajudam a decidir o proximo passo." />
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
            <CardTitle title="Ultima leitura" subtitle="Sinais numericos que sustentam a resposta mais recente." />
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
            <CardTitle title="Fontes usadas" subtitle="A resposta vem de colecoes internas, nao de chute solto." />
            <div className="mt-4 flex flex-wrap gap-2">
              {(lastAssistant?.sources || []).map((source) => (
                <span key={source.collection} className="inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--cliente-card-text-muted)]">
                  <Database className="h-3.5 w-3.5 text-[var(--cliente-primary)]" />
                  {source.collection}
                </span>
              ))}
            </div>
          </PanelCard>

          <PanelCard tone="spotlight" className="p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-1 h-5 w-5 text-white" />
              <div>
                <p className="text-sm font-semibold text-white">Proxima evolucao</p>
                <p className="mt-2 text-sm leading-6 text-white/76">
                  Esta area esta pronta para ganhar raciocinio generativo com citacoes, mas ja comeca lendo a operacao real com precisao.
                </p>
              </div>
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}
