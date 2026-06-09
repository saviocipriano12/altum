"use client";

import Link from "next/link";
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  Bot,
  Check,
  CheckCheck,
  Download,
  ExternalLink,
  CheckCircle2,
  Clock3,
  Copy,
  CircleDashed,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  MessageCircle,
  Mic,
  MoreVertical,
  NotebookPen,
  Paperclip,
  PanelRightOpen,
  PauseCircle,
  PhoneCall,
  PlayCircle,
  RefreshCw,
  Receipt,
  Reply,
  Search,
  Send,
  SlidersHorizontal,
  SmilePlus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { useClienteShell } from "@/app/cliente/painel/components/cliente-shell";
import { useAdaptivePolling } from "@/app/cliente/painel/hooks/use-adaptive-polling";
import {
  CardTitle,
  EmptyState,
  PanelCard,
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
  leadHeat?: string;
  leadTemperature?: string;
  leadNextAction?: string;
  leadPriority?: string;
  leadStage?: string;
  unreadCount?: number;
  aiState?: ChatAiState;
};

type MessageItem = {
  id: string;
  text?: string;
  sender?: "agent" | "client" | "system" | "bot";
  senderName?: string | null;
  status?: string | null;
  deliveryStatus?: string | null;
  deliveryError?: string | null;
  deliveryAt?: unknown;
  deliveryUpdatedAt?: unknown;
  createdAt?: unknown;
  type?: string;
  replyToId?: string | null;
  reactions?: Record<string, string[]>;
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

type LeadCommercialDossier = {
  id?: string;
  title?: string;
  status?: string;
  trigger?: string;
  triggerLabel?: string;
  leadName?: string | null;
  company?: string | null;
  source?: string | null;
  score?: number | null;
  temperature?: string | null;
  objective?: string | null;
  recommendedOffer?: string | null;
  nextAction?: string | null;
  summary?: string;
  sellerBrief?: string;
  painPoints?: string[];
  objections?: string[];
  talkingPoints?: string[];
  questionsToAsk?: string[];
  recentConversation?: string[];
  markdown?: string;
  sourceChatId?: string | null;
  appointmentId?: string | null;
  updatedByName?: string | null;
  updatedAt?: unknown;
};

type LeadDocument = {
  id: string;
  type?: string;
  title?: string;
  status?: string;
  triggerLabel?: string;
  appointmentId?: string | null;
  sourceChatId?: string | null;
  summary?: string | Record<string, unknown>;
  sellerBrief?: string;
  markdown?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type LeadSummary = {
  id: string;
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  origem?: string;
  channel?: string;
  sourceLabel?: string;
  campaignName?: string;
  campaignId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  gclid?: string;
  fbclid?: string;
  first_touch?: Record<string, unknown>;
  last_touch?: Record<string, unknown>;
  attribution?: Record<string, unknown>;
  customFields?: Record<string, string | number | boolean | null>;
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
  aiConversationStage?: string;
  aiNextAction?: string;
  aiRecommendedOffer?: string;
  aiResponseGoal?: string;
  aiCommercialTemperature?: string;
  aiLeadSummary?: string;
  aiPlannerConfidence?: number | null;
  commercialDossier?: LeadCommercialDossier | null;
  commercialDossierUpdatedAt?: unknown;
  documents?: LeadDocument[];
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
const QUICK_EMOJIS = ["👍", "🙏", "😊", "🔥", "✅", "🤝", "💚", "👏", "🚀", "😉", "📌", "💬"];
const QUICK_REACTION_EMOJIS = ["\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F64F}"];
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

const CONTACT_AVATAR_THEMES = [
  { bg: "linear-gradient(135deg,#d9fdd3,#a7f3d0)", text: "#075e54", ring: "rgba(0,166,106,0.22)" },
  { bg: "linear-gradient(135deg,#dbeafe,#bfdbfe)", text: "#1d4ed8", ring: "rgba(37,99,235,0.2)" },
  { bg: "linear-gradient(135deg,#ede9fe,#ddd6fe)", text: "#6d28d9", ring: "rgba(109,40,217,0.18)" },
  { bg: "linear-gradient(135deg,#fee2e2,#fecaca)", text: "#b91c1c", ring: "rgba(185,28,28,0.16)" },
  { bg: "linear-gradient(135deg,#ffedd5,#fed7aa)", text: "#c2410c", ring: "rgba(194,65,12,0.16)" },
  { bg: "linear-gradient(135deg,#ccfbf1,#99f6e4)", text: "#0f766e", ring: "rgba(15,118,110,0.18)" },
];

function getAvatarTheme(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return CONTACT_AVATAR_THEMES[hash % CONTACT_AVATAR_THEMES.length];
}

function getPhoneTail(value?: string) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 2 ? digits.slice(-2) : "";
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
  const seed = displayName || phone || "Contato";
  const theme = getAvatarTheme(seed);
  const fallbackInitials = isPhoneLike(displayName || phone) ? "" : getInitials(displayName || phone);
  const fallbackLabel = fallbackInitials || getPhoneTail(phone || displayName);

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
      style={
        {
          "--avatar-bg": theme.bg,
          "--avatar-text": theme.text,
          "--avatar-ring": theme.ring,
        } as CSSProperties
      }
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-white bg-[var(--avatar-bg)] font-black text-[var(--avatar-text)] shadow-[0_0_0_1px_var(--avatar-ring),0_8px_18px_-13px_rgba(15,23,42,0.55)]",
        dimension
      )}
    >
      {fallbackLabel || <UserRound className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />}
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

function cleanInboxText(value: unknown, max = 180) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function formatLeadDocumentType(value?: string) {
  const normalized = cleanInboxText(value, 80).toLowerCase();
  const labels: Record<string, string> = {
    commercial_dossier: "Dossie comercial",
    assisted_meeting: "Reuniao assistida",
    meeting_summary: "Resumo de reuniao",
    lead_summary: "Resumo do lead",
  };
  return labels[normalized] || cleanInboxText(value, 80) || "Documento IA";
}

function getLeadDocumentTitle(document: LeadDocument) {
  return cleanInboxText(document.title, 120) || formatLeadDocumentType(document.type || document.id);
}

function getLeadDocumentSummary(document: LeadDocument) {
  if (typeof document.summary === "string") return cleanInboxText(document.summary, 240);
  if (document.summary && typeof document.summary === "object") {
    const summary = document.summary as Record<string, unknown>;
    return (
      cleanInboxText(summary.executiveSummary, 240) ||
      cleanInboxText(summary.summary, 240) ||
      cleanInboxText(summary.nextStep, 240) ||
      cleanInboxText(summary.recommendedStage, 240)
    );
  }
  return (
    cleanInboxText(document.sellerBrief, 240) ||
    cleanInboxText(String(document.markdown || "").replace(/[#*_`>|-]/g, " "), 240) ||
    "Documento salvo pela IA para orientar o atendimento."
  );
}

function getLeadDocumentBody(document: LeadDocument) {
  return cleanInboxText(document.markdown, 5000) || getLeadDocumentSummary(document);
}

function readInboxRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveInboxAttribution(lead?: LeadSummary | null) {
  const attribution = readInboxRecord(lead?.attribution);
  const firstTouch = readInboxRecord(lead?.first_touch || attribution.firstTouch);
  const lastTouch = readInboxRecord(lead?.last_touch || attribution.lastTouch);
  const customFields = readInboxRecord(lead?.customFields);
  const source =
    cleanInboxText(lead?.sourceLabel) ||
    cleanInboxText(lead?.origem) ||
    cleanInboxText(lead?.utmSource || attribution.source || lastTouch.source || firstTouch.source) ||
    cleanInboxText(lead?.channel);
  const campaign =
    cleanInboxText(lead?.campaignName) ||
    cleanInboxText(lead?.utmCampaign || attribution.campaign || lastTouch.campaign || firstTouch.campaign) ||
    cleanInboxText(customFields.campaign || customFields.utm_campaign);
  const medium = cleanInboxText(lead?.utmMedium || attribution.medium || lastTouch.medium || firstTouch.medium);
  const clickId =
    cleanInboxText(lead?.gclid || attribution.gclid || lastTouch.gclid || firstTouch.gclid) ||
    cleanInboxText(lead?.fbclid || attribution.fbclid || lastTouch.fbclid || firstTouch.fbclid);

  return {
    source: source || "Nao registrado",
    campaign: campaign || "Sem campanha",
    medium: medium || "Nao registrado",
    clickId: clickId ? "Registrado" : "Nao registrado",
  };
}

function resolveAiEvidence(lead?: LeadSummary | null) {
  const evidence = lead?.aiFieldEvidence || {};
  const getValue = (keys: string[]) => {
    for (const key of keys) {
      const value = cleanInboxText(evidence[key]?.value, 160);
      if (value) return value;
    }
    return "Nao capturado";
  };

  return [
    { label: "Interesse", value: getValue(["serviceInterest", "activeTopic", "primaryGoal"]) },
    { label: "Urgencia", value: getValue(["urgency"]) },
    { label: "Orcamento", value: getValue(["budgetBand"]) },
    { label: "Decisor", value: getValue(["decisionMaker"]) },
  ];
}

function formatAiAction(value?: string | null) {
  const clean = cleanInboxText(value, 120);
  if (!clean) return "Sem acao sugerida";
  const labels: Record<string, string> = {
    assumir_handoff_humano: "Humano deve assumir",
    qualificar_contexto_minimo: "Qualificar melhor",
    aprofundar_oportunidade: "Aprofundar oportunidade",
    tratar_objecao_suave: "Tratar objecao",
    preparar_proposta_comercial: "Preparar proposta",
    agendar_proximo_passo: "Agendar proximo passo",
    conduzir_para_proximo_passo: "Conduzir proximo passo",
  };
  return labels[clean] || clean.replaceAll("_", " ");
}

function getTemperatureTone(value?: string | null) {
  const normalized = cleanInboxText(value, 40).toLowerCase();
  if (normalized === "hot") return "danger" as const;
  if (normalized === "warm") return "warning" as const;
  if (normalized === "cold") return "neutral" as const;
  return "info" as const;
}

function formatTemperature(value?: string | null) {
  const normalized = cleanInboxText(value, 40).toLowerCase();
  if (normalized === "hot") return "quente";
  if (normalized === "warm") return "morno";
  if (normalized === "cold") return "frio";
  return "em leitura";
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
  if (filter === "ai_active") return "Assistente ativo";
  if (filter === "ai_paused") return "Assistente pausado";
  if (filter === "human_owned") return "Com atendimento humano";
  return "Assistente + humano";
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

function buildWhatsAppUrl(phone?: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  return (
    [
      "audio/ogg;codecs=opus",
      "audio/ogg; codecs=opus",
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || ""
  );
}

function audioExtensionForMime(type: string) {
  const clean = String(type || "").toLowerCase();
  if (clean.includes("ogg")) return "ogg";
  if (clean.includes("mp4") || clean.includes("m4a")) return "m4a";
  return "webm";
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

function normalizeReactionMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([emoji, users]) => [
        emoji,
        Array.isArray(users)
          ? users.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 100)
          : [],
      ])
      .filter(([emoji, users]) => String(emoji).trim() && (users as string[]).length > 0)
  );
}

function getMessageActorLabel(message: MessageItem) {
  if (message.sender === "agent") return message.senderName || "Time";
  if (message.sender === "system") return "Sistema";
  return "Contato";
}

function getReplyPreviewLabel(message: MessageItem) {
  const type = String(message.type || "text").toLowerCase();
  if (type === "image") return "Imagem";
  if (type === "audio") return "Audio";
  if (type === "video") return "Video";
  if (type === "document") return message.mediaName || "Documento";
  if (type === "template") return "Template";
  return getMessagePreview(message);
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
    return `Assistente pausado${updatedByName ? ` por ${updatedByName}` : ""}${suffix}.`;
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
    return "Assistente ativo, mas a ultima escalada nao conseguiu notificar humano por falta de canal WhatsApp ativo.";
  }
  if (handoffNotifyStatus === "skipped_no_recipients") {
    return "Assistente ativo, mas a ultima escalada nao conseguiu notificar humano por falta de telefone de responsavel.";
  }
  if (handoffNotifyStatus === "skipped_disabled") {
    return "Assistente ativo, mas a notificacao de escalada esta desativada nas configuracoes.";
  }
  if (handoffNotifyStatus === "partial_failure" || handoffNotifyStatus === "failed") {
    return "Assistente ativo, mas o ultimo alerta de escalada teve falha de entrega para parte do time.";
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

type MobileLeadTag = {
  label: string;
  tone: "hot" | "warm" | "cold" | "human" | "reply" | "risk" | "neutral";
};

function normalizeLeadTemperatureLabel(value?: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["hot", "quente", "alta", "high"].includes(normalized)) return "Quente";
  if (["warm", "morno", "media", "medium"].includes(normalized)) return "Morno";
  if (["cold", "frio", "baixa", "low"].includes(normalized)) return "Frio";
  return "";
}

function getMobileLeadTags(chat: ChatItem, responseState: ReturnType<typeof getConversationResponseState>, sla: ReturnType<typeof getSlaState>) {
  const tags: MobileLeadTag[] = [];
  const temperature = normalizeLeadTemperatureLabel(chat.leadTemperature || chat.leadHeat);
  const priority = String(chat.leadPriority || chat.priority || "").trim().toLowerCase();
  const nextAction = String(chat.leadNextAction || "").trim().toLowerCase();

  if (chat.aiState?.humanOwnerUserId || nextAction.includes("humano") || nextAction.includes("handoff")) {
    tags.push({ label: "Humano", tone: "human" });
  }

  if (responseState.label === "Precisa de resposta") {
    tags.push({ label: "Responder", tone: "reply" });
  } else if (responseState.label === "Aguardando cliente") {
    tags.push({ label: "Aguardando", tone: "neutral" });
  }

  if (temperature) {
    tags.push({
      label: temperature,
      tone: temperature === "Quente" ? "hot" : temperature === "Morno" ? "warm" : "cold",
    });
  } else if (priority === "high") {
    tags.push({ label: "Urgente", tone: "risk" });
  }

  if (sla.breached) {
    tags.push({ label: "Atrasado", tone: "risk" });
  }

  return tags.slice(0, 3);
}

function MobileLeadTagPill({ tag }: { tag: MobileLeadTag }) {
  const toneClass = {
    hot: "bg-[#ffe1df] text-[#b42318]",
    warm: "bg-[#fff3c4] text-[#a15c07]",
    cold: "bg-[#dbeafe] text-[#1d4ed8]",
    human: "bg-[#ede9fe] text-[#6d28d9]",
    reply: "bg-[#d9fdd3] text-[#147d45]",
    risk: "bg-[#ffe4c7] text-[#c2410c]",
    neutral: "bg-[#eef2f6] text-[#54656f]",
  }[tag.tone];

  return (
    <span className={cn("inbox-mobile-lead-tag inline-flex h-5 max-w-[6.8rem] items-center rounded-full px-2 text-[10px] font-bold leading-none", toneClass)}>
      <span className="truncate">{tag.label}</span>
    </span>
  );
}

function InboxHero({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-[color:color-mix(in_srgb,var(--cliente-success)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-success)_13%,var(--cliente-card)),var(--cliente-card)_52%,color-mix(in_srgb,var(--cliente-primary)_9%,var(--cliente-card)))] shadow-[var(--cliente-shadow-soft)]">
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StateBadge label="Engajamento" tone="success" />
            <StateBadge label="Assistente + humano" tone="ai" />
          </div>
          <h1 className="max-w-4xl text-2xl font-extrabold leading-tight text-[var(--cliente-card-text)] md:text-[2rem]">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[var(--cliente-card-text-soft)]">
            {subtitle}
          </p>
        </div>
        {action ? <div className="flex flex-wrap justify-start gap-2 lg:justify-end">{action}</div> : null}
      </div>
    </section>
  );
}

function InboxMetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Bot;
  tone: "success" | "warning" | "danger" | "info" | "ai";
}) {
  const toneClass = {
    success: "border-[color:color-mix(in_srgb,var(--cliente-success)_18%,transparent)] bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]",
    warning: "border-[color:color-mix(in_srgb,var(--cliente-warning)_18%,transparent)] bg-[var(--cliente-warning-soft)] text-[var(--cliente-warning)]",
    danger: "border-[color:color-mix(in_srgb,var(--cliente-danger)_18%,transparent)] bg-[var(--cliente-danger-soft)] text-[var(--cliente-danger)]",
    info: "border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,transparent)] bg-[var(--cliente-primary-soft)] text-[var(--cliente-primary)]",
    ai: "border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,transparent)] bg-[var(--cliente-ai-soft)] text-[var(--cliente-ai)]",
  }[tone];

  return (
    <PanelCard className="min-h-[122px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-3 text-2xl font-black text-[var(--cliente-card-text)]">{value}</p>
          <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{detail}</p>
        </div>
        <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] border ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </PanelCard>
  );
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
  const mobileLeadTags = getMobileLeadTags(chat, responseState, sla);
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
              {mobileLeadTags.length ? (
                <div className="inbox-mobile-lead-tags mt-1.5 hidden min-w-0 items-center gap-1.5 overflow-hidden">
                  {mobileLeadTags.map((tag) => (
                    <MobileLeadTagPill key={`${tag.tone}-${tag.label}`} tag={tag} />
                  ))}
                </div>
              ) : null}
              <div className="inbox-conversation-owner mt-1 flex items-center gap-2 text-[11px] text-[var(--cliente-card-text-soft)]">
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

          <div className="inbox-conversation-badges mt-2 flex flex-wrap items-center gap-2">
            <StateBadge label={responseState.label} tone={responseState.tone} />
            {sla.breached ? <StateBadge label={sla.label} tone="danger" /> : null}
            {aiPaused ? <StateBadge label="Assistente pausado" tone="warning" /> : null}
          </div>

          <div className="inbox-conversation-footer mt-3 flex items-center justify-between gap-3 text-[11px] text-[var(--cliente-card-text-soft)]">
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

function VideoAttachment({ message }: { message: MessageItem }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const mediaUrl = buildMessageMediaUrl(message);
  const unavailableReason = getMessageMediaUnavailableReason(message);

  useEffect(() => {
    setVideoFailed(false);
  }, [mediaUrl]);

  if (!mediaUrl || message.mediaStatus === "missing" || videoFailed) {
    return (
      <MessageMediaFallback
        type="video"
        reason={videoFailed ? "Nao foi possivel carregar o video protegido." : unavailableReason}
      />
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]">
      <video
        src={mediaUrl}
        controls
        preload="metadata"
        className="max-h-[420px] w-full bg-black object-contain"
        onError={() => setVideoFailed(true)}
      />
      <div className="border-t border-[var(--cliente-border)] px-3 py-2 text-[11px] text-[var(--cliente-card-text-soft)]">
        {[message.mediaName || "Video", formatFileSize(message.mediaSize)].filter(Boolean).join(" / ")}
      </div>
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
  replied,
  onReply,
  onCopy,
  onReact,
  canOperate,
}: {
  message: MessageItem;
  replied?: MessageItem | null;
  onReply?: () => void;
  onCopy?: () => void;
  onReact?: (emoji: string) => void;
  canOperate?: boolean;
}) {
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const isAgent = message.sender === "agent";
  const isSystem = message.sender === "system";
  const type = String(message.type || "text").toLowerCase();
  const outboundStatus = String(message.deliveryStatus || message.status || "").toLowerCase();
  const preview = getMessagePreview(message);
  const shouldRenderText = !["image", "audio", "document", "video"].includes(type) || !isGeneratedMediaPlaceholder(type, preview);
  const reactions = normalizeReactionMap(message.reactions);
  const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

  const mediaLabel =
    type === "audio"
      ? "Audio"
      : type === "image"
        ? "Imagem"
        : type === "video"
          ? "Video"
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
        : type === "video"
          ? ImageIcon
        : type === "document"
          ? FileText
          : type === "template"
          ? Receipt
          : null;

  if (isSystem) {
    return (
      <div className="flex justify-center px-3 py-1">
        <div className="max-w-[88%] rounded-full bg-white/80 px-3 py-1 text-center text-[11px] font-semibold text-[#667781] shadow-[0_1px_0.5px_rgba(11,20,26,0.08)]">
          {preview}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("group flex items-end gap-2", isAgent ? "justify-end" : "justify-start")}>
      <div className={cn("relative flex max-w-[92%] flex-col sm:max-w-[84%] xl:max-w-[74%] 2xl:max-w-[70%]", isAgent ? "items-end" : "items-start")}>
        {canOperate ? (
          <div
            className={cn(
              "absolute top-0 z-20 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100",
              isAgent ? "right-full mr-1.5" : "left-full ml-1.5"
            )}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setReactionPickerOpen((current) => !current)}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-white text-[#667781] shadow-sm transition hover:bg-[#f0f2f5]"
                aria-label="Reagir a mensagem"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              {reactionPickerOpen ? (
                <div
                  className={cn(
                    "absolute top-9 z-30 flex gap-1 rounded-2xl border border-[var(--cliente-border)] bg-white p-1.5 shadow-[0_16px_34px_-20px_rgba(15,23,42,0.6)]",
                    isAgent ? "right-0" : "left-0"
                  )}
                >
                  {QUICK_REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        onReact?.(emoji);
                        setReactionPickerOpen(false);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-xl text-lg transition hover:bg-[#f0f2f5]"
                      aria-label={`Reagir com ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onReply}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-white text-[#667781] shadow-sm transition hover:bg-[#f0f2f5]"
              aria-label="Responder mensagem"
            >
              <Reply className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="hidden h-8 w-8 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-white text-[#667781] shadow-sm transition hover:bg-[#f0f2f5] sm:flex"
              aria-label="Copiar mensagem"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div
          className={cn(
            "min-w-0 border px-3.5 py-2.5 text-sm shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
            isAgent
              ? "inbox-message-out rounded-[18px] rounded-br-[5px]"
              : "inbox-message-in rounded-[18px] rounded-bl-[5px]"
          )}
        >
          {(mediaLabel && MediaIcon) || replied ? (
            <div className="mb-2 space-y-2">
              {replied ? (
                <div className="rounded-xl border-l-4 border-[#25D366] bg-black/5 px-3 py-2">
                  <p className="text-[11px] font-bold text-[#128C7E]">{getMessageActorLabel(replied)}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-current opacity-65">{getReplyPreviewLabel(replied)}</p>
                </div>
              ) : null}
              {mediaLabel && MediaIcon ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-1 text-[11px] font-semibold text-current opacity-65">
                  <MediaIcon className="h-3.5 w-3.5" />
                  {mediaLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          {type === "image" ? <ImageAttachment message={message} /> : null}
          {type === "video" ? <VideoAttachment message={message} /> : null}
          {type === "audio" ? <AudioAttachment message={message} /> : null}
          {type === "document" ? <DocumentAttachment message={message} /> : null}
          {shouldRenderText ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-current">
              {preview}
            </p>
          ) : null}
          {isAgent && outboundStatus === "failed" && message.deliveryError ? (
            <p className="mt-2 text-xs text-[var(--cliente-danger)]">Falha de entrega: {humanizeDeliveryError(message.deliveryError)}</p>
          ) : null}
          <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[10px] text-current opacity-55">
            <span>{formatTime(message.createdAt)}</span>
            {isAgent ? (
              outboundStatus === "failed" ? (
                <AlertCircle className="h-3.5 w-3.5 text-[var(--cliente-danger)]" />
              ) : outboundStatus === "read" ? (
                <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />
              ) : outboundStatus === "delivered" ? (
                <CheckCheck className="h-3.5 w-3.5" />
              ) : outboundStatus === "sent" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Clock3 className="h-3.5 w-3.5" />
              )
            ) : null}
          </div>
        </div>
        {reactionEntries.length ? (
          <div
            className={cn(
              "-mt-1 flex flex-wrap gap-1 rounded-full border border-[var(--cliente-border)] bg-white px-1.5 py-0.5 text-xs shadow-sm",
              isAgent ? "mr-2" : "ml-2"
            )}
          >
            {reactionEntries.map(([emoji, users]) => (
              <span key={emoji} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5">
                <span>{emoji}</span>
                {users.length > 1 ? <span className="text-[10px] font-semibold text-[#667781]">{users.length}</span> : null}
              </span>
            ))}
          </div>
        ) : null}
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [updatingAi, setUpdatingAi] = useState(false);
  const [retryingAi, setRetryingAi] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [uploadingContactPhoto, setUploadingContactPhoto] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingLeadNote, setSavingLeadNote] = useState(false);
  const [savingLeadTask, setSavingLeadTask] = useState(false);
  const [savingLeadStage, setSavingLeadStage] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [distributing, setDistributing] = useState(false);
  const [loadingAiSettings, setLoadingAiSettings] = useState(false);
  const [updatingGlobalAi, setUpdatingGlobalAi] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [deletingChats, setDeletingChats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chats, setChats] = useState<ChatItem[]>([]);
  const [tenantChannels, setTenantChannels] = useState<TenantChannelItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [detail, setDetail] = useState<ChatDetailPayload | null>(null);
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState("");
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
    photoUrl: "",
  });
  const [leadStage, setLeadStage] = useState(DEFAULT_PIPELINE_STAGES[0].id);
  const [leadTaskTitle, setLeadTaskTitle] = useState("");
  const [leadTaskDueAt, setLeadTaskDueAt] = useState("");
  const [leadTaskPriority, setLeadTaskPriority] = useState<(typeof TASK_PRIORITIES)[number]>("medium");
  const [leadTaskType, setLeadTaskType] = useState<(typeof TASK_TYPES)[number]>("follow_up");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDetailsDrawer, setShowDetailsDrawer] = useState(false);
  const [globalAiResponsePaused, setGlobalAiResponsePaused] = useState(false);

  const initialChatId = searchParams.get("chatId");
  const leadIdFromQuery = searchParams.get("leadId");
  const statusFromQuery = searchParams.get("status");
  const priorityFromQuery = searchParams.get("priority");
  const queueFromQuery = searchParams.get("queue");
  const aiFromQuery = searchParams.get("ai");
  const channelFromQuery = searchParams.get("channel");
  const assignedUserFromQuery = searchParams.get("assignedUser");
  const canOperate = hasCapability("respond_inbox");
  const canManageAi = hasCapability("manage_ai");
  const canManageQueue = hasCapability("manage_settings") || hasCapability("manage_users");
  const allowAdvanced = experienceMode === "completo";
  const showContextPanel = Boolean(selectedChatId);
  const showDesktopContextPanel = Boolean(selectedChatId);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  useEffect(() => {
    if (!allowAdvanced) {
      setShowAdvancedFilters(false);
    }
  }, [allowAdvanced]);

  useEffect(() => {
    if (!selectedChatId) {
      setShowDetailsDrawer(false);
    }
    setReplyTo(null);
  }, [selectedChatId]);

  function toggleChatSelection(chatId: string) {
    setSelectedChatIds((current) =>
      current.includes(chatId) ? current.filter((id) => id !== chatId) : [...current, chatId]
    );
  }

  async function deleteChats(ids: string[]) {
    if (!tenant?.tenantId || !ids.length || !canOperate) return;
    if (!window.confirm(`Apagar definitivamente ${ids.length} conversa(s) e todas as mensagens?`)) return;
    setDeletingChats(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const payload = (await res.json().catch(() => ({}))) as { deleted?: number; error?: string };
      if (!res.ok) throw new Error(payload.error || "Falha ao apagar conversas.");
      setSelectedChatIds([]);
      setSelectionMode(false);
      if (selectedChatId && ids.includes(selectedChatId)) {
        setSelectedChatId(null);
        setDetail(null);
        setMessages([]);
      }
      await loadChats();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao apagar conversas.");
    } finally {
      setDeletingChats(false);
    }
  }

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

  const loadTenantAiSettings = useCallback(async () => {
    if (!tenant?.tenantId) return;
    setLoadingAiSettings(true);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`);
      const payload = (await res.json().catch(() => ({}))) as {
        ai?: { responsePaused?: boolean };
      };
      if (!res.ok) return;
      setGlobalAiResponsePaused(payload.ai?.responsePaused === true);
    } catch {
      setGlobalAiResponsePaused(false);
    } finally {
      setLoadingAiSettings(false);
    }
  }, [tenant?.tenantId]);

  async function handleToggleGlobalAiResponses() {
    if (!tenant?.tenantId || !canManageAi) return;

    const nextPaused = !globalAiResponsePaused;
    setUpdatingGlobalAi(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/settings/ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsePaused: nextPaused }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        ai?: { responsePaused?: boolean };
      };
      if (!res.ok) {
        setError(payload.error || "Falha ao alterar respostas automaticas da IA.");
        return;
      }
      setGlobalAiResponsePaused(payload.ai?.responsePaused === true);
      await loadChats({ silent: true });
    } catch {
      setError("Falha ao alterar respostas automaticas da IA.");
    } finally {
      setUpdatingGlobalAi(false);
    }
  }

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
          photoUrl: detailPayload.chat.contactPhotoUrl || "",
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
    void loadTenantAiSettings();
  }, [loadChats, loadTenantChannels, loadTenantAiSettings]);

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
  const activeChannel = String(activeChat?.channel || "whatsapp").trim().toLowerCase();
  const canSendMediaInChat = activeChannel === "whatsapp" && !whatsappWindowClosed;
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

  function clearMediaSelection() {
    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaPreviewUrl("");
    setMediaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelected(file: File | null) {
    clearMediaSelection();
    if (!file) return;
    setMediaFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setMediaPreviewUrl(URL.createObjectURL(file));
    }
  }

  function appendEmoji(emoji: string) {
    setMessageText((current) => `${current}${emoji}`);
    setEmojiOpen(false);
  }

  async function startAudioRecording() {
    if (!canOperate || !selectedChatId || recordingAudio || !canSendMediaInChat) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Gravacao de audio nao esta disponivel neste navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecordingAudio(false);
        if (blob.size <= 0) return;
        const extension = audioExtensionForMime(blob.type || recorder.mimeType);
        const file = new File([blob], `audio-${Date.now()}.${extension}`, { type: blob.type || "audio/webm" });
        void sendMediaFile(file, "");
      };

      recorder.start();
      setRecordingAudio(true);
      setError(null);
    } catch {
      setRecordingAudio(false);
      setError("Nao foi possivel acessar o microfone.");
    }
  }

  function stopAudioRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }

  function cancelAudioRecording() {
    const recorder = mediaRecorderRef.current;
    audioChunksRef.current = [];
    if (recorder && recorder.state !== "inactive") {
      recorder.stream.getTracks().forEach((track) => track.stop());
      recorder.onstop = null;
      recorder.stop();
    }
    mediaRecorderRef.current = null;
    setRecordingAudio(false);
  }

  async function handleCopyMessage(message: MessageItem) {
    const text = getMessagePreview(message);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Nao foi possivel copiar a mensagem.");
    }
  }

  async function handleCopyLeadDocument(document: LeadDocument) {
    try {
      await navigator.clipboard.writeText(getLeadDocumentBody(document));
    } catch {
      setError("Nao foi possivel copiar o documento.");
    }
  }

  async function handleReactToMessage(messageId: string, emoji: string) {
    if (!tenant?.tenantId || !selectedChatId || !canOperate) return;
    setError(null);
    try {
      const res = await authedFetch(
        `/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/messages/${messageId}/reaction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        }
      );
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao reagir a mensagem.");
        return;
      }
      await refreshSelected(true);
    } catch {
      setError("Falha ao reagir a mensagem.");
    }
  }

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
        body: JSON.stringify({ text: messageText.trim(), replyToId: replyTo?.id || null }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar mensagem.");
        return;
      }

      setMessageText("");
      setReplyTo(null);
      await refreshSelected(true);
      scrollMessagesToBottom("smooth");
    } catch {
      setError("Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function sendMediaFile(file: File, caption: string) {
    if (!tenant?.tenantId || !selectedChatId || !file || !canOperate) return false;
    if (whatsappWindowClosed) {
      setError("A janela de 24h do WhatsApp encerrou. Para retomar, use um template aprovado.");
      return false;
    }

    setSendingMedia(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (caption.trim()) form.append("caption", caption.trim());
      if (replyTo?.id) form.append("replyToId", replyTo.id);

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/chats/${selectedChatId}/send-media`, {
        method: "POST",
        body: form,
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao enviar midia.");
        return false;
      }

      setMessageText("");
      setReplyTo(null);
      clearMediaSelection();
      await refreshSelected(true);
      scrollMessagesToBottom("smooth");
      return true;
    } catch {
      setError("Falha ao enviar midia.");
      return false;
    } finally {
      setSendingMedia(false);
    }
  }

  async function handleSendMedia(event: FormEvent) {
    event.preventDefault();
    if (!mediaFile) return;
    await sendMediaFile(mediaFile, messageText);
  }

  function handleComposerSubmit(event: FormEvent) {
    if (mediaFile) {
      void handleSendMedia(event);
      return;
    }
    void handleSend(event);
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
          photoUrl: metaForm.photoUrl.trim() || undefined,
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao atualizar operacao da conversa.");
        return;
      }

      const savedPhotoUrl = metaForm.photoUrl.trim();
      if (savedPhotoUrl) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === selectedChatId ? { ...chat, contactPhotoUrl: savedPhotoUrl } : chat
          )
        );
      }

      await refreshSelected(false);
    } catch {
      setError("Falha ao atualizar operacao da conversa.");
    } finally {
      setSavingMeta(false);
    }
  }

  async function handleContactPhotoUpload(file: File) {
    if (!tenant?.tenantId || !canOperate) return;
    setUploadingContactPhoto(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/contact-photo`, {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { photoUrl?: string; error?: string };
      if (!response.ok || !payload.photoUrl) {
        throw new Error(payload.error || "Falha ao subir foto.");
      }
      setMetaForm((current) => ({ ...current, photoUrl: payload.photoUrl || "" }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao subir foto.");
    } finally {
      setUploadingContactPhoto(false);
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
          photoUrl: metaForm.photoUrl.trim() || undefined,
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
      const payload = (await res.json()) as { error?: string; callUrl?: string; telUrl?: string; whatsappUrl?: string };
      if (!res.ok) {
        setError(payload.error || "Falha ao iniciar ligacao.");
        return;
      }

      const url = payload.callUrl || payload.whatsappUrl || payload.telUrl;
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
  const commercialDossier = activeLead?.commercialDossier || null;
  const leadDocuments = activeLead?.documents || [];
  const activeAttribution = useMemo(() => resolveInboxAttribution(activeLead), [activeLead]);
  const activeAiEvidence = useMemo(() => resolveAiEvidence(activeLead), [activeLead]);
  const activeSla = activeChat ? getSlaState(activeChat) : { breached: false, label: "sem prazo" };
  const activeResponseState = activeChat ? getConversationResponseState(activeChat) : { label: "Nova conversa", tone: "info" as const };
  const activeCallHref =
    buildWhatsAppUrl(activeLead?.telefone || activeChat?.contactPhone) ||
    buildTelUrl(activeLead?.telefone || activeChat?.contactPhone);
  const conversationsNeedingReply = chats.filter((chat) => getConversationResponseState(chat).label === "Precisa de resposta").length;
  const breachedConversations = chats.filter((chat) => getSlaState(chat).breached).length;
  const unassignedConversations = chats.filter((chat) => {
    const queue = String(chat.queueStatus || "").toLowerCase();
    return queue === "unassigned" || (!chat.assignedTo && !chat.ownerId);
  }).length;
  const aiPausedConversations = chats.filter((chat) => isAiPaused(chat)).length;
  const linkedLeadConversations = chats.filter((chat) => chat.leadId).length;

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

              <div className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_18%,var(--cliente-border))] bg-[var(--cliente-card)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-primary)]">Origem e campanha</p>
                    <p className="mt-2 truncate text-sm font-black text-[var(--cliente-card-text)]">{activeAttribution.campaign}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                      {activeAttribution.source} / {activeAttribution.medium}
                    </p>
                  </div>
                  <StateBadge label={activeAttribution.clickId === "Registrado" ? "click rastreado" : "sem click id"} tone={activeAttribution.clickId === "Registrado" ? "success" : "warning"} />
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-ai)]">O que a IA ja entendeu</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Use isso para responder sem repetir perguntas desnecessarias.</p>
                  </div>
                  <StateBadge label={activeLead.aiCaptureChecklist ? "qualificando" : "sem captura"} tone={activeLead.aiCaptureChecklist ? "ai" : "neutral"} />
                </div>

                <div className="mt-4 rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_16%,var(--cliente-border))] bg-[var(--cliente-card)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StateBadge label={formatTemperature(activeLead.aiCommercialTemperature)} tone={getTemperatureTone(activeLead.aiCommercialTemperature)} />
                    <StateBadge label={activeLead.aiResponseGoal || "sem objetivo"} tone="ai" />
                    {typeof activeLead.aiPlannerConfidence === "number" ? (
                      <StateBadge label={`${Math.round(activeLead.aiPlannerConfidence * 100)}% confianca`} tone={activeLead.aiPlannerConfidence >= 0.7 ? "success" : "warning"} />
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm font-black text-[var(--cliente-card-text)]">
                    {formatAiAction(activeLead.aiNextAction)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                    Oferta provavel: {activeLead.aiRecommendedOffer || "ainda nao definida"}
                  </p>
                  {activeLead.aiLeadSummary ? (
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                      {activeLead.aiLeadSummary}
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  {activeAiEvidence.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">{item.label}</p>
                      <p className="mt-1 truncate text-xs font-bold text-[var(--cliente-card-text)]">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {commercialDossier ? (
                <div className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-primary)_20%,var(--cliente-border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--cliente-primary)_10%,var(--cliente-card)),var(--cliente-card))] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-primary)]">
                        <FileText className="h-3.5 w-3.5" />
                        Brief comercial
                      </div>
                      <p className="mt-2 text-sm font-black text-[var(--cliente-card-text)]">
                        {commercialDossier.title || "Dossie pronto para o vendedor"}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                        {commercialDossier.sellerBrief || commercialDossier.summary || "A IA vai consolidar o roteiro quando houver handoff, reuniao, proposta ou venda."}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <StateBadge label={commercialDossier.triggerLabel || "atualizado"} tone="success" />
                      <span className="text-[10px] font-semibold text-[var(--cliente-card-text-soft)]">
                        {formatRelative(commercialDossier.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Oferta sugerida</p>
                      <p className="mt-1 text-xs font-bold text-[var(--cliente-card-text)]">
                        {commercialDossier.recommendedOffer || activeLead.aiRecommendedOffer || "Validar oferta na conversa"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Proximo passo</p>
                      <p className="mt-1 text-xs font-bold text-[var(--cliente-card-text)]">
                        {formatAiAction(commercialDossier.nextAction || activeLead.aiNextAction)}
                      </p>
                    </div>
                  </div>

                  {(commercialDossier.talkingPoints || []).length ? (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Roteiro recomendado</p>
                      <div className="mt-2 space-y-2">
                        {(commercialDossier.talkingPoints || []).slice(0, 3).map((item) => (
                          <p key={item} className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] px-3 py-2 text-xs leading-5 text-[var(--cliente-card-text)]">
                            {item}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Dores</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(commercialDossier.painPoints || []).slice(0, 4).map((item) => (
                          <StateBadge key={item} label={item} tone="warning" />
                        ))}
                        {!(commercialDossier.painPoints || []).length ? <StateBadge label="sem dores mapeadas" tone="neutral" /> : null}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-card-text-soft)]">Perguntas pendentes</p>
                      <div className="mt-2 space-y-1">
                        {(commercialDossier.questionsToAsk || []).slice(0, 3).map((item) => (
                          <p key={item} className="text-xs leading-5 text-[var(--cliente-card-text-soft)]">- {item}</p>
                        ))}
                        {!(commercialDossier.questionsToAsk || []).length ? (
                          <p className="text-xs text-[var(--cliente-card-text-soft)]">Nenhuma pergunta critica pendente.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {leadDocuments.length ? (
                <div className="mt-4 rounded-[20px] border border-[color:color-mix(in_srgb,var(--cliente-ai)_18%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--cliente-ai)]">
                        <FileText className="h-3.5 w-3.5" />
                        Documentos da IA
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                        Use resumos e reunioes salvas para responder com contexto.
                      </p>
                    </div>
                    <StateBadge label={String(leadDocuments.length)} tone="ai" />
                  </div>
                  <div className="mt-3 space-y-2">
                    {leadDocuments.slice(0, 3).map((document) => (
                      <div key={document.id} className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-[var(--cliente-card-text)]">{getLeadDocumentTitle(document)}</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cliente-card-text-muted)]">
                              {formatLeadDocumentType(document.type)} | {formatRelative(document.updatedAt || document.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleCopyLeadDocument(document)}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[var(--cliente-border)] text-[var(--cliente-card-text-soft)] transition hover:bg-[var(--cliente-panel-soft)] hover:text-[var(--cliente-card-text)]"
                            aria-label="Copiar documento da IA"
                            title="Copiar documento"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">
                          {getLeadDocumentSummary(document)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
            {aiPaused ? "Retomar assistente" : "Pausar assistente"}
          </button>
          {aiRetryAvailable ? (
            <button
              type="button"
              onClick={() => void handleRetryAi()}
              disabled={!selectedChat || retryingAi || updatingAi || !canOperate || aiPaused}
              className="inbox-thread-action inline-flex items-center gap-2 rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-50"
            >
              {retryingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reprocessar assistente
            </button>
          ) : null}
        </div>

        <div className="mt-4 rounded-[22px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Estado do assistente</p>
              <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">{aiStateDescription}</p>
            </div>
            <StateBadge
              label={activeChat?.aiState?.humanOwnerUserId ? "Atendimento humano" : aiPaused ? "Assistente pausado" : "Assistente ativo"}
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

            <label className="space-y-2 text-xs uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">
              <span>Foto real do contato</span>
              <div className="flex items-center gap-3">
                <ContactAvatar
                  name={activeLead?.nome || activeChat?.contactName}
                  phone={activeLead?.telefone || activeChat?.contactPhone}
                  photoUrl={metaForm.photoUrl || activeChat?.contactPhotoUrl}
                  size="md"
                />
                <input
                  value={metaForm.photoUrl}
                  onChange={(event) => setMetaForm((current) => ({ ...current, photoUrl: event.target.value }))}
                  disabled={!canOperate}
                  placeholder="https://..."
                  className="client-input min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
                <label
                  title="Enviar foto"
                  className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-primary)] transition hover:bg-[var(--cliente-surface-hover)]"
                >
                  {uploadingContactPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    disabled={!canOperate || uploadingContactPhoto}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleContactPhotoUpload(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>
              <span className="block text-[11px] normal-case leading-5 tracking-normal text-[var(--cliente-card-text-soft)]">
                Envie uma foto ou use uma URL publica. Instagram, Facebook, Google e CRM sao aproveitados quando entregam uma imagem.
              </span>
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
            subtitle="Anotacoes persistidas na ficha do contato"
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
      <div className="inbox-refined client-daily-page min-h-[100dvh] bg-white xl:min-h-0 xl:space-y-5 xl:bg-transparent">
        <div className="hidden xl:block">
          <InboxHero
            title="Atender para converter"
            subtitle="WhatsApp, Instagram e site entram na mesma mesa. A IA cuida do volume, o humano entra onde a venda precisa de criterio."
          />
        </div>
        <div className="flex min-h-[100dvh] flex-col xl:min-h-0">
          <div className="border-b border-[var(--cliente-border)] px-4 py-4 xl:hidden">
            <h1 className="text-[22px] font-bold tracking-normal text-[#111b21]">Conversas</h1>
            <p className="mt-1 text-sm text-[#667781]">Nenhuma conversa ainda</p>
          </div>
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              title="Nenhuma conversa encontrada"
              description="Quando novas mensagens chegarem no WhatsApp ou nos canais conectados, elas aparecerao aqui."
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-refined client-daily-page space-y-4">
      <div className="hidden xl:block">
        <InboxHero
          title="Atender para converter"
          subtitle="Quem espera resposta, onde a IA atua e qual conversa pode virar venda."
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
      </div>

      <div className="hidden gap-3 md:grid-cols-2 xl:grid xl:grid-cols-5">
        <InboxMetricCard
          label="Conversas ativas"
          value={String(chats.length)}
          detail={`${filteredChats.length} visiveis agora`}
          icon={PanelRightOpen}
          tone="info"
        />
        <InboxMetricCard
          label="Precisa resposta"
          value={String(conversationsNeedingReply)}
          detail={breachedConversations ? `${breachedConversations} fora do prazo` : "fila sob controle"}
          icon={Clock3}
          tone={conversationsNeedingReply ? "warning" : "success"}
        />
        <InboxMetricCard
          label="Sem responsavel"
          value={String(unassignedConversations)}
          detail="distribuir para nao perder lead"
          icon={UserRound}
          tone={unassignedConversations ? "warning" : "success"}
        />
        <InboxMetricCard
          label="Assistente pausado"
          value={String(aiPausedConversations)}
          detail="conversas em modo humano"
          icon={Bot}
          tone={aiPausedConversations ? "ai" : "success"}
        />
        <InboxMetricCard
          label="Com oportunidade"
          value={String(linkedLeadConversations)}
          detail="conectadas a oportunidades"
          icon={FolderKanban}
          tone="info"
        />
      </div>

      {error ? (
        <div className="inbox-notice inbox-notice-danger flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <section
        className={cn(
          "grid min-w-0 grid-cols-1 gap-0 xl:h-[calc(100vh-7rem)] xl:min-h-0 xl:grid-cols-[minmax(320px,370px)_minmax(0,1.7fr)] xl:gap-3",
          selectedChatId ? "min-h-0" : "min-h-[82vh]",
          showDesktopContextPanel
            ? "2xl:grid-cols-[minmax(320px,370px)_minmax(0,1.7fr)_minmax(320px,360px)]"
            : "2xl:grid-cols-[minmax(320px,370px)_minmax(0,1.8fr)]"
        )}
      >
        <PanelCard className={cn(
          "inbox-rail inbox-whatsapp-list min-h-0 min-w-0 flex-col overflow-hidden max-xl:min-h-[100dvh] max-xl:rounded-none max-xl:border-0 max-xl:shadow-none xl:sticky xl:top-4 xl:flex xl:max-h-[calc(100vh-8rem)]",
          selectedChatId ? "hidden" : "flex"
        )}>
          <div className="inbox-mobile-list-header border-b border-[var(--cliente-border)] p-3.5 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  href="/cliente/painel"
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)] sm:hidden"
                  aria-label="Voltar para Inicio"
                >
                  <ArrowLeft className="h-5 w-5" />
                  <span className="text-xs font-semibold">Inicio</span>
                </Link>
                <div className="min-w-0">
                  <h1 className="truncate text-[22px] font-bold tracking-normal text-[#111b21] sm:text-base sm:text-[var(--cliente-card-text)]">
                    Conversas
                  </h1>
                  <p className="mt-0.5 text-xs text-[#667781] sm:text-[var(--cliente-card-text-soft)]">
                    {filteredChats.length} conversas
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectionMode && selectedChatIds.length ? (
                  <button
                    type="button"
                    onClick={() => void deleteChats(selectedChatIds)}
                    disabled={deletingChats}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                    aria-label="Apagar conversas selecionadas"
                  >
                    {deletingChats ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {selectedChatIds.length}
                  </button>
                ) : null}
                {canOperate ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectionMode((current) => !current);
                      setSelectedChatIds([]);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-full px-3 text-xs font-bold text-[#54656f] transition hover:bg-[#f0f2f5]"
                  >
                    {selectionMode ? "Cancelar" : "Selecionar"}
                  </button>
                ) : null}
                {canManageAi ? (
                  <button
                    type="button"
                    onClick={() => void handleToggleGlobalAiResponses()}
                    disabled={updatingGlobalAi || loadingAiSettings}
                    className={cn(
                      "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold transition disabled:opacity-55",
                      globalAiResponsePaused
                        ? "bg-[#d9fdd3] text-[#147d45] hover:brightness-95"
                        : "bg-[#ede9fe] text-[#6d28d9] hover:brightness-95"
                    )}
                    aria-label={globalAiResponsePaused ? "Retomar IA em todas as conversas" : "Pausar IA em todas as conversas"}
                    title={globalAiResponsePaused ? "Retomar respostas automaticas. A auditoria continua ativa." : "Pausar respostas automaticas em todas as conversas. A auditoria continua ativa."}
                  >
                    {updatingGlobalAi || loadingAiSettings ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : globalAiResponsePaused ? (
                      <PlayCircle className="h-3.5 w-3.5" />
                    ) : (
                      <PauseCircle className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden min-[360px]:inline">{globalAiResponsePaused ? "Retomar IA" : "Pausar IA"}</span>
                    <span className="min-[360px]:hidden">IA</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] sm:hidden"
                  aria-label="Mostrar filtros"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
              </div>
              <div className="hidden sm:block">
                <CardTitle title="Conversas" subtitle={`${filteredChats.length} conversas visiveis`} />
              </div>
            </div>

            <div className="mt-3 space-y-3 sm:mt-4">
              <label className="client-input inbox-mobile-search flex items-center gap-2 rounded-full border px-3.5 py-3 text-sm text-[var(--cliente-card-text-muted)] sm:rounded-[20px]">
                <Search className="h-4 w-4 text-[var(--cliente-card-text-soft)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar"
                  className="w-full bg-transparent outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                />
              </label>

              <div className={cn(showAdvancedFilters ? "block" : "hidden", "sm:block")}>
                <ClientTabs
                  value={statusFilter}
                  onChange={(value) => setStatusFilter(value as StatusFilter)}
                  className="w-full"
                  items={STATUS_FILTERS.map((filter) => ({
                    value: filter,
                    label: formatStatusFilterLabel(filter),
                  }))}
                />
              </div>

              <div className={cn("grid-cols-3 gap-2", showAdvancedFilters ? "grid" : "hidden", "sm:grid")}>
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
                  className="hidden items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] sm:inline-flex"
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
          <div className="flex-1 overflow-x-hidden overflow-y-auto max-xl:pb-24">
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
                <div key={chat.id} className="relative">
                  {selectionMode ? (
                    <input
                      type="checkbox"
                      aria-label={`Selecionar conversa de ${chat.contactName || chat.contactPhone || "contato"}`}
                      checked={selectedChatIds.includes(chat.id)}
                      onChange={() => toggleChatSelection(chat.id)}
                      className="absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 accent-[#00a884]"
                    />
                  ) : null}
                  <div className={selectionMode ? "pl-9" : ""}>
                    <ConversationListItem
                      chat={chat}
                      active={chat.id === selectedChatId}
                      onSelect={() => selectionMode ? toggleChatSelection(chat.id) : setSelectedChatId(chat.id)}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelCard>

        <PanelCard className={cn(
          "inbox-thread-shell min-h-0 min-w-0 flex-col overflow-hidden max-xl:rounded-none max-xl:border-0 max-xl:shadow-none xl:flex",
          selectedChatId ? "flex h-[100dvh] xl:h-full" : "hidden"
        )}>
          <div className="inbox-thread-header inbox-chat-header border-b border-[var(--cliente-border)] p-2.5 sm:p-5">
            <div className="flex items-center justify-between gap-2 sm:items-start sm:gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-start sm:gap-3">
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
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2 sm:flex-wrap">
                    <h3 className="truncate text-[15px] font-semibold tracking-normal text-[var(--cliente-card-text)] sm:text-lg">
                      {activeChat?.contactName || activeChat?.contactPhone || "Contato sem nome"}
                    </h3>
                    <span className="hidden sm:inline-flex">
                      <StateBadge label={formatChannelLabel(activeChat?.channel)} tone="neutral" />
                    </span>
                    <span className="hidden sm:inline-flex">
                      <StateBadge label={activeResponseState.label} tone={activeResponseState.tone} />
                    </span>
                    {activeChat?.aiState?.humanOwnerUserId ? (
                      <span className="hidden sm:inline-flex">
                        <StateBadge label="Atendimento humano" tone="warning" />
                      </span>
                    ) : aiPaused ? (
                      <span className="hidden sm:inline-flex">
                        <StateBadge label="Assistente pausado" tone="warning" />
                      </span>
                    ) : null}
                  </div>
                  {activeLead ? (
                  <div className="mt-3 hidden flex-wrap items-center gap-3 sm:flex">
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
                  <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-[#667781] sm:mt-3 sm:flex-wrap sm:gap-2 sm:text-[var(--cliente-card-text-soft)]">
                    <span className="hidden sm:inline">
                      <span className="hidden sm:inline">Responsavel: </span>{activeChat?.assignedUserName || activeChat?.ownerName || "Sem atribuicao"}
                    </span>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden sm:inline">{formatQueueStatusLabel(activeChat?.queueStatus)}</span>
                    <span className="hidden sm:inline">|</span>
                    <span className="hidden sm:inline">{activeSla.label}</span>
                    <span className="hidden sm:inline">|</span>
                    <span className="truncate sm:hidden">{formatChannelLabel(activeChat?.channel)}</span>
                    <span className="hidden truncate sm:inline">Ultima atividade {formatRelative(activeChat?.lastMessageTime)}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 sm:flex-wrap sm:gap-2">
                {canOperate && !activeChat?.aiState?.humanOwnerUserId ? (
                  <button
                    type="button"
                    onClick={() => void handleTakeover()}
                    disabled={!selectedChat || updatingAi}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#25D366] px-3 text-xs font-bold text-[#07130C] transition hover:brightness-95 disabled:opacity-55 sm:px-3.5"
                    aria-label="Assumir esta conversa"
                    title="Assumir esta conversa e pausar respostas automaticas aqui"
                  >
                    {updatingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserRound className="h-3.5 w-3.5" />}
                    <span>Assumir</span>
                  </button>
                ) : activeChat?.aiState?.humanOwnerUserId ? (
                  <span className="hidden h-10 items-center rounded-full bg-[#d9fdd3] px-3 text-xs font-bold text-[#147d45] sm:inline-flex">
                    Humano
                  </span>
                ) : null}
                {activeCallHref ? (
                  <button
                    type="button"
                    onClick={() => void handleCreateCallTask()}
                    disabled={savingLeadTask || !canOperate}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-500/10 text-emerald-700 transition hover:bg-emerald-500/16 disabled:opacity-60 sm:w-auto sm:px-3 sm:py-2.5"
                    aria-label="Ligar"
                  >
                    {savingLeadTask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneCall className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Ligar</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowDetailsDrawer(true)}
                  disabled={!showContextPanel}
                  className="inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full border border-transparent bg-transparent text-[#54656f] transition hover:bg-black/5 disabled:opacity-50 sm:w-auto sm:border-[var(--cliente-border)] sm:bg-[var(--cliente-surface-muted)] sm:px-3 sm:text-xs sm:font-semibold sm:text-[var(--cliente-card-text-muted)] sm:hover:bg-[var(--cliente-panel-soft)] 2xl:hidden"
                  aria-label="Abrir opcoes da conversa"
                >
                  <MoreVertical className="h-5 w-5 sm:hidden" />
                  <SlidersHorizontal className="hidden h-3.5 w-3.5 sm:block" />
                  <span className="hidden sm:inline">Ver cliente</span>
                </button>
                <button
                  type="button"
                  onClick={() => void refreshSelected(true)}
                  className="hidden items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2.5 text-xs font-semibold text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] sm:inline-flex"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Atualizar
                </button>
                {canOperate && selectedChatId ? (
                  <button
                    type="button"
                    onClick={() => void deleteChats([selectedChatId])}
                    disabled={deletingChats}
                    className="hidden h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100 disabled:opacity-60 sm:inline-flex"
                    aria-label="Apagar conversa"
                    title="Apagar conversa definitivamente"
                  >
                    {deletingChats ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                ) : null}
              </div>
            </div>

            {activeLead ? (
              <div className="mt-4 hidden gap-2 sm:grid lg:grid-cols-3">
                <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-primary)_16%,var(--cliente-border))] bg-[var(--cliente-panel-soft)] px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-primary)]">Origem</p>
                  <p className="mt-1 truncate text-sm font-black text-[var(--cliente-card-text)]">{activeAttribution.campaign}</p>
                  <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{activeAttribution.source}</p>
                </div>
                <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-ai)_16%,var(--cliente-border))] bg-[var(--cliente-ai-soft)] px-3 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-ai)]">Proxima acao</p>
                    <StateBadge label={formatTemperature(activeLead.aiCommercialTemperature)} tone={getTemperatureTone(activeLead.aiCommercialTemperature)} />
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-[var(--cliente-card-text)]">{formatAiAction(activeLead.aiNextAction)}</p>
                  <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">{activeLead.aiResponseGoal || "sem objetivo da IA"}</p>
                </div>
                <div className="rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-success)_16%,var(--cliente-border))] bg-[var(--cliente-card)] px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cliente-success)]">Oferta provavel</p>
                  <p className="mt-1 truncate text-sm font-black text-[var(--cliente-card-text)]">{activeLead.aiRecommendedOffer || "Ainda nao definida"}</p>
                  <p className="mt-1 truncate text-xs text-[var(--cliente-card-text-soft)]">Use para responder sem perder o contexto comercial.</p>
                </div>
              </div>
            ) : null}

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
              <div className="py-10 text-center text-[#667781]">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="mx-auto mt-10 flex max-w-[16rem] flex-col items-center rounded-2xl bg-white/80 px-5 py-5 text-center shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                <MessageCircle className="h-6 w-6 text-[#667781]" />
                <p className="mt-2 text-sm font-semibold text-[#111b21]">Sem mensagens</p>
                <p className="mt-1 text-xs leading-5 text-[#667781]">O historico desta conversa ainda nao apareceu aqui.</p>
              </div>
            ) : (
              messages.map((message) => {
                const replied = message.replyToId ? messages.find((item) => item.id === message.replyToId) || null : null;
                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    replied={replied}
                    canOperate={canOperate}
                    onReply={() => setReplyTo(message)}
                    onCopy={() => void handleCopyMessage(message)}
                    onReact={(emoji) => void handleReactToMessage(message.id, emoji)}
                  />
                );
              })
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>

          <form
            onSubmit={(event) => (whatsappWindowClosed ? void handleSendTemplate(event) : handleComposerSubmit(event))}
            className="inbox-thread-composer inbox-chat-composer shrink-0 border-t border-[var(--cliente-border)] p-2.5 sm:p-4"
          >
            {whatsappWindowClosed ? (
              <>
              <div className="flex items-center gap-2 sm:hidden">
                <div className="min-w-0 flex-1 rounded-[22px] bg-white px-4 py-2.5 text-sm text-[#54656f]">
                  <p className="truncate font-semibold text-[#111b21]">Janela de 24h fechada</p>
                  <p className="truncate text-xs">Use um follow-up aprovado para chamar o contato.</p>
                </div>
                <button
                  type="submit"
                  disabled={!selectedChatId || sendingTemplate || !templateName.trim() || !canOperate}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[#07130C] transition hover:brightness-95 disabled:opacity-55"
                  aria-label="Enviar follow-up"
                >
                  {sendingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
              <div className="hidden rounded-2xl border border-[color:color-mix(in_srgb,var(--cliente-warning)_28%,transparent)] bg-[color:color-mix(in_srgb,var(--cliente-warning)_14%,transparent)] p-3 text-[var(--cliente-card-text)] sm:block">
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
              </>
            ) : (
              <div className="relative">
                {emojiOpen ? (
                  <div className="absolute bottom-[calc(100%+0.5rem)] left-0 z-20 grid w-[min(22rem,calc(100vw-1.25rem))] grid-cols-6 gap-1 rounded-3xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 shadow-[var(--cliente-shadow-hard)]">
                    {QUICK_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => appendEmoji(emoji)}
                        className="flex h-10 items-center justify-center rounded-2xl text-xl transition hover:bg-[var(--cliente-surface-muted)]"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}

                {replyTo ? (
                  <div className="mb-2 flex items-start gap-3 rounded-3xl border border-[#b7e4d4] bg-[#e7fce3] px-3 py-2 text-[#111b21] shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)]">
                    <div className="min-w-0 flex-1 border-l-4 border-[#25D366] pl-3">
                      <p className="text-xs font-black text-[#128C7E]">Respondendo {getMessageActorLabel(replyTo)}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-[#54656f]">{getReplyPreviewLabel(replyTo)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#54656f] transition hover:bg-white/60"
                      aria-label="Cancelar resposta"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}

                {mediaFile ? (
                  <div className="mb-2 overflow-hidden rounded-3xl border border-[var(--cliente-border)] bg-[var(--cliente-card)] p-2 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.5)]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[var(--cliente-surface-muted)] text-[var(--cliente-card-text-muted)]">
                        {mediaPreviewUrl && mediaFile.type.startsWith("image/") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaPreviewUrl} alt="" className="h-full w-full object-cover" />
                        ) : mediaPreviewUrl && mediaFile.type.startsWith("video/") ? (
                          <video src={mediaPreviewUrl} className="h-full w-full object-cover" muted />
                        ) : mediaFile.type.startsWith("audio/") ? (
                          <Mic className="h-5 w-5" />
                        ) : (
                          <FileText className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{mediaFile.name}</p>
                        <p className="mt-0.5 text-xs text-[var(--cliente-card-text-soft)]">
                          {(mediaFile.size / 1024 / 1024).toFixed(1)}MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearMediaSelection}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)]"
                        aria-label="Remover anexo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}

                {recordingAudio ? (
                  <div className="mb-2 flex items-center justify-between gap-3 rounded-full bg-[#fee2e2] px-3 py-2 text-sm text-[#7f1d1d]">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
                      Gravando audio
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={cancelAudioRecording}
                        className="rounded-full px-3 py-1.5 text-xs font-semibold transition hover:bg-white/60"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={stopAudioRecording}
                        className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500"
                      >
                        Concluir
                      </button>
                    </div>
                  </div>
                ) : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiOpen((current) => !current)}
                  disabled={!selectedChatId || sending || sendingMedia || recordingAudio || !canOperate}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50"
                  aria-label="Adicionar emoji"
                >
                  <SmilePlus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedChatId || sending || sendingMedia || recordingAudio || !canOperate || !canSendMediaInChat}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-surface-muted)] disabled:opacity-50"
                  aria-label="Anexar arquivo"
                  title={canSendMediaInChat ? "Anexar arquivo" : "Midia disponivel apenas dentro da janela WhatsApp"}
                >
                  <Paperclip className="h-5 w-5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
                  className="hidden"
                  onChange={(event) => handleFileSelected(event.target.files?.[0] || null)}
                />
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder={mediaFile ? "Legenda" : canOperate ? "Mensagem" : "Sem permissao para responder"}
                  rows={1}
                  className="inbox-chat-input max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-transparent px-4 py-3 text-sm outline-none focus:border-[#25D366]"
                  disabled={!selectedChatId || sending || sendingMedia || !canOperate}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                {!messageText.trim() && !mediaFile ? (
                  <button
                    type="button"
                    onClick={recordingAudio ? stopAudioRecording : () => void startAudioRecording()}
                    disabled={!selectedChatId || sending || sendingMedia || !canOperate || !canSendMediaInChat}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-[#07130C] transition hover:brightness-95 disabled:opacity-55"
                    aria-label={recordingAudio ? "Concluir audio" : "Gravar audio"}
                    title={canSendMediaInChat ? "Gravar audio" : "Audio disponivel apenas dentro da janela WhatsApp"}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={!selectedChatId || sending || sendingMedia || (!messageText.trim() && !mediaFile) || !canOperate}
                  className={cn(
                    "h-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-sm font-semibold text-[#07130C] transition hover:brightness-95 disabled:opacity-55 sm:w-auto sm:px-4 sm:py-2",
                    !messageText.trim() && !mediaFile ? "hidden" : "inline-flex"
                  )}
                  aria-label="Enviar mensagem"
                >
                  {sending || sendingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </div>
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
        title="Opcoes avancadas"
        subtitle="Cliente, oportunidade, assistente e controles desta conversa"
      >
        {contextPanelContent}
      </CustomerProfileDrawer>
    </div>
  );
}
