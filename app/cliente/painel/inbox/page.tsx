"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  Flag,
  FolderKanban,
  Loader2,
  MessageSquareText,
  NotebookPen,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Receipt,
  Search,
  Send,
  Sparkles,
  UserRound,
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
import {
  DEFAULT_PIPELINE_STAGES,
  getPipelineStageLabel,
  normalizePipelineStageId,
} from "@/lib/pipeline";

type ChatAiState = {
  aiEnabled?: boolean;
  pausedUntil?: unknown;
  humanOwnerUserId?: string | null;
} | null;

type ChatItem = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
  channel?: string;
  status?: string;
  priority?: string;
  queueStatus?: string;
  ownerId?: string;
  ownerName?: string;
  assignedTo?: string | null;
  assignedUserName?: string | null;
  tags?: string[];
  leadId?: string;
  aiState?: ChatAiState;
};

type MessageItem = {
  id: string;
  text?: string;
  sender?: "agent" | "client" | "system";
  createdAt?: unknown;
  type?: string;
};

type TimelineEvent = {
  id: string;
  title?: string;
  detail?: string;
  type?: string;
  createdAt?: unknown;
};

type ChatNote = {
  id: string;
  text?: string;
  authorName?: string;
  createdAt?: unknown;
};

type LeadNote = {
  id: string;
  text?: string;
  authorName?: string;
  createdAt?: unknown;
};

type LeadTask = {
  id: string;
  title?: string;
  type?: string;
  priority?: string;
  status?: string;
  dueAt?: unknown;
  createdAt?: unknown;
};

type BudgetItem = {
  id: string;
  titulo?: string;
  status?: string;
  valorTotal?: number;
  validade?: string;
  resumo?: string;
  updatedAt?: unknown;
};

type FinanceItem = {
  id: string;
  descricao?: string;
  tipo?: string;
  categoria?: string;
  status?: string;
  valor?: number;
  vencimento?: string;
  meioPagamento?: string;
  updatedAt?: unknown;
};

type TeamMember = {
  userId: string;
  name: string;
  email?: string;
  role?: string;
  isDefault?: boolean;
};

type LeadSummary = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  stage?: string;
  pipelineStage?: string;
  owner?: string;
  ownerId?: string;
  score?: number | null;
  priority?: string;
  heat?: string;
  potentialValue?: number | null;
  tags?: string[];
  timeline?: TimelineEvent[];
};

type ChatDetailPayload = {
  chat: ChatItem;
  lead?: LeadSummary | null;
  leadTasks?: LeadTask[];
  leadNotes?: LeadNote[];
  leadBudgets?: BudgetItem[];
  leadFinance?: FinanceItem[];
  commercialSummary?: {
    budgets?: number;
    approvedBudgets?: number;
    approvedValue?: number;
    financeItems?: number;
    paidRevenue?: number;
    pendingRevenue?: number;
  };
  notes?: ChatNote[];
  teamMembers?: TeamMember[];
  company?: {
    name?: string;
    niche?: string;
  };
  error?: string;
};

type ChatListPayload = {
  items?: ChatItem[];
  error?: string;
};

type MessageListPayload = {
  items?: MessageItem[];
  error?: string;
};

const STATUS_FILTERS = ["all", "open", "pending", "resolved", "archived"] as const;
const STATUS_OPTIONS = ["open", "pending", "resolved", "archived"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;
const PRIORITY_FILTERS = ["all", ...PRIORITY_OPTIONS] as const;
const QUEUE_FILTERS = ["all", "sla_breached", "unassigned", "assigned_waiting", "assigned", "triage"] as const;
const AI_FILTERS = ["all", "ai_active", "ai_paused", "human_owned"] as const;
const TASK_TYPES = ["follow_up", "ligacao", "reuniao", "proposta", "pendencia"] as const;
const TASK_PRIORITIES = ["low", "medium", "high"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type PriorityFilter = (typeof PRIORITY_FILTERS)[number];
type QueueFilter = (typeof QUEUE_FILTERS)[number];
type AiFilter = (typeof AI_FILTERS)[number];

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

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

function formatRelative(value: unknown) {
  const date = toDate(value);
  if (!date) return "sem interacao";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffMinutes < 24 * 60) return `${Math.round(diffMinutes / 60)}h`;
  return `${Math.round(diffMinutes / (60 * 24))}d`;
}

function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number") return "--";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value?: string) {
  if (!value) return "--";
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, 8);
}

function formatChannelLabel(channel?: string) {
  if (channel === "site_chat") return "Site chat";
  if (channel === "site_form") return "Site form";
  if (channel === "meta_ads") return "Meta Ads";
  if (channel === "google_ads") return "Google Ads";
  if (!channel) return "WhatsApp";
  return channel.replaceAll("_", " ");
}

function formatPriorityLabel(priority?: string) {
  if (priority === "high") return "Alta";
  if (priority === "medium") return "Media";
  return "Baixa";
}

function formatStatusLabel(status?: string) {
  if (status === "resolved") return "Resolvida";
  if (status === "pending") return "Pendente";
  if (status === "archived") return "Arquivada";
  return "Aberta";
}

function formatQueueStatusLabel(queueStatus?: string) {
  const value = String(queueStatus || "").toLowerCase();
  if (value === "sla_breached") return "SLA estourado";
  if (value === "assigned_waiting") return "Aguardando resposta";
  if (value === "assigned") return "Em atendimento";
  if (value === "unassigned") return "Sem responsavel";
  if (value === "triage") return "Triagem";
  if (value === "resolved") return "Resolvida";
  if (value === "archived") return "Arquivada";
  return "Fila aberta";
}

function formatQueueFilterLabel(filter: QueueFilter) {
  if (filter === "sla_breached") return "SLA estourado";
  if (filter === "unassigned") return "Sem responsavel";
  if (filter === "assigned_waiting") return "Aguardando resposta";
  if (filter === "assigned") return "Em atendimento";
  if (filter === "triage") return "Triagem";
  return "Todas as filas";
}

function formatAiFilterLabel(filter: AiFilter) {
  if (filter === "ai_active") return "IA ativa";
  if (filter === "ai_paused") return "IA pausada";
  if (filter === "human_owned") return "Com takeover";
  return "IA + humano";
}

function formatTaskType(type?: string) {
  if (type === "follow_up") return "Follow-up";
  if (type === "ligacao") return "Ligacao";
  if (type === "reuniao") return "Reuniao";
  if (type === "proposta") return "Proposta";
  if (type === "pendencia") return "Pendencia";
  return "Tarefa";
}

function getStatusTone(status?: string) {
  if (status === "resolved") return "success" as const;
  if (status === "pending") return "warning" as const;
  if (status === "archived") return "neutral" as const;
  return "info" as const;
}

function getPriorityTone(priority?: string) {
  if (priority === "high") return "danger" as const;
  if (priority === "medium") return "warning" as const;
  return "neutral" as const;
}

function getHeatTone(heat?: string) {
  if (heat === "quente") return "danger" as const;
  if (heat === "morno") return "warning" as const;
  if (heat === "frio") return "info" as const;
  return "neutral" as const;
}

function getTaskTone(task: LeadTask) {
  if (task.status === "done") return "success" as const;
  if (task.priority === "high") return "danger" as const;
  if (task.priority === "medium") return "warning" as const;
  return "neutral" as const;
}

function isAiPaused(chat: Pick<ChatItem, "aiState"> | null | undefined) {
  if (!chat?.aiState) return false;
  if (chat.aiState.aiEnabled === false) return true;
  const pausedUntil = toDate(chat.aiState.pausedUntil);
  return Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
}

function getSlaState(chat: ChatItem) {
  const status = String(chat.status || "open").toLowerCase();
  if (status === "resolved" || status === "archived") {
    return { breached: false, label: "resolvida" };
  }

  const clientAt = toDate(chat.lastClientMessageAt);
  const agentAt = toDate(chat.lastAgentMessageAt);
  const explicitDueAt = toDate(chat.slaDueAt);
  if (!clientAt) {
    return { breached: false, label: "sem SLA" };
  }
  if (agentAt && agentAt.getTime() >= clientAt.getTime()) {
    return { breached: false, label: "em dia" };
  }

  const dueAt = explicitDueAt || new Date(clientAt.getTime() + 15 * 60 * 1000);
  const remainingMs = dueAt.getTime() - Date.now();
  if (remainingMs <= 0) {
    return { breached: true, label: "SLA estourado" };
  }

  return { breached: false, label: `SLA ${Math.ceil(remainingMs / 60000)}m` };
}
function ConversationListItem({
  chat,
  active,
  onSelect,
}: {
  chat: ChatItem;
  active: boolean;
  onSelect: () => void;
}) {
  const sla = getSlaState(chat);
  const aiPaused = isAiPaused(chat);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-3 text-left transition",
        active
          ? "border-blue-400/35 bg-blue-500/[0.08] shadow-[0_0_0_1px_rgba(59,130,246,0.12)]"
          : "border-white/8 bg-white/[0.02] hover:border-white/14 hover:bg-white/[0.045]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">
              {chat.contactName || chat.contactPhone || "Contato sem nome"}
            </p>
            <StateBadge label={formatPriorityLabel(chat.priority)} tone={getPriorityTone(chat.priority)} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/38">
            <span>{formatChannelLabel(chat.channel)}</span>
            <span>/</span>
            <span>{formatStatusLabel(chat.status)}</span>
          </div>
        </div>

        <div className="text-right text-[11px] text-white/36">
          <p>{formatTime(chat.lastMessageTime)}</p>
          <p className="mt-1">{formatRelative(chat.lastMessageTime)}</p>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm text-white/66">
        {chat.lastMessage || "Sem ultima mensagem registrada."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StateBadge label={formatQueueStatusLabel(chat.queueStatus)} tone={sla.breached ? "danger" : "neutral"} />
        <StateBadge label={sla.label} tone={sla.breached ? "danger" : "info"} />
        <StateBadge label={aiPaused ? "IA pausada" : "IA ativa"} tone={aiPaused ? "warning" : "success"} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/46">
        <span className="truncate">{chat.assignedUserName || chat.ownerName || "Sem responsavel"}</span>
        <span>{chat.tags?.slice(0, 2).join(" / ") || "sem tags"}</span>
      </div>
    </button>
  );
}

function MessageBubble({ message }: { message: MessageItem }) {
  const isAgent = message.sender === "agent";
  const isSystem = message.sender === "system";

  return (
    <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[84%] rounded-2xl border px-4 py-3 text-sm",
          isAgent
            ? "border-blue-300/30 bg-blue-500/12"
            : isSystem
              ? "border-amber-300/24 bg-amber-500/10"
              : "border-white/10 bg-white/[0.04]"
        )}
      >
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/40">
          <span>{isAgent ? "Time" : isSystem ? "Sistema" : "Lead"}</span>
          <span>/</span>
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[14px] leading-6 text-white/92">
          {message.text || "-"}
        </p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/6 py-2.5 last:border-b-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-white/36">{label}</span>
      <span className="max-w-[62%] text-right text-sm text-white/82">{value || "--"}</span>
    </div>
  );
}

function NoteCard({
  title,
  subtitle,
  notes,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  notes: Array<ChatNote | LeadNote>;
  emptyLabel: string;
}) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle title={title} subtitle={subtitle} />
        <StateBadge label={`${notes.length}`} tone="neutral" />
      </div>

      <div className="mt-4 space-y-3">
        {notes.length === 0 ? (
          <p className="text-sm text-white/48">{emptyLabel}</p>
        ) : (
          notes.slice(0, 6).map((note) => (
            <div key={note.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <p className="text-sm leading-6 text-white/86">{note.text || "-"}</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-white/36">
                <span>{note.authorName || "Time ALTUM"}</span>
                <span>{formatDateTime(note.createdAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </PanelCard>
  );
}

function CommercialMetric({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">{label}</p>
          <p className="mt-2 text-base font-semibold text-white">{value}</p>
          <p className="mt-1 text-xs text-white/46">{hint}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-2 text-white/64">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function ClienteInboxPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLeadNote, setSavingLeadNote] = useState(false);
  const [savingLeadTask, setSavingLeadTask] = useState(false);
  const [savingLeadStage, setSavingLeadStage] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [detail, setDetail] = useState<ChatDetailPayload | null>(null);
  const [messageText, setMessageText] = useState("");
  const [internalNoteText, setInternalNoteText] = useState("");
  const [leadNoteText, setLeadNoteText] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [assignedUserFilter, setAssignedUserFilter] = useState("all");
  const [metaForm, setMetaForm] = useState({
    status: "open",
    priority: "medium",
    assignedUserId: "",
    tagsInput: "",
  });
  const [leadStage, setLeadStage] = useState(DEFAULT_PIPELINE_STAGES[0].id);
  const [leadTaskTitle, setLeadTaskTitle] = useState("");
  const [leadTaskDueAt, setLeadTaskDueAt] = useState("");
  const [leadTaskPriority, setLeadTaskPriority] = useState<(typeof TASK_PRIORITIES)[number]>("medium");
  const [leadTaskType, setLeadTaskType] = useState<(typeof TASK_TYPES)[number]>("follow_up");

  const initialChatId = searchParams.get("chatId");
  const leadIdFromQuery = searchParams.get("leadId");
  const statusFromQuery = searchParams.get("status");
  const priorityFromQuery = searchParams.get("priority");
  const queueFromQuery = searchParams.get("queue");
  const aiFromQuery = searchParams.get("ai");
  const channelFromQuery = searchParams.get("channel");
  const assignedUserFromQuery = searchParams.get("assignedUser");
  const canOperate = hasCapability("respond_inbox");
  const canManageQueue = hasCapability("manage_settings") || hasCapability("manage_users");

  const loadChats = useCallback(async () => {
    if (!tenant?.tenantId) return [] as ChatItem[];

    setLoadingChats(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats`);
      const payload = (await res.json()) as ChatListPayload;

      if (!res.ok) {
        setError(payload.error || "Falha ao carregar inbox.");
        setChats([]);
        return [];
      }

      const nextChats = payload.items || [];
      setChats(nextChats);
      setSelectedChatId((current) => {
        if (current && nextChats.some((chat) => chat.id === current)) return current;
        if (initialChatId && nextChats.some((chat) => chat.id === initialChatId)) return initialChatId;
        if (leadIdFromQuery) {
          const leadChat = nextChats.find((chat) => chat.leadId === leadIdFromQuery);
          if (leadChat) return leadChat.id;
        }
        return nextChats[0]?.id || null;
      });
      return nextChats;
    } catch {
      setError("Falha ao carregar conversas.");
      setChats([]);
      return [];
    } finally {
      setLoadingChats(false);
    }
  }, [tenant?.tenantId, initialChatId, leadIdFromQuery]);

  const loadSelectedChat = useCallback(
    async (chatId: string, options?: { withMessages?: boolean }) => {
      if (!tenant?.tenantId) return;
      const withMessages = options?.withMessages ?? true;

      setLoadingDetail(true);
      if (withMessages) setLoadingMessages(true);

      try {
        const requests: Promise<Response>[] = [authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatId}`)];
        if (withMessages) {
          requests.push(authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatId}/messages`));
        }

        const [detailRes, messagesRes] = await Promise.all(requests);
        const detailPayload = (await detailRes.json()) as ChatDetailPayload;

        if (!detailRes.ok) {
          setError(detailPayload.error || "Falha ao carregar detalhe da conversa.");
          setDetail(null);
          if (withMessages) setMessages([]);
          return;
        }

        setDetail(detailPayload);
        setMetaForm({
          status: detailPayload.chat.status || "open",
          priority: detailPayload.chat.priority || "medium",
          assignedUserId: detailPayload.chat.assignedTo || detailPayload.chat.ownerId || "",
          tagsInput: (detailPayload.chat.tags || []).join(", "),
        });
        setLeadStage(
          normalizePipelineStageId(
            detailPayload.lead?.pipelineStage || detailPayload.lead?.stage || DEFAULT_PIPELINE_STAGES[0].id
          )
        );

        if (withMessages && messagesRes) {
          const messagesPayload = (await messagesRes.json()) as MessageListPayload;
          if (!messagesRes.ok) {
            setError(messagesPayload.error || "Falha ao carregar mensagens.");
            setMessages([]);
            return;
          }
          setMessages(messagesPayload.items || []);
        }
      } catch {
        setError("Falha ao carregar detalhe da conversa.");
      } finally {
        setLoadingDetail(false);
        if (withMessages) setLoadingMessages(false);
      }
    },
    [tenant?.tenantId]
  );
  const refreshSelected = useCallback(
    async (withMessages = false) => {
      const nextChats = await loadChats();
      const targetId = selectedChatId || nextChats[0]?.id;
      if (targetId) {
        await loadSelectedChat(targetId, { withMessages });
      }
    },
    [loadChats, loadSelectedChat, selectedChatId]
  );

  useEffect(() => {
    if (statusFromQuery && STATUS_FILTERS.includes(statusFromQuery as StatusFilter)) {
      setStatusFilter(statusFromQuery as StatusFilter);
    }
    if (priorityFromQuery && PRIORITY_FILTERS.includes(priorityFromQuery as PriorityFilter)) {
      setPriorityFilter(priorityFromQuery as PriorityFilter);
    }
    if (queueFromQuery && QUEUE_FILTERS.includes(queueFromQuery as QueueFilter)) {
      setQueueFilter(queueFromQuery as QueueFilter);
    }
    if (aiFromQuery && AI_FILTERS.includes(aiFromQuery as AiFilter)) {
      setAiFilter(aiFromQuery as AiFilter);
    }
    if (channelFromQuery) {
      setChannelFilter(channelFromQuery);
    }
    if (assignedUserFromQuery) {
      setAssignedUserFilter(assignedUserFromQuery);
    }
  }, [aiFromQuery, assignedUserFromQuery, channelFromQuery, priorityFromQuery, queueFromQuery, statusFromQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedChatId) next.set("chatId", selectedChatId);
    if (leadIdFromQuery) next.set("leadId", leadIdFromQuery);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (priorityFilter !== "all") next.set("priority", priorityFilter);
    if (queueFilter !== "all") next.set("queue", queueFilter);
    if (aiFilter !== "all") next.set("ai", aiFilter);
    if (channelFilter !== "all") next.set("channel", channelFilter);
    if (assignedUserFilter !== "all") next.set("assignedUser", assignedUserFilter);
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery === currentQuery) return;
    router.replace(nextQuery ? `/cliente/painel/inbox?${nextQuery}` : "/cliente/painel/inbox");
  }, [
    aiFilter,
    assignedUserFilter,
    channelFilter,
    leadIdFromQuery,
    priorityFilter,
    queueFilter,
    router,
    searchParams,
    selectedChatId,
    statusFilter,
  ]);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useEffect(() => {
    if (!selectedChatId) {
      setDetail(null);
      setMessages([]);
      return;
    }

    void loadSelectedChat(selectedChatId);
  }, [selectedChatId, loadSelectedChat]);

  useEffect(() => {
    if (!tenant?.tenantId) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshSelected(true);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [refreshSelected, tenant?.tenantId]);

  const selectedChat = useMemo(
    () => chats.find((item) => item.id === selectedChatId) || detail?.chat || null,
    [chats, selectedChatId, detail]
  );

  const activeChat = detail?.chat?.id === selectedChat?.id ? (detail?.chat ?? null) : selectedChat;
  const aiPaused = useMemo(() => isAiPaused(activeChat), [activeChat]);

  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (statusFilter !== "all" && (chat.status || "open") !== statusFilter) return false;
      if (priorityFilter !== "all" && (chat.priority || "low") !== priorityFilter) return false;
      if (channelFilter !== "all" && (chat.channel || "whatsapp") !== channelFilter) return false;
      if (queueFilter === "sla_breached" && !getSlaState(chat).breached) return false;
      if (queueFilter !== "all" && queueFilter !== "sla_breached" && (chat.queueStatus || "open") !== queueFilter) return false;
      if (aiFilter === "ai_active" && isAiPaused(chat)) return false;
      if (aiFilter === "ai_paused" && !isAiPaused(chat)) return false;
      if (aiFilter === "human_owned" && !chat.aiState?.humanOwnerUserId) return false;
      if (
        assignedUserFilter !== "all" &&
        String(chat.assignedTo || chat.ownerId || "").trim() !== assignedUserFilter
      ) {
        return false;
      }
      if (leadIdFromQuery && chat.leadId !== leadIdFromQuery) return false;

      if (!search.trim()) return true;
      const haystack = [
        chat.contactName,
        chat.contactPhone,
        chat.channel,
        chat.lastMessage,
        chat.ownerName,
        chat.assignedUserName,
        ...(chat.tags || []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search.trim().toLowerCase());
    });
  }, [aiFilter, assignedUserFilter, channelFilter, chats, leadIdFromQuery, priorityFilter, queueFilter, search, statusFilter]);

  const availableChannels = useMemo(() => {
    return Array.from(new Set(chats.map((chat) => (chat.channel || "whatsapp").trim()).filter(Boolean)));
  }, [chats]);

  const availableAssignees = useMemo(() => {
    return Array.from(
      chats.reduce((acc, chat) => {
        const userId = String(chat.assignedTo || chat.ownerId || "").trim();
        const userName = String(chat.assignedUserName || chat.ownerName || "").trim();
        if (!userId) return acc;
        acc.set(userId, userName || "Responsavel");
        return acc;
      }, new Map<string, string>())
    ).map(([userId, name]) => ({ userId, name }));
  }, [chats]);

  const inboxStats = useMemo(() => {
    const open = chats.filter((chat) => (chat.status || "open") === "open").length;
    const pending = chats.filter((chat) => chat.status === "pending").length;
    const resolved = chats.filter((chat) => chat.status === "resolved").length;
    const unassigned = chats.filter((chat) => !(chat.assignedTo || chat.ownerId)).length;
    const slaBreached = chats.filter((chat) => getSlaState(chat).breached).length;
    const highPriority = chats.filter((chat) => chat.priority === "high").length;

    return {
      total: chats.length,
      open,
      pending,
      resolved,
      unassigned,
      slaBreached,
      highPriority,
    };
  }, [chats]);

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedChatId || !messageText.trim() || !canOperate) return;

    setSending(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messageText.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar mensagem.");
        return;
      }

      setMessageText("");
      await refreshSelected(true);
    } catch {
      setError("Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function handleToggleAi() {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    setUpdatingAi(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/ai-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: aiPaused ? "resume" : "pause",
          pausedMinutes: 240,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar estado da IA.");
        return;
      }

      await refreshSelected(true);
    } catch {
      setError("Falha ao atualizar estado da IA.");
    } finally {
      setUpdatingAi(false);
    }
  }

  async function handleTakeover() {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    setUpdatingAi(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/ai-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "takeover",
          pausedMinutes: 240,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao assumir handoff.");
        return;
      }

      await refreshSelected(true);
    } catch {
      setError("Falha ao assumir handoff.");
    } finally {
      setUpdatingAi(false);
    }
  }

  async function handleSaveMeta() {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    setSavingMeta(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: metaForm.status,
          priority: metaForm.priority,
          assignedUserId: metaForm.assignedUserId || null,
          tags: normalizeTags(metaForm.tagsInput),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar operacao da conversa.");
        return;
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar operacao da conversa.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleQuickStatus(nextStatus: string) {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    setSavingMeta(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus,
          priority: metaForm.priority,
          assignedUserId: metaForm.assignedUserId || null,
          tags: normalizeTags(metaForm.tagsInput),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar status da conversa.");
        return;
      }

      setMetaForm((current) => ({ ...current, status: nextStatus }));
      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar status da conversa.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleCreateInternalNote(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedChatId || !internalNoteText.trim() || !canOperate) return;

    setSavingNote(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: internalNoteText.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao registrar nota interna.");
        return;
      }

      setInternalNoteText("");
      await refreshSelected(false);
    } catch {
      setError("Falha ao registrar nota interna.");
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDistributeQueue() {
    if (!tenant?.tenantId || !canManageQueue) return;

    setDistributing(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/distribute`, {
        method: "POST",
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao distribuir fila.");
        return;
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao distribuir fila.");
    } finally {
      setDistributing(false);
    }
  }
  async function handleMoveLeadStage() {
    if (!tenant?.tenantId || !detail?.lead?.id || !canOperate) return;

    setSavingLeadStage(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${detail.lead.id}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: leadStage }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar stage do lead.");
        return;
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar stage do lead.");
    } finally {
      setSavingLeadStage(false);
    }
  }

  async function handleCreateLeadTask(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !detail?.lead?.id || !leadTaskTitle.trim() || !canOperate) return;

    setSavingLeadTask(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${detail.lead.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: leadTaskTitle.trim(),
          dueAt: leadTaskDueAt ? new Date(leadTaskDueAt).toISOString() : undefined,
          priority: leadTaskPriority,
          type: leadTaskType,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao criar tarefa.");
        return;
      }

      setLeadTaskTitle("");
      setLeadTaskDueAt("");
      setLeadTaskPriority("medium");
      setLeadTaskType("follow_up");
      await refreshSelected(false);
    } catch {
      setError("Falha ao criar tarefa.");
    } finally {
      setSavingLeadTask(false);
    }
  }

  async function handleToggleLeadTask(task: LeadTask) {
    if (!tenant?.tenantId || !detail?.lead?.id || !canOperate) return;

    setUpdatingTaskId(task.id);
    setError(null);
    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/leads/${detail.lead.id}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: task.status === "done" ? "pending" : "done" }),
        }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar tarefa.");
        return;
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar tarefa.");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleCreateLeadNote(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !detail?.lead?.id || !leadNoteText.trim() || !canOperate) return;

    setSavingLeadNote(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/${detail.lead.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: leadNoteText.trim() }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao registrar nota comercial.");
        return;
      }

      setLeadNoteText("");
      await refreshSelected(false);
    } catch {
      setError("Falha ao registrar nota comercial.");
    } finally {
      setSavingLeadNote(false);
    }
  }

  const activeLead = detail?.lead || null;
  const leadTasks = detail?.leadTasks || [];
  const leadNotes = detail?.leadNotes || [];
  const leadBudgets = detail?.leadBudgets || [];
  const leadFinance = detail?.leadFinance || [];
  const commercialSummary = detail?.commercialSummary || {};
  const chatNotes = detail?.notes || [];
  const teamMembers = detail?.teamMembers || [];
  const timeline = activeLead?.timeline || [];
  const activeSla = activeChat ? getSlaState(activeChat) : { breached: false, label: "sem SLA" };

  const focusSignals = useMemo(() => {
    const items: Array<{
      id: string;
      href: string;
      title: string;
      detail: string;
      badge: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
    }> = [];

    if (inboxStats.slaBreached > 0) {
      items.push({
        id: "sla",
        href: "/cliente/painel/inbox?queue=sla_breached",
        title: "SLA estourado",
        detail: `${inboxStats.slaBreached} conversa(s) precisam de resposta imediata.`,
        badge: "urgente",
        tone: "danger",
      });
    }

    if (inboxStats.unassigned > 0) {
      items.push({
        id: "unassigned",
        href: "/cliente/painel/inbox?queue=unassigned",
        title: "Fila sem responsavel",
        detail: `${inboxStats.unassigned} conversa(s) ainda nao foram atribuidas.`,
        badge: "fila",
        tone: "warning",
      });
    }

    if (inboxStats.pending > 0) {
      items.push({
        id: "pending",
        href: "/cliente/painel/inbox?status=pending",
        title: "Conversas pendentes",
        detail: `${inboxStats.pending} conversa(s) aguardam a proxima acao do time.`,
        badge: "pendente",
        tone: "info",
      });
    }

    if (inboxStats.highPriority > 0) {
      items.push({
        id: "priority",
        href: "/cliente/painel/inbox?priority=high",
        title: "Alta prioridade",
        detail: `${inboxStats.highPriority} conversa(s) marcadas como prioridade alta.`,
        badge: "prioridade",
        tone: "warning",
      });
    }

    if (activeLead?.id) {
      items.push({
        id: "lead_context",
        href: `/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`,
        title: "Lead atual com contexto comercial",
        detail: "Abrir proposta, financeiro e negociacao sem perder o fio da conversa.",
        badge: "lead",
        tone: "success",
      });
    }

    return items.slice(0, 5);
  }, [activeLead?.id, inboxStats.highPriority, inboxStats.pending, inboxStats.slaBreached, inboxStats.unassigned]);

  if (!selectedChat && !loadingChats && chats.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Inbox"
          subtitle="Operacao omnichannel, takeover humano e contexto comercial no mesmo workspace."
        />
        <EmptyState
          title="Nenhuma conversa encontrada"
          description="Quando novas mensagens chegarem no WhatsApp ou nos canais conectados deste tenant, elas aparecerao aqui com contexto, SLA e controle operacional."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Inbox"
        subtitle="Workspace operacional para atendimento, CRM e takeover com contexto completo do lead."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <StateBadge
              label={aiPaused ? "IA pausada nesta conversa" : "IA ativa nesta conversa"}
              tone={aiPaused ? "warning" : "success"}
            />
            {canManageQueue ? (
              <button
                type="button"
                onClick={handleDistributeQueue}
                disabled={distributing}
                className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-60"
              >
                {distributing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                Distribuir fila
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void refreshSelected(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Conversas"
          value={inboxStats.total.toLocaleString("pt-BR")}
          icon={MessageSquareText}
          trend="volume total do tenant"
        />
        <MetricCard
          label="Abertas"
          value={inboxStats.open.toLocaleString("pt-BR")}
          icon={Sparkles}
          trend="em operacao agora"
        />
        <MetricCard
          label="Pendentes"
          value={inboxStats.pending.toLocaleString("pt-BR")}
          icon={Clock3}
          trend="aguardando proxima acao"
        />
        <MetricCard
          label="Sem dono"
          value={inboxStats.unassigned.toLocaleString("pt-BR")}
          icon={UserRound}
          trend="fila para distribuir"
        />
        <MetricCard
          label="SLA"
          value={inboxStats.slaBreached.toLocaleString("pt-BR")}
          icon={Flag}
          trend="conversas estouradas"
        />
      </section>

      <section className="grid gap-3 xl:grid-cols-5">
        {focusSignals.length === 0 ? (
          <PanelCard className="p-4 xl:col-span-5">
            <p className="text-sm font-semibold text-white">Inbox sem gargalos relevantes no momento</p>
            <p className="mt-2 text-sm text-white/58">
              O atendimento atual nao mostra fila critica, SLA estourado ou operacao sem ownership.
            </p>
          </PanelCard>
        ) : (
          focusSignals.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-2xl border border-white/10 bg-[#0E0E0E] p-4 transition hover:border-blue-300/25 hover:bg-blue-400/[0.06]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-2 text-sm text-white/58">{item.detail}</p>
                </div>
                <StateBadge label={item.badge} tone={item.tone} />
              </div>
            </Link>
          ))
        )}
      </section>

      {error ? (
        <PanelCard className="border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </PanelCard>
      ) : null}

      <section className="grid min-h-[80vh] grid-cols-1 gap-4 2xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <PanelCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Fila de conversas" subtitle={`${filteredChats.length} visiveis agora`} />
              <StateBadge label={`${inboxStats.highPriority} prioritarias`} tone="danger" />
            </div>

            <div className="mt-4 space-y-3">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/72">
                <Search className="h-4 w-4 text-white/40" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone, tag..."
                  className="w-full bg-transparent outline-none placeholder:text-white/32"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                {STATUS_FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition",
                      statusFilter === filter
                        ? "border-blue-400/40 bg-blue-500/14 text-blue-100"
                        : "border-white/10 bg-white/[0.03] text-white/52 hover:bg-white/[0.08]"
                    )}
                  >
                    {filter === "all" ? "todas" : filter}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                  className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {PRIORITY_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {option === "all" ? "Todas prioridades" : formatPriorityLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={queueFilter}
                  onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
                  className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {QUEUE_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {formatQueueFilterLabel(option)}
                    </option>
                  ))}
                </select>

                <select
                  value={aiFilter}
                  onChange={(event) => setAiFilter(event.target.value as AiFilter)}
                  className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {AI_FILTERS.map((option) => (
                    <option key={option} value={option}>
                      {formatAiFilterLabel(option)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <select
                  value={channelFilter}
                  onChange={(event) => setChannelFilter(event.target.value)}
                  className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="all">Todos os canais</option>
                  {availableChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {formatChannelLabel(channel)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <select
                  value={assignedUserFilter}
                  onChange={(event) => setAssignedUserFilter(event.target.value)}
                  className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="all">Todos os responsaveis</option>
                  {availableAssignees.map((assignee) => (
                    <option key={assignee.userId} value={assignee.userId}>
                      {assignee.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {loadingChats ? (
              <div className="py-10 text-center text-white/56">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="p-2">
                <EmptyState
                  title="Nenhuma conversa encontrada"
                  description="Ajuste os filtros ou aguarde novas entradas nos canais conectados."
                />
              </div>
            ) : (
              filteredChats.map((chat) => (
                <ConversationListItem
                  key={chat.id}
                  chat={chat}
                  active={chat.id === selectedChatId}
                  onSelect={() => setSelectedChatId(chat.id)}
                />
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className="flex min-h-0 flex-col overflow-hidden">
          <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.18),_transparent_34%)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-semibold tracking-tight text-white">
                    {activeChat?.contactName || activeChat?.contactPhone || "Contato sem nome"}
                  </h3>
                  <StateBadge label={formatChannelLabel(activeChat?.channel)} tone="neutral" />
                  <StateBadge label={formatStatusLabel(activeChat?.status)} tone={getStatusTone(activeChat?.status)} />
                  <StateBadge label={activeSla.label} tone={activeSla.breached ? "danger" : "info"} />
                </div>
                <p className="mt-2 text-sm text-white/58">
                  {detail?.company?.name || tenant?.tenantName || "Cliente"}
                  {detail?.company?.niche ? ` / ${detail.company.niche}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/46">
                  <span>
                    Responsavel: {activeChat?.assignedUserName || activeChat?.ownerName || "Sem atribuicao"}
                  </span>
                  <span>/</span>
                  <span>{formatQueueStatusLabel(activeChat?.queueStatus)}</span>
                  <span>/</span>
                  <span>Ultima atividade {formatRelative(activeChat?.lastMessageTime)}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleToggleAi()}
                  disabled={!selectedChat || updatingAi || !canOperate}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
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
                <button
                  type="button"
                  onClick={() => void handleTakeover()}
                  disabled={!selectedChat || updatingAi || !canOperate}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/16 disabled:opacity-50"
                >
                  {updatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRound className="h-3.5 w-3.5" />}
                  Assumir handoff
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickStatus("pending")}
                  disabled={!selectedChat || savingMeta || !canOperate}
                  className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  Marcar pendente
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickStatus("resolved")}
                  disabled={!selectedChat || savingMeta || !canOperate}
                  className="rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/16 disabled:opacity-50"
                >
                  Resolver
                </button>
              </div>
            </div>

            {activeLead ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">Lead</p>
                  <p className="mt-2 text-base font-semibold text-white">{activeLead.nome || "Lead"}</p>
                  <p className="mt-1 text-sm text-white/52">
                    {activeLead.empresa || activeLead.origem || "Sem empresa"}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">Pipeline</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {getPipelineStageLabel(
                      normalizePipelineStageId(activeLead.pipelineStage || activeLead.stage || "captado")
                    )}
                  </p>
                  <p className="mt-1 text-sm text-white/52">{activeLead.owner || "Sem dono comercial"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">Valor potencial</p>
                  <p className="mt-2 text-base font-semibold text-white">
                    {formatMoney(activeLead.potentialValue)}
                  </p>
                  <p className="mt-1 text-sm text-white/52">Score {activeLead.score ?? "--"}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-[46vh] flex-1 space-y-4 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_28%)] p-4">
            {loadingMessages ? (
              <div className="py-10 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Sem mensagens"
                description="Esta conversa ainda nao tem historico visivel no inbox."
              />
            ) : (
              messages.map((message) => <MessageBubble key={message.id} message={message} />)
            )}
          </div>

          <form onSubmit={handleSend} className="border-t border-white/10 p-3">
            <div className="flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
              <input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={canOperate ? "Digite a mensagem manual do time" : "Perfil sem permissao para responder"}
                className="flex-1 bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-white/30"
                disabled={!selectedChatId || sending || !canOperate}
              />
              <button
                type="submit"
                disabled={!selectedChatId || sending || !messageText.trim() || !canOperate}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-55"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar
              </button>
            </div>
          </form>
        </PanelCard>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Cockpit do lead"
                subtitle="Dados comerciais, pipeline e contexto de conta"
              />
              {activeLead ? (
                <StateBadge label="conectado ao CRM" tone="success" />
              ) : (
                <StateBadge label="sem lead vinculado" tone="warning" />
              )}
            </div>

            {loadingDetail ? (
              <div className="py-8 text-center text-white/60">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : activeLead ? (
              <>
                <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                  <InfoRow label="Nome" value={activeLead.nome || "Lead"} />
                  <InfoRow label="Telefone" value={activeLead.telefone || activeChat?.contactPhone || "--"} />
                  <InfoRow label="Email" value={activeLead.email || "--"} />
                  <InfoRow label="Empresa" value={activeLead.empresa || "--"} />
                  <InfoRow label="Origem" value={activeLead.origem || formatChannelLabel(activeLead.channel)} />
                  <InfoRow label="Responsavel" value={activeLead.owner || activeChat?.assignedUserName || "Sem dono"} />
                </div>

                <div className="mt-4 grid gap-3">
                  <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-white/50">
                    <span>Stage do pipeline</span>
                    <select
                      value={leadStage}
                      onChange={(event) => setLeadStage(event.target.value)}
                      disabled={!canOperate}
                      className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                    >
                      {DEFAULT_PIPELINE_STAGES.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => void handleMoveLeadStage()}
                    disabled={!canOperate || savingLeadStage}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
                  >
                    {savingLeadStage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderKanban className="h-4 w-4" />
                    )}
                    Atualizar stage
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StateBadge label={getPipelineStageLabel(leadStage)} tone="info" />
                  <StateBadge label={`Score ${activeLead.score ?? "--"}`} tone="neutral" />
                  <StateBadge label={activeLead.heat || "sem heat"} tone={getHeatTone(activeLead.heat)} />
                  <StateBadge
                    label={formatPriorityLabel(activeLead.priority)}
                    tone={getPriorityTone(activeLead.priority)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(activeLead.tags || []).length > 0 ? (
                    activeLead.tags?.map((tag) => <StateBadge key={tag} label={tag} tone="neutral" />)
                  ) : (
                    <p className="text-sm text-white/46">Sem tags comerciais no lead.</p>
                  )}
                </div>

                <div className="mt-4 grid gap-2">
                  <Link
                    href={`/cliente/painel/crm?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
                  >
                    <span>Abrir CRM</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/cliente/painel/pipeline?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
                  >
                    <span>Ver no pipeline</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
                  >
                    <span>Abrir comercial</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {activeLead.telefone || activeChat?.contactPhone ? (
                    <a
                      href={`https://wa.me/${encodeURIComponent(String(activeLead.telefone || activeChat?.contactPhone || "").replace(/\D/g, ""))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
                    >
                      <span>Abrir no WhatsApp</span>
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : null}
                  <Link
                    href={`/cliente/painel/metricas`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08]"
                  >
                    <span>Ver metricas da operacao</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/52">
                Esta conversa ainda nao esta associada a um lead com perfil comercial completo.
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Operacao da conversa"
                subtitle="Responsavel, status, prioridade e tags do atendimento"
              />
              <StateBadge
                label={canOperate ? "editavel" : "somente leitura"}
                tone={canOperate ? "info" : "neutral"}
              />
            </div>

            <div className="mt-4 grid gap-3">
              <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <span>Status</span>
                <select
                  value={metaForm.status}
                  onChange={(event) => setMetaForm((current) => ({ ...current, status: event.target.value }))}
                  disabled={!canOperate}
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {formatStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <span>Prioridade</span>
                <select
                  value={metaForm.priority}
                  onChange={(event) => setMetaForm((current) => ({ ...current, priority: event.target.value }))}
                  disabled={!canOperate}
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority} value={priority}>
                      {formatPriorityLabel(priority)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <span>Responsavel</span>
                <select
                  value={metaForm.assignedUserId}
                  onChange={(event) =>
                    setMetaForm((current) => ({ ...current, assignedUserId: event.target.value }))
                  }
                  disabled={!canOperate}
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="">Sem atribuicao</option>
                  {teamMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <span>Tags</span>
                <input
                  value={metaForm.tagsInput}
                  onChange={(event) => setMetaForm((current) => ({ ...current, tagsInput: event.target.value }))}
                  disabled={!canOperate}
                  placeholder="vip, proposta, urgente"
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/28"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleSaveMeta()}
              disabled={savingMeta || !canOperate}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {savingMeta ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Salvar operacao
            </button>
          </PanelCard>

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Comercial conectado"
                subtitle="Propostas, receita e pendencias do lead dentro da conversa"
              />
              <StateBadge
                label={activeLead ? "sincronizado" : "aguardando lead"}
                tone={activeLead ? "success" : "warning"}
              />
            </div>

            {activeLead ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <CommercialMetric
                    label="Propostas"
                    value={String(commercialSummary.budgets ?? 0)}
                    icon={FileText}
                    hint={`${commercialSummary.approvedBudgets ?? 0} aprovadas`}
                  />
                  <CommercialMetric
                    label="Valor aprovado"
                    value={formatMoney(commercialSummary.approvedValue ?? 0)}
                    icon={BadgeDollarSign}
                    hint="volume comercial ganho"
                  />
                  <CommercialMetric
                    label="Receita paga"
                    value={formatMoney(commercialSummary.paidRevenue ?? 0)}
                    icon={Receipt}
                    hint="valor recebido"
                  />
                  <CommercialMetric
                    label="Receita pendente"
                    value={formatMoney(commercialSummary.pendingRevenue ?? 0)}
                    icon={Clock3}
                    hint={`${commercialSummary.financeItems ?? 0} lancamentos`}
                  />
                </div>

                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">Propostas recentes</p>
                    <Link
                      href={`/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`}
                      className="text-xs font-semibold text-blue-200 transition hover:text-white"
                    >
                      Abrir comercial
                    </Link>
                  </div>
                  {leadBudgets.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-sm text-white/48">
                      Nenhuma proposta vinculada a este lead ainda.
                    </p>
                  ) : (
                    leadBudgets.map((budget) => (
                      <div key={budget.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white/88">{budget.titulo || "Proposta"}</p>
                            <p className="mt-1 text-xs text-white/46">
                              validade {formatDate(budget.validade)} / atualizada {formatDateTime(budget.updatedAt)}
                            </p>
                          </div>
                          <StateBadge
                            label={budget.status || "Rascunho"}
                            tone={
                              budget.status === "Aprovado"
                                ? "success"
                                : budget.status === "Perdido"
                                  ? "danger"
                                  : "neutral"
                            }
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{formatMoney(Number(budget.valorTotal || 0))}</p>
                          {budget.resumo ? (
                            <p className="line-clamp-1 max-w-[62%] text-right text-xs text-white/46">{budget.resumo}</p>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 space-y-3 border-t border-white/8 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/38">Financeiro recente</p>
                    <StateBadge label={`${leadFinance.length}`} tone="neutral" />
                  </div>
                  {leadFinance.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-sm text-white/48">
                      Nenhum lancamento comercial associado a este lead.
                    </p>
                  ) : (
                    leadFinance.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-white/88">{item.descricao || "Lancamento"}</p>
                            <p className="mt-1 text-xs text-white/46">
                              {item.categoria || item.tipo || "Comercial"} / vencimento {formatDate(item.vencimento)}
                            </p>
                          </div>
                          <StateBadge
                            label={item.status || "pendente"}
                            tone={String(item.status || "").toLowerCase() === "pago" ? "success" : "warning"}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                          <p className="font-semibold text-white">{formatMoney(Number(item.valor || 0))}</p>
                          <p className="text-xs text-white/46">{item.meioPagamento || "Sem meio de pagamento"}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-sm text-white/52">
                Vincule um lead a conversa para enxergar propostas, receita e pendencias financeiras aqui.
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Tarefas do lead"
                subtitle="Follow-up, proposta e pendencias sem sair do inbox"
              />
              <StateBadge label={`${leadTasks.length}`} tone="neutral" />
            </div>

            <div className="mt-4 space-y-3">
              {leadTasks.length === 0 ? (
                <p className="text-sm text-white/48">Nenhuma tarefa criada para este lead ainda.</p>
              ) : (
                leadTasks.map((task) => (
                  <div key={task.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white/88">{task.title || "Tarefa"}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <StateBadge label={formatTaskType(task.type)} tone="neutral" />
                          <StateBadge label={formatPriorityLabel(task.priority)} tone={getTaskTone(task)} />
                          <StateBadge
                            label={task.status === "done" ? "Concluida" : "Pendente"}
                            tone={getTaskTone(task)}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleToggleLeadTask(task)}
                        disabled={!canOperate || updatingTaskId === task.id}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
                      >
                        {updatingTaskId === task.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : task.status === "done" ? (
                          <CircleDashed className="h-3.5 w-3.5" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {task.status === "done" ? "Reabrir" : "Concluir"}
                      </button>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.14em] text-white/38">
                      prazo {formatDateTime(task.dueAt || task.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
            {activeLead ? (
              <form onSubmit={handleCreateLeadTask} className="mt-4 space-y-3 border-t border-white/8 pt-4">
                <input
                  value={leadTaskTitle}
                  onChange={(event) => setLeadTaskTitle(event.target.value)}
                  placeholder="Ex: Retornar proposta ainda hoje"
                  disabled={!canOperate}
                  className="w-full rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/28"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="datetime-local"
                    value={leadTaskDueAt}
                    onChange={(event) => setLeadTaskDueAt(event.target.value)}
                    disabled={!canOperate}
                    className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  />
                  <select
                    value={leadTaskType}
                    onChange={(event) => setLeadTaskType(event.target.value as (typeof TASK_TYPES)[number])}
                    disabled={!canOperate}
                    className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  >
                    {TASK_TYPES.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {formatTaskType(taskType)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={leadTaskPriority}
                    onChange={(event) =>
                      setLeadTaskPriority(event.target.value as (typeof TASK_PRIORITIES)[number])
                    }
                    disabled={!canOperate}
                    className="rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                  >
                    {TASK_PRIORITIES.map((taskPriority) => (
                      <option key={taskPriority} value={taskPriority}>
                        {formatPriorityLabel(taskPriority)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={!canOperate || savingLeadTask || !leadTaskTitle.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {savingLeadTask ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <NotebookPen className="h-4 w-4" />
                  )}
                  Criar tarefa
                </button>
              </form>
            ) : null}
          </PanelCard>

          <PanelCard className="p-4">
            <CardTitle
              title="Notas e inteligencia operacional"
              subtitle="Notas internas da conversa e observacoes do lead"
            />

            <form onSubmit={handleCreateInternalNote} className="mt-4 space-y-3">
              <textarea
                value={internalNoteText}
                onChange={(event) => setInternalNoteText(event.target.value)}
                placeholder="Registrar contexto interno desta conversa"
                disabled={!canOperate}
                rows={3}
                className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/28"
              />
              <button
                type="submit"
                disabled={!canOperate || savingNote || !internalNoteText.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
              >
                {savingNote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <NotebookPen className="h-4 w-4" />
                )}
                Salvar nota interna
              </button>
            </form>

            {activeLead ? (
              <form onSubmit={handleCreateLeadNote} className="mt-4 space-y-3 border-t border-white/8 pt-4">
                <textarea
                  value={leadNoteText}
                  onChange={(event) => setLeadNoteText(event.target.value)}
                  placeholder="Registrar nota comercial no perfil do lead"
                  disabled={!canOperate}
                  rows={3}
                  className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-3 text-sm text-white outline-none placeholder:text-white/28"
                />
                <button
                  type="submit"
                  disabled={!canOperate || savingLeadNote || !leadNoteText.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/82 transition hover:bg-white/[0.08] disabled:opacity-50"
                >
                  {savingLeadNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <NotebookPen className="h-4 w-4" />
                  )}
                  Salvar nota do lead
                </button>
              </form>
            ) : null}
          </PanelCard>

          <NoteCard
            title="Notas internas"
            subtitle="Contexto operacional desta conversa"
            notes={chatNotes}
            emptyLabel="Nenhuma nota interna registrada para este chat."
          />

          <NoteCard
            title="Notas comerciais"
            subtitle="Anotacoes persistidas no CRM do lead"
            notes={leadNotes}
            emptyLabel="Nenhuma nota comercial registrada para o lead."
          />

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Timeline recente" subtitle="Eventos do lead conectados a esta conversa" />
              <StateBadge label={`${timeline.length}`} tone="neutral" />
            </div>

            <div className="mt-4 space-y-3">
              {timeline.length === 0 ? (
                <p className="text-sm text-white/48">Nenhum evento recente no lead.</p>
              ) : (
                timeline.slice(0, 8).map((event) => (
                  <div key={event.id} className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white/86">{event.title || "Evento"}</p>
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/36">
                        {formatDateTime(event.createdAt)}
                      </p>
                    </div>
                    {event.detail ? <p className="mt-2 text-sm leading-6 text-white/62">{event.detail}</p> : null}
                  </div>
                ))
              )}
            </div>
          </PanelCard>
        </div>
      </section>
    </div>
  );
}
