import nextEnv from "@next/env";
import process from "node:process";

nextEnv.loadEnvConfig(process.cwd());

const SEED_ID = "altum_video_demo_v1";
const DEFAULT_TENANT_ID = "clinica-aurora-prime";
const DEFAULT_EMAIL = "marina@clinicaauroraprime.com.br";
const DEFAULT_PASSWORD = "AuroraPrime2026!";
let Timestamp;

const MODULES = {
  crm: true,
  inbox: true,
  whatsapp: true,
  instagram: true,
  ai: true,
  automation: true,
  marketing: true,
  commerce: true,
  reports: true,
  social_automation: true,
  assisted_meetings: true,
  calls: true,
};

const LIMITS = {
  users: 10,
  whatsappChannels: 2,
  contacts: 30000,
  messagesPerMonth: 60000,
  aiRunsPerMonth: 3000,
  automationsPerMonth: 20000,
  storageMb: 20000,
};

const COLLECTIONS_WITH_DEMO_ROWS = [
  "tenants",
  "clientes",
  "tenant_settings",
  "tenant_entitlements",
  "client_portal_users",
  "tenant_users",
  "users",
  "tenant_channels",
  "leads",
  "contacts",
  "chats",
  "messages",
  "chat_state",
  "chat_notes",
  "lead_notes",
  "lead_tasks",
  "appointments",
  "assisted_meetings",
  "meeting_bot_sessions",
  "kb_docs",
  "automations",
  "jobs",
  "metrics",
  "ai_logs",
  "ai_usage_ledger",
  "capture_forms",
  "capture_submissions",
  "campaign_snapshots",
  "ad_creative_snapshots",
  "google_ads_operator_reports",
  "meta_ads_operator_reports",
  "growth_tracking_configs",
  "growth_events",
  "growth_segments",
  "outbound_campaigns",
  "outbound_campaign_runs",
  "outbound_campaign_deliveries",
  "orcamentos",
  "financeiro",
  "ecommerce_connections",
  "ecommerce_products",
  "ecommerce_orders",
  "ecommerce_abandoned_carts",
  "ecommerce_events",
  "ecommerce_commercial_actions",
  "ai_internal_notifications",
  "mcp_action_drafts",
  "daily_reports",
  "client_contracts",
  "audit_logs",
  "pipeline",
];

function parseArgs(argv) {
  const args = {
    apply: false,
    clean: true,
    tenantId: DEFAULT_TENANT_ID,
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.apply = true;
      continue;
    }
    if (token === "--no-clean") {
      args.clean = false;
      continue;
    }
    if (token === "--tenant" || token === "--tenantId") {
      args.tenantId = String(argv[index + 1] || "").trim() || args.tenantId;
      index += 1;
      continue;
    }
    if (token === "--email") {
      args.email = String(argv[index + 1] || "").trim() || args.email;
      index += 1;
      continue;
    }
    if (token === "--password") {
      args.password = String(argv[index + 1] || "").trim() || args.password;
      index += 1;
    }
  }

  return args;
}

async function initFirebase() {
  const [{ cert, getApps, initializeApp }, { getAuth }, firestore] = await Promise.all([
    import("firebase-admin/app"),
    import("firebase-admin/auth"),
    import("firebase-admin/firestore"),
  ]);
  const { getFirestore } = firestore;
  Timestamp = firestore.Timestamp;

  if (getApps().length) {
    return { auth: getAuth(), db: getFirestore() };
  }

  const rawCredential = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawCredential) {
    const credential = JSON.parse(rawCredential);
    initializeApp({
      credential: cert({
        projectId: credential.project_id,
        clientEmail: credential.client_email,
        privateKey: String(credential.private_key || "").replace(/\\n/g, "\n"),
      }),
    });
    return { auth: getAuth(), db: getFirestore() };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error("Configure FIREBASE_SERVICE_ACCOUNT_KEY ou NEXT_PUBLIC_FIREBASE_PROJECT_ID.");
  }

  initializeApp({ projectId });
  return { auth: getAuth(), db: getFirestore() };
}

function daysAgo(days, hour = 12) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return Timestamp.fromDate(date);
}

function daysFromNow(days, hour = 10) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return Timestamp.fromDate(date);
}

function isoFromNow(days, hour = 10) {
  return daysFromNow(days, hour).toDate().toISOString();
}

function dateKey(days = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dueDate(days = 0) {
  return dateKey(days);
}

function seedMeta(tenantId) {
  return {
    tenantId,
    demoSeedId: SEED_ID,
    isDemoData: true,
    seededAt: Timestamp.now(),
  };
}

function seededDoc(tenantId, data) {
  return {
    ...seedMeta(tenantId),
    ...data,
  };
}

function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(seed)}`;
}

async function ensureAuthUser(auth, { email, password, displayName }) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      displayName,
      password,
      emailVerified: true,
      disabled: false,
    });
    return existing.uid;
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    const created = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
    return created.uid;
  }
}

function buildTeam(ownerUid, email) {
  return [
    {
      id: ownerUid,
      name: "Marina Costa",
      email,
      role: "client_owner",
      team: "Gestao",
      availability: "online",
      capabilities: [
        "view_metrics",
        "view_team_records",
        "respond_inbox",
        "edit_leads",
        "manage_pipeline",
        "manage_commercial",
        "manage_ai",
        "manage_automations",
        "manage_channels",
        "manage_personal_channel",
        "manage_users",
        "manage_settings",
      ],
    },
    {
      id: "demo-user-atendimento",
      name: "Rafaela Lima",
      email: "rafaela@clinicaauroraprime.com.br",
      role: "client_agent",
      team: "Atendimento",
      availability: "online",
      capabilities: ["view_metrics", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial"],
    },
    {
      id: "demo-user-comercial",
      name: "Diego Nunes",
      email: "diego@clinicaauroraprime.com.br",
      role: "client_agent",
      team: "Comercial",
      availability: "busy",
      capabilities: ["view_metrics", "respond_inbox", "edit_leads", "manage_pipeline", "manage_commercial"],
    },
    {
      id: "demo-user-gestor",
      name: "Camila Torres",
      email: "camila@clinicaauroraprime.com.br",
      role: "client_admin",
      team: "Gestao comercial",
      availability: "online",
      capabilities: [
        "view_metrics",
        "view_team_records",
        "respond_inbox",
        "edit_leads",
        "manage_pipeline",
        "manage_commercial",
        "manage_ai",
        "manage_automations",
        "manage_channels",
        "manage_users",
        "manage_settings",
      ],
    },
  ];
}

function buildPipelineStages(team) {
  return [
    { id: "captado", label: "Novo lead", description: "Entradas recentes para triagem.", color: "#2563eb", position: 0, slaHours: 2, followUpHours: 2, ownerUserId: team[1].id, ownerName: team[1].name },
    { id: "contato", label: "Contato iniciado", description: "Primeira resposta em andamento.", color: "#0ea5e9", position: 1, slaHours: 6, followUpHours: 4, ownerUserId: team[1].id, ownerName: team[1].name },
    { id: "qualificacao", label: "Qualificacao", description: "Descoberta de perfil, urgencia e valor.", color: "#10b981", position: 2, slaHours: 18, followUpHours: 8, ownerUserId: team[2].id, ownerName: team[2].name },
    { id: "proposta", label: "Proposta", description: "Oferta enviada ou em montagem.", color: "#f59e0b", position: 3, slaHours: 36, followUpHours: 18, ownerUserId: team[2].id, ownerName: team[2].name },
    { id: "fechamento", label: "Fechamento", description: "Negociacao final e decisao.", color: "#f97316", position: 4, slaHours: 24, followUpHours: 12, ownerUserId: team[3].id, ownerName: team[3].name },
    { id: "ganho", label: "Ganho", description: "Venda concluida.", color: "#22c55e", position: 5, isTerminal: true, slaHours: null, followUpHours: null },
    { id: "perdido", label: "Perdido", description: "Sem fit ou sem resposta.", color: "#ef4444", position: 6, isTerminal: true, slaHours: null, followUpHours: null },
  ];
}

function buildLeads(tenantId, team) {
  const sourceMap = [
    ["Meta Ads", "meta", "paid_social", "Meta - Avaliacao Premium", "channel-meta-ads-demo"],
    ["Google Ads", "google", "cpc", "Google - Alta Intencao", "channel-google-ads-demo"],
    ["Instagram", "instagram", "social", "Instagram Direct - Harmonizacao", "channel-instagram-demo"],
    ["WhatsApp", "whatsapp", "organic", "Reativacao VIP WhatsApp", "channel-whatsapp-demo"],
    ["Formulario", "site", "form", "LP avaliacao facial", "site-chat"],
    ["Indicacao", "referral", "referral", "Clientes indicaram", "manual"],
  ];
  const firstNames = [
    "Ana Paula", "Bruno", "Carla", "Daniel", "Elisa", "Fabio", "Gabriela", "Henrique",
    "Isabela", "Joao Pedro", "Karina", "Lucas", "Mariana", "Nathalia", "Otavio", "Patricia",
    "Renato", "Sofia", "Tatiane", "Vinicius", "Beatriz", "Caio", "Debora", "Eduardo",
    "Fernanda", "Gustavo", "Helena", "Igor", "Juliana", "Leandro", "Mirela", "Nelson",
    "Priscila", "Rafael", "Simone", "Tiago", "Vanessa", "Wagner", "Yasmin", "Andre",
    "Bianca", "Cesar", "Diana", "Erick", "Flavia", "Giovana", "Hugo", "Larissa",
    "Marcelo", "Nicole", "Paulo", "Quiteria", "Roberta", "Samuel", "Thais", "Ursula",
    "Vitor", "Zelia", "Aline", "Bernardo", "Claudia", "Diego", "Ester", "Felipe",
    "Greice", "Heitor", "Iara", "Jorge", "Livia", "Murilo", "Nadia", "Oscar",
    "Pamela", "Raissa", "Sandro", "Tereza", "Valeria", "William", "Alice", "Breno",
    "Cintia", "Douglas", "Elaine", "Fernando", "Geovana", "Heloisa", "Ingrid", "Jonas",
    "Leticia", "Mario", "Natalia", "Orlando", "Paula", "Rogerio",
  ];
  const lastNames = ["Mendes", "Carvalho", "Ribeiro", "Azevedo", "Moura", "Martins", "Fontes", "Sales", "Rocha", "Lima", "Lopes", "Ferreira"];
  const companies = [
    "Executiva independente", "BC Fit", "Ribeiro Arquitetura", "Azevedo Consultoria", "Clinica Sorriso",
    "Studio KL", "Loja Aura", "HS Imoveis", "IR Beauty", "JP Eventos", "MD Estetica", "NC Store",
    "Reis Odonto", "PG Premium", "RV Digital", "SA Clinic", "Neo Pilates", "Belle Forma",
  ];
  const stages = [
    ...Array(10).fill("captado"),
    ...Array(14).fill("contato"),
    ...Array(24).fill("qualificacao"),
    ...Array(16).fill("proposta"),
    ...Array(10).fill("fechamento"),
    ...Array(16).fill("ganho"),
    ...Array(4).fill("perdido"),
  ];

  return firstNames.map((firstName, index) => {
    const nome = `${firstName} ${lastNames[index % lastNames.length]}`;
    const empresa = companies[index % companies.length];
    const stage = stages[index % stages.length];
    const [sourceLabel, source, medium, campaign, channelId] = sourceMap[index % sourceMap.length];
    const hotScore = stage === "ganho" || stage === "fechamento" || index % 5 === 0;
    const heat = hotScore ? "hot" : stage === "perdido" || index % 11 === 0 ? "frio" : "morno";
    const score = stage === "ganho"
      ? 88 + (index % 10)
      : stage === "fechamento"
        ? 84 + (index % 9)
        : stage === "proposta"
          ? 74 + (index % 15)
          : stage === "qualificacao"
            ? 62 + (index % 21)
            : heat === "frio"
              ? 28 + (index % 18)
              : 50 + (index % 18);
    const value = stage === "perdido" ? 0 : 1800 + (index % 12) * 720 + (hotScore ? 2600 : 0);
    const nextAction =
      stage === "ganho" ? "Acompanhar onboarding e pedir indicacao" :
      stage === "fechamento" ? "Confirmar entrada e condicao final" :
      stage === "proposta" ? "Fazer follow-up da proposta com comparativo de valor" :
      stage === "qualificacao" ? "Validar objetivo, urgencia e melhor horario de avaliacao" :
      stage === "contato" ? "Responder duvida inicial e oferecer dois horarios" :
      stage === "perdido" ? "Registrar motivo e colocar em reativacao futura" :
      "Fazer primeira abordagem em ate 15 minutos";
    const owner = index % 3 === 0 ? team[3] : index % 2 === 0 ? team[1] : team[2];
    const createdDays = 1 + (index % 42);
    const updatedDays = index % 6;
    const id = `lead-demo-${String(index + 1).padStart(2, "0")}`;
    const photoUrl = avatarUrl(nome);
    return {
      id,
      data: seededDoc(tenantId, {
        nome,
        email: `${nome.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
        telefone: `55${index % 2 ? "21" : "11"}9${String(87000000 + index * 13791).slice(0, 8)}`,
        empresa,
        origem: sourceLabel,
        channel: source === "site" ? "site_chat" : source,
        channelId,
        sourceType: source,
        sourceLabel,
        campaignName: campaign,
        utmCampaign: campaign,
        photoUrl,
        profilePhotoUrl: photoUrl,
        contactPhotoUrl: photoUrl,
        status: stage === "ganho" ? "cliente" : stage === "perdido" ? "perdido" : "em_andamento",
        stage,
        pipelineStage: stage,
        stageUpdatedAt: daysAgo(Math.max(0, updatedDays + (stage === "fechamento" ? 3 : 0)), 11),
        ownerId: owner.id,
        owner: owner.name,
        score,
        heat,
        priority: heat === "hot" ? "high" : heat === "frio" ? "low" : "medium",
        potentialValue: value,
        tags: [sourceLabel.toLowerCase().replace(/\s+/g, "_"), heat, stage, value > 7000 ? "alto_ticket" : "padrao"],
        notes: `Origem ${sourceLabel}, campanha ${campaign}. Perfil com historico e proxima acao definidos para a equipe comercial.`,
        aiCommercialTemperature: heat === "hot" ? "quente" : heat === "frio" ? "frio" : "morno",
        aiConversationStage: stage,
        aiSignalStrength: score > 85 ? "strong" : score > 65 ? "medium" : "weak",
        aiPlannerConfidence: Math.min(0.98, score / 100),
        aiLeadSummary: `${nome} demonstrou interesse em atendimento consultivo e precisa de proximo passo claro.`,
        aiNextAction: nextAction,
        aiRecommendedOffer: value > 7000 ? "Programa completo de acompanhamento" : "Avaliacao inicial com plano guiado",
        aiResponseGoal: "avancar_etapa",
        aiDominantObjection: index % 4 === 0 ? "preco" : index % 4 === 1 ? "prazo" : "confianca",
        first_touch: { source, medium, campaign, sourceLabel },
        last_touch: { source, medium, campaign, sourceLabel },
        qualification: {
          score,
          band: score > 80 ? "A" : score > 60 ? "B" : "C",
          label: score > 80 ? "Alta prioridade" : "Acompanhar",
          recommendedStage: stage,
          nextAction,
        },
        handoff: index % 5 === 0 ? { status: "ready", reason: "Lead pediu condicao especial", createdAt: daysAgo(updatedDays, 14) } : null,
        commercialState: {
          stagePolicy: {
            slaBreached: index % 7 === 0,
            slaDueAt: isoFromNow(index % 7 === 0 ? -1 : 1, 17),
            ownerName: owner.name,
          },
          lastAiSignals: [
            { decision: "priorizar", nextAction, confidence: Math.min(0.98, score / 100) },
          ],
        },
        createdAt: daysAgo(createdDays, 9),
        updatedAt: daysAgo(updatedDays, 15),
      }),
    };
  });
}

function buildChats(tenantId, leads, team) {
  const selected = leads.slice(0, 48);
  return selected.map((lead, index) => {
    const id = `chat-demo-${String(index + 1).padStart(2, "0")}`;
    const humanOwner = index % 4 === 0 ? team[1] : null;
    const waitingClient = index % 3 === 0;
    const lastClientAt = daysAgo(index % 5, 15);
    const lastAgentAt = waitingClient ? daysAgo(index % 5, 13) : daysAgo(index % 5, 16);
    const channel = index % 6 === 2 ? "instagram" : index % 6 === 4 ? "site_chat" : "whatsapp";
    const channelId = channel === "instagram" ? "channel-instagram-demo" : channel === "site_chat" ? "site-chat" : "channel-whatsapp-demo";
    const opening = channel === "instagram"
      ? "Oi, vi o perfil de voces pelo Instagram e queria saber se consigo avaliar meu caso ainda essa semana."
      : channel === "site_chat"
        ? "Entrei pela pagina de avaliacao e quero entender valores, prazo e como funciona o acompanhamento."
        : "Oi, recebi a mensagem de voces no WhatsApp e queria continuar o atendimento.";
    const objection = index % 5 === 0
      ? "Meu ponto e investimento. Quero entender se faz sentido antes de marcar."
      : index % 5 === 1
        ? "Tenho medo de prometerem algo que nao da para cumprir. Como voces conduzem isso?"
        : index % 5 === 2
          ? "Preciso decidir rapido, mas queria falar com alguem antes."
          : index % 5 === 3
            ? "Posso parcelar e comecar ainda este mes?"
            : "Quero comparar o plano avulso com acompanhamento completo.";
    const sellerAnswer = index % 2 === 0
      ? "Faz sentido. A Aurora trabalha com avaliacao antes de qualquer indicacao. Eu posso reservar dois horarios e depois te mando uma proposta clara, sem promessa irreal."
      : "Perfeito. Vou te explicar por etapas: primeiro avaliacao, depois plano recomendado, condicoes e acompanhamento. Assim voce decide com seguranca.";
    return {
      id,
      data: seededDoc(tenantId, {
        leadId: lead.id,
        contactName: lead.data.nome,
        contactCompany: lead.data.empresa,
        contactPhone: lead.data.telefone,
        contactPhotoUrl: lead.data.contactPhotoUrl,
        profilePhotoUrl: lead.data.profilePhotoUrl,
        photoUrl: lead.data.photoUrl,
        channel,
        channelId,
        sourceLabel: lead.data.sourceLabel,
        campaignName: lead.data.campaignName,
        origem: lead.data.origem,
        status: index % 6 === 0 ? "pending" : index % 8 === 0 ? "resolved" : "open",
        queueStatus: waitingClient ? "assigned_waiting" : "assigned",
        assignedTo: humanOwner?.id || lead.data.ownerId,
        assignedToName: humanOwner?.name || lead.data.owner,
        priority: lead.data.priority,
        lastClientMessageAt: lastClientAt,
        lastAgentMessageAt: lastAgentAt,
        lastMessageTime: waitingClient ? lastClientAt : lastAgentAt,
        slaDueAt: index % 5 === 0 ? daysFromNow(-1, 18) : daysFromNow(1, 18),
        lastMessage: waitingClient
          ? objection
          : "Perfeito, deixei os proximos passos registrados e te envio o resumo agora.",
        unreadCount: waitingClient ? 2 : 0,
        createdAt: daysAgo(index + 2, 10),
        updatedAt: waitingClient ? lastClientAt : lastAgentAt,
      }),
      messages: [
        { sender: "client", text: opening, createdAt: daysAgo(index + 1, 9) },
        { sender: "agent", senderId: lead.data.ownerId, text: `Oi, ${String(lead.data.nome).split(" ")[0]}. Vi que voce veio por ${lead.data.sourceLabel} na campanha ${lead.data.campaignName}. O objetivo e avaliacao, procedimento pontual ou acompanhamento?`, createdAt: daysAgo(index + 1, 9.15) },
        { sender: "client", text: "Meu objetivo e melhorar resultado sem fazer algo exagerado. Tambem quero previsibilidade de prazo e valores.", createdAt: daysAgo(index + 1, 9.5) },
        { sender: "assistant", text: "Resumo Altum: lead pede seguranca, prazo e faixa de investimento. Sinal comercial bom; sugerir avaliacao guiada e opcao premium.", createdAt: daysAgo(index + 1, 9.55) },
        { sender: "agent", senderId: lead.data.ownerId, text: sellerAnswer, createdAt: daysAgo(index + 1, 10) },
        { sender: "client", text: objection, createdAt: daysAgo(index, 11.1) },
        { sender: "agent", senderId: lead.data.ownerId, text: "Combinado. Para te orientar sem chute: o plano de entrada parte da avaliacao, e o acompanhamento completo costuma ficar entre R$ 4 mil e R$ 12 mil conforme escopo. Posso separar uma opcao conservadora e uma completa.", createdAt: daysAgo(index, 11.25) },
        { sender: "client", text: "Pode mandar as duas. Se fizer sentido, ja deixo um horario reservado.", createdAt: daysAgo(index, 12) },
        { sender: "assistant", text: `Proxima melhor acao: ${lead.data.aiNextAction}. Temperatura: ${lead.data.aiCommercialTemperature}.`, createdAt: daysAgo(index, 12.05) },
        { sender: waitingClient ? "client" : "agent", senderId: waitingClient ? "" : lead.data.ownerId, text: waitingClient ? objection : "Perfeito, deixei os proximos passos registrados e te envio o resumo agora.", createdAt: waitingClient ? lastClientAt : lastAgentAt },
      ],
      state: seededDoc(tenantId, {
        chatId: id,
        aiEnabled: index % 4 !== 0,
        pausedUntil: index % 4 === 0 ? daysFromNow(1, 20) : null,
        humanOwnerUserId: humanOwner?.id || null,
        updatedByName: humanOwner?.name || "Assistente Altum",
        pauseReason: humanOwner ? "Negociacao sensivel em atendimento humano" : null,
        lastJobStatus: index % 7 === 0 ? "retrying" : "done",
        lastDecision: waitingClient ? "handoff" : "respond",
        lastDecisionReason: waitingClient ? "Lead pediu condicao comercial" : "Resposta dentro do playbook",
        lastProcessedAt: daysAgo(index % 3, 16),
        updatedAt: daysAgo(index % 3, 16),
      }),
    };
  });
}

function buildRows(tenantId, ownerUid, email) {
  const team = buildTeam(ownerUid, email);
  const stages = buildPipelineStages(team);
  const leads = buildLeads(tenantId, team);
  const chats = buildChats(tenantId, leads, team);
  const channels = [
    ["channel-whatsapp-demo", { type: "whatsapp", provider: "evolution", displayName: "WhatsApp Comercial", status: "active", connectionStatus: "connected", phoneNumber: "+55 11 98765-4300", channelScope: "shared", distributionEnabled: true, metadata: { gatewayEndpoint: "https://api.clinicaauroraprime.com.br/evolution" }, lastHealthCheckAt: daysAgo(0, 8) }],
    ["channel-instagram-demo", { type: "instagram", provider: "meta", displayName: "Instagram @clinicaauroraprime", status: "active", connectionStatus: "connected", username: "clinicaauroraprime", pageId: "ig-page-aurora-prime", externalAccountId: "17841400000000000", channelScope: "shared", lastSyncAt: daysAgo(0, 9) }],
    ["channel-meta-ads-demo", { type: "meta_ads", provider: "meta", displayName: "Meta Ads - Aurora", status: "active", connectionStatus: "connected", externalAccountId: "act_123456789", accountLabel: "Aurora Performance", lastSyncAt: daysAgo(0, 7) }],
    ["channel-google-ads-demo", { type: "google_ads", provider: "google", displayName: "Google Ads - Aurora", status: "active", connectionStatus: "connected", externalAccountId: "9876543210", accountLabel: "Aurora Search", lastSyncAt: daysAgo(0, 7) }],
  ];

  const kbDocs = [
    ["kb-procedimento-premium", { type: "catalog", productName: "Programa Aurora Premium", productCategory: "Estetica avancada", serviceKey: "aurora_premium", targetProfile: "Clientes que querem acompanhamento completo", priceFrom: 4800, priceTo: 12800, priority: 1, availability: "active", tags: ["produto", "premium"], content: "Programa consultivo com avaliacao, planejamento, acompanhamento e retornos mensais. Ideal para clientes de alto valor." }],
    ["kb-avaliacao", { type: "catalog", productName: "Avaliacao facial guiada", productCategory: "Entrada", serviceKey: "avaliacao_facial", targetProfile: "Novo lead que ainda precisa entender fit", priceFrom: 290, priceTo: 490, priority: 2, availability: "active", tags: ["produto", "entrada"], content: "Avaliacao inicial com diagnostico, expectativa realista e indicacao de plano." }],
    ["kb-pos-venda", { type: "policy", tags: ["politica", "pos-venda"], content: "Todo cliente recebe check-in em 2 dias, retorno em 15 dias e acompanhamento comercial em 30 dias." }],
    ["kb-objecoes", { type: "faq", tags: ["faq", "objeções"], content: "Quando o lead questionar preco, explique valor, seguranca, acompanhamento e opcoes de pagamento sem prometer desconto automatico." }],
    ["kb-prazos", { type: "faq", tags: ["faq", "agenda"], content: "Prazos de atendimento variam por agenda. A equipe deve oferecer dois horarios objetivos e confirmar canal preferencial." }],
    ["kb-clube-vip", { type: "catalog", productName: "Clube Aurora VIP", productCategory: "Recorrencia", serviceKey: "clube_vip", targetProfile: "Clientes ganhos com potencial de recompra", priceFrom: 590, priceTo: 1290, priority: 3, availability: "active", tags: ["produto", "recorrencia"], content: "Assinatura de acompanhamento, beneficios, prioridade na agenda e ofertas de manutencao." }],
    ["kb-noivas", { type: "catalog", productName: "Jornada Noivas Aurora", productCategory: "Campanha sazonal", serviceKey: "jornada_noivas", targetProfile: "Noivas com data marcada entre 60 e 180 dias", priceFrom: 3900, priceTo: 9800, priority: 4, availability: "seasonal", tags: ["produto", "sazonal"], content: "Pacote com planejamento por etapas, check-ins e acompanhamento ate a semana do evento." }],
    ["kb-corporativo", { type: "catalog", productName: "Programa Corporativo Bem-estar", productCategory: "B2B", serviceKey: "corporativo", targetProfile: "Empresas que compram pacotes para executivos", priceFrom: 12000, priceTo: 28000, priority: 5, availability: "active", tags: ["produto", "b2b"], content: "Contrato consultivo para grupos pequenos com agenda reservada, relatorio e acompanhamento." }],
    ["kb-pagamento", { type: "policy", tags: ["politica", "pagamento"], content: "Entradas podem ser feitas por Pix ou cartao. Parcelamentos acima de seis vezes exigem aprovacao do gestor comercial." }],
    ["kb-desconto", { type: "policy", tags: ["politica", "desconto"], content: "Descontos nao sao oferecidos automaticamente. O time deve priorizar valor percebido, bonus e condicoes de entrada." }],
    ["kb-reembolso", { type: "policy", tags: ["politica", "cancelamento"], content: "Cancelamentos seguem contrato e agenda. Sempre escalar casos sensiveis para gestor antes de confirmar." }],
    ["kb-avaliacao-perguntas", { type: "faq", tags: ["faq", "qualificacao"], content: "Perguntas obrigatorias: objetivo principal, prazo desejado, historico anterior, restricoes, orcamento aproximado e melhor canal de contato." }],
    ["kb-seguranca", { type: "faq", tags: ["faq", "seguranca"], content: "Responder duvidas de seguranca explicando processo, avaliacao previa, acompanhamento e limites realistas." }],
    ["kb-upsell", { type: "faq", tags: ["faq", "upsell"], content: "Quando o cliente fechar avaliacao, sugerir acompanhamento premium apenas se houver fit, urgencia e expectativa alinhada." }],
  ];

  const automations = [
    ["automation-hot-lead", { name: "Lead quente sem resposta", description: "Alerta gestor quando lead quente fica 30 minutos sem retorno.", trigger: "chat_waiting_reply", status: "active", enabled: true, actions: ["notify_owner", "create_task"], runsLast7Days: 42 }],
    ["automation-followup-proposta", { name: "Follow-up de proposta", description: "Cria tarefa dois dias apos proposta enviada.", trigger: "proposal_sent", status: "active", enabled: true, actions: ["create_task", "whatsapp_template"], runsLast7Days: 18 }],
    ["automation-carrinho", { name: "Recuperacao de carrinho", description: "Envia mensagem consultiva para carrinho abandonado.", trigger: "abandoned_cart", status: "active", enabled: true, actions: ["send_template"], runsLast7Days: 27 }],
    ["automation-recompra", { name: "Reativacao 30 dias", description: "Segmenta clientes ganhos para recompra e upsell.", trigger: "won_lead_30_days", status: "active", enabled: true, actions: ["segment", "campaign"], runsLast7Days: 9 }],
    ["automation-indicacao", { name: "Pedido de indicacao", description: "Pede indicacao apos venda concluida com alta satisfacao.", trigger: "won_lead_7_days", status: "active", enabled: true, actions: ["whatsapp_template", "create_task"], runsLast7Days: 14 }],
    ["automation-no-show", { name: "Recuperar no-show", description: "Reagenda automaticamente clientes que faltaram.", trigger: "appointment_no_show", status: "active", enabled: true, actions: ["send_template", "notify_owner"], runsLast7Days: 6 }],
    ["automation-captacao-form", { name: "Formulario de captacao", description: "Cria lead, pontua e distribui por origem.", trigger: "capture_form_submitted", status: "active", enabled: true, actions: ["score_lead", "assign_owner"], runsLast7Days: 51 }],
    ["automation-vip", { name: "Cliente VIP sem retorno", description: "Alerta gestor quando cliente VIP fica sem proximo passo.", trigger: "vip_inactive", status: "active", enabled: true, actions: ["notify_manager", "create_task"], runsLast7Days: 11 }],
  ];

  const rows = [];
  const add = (collection, id, data) => rows.push({ collection, id, data: seededDoc(tenantId, data) });

  add("tenants", tenantId, {
    name: "Clinica Aurora Prime",
    clientId: tenantId,
    legacyClientId: tenantId,
    status: "active",
    billingStatus: "active",
    billingProvider: "asaas",
    platformPlan: "escala",
    accessStatus: "active",
    monthlyValue: 1197,
    signupSource: "assisted_sales",
    ownerName: team[0].name,
    ownerEmail: team[0].email,
    createdAt: daysAgo(75, 9),
    updatedAt: Timestamp.now(),
  });
  add("clientes", tenantId, {
    nome: "Clinica Aurora Prime",
    empresa: "Clinica Aurora Prime",
    email,
    telefone: "+55 11 98765-4300",
    segmento: "Clinica de estetica",
    status: "ativo",
    tenantId,
    createdAt: daysAgo(75, 9),
    updatedAt: Timestamp.now(),
  });
  add("tenant_settings", tenantId, {
    tenantId,
    name: "Clinica Aurora Prime",
    niche: "Clinica de estetica premium",
    ownerName: team[0].name,
    contactName: "Marina",
    timezone: "America/Sao_Paulo",
    businessHours: "Segunda a sexta, 08h as 19h; sabado, 09h as 13h",
    businessProfileId: "clinic",
    pipelineStages: stages,
    ai: {
      enabled: true,
      toneOfVoice: "consultivo, humano e objetivo",
      businessSummary: "Clinica de estetica premium que vende avaliacao, procedimentos e programas de acompanhamento.",
      objective: "Qualificar leads, reduzir tempo de resposta e aumentar agendamentos.",
      responsiblePhone: "+5511987654300",
      handoffNotifyEnabled: true,
      handoffNotifyPhones: ["+5511987654300"],
      guardrails: [
        "Nao prometer resultado estetico garantido.",
        "Nao dar orientacao medica fora da avaliacao.",
        "Encaminhar negociacao sensivel para humano.",
      ],
      mandatoryQuestions: ["Qual objetivo principal?", "Ja realizou procedimento antes?", "Qual melhor horario para avaliacao?"],
      escalationTopics: ["reclamacao", "risco medico", "desconto fora da politica", "cancelamento"],
      operatingProfile: {
        tier: "premium",
        autonomyMode: "hybrid",
        reasoningLevel: "balanced",
        responseStyle: "premium_sales",
        allowPremiumModels: true,
        preferredProviders: ["openai"],
        monthlyBudgetUsd: 180,
        monthlyUsageCap: 3000,
      },
    },
    ecommerce: {
      enabled: true,
      abandonedCartAutomation: true,
      orderFollowUpEnabled: true,
    },
    onboarding: {
      phase: "F4",
      status: "Concluido",
      goLiveAt: daysAgo(42, 10),
      checklist: {
        businessProfile: true,
        channels: true,
        ai: true,
        automations: true,
        campaigns: true,
        reports: true,
      },
    },
    updatedAt: Timestamp.now(),
  });
  add("tenant_entitlements", tenantId, {
    version: 1,
    tenantId,
    mode: "custom",
    modules: MODULES,
    limits: LIMITS,
    isLegacyFallback: false,
    entitlementSource: "video_demo_seed",
    updatedAt: Timestamp.now(),
    updatedBy: ownerUid,
    updatedByName: team[0].name,
  });
  add("client_portal_users", ownerUid, {
    uid: ownerUid,
    email,
    name: team[0].name,
    tenantId,
    clientId: tenantId,
    tenantName: "Clinica Aurora Prime",
    clientName: "Clinica Aurora Prime",
    role: "client_owner",
    status: "active",
    createdAt: daysAgo(75, 9),
    updatedAt: Timestamp.now(),
  });
  for (const member of team) {
    add("users", member.id, { uid: member.id, email: member.email, name: member.name, role: member.role, status: "active", tenantId, updatedAt: Timestamp.now() });
    add("tenant_users", `${tenantId}_${member.id}`, {
      tenantId,
      userId: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
      status: "active",
      isDefault: member.id === ownerUid,
      team: member.team,
      availability: member.availability,
      capabilities: member.capabilities,
      capabilitiesConfigured: true,
      createdAt: daysAgo(75, 10),
      updatedAt: Timestamp.now(),
    });
  }
  add("pipeline", tenantId, { tenantId, stages, updatedAt: Timestamp.now() });

  for (const [id, data] of channels) add("tenant_channels", id, { ...data, createdAt: daysAgo(50, 9), updatedAt: Timestamp.now() });
  for (const lead of leads) {
    add("leads", lead.id, lead.data);
    add("contacts", `contact-${lead.id}`, {
      phone: lead.data.telefone,
      leadId: lead.id,
      name: lead.data.nome,
      company: lead.data.empresa,
      photoUrl: lead.data.photoUrl,
      updatedAt: lead.data.updatedAt,
    });
  }
  for (const chat of chats) {
    add("chats", chat.id, chat.data);
    add("chat_state", `state-${chat.id}`, chat.state);
    chat.messages.forEach((message, index) => {
      add("messages", `${chat.id}-msg-${index + 1}`, {
        chatId: chat.id,
        leadId: chat.data.leadId,
        channel: chat.data.channel,
        sender: message.sender,
        senderId: message.senderId || null,
        text: message.text,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
      });
    });
  }

  leads.slice(0, 48).forEach((lead, index) => {
    add("lead_tasks", `task-demo-${index + 1}`, {
      leadId: lead.id,
      leadName: lead.data.nome,
      title: index % 3 === 0 ? "Fazer follow-up comercial" : index % 3 === 1 ? "Confirmar horario de avaliacao" : "Enviar resumo da proposta",
      status: index % 5 === 0 ? "done" : "pending",
      priority: lead.data.priority,
      dueAt: index % 4 === 0 ? daysFromNow(-1, 18) : daysFromNow((index % 6) + 1, 17),
      ownerUserId: lead.data.ownerId,
      ownerName: lead.data.owner,
      createdAt: daysAgo(index + 1, 9),
      updatedAt: daysAgo(index % 3, 12),
    });
    add("lead_notes", `note-demo-${index + 1}`, {
      leadId: lead.id,
      authorId: lead.data.ownerId,
      authorName: lead.data.owner,
      text: `Nota de apresentacao: lead em ${lead.data.pipelineStage}, proxima acao: ${lead.data.aiNextAction}.`,
      createdAt: daysAgo(index % 8, 14),
    });
  });

  leads.slice(0, 28).forEach((lead, index) => {
    add("appointments", `appt-demo-${index + 1}`, {
      leadId: lead.id,
      leadName: lead.data.nome,
      leadCompany: lead.data.empresa,
      title: index % 2 === 0 ? "Avaliacao comercial" : "Reuniao de proposta",
      type: index % 2 === 0 ? "avaliacao" : "reuniao",
      status: index < 8 ? "completed" : index < 14 ? "confirmed" : index % 9 === 0 ? "no_show" : "scheduled",
      startAt: isoFromNow((index % 18) - 6, 8 + (index % 10)),
      endAt: isoFromNow((index % 18) - 6, 9 + (index % 10)),
      location: index % 2 === 0 ? "Google Meet" : "Clinica Aurora Prime",
      meetingUrl: "https://meet.google.com/aurora-prime",
      notes: "Agenda confirmada com origem, responsavel e proximos passos registrados.",
      ownerUserId: lead.data.ownerId,
      ownerName: lead.data.owner,
      createdAt: daysAgo(index + 5, 10),
      updatedAt: daysAgo(index % 2, 12),
    });
  });

  leads.slice(0, 8).forEach((lead, index) => {
    add("assisted_meetings", `meeting-demo-${index + 1}`, {
      appointmentId: `appt-demo-${index + 1}`,
      leadId: lead.id,
      title: `Resumo da avaliacao - ${lead.data.nome}`,
      status: "completed",
      startedAt: daysAgo(index + 1, 10),
      endedAt: daysAgo(index + 1, 11),
      summary: "Lead quer plano premium, pediu seguranca, prazo e condicao de pagamento. Proximo passo: proposta com duas opcoes.",
      actionItems: ["Enviar proposta premium", "Reservar horario de retorno", "Confirmar forma de pagamento"],
      transcriptExcerpt: "O cliente reforcou urgencia e preferencia por acompanhamento com previsibilidade.",
      createdAt: daysAgo(index + 1, 11),
      updatedAt: daysAgo(index + 1, 11),
    });
  });

  kbDocs.forEach(([id, data]) => add("kb_docs", id, { ...data, createdAt: daysAgo(30, 10), updatedAt: Timestamp.now() }));
  automations.forEach(([id, data]) => add("automations", id, { ...data, createdAt: daysAgo(35, 10), updatedAt: Timestamp.now() }));

  for (let index = 0; index < 24; index += 1) {
    add("jobs", `job-ai-demo-${index + 1}`, {
      type: index % 3 === 0 ? "automation_execution" : "ai_queue_job",
      status: index % 11 === 0 ? "retrying" : index % 7 === 0 ? "pending" : "done",
      chatId: chats[index % chats.length].id,
      attempts: index % 11 === 0 ? 2 : 1,
      lastError: index % 11 === 0 ? "provider_timeout_demo" : "",
      lastReasonCode: index % 11 === 0 ? "provider_timeout" : "",
      availableAt: daysAgo(index % 5, 9),
      updatedAt: daysAgo(index % 7, 13),
      completedAt: index % 7 === 0 ? null : daysAgo(index % 6, 14),
    });
  }

  const campaigns = [
    ["meta_ads", "channel-meta-ads-demo", "act_123456789", "cmp-meta-premium", "Meta - Avaliacao Premium", 260, 8200, 210, 3],
    ["meta_ads", "channel-meta-ads-demo", "act_123456789", "cmp-ig-direct", "Instagram Direct - Harmonizacao", 180, 6100, 160, 2],
    ["google_ads", "channel-google-ads-demo", "9876543210", "cmp-google-intencao", "Google - Alta Intencao", 320, 4300, 190, 3],
    ["google_ads", "channel-google-ads-demo", "9876543210", "cmp-google-marca", "Google - Marca e Prova", 90, 2100, 80, 1],
  ];
  for (let day = 0; day < 30; day += 1) {
    campaigns.forEach(([platform, channelId, adAccountId, campaignId, campaignName, baseSpend, baseImp, baseClicks, baseLeads], index) => {
      const factor = 0.75 + ((day + index) % 7) / 12;
      add("campaign_snapshots", `snap-${campaignId}-${dateKey(-day)}`, {
        platform,
        channelId,
        adAccountId,
        accountLabel: platform === "google_ads" ? "Aurora Prime Google Ads" : "Aurora Prime Meta Ads",
        campaignId,
        campaignName,
        dateRef: dateKey(-day),
        spend: Number((baseSpend * factor).toFixed(2)),
        impressions: Math.round(baseImp * factor),
        clicks: Math.round(baseClicks * factor),
        leads: Math.round(baseLeads * factor),
        conversions: Math.max(1, Math.round((baseLeads * factor) / 3)),
        conversionValue: Math.round(baseLeads * factor * 1200),
      });
    });
  }

  add("google_ads_operator_reports", "google-operator-demo", {
    channelId: "channel-google-ads-demo",
    accountId: "9876543210",
    generatedAt: daysAgo(0, 8),
    report: {
      from: dateKey(-7),
      to: dateKey(0),
      currency: "BRL",
      totals: { campaigns: 2, activeCampaigns: 2, impressions: 44800, clicks: 1890, spend: 2870, conversions: 19, conversionValue: 45600, ctr: 4.22, cpc: 1.52, cpa: 151.05, roas: 15.89 },
      campaigns: [{ id: "cmp-google-intencao", name: "Google - Alta Intencao", status: "ENABLED", spend: 2240, conversions: 15, roas: 16.1 }],
      keywords: [{ text: "clinica estetica premium", conversions: 6 }, { text: "harmonizacao facial avaliacao", conversions: 4 }],
      searchTerms: [{ term: "preco baixo gratis", spend: 48, clicks: 22, conversions: 0 }],
      recommendations: [{ type: "negative_keyword", title: "Adicionar termos gratuitos como negativo" }],
    },
  });
  add("meta_ads_operator_reports", "meta-operator-demo", {
    channelId: "channel-meta-ads-demo",
    accountId: "act_123456789",
    generatedAt: daysAgo(0, 8),
    report: {
      totals: { campaigns: 2, spend: 3090, leads: 34, roas: 7.8 },
      campaigns: [{ id: "cmp-meta-premium", name: "Meta - Avaliacao Premium", status: "ACTIVE" }],
      adSets: [{ id: "adset-demo-1", name: "Mulheres 28-45 SP", campaignName: "Meta - Avaliacao Premium", status: "ACTIVE" }],
      recommendations: [{ type: "creative_fatigue", title: "Trocar criativo principal em 5 dias" }],
    },
  });

  add("capture_forms", "form-avaliacao-demo", {
    name: "Formulario - Avaliacao facial",
    title: "Agende sua avaliacao",
    status: "active",
    channelId: "channel-whatsapp-demo",
    fields: ["nome", "telefone", "objetivo", "horario_preferido"],
    submissionsCount: 47,
    conversionRate: 18.6,
    createdAt: daysAgo(40, 8),
    updatedAt: Timestamp.now(),
  });
  for (let index = 0; index < 80; index += 1) {
    add("capture_submissions", `submission-demo-${index + 1}`, {
      formId: "form-avaliacao-demo",
      leadId: leads[index % leads.length].id,
      name: leads[index % leads.length].data.nome,
      phone: leads[index % leads.length].data.telefone,
      source: index % 2 ? "meta_ads" : "google_ads",
      createdAt: daysAgo(index, 12),
    });
  }

  [
    [1, "Proposta Programa Aurora Premium", "Enviado", 7600],
    [3, "Plano acompanhamento anual", "Enviado", 12800],
    [4, "Contrato fechado - onboarding", "Aprovado", 9800],
    [13, "Pacote consultivo + recorrencia", "Rascunho", 10400],
    [18, "Acompanhamento premium 6 meses", "Aprovado", 11800],
    [24, "Plano avaliacao + protocolo completo", "Enviado", 6900],
    [31, "Contrato recorrente Aurora Club", "Aprovado", 15400],
    [37, "Proposta harmonizacao conservadora", "Enviado", 5400],
    [43, "Programa pos-procedimento", "Rascunho", 4200],
    [52, "Plano corporativo equipe executiva", "Enviado", 17200],
    [61, "Pacote premium familia", "Aprovado", 13600],
    [70, "Reativacao cliente VIP", "Enviado", 4800],
    [78, "Plano manutencao trimestral", "Aprovado", 8200],
    [86, "Projeto especial noivas", "Perdido", 3900],
  ].forEach(([leadIndex, title, status, total], index) => {
    const lead = leads[leadIndex % leads.length];
    const id = `budget-demo-${index + 1}`;
    add("orcamentos", id, {
      clientId: tenantId,
      clientName: "Clinica Aurora Prime",
      leadId: lead.id,
      leadName: lead.data.nome,
      leadCompany: lead.data.empresa,
      titulo: title,
      tipo: "Projeto unico",
      status,
      valorTotal: total,
      validade: dueDate(7 + index * 3),
      resumo: "Proposta consultiva com escopo, condicoes, follow-up e responsavel comercial definidos.",
      ownerId: lead.data.ownerId,
      owner: lead.data.owner,
      createdAt: daysAgo(index + 2, 10),
      updatedAt: daysAgo(index, 15),
    });
  });
  [
    [4, "Entrada contrato Aurora Premium", "Receita", "pago", 9800, -2],
    [15, "Programa premium completo", "Receita", "pago", 14200, -5],
    [18, "Acompanhamento premium 6 meses", "Receita", "pago", 11800, -8],
    [31, "Contrato recorrente Aurora Club", "Receita", "pago", 15400, -11],
    [61, "Pacote premium familia", "Receita", "pago", 13600, -14],
    [78, "Plano manutencao trimestral", "Receita", "pago", 8200, -19],
    [70, "Contrato Clube Aurora VIP", "Receita", "pago", 13200, -3],
    [3, "Parcela 1 plano anual", "Receita", "pendente", 4266.66, 3],
    [1, "Sinal proposta premium", "Receita", "em_aberto", 2600, 5],
    [24, "Proposta avaliacao + protocolo", "Receita", "em_aberto", 6900, 7],
    [52, "Plano corporativo equipe executiva", "Receita", "pendente", 17200, 10],
    [8, "Investimento Meta Ads", "Despesa", "pago", 15600, -1],
    [9, "Investimento Google Ads", "Despesa", "pago", 9800, -1],
    [10, "Criativos e producao de video", "Despesa", "pago", 4200, -6],
    [11, "Comissao equipe comercial", "Despesa", "pago", 3900, -4],
    [12, "Ferramentas e integracoes", "Despesa", "pago", 1800, -9],
  ].forEach(([leadIndex, description, type, status, amount, due], index) => {
    const id = `finance-demo-${index + 1}`;
    const lead = leads[leadIndex % leads.length];
    add("financeiro", id, {
      clientId: tenantId,
      clientName: "Clinica Aurora Prime",
      leadId: lead.id,
      leadName: lead.data.nome,
      ownerId: lead.data.ownerId,
      owner: lead.data.owner,
      descricao: description,
      valor: amount,
      tipo: type,
      categoria: type === "Receita" ? "Receita comercial" : "Investimento em midia",
      status,
      vencimento: dueDate(due),
      dataPagamento: status === "pago" ? dueDate(due) : null,
      meioPagamento: type === "Receita" ? "Pix" : "Cartao",
      createdAt: daysAgo(index + 6, 10),
      updatedAt: daysAgo(index, 16),
    });
  });

  add("ecommerce_connections", "commerce-shopify-demo", {
    provider: "shopify",
    storeName: "Aurora Prime Store",
    status: "connected",
    connectionStatus: "connected",
    shopDomain: "auroraprime.myshopify.com",
    lastSyncAt: daysAgo(0, 7),
    createdAt: daysAgo(35, 10),
    updatedAt: Timestamp.now(),
  });
  [
    "Kit Pos Procedimento",
    "Serum Renovador",
    "Voucher Avaliacao",
    "Clube Aurora Mensal",
    "Protetor Premium",
    "Consulta Retorno VIP",
    "Kit Home Care Completo",
    "Sessao Manutencao",
    "Plano Noivas Aurora",
    "Gift Card Premium",
    "Pacote Corporativo",
    "Upgrade Acompanhamento",
  ].forEach((name, index) => {
    add("ecommerce_products", `product-demo-${index + 1}`, {
      connectionId: "commerce-shopify-demo",
      provider: "shopify",
      externalId: `sku-demo-${index + 1}`,
      name,
      title: name,
      status: "active",
      price: [189, 249, 290, 590, 139, 390, 479, 690, 3900, 800, 12000, 1290][index],
      inventoryQuantity: [42, 28, 999, 100, 60, 80, 34, 45, 12, 200, 6, 30][index],
      updatedAt: daysAgo(index, 9),
    });
  });
  for (let index = 0; index < 36; index += 1) {
    const lead = leads[index % leads.length];
    add("ecommerce_orders", `order-demo-${index + 1}`, {
      connectionId: "commerce-shopify-demo",
      provider: "shopify",
      externalId: `100${index + 1}`,
      leadId: lead.id,
      customerName: lead.data.nome,
      customerPhone: lead.data.telefone,
      status: index % 4 === 0 ? "paid" : "fulfilled",
      financialStatus: "paid",
      fulfillmentStatus: index % 3 === 0 ? "pending" : "fulfilled",
      total: 189 + index * 73,
      currency: "BRL",
      createdAt: daysAgo(index + 1, 13),
      updatedAt: daysAgo(index, 16),
    });
  }
  for (let index = 0; index < 14; index += 1) {
    const lead = leads[(index + 5) % leads.length];
    add("ecommerce_abandoned_carts", `cart-demo-${index + 1}`, {
      connectionId: "commerce-shopify-demo",
      provider: "shopify",
      leadId: lead.id,
      customerName: lead.data.nome,
      customerPhone: lead.data.telefone,
      total: 290 + index * 120,
      status: index === 0 ? "pending_action" : "recovered",
      recoveryUrl: "https://clinicaauroraprime.com.br/cart",
      createdAt: daysAgo(index + 1, 15),
      updatedAt: daysAgo(index, 17),
    });
  }
  for (let index = 0; index < 10; index += 1) {
    const lead = leads[(index + 5) % leads.length];
    add("ecommerce_commercial_actions", `commerce-action-demo-${index + 1}`, {
      type: index % 3 === 0 ? "abandoned_cart_recovery" : index % 3 === 1 ? "upsell" : "recompra",
      status: index < 3 ? "pending" : index < 7 ? "done" : "scheduled",
      leadId: lead.id,
      chatId: chats[(index + 5) % chats.length].id,
      customerName: lead.data.nome,
      amount: 590 + index * 180,
      suggestedMessage: "Vi uma oportunidade de continuar seu atendimento com uma oferta coerente para o seu momento. Posso te mostrar?",
      createdAt: daysAgo(index % 6, 11),
      updatedAt: daysAgo(index % 4, 11),
    });
  }

  for (let index = 0; index < 16; index += 1) {
    add("ai_logs", `ai-log-demo-${index + 1}`, {
      chatId: chats[index % chats.length].id,
      leadId: leads[index % leads.length].id,
      type: index % 4 === 0 ? "handoff" : "conversation_reply",
      status: index % 9 === 0 ? "warning" : "success",
      decision: index % 4 === 0 ? "handoff" : "reply",
      reason: index % 4 === 0 ? "negociacao sensivel" : "playbook aplicado",
      promptTokens: 640 + index * 18,
      completionTokens: 210 + index * 11,
      costUsd: Number((0.012 + index * 0.001).toFixed(4)),
      createdAt: daysAgo(index % 10, 14),
      updatedAt: daysAgo(index % 10, 14),
    });
    add("ai_usage_ledger", `ai-usage-demo-${index + 1}`, {
      type: "conversation_reply",
      provider: "openai",
      model: "gpt-4.1-mini",
      promptTokens: 640 + index * 18,
      completionTokens: 210 + index * 11,
      totalTokens: 850 + index * 29,
      costUsd: Number((0.012 + index * 0.001).toFixed(4)),
      createdAt: daysAgo(index % 10, 14),
    });
  }
  add("ai_internal_notifications", "ai-notification-demo-1", {
    category: "assistant",
    severity: "warning",
    title: "Atendimento aguardando humano",
    description: "Lead quente pediu condicao especial no WhatsApp.",
    chatId: chats[0].id,
    leadId: leads[0].id,
    status: "open",
    createdAt: daysAgo(0, 15),
  });

  add("growth_tracking_configs", "growth-config-demo", {
    status: "active",
    domain: "clinicaauroraprime.com.br",
    pixelEnabled: true,
    events: ["page_view", "lead_created", "purchase_completed"],
    updatedAt: Timestamp.now(),
  });
  add("growth_segments", "segment-hot-meta-demo", {
    name: "Leads quentes Meta",
    status: "active",
    definition: { match: "all", conditions: [{ field: "source", operator: "Includes", value: "meta" }, { field: "heat", operator: "Equals", value: "hot" }] },
    createdAt: daysAgo(14, 9),
    updatedAt: Timestamp.now(),
  });
  for (let index = 0; index < 30; index += 1) {
    add("growth_events", `growth-event-demo-${index + 1}`, {
      name: index % 5 === 0 ? "purchase_completed" : index % 3 === 0 ? "lead_created" : "page_view",
      occurredAt: daysAgo(index % 12, 10 + (index % 8)),
      anonymousId: `visitor-demo-${index}`,
      sessionId: `session-demo-${Math.floor(index / 2)}`,
      path: index % 5 === 0 ? "/obrigado" : "/avaliacao",
      value: index % 5 === 0 ? 1200 + index * 70 : 0,
      currency: "BRL",
      attribution: { source: index % 2 ? "meta" : "google", campaign: campaigns[index % campaigns.length][4] },
    });
  }

  [
    ["outbound-demo-1", "Reativacao leads quentes", "active", 60],
    ["outbound-demo-2", "Pos-consulta 15 dias", "scheduled", 34],
  ].forEach(([id, name, status, maxRecipients], index) => {
    add("outbound_campaigns", id, {
      name,
      status,
      channelId: "channel-whatsapp-demo",
      deliveryMode: "whatsapp_template",
      templateName: "followup_comercial",
      languageCode: "pt_BR",
      messageTemplate: "Ola {{1}}, podemos continuar seu atendimento?",
      maxRecipients,
      scheduledAt: isoFromNow(index + 1, 9),
      sendRatePerMinute: 12,
      filters: { heat: "hot" },
      createdAt: daysAgo(8 + index, 9),
      updatedAt: daysAgo(index, 15),
      lastRunSummary: { sent: 28, skipped: 4, failed: 1, totalMatched: 33 },
      lastRunAt: daysAgo(index + 1, 11),
    });
  });
  for (let index = 0; index < 40; index += 1) {
    add("outbound_campaign_deliveries", `delivery-demo-${index + 1}`, {
      campaignId: index % 2 ? "outbound-demo-1" : "outbound-demo-2",
      leadId: leads[index % leads.length].id,
      chatId: chats[index % chats.length].id,
      deliveryStatus: index % 9 === 0 ? "failed" : index % 4 === 0 ? "read" : "delivered",
      respondedAt: index % 6 === 0 ? daysAgo(index % 5, 16) : null,
      convertedAt: index % 13 === 0 ? daysAgo(index % 5, 18) : null,
      createdAt: daysAgo(index % 9, 10),
    });
  }
  add("outbound_campaign_runs", "run-demo-1", {
    campaignId: "outbound-demo-1",
    campaignName: "Reativacao leads quentes",
    summary: { sent: 28, skipped: 4, failed: 1, totalMatched: 33 },
    createdAt: daysAgo(1, 11),
  });

  add("mcp_action_drafts", "mcp-draft-demo-1", {
    title: "Pausar campanha com CPL alto",
    status: "pending_review",
    tool: "meta_ads_operator_action",
    summary: "Campanha Topo Frio gastou acima da media com poucos leads.",
    payload: { campaignId: "cmp-meta-topo-frio", action: "pause" },
    createdAt: daysAgo(0, 9),
    updatedAt: daysAgo(0, 9),
  });

  for (let index = 0; index < 10; index += 1) {
    add("metrics", `metric-ai-queue-${index + 1}`, {
      type: "ai_queue_daily",
      dateRef: dateKey(-index),
      counters: { processed: 42 + index, failed: index % 3, retried: index % 4, enqueued: 48 + index },
      createdAt: daysAgo(index, 23),
      updatedAt: daysAgo(index, 23),
    });
  }

  add("daily_reports", `${tenantId}_${dateKey(-1)}`, {
    dateKey: dateKey(-1),
    title: "Fechamento diario - Clinica Aurora Prime",
    summary: "Operacao teve 18 novos leads, 7 agendamentos e 2 vendas confirmadas. Ponto de atencao: follow-up de propostas.",
    highlights: ["Tempo medio de resposta abaixo de 4 minutos", "Meta Ads gerou maior volume", "Google trouxe leads com maior ticket"],
    risks: ["3 conversas quentes aguardam humano", "2 propostas vencem em ate 48h"],
    nextActions: ["Priorizar Ana Paula e Daniel", "Revisar CPL da campanha Instagram Direct", "Enviar reativacao para carrinhos abandonados"],
    generatedAt: daysAgo(0, 7),
  });

  add("client_contracts", tenantId, {
    tenantId,
    clientId: tenantId,
    planId: "escala",
    status: "active",
    monthlyValue: 1197,
    startedAt: daysAgo(75, 9),
    nextBillingAt: daysFromNow(12, 9),
    provider: "asaas",
    updatedAt: Timestamp.now(),
  });

  return { rows, team, stages, leads, chats };
}

async function deleteQueryBatch(db, query, deleted = 0) {
  const snap = await query.limit(400).get();
  if (snap.empty) return deleted;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return deleteQueryBatch(db, query, deleted + snap.size);
}

async function cleanDemoRows(db, tenantId) {
  let deleted = 0;
  for (const collection of COLLECTIONS_WITH_DEMO_ROWS) {
    deleted += await deleteQueryBatch(db, db.collection(collection).where("demoSeedId", "==", SEED_ID));
  }
  for (const collection of ["tenants", "clientes", "tenant_settings", "tenant_entitlements", "client_contracts", "pipeline"]) {
    const ref = db.collection(collection).doc(tenantId);
    const snap = await ref.get();
    if (snap.exists && snap.data()?.demoSeedId === SEED_ID) {
      await ref.delete();
      deleted += 1;
    }
  }
  return deleted;
}

async function commitRows(db, rows) {
  let written = 0;
  for (let index = 0; index < rows.length; index += 400) {
    const batch = db.batch();
    rows.slice(index, index + 400).forEach((row) => {
      batch.set(db.collection(row.collection).doc(row.id), row.data, { merge: true });
    });
    await batch.commit();
    written += rows.slice(index, index + 400).length;
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tenantId = args.tenantId;

  if (!args.apply) {
    console.log("DRY RUN - nenhum dado foi escrito.");
    console.log(`Tenant: ${tenantId}`);
    console.log(`Login: ${args.email}`);
    console.log(`Senha sugerida: ${args.password}`);
    console.log("Para gravar: npm run cliente:demo:seed -- --apply");
    return;
  }

  const { auth, db } = await initFirebase();
  const uid = await ensureAuthUser(auth, {
    email: args.email,
    password: args.password,
    displayName: "Marina Costa",
  });
  const { rows, leads, chats } = buildRows(tenantId, uid, args.email);
  const deleted = args.clean ? await cleanDemoRows(db, tenantId) : 0;
  const written = await commitRows(db, rows);

  console.log(JSON.stringify({
    ok: true,
    tenantId,
    email: args.email,
    password: args.password,
    uid,
    deleted,
    written,
    leads: leads.length,
    chats: chats.length,
    nextUrl: `/cliente/login?tenantId=${encodeURIComponent(tenantId)}`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
