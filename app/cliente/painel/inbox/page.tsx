"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Download,
  ExternalLink,
  CheckCircle2,
  CircleDashed,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  Mic,
  NotebookPen,
  PanelRightOpen,
  PauseCircle,
  PhoneCall,
  PlayCircle,
  RefreshCw,
  Receipt,
  Search,
  Send,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import {
  CardTitle,
  EmptyState,
  PanelCard,
  SectionHeader,
  StateBadge,
  ClientTabs,
} from "@/app/cliente/painel/components/ui";
import { CustomerProfileDrawer } from "@/app/cliente/painel/components/customer-profile-drawer";
import {
  DEFAULT_PIPELINE_STAGES,
  getPipelineStageLabel,
  normalizePipelineStageId,
} from "@/lib/pipeline";

type ChatAiState = {
  aiEnabled?: boolean;
  pausedUntil?: unknown;
  humanOwnerUserId?: string | null;
  updatedByName?: string | null;
  updatedAt?: unknown;
  pauseReason?: string | null;
  lastJobStatus?: string | null;
  lastJobError?: string | null;
  lastJobErrorCode?: string | null;
  lastDecision?: string | null;
  lastDecisionReason?: string | null;
  lastDecisionReasonCode?: string | null;
  lastProcessedAt?: unknown;
  lastJobId?: string | null;
  lastMessageId?: string | null;
  lastHandoffNotifyAt?: unknown;
  lastHandoffNotifyMessageId?: string | null;
  lastHandoffNotifyStatus?: string | null;
  lastHandoffNotifyRecipients?: number | null;
  lastHandoffNotifySuccessCount?: number | null;
  lastHandoffNotifyFailureCount?: number | null;
} | null;

type ChatItem = {
  id: string;
  contactName?: string;
  contactPhone?: string;
  contactCompany?: string;
  contactPhotoUrl?: string;
  lastMessage?: string;
  lastMessageTime?: unknown;
  lastClientMessageAt?: unknown;
  lastAgentMessageAt?: unknown;
  slaDueAt?: unknown;
  channel?: string;
  channelId?: string;
  channelPhoneNumberId?: string;
  status?: string;
  priority?: string;
  queueStatus?: string;
  ownerId?: string;
  ownerName?: string;
  assignedTo?: string | null;
  assignedUserName?: string | null;
  tags?: string[];
  leadId?: string;
  unreadCount?: number;
  aiState?: ChatAiState;
};

type MessageItem = {
  id: string;
  text?: string;
  sender?: "agent" | "client" | "system" | "bot";
  status?: string | null;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
  deliveryAt?: unknown;
  deliveryUpdatedAt?: unknown;
  createdAt?: unknown;
  type?: string;
  mediaUrl?: string | null;
  mediaDownloadUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaId?: string | null;
  mediaDuration?: number | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaSize?: number | null;
  mediaStatus?: "ready" | "missing" | "not_applicable";
  mediaUnavailableReason?: string | null;
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
  aiFieldEvidence?: Record<
    string,
    {
      value?: string;
      source?: "agent_extracted" | "conversation_context" | "derived" | string;
      confidence?: number;
      intent?: string | null;
      stateAfter?: string | null;
      nextAction?: string | null;
      capturedAt?: unknown;
    }
  >;
  aiCaptureChecklist?: {
    nome?: boolean;
    tipoEmpresa?: boolean;
    objetivo?: boolean;
    orcamento?: boolean;
    urgencia?: boolean;
    decisor?: boolean;
    canaisAtuais?: boolean;
    cidade?: boolean;
    tamanhoTime?: boolean;
    servicoInteresse?: boolean;
    updatedAt?: unknown;
  };
  timeline?: TimelineEvent[];
};

type ChatDetailPayload = {
  chat: ChatItem;
  aiState?: ChatAiState;
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
    photoUrl?: string | null;
  };
  error?: string;
};

type ChatListPayload = {
  items?: ChatItem[];
  error?: string;
};

type TenantChannelItem = {
  id: string;
  type?: string;
  status?: string;
  connectionStatus?: string;
  displayName?: string;
};

type TenantChannelsPayload = {
  items?: TenantChannelItem[];
  error?: string;
};

type MessageListPayload = {
  items?: MessageItem[];
  error?: string;
};

const INBOX_CHANNEL_ORDER = ["whatsapp", "instagram", "messenger", "site_chat", "site_form"] as const;
const INBOX_CHANNEL_SET = new Set<string>(INBOX_CHANNEL_ORDER);
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

function ContactAvatar({
  name,
  phone,
  photoUrl,
  size = "md",
}: {
  name?: string;
  phone?: string;
  photoUrl?: string | null;
  size?: "sm" | "md";
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = size === "sm" ? "h-10 w-10 text-xs" : "h-11 w-11 text-xs";
  const src = String(photoUrl || "").trim();
  const canRenderImage = src && !imageFailed;
  const displayName = String(name || "").trim();
  const fallbackInitials = isPhoneLike(displayName || phone) ? "" : getInitials(displayName || phone);

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (canRenderImage) {
    return (
      <div className={cn("shrink-0 overflow-hidden rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]", dimension)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name || phone || "Contato"}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-[linear-gradient(135deg,rgba(37,211,102,0.14),rgba(134,150,160,0.1))] font-semibold text-[var(--cliente-card-text)]",
        dimension
      )}
    >
      {fallbackInitials || <UserRound className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />}
    </div>
  );
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

function formatDuration(seconds?: number | null) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "--:--";
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatFileSize(bytes?: number | null) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMimeType(mimeType?: string | null) {
  const value = String(mimeType || "").trim().toLowerCase();
  if (!value) return "arquivo seguro";
  if (value === "application/pdf") return "PDF";
  if (value.startsWith("image/")) return value.replace("image/", "").toUpperCase();
  if (value.startsWith("audio/")) return value.replace("audio/", "").toUpperCase();
  if (value.startsWith("video/")) return value.replace("video/", "").toUpperCase();
  if (value.includes("/")) return value.split("/")[1]?.toUpperCase() || value.toUpperCase();
  return value.toUpperCase();
}

function normalizePlainText(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isGeneratedMediaPlaceholder(type: string, text?: string | null) {
  const normalized = normalizePlainText(text);
  if (!normalized) return true;
  if (type === "image") return normalized === "imagem recebida";
  if (type === "audio") return normalized === "audio recebido";
  if (type === "document") return normalized === "arquivo recebido";
  if (type === "video") return normalized === "video recebido";
  return false;
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
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "instagram") return "Instagram";
  if (channel === "messenger") return "Messenger";
  if (channel === "site_chat") return "Chat do site";
  if (channel === "site_form") return "Formulario do site";
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

function formatStatusFilterLabel(filter: StatusFilter) {
  if (filter === "all") return "Todas";
  return formatStatusLabel(filter);
}

function formatQueueStatusLabel(queueStatus?: string) {
  const value = String(queueStatus || "").toLowerCase();
  if (value === "sla_breached") return "Prazo vencido";
  if (value === "assigned_waiting") return "Aguardando resposta";
  if (value === "assigned") return "Em atendimento";
  if (value === "unassigned") return "Sem responsavel";
  if (value === "triage") return "Triagem";
  if (value === "resolved") return "Resolvida";
  if (value === "archived") return "Arquivada";
  return "Fila aberta";
}

function formatQueueFilterLabel(filter: QueueFilter) {
  if (filter === "sla_breached") return "Prazo vencido";
  if (filter === "unassigned") return "Sem responsavel";
  if (filter === "assigned_waiting") return "Aguardando resposta";
  if (filter === "assigned") return "Em atendimento";
  if (filter === "triage") return "Triagem";
  return "Todas as filas";
}

function formatAiFilterLabel(filter: AiFilter) {
  if (filter === "ai_active") return "IA ativa";
  if (filter === "ai_paused") return "IA pausada";
  if (filter === "human_owned") return "Com atendimento humano";
  return "IA + humano";
}

function formatTaskType(type?: string) {
  if (type === "follow_up") return "Retorno";
  if (type === "ligacao") return "Ligacao";
  if (type === "reuniao") return "Reuniao";
  if (type === "proposta") return "Proposta";
  if (type === "pendencia") return "Pendencia";
  return "Tarefa";
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

function getInitials(value?: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "LD";
}

function isPhoneLike(value?: string) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return normalized.replace(/\D/g, "").length >= 8 && !/[a-zA-ZÀ-ÿ]/.test(normalized);
}

function buildTelUrl(phone?: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `tel:+${digits}` : "";
}

function isWhatsAppServiceWindowClosed(chat?: ChatItem | null) {
  if (!chat) return false;
  const channel = String(chat.channel || "whatsapp").toLowerCase();
  if (channel !== "whatsapp") return false;
  const lastClientMessageAt = toDate(chat.lastClientMessageAt);
  if (!lastClientMessageAt) return false;
  return Date.now() - lastClientMessageAt.getTime() > 23.5 * 60 * 60 * 1000;
}

function humanizeDeliveryError(value?: string | null) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/re-engagement/i.test(text)) {
    return "Janela de 24h encerrada. O WhatsApp bloqueou texto livre; use um template aprovado ou aguarde o contato responder.";
  }
  return text;
}

function parseTemplateParams(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function getMessagePreview(message: MessageItem | ChatItem) {
  const type = String(("type" in message ? message.type : undefined) || "text").toLowerCase();
  const text = String(("text" in message ? message.text : undefined) || ("lastMessage" in message ? message.lastMessage : undefined) || "").trim();

  if (type === "audio") return text || "Audio recebido";
  if (type === "image") return text || "Imagem recebida";
  if (type === "document") return text || "Arquivo recebido";
  if (type === "system") return text || "Atualizacao do sistema";
  return text || "Sem mensagem registrada.";
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

function compactAiError(value: string, max = 180) {
  return value.replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").trim().slice(0, max);
}

function aiErrorStatusMessage(code: string, mode: "retrying" | "dead_letter") {
  const retrying = mode === "retrying";
  if (code === "quota_exceeded") {
    return retrying
      ? "A IA atingiu o limite de uso atual. Revise o plano ou reduza o consumo no Assistente Altum."
      : "A IA pausou por limite de uso. Revise o plano e clique em Reprocessar ultima mensagem.";
  }
  if (code === "auth_invalid") {
    return retrying
      ? "A IA precisa de ajuste de acesso no servico conectado. Revise o canal ou chame o suporte."
      : "A IA pausou por ajuste pendente no servico conectado. Atualize o acesso e reprocese.";
  }
  if (code === "rate_limited") {
    return retrying
      ? "A IA esta aguardando uma nova janela de uso do servico."
      : "A IA excedeu o limite momentaneo do servico e precisa de nova tentativa.";
  }
  if (code === "timeout") {
    return retrying
      ? "A IA demorou para responder e esta tentando novamente."
      : "A IA demorou varias vezes para responder. Tente reprocessar agora.";
  }
  if (code === "provider_unavailable") {
    return retrying
      ? "O servico de IA esta instavel no momento; nova tentativa em andamento."
      : "O servico de IA ficou instavel por tempo prolongado. Reprocessamento manual recomendado.";
  }
  if (code === "network_error") {
    return retrying
      ? "Instabilidade de rede; nova tentativa em andamento."
      : "Falha de rede persistente. Reprocessamento manual recomendado.";
  }
  if (code === "payload_invalid") {
    return retrying
      ? "Mensagem com payload invalido; a IA esta tentando normalizar e reenviar."
      : "Falha por payload invalido. Revise a mensagem e tente reprocessar.";
  }

  return retrying
    ? "IA tentando novamente apos uma falha recente."
    : "Ultima tentativa da IA falhou e precisa de revisao.";
}

function normalizeHandoffNotifyStatus(status: unknown) {
  return String(status || "").trim().toLowerCase();
}

function getHandoffNotifyStatusHint(status: unknown) {
  const normalized = normalizeHandoffNotifyStatus(status);
  if (!normalized) return "";
  if (normalized === "skipped_no_channel") {
    return "A transferencia foi gerada, mas nao havia canal WhatsApp ativo para alertar o humano.";
  }
  if (normalized === "skipped_no_recipients") {
    return "A transferencia foi gerada, mas nao havia telefone de responsavel configurado para receber alerta.";
  }
  if (normalized === "skipped_disabled") {
    return "A transferencia foi gerada, mas a notificacao de transferencia esta desativada nas configuracoes da IA.";
  }
  if (normalized === "partial_failure") {
    return "Parte dos alertas de transferencia falhou. Revise os telefones dos responsaveis.";
  }
  if (normalized === "failed") {
    return "Os alertas de transferencia falharam. Revise canal e telefones dos responsaveis.";
  }
  return "";
}

function getAiStateDescription(chat: Pick<ChatItem, "aiState"> | null | undefined) {
  if (!chat?.aiState) return "IA pronta para respostas automaticas nesta conversa.";
  const updatedByName = String(chat.aiState.updatedByName || "").trim();
  const pausedUntil = toDate(chat.aiState.pausedUntil);
  const isStillPaused = Boolean(pausedUntil && pausedUntil.getTime() > Date.now());
  const lastJobStatus = String(chat.aiState.lastJobStatus || "").trim().toLowerCase();
  const lastJobError = String(chat.aiState.lastJobError || "").trim();
  const lastJobErrorCode = String(chat.aiState.lastJobErrorCode || "").trim().toLowerCase();
  const lastDecisionReason = String(chat.aiState.lastDecisionReason || "").trim().toLowerCase();
  const lastDecisionReasonCode = String(chat.aiState.lastDecisionReasonCode || "").trim().toLowerCase();

  if (chat.aiState.humanOwnerUserId && isStillPaused) {
    const suffix = pausedUntil ? ` ate ${formatDateTime(pausedUntil)}` : "";
    return `Atendimento humano ativo${updatedByName ? ` por ${updatedByName}` : ""}${suffix}.`;
  }

  if (chat.aiState.aiEnabled === false || isStillPaused) {
    const suffix = pausedUntil ? ` ate ${formatDateTime(pausedUntil)}` : "";
    return `IA pausada${updatedByName ? ` por ${updatedByName}` : ""}${suffix}.`;
  }

  if (lastJobStatus === "pending" || lastJobStatus === "processing") {
    return "IA reprocessando a ultima mensagem desta conversa.";
  }

  if (lastJobStatus === "retrying") {
    const base = aiErrorStatusMessage(lastJobErrorCode, "retrying");
    const detail =
      (!lastJobErrorCode || lastJobErrorCode === "unknown_error") && lastJobError
        ? ` Detalhe: ${compactAiError(lastJobError)}.`
        : "";
    return `${base}${detail}`;
  }

  if (lastJobStatus === "dead_letter") {
    const base = aiErrorStatusMessage(lastJobErrorCode, "dead_letter");
    const detail =
      (!lastJobErrorCode || lastJobErrorCode === "unknown_error") && lastJobError
        ? ` Detalhe: ${compactAiError(lastJobError)}.`
        : "";
    return `${base}${detail}`;
  }

  if (
    lastJobStatus === "done" &&
    (lastDecisionReason.includes("provider_fallback_contingency") ||
      lastDecisionReasonCode.includes("provider_fallback_contingency"))
  ) {
    return "IA operando em contingencia por falha temporaria do provider. A conversa segue ativa.";
  }

  if (
    lastJobStatus === "done" &&
    (lastDecisionReason.includes("usage_cap_contingency") ||
      lastDecisionReasonCode.includes("usage_cap_contingency"))
  ) {
    return "IA operando em contingencia por limite mensal (uso/custo). Atualize o budget para voltar ao modo completo.";
  }

  const handoffNotifyStatus = normalizeHandoffNotifyStatus(chat.aiState.lastHandoffNotifyStatus);
  if (handoffNotifyStatus === "skipped_no_channel") {
    return "IA ativa, mas a ultima transferencia nao conseguiu notificar humano por falta de canal WhatsApp ativo.";
  }
  if (handoffNotifyStatus === "skipped_no_recipients") {
    return "IA ativa, mas a ultima transferencia nao conseguiu notificar humano por falta de telefone de responsavel.";
  }
  if (handoffNotifyStatus === "skipped_disabled") {
    return "IA ativa, mas a notificacao de transferencia esta desativada nas configuracoes.";
  }
  if (handoffNotifyStatus === "partial_failure" || handoffNotifyStatus === "failed") {
    return "IA ativa, mas o ultimo alerta de transferencia teve falha de entrega para parte do time.";
  }

  return "IA pronta para respostas automaticas nesta conversa.";
}

function shouldOfferAiRetry(chat: Pick<ChatItem, "aiState"> | null | undefined) {
  const lastJobStatus = String(chat?.aiState?.lastJobStatus || "").trim().toLowerCase();
  const lastDecision = String(chat?.aiState?.lastDecision || "").trim().toLowerCase();
  return lastJobStatus === "retrying" || lastJobStatus === "dead_letter" || lastDecision === "skip";
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
    return { breached: false, label: "sem prazo" };
  }
  if (agentAt && agentAt.getTime() >= clientAt.getTime()) {
    return { breached: false, label: "em dia" };
  }

  const dueAt = explicitDueAt || new Date(clientAt.getTime() + 15 * 60 * 1000);
  const remainingMs = dueAt.getTime() - Date.now();
  if (remainingMs <= 0) {
    return { breached: true, label: "prazo vencido" };
  }

  return { breached: false, label: `${Math.ceil(remainingMs / 60000)}m para responder` };
}

function getConversationResponseState(chat: ChatItem) {
  const clientAt = toDate(chat.lastClientMessageAt);
  const agentAt = toDate(chat.lastAgentMessageAt);

  if (clientAt && (!agentAt || clientAt.getTime() > agentAt.getTime())) {
    return { label: "Precisa de resposta", tone: "success" as const };
  }
  if (agentAt && (!clientAt || agentAt.getTime() >= clientAt.getTime())) {
    return { label: "Aguardando cliente", tone: "neutral" as const };
  }
  return { label: "Nova conversa", tone: "info" as const };
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
  const responseState = getConversationResponseState(chat);
  const unreadCount =
    typeof chat.unreadCount === "number" && chat.unreadCount > 0
      ? chat.unreadCount
      : responseState.label === "Precisa de resposta"
        ? 1
        : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "inbox-conversation-card inbox-whatsapp-row w-full min-w-0 border px-3.5 py-3.5 text-left transition",
        active
          ? "inbox-whatsapp-row-active"
          : ""
      )}
    >
      <div className="flex items-start gap-3">
        <ContactAvatar
          name={chat.contactName}
          phone={chat.contactPhone}
          photoUrl={chat.contactPhotoUrl}
          size="sm"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">
                  {chat.contactName || chat.contactPhone || "Contato sem nome"}
                </p>
                {chat.priority === "high" ? (
                  <span className="h-2 w-2 rounded-full bg-[var(--cliente-accent)]" />
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--cliente-card-text-soft)]">
                <span>{chat.assignedUserName || chat.ownerName || "Sem responsavel"}</span>
                {chat.contactCompany ? (
                  <>
                    <span>|</span>
                    <span className="truncate">{chat.contactCompany}</span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="text-right text-[11px] text-[var(--cliente-card-text-soft)]">
              <p>{formatTime(chat.lastMessageTime)}</p>
              <div className="mt-1 flex items-center justify-end gap-2">
                {unreadCount > 0 ? (
                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-[var(--cliente-success)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
                <span>{formatRelative(chat.lastMessageTime)}</span>
              </div>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--cliente-card-text-muted)]">
            {getMessagePreview(chat)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StateBadge label={responseState.label} tone={responseState.tone} />
            {sla.breached ? <StateBadge label={sla.label} tone="danger" /> : null}
            {aiPaused ? <StateBadge label="IA pausada" tone="warning" /> : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--cliente-card-text-soft)]">
            <span>{formatChannelLabel(chat.channel)}</span>
            <span className="truncate text-right">{chat.tags?.slice(0, 1).join(" / ") || formatStatusLabel(chat.status)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function buildMessageMediaUrl(message: MessageItem) {
  return String(message.mediaUrl || "").trim();
}

function buildMessageDownloadUrl(message: MessageItem) {
  return String(message.mediaDownloadUrl || message.mediaUrl || "").trim();
}

function getMessageMediaUnavailableReason(message: MessageItem) {
  const explicitReason = String(message.mediaUnavailableReason || "").trim();
  if (explicitReason) return explicitReason;

  const type = String(message.type || "text").toLowerCase();
  if (!buildMessageMediaUrl(message)) {
    if (type === "image") return "Imagem protegida indisponivel no momento.";
    if (type === "audio") return "Audio protegido indisponivel no momento.";
    if (type === "document") return "Documento protegido indisponivel no momento.";
    if (type === "video") return "Video protegido indisponivel no momento.";
  }

  return "Midia indisponivel com seguranca para esta mensagem.";
}

function MessageMediaFallback({
  type,
  reason,
}: {
  type: string;
  reason: string;
}) {
  const label =
    type === "image"
      ? "Imagem indisponivel"
      : type === "audio"
        ? "Audio indisponivel"
        : type === "document"
          ? "Documento indisponivel"
          : "Midia indisponivel";

  return (
    <div className="mt-3 rounded-[22px] border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 text-[var(--cliente-card-text-soft)]">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-warning)_14%,transparent)] p-2 text-[var(--cliente-warning)]">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{label}</p>
          <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-soft)]">{reason}</p>
        </div>
      </div>
    </div>
  );
}

function ImageAttachment({ message }: { message: MessageItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const mediaUrl = buildMessageMediaUrl(message);
  const unavailableReason = getMessageMediaUnavailableReason(message);

  useEffect(() => {
    setImageFailed(false);
  }, [mediaUrl]);

  if (!mediaUrl || message.mediaStatus === "missing" || imageFailed) {
    return (
      <MessageMediaFallback
        type="image"
        reason={imageFailed ? "Nao foi possivel carregar a imagem protegida." : unavailableReason}
      />
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mediaUrl}
        alt={message.mediaName || "Imagem recebida"}
        className="max-h-[360px] w-full object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
      />
      {message.mediaWidth && message.mediaHeight ? (
        <div className="border-t border-[var(--cliente-border)] px-3 py-2 text-[11px] text-[var(--cliente-card-text-soft)]">
          {message.mediaWidth} x {message.mediaHeight} px
        </div>
      ) : null}
    </div>
  );
}

function AudioAttachment({ message }: { message: MessageItem }) {
  const [duration, setDuration] = useState<number | null>(message.mediaDuration ?? null);
  const [audioFailed, setAudioFailed] = useState(false);
  const mediaUrl = buildMessageMediaUrl(message);
  const unavailableReason = getMessageMediaUnavailableReason(message);

  useEffect(() => {
    setDuration(message.mediaDuration ?? null);
    setAudioFailed(false);
  }, [message.id, message.mediaDuration, mediaUrl]);

  if (!mediaUrl || message.mediaStatus === "missing" || audioFailed) {
    return (
      <MessageMediaFallback
        type="audio"
        reason={audioFailed ? "Nao foi possivel carregar o audio protegido." : unavailableReason}
      />
    );
  }

  return (
    <div className="mt-3 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs text-[var(--cliente-card-text-soft)]">
        <span className="inline-flex items-center gap-2">
          <Mic className="h-4 w-4" />
          {message.mediaName || "Audio protegido"}
        </span>
        <span>{formatDuration(duration)}</span>
      </div>
      <audio
        controls
        preload="metadata"
        className="w-full"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration) && nextDuration > 0) {
            setDuration(Math.round(nextDuration));
          }
        }}
        onError={() => setAudioFailed(true)}
      >
        <source src={mediaUrl} type={message.mediaMimeType || "audio/mpeg"} />
      </audio>
    </div>
  );
}

function DocumentAttachment({ message }: { message: MessageItem }) {
  const mediaUrl = buildMessageMediaUrl(message);
  const downloadUrl = buildMessageDownloadUrl(message);

  if (!mediaUrl || message.mediaStatus === "missing") {
    return <MessageMediaFallback type="document" reason={getMessageMediaUnavailableReason(message)} />;
  }

  const metaLine = [formatMimeType(message.mediaMimeType), formatFileSize(message.mediaSize)].filter(Boolean).join(" / ");

  return (
    <div className="mt-3 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-primary)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-primary)_14%,transparent)] p-2 text-[var(--cliente-primary)]">
          <FileText className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">
            {message.mediaName || "Documento protegido"}
          </p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{metaLine || "Arquivo seguro para abertura"}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={mediaUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
        >
          <ExternalLink className="h-4 w-4" />
          Abrir com seguranca
        </a>
        <a
          href={downloadUrl}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text)] transition hover:bg-[var(--cliente-surface-muted)]"
          download
        >
          <Download className="h-4 w-4" />
          Baixar
        </a>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: MessageItem;
}) {
  const isAgent = message.sender === "agent";
  const isSystem = message.sender === "system";
  const type = String(message.type || "text").toLowerCase();
  const outboundStatus = String(message.deliveryStatus || message.status || "").toLowerCase();
  const outboundStatusLabel =
    !isAgent
      ? ""
      : outboundStatus === "read"
        ? "Lida"
        : outboundStatus === "delivered"
          ? "Entregue"
          : outboundStatus === "sent"
            ? "Enviada"
            : outboundStatus === "failed"
              ? "Falhou"
              : "";
  const preview = getMessagePreview(message);
  const shouldRenderText = !["image", "audio", "document", "video"].includes(type) || !isGeneratedMediaPlaceholder(type, preview);

  const mediaLabel =
    type === "audio"
      ? "Audio"
      : type === "image"
        ? "Imagem"
        : type === "document"
          ? "Documento"
          : type === "template"
            ? "Template"
            : null;
  const MediaIcon =
    type === "audio"
      ? Mic
      : type === "image"
        ? ImageIcon
        : type === "document"
          ? FileText
          : type === "template"
            ? Receipt
            : null;

  return (
    <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] min-w-0 border px-3.5 py-3 text-sm shadow-[0_8px_20px_rgba(17,27,33,0.12)] sm:max-w-[84%] xl:max-w-[74%] 2xl:max-w-[70%]",
          isAgent
            ? "inbox-message-out rounded-[28px] rounded-br-[10px]"
            : isSystem
              ? "inbox-message-system mx-auto rounded-[22px] text-center"
              : "inbox-message-in rounded-[28px] rounded-bl-[10px]"
        )}
      >
        <div className="flex items-center gap-2 text-[11px] text-current opacity-60">
          <span className="font-semibold uppercase tracking-[0.14em]">
            {isAgent ? "Time" : isSystem ? "Sistema" : "Contato"}
          </span>
          {outboundStatusLabel ? (
            <span className="rounded-full border border-current/15 bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
              {outboundStatusLabel}
            </span>
          ) : null}
          {mediaLabel && MediaIcon ? (
            <>
              <span>|</span>
              <span className="inline-flex items-center gap-1">
                <MediaIcon className="h-3.5 w-3.5" />
                {mediaLabel}
              </span>
            </>
          ) : null}
        </div>
        {type === "image" ? <ImageAttachment message={message} /> : null}
        {type === "audio" ? <AudioAttachment message={message} /> : null}
        {type === "document" ? <DocumentAttachment message={message} /> : null}
        {shouldRenderText ? (
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-current">
            {preview}
          </p>
        ) : null}
        {isAgent && outboundStatus === "failed" && message.deliveryError ? (
          <p className="mt-2 text-xs text-[var(--cliente-danger)]">Falha de entrega: {humanizeDeliveryError(message.deliveryError)}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-current opacity-55">
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
      </div>
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
          <p className="text-sm text-[var(--cliente-card-text-soft)]">{emptyLabel}</p>
        ) : (
          notes.slice(0, 6).map((note) => (
            <div key={note.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
              <p className="text-sm leading-6 text-[var(--cliente-card-text)]">{note.text || "-"}</p>
              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
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
    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-2 text-base font-semibold text-[var(--cliente-card-text)]">{value}</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{hint}</p>
        </div>
        <div className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-2 text-[var(--cliente-card-text-muted)]">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

export default function ClienteInboxPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const { experienceMode, setExperienceMode } = useClienteShell();
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [retryingAi, setRetryingAi] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLeadNote, setSavingLeadNote] = useState(false);
  const [savingLeadTask, setSavingLeadTask] = useState(false);
  const [savingLeadStage, setSavingLeadStage] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [tenantChannels, setTenantChannels] = useState<TenantChannelItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [detail, setDetail] = useState<ChatDetailPayload | null>(null);
  const [messageText, setMessageText] = useState("");
  const [templateName, setTemplateName] = useState("follow_up_geral");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [templateParamsText, setTemplateParamsText] = useState("");
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
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);

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
  const allowAdvanced = experienceMode === "completo";
  const showContextPanel = Boolean(selectedChatId);
  const showDesktopContextPanel = Boolean(selectedChatId);

  useEffect(() => {
    if (!allowAdvanced) {
      setShowAdvancedFilters(false);
    }
  }, [allowAdvanced]);

  useEffect(() => {
    if (!selectedChatId) {
      setShowDetailsDrawer(false);
    }
  }, [selectedChatId]);

  const loadChats = useCallback(async (options?: { silent?: boolean }) => {
    if (!tenant?.tenantId) return [] as ChatItem[];
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoadingChats(true);
      setError(null);
    }
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
        return null;
      });
      return nextChats;
    } catch {
      if (!silent) {
        setError("Falha ao carregar conversas.");
        setChats([]);
      }
      return [];
    } finally {
      if (!silent) setLoadingChats(false);
    }
  }, [tenant?.tenantId, initialChatId, leadIdFromQuery]);

  const loadTenantChannels = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/channels`);
      const payload = (await res.json()) as TenantChannelsPayload;
      if (!res.ok) return;
      setTenantChannels(payload.items || []);
    } catch {
      setTenantChannels([]);
    }
  }, [tenant?.tenantId]);

  const loadSelectedChat = useCallback(
    async (chatId: string, options?: { withMessages?: boolean; silent?: boolean }) => {
      if (!tenant?.tenantId) return;
      const withMessages = options?.withMessages ?? true;
      const silent = options?.silent ?? false;

      if (!silent) {
        setLoadingDetail(true);
        if (withMessages) setLoadingMessages(true);
      }

      try {
        const requests: Promise<Response>[] = [authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatId}`)];
        if (withMessages) {
          requests.push(authedFetch(`/api/tenant/${tenant.tenantId}/chats/${chatId}/messages`));
        }

        const [detailRes, messagesRes] = await Promise.all(requests);
        const detailPayload = (await detailRes.json()) as ChatDetailPayload;

        if (!detailRes.ok) {
          if (!silent) {
            setError(detailPayload.error || "Falha ao carregar detalhe da conversa.");
            setDetail(null);
            if (withMessages) setMessages([]);
          }
          return;
        }

        setDetail({
          ...detailPayload,
          chat: {
            ...detailPayload.chat,
            aiState: detailPayload.aiState ?? detailPayload.chat.aiState ?? null,
          },
        });
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
            if (!silent) {
              setError(messagesPayload.error || "Falha ao carregar mensagens.");
              setMessages([]);
            }
            return;
          }
          setMessages(messagesPayload.items || []);
        }
      } catch {
        if (!silent) setError("Falha ao carregar detalhe da conversa.");
      } finally {
        if (!silent) {
          setLoadingDetail(false);
          if (withMessages) setLoadingMessages(false);
        }
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
    void loadTenantChannels();
  }, [loadChats, loadTenantChannels]);

  useEffect(() => {
    if (!selectedChatId) {
      setDetail(null);
      setMessages([]);
      return;
    }

    setDetail(null);
    setMessages([]);
    void loadSelectedChat(selectedChatId);
  }, [selectedChatId, loadSelectedChat]);

  useAdaptivePolling({
    enabled: Boolean(tenant?.tenantId && selectedChatId),
    onTick: () => {
      if (!selectedChatId) return;
      return loadSelectedChat(selectedChatId, { withMessages: true, silent: true });
    },
    fastIntervalMs: 5000,
    slowIntervalMs: 30000,
    runOnMount: false,
    source: "inbox-chat",
  });

  const scrollMessagesToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
        return;
      }
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
    });
  }, []);

  useEffect(() => {
    if (!selectedChatId || loadingMessages) return;
    scrollMessagesToBottom("auto");
  }, [loadingMessages, messages.length, scrollMessagesToBottom, selectedChatId]);

  useAdaptivePolling({
    enabled: Boolean(tenant?.tenantId),
    onTick: async () => {
      await loadChats({ silent: true });
    },
    fastIntervalMs: 15000,
    slowIntervalMs: 90000,
    runOnMount: false,
    source: "inbox-list",
  });

  const selectedChat = useMemo(
    () => chats.find((item) => item.id === selectedChatId) || detail?.chat || null,
    [chats, selectedChatId, detail]
  );

  const activeChat = detail?.chat?.id === selectedChat?.id ? (detail?.chat ?? null) : selectedChat;
  const aiPaused = useMemo(() => isAiPaused(activeChat), [activeChat]);
  const aiStateDescription = useMemo(() => getAiStateDescription(activeChat), [activeChat]);
  const aiRetryAvailable = useMemo(() => shouldOfferAiRetry(activeChat), [activeChat]);
  const whatsappWindowClosed = useMemo(() => isWhatsAppServiceWindowClosed(activeChat), [activeChat]);
  const handoffNotifyHint = useMemo(
    () => getHandoffNotifyStatusHint(activeChat?.aiState?.lastHandoffNotifyStatus),
    [activeChat?.aiState?.lastHandoffNotifyStatus]
  );

  const filteredChats = useMemo(() => {
    return chats.filter((chat) => {
      if (statusFilter !== "all" && (chat.status || "open") !== statusFilter) return false;
      if (priorityFilter !== "all" && (chat.priority || "low") !== priorityFilter) return false;
      if (channelFilter !== "all" && (chat.channel || "whatsapp").toLowerCase() !== channelFilter.toLowerCase()) return false;
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
    const configuredChannels = tenantChannels
      .filter((channel) => {
        const type = String(channel.type || "").trim().toLowerCase();
        if (!INBOX_CHANNEL_SET.has(type)) return false;
        const status = String(channel.status || "").toLowerCase();
        const connectionStatus = String(channel.connectionStatus || "").toLowerCase();
        return status === "active" || ["connected", "ready", "webhook_pending"].includes(connectionStatus);
      })
      .map((channel) => String(channel.type || "").trim().toLowerCase());
    const chatChannels = chats.map((chat) => (chat.channel || "whatsapp").trim().toLowerCase()).filter(Boolean);
    return Array.from(new Set([...INBOX_CHANNEL_ORDER, ...configuredChannels, ...chatChannels])).sort((a, b) => {
      const aIndex = INBOX_CHANNEL_ORDER.indexOf(a as (typeof INBOX_CHANNEL_ORDER)[number]);
      const bIndex = INBOX_CHANNEL_ORDER.indexOf(b as (typeof INBOX_CHANNEL_ORDER)[number]);
      if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      return a.localeCompare(b, "pt-BR");
    });
  }, [chats, tenantChannels]);

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

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedChatId || !messageText.trim() || !canOperate) return;
    if (whatsappWindowClosed) {
      setError("A janela de 24h do WhatsApp encerrou. Use o envio de follow-up aprovado logo abaixo.");
      return;
    }

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
      scrollMessagesToBottom("smooth");
    } catch {
      setError("Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendTemplate(event: FormEvent) {
    event.preventDefault();
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    const normalizedTemplateName = templateName.trim();
    if (!normalizedTemplateName) {
      setError("Informe o nome exato de um template aprovado na Meta.");
      return;
    }

    setSendingTemplate(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/send-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateName: normalizedTemplateName,
          languageCode: templateLanguage.trim() || "pt_BR",
          bodyParams: parseTemplateParams(templateParamsText),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar template. Confira se ele esta aprovado na Meta e se o idioma/variaveis batem.");
        return;
      }

      setTemplateParamsText("");
      await refreshSelected(true);
      scrollMessagesToBottom("smooth");
    } catch {
      setError("Falha ao enviar template. Confira o canal WhatsApp e tente novamente.");
    } finally {
      setSendingTemplate(false);
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
        setError(payload.error || "Falha ao assumir transferencia.");
        return;
      }

      await refreshSelected(true);
    } catch {
      setError("Falha ao assumir transferencia.");
    } finally {
      setUpdatingAi(false);
    }
  }

  async function handleRetryAi() {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;

    setRetryingAi(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/ai-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "retry",
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao reprocessar a ultima mensagem.");
        return;
      }

      await refreshSelected(true);
    } catch {
      setError("Falha ao reprocessar a ultima mensagem.");
    } finally {
      setRetryingAi(false);
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
        setError(payload.error || "Falha ao atualizar etapa do contato.");
        return;
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar etapa do contato.");
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

  async function handleCreateCallTask() {
    if (!tenant?.tenantId || !canOperate) return;

    setSavingLeadTask(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/calls/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: selectedChatId,
          leadId: detail?.lead?.id,
          phone: detail?.lead?.telefone || activeChat?.contactPhone,
          channelId: activeChat?.channelId,
          title: "Ligar para o cliente",
        }),
      });
      const payload = (await res.json()) as { error?: string; callUrl?: string; telUrl?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao iniciar ligacao.");
        return;
      }

      const url = payload.callUrl || payload.telUrl;
      if (url && typeof window !== "undefined") {
        window.open(url, "_self");
      }
      await refreshSelected(false);
    } catch {
      setError("Falha ao iniciar ligacao.");
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
  const activeResponseState = activeChat ? getConversationResponseState(activeChat) : { label: "Nova conversa", tone: "info" as const };
  const activeCallHref = buildTelUrl(activeLead?.telefone || activeChat?.contactPhone);

  const contextPanelContent = (
    <div className="space-y-4">
      <PanelCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <CardTitle
            title="Cliente e oportunidade"
            subtitle="Dados principais, contexto comercial e proximas acoes desta conversa"
          />
          <StateBadge
            label={activeLead ? "cliente vinculado" : "sem lead vinculado"}
            tone={activeLead ? "success" : "warning"}
          />
        </div>

        {loadingDetail ? (
          <div className="py-8 text-center text-[var(--cliente-card-text-soft)]">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : activeLead ? (
          <>
            <div className="mt-4 rounded-[24px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <div className="flex items-start gap-3">
                <ContactAvatar
                  name={activeLead.nome || activeChat?.contactName}
                  phone={activeLead.telefone || activeChat?.contactPhone}
                  photoUrl={activeChat?.contactPhotoUrl}
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-[var(--cliente-card-text)]">
                    {activeLead.nome || activeChat?.contactName || "Contato"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                    {activeLead.empresa || activeLead.origem || "Sem empresa informada"}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateBadge label={formatChannelLabel(activeLead.channel || activeChat?.channel)} tone="neutral" />
                    <StateBadge
                      label={getPipelineStageLabel(
                        normalizePipelineStageId(activeLead.pipelineStage || activeLead.stage || "captado")
                      )}
                      tone="info"
                    />
                    <StateBadge label={activeLead.heat || "sem temperatura"} tone={getHeatTone(activeLead.heat)} />
                    <StateBadge
                      label={formatPriorityLabel(activeLead.priority)}
                      tone={getPriorityTone(activeLead.priority)}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Responsavel</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">
                    {activeLead.owner || activeChat?.assignedUserName || activeChat?.ownerName || "Sem responsavel"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Valor potencial</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">
                    {formatMoney(activeLead.potentialValue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link
                href={`/cliente/painel/crm?leadId=${encodeURIComponent(activeLead.id)}`}
                className="inline-flex items-center justify-between gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
              >
                <span>Abrir ficha completa</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={`/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`}
                className="inline-flex items-center justify-between gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
              >
                <span>Criar proposta</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <button
                type="button"
                onClick={() => void handleMoveLeadStage()}
                disabled={!canOperate || savingLeadStage}
                className="inline-flex items-center justify-between gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
              >
                <span>Mover etapa</span>
                {savingLeadStage ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderKanban className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => void handleTakeover()}
                disabled={!selectedChat || updatingAi || !canOperate}
                className="inline-flex items-center justify-between gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm font-semibold text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
              >
                <span>Assumir atendimento</span>
                {updatingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
              </button>
              {activeCallHref ? (
                <button
                  type="button"
                  onClick={() => void handleCreateCallTask()}
                  disabled={savingLeadTask || !canOperate}
                  className="inline-flex items-center justify-between gap-2 rounded-[18px] border border-emerald-300/20 bg-emerald-500/10 px-3 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-500/16 disabled:opacity-60"
                >
                  <span>Ligar e registrar</span>
                  {savingLeadTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
            Esta conversa ainda nao tem um lead com contexto comercial completo. As mensagens continuam disponiveis normalmente.
          </div>
        )}
      </PanelCard>

      <PanelCard className="p-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle title="Acoes da conversa" subtitle="Status, IA, responsavel e operacao sem sair do atendimento" />
          <StateBadge label={canOperate ? "editavel" : "somente leitura"} tone={canOperate ? "info" : "neutral"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleQuickStatus("pending")}
            disabled={!selectedChat || savingMeta || !canOperate}
            className="inbox-thread-action inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
          >
            Marcar pendente
          </button>
          <button
            type="button"
            onClick={() => void handleQuickStatus("resolved")}
            disabled={!selectedChat || savingMeta || !canOperate}
            className="inbox-thread-action inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/16 disabled:opacity-50"
          >
            Marcar resolvida
          </button>
          <button
            type="button"
            onClick={() => void handleToggleAi()}
            disabled={!selectedChat || updatingAi || !canOperate}
            className="inbox-thread-action inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
          >
            {updatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : aiPaused ? <PlayCircle className="h-3.5 w-3.5" /> : <PauseCircle className="h-3.5 w-3.5" />}
            {aiPaused ? "Retomar IA" : "Pausar IA"}
          </button>
          {aiRetryAvailable ? (
            <button
              type="button"
              onClick={() => void handleRetryAi()}
              disabled={!selectedChat || retryingAi || updatingAi || !canOperate || aiPaused}
              className="inbox-thread-action inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
            >
              {retryingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reprocessar IA
            </button>
          ) : null}
        </div>

        <div className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Estado da IA</p>
              <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{aiStateDescription}</p>
            </div>
            <StateBadge
              label={activeChat?.aiState?.humanOwnerUserId ? "Atendimento humano" : aiPaused ? "IA pausada" : "IA ativa"}
              tone={activeChat?.aiState?.humanOwnerUserId ? "warning" : aiPaused ? "warning" : "ai"}
            />
          </div>
          {handoffNotifyHint ? (
            <div className="mt-3 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-3 py-3 text-xs text-amber-700">
              {handoffNotifyHint}
            </div>
          ) : null}
        </div>

        <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4" open={allowAdvanced}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
            Detalhes avancados da conversa
          </summary>
          <div className="mt-4 grid gap-3">
            <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
              <span>Status</span>
              <select
                value={metaForm.status}
                onChange={(event) => setMetaForm((current) => ({ ...current, status: event.target.value }))}
                disabled={!canOperate}
                className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {formatStatusLabel(status)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
              <span>Prioridade</span>
              <select
                value={metaForm.priority}
                onChange={(event) => setMetaForm((current) => ({ ...current, priority: event.target.value }))}
                disabled={!canOperate}
                className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>
                    {formatPriorityLabel(priority)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
              <span>Responsavel</span>
              <select
                value={metaForm.assignedUserId}
                onChange={(event) => setMetaForm((current) => ({ ...current, assignedUserId: event.target.value }))}
                disabled={!canOperate}
                className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
              >
                <option value="">Sem atribuicao</option>
                {teamMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
              <span>Tags</span>
              <input
                value={metaForm.tagsInput}
                onChange={(event) => setMetaForm((current) => ({ ...current, tagsInput: event.target.value }))}
                disabled={!canOperate}
                placeholder="vip, proposta, urgente"
                className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
            </label>

            <button
              type="button"
              onClick={() => void handleSaveMeta()}
              disabled={savingMeta || !canOperate}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              {savingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Salvar operacao
            </button>
          </div>
        </details>
      </PanelCard>

      <PanelCard className="p-4">
        <CardTitle title="Propostas e financeiro" subtitle="Tudo o que ajuda a avancar a venda no contexto da conversa" />

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
                icon={Receipt}
                hint="proximos recebimentos"
              />
            </div>

            <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4" open>
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
                Propostas abertas
              </summary>
              <div className="mt-4 space-y-3">
                {leadBudgets.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
                    Nenhuma proposta vinculada a este contato ainda.
                  </p>
                ) : (
                  leadBudgets.map((budget) => (
                    <div key={budget.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{budget.titulo || "Proposta"}</p>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                            validade {formatDate(budget.validade)} / atualizada {formatDateTime(budget.updatedAt)}
                          </p>
                        </div>
                        <StateBadge
                          label={budget.status || "Rascunho"}
                          tone={budget.status === "Aprovado" ? "success" : budget.status === "Perdido" ? "danger" : "neutral"}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{formatMoney(Number(budget.valorTotal || 0))}</p>
                        {budget.resumo ? (
                          <p className="line-clamp-1 max-w-[62%] text-right text-xs text-[var(--cliente-card-text-soft)]">{budget.resumo}</p>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>

            <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
                Financeiro recente
              </summary>
              <div className="mt-4 space-y-3">
                {leadFinance.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
                    Nenhum lancamento comercial associado a este contato.
                  </p>
                ) : (
                  leadFinance.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.descricao || "Lancamento"}</p>
                          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                            {item.categoria || item.tipo || "Comercial"} / vencimento {formatDate(item.vencimento)}
                          </p>
                        </div>
                        <StateBadge
                          label={item.status || "pendente"}
                          tone={String(item.status || "").toLowerCase() === "pago" ? "success" : "warning"}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                        <p className="font-semibold text-[var(--cliente-card-text)]">{formatMoney(Number(item.valor || 0))}</p>
                        <p className="text-xs text-[var(--cliente-card-text-soft)]">{item.meioPagamento || "Sem meio de pagamento"}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
            Vincule um cliente a conversa para enxergar propostas, receita e pendencias financeiras aqui.
          </div>
        )}
      </PanelCard>

      <PanelCard className="p-4">
        <CardTitle title="Proxima acao e historico" subtitle="Tarefas, notas e eventos conectados a este atendimento" />

        <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4" open>
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
            Tarefas e proxima acao
          </summary>
          <div className="mt-4 space-y-3">
            {leadTasks.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhuma tarefa criada para este contato ainda.</p>
            ) : (
              leadTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{task.title || "Tarefa"}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <StateBadge label={formatTaskType(task.type)} tone="neutral" />
                        <StateBadge label={formatPriorityLabel(task.priority)} tone={getTaskTone(task)} />
                        <StateBadge label={task.status === "done" ? "Concluida" : "Pendente"} tone={getTaskTone(task)} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleToggleLeadTask(task)}
                      disabled={!canOperate || updatingTaskId === task.id}
                      className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
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
                  <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                    prazo {formatDateTime(task.dueAt || task.createdAt)}
                  </p>
                </div>
              ))
            )}

            {activeLead ? (
              <form onSubmit={handleCreateLeadTask} className="space-y-3 border-t border-[var(--cliente-border)] pt-4">
                <input
                  value={leadTaskTitle}
                  onChange={(event) => setLeadTaskTitle(event.target.value)}
                  placeholder="Ex: Retornar proposta ainda hoje"
                  disabled={!canOperate}
                  className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="datetime-local"
                    value={leadTaskDueAt}
                    onChange={(event) => setLeadTaskDueAt(event.target.value)}
                    disabled={!canOperate}
                    className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
                  />
                  <select
                    value={leadTaskType}
                    onChange={(event) => setLeadTaskType(event.target.value as (typeof TASK_TYPES)[number])}
                    disabled={!canOperate}
                    className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
                  >
                    {TASK_TYPES.map((taskType) => (
                      <option key={taskType} value={taskType}>
                        {formatTaskType(taskType)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={leadTaskPriority}
                    onChange={(event) => setLeadTaskPriority(event.target.value as (typeof TASK_PRIORITIES)[number])}
                    disabled={!canOperate}
                    className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
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
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
                >
                  {savingLeadTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
                  Criar tarefa
                </button>
              </form>
            ) : null}
          </div>
        </details>

        <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
            Notas rapidas
          </summary>
          <form onSubmit={handleCreateInternalNote} className="mt-4 space-y-3">
            <textarea
              value={internalNoteText}
              onChange={(event) => setInternalNoteText(event.target.value)}
              placeholder="Registrar contexto interno desta conversa"
              disabled={!canOperate}
              rows={3}
              className="client-input w-full rounded-2xl border px-3 py-3 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
            />
            <button
              type="submit"
              disabled={!canOperate || savingNote || !internalNoteText.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
            >
              {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
              Salvar nota interna
            </button>
          </form>

          {activeLead ? (
            <form onSubmit={handleCreateLeadNote} className="mt-4 space-y-3 border-t border-[var(--cliente-border)] pt-4">
              <textarea
                value={leadNoteText}
                onChange={(event) => setLeadNoteText(event.target.value)}
                placeholder="Registrar nota comercial no perfil do cliente"
                disabled={!canOperate}
                rows={3}
                className="client-input w-full rounded-2xl border px-3 py-3 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
              />
              <button
                type="submit"
                disabled={!canOperate || savingLeadNote || !leadNoteText.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
              >
                {savingLeadNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <NotebookPen className="h-4 w-4" />}
                Salvar nota comercial
              </button>
            </form>
          ) : null}
        </details>

        <NoteCard
          title="Notas internas"
          subtitle="Contexto operacional desta conversa"
          notes={chatNotes}
          emptyLabel="Nenhuma nota interna registrada para este chat."
        />

        <div className="pt-4">
          <NoteCard
            title="Notas comerciais"
            subtitle="Anotacoes persistidas no CRM do contato"
            notes={leadNotes}
            emptyLabel="Nenhuma nota comercial registrada para o contato."
          />
        </div>

        <details className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-[var(--cliente-card-text)]">
            Historico recente
          </summary>
          <div className="mt-4 space-y-3">
            {timeline.length === 0 ? (
              <p className="text-sm text-[var(--cliente-card-text-soft)]">Nenhum evento recente no contato.</p>
            ) : (
              timeline.slice(0, 8).map((event) => (
                <div key={event.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{event.title || "Evento"}</p>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                  {event.detail ? <p className="mt-2 text-sm leading-6 text-[var(--cliente-card-text-muted)]">{event.detail}</p> : null}
                </div>
              ))
            )}
          </div>
        </details>
      </PanelCard>
    </div>
  );

  if (!selectedChat && !loadingChats && chats.length === 0) {
    return (
      <div className="inbox-refined client-daily-page space-y-5">
        <SectionHeader
          title="Conversas"
          subtitle="Atenda clientes, veja o contexto comercial e avance oportunidades sem sair do chat."
        />
        <EmptyState
          title="Nenhuma conversa encontrada"
          description="Quando novas mensagens chegarem no WhatsApp ou nos canais conectados, elas aparecerao aqui com cliente, historico e proximo passo."
        />
      </div>
    );
  }

  return (
    <div className="inbox-refined client-daily-page space-y-6">
      <SectionHeader
        title="Conversas"
        subtitle="Atenda clientes e avance oportunidades no mesmo fluxo."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setExperienceMode(allowAdvanced ? "essencial" : "completo")}
              className={cn(
                "inline-flex items-center gap-2 rounded-[18px] border px-3 py-2.5 text-xs font-semibold transition",
                allowAdvanced
                  ? "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]"
                  : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] hover:border-[var(--cliente-border-strong)] hover:text-[var(--cliente-card-text)]"
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {allowAdvanced ? "Modo simples" : "Mais opcoes"}
            </button>
            {allowAdvanced && canManageQueue ? (
              <button
                type="button"
                onClick={handleDistributeQueue}
                disabled={distributing}
                className="inbox-toolbar-button inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
              >
                {distributing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                Distribuir conversas
              </button>
            ) : null}
            <StateBadge
              label={activeResponseState.label}
              tone={activeResponseState.tone}
            />
            <button
              type="button"
              onClick={() => void refreshSelected(true)}
              className="inbox-toolbar-button inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </div>
        }
      />

      {error ? (
        <div className="inbox-notice inbox-notice-danger flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <section
        className={cn(
          "grid min-h-[82vh] min-w-0 grid-cols-1 gap-4 xl:h-[calc(100vh-8rem)] xl:min-h-0 xl:grid-cols-[minmax(320px,380px)_minmax(0,1.7fr)]",
          showDesktopContextPanel
            ? "2xl:grid-cols-[minmax(320px,380px)_minmax(0,1.7fr)_minmax(320px,380px)]"
            : "2xl:grid-cols-[minmax(320px,380px)_minmax(0,1.8fr)]"
        )}
      >
        <PanelCard className={cn(
          "inbox-rail inbox-whatsapp-list min-h-0 min-w-0 flex-col overflow-hidden xl:sticky xl:top-4 xl:flex xl:max-h-[calc(100vh-8rem)]",
          selectedChatId ? "hidden" : "flex"
        )}>
          <div className="border-b border-[var(--cliente-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Conversas" subtitle={`${filteredChats.length} conversas visiveis`} />
            </div>

            <div className="mt-4 space-y-3">
              <label className="client-input flex items-center gap-2 rounded-[20px] border px-3.5 py-3 text-sm text-[var(--cliente-card-text-muted)]">
                <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone, tag..."
                  className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
              </label>

              <ClientTabs
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                className="w-full"
                items={STATUS_FILTERS.map((filter) => ({
                  value: filter,
                  label: formatStatusFilterLabel(filter),
                }))}
              />

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setQueueFilter(queueFilter === "assigned_waiting" ? "all" : "assigned_waiting")}
                  className={cn(
                    "inbox-filter-pill rounded-[18px] border px-3 py-2 text-left text-[11px] font-semibold transition",
                    queueFilter === "assigned_waiting"
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"
                  )}
                >
                  Precisa de resposta
                </button>
                <button
                  type="button"
                  onClick={() => setQueueFilter(queueFilter === "unassigned" ? "all" : "unassigned")}
                  className={cn(
                    "inbox-filter-pill rounded-[18px] border px-3 py-2 text-left text-[11px] font-semibold transition",
                    queueFilter === "unassigned"
                      ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"
                  )}
                >
                  Sem responsavel
                </button>
                <button
                  type="button"
                  onClick={() => setPriorityFilter(priorityFilter === "high" ? "all" : "high")}
                  className={cn(
                    "inbox-filter-pill rounded-[18px] border px-3 py-2 text-left text-[11px] font-semibold transition",
                    priorityFilter === "high"
                      ? "border-[var(--cliente-warning)]/35 bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]"
                      : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"
                  )}
                >
                  Alta prioridade
                </button>
              </div>

              {allowAdvanced ? (
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {showAdvancedFilters ? "Ocultar filtros" : "Mais filtros"}
                </button>
              ) : null}

              {allowAdvanced && showAdvancedFilters ? (
                <>
                  <div className="grid grid-cols-1 gap-2">
                    <select
                      value={priorityFilter}
                      onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
                      className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
                    >
                      {PRIORITY_FILTERS.map((option) => (
                        <option key={option} value={option}>
                          {option === "all" ? "Todas prioridades" : formatPriorityLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <select
                      value={queueFilter}
                      onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
                      className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
                    >
                      {QUEUE_FILTERS.map((option) => (
                        <option key={option} value={option}>{formatQueueFilterLabel(option)}</option>
                      ))}
                    </select>

                    <select
                      value={aiFilter}
                      onChange={(event) => setAiFilter(event.target.value as AiFilter)}
                      className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
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
                      className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
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
                      className="client-input rounded-xl border px-3 py-2 text-sm outline-none"
                    >
                      <option value="all">Todos os responsaveis</option>
                      {availableAssignees.map((assignee) => (
                        <option key={assignee.userId} value={assignee.userId}>
                          {assignee.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex-1 overflow-x-hidden overflow-y-auto">
            {loadingChats ? (
              <div className="py-10 text-center text-[var(--cliente-card-text-soft)]">
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

        <PanelCard className={cn(
          "inbox-thread-shell min-h-0 min-w-0 flex-col overflow-hidden xl:flex",
          selectedChatId ? "flex h-[calc(100dvh-7rem)] xl:h-full" : "hidden"
        )}>
          <div className="inbox-thread-header inbox-chat-header border-b border-[var(--cliente-border)] p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedChatId(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)] xl:hidden"
                  aria-label="Voltar para conversas"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <ContactAvatar
                  name={activeChat?.contactName}
                  phone={activeChat?.contactPhone}
                  photoUrl={activeChat?.contactPhotoUrl}
                  size="md"
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold tracking-tight text-[var(--cliente-card-text)] sm:text-lg">
                      {activeChat?.contactName || activeChat?.contactPhone || "Contato sem nome"}
                    </h3>
                    <StateBadge label={formatChannelLabel(activeChat?.channel)} tone="neutral" />
                    <StateBadge label={activeResponseState.label} tone={activeResponseState.tone} />
                    {activeChat?.aiState?.humanOwnerUserId ? (
                      <StateBadge label="Atendimento humano" tone="warning" />
                    ) : aiPaused ? (
                      <StateBadge label="IA pausada" tone="warning" />
                    ) : null}
                  </div>
                  {activeLead ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1.5 shadow-[0_10px_24px_-18px_rgba(15,23,42,0.45)]">
                      <ContactAvatar
                        name={detail?.company?.name || tenant?.tenantName || "Cliente"}
                        photoUrl={detail?.company?.photoUrl || null}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                          Empresa
                        </p>
                        <p className="truncate text-sm text-[var(--cliente-card-text-muted)]">
                          {detail?.company?.name || tenant?.tenantName || "Cliente"}
                          {detail?.company?.niche ? ` / ${detail.company.niche}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--cliente-card-text-soft)]">
                    <span>
                      Responsavel: {activeChat?.assignedUserName || activeChat?.ownerName || "Sem atribuicao"}
                    </span>
                    <span>|</span>
                    <span>{formatQueueStatusLabel(activeChat?.queueStatus)}</span>
                    <span>|</span>
                    <span>{activeSla.label}</span>
                    <span>|</span>
                    <span>Ultima atividade {formatRelative(activeChat?.lastMessageTime)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {activeCallHref ? (
                  <button
                    type="button"
                    onClick={() => void handleCreateCallTask()}
                    disabled={savingLeadTask || !canOperate}
                    className="inline-flex items-center gap-2 rounded-[18px] border border-emerald-300/20 bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/16 disabled:opacity-60"
                  >
                    {savingLeadTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    Ligar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowDetailsDrawer(true)}
                  disabled={!showContextPanel}
                  className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50 2xl:hidden"
                >
                  <PanelRightOpen className="h-3.5 w-3.5" />
                  Ver cliente
                </button>
                <button
                  type="button"
                  onClick={() => void refreshSelected(true)}
                  className="inline-flex items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
              </div>
            </div>

          </div>

          <div
            ref={messagesScrollRef}
            className="inbox-thread-wall inbox-chat-wall min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 scroll-smooth sm:px-4 lg:px-5"
          >
            {!selectedChatId ? (
              <EmptyState
                title="Selecione uma conversa"
                description="Escolha um contato na lista para abrir o atendimento."
              />
            ) : loadingMessages ? (
              <div className="py-10 text-center text-[var(--cliente-card-text-soft)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState
                title="Sem mensagens"
                description="Esta conversa ainda nao tem historico visivel no inbox."
              />
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          <form
            onSubmit={(event) => (whatsappWindowClosed ? void handleSendTemplate(event) : void handleSend(event))}
            className="inbox-thread-composer inbox-chat-composer shrink-0 border-t border-[var(--cliente-border)] p-4"
          >
            {whatsappWindowClosed ? (
              <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-warning)_14%,transparent)] p-3 text-[var(--cliente-card-text)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Enviar follow-up aprovado</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-muted)]">
                      A janela de 24h fechou. Para chamar o contato agora, envie um template aprovado na Meta.
                    </p>
                  </div>
                  <a
                    href="https://business.facebook.com/wa/manage/message-templates/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-[color:color-mix(in_srgb,var(--cliente-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-warning)_14%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--cliente-warning)] transition hover:brightness-95"
                  >
                    Gerenciar templates
                  </a>
                </div>

                <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(180px,1fr)_92px_minmax(180px,1fr)_auto]">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
                      Template
                    </span>
                    <input
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      placeholder="Ex: follow_up_geral"
                      className="client-input w-full rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_22%,transparent)] px-3 py-2 text-sm outline-none focus:border-[color:color-mix(in_srgb,var(--cliente-warning)_42%,transparent)]"
                      disabled={sendingTemplate || !canOperate}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
                      Idioma
                    </span>
                    <input
                      value={templateLanguage}
                      onChange={(event) => setTemplateLanguage(event.target.value)}
                      placeholder="pt_BR"
                      className="client-input w-full rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_22%,transparent)] px-3 py-2 text-sm outline-none focus:border-[color:color-mix(in_srgb,var(--cliente-warning)_42%,transparent)]"
                      disabled={sendingTemplate || !canOperate}
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
                      Variaveis, se tiver
                    </span>
                    <input
                      value={templateParamsText}
                      onChange={(event) => setTemplateParamsText(event.target.value)}
                      placeholder="Ex: Savio, proposta"
                      className="client-input w-full rounded-xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_22%,transparent)] px-3 py-2 text-sm outline-none focus:border-[color:color-mix(in_srgb,var(--cliente-warning)_42%,transparent)]"
                      disabled={sendingTemplate || !canOperate}
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={!selectedChatId || sendingTemplate || !templateName.trim() || !canOperate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#07130C] transition hover:brightness-95 disabled:opacity-55 lg:self-end"
                  >
                    {sendingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar follow-up
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder={canOperate ? "Digite a mensagem" : "Perfil sem permissao para responder"}
                  className="inbox-chat-input flex-1 rounded-full border border-transparent px-4 py-3 text-sm outline-none focus:border-[#25D366]"
                  disabled={!selectedChatId || sending || !canOperate}
                />
                <button
                  type="submit"
                  disabled={!selectedChatId || sending || !messageText.trim() || !canOperate}
                  className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#07130C] transition hover:brightness-95 disabled:opacity-55"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar
                </button>
              </div>
            )}
          </form>
        </PanelCard>

        {showDesktopContextPanel ? (
          <div className="hidden min-h-0 min-w-0 overflow-x-hidden overflow-y-auto 2xl:block 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-8rem)]">
            {contextPanelContent}
          </div>
        ) : null}
      </section>

      <CustomerProfileDrawer
        open={showDetailsDrawer}
        onClose={() => setShowDetailsDrawer(false)}
        title="Cliente e oportunidade"
        subtitle="Contexto comercial da conversa atual"
      >
        {contextPanelContent}
      </CustomerProfileDrawer>
    </div>
  );
}
