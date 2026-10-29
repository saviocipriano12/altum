import { FieldPath, FieldValue, type DocumentReference } from "firebase-admin/firestore";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { AutomationInternalEffectAuthorizationError, commitInboundAutomationInternalEffect, commitScheduledAutomationInternalEffect, commitLegacyAutomationCrmEffect, supportsAtomicAutomationEffect } from "@/lib/server/automation-internal-effect";
import { supportsAtomicCrmEffect } from "@/lib/automation-effect-contract";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { withCommercialTaskIndex } from "@/lib/crm-task-index";
import { normalizePipelineStageId } from "@/lib/pipeline";
import { sendTenantChatText } from "@/lib/server/chat-dispatch";
import { freezeProposalAutomationPlans, queueProposalAutomationMessage, scheduleProposalAutomationMessage, commitProposalAutomationInternalRecords,
  scheduleProposalAutomationInternalRecords, commitScheduledProposalAutomationInternalRecords,
  assertProposalAutomationSchedule, isProposalAutomationSchedule, isProposalAutomationAuthorizationError, type ProposalAutomationClaim } from "@/lib/server/automation-proposal-delivery";
import { reserveTenantAutomationExecution } from "@/lib/server/tenant-usage";
import { queueScheduledAutomationMessage, queueWaitingReplyAutomationMessage, queueInboundAutomationMessage } from "@/lib/server/automation-message-delivery";
import { admitInboundAutomationEvent, claimInboundAutomationExecution, finishInboundAutomationExecution, InboundAutomationPreparingError, type InboundAutomationClaim } from "@/lib/server/automation-inbound-execution";
import { freezeStageAutomationPlans, beginStageAutomationRun, finishStageAutomationRun, queueStageAutomationMessage, commitStageAutomationInternalRecords,
  scheduleStageAutomationAction, isStageAutomationSchedule, assertStageAutomationSchedule, isStageAutomationAuthorizationError,
  commitScheduledStageAutomationInternalRecords, type StageAutomationSource } from "@/lib/server/automation-stage-delivery";

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
  sourceMessageId?: string;
  inboundClaim?: InboundAutomationClaim;
  schedulerClaimToken?: string;
  recoveryAutomationId?: string;
  strictErrors?: boolean;
  proposalClaim?: ProposalAutomationClaim;
  stageSource?: StageAutomationSource;
  socialClaim?: { logId: string; token: string };
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
  claimToken: string;
} & Record<string, unknown>;

function cleanText(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
  automationId: string | null;
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
  lead: LeadSnapshot,
  context: LeadAutomationContext,
  scheduledJobId?: string,
  actionIndex?: number
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

  if (scheduledJobId && supportsAtomicAutomationEffect(action)) {
    const stage = await commitScheduledStageAutomationInternalRecords({ tenantId: context.tenantId, leadId: context.leadId,
      scheduledJobId, token: context.schedulerClaimToken || "", action });
    if (stage) return stage;
    const proposal = await commitScheduledProposalAutomationInternalRecords({ tenantId: context.tenantId, leadId: context.leadId,
      scheduledJobId, token: context.schedulerClaimToken || "", action });
    if (proposal) return proposal;
    const committed = await commitScheduledAutomationInternalEffect({ tenantId: context.tenantId, chatId: context.chatId || "", leadId: context.leadId,
      scheduledJobId, claimToken: context.schedulerClaimToken || "", action });
    if (committed) return committed;
  }
  if (context.inboundClaim && supportsAtomicAutomationEffect(action)) {
    return commitInboundAutomationInternalEffect({ tenantId: context.tenantId, chatId: context.chatId || "", leadId: context.leadId,
      sourceMessageId: context.sourceMessageId || "", claim: context.inboundClaim, actionIndex: actionIndex ?? -1, action });
  }
  if (context.proposalClaim && supportsAtomicAutomationEffect(action)) {
    return commitProposalAutomationInternalRecords({ tenantId: context.tenantId, leadId: context.leadId, claim: context.proposalClaim,
      automation, actionIndex: actionIndex ?? -1, action });
  }
  if (context.stageSource && supportsAtomicAutomationEffect(action)) {
    return commitStageAutomationInternalRecords({ tenantId: context.tenantId, leadId: context.leadId, source: context.stageSource,
      automation, actionIndex: actionIndex ?? -1, action });
  }
  if (supportsAtomicCrmEffect(action)) return commitLegacyAutomationCrmEffect({ tenantId: context.tenantId,
    leadId: context.leadId, automationId: automation.id, automationName: automation.name, trigger: context.trigger, action });

  if ((action.type === "create_task" || action.type === "follow_up") && (action.title || action.type === "follow_up")) {
    const dueInHours = Math.max(0, Math.min(24 * 30, Number(action.dueInHours || 0)));
    const taskTitle =
      action.title ||
      (action.type === "follow_up" ? `Follow-up automatico para ${lead.nome}` : "Tarefa automatica");
    await adminDb.collection("lead_tasks").add(withCommercialTaskIndex({
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
    }));
    return {
      executed: true,
      event: {
        type: "automation_task_created",
        title: "Automacao criou tarefa",
        detail: taskTitle,
      },
    };
  }

  if (action.type === "alert_human") {
    const dueInHours = Math.max(0, Math.min(24 * 30, Number(action.dueInHours || 0)));
    const title = action.title || `Handoff humano para ${lead.nome}`;
    await adminDb.collection("lead_tasks").add(withCommercialTaskIndex({
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
    }));

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

  if (action.type === "send_message" && action.text) {
    const chatId = (context.inboundClaim ? context.chatId || "" : cleanText(context.chatId, 140)) || (await resolveChatIdForLead(context.tenantId, context.leadId));
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

    if (scheduledJobId) {
      const accepted = await queueScheduledAutomationMessage({ tenantId: context.tenantId, chatId,
        scheduledJobId, automationId: automation.id, automationName: automation.name, text: action.text, schedulerClaimToken: context.schedulerClaimToken });
      return { executed: true, event: { type: "automation_message_queued", title: "Automacao registrou mensagem para envio",
        detail: action.text.slice(0, 240), messageId: accepted.messageId, outboundJobId: accepted.jobId } };
    }

    if (context.trigger === "waiting_for_reply" && !context.stageSource) {
      const accepted = await queueWaitingReplyAutomationMessage({ tenantId: context.tenantId, chatId,
        waitingSinceMs: context.waitingSince?.getTime() ?? Number.NaN, actionIndex: actionIndex ?? -1,
        automationId: automation.id, automationName: automation.name, text: action.text });
      return { executed: true, event: { type: "automation_message_queued", title: "Automacao registrou mensagem para envio",
        detail: action.text.slice(0, 240), messageId: accepted.messageId, outboundJobId: accepted.jobId } };
    }

    if (context.trigger === "message_received" && context.sourceMessageId !== undefined) {
      if (!context.inboundClaim) throw new Error("Evento de mensagem sem plano de automacao aceito.");
      const accepted = await queueInboundAutomationMessage({ tenantId: context.tenantId, chatId, leadId: context.leadId,
        sourceMessageId: context.sourceMessageId, actionIndex: actionIndex ?? -1, claim: context.inboundClaim,
        automationId: automation.id, automationName: automation.name, text: action.text });
      return { executed: true, event: { type: "automation_message_queued", title: "Automacao registrou mensagem para envio",
        detail: action.text.slice(0, 240), messageId: accepted.messageId, outboundJobId: accepted.jobId } };
    }

    if (context.proposalClaim) {
      if (context.trigger !== "budget_approved") throw new Error("Origem de proposta fora do gatilho autorizado.");
      const accepted = await queueProposalAutomationMessage({ tenantId: context.tenantId, leadId: context.leadId, chatId,
        claim: context.proposalClaim, automation, actionIndex: actionIndex ?? -1, text: action.text });
      return { executed: true, event: { type: "automation_message_queued", title: "Automacao registrou mensagem para envio",
        detail: action.text.slice(0, 240), messageId: accepted.messageId, outboundJobId: accepted.jobId } };
    }
    if (context.stageSource) {
      const accepted = await queueStageAutomationMessage({ tenantId: context.tenantId, leadId: context.leadId, chatId,
        source: context.stageSource, automation, actionIndex: actionIndex ?? -1, text: action.text });
      return { executed: true, event: { type: "automation_message_queued", title: "Automacao registrou mensagem para envio",
        detail: action.text.slice(0, 240), messageId: accepted.messageId, outboundJobId: accepted.jobId } };
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
  actionIndex: number;
}) {
  if (input.context.stageSource) {
    const chatId = input.action.type === "send_message" ? input.context.chatId || await resolveChatIdForLead(input.context.tenantId, input.context.leadId) : null;
    return scheduleStageAutomationAction({ tenantId: input.context.tenantId, leadId: input.context.leadId, source: input.context.stageSource,
      automation: input.automation, action: input.action, actionIndex: input.actionIndex, chatId });
  }
  if (input.context.proposalClaim && supportsAtomicAutomationEffect(input.action)) {
    return scheduleProposalAutomationInternalRecords({ tenantId: input.context.tenantId, leadId: input.context.leadId,
      claim: input.context.proposalClaim, automation: input.automation, action: input.action, actionIndex: input.actionIndex });
  }
  if (input.context.proposalClaim && input.action.type === "send_message") {
    const chatId = input.context.chatId || await resolveChatIdForLead(input.context.tenantId, input.context.leadId);
    if (!chatId) throw new Error("PROPOSAL_SCHEDULE_CHAT_MISSING");
    return scheduleProposalAutomationMessage({ tenantId: input.context.tenantId, leadId: input.context.leadId,
      chatId, claim: input.context.proposalClaim, automation: input.automation, action: input.action, actionIndex: input.actionIndex });
  }
  const waitInHours = Math.max(0, Math.min(24 * 30, Number(input.action.waitInHours || 0)));
  const executeAfter = new Date(Date.now() + waitInHours * 3600_000);

  const data = {
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
  };
  if (!input.context.inboundClaim) return (await adminDb.collection("jobs").add(data)).id;
  const claim = input.context.inboundClaim;
  const id = `automation_scheduled_${createHash("sha256").update(JSON.stringify([claim.id, input.actionIndex])).digest("hex")}`;
  await adminDb.runTransaction(async tx => {
    const runRef = adminDb.collection("jobs").doc(claim.id), ref = adminDb.collection("jobs").doc(id);
    const [run, existing] = await Promise.all([tx.get(runRef), tx.get(ref)]);
    const row = run.data();
    const actions = Array.isArray(row?.plan?.actions) ? [...row.plan.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)) : [];
    if (!row || row.tenantId !== input.context.tenantId || row.leadId !== input.context.leadId || row.chatId !== input.context.chatId ||
        row.automationId !== input.automation.id || row.claimToken !== claim.token || row.status !== "processing" ||
        toTime(row.leaseUntil) <= Date.now() || !isDeepStrictEqual(actions[input.actionIndex], input.action)) {
      throw new Error("Plano/claim do agendamento expirou ou mudou.");
    }
    if (existing.exists) {
      const previous = existing.data()!;
      if (previous.tenantId !== row.tenantId || previous.inboundExecutionId !== claim.id || previous.actionIndex !== input.actionIndex ||
          previous.chatId !== row.chatId || previous.leadId !== row.leadId || !isDeepStrictEqual(previous.action, input.action)) {
        throw new Error("Agendamento aceito com outro plano/destino.");
      }
      return;
    }
    tx.create(ref, { ...data, inboundExecutionId: claim.id, actionIndex: input.actionIndex,
      ...(supportsAtomicAutomationEffect(input.action) ? { internalEffectProtocolVersion: 1 } : {}),
      sourceMessageId: row.sourceMessageId, executeAfter: new Date(toTime(row.createdAt) + waitInHours * 3600_000) });
  });
  return id;
}

async function executeActions(
  automation: TenantAutomationDoc,
  leadRef: DocumentReference,
  lead: LeadSnapshot,
  context: LeadAutomationContext
) {
  const eventEntries: Array<Record<string, unknown>> = [];
  let actionsExecuted = 0;
  const orderedActions = [...automation.actions].sort(
    (a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)
  );

  for (const [actionIndex, action] of orderedActions.entries()) {
    if ((context.trigger === "ai_next_action" || context.stageSource?.kind === "socialEvent") && action.type === "send_message") continue;
    if (Number(action.waitInHours || 0) > 0) {
      const scheduledJobId = await scheduleAutomationAction({
        automation,
        action,
        context,
        leadName: lead.nome,
        actionIndex,
      });
      eventEntries.push({
        type: "automation_action_scheduled",
        title: "Automacao agendou etapa",
        detail: `${action.type} em ${Number(action.waitInHours || 0)}h`,
        scheduledJobId,
      });
      actionsExecuted += 1;
      continue;
    }

    const result = await executeImmediateAction(action, automation, lead, context, undefined, actionIndex);
    if (result.executed) actionsExecuted += 1;
    if (result.executed && result.event) eventEntries.push(result.event);
  }

  await Promise.all(
    eventEntries.map(async (entry) => {
      const event = {
        ...entry,
        actorId: "automation",
        actorName: automation.name,
        automationId: automation.id,
        automationName: automation.name,
        trigger: context.trigger,
        createdAt: FieldValue.serverTimestamp(),
      };
      if (entry.type === "automation_message_queued" && typeof entry.outboundJobId === "string") {
        const ref = leadRef.collection("events").doc(`automation_${entry.outboundJobId}`);
        await adminDb.runTransaction(async tx => { if (!(await tx.get(ref)).exists) tx.create(ref, event); });
      } else if (entry.type === "automation_action_scheduled" && typeof entry.scheduledJobId === "string") {
        const ref = leadRef.collection("events").doc(`scheduled_${entry.scheduledJobId}`);
        await adminDb.runTransaction(async tx => { if (!(await tx.get(ref)).exists) tx.create(ref, event); });
      } else await leadRef.collection("events").add(event);
    })
  );

  return actionsExecuted;
}

export async function listTenantAutomations(tenantId: string) {
  const snap = await adminDb.collection("automations").where("tenantId", "==", tenantId).limit(120).get();
  return snap.docs.map((doc) => normalizeAutomationDoc(doc.id, doc.data() as Record<string, unknown>, tenantId));
}

export async function claimScheduledAutomationJob(jobId: string, tenantId?: string) {
  const jobRef = adminDb.collection("jobs").doc(jobId);
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;

    const data = snap.data() as Record<string, unknown>;
    if (data.type !== AUTOMATION_SCHEDULED_JOB_TYPE || (tenantId && data.tenantId !== tenantId)) return null;
    const status = cleanText(data.status, 40).toLowerCase();
    const scheduledAction = data.action && typeof data.action === "object" ? data.action as TenantAutomationAction : null;
    const internalProof = scheduledAction && supportsAtomicAutomationEffect(scheduledAction) &&
      data.internalEffectProtocolVersion === 1 && data.internalEffectExecutorVersion === 1 &&
      typeof data.internalEffectExecutorToken === "string" && Boolean(data.internalEffectExecutorToken) &&
      data.internalEffectExecutorToken === data.claimToken && (typeof data.inboundExecutionId === "string" ||
        data.proposalScheduleProtocol === 1 && typeof data.automationProposalSourceId === "string" ||
        data.stageScheduleProtocol === 1 && typeof data.stageSourceId === "string");
    const retryProof = internalProof || (scheduledAction?.type === "send_message" && data.schedulerProtocolVersion === 1);
    if ((status === "retrying" || (status === "pending" && Number(data.attempts || 0) > 0)) && !retryProof) {
      tx.update(jobRef, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
        lastError: "Tentativa anterior sem recibo/protocolo comprovado; conferir efeito antes de repetir." });
      return null;
    }
    const executeAfter =
      data.executeAfter instanceof Date
        ? data.executeAfter
        : typeof data.executeAfter === "object" &&
            data.executeAfter &&
            "toDate" in data.executeAfter &&
            typeof (data.executeAfter as { toDate?: () => Date }).toDate === "function"
          ? (data.executeAfter as { toDate: () => Date }).toDate()
          : null;

    if (status === "processing") {
      if (toTime(data.leaseUntil) > Date.now()) return null;
      const safeRecovery = data.schedulerProtocolVersion === 1 && (scheduledAction?.type === "send_message" || internalProof) && Number(data.attempts || 0) < 3;
      if (!safeRecovery) {
        tx.update(jobRef, { status: "reconciliation_required", updatedAt: FieldValue.serverTimestamp(),
          lastError: "Execucao interrompida sem prova de efeito idempotente; conferir antes de retomar." });
        return null;
      }
    } else if (!["pending", "retrying"].includes(status)) return null;
    if (executeAfter && executeAfter.getTime() > Date.now()) return null;
    if (toTime(data.retryAfter) > Date.now()) return null;

    if (isStageAutomationSchedule(jobId, data)) {
      try { await assertStageAutomationSchedule(tx, jobId, data, "claim"); }
      catch (error) {
        if (error instanceof InboundAutomationPreparingError) return null;
        if (!isStageAutomationAuthorizationError(error)) throw error;
        tx.update(jobRef, { status: "reconciliation_required", lastError: error instanceof Error ? error.message : "STAGE_SCHEDULE_REVOKED", updatedAt: FieldValue.serverTimestamp() });
        return null;
      }
    }

    if (isProposalAutomationSchedule(jobId, data)) {
      try { await assertProposalAutomationSchedule(tx, jobId, data, "claim"); }
      catch (error) {
        if (error instanceof InboundAutomationPreparingError) return null;
        if (!isProposalAutomationAuthorizationError(error)) throw error;
        tx.update(jobRef, { status: "reconciliation_required", lastError: error instanceof Error ? error.message : "PROPOSAL_SCHEDULE_REVOKED", updatedAt: FieldValue.serverTimestamp() });
        return null;
      }
    }

    const attempts = Number(data.attempts || 0) + 1;
    const claimToken = randomUUID();
    const internalExecutor = Boolean(scheduledAction && supportsAtomicAutomationEffect(scheduledAction) && (typeof data.inboundExecutionId === "string" ||
      data.proposalScheduleProtocol === 1 && typeof data.automationProposalSourceId === "string" ||
      data.stageScheduleProtocol === 1 && typeof data.stageSourceId === "string"));
    tx.set(
      jobRef,
      {
        status: "processing",
        attempts,
        claimToken, leaseUntil: new Date(Date.now() + 60_000), schedulerProtocolVersion: 1,
        ...(internalExecutor ? { internalEffectExecutorVersion: 1, internalEffectExecutorToken: claimToken } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      id: snap.id,
      ref: jobRef,
      ...(data as Record<string, unknown>),
      ...(internalExecutor ? { internalEffectExecutorVersion: 1, internalEffectExecutorToken: claimToken } : {}),
      attempts, claimToken,
    } as ScheduledAutomationJob;
  });
}

export async function finishScheduledAutomationJob(claim: ScheduledAutomationJob, patch: Record<string, unknown>) {
  return adminDb.runTransaction(async tx => {
    const current = await tx.get(claim.ref), row = current.data();
    if (!row || row.status !== "processing" || row.claimToken !== claim.claimToken || row.tenantId !== claim.tenantId ||
        toTime(row.leaseUntil) <= Date.now()) return false;
    tx.update(claim.ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

/** Merge paged per-tenant streams in waiting-time order. Skipped/completed
 * intervals never consume the work budget or permanently hide later chats. */
async function* waitingChatCatalogue(tenantIds: string[], rejected: Set<string>): AsyncGenerator<AutomationChatRow> {
  const streams = await Promise.all(tenantIds.map(async tenantId => {
    const query = adminDb.collection("chats").where("tenantId", "==", tenantId).orderBy("lastClientMessageAt", "asc").orderBy(FieldPath.documentId()).limit(100);
    let page: FirebaseFirestore.QueryDocumentSnapshot[] = [], index = 0, cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined, more = true;
    const next = async (): Promise<AutomationChatRow | null> => {
      if (index >= page.length) {
        if (!more) return null;
        const snap = await (cursor ? query.startAfter(cursor) : query).get();
        page = snap.docs; index = 0; more = page.length === 100; cursor = page[page.length - 1];
        if (!page.length) return null;
      }
      const doc = page[index++]; return { ...doc.data(), id: doc.id };
    };
    return { tenantId, next, head: await next() };
  }));
  for (;;) {
    const active = streams.filter(stream => stream.head && !rejected.has(stream.tenantId));
    if (!active.length) return;
    const first = active.reduce((a, b) => {
      const time = toTime(a.head!.lastClientMessageAt) - toTime(b.head!.lastClientMessageAt);
      return time < 0 || time === 0 && a.head!.id < b.head!.id ? a : b;
    });
    yield first.head!;
    first.head = rejected.has(first.tenantId) ? null : await first.next();
  }
}

export async function processWaitingReplyAutomations(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(input?.limit || 60)));
  const tenantId = cleanText(input?.tenantId, 140);
  let query = adminDb.collection("automations").where("trigger", "==", "waiting_for_reply");
  if (tenantId) query = query.where("tenantId", "==", tenantId);
  const catalogue = query.orderBy(FieldPath.documentId()).limit(100);
  const automationDocs: TenantAutomationDoc[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    const page = await (cursor ? catalogue.startAfter(cursor) : catalogue).get();
    automationDocs.push(...page.docs.map(doc => normalizeAutomationDoc(doc.id, doc.data())));
    if (page.size < 100) break;
    cursor = page.docs[page.docs.length - 1];
  }
  const automations = automationDocs.filter(
    (item) => (!tenantId || item.tenantId === tenantId) && item.trigger === "waiting_for_reply"
  );

  if (automations.length === 0) {
    return { scanned: 0, matched: 0, executed: 0, skipped: 0, failed: 0 };
  }

  const tenantIds = Array.from(new Set(automations.map((item) => item.tenantId)));
  const rejectedTenants = new Set<string>();

  let scanned = 0;
  let matched = 0;
  let executed = 0;
  let skipped = 0;
  let failed = 0;

  let admittedChats = 0;
  for await (const chat of waitingChatCatalogue(tenantIds, rejectedTenants)) {
    if (admittedChats >= limit) break;
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

    const waitingKey = String(lastClientAt.getTime());
    try {
      const { admitWaitingReplyBatch, processWaitingReplyOccurrence } = await import("@/lib/server/crm/waiting-reply-occurrence");
      const id = await admitWaitingReplyBatch({ tenantId: chatTenantId, chatId, leadId, waitingKey,
        normalize: normalizeAutomationDoc,
        matches: (current, data, currentChat) => matchesConditions(current, {
          id: leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
          pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
          priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
        }, { tenantId: chatTenantId, leadId, chatId, trigger: "waiting_for_reply", actorId: "automation_watchdog", actorName: "Automation Watchdog",
          channel: cleanText(currentChat.channel, 60).toLowerCase() || null, waitingSince: toDateValue(currentChat.lastClientMessageAt),
          slaBreached: Boolean(toDateValue(currentChat.slaDueAt) && toTime(currentChat.slaDueAt) <= Date.now()) }),
      });
      if (!id) { skipped += 1; continue; }
      admittedChats += 1;
      const result = await processWaitingReplyOccurrence(id, chatTenantId);
      matched += result.matched;
      executed += result.executed;
    } catch (error) {
      skipped += 1; failed += 1;
      if (error instanceof Error && ["CRM_STAGE_WAITING_MODULE_REVOKED", "CRM_STAGE_WAITING_TENANT_BLOCKED"].includes(error.message)) rejectedTenants.add(chatTenantId);
      await createExecutionLog({ tenantId: chatTenantId, automationId: null, automationName: "Espera de atendimento",
        trigger: "waiting_for_reply", leadId, chatId, status: "error", matched: false, actionsExecuted: 0,
        detail: "Falha ao preparar ou retomar intervalo de espera",
        error: error instanceof Error && /^CRM_STAGE_WAITING_[A-Z_]+$/.test(error.message) ? error.message : "WAITING_OCCURRENCE_UNAVAILABLE",
      }).catch(() => { /* The failure counter survives a logging outage. */ });
    }
  }

  return { scanned, matched, executed, skipped, failed };
}

export async function processInterruptedInboundAutomations(input?: { tenantId?: string; limit?: number }) {
  const limit = Math.max(1, Math.min(20, Number(input?.limit || 10)));
  let query = adminDb.collection("jobs").where("type", "==", "automation_inbound_execution").where("status", "==", "processing");
  if (input?.tenantId) query = query.where("tenantId", "==", input.tenantId);
  const snap = await query.where("leaseUntil", "<=", new Date()).orderBy("leaseUntil", "asc").limit(limit).get();
  let resumed = 0, quarantined = 0, failed = 0;
  for (const doc of snap.docs) {
    const row = doc.data();
    try {
      const result = await runLeadAutomations({ tenantId: row.tenantId, leadId: row.leadId, chatId: row.chatId,
        sourceMessageId: row.sourceMessageId, trigger: "message_received", recoveryAutomationId: row.automationId });
      const current = (await doc.ref.get()).data();
      if (result.executed > 0 && current?.status === "done") resumed += 1;
      else if (current?.status === "reconciliation_required") quarantined += 1;
      else if (current?.status === "processing" && toTime(current.leaseUntil) <= Date.now()) {
        throw new Error("Ocorrencia sem consumidor/fonte elegivel para retomada.");
      }
    } catch {
      failed += 1;
      // Missing/revoked sources cannot strand an expired job forever. Never
      // quarantine a newer claim that won while this worker was inspecting it.
      await adminDb.runTransaction(async tx => {
        const current = await tx.get(doc.ref), data = current.data();
        if (data && data.tenantId === row.tenantId && data.type === "automation_inbound_execution" && data.status === "processing" &&
            data.claimToken === row.claimToken && toTime(data.leaseUntil) <= Date.now()) {
          tx.update(doc.ref, { status: "reconciliation_required", lastError: "Retomada exige fonte/plano valido e revisao dos recibos.", updatedAt: FieldValue.serverTimestamp() });
        }
      });
    }
  }
  return { scanned: snap.size, resumed, quarantined, failed };
}

export async function processPendingAutomationActions(input?: { tenantId?: string; limit?: number }) {
  const { processPendingWaitingReplyOccurrences } = await import("@/lib/server/crm/waiting-reply-occurrence");
  const waitingRecovery = await processPendingWaitingReplyOccurrences(input);
  const { processPendingSocialEventOccurrences } = await import("@/lib/server/crm/social-event-occurrence");
  await processPendingSocialEventOccurrences(input);
  const { processPendingAiSignalOccurrences } = await import("@/lib/server/crm/ai-signal-occurrence");
  await processPendingAiSignalOccurrences(input);
  const inboundRecovery = await processInterruptedInboundAutomations(input);
  const { processPendingOrderPipelineTransitions } = await import("@/lib/server/crm/order-stage-transition");
  const orderStageRecovery = await processPendingOrderPipelineTransitions(input);
  const { processPendingManualStageTransitions } = await import("@/lib/server/crm/manual-stage-transition");
  const manualStageRecovery = await processPendingManualStageTransitions(input);
  const { processPendingConversationStageTransitions } = await import("@/lib/server/crm/conversation-stage-transition");
  const conversationStageRecovery = await processPendingConversationStageTransitions(input);
  const { processPendingIntakeCreations } = await import("@/lib/server/crm/intake-occurrence");
  const intakeRecovery = await processPendingIntakeCreations(input);
  const { processPendingFinanceStageTransitions } = await import("@/lib/server/crm/finance-stage-transition");
  const financeStageRecovery = await processPendingFinanceStageTransitions(input);
  const { processPendingFinancePaidOccurrences } = await import("@/lib/server/crm/finance-paid-occurrence");
  const financeRecovery = await processPendingFinancePaidOccurrences(input);
  const { processPendingProposalMutations } = await import("@/lib/server/crm/proposal-mutation");
  const proposalRecovery = await processPendingProposalMutations(input);
  const { processPendingShopifyOccurrences } = await import("@/lib/server/commerce/shopify-occurrence-recovery");
  const shopifyRecovery = await processPendingShopifyOccurrences(input);
  const limit = Math.max(1, Math.min(100, Number(input?.limit || 30)));
  let query = adminDb
    .collection("jobs")
    .where("type", "==", AUTOMATION_SCHEDULED_JOB_TYPE)
    .where("status", "in", ["pending", "retrying", "processing"]);
  if (input?.tenantId) query = query.where("tenantId", "==", input.tenantId);
  const snap = await query.orderBy("executeAfter", "asc").limit(200).get();

  const dueJobs = snap.docs
    .map<Record<string, unknown> & { id: string }>((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }))
    .filter((job) => !input?.tenantId || cleanText(job.tenantId, 140) === input.tenantId)
    .filter(job => toTime(job.executeAfter) <= Date.now() && (job.status !== "processing" || toTime(job.leaseUntil) <= Date.now()))
    .filter(job => toTime(job.retryAfter) <= Date.now())
    .sort((a, b) => toTime(a.executeAfter) - toTime(b.executeAfter))
    .slice(0, limit);

  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of dueJobs) {
    let claimed: Awaited<ReturnType<typeof claimScheduledAutomationJob>>;
    try { claimed = await claimScheduledAutomationJob(job.id, input?.tenantId); }
    catch {
      // No claim/effect was committed. Keep the original occurrence pending,
      // count the failed read and let other eligible tenants/jobs progress.
      failed += 1;
      continue;
    }
    if (!claimed) continue;
    processed += 1;

    try {
      const proposalSchedule = isProposalAutomationSchedule(claimed.id, claimed), stageSchedule = isStageAutomationSchedule(claimed.id, claimed);
      const tenantId = proposalSchedule || stageSchedule ? String(claimed.tenantId) : cleanText(claimed.tenantId, 140);
      const leadId = proposalSchedule || stageSchedule ? String(claimed.leadId) : cleanText(claimed.leadId, 140);
      const automationId = proposalSchedule || stageSchedule ? String(claimed.automationId) : cleanText(claimed.automationId, 140);
      const automationName = cleanText(claimed.automationName, 180) || "Automacao";
      const jobTrigger = normalizeTrigger(claimed.trigger);
      const jobChatId = (claimed.inboundExecutionId || proposalSchedule || stageSchedule) && typeof claimed.chatId === "string" ? claimed.chatId : cleanText(claimed.chatId, 140);
      const jobChannel = cleanText(claimed.channel, 80).toLowerCase();
      const action =
        claimed.action && typeof claimed.action === "object"
          ? (claimed.action as TenantAutomationAction)
          : null;

      if (!tenantId || !leadId || !action) {
        throw new Error("Job agendado sem contexto valido.");
      }

      const usageReservation = await reserveTenantAutomationExecution(tenantId, { jobId: claimed.id, claimToken: claimed.claimToken });
      if (!usageReservation.allowed) {
        const finished = await finishScheduledAutomationJob(claimed, {
            status: "done",
            actionsExecuted: 0,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp(),
            lastError: "tenant_automation_limit_exceeded",
          });
        if (!finished) { failed += 1; continue; }
        await createExecutionLog({
            tenantId,
            automationId,
            automationName,
            trigger: jobTrigger,
            leadId,
            chatId: jobChatId || null,
            channel: jobChannel || null,
            status: "skipped",
            matched: true,
            actionsExecuted: 0,
            detail: `Limite mensal de automacoes atingido (${usageReservation.currentUsage}/${usageReservation.limit}).`,
          });
        completed += 1;
        continue;
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
        lead,
        {
          tenantId,
          leadId,
          trigger: jobTrigger,
          actorId: cleanText(claimed.actorId, 140) || "automation_scheduler",
          actorName: cleanText(claimed.actorName, 140) || automationName,
          chatId: jobChatId || null,
          channel: jobChannel || null,
          schedulerClaimToken: claimed.claimToken,
        },
        claimed.id
      );

      if (result.event) {
        const event = {
          ...result.event,
          actorId: "automation",
          actorName: automationName,
          automationId,
          automationName,
          trigger: "scheduled_action",
          createdAt: FieldValue.serverTimestamp(),
        };
        if (result.event.type === "automation_message_queued" && "outboundJobId" in result.event) {
          const eventRef = leadRef.collection("events").doc(`automation_${result.event.outboundJobId}`);
          await adminDb.runTransaction(async tx => {
            if (!(await tx.get(eventRef)).exists) tx.create(eventRef, event);
          });
        } else {
          await leadRef.collection("events").add(event);
        }
      }

      const finished = await finishScheduledAutomationJob(claimed,
        {
          status: "done",
          actionsExecuted: result.executed ? 1 : 0,
          updatedAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
          lastError: "",
          ...(result.event && "outboundJobId" in result.event ? {
            outboundJobId: result.event.outboundJobId, messageId: result.event.messageId,
          } : {}),
        }
      );
      if (!finished) { failed += 1; continue; }

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
        detail: result.event?.type === "automation_message_queued"
          ? "Mensagem registrada na fila; entrega acompanhada pela operacao de envio."
          : result.executed ? `Acao agendada executada: ${action.type}` : `Acao agendada nao aplicada: ${action.type}; consultar recibo/conflito.`,
      });

      completed += 1;
    } catch (error) {
      const attempts = Number(claimed.attempts || 1);
      const preparing = error instanceof InboundAutomationPreparingError;
      const safeRetry = !(error instanceof AutomationInternalEffectAuthorizationError) && !isProposalAutomationAuthorizationError(error) && !isStageAutomationAuthorizationError(error) && claimed.action && typeof claimed.action === "object" && "type" in claimed.action &&
        (claimed.action.type === "send_message" || (claimed.internalEffectProtocolVersion === 1 && claimed.internalEffectExecutorVersion === 1 &&
          claimed.internalEffectExecutorToken === claimed.claimToken &&
          (typeof claimed.inboundExecutionId === "string" || claimed.proposalScheduleProtocol === 1 && typeof claimed.automationProposalSourceId === "string" ||
            claimed.stageScheduleProtocol === 1 && typeof claimed.stageSourceId === "string") &&
          supportsAtomicAutomationEffect(claimed.action as TenantAutomationAction)));
      await finishScheduledAutomationJob(claimed,
        {
          status: preparing ? "retrying" : !safeRetry ? "reconciliation_required" : attempts >= 3 ? "dead_letter" : "retrying",
          ...(preparing ? { attempts: Math.max(0, attempts - 1), retryAfter: error.retryAt } : {}),
          updatedAt: FieldValue.serverTimestamp(),
          lastError: error instanceof Error ? error.message.slice(0, 280) : "Erro desconhecido.",
        }
      );
      failed += 1;
    }
  }

  return { processed, completed, failed, waitingRecovery, inboundRecovery, orderStageRecovery, manualStageRecovery, conversationStageRecovery, intakeRecovery, financeStageRecovery, financeRecovery, proposalRecovery, shopifyRecovery };
}

/** Freeze approval eligibility against the current transactionally read CRM
 * state, after stage actions and before unrelated hooks can be interrupted. */
export async function prepareProposalApprovalAutomations(context: LeadAutomationContext) {
  if (context.trigger !== "budget_approved" || !context.proposalClaim) throw new Error("Origem de proposta fora do gatilho autorizado.");
  return freezeProposalAutomationPlans({ tenantId: context.tenantId, leadId: context.leadId, claim: context.proposalClaim, automations: [],
    matches: (automation, data) => matchesConditions(automation, {
      id: context.leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
      pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
      priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
    }, context) });
}

export async function runLeadAutomations(context: LeadAutomationContext) {
  if (context.socialClaim && !context.stageSource) {
    if (context.trigger !== "message_received") throw new Error("CRM_STAGE_SOCIAL_TRIGGER_INVALID");
    const { admitSocialEventOccurrence, processSocialEventOccurrence } = await import("@/lib/server/crm/social-event-occurrence");
    const id = await admitSocialEventOccurrence({ tenantId: context.tenantId, leadId: context.leadId, chatId: context.chatId || "",
      socialLogId: context.socialClaim.logId, claimToken: context.socialClaim.token, normalize: normalizeAutomationDoc,
      matches: (automation, data, channel) => matchesConditions(automation, {
        id: context.leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
        pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
        priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
      }, { ...context, channel }) });
    const result = await processSocialEventOccurrence(id, context.tenantId);
    return { evaluated: result.evaluated, matched: result.matched, executed: result.executed };
  }
  if (context.trigger === "ai_next_action" && !context.stageSource) {
    const { admitAiSignalOccurrence, processAiSignalOccurrence } = await import("@/lib/server/crm/ai-signal-occurrence");
    const id = await admitAiSignalOccurrence({ tenantId: context.tenantId, leadId: context.leadId, chatId: context.chatId || "",
      sourceMessageId: context.sourceMessageId || "", aiNextAction: cleanText(context.aiNextAction, 80).toLowerCase(), normalize: normalizeAutomationDoc,
      matches: (automation, data, channel) => matchesConditions(automation, {
        id: context.leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
        pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
        priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
      }, { ...context, channel }) });
    const result = await processAiSignalOccurrence(id, context.tenantId);
    return { evaluated: result.evaluated, matched: result.matched, executed: result.executed };
  }
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

  const admission = context.trigger === "message_received" && context.sourceMessageId !== undefined
    ? await admitInboundAutomationEvent({ tenantId: context.tenantId, leadId: context.leadId, chatId: context.chatId || "",
      sourceMessageId: context.sourceMessageId, normalize: normalizeAutomationDoc,
      matches: (automation, data, channel) => matchesConditions(automation, {
        id: context.leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
        pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
        priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
      }, { ...context, channel }),
    }) : null;
  let automations = context.stageSource || context.proposalClaim ? [] : admission?.automations || await listTenantAutomations(context.tenantId);
  if (context.stageSource) {
    if (context.trigger !== businessAutomationTrigger(context.stageSource.kind) || context.proposalClaim || context.inboundClaim) throw new Error("Origem de automacao fora do gatilho autorizado.");
    automations = await freezeStageAutomationPlans({ tenantId: context.tenantId, leadId: context.leadId, source: context.stageSource,
      previousStage: context.previousStage || "captado", nextStage: context.nextStage || "", matches: (automation, data) => matchesConditions(automation, {
        id: context.leadId, nome: cleanText(data.nome, 180) || "Lead", origem: cleanText(data.origem, 80).toLowerCase(),
        pipelineStage: normalizePipelineStageId(data.pipelineStage || data.stage || "captado"), score: cleanNumber(data.score),
        priority: cleanText(data.priority, 20).toLowerCase() || "medium", tags: parseStringList(data.tags, 12, 32),
      }, context) });
  }
  if (context.proposalClaim) {
    if (context.trigger !== "budget_approved") throw new Error("Origem de proposta fora do gatilho autorizado.");
    automations = await prepareProposalApprovalAutomations(context);
  }
  let matched = 0;
  let executed = 0;

  for (const automation of automations) {
    if (context.recoveryAutomationId && automation.id !== context.recoveryAutomationId) continue;
    if (!admission && !context.proposalClaim && !context.stageSource && !matchesConditions(automation, lead, context)) {
      continue;
    }

    matched += 1;

    const inboundClaim = context.trigger === "message_received" && context.sourceMessageId !== undefined
      ? await claimInboundAutomationExecution({ tenantId: context.tenantId, leadId: context.leadId,
        chatId: context.chatId || "", sourceMessageId: context.sourceMessageId, automation, normalize: normalizeAutomationDoc,
        admissionId: admission?.id }) : null;
    if (context.trigger === "message_received" && context.sourceMessageId !== undefined && !inboundClaim) continue;
    const acceptedAutomation = inboundClaim?.plan || automation;
    const usageReservation = await reserveTenantAutomationExecution(context.tenantId, inboundClaim
      ? { jobId: inboundClaim.id, claimToken: inboundClaim.token, kind: "inbound" }
      : context.proposalClaim ? { jobId: context.proposalClaim.id, claimToken: context.proposalClaim.token,
        kind: "proposal", automationId: acceptedAutomation.id } : context.stageSource ? { jobId: context.stageSource.id,
          claimToken: context.stageSource.token, kind: "stage", stageSourceKind: context.stageSource.kind, automationId: acceptedAutomation.id } : undefined);
    if (!usageReservation.allowed) {
      if (inboundClaim && !(await finishInboundAutomationExecution(inboundClaim, "skipped"))) continue;
      await createExecutionLog({
        tenantId: context.tenantId,
        automationId: automation.id,
        automationName: automation.name,
        trigger: context.trigger,
        leadId: context.leadId,
        chatId: context.chatId || null,
        channel: cleanText(context.channel, 80).toLowerCase() || null,
        status: "skipped",
        matched: true,
        actionsExecuted: 0,
        detail: `Limite mensal de automacoes atingido (${usageReservation.currentUsage}/${usageReservation.limit}).`,
      });
      continue;
    }

    let stageRun: Awaited<ReturnType<typeof beginStageAutomationRun>> | null = null;
    try {
      if (context.stageSource) {
        stageRun = await beginStageAutomationRun({ tenantId: context.tenantId, leadId: context.leadId, source: context.stageSource, automationId: acceptedAutomation.id });
        if (stageRun.replayed) continue;
      }
      const actionsExecuted = await executeActions(acceptedAutomation, leadRef, lead, { ...context,
        ...(inboundClaim ? { inboundClaim, sourceMessageId: inboundClaim.sourceMessageId || context.sourceMessageId } : {}) });
      if (inboundClaim && !(await finishInboundAutomationExecution(inboundClaim, "done"))) {
        throw new Error("Posse da execucao mudou antes da conclusao; efeitos precisam de conciliacao.");
      }
      if (context.stageSource && stageRun && !(await finishStageAutomationRun({ tenantId: context.tenantId, leadId: context.leadId,
        source: context.stageSource, automationId: acceptedAutomation.id, run: stageRun }))) throw new Error("Posse da automacao de etapa mudou antes da conclusao.");
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
      if (inboundClaim) await finishInboundAutomationExecution(inboundClaim, "reconciliation_required");
      if (context.stageSource && stageRun && !stageRun.replayed) await finishStageAutomationRun({ tenantId: context.tenantId, leadId: context.leadId,
        source: context.stageSource, automationId: acceptedAutomation.id, run: stageRun, failed: true });
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
      if (context.strictErrors) throw error;
    }
  }

  return {
    evaluated: automations.length,
    matched,
    executed,
  };
}
import { businessAutomationTrigger } from "@/lib/server/crm/stage-source-contract";
