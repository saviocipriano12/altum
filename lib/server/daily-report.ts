import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhoneBR } from "@/app/lib/server/phone";
import {
  getWhatsAppChannelForTenant,
  sendMetaTemplateMessage,
} from "@/app/lib/server/whatsapp-channel";
import { getTenantSettings, type TenantSettings } from "@/lib/server/tenant";
import { normalizePipelineStageId } from "@/lib/pipeline";

export type DailyReportTone = "success" | "warning" | "danger" | "info" | "neutral" | "ai";

export type DailyReportMetric = {
  id: string;
  label: string;
  value: number;
  detail?: string;
  tone: DailyReportTone;
};

export type DailyReportAction = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: DailyReportTone;
};

export type DailyReportDoc = {
  id: string;
  tenantId: string;
  dateKey: string;
  timezone: string;
  title: string;
  summaryText: string;
  whatsappText: string;
  ownerPhone: string;
  ownerName: string;
  reportUrl: string;
  metrics: DailyReportMetric[];
  highlights: string[];
  alerts: DailyReportAction[];
  tomorrowPlan: DailyReportAction[];
  createdAt?: unknown;
  updatedAt?: unknown;
  sentAt?: unknown;
  sendStatus?: "not_sent" | "sent" | "failed";
  sendError?: string;
  templateName?: string;
  templateLanguage?: string;
};

type Row = { id: string } & Record<string, unknown>;

const DEFAULT_TEMPLATE_NAME = "fechamento_dia_altum";
const DEFAULT_TEMPLATE_LANGUAGE = "pt_BR";

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000);
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function inWindow(value: unknown, start: Date, end: Date) {
  const date = toDate(value);
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function isOpenStatus(value: unknown) {
  const status = clean(value, 40).toLowerCase();
  return status !== "resolved" && status !== "archived" && status !== "done" && status !== "cancelled" && status !== "canceled";
}

function dateKeyFor(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tenantDayWindow(dateKey: string, timezone: string) {
  if (timezone === "America/Sao_Paulo") {
    return {
      start: new Date(`${dateKey}T00:00:00-03:00`),
      end: new Date(`${dateKey}T23:59:59.999-03:00`),
    };
  }

  const localStart = new Date(`${dateKey}T00:00:00.000Z`);
  const localEnd = new Date(`${dateKey}T23:59:59.999Z`);
  return { start: localStart, end: localEnd };
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDatePt(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) return dateKey;
  return `${day}/${month}/${year}`;
}

function reportDocId(tenantId: string, dateKey: string) {
  return `${tenantId}_${dateKey}`;
}

async function readRows(collectionName: string, tenantId: string, limit = 800): Promise<Row[]> {
  const snap = await adminDb.collection(collectionName).where("tenantId", "==", tenantId).limit(limit).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));
}

function stageLabel(value: unknown) {
  const stage = normalizePipelineStageId(clean(value, 80) || "captado");
  if (stage === "captado") return "captado";
  if (stage === "contato") return "em contato";
  if (stage === "qualificacao") return "em qualificacao";
  if (stage === "proposta") return "em proposta";
  if (stage === "fechamento") return "em fechamento";
  if (stage === "ganho") return "ganho";
  if (stage === "perdido") return "perdido";
  return stage;
}

function resolveDailyReportSettings(settings: TenantSettings | null) {
  const dailyReport =
    settings?.dailyReport && typeof settings.dailyReport === "object"
      ? (settings.dailyReport as Record<string, unknown>)
      : {};
  const ai = settings?.ai && typeof settings.ai === "object" ? settings.ai : {};

  return {
    enabled: dailyReport.enabled !== false,
    ownerName:
      clean(dailyReport.ownerName, 140) ||
      clean(settings?.responsibleName, 140) ||
      clean(settings?.ownerName, 140) ||
      clean(settings?.contactName, 140) ||
      "Dono da operacao",
    ownerPhone: normalizePhoneBR(
      clean(dailyReport.ownerPhone, 40) ||
        clean(settings?.responsiblePhone, 40) ||
        clean(settings?.phone, 40) ||
        clean(ai.responsiblePhone, 40)
    ),
    sendHour: clean(dailyReport.sendHour, 5) || "18:30",
    templateName: clean(dailyReport.templateName, 120) || DEFAULT_TEMPLATE_NAME,
    templateLanguage: clean(dailyReport.templateLanguage, 24) || DEFAULT_TEMPLATE_LANGUAGE,
  };
}

function parseHourMinute(value: unknown) {
  const raw = clean(value, 5);
  const match = raw.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function localMinutesFor(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return (hour % 24) * 60 + minute;
}

export function shouldRunDailyReportNow(input: {
  settings: TenantSettings | null;
  now?: Date;
  windowMinutes?: number;
}) {
  const settings = input.settings;
  const dailySettings = resolveDailyReportSettings(settings);
  if (!dailySettings.enabled) return false;

  const timezone = clean(settings?.timezone, 80) || "America/Sao_Paulo";
  const targetMinutes = parseHourMinute(dailySettings.sendHour) ?? parseHourMinute("18:30");
  if (targetMinutes === null) return false;

  const currentMinutes = localMinutesFor(input.now || new Date(), timezone);
  const elapsedMinutes = currentMinutes - targetMinutes;
  const windowMinutes = Math.max(1, Math.min(120, Math.round(input.windowMinutes || 35)));
  return elapsedMinutes >= 0 && elapsedMinutes < windowMinutes;
}

function buildReportUrl(tenantId: string, dateKey: string) {
  const baseUrl = clean(process.env.NEXT_PUBLIC_SITE_URL, 240).replace(/\/+$/, "");
  const path = `/cliente/painel/relatorios/dia/${dateKey}`;
  return baseUrl ? `${baseUrl}${path}` : path;
}

export async function listTenantsForDailyReports(limit = 100) {
  const snap = await adminDb.collection("tenant_settings").limit(Math.max(1, Math.min(300, limit))).get();
  return snap.docs
    .map((doc) => ({
      tenantId: doc.id,
      settings: { tenantId: doc.id, ...(doc.data() as Record<string, unknown>) } as TenantSettings,
    }))
    .filter((item) => resolveDailyReportSettings(item.settings).enabled);
}

export async function getDailyReport(tenantId: string, dateKey: string) {
  const snap = await adminDb.collection("tenant_daily_reports").doc(reportDocId(tenantId, dateKey)).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) } as DailyReportDoc;
}

export async function generateDailyReport(input: {
  tenantId: string;
  dateKey?: string;
  persist?: boolean;
}) {
  const tenantId = clean(input.tenantId, 160);
  if (!tenantId) throw new Error("tenantId obrigatorio.");

  const settings = await getTenantSettings(tenantId);
  const timezone = clean(settings?.timezone, 80) || "America/Sao_Paulo";
  const dateKey = clean(input.dateKey, 10) || dateKeyFor(new Date(), timezone);
  const { start, end } = tenantDayWindow(dateKey, timezone);
  const dailySettings = resolveDailyReportSettings(settings);

  const [chats, messages, leads, tasks, appointments, budgets, finance, aiLogs, jobs, submissions] = await Promise.all([
    readRows("chats", tenantId, 900),
    readRows("messages", tenantId, 1600),
    readRows("leads", tenantId, 900),
    readRows("lead_tasks", tenantId, 900),
    readRows("appointments", tenantId, 500),
    readRows("orcamentos", tenantId, 500),
    readRows("financeiro", tenantId, 700),
    readRows("ai_logs", tenantId, 1000),
    readRows("jobs", tenantId, 900),
    readRows("capture_submissions", tenantId, 500),
  ]);

  const messagesToday = messages.filter((item) => inWindow(item.createdAt, start, end));
  const agentMessages = messagesToday.filter((item) => clean(item.sender, 40) === "agent").length;
  const clientMessages = messagesToday.filter((item) => clean(item.sender, 40) === "client").length;
  const botMessages = messagesToday.filter((item) => ["bot", "ai"].includes(clean(item.sender, 40))).length;
  const chatsTouched = chats.filter((item) => inWindow(item.updatedAt || item.lastMessageTime, start, end));
  const openChats = chats.filter((item) => isOpenStatus(item.status));
  const waitingChats = openChats.filter((item) => {
    const clientAt = toDate(item.lastClientMessageAt);
    const agentAt = toDate(item.lastAgentMessageAt);
    return Boolean(clientAt && (!agentAt || agentAt.getTime() < clientAt.getTime()));
  });
  const slaBreached = openChats.filter((item) => {
    const dueAt = toDate(item.slaDueAt);
    return Boolean(dueAt && dueAt.getTime() <= Date.now());
  });
  const unassigned = openChats.filter((item) => !clean(item.assignedTo || item.ownerId, 120));

  const newLeads = leads.filter((item) => inWindow(item.createdAt, start, end));
  const activeLeads = leads.filter((item) => {
    const stage = normalizePipelineStageId(clean(item.pipelineStage || item.stage, 80) || "captado");
    return stage !== "ganho" && stage !== "perdido";
  });
  const hotLeads = activeLeads.filter((item) => {
    const heat = clean(item.heat, 40).toLowerCase();
    const priority = clean(item.priority, 40).toLowerCase();
    return heat === "quente" || heat === "hot" || priority === "high";
  });
  const stageEvents = leads.flatMap((lead) => {
    const timeline = Array.isArray(lead.timeline) ? lead.timeline : [];
    return timeline.filter((event) => event && typeof event === "object") as Row[];
  }).filter((event) => {
    const text = `${clean(event.title, 120)} ${clean(event.type, 80)} ${clean(event.detail, 180)}`.toLowerCase();
    return inWindow(event.createdAt, start, end) && /(etapa|stage|pipeline|kanban|mov)/.test(text);
  });

  const tasksToday = tasks.filter((item) => inWindow(item.createdAt || item.updatedAt, start, end));
  const doneTasksToday = tasks.filter((item) => clean(item.status, 40) === "done" && inWindow(item.updatedAt || item.completedAt, start, end));
  const overdueTasks = tasks.filter((item) => {
    if (clean(item.status, 40) === "done") return false;
    const dueAt = toDate(item.dueAt);
    return Boolean(dueAt && dueAt.getTime() < Date.now());
  });
  const tomorrowStart = new Date(end.getTime() + 1);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const tomorrowTasks = tasks.filter((item) => clean(item.status, 40) !== "done" && inWindow(item.dueAt, tomorrowStart, tomorrowEnd));
  const appointmentsToday = appointments.filter((item) => inWindow(item.startAt || item.createdAt, start, end));

  const budgetsToday = budgets.filter((item) => inWindow(item.createdAt || item.updatedAt, start, end));
  const openBudgets = budgets.filter((item) => {
    const status = clean(item.status, 40).toLowerCase();
    return status !== "aprovado" && status !== "approved" && status !== "recusado" && status !== "rejected" && status !== "cancelado";
  });
  const openBudgetValue = openBudgets.reduce((sum, item) => sum + toNumber(item.valorTotal || item.total || item.value), 0);
  const paidRevenueToday = finance
    .filter((item) => ["paid", "pago", "recebido"].includes(clean(item.status, 40).toLowerCase()) && inWindow(item.updatedAt || item.paidAt, start, end))
    .reduce((sum, item) => sum + toNumber(item.valor || item.value), 0);
  const pendingRevenue = finance
    .filter((item) => ["pending", "pendente", "aberto"].includes(clean(item.status, 40).toLowerCase()))
    .reduce((sum, item) => sum + toNumber(item.valor || item.value), 0);

  const aiLogsToday = aiLogs.filter((item) => inWindow(item.createdAt || item.updatedAt, start, end));
  const aiResponses = aiLogsToday.filter((item) => clean(item.decision, 40) === "respond").length;
  const aiHandoffs = aiLogsToday.filter((item) => clean(item.decision, 40) === "handoff").length;
  const aiJobsToday = jobs.filter((item) => String(item.type || "").includes("ai") && inWindow(item.updatedAt || item.createdAt, start, end));
  const failedAiJobs = aiJobsToday.filter((item) => ["failed", "dead_letter"].includes(clean(item.status, 40))).length;
  const submissionsToday = submissions.filter((item) => inWindow(item.createdAt || item.submittedAt, start, end));

  const metrics: DailyReportMetric[] = [
    { id: "conversations", label: "Conversas movimentadas", value: chatsTouched.length, detail: `${agentMessages} respostas do time`, tone: "success" },
    { id: "new_leads", label: "Novos leads", value: newLeads.length + submissionsToday.length, detail: `${activeLeads.length} oportunidades ativas`, tone: "info" },
    { id: "stage_moves", label: "Avancos no funil", value: stageEvents.length, detail: "mudancas de etapa registradas", tone: "info" },
    { id: "tasks_done", label: "Tarefas concluidas", value: doneTasksToday.length, detail: `${overdueTasks.length} vencidas`, tone: overdueTasks.length ? "warning" : "success" },
    { id: "proposals", label: "Propostas criadas", value: budgetsToday.length, detail: `${formatMoney(openBudgetValue)} em aberto`, tone: "ai" },
    { id: "ai_activity", label: "Acoes da IA", value: aiResponses + botMessages, detail: `${aiHandoffs} escaladas humanas`, tone: "ai" },
  ];

  const highlights = [
    `${chatsTouched.length} conversa(s) movimentadas e ${clientMessages} mensagem(ns) de cliente no dia.`,
    `${newLeads.length + submissionsToday.length} novo(s) lead(s) e ${hotLeads.length} oportunidade(s) quente(s) ativas.`,
    `${budgetsToday.length} proposta(s) criada(s), com ${formatMoney(openBudgetValue)} em propostas abertas.`,
    `${tasksToday.length} tarefa(s) criada(s), ${doneTasksToday.length} concluida(s) e ${formatMoney(paidRevenueToday)} recebido no dia.`,
    `${formatMoney(pendingRevenue)} seguem pendentes no financeiro comercial.`,
    `A IA apoiou ${aiResponses + botMessages} resposta(s) e escalou ${aiHandoffs} caso(s) para humano.`,
  ];

  const alerts: DailyReportAction[] = [];
  if (slaBreached.length > 0) {
    alerts.push({
      id: "sla",
      title: "Conversas com SLA estourado",
      description: `${slaBreached.length} conversa(s) precisam de resposta ou redistribuicao.`,
      href: "/cliente/painel/inbox?queue=sla_breached",
      tone: "danger",
    });
  }
  if (unassigned.length > 0) {
    alerts.push({
      id: "unassigned",
      title: "Conversas sem responsavel",
      description: `${unassigned.length} conversa(s) estao sem dono definido.`,
      href: "/cliente/painel/inbox?queue=unassigned",
      tone: "warning",
    });
  }
  if (overdueTasks.length > 0) {
    alerts.push({
      id: "overdue_tasks",
      title: "Follow-ups vencidos",
      description: `${overdueTasks.length} tarefa(s) comercial(is) ficaram atrasadas.`,
      href: "/cliente/painel/follow-ups?status=pending",
      tone: "warning",
    });
  }
  if (failedAiJobs > 0) {
    alerts.push({
      id: "ai_failures",
      title: "IA com falhas para revisar",
      description: `${failedAiJobs} execucao(oes) da IA falharam ou foram para dead-letter.`,
      href: "/cliente/painel/logs",
      tone: "danger",
    });
  }
  if (openBudgets.length > 0) {
    alerts.push({
      id: "open_budgets",
      title: "Propostas para acompanhar",
      description: `${openBudgets.length} proposta(s) abertas somam ${formatMoney(openBudgetValue)}.`,
      href: "/cliente/painel/comercial",
      tone: "info",
    });
  }

  const tomorrowPlan: DailyReportAction[] = [
    {
      id: "reply_waiting",
      title: "Comecar pelas conversas aguardando",
      description: `${waitingChats.length} conversa(s) parecem estar esperando resposta do time.`,
      href: "/cliente/painel/inbox?queue=assigned_waiting",
      tone: waitingChats.length ? "warning" : "success",
    },
    {
      id: "hot_leads",
      title: "Priorizar oportunidades quentes",
      description: `${hotLeads.length} oportunidade(s) quentes ou de alta prioridade devem abrir o dia.`,
      href: "/cliente/painel/crm?priority=high",
      tone: hotLeads.length ? "info" : "neutral",
    },
    {
      id: "tomorrow_tasks",
      title: "Organizar agenda de amanha",
      description: `${tomorrowTasks.length} tarefa(s) e ${appointmentsToday.length} compromisso(s) mapeados a partir da rotina.`,
      href: "/cliente/painel/agenda",
      tone: tomorrowTasks.length ? "warning" : "info",
    },
  ];

  const strongestStage = activeLeads.reduce((acc, lead) => {
    const label = stageLabel(lead.pipelineStage || lead.stage);
    acc.set(label, (acc.get(label) || 0) + 1);
    return acc;
  }, new Map<string, number>());
  const topStage = Array.from(strongestStage.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topStage) {
    tomorrowPlan.push({
      id: "stage_focus",
      title: `Destravar etapa ${topStage[0]}`,
      description: `${topStage[1]} oportunidade(s) ativas estao concentradas nessa etapa.`,
      href: "/cliente/painel/pipeline",
      tone: "info",
    });
  }

  const reportUrl = buildReportUrl(tenantId, dateKey);
  const alertText = alerts.length
    ? alerts.slice(0, 3).map((item) => item.title).join("; ")
    : "Sem alerta critico no fechamento.";
  const planText = tomorrowPlan.slice(0, 3).map((item) => item.title).join("; ");
  const summaryText =
    `Hoje: ${chatsTouched.length} conversas, ${newLeads.length + submissionsToday.length} leads, ` +
    `${budgetsToday.length} propostas, ${doneTasksToday.length} tarefas feitas e ${aiResponses + botMessages} acoes da IA.`;

  const whatsappText = [
    `Fechamento do dia Altum - ${formatDatePt(dateKey)}`,
    "",
    summaryText,
    "",
    `Pontos de atencao: ${alertText}`,
    `Plano para amanha: ${planText}`,
    "",
    `Relatorio completo: ${reportUrl}`,
  ].join("\n");

  const doc: DailyReportDoc = {
    id: reportDocId(tenantId, dateKey),
    tenantId,
    dateKey,
    timezone,
    title: `Fechamento do dia - ${formatDatePt(dateKey)}`,
    summaryText,
    whatsappText,
    ownerPhone: dailySettings.ownerPhone,
    ownerName: dailySettings.ownerName,
    reportUrl,
    metrics,
    highlights,
    alerts: alerts.slice(0, 8),
    tomorrowPlan: tomorrowPlan.slice(0, 8),
    sendStatus: "not_sent",
    templateName: dailySettings.templateName,
    templateLanguage: dailySettings.templateLanguage,
  };

  if (input.persist !== false) {
    await adminDb.collection("tenant_daily_reports").doc(doc.id).set(
      {
        ...doc,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return doc;
}

export async function sendDailyReportWhatsApp(input: {
  tenantId: string;
  dateKey?: string;
  forceGenerate?: boolean;
  forceSend?: boolean;
  dryRun?: boolean;
}) {
  const tenantId = clean(input.tenantId, 160);
  const settings = await getTenantSettings(tenantId);
  const timezone = clean(settings?.timezone, 80) || "America/Sao_Paulo";
  const dateKey = clean(input.dateKey, 10) || dateKeyFor(new Date(), timezone);
  const existing = await getDailyReport(tenantId, dateKey);
  if (existing?.sendStatus === "sent" && !input.forceSend) {
    return { ok: true, skipped: true, reason: "already_sent", report: existing };
  }

  const report =
    input.forceGenerate ? await generateDailyReport({ tenantId, dateKey }) : existing || await generateDailyReport({ tenantId, dateKey });
  const dailySettings = resolveDailyReportSettings(settings);

  if (!dailySettings.enabled) {
    return { ok: true, skipped: true, reason: "daily_report_disabled", report };
  }
  if (!dailySettings.ownerPhone) {
    await adminDb.collection("tenant_daily_reports").doc(report.id).set(
      {
        sendStatus: "failed",
        sendError: "owner_phone_missing",
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: false, skipped: true, reason: "owner_phone_missing", report };
  }

  if (input.dryRun) {
    return { ok: true, dryRun: true, report };
  }

  try {
    const channel = await getWhatsAppChannelForTenant(tenantId, { allowAgencyFallback: false });
    if (!channel) {
      throw new Error("Canal WhatsApp ativo nao configurado para este tenant.");
    }

    const payload = await sendMetaTemplateMessage({
      channel,
      to: dailySettings.ownerPhone,
      templateName: dailySettings.templateName,
      languageCode: dailySettings.templateLanguage,
      bodyParams: [
        dailySettings.ownerName,
        formatDatePt(dateKey),
        report.summaryText,
        report.alerts.length ? report.alerts.slice(0, 3).map((item) => item.title).join("; ") : "Sem alerta critico.",
        report.tomorrowPlan.slice(0, 3).map((item) => item.title).join("; "),
        report.reportUrl,
      ],
    });

    await adminDb.collection("tenant_daily_reports").doc(report.id).set(
      {
        ownerPhone: dailySettings.ownerPhone,
        ownerName: dailySettings.ownerName,
        sendStatus: "sent",
        sendError: "",
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        whatsappPayload: payload,
      },
      { merge: true }
    );

    return { ok: true, sent: true, report };
  } catch (error) {
    const message = error instanceof Error ? error.message : "daily_report_send_failed";
    await adminDb.collection("tenant_daily_reports").doc(report.id).set(
      {
        ownerPhone: dailySettings.ownerPhone,
        ownerName: dailySettings.ownerName,
        sendStatus: "failed",
        sendError: message,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: false, sent: false, error: message, report };
  }
}

export function getDefaultDailyReportConfig(settings: TenantSettings | null) {
  return resolveDailyReportSettings(settings);
}
