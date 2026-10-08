"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  GitBranch,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  Video,
  Wand2,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import {
  ClientActionButton,
  EmptyState,
  PanelCard,
  SectionHeader,
  StateBadge,
} from "@/app/cliente/painel/components/ui";

type CampaignStatus = "draft" | "active" | "paused";
type DeliveryMode = "text" | "template";
type Step = "remetente" | "publico" | "conteudo" | "revisao";
type BuilderMode = "simple" | "flow";
type Workspace = "overview" | "builder";
type AudienceBehavior = "all" | "no_response" | "inactive" | "proposal_stalled" | "new_inbound";

type AutomationFlowNodeType = "send" | "condition" | "ai" | "media" | "meeting" | "human" | "end";

type AutomationFlowNode = {
  id: string;
  type: AutomationFlowNodeType;
  label: string;
  description: string;
  x: number;
  y: number;
  message?: string;
  condition?: string;
  nextAction?: string;
};

type AutomationFlowEdge = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

type AutomationFlow = {
  enabled: boolean;
  objective: string;
  nodes: AutomationFlowNode[];
  edges: AutomationFlowEdge[];
};

type UploadedCampaignMedia = {
  type: "image" | "video" | "document";
  link?: string;
  filename?: string;
  contentType?: string;
  size?: number;
  storagePath?: string;
};

type Channel = {
  id: string;
  type: string;
  provider?: string;
  source?: string;
  displayName?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  status?: string;
  connectionStatus?: string;
  outboundReady?: boolean;
  metadata?: Record<string, string>;
  wabaId?: string;
};

type ChannelCapability = {
  kind: "meta_template" | "freeform" | "unavailable";
  title: string;
  description: string;
};

type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  channelId: string;
  deliveryMode: DeliveryMode;
  messageTemplate: string;
  templateName: string;
  languageCode: string;
  bodyParams: string[];
  headerMedia: null | {
    type: "image" | "video" | "document";
    link?: string;
    id?: string;
    filename?: string;
    contentType?: string;
    size?: number;
    storagePath?: string;
  };
  aiFollowup: {
    offerName: string;
    offerSummary: string;
    exampleUrl: string;
    exampleLabel: string;
    responseTriggers: string[];
    nextStep: string;
    handoffRule: string;
    notes: string;
  };
  automationFlow: AutomationFlow;
  maxRecipients: number;
  scheduledAt: string | null;
  sendRatePerMinute: number;
  executionStatus: "idle" | "scheduled" | "queued" | "running" | "paused" | "completed" | "failed";
  deliveryMetrics?: {
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    responded: number;
    converted: number;
  };
  filters: {
    stageIds: string[];
    ownerIds: string[];
    sources: string[];
    tags: string[];
    heat: string[];
    behavior: AudienceBehavior;
    behaviorWindowDays: number;
  };
  lastRunAt?: string | null;
  lastRunSummary?: {
    sent: number;
    skipped: number;
    failed: number;
    totalMatched: number;
  } | null;
};

type Preview = {
  summary: {
    totalLeads: number;
    matchedFilters: number;
    selectedByLimit: number;
    maxRecipients: number;
    estimatedSend: number;
    blockedByConsent: number;
    blockedByFrequency: number;
    missingPhone: number;
    truncatedByLimit: boolean;
  };
  sample: Array<{ leadId: string; nome: string; telefone: string; stage: string; origem: string }>;
};

type Run = {
  id: string;
  campaignId: string;
  campaignName: string;
  createdAt?: string | null;
  summary: { sent: number; skipped: number; failed: number; totalMatched: number };
};

type WhatsAppTemplate = {
  id?: string | null;
  name: string;
  language: string;
  status: string;
  category: string;
  components: Array<Record<string, unknown>>;
};

type TemplateMeta = {
  channel?: {
    id: string;
    source?: string;
    provider?: string;
    displayName?: string;
    phoneNumber?: string;
    phoneNumberId?: string;
  };
  summary?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
  };
  wabaId?: string;
};

type AudienceImportSummary = {
  totalRows: number;
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  importBatchTag: string;
  sourceLabel: string;
};

function createDefaultAutomationFlow(): AutomationFlow {
  return {
    enabled: false,
    objective: "Converter interessados em reuniao qualificada ou venda assistida pela IA.",
    nodes: [
      {
        id: "send_intro",
        type: "send",
        label: "Disparo inicial",
        description: "Mensagem/template enviado para a base escolhida.",
        x: 24,
        y: 42,
        message: "Enviar a mensagem principal e aguardar resposta.",
      },
      {
        id: "reply_interest",
        type: "condition",
        label: "Se responder interesse",
        description: "Ex.: quero ver, manda exemplo, tenho interesse.",
        x: 310,
        y: 42,
        condition: "Lead pediu para ver, entender preco, exemplo ou proximo passo.",
      },
      {
        id: "ai_qualifies",
        type: "ai",
        label: "IA qualifica",
        description: "A IA entende necessidade, envia exemplo e conduz sem repetir perguntas.",
        x: 596,
        y: 42,
        nextAction: "Enviar exemplo, confirmar contexto e oferecer diagnostico ou reuniao.",
      },
      {
        id: "book_meeting",
        type: "meeting",
        label: "Agenda ou proposta",
        description: "Quando estiver pronto, marcar reuniao ou gerar oportunidade.",
        x: 882,
        y: 42,
        nextAction: "Criar reuniao qualificada, brief comercial e aviso para o vendedor.",
      },
      {
        id: "handoff_human",
        type: "human",
        label: "Humano assume",
        description: "Se pedir humano, contrato, objecao forte ou preco fechado.",
        x: 596,
        y: 230,
        condition: "Pedir atendimento humano, contrato, negociacao ou proposta formal.",
      },
    ],
    edges: [
      { id: "edge_intro_interest", from: "send_intro", to: "reply_interest", label: "respondeu" },
      { id: "edge_interest_ai", from: "reply_interest", to: "ai_qualifies", label: "interesse" },
      { id: "edge_ai_meeting", from: "ai_qualifies", to: "book_meeting", label: "qualificado" },
      { id: "edge_ai_human", from: "ai_qualifies", to: "handoff_human", label: "precisa humano" },
    ],
  };
}

function createDiagnosticAutomationFlow(): AutomationFlow {
  return {
    enabled: true,
    objective: "Transformar uma resposta fria em diagnostico rapido e reuniao qualificada.",
    nodes: [
      {
        id: "initial_reply",
        type: "send",
        label: "Lead respondeu",
        description: "Entrada depois do disparo inicial.",
        x: 24,
        y: 70,
        message: "Reconhecer a resposta e conectar com a oferta em uma frase.",
      },
      {
        id: "diagnose",
        type: "ai",
        label: "Diagnostico curto",
        description: "A IA faz no maximo duas perguntas novas e evita repetir o que ja sabe.",
        x: 300,
        y: 70,
        nextAction: "Entender objetivo, urgencia e canal de captacao antes de sugerir caminho.",
      },
      {
        id: "send_example",
        type: "media",
        label: "Enviar exemplo",
        description: "Quando o lead pedir para ver, a IA envia o material configurado na campanha.",
        x: 576,
        y: 70,
        message: "Enviar link/exemplo e explicar por que aquilo resolve o problema do lead.",
      },
      {
        id: "book_or_handoff",
        type: "meeting",
        label: "Agendar ou proposta",
        description: "Se houver fit, converter para reuniao, proposta ou venda assistida.",
        x: 852,
        y: 70,
        nextAction: "Oferecer dois horarios ou solicitar confirmacao para proposta.",
      },
      {
        id: "human_needed",
        type: "human",
        label: "Humano assume",
        description: "Se pedir preco fechado, contrato, desconto ou falar com pessoa.",
        x: 576,
        y: 260,
        condition: "Pedir humano, preco especifico, contrato, objecao forte ou negociacao.",
      },
    ],
    edges: [
      { id: "edge_initial_diagnose", from: "initial_reply", to: "diagnose", label: "resposta" },
      { id: "edge_diagnose_example", from: "diagnose", to: "send_example", label: "quer ver" },
      { id: "edge_example_book", from: "send_example", to: "book_or_handoff", label: "fit" },
      { id: "edge_diagnose_human", from: "diagnose", to: "human_needed", label: "humano" },
    ],
  };
}

function createDirectSalesAutomationFlow(): AutomationFlow {
  return {
    enabled: true,
    objective: "Levar o lead que respondeu com interesse direto ate fechamento, pagamento ou handoff comercial.",
    nodes: [
      {
        id: "interest",
        type: "condition",
        label: "Interesse claro",
        description: "O lead pediu preco, exemplo, proposta ou quer entender como contratar.",
        x: 24,
        y: 80,
        condition: "Quero, preco, proposta, contratar, como funciona, me chama.",
      },
      {
        id: "recommend",
        type: "ai",
        label: "Recomendacao",
        description: "A IA recomenda um caminho simples e nao abre muitas alternativas.",
        x: 300,
        y: 80,
        nextAction: "Explicar pacote ideal, beneficio direto e pedir confirmacao do proximo passo.",
      },
      {
        id: "close",
        type: "meeting",
        label: "Fechar passo",
        description: "Converter para venda, proposta, checkout ou reuniao de fechamento.",
        x: 576,
        y: 80,
        nextAction: "Enviar link de pagamento/proposta ou marcar reuniao qualificada.",
      },
      {
        id: "objection",
        type: "human",
        label: "Objecao forte",
        description: "Quando houver negociacao sensivel, humano entra com contexto completo.",
        x: 300,
        y: 260,
        condition: "Desconto, inseguranca, prazo apertado, comparacao com concorrente ou contrato.",
      },
      {
        id: "done",
        type: "end",
        label: "Objetivo registrado",
        description: "CRM, historico e proximo passo ficam atualizados.",
        x: 852,
        y: 80,
        nextAction: "Registrar conversao, reuniao ou tarefa no CRM.",
      },
    ],
    edges: [
      { id: "edge_interest_recommend", from: "interest", to: "recommend", label: "interesse" },
      { id: "edge_recommend_close", from: "recommend", to: "close", label: "aceitou" },
      { id: "edge_recommend_objection", from: "recommend", to: "objection", label: "objecao" },
      { id: "edge_close_done", from: "close", to: "done", label: "registrar" },
    ],
  };
}

const STEPS: Array<{ id: Step; label: string; icon: typeof Smartphone }> = [
  { id: "remetente", label: "Número", icon: Smartphone },
  { id: "publico", label: "Público", icon: Users },
  { id: "conteudo", label: "Mensagem", icon: MessageCircle },
  { id: "revisao", label: "Revisar", icon: ShieldCheck },
];

type CampaignStarter = {
  id: "reactivate" | "offer" | "proposal";
  title: string;
  name: string;
  behavior: AudienceBehavior;
  behaviorWindowDays: number;
  summary: string;
};

const CAMPAIGN_STARTERS: CampaignStarter[] = [
  {
    id: "reactivate",
    title: "Reativar contatos",
    name: "Reativação de contatos sem resposta",
    behavior: "no_response",
    behaviorWindowDays: 7,
    summary: "Falar novamente com quem não respondeu nos últimos 7 dias.",
  },
  {
    id: "offer",
    title: "Apresentar uma oferta",
    name: "Apresentação de oferta",
    behavior: "all",
    behaviorWindowDays: 3,
    summary: "Escolher o público ideal e apresentar uma oferta com modelo aprovado.",
  },
  {
    id: "proposal",
    title: "Destravar propostas",
    name: "Follow-up de propostas paradas",
    behavior: "proposal_stalled",
    behaviorWindowDays: 7,
    summary: "Retomar oportunidades com proposta parada há mais de 7 dias.",
  },
];

function emptyCampaign(): Campaign {
  return {
    id: "",
    name: "Novo disparo",
    status: "draft",
    channelId: "",
    deliveryMode: "text",
    messageTemplate: "Ola, {nome}! Tudo bem? Temos uma novidade que pode fazer sentido para voce.",
    templateName: "",
    languageCode: "pt_BR",
    bodyParams: ["{nome}"],
    headerMedia: null,
    aiFollowup: {
      offerName: "Landing page comercial",
      offerSummary: "Estrutura para captar pelo Google ou Meta e levar o lead para uma conversa qualificada no WhatsApp.",
      exampleUrl: "",
      exampleLabel: "Exemplo de landing page",
      responseTriggers: ["quero ver", "manda exemplo", "como fica", "tenho interesse", "pode mostrar"],
      nextStep: "Enviar o exemplo, explicar o valor em uma frase e oferecer diagnostico ou reuniao qualificada.",
      handoffRule: "Chamar humano quando o lead pedir proposta, preco fechado, contrato ou quiser falar com uma pessoa.",
      notes: "",
    },
    automationFlow: createDefaultAutomationFlow(),
    maxRecipients: 50,
    scheduledAt: null,
    sendRatePerMinute: 20,
    executionStatus: "idle",
    filters: { stageIds: [], ownerIds: [], sources: [], tags: [], heat: [], behavior: "all", behaviorWindowDays: 3 },
  };
}

function hydrateCampaign(source: Partial<Campaign>): Campaign {
  const fallback = emptyCampaign();
  return {
    ...fallback,
    ...source,
    name: typeof source.name === "string" ? source.name : fallback.name,
    channelId: typeof source.channelId === "string" ? source.channelId : fallback.channelId,
    deliveryMode: source.deliveryMode === "template" ? "template" : source.deliveryMode === "text" ? "text" : fallback.deliveryMode,
    messageTemplate: typeof source.messageTemplate === "string" ? source.messageTemplate : fallback.messageTemplate,
    templateName: typeof source.templateName === "string" ? source.templateName : fallback.templateName,
    languageCode: typeof source.languageCode === "string" ? source.languageCode : fallback.languageCode,
    bodyParams: Array.isArray(source.bodyParams) ? source.bodyParams.filter((item): item is string => typeof item === "string") : fallback.bodyParams,
    aiFollowup: { ...fallback.aiFollowup, ...(source.aiFollowup || {}) },
    automationFlow: source.automationFlow && typeof source.automationFlow === "object" ? source.automationFlow : fallback.automationFlow,
    filters: { ...fallback.filters, ...(source.filters || {}) },
  };
}

function isOfficialChannel(channel?: Channel | null) {
  if (!channel) return false;
  // Keep this in sync with isOfficialWhatsAppProvider on the server. A visual
  // "official" badge must never promise a Meta template catalogue that the API
  // will reject for this provider.
  return ["meta_whatsapp", "whatsapp_cloud_api", "whatsapp_business_cloud_api"].includes(
    String(channel.provider || "").trim().toLowerCase()
  );
}

function getChannelCapability(channel?: Channel | null): ChannelCapability {
  if (!channel || (!channel.outboundReady && channel.status !== "active")) {
    return {
      kind: "unavailable",
      title: "Precisa de atenção",
      description: "Finalize a conexão antes de usar este número em uma campanha.",
    };
  }
  if (isOfficialChannel(channel)) {
    return {
      kind: "meta_template",
      title: "Modelos aprovados pela Meta",
      description: "Para iniciar conversas, escolha um modelo já aprovado para este número.",
    };
  }
  return {
    kind: "freeform",
    title: "Mensagem livre",
    description: "Escreva uma mensagem personalizada e adicione mídia quando fizer sentido.",
  };
}

function formatDate(value?: string | null) {
  if (!value) return "Ainda nao enviado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ainda nao enviado";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function formatDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function splitList(value: string) {
  return Array.from(new Set(value.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
}

function audienceBehaviorLabel(filters: Campaign["filters"]) {
  if (filters.behavior === "no_response") return `Sem resposta ha ${filters.behaviorWindowDays} dias`;
  if (filters.behavior === "proposal_stalled") return `Propostas paradas ha ${filters.behaviorWindowDays} dias`;
  if (filters.behavior === "inactive") return `Base inativa ha ${filters.behaviorWindowDays} dias`;
  if (filters.behavior === "new_inbound") return `Entradas dos ultimos ${filters.behaviorWindowDays} dias`;
  return "Base filtrada";
}

function inferUploadType(file: File): "image" | "video" | "document" | null {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("document")) return "document";
  return null;
}

function uploadLimitFor(type: "image" | "video" | "document") {
  if (type === "image") return 12 * 1024 * 1024;
  if (type === "video") return 64 * 1024 * 1024;
  return 24 * 1024 * 1024;
}

function safeUploadName(value: string) {
  return value.trim().replace(/[^\w.\- ]+/g, "_").slice(0, 180) || `arquivo-${Date.now()}`;
}

function csvEscape(value: string) {
  const text = String(value || "").trim();
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function hasAudienceHeader(line: string) {
  const normalized = line
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_");
  return ["telefone", "phone", "whatsapp", "celular", "numero", "nome", "name", "email", "empresa"].some((token) =>
    normalized.includes(token)
  );
}

function normalizeAudienceFileContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Arquivo vazio.");

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  if (hasAudienceHeader(firstLine)) return trimmed;

  const rows = lines.map((line) => {
    const phoneMatch = line.match(/\+?\d[\d\s().-]{7,}\d/);
    const phone = phoneMatch?.[0] || line;
    const name = phoneMatch ? line.replace(phoneMatch[0], "").replace(/[;,|-]+/g, " ").trim() : "";
    return `${csvEscape(phone)},${csvEscape(name)}`;
  });

  return ["telefone,nome", ...rows].join("\n");
}

async function readAudienceFileContent(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const sheetName = workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      return sheet && XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false }).length > 0;
    });
    if (!sheetName) throw new Error("A planilha não possui uma aba com contatos.");

    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], {
      FS: ",",
      RS: "\n",
      blankrows: false,
    });
    return normalizeAudienceFileContent(csv);
  }

  return normalizeAudienceFileContent(await file.text());
}

function getTemplateBody(template: WhatsAppTemplate | undefined) {
  const body = template?.components.find((component) => String(component.type || "").toUpperCase() === "BODY");
  return String(body?.text || "").trim();
}

function getTemplateVariableCount(template: WhatsAppTemplate | undefined) {
  const body = getTemplateBody(template);
  let highest = 0;
  for (const match of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    highest = Math.max(highest, Number(match[1] || 0));
  }
  return highest;
}

function getTemplateVariableIndexes(template: WhatsAppTemplate | undefined) {
  const body = getTemplateBody(template);
  return Array.from(new Set(Array.from(body.matchAll(/\{\{\s*(\d+)\s*\}\}/g), (match) => Number(match[1]))))
    .filter((index) => index > 0)
    .sort((a, b) => a - b);
}

function getTemplateHeaderMediaType(template: WhatsAppTemplate | undefined): "image" | "video" | "document" | null {
  const header = template?.components.find((component) => String(component.type || "").toUpperCase() === "HEADER");
  const format = String(header?.format || "").toUpperCase();
  if (format === "IMAGE") return "image";
  if (format === "VIDEO") return "video";
  if (format === "DOCUMENT") return "document";
  return null;
}

function buildDefaultBodyParams(count: number, current: string[]) {
  if (count <= 0) return [];
  const defaults = ["{nome}", "{empresa}", "{origem}", "{telefone}", "{stage}"];
  return Array.from({ length: count }, (_, index) => current[index] || defaults[index] || "");
}

function renderTemplateBodyPreview(template: WhatsAppTemplate | undefined, params: string[]) {
  const body = getTemplateBody(template);
  if (!body) return "";
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (_placeholder, rawIndex: string) => {
    const index = Number(rawIndex) - 1;
    return params[index] || `{variavel ${rawIndex}}`;
  });
}

function getTemplateHeaderText(template: WhatsAppTemplate | undefined) {
  const header = template?.components.find((component) => String(component.type || "").toUpperCase() === "HEADER");
  return String(header?.text || "").trim();
}

function getTemplateFooter(template: WhatsAppTemplate | undefined) {
  const footer = template?.components.find((component) => String(component.type || "").toUpperCase() === "FOOTER");
  return String(footer?.text || "").trim();
}

function getTemplateButtons(template: WhatsAppTemplate | undefined) {
  const buttons = template?.components.find((component) => String(component.type || "").toUpperCase() === "BUTTONS")?.buttons;
  return Array.isArray(buttons)
    ? buttons.map((button) => String((button as Record<string, unknown>).text || "").trim()).filter(Boolean)
    : [];
}

function humanizeTemplateError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("credencial da meta expirada") || normalized.includes("token has expired")) {
    return "A credencial da Meta desse numero expirou. Atualize a credencial em Configuracoes > Canais, salve o numero e volte para selecionar o template.";
  }
  if (normalized.includes("waba id") || normalized.includes("whatsapp business account")) {
    return "Informe o ID da conta WhatsApp (WABA) em Configuracoes > Canais. Os templates aprovados ficam no WABA, nao apenas no numero.";
  }
  if (normalized.includes("permiss")) {
    return "A credencial da Meta nao tem permissao para ler templates. Use uma credencial com whatsapp_business_management e whatsapp_business_messaging.";
  }
  return message;
}

export default function BulkMessagingPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const canManage = hasCapability("manage_automations");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [templateMeta, setTemplateMeta] = useState<TemplateMeta | null>(null);
  const [templateError, setTemplateError] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0);
  const [editor, setEditor] = useState<Campaign>(emptyCampaign);
  const [selectedId, setSelectedId] = useState("");
  const [step, setStep] = useState<Step>("remetente");
  const [builderMode, setBuilderMode] = useState<BuilderMode>("simple");
  const [workspace, setWorkspace] = useState<Workspace>("overview");
  const [selectedStarter, setSelectedStarter] = useState<CampaignStarter | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "preview" | "send" | "delete" | "media" | "audience" | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [audienceImport, setAudienceImport] = useState<AudienceImportSummary | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!tenant?.tenantId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const [campaignRes, channelRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns`),
        authedFetch(`/api/tenant/${tenant.tenantId}/channels`),
      ]);
      const campaignPayload = (await campaignRes.json()) as { items?: Campaign[]; runs?: Run[]; error?: string };
      const channelPayload = (await channelRes.json()) as { items?: Channel[]; error?: string };
      if (!campaignRes.ok) throw new Error(campaignPayload.error || "Falha ao carregar disparos.");
      if (!channelRes.ok) throw new Error(channelPayload.error || "Falha ao carregar numeros conectados.");
      const nextCampaigns = campaignPayload.items || [];
      const nextChannels = (channelPayload.items || []).filter((item) => item.type === "whatsapp");
      setCampaigns(nextCampaigns);
      setRuns(campaignPayload.runs || []);
      setChannels(nextChannels);
      setSelectedId((current) => current || nextCampaigns[0]?.id || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar a central de disparos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedId) return;
    const selected = campaigns.find((item) => item.id === selectedId);
    if (!selected) return;
    setEditor(hydrateCampaign(selected));
    setPreview(null);
    setAudienceImport(null);
  }, [campaigns, selectedId]);

  const selectedChannel = channels.find((item) => item.id === editor.channelId) || null;
  const officialChannel = isOfficialChannel(selectedChannel);
  const readyChannels = channels.filter((item) => item.outboundReady || item.status === "active");
  const riskLevel = editor.maxRecipients > 250 ? "alto" : editor.maxRecipients > 100 ? "medio" : "baixo";
  const selectedTemplate = templates.find(
    (template) => template.name === editor.templateName && template.language === editor.languageCode
  );
  const requiredHeaderMedia = getTemplateHeaderMediaType(selectedTemplate);

  const readiness = useMemo(() => {
    const name = editor.name || "";
    const templateName = editor.templateName || "";
    const message = editor.messageTemplate || "";
    const followup = editor.aiFollowup || emptyCampaign().aiFollowup;
    const checks = [
      Boolean(name.trim()),
      Boolean(editor.channelId),
      editor.deliveryMode === "template" ? Boolean(templateName.trim()) : message.trim().length >= 10,
      editor.deliveryMode !== "template" || !requiredHeaderMedia || editor.headerMedia?.type === requiredHeaderMedia,
      Boolean(followup.offerName.trim() || followup.exampleUrl.trim() || followup.nextStep.trim()),
      editor.maxRecipients > 0,
      Boolean(preview),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [editor, preview, requiredHeaderMedia]);

  const totals = useMemo(
    () => ({
      sent: runs.reduce((sum, item) => sum + item.summary.sent, 0),
      failed: runs.reduce((sum, item) => sum + item.summary.failed, 0),
      active: campaigns.filter((item) => item.status === "active").length,
    }),
    [campaigns, runs]
  );
  const hasActiveQueue = campaigns.some((item) =>
    ["scheduled", "queued", "running"].includes(item.executionStatus)
  );

  useEffect(() => {
    if (!tenant?.tenantId || !canManage || !hasActiveQueue) return;
    let mounted = true;
    const tick = async () => {
      await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/process`, {
        method: "POST",
      }).catch(() => null);
      if (mounted) await load(true);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 45_000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [canManage, hasActiveQueue, load, tenant?.tenantId]);

  useEffect(() => {
    if (!tenant?.tenantId || !editor.channelId || !officialChannel) {
      setTemplates([]);
      setTemplateMeta(null);
      setTemplateError("");
      return;
    }
    let mounted = true;
    setLoadingTemplates(true);
    setTemplateError("");
    authedFetch(`/api/tenant/${tenant.tenantId}/whatsapp-templates?channelId=${encodeURIComponent(editor.channelId)}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          templates?: WhatsAppTemplate[];
          channel?: TemplateMeta["channel"];
          summary?: TemplateMeta["summary"];
          wabaId?: string;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Falha ao consultar templates.");
        if (mounted) {
          setTemplates((payload.templates || []).filter((item) => item.status === "approved"));
          setTemplateMeta({ channel: payload.channel, summary: payload.summary, wabaId: payload.wabaId });
        }
      })
      .catch((templateError) => {
        if (mounted) {
          setTemplates([]);
          setTemplateMeta(null);
          setTemplateError(humanizeTemplateError(templateError instanceof Error ? templateError.message : "Falha ao consultar templates."));
        }
      })
      .finally(() => {
        if (mounted) setLoadingTemplates(false);
      });
    return () => {
      mounted = false;
    };
  }, [editor.channelId, officialChannel, templateRefreshKey, tenant?.tenantId]);

  function createNew(starter?: CampaignStarter) {
    // A campanha deve iniciar no canal oficial sempre que ele existir. Antes,
    // a primeira conexao ativa (frequentemente um WhatsApp normal) era escolhida
    // por ordem de cadastro e, por isso, o catalogo de templates nem era consultado.
    const firstChannel =
      readyChannels.find((channel) => isOfficialChannel(channel)) ||
      readyChannels[0] ||
      channels.find((channel) => isOfficialChannel(channel)) ||
      channels[0];
    const next = emptyCampaign();
    if (starter) {
      next.name = starter.name;
      next.filters.behavior = starter.behavior;
      next.filters.behaviorWindowDays = starter.behaviorWindowDays;
    }
    if (firstChannel) {
      next.channelId = firstChannel.id;
      next.deliveryMode = isOfficialChannel(firstChannel) ? "template" : "text";
    }
    setEditor(next);
    setSelectedId("");
    setPreview(null);
    setAudienceImport(null);
    setStep(starter ? "publico" : "remetente");
    setSelectedStarter(starter || null);
    setWorkspace("builder");
    setNotice("");
    setError("");
  }

  function chooseChannel(channel: Channel) {
    setEditor((current) => ({
      ...current,
      channelId: channel.id,
      deliveryMode: isOfficialChannel(channel) ? "template" : "text",
    }));
    setPreview(null);
  }

  function moveStep(direction: -1 | 1) {
    const current = STEPS.findIndex((item) => item.id === step);
    const next = STEPS[Math.max(0, Math.min(STEPS.length - 1, current + direction))];
    if (next) setStep(next.id);
  }

  async function importAudienceFile(file: File) {
    if (!tenant?.tenantId || !canManage) return;
    setWorking("audience");
    setError("");
    setNotice("");
    try {
      const content = await readAudienceFileContent(file);
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/leads/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvContent: content,
          defaultChannel: "whatsapp",
          defaultSourceLabel: `Disparo em massa - ${file.name}`.slice(0, 120),
          defaultPipelineStage: "captado",
          defaultConsentWhatsApp: true,
        }),
      });
      const payload = (await response.json()) as { summary?: AudienceImportSummary; error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || "Falha ao importar contatos.");

      const summary = payload.summary;
      const tag = summary.importBatchTag;
      setAudienceImport(summary);
      setEditor((current) => ({
        ...current,
        filters: {
          stageIds: [],
          ownerIds: [],
          sources: [],
          heat: [],
          tags: tag ? [tag] : [],
          behavior: "all",
          behaviorWindowDays: 3,
        },
        maxRecipients: Math.max(1, Math.min(500, Math.max(current.maxRecipients, summary.processed))),
      }));
      setPreview(null);
      setNotice(`${summary.processed} contatos importados para este disparo.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Falha ao importar contatos.");
    } finally {
      setWorking(null);
    }
  }

  async function save() {
    if (!tenant?.tenantId || !canManage) return null;
    setWorking("save");
    setError("");
    setNotice("");
    try {
      const path = editor.id
        ? `/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}`
        : `/api/tenant/${tenant.tenantId}/outbound-campaigns`;
      const response = await authedFetch(path, {
        method: editor.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editor),
      });
      const payload = (await response.json()) as { campaignId?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao salvar disparo.");
      const campaignId = editor.id || payload.campaignId || "";
      await load();
      setSelectedId(campaignId);
      setNotice(editor.id ? "Disparo atualizado." : "Disparo salvo como rascunho.");
      return campaignId;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar disparo.");
      return null;
    } finally {
      setWorking(null);
    }
  }

  async function simulate() {
    const campaignId = editor.id || (await save());
    if (!tenant?.tenantId || !campaignId) return;
    setWorking("preview");
    setError("");
    try {
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/outbound-campaigns/${campaignId}/preview`,
        { method: "POST" }
      );
      const payload = (await response.json()) as Preview & { error?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error || "Falha ao simular publico.");
      const summary = payload.summary;
      setPreview({ summary, sample: payload.sample || [] });
      setStep("revisao");
      setNotice(`${summary.estimatedSend} contatos aptos para receber.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Falha ao simular publico.");
    } finally {
      setWorking(null);
    }
  }

  async function dispatch() {
    if (!tenant?.tenantId || !editor.id || !preview || !canManage) return;
    if (editor.deliveryMode === "template" && requiredHeaderMedia && editor.headerMedia?.type !== requiredHeaderMedia) {
      setError(`Este template tem cabecalho de ${requiredHeaderMedia}. Anexe a midia antes de enviar.`);
      setStep("conteudo");
      return;
    }
    if (!window.confirm(`Confirmar o envio para ate ${preview.summary.estimatedSend} contatos?`)) return;
    setWorking("send");
    setError("");
    try {
      const response = await authedFetch(
        `/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: editor.scheduledAt || null }),
        }
      );
      const payload = (await response.json()) as { queued?: number; jobs?: number; scheduledAt?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao iniciar disparo.");
      await load();
      setNotice(
        editor.scheduledAt
          ? `${payload.queued || 0} contatos agendados. A Altum processa a fila automaticamente minuto a minuto.`
          : `${payload.queued || 0} contatos colocados na fila em ${payload.jobs || 0} lote(s).`
      );
    } catch (dispatchError) {
      setError(dispatchError instanceof Error ? dispatchError.message : "Falha ao iniciar disparo.");
    } finally {
      setWorking(null);
    }
  }

  async function toggleCampaignPause() {
    if (!tenant?.tenantId || !editor.id || !canManage) return;
    const pausing = editor.status !== "paused";
    setWorking("save");
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editor, status: pausing ? "paused" : "active" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao alterar disparo.");
      await load();
      setNotice(pausing ? "Disparo pausado. Nenhum novo lote sera enviado." : "Disparo retomado.");
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Falha ao alterar disparo.");
    } finally {
      setWorking(null);
    }
  }

  async function remove() {
    if (!tenant?.tenantId || !editor.id || !canManage) return;
    if (!window.confirm(`Apagar definitivamente "${editor.name}"?`)) return;
    setWorking("delete");
    setError("");
    try {
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/${editor.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Falha ao apagar disparo.");
      setEditor(emptyCampaign());
      setSelectedId("");
      setPreview(null);
      await load();
      setNotice("Disparo apagado.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao apagar disparo.");
    } finally {
      setWorking(null);
    }
  }

  async function uploadMedia(file: File) {
    if (!tenant?.tenantId || !canManage) return;
    setWorking("media");
    setError("");
    setNotice("");
    setUploadProgress(0);
    try {
      const type = inferUploadType(file);
      if (!type) {
        throw new Error("Envie uma imagem, video, PDF ou documento compativel.");
      }
      const maxBytes = uploadLimitFor(type);
      if (!file.size || file.size > maxBytes) {
        throw new Error(`Arquivo acima do limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      }

      let media: UploadedCampaignMedia | null = null;

      setUploadProgress(15);
      const form = new FormData();
      form.append("file", file);
      const response = await authedFetch(`/api/tenant/${tenant.tenantId}/outbound-campaigns/media`, {
        method: "POST",
        body: form,
      });
      setUploadProgress(80);
      let payload: { media?: UploadedCampaignMedia; error?: string } = {};
      try {
        payload = (await response.json()) as typeof payload;
      } catch {
        payload = {};
      }
      if (!response.ok || !payload.media?.link) {
        throw new Error(payload.error || "Falha ao subir arquivo pelo servidor.");
      }
      media = payload.media;
      setUploadProgress(100);

      setEditor((current) => ({
        ...current,
        headerMedia: {
          type: media?.type || type,
          link: media?.link,
          filename: media?.filename || safeUploadName(file.name),
          contentType: media?.contentType || file.type || "application/octet-stream",
          size: media?.size || file.size,
          storagePath: media?.storagePath,
        },
      }));
      setPreview(null);
      setNotice(`${file.name} anexado ao disparo.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao subir arquivo.");
    } finally {
      setWorking(null);
      window.setTimeout(() => setUploadProgress(null), 450);
    }
  }

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-primary)]" /></div>;
  }

  if (workspace === "overview") {
    return (
      <CampaignOverview
        campaigns={campaigns}
        runs={runs}
        totals={totals}
        readyChannels={readyChannels.length}
        canManage={canManage}
        onCreate={createNew}
        onStart={createNew}
        onOpen={(campaignId) => {
          setSelectedId(campaignId);
          setSelectedStarter(null);
          setWorkspace("builder");
        }}
      />
    );
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <SectionHeader
        title={editor.id ? "Editar campanha" : "Criar campanha"}
        subtitle="Escolha quem deve receber e qual conversa você quer começar."
        action={
          <ClientActionButton tone="secondary" onClick={() => setWorkspace("overview")}>
            <ArrowLeft className="h-4 w-4" /> Campanhas
          </ClientActionButton>
        }
      />

      {error ? <Feedback tone="error" text={error} /> : null}
      {notice ? <Feedback tone="success" text={notice} /> : null}

      <CampaignComposer
        editor={editor}
        channels={channels}
        selectedChannel={selectedChannel}
        official={officialChannel}
        templates={templates}
        templateMeta={templateMeta}
        templateError={templateError}
        loadingTemplates={loadingTemplates}
        uploading={working === "media"}
        uploadProgress={uploadProgress}
        importing={working === "audience"}
        importSummary={audienceImport}
        preview={preview}
        canManage={canManage}
        working={working}
        onChooseChannel={chooseChannel}
        onImportFile={(file) => void importAudienceFile(file)}
        onRefreshTemplates={() => setTemplateRefreshKey((current) => current + 1)}
        onUpload={uploadMedia}
        onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
        onSave={() => void save()}
        onSimulate={() => void simulate()}
        onDispatch={() => void dispatch()}
      />

      {false ? (
        <>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
        <aside className="hidden">
          <PanelCard className="overflow-hidden p-0">
            <div className="border-b border-[var(--cliente-border)] p-4">
              <p className="text-sm font-bold text-[var(--cliente-card-text)]">Seus disparos</p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{campaigns.length} salvos</p>
            </div>
            <div className="max-h-[620px] divide-y divide-[var(--cliente-border)] overflow-y-auto">
              {campaigns.map((campaign) => (
                <button
                  key={campaign.id}
                  type="button"
                  onClick={() => setSelectedId(campaign.id)}
                  className={`w-full p-4 text-left transition hover:bg-[var(--cliente-surface-hover)] ${
                    selectedId === campaign.id ? "bg-[var(--cliente-primary-soft)]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-semibold text-[var(--cliente-card-text)]">{campaign.name}</p>
                    <MoreHorizontal className="h-4 w-4 shrink-0 text-[var(--cliente-card-text-soft)]" />
                  </div>
                  <p className="mt-2 text-xs text-[var(--cliente-card-text-soft)]">{formatDate(campaign.lastRunAt)}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <StateBadge
                      label={campaign.status === "paused" ? "pausado" : campaign.status === "active" ? "ativo" : "rascunho"}
                      tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}
                    />
                    <span className="text-xs font-semibold text-[var(--cliente-card-text-muted)]">
                      {campaign.deliveryMetrics?.read || 0} lidos
                    </span>
                  </div>
                </button>
              ))}
              {!campaigns.length ? (
                <div className="p-4">
                  <EmptyState title="Nenhum disparo" description="Crie o primeiro envio segmentado." />
                </div>
              ) : null}
            </div>
          </PanelCard>
        </aside>

        <main className="order-1 min-w-0 xl:order-2">
          <PanelCard className="overflow-hidden p-0">
            <div className="border-b border-[var(--cliente-border)] px-4 py-4 md:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <input
                  value={editor.name}
                  onChange={(event) => setEditor((current) => ({ ...current, name: event.target.value }))}
                  className="min-w-0 flex-1 border-0 bg-transparent text-xl font-extrabold text-[var(--cliente-card-text)] outline-none placeholder:text-[var(--cliente-card-text-soft)]"
                  placeholder="Nome do disparo"
                />
                <StateBadge label={`${readiness}% pronto`} tone={readiness >= 80 ? "success" : "warning"} />
              </div>
              {selectedStarter ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-blue-200 bg-blue-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-extrabold text-blue-950">Objetivo: {selectedStarter?.title}</p>
                    <p className="mt-1 text-xs text-blue-800">{selectedStarter?.summary}</p>
                  </div>
                  <button type="button" onClick={() => setWorkspace("overview")} className="text-xs font-bold text-blue-700 underline underline-offset-4">Trocar objetivo</button>
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-1">
                {[
                  { id: "simple" as BuilderMode, label: "Disparo simples", icon: MessageCircle },
                  { id: "flow" as BuilderMode, label: "Fluxo visual", icon: GitBranch },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = builderMode === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setBuilderMode(item.id);
                        if (item.id === "flow") {
                          setEditor((current) => ({
                            ...current,
                            automationFlow: { ...(current.automationFlow || createDefaultAutomationFlow()), enabled: true },
                          }));
                        }
                      }}
                      className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-sm font-black transition sm:flex-none ${
                        active ? "bg-white text-[var(--cliente-primary)] shadow-sm" : "text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {builderMode === "simple" ? (
              <div className="flex overflow-x-auto border-b border-[var(--cliente-border)] px-2 md:px-4">
                {STEPS.map((item, index) => {
                  const Icon = item.icon;
                  const active = step === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setStep(item.id)}
                      className={`flex min-w-max items-center gap-2 border-b-2 px-3 py-4 text-sm font-semibold transition md:px-4 ${
                        active
                          ? "border-[var(--cliente-primary)] text-[var(--cliente-primary)]"
                          : "border-transparent text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"
                      }`}
                    >
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active ? "bg-[var(--cliente-primary)] text-white" : "bg-[var(--cliente-surface-muted)]"}`}>
                        {active ? <Icon className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="p-4 md:p-6">
              {builderMode === "flow" ? (
                <FlowBuilder
                  flow={editor.automationFlow || createDefaultAutomationFlow()}
                  onChange={(automationFlow) => { setEditor((current) => ({ ...current, automationFlow })); setPreview(null); }}
                />
              ) : null}
              {builderMode === "simple" && step === "remetente" ? (
                <SenderStep channels={channels} selectedId={editor.channelId} onSelect={chooseChannel} />
              ) : null}
              {builderMode === "simple" && step === "publico" ? (
                <AudienceStep
                  editor={editor}
                  importing={working === "audience"}
                  importSummary={audienceImport}
                  onImportFile={(file) => void importAudienceFile(file)}
                  onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
                />
              ) : null}
              {builderMode === "simple" && step === "conteudo" ? (
                <ContentStep
                  editor={editor}
                  official={officialChannel}
                  templates={templates}
                  templateMeta={templateMeta}
                  templateError={templateError}
                  loadingTemplates={loadingTemplates}
                  onRefreshTemplates={() => setTemplateRefreshKey((current) => current + 1)}
                  uploading={working === "media"}
                  uploadProgress={uploadProgress}
                  onUpload={uploadMedia}
                  onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
                />
              ) : null}
              {builderMode === "simple" && step === "revisao" ? (
                <ReviewStep editor={editor} channel={selectedChannel} preview={preview} riskLevel={riskLevel} />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-4 md:px-6">
              <div className="flex gap-2">
                {builderMode === "simple" && step !== "remetente" ? (
                  <ClientActionButton tone="secondary" onClick={() => moveStep(-1)} disabled={Boolean(working)}>
                    <ArrowLeft className="h-4 w-4" /> Anterior
                  </ClientActionButton>
                ) : null}
                {editor.id ? (
                  <ClientActionButton tone="danger" onClick={() => void remove()} disabled={Boolean(working)}>
                    {working === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">Apagar</span>
                  </ClientActionButton>
                ) : null}
                {editor.id && ["scheduled", "queued", "running", "paused"].includes(editor.executionStatus) ? (
                  <ClientActionButton tone={editor.status === "paused" ? "success" : "secondary"} onClick={() => void toggleCampaignPause()} disabled={Boolean(working)}>
                    {editor.status === "paused" ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {editor.status === "paused" ? "Retomar" : "Pausar"}
                  </ClientActionButton>
                ) : null}
                <ClientActionButton tone="secondary" onClick={() => void save()} disabled={Boolean(working) || !canManage}>
                  {working === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
                </ClientActionButton>
              </div>
              <div className="flex gap-2">
                {builderMode === "simple" && step !== "revisao" ? (
                  <ClientActionButton tone="primary" onClick={() => moveStep(1)} disabled={Boolean(working)}>
                    Continuar <ChevronRight className="h-4 w-4" />
                  </ClientActionButton>
                ) : (
                  <>
                    <ClientActionButton tone="secondary" onClick={() => void simulate()} disabled={Boolean(working) || !editor.channelId || !canManage}>
                      {working === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Simular público
                    </ClientActionButton>
                    <ClientActionButton tone="success" onClick={() => void dispatch()} disabled={Boolean(working) || !preview || !editor.id || !canManage}>
                      {working === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {editor.scheduledAt ? "Agendar" : "Enviar agora"}
                    </ClientActionButton>
                  </>
                )}
              </div>
            </div>
          </PanelCard>
        </main>

        <aside className="order-3">
          <PhonePreview
            editor={editor}
            official={officialChannel}
            templatePreview={renderTemplateBodyPreview(selectedTemplate, editor.bodyParams)}
            requiredHeaderMedia={requiredHeaderMedia}
          />
          <div className="mt-4">
            <PanelCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">Protecao da conta</p>
                  <p className="text-xs text-[var(--cliente-card-text-soft)]">Opt-out e telefones invalidos sao ignorados.</p>
                </div>
              </div>
            </PanelCard>
          </div>
        </aside>
      </div>

      <PanelCard className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[var(--cliente-card-text)]">Historico recente</p>
            <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Resultado real das ultimas execucoes.</p>
          </div>
          <Clock3 className="h-5 w-5 text-[var(--cliente-card-text-soft)]" />
        </div>
        <div className="mt-4 divide-y divide-[var(--cliente-border)]">
          {runs.slice(0, 8).map((run) => (
            <div key={run.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_auto_auto_auto] sm:items-center sm:gap-5">
              <div>
                <p className="font-semibold text-[var(--cliente-card-text)]">{run.campaignName}</p>
                <p className="text-xs text-[var(--cliente-card-text-soft)]">{formatDate(run.createdAt)}</p>
              </div>
              <span className="text-emerald-600">{run.summary.sent} enviados</span>
              <span className="text-amber-600">{run.summary.skipped} ignorados</span>
              <span className="text-rose-600">{run.summary.failed} falhas</span>
            </div>
          ))}
          {!runs.length ? <p className="py-6 text-center text-sm text-[var(--cliente-card-text-soft)]">Nenhum envio executado ainda.</p> : null}
        </div>
      </PanelCard>
        </>
      ) : null}
    </div>
  );
}

function CampaignOverview({
  campaigns,
  runs,
  totals,
  readyChannels,
  canManage,
  onCreate,
  onStart,
  onOpen,
}: {
  campaigns: Campaign[];
  runs: Run[];
  totals: { sent: number; failed: number; active: number };
  readyChannels: number;
  canManage: boolean;
  onCreate: () => void;
  onStart: (starter: CampaignStarter) => void;
  onOpen: (campaignId: string) => void;
}) {
  const recentCampaigns = campaigns.slice(0, 6);
  const hasCampaigns = Boolean(campaigns.length);

  return (
    <>
      <MobileCampaignOverview campaigns={campaigns} totals={totals} readyChannels={readyChannels} canManage={canManage} onCreate={onCreate} onOpen={onOpen} />
      <div className="hidden space-y-6 pb-24 lg:block lg:pb-8">
      <SectionHeader
        title="Campanhas WhatsApp"
        subtitle="Planeje, envie e acompanhe conversas que viram oportunidades."
        action={canManage ? <ClientActionButton tone="primary" onClick={onCreate}><Plus className="h-4 w-4" /> Nova campanha</ClientActionButton> : null}
      />

      <section className="overflow-hidden rounded-[28px] border border-blue-200 bg-[linear-gradient(120deg,#173d9d_0%,#2563d9_58%,#4f46e5_100%)] p-6 text-white shadow-[0_18px_55px_rgba(37,99,235,.18)] md:p-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="max-w-2xl">
            <span className="client-keep-light-text inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-bold"><MessageCircle className="h-3.5 w-3.5" /> Operação comercial</span>
            <h2 className="client-keep-light-text mt-4 text-2xl font-black tracking-tight md:text-3xl">Toda campanha começa com uma conversa que vale a pena responder.</h2>
            <p className="mt-3 text-sm leading-6 text-blue-100 md:text-base">Escolha o público, use um modelo aprovado e deixe a Altum organizar as respostas no seu funil.</p>
          </div>
          {canManage ? <button type="button" onClick={onCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-blue-800 transition hover:-translate-y-0.5 hover:shadow-lg"><Plus className="h-4 w-4" /> Criar campanha</button> : null}
        </div>
        <div className="mt-7 grid grid-cols-2 gap-3 border-t border-white/15 pt-5 sm:grid-cols-4">
          <HeroMetric label="enviados" value={totals.sent} />
          <HeroMetric label="em operação" value={totals.active} />
          <HeroMetric label="falhas" value={totals.failed} />
          <HeroMetric label="números prontos" value={readyChannels} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {CAMPAIGN_STARTERS.map((play) => {
          const details = play.id === "reactivate"
            ? { icon: Clock3, tone: "border-amber-200 bg-amber-50 text-amber-800" }
            : play.id === "proposal"
              ? { icon: GitBranch, tone: "border-violet-200 bg-violet-50 text-violet-800" }
              : { icon: Send, tone: "border-blue-200 bg-blue-50 text-blue-800" };
          const Icon = details.icon;
          return (
            <button key={play.id} type="button" onClick={() => onStart(play)} disabled={!canManage} className="group rounded-[20px] border border-[var(--cliente-border)] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--cliente-border-strong)] hover:shadow-md disabled:cursor-default disabled:hover:translate-y-0">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${details.tone}`}><Icon className="h-4 w-4" /></span>
              <p className="mt-4 text-sm font-extrabold text-[var(--cliente-card-text)]">{play.title}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{play.summary}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--cliente-primary)]">Começar <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
            </button>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
        <PanelCard className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cliente-border)] px-5 py-4">
            <div><p className="text-base font-extrabold text-[var(--cliente-card-text)]">Suas campanhas</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Acompanhe o que está em andamento e retome rascunhos.</p></div>
            <span className="rounded-full bg-[var(--cliente-surface-muted)] px-2.5 py-1 text-xs font-bold text-[var(--cliente-card-text-soft)]">{campaigns.length} no total</span>
          </div>
          {hasCampaigns ? <div className="divide-y divide-[var(--cliente-border)]">{recentCampaigns.map((campaign) => (
            <button key={campaign.id} type="button" onClick={() => onOpen(campaign.id)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[var(--cliente-surface-hover)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="min-w-0"><p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{campaign.name}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{campaign.templateName ? `Modelo ${campaign.templateName}` : "Mensagem livre"} · {formatDate(campaign.lastRunAt)}</p></div>
              <StateBadge label={campaign.status === "active" ? "em operação" : campaign.status === "paused" ? "pausada" : "rascunho"} tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"} />
              <span className="text-xs font-bold text-[var(--cliente-card-text-soft)]">{campaign.deliveryMetrics?.responded || 0} respostas</span>
            </button>
          ))}</div> : <div className="p-8"><EmptyState title="Sua primeira campanha começa aqui" description="Use um modelo aprovado para iniciar conversas com o público certo." /></div>}
        </PanelCard>
        <PanelCard className="p-5">
          <div className="flex items-center justify-between"><div><p className="text-base font-extrabold text-[var(--cliente-card-text)]">Últimos resultados</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">O que aconteceu nos envios recentes.</p></div><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
          <div className="mt-4 space-y-3">{runs.slice(0, 4).map((run) => <div key={run.id} className="rounded-[16px] bg-[var(--cliente-surface-muted)] p-3"><p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{run.campaignName}</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{run.summary.sent} enviados · {run.summary.failed} falhas · {formatDate(run.createdAt)}</p></div>)}{!runs.length ? <p className="rounded-[16px] bg-[var(--cliente-surface-muted)] p-4 text-sm text-[var(--cliente-card-text-soft)]">Quando sua campanha for enviada, os resultados aparecem aqui.</p> : null}</div>
        </PanelCard>
      </section>
      </div>
    </>
  );
}

function MobileCampaignOverview({ campaigns, totals, readyChannels, canManage, onCreate, onOpen }: {
  campaigns: Campaign[];
  totals: { sent: number; failed: number; active: number };
  readyChannels: number;
  canManage: boolean;
  onCreate: () => void;
  onOpen: (campaignId: string) => void;
}) {
  return <section className="-mx-3 min-h-[100dvh] bg-[var(--cliente-bg)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:hidden"><header className="border-b border-[var(--cliente-border)] bg-[var(--cliente-card)] px-4 pb-4 pt-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">Crescimento comercial</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--cliente-card-text)]">Campanhas</h1></div>{canManage ? <button type="button" onClick={onCreate} className="inline-flex h-10 items-center rounded-full bg-[var(--cliente-primary)] px-3 text-sm font-semibold text-white"><Plus className="mr-1.5 h-4 w-4" />Nova</button> : null}</div><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-2xl bg-[var(--cliente-primary-soft)] p-3"><p className="text-[10px] font-semibold text-[var(--cliente-primary)]">Enviados</p><p className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">{totals.sent}</p></div><div className="rounded-2xl bg-[var(--cliente-success-soft)] p-3"><p className="text-[10px] font-semibold text-[var(--cliente-success)]">Ativas</p><p className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">{totals.active}</p></div><div className="rounded-2xl bg-[var(--cliente-surface-muted)] p-3"><p className="text-[10px] font-semibold text-[var(--cliente-card-text-soft)]">Números</p><p className="mt-1 text-xl font-bold text-[var(--cliente-card-text)]">{readyChannels}</p></div></div></header><div className="px-4 py-4"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">Suas campanhas</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Crie, acompanhe resultados e retome rascunhos.</p></div><div className="border-y border-[var(--cliente-border)] bg-[var(--cliente-card)]">{campaigns.length ? campaigns.slice(0, 12).map((campaign) => <button key={campaign.id} type="button" onClick={() => onOpen(campaign.id)} className="flex w-full items-center gap-3 border-b border-[var(--cliente-border)] px-4 py-4 text-left last:border-b-0 active:bg-[var(--cliente-surface-muted)]"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--cliente-success-soft)] text-[var(--cliente-success)]"><MessageCircle className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--cliente-card-text)]">{campaign.name}</span><span className="mt-1 block truncate text-xs text-[var(--cliente-card-text-soft)]">{campaign.templateName ? `Modelo ${campaign.templateName}` : 'Mensagem livre'} · {campaign.deliveryMetrics?.responded || 0} respostas</span></span><ChevronRight className="h-5 w-5 shrink-0 text-[var(--cliente-card-text-soft)]" /></button>) : <div className="p-8 text-center"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">Sua primeira campanha começa aqui</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Escolha um público e uma mensagem aprovada.</p>{canManage ? <button type="button" onClick={onCreate} className="mt-4 rounded-xl bg-[var(--cliente-primary)] px-4 py-2.5 text-sm font-semibold text-white">Criar campanha</button> : null}</div>}</div></section>;
}

function HeroMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xl font-black tabular-nums">{value}</p><p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-blue-100">{label}</p></div>;
}

function ImportStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded-[16px] border bg-white px-3 py-2 ${danger ? "border-rose-200 text-rose-700" : "border-emerald-200 text-emerald-800"}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function Feedback({ tone, text }: { tone: "error" | "success"; text: string }) {
  const Icon = tone === "error" ? AlertTriangle : CheckCircle2;
  return (
    <div className={`flex items-center gap-2 rounded-[16px] border px-4 py-3 text-sm ${tone === "error" ? "border-rose-300/30 bg-rose-500/10 text-rose-700" : "border-emerald-300/30 bg-emerald-500/10 text-emerald-700"}`}>
      <Icon className="h-4 w-4 shrink-0" /> {text}
    </div>
  );
}

function CampaignComposer({
  editor,
  channels,
  selectedChannel,
  official,
  templates,
  templateMeta,
  templateError,
  loadingTemplates,
  uploading,
  uploadProgress,
  importing,
  importSummary,
  preview,
  canManage,
  working,
  onChooseChannel,
  onImportFile,
  onRefreshTemplates,
  onUpload,
  onChange,
  onSave,
  onSimulate,
  onDispatch,
}: {
  editor: Campaign;
  channels: Channel[];
  selectedChannel: Channel | null;
  official: boolean;
  templates: WhatsAppTemplate[];
  templateMeta: TemplateMeta | null;
  templateError: string;
  loadingTemplates: boolean;
  uploading: boolean;
  uploadProgress: number | null;
  importing: boolean;
  importSummary: AudienceImportSummary | null;
  preview: Preview | null;
  canManage: boolean;
  working: string | null;
  onChooseChannel: (channel: Channel) => void;
  onImportFile: (file: File) => void;
  onRefreshTemplates: () => void;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<Campaign>) => void;
  onSave: () => void;
  onSimulate: () => void;
  onDispatch: () => void;
}) {
  const capability = getChannelCapability(selectedChannel);
  const selectedTemplate = templates.find((template) => template.name === editor.templateName && template.language === editor.languageCode);
  const requiredHeaderMedia = getTemplateHeaderMediaType(selectedTemplate);
  const messageReady = editor.deliveryMode === "template"
    ? Boolean(editor.templateName) && (!requiredHeaderMedia || editor.headerMedia?.type === requiredHeaderMedia)
    : editor.messageTemplate.trim().length > 9;
  const audienceReady = Boolean(editor.filters.behavior);
  const readyToReview = Boolean(selectedChannel && audienceReady && messageReady);
  const pendingRequirement = !selectedChannel
    ? "Escolha um WhatsApp para continuar."
    : !messageReady && requiredHeaderMedia
      ? `O modelo escolhido precisa de ${requiredHeaderMedia === "image" ? "uma imagem" : requiredHeaderMedia === "video" ? "um vídeo" : "um documento"}.`
      : !messageReady
        ? official ? "Escolha um modelo aprovado para continuar." : "Escreva uma mensagem para continuar."
        : "Escolha concluída: você já pode conferir o público.";

  return (
    <div className="mx-auto max-w-6xl">
      <PanelCard className="overflow-hidden p-0 shadow-[0_18px_55px_rgba(25,45,85,.08)]">
        <div className="border-b border-blue-100 bg-[linear-gradient(120deg,#eff6ff_0%,#f8fbff_58%,#eefcf7_100%)] px-5 py-7 md:px-8 md:py-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[.16em] text-blue-600">Campanha WhatsApp</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 md:text-3xl">Uma boa conversa começa com uma escolha simples.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Defina o público e a mensagem. A Altum cuida das proteções, da cadência e do registro das respostas.</p>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">Seu WhatsApp</p>
              <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-800"><MessageCircle className="h-4 w-4 text-emerald-500" />{selectedChannel?.displayName || "Escolha um número"}</p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">{capability.title}</p>
            </div>
          </div>
          <label className="mt-6 block max-w-xl">
            <span className="text-xs font-bold text-slate-600">Como você quer chamar esta campanha?</span>
            <input value={editor.name} onChange={(event) => onChange({ name: event.target.value })} className="mt-2 w-full border-0 border-b-2 border-blue-200 bg-transparent px-0 py-2 text-lg font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600" placeholder="Ex.: Retomada de propostas de outubro" />
          </label>
        </div>

        <div className="divide-y divide-[var(--cliente-border)]">
          <section className="px-5 py-7 md:px-8 md:py-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">01 · Canal</p><h3 className="mt-1 text-xl font-extrabold text-slate-950">Por qual WhatsApp essa conversa vai acontecer?</h3><p className="mt-1 text-sm text-slate-600">A Altum adapta a campanha ao que cada número realmente pode fazer.</p></div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {channels.map((channel) => {
                const channelCapability = getChannelCapability(channel);
                const selected = channel.id === editor.channelId;
                const isUnavailable = channelCapability.kind === "unavailable";
                const Icon = channelCapability.kind === "meta_template" ? CheckCircle2 : channelCapability.kind === "freeform" ? MessageCircle : AlertTriangle;
                const tone = channelCapability.kind === "meta_template" ? "border-blue-500 bg-blue-50" : channelCapability.kind === "freeform" ? "border-emerald-400 bg-emerald-50" : "border-amber-300 bg-amber-50";
                return (
                  <button key={channel.id} type="button" onClick={() => onChooseChannel(channel)} disabled={isUnavailable} className={`rounded-2xl border p-4 text-left transition ${selected ? `${tone} ring-2 ring-offset-1 ${channelCapability.kind === "meta_template" ? "ring-blue-200" : "ring-emerald-100"}` : "border-slate-200 bg-white hover:border-slate-300"} ${isUnavailable ? "cursor-not-allowed opacity-60" : "hover:-translate-y-0.5"}`}>
                    <div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${channelCapability.kind === "meta_template" ? "bg-blue-600 text-white" : channelCapability.kind === "freeform" ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700"}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-extrabold text-slate-900">{channel.displayName || "WhatsApp"}</p>{selected ? <Check className="h-4 w-4 text-emerald-600" /> : null}</div><p className="mt-1 text-xs font-bold text-slate-600">{channelCapability.title}</p><p className="mt-1 text-xs leading-5 text-slate-500">{channelCapability.description}</p></div></div>
                  </button>
                );
              })}
            </div>
            {!channels.length ? <EmptyState title="Nenhum WhatsApp conectado" description="Conecte um número para criar a primeira campanha." /> : null}
            <div className={`mt-5 flex gap-3 rounded-2xl border p-4 ${capability.kind === "meta_template" ? "border-blue-200 bg-blue-50" : capability.kind === "freeform" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${capability.kind === "meta_template" ? "bg-blue-600 text-white" : capability.kind === "freeform" ? "bg-emerald-500 text-white" : "bg-amber-100 text-amber-700"}`}>{capability.kind === "meta_template" ? <CheckCircle2 className="h-4 w-4" /> : capability.kind === "freeform" ? <MessageCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span>
              <div><p className="text-sm font-extrabold text-slate-900">{capability.title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{capability.description}</p></div>
            </div>
            <ChannelHealthNotice capability={capability} loading={loadingTemplates} error={templateError} templateCount={templates.length} />
          </section>

          <section className="px-5 py-7 md:px-8 md:py-8">
            <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">02 · Público</p><h3 className="mt-1 text-xl font-extrabold text-slate-950">Com quem você quer falar?</h3><p className="mt-1 text-sm text-slate-600">Comece pela intenção da campanha, não pelos filtros.</p></div>
            <AudienceStep editor={editor} importing={importing} importSummary={importSummary} onImportFile={onImportFile} onChange={onChange} />
          </section>

          <section className="px-5 py-7 md:px-8 md:py-8">
            <div className="mb-6"><p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">03 · Mensagem</p><h3 className="mt-1 text-xl font-extrabold text-slate-950">{official ? "Escolha um modelo aprovado" : "Escreva a mensagem que inicia a conversa"}</h3><p className="mt-1 text-sm text-slate-600">{official ? "Estes são os modelos aprovados para o número e a conta Meta selecionados." : "Este número conversa como WhatsApp comum: use uma mensagem direta e personalizada."}</p></div>
            <ContentStep editor={editor} official={official} templates={templates} templateMeta={templateMeta} templateError={templateError} loadingTemplates={loadingTemplates} onRefreshTemplates={onRefreshTemplates} uploading={uploading} uploadProgress={uploadProgress} onUpload={onUpload} onChange={onChange} />
          </section>

          <section className="bg-slate-50/80 px-5 py-7 md:px-8 md:py-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-xs font-black uppercase tracking-[.14em] text-blue-600">04 · Confirmar</p>
                <h3 className="mt-1 text-xl font-extrabold text-slate-950">Pronto para conferir o público?</h3>
                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-600">Antes do envio, mostramos quantas pessoas receberão a campanha e quem foi protegido automaticamente.</p>
              </div>
              <div className={`rounded-2xl border px-4 py-3 ${readyToReview ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <p className="text-xs font-bold text-slate-600">Status da campanha</p>
                <p className={`mt-1 text-sm font-extrabold ${readyToReview ? "text-emerald-700" : "text-amber-700"}`}>{readyToReview ? "Pronta para revisar" : "Faltam escolhas para revisar"}</p>
              </div>
            </div>
            <p className={`mt-4 text-sm font-semibold ${readyToReview ? "text-emerald-700" : "text-amber-700"}`}>{pendingRequirement}</p>
            {preview ? (
              <PreflightResult preview={preview} />
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
              <ClientActionButton tone="secondary" onClick={onSave} disabled={Boolean(working) || !canManage}><Save className="h-4 w-4" /> Salvar rascunho</ClientActionButton>
              <div className="flex flex-wrap gap-2">
                <ClientActionButton tone="secondary" onClick={onSimulate} disabled={Boolean(working) || !readyToReview || !canManage}>{working === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Conferir público</ClientActionButton>
                <ClientActionButton tone="success" onClick={onDispatch} disabled={Boolean(working) || !preview || !editor.id || !canManage}>{working === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {editor.scheduledAt ? "Agendar campanha" : "Enviar campanha"}</ClientActionButton>
              </div>
            </div>
          </section>
        </div>
      </PanelCard>
    </div>
  );
}

function ChannelHealthNotice({ capability, loading, error, templateCount }: { capability: ChannelCapability; loading: boolean; error: string; templateCount: number }) {
  if (capability.kind === "freeform") {
    return <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Canal pronto para mensagem livre. A Altum aplica as proteções de envio antes de disparar.</div>;
  }
  if (capability.kind === "unavailable") {
    return <a href="/cliente/painel/configuracoes/canais" className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">Corrigir conexão deste número <ChevronRight className="h-4 w-4" /></a>;
  }
  if (loading) {
    return <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800"><Loader2 className="h-4 w-4 animate-spin" /> Validando a conexão com a Meta e buscando os modelos aprovados…</div>;
  }
  if (error) {
    return <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3"><p className="text-sm font-bold text-rose-800">A Altum não conseguiu validar os modelos deste número.</p><p className="mt-1 text-xs leading-5 text-rose-700">{error}</p><a href="/cliente/painel/configuracoes/canais" className="mt-2 inline-flex text-sm font-bold text-blue-700 underline underline-offset-4">Corrigir conexão Meta</a></div>;
  }
  if (!templateCount) {
    return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Este número está conectado, mas ainda não há modelos aprovados disponíveis para usar.</div>;
  }
  return <div className="mt-3 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800"><CheckCircle2 className="h-4 w-4" /> Conexão Meta validada: {templateCount} {templateCount === 1 ? "modelo aprovado disponível" : "modelos aprovados disponíveis"}.</div>;
}

function PreflightResult({ preview }: { preview: Preview }) {
  const protectedCount = preview.summary.blockedByConsent + preview.summary.blockedByFrequency + preview.summary.missingPhone;
  const hasRecipients = preview.summary.estimatedSend > 0;
  const protections = [
    { label: "Sem permissão", value: preview.summary.blockedByConsent },
    { label: "Contatos recentes", value: preview.summary.blockedByFrequency },
    { label: "Sem WhatsApp válido", value: preview.summary.missingPhone },
  ].filter((item) => item.value > 0);
  return (
    <div className={`mt-5 rounded-2xl border p-5 ${hasRecipients ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className={`text-base font-extrabold ${hasRecipients ? "text-emerald-900" : "text-amber-900"}`}>{hasRecipients ? "Público conferido. Sua campanha está pronta." : "Nenhum contato apto foi encontrado."}</p><p className="mt-1 text-sm text-slate-600">A Altum checou o público antes de colocar qualquer mensagem na fila.</p></div><StateBadge label={hasRecipients ? "seguro para enviar" : "revise o público"} tone={hasRecipients ? "success" : "warning"} /></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3"><LaunchMetric label="Pessoas encontradas" value={preview.summary.matchedFilters} /><LaunchMetric label="Receberão esta campanha" value={preview.summary.estimatedSend} /><LaunchMetric label="Protegidas automaticamente" value={protectedCount} /></div>
      {protections.length ? <p className="mt-4 text-xs leading-5 text-slate-600">Não receberão agora: {protections.map((item) => `${item.value} ${item.label.toLowerCase()}`).join(" · ")}. Isso ajuda a preservar a saúde do número e a experiência dos contatos.</p> : null}
    </div>
  );
}

function LaunchMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3"><p className="text-2xl font-extrabold text-slate-950">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{label}</p></div>;
}

function SenderStep({ channels, selectedId, onSelect }: { channels: Channel[]; selectedId: string; onSelect: (channel: Channel) => void }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Qual numero vai enviar?</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Cada disparo fica vinculado ao numero escolhido e preserva esse contexto nas respostas.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {channels.map((channel) => {
          const selected = channel.id === selectedId;
          const official = isOfficialChannel(channel);
          const ready = channel.outboundReady || channel.status === "active";
          const agencyManaged = channel.source === "agency_env" || channel.metadata?.source === "agency_env";
          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onSelect(channel)}
              className={`relative overflow-hidden rounded-[18px] border p-4 text-left transition hover:-translate-y-0.5 ${
                selected ? "border-emerald-500 bg-emerald-500/8 shadow-sm" : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[var(--cliente-card-text)]">{channel.displayName || "WhatsApp"}</p>
                    {selected ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span> : null}
                  </div>
                  <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{channel.phoneNumber || "Numero conectado"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <StateBadge label={official ? "API oficial" : "WhatsApp normal"} tone={official ? "info" : "success"} />
                    {agencyManaged ? <StateBadge label="Conta Altum" tone="neutral" /> : null}
                    <StateBadge label={ready ? "pronto" : "revisar conexao"} tone={ready ? "success" : "warning"} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {!channels.length ? <EmptyState title="Nenhum WhatsApp conectado" description="Conecte um numero em Configuracoes > Canais antes de criar o disparo." /> : null}
    </div>
  );
}

function AudienceStep({
  editor,
  importing,
  importSummary,
  onImportFile,
  onChange,
}: {
  editor: Campaign;
  importing: boolean;
  importSummary: AudienceImportSummary | null;
  onImportFile: (file: File) => void;
  onChange: (patch: Partial<Campaign>) => void;
}) {
  const changeFilter = (key: "stageIds" | "ownerIds" | "sources" | "tags" | "heat", value: string) =>
    onChange({ filters: { ...editor.filters, [key]: splitList(value) } });
  const journeys: Array<{ id: AudienceBehavior; label: string; description: string; days: number }> = [
    { id: "no_response", label: "Reativar sem resposta", description: "Recebeu contato e nao respondeu", days: 3 },
    { id: "proposal_stalled", label: "Proposta parada", description: "Negociacao sem atividade recente", days: 3 },
    { id: "inactive", label: "Base inativa", description: "Sem conversa ou atividade", days: 30 },
    { id: "new_inbound", label: "Entradas recentes", description: "Chamaram nos ultimos dias", days: 7 },
    { id: "all", label: "Base filtrada", description: "Usa apenas os filtros abaixo", days: 3 },
  ];
  const selectJourney = (journey: (typeof journeys)[number]) =>
    onChange({
      filters: {
        ...editor.filters,
        behavior: journey.id,
        behaviorWindowDays: journey.days,
      },
    });
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Quem deve receber?</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Escolha primeiro o motivo do contato. A Altum exclui automaticamente opt-out, telefone inválido e contatos recentes.</p>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black text-[var(--cliente-card-text)]">Jornada de publico</p>
          <span className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">Sugestões prontas</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {journeys.map((journey) => {
            const active = editor.filters.behavior === journey.id;
            return (
              <button
                key={journey.id}
                type="button"
                onClick={() => selectJourney(journey)}
                className={`rounded-[16px] border p-3 text-left transition ${active ? "border-[var(--cliente-primary)] bg-blue-500/8 shadow-sm" : "border-[var(--cliente-border)] bg-white hover:border-blue-300"}`}
              >
                <p className="text-xs font-black text-[var(--cliente-card-text)]">{journey.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-[var(--cliente-card-text-soft)]">{journey.description}</p>
              </button>
            );
          })}
        </div>
        {editor.filters.behavior !== "all" ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[16px] border border-blue-200 bg-blue-500/6 p-3">
            <div className="min-w-0"><p className="text-sm font-semibold text-[var(--cliente-card-text)]">Há quanto tempo?</p><p className="mt-0.5 text-xs text-[var(--cliente-card-text-soft)]">Defina quando alguém entra neste público.</p></div>
            <div className="flex items-center gap-1.5">
              {[3, 7, 14, 30].map((days) => (
                <button key={days} type="button" onClick={() => onChange({ filters: { ...editor.filters, behaviorWindowDays: days } })} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${editor.filters.behaviorWindowDays === days ? "bg-[var(--cliente-primary)] text-white" : "bg-white text-[var(--cliente-card-text-soft)] hover:text-[var(--cliente-card-text)]"}`}>{days}d</button>
              ))}
            </div>
            <input
              id="audience-window-days"
              type="number"
              min={editor.filters.behavior === "no_response" ? 3 : 1}
              max={365}
              value={editor.filters.behaviorWindowDays}
              onChange={(event) => onChange({ filters: { ...editor.filters, behaviorWindowDays: Math.max(editor.filters.behavior === "no_response" ? 3 : 1, Math.min(365, Number(event.target.value) || 1)) } })}
              className="client-input w-24 text-center"
            />
            <span className="text-xs text-[var(--cliente-card-text-soft)]">dias. Reativação respeita pelo menos 72h entre campanhas para o mesmo contato.</span>
          </div>
        ) : null}
      </div>

      <details className="mt-5 rounded-[18px] border border-[var(--cliente-border)] bg-white p-4">
        <summary className="cursor-pointer list-none text-sm font-bold text-[var(--cliente-card-text)]">Tenho uma lista pronta ou quero refinar este público <span className="ml-1 text-xs font-normal text-[var(--cliente-card-text-soft)]">opcional</span></summary>
        <div className="mt-4 rounded-[18px] border border-dashed border-emerald-300 bg-emerald-500/8 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-bold text-[var(--cliente-card-text)]">Importar uma lista de contatos</p><p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Excel, CSV ou TXT. Use colunas como nome, telefone, empresa e etiquetas — ou apenas um telefone por linha.</p></div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white"><FileText className="h-4 w-4" />{importing ? "Lendo lista..." : "Escolher lista"}<input type="file" accept=".csv,.txt,.xls,.xlsx,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" disabled={importing} onChange={(event) => { const file = event.target.files?.[0]; if (file) onImportFile(file); event.currentTarget.value = ""; }} /></label>
          </div>
          {importSummary ? <div className="mt-3 grid gap-2 sm:grid-cols-4"><ImportStat label="Importados" value={importSummary.processed} /><ImportStat label="Novos" value={importSummary.created} /><ImportStat label="Atualizados" value={importSummary.updated} /><ImportStat label="Ignorados" value={importSummary.skipped + importSummary.errors} danger={importSummary.errors > 0} /></div> : null}
        </div>
        <div className="mt-4 rounded-2xl bg-[var(--cliente-surface-muted)] p-4">
          <p className="text-sm font-bold text-[var(--cliente-card-text)]">Limitar esta campanha</p>
          <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Comece com uma quantidade menor para acompanhar a resposta.</p>
          <div className="mt-3 flex items-center gap-3"><input type="range" min={1} max={500} step={1} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Number(event.target.value) })} className="w-40 accent-[var(--cliente-primary)]" /><input type="number" min={1} max={500} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Math.max(1, Math.min(500, Number(event.target.value))) })} className="client-input w-20 text-center" /></div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Temperatura" hint="Ex.: quente, morno"><input value={editor.filters.heat.join(", ")} onChange={(event) => changeFilter("heat", event.target.value)} className="client-input" placeholder="quente, morno" /></Field>
          <Field label="Etiquetas" hint="Separe por vírgula"><input value={editor.filters.tags.join(", ")} onChange={(event) => changeFilter("tags", event.target.value)} className="client-input" placeholder="cliente, proposta enviada" /></Field>
          <Field label="Origem" hint="Meta, Google, indicação..."><input value={editor.filters.sources.join(", ")} onChange={(event) => changeFilter("sources", event.target.value)} className="client-input" placeholder="instagram, google_ads" /></Field>
          <Field label="Etapa do funil" hint="Ex.: novo_lead, proposta"><input value={editor.filters.stageIds.join(", ")} onChange={(event) => changeFilter("stageIds", event.target.value)} className="client-input" placeholder="novo_lead, proposta" /></Field>
          <Field label="Ritmo de envio" hint="Contatos por minuto"><input type="number" min={1} max={120} value={editor.sendRatePerMinute} onChange={(event) => onChange({ sendRatePerMinute: Math.max(1, Math.min(120, Number(event.target.value))) })} className="client-input" /></Field>
          <Field label="Agendar" hint="Deixe em branco para enviar agora"><input type="datetime-local" value={formatDateTimeLocal(editor.scheduledAt)} onChange={(event) => onChange({ scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : null })} className="client-input" /></Field>
        </div>
      </details>
      <p className="mt-3 text-xs leading-5 text-[var(--cliente-card-text-soft)]">O total de pessoas aptas é confirmado antes do envio. A Altum já protege contatos que não podem receber esta campanha.</p>
    </div>
  );
}

function flowNodeTone(type: AutomationFlowNodeType) {
  if (type === "send") return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (type === "condition") return "border-amber-300 bg-amber-50 text-amber-900";
  if (type === "ai") return "border-violet-300 bg-violet-50 text-violet-900";
  if (type === "media") return "border-sky-300 bg-sky-50 text-sky-900";
  if (type === "meeting") return "border-blue-300 bg-blue-50 text-blue-900";
  if (type === "human") return "border-rose-300 bg-rose-50 text-rose-900";
  return "border-slate-300 bg-slate-50 text-slate-900";
}

function flowNodeIcon(type: AutomationFlowNodeType) {
  if (type === "send") return Send;
  if (type === "condition") return GitBranch;
  if (type === "ai") return Wand2;
  if (type === "media") return ImageIcon;
  if (type === "meeting") return Clock3;
  if (type === "human") return Users;
  return CheckCircle2;
}

function flowNodeLabel(type: AutomationFlowNodeType) {
  if (type === "send") return "Mensagem";
  if (type === "condition") return "Condicao";
  if (type === "ai") return "IA";
  if (type === "media") return "Arquivo";
  if (type === "meeting") return "Reuniao";
  if (type === "human") return "Humano";
  return "Fim";
}

function FlowBuilder({ flow, onChange }: { flow: AutomationFlow; onChange: (flow: AutomationFlow) => void }) {
  const updateFlow = (patch: Partial<AutomationFlow>) => onChange({ ...flow, ...patch, enabled: true });
  const updateNode = (nodeId: string, patch: Partial<AutomationFlowNode>) =>
    updateFlow({
      nodes: flow.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    });
  const addNode = (type: AutomationFlowNodeType) => {
    let suffix = flow.nodes.length + 1;
    while (flow.nodes.some((node) => node.id === `${type}_${suffix}`)) suffix += 1;
    const id = `${type}_${suffix}`;
    const last = flow.nodes[flow.nodes.length - 1];
    const nextNode: AutomationFlowNode = {
      id,
      type,
      label: flowNodeLabel(type),
      description:
        type === "condition"
          ? "Defina o que o lead precisa responder para seguir por este caminho."
          : type === "media"
            ? "Arquivo, exemplo, video ou documento que a IA pode usar na conversa."
            : type === "human"
              ? "Ponto em que a IA para de responder e avisa o time."
              : "Proximo passo do fluxo.",
      x: Math.min(930, (last?.x || 24) + 210),
      y: last?.y || 42,
    };
    updateFlow({
      nodes: [...flow.nodes, nextNode],
      edges: last ? [...flow.edges, { id: `edge_${last.id}_${id}`, from: last.id, to: id, label: "proximo" }] : flow.edges,
    });
  };
  const removeNode = (nodeId: string) => {
    if (flow.nodes.length <= 1) return;
    updateFlow({
      nodes: flow.nodes.filter((node) => node.id !== nodeId),
      edges: flow.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
    });
  };
  const addEdgeFrom = (from: string, to: string) => {
    if (!from || !to || from === to || flow.edges.some((edge) => edge.from === from && edge.to === to)) return;
    let suffix = flow.edges.length + 1;
    while (flow.edges.some((edge) => edge.id === `edge_${from}_${to}_${suffix}`)) suffix += 1;
    updateFlow({ edges: [...flow.edges, { id: `edge_${from}_${to}_${suffix}`, from, to, label: "regra" }] });
  };
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Fluxo visual do disparo</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--cliente-card-text-soft)]">
            Desenhe o caminho que a IA deve seguir depois do envio: resposta do lead, material enviado, qualificacao, reuniao e handoff.
          </p>
        </div>
        <StateBadge label="arraste os blocos" tone="info" />
      </div>

      <Field label="Objetivo do fluxo" hint="A IA usa isso como norte quando o lead responder.">
        <textarea
          value={flow.objective}
          onChange={(event) => updateFlow({ objective: event.target.value })}
          className="client-input min-h-20 resize-y"
          placeholder="Levar o lead ate uma reuniao qualificada ou venda assistida."
        />
      </Field>

      <div className="grid gap-3 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => onChange(createDiagnosticAutomationFlow())}
          className="rounded-[16px] border border-emerald-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300"
        >
          <p className="text-sm font-black text-[var(--cliente-card-text)]">Modelo: diagnostico e reuniao</p>
          <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">Bom para prospeccao, exemplo de LP, consultoria e qualificacao antes da proposta.</p>
        </button>
        <button
          type="button"
          onClick={() => onChange(createDirectSalesAutomationFlow())}
          className="rounded-[16px] border border-blue-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300"
        >
          <p className="text-sm font-black text-[var(--cliente-card-text)]">Modelo: venda direta</p>
          <p className="mt-1 text-xs leading-5 text-[var(--cliente-card-text-soft)]">Bom quando a resposta ja indica interesse, preco, proposta ou contratacao.</p>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["condition", "ai", "media", "meeting", "human", "end"] as AutomationFlowNodeType[]).map((type) => {
          const Icon = flowNodeIcon(type);
          return (
            <button
              key={type}
              type="button"
              onClick={() => addNode(type)}
              className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-black text-[var(--cliente-card-text)] shadow-sm transition hover:-translate-y-0.5"
            >
              <Icon className="h-3.5 w-3.5" />
              Adicionar {flowNodeLabel(type)}
            </button>
          );
        })}
      </div>

      <div className="relative h-[520px] overflow-auto rounded-[24px] border border-[var(--cliente-border)] bg-[linear-gradient(#e8eef7_1px,transparent_1px),linear-gradient(90deg,#e8eef7_1px,transparent_1px)] bg-[size:28px_28px] p-4">
        <div className="relative h-[470px] min-w-[1120px]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            <defs>
              <marker id="flow-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                <path d="M0,0 L8,4 L0,8 z" fill="#2563eb" />
              </marker>
            </defs>
            {flow.edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              const x1 = from.x + 210;
              const y1 = from.y + 58;
              const x2 = to.x;
              const y2 = to.y + 58;
              const mid = Math.max(x1 + 30, (x1 + x2) / 2);
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    markerEnd="url(#flow-arrow)"
                    stroke="#2563eb"
                    strokeWidth="2.5"
                  />
                  {edge.label ? (
                    <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} fill="#1d4ed8" fontSize="11" fontWeight="800">
                      {edge.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {flow.nodes.map((node) => {
            const Icon = flowNodeIcon(node.type);
            return (
              <div
                key={node.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", node.id);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  const from = event.dataTransfer.getData("text/plain");
                  addEdgeFrom(from, node.id);
                }}
                onDragEnd={(event) => {
                  const board = event.currentTarget.parentElement?.getBoundingClientRect();
                  if (!board) return;
                  const x = Math.max(8, Math.min(980, event.clientX - board.left - 105));
                  const y = Math.max(8, Math.min(360, event.clientY - board.top - 34));
                  updateNode(node.id, { x, y });
                }}
                style={{ left: node.x, top: node.y }}
                className={`absolute w-[230px] rounded-[20px] border p-3 shadow-sm ${flowNodeTone(node.type)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/75">
                      <Icon className="h-4 w-4" />
                    </span>
                    <input
                      value={node.label}
                      onChange={(event) => updateNode(node.id, { label: event.target.value })}
                      className="min-w-0 flex-1 border-0 bg-transparent text-sm font-black outline-none"
                    />
                  </div>
                  <button type="button" onClick={() => removeNode(node.id)} className="rounded-full bg-white/70 p-1 text-rose-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <textarea
                  value={node.description}
                  onChange={(event) => updateNode(node.id, { description: event.target.value })}
                  className="mt-2 h-16 w-full resize-none rounded-[14px] border border-white/80 bg-white/70 p-2 text-xs leading-5 outline-none"
                />
                <textarea
                  value={node.condition || node.message || node.nextAction || ""}
                  onChange={(event) =>
                    updateNode(
                      node.id,
                      node.type === "condition" || node.type === "human"
                        ? { condition: event.target.value }
                        : node.type === "send" || node.type === "media"
                          ? { message: event.target.value }
                          : { nextAction: event.target.value }
                    )
                  }
                  className="mt-2 h-16 w-full resize-none rounded-[14px] border border-white/80 bg-white/80 p-2 text-xs leading-5 outline-none"
                  placeholder="Regra, mensagem ou acao..."
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-[18px] border border-violet-200 bg-violet-500/8 p-4">
        <p className="text-sm font-black text-[var(--cliente-card-text)]">Como a IA vai usar isso</p>
        <p className="mt-1 text-sm leading-6 text-[var(--cliente-card-text-soft)]">
          Quando o lead responder, a Altum le este fluxo junto com a campanha. Os blocos viram orientacao pratica para decidir resposta, material,
          proximo passo, reuniao ou handoff humano.
        </p>
      </div>
    </div>
  );
}

function ContentStep({
  editor,
  official,
  templates,
  templateMeta,
  templateError,
  loadingTemplates,
  onRefreshTemplates,
  uploading,
  uploadProgress,
  onUpload,
  onChange,
}: {
  editor: Campaign;
  official: boolean;
  templates: WhatsAppTemplate[];
  templateMeta: TemplateMeta | null;
  templateError: string;
  loadingTemplates: boolean;
  onRefreshTemplates: () => void;
  uploading: boolean;
  uploadProgress: number | null;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<Campaign>) => void;
}) {
  const [templateSearch, setTemplateSearch] = useState("");
  const selectedTemplate = templates.find(
    (template) => template.name === editor.templateName && template.language === editor.languageCode
  );
  const selectedVariableCount = getTemplateVariableCount(selectedTemplate);
  const selectedPreview = renderTemplateBodyPreview(selectedTemplate, editor.bodyParams);
  const requiredHeaderMedia = getTemplateHeaderMediaType(selectedTemplate);
  const selectedHeader = getTemplateHeaderText(selectedTemplate);
  const selectedFooter = getTemplateFooter(selectedTemplate);
  const selectedButtons = getTemplateButtons(selectedTemplate);
  const variableIndexes = getTemplateVariableIndexes(selectedTemplate);
  const matchingTemplates = templates
    .filter((template) => {
      const searchable = `${template.name} ${template.language} ${template.category} ${getTemplateBody(template)}`.toLowerCase();
      return searchable.includes(templateSearch.trim().toLowerCase());
    })
    .slice(0, 24);

  function selectTemplate(nextTemplate: WhatsAppTemplate) {
    const variableCount = getTemplateVariableCount(nextTemplate);
    onChange({
      templateName: nextTemplate.name,
      languageCode: nextTemplate.language || "pt_BR",
      deliveryMode: "template",
      bodyParams: buildDefaultBodyParams(variableCount, editor.bodyParams),
      headerMedia:
        editor.headerMedia && getTemplateHeaderMediaType(nextTemplate) && editor.headerMedia.type !== getTemplateHeaderMediaType(nextTemplate)
          ? null
          : editor.headerMedia,
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">O que sera enviado?</h3>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
            {official
              ? "A API oficial exige um template aprovado pela Meta para iniciar conversas."
              : "WhatsApp normal permite mensagem livre, personalizada e com midia dentro de uma cadencia responsavel."}
          </p>
        </div>
        <StateBadge label={official ? "template Meta" : "texto livre"} tone={official ? "info" : "success"} />
      </div>
      <div className="mt-5">
        {official ? (
          <div className="space-y-4">
            <div className="rounded-[18px] border border-blue-200 bg-blue-500/8 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">
                    {loadingTemplates ? "Consultando templates na Meta..." : "Templates Meta do remetente"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">
                    {templateMeta?.channel?.displayName || "Numero API oficial"}{" "}
                    {templateMeta?.channel?.phoneNumber ? `- ${templateMeta.channel.phoneNumber}` : ""}
                  </p>
                </div>
                <StateBadge
                  label={loadingTemplates ? "carregando" : `${templates.length} aprovados`}
                  tone={templates.length ? "success" : "info"}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200/70 pt-3">
                <p className="text-xs text-[var(--cliente-card-text-soft)]">Catálogo lido diretamente do WABA deste número.</p>
                <button
                  type="button"
                  onClick={onRefreshTemplates}
                  disabled={loadingTemplates}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 transition hover:text-blue-900 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingTemplates ? "animate-spin" : ""}`} />
                  Atualizar modelos
                </button>
              </div>
              {templateError ? (
                <div className="mt-3 rounded-[14px] border border-rose-300/40 bg-white/75 px-3 py-2 text-xs font-semibold text-rose-700">
                  <p>{templateError}</p>
                  <a href="/cliente/painel/configuracoes/canais" className="mt-2 inline-flex text-blue-700 underline underline-offset-4">
                    Corrigir canal agora
                  </a>
                </div>
              ) : null}
              {!loadingTemplates && !templateError && !templates.length ? (
                <p className="mt-3 rounded-[14px] border border-amber-300/40 bg-white/70 px-3 py-2 text-xs font-semibold text-amber-700">
                  Nenhum template aprovado apareceu para este numero. O template precisa estar aprovado no mesmo WABA do remetente selecionado.
                </p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--cliente-card-text)]">Escolha o modelo</p>
                    <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Apenas modelos aprovados aparecem aqui.</p>
                  </div>
                  <span className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">{templates.length} disponíveis</span>
                </div>
                <label className="relative mt-3 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-soft)]" />
                  <input value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} className="client-input pl-10" placeholder="Buscar por nome, idioma ou texto do modelo" disabled={loadingTemplates} />
                </label>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {matchingTemplates.map((template) => {
                    const active = template.name === editor.templateName && template.language === editor.languageCode;
                    const body = getTemplateBody(template);
                    const media = getTemplateHeaderMediaType(template);
                    return (
                      <button key={`${template.name}_${template.language}`} type="button" onClick={() => selectTemplate(template)} className={`rounded-[16px] border p-3 text-left transition ${active ? "border-[var(--cliente-primary)] bg-[var(--cliente-primary-soft)] shadow-sm" : "border-[var(--cliente-border)] bg-white hover:border-blue-300 hover:bg-blue-50/40"}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 text-sm font-bold text-[var(--cliente-card-text)]">{template.name}</p>
                          {active ? <Check className="h-4 w-4 shrink-0 text-[var(--cliente-primary)]" /> : null}
                        </div>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">{template.category} · {template.language}</p>
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--cliente-card-text-soft)]">{body || "Modelo sem texto no corpo"}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-[var(--cliente-card-text-soft)]">
                          {getTemplateVariableCount(template) ? <span className="rounded-full bg-[var(--cliente-surface-muted)] px-2 py-1">{getTemplateVariableCount(template)} variável(is)</span> : null}
                          {media ? <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">exige {media}</span> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!loadingTemplates && templateSearch && !matchingTemplates.length ? <p className="mt-3 text-sm text-[var(--cliente-card-text-soft)]">Nenhum modelo aprovado corresponde à busca.</p> : null}
                {!loadingTemplates && matchingTemplates.length === 24 ? <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">Mostrando os primeiros 24 resultados. Refine a busca para encontrar outro modelo.</p> : null}
              </div>
              {selectedTemplate ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Modelo selecionado</p><p className="mt-1 text-sm font-semibold text-[var(--cliente-card-text)]">{selectedTemplate.name}</p></div>
                  <div className="rounded-[14px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-3"><p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Idioma aprovado</p><p className="mt-1 text-sm font-semibold text-[var(--cliente-card-text)]">{selectedTemplate.language}</p></div>
                </div>
              ) : null}
              {selectedVariableCount ? (
                <div className="rounded-[18px] border border-[var(--cliente-border)] bg-white p-4">
                  <p className="text-sm font-bold text-[var(--cliente-card-text)]">Personalize a mensagem</p>
                  <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Cada campo substitui a variável correspondente no modelo escolhido.</p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {variableIndexes.map((variableIndex) => (
                      <Field key={variableIndex} label={`Variável {{${variableIndex}}}`} hint="Use dados do contato, como {nome}">
                        <input value={editor.bodyParams[variableIndex - 1] || ""} onChange={(event) => { const next = buildDefaultBodyParams(selectedVariableCount, editor.bodyParams); next[variableIndex - 1] = event.target.value; onChange({ bodyParams: next }); }} className="client-input" placeholder={variableIndex === 1 ? "{nome}" : "Valor da variável"} />
                      </Field>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedTemplate ? (
                <div className="md:col-span-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Prévia do modelo aprovado</p>
                    <StateBadge label={selectedTemplate.category.toLowerCase()} tone="info" />
                  </div>
                  {selectedHeader ? <p className="mt-3 text-sm font-bold text-[var(--cliente-card-text)]">{selectedHeader}</p> : null}
                  {selectedPreview ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--cliente-card-text)]">{selectedPreview}</p> : <p className="mt-2 text-sm text-[var(--cliente-card-text-soft)]">Este modelo não possui texto no corpo.</p>}
                  {selectedFooter ? <p className="mt-3 text-xs text-[var(--cliente-card-text-soft)]">{selectedFooter}</p> : null}
                  {selectedButtons.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedButtons.map((button) => <span key={button} className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-semibold text-blue-700">{button}</span>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {requiredHeaderMedia ? (
                <div className="md:col-span-2 rounded-[18px] border border-amber-300/50 bg-amber-500/10 p-4">
                  <p className="text-sm font-bold text-amber-800">
                    Este template exige {requiredHeaderMedia === "image" ? "imagem" : requiredHeaderMedia === "video" ? "video" : "documento"} no cabecalho.
                  </p>
                  <p className="mt-1 text-sm text-amber-800/80">
                    A midia usada para aprovar o modelo na Meta nao e enviada automaticamente. Anexe aqui a midia real deste disparo.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-[18px] border border-emerald-300/40 bg-emerald-500/8 p-4">
              <p className="text-sm font-bold text-emerald-800">WhatsApp normal conectado</p>
              <p className="mt-1 text-sm text-emerald-800/80">
                Este canal envia como uma conversa comum: escreva qualquer mensagem, use variaveis e anexe imagem, video ou documento se quiser.
              </p>
            </div>
            <Field label="Mensagem livre" hint="Use {nome}, {empresa}, {telefone}, {stage} e {origem}.">
              <textarea
                value={editor.messageTemplate}
                onChange={(event) => onChange({ messageTemplate: event.target.value, deliveryMode: "text" })}
                className="client-input min-h-52 resize-y text-[15px] leading-6"
                placeholder={"Oi, {nome}! Tudo bem?\n\nVi que seu escritorio pode ganhar mais presenca no Google com uma landing page simples e direta para WhatsApp.\n\nPosso te mostrar um exemplo?"}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-4">
              {["{nome}", "{empresa}", "{telefone}", "{origem}"].map((token) => (
                <button
                  key={token}
                  type="button"
                  onClick={() => onChange({ messageTemplate: `${editor.messageTemplate}${editor.messageTemplate.endsWith(" ") || !editor.messageTemplate ? "" : " "}${token}`, deliveryMode: "text" })}
                  className="rounded-[14px] border border-[var(--cliente-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--cliente-card-text)] transition hover:border-emerald-300 hover:bg-emerald-50"
                >
                  Inserir {token}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {editor.headerMedia ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-emerald-300/40 bg-emerald-500/8 p-4">
          <div className="flex min-w-0 items-center gap-3">
            {editor.headerMedia.type === "image" ? <ImageIcon className="h-5 w-5 text-emerald-600" /> : editor.headerMedia.type === "video" ? <Video className="h-5 w-5 text-emerald-600" /> : <FileText className="h-5 w-5 text-emerald-600" />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--cliente-card-text)]">{editor.headerMedia.filename || "Arquivo anexado"}</p>
              <p className="text-xs text-[var(--cliente-card-text-soft)]">{official ? "Cabecalho do template" : "Enviado com a mensagem"}</p>
            </div>
          </div>
          <button type="button" onClick={() => onChange({ headerMedia: null })} className="text-sm font-semibold text-rose-600">Remover</button>
        </div>
      ) : (
        <label className="mt-4 flex cursor-pointer items-center justify-center gap-3 rounded-[18px] border border-dashed border-[var(--cliente-border-strong)] bg-[var(--cliente-surface-muted)] px-4 py-7 text-center transition hover:bg-[var(--cliente-surface-hover)]">
          {uploading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--cliente-primary)]" /> : <ImageIcon className="h-5 w-5 text-[var(--cliente-primary)]" />}
          <span>
            <span className="block text-sm font-semibold text-[var(--cliente-card-text)]">{uploading ? "Enviando arquivo..." : "Adicionar imagem, video ou documento"}</span>
            <span className="mt-1 block text-xs text-[var(--cliente-card-text-soft)]">
              {uploading && uploadProgress !== null
                ? `${uploadProgress}% enviado pelo servidor seguro da Altum.`
                : "Upload seguro. Imagens ate 12 MB, videos ate 64 MB e documentos ate 24 MB."}
            </span>
          </span>
          <input
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx,.txt"
            className="sr-only"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }}
          />
        </label>
      )}
      <AiFollowupEditor editor={editor} onChange={onChange} />
    </div>
  );
}

function AiFollowupEditor({ editor, onChange }: { editor: Campaign; onChange: (patch: Partial<Campaign>) => void }) {
  const update = (patch: Partial<Campaign["aiFollowup"]>) =>
    onChange({ aiFollowup: { ...editor.aiFollowup, ...patch } });

  return (
    <details className="mt-5 rounded-[22px] border border-violet-200 bg-violet-500/8 p-4 md:p-5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-extrabold text-[var(--cliente-card-text)]">O que acontece quando alguém responder?</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
            Opcional: prepare a Altum para continuar a conversa comercial.
          </p>
        </div>
        <StateBadge label="configurar IA" tone="info" />
      </summary>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="Oferta principal" hint="Ex.: Landing page para advogados">
          <input
            value={editor.aiFollowup.offerName}
            onChange={(event) => update({ offerName: event.target.value })}
            className="client-input"
            placeholder="Landing page para advogados"
          />
        </Field>
        <Field label="Link que a IA pode enviar" hint="Exemplo, portfolio, proposta ou material">
          <input
            value={editor.aiFollowup.exampleUrl}
            onChange={(event) => update({ exampleUrl: event.target.value })}
            className="client-input"
            placeholder="https://altumia.com.br/portfolio/advogado3"
          />
        </Field>
        <Field label="Nome do material" hint="Como a IA deve chamar o link">
          <input
            value={editor.aiFollowup.exampleLabel}
            onChange={(event) => update({ exampleLabel: event.target.value })}
            className="client-input"
            placeholder="Exemplo de landing page"
          />
        </Field>
        <Field label="Gatilhos de resposta" hint="Separe por virgula">
          <input
            value={editor.aiFollowup.responseTriggers.join(", ")}
            onChange={(event) => update({ responseTriggers: splitList(event.target.value) })}
            className="client-input"
            placeholder="quero ver, manda exemplo, como fica"
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Promessa da oferta" hint="A leitura que a IA deve usar em uma frase">
            <textarea
              value={editor.aiFollowup.offerSummary}
              onChange={(event) => update({ offerSummary: event.target.value })}
              className="client-input min-h-24 resize-y"
              placeholder="Criar uma LP objetiva para captar interessados no Google e levar direto para WhatsApp."
            />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Proximo passo da IA" hint="O que fazer depois que o lead demonstrar interesse">
            <textarea
              value={editor.aiFollowup.nextStep}
              onChange={(event) => update({ nextStep: event.target.value })}
              className="client-input min-h-24 resize-y"
              placeholder="Enviar o exemplo, explicar o valor e oferecer diagnostico ou reuniao qualificada."
            />
          </Field>
        </div>
        <Field label="Quando chamar humano" hint="Regra simples de handoff">
          <textarea
            value={editor.aiFollowup.handoffRule}
            onChange={(event) => update({ handoffRule: event.target.value })}
            className="client-input min-h-24 resize-y"
            placeholder="Quando pedir proposta, preco fechado, contrato ou atendimento humano."
          />
        </Field>
        <Field label="Observacoes para a IA" hint="Objecoes, tom e detalhes importantes">
          <textarea
            value={editor.aiFollowup.notes}
            onChange={(event) => update({ notes: event.target.value })}
            className="client-input min-h-24 resize-y"
            placeholder="Ser direto, nao prometer resultado garantido e focar em captacao pelo Google."
          />
        </Field>
      </div>
    </details>
  );
}

function ReviewStep({ editor, channel, preview, riskLevel }: { editor: Campaign; channel: Channel | null; preview: Preview | null; riskLevel: string }) {
  const checks = [
    { label: "Numero remetente", value: channel?.displayName || "Nao escolhido", done: Boolean(channel) },
    { label: "Jornada", value: audienceBehaviorLabel(editor.filters), done: true },
    { label: "Publico encontrado", value: preview ? `${preview.summary.matchedFilters} contatos na selecao` : "Simulacao pendente", done: Boolean(preview) },
    { label: "Publico apto", value: preview ? `${preview.summary.estimatedSend} contatos` : "Simulacao pendente", done: Boolean(preview) },
    { label: "Bloqueios", value: preview ? `${preview.summary.blockedByConsent} opt-out | ${preview.summary.blockedByFrequency} contato recente | ${preview.summary.missingPhone} sem telefone` : "Verificado ao simular", done: Boolean(preview) },
    { label: "Conteudo", value: editor.deliveryMode === "template" ? editor.templateName || "Template pendente" : `${editor.messageTemplate.length} caracteres`, done: editor.deliveryMode === "template" ? Boolean(editor.templateName) : editor.messageTemplate.length > 9 },
    { label: "IA no retorno", value: editor.aiFollowup.offerName || editor.aiFollowup.exampleUrl || "Contexto nao definido", done: Boolean(editor.aiFollowup.offerName || editor.aiFollowup.exampleUrl || editor.aiFollowup.nextStep) },
    {
      label: "Fluxo visual",
      value: editor.automationFlow?.enabled
        ? `${editor.automationFlow.nodes.length} etapas guiando a IA`
        : "Opcional, mas recomendado para respostas e handoff",
      done: Boolean(editor.automationFlow?.enabled && editor.automationFlow.nodes.length),
    },
  ];
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Ultima revisao</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">O envio so e liberado depois da simulacao da base.</p>
      <div className="mt-5 divide-y divide-[var(--cliente-border)] rounded-[18px] border border-[var(--cliente-border)]">
        {checks.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{item.value}</p>
            </div>
            {item.done ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <ChevronRight className="h-5 w-5 text-amber-500" />}
          </div>
        ))}
      </div>
      {editor.deliveryMetrics ? (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <DeliveryStat label="Enviados" value={editor.deliveryMetrics.sent} />
          <DeliveryStat label="Entregues" value={editor.deliveryMetrics.delivered} />
          <DeliveryStat label="Lidos" value={editor.deliveryMetrics.read} />
          <DeliveryStat label="Respostas" value={editor.deliveryMetrics.responded} />
          <DeliveryStat label="Conversoes" value={editor.deliveryMetrics.converted} />
          <DeliveryStat label="Falhas" value={editor.deliveryMetrics.failed} danger />
        </div>
      ) : null}
      <div className={`mt-4 rounded-[18px] border p-4 ${riskLevel === "alto" ? "border-rose-300/40 bg-rose-500/8" : riskLevel === "medio" ? "border-amber-300/40 bg-amber-500/8" : "border-emerald-300/40 bg-emerald-500/8"}`}>
        <p className="text-sm font-bold text-[var(--cliente-card-text)]">Risco operacional: {riskLevel}</p>
        <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Limite atual de {editor.maxRecipients} contatos. A Altum respeita opt-out, intervalo de campanha, telefones validos e o remetente selecionado.</p>
      </div>
    </div>
  );
}

function DeliveryStat({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-[14px] bg-[var(--cliente-surface-muted)] p-3 text-center">
      <p className={`text-lg font-extrabold ${danger ? "text-rose-600" : "text-[var(--cliente-card-text)]"}`}>{value}</p>
      <p className="mt-1 text-[10px] font-semibold text-[var(--cliente-card-text-soft)]">{label}</p>
    </div>
  );
}

function PhonePreview({
  editor,
  official,
  templatePreview,
  requiredHeaderMedia,
}: {
  editor: Campaign;
  official: boolean;
  templatePreview?: string;
  requiredHeaderMedia: "image" | "video" | "document" | null;
}) {
  const text = official
    ? editor.templateName
      ? templatePreview || `Template ${editor.templateName}\n${editor.bodyParams.join(" | ")}`
      : "Escolha um template aprovado para visualizar."
    : editor.messageTemplate || "Sua mensagem aparece aqui.";
  const mediaLabel = editor.headerMedia
    ? editor.headerMedia.type === "image"
      ? "Imagem anexada"
      : editor.headerMedia.type === "video"
        ? "Video anexado"
        : "Documento anexado"
    : requiredHeaderMedia
      ? `${requiredHeaderMedia === "image" ? "Imagem" : requiredHeaderMedia === "video" ? "Video" : "Documento"} pendente`
      : "";
  return (
    <div className="mx-auto max-w-[310px] overflow-hidden rounded-[28px] border-[6px] border-slate-900 bg-[#efeae2] shadow-xl">
      <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20"><MessageCircle className="h-4 w-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Previa do WhatsApp</p>
          <p className="text-[11px] text-white/70">mensagem comercial</p>
        </div>
      </div>
      <div className="min-h-[330px] bg-[radial-gradient(circle_at_25%_25%,rgba(255,255,255,.36)_1px,transparent_1px)] bg-[length:18px_18px] p-4 pt-20">
        <div className="ml-auto max-w-[88%] rounded-lg rounded-tr-none bg-[#d9fdd3] p-3 shadow-sm">
          {mediaLabel ? (
            <div className={`mb-2 rounded-md border px-2 py-2 text-[11px] font-semibold ${
              editor.headerMedia ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
            }`}>
              {mediaLabel}
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-slate-800">{text}</p>
          <p className="mt-1 text-right text-[10px] text-slate-500">agora ok</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-[var(--cliente-card-text)]">{label}</span>
      {hint ? <span className="ml-2 text-xs text-[var(--cliente-card-text-soft)]">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
