import { adminDb } from "@/app/lib/server/firebase-admin";
import { getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";
import { getAiMonthlyUsageSnapshot } from "@/lib/server/ai/usage-ledger";
import {
  buildAiAlertGuidance,
  readAiWorkerHealth,
  summarizeAiQueueObservability,
  toTenantOperationalSnapshot,
  type AiOperationalSeverity,
  type TenantOperationalStatus,
} from "@/lib/server/ai/observability";
import { AI_QUEUE_JOB_TYPE } from "@/lib/server/ai/queue";
import { getTenantSettings } from "@/lib/server/tenant";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type ModuleStatus = "ready" | "partial" | "pending";
type GoLiveCriterionStatus = "ready" | "warning" | "pending" | "blocked";
type ValidationStatus = "approved" | "blocked" | "not_checked";
type ReadinessDoc = { id: string } & Record<string, unknown>;

const GO_LIVE_CHECKLIST_VERSION = "2026-04-definitive";
const KNOWLEDGE_DOCS_MINIMUM = 3;

export type TenantReadinessSummary = {
  activeUsers: number;
  onlineUsers: number;
  teamsConfigured: number;
  managedTeams: number;
  activeChannels: number;
  connectedChannels: number;
  operationalChannels: number;
  activeForms: number;
  activeBacklog: number;
  activeAutomations: number;
  knowledgeDocs: number;
  knowledgeDocsMinimum: number;
  hasCompanyProfile: boolean;
  hasCompanyContact: boolean;
  hasBusinessMode: boolean;
  hasGoLiveOwner: boolean;
  hasAiOwner: boolean;
  aiEnabled: boolean;
  guardrails: number;
  hasSla: boolean;
  hasDefaultTeam: boolean;
  businessHoursOnly: boolean;
  hasUsageBudgetLimit: boolean;
  hasUsageCapLimit: boolean;
  aiMonthlyBudgetUsd: number;
  aiMonthlyUsageCap: number;
  aiMonthlyCostUsd: number;
  aiMonthlyRuns: number;
  aiBudgetExceeded: boolean;
  aiUsageCapExceeded: boolean;
  operationalStatus: TenantOperationalStatus;
  criticalBlockers: number;
  pilotReady: boolean;
  readinessScore: number;
};

export type TenantReadinessItem = {
  id: string;
  href: string;
  title: string;
  description: string;
  badge: string;
  tone: Tone;
};

export type TenantModuleReadiness = {
  id: string;
  href: string;
  title: string;
  description: string;
  status: ModuleStatus;
  badge: string;
  tone: Tone;
};

export type TenantGoLiveCriterion = {
  id: string;
  href: string;
  title: string;
  description: string;
  status: GoLiveCriterionStatus;
  badge: string;
  tone: Tone;
  blocking: boolean;
  critical: boolean;
  weight: number;
  evidence: string;
  target: string;
};

export type TenantGoLiveValidation = {
  status: ValidationStatus;
  checkedAt: string | null;
  checkedByName: string;
  approvedAt: string | null;
  approvedByName: string;
  blockerIds: string[];
  score: number;
  checklistVersion: string;
};

export type TenantGoLiveActivation = {
  gateStatus: "open" | "blocked";
  status: "approved" | "ready_to_activate" | "blocked";
  title: string;
  description: string;
  readyForSale: boolean;
  blockingItems: string[];
  validation: TenantGoLiveValidation;
};

export type TenantOperationalHealth = {
  status: TenantOperationalStatus;
  label: string;
  reason: string;
  queueBacklog?: number;
  activeBacklog?: number;
  activeChannels?: number;
  disconnectedChannels?: number;
  stuckJobs?: number;
};

export type TenantOperationalAlert = {
  id: string;
  type: string;
  severity: AiOperationalSeverity;
  title: string;
  detail: string;
  probableCause: string;
  recommendedAction: string;
  href: string;
  source: string;
  lastOccurredAt: string | null;
};

export type TenantOnboardingStep = {
  id: string;
  title: string;
  description: string;
  href: string;
  mode: "auto" | "manual";
  status: "done" | "pending" | "blocked";
  critical: boolean;
  done: boolean;
  blocking: boolean;
  evidence: string;
  doneAt: string | null;
  doneByName: string;
};

export type TenantOnboardingProgress = {
  completed: number;
  total: number;
  progressPct: number;
  pendingCritical: number;
  manualPending: number;
  autoPending: number;
  steps: TenantOnboardingStep[];
};

export type TenantReadinessSnapshot = {
  tenantId: string;
  settings: {
    name: string;
    niche: string;
    businessProfileId: BusinessProfileId;
    phone: string;
    website: string;
    responsibleName: string;
    responsibleEmail: string;
    timezone: string;
    businessHours: string;
    inboxRules: {
      defaultResponseSlaMinutes: number;
      mode: string;
      businessHoursOnly: boolean;
      defaultTeam: string;
      teams: Array<{ id: string; name: string }>;
    };
    ai: {
      responsiblePhone: string;
      monthlyBudgetUsd: number;
      monthlyUsageCap: number;
    };
  };
  summary: TenantReadinessSummary;
  operationalHealth: TenantOperationalHealth;
  operationalAlerts: TenantOperationalAlert[];
  onboarding: TenantOnboardingProgress;
  checklist: TenantGoLiveCriterion[];
  activation: TenantGoLiveActivation;
  blockers: TenantReadinessItem[];
  modules: TenantModuleReadiness[];
  insights: Array<{ id: string; title: string; description: string }>;
  nextBuildItems: TenantReadinessItem[];
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toIso(value: unknown) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return new Date((value as { _seconds: number })._seconds * 1000).toISOString();
  }
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function toMillis(value: unknown) {
  const iso = toIso(value);
  if (!iso) return 0;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function parseGuardrails(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split("\n")
      : [];

  return source
    .map((item) => clean(item, 240))
    .filter(Boolean)
    .slice(0, 50);
}

function parseInboxRules(value: unknown) {
  const rules = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const inbox = rules.inbox && typeof rules.inbox === "object" ? (rules.inbox as Record<string, unknown>) : {};
  const teamsSource = Array.isArray(inbox.teams) ? inbox.teams : [];

  return {
    defaultResponseSlaMinutes: Math.max(0, Math.round(safeNumber(inbox.firstResponseSlaMinutes, 15))),
    mode: clean(inbox.assignmentMode, 40) || "manual",
    businessHoursOnly: inbox.businessHoursOnly === true,
    defaultTeam: clean(inbox.defaultTeam, 80),
    teams: teamsSource
      .map((item, index) => {
        const team = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        const name = clean(team.name, 80);
        if (!name) return null;
        return {
          id: clean(team.id, 80) || `team_${index + 1}`,
          name,
        };
      })
      .filter((item): item is { id: string; name: string } => Boolean(item)),
  };
}

function parseAiOperatingProfile(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    monthlyBudgetUsd: Math.max(0, safeNumber(source.monthlyBudgetUsd, 0)),
    monthlyUsageCap: Math.max(0, Math.round(safeNumber(source.monthlyUsageCap, 0))),
  };
}

function parseGoLiveValidation(value: unknown): TenantGoLiveValidation {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const rawStatus = clean(source.status, 40).toLowerCase();
  const blockerIdsSource = Array.isArray(source.blockerIds) ? source.blockerIds : [];

  return {
    status:
      rawStatus === "approved" || rawStatus === "blocked"
        ? (rawStatus as ValidationStatus)
        : "not_checked",
    checkedAt: toIso(source.checkedAt),
    checkedByName: clean(source.checkedByName, 140),
    approvedAt: toIso(source.approvedAt),
    approvedByName: clean(source.approvedByName, 140),
    blockerIds: blockerIdsSource.map((item) => clean(item, 80)).filter(Boolean).slice(0, 20),
    score: Math.max(0, Math.min(100, Math.round(safeNumber(source.score, 0)))),
    checklistVersion: clean(source.checklistVersion, 80) || GO_LIVE_CHECKLIST_VERSION,
  };
}

function parseOnboardingManualAcks(value: unknown) {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const entries = Object.entries(source).slice(0, 20);
  const map = new Map<
    string,
    {
      done: boolean;
      doneAt: string | null;
      doneByName: string;
    }
  >();

  for (const [key, raw] of entries) {
    const id = clean(key, 80).toLowerCase();
    if (!id) continue;
    const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    map.set(id, {
      done: item.done === true,
      doneAt: toIso(item.doneAt),
      doneByName: clean(item.doneByName, 140),
    });
  }

  return map;
}

function statusToTone(status: ModuleStatus): Tone {
  if (status === "ready") return "success";
  if (status === "partial") return "warning";
  return "neutral";
}

function criterionTone(status: GoLiveCriterionStatus): Tone {
  if (status === "ready") return "success";
  if (status === "warning") return "warning";
  if (status === "blocked") return "danger";
  return "neutral";
}

function criterionPoints(item: TenantGoLiveCriterion) {
  if (item.status === "ready") return item.weight;
  if (item.status === "warning") return Math.round(item.weight / 2);
  return 0;
}

function buildCriterion(input: Omit<TenantGoLiveCriterion, "tone">): TenantGoLiveCriterion {
  return {
    ...input,
    tone: criterionTone(input.status),
  };
}

function isChannelConnected(item: Record<string, unknown>) {
  if (clean(item.status, 40).toLowerCase() !== "active") return false;
  const connectionStatus = clean(item.connectionStatus, 40).toLowerCase();
  return (
    connectionStatus === "ready" ||
    connectionStatus === "connected" ||
    item.routingReady === true ||
    item.syncReady === true ||
    item.inboundReady === true ||
    item.outboundReady === true
  );
}

function isChannelOperational(item: Record<string, unknown>) {
  const type = clean(item.type, 40).toLowerCase();
  if (!["whatsapp", "instagram", "messenger", "meta_ads"].includes(type)) return false;
  if (!isChannelConnected(item)) return false;

  const connectionStatus = clean(item.connectionStatus, 40).toLowerCase();
  if (connectionStatus === "ready" || item.routingReady === true) return true;
  if (type === "meta_ads") return connectionStatus === "connected" || item.syncReady === true;
  return item.inboundReady === true || item.outboundReady === true;
}

function normalizeSeverity(value: unknown): AiOperationalSeverity {
  const raw = clean(value, 40).toLowerCase();
  if (raw === "high") return "high";
  if (raw === "warning") return "warning";
  return "info";
}

function scoreConversionByWindow(leads: Array<Record<string, unknown>>, startMs: number, endMs: number) {
  const inWindow = leads.filter((item) => {
    const createdAt = toIso(item.createdAt);
    if (!createdAt) return false;
    const time = new Date(createdAt).getTime();
    return time >= startMs && time <= endMs;
  });
  const won = inWindow.filter((item) => clean(item.pipelineStage || item.stage, 40).toLowerCase() === "ganho").length;
  const total = inWindow.length;
  return {
    total,
    won,
    conversion: total > 0 ? (won / total) * 100 : 0,
  };
}

export async function getTenantReadinessSnapshot(tenantId: string): Promise<TenantReadinessSnapshot> {
  const settings = await getTenantSettings(tenantId);
  const inboxRules = parseInboxRules(settings?.rules);
  const aiSettings = settings?.ai && typeof settings.ai === "object" ? (settings.ai as Record<string, unknown>) : {};
  const onboardingSettings =
    settings?.onboarding && typeof settings.onboarding === "object"
      ? (settings.onboarding as Record<string, unknown>)
      : {};
  const aiOperatingProfile = parseAiOperatingProfile(aiSettings.operatingProfile);
  const guardrails = parseGuardrails(aiSettings.guardrails);
  const storedValidation = parseGoLiveValidation(settings?.goLive);
  const manualOnboardingAcks = parseOnboardingManualAcks(onboardingSettings.manualAcks);

  const [
    usersSnap,
    channelsSnap,
    formsSnap,
    chatsSnap,
    automationsSnap,
    kbDocsSnap,
    jobsSnap,
    metricsSnap,
    notificationsSnap,
    leadsSnap,
    campaignJobRunsSnap,
    campaignJobLockSnap,
    workerHealth,
    monthlyAiUsage,
  ] = await Promise.all([
    adminDb.collection("tenant_users").where("tenantId", "==", tenantId).where("status", "==", "active").limit(80).get(),
    adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(40).get(),
    adminDb.collection("capture_forms").where("tenantId", "==", tenantId).limit(80).get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
    adminDb.collection("automations").where("tenantId", "==", tenantId).limit(120).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get(),
    adminDb.collection("jobs").where("tenantId", "==", tenantId).limit(200).get(),
    adminDb.collection("metrics").where("tenantId", "==", tenantId).limit(120).get(),
    adminDb.collection("ai_internal_notifications").where("tenantId", "==", tenantId).limit(80).get(),
    adminDb.collection("leads").where("tenantId", "==", tenantId).limit(700).get(),
    adminDb.collection("internal_job_runs").where("job", "==", "campaigns_sync").limit(80).get(),
    adminDb.collection("internal_job_locks").doc("campaigns_sync").get(),
    readAiWorkerHealth(),
    getAiMonthlyUsageSnapshot(tenantId),
  ]);

  const users = usersSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const channels = channelsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const forms = formsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const chats = chatsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const automations = automationsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const kbDocs = kbDocsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const jobs: ReadinessDoc[] = jobsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  })) as ReadinessDoc[];
  const metrics = metricsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const notifications: ReadinessDoc[] = notificationsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  })) as ReadinessDoc[];
  const leads = leadsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const campaignJobRuns: ReadinessDoc[] = campaignJobRunsSnap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Record<string, unknown>),
  })) as ReadinessDoc[];
  const campaignJobLock = campaignJobLockSnap.exists
    ? (campaignJobLockSnap.data() as Record<string, unknown>)
    : {};

  const activeUsers = users.length;
  const onlineUsers = users.filter((item) => clean(item.availability, 40) === "online").length;
  const teamsConfigured = Array.from(
    new Set(
      users
        .map((item) => clean(item.team, 80))
        .filter(Boolean)
    )
  ).length;
  const managedTeams = inboxRules.teams.length;
  const activeChannels = channels.filter((item) => clean(item.status, 40) === "active").length;
  const connectedChannels = channels.filter(isChannelConnected).length;
  const operationalChannels = channels.filter(isChannelOperational).length;
  const activeForms = forms.filter((item) => clean(item.status, 40) === "active").length;
  const activeBacklog = chats.filter((item) => {
    const status = clean(item.status, 40).toLowerCase();
    return status !== "resolved" && status !== "archived";
  }).length;
  const activeAutomations = automations.filter((item) => clean(item.status, 40) === "active").length;
  const knowledgeDocs = kbDocs.length;
  const businessProfileId = normalizeBusinessProfileId(settings?.businessProfileId);
  const businessProfile = getBusinessProfile(businessProfileId);
  const responsibleName = clean(settings?.responsibleName || settings?.ownerName || settings?.contactName, 140);
  const responsibleEmail = clean(settings?.responsibleEmail, 180);
  const responsiblePhone = clean(aiSettings.responsiblePhone, 40);
  const hasCompanyProfile = Boolean(clean(settings?.name, 180) && clean(settings?.niche, 120));
  const hasCompanyContact = Boolean(clean(settings?.phone, 40) || clean(settings?.website, 180));
  const hasBusinessMode = Boolean(clean(settings?.businessProfileId, 40));
  const hasGoLiveOwner = Boolean(responsibleName);
  const hasAiOwner = Boolean(responsiblePhone);
  const aiEnabled = aiSettings.enabled !== false;
  const hasSla = inboxRules.defaultResponseSlaMinutes > 0;
  const hasDefaultTeam = Boolean(inboxRules.defaultTeam);
  const hasUsageBudgetLimit = aiOperatingProfile.monthlyBudgetUsd > 0;
  const hasUsageCapLimit = aiOperatingProfile.monthlyUsageCap > 0;
  const aiBudgetExceeded = hasUsageBudgetLimit && monthlyAiUsage.estimatedCostUsd >= aiOperatingProfile.monthlyBudgetUsd;
  const aiUsageCapExceeded = hasUsageCapLimit && monthlyAiUsage.conversationRuns >= aiOperatingProfile.monthlyUsageCap;
  const queueJobs = jobs.filter((item) => clean(item.type, 80) === AI_QUEUE_JOB_TYPE);
  const queueMetrics = metrics.filter((item) => clean(item.type, 80) === "ai_queue_daily");
  const queueObservability = summarizeAiQueueObservability({
    jobs: queueJobs.map((item) => ({
      id: clean(item.id, 160),
      tenantId,
      status: item.status,
      updatedAt: item.updatedAt,
      availableAt: item.availableAt,
      completedAt: item.completedAt,
      failedAt: item.failedAt,
      type: clean(item.type, 80),
      lastError: clean(item.lastError, 280),
      lastErrorCode: clean(item.lastErrorCode, 80),
      lastReasonCode: clean(item.lastReasonCode, 80),
    })),
    metrics: queueMetrics,
    workerHealth,
  });
  const queueHealth = queueObservability.tenants[0] || null;
  const nowMs = Date.now();
  const conversionCurrentStart = nowMs - 7 * 24 * 60 * 60 * 1000;
  const conversionPreviousStart = nowMs - 14 * 24 * 60 * 60 * 1000;
  const currentWindow = scoreConversionByWindow(leads, conversionCurrentStart, nowMs);
  const previousWindow = scoreConversionByWindow(leads, conversionPreviousStart, conversionCurrentStart - 1);
  const conversionDropDetected =
    previousWindow.total >= 8 &&
    currentWindow.total >= 8 &&
    previousWindow.conversion - currentWindow.conversion >= 5;
  const channelOfflineAlerts = channels
    .filter((item) => clean(item.status, 40) === "active")
    .filter((item) => !isChannelOperational(item))
    .slice(0, 4)
    .map((item) => {
      const guidance = buildAiAlertGuidance({ type: "channel_offline" });
      return {
        id: `channel_offline_${clean(item.type, 60) || "canal"}`,
        type: guidance.type,
        severity: "high" as AiOperationalSeverity,
        title: `${guidance.title}: ${clean(item.displayName || item.type, 120) || "Canal"}`,
        detail: "Canal ativo sem sinal de roteamento/inbound/outbound pronto.",
        probableCause: guidance.probableCause,
        recommendedAction: guidance.recommendedAction,
        href: guidance.href,
        source: "tenant_channels",
        lastOccurredAt: toIso(item.updatedAt),
      };
    });
  const nowIso = new Date().toISOString();
  const quotaUsagePct =
    aiOperatingProfile.monthlyBudgetUsd > 0
      ? (monthlyAiUsage.estimatedCostUsd / aiOperatingProfile.monthlyBudgetUsd) * 100
      : 0;
  const runUsagePct =
    aiOperatingProfile.monthlyUsageCap > 0
      ? (monthlyAiUsage.conversationRuns / aiOperatingProfile.monthlyUsageCap) * 100
      : 0;
  const quotaAlert =
    aiOperatingProfile.monthlyBudgetUsd > 0 || aiOperatingProfile.monthlyUsageCap > 0
      ? (() => {
          const budgetLimit = aiOperatingProfile.monthlyBudgetUsd > 0;
          const runLimit = aiOperatingProfile.monthlyUsageCap > 0;
          const budgetHigh = budgetLimit && quotaUsagePct >= 85;
          const runHigh = runLimit && runUsagePct >= 85;
          const budgetExceeded = budgetLimit && aiBudgetExceeded;
          const runExceeded = runLimit && aiUsageCapExceeded;
          if (!budgetHigh && !runHigh && !budgetExceeded && !runExceeded) return null;
          const guidance = buildAiAlertGuidance({ type: "quota_exceeded" });
          return {
            id: "quota_guardrail",
            type: guidance.type,
            severity: budgetExceeded || runExceeded ? ("high" as AiOperationalSeverity) : ("warning" as AiOperationalSeverity),
            title:
              budgetExceeded || runExceeded
                ? "Limite de uso da IA atingido"
                : "Uso da IA proximo do limite mensal",
            detail: `${monthlyAiUsage.conversationRuns}/${aiOperatingProfile.monthlyUsageCap || "sem cap"} execucoes • US$ ${monthlyAiUsage.estimatedCostUsd.toFixed(2)}/US$ ${aiOperatingProfile.monthlyBudgetUsd.toFixed(2)}.`,
            probableCause: guidance.probableCause,
            recommendedAction: guidance.recommendedAction,
            href: guidance.href,
            source: "ai_usage_monthly",
            lastOccurredAt: nowIso,
          };
        })()
      : null;
  const backlogThreshold = Math.max(25, activeUsers > 0 ? activeUsers * 25 : 40);
  const queueBacklog = Number(queueHealth?.backlog || 0);
  const backlogAlert =
    activeBacklog >= backlogThreshold || queueBacklog >= backlogThreshold
      ? (() => {
          const guidance = buildAiAlertGuidance({ type: "queue_degraded" });
          return {
            id: "backlog_anormal",
            type: guidance.type,
            severity:
              activeBacklog >= backlogThreshold * 1.5 || queueBacklog >= backlogThreshold * 1.5
                ? ("high" as AiOperationalSeverity)
                : ("warning" as AiOperationalSeverity),
            title: "Backlog operacional acima do esperado",
            detail: `${activeBacklog} conversas ativas no inbox e ${queueBacklog} job(s) na fila de IA.`,
            probableCause: guidance.probableCause,
            recommendedAction: guidance.recommendedAction,
            href: "/cliente/painel/inbox?queue=assigned_waiting",
            source: "tenant_backlog",
            lastOccurredAt: nowIso,
          };
        })()
      : null;
  const adsChannels = channels.filter((item) => {
    if (clean(item.status, 40) !== "active") return false;
    const type = clean(item.type, 40);
    return type === "meta_ads" || type === "google_ads";
  });
  const staleAdsChannels = adsChannels.filter((item) => {
    const lastSyncMs = toMillis(item.lastSyncAt);
    if (!lastSyncMs) return true;
    return Date.now() - lastSyncMs > 48 * 60 * 60 * 1000;
  });
  const adsSyncAlert =
    staleAdsChannels.length > 0
      ? {
          id: "ads_sync_stale",
          type: "queue_degraded",
          severity: "high" as AiOperationalSeverity,
          title: "Sync de Ads sem atualizacao recente",
          detail: `${staleAdsChannels.length} canal(is) de Ads sem sync nas ultimas 48h.`,
          probableCause: "Job de sync travado, credencial expirada ou erro recorrente no conector.",
          recommendedAction: "Revisar credenciais de Ads, rodar sync manual e acompanhar logs de tentativas.",
          href: "/cliente/painel/campanhas",
          source: "campaign_sync_health",
          lastOccurredAt: nowIso,
        }
      : null;
  const campaignRunsForTenant = campaignJobRuns
    .filter((item) => clean(item.tenantId, 140) === tenantId)
    .sort((a, b) => toMillis(b.startedAt || b.updatedAt) - toMillis(a.startedAt || a.updatedAt));
  const staleRunningJob = campaignRunsForTenant.find((item) => {
    if (clean(item.status, 40) !== "running") return false;
    const startedAtMs = toMillis(item.startedAt || item.updatedAt);
    return startedAtMs > 0 && Date.now() - startedAtMs >= 20 * 60 * 1000;
  });
  const lockStale =
    clean(campaignJobLock.status, 40) === "running" &&
    Number(campaignJobLock.lockedUntilMs || 0) > 0 &&
    Date.now() - Number(campaignJobLock.lockedUntilMs || 0) >= 5 * 60 * 1000;
  const stuckJobAlert =
    staleRunningJob || lockStale
      ? {
          id: "campaign_sync_job_stuck",
          type: "queue_degraded",
          severity: "high" as AiOperationalSeverity,
          title: "Job de sync de campanhas pode estar travado",
          detail: staleRunningJob
            ? `Execucao ${clean(staleRunningJob.id, 120)} em running ha mais de 20 minutos.`
            : "Lock de job permanece preso apos expiracao prevista.",
          probableCause: "Processo de sync interrompido no meio da execucao ou lock nao liberado.",
          recommendedAction: "Executar novo sync monitorado e validar locks/runs em internal_job_runs/internal_job_locks.",
          href: "/cliente/painel/campanhas",
          source: "campaign_sync_job",
          lastOccurredAt: nowIso,
        }
      : null;
  const internalAlerts = notifications
    .filter((item) => clean(item.status, 40) !== "resolved")
    .slice(0, 12)
    .map((item) => {
      const guidance = buildAiAlertGuidance({
        type: clean(item.type, 80),
        errorCode: clean(item.errorCode, 80),
        reasonCode: clean(item.reasonCode, 80),
        title: clean(item.title, 180),
        detail: clean(item.detail, 320),
      });
      return {
        id: clean(item.id, 160),
        type: guidance.type,
        severity: normalizeSeverity(item.severity),
        title: clean(item.title, 180) || guidance.title,
        detail: clean(item.detail, 320) || guidance.probableCause,
        probableCause: guidance.probableCause,
        recommendedAction: guidance.recommendedAction,
        href: guidance.href,
        source: clean(item.source, 80) || "ai_internal_notifications",
        lastOccurredAt: toIso(item.lastOccurredAt || item.updatedAt || item.createdAt),
      };
    });
  const conversionAlert = conversionDropDetected
    ? (() => {
        const guidance = buildAiAlertGuidance({ type: "conversion_drop" });
        return {
          id: "conversion_drop_7d",
          type: guidance.type,
          severity: "warning" as AiOperationalSeverity,
          title: guidance.title,
          detail: `Conversao caiu de ${previousWindow.conversion.toFixed(1)}% para ${currentWindow.conversion.toFixed(1)}% na ultima semana.`,
          probableCause: guidance.probableCause,
          recommendedAction: guidance.recommendedAction,
          href: guidance.href,
          source: "leads_window_7d",
          lastOccurredAt: new Date().toISOString(),
        };
      })()
    : null;
  const operationalAlerts: TenantOperationalAlert[] = [
    ...internalAlerts,
    ...channelOfflineAlerts,
    ...(quotaAlert ? [quotaAlert] : []),
    ...(backlogAlert ? [backlogAlert] : []),
    ...(adsSyncAlert ? [adsSyncAlert] : []),
    ...(stuckJobAlert ? [stuckJobAlert] : []),
    ...(conversionAlert ? [conversionAlert] : []),
  ]
    .sort((a, b) => {
      const severityWeight = (value: AiOperationalSeverity) => (value === "high" ? 2 : value === "warning" ? 1 : 0);
      if (severityWeight(a.severity) !== severityWeight(b.severity)) {
        return severityWeight(b.severity) - severityWeight(a.severity);
      }
      return (new Date(b.lastOccurredAt || 0).getTime() || 0) - (new Date(a.lastOccurredAt || 0).getTime() || 0);
    })
    .slice(0, 12);
  const hasHighSeverityAlert = operationalAlerts.some((item) => item.severity === "high");
  const hasWarningAlert = operationalAlerts.some((item) => item.severity === "warning");
  const operationalSnapshot = toTenantOperationalSnapshot({
    workerStatus: queueObservability.worker.status,
    queueRiskLevel: queueHealth?.riskLevel || "stable",
    staleQueue: queueHealth?.staleQueue === true,
    recurringAuthFailures: queueHealth?.recurringAuthFailures || 0,
    recurringQuotaFailures: queueHealth?.recurringQuotaFailures || 0,
    deadLetterCount: queueHealth?.counts?.deadLetter || 0,
    hasHighSeverityAlert,
    hasWarningAlert,
  });
  const disconnectedChannels = Math.max(0, activeChannels - connectedChannels);

  const checklist: TenantGoLiveCriterion[] = [
    buildCriterion({
      id: "channel_connected",
      href: "/cliente/painel/configuracoes/canais",
      title: "Canal conectado",
      description: "Go-live real exige pelo menos um canal de atendimento externo pronto para receber e responder demanda.",
      status:
        operationalChannels > 0
          ? "ready"
          : activeChannels > 0 || activeForms > 0
            ? "warning"
            : "pending",
      badge:
        operationalChannels > 0
          ? `${operationalChannels} pronto(s)`
          : activeChannels > 0
            ? `${activeChannels} configurado(s)`
            : activeForms > 0
              ? `${activeForms} formulario(s)`
              : "sem entrada real",
      blocking: operationalChannels === 0,
      critical: true,
      weight: 15,
      evidence:
        operationalChannels > 0
          ? `${operationalChannels} canal(is) ativo(s) com roteamento pronto para a operacao.`
          : activeForms > 0
            ? "Existe captacao ativa, mas ainda falta um canal conversacional operacional para o go-live definitivo."
            : "Nenhum canal de atendimento esta operacional neste tenant.",
      target: "Minimo de 1 canal com roteamento pronto.",
    }),
    buildCriterion({
      id: "ai_enabled",
      href: "/cliente/painel/ia",
      title: "IA habilitada",
      description: "A camada de IA precisa estar ativa para operar com o playbook padrao da plataforma.",
      status: aiEnabled ? "ready" : "pending",
      badge: aiEnabled ? "ativa" : "desligada",
      blocking: !aiEnabled,
      critical: true,
      weight: 15,
      evidence: aiEnabled ? "O agente esta habilitado para atendimento assistido." : "A IA esta pausada e impede o pacote de go-live definitivo.",
      target: "IA ligada para o tenant.",
    }),
    buildCriterion({
      id: "knowledge_minimum",
      href: "/cliente/painel/conhecimento",
      title: "Base de conhecimento minima",
      description: "A IA precisa de contexto minimo para responder sem alucinacao e handoff desnecessario.",
      status:
        knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? "ready"
          : knowledgeDocs > 0
            ? "warning"
            : "pending",
      badge: `${knowledgeDocs}/${KNOWLEDGE_DOCS_MINIMUM} docs`,
      blocking: knowledgeDocs < KNOWLEDGE_DOCS_MINIMUM,
      critical: true,
      weight: 15,
      evidence:
        knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? `${knowledgeDocs} documento(s) disponivel(is) para atendimento.`
          : knowledgeDocs > 0
            ? `Ha ${knowledgeDocs} documento(s), mas o minimo operacional recomendado e ${KNOWLEDGE_DOCS_MINIMUM}.`
            : "Nenhum documento foi publicado para orientar a IA.",
      target: `Minimo de ${KNOWLEDGE_DOCS_MINIMUM} documentos ativos.`,
    }),
    buildCriterion({
      id: "owner_handoff",
      href: "/cliente/painel/configuracoes",
      title: "Owner e handoff definidos",
      description: "O tenant precisa ter ownership humano e destino de handoff claro para assumir conversas reais.",
      status:
        hasGoLiveOwner && hasAiOwner && hasDefaultTeam && activeUsers > 0
          ? "ready"
          : hasAiOwner || hasGoLiveOwner || hasDefaultTeam
            ? "warning"
            : "pending",
      badge:
        hasGoLiveOwner && hasAiOwner && hasDefaultTeam && activeUsers > 0
          ? "cobertura fechada"
          : "revisar ownership",
      blocking: !(hasGoLiveOwner && hasAiOwner && hasDefaultTeam && activeUsers > 0),
      critical: true,
      weight: 15,
      evidence:
        hasGoLiveOwner && hasAiOwner && hasDefaultTeam && activeUsers > 0
          ? `Owner ${responsibleName || "definido"}, handoff ${responsiblePhone} e time padrao ${inboxRules.defaultTeam}.`
          : "Falta fechar owner comercial, responsavel de handoff, time padrao ou equipe ativa para assumir escalacoes.",
      target: "Owner nominal, handoff da IA, time padrao e equipe ativa.",
    }),
    buildCriterion({
      id: "usage_cost_limits",
      href: "/cliente/painel/ia",
      title: "Limites de uso e custo",
      description: "Budget e cap de execucao evitam susto financeiro e ajudam a operar contingencia quando a IA degrada.",
      status:
        aiBudgetExceeded || aiUsageCapExceeded
          ? "blocked"
          : hasUsageBudgetLimit && hasUsageCapLimit
            ? "ready"
            : hasUsageBudgetLimit || hasUsageCapLimit
              ? "warning"
              : "pending",
      badge:
        aiBudgetExceeded || aiUsageCapExceeded
          ? "limite atingido"
          : hasUsageBudgetLimit && hasUsageCapLimit
            ? "controles ativos"
            : "ajustar limites",
      blocking: aiBudgetExceeded || aiUsageCapExceeded || !(hasUsageBudgetLimit && hasUsageCapLimit),
      critical: true,
      weight: 10,
      evidence:
        aiBudgetExceeded || aiUsageCapExceeded
          ? `Uso atual do mes em risco: ${monthlyAiUsage.conversationRuns} execucoes e US$ ${monthlyAiUsage.estimatedCostUsd.toFixed(2)}.`
          : hasUsageBudgetLimit && hasUsageCapLimit
            ? `Cap ${aiOperatingProfile.monthlyUsageCap} execucoes e budget US$ ${aiOperatingProfile.monthlyBudgetUsd.toFixed(2)} definidos.`
            : "Os limites de budget e volume ainda nao estao fechados no operating profile.",
      target: "Budget mensal e cap de execucao configurados sem estourar o uso atual.",
    }),
    buildCriterion({
      id: "company_profile",
      href: "/cliente/painel/configuracoes/empresa",
      title: "Perfil comercial do tenant",
      description: "Nome, nicho, modo de negocio e contato principal deixam o workspace pronto para venda e handoff.",
      status:
        hasCompanyProfile && hasCompanyContact && hasBusinessMode
          ? "ready"
          : hasCompanyProfile || hasCompanyContact || hasBusinessMode
            ? "warning"
            : "pending",
      badge: hasBusinessMode ? businessProfile.label : "completar perfil",
      blocking: false,
      critical: false,
      weight: 10,
      evidence:
        hasCompanyProfile && hasCompanyContact && hasBusinessMode
          ? "Perfil comercial completo e alinhado ao modo de negocio."
          : "Ainda faltam dados de empresa, contato ou modo operacional para venda sem contexto quebrado.",
      target: "Perfil, contato e vertical configurados.",
    }),
    buildCriterion({
      id: "operation_rules",
      href: "/cliente/painel/configuracoes/operacao",
      title: "Regras operacionais",
      description: "SLA, horario e distribuicao precisam estar definidos para nao abrir o go-live sem combinados claros.",
      status:
        hasSla && hasDefaultTeam
          ? "ready"
          : hasSla || hasDefaultTeam
            ? "warning"
            : "pending",
      badge: hasSla ? `${inboxRules.defaultResponseSlaMinutes} min SLA` : "sem SLA",
      blocking: false,
      critical: false,
      weight: 10,
      evidence:
        hasSla && hasDefaultTeam
          ? `Operacao em modo ${inboxRules.mode || "manual"} com time padrao ${inboxRules.defaultTeam}.`
          : "Ainda faltam regras minimas de SLA ou time padrao para a operacao.",
      target: "SLA de primeira resposta e time padrao definidos.",
    }),
    buildCriterion({
      id: "team_coverage",
      href: "/cliente/painel/configuracoes/usuarios",
      title: "Cobertura humana",
      description: "Mesmo com IA ativa, o tenant precisa de gente disponivel para takeover, handoff e follow-up.",
      status:
        activeUsers > 0 && onlineUsers > 0
          ? "ready"
          : activeUsers > 0
            ? "warning"
            : "pending",
      badge: `${activeUsers} ativo(s)`,
      blocking: false,
      critical: false,
      weight: 10,
      evidence:
        activeUsers > 0 && onlineUsers > 0
          ? `${onlineUsers} usuario(s) online e ${activeUsers} ativo(s) no tenant.`
          : activeUsers > 0
            ? "Existe equipe ativa, mas ninguem esta online para assumir operacao agora."
            : "Nao ha usuarios ativos para takeover, CRM e comercial.",
      target: "Minimo de 1 usuario ativo e 1 online.",
    }),
  ];

  const readinessScore = Math.round(
    (checklist.reduce((total, item) => total + criterionPoints(item), 0) /
      checklist.reduce((total, item) => total + item.weight, 0)) *
      100
  );
  const blockingChecklist = checklist.filter((item) => item.critical && item.blocking);
  const pilotReady = blockingChecklist.length === 0;

  const summary: TenantReadinessSummary = {
    activeUsers,
    onlineUsers,
    teamsConfigured,
    managedTeams,
    activeChannels,
    connectedChannels,
    operationalChannels,
    activeForms,
    activeBacklog,
    activeAutomations,
    knowledgeDocs,
    knowledgeDocsMinimum: KNOWLEDGE_DOCS_MINIMUM,
    hasCompanyProfile,
    hasCompanyContact,
    hasBusinessMode,
    hasGoLiveOwner,
    hasAiOwner,
    aiEnabled,
    guardrails: guardrails.length,
    hasSla,
    hasDefaultTeam,
    businessHoursOnly: inboxRules.businessHoursOnly,
    hasUsageBudgetLimit,
    hasUsageCapLimit,
    aiMonthlyBudgetUsd: aiOperatingProfile.monthlyBudgetUsd,
    aiMonthlyUsageCap: aiOperatingProfile.monthlyUsageCap,
    aiMonthlyCostUsd: monthlyAiUsage.estimatedCostUsd,
    aiMonthlyRuns: monthlyAiUsage.conversationRuns,
    aiBudgetExceeded,
    aiUsageCapExceeded,
    operationalStatus: operationalSnapshot.status,
    criticalBlockers: blockingChecklist.length,
    pilotReady,
    readinessScore,
  };

  const activation: TenantGoLiveActivation = {
    gateStatus: pilotReady ? "open" : "blocked",
    status: pilotReady
      ? storedValidation.status === "approved"
        ? "approved"
        : "ready_to_activate"
      : "blocked",
    title: pilotReady ? "Go-live liberado" : "Go-live bloqueado",
    description: pilotReady
      ? storedValidation.status === "approved"
        ? "Tenant validado e pronto para venda com o checklist definitivo."
        : "Todos os gates criticos passaram. O tenant pode ser liberado para venda e operacao real."
      : storedValidation.status === "approved"
        ? "O tenant ja foi validado antes, mas saiu da zona segura e precisa ser refeito antes da venda."
        : "Existem pendencias criticas que impedem ativacao operacional segura.",
    readyForSale: pilotReady,
    blockingItems: blockingChecklist.map((item) => item.title),
    validation: storedValidation,
  };

  const blockers: TenantReadinessItem[] = blockingChecklist.map((item) => ({
    id: item.id,
    href: item.href,
    title: item.title,
    description: item.evidence,
    badge: item.badge,
    tone: item.tone,
  }));

  if (!hasCompanyProfile || !hasCompanyContact) {
    blockers.push({
      id: "company",
      href: "/cliente/painel/configuracoes/empresa",
      title: "Completar perfil da empresa",
      description: "Preencha dados de marca, nicho e contato para handoff, widgets e operacao comercial.",
      badge: "perfil",
      tone: "warning",
    });
  }

  if (!hasBusinessMode) {
    blockers.push({
      id: "business_mode",
      href: "/cliente/painel/configuracoes/empresa",
      title: "Selecionar modo do negocio",
      description: "Escolha o perfil principal da operacao para IA, CRM, pipeline e playbooks nascerem mais alinhados.",
      badge: "vertical",
      tone: "info",
    });
  }

  if (!hasSla || !hasDefaultTeam) {
    blockers.push({
      id: "ops",
      href: "/cliente/painel/configuracoes/operacao",
      title: "Ajustar SLA e time padrao",
      description: "Feche regras operacionais para distribuicao consistente e resposta dentro da meta.",
      badge: "SLA",
      tone: "info",
    });
  }

  if (managedTeams === 0) {
    blockers.push({
      id: "teams",
      href: "/cliente/painel/configuracoes/times",
      title: "Estruturar times da operacao",
      description: "Defina ownership por time para distribuir inbound com mais contexto e menos conflito.",
      badge: "times",
      tone: "info",
    });
  }

  const modules: TenantModuleReadiness[] = [
    {
      id: "go_live",
      href: "/cliente/painel/go-live",
      title: "Gate definitivo",
      description: pilotReady
        ? "Checklist critico aprovado para venda e operacao real."
        : "Ainda existem gates criticos bloqueando a ativacao do tenant.",
      status: pilotReady ? "ready" : "partial",
      badge: `${readinessScore}%`,
      tone: pilotReady ? "success" : "warning",
    },
    {
      id: "settings",
      href: "/cliente/painel/configuracoes",
      title: "Governanca do tenant",
      description:
        hasCompanyProfile && hasCompanyContact && hasBusinessMode
          ? `Perfil, contato e modo ${businessProfile.label} configurados para o tenant.`
          : "Ainda faltam dados basicos de empresa e contexto comercial para o go-live.",
      status: hasCompanyProfile && hasCompanyContact && hasBusinessMode ? "ready" : "partial",
      badge: hasBusinessMode ? businessProfile.label : "completar perfil",
      tone: hasCompanyProfile && hasCompanyContact && hasBusinessMode ? "success" : "warning",
    },
    {
      id: "inbox",
      href: "/cliente/painel/inbox",
      title: "Inbox omnichannel",
      description:
        activeUsers > 0 && operationalChannels > 0 && hasSla
          ? "A operacao ja consegue receber, distribuir e responder conversas com SLA definido."
          : "Ainda faltam pessoas, canal pronto ou SLA para operar atendimento com seguranca.",
      status: activeUsers > 0 && operationalChannels > 0 && hasSla ? "ready" : "partial",
      badge: `${activeBacklog} em fila`,
      tone: activeBacklog > 0 ? "info" : statusToTone(activeUsers > 0 && operationalChannels > 0 && hasSla ? "ready" : "partial"),
    },
    {
      id: "crm",
      href: "/cliente/painel/crm",
      title: "CRM e follow-up",
      description:
        activeUsers > 0
          ? "Leads, tarefas e timeline ja podem ser operados pelo tenant."
          : "Adicione pelo menos um usuario para operar CRM e follow-ups.",
      status: activeUsers > 0 ? "ready" : "pending",
      badge: activeUsers > 0 ? "operavel" : "sem equipe",
      tone: activeUsers > 0 ? "success" : "neutral",
    },
    {
      id: "ai",
      href: "/cliente/painel/ia",
      title: "IA de atendimento",
      description:
        aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? "Agente com handoff, guardrails e base minima para operar o go-live."
          : "Ainda faltam elementos de seguranca, dono ou contexto para confiar no autopilot.",
      status:
        aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? "ready"
          : aiEnabled || knowledgeDocs > 0
            ? "partial"
            : "pending",
      badge: aiEnabled ? `${guardrails.length} guardrails` : "IA pausada",
      tone:
        aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? "success"
          : aiEnabled
            ? "warning"
            : "neutral",
    },
    {
      id: "automations",
      href: "/cliente/painel/automacoes",
      title: "Automações",
      description:
        activeAutomations > 0
          ? "Ja existem playbooks ativos para reduzir trabalho manual."
          : "Sem automacoes ativas, a operacao ainda depende mais de acao humana.",
      status: activeAutomations > 0 ? "ready" : "partial",
      badge: `${activeAutomations} ativa(s)`,
      tone: activeAutomations > 0 ? "success" : "warning",
    },
    {
      id: "knowledge",
      href: "/cliente/painel/conhecimento",
      title: "Base de conhecimento",
      description:
        knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM
          ? "A IA ja tem documentos suficientes do negocio para consultas e respostas."
          : "Ainda nao ha volume minimo de documentos para orientar respostas e handoffs.",
      status: knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM ? "ready" : knowledgeDocs > 0 ? "partial" : "pending",
      badge: `${knowledgeDocs} doc(s)`,
      tone: knowledgeDocs >= KNOWLEDGE_DOCS_MINIMUM ? "success" : knowledgeDocs > 0 ? "warning" : "neutral",
    },
  ];

  const insights = [
    {
      id: "gate",
      title: pilotReady ? "Tenant pronto para venda e operacao real" : "Tenant ainda bloqueado para o go-live",
      description: pilotReady
        ? "Todos os gates criticos passaram. O tenant pode entrar em operacao com checklist repetivel."
        : `Existem ${blockingChecklist.length} gate(s) critico(s) bloqueando a ativacao operacional.`,
    },
    {
      id: "usage",
      title: "Controle de custo da IA",
      description:
        hasUsageBudgetLimit && hasUsageCapLimit
          ? `Mes atual com ${monthlyAiUsage.conversationRuns} execucoes e US$ ${monthlyAiUsage.estimatedCostUsd.toFixed(2)} de custo estimado frente aos limites configurados.`
          : "Os limites mensais de budget e execucao ainda nao foram fechados no operating profile.",
    },
    {
      id: "ops",
      title: "Fluxo da operacao",
      description: `Distribuicao em modo ${inboxRules.mode || "manual"} com SLA de ${inboxRules.defaultResponseSlaMinutes || 15} minutos e ${managedTeams || teamsConfigured} frente(s) de atendimento.`,
    },
    {
      id: "validation",
      title: activation.validation.status === "not_checked" ? "Checklist ainda nao validado" : "Historico da ultima validacao",
      description:
        activation.validation.status === "not_checked"
          ? "Ninguem rodou a validacao definitiva deste tenant ainda."
          : activation.validation.status === "approved"
            ? `Ultima aprovacao em ${activation.validation.checkedAt || activation.validation.approvedAt || "data indisponivel"} por ${activation.validation.checkedByName || activation.validation.approvedByName || "usuario nao identificado"}.`
            : `Ultimo bloqueio em ${activation.validation.checkedAt || "data indisponivel"} por ${activation.validation.checkedByName || "usuario nao identificado"}.`,
    },
    {
      id: "ops_health",
      title: `Saude operacional ${operationalSnapshot.label}`,
      description: operationalSnapshot.reason,
    },
  ];

  const onboardingSteps: TenantOnboardingStep[] = [
    {
      id: "profile_setup",
      title: "Perfil comercial configurado",
      description: "Empresa, contato e modo de negocio definidos para o tenant.",
      href: "/cliente/painel/configuracoes/empresa",
      mode: "auto",
      status: hasCompanyProfile && hasCompanyContact && hasBusinessMode ? "done" : hasCompanyProfile || hasCompanyContact ? "pending" : "blocked",
      critical: true,
      done: hasCompanyProfile && hasCompanyContact && hasBusinessMode,
      blocking: !(hasCompanyProfile && hasCompanyContact && hasBusinessMode),
      evidence:
        hasCompanyProfile && hasCompanyContact && hasBusinessMode
          ? "Perfil e contato comercial completos."
          : "Faltam dados de empresa, contato ou modo operacional.",
      doneAt: null,
      doneByName: "",
    },
    {
      id: "channel_ready",
      title: "Canal operacional pronto",
      description: "Pelo menos um canal ativo com roteamento/sync apto para operacao.",
      href: "/cliente/painel/configuracoes/canais",
      mode: "auto",
      status: operationalChannels > 0 ? "done" : activeChannels > 0 ? "pending" : "blocked",
      critical: true,
      done: operationalChannels > 0,
      blocking: operationalChannels === 0,
      evidence:
        operationalChannels > 0
          ? `${operationalChannels} canal(is) operacional(is).`
          : activeChannels > 0
            ? "Canal ativo sem readiness operacional completo."
            : "Nenhum canal ativo para atendimento.",
      doneAt: null,
      doneByName: "",
    },
    {
      id: "ai_guardrails",
      title: "IA com guardrails e limites",
      description: "IA ligada, dono de handoff definido e limites de uso/custo em zona segura.",
      href: "/cliente/painel/ia",
      mode: "auto",
      status:
        aiEnabled && hasAiOwner && guardrails.length > 0 && !aiBudgetExceeded && !aiUsageCapExceeded
          ? "done"
          : aiEnabled && hasAiOwner
            ? "pending"
            : "blocked",
      critical: true,
      done: aiEnabled && hasAiOwner && guardrails.length > 0 && !aiBudgetExceeded && !aiUsageCapExceeded,
      blocking: !(aiEnabled && hasAiOwner && guardrails.length > 0 && !aiBudgetExceeded && !aiUsageCapExceeded),
      evidence:
        aiEnabled && hasAiOwner && guardrails.length > 0 && !aiBudgetExceeded && !aiUsageCapExceeded
          ? "IA com owner, guardrails e budget/cap sem estouro."
          : "Falta owner/guardrails ou limite mensal foi ultrapassado.",
      doneAt: null,
      doneByName: "",
    },
    {
      id: "crm_followup_ops",
      title: "CRM e follow-up operacionais",
      description: "Equipe ativa e SLA basico para operar fila comercial.",
      href: "/cliente/painel/crm",
      mode: "auto",
      status: activeUsers > 0 && hasSla ? "done" : activeUsers > 0 ? "pending" : "blocked",
      critical: true,
      done: activeUsers > 0 && hasSla,
      blocking: !(activeUsers > 0 && hasSla),
      evidence:
        activeUsers > 0 && hasSla
          ? "Equipe ativa com SLA configurado."
          : activeUsers > 0
            ? "Equipe ativa sem SLA fechado."
            : "Sem equipe ativa para operar CRM/follow-up.",
      doneAt: null,
      doneByName: "",
    },
    {
      id: "ads_sync_health",
      title: "Sync de Ads saudavel",
      description: "Canais de Ads sem defasagem de sync relevante.",
      href: "/cliente/painel/campanhas",
      mode: "auto",
      status: staleAdsChannels.length === 0 ? "done" : "pending",
      critical: false,
      done: staleAdsChannels.length === 0,
      blocking: false,
      evidence:
        staleAdsChannels.length === 0
          ? "Sync de Ads atualizado."
          : `${staleAdsChannels.length} canal(is) de Ads sem sync nas ultimas 48h.`,
      doneAt: null,
      doneByName: "",
    },
    {
      id: "team_enablement",
      title: "Equipe treinada no playbook",
      description: "Confirma que time comercial foi alinhado em roteiro, SLA e handoff.",
      href: "/cliente/painel/go-live",
      mode: "manual",
      status: manualOnboardingAcks.get("team_enablement")?.done ? "done" : "pending",
      critical: false,
      done: Boolean(manualOnboardingAcks.get("team_enablement")?.done),
      blocking: false,
      evidence: manualOnboardingAcks.get("team_enablement")?.done
        ? "Treinamento operacional confirmado."
        : "Pendente de confirmacao manual.",
      doneAt: manualOnboardingAcks.get("team_enablement")?.doneAt || null,
      doneByName: manualOnboardingAcks.get("team_enablement")?.doneByName || "",
    },
    {
      id: "incident_runbook_ack",
      title: "Runbook de incidente validado",
      description: "Confirma que o responsavel conhece o fluxo de resposta a canal/IA/job degradado.",
      href: "/cliente/painel/go-live",
      mode: "manual",
      status: manualOnboardingAcks.get("incident_runbook_ack")?.done ? "done" : "pending",
      critical: false,
      done: Boolean(manualOnboardingAcks.get("incident_runbook_ack")?.done),
      blocking: false,
      evidence: manualOnboardingAcks.get("incident_runbook_ack")?.done
        ? "Runbook confirmado com owner."
        : "Pendente de confirmacao manual.",
      doneAt: manualOnboardingAcks.get("incident_runbook_ack")?.doneAt || null,
      doneByName: manualOnboardingAcks.get("incident_runbook_ack")?.doneByName || "",
    },
    {
      id: "handoff_drill",
      title: "Teste de handoff executado",
      description: "Confirma um takeover real validando notificacao e continuidade do atendimento.",
      href: "/cliente/painel/handoffs",
      mode: "manual",
      status: manualOnboardingAcks.get("handoff_drill")?.done ? "done" : "pending",
      critical: false,
      done: Boolean(manualOnboardingAcks.get("handoff_drill")?.done),
      blocking: false,
      evidence: manualOnboardingAcks.get("handoff_drill")?.done
        ? "Handoff drill confirmado."
        : "Pendente de confirmacao manual.",
      doneAt: manualOnboardingAcks.get("handoff_drill")?.doneAt || null,
      doneByName: manualOnboardingAcks.get("handoff_drill")?.doneByName || "",
    },
  ];
  const onboardingCompleted = onboardingSteps.filter((item) => item.done).length;
  const onboardingCriticalPending = onboardingSteps.filter((item) => item.critical && !item.done).length;
  const onboardingManualPending = onboardingSteps.filter((item) => item.mode === "manual" && !item.done).length;
  const onboardingAutoPending = onboardingSteps.filter((item) => item.mode === "auto" && !item.done).length;
  const onboardingProgress: TenantOnboardingProgress = {
    completed: onboardingCompleted,
    total: onboardingSteps.length,
    progressPct: onboardingSteps.length ? Math.round((onboardingCompleted / onboardingSteps.length) * 100) : 0,
    pendingCritical: onboardingCriticalPending,
    manualPending: onboardingManualPending,
    autoPending: onboardingAutoPending,
    steps: onboardingSteps,
  };

  const nextBuildItems: TenantReadinessItem[] = [];

  return {
    tenantId,
    settings: {
      name: clean(settings?.name, 180),
      niche: clean(settings?.niche, 120),
      businessProfileId,
      phone: clean(settings?.phone, 40),
      website: clean(settings?.website, 180),
      responsibleName,
      responsibleEmail,
      timezone: clean(settings?.timezone, 80) || "America/Sao_Paulo",
      businessHours: clean(settings?.businessHours, 240) || "Seg-Sex 09:00-18:00",
      inboxRules,
      ai: {
        responsiblePhone,
        monthlyBudgetUsd: aiOperatingProfile.monthlyBudgetUsd,
        monthlyUsageCap: aiOperatingProfile.monthlyUsageCap,
      },
    },
    summary,
    operationalHealth: {
      ...operationalSnapshot,
      queueBacklog,
      activeBacklog,
      activeChannels,
      disconnectedChannels,
      stuckJobs: staleRunningJob || lockStale ? 1 : 0,
    },
    operationalAlerts,
    onboarding: onboardingProgress,
    checklist,
    activation,
    blockers: blockers.slice(0, 8),
    modules,
    insights,
    nextBuildItems,
  };
}
