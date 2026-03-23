import { adminDb } from "@/app/lib/server/firebase-admin";
import { getTenantSettings } from "@/lib/server/tenant";
import { getBusinessProfile, normalizeBusinessProfileId, type BusinessProfileId } from "@/lib/business-profiles";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";
type ModuleStatus = "ready" | "partial" | "pending";

export type TenantReadinessSummary = {
  activeUsers: number;
  onlineUsers: number;
  teamsConfigured: number;
  managedTeams: number;
  activeChannels: number;
  operationalChannels: number;
  activeForms: number;
  activeBacklog: number;
  activeAutomations: number;
  knowledgeDocs: number;
  hasCompanyProfile: boolean;
  hasCompanyContact: boolean;
  hasBusinessMode: boolean;
  hasAiOwner: boolean;
  aiEnabled: boolean;
  guardrails: number;
  hasSla: boolean;
  hasDefaultTeam: boolean;
  businessHoursOnly: boolean;
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

export type TenantReadinessSnapshot = {
  tenantId: string;
  settings: {
    name: string;
    niche: string;
    businessProfileId: BusinessProfileId;
    phone: string;
    website: string;
    inboxRules: {
      defaultResponseSlaMinutes: number;
      mode: string;
      businessHoursOnly: boolean;
      defaultTeam: string;
      teams: Array<{ id: string; name: string }>;
    };
  };
  summary: TenantReadinessSummary;
  blockers: TenantReadinessItem[];
  modules: TenantModuleReadiness[];
  insights: Array<{ id: string; title: string; description: string }>;
  nextBuildItems: TenantReadinessItem[];
};

function clean(value: unknown, max = 200) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
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
    defaultResponseSlaMinutes: Number(inbox.firstResponseSlaMinutes || 15),
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

function statusToTone(status: ModuleStatus): Tone {
  if (status === "ready") return "success";
  if (status === "partial") return "warning";
  return "neutral";
}

function statusToBadge(status: ModuleStatus) {
  if (status === "ready") return "pronto";
  if (status === "partial") return "parcial";
  return "pendente";
}

export async function getTenantReadinessSnapshot(tenantId: string): Promise<TenantReadinessSnapshot> {
  const settings = await getTenantSettings(tenantId);
  const inboxRules = parseInboxRules(settings?.rules);
  const guardrails = parseGuardrails(settings?.ai && typeof settings.ai === "object" ? settings.ai.guardrails : []);

  const [usersSnap, channelsSnap, formsSnap, chatsSnap, automationsSnap, kbDocsSnap, appointmentsSnap] = await Promise.all([
    adminDb.collection("tenant_users").where("tenantId", "==", tenantId).where("status", "==", "active").limit(80).get(),
    adminDb.collection("tenant_channels").where("tenantId", "==", tenantId).limit(40).get(),
    adminDb.collection("capture_forms").where("tenantId", "==", tenantId).limit(80).get(),
    adminDb.collection("chats").where("tenantId", "==", tenantId).limit(300).get(),
    adminDb.collection("automations").where("tenantId", "==", tenantId).limit(120).get(),
    adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(200).get(),
    adminDb.collection("appointments").where("tenantId", "==", tenantId).limit(240).get(),
  ]);

  const users = usersSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const channels = channelsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const forms = formsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const chats = chatsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const automations = automationsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const kbDocs = kbDocsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);
  const appointments = appointmentsSnap.docs.map((doc) => doc.data() as Record<string, unknown>);

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
  const operationalChannels = channels.filter((item) => {
    const type = clean(item.type, 40);
    return clean(item.status, 40) === "active" && ["whatsapp", "instagram", "messenger"].includes(type);
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
  const hasCompanyProfile = Boolean(clean(settings?.name, 180) && clean(settings?.niche, 120));
  const hasCompanyContact = Boolean(clean(settings?.phone, 40) || clean(settings?.website, 180));
  const hasBusinessMode = Boolean(clean(settings?.businessProfileId, 40));
  const hasAiOwner = Boolean(
    settings?.ai && typeof settings.ai === "object" ? clean(settings.ai.responsiblePhone, 40) : ""
  );
  const aiEnabled =
    !(settings?.ai && typeof settings.ai === "object") || settings.ai.enabled !== false;
  const hasSla = Boolean(inboxRules.defaultResponseSlaMinutes);
  const hasDefaultTeam = Boolean(inboxRules.defaultTeam);

  const companySignals = [hasCompanyProfile, hasCompanyContact, hasBusinessMode];
  const operationalSignals = [
    activeUsers > 0,
    operationalChannels > 0 || activeForms > 0,
    hasSla,
    hasDefaultTeam,
    aiEnabled,
    hasAiOwner,
    guardrails.length > 0,
    knowledgeDocs > 0,
  ];

  const readinessScore = Math.round(
    ((companySignals.filter(Boolean).length + operationalSignals.filter(Boolean).length) /
      (companySignals.length + operationalSignals.length)) *
      100
  );

  const pilotReady =
    hasCompanyProfile &&
    hasCompanyContact &&
    activeUsers > 0 &&
    (operationalChannels > 0 || activeForms > 0) &&
    hasSla &&
    hasDefaultTeam &&
    aiEnabled &&
    hasAiOwner &&
    guardrails.length > 0 &&
    knowledgeDocs > 0;

  const summary: TenantReadinessSummary = {
    activeUsers,
    onlineUsers,
    teamsConfigured,
    managedTeams,
    activeChannels,
    operationalChannels,
    activeForms,
    activeBacklog,
    activeAutomations,
    knowledgeDocs,
    hasCompanyProfile,
    hasCompanyContact,
    hasBusinessMode,
    hasAiOwner,
    aiEnabled,
    guardrails: guardrails.length,
    hasSla,
    hasDefaultTeam,
    businessHoursOnly: inboxRules.businessHoursOnly,
    pilotReady,
    readinessScore,
  };

  const blockers: TenantReadinessItem[] = [];

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

  if (activeUsers === 0) {
    blockers.push({
      id: "users",
      href: "/cliente/painel/configuracoes/usuarios",
      title: "Adicionar equipe ao tenant",
      description: "Sem usuarios ativos, o inbox e a distribuicao nao conseguem operar com ownership real.",
      badge: "equipe",
      tone: "danger",
    });
  } else if (onlineUsers === 0) {
    blockers.push({
      id: "availability",
      href: "/cliente/painel/configuracoes/usuarios",
      title: "Ninguem esta online para atendimento",
      description: "Revise disponibilidade dos membros para ativar distribuicao e takeover com menos atrito.",
      badge: "escala",
      tone: "warning",
    });
  }

  if (operationalChannels === 0 && activeForms === 0) {
    blockers.push({
      id: "channels",
      href: "/cliente/painel/configuracoes/canais",
      title: "Conectar canal ou ativar captacao",
      description: "Ative ao menos um canal conversacional ou um formulario publico para iniciar o piloto com cliente.",
      badge: "canal",
      tone: "warning",
    });
  }

  if (!aiEnabled || !hasAiOwner || guardrails.length === 0) {
    blockers.push({
      id: "ai",
      href: "/cliente/painel/ia",
      title: "Revisar governanca da IA",
      description: "Defina handoff, guardrails e cobertura do agente para reduzir escaladas sem dono.",
      badge: "ia",
      tone: aiEnabled ? "info" : "warning",
    });
  }

  if (knowledgeDocs === 0) {
    blockers.push({
      id: "knowledge",
      href: "/cliente/painel/conhecimento",
      title: "Carregar base de conhecimento",
      description: "Cadastre FAQ, servicos e politicas para a IA responder com contexto real do cliente.",
      badge: "kb",
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
      id: "settings",
      href: "/cliente/painel/configuracoes",
      title: "Governanca do tenant",
      description: hasCompanyProfile && hasCompanyContact
        ? hasBusinessMode
          ? `Perfil, contato e modo ${businessProfile.label} configurados para o tenant.`
          : "Perfil e contato configurados, mas ainda sem um modo de negocio definido."
        : "Ainda faltam dados basicos de empresa e contato para go-live.",
      status: hasCompanyProfile && hasCompanyContact && hasBusinessMode ? "ready" : "partial",
      badge: hasBusinessMode ? businessProfile.label : "completar perfil",
      tone: hasCompanyProfile && hasCompanyContact && hasBusinessMode ? "success" : "warning",
    },
    {
      id: "inbox",
      href: "/cliente/painel/inbox",
      title: "Inbox omnichannel",
      description:
        activeUsers > 0 && (operationalChannels > 0 || activeForms > 0) && hasSla
          ? "A operacao ja consegue receber, distribuir e responder conversas."
          : "Ainda faltam pessoas, canal ou SLA para operar atendimento com seguranca.",
      status: activeUsers > 0 && (operationalChannels > 0 || activeForms > 0) && hasSla ? "ready" : "partial",
      badge: `${activeBacklog} em fila`,
      tone: activeBacklog > 0 ? "info" : statusToTone(activeUsers > 0 && (operationalChannels > 0 || activeForms > 0) && hasSla ? "ready" : "partial"),
    },
    {
      id: "crm",
      href: "/cliente/painel/crm",
      title: "CRM e follow-up",
      description:
        activeUsers > 0
          ? "Leads, tarefas, notas e timeline ja podem ser operados pelo tenant."
          : "Adicione pelo menos um usuario para operar CRM e follow-ups.",
      status: activeUsers > 0 ? "ready" : "pending",
      badge: activeUsers > 0 ? "operavel" : "sem equipe",
      tone: activeUsers > 0 ? "success" : "neutral",
    },
    {
      id: "agenda",
      href: "/cliente/painel/agenda",
      title: "Agenda comercial",
      description:
        appointments.length > 0
          ? "Reunioes e agendamentos ja podem ser operados no workspace do tenant."
          : "Ainda nao ha agenda operacional configurada para leads e reunioes.",
      status: appointments.length > 0 ? "ready" : "partial",
      badge: `${appointments.length} agenda(s)`,
      tone: appointments.length > 0 ? "success" : "warning",
    },
    {
      id: "pipeline",
      href: "/cliente/painel/pipeline",
      title: "Pipeline comercial",
      description:
        hasDefaultTeam
          ? "Funil pronto para organizar e mover oportunidades entre etapas."
          : "Defina time padrao e regras operacionais para consolidar ownership do funil.",
      status: hasDefaultTeam ? "ready" : "partial",
      badge: statusToBadge(hasDefaultTeam ? "ready" : "partial"),
      tone: statusToTone(hasDefaultTeam ? "ready" : "partial"),
    },
    {
      id: "commercial",
      href: "/cliente/painel/comercial",
      title: "Comercial e receita",
      description:
        activeUsers > 0
          ? "Propostas e financeiro comercial ja podem ser operados com ownership."
          : "Depende de equipe ativa para registrar propostas e receita.",
      status: activeUsers > 0 ? "ready" : "pending",
      badge: statusToBadge(activeUsers > 0 ? "ready" : "pending"),
      tone: statusToTone(activeUsers > 0 ? "ready" : "pending"),
    },
    {
      id: "ai",
      href: "/cliente/painel/ia",
      title: "IA de atendimento",
      description:
        aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs > 0
          ? "Agente com handoff, guardrails e base de conhecimento suficientes para piloto."
          : "Ainda faltam elementos de seguranca e contexto para confiar no autopilot.",
      status: aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs > 0 ? "ready" : aiEnabled || knowledgeDocs > 0 ? "partial" : "pending",
      badge: aiEnabled ? `${guardrails.length} guardrails` : "IA pausada",
      tone: aiEnabled && hasAiOwner && guardrails.length > 0 && knowledgeDocs > 0 ? "success" : aiEnabled ? "warning" : "neutral",
    },
    {
      id: "automations",
      href: "/cliente/painel/automacoes",
      title: "AutomaÃ§Ãµes",
      description:
        activeAutomations > 0
          ? "Ja existem playbooks publicados para reduzir trabalho manual."
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
        knowledgeDocs > 0
          ? "A IA ja tem documentos do negocio para consultas e respostas."
          : "Ainda nao ha documentos cadastrados para orientar respostas e handoffs.",
      status: knowledgeDocs > 0 ? "ready" : "pending",
      badge: `${knowledgeDocs} doc(s)`,
      tone: knowledgeDocs > 0 ? "success" : "neutral",
    },
    {
      id: "capture",
      href: "/cliente/painel/captacao",
      title: "CaptaÃ§Ã£o",
      description:
        activeForms > 0
          ? "Ja existem formularios ativos para alimentar o topo de funil."
          : "Nenhum formulario ativo para publicar no site ou landing pages.",
      status: activeForms > 0 ? "ready" : "partial",
      badge: `${activeForms} formulario(s)`,
      tone: activeForms > 0 ? "success" : "warning",
    },
    {
      id: "channels",
      href: "/cliente/painel/configuracoes/canais",
      title: "Conectores",
      description:
        activeChannels > 0
          ? "O tenant ja possui conectores ativos para atendimento ou captacao."
          : "Ainda nao ha conectores ativos para operar canais externos.",
      status: activeChannels > 0 ? "ready" : "partial",
      badge: `${activeChannels} ativo(s)`,
      tone: activeChannels > 0 ? "success" : "warning",
    },
  ];

  const insights = [
    {
      id: "pilot",
      title: pilotReady ? "Tenant apto para piloto controlado" : "Tenant ainda precisa de fechamento operacional",
      description: pilotReady
        ? "A base minima de empresa, atendimento, IA e entrada de demanda ja esta pronta para um cliente piloto."
        : "Use os bloqueios abaixo para fechar setup, ownership e cobertura da IA antes do go-live.",
    },
    {
      id: "business_mode",
      title: `Modo de negocio ativo: ${businessProfile.label}`,
      description: hasBusinessMode
        ? `A operacao esta alinhada ao perfil ${businessProfile.label.toLowerCase()}, com foco em ${businessProfile.commercialMotion}.`
        : "Ainda vale escolher um modo principal para acelerar IA, CRM e playbooks do tenant.",
    },
    {
      id: "ops",
      title: "Fluxo da operacao",
      description: `Distribuicao em modo ${inboxRules.mode || "manual"} com SLA de ${inboxRules.defaultResponseSlaMinutes || 15} minutos.`,
    },
    {
      id: "load",
      title: "Carga do tenant",
      description:
        activeBacklog > 0
          ? `${activeBacklog} conversa(s) abertas exigem monitoramento de fila, takeover e follow-up.`
          : "Sem backlog aberto neste momento; bom momento para revisar setup e automacoes.",
    },
  ];

  const nextBuildItems: TenantReadinessItem[] = [
  ];

  return {
    tenantId,
    settings: {
      name: clean(settings?.name, 180),
      niche: clean(settings?.niche, 120),
      businessProfileId,
      phone: clean(settings?.phone, 40),
      website: clean(settings?.website, 180),
      inboxRules,
    },
    summary,
    blockers: blockers.slice(0, 6),
    modules,
    insights,
    nextBuildItems,
  };
}


