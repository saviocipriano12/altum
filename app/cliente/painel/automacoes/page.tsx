"use client";

import Link from "next/link";
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  Loader2,
  MessageSquareCode,
  MoveDown,
  MoveUp,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Workflow,
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
import { getPipelineStageLabel, normalizePipelineStageId } from "@/lib/pipeline";
import { getBusinessProfile, type BusinessProfileId } from "@/lib/business-profiles";

type AutomationActionType = "create_task" | "add_note" | "add_tag" | "set_priority" | "send_message";
type AutomationTrigger =
  | "lead_created"
  | "lead_stage_changed"
  | "message_received"
  | "waiting_for_reply"
  | "ai_next_action"
  | "budget_approved"
  | "finance_paid";

type AutomationItem = {
  id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  status: "active" | "paused";
  conditions?: {
    stageIn?: string[];
    sourceIn?: string[];
    channelIn?: string[];
    aiNextActionIn?: string[];
    scoreGte?: number | null;
    waitAtLeastHours?: number | null;
  };
  actions: Array<{
    type: AutomationActionType;
    title?: string;
    text?: string;
    tag?: string;
    priority?: string;
    taskType?: string;
    dueInHours?: number | null;
    waitInHours?: number | null;
    sequenceOrder?: number | null;
  }>;
};

type ExecutionItem = {
  id: string;
  automationId?: string;
  automationName?: string;
  trigger?: string;
  leadId?: string;
  chatId?: string;
  channel?: string | null;
  matched?: boolean;
  status?: string;
  actionsExecuted?: number;
  detail?: string;
  lastError?: string;
  updatedAt?: unknown;
};

type QueueItem = {
  id: string;
  chatId: string;
  status: "pending" | "processing" | "retrying" | "done" | "dead_letter";
  attempts: number;
  lastError?: string;
  updatedAt?: unknown;
};

type AutomationSummaryResponse = {
  summary?: {
    activeAutomations?: number;
    monitoredConversations?: number;
    pausedConversations?: number;
    kbDocs?: number;
    guardrails?: number;
    queue?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
    };
    scheduled?: {
      pending?: number;
      processing?: number;
      retrying?: number;
      done?: number;
      deadLetter?: number;
    };
    processedTotal?: number;
    aiEnabled?: boolean;
    waitingReplyBacklog?: number;
    slaBreached?: number;
  };
  automations?: AutomationItem[];
  recentExecutions?: ExecutionItem[];
  recentQueue?: QueueItem[];
  error?: string;
};

type ActionDraft = {
  type: AutomationActionType;
  title: string;
  text: string;
  tag: string;
  priority: string;
  taskType: string;
  dueInHours: string;
  waitInHours: string;
  sequenceOrder: string;
};

type AutomationDraft = {
  id?: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  enabled: boolean;
  status: "active" | "paused";
  stageIn: string[];
  sourceInInput: string;
  channelInInput: string;
  aiNextActionInInput: string;
  scoreGte: string;
  waitAtLeastHours: string;
  actions: ActionDraft[];
};

type AutomationStatusFilter = "all" | "active" | "paused";
type ExecutionStatusFilter = "all" | "done" | "skipped" | "error";
type QueueStatusFilter = "all" | QueueItem["status"];
type AutomationTemplateKey = "lead_hot" | "reply_recovery" | "ai_copilot" | "budget_followup" | "payment_care";

type TenantSettingsPayload = {
  settings?: {
    businessProfileId?: BusinessProfileId | string;
  };
};

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  lead_created: "Lead criado",
  lead_stage_changed: "Mudanca de etapa",
  message_received: "Mensagem recebida",
  waiting_for_reply: "Sem resposta do time",
  ai_next_action: "Sinal operacional da IA",
  budget_approved: "Proposta aprovada",
  finance_paid: "Receita paga",
};

const ACTION_LABELS: Record<AutomationActionType, string> = {
  create_task: "Criar tarefa",
  add_note: "Adicionar nota",
  add_tag: "Adicionar tag",
  set_priority: "Definir prioridade",
  send_message: "Enviar mensagem",
};

const AUTOMATION_TEMPLATE_LABELS: Record<AutomationTemplateKey, { title: string; description: string }> = {
  lead_hot: {
    title: "Entrada comercial forte",
    description: "Marca lead quente, sobe prioridade e cria follow-up imediato quando um lead entra.",
  },
  reply_recovery: {
    title: "Recuperacao de conversa",
    description: "Detecta conversa parada, envia mensagem de retomada e cria tarefa para o responsavel.",
  },
  budget_followup: {
    title: "Pos proposta aprovada",
    description: "Registra nota comercial, sobe prioridade e cria tarefa de fechamento apos aprovacao.",
  },
  ai_copilot: {
    title: "Assistente comercial",
    description: "Quando a IA indicar agenda, proposta ou escalada, a operacao ja recebe tarefa e contexto.",
  },
  payment_care: {
    title: "Receita confirmada",
    description: "Ativa nota de pos-venda e tarefa de onboarding quando o pagamento entra.",
  },
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

function createEmptyAction(type: AutomationActionType = "create_task"): ActionDraft {
  return {
    type,
    title: "",
    text: "",
    tag: "",
    priority: "medium",
    taskType: "follow_up",
    dueInHours: "24",
    waitInHours: "",
    sequenceOrder: "",
  };
}

function asNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortActionDrafts(actions: ActionDraft[]) {
  return [...actions].sort((a, b) => {
    const orderDiff = asNumber(a.sequenceOrder) - asNumber(b.sequenceOrder);
    if (orderDiff !== 0) return orderDiff;
    return asNumber(a.waitInHours) - asNumber(b.waitInHours);
  });
}

function getActionSummary(action: {
  type: AutomationActionType;
  title?: string;
  text?: string;
  tag?: string;
  priority?: string;
  dueInHours?: number | null;
  waitInHours?: number | null;
  taskType?: string;
}) {
  if (action.type === "create_task") {
    return `${action.title || "Tarefa automatica"} · vence em ${action.dueInHours || 0}h`;
  }
  if (action.type === "add_note") {
    return action.text || "Nota automatica";
  }
  if (action.type === "add_tag") {
    return `Tag ${action.tag || "sem_tag"}`;
  }
  if (action.type === "set_priority") {
    return `Prioridade ${action.priority || "medium"}`;
  }
  return action.text || "Mensagem automatica";
}

function getCadenceLabel(waitInHours?: number | null) {
  const hours = Number(waitInHours || 0);
  if (hours <= 0) return "Agora";
  if (hours < 24) return `T+${hours}h`;
  const days = Number((hours / 24).toFixed(hours % 24 === 0 ? 0 : 1));
  return `T+${days}d`;
}

function createEmptyDraft(): AutomationDraft {
  return {
    name: "",
    description: "",
    trigger: "lead_created",
    enabled: true,
    status: "active",
    stageIn: [],
    sourceInInput: "",
    channelInInput: "",
    aiNextActionInInput: "",
    scoreGte: "",
    waitAtLeastHours: "",
    actions: [createEmptyAction()],
  };
}

function draftFromAutomation(item: AutomationItem): AutomationDraft {
  return {
    id: item.id,
    name: item.name || "",
    description: item.description || "",
    trigger: item.trigger || "lead_created",
    enabled: item.enabled !== false,
    status: item.status === "paused" ? "paused" : "active",
    stageIn: item.conditions?.stageIn || [],
    sourceInInput: (item.conditions?.sourceIn || []).join(", "),
    channelInInput: (item.conditions?.channelIn || []).join(", "),
    aiNextActionInInput: (item.conditions?.aiNextActionIn || []).join(", "),
    scoreGte: typeof item.conditions?.scoreGte === "number" ? String(item.conditions.scoreGte) : "",
    waitAtLeastHours:
      typeof item.conditions?.waitAtLeastHours === "number" ? String(item.conditions.waitAtLeastHours) : "",
    actions: (item.actions || []).map((action) => ({
      type: action.type,
      title: action.title || "",
      text: action.text || "",
      tag: action.tag || "",
      priority: action.priority || "medium",
      taskType: action.taskType || "follow_up",
      dueInHours: typeof action.dueInHours === "number" ? String(action.dueInHours) : "",
      waitInHours: typeof action.waitInHours === "number" ? String(action.waitInHours) : "",
      sequenceOrder: typeof action.sequenceOrder === "number" ? String(action.sequenceOrder) : "",
    })),
  };
}

function normalizeDraft(draft: AutomationDraft) {
  const sortedActions = sortActionDrafts(draft.actions).map((action, index) => ({
    ...action,
    sequenceOrder: action.sequenceOrder || String(index + 1),
  }));

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    trigger: draft.trigger,
    enabled: draft.enabled,
    status: draft.status,
    conditions: {
      stageIn: draft.stageIn,
      sourceIn: draft.sourceInInput
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      channelIn: draft.channelInInput
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      aiNextActionIn: draft.aiNextActionInInput
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
      scoreGte: draft.scoreGte ? Number(draft.scoreGte) : null,
      waitAtLeastHours: draft.waitAtLeastHours ? Number(draft.waitAtLeastHours) : null,
    },
    actions: sortedActions
      .map((action) => ({
        type: action.type,
        title: action.title.trim(),
        text: action.text.trim(),
        tag: action.tag.trim().toLowerCase(),
        priority: action.priority.trim().toLowerCase(),
        taskType: action.taskType.trim().toLowerCase(),
        dueInHours: action.dueInHours ? Number(action.dueInHours) : null,
        waitInHours: action.waitInHours ? Number(action.waitInHours) : null,
        sequenceOrder: action.sequenceOrder ? Number(action.sequenceOrder) : null,
      }))
      .filter((action) => {
        if (action.type === "create_task") return Boolean(action.title);
        if (action.type === "add_note") return Boolean(action.text);
        if (action.type === "add_tag") return Boolean(action.tag);
        if (action.type === "set_priority") return Boolean(action.priority);
        if (action.type === "send_message") return Boolean(action.text);
        return false;
      }),
  };
}

function createTemplateDraft(key: AutomationTemplateKey, profile?: ReturnType<typeof getBusinessProfile>): AutomationDraft {
  const normalizedStages = (profile?.pipeline.stages || []).map((stage) => normalizePipelineStageId(stage));
  const firstStage = normalizedStages[0] || "captado";
  const proposalStage = normalizedStages.find((stage) => ["proposta", "orcamento"].includes(stage)) || "proposta";
  const closeStage = normalizedStages.find((stage) => ["fechamento", "negociacao", "onboarding", "ganho", "realizado"].includes(stage)) || "fechamento";

  if (key === "reply_recovery") {
    return {
      name: "Recuperar conversa sem resposta",
      description: "Retoma atendimento quando o cliente fica aguardando resposta do time acima da janela definida.",
      trigger: "waiting_for_reply",
      enabled: true,
      status: "active",
      stageIn: [],
      sourceInInput: "",
      channelInInput: "whatsapp, instagram, messenger, site_chat",
      aiNextActionInInput: "",
      scoreGte: "",
      waitAtLeastHours: "2",
      actions: [
        {
          ...createEmptyAction("send_message"),
          text: "Oi! Passei aqui para retomar seu atendimento. Se quiser, posso te ajudar a seguir com a proxima etapa.",
          sequenceOrder: "1",
        },
        {
          ...createEmptyAction("create_task"),
          title: "Retomar conversa sem resposta",
          priority: "high",
          dueInHours: "2",
          waitInHours: "0",
          sequenceOrder: "2",
        },
      ],
    };
  }

  if (key === "budget_followup") {
    return {
      name: "Follow-up de proposta aprovada",
      description: "Aciona o time comercial assim que a proposta for marcada como aprovada.",
      trigger: "budget_approved",
      enabled: true,
      status: "active",
      stageIn: [proposalStage, closeStage].filter(Boolean),
      sourceInInput: "",
      channelInInput: "",
      aiNextActionInInput: "",
      scoreGte: "",
      waitAtLeastHours: "",
      actions: [
        {
          ...createEmptyAction("add_note"),
          text: "Proposta aprovada. Lead pronto para fechamento.",
          sequenceOrder: "1",
        },
        {
          ...createEmptyAction("set_priority"),
          priority: "high",
          sequenceOrder: "2",
        },
        {
          ...createEmptyAction("create_task"),
          title: "Confirmar fechamento apos proposta aprovada",
          taskType: "proposta",
          priority: "high",
          dueInHours: "4",
          sequenceOrder: "3",
        },
      ],
    };
  }

  if (key === "payment_care") {
    return {
      name: "Onboarding apos pagamento",
      description: "Cria nota de contexto e tarefa de onboarding quando a receita e confirmada.",
      trigger: "finance_paid",
      enabled: true,
      status: "active",
      stageIn: [closeStage],
      sourceInInput: "",
      channelInInput: "",
      aiNextActionInInput: "",
      scoreGte: "",
      waitAtLeastHours: "",
      actions: [
        {
          ...createEmptyAction("add_note"),
          text: "Pagamento confirmado. Iniciar onboarding e alinhar proxima entrega.",
          sequenceOrder: "1",
        },
        {
          ...createEmptyAction("create_task"),
          title: "Iniciar onboarding do cliente",
          taskType: "pendencia",
          priority: "medium",
          dueInHours: "24",
          sequenceOrder: "2",
        },
      ],
    };
  }

  if (key === "ai_copilot") {
    return {
      name: "Assistente comercial em acao",
      description: "Converte sinais da IA em tarefa, nota e prioridade para o time comercial agir mais rapido.",
      trigger: "ai_next_action",
      enabled: true,
      status: "active",
      stageIn: [],
      sourceInInput: "",
      channelInInput: "",
      aiNextActionInInput: "preparar_proposta_comercial, agendar_proximo_passo, assumir_handoff_humano",
      scoreGte: "",
      waitAtLeastHours: "",
      actions: [
        {
          ...createEmptyAction("set_priority"),
          priority: "high",
          sequenceOrder: "1",
        },
        {
          ...createEmptyAction("add_note"),
          text: "A IA sinalizou proximo passo comercial. Revisar contexto do cliente e agir no atendimento.",
          sequenceOrder: "2",
        },
        {
          ...createEmptyAction("create_task"),
          title: "Executar proximo passo sugerido pela IA",
          taskType: "follow_up",
          priority: "high",
          dueInHours: "2",
          sequenceOrder: "3",
        },
      ],
    };
  }

  return {
    name: "Entrada comercial forte",
    description: "Prioriza leads de entrada e dispara a primeira acao operacional do time.",
    trigger: "lead_created",
    enabled: true,
    status: "active",
    stageIn: [firstStage],
    sourceInInput: "",
    channelInInput: "whatsapp, meta_ads, google_ads, site_form",
    aiNextActionInInput: "",
    scoreGte: "70",
    waitAtLeastHours: "",
    actions: [
      {
        ...createEmptyAction("set_priority"),
        priority: "high",
        sequenceOrder: "1",
      },
      {
        ...createEmptyAction("add_tag"),
        tag: "entrada_quente",
        sequenceOrder: "2",
      },
      {
        ...createEmptyAction("create_task"),
        title: "Entrar em contato com lead quente",
        taskType: "follow_up",
        priority: "high",
        dueInHours: "1",
        sequenceOrder: "3",
      },
    ],
  };
}

function formatExecutionStatusLabel(status?: string) {
  if (status === "error") return "Erro";
  if (status === "skipped") return "Ignorada";
  if (status === "done") return "Concluida";
  return "Em execucao";
}

function getExecutionStatusTone(status?: string) {
  if (status === "error") return "danger" as const;
  if (status === "skipped") return "warning" as const;
  return "success" as const;
}

function formatQueueJobLabel(status: QueueItem["status"]) {
  if (status === "dead_letter") return "Precisa revisao";
  if (status === "retrying") return "Tentando de novo";
  if (status === "processing") return "Processando";
  if (status === "done") return "Concluido";
  return "Pendente";
}

function getQueueJobTone(status: QueueItem["status"]) {
  if (status === "dead_letter") return "danger" as const;
  if (status === "retrying") return "warning" as const;
  if (status === "done") return "success" as const;
  return "info" as const;
}

function formatChannelLabel(channel?: string | null) {
  if (channel === "site_chat") return "Site chat";
  if (channel === "site_form") return "Site form";
  if (channel === "meta_ads") return "Meta Ads";
  if (channel === "google_ads") return "Google Ads";
  if (!channel) return "Canal";
  return channel.replaceAll("_", " ");
}

function summarizeAutomationCadence(actions: AutomationItem["actions"]) {
  const ordered = [...actions].sort((a, b) => {
    const orderDiff = Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0);
    if (orderDiff !== 0) return orderDiff;
    return Number(a.waitInHours || 0) - Number(b.waitInHours || 0);
  });
  if (ordered.length === 0) return "Sem etapas configuradas.";
  return ordered
    .slice(0, 4)
    .map((action) => `${getCadenceLabel(action.waitInHours)} · ${ACTION_LABELS[action.type]}`)
    .join(" -> ");
}

function getDraftConditionChips(draft: AutomationDraft) {
  const chips: string[] = [];

  draft.stageIn.forEach((stage) => chips.push(`Etapa ${getPipelineStageLabel(stage)}`));

  draft.sourceInInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((source) => chips.push(`Origem ${source}`));

  draft.channelInInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((channel) => chips.push(`Canal ${channel}`));

  draft.aiNextActionInInput
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((action) => chips.push(`IA ${action}`));

  if (draft.scoreGte) chips.push(`Score >= ${draft.scoreGte}`);
  if (draft.waitAtLeastHours) chips.push(`Espera >= ${draft.waitAtLeastHours}h`);

  return chips;
}

function getDraftActionIssue(action: ActionDraft) {
  if (action.type === "create_task" && !action.title.trim()) return "Falta titulo da tarefa.";
  if ((action.type === "add_note" || action.type === "send_message") && !action.text.trim()) {
    return "Falta conteudo da mensagem ou nota.";
  }
  if (action.type === "add_tag" && !action.tag.trim()) return "Falta a tag para aplicar.";
  if (action.type === "set_priority" && !action.priority.trim()) return "Falta a prioridade.";
  return null;
}

export default function ClienteAutomacoesPage() {
  const { tenant, hasCapability } = useClienteTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AutomationSummaryResponse>({});
  const [businessProfileId, setBusinessProfileId] = useState<BusinessProfileId>("generic");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<AutomationDraft>(createEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [processingScheduled, setProcessingScheduled] = useState(false);
  const [automationSearch, setAutomationSearch] = useState("");
  const [triggerFilter, setTriggerFilter] = useState<"all" | AutomationTrigger>("all");
  const [automationStatusFilter, setAutomationStatusFilter] = useState<AutomationStatusFilter>("all");
  const [executionSearch, setExecutionSearch] = useState("");
  const [executionStatusFilter, setExecutionStatusFilter] = useState<ExecutionStatusFilter>("all");
  const [queueStatusFilter, setQueueStatusFilter] = useState<QueueStatusFilter>("all");

  const canManage = hasCapability("manage_automations");
  const businessProfile = useMemo(() => getBusinessProfile(businessProfileId), [businessProfileId]);
  const stageOptions = useMemo(
    () => businessProfile.pipeline.stages.map((stage) => ({ id: normalizePipelineStageId(stage) })),
    [businessProfile]
  );

  const loadData = useCallback(async () => {
    if (!tenant?.tenantId) return;

    try {
      setLoading(true);
      setError(null);

      const [res, settingsRes] = await Promise.all([
        authedFetch(`/api/tenant/${tenant.tenantId}/automation-summary`),
        authedFetch(`/api/tenant/${tenant.tenantId}/settings`),
      ]);
      const payload = (await res.json()) as AutomationSummaryResponse;
      const settingsPayload = (await settingsRes.json().catch(() => ({}))) as TenantSettingsPayload;

      if (!res.ok) {
        setError(payload.error || "Falha ao carregar automacoes.");
        return;
      }

      setBusinessProfileId((settingsPayload.settings?.businessProfileId as BusinessProfileId) || "generic");
      setData(payload);
    } catch {
      setError("Falha ao carregar automacoes.");
    } finally {
      setLoading(false);
    }
  }, [tenant?.tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summary = useMemo(() => data.summary || {}, [data.summary]);
  const queue = useMemo(() => summary.queue || {}, [summary.queue]);
  const scheduled = useMemo(() => summary.scheduled || {}, [summary.scheduled]);
  const automations = useMemo(() => data.automations || [], [data.automations]);
  const executions = useMemo(() => data.recentExecutions || [], [data.recentExecutions]);

  const executionStats = useMemo(
    () => ({
      success: executions.filter((item) => item.status === "done").length,
      errors: executions.filter((item) => item.status === "error").length,
      skipped: executions.filter((item) => item.status === "skipped").length,
    }),
    [executions]
  );

  const filteredAutomations = useMemo(() => {
    const search = automationSearch.trim().toLowerCase();
    return automations.filter((automation) => {
      if (triggerFilter !== "all" && automation.trigger !== triggerFilter) return false;
      if (automationStatusFilter !== "all" && automation.status !== automationStatusFilter) return false;
      if (!search) return true;

      const haystack = [
        automation.name,
        automation.description,
        TRIGGER_LABELS[automation.trigger],
        ...(automation.conditions?.sourceIn || []),
        ...(automation.conditions?.channelIn || []),
        ...(automation.conditions?.aiNextActionIn || []),
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [automationSearch, automations, automationStatusFilter, triggerFilter]);

  const automationStats = useMemo(
    () => ({
      withCadence: automations.filter((automation) => automation.actions.some((action) => Number(action.waitInHours || 0) > 0)).length,
      immediateOnly: automations.filter((automation) => automation.actions.every((action) => Number(action.waitInHours || 0) <= 0)).length,
    }),
    [automations]
  );

  const filteredExecutions = useMemo(() => {
    const search = executionSearch.trim().toLowerCase();
    return executions.filter((execution) => {
      if (executionStatusFilter !== "all" && execution.status !== executionStatusFilter) return false;
      if (!search) return true;

      const haystack = [
        execution.automationName,
        execution.leadId,
        execution.chatId,
        execution.detail,
        execution.lastError,
        execution.trigger,
        execution.channel,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });
  }, [executionSearch, executionStatusFilter, executions]);

  const filteredQueue = useMemo(() => {
    if (queueStatusFilter === "all") return data.recentQueue || [];
    return (data.recentQueue || []).filter((job) => job.status === queueStatusFilter);
  }, [data.recentQueue, queueStatusFilter]);

  const focusSignals = useMemo(() => {
    const items: Array<{
      id: string;
      href: string;
      title: string;
      detail: string;
      badge: string;
      tone: "neutral" | "success" | "warning" | "danger" | "info";
    }> = [];

    if (Number(summary.activeAutomations || 0) === 0) {
      items.push({
        id: "inactive",
        href: "/cliente/painel/automacoes",
        title: "Nenhuma automacao ativa",
        detail: "A operacao ainda nao tem fluxos ativos para follow-up, prioridade ou mensagens automaticas.",
        badge: "setup",
        tone: "warning",
      });
    }

    if (Number(summary.waitingReplyBacklog || 0) > 0) {
      items.push({
        id: "reply_backlog",
        href: "/cliente/painel/inbox?queue=assigned_waiting",
        title: "Conversas paradas",
        detail: `${summary.waitingReplyBacklog || 0} conversa(s) podem acionar retomada comercial.`,
        badge: "follow-up",
        tone: "warning",
      });
    }

    if (Number(summary.slaBreached || 0) > 0) {
      items.push({
        id: "sla",
        href: "/cliente/painel/inbox?queue=sla_breached",
        title: "Atendimento fora do prazo",
        detail: `${summary.slaBreached || 0} conversa(s) exigem fluxo automatico ou resposta humana imediata.`,
        badge: "urgente",
        tone: "danger",
      });
    }

    if (Number(queue.deadLetter || 0) > 0) {
      items.push({
        id: "dead_letter",
        href: "/cliente/painel/automacoes",
        title: "Conversas com falha de processamento",
        detail: `${queue.deadLetter || 0} conversa(s) precisam de revisao antes de voltar ao fluxo normal.`,
        badge: "erro",
        tone: "danger",
      });
    }

    if (summary.aiEnabled === false) {
      items.push({
        id: "ai_off",
        href: "/cliente/painel/ia",
        title: "IA desativada impactando a operacao",
        detail: "Algumas automacoes dependem do motor ativo para completar o ciclo do atendimento.",
        badge: "ia",
        tone: "info",
      });
    }

    return items.slice(0, 5);
  }, [queue.deadLetter, summary.activeAutomations, summary.aiEnabled, summary.slaBreached, summary.waitingReplyBacklog]);

  function applyTemplate(key: AutomationTemplateKey) {
    setDraft(createTemplateDraft(key, businessProfile));
    setEditorOpen(true);
  }

  async function saveAutomation() {
    if (!tenant?.tenantId || !canManage) return;

    const payload = normalizeDraft(draft);
    if (!payload.name || payload.actions.length === 0) {
      setError("Defina nome e pelo menos uma acao valida para a automacao.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const url = draft.id
        ? `/api/tenant/${tenant.tenantId}/automations/${draft.id}`
        : `/api/tenant/${tenant.tenantId}/automations`;
      const method = draft.id ? "PATCH" : "POST";

      const res = await authedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const response = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(response.error || "Falha ao salvar automacao.");
      }

      setDraft(createEmptyDraft());
      setEditorOpen(false);
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar automacao.");
    } finally {
      setSaving(false);
    }
  }

  async function patchAutomation(id: string, patch: Record<string, unknown>) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyId(id);
      setError(null);

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/automations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const response = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(response.error || "Falha ao atualizar automacao.");
      }

      await loadData();
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : "Falha ao atualizar automacao.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAutomation(id: string) {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setBusyId(id);
      setError(null);

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/automations/${id}`, {
        method: "DELETE",
      });

      const response = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(response.error || "Falha ao remover automacao.");
      }

      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao remover automacao.");
    } finally {
      setBusyId(null);
    }
  }

  async function processScheduledQueue() {
    if (!tenant?.tenantId || !canManage) return;

    try {
      setProcessingScheduled(true);
      setError(null);

      const res = await authedFetch(`/api/tenant/${tenant.tenantId}/automations/process`, {
        method: "POST",
      });
      const response = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(response.error || "Falha ao processar fila operacional.");
      }

      await loadData();
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Falha ao processar fila operacional.");
    } finally {
      setProcessingScheduled(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--cliente-accent)]" />
      </div>
    );
  }

  if (error && !Object.keys(data).length) {
    return <EmptyState title="Falha ao carregar automacoes" description={error} />;
  }

  return (
    <div className="automacoes-refined client-daily-page space-y-6">
      {error ? (
        <div className="rounded-[24px] border border-rose-400/18 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
          {error}
        </div>
      ) : null}

      <SectionHeader
        title="Fluxos comerciais"
        subtitle="Regras praticas para retomar conversas, criar tarefas, priorizar oportunidades e apoiar o time comercial."
        action={
          <div className="flex flex-wrap gap-2">
            <StateBadge
              label={summary.aiEnabled === false ? "assistente pausado" : "fluxos ativos"}
              tone={summary.aiEnabled === false ? "warning" : "success"}
            />
            {canManage ? (
              <>
                <button
                  type="button"
                  onClick={() => void processScheduledQueue()}
                  disabled={processingScheduled}
                  className="hidden items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm font-medium text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)] disabled:opacity-60"
                >
                  {processingScheduled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Workflow className="h-4 w-4" />}
                  Processar pendencias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(createEmptyDraft());
                    setEditorOpen((current) => !current);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] px-3 py-2 text-sm font-medium text-[var(--cliente-accent)] transition hover:brightness-95"
                >
                  <Plus className="h-4 w-4" />
                  Novo fluxo
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <section className="rounded-[22px] border border-violet-200 bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(255,255,255,0.9))] p-4 shadow-[var(--cliente-shadow-soft)] md:flex md:items-center md:justify-between md:gap-6 md:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-violet-600 text-white"><BookOpenCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-extrabold text-[var(--cliente-card-text)]">Uma base para todos os canais</p>
            <p className="mt-1 text-sm leading-5 text-[var(--cliente-card-text-muted)]">WhatsApp, Instagram e a IA comercial usam os mesmos produtos, FAQs, politicas e regras do negocio. Cada fluxo define apenas quando agir e para onde encaminhar.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 md:mt-0">
          <StateBadge label={`${summary.kbDocs || 0} itens na base`} tone={summary.kbDocs ? "ai" : "warning"} />
          <Link href="/cliente/painel/produtos-servicos" className="rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 transition hover:bg-violet-50">Abrir base</Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Fluxos ativos" value={String(summary.activeAutomations || 0)} icon={Workflow} trend="regras habilitadas" />
        <MetricCard label="Cadencias ativas" value={String(automationStats.withCadence)} icon={Workflow} trend={`${automationStats.immediateOnly} regra(s) imediatas`} />
        <MetricCard
          label="Aguardando resposta"
          value={String(summary.waitingReplyBacklog || 0)}
          icon={MessageSquareCode}
          trend={`${summary.slaBreached || 0} fora do prazo`}
        />
        <MetricCard label="Alertas" value={String(executionStats.errors + (scheduled.deadLetter || 0))} icon={ShieldCheck} trend="pedem revisao" />
      </section>

      <section className="grid gap-3 xl:grid-cols-5">
        {focusSignals.length === 0 ? (
          <PanelCard className="p-4 xl:col-span-5">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Fluxos sem alertas importantes</p>
            <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
              Nao ha conversa parada, atendimento fora do prazo ou alerta relevante neste recorte.
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

      <section className="hidden gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Saude operacional</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <HealthRow label="Conversas monitoradas" value={String(summary.monitoredConversations || 0)} />
            <HealthRow label="Atendimento humano" value={String(summary.pausedConversations || 0)} />
            <HealthRow label="Eventos processados" value={String(summary.processedTotal || 0)} />
            <HealthRow label="Falhas permanentes" value={String(queue.deadLetter || 0)} danger={Boolean(queue.deadLetter)} />
            <HealthRow label="Agendadas pendentes" value={String((scheduled.pending || 0) + (scheduled.retrying || 0))} />
            <HealthRow label="Agendadas falhas" value={String(scheduled.deadLetter || 0)} danger={Boolean(scheduled.deadLetter)} />
            <HealthRow label="Backlog sem resposta" value={String(summary.waitingReplyBacklog || 0)} />
            <HealthRow label="Fora do prazo" value={String(summary.slaBreached || 0)} danger={Boolean(summary.slaBreached)} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <QueuePill label="Pendentes" value={queue.pending || 0} />
            <QueuePill label="Em andamento" value={queue.processing || 0} />
            <QueuePill label="Tentando de novo" value={queue.retrying || 0} />
            <QueuePill label="Agendadas" value={scheduled.pending || 0} />
            <QueuePill label="Retentativas" value={scheduled.retrying || 0} />
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <Link
              href="/cliente/painel/inbox?queue=assigned_waiting"
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              Abrir backlog sem resposta
            </Link>
            <Link
              href="/cliente/painel/inbox?queue=sla_breached"
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              Ver conversas fora do prazo
            </Link>
            <Link
              href="/cliente/painel/ia"
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3 text-sm text-[var(--cliente-card-text-muted)] transition hover:bg-[var(--cliente-panel-soft)]"
            >
              Revisar IA e base de conhecimento
            </Link>
          </div>
        </PanelCard>

        <PanelCard className="p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">Leitura operacional</h3>
          <div className="mt-4 space-y-3">
            <Insight
              title="Regras ativas"
              description={
                automations.length
                  ? `${automations.length} automacoes cadastradas. ${summary.activeAutomations || 0} estao ativas neste momento.`
                  : "Nenhum fluxo configurado ainda. A equipe ainda depende de operacao manual para retomadas e prioridades."
              }
            />
            <Insight
              title="Base operacional"
              description={
                summary.kbDocs
                  ? `${summary.kbDocs} documentos ajudam a IA e as automacoes a trabalhar com contexto comercial.`
                  : "A base de conhecimento ainda esta vazia e limita IA e automacoes comerciais."
              }
            />
            <Insight
              title="Execucao"
              description={
                executionStats.errors
                  ? `${executionStats.errors} acoes recentes falharam e precisam de ajuste na regra ou no dado do lead.`
                  : "As acoes recentes nao mostraram falhas de automacao."
              }
            />
          </div>
        </PanelCard>
      </section>

      <PanelCard className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle
            title={`Modo do negocio: ${businessProfile.label}`}
            subtitle="Os playbooks, etapas e sinais operacionais seguem o tipo de negocio configurado."
          />
          <StateBadge label={businessProfile.id} tone="info" />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Etapas mais importantes deste modo</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {businessProfile.pipeline.stages.map((stage) => (
                <StateBadge key={stage} label={getPipelineStageLabel(normalizePipelineStageId(stage))} tone="neutral" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Movimento comercial esperado</p>
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">{businessProfile.commercialMotion}</p>
          </div>
        </div>
      </PanelCard>

      {canManage ? (
        <PanelCard className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <CardTitle
              title="Playbooks prontos"
              subtitle="Comece mais rapido com fluxos base de captacao, retomada, fechamento e onboarding."
            />
            <StateBadge label="atalhos de setup" tone="info" />
          </div>

          <div className="mt-4 grid gap-3 xl:grid-cols-4 md:grid-cols-2">
            {(Object.entries(AUTOMATION_TEMPLATE_LABELS) as Array<
              [AutomationTemplateKey, { title: string; description: string }]
            >).map(([key, template]) => (
              <div
                key={key}
                className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{template.title}</p>
                <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">{template.description}</p>
                <button
                  type="button"
                  onClick={() => applyTemplate(key)}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                >
                  <Plus className="h-4 w-4" />
                  Usar playbook
                </button>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
      {editorOpen && canManage ? (
        <AutomationEditor
          draft={draft}
          setDraft={setDraft}
          stageOptions={stageOptions.map((item) => item.id)}
          saving={saving}
          onCancel={() => {
            setEditorOpen(false);
            setDraft(createEmptyDraft());
          }}
          onSave={() => void saveAutomation()}
        />
      ) : null}

      <section className="grid gap-4">
        <PanelCard className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Fluxos cadastrados</h3>
            <StateBadge
              label={filteredAutomations.length ? `${filteredAutomations.length} visiveis` : "sem regras"}
              tone={filteredAutomations.length ? "info" : "warning"}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_0.7fr_0.7fr]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-soft)]" />
              <input
                value={automationSearch}
                onChange={(event) => setAutomationSearch(event.target.value)}
                placeholder="Buscar fluxo por nome, gatilho, origem ou canal"
                className="client-input w-full py-2 pl-9 pr-3 text-sm"
              />
            </label>
            <select
              value={triggerFilter}
              onChange={(event) => setTriggerFilter(event.target.value as "all" | AutomationTrigger)}
              className="client-input px-3 py-2 text-sm"
            >
              <option value="all">Todos os gatilhos</option>
              {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={automationStatusFilter}
              onChange={(event) => setAutomationStatusFilter(event.target.value as AutomationStatusFilter)}
              className="client-input px-3 py-2 text-sm"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="paused">Pausadas</option>
            </select>
          </div>

          {automations.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhum fluxo comercial configurado ainda.</p>
          ) : filteredAutomations.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhum fluxo corresponde aos filtros atuais.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredAutomations.map((automation) => (
                <div
                  key={automation.id}
                  className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">{automation.name}</p>
                      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{automation.description || "Sem descricao operacional."}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StateBadge label={TRIGGER_LABELS[automation.trigger] || automation.trigger} tone="info" />
                      <StateBadge label={automation.status} tone={automation.status === "paused" ? "warning" : "success"} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(automation.conditions?.stageIn || []).map((stage) => (
                      <StateBadge key={`${automation.id}_${stage}`} label={getPipelineStageLabel(stage)} tone="neutral" />
                    ))}
                    {(automation.conditions?.sourceIn || []).slice(0, 3).map((source) => (
                      <StateBadge key={`${automation.id}_${source}`} label={source} tone="neutral" />
                    ))}
                    {(automation.conditions?.channelIn || []).slice(0, 3).map((channel) => (
                      <StateBadge key={`${automation.id}_channel_${channel}`} label={`canal ${channel}`} tone="neutral" />
                    ))}
                    {(automation.conditions?.aiNextActionIn || []).slice(0, 3).map((action) => (
                      <StateBadge key={`${automation.id}_ai_${action}`} label={`IA ${action}`} tone="info" />
                    ))}
                    {typeof automation.conditions?.scoreGte === "number" ? (
                      <StateBadge label={`score >= ${automation.conditions.scoreGte}`} tone="neutral" />
                    ) : null}
                    {typeof automation.conditions?.waitAtLeastHours === "number" ? (
                      <StateBadge label={`espera >= ${automation.conditions.waitAtLeastHours}h`} tone="warning" />
                    ) : null}
                  </div>

                  <div className="mt-3 rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-accent)]">Cadencia</p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text)]">{summarizeAutomationCadence(automation.actions)}</p>
                  </div>

                  <div className="mt-3 space-y-2">
                    {[...automation.actions]
                      .sort((a, b) => {
                        const orderDiff = Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0);
                        if (orderDiff !== 0) return orderDiff;
                        return Number(a.waitInHours || 0) - Number(b.waitInHours || 0);
                      })
                      .map((action, index) => (
                      <div
                        key={`${automation.id}_${index}`}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text-muted)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium text-[var(--cliente-card-text)]">{ACTION_LABELS[action.type]}</p>
                          <div className="flex flex-wrap gap-2">
                            <StateBadge label={getCadenceLabel(action.waitInHours)} tone={Number(action.waitInHours || 0) > 0 ? "warning" : "success"} />
                            {typeof action.sequenceOrder === "number" ? (
                              <StateBadge label={`etapa ${action.sequenceOrder}`} tone="neutral" />
                            ) : null}
                          </div>
                        </div>
                        <p className="mt-1 text-xs text-[var(--cliente-card-text-soft)]">{getActionSummary(action)}</p>
                      </div>
                    ))}
                  </div>

                  {canManage ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(draftFromAutomation(automation));
                          setEditorOpen(true);
                        }}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busyId === automation.id}
                        onClick={() =>
                          void patchAutomation(automation.id, {
                            enabled: !(automation.enabled !== false && automation.status !== "paused"),
                            status: automation.status === "paused" ? "active" : "paused",
                          })
                        }
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)] disabled:opacity-60"
                      >
                        {automation.status === "paused" ? "Retomar" : "Pausar"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === automation.id}
                        onClick={() => void deleteAutomation(automation.id)}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        <div className="hidden space-y-4">
          <PanelCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Execucoes recentes</h3>
              <StateBadge label={executionStats.errors ? "com alertas" : "estavel"} tone={executionStats.errors ? "warning" : "success"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.7fr]">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--cliente-card-text-soft)]" />
                <input
                  value={executionSearch}
                  onChange={(event) => setExecutionSearch(event.target.value)}
                  placeholder="Buscar por automacao, lead, chat, erro ou detalhe"
                  className="client-input w-full py-2 pl-9 pr-3 text-sm"
                />
              </label>
              <select
                value={executionStatusFilter}
                onChange={(event) => setExecutionStatusFilter(event.target.value as ExecutionStatusFilter)}
                className="client-input px-3 py-2 text-sm"
              >
                <option value="all">Todos os status</option>
                <option value="done">Concluidas</option>
                <option value="skipped">Ignoradas</option>
                <option value="error">Com erro</option>
              </select>
            </div>

            {executions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhuma execucao recente encontrada para esta operacao.</p>
            ) : filteredExecutions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhuma execucao corresponde aos filtros atuais.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--cliente-card-text)]">{execution.automationName || "Automacao"}</p>
                        <p className="text-xs text-[var(--cliente-card-text-soft)]">
                          {TRIGGER_LABELS[execution.trigger as AutomationTrigger] || execution.trigger || "Trigger"} | lead {execution.leadId || "-"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {execution.channel ? <StateBadge label={formatChannelLabel(execution.channel)} tone="neutral" /> : null}
                        {typeof execution.actionsExecuted === "number" ? (
                          <StateBadge label={`${execution.actionsExecuted} acoes`} tone="info" />
                        ) : null}
                        <StateBadge label={formatExecutionStatusLabel(execution.status)} tone={getExecutionStatusTone(execution.status)} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-[var(--cliente-card-text-muted)]">{execution.detail || "Sem detalhe"}</p>
                    <p className="mt-1 text-[11px] text-[var(--cliente-card-text-soft)]">{formatDateTime(execution.updatedAt)}</p>
                    {execution.lastError ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{execution.lastError}</span>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {execution.leadId ? (
                        <Link
                          href={`/cliente/painel/crm?leadId=${encodeURIComponent(execution.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Abrir cliente
                        </Link>
                      ) : null}
                      {execution.chatId ? (
                        <Link
                          href={`/cliente/painel/inbox?chatId=${encodeURIComponent(execution.chatId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Abrir conversa
                        </Link>
                      ) : execution.leadId ? (
                        <Link
                          href={`/cliente/painel/inbox?leadId=${encodeURIComponent(execution.leadId)}`}
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Ver contexto da conversa
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>

          <PanelCard className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--cliente-card-text-muted)]">Historico recente do assistente</h3>
              <StateBadge label={queue.deadLetter ? "requer revisao" : "estavel"} tone={queue.deadLetter ? "warning" : "success"} />
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <p className="text-sm text-[var(--cliente-card-text-muted)]">
                Eventos recentes do assistente. Use os links para cair direto na conversa que precisa de atencao.
              </p>
              <select
                value={queueStatusFilter}
                onChange={(event) => setQueueStatusFilter(event.target.value as QueueStatusFilter)}
                className="client-input px-3 py-2 text-sm"
              >
                <option value="all">Todos os eventos</option>
                <option value="pending">Pendentes</option>
                <option value="processing">Processando</option>
                <option value="retrying">Tentando de novo</option>
                <option value="done">Concluidos</option>
                <option value="dead_letter">Precisa revisao</option>
              </select>
            </div>

            {(data.recentQueue || []).length === 0 ? (
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhum evento recente encontrado para esta operacao.</p>
            ) : filteredQueue.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">Nenhum evento corresponde aos filtros atuais.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredQueue.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--cliente-card-text)]">Conversa {job.chatId || "-"}</p>
                        <p className="text-xs text-[var(--cliente-card-text-soft)]">Tentativas {job.attempts}</p>
                      </div>
                      <StateBadge label={formatQueueJobLabel(job.status)} tone={getQueueJobTone(job.status)} />
                    </div>
                    <p className="mt-2 text-[11px] text-[var(--cliente-card-text-soft)]">{formatDateTime(job.updatedAt)}</p>
                    {job.lastError ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{job.lastError}</span>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={`/cliente/painel/inbox?chatId=${encodeURIComponent(job.chatId)}`}
                        className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                      >
                        Abrir conversa
                      </Link>
                      {job.status === "dead_letter" ? (
                        <Link
                          href="/cliente/painel/ia"
                          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                        >
                          Revisar IA
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function AutomationEditor({
  draft,
  setDraft,
  stageOptions,
  saving,
  onCancel,
  onSave,
}: {
  draft: AutomationDraft;
  setDraft: Dispatch<SetStateAction<AutomationDraft>>;
  stageOptions: string[];
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const orderedDraftActions = useMemo(
    () =>
      sortActionDrafts(draft.actions).map((action, index) => ({
        ...action,
        sequenceOrder: action.sequenceOrder || String(index + 1),
      })),
    [draft.actions]
  );
  const conditionChips = useMemo(() => getDraftConditionChips(draft), [draft]);
  const validationIssues = useMemo(() => {
    const issues: string[] = [];
    if (!draft.name.trim()) issues.push("Dê um nome claro para a automação.");
    if (draft.trigger === "waiting_for_reply" && !draft.waitAtLeastHours.trim()) {
      issues.push("Defina a janela minima de espera para regras sem resposta.");
    }
    if (draft.trigger === "ai_next_action" && orderedDraftActions.some((action) => action.type === "send_message")) {
      issues.push("Sinais da IA ainda nao devem enviar mensagem automaticamente. Prefira tarefa, nota ou prioridade.");
    }
    if (orderedDraftActions.length === 0) issues.push("Adicione pelo menos uma ação ao fluxo.");
    orderedDraftActions.forEach((action, index) => {
      const issue = getDraftActionIssue(action);
      if (issue) issues.push(`Etapa ${index + 1}: ${issue}`);
    });
    return issues;
  }, [draft.name, draft.trigger, draft.waitAtLeastHours, orderedDraftActions]);
  const totalWaitInHours = useMemo(
    () => orderedDraftActions.reduce((sum, action) => sum + asNumber(action.waitInHours), 0),
    [orderedDraftActions]
  );
  const selectedAction = orderedDraftActions[selectedActionIndex] || orderedDraftActions[0] || null;

  useEffect(() => {
    if (selectedActionIndex <= draft.actions.length - 1) return;
    setSelectedActionIndex(Math.max(draft.actions.length - 1, 0));
  }, [draft.actions.length, selectedActionIndex]);

  function updateAction(index: number, patch: Partial<ActionDraft>) {
    setDraft((current) => ({
      ...current,
      actions: current.actions.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    }));
  }

  function moveAction(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.actions.length) return current;
      const actions = [...current.actions];
      const [moved] = actions.splice(index, 1);
      actions.splice(nextIndex, 0, moved);
      return {
        ...current,
        actions: actions.map((item, actionIndex) => ({
          ...item,
          sequenceOrder: String(actionIndex + 1),
        })),
      };
    });
  }

  return (
    <PanelCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardTitle
          title={draft.id ? "Editar fluxo" : "Criar fluxo"}
          subtitle="Defina quando o fluxo entra, quais contatos ele deve considerar e qual proxima acao acontece."
        />
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
        >
          Cancelar
        </button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-3xl border border-[var(--cliente-border)] bg-[linear-gradient(180deg,rgba(232,80,2,0.14),rgba(12,12,12,0.94))] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--cliente-accent)]">Construtor visual</p>
              <h3 className="mt-2 text-lg font-semibold text-white">Fluxo operacional da regra</h3>
              <p className="mt-1 max-w-2xl text-sm text-[var(--cliente-card-text-muted)]">
                Modele entrada, filtros e cadencia de acoes sem sair da mesma tela. A leitura mostra o que acontece na pratica.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StateBadge label={TRIGGER_LABELS[draft.trigger]} tone="info" />
              <StateBadge label={`${orderedDraftActions.length} etapas`} tone={orderedDraftActions.length ? "success" : "warning"} />
              <StateBadge label={totalWaitInHours ? `${totalWaitInHours}h acumuladas` : "sem espera"} tone={totalWaitInHours ? "warning" : "success"} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
              <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                <button
                  type="button"
                  onClick={() => setSelectedActionIndex(0)}
                  className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] p-4 text-left transition hover:border-[var(--cliente-border-strong)] hover:brightness-95"
                >
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-[var(--cliente-accent)]" />
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Entrada do fluxo</p>
                  </div>
                  <p className="mt-2 text-base font-semibold text-[var(--cliente-card-text)]">{TRIGGER_LABELS[draft.trigger]}</p>
                  <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                    {draft.description.trim() || "Defina uma descricao operacional para a equipe entender quando essa regra entra em cena."}
                  </p>
                </button>

                <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Quem entra neste fluxo</p>
                    <StateBadge label={conditionChips.length ? `${conditionChips.length} filtros` : "sem filtros"} tone={conditionChips.length ? "info" : "neutral"} />
                  </div>
                  {conditionChips.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {conditionChips.map((chip) => (
                        <StateBadge key={chip} label={chip} tone="neutral" />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
                      Sem filtros adicionais. A regra entra para todo lead ou conversa que bater no gatilho.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Cadencia</p>
                  <div className="h-px flex-1 bg-[var(--cliente-border)]" />
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {orderedDraftActions.map((action, index) => {
                    const issue = getDraftActionIssue(action);
                    const isSelected = selectedActionIndex === index;
                    return (
                      <button
                        key={`flow_${index}`}
                        type="button"
                        onClick={() => setSelectedActionIndex(index)}
                        className={`rounded-2xl border p-4 text-left transition ${
                          isSelected
                            ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)] shadow-[0_0_0_1px_rgba(232,80,2,0.12)]"
                            : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] hover:bg-[var(--cliente-panel-soft)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Etapa {index + 1}</p>
                            <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">{ACTION_LABELS[action.type]}</p>
                          </div>
                          <StateBadge
                            label={getCadenceLabel(asNumber(action.waitInHours))}
                            tone={asNumber(action.waitInHours) > 0 ? "warning" : "success"}
                          />
                        </div>
                        <p className="mt-3 text-sm text-[var(--cliente-card-text-muted)]">
                          {getActionSummary({
                            ...action,
                            dueInHours: action.dueInHours ? Number(action.dueInHours) : null,
                            waitInHours: action.waitInHours ? Number(action.waitInHours) : null,
                          })}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {action.sequenceOrder ? <StateBadge label={`ordem ${action.sequenceOrder}`} tone="neutral" /> : null}
                          {action.dueInHours ? <StateBadge label={`vence em ${action.dueInHours}h`} tone="info" /> : null}
                          {issue ? <StateBadge label="pendente de ajuste" tone="warning" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Detalhe da etapa</p>
                {selectedAction ? (
                  <>
                    <p className="mt-2 text-sm font-semibold text-[var(--cliente-card-text)]">
                      Etapa {selectedActionIndex + 1} · {ACTION_LABELS[selectedAction.type]}
                    </p>
                    <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">
                      {getActionSummary({
                        ...selectedAction,
                        dueInHours: selectedAction.dueInHours ? Number(selectedAction.dueInHours) : null,
                        waitInHours: selectedAction.waitInHours ? Number(selectedAction.waitInHours) : null,
                      })}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StateBadge label={getCadenceLabel(asNumber(selectedAction.waitInHours))} tone={asNumber(selectedAction.waitInHours) > 0 ? "warning" : "success"} />
                      {selectedAction.dueInHours ? <StateBadge label={`prazo ${selectedAction.dueInHours}h`} tone="info" /> : null}
                      {getDraftActionIssue(selectedAction) ? (
                        <StateBadge label={getDraftActionIssue(selectedAction) || "ajuste"} tone="warning" />
                      ) : (
                        <StateBadge label="configurada" tone="success" />
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-[var(--cliente-card-text-muted)]">Adicione a primeira etapa para inspecionar a cadência.</p>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Checklist do fluxo</p>
                <div className="mt-3 space-y-2">
                  {validationIssues.length ? (
                    validationIssues.map((issue) => (
                      <div key={issue} className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        {issue}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                      Fluxo pronto para salvar. A cadência está consistente com o motor atual.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Resumo executivo</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <HealthRow label="Acoes" value={String(orderedDraftActions.length)} />
                  <HealthRow label="Filtros" value={String(conditionChips.length)} />
                  <HealthRow label="Espera total" value={totalWaitInHours ? `${totalWaitInHours}h` : "Agora"} />
                  <HealthRow label="Pendencias" value={String(validationIssues.length)} danger={validationIssues.length > 0} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Nome e entrada do fluxo</p>
            <div className="mt-3 grid gap-3">
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nome do fluxo"
                className="client-input px-3 py-2 text-sm"
              />
              <select
                value={draft.trigger}
                onChange={(event) => setDraft((current) => ({ ...current, trigger: event.target.value as AutomationTrigger }))}
                className="client-input px-3 py-2 text-sm"
              >
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Descricao operacional da regra"
                className="client-input min-h-[120px] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--cliente-card-text-soft)]">Guia de construcao</p>
            <div className="mt-3 space-y-2 text-sm text-[var(--cliente-card-text-muted)]">
              <p>1. Defina o gatilho que ativa a regra.</p>
              <p>2. Use filtros para restringir origem, canal, etapa e score.</p>
              <p>3. Organize a cadência com espera e prioridade para cada etapa.</p>
              <p>4. Salve e acompanhe o resultado nas listas logo abaixo.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--cliente-card-text)]">Filtros do fluxo</p>
        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Etapas alvo</span>
            <select
              multiple
              value={draft.stageIn}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  stageIn: Array.from(event.target.selectedOptions).map((item) => item.value),
                }))
              }
              className="client-input min-h-[132px] w-full px-3 py-2 text-sm"
            >
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {getPipelineStageLabel(stage)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Origens (separadas por virgula)</span>
            <textarea
              value={draft.sourceInInput}
              onChange={(event) => setDraft((current) => ({ ...current, sourceInInput: event.target.value }))}
              placeholder="meta ads, whatsapp, indicacao"
              className="client-input min-h-[132px] w-full px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Canais (separados por virgula)</span>
            <textarea
              value={draft.channelInInput}
              onChange={(event) => setDraft((current) => ({ ...current, channelInInput: event.target.value }))}
              placeholder="whatsapp, instagram, messenger, site_chat"
              className="client-input min-h-[132px] w-full px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Sinais da IA (separados por virgula)</span>
            <textarea
              value={draft.aiNextActionInInput}
              onChange={(event) => setDraft((current) => ({ ...current, aiNextActionInInput: event.target.value }))}
              placeholder="preparar_proposta_comercial, agendar_proximo_passo"
              className="client-input min-h-[132px] w-full px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Score minimo</span>
            <input
              value={draft.scoreGte}
              onChange={(event) => setDraft((current) => ({ ...current, scoreGte: event.target.value }))}
              placeholder="80"
              className="client-input px-3 py-2 text-sm"
            />
          </label>

          <label className="space-y-2 text-xs text-[var(--cliente-card-text-soft)]">
            <span>Aguardar ao menos (h)</span>
            <input
              value={draft.waitAtLeastHours}
              onChange={(event) => setDraft((current) => ({ ...current, waitAtLeastHours: event.target.value }))}
              placeholder="2"
              className="client-input px-3 py-2 text-sm"
            />
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Acoes</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  actions: sortActionDrafts(current.actions).map((item, actionIndex) => ({
                    ...item,
                    sequenceOrder: String(actionIndex + 1),
                  })),
                }))
              }
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
            >
              Ordenar cadencia
            </button>
            <button
              type="button"
              onClick={() =>
                setDraft((current) => ({
                  ...current,
                  actions: [
                    ...current.actions,
                    { ...createEmptyAction(), sequenceOrder: String(current.actions.length + 1) },
                  ],
                }))
              }
              className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-panel-soft)]"
            >
              Adicionar acao
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--cliente-border)] bg-[var(--cliente-accent-soft)] p-3">
          <p className="text-sm font-semibold text-white">Preview da cadencia</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {orderedDraftActions.map((action, index) => (
              <div
                key={`preview_${index}`}
                className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <StateBadge label={`etapa ${index + 1}`} tone="neutral" />
                  <StateBadge
                    label={getCadenceLabel(asNumber(action.waitInHours))}
                    tone={asNumber(action.waitInHours) > 0 ? "warning" : "success"}
                  />
                </div>
                <p className="mt-3 text-sm font-medium text-white">{ACTION_LABELS[action.type]}</p>
                <p className="mt-1 text-xs text-[var(--cliente-card-text-muted)]">
                  {getActionSummary({
                    ...action,
                    dueInHours: action.dueInHours ? Number(action.dueInHours) : null,
                    waitInHours: action.waitInHours ? Number(action.waitInHours) : null,
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          {draft.actions.map((action, index) => (
            <div
              key={`${action.type}_${index}`}
              className={`rounded-2xl border p-3 ${
                selectedActionIndex === index
                  ? "border-[var(--cliente-border-strong)] bg-[var(--cliente-accent-soft)]"
                  : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
              }`}
            >
              <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                <select
                  value={action.type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      actions: current.actions.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...createEmptyAction(event.target.value as AutomationActionType),
                              sequenceOrder: item.sequenceOrder,
                              waitInHours: item.waitInHours,
                            }
                          : item
                      ),
                    }))
                  }
                  className="client-input px-3 py-2 text-sm"
                >
                  {Object.entries(ACTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={action.sequenceOrder}
                    onChange={(event) => updateAction(index, { sequenceOrder: event.target.value })}
                    placeholder="Ordem (ex: 1)"
                    className="client-input px-3 py-2 text-sm"
                  />
                  <input
                    value={action.waitInHours}
                    onChange={(event) => updateAction(index, { waitInHours: event.target.value })}
                    placeholder="Espera antes da acao (h)"
                    className="client-input px-3 py-2 text-sm"
                  />

                  {action.type === "create_task" ? (
                    <>
                      <input
                        value={action.title}
                        onChange={(event) => updateAction(index, { title: event.target.value })}
                        placeholder="Titulo da tarefa"
                        className="client-input px-3 py-2 text-sm"
                      />
                      <input
                        value={action.dueInHours}
                        onChange={(event) => updateAction(index, { dueInHours: event.target.value })}
                        placeholder="Prazo em horas"
                        className="client-input px-3 py-2 text-sm"
                      />
                    </>
                  ) : null}

                  {action.type === "add_note" ? (
                    <textarea
                      value={action.text}
                      onChange={(event) => updateAction(index, { text: event.target.value })}
                      placeholder="Texto da nota automatica"
                      className="client-input min-h-[88px] px-3 py-2 text-sm md:col-span-2"
                    />
                  ) : null}

                  {action.type === "send_message" ? (
                    <textarea
                      value={action.text}
                      onChange={(event) => updateAction(index, { text: event.target.value })}
                      placeholder="Mensagem de follow-up automatica"
                      className="client-input min-h-[88px] px-3 py-2 text-sm md:col-span-2"
                    />
                  ) : null}

                  {action.type === "add_tag" ? (
                    <input
                      value={action.tag}
                      onChange={(event) => updateAction(index, { tag: event.target.value })}
                      placeholder="tag-comercial"
                      className="client-input px-3 py-2 text-sm"
                    />
                  ) : null}

                  {action.type === "set_priority" ? (
                    <select
                      value={action.priority}
                      onChange={(event) => updateAction(index, { priority: event.target.value })}
                      className="client-input px-3 py-2 text-sm"
                    >
                      <option value="low">low</option>
                      <option value="medium">medium</option>
                      <option value="high">high</option>
                    </select>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => moveAction(index, -1)}
                    disabled={index === 0}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)] disabled:opacity-40"
                  >
                    <MoveUp className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveAction(index, 1)}
                    disabled={index === draft.actions.length - 1}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-sm text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)] disabled:opacity-40"
                  >
                    <MoveDown className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        actions: current.actions
                          .filter((_, itemIndex) => itemIndex !== index)
                          .map((item, actionIndex) => ({ ...item, sequenceOrder: String(actionIndex + 1) })),
                      }))
                    }
                    className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100 transition hover:bg-rose-500/15"
                  >
                    Remover
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedActionIndex(index)}
                    className="rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-panel-soft)] px-3 py-2 text-xs text-[var(--cliente-card-text)] transition hover:border-[var(--cliente-border-strong)] hover:bg-[var(--cliente-surface-muted)]"
                  >
                    Inspecionar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--cliente-accent)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar fluxo
        </button>
      </div>
    </PanelCard>
  );
}

function QueuePill({ label, value }: { label: string; value: number }) {
  return (
    <div className="automacoes-queue-pill rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function HealthRow({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div
      className={`automacoes-health-row rounded-xl border px-3 py-3 ${
        danger
          ? "border-rose-500/30 bg-rose-500/10"
          : "border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)]"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--cliente-card-text-soft)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function Insight({ title, description }: { title: string; description: string }) {
  return (
    <div className="automacoes-insight-card rounded-xl border border-[var(--cliente-border)] bg-[var(--cliente-surface-muted)] px-3 py-3">
      <p className="text-sm font-medium text-[var(--cliente-card-text)]">{title}</p>
      <p className="mt-1 text-sm text-[var(--cliente-card-text-muted)]">{description}</p>
    </div>
  );
}
