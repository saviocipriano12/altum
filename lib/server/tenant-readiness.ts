import { adminDb } from "@/app/lib/server/firebase-admin";
import { getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";
import { getAiMonthlyUsageSnapshot } from "@/lib/server/ai/usage-ledger";
import { getTenantSettings } from "@/lib/server/tenant";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type ModuleStatus = "ready" | "partial" | "pending";
type GoLiveCriterionStatus = "ready" | "warning" | "pending" | "blocked";
type ValidationStatus = "approved" | "blocked" | "not_checked";

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

export async function getTenantReadinessSnapshot(tenantId: string): Promise<TenantReadinessSnapshot> {
  const settings = await getTenantSettings(tenantId);
  const inboxRules = parseInboxRules(settings?.rules);
  const aiSettings = settings?.ai && typeof settings.ai === "object" ? (settings.ai as Record<string, unknown>) : {};
  const aiOperatingProfile = parseAiOperatingProfile(aiSettings.operatingProfile);
  const guardrails = parseGuardrails(aiSettings.guardrails);
  const storedValidation = parseGoLiveValidation(settings?.goLive);

  const [
    usersSnap,
    channelsSnap,
    formsSnap,
    chatsSnap,
    automationsSnap,
    kbDocsSnap,
    monthlyAiUsage,
  ] = await Promise.all([
    adminDb.collection("tenant_users").where("tenantId", "==", tenantId).where("status", "==", "active").limit(80).get(),
    adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(40).get(),
    adminDb.collection("capture_forms").where("tenantId", "==", tenantId).limit(80).get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
    adminDb.collection("automations").where("tenantId", "==", tenantId).limit(120).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get(),
    getAiMonthlyUsageSnapshot(tenantId),
  ]);

  const users = usersSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const channels = channelsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const forms = formsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const chats = chatsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const automations = automationsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const kbDocs = kbDocsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);

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
  const connectedChannels = channels.filter((item) => {
    if (clean(item.status, 40) !== "active") return false;
    return item.routingReady === true || item.syncReady === true || item.inboundReady === true || item.outboundReady === true;
  }).length;
  const operationalChannels = channels.filter((item) => {
    const type = clean(item.type, 40);
    if (!["whatsapp", "instagram", "messenger", "meta_ads"].includes(type)) return false;
    if (clean(item.status, 40) !== "active") return false;
    return item.routingReady === true || (type === "meta_ads" && item.syncReady === true);
  }).length;
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
  ];

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
    checklist,
    activation,
    blockers: blockers.slice(0, 8),
    modules,
    insights,
    nextBuildItems,
  };
}
