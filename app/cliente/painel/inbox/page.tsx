"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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
  Clock3,
  FileText,
  Flag,
  FolderKanban,
  Image as ImageIcon,
  Loader2,
  Mic,
  NotebookPen,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Receipt,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
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
  const dimension = size === "sm" ? "h-11 w-11 text-sm" : "h-12 w-12 text-sm";
  const src = String(photoUrl || "").trim();
  const canRenderImage = src && !imageFailed;

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
        "flex shrink-0 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-[linear-gradient(135deg,rgba(37,211,102,0.12),rgba(255,255,255,0.04))] font-semibold text-[var(--cliente-card-text)]",
        dimension
      )}
    >
      {getInitials(name || phone)}
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

function humanizeEvidenceSource(value?: string | null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "agent_extracted") return "extraido";
  if (normalized === "conversation_context") return "contexto";
  if (normalized === "derived") return "derivado";
  return normalized || "desconhecido";
}

function getEvidenceConfidenceTone(confidence?: number | null) {
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return "neutral" as const;
  if (confidence >= 0.82) return "success" as const;
  if (confidence >= 0.66) return "info" as const;
  return "warning" as const;
}

function getInitials(value?: string) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "LD";
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
      ? "IA sem quota/saldo no provider atual. Ajuste billing ou troque para modelo economico no painel IA."
      : "IA parou por falta de quota/saldo no provider. Ajuste billing/modelo e clique em Reprocessar ultima mensagem.";
  }
  if (code === "auth_invalid") {
    return retrying
      ? "IA com credencial invalida/expirada no provider ou canal atual. Revise chave/API token do tenant."
      : "IA parou por credencial invalida/expirada no provider/canal. Atualize a chave/API token e reprocese.";
  }
  if (code === "rate_limited") {
    return retrying
      ? "IA aguardando janela do provider por limite de requisicoes (rate limit)."
      : "IA excedeu limite de requisicoes no provider e entrou em fila de falha.";
  }
  if (code === "timeout") {
    return retrying
      ? "IA enfrentou timeout no provider e esta tentando novamente."
      : "IA parou por timeout repetido no provider. Tente reprocessar agora.";
  }
  if (code === "provider_unavailable") {
    return retrying
      ? "Provider de IA indisponivel no momento; tentativa automatica em andamento."
      : "Provider de IA indisponivel por tempo prolongado. Reprocessamento manual recomendado.";
  }
  if (code === "network_error") {
    return retrying
      ? "Instabilidade de rede entre plataforma e provider; nova tentativa em andamento."
      : "Falha de rede persistente no envio ao provider. Reprocessamento manual recomendado.";
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

function getHandoffNotifyStatusMeta(status: unknown) {
  const normalized = normalizeHandoffNotifyStatus(status);
  if (!normalized) return null;
  if (normalized === "success") return { label: "alerta de transferencia ok", tone: "success" as const };
  if (normalized === "partial_failure") return { label: "alerta parcial", tone: "warning" as const };
  if (normalized === "failed") return { label: "alerta falhou", tone: "danger" as const };
  if (normalized === "skipped_no_channel") return { label: "transferencia sem canal", tone: "danger" as const };
  if (normalized === "skipped_no_recipients") return { label: "transferencia sem destinatario", tone: "danger" as const };
  if (normalized === "skipped_disabled") return { label: "alerta desativado", tone: "warning" as const };
  if (normalized === "skipped_duplicate") return { label: "alerta duplicado", tone: "neutral" as const };
  return { label: `alerta ${normalized.replaceAll("_", " ")}`, tone: "neutral" as const };
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
    return `Takeover humano ativo${updatedByName ? ` por ${updatedByName}` : ""}${suffix}.`;
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
        ? ` Detalhe tecnico: ${compactAiError(lastJobError)}.`
        : "";
    return `${base}${detail}`;
  }

  if (lastJobStatus === "dead_letter") {
    const base = aiErrorStatusMessage(lastJobErrorCode, "dead_letter");
    const detail =
      (!lastJobErrorCode || lastJobErrorCode === "unknown_error") && lastJobError
        ? ` Detalhe tecnico: ${compactAiError(lastJobError)}.`
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
        "inbox-whatsapp-row w-full min-w-0 border px-3 py-3 text-left transition",
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
                <span>{formatChannelLabel(chat.channel)}</span>
                <span>|</span>
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
              <p className="mt-1">{formatRelative(chat.lastMessageTime)}</p>
            </div>
          </div>

          <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[var(--cliente-card-text-muted)]">
            {getMessagePreview(chat)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StateBadge label={formatQueueStatusLabel(chat.queueStatus)} tone={sla.breached ? "danger" : "neutral"} />
            <StateBadge label={sla.label} tone={sla.breached ? "danger" : "info"} />
            {aiPaused ? <StateBadge label="IA pausada" tone="warning" /> : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--cliente-card-text-soft)]">
            <span>{formatStatusLabel(chat.status)}</span>
            <span className="truncate text-right">{chat.tags?.slice(0, 2).join(" / ") || "sem tags"}</span>
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
        <div className="rounded-2xl border border-amber-300/18 bg-amber-500/12 p-2 text-amber-100">
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
        <div className="rounded-2xl border border-sky-300/18 bg-sky-500/12 p-2 text-sky-100">
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
    type === "audio" ? "Audio" : type === "image" ? "Imagem" : type === "document" ? "Documento" : null;
  const MediaIcon = type === "audio" ? Mic : type === "image" ? ImageIcon : type === "document" ? FileText : null;

  return (
    <div className={cn("flex", isAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] min-w-0 border px-3.5 py-2.5 text-sm shadow-[0_8px_20px_rgba(17,27,33,0.12)] sm:max-w-[86%] xl:max-w-[78%] 2xl:max-w-[74%]",
          isAgent
            ? "inbox-message-out rounded-2xl rounded-br-md"
            : isSystem
              ? "inbox-message-system mx-auto rounded-2xl text-center"
              : "inbox-message-in rounded-2xl rounded-bl-md"
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
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[14px] leading-6 text-current">
            {preview}
          </p>
        ) : null}
        {isAgent && outboundStatus === "failed" && message.deliveryError ? (
          <p className="mt-2 text-xs text-rose-100/90">Falha de entrega: {message.deliveryError}</p>
        ) : null}
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-current opacity-55">
          <span>{formatDateTime(message.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--cliente-border)] py-2.5 last:border-b-0 last:pb-0">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</span>
      <span className="max-w-[62%] text-right text-sm text-[var(--cliente-card-text-muted)]">{value || "--"}</span>
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
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
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
  const [showOpsSummary, setShowOpsSummary] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

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

  useEffect(() => {
    if (!allowAdvanced) {
      setShowOpsSummary(false);
      setShowAdvancedFilters(false);
    }
  }, [allowAdvanced]);

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
  }, [loadChats]);

  useEffect(() => {
    if (!selectedChatId) {
      setDetail(null);
      setMessages([]);
      return;
    }

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
  const handoffNotifyMeta = useMemo(
    () => getHandoffNotifyStatusMeta(activeChat?.aiState?.lastHandoffNotifyStatus),
    [activeChat?.aiState?.lastHandoffNotifyStatus]
  );
  const handoffNotifyHint = useMemo(
    () => getHandoffNotifyStatusHint(activeChat?.aiState?.lastHandoffNotifyStatus),
    [activeChat?.aiState?.lastHandoffNotifyStatus]
  );

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
  const aiEvidenceTop = useMemo(() => {
    const source = activeLead?.aiFieldEvidence || {};
    return Object.entries(source)
      .map(([field, raw]) => {
        const evidence =
          raw && typeof raw === "object"
            ? (raw as { value?: unknown; source?: unknown; confidence?: unknown; capturedAt?: unknown })
            : null;
        const value = typeof evidence?.value === "string" ? evidence.value.trim() : "";
        const src = typeof evidence?.source === "string" ? evidence.source : "";
        const confidence =
          typeof evidence?.confidence === "number" && Number.isFinite(evidence.confidence)
            ? evidence.confidence
            : null;
        return {
          field,
          value: value || "--",
          source: src,
          confidence,
          capturedAt: evidence?.capturedAt,
        };
      })
      .sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1))
      .slice(0, 6);
  }, [activeLead?.aiFieldEvidence]);
  const aiChecklistProgress = useMemo(() => {
    const checklist = activeLead?.aiCaptureChecklist;
    if (!checklist) return { done: 0, total: 0 };
    const keys = [
      "nome",
      "tipoEmpresa",
      "objetivo",
      "orcamento",
      "urgencia",
      "decisor",
      "canaisAtuais",
      "cidade",
      "tamanhoTime",
      "servicoInteresse",
    ] as const;
    const done = keys.filter((key) => Boolean(checklist[key])).length;
    return { done, total: keys.length };
  }, [activeLead?.aiCaptureChecklist]);
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
        title: "Contato atual com contexto comercial",
        detail: "Abrir proposta, financeiro e negociacao sem perder o fio da conversa.",
        badge: "contato",
        tone: "success",
      });
    }

    return items.slice(0, 5);
  }, [activeLead?.id, inboxStats.highPriority, inboxStats.pending, inboxStats.slaBreached, inboxStats.unassigned]);

  if (!selectedChat && !loadingChats && chats.length === 0) {
    return (
      <div className="client-daily-page space-y-4">
        <SectionHeader
          title="Inbox"
          subtitle="Operacao de atendimento, apoio humano e contexto comercial no mesmo painel."
        />
        <EmptyState
          title="Nenhuma conversa encontrada"
          description="Quando novas mensagens chegarem no WhatsApp ou nos canais conectados deste tenant, elas aparecerao aqui com contexto, SLA e controle operacional."
        />
      </div>
    );
  }

  return (
    <div className="client-daily-page space-y-5">
      <SectionHeader
        title="Inbox"
        subtitle={
          allowAdvanced
            ? "Atendimento com contexto completo, filtros e painis operacionais."
            : "Atendimento diario com foco em conversas, resposta e atribuicao."
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-1">
              <button
                type="button"
                onClick={() => setExperienceMode("essencial")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  !allowAdvanced
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                )}
              >
                Uso diario
              </button>
              <button
                type="button"
                onClick={() => setExperienceMode("completo")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  allowAdvanced
                    ? "bg-[var(--cliente-accent)] text-white"
                    : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                )}
              >
                Analise completa
              </button>
            </div>
            {allowAdvanced ? (
              <button
                type="button"
                onClick={() => setShowOpsSummary((current) => !current)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition",
                  showOpsSummary
                    ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                    : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-panel-soft)]"
                )}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {showOpsSummary ? "Ocultar resumo" : "Mostrar resumo"}
              </button>
            ) : null}
            <StateBadge
              label={aiPaused ? "IA pausada nesta conversa" : "IA ativa nesta conversa"}
              tone={aiPaused ? "warning" : "success"}
            />
            {allowAdvanced && canManageQueue ? (
              <button
                type="button"
                onClick={handleDistributeQueue}
                disabled={distributing}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
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
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
          </div>
        }
      />

      {showOpsSummary ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
      ) : null}

      {allowAdvanced && showOpsSummary ? (
        <section className="grid gap-3 xl:grid-cols-5">
          {focusSignals.length === 0 ? (
            <PanelCard className="p-4 xl:col-span-5">
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Inbox sem gargalos relevantes no momento</p>
              <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                O atendimento atual nao mostra fila critica, SLA estourado ou operacao sem responsavel.
              </p>
            </PanelCard>
          ) : (
            focusSignals.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4 transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.title}</p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{item.detail}</p>
                  </div>
                  <StateBadge label={item.badge} tone={item.tone} />
                </div>
              </Link>
            ))
          )}
        </section>
      ) : null}

      {error ? (
        <PanelCard className="border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
          {error}
        </PanelCard>
      ) : null}

      {showOpsSummary && allowAdvanced ? (
      <PanelCard className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[260px] flex-1">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Estado operacional da IA nesta conversa</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{aiStateDescription}</p>
            {activeChat?.aiState?.lastProcessedAt || activeChat?.aiState?.lastDecision || activeChat?.aiState?.lastJobStatus ? (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">
                {activeChat?.aiState?.lastJobStatus ? (
                  <span className="rounded-full border border-[var(--cliente-border)] px-2 py-1">
                    tarefa {String(activeChat.aiState.lastJobStatus).replaceAll("_", " ")}
                  </span>
                ) : null}
                {activeChat?.aiState?.lastDecision ? (
                  <span className="rounded-full border border-[var(--cliente-border)] px-2 py-1">
                    decisao {String(activeChat.aiState.lastDecision).replaceAll("_", " ")}
                  </span>
                ) : null}
                {activeChat?.aiState?.lastProcessedAt ? (
                  <span className="rounded-full border border-[var(--cliente-border)] px-2 py-1">
                    ultimo ciclo {formatDateTime(activeChat.aiState.lastProcessedAt)}
                  </span>
                ) : null}
                {handoffNotifyMeta ? (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-1",
                      handoffNotifyMeta.tone === "danger"
                        ? "border-rose-300/30 text-rose-100"
                        : handoffNotifyMeta.tone === "warning"
                        ? "border-amber-300/30 text-amber-100"
                        : handoffNotifyMeta.tone === "success"
                        ? "border-emerald-300/30 text-emerald-100"
                        : "border-[var(--cliente-border)] text-[var(--cliente-card-text-soft)]"
                    )}
                  >
                    {handoffNotifyMeta.label}
                  </span>
                ) : null}
                {typeof activeChat?.aiState?.lastHandoffNotifySuccessCount === "number" ? (
                  <span className="rounded-full border border-[var(--cliente-border)] px-2 py-1">
                    alerta ok {activeChat.aiState.lastHandoffNotifySuccessCount}
                  </span>
                ) : null}
                {typeof activeChat?.aiState?.lastHandoffNotifyFailureCount === "number" &&
                Number(activeChat.aiState.lastHandoffNotifyFailureCount || 0) > 0 ? (
                  <span className="rounded-full border border-[var(--cliente-border)] px-2 py-1">
                    alerta falha {activeChat.aiState.lastHandoffNotifyFailureCount}
                  </span>
                ) : null}
              </div>
            ) : null}
            <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">
              Quando a conversa entra em transferencia ou pausa manual, a IA para de responder ate ser retomada novamente.
            </p>
            {handoffNotifyHint ? (
              <div className="mt-2 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {handoffNotifyHint}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StateBadge
              label={activeChat?.aiState?.humanOwnerUserId ? "Takeover humano" : aiPaused ? "IA pausada" : "IA pronta"}
              tone={activeChat?.aiState?.humanOwnerUserId ? "warning" : aiPaused ? "warning" : "success"}
            />
            {aiPaused ? (
              <button
                type="button"
                onClick={() => void handleToggleAi()}
                disabled={!selectedChatId || updatingAi || !canOperate}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-500/12 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/18 disabled:opacity-50"
              >
                {updatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                {activeChat?.aiState?.humanOwnerUserId ? "Liberar transferencia e retomar IA" : "Retomar IA agora"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleToggleAi()}
                disabled={!selectedChatId || updatingAi || !canOperate}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
              >
                {updatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PauseCircle className="h-3.5 w-3.5" />}
                Pausar IA agora
              </button>
            )}
            {aiRetryAvailable ? (
              <button
                type="button"
                onClick={() => void handleRetryAi()}
                disabled={!selectedChatId || retryingAi || updatingAi || !canOperate || aiPaused}
                className="inline-flex items-center gap-2 rounded-xl border border-sky-300/20 bg-sky-500/12 px-3 py-2 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/18 disabled:opacity-50"
              >
                {retryingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Reprocessar ultima mensagem
              </button>
            ) : null}
              {handoffNotifyHint ? (
                <Link
                  href="/cliente/painel/ia"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-500/12 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/18"
              >
                  Ajustar alerta de transferencia
                </Link>
              ) : null}
          </div>
        </div>
      </PanelCard>
      ) : null}

      <section
        className={cn(
          "grid min-h-[82vh] min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(320px,380px)_minmax(0,1.7fr)]",
          allowAdvanced
            ? "2xl:grid-cols-[minmax(320px,380px)_minmax(0,1.8fr)_minmax(280px,332px)]"
            : "2xl:grid-cols-[minmax(320px,380px)_minmax(0,1.8fr)]"
        )}
      >
        <PanelCard className={cn(
          "inbox-whatsapp-list min-h-0 min-w-0 flex-col overflow-hidden xl:sticky xl:top-4 xl:flex xl:max-h-[calc(100vh-8rem)]",
          selectedChatId ? "hidden" : "flex"
        )}>
          <div className="border-b border-[var(--cliente-border)] p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Conversas" subtitle={`${filteredChats.length} visiveis agora`} />
              <StateBadge label={`${inboxStats.highPriority} prioritarias`} tone="danger" />
            </div>

            <div className="mt-4 space-y-3">
              <label className="client-input flex items-center gap-2 rounded-xl border px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]">
                <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por nome, telefone, tag..."
                  className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
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
                        ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] text-[var(--cliente-accent)]"
                        : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-soft)] hover:bg-[var(--cliente-panel-soft)]"
                    )}
                  >
                    {filter === "all" ? "todas" : filter}
                  </button>
                ))}
              </div>

              {allowAdvanced ? (
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {showAdvancedFilters ? "Ocultar filtros avancados" : "Mostrar filtros avancados"}
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
                        <option key={option} value={option}>
                          {formatQueueFilterLabel(option)}
                        </option>
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
          "min-h-0 min-w-0 flex-col overflow-hidden xl:flex",
          selectedChatId ? "flex" : "hidden"
        )}>
          <div className="inbox-chat-header border-b border-[var(--cliente-border)] p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedChatId(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--cliente-card-text-muted)] hover:bg-[var(--cliente-surface-muted)] xl:hidden"
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
                    <h3 className="truncate text-xl font-semibold tracking-tight text-[var(--cliente-card-text)]">
                      {activeChat?.contactName || activeChat?.contactPhone || "Contato sem nome"}
                    </h3>
                    <StateBadge label={formatChannelLabel(activeChat?.channel)} tone="neutral" />
                    <StateBadge label={formatStatusLabel(activeChat?.status)} tone={getStatusTone(activeChat?.status)} />
                    <StateBadge label={activeSla.label} tone={activeSla.breached ? "danger" : "info"} />
                  </div>
                  {allowAdvanced ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-2.5 py-1.5">
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
                    <span>Ultima atividade {formatRelative(activeChat?.lastMessageTime)}</span>
                  </div>
                </div>
              </div>

              {allowAdvanced ? (
              <div className="hidden flex-wrap gap-2 xl:flex">
                <button
                  type="button"
                  onClick={() => void handleToggleAi()}
                  disabled={!selectedChat || updatingAi || !canOperate}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
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
                  Assumir transferencia
                </button>
                <button
                  type="button"
                  onClick={() => void handleQuickStatus("pending")}
                  disabled={!selectedChat || savingMeta || !canOperate}
                  className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
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
              ) : null}
            </div>

            {allowAdvanced && activeLead ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Contato</p>
                  <p className="mt-2 text-base font-semibold text-[var(--cliente-card-text)]">{activeLead.nome || "Contato"}</p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
                    {activeLead.empresa || activeLead.origem || "Sem empresa"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Etapa do funil</p>
                  <p className="mt-2 text-base font-semibold text-[var(--cliente-card-text)]">
                    {getPipelineStageLabel(
                      normalizePipelineStageId(activeLead.pipelineStage || activeLead.stage || "captado")
                    )}
                  </p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{activeLead.owner || "Sem dono comercial"}</p>
                </div>
                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Valor potencial</p>
                  <p className="mt-2 text-base font-semibold text-[var(--cliente-card-text)]">
                    {formatMoney(activeLead.potentialValue)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Pontuacao {activeLead.score ?? "--"}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="inbox-chat-wall min-h-[58vh] flex-1 space-y-3 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4 lg:px-5 xl:max-h-[calc(100vh-14rem)]">
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
          </div>

          <form onSubmit={handleSend} className="inbox-chat-composer border-t border-[var(--cliente-border)] p-3">
            <div className="flex gap-2">
              <input
                value={messageText}
                onChange={(event) => setMessageText(event.target.value)}
                placeholder={canOperate ? "Digite a mensagem manual do time" : "Perfil sem permissao para responder"}
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
          </form>
        </PanelCard>

        {allowAdvanced ? (
        <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto 2xl:sticky 2xl:top-4 2xl:max-h-[calc(100vh-8rem)]">
          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Resumo do contato"
                subtitle="Dados comerciais, etapa e contexto de conta"
              />
              {activeLead ? (
                <StateBadge label="conectado ao CRM" tone="success" />
              ) : (
                <StateBadge label="sem contato vinculado" tone="warning" />
              )}
            </div>

            {loadingDetail ? (
              <div className="py-8 text-center text-[var(--cliente-card-text-soft)]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : activeLead ? (
              <>
                <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <InfoRow label="Nome" value={activeLead.nome || "Contato"} />
                  <InfoRow label="Telefone" value={activeLead.telefone || activeChat?.contactPhone || "--"} />
                  <InfoRow label="Email" value={activeLead.email || "--"} />
                  <InfoRow label="Empresa" value={activeLead.empresa || "--"} />
                  <InfoRow label="Origem" value={activeLead.origem || formatChannelLabel(activeLead.channel)} />
                  <InfoRow label="Responsavel" value={activeLead.owner || activeChat?.assignedUserName || "Sem dono"} />
                </div>

                {aiEvidenceTop.length > 0 || aiChecklistProgress.total > 0 ? (
                  <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                        IA rastreabilidade
                      </p>
                      {aiChecklistProgress.total > 0 ? (
                        <StateBadge
                          label={`lista ${aiChecklistProgress.done}/${aiChecklistProgress.total}`}
                          tone={aiChecklistProgress.done >= Math.ceil(aiChecklistProgress.total * 0.6) ? "success" : "warning"}
                        />
                      ) : null}
                    </div>
                    <div className="mt-3 space-y-2">
                      {aiEvidenceTop.map((item) => (
                        <div key={item.field} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                              {item.field.replaceAll("_", " ").replaceAll(".", " / ")}
                            </p>
                            <StateBadge
                              label={typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}%` : "--"}
                              tone={getEvidenceConfidenceTone(item.confidence)}
                            />
                          </div>
                          <p className="mt-1 text-sm text-[var(--cliente-card-text)]">{item.value}</p>
                          <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">
                            {humanizeEvidenceSource(item.source)} | {formatDateTime(item.capturedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3">
                  <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
                    <span>Etapa do funil</span>
                    <select
                      value={leadStage}
                      onChange={(event) => setLeadStage(event.target.value)}
                      disabled={!canOperate}
                      className="client-input w-full rounded-xl border px-3 py-2 text-sm outline-none"
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
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
                  >
                    {savingLeadStage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FolderKanban className="h-4 w-4" />
                    )}
                    Atualizar etapa
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <StateBadge label={getPipelineStageLabel(leadStage)} tone="info" />
                  <StateBadge label={`Pontuacao ${activeLead.score ?? "--"}`} tone="neutral" />
                  <StateBadge label={activeLead.heat || "sem temperatura"} tone={getHeatTone(activeLead.heat)} />
                  <StateBadge
                    label={formatPriorityLabel(activeLead.priority)}
                    tone={getPriorityTone(activeLead.priority)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {(activeLead.tags || []).length > 0 ? (
                    activeLead.tags?.map((tag) => <StateBadge key={tag} label={tag} tone="neutral" />)
                  ) : (
                    <p className="text-sm text-[var(--cliente-card-text-soft)]">Sem tags comerciais no contato.</p>
                  )}
                </div>

                <div className="mt-4 grid gap-2">
                  <Link
                    href={`/cliente/painel/crm?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <span>Abrir CRM</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/cliente/painel/pipeline?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <span>Ver no pipeline</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <span>Abrir comercial</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  {activeLead.telefone || activeChat?.contactPhone ? (
                    <a
                      href={`https://wa.me/${encodeURIComponent(String(activeLead.telefone || activeChat?.contactPhone || "").replace(/\D/g, ""))}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                    >
                      <span>Abrir no WhatsApp</span>
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : null}
                  <Link
                    href={`/cliente/painel/metricas`}
                    className="inline-flex items-center justify-between gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                  >
                    <span>Ver metricas da operacao</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                Esta conversa ainda nao esta associada a um contato com perfil comercial completo.
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
                  onChange={(event) =>
                    setMetaForm((current) => ({ ...current, assignedUserId: event.target.value }))
                  }
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
            </div>

            <button
              type="button"
              onClick={() => void handleSaveMeta()}
              disabled={savingMeta || !canOperate}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
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
                subtitle="Propostas, receita e pendencias do contato dentro da conversa"
              />
              <StateBadge
                label={activeLead ? "sincronizado" : "aguardando contato"}
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
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Propostas recentes</p>
                    <Link
                      href={`/cliente/painel/comercial?leadId=${encodeURIComponent(activeLead.id)}`}
                      className="text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
                    >
                      Abrir comercial
                    </Link>
                  </div>
                  {leadBudgets.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
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
                          <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{formatMoney(Number(budget.valorTotal || 0))}</p>
                          {budget.resumo ? (
                            <p className="line-clamp-1 max-w-[62%] text-right text-xs text-[var(--cliente-card-text-soft)]">{budget.resumo}</p>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 space-y-3 border-t border-[var(--cliente-border)] pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Financeiro recente</p>
                    <StateBadge label={`${leadFinance.length}`} tone="neutral" />
                  </div>
                  {leadFinance.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-3 text-sm text-[var(--cliente-card-text-soft)]">
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
              </>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4 text-sm text-[var(--cliente-card-text-soft)]">
                Vincule um contato a conversa para enxergar propostas, receita e pendencias financeiras aqui.
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle
                title="Tarefas do contato"
                subtitle="Retorno, proposta e pendencias sem sair do inbox"
              />
              <StateBadge label={`${leadTasks.length}`} tone="neutral" />
            </div>

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
            </div>
            {activeLead ? (
              <form onSubmit={handleCreateLeadTask} className="mt-4 space-y-3 border-t border-[var(--cliente-border)] pt-4">
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
                    onChange={(event) =>
                      setLeadTaskPriority(event.target.value as (typeof TASK_PRIORITIES)[number])
                    }
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
              subtitle="Notas internas da conversa e observacoes do contato"
            />

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
                {savingNote ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <NotebookPen className="h-4 w-4" />
                )}
                Salvar nota interna
              </button>
            </form>

            {activeLead ? (
              <form onSubmit={handleCreateLeadNote} className="mt-4 space-y-3 border-t border-[var(--cliente-border)] pt-4">
                <textarea
                  value={leadNoteText}
                  onChange={(event) => setLeadNoteText(event.target.value)}
                  placeholder="Registrar nota comercial no perfil do contato"
                  disabled={!canOperate}
                  rows={3}
                  className="client-input w-full rounded-2xl border px-3 py-3 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
                <button
                  type="submit"
                  disabled={!canOperate || savingLeadNote || !leadNoteText.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-2.5 text-sm font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
                >
                  {savingLeadNote ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <NotebookPen className="h-4 w-4" />
                  )}
                  Salvar nota do contato
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
            subtitle="Anotacoes persistidas no CRM do contato"
            notes={leadNotes}
            emptyLabel="Nenhuma nota comercial registrada para o contato."
          />

          <PanelCard className="p-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle title="Historico recente" subtitle="Eventos do contato conectados a esta conversa" />
              <StateBadge label={`${timeline.length}`} tone="neutral" />
            </div>

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
          </PanelCard>
        </div>
        ) : (
          <PanelCard className="p-4">
              <CardTitle title="Painel lateral oculto" subtitle="No modo essencial mostramos apenas lista de conversas e chat." />
            <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">
              Para ver resumo do contato, comercial conectado, tarefas, notas e historico no inbox, ative o modo completo.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExperienceMode("completo")}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--cliente-accent)] transition hover:brightness-95"
              >
                Ativar modo completo
              </button>
              {activeLead?.id ? (
                <Link
                  href={`/cliente/painel/crm?leadId=${encodeURIComponent(activeLead.id)}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
                >
                  Abrir CRM do contato
                </Link>
              ) : null}
            </div>
          </PanelCard>
        )}
      </section>
    </div>
  );
}

