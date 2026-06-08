"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import { authedFetch } from "@/app/lib/authed-fetch";
import { useClienteTenant } from "@/app/cliente/ClientePanelGuard";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebaseConfig";
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

const STEPS: Array<{ id: Step; label: string; icon: typeof Smartphone }> = [
  { id: "remetente", label: "Remetente", icon: Smartphone },
  { id: "publico", label: "Publico", icon: Users },
  { id: "conteudo", label: "Conteudo", icon: MessageCircle },
  { id: "revisao", label: "Revisao", icon: ShieldCheck },
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
    maxRecipients: 50,
    scheduledAt: null,
    sendRatePerMinute: 20,
    executionStatus: "idle",
    filters: { stageIds: [], ownerIds: [], sources: [], tags: [], heat: [] },
  };
}

function hasGatewayMetadata(channel?: Channel | null) {
  if (!channel?.metadata) return false;
  return Boolean(
    channel.metadata.gatewayEndpoint ||
      channel.metadata.endpointUrl ||
      channel.metadata.apiBaseUrl ||
      channel.metadata.webhookUrl
  );
}

function isOfficialChannel(channel?: Channel | null) {
  if (!channel) return false;
  const normalized = String(channel.provider || "").toLowerCase();
  if (
    normalized === "whatsapp_qr" ||
    normalized === "whatsapp_session" ||
    normalized === "whatsapp_gateway" ||
    normalized === "external_whatsapp"
  ) {
    return false;
  }
  if (normalized.includes("meta") || normalized.includes("cloud")) return true;
  if (hasGatewayMetadata(channel)) return false;
  return Boolean(channel.phoneNumberId || channel.wabaId);
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

function extensionFromFile(file: File, type: "image" | "video" | "document") {
  const fromName = file.name.toLowerCase().match(/\.([a-z0-9]{2,8})$/)?.[1];
  if (fromName) return fromName;
  const mime = file.type.toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("quicktime")) return "mov";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  return type === "document" ? "pdf" : type === "video" ? "mp4" : "jpg";
}

function safeUploadName(value: string) {
  return value.trim().replace(/[^\w.\- ]+/g, "_").slice(0, 180) || `arquivo-${Date.now()}`;
}

function buildUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function normalizeAudienceFileContent(fileName: string, content: string) {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (extension === "xls" || extension === "xlsx") {
    throw new Error("Por enquanto envie em CSV ou TXT. No Excel, use Salvar como > CSV e suba o arquivo gerado.");
  }

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
  const [editor, setEditor] = useState<Campaign>(emptyCampaign);
  const [selectedId, setSelectedId] = useState("");
  const [step, setStep] = useState<Step>("remetente");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"save" | "preview" | "send" | "delete" | "media" | "audience" | null>(null);
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
    setEditor({ ...emptyCampaign(), ...selected });
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
    const checks = [
      Boolean(editor.name.trim()),
      Boolean(editor.channelId),
      editor.deliveryMode === "template" ? Boolean(editor.templateName.trim()) : editor.messageTemplate.trim().length >= 10,
      editor.deliveryMode !== "template" || !requiredHeaderMedia || editor.headerMedia?.type === requiredHeaderMedia,
      Boolean(editor.aiFollowup.offerName.trim() || editor.aiFollowup.exampleUrl.trim() || editor.aiFollowup.nextStep.trim()),
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
  }, [editor.channelId, officialChannel, tenant?.tenantId]);

  function createNew() {
    const firstChannel = readyChannels[0] || channels[0];
    const next = emptyCampaign();
    if (firstChannel) {
      next.channelId = firstChannel.id;
      next.deliveryMode = isOfficialChannel(firstChannel) ? "template" : "text";
    }
    setEditor(next);
    setSelectedId("");
    setPreview(null);
    setAudienceImport(null);
    setStep("remetente");
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

  async function importAudienceFile(file: File) {
    if (!tenant?.tenantId || !canManage) return;
    setWorking("audience");
    setError("");
    setNotice("");
    try {
      const content = normalizeAudienceFileContent(file.name, await file.text());
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
        `${payload.queued || 0} contatos colocados na fila em ${payload.jobs || 0} lote(s).`
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
    try {
      const type = inferUploadType(file);
      if (!type) {
        throw new Error("Envie uma imagem, video, PDF ou documento compativel.");
      }
      const maxBytes = uploadLimitFor(type);
      if (!file.size || file.size > maxBytes) {
        throw new Error(`Arquivo acima do limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
      }

      const fileName = safeUploadName(file.name);
      const extension = extensionFromFile(file, type);
      const path = `outbound-media/${tenant.tenantId}/${new Date().toISOString().slice(0, 10)}/${buildUploadId()}.${extension}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file, {
        contentType: file.type || "application/octet-stream",
        customMetadata: {
          tenantId: tenant.tenantId,
          purpose: "outbound_campaign",
          originalName: fileName,
        },
      });
      const link = await getDownloadURL(ref);
      setEditor((current) => ({
        ...current,
        headerMedia: {
          type,
          link,
          filename: fileName,
          contentType: file.type || "application/octet-stream",
          size: file.size,
          storagePath: path,
        },
      }));
      setPreview(null);
      setNotice(`${file.name} anexado ao disparo.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao subir arquivo no Storage.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return <div className="flex min-h-[45vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-primary)]" /></div>;
  }

  return (
    <div className="space-y-5 pb-24 lg:pb-8">
      <SectionHeader
        title="Disparos em Massa"
        subtitle="Escolha o numero, segmente a base, revise a mensagem e acompanhe cada envio."
        action={
          canManage ? (
            <ClientActionButton tone="primary" onClick={createNew}>
              <Plus className="h-4 w-4" /> Novo disparo
            </ClientActionButton>
          ) : null
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryMetric label="Enviados" value={totals.sent} icon={Send} tone="text-emerald-600" />
        <SummaryMetric label="Ativos" value={totals.active} icon={Play} tone="text-blue-600" />
        <SummaryMetric label="Falhas" value={totals.failed} icon={AlertTriangle} tone="text-rose-600" />
        <SummaryMetric label="Numeros prontos" value={readyChannels.length} icon={Smartphone} tone="text-violet-600" />
      </section>

      {error ? <Feedback tone="error" text={error} /> : null}
      {notice ? <Feedback tone="success" text={notice} /> : null}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_310px]">
        <aside className="order-2 xl:order-1">
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
            </div>

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

            <div className="p-4 md:p-6">
              {step === "remetente" ? (
                <SenderStep channels={channels} selectedId={editor.channelId} onSelect={chooseChannel} />
              ) : null}
              {step === "publico" ? (
                <AudienceStep
                  editor={editor}
                  importing={working === "audience"}
                  importSummary={audienceImport}
                  onImportFile={(file) => void importAudienceFile(file)}
                  onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
                />
              ) : null}
              {step === "conteudo" ? (
                <ContentStep
                  editor={editor}
                  official={officialChannel}
                  templates={templates}
                  templateMeta={templateMeta}
                  templateError={templateError}
                  loadingTemplates={loadingTemplates}
                  uploading={working === "media"}
                  onUpload={uploadMedia}
                  onChange={(patch) => { setEditor((current) => ({ ...current, ...patch })); setPreview(null); }}
                />
              ) : null}
              {step === "revisao" ? (
                <ReviewStep editor={editor} channel={selectedChannel} preview={preview} riskLevel={riskLevel} />
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-4 py-4 md:px-6">
              <div className="flex gap-2">
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
                <ClientActionButton tone="secondary" onClick={() => void simulate()} disabled={Boolean(working) || !editor.channelId || !canManage}>
                  {working === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />} Simular
                </ClientActionButton>
                <ClientActionButton tone="success" onClick={() => void dispatch()} disabled={Boolean(working) || !preview || !editor.id || !canManage}>
                  {working === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {editor.scheduledAt ? "Agendar" : "Enviar agora"}
                </ClientActionButton>
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
    </div>
  );
}

function SummaryMetric({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof Send; tone: string }) {
  return (
    <PanelCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--cliente-card-text-soft)]">{label}</p>
          <p className="mt-1 text-2xl font-extrabold text-[var(--cliente-card-text)]">{value}</p>
        </div>
        <Icon className={`h-5 w-5 ${tone}`} />
      </div>
    </PanelCard>
  );
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
  const changeFilter = (key: keyof Campaign["filters"], value: string) =>
    onChange({ filters: { ...editor.filters, [key]: splitList(value) } });
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--cliente-card-text)]">Quem deve receber?</h3>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Suba uma lista propria ou use filtros da base. Quem pediu para nao receber sera removido automaticamente.</p>

      <div className="mt-5 rounded-[22px] border border-dashed border-emerald-300 bg-emerald-500/8 p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-black text-[var(--cliente-card-text)]">Importar contatos por arquivo</p>
            <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-soft)]">
              Aceita CSV/TXT com colunas como telefone, nome, empresa e origem. Se for uma lista simples, coloque um telefone por linha.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-emerald-500 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-600">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            {importing ? "Importando" : "Subir lista"}
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              disabled={importing}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImportFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        {importSummary ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <ImportStat label="Importados" value={importSummary.processed} />
            <ImportStat label="Novos" value={importSummary.created} />
            <ImportStat label="Atualizados" value={importSummary.updated} />
            <ImportStat label="Ignorados" value={importSummary.skipped + importSummary.errors} danger={importSummary.errors > 0} />
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label="Temperatura" hint="Ex.: quente, morno">
          <input value={editor.filters.heat.join(", ")} onChange={(event) => changeFilter("heat", event.target.value)} className="client-input" placeholder="quente, morno" />
        </Field>
        <Field label="Etiquetas" hint="Separe por virgula">
          <input value={editor.filters.tags.join(", ")} onChange={(event) => changeFilter("tags", event.target.value)} className="client-input" placeholder="cliente, proposta enviada" />
        </Field>
        <Field label="Origem" hint="Meta, Google, indicacao...">
          <input value={editor.filters.sources.join(", ")} onChange={(event) => changeFilter("sources", event.target.value)} className="client-input" placeholder="instagram, google_ads" />
        </Field>
        <Field label="Etapa do funil" hint="Use o identificador da etapa">
          <input value={editor.filters.stageIds.join(", ")} onChange={(event) => changeFilter("stageIds", event.target.value)} className="client-input" placeholder="novo_lead, proposta" />
        </Field>
      </div>
      <div className="mt-5 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--cliente-card-text)]">Limite desta execucao</p>
            <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">Comece pequeno e aumente depois de validar resposta e entrega.</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="range" min={1} max={500} step={1} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Number(event.target.value) })} className="w-36 accent-[var(--cliente-primary)]" />
            <input type="number" min={1} max={500} value={editor.maxRecipients} onChange={(event) => onChange({ maxRecipients: Math.max(1, Math.min(500, Number(event.target.value))) })} className="client-input w-20 text-center" />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 rounded-[18px] border border-[var(--cliente-border)] p-4 md:grid-cols-2">
        <Field label="Velocidade" hint="Contatos por minuto">
          <input
            type="number"
            min={1}
            max={120}
            value={editor.sendRatePerMinute}
            onChange={(event) => onChange({ sendRatePerMinute: Math.max(1, Math.min(120, Number(event.target.value))) })}
            className="client-input"
          />
        </Field>
        <Field label="Agendamento" hint="Deixe vazio para iniciar agora">
          <input
            type="datetime-local"
            value={formatDateTimeLocal(editor.scheduledAt)}
            onChange={(event) => onChange({ scheduledAt: event.target.value ? new Date(event.target.value).toISOString() : null })}
            className="client-input"
          />
        </Field>
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
  uploading,
  onUpload,
  onChange,
}: {
  editor: Campaign;
  official: boolean;
  templates: WhatsAppTemplate[];
  templateMeta: TemplateMeta | null;
  templateError: string;
  loadingTemplates: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<Campaign>) => void;
}) {
  const selectedTemplate = templates.find(
    (template) => template.name === editor.templateName && template.language === editor.languageCode
  );
  const selectedVariableCount = getTemplateVariableCount(selectedTemplate);
  const selectedPreview = renderTemplateBodyPreview(selectedTemplate, editor.bodyParams);
  const requiredHeaderMedia = getTemplateHeaderMediaType(selectedTemplate);

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

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Template aprovado" hint="Vem direto da Meta">
                <select
                  value={`${editor.templateName}|${editor.languageCode}`}
                  onChange={(event) => {
                    const [templateName, languageCode] = event.target.value.split("|");
                    const nextTemplate = templates.find(
                      (template) => template.name === templateName && template.language === (languageCode || "pt_BR")
                    );
                    const variableCount = getTemplateVariableCount(nextTemplate);
                    onChange({
                      templateName,
                      languageCode: languageCode || "pt_BR",
                      deliveryMode: "template",
                      bodyParams: buildDefaultBodyParams(variableCount, editor.bodyParams),
                      headerMedia:
                        editor.headerMedia && getTemplateHeaderMediaType(nextTemplate) && editor.headerMedia.type !== getTemplateHeaderMediaType(nextTemplate)
                          ? null
                          : editor.headerMedia,
                    });
                  }}
                  className="client-input"
                  disabled={loadingTemplates}
                >
                  <option value={`|${editor.languageCode}`}>{loadingTemplates ? "Consultando Meta..." : "Selecione um template aprovado"}</option>
                  {templates.map((template) => (
                    <option key={`${template.name}_${template.language}`} value={`${template.name}|${template.language}`}>
                      {template.name} - {template.language} - {template.category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Idioma" hint="Codigo aprovado">
                <select value={editor.languageCode} onChange={(event) => onChange({ languageCode: event.target.value })} className="client-input">
                  <option value="pt_BR">Portugues (Brasil)</option>
                  <option value="en_US">English (US)</option>
                  <option value="es">Espanol</option>
                </select>
              </Field>
              <div className="md:col-span-2">
                <Field
                  label="Variaveis do template"
                  hint={selectedVariableCount ? `${selectedVariableCount} variavel(is) esperada(s)` : "Este template nao exige variaveis"}
                >
                  <textarea
                    value={editor.bodyParams.join("\n")}
                    onChange={(event) => onChange({ bodyParams: event.target.value.split("\n").map((item) => item.trim()).slice(0, 20) })}
                    className="client-input min-h-28 resize-y"
                    placeholder={selectedVariableCount ? "{nome}\nNome da oferta" : "Sem variaveis"}
                  />
                </Field>
              </div>
              {selectedPreview ? (
                <div className="md:col-span-2 rounded-[18px] border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--cliente-card-text-soft)]">Previa do template</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--cliente-card-text)]">{selectedPreview}</p>
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
            <span className="mt-1 block text-xs text-[var(--cliente-card-text-soft)]">Upload direto. Imagens ate 12 MB, videos ate 64 MB e documentos ate 24 MB.</span>
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
    <div className="mt-5 rounded-[22px] border border-violet-200 bg-violet-500/8 p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-extrabold text-[var(--cliente-card-text)]">IA depois da resposta</p>
          <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">
            O que a Altum deve saber para continuar a venda quando alguem responder este disparo.
          </p>
        </div>
        <StateBadge label="contexto comercial" tone="info" />
      </div>

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
    </div>
  );
}

function ReviewStep({ editor, channel, preview, riskLevel }: { editor: Campaign; channel: Channel | null; preview: Preview | null; riskLevel: string }) {
  const checks = [
    { label: "Numero remetente", value: channel?.displayName || "Nao escolhido", done: Boolean(channel) },
    { label: "Publico apto", value: preview ? `${preview.summary.estimatedSend} contatos` : "Simulacao pendente", done: Boolean(preview) },
    { label: "Consentimento", value: preview ? `${preview.summary.blockedByConsent} removidos` : "Verificado ao simular", done: Boolean(preview) },
    { label: "Conteudo", value: editor.deliveryMode === "template" ? editor.templateName || "Template pendente" : `${editor.messageTemplate.length} caracteres`, done: editor.deliveryMode === "template" ? Boolean(editor.templateName) : editor.messageTemplate.length > 9 },
    { label: "IA no retorno", value: editor.aiFollowup.offerName || editor.aiFollowup.exampleUrl || "Contexto nao definido", done: Boolean(editor.aiFollowup.offerName || editor.aiFollowup.exampleUrl || editor.aiFollowup.nextStep) },
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
        <p className="mt-1 text-sm text-[var(--cliente-card-text-soft)]">Limite atual de {editor.maxRecipients} contatos. A Altum respeita opt-out, telefones validos e o remetente selecionado.</p>
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
