"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  Inbox,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldAlert,
  UserRound,
  Users,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/context/AuthContext";
import { authedFetch } from "@/app/lib/authed-fetch";
import type { TimestampLike } from "@/app/types/domain";

type ChatDoc = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  status?: string;
  ownerId?: string | null;
  ownerName?: string | null;
  leadId?: string | null;
  lastMessage?: string;
  lastMessageTime?: TimestampLike | number | null;
  unreadCount?: number;
};

type MessageDoc = {
  id: string;
  chatId: string;
  text?: string;
  sender?: "agent" | "client" | "system";
  createdAt?: TimestampLike | number | null;
};

type TeamUser = {
  id: string;
  name: string;
  role: "admin" | "closer" | "sdr";
  status: "active" | "blocked";
};

type LeadContext = {
  id: string;
  nome?: string;
  status?: string;
  pipelineStage?: string;
  ownerId?: string;
};

type PageNotice = {
  type: "ok" | "warn" | "err";
  message: string;
};

function toDate(value?: TimestampLike | number | null) {
  if (!value) return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate();
  }
  return null;
}

function shortTime(value?: TimestampLike | number | null) {
  const date = toDate(value);
  if (!date) return "--:--";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function normalize(text: string) {
  return text.toLowerCase().trim();
}

type AdminTab = "all" | "queue" | "mine";

export default function ChatPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatIdFromUrl = searchParams.get("chatId");

  const isAdmin = profile?.role === "admin";

  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingLead, setLoadingLead] = useState(false);
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const [allChats, setAllChats] = useState<ChatDoc[]>([]);
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [leadContext, setLeadContext] = useState<LeadContext | null>(null);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(chatIdFromUrl);
  const [adminTab, setAdminTab] = useState<AdminTab>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [text, setText] = useState("");
  const [transferToUid, setTransferToUid] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [notice, setNotice] = useState<PageNotice | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedChatId(chatIdFromUrl);
  }, [chatIdFromUrl]);

  useEffect(() => {
    if (authLoading || !profile) return;

    setLoadingChats(true);

    const baseRef = collection(db, "chats");
    const q = isAdmin
      ? query(baseRef, orderBy("lastMessageTime", "desc"))
      : query(baseRef, where("ownerId", "==", profile.uid));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<ChatDoc, "id">),
        })) as ChatDoc[];

        next.sort((a, b) => {
          const ta = toDate(a.lastMessageTime)?.getTime() || 0;
          const tb = toDate(b.lastMessageTime)?.getTime() || 0;
          return tb - ta;
        });

        setAllChats(next);
        setLoadingChats(false);
      },
      (error) => {
        console.error("Erro ao carregar chats:", error);
        setAllChats([]);
        setLoadingChats(false);
      }
    );

    return () => unsubscribe();
  }, [authLoading, profile, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(collection(db, "users"), where("status", "==", "active"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const users = snap.docs
        .map((item) => ({ id: item.id, ...(item.data() as Omit<TeamUser, "id">) }))
        .filter((user) => user.role === "closer" || user.role === "sdr");
      setTeamUsers(users);
    });
    return () => unsubscribe();
  }, [isAdmin]);

  const visibleChats = useMemo(() => {
    const term = normalize(searchTerm);
    const base = allChats.filter((chat) => {
      if (!term) return true;
      const byName = normalize(chat.contactName || "").includes(term);
      const byPhone = (chat.contactPhone || "").includes(term);
      return byName || byPhone;
    });

    if (!isAdmin) return base;

    if (adminTab === "queue") {
      return base.filter((chat) => !chat.ownerId);
    }

    if (adminTab === "mine" && profile) {
      return base.filter((chat) => chat.ownerId === profile.uid);
    }

    return base;
  }, [allChats, searchTerm, isAdmin, adminTab, profile]);

  const selectedChat = useMemo(
    () => visibleChats.find((chat) => chat.id === selectedChatId) || null,
    [visibleChats, selectedChatId]
  );

  useEffect(() => {
    if (!visibleChats.length) {
      if (selectedChatId) {
        setSelectedChatId(null);
        router.replace("/admin/chat");
      }
      return;
    }

    const hasSelected =
      selectedChatId !== null &&
      visibleChats.some((chat) => chat.id === selectedChatId);

    if (hasSelected) return;

    const firstId = visibleChats[0].id;
    setSelectedChatId(firstId);
    router.replace(`/admin/chat?chatId=${firstId}`);
  }, [selectedChatId, visibleChats, router]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!selectedChat?.id) {
      setMessages([]);
      return;
    }

    setLoadingMessages(true);
    const q = query(
      collection(db, "messages"),
      where("chatId", "==", selectedChat.id),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((item) => ({
          id: item.id,
          ...(item.data() as Omit<MessageDoc, "id">),
        })) as MessageDoc[];
        setMessages(next);
        setLoadingMessages(false);
      },
      (error) => {
        console.error("Erro ao carregar mensagens:", error);
        setMessages([]);
        setLoadingMessages(false);
      }
    );

    return () => unsubscribe();
  }, [selectedChat?.id]);

  useEffect(() => {
    if (!selectedChat?.leadId) {
      setLeadContext(null);
      return;
    }

    setLoadingLead(true);
    getDoc(doc(db, "leads", selectedChat.leadId))
      .then((snap) => {
        if (!snap.exists()) {
          setLeadContext(null);
          return;
        }
        const data = snap.data() as Omit<LeadContext, "id">;
        setLeadContext({ id: snap.id, ...data });
      })
      .catch((error) => {
        console.error("Erro ao carregar contexto do lead:", error);
        setLeadContext(null);
      })
      .finally(() => {
        setLoadingLead(false);
      });
  }, [selectedChat?.leadId]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, selectedChat?.id]);

  function selectChat(chat: ChatDoc) {
    setSelectedChatId(chat.id);
    router.push(`/admin/chat?chatId=${chat.id}`);
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!selectedChat?.id) return;
    if (!text.trim()) return;

    setSending(true);
    try {
      const response = await authedFetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedChat.id,
          text: text.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Falha no envio");
      }

      setText("");
      setNotice({ type: "ok", message: "Mensagem enviada com sucesso." });
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setNotice({ type: "err", message: `Nao foi possivel enviar: ${message}` });
    } finally {
      setSending(false);
    }
  }

  async function transferChat() {
    if (!selectedChat?.id) return;
    if (!transferToUid) {
      setNotice({ type: "warn", message: "Selecione o vendedor de destino." });
      return;
    }
    if (!transferReason.trim()) {
      setNotice({ type: "warn", message: "Informe o motivo da transferencia." });
      return;
    }

    setTransferring(true);
    try {
      const response = await authedFetch("/api/chats/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedChat.id,
          toUid: transferToUid,
          reason: transferReason.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Falha na transferencia");
      }

      setTransferReason("");
      setNotice({ type: "ok", message: "Transferencia concluida." });
    } catch (error) {
      console.error("Erro ao transferir chat:", error);
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      setNotice({ type: "err", message: `Falha ao transferir: ${message}` });
    } finally {
      setTransferring(false);
    }
  }

  if (authLoading || !profile) {
    return (
      <div className="h-[calc(100vh-96px)] flex items-center justify-center text-white/60">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-96px)] grid grid-cols-1 lg:grid-cols-[320px_1fr_300px] gap-4">
      {notice && (
        <div
          className={`lg:col-span-3 rounded-xl border px-3 py-2 text-sm ${
            notice.type === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : notice.type === "warn"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-100"
                : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {notice.message}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-[#0f0f0f] flex flex-col min-h-0">
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-blue-400" />
            <h1 className="font-semibold">Inbox WhatsApp</h1>
          </div>

          {isAdmin && (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <button
                onClick={() => setAdminTab("all")}
                className={`rounded-lg px-2 py-1.5 border ${
                  adminTab === "all"
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-100"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setAdminTab("queue")}
                className={`rounded-lg px-2 py-1.5 border ${
                  adminTab === "queue"
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-100"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Fila
              </button>
              <button
                onClick={() => setAdminTab("mine")}
                className={`rounded-lg px-2 py-1.5 border ${
                  adminTab === "mine"
                    ? "bg-blue-600/20 border-blue-500/40 text-blue-100"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Meus
              </button>
            </div>
          )}

          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="w-full rounded-xl border border-white/10 bg-black/30 pl-9 pr-3 py-2 text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingChats ? (
            <div className="p-8 text-center text-white/55">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : visibleChats.length === 0 ? (
            <div className="p-6 text-sm text-white/50 text-center">Sem chats no escopo atual.</div>
          ) : (
            visibleChats.map((chat) => {
              const isSelected = chat.id === selectedChat?.id;
              return (
                <button
                  key={chat.id}
                  onClick={() => selectChat(chat)}
                  className={`w-full p-3 text-left border-b border-white/5 hover:bg-white/5 transition ${
                    isSelected ? "bg-blue-500/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate">{chat.contactName || "Contato"}</p>
                    <span className="text-[10px] text-white/40">
                      {shortTime(chat.lastMessageTime)}
                    </span>
                  </div>
                  <p className="text-xs text-white/45 truncate">{chat.contactPhone || "--"}</p>
                  <p className="text-xs text-white/60 truncate mt-1">
                    {chat.lastMessage || "Sem mensagens"}
                  </p>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0f0f0f] flex flex-col min-h-0">
        <div className="p-4 border-b border-white/10">
          {selectedChat ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{selectedChat.contactName || "Contato"}</p>
                <p className="text-xs text-white/55">{selectedChat.contactPhone || "--"}</p>
              </div>
              {selectedChat.ownerName ? (
                <span className="text-[11px] px-2 py-1 rounded-lg border border-white/10 bg-white/5 text-white/70">
                  Dono: {selectedChat.ownerName}
                </span>
              ) : (
                <span className="text-[11px] px-2 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-100">
                  Sem dono
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/55">Selecione um chat para abrir.</p>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {!selectedChat ? (
            <div className="h-full grid place-items-center text-white/45 text-sm">
              Nenhuma conversa selecionada.
            </div>
          ) : loadingMessages ? (
            <div className="text-center text-white/55">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-white/45 text-sm">Nenhuma mensagem ainda.</div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.sender === "agent" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    message.sender === "agent"
                      ? "bg-blue-600/20 border border-blue-500/40 text-blue-100"
                      : message.sender === "system"
                        ? "bg-amber-500/10 border border-amber-500/30 text-amber-100"
                        : "bg-white/5 border border-white/10 text-white/85"
                  }`}
                >
                  <p>{message.text || "-"}</p>
                  <p className="text-[10px] text-white/45 mt-1">{shortTime(message.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleSend} className="p-3 border-t border-white/10 flex gap-2">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Digite a mensagem..."
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            disabled={!selectedChat || sending}
          />
          <button
            type="submit"
            disabled={!selectedChat || sending || !text.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 space-y-4 min-h-0 overflow-y-auto">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-white/50">Contexto</p>
          <h2 className="font-semibold">Lead vinculado</h2>
        </div>

        {loadingLead ? (
          <div className="text-white/55 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : leadContext ? (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm space-y-2">
            <p className="font-medium">{leadContext.nome || "Lead"}</p>
            <p className="text-white/60">Status: {leadContext.status || "-"}</p>
            <p className="text-white/60">Estagio: {leadContext.pipelineStage || "-"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/55">
            Este chat ainda nao esta vinculado a um lead.
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/60 space-y-2">
          <p className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            Isolamento ativo por ownerId
          </p>
          <p className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-blue-300" />
            Envio somente via API oficial
          </p>
          <p className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-emerald-300" />
            Escopo: {isAdmin ? "global admin" : "carteira pessoal"}
          </p>
        </div>

        {isAdmin && selectedChat && (
          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
            <h3 className="text-xs uppercase tracking-wide text-white/55 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Transferir atendimento
            </h3>
            <select
              value={transferToUid}
              onChange={(event) => setTransferToUid(event.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm outline-none"
            >
              <option value="">Selecionar vendedor</option>
              {teamUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>

            <textarea
              value={transferReason}
              onChange={(event) => setTransferReason(event.target.value)}
              rows={3}
              placeholder="Motivo da transferencia"
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm outline-none resize-none"
            />

            <button
              onClick={transferChat}
              disabled={transferring}
              className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {transferring ? "Transferindo..." : "Transferir"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
