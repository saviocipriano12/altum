"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";
import {
  Bot,
  BrainCircuit,
  Lightbulb,
  Loader2,
  Send,
  Sparkles,
  User,
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

