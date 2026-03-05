"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";

type ChatItem = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  status?: string;
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
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [text, setText] = useState("");

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
        setSelectedChatId((current) => current || nextChats[0]?.id || null);
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
  }, [tenant?.tenantId]);

  useEffect(() => {
    if (!tenant?.tenantId || !selectedChatId) {
      setMessages([]);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        setLoadingMessages(true);
        const res = await authedFetch(
          `/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/messages`
        );
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-[72vh]">
      <section className="rounded-2xl border border-white/10 bg-[#101010] overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h2 className="text-sm uppercase tracking-wide text-white/70">Conversas</h2>
          <p className="text-xs text-white/45">Inbox do tenant {tenant?.tenantId}</p>
        </div>

        <div className="max-h-[72vh] overflow-y-auto">
          {loadingChats ? (
            <div className="p-6 text-center text-white/60">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : chats.length === 0 ? (
            <div className="p-6 text-sm text-white/50">Nenhuma conversa encontrada.</div>
          ) : (
            chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => setSelectedChatId(chat.id)}
                className={`w-full text-left p-3 border-b border-white/5 transition hover:bg-white/5 ${
                  selectedChatId === chat.id ? "bg-blue-500/15" : ""
                }`}
              >
                <p className="text-sm font-medium text-white/90 truncate">{chat.contactName || "Contato"}</p>
                <p className="text-xs text-white/50 truncate">{chat.contactPhone || "Sem telefone"}</p>
                <p className="text-xs text-white/60 truncate mt-1">{chat.lastMessage || "Sem mensagem"}</p>
                <p className="text-[10px] text-white/40 mt-1">{formatTime(chat.lastMessageTime)}</p>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#101010] flex flex-col min-h-0">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold">{selectedChat?.contactName || "Selecione uma conversa"}</h3>
          <p className="text-xs text-white/50">{selectedChat?.contactPhone || ""}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[45vh]">
          {loadingMessages ? (
            <div className="text-center text-white/60">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-white/50">Sem mensagens para esta conversa.</p>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[82%] rounded-xl px-3 py-2 text-sm ${
                  message.sender === "agent"
                    ? "ml-auto bg-blue-500/20 border border-blue-500/40"
                    : message.sender === "system"
                      ? "bg-amber-500/15 border border-amber-500/30"
                      : "bg-white/5 border border-white/10"
                }`}
              >
                <p className="whitespace-pre-wrap">{message.text || "-"}</p>
                <p className="text-[10px] text-white/45 mt-1">{formatTime(message.createdAt)}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Digite a mensagem"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            disabled={!selectedChatId || sending}
          />
          <button
            type="submit"
            disabled={!selectedChatId || sending || !text.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </button>
        </form>

        {error && <p className="px-3 pb-3 text-xs text-red-300">{error}</p>}
      </section>
    </div>
  );
}
