import { FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { sendTenantChatText } from "@/lib/server/chat-dispatch";

export type TenantAutomationTrigger =
  | "lead_created"
  | "lead_stage_changed"
  | "message_received"
  | "waiting_for_reply"
  | "ai_next_action"
  | "budget_approved"
  | "finance_paid";
export type TenantAutomationActionType =
  | "create_task"
  | "follow_up"
  | "move_stage"
  | "alert_human"
  | "add_note"
  | "add_tag"
  | "set_priority"
  | "send_message";
export const AUTOMATION_SCHEDULED_JOB_TYPE = "automation_scheduled_action";
const AUTOMATION_WAITING_REPLY_RUNTIME_TYPE = "automation_waiting_reply_runtime";

export type TenantAutomationCondition = {
  stageIn?: string[];
  sourceIn?: string[];
  channelIn?: string[];
  aiNextActionIn?: string[];
  scoreGte?: number | null;
  waitAtLeastHours?: number | null;
};

export type TenantAutomationAction = {
  type: TenantAutomationActionType;
  title?: string;
  text?: string;
  tag?: string;
  priority?: string;
  taskType?: string;
  stageId?: string;
  ownerUserId?: string;
  ownerName?: string;
  reasonCode?: string;
  dueInHours?: number | null;
  waitInHours?: number | null;
  sequenceOrder?: number | null;
};

export type TenantAutomationDoc = {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  trigger: TenantAutomationTrigger;
  enabled: boolean;
  status: "active" | "paused";
  conditions: TenantAutomationCondition;
  actions: TenantAutomationAction[];
  createdAt?: unknown;
  updatedAt?: unknown;
  updatedBy?: string;
  updatedByName?: string;
};

type LeadAutomationContext = {
  tenantId: string;
  trigger: TenantAutomationTrigger;
  leadId: string;
  actorId?: string | null;
  actorName?: string | null;
  previousStage?: string;
  nextStage?: string;
  chatId?: string | null;
  channel?: string | null;
  messageText?: string | null;
  aiNextAction?: string | null;
  waitingSince?: Date | null;
  slaBreached?: boolean;
};

type LeadSnapshot = {
  id: string;
  nome: string;
  origem: string;
  pipelineStage: string;
  score: number | null;
  priority: string;
  tags: string[];
};

type AutomationChatRow = {
  id: string;
} & Record<string, unknown>;

type ScheduledAutomationJob = {
  id: string;
  ref: DocumentReference;
  attempts: number;
} & Record<string, unknown>;

function cleanText(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeId(value: string, max = 220) {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, "_").trim();
  return cleaned.slice(0, max) || `automation_${Date.now()}`;
}

function parseStringList(value: unknown, maxItems = 12, maxItemLen = 60) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      source
        .map((item) => cleanText(item, maxItemLen).toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, maxItems);
}

function normalizeTrigger(value: unknown): TenantAutomationTrigger {
  const raw = cleanText(value, 40).toLowerCase();
  if (raw === "finance_paid") return "finance_paid";
  if (raw === "budget_approved") return "budget_approved";
  if (raw === "ai_next_action") return "ai_next_action";
  if (raw === "waiting_for_reply") return "waiting_for_reply";
  if (raw === "message_received") return "message_received";
  if (raw === "lead_stage_changed") return "lead_stage_changed";
  return "lead_created";
}

function normalizeActionType(value: unknown): TenantAutomationActionType {
  const raw = cleanText(value, 40).toLowerCase();
  if (raw === "follow_up") return "follow_up";
  if (raw === "move_stage") return "move_stage";
  if (raw === "alert_human") return "alert_human";
  if (raw === "add_note") return "add_note";
  if (raw === "add_tag") return "add_tag";
  if (raw === "set_priority") return "set_priority";
  if (raw === "send_message") return "send_message";
  return "create_task";
}

export function normalizeAutomationDoc(
  id: string,
  data: Record<string, unknown>,
  tenantIdFallback = ""
): TenantAutomationDoc {
  const rawActions = Array.isArray(data.actions)
    ? data.actions
        .map((item) => {
          const action = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
          const type = normalizeActionType(action.type);

          return {
            type,
            title: cleanText(action.title, 180),
            text: cleanText(action.text, 1600),
            tag: cleanText(action.tag, 32).toLowerCase(),
            priority: cleanText(action.priority, 20).toLowerCase(),
            taskType: cleanText(action.taskType, 40).toLowerCase(),
            stageId: cleanText(action.stageId, 80),
            ownerUserId: cleanText(action.ownerUserId, 140),
            ownerName: cleanText(action.ownerName, 140),
            reasonCode: cleanText(action.reasonCode, 80).toLowerCase(),
            dueInHours: cleanNumber(action.dueInHours),
            waitInHours: cleanNumber(action.waitInHours),
            sequenceOrder: cleanNumber(action.sequenceOrder),
          } satisfies TenantAutomationAction;
        })
        .filter((action) => {
          if (action.type === "create_task") return Boolean(action.title);
          if (action.type === "follow_up") return Boolean(action.title || action.dueInHours !== null);
          if (action.type === "move_stage") return Boolean(action.stageId);
          if (action.type === "alert_human") return Boolean(action.title || action.text || action.reasonCode);
          if (action.type === "add_note") return Boolean(action.text);
          if (action.type === "add_tag") return Boolean(action.tag);
          if (action.type === "set_priority") return Boolean(action.priority);
          if (action.type === "send_message") return Boolean(action.text);
          return false;
        })
        .slice(0, 8)
    : [];

  const actions = rawActions
    .sort((a, b) => {
      const orderDiff = Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(a.waitInHours || 0) - Number(b.waitInHours || 0);
    })
    .map((action, index) => ({
      ...action,
      sequenceOrder:
        typeof action.sequenceOrder === "number" && Number.isFinite(action.sequenceOrder)
          ? action.sequenceOrder
          : index + 1,
    }));

  const conditionsSource =
    data.conditions && typeof data.conditions === "object" ? (data.conditions as Record<string, unknown>) : {};

  return {
    id,
    tenantId: cleanText(data.tenantId, 140) || tenantIdFallback,
    name: cleanText(data.name, 120) || "Automacao sem nome",
    description: cleanText(data.description, 280),
    trigger: normalizeTrigger(data.trigger),
    enabled: data.enabled !== false,
    status: cleanText(data.status, 20).toLowerCase() === "paused" ? "paused" : "active",
    conditions: {
      stageIn: parseStringList(conditionsSource.stageIn).map((stage) => normalizePipelineStageId(stage)),
      sourceIn: parseStringList(conditionsSource.sourceIn),
      channelIn: parseStringList(conditionsSource.channelIn),
      aiNextActionIn: parseStringList(conditionsSource.aiNextActionIn, 12, 80),
      scoreGte: cleanNumber(conditionsSource.scoreGte),
      waitAtLeastHours: cleanNumber(conditionsSource.waitAtLeastHours),
    },
    actions,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    updatedBy: cleanText(data.updatedBy, 120),
    updatedByName: cleanText(data.updatedByName, 120),
  };
}

function matchesConditions(automation: TenantAutomationDoc, lead: LeadSnapshot, context: LeadAutomationContext) {
  if (automation.trigger !== context.trigger) return false;
  if (!automation.enabled || automation.status === "paused") return false;

  const stageRules = automation.conditions.stageIn || [];
  if (stageRules.length > 0) {
    const targetStage =
      context.trigger === "lead_stage_changed"
        ? normalizePipelineStageId(context.nextStage || lead.pipelineStage)
        : normalizePipelineStageId(lead.pipelineStage);
    if (!stageRules.includes(targetStage)) return false;
  }

  const sourceRules = automation.conditions.sourceIn || [];
  if (sourceRules.length > 0 && !sourceRules.includes(cleanText(lead.origem, 80).toLowerCase())) {
    return false;
  }

  const channelRules = automation.conditions.channelIn || [];
  if (channelRules.length > 0) {
    const channel = cleanText(context.channel, 60).toLowerCase();
    if (!channel || !channelRules.includes(channel)) return false;
  }

  const aiNextActionRules = automation.conditions.aiNextActionIn || [];
  if (aiNextActionRules.length > 0) {
    const aiNextAction = cleanText(context.aiNextAction, 80).toLowerCase();
    if (!aiNextAction || !aiNextActionRules.includes(aiNextAction)) return false;
  }

  const scoreGte = automation.conditions.scoreGte;
  if (typeof scoreGte === "number" && Number(lead.score || 0) < scoreGte) {
    return false;
  }

  const waitAtLeastHours = automation.conditions.waitAtLeastHours;
  if (context.trigger === "waiting_for_reply" && typeof waitAtLeastHours === "number") {
    const waitingSince = context.waitingSince instanceof Date ? context.waitingSince : null;
    if (!waitingSince) return false;
    const waitedHours = (Date.now() - waitingSince.getTime()) / 3600_000;
    if (waitedHours < waitAtLeastHours) return false;
  }

  return true;
}

async function createExecutionLog(input: {
  tenantId: string;
  automationId: string;
  automationName: string;
  trigger: TenantAutomationTrigger;
  leadId: string;
  chatId?: string | null;
  channel?: string | null;
  status: "done" | "skipped" | "error";
  matched: boolean;
  actionsExecuted: number;
  detail: string;
  error?: string;
}) {
  await adminDb.collection("jobs").add({
    tenantId: input.tenantId,
    type: "automation_execution",
    automationId: input.automationId,
    automationName: input.automationName,
    trigger: input.trigger,
    leadId: input.leadId,
    chatId: input.chatId || null,
    channel: input.channel || null,
    status: input.status,
    matched: input.matched,
    actionsExecuted: input.actionsExecuted,
    detail: input.detail,
    lastError: input.error || "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function toDateValue(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value;
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
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

async function resolveChatIdForLead(tenantId: string, leadId: string) {
  const snap = await adminDb
    .collection("chats")
    .where("tenantId", "==", tenantId)
    .where("leadId", "==", leadId)
    .limit(40)
    .get();

  if (snap.empty) return null;

  const items = snap.docs
    .map<AutomationChatRow>((doc) => ({
      id: doc.id,
      ...(doc.data() as Record<string, unknown>),
    }))
    .sort((a, b) => toTime(b.lastMessageTime || b.updatedAt) - toTime(a.lastMessageTime || a.updatedAt));

  const active = items.find((item) => {
    const status = cleanText(item.status, 40).toLowerCase();
    return status !== "resolved" && status !== "archived";
  });

  return (active || items[0])?.id || null;
}

async function executeImmediateAction(
  action: TenantAutomationAction,
  automation: TenantAutomationDoc,
  leadRef: DocumentReference,
  lead: LeadSnapshot,
  context: LeadAutomationContext,
  tagSet: Set<string>,
  leadPatch: Record<string, unknown>
) {
  if (context.trigger === "ai_next_action" && action.type === "send_message") {
    return {
      executed: false,
      event: {
        type: "automation_message_skipped",
        title: "Mensagem ignorada para sinal da IA",
        detail: "Automacoes por sinal da IA nao enviam mensagem automaticamente nesta fase.",
      },
    };
  }

  if ((action.type === "create_task" || action.type === "follow_up") && (action.title || action.type === "follow_up")) {
    const dueInHours = Math.max(0, Math.min(24 * 30, Number(action.dueInHours || 0)));
    const taskTitle =
      action.title ||
      (action.type === "follow_up" ? `Follow-up automatico para ${lead.nome}` : "Tarefa automatica");
    await adminDb.collection("lead_tasks").add({
      tenantId: context.tenantId,
      leadId: context.leadId,
      title: taskTitle,
      type: action.type === "follow_up" ? "follow_up" : action.taskType || "follow_up",
      priority: action.priority || lead.priority || "medium",
      dueAt: dueInHours ? new Date(Date.now() + dueInHours * 3600_000) : null,
      status: "pending",
      source: "tenant_automation",
      reasonCode: action.reasonCode || (action.type === "follow_up" ? "follow_up_due" : "automation_task"),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: context.actorId || "automation",
      createdByName: context.actorName || automation.name,
      automationId: automation.id,
      automationName: automation.name,
    });
    return {
      executed: true,
      event: {
        type: "automation_task_created",
        title: "Automacao criou tarefa",
        detail: taskTitle,
      },
    };
  }

  if (action.type === "move_stage" && action.stageId) {
    const nextStage = normalizePipelineStageId(action.stageId);
    leadPatch.pipelineStage = nextStage;
    leadPatch.stage = nextStage;
    leadPatch.stageUpdatedAt = FieldValue.serverTimestamp();
    return {
      executed: true,
      event: {
        type: "automation_stage_changed",
        title: "Automacao moveu stage",
        detail: `${lead.pipelineStage} -> ${nextStage}`,
      },
    };
  }

  if (action.type === "alert_human") {
    const dueInHours = Math.max(0, Math.min(24 * 30, Number(action.dueInHours || 0)));
    const title = action.title || `Handoff humano para ${lead.nome}`;
    await adminDb.collection("lead_tasks").add({
      tenantId: context.tenantId,
      leadId: context.leadId,
      title,
      type: "alerta_humano",
      priority: action.priority || "high",
      dueAt: dueInHours ? new Date(Date.now() + dueInHours * 3600_000) : new Date(),
      status: "pending",
      source: "tenant_automation",
      reasonCode: action.reasonCode || "human_alert",
      ownerUserId: action.ownerUserId || null,
      ownerName: action.ownerName || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: context.actorId || "automation",
      createdByName: context.actorName || automation.name,
      automationId: automation.id,
      automationName: automation.name,
    });

    if (action.text) {
      await adminDb.collection("lead_notes").add({
        tenantId: context.tenantId,
        leadId: context.leadId,
        text: action.text,
        authorId: "automation",
        authorName: automation.name,
        reasonCode: action.reasonCode || "human_alert",
        automationId: automation.id,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      executed: true,
      event: {
        type: "automation_human_alerted",
        title: "Automacao alertou humano",
        detail: title,
      },
    };
  }

  if (action.type === "add_note" && action.text) {
    await adminDb.collection("lead_notes").add({
      tenantId: context.tenantId,
      leadId: context.leadId,
      text: action.text,
      authorId: "automation",
      authorName: automation.name,
      automationId: automation.id,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      executed: true,
      event: {
        type: "automation_note_added",
        title: "Automacao adicionou nota",
        detail: action.text.slice(0, 240),
      },
    };
  }

  if (action.type === "add_tag" && action.tag) {
    tagSet.add(action.tag);
    return {
      executed: true,
      event: {
        type: "automation_tag_added",
        title: "Automacao adicionou tag",
        detail: action.tag,
      },
    };
  }

  if (action.type === "set_priority" && action.priority) {
    leadPatch.priority = action.priority;
    return {
      executed: true,
      event: {
        type: "automation_priority_changed",
        title: "Automacao ajustou prioridade",
        detail: action.priority,
      },
    };
  }

  if (action.type === "send_message" && action.text) {
    const chatId = cleanText(context.chatId, 140) || (await resolveChatIdForLead(context.tenantId, context.leadId));
    if (!chatId) {
      return {
        executed: false,
        event: {
          type: "automation_message_skipped",
          title: "Automacao sem conversa ativa",
          detail: "Nao foi possivel enviar mensagem: lead sem chat associado.",
        },
      };
    }

    await sendTenantChatText({
      tenantId: context.tenantId,
      chatId,
      text: action.text,
      actor: {
        id: context.actorId || "automation",
        name: context.actorName || automation.name,
      },
      pauseAi: false,
    });

    return {
      executed: true,
      event: {
        type: "automation_message_sent",
        title: "Automacao enviou mensagem",
        detail: action.text.slice(0, 240),
      },
    };
  }

  return { executed: false, event: null as Record<string, unknown> | null };
}

async function scheduleAutomationAction(input: {
  automation: TenantAutomationDoc;
  action: TenantAutomationAction;
  context: LeadAutomationContext;
  leadName: string;
}) {
  const waitInHours = Math.max(0, Math.min(24 * 30, Number(input.action.waitInHours || 0)));
  const executeAfter = new Date(Date.now() + waitInHours * 3600_000);

  await adminDb.collection("jobs").add({
    tenantId: input.context.tenantId,
    type: AUTOMATION_SCHEDULED_JOB_TYPE,
    status: "pending",
    automationId: input.automation.id,
    automationName: input.automation.name,
    trigger: input.context.trigger,
    leadId: input.context.leadId,
    leadName: input.leadName,
    actorId: input.context.actorId || "automation",
    actorName: input.context.actorName || input.automation.name,
    chatId: input.context.chatId || null,
    channel: input.context.channel || null,
    action: input.action,
    executeAfter,
    attempts: 0,
    detail: `Acao ${input.action.type} agendada para ${waitInHours}h`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function executeActions(
  automation: TenantAutomationDoc,
  leadRef: DocumentReference,
  lead: LeadSnapshot,
  context: LeadAutomationContext
) {
  const tagSet = new Set(lead.tags);
  const leadPatch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const eventEntries: Array<Record<string, unknown>> = [];
  let actionsExecuted = 0;
  const orderedActions = [...automation.actions].sort(
    (a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)
  );

  for (const action of orderedActions) {
    if (Number(action.waitInHours || 0) > 0) {
      await scheduleAutomationAction({
        automation,
        action,
        context,
        leadName: lead.nome,
      });
      eventEntries.push({
        type: "automation_action_scheduled",
        title: "Automacao agendou etapa",
        detail: `${action.type} em ${Number(action.waitInHours || 0)}h`,
      });
      actionsExecuted += 1;
      continue;
    }

    const result = await executeImmediateAction(action, automation, leadRef, lead, context, tagSet, leadPatch);
    if (result.executed && result.event) {
      eventEntries.push(result.event);
      actionsExecuted += 1;
    }
  }

  if (tagSet.size !== lead.tags.length) {
    leadPatch.tags = Array.from(tagSet).slice(0, 12);
  }

  await leadRef.set(leadPatch, { merge: true });

  await Promise.all(
    eventEntries.map((entry) =>
      leadRef.collection("events").add({
        ...entry,
        actorId: "automation",
        actorName: automation.name,
        automationId: automation.id,
        automationName: automation.name,
        trigger: context.trigger,
        createdAt: FieldValue.serverTimestamp(),
      })
    )
  );

  return actionsExecuted;
}

export async function listTenantAutomations(tenantId: string) {
  const snap = await adminDb.collection("automations").where("tenantId", "==", tenantId).limit(120).get();
  return snap.docs.map((doc) => normalizeAutomationDoc(doc.id, doc.data() as Record<string, unknown>, tenantId));
}

async function claimScheduledJob(jobId: string) {
  const jobRef = adminDb.collection("jobs").doc(jobId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;

    const data = snap.data() as Record<string, unknown>;
    const status = cleanText(data.status, 40).toLowerCase();
    const executeAfter =
      data.executeAfter instanceof Date
        ? data.executeAfter
        : typeof data.executeAfter === "object" &&
            data.executeAfter &&
            "toDate" in data.executeAfter &&
            typeof (data.executeAfter as { toDate?: () => Date }).toDate === "function"
          ? (data.executeAfter as { toDate: () => Date }).toDate()
          : null;

    if (!["pending", "retrying"].includes(status)) return null;
    if (executeAfter && executeAfter.getTime() > Date.now()) return null;

    const attempts = Number(data.attempts || 0) + 1;
    tx.set(
      jobRef,
      {
        status: "processing",
        attempts,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      id: snap.id,
      ref: jobRef,
      attempts,
      ...(data as Record<string, unknown>),
    } as ScheduledAutomationJob;
  });
}

async function claimWaitingReplyRuntime(input: {
  tenantId: string;
  automationId: string;
  chatId: string;
  waitingKey: string;
  leadId: string;
}) {
  const runtimeId = sanitizeId(
    `${input.tenantId}_${input.automationId}_${input.chatId}_${input.waitingKey}`,
    240
  );
  const runtimeRef = adminDb.collection("jobs").doc(runtimeId);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(runtimeRef);
    if (snap.exists) return null;

    tx.set(runtimeRef, {
      tenantId: input.tenantId,
      type: AUTOMATION_WAITING_REPLY_RUNTIME_TYPE,
      automationId: input.automationId,
      chatId: input.chatId,
      leadId: input.leadId,
      waitingKey: input.waitingKey,
      status: "claimed",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return runtimeRef;
  });
}

export async function processWaitingReplyAutomations(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(input?.limit || 60)));
  const tenantId = cleanText(input?.tenantId, 140);
  const automationDocs = tenantId
    ? await listTenantAutomations(tenantId)
    : (
        await adminDb.collection("automations").limit(240).get()
      ).docs.map((doc) => normalizeAutomationDoc(doc.id, doc.data() as Record<string, unknown>));
  const automations = automationDocs.filter(
    (item) => (!tenantId || item.tenantId === tenantId) && item.trigger === "waiting_for_reply"
  );

  if (automations.length === 0) {
    return { scanned: 0, matched: 0, executed: 0, skipped: 0 };
  }

  const tenantIds = Array.from(new Set(automations.map((item) => item.tenantId)));
  const chatDocs: AutomationChatRow[] = (
    await Promise.all(
      tenantIds.map(async (automationTenantId) => {
        const snap = await adminDb
          .collection("chats")
          .where("tenantId", "==", automationTenantId)
          .limit(600)
          .get();

        return snap.docs.map<AutomationChatRow>((doc) => ({
          id: doc.id,
          ...(doc.data() as Record<string, unknown>),
        }));
      })
    )
  )
    .flat()
    .sort((a, b) => toTime(a.lastClientMessageAt || a.updatedAt) - toTime(b.lastClientMessageAt || b.updatedAt))
    .slice(0, limit);

  let scanned = 0;
  let matched = 0;
  let executed = 0;
  let skipped = 0;

  for (const chat of chatDocs) {
    scanned += 1;

    const chatTenantId = cleanText(chat.tenantId, 140);
    const leadId = cleanText(chat.leadId, 140);
    const chatId = cleanText(chat.id, 140);
    const status = cleanText(chat.status, 40).toLowerCase();
    const lastClientAt = toDateValue(chat.lastClientMessageAt);
    const lastAgentAt = toDateValue(chat.lastAgentMessageAt);
    const waitingForReply = Boolean(lastClientAt && (!lastAgentAt || lastAgentAt.getTime() < lastClientAt.getTime()));

    if (!chatTenantId || !leadId || !chatId) {
      skipped += 1;
      continue;
    }
    if (status === "resolved" || status === "archived" || !waitingForReply || !lastClientAt) {
      skipped += 1;
      continue;
    }

    const leadRef = adminDb.collection("leads").doc(leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) {
      skipped += 1;
      continue;
    }

    const leadData = leadSnap.data() as Record<string, unknown>;
    if (cleanText(leadData.tenantId, 140) !== chatTenantId) {
      skipped += 1;
      continue;
    }

    const lead: LeadSnapshot = {
      id: leadId,
      nome: cleanText(leadData.nome, 180) || "Lead",
      origem: cleanText(leadData.origem, 80).toLowerCase(),
      pipelineStage: normalizePipelineStageId(leadData.pipelineStage || leadData.stage || "captado"),
      score: cleanNumber(leadData.score),
      priority: cleanText(leadData.priority, 20).toLowerCase() || "medium",
      tags: parseStringList(leadData.tags, 12, 32),
    };

    const dueAt = toDateValue(chat.slaDueAt);
    const slaBreached = Boolean(dueAt && dueAt.getTime() <= Date.now());
    const waitingKey = String(lastClientAt.getTime());
    const tenantAutomations = automations.filter((item) => item.tenantId === chatTenantId);

    for (const automation of tenantAutomations) {
      const context: LeadAutomationContext = {
        tenantId: chatTenantId,
        trigger: "waiting_for_reply",
        leadId,
        actorId: "automation_watchdog",
        actorName: "Automation Watchdog",
        chatId,
        channel: cleanText(chat.channel, 60).toLowerCase() || null,
        waitingSince: lastClientAt,
        slaBreached,
      };

      if (!matchesConditions(automation, lead, context)) {
        continue;
      }

      const claimedRuntimeRef = await claimWaitingReplyRuntime({
        tenantId: chatTenantId,
        automationId: automation.id,
        chatId,
        waitingKey,
        leadId,
      });
      if (!claimedRuntimeRef) {
        skipped += 1;
        continue;
      }

      matched += 1;

      try {
        const actionsExecuted = await executeActions(automation, leadRef, lead, context);
        executed += actionsExecuted;

        await claimedRuntimeRef.set(
          {
            status: "done",
            actionsExecuted,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp(),
            detail: `Aguardando resposta desde ${lastClientAt.toISOString()}`,
          },
          { merge: true }
        );

        await createExecutionLog({
          tenantId: chatTenantId,
          automationId: automation.id,
          automationName: automation.name,
          trigger: "waiting_for_reply",
          leadId,
          chatId,
          channel: cleanText(chat.channel, 60).toLowerCase() || null,
          status: actionsExecuted > 0 ? "done" : "skipped",
          matched: true,
          actionsExecuted,
          detail: `Aguardando resposta ha ${Number(
            ((Date.now() - lastClientAt.getTime()) / 3600_000).toFixed(1)
          )}h`,
        });
      } catch (error) {
        await claimedRuntimeRef.set(
          {
            status: "error",
            updatedAt: FieldValue.serverTimestamp(),
            lastError: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
          },
          { merge: true }
        );

        await createExecutionLog({
          tenantId: chatTenantId,
          automationId: automation.id,
          automationName: automation.name,
          trigger: "waiting_for_reply",
          leadId,
          chatId,
          channel: cleanText(chat.channel, 60).toLowerCase() || null,
          status: "error",
          matched: true,
          actionsExecuted: 0,
          detail: "Falha ao executar automacao de espera",
          error: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
        });
      }
    }
  }

  return { scanned, matched, executed, skipped };
}

export async function processPendingAutomationActions(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(100, Number(input?.limit || 30)));
  const snap = await adminDb
    .collection("jobs")
    .where("type", "==", AUTOMATION_SCHEDULED_JOB_TYPE)
    .limit(200)
    .get();

  const dueJobs = snap.docs
    .map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((job) => !input?.tenantId || cleanText(job.tenantId, 140) === input.tenantId)
    .sort((a, b) => toTime(a.executeAfter) - toTime(b.executeAfter))
    .slice(0, limit);

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of dueJobs) {
    const claimed = await claimScheduledJob(job.id);
    if (!claimed) continue;
    processed += 1;

    try {
      const tenantId = cleanText(claimed.tenantId, 140);
      const leadId = cleanText(claimed.leadId, 140);
      const automationId = cleanText(claimed.automationId, 140);
      const automationName = cleanText(claimed.automationName, 180) || "Automacao";
      const jobTrigger = normalizeTrigger(claimed.trigger);
      const jobChatId = cleanText(claimed.chatId, 140);
      const jobChannel = cleanText(claimed.channel, 80).toLowerCase();
      const action =
        claimed.action && typeof claimed.action === "object"
          ? (claimed.action as TenantAutomationAction)
          : null;

      if (!tenantId || !leadId || !action) {
        throw new Error("Job agendado sem contexto valido.");
      }

      const leadRef = adminDb.collection("leads").doc(leadId);
      const leadSnap = await leadRef.get();
      if (!leadSnap.exists) {
        throw new Error("Lead do job agendado nao encontrado.");
      }

      const leadData = leadSnap.data() as Record<string, unknown>;
      if (cleanText(leadData.tenantId, 140) !== tenantId) {
        throw new Error("Lead fora do tenant do job agendado.");
      }

      const tagSet = new Set(parseStringList(leadData.tags, 12, 32));
      const leadPatch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
      };
      const lead: LeadSnapshot = {
        id: leadId,
        nome: cleanText(leadData.nome, 180) || "Lead",
        origem: cleanText(leadData.origem, 80).toLowerCase(),
        pipelineStage: normalizePipelineStageId(leadData.pipelineStage || leadData.stage || "captado"),
        score: cleanNumber(leadData.score),
        priority: cleanText(leadData.priority, 20).toLowerCase() || "medium",
        tags: parseStringList(leadData.tags, 12, 32),
      };

      const result = await executeImmediateAction(
        action,
        {
          id: automationId,
          tenantId,
          name: automationName,
          description: "",
          trigger: jobTrigger,
          enabled: true,
          status: "active",
          conditions: {},
          actions: [action],
        },
        leadRef,
        lead,
        {
          tenantId,
          leadId,
          trigger: jobTrigger,
          actorId: cleanText(claimed.actorId, 140) || "automation_scheduler",
          actorName: cleanText(claimed.actorName, 140) || automationName,
          chatId: jobChatId || null,
          channel: jobChannel || null,
        },
        tagSet,
        leadPatch
      );

      if (tagSet.size !== lead.tags.length) {
        leadPatch.tags = Array.from(tagSet).slice(0, 12);
      }

      await leadRef.set(leadPatch, { merge: true });

      if (result.event) {
        await leadRef.collection("events").add({
          ...result.event,
          actorId: "automation",
          actorName: automationName,
          automationId,
          automationName,
          trigger: "scheduled_action",
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      await claimed.ref.set(
        {
          status: "done",
          actionsExecuted: result.executed ? 1 : 0,
          updatedAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
          lastError: "",
        },
        { merge: true }
      );

      await createExecutionLog({
        tenantId,
        automationId,
        automationName,
        trigger: jobTrigger,
        leadId,
        chatId: jobChatId || null,
        channel: jobChannel || null,
        status: result.executed ? "done" : "skipped",
        matched: true,
        actionsExecuted: result.executed ? 1 : 0,
        detail: `Acao agendada executada: ${action.type}`,
      });

      completed += 1;
    } catch (error) {
      const attempts = Number(claimed.attempts || 1);
      await claimed.ref.set(
        {
          status: attempts >= 3 ? "dead_letter" : "retrying",
          updatedAt: FieldValue.serverTimestamp(),
          lastError: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
        },
        { merge: true }
      );
      failed += 1;
    }
  }

  return { processed, completed, failed };
}

export async function runLeadAutomations(context: LeadAutomationContext) {
  const leadRef = adminDb.collection("leads").doc(context.leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    return { evaluated: 0, matched: 0, executed: 0 };
  }

  const leadData = leadSnap.data() as Record<string, unknown>;
  if (cleanText(leadData.tenantId, 140) !== context.tenantId) {
    return { evaluated: 0, matched: 0, executed: 0 };
  }

  const lead: LeadSnapshot = {
    id: context.leadId,
    nome: cleanText(leadData.nome, 180) || "Lead",
    origem: cleanText(leadData.origem, 80).toLowerCase(),
    pipelineStage: normalizePipelineStageId(leadData.pipelineStage || leadData.stage || "captado"),
    score: cleanNumber(leadData.score),
    priority: cleanText(leadData.priority, 20).toLowerCase() || "medium",
    tags: parseStringList(leadData.tags, 12, 32),
  };

  const automations = await listTenantAutomations(context.tenantId);
  let matched = 0;
  let executed = 0;

  for (const automation of automations) {
    if (!matchesConditions(automation, lead, context)) {
      continue;
    }

    matched += 1;

    try {
      const actionsExecuted = await executeActions(automation, leadRef, lead, context);
      executed += actionsExecuted;
      await createExecutionLog({
        tenantId: context.tenantId,
        automationId: automation.id,
        automationName: automation.name,
        trigger: context.trigger,
        leadId: context.leadId,
        chatId: context.chatId || null,
        channel: cleanText(context.channel, 80).toLowerCase() || null,
        status: actionsExecuted > 0 ? "done" : "skipped",
        matched: true,
        actionsExecuted,
        detail:
          context.trigger === "lead_stage_changed"
            ? `${context.previousStage || "captado"} -> ${context.nextStage || lead.pipelineStage}`
            : context.trigger === "message_received"
              ? `Mensagem recebida (${cleanText(context.channel, 80) || "canal"})`
            : context.trigger === "ai_next_action"
              ? `Sinal da IA: ${cleanText(context.aiNextAction, 120) || "sem acao"}`
            : context.trigger === "budget_approved"
              ? "Proposta aprovada"
            : context.trigger === "finance_paid"
              ? "Receita marcada como paga"
            : "Lead criado",
      });
    } catch (error) {
      console.error("Erro ao executar automacao do tenant:", {
        tenantId: context.tenantId,
        automationId: automation.id,
        leadId: context.leadId,
        trigger: context.trigger,
        error,
      });

      await createExecutionLog({
        tenantId: context.tenantId,
        automationId: automation.id,
        automationName: automation.name,
        trigger: context.trigger,
        leadId: context.leadId,
        chatId: context.chatId || null,
        channel: cleanText(context.channel, 80).toLowerCase() || null,
        status: "error",
        matched: true,
        actionsExecuted: 0,
        detail: "Falha ao executar automacao",
        error: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
      });
    }
  }

  return {
    evaluated: automations.length,
    matched,
    executed,
  };
}
