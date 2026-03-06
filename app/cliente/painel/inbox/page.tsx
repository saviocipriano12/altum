"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle, Send } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { EmptyState, PanelCard, SectionHeader, StateBadge } from "@/app/cliente/painel/components/ui";

type ChatItem = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  status?: string;
  aiState?: {
    aiEnabled?: boolean;
    pausedUntil?: unknown;
    humanOwnerUserId?: string | null;
  } | null;
};

type MessageItem = {
  id: string;
  text?: string;
  sender?: "agent" | "client" | "system";
  createdAt?: unknown;
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

function formatTime(value: unknown) {
  const date = toDate(value);
  if (!date) return "--:--";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ClienteInboxPage() {
  const { tenant } = useClienteTenant();
  const searchParams = useSearchParams();
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState("");

  const initialChatId = searchParams.get("chatId");

  useEffect(() => {
    if (!tenant?.tenantId) return;

    let mounted = true;

    (async () => {
      try {
        setLoadingChats(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats`);
        const payload = (await res.json()) as { items?: ChatItem[]; error?: string };

        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar inbox.");
          setChats([]);
          return;
        }

        const nextChats = payload.items || [];
        setChats(nextChats);
        setSelectedChatId((current) => {
          if (current && nextChats.some((chat) => chat.id === current)) return current;
          if (initialChatId && nextChats.some((chat) => chat.id === initialChatId)) {
            return initialChatId;
          }
          return nextChats[0]?.id || null;
        });
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar conversas.");
      } finally {
        if (mounted) setLoadingChats(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId, initialChatId]);

  useEffect(() => {
    if (!tenant?.tenantId || !selectedChatId) {
      setMessages([]);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        setLoadingMessages(true);
        const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/messages`);
        const payload = (await res.json()) as { items?: MessageItem[]; error?: string };

        if (!mounted) return;

        if (!res.ok) {
          setError(payload.error || "Falha ao carregar mensagens.");
          setMessages([]);
          return;
        }

        setMessages(payload.items || []);
      } catch {
        if (!mounted) return;
        setError("Falha ao carregar mensagens da conversa.");
      } finally {
        if (mounted) setLoadingMessages(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [tenant?.tenantId, selectedChatId]);

  const selectedChat = useMemo(
    () => chats.find((item) => item.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const aiPaused = useMemo(() => {
    if (!selectedChat?.aiState) return false;
    if (selectedChat.aiState.aiEnabled === false) return true;
    const pausedUntil = toDate(selectedChat.aiState.pausedUntil);
    return Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
  }, [selectedChat]);

  async function handleToggleAi() {
    if (!tenant?.tenantId || !selectedChatId) return;

    const action = aiPaused ? "resume" : "pause";
    setUpdatingAi(true);
    setError(null);

    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/ai-state`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, pausedMinutes: 240 }),
        }
      );

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar estado da IA.");
        return;
      }

      const chatsRes = await authedFetch(`/api/tenant/${tenant.tenantId}/chats`);
      const chatsPayload = (await chatsRes.json()) as { items?: ChatItem[] };
      if (chatsRes.ok) setChats(chatsPayload.items || []);
    } catch {
      setError("Falha ao atualizar takeover da IA.");
    } finally {
      setUpdatingAi(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedChatId || !text.trim()) return;

    setSending(true);
    setError(null);

    try {
      const message = text.trim();
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/whatsapp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: selectedChatId, text: message }),
      });

      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar mensagem.");
        return;
      }

      setText("");

      const [chatsRes, messagesRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/chats`),
        authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/messages`),
      ]);

      const chatsPayload = (await chatsRes.json()) as { items?: ChatItem[] };
      const messagesPayload = (await messagesRes.json()) as { items?: MessageItem[] };

      if (chatsRes.ok) setChats(chatsPayload.items || []);
      if (messagesRes.ok) setMessages(messagesPayload.items || []);
    } catch {
      setError("Falha ao enviar mensagem manual.");
    } finally {
      setSending(false);
    }
  }

  if (!selectedChat && !loadingChats && chats.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Inbox" subtitle="Atendimento e takeover em tempo real." />
        <EmptyState title="Nenhuma conversa encontrada" description="Quando novas mensagens chegarem no WhatsApp, elas aparecerao aqui." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Inbox"
        subtitle="Central operacional de conversas, takeover humano e respostas em tempo real."
        action={
          <StateBadge
            label={aiPaused ? "IA pausada na conversa" : "IA ativa"}
            tone={aiPaused ? "warning" : "success"}
          />
        }
      />

      <div className="grid min-h-[74vh] grid-cols-1 gap-4 lg:grid-cols-[330px_1fr]">
        <PanelCard className="overflow-hidden">
          <div className="border-b border-white/10 p-3 text-xs uppercase tracking-[0.16em] text-white/58">Conversas</div>
          <div className="max-h-[72vh] overflow-y-auto">
            {loadingChats ? (
              <div className="p-6 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : (
              chats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => setSelectedChatId(chat.id)}
                  className={`w-full border-b border-white/5 px-3 py-3 text-left transition ${
                    selectedChatId === chat.id ? "bg-blue-400/13" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-white/92">{chat.contactName || "Contato"}</p>
                    <span className="text-[10px] text-white/45">{formatTime(chat.lastMessageTime)}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/55">{chat.contactPhone || "Sem telefone"}</p>
                  <p className="mt-1 truncate text-xs text-white/63">{chat.lastMessage || "Sem mensagem"}</p>
                </button>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-white/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{selectedChat?.contactName || "Selecione uma conversa"}</p>
                <p className="text-xs text-white/52">{selectedChat?.contactPhone || ""}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleAi()}
                disabled={!selectedChat || updatingAi}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium transition hover:bg-white/[0.09] disabled:opacity-50"
              >
                {updatingAi ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : aiPaused ? (
                  <PlayCircle className="h-3.5 w-3.5" />
                ) : (
                  <PauseCircle className="h-3.5 w-3.5" />
                )}
                {aiPaused ? "Retomar IA" : "Pausar IA"}
              </button>
            </div>
          </div>

          <div className="min-h-[46vh] flex-1 space-y-2 overflow-y-auto p-4">
            {loadingMessages ? (
              <div className="text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-white/52">Sem mensagens para esta conversa.</p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                    message.sender === "agent"
                      ? "ml-auto border border-blue-300/35 bg-blue-400/14"
                      : message.sender === "system"
                        ? "border border-amber-300/35 bg-amber-400/12"
                        : "border border-white/12 bg-white/[0.05]"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-white/92">{message.text || "-"}</p>
                  <p className="mt-1 text-[10px] text-white/45">{formatTime(message.createdAt)}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSend} className="flex gap-2 border-t border-white/10 p-3">
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Digite a mensagem"
              className="flex-1 rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm outline-none ring-blue-300/45 focus:ring"
              disabled={!selectedChatId || sending}
            />
            <button
              type="submit"
              disabled={!selectedChatId || sending || !text.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-55"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </button>
          </form>

          {error && <p className="px-3 pb-3 text-xs text-red-300">{error}</p>}
        </PanelCard>
      </div>
    </div>
  );
}

