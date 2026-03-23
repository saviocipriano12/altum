import {
  getBusinessProfile,
  getBusinessProfilePipelineStages,
  normalizeBusinessProfileId,
  type BusinessProfileId,
} from "./business-profiles.ts";

export type BusinessProfileStarterAutomationKey =
  | "lead_hot"
  | "reply_recovery"
  | "ai_copilot"
  | "budget_followup"
  | "payment_care";

export type BusinessProfileStarterAutomationDraft = {
  key: BusinessProfileStarterAutomationKey;
  name: string;
  description: string;
  trigger:
    | "lead_created"
    | "waiting_for_reply"
    | "ai_next_action"
    | "budget_approved"
    | "finance_paid";
  enabled: boolean;
  status: "active" | "paused";
  conditions: {
    stageIn?: string[];
    sourceIn?: string[];
    channelIn?: string[];
    aiNextActionIn?: string[];
    scoreGte?: number | null;
    waitAtLeastHours?: number | null;
  };
  actions: Array<{
    type: "create_task" | "add_note" | "add_tag" | "set_priority" | "send_message";
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

export type BusinessProfileStarterKit = {
  profileId: BusinessProfileId;
  profileLabel: string;
  pipelineStages: ReturnType<typeof getBusinessProfilePipelineStages>;
  automations: BusinessProfileStarterAutomationDraft[];
};

function getReplyRecoveryMessage(profileId: BusinessProfileId) {
  if (profileId === "clinica") {
    return "Oi! Seu atendimento ficou em aberto por aqui. Se quiser, posso te ajudar a seguir para avaliacao ou agendamento.";
  }
  if (profileId === "imobiliaria") {
    return "Oi! Passei para retomar sua busca. Se fizer sentido, posso te ajudar a avancar para visita, simulacao ou nova selecao de imoveis.";
  }
  return "Oi! Passei aqui para retomar seu atendimento. Se quiser, posso te ajudar a seguir com a proxima etapa.";
}

function getBudgetFollowupNote(profileId: BusinessProfileId) {
  if (profileId === "clinica") {
    return "Automacao: orcamento aprovado, lead pronto para avancar em avaliacao, agendamento ou procedimento.";
  }
  if (profileId === "imobiliaria") {
    return "Automacao: proposta ou simulacao aprovada, lead pronto para visita, documentacao ou fechamento.";
  }
  return "Automacao: proposta aprovada, lead pronto para fechamento.";
}

function getBudgetFollowupTask(profileId: BusinessProfileId) {
  if (profileId === "clinica") return "Confirmar avaliacao ou agendamento apos aprovacao";
  if (profileId === "imobiliaria") return "Confirmar visita ou fechamento apos aprovacao";
  return "Confirmar fechamento apos proposta aprovada";
}

function getPaymentCareNote(profileId: BusinessProfileId) {
  if (profileId === "clinica") {
    return "Pagamento confirmado. Iniciar onboarding do paciente, alinhamento final e proximos cuidados.";
  }
  if (profileId === "imobiliaria") {
    return "Pagamento confirmado. Iniciar onboarding, documentacao e alinhamento dos proximos passos.";
  }
  return "Pagamento confirmado. Iniciar onboarding e alinhar proxima entrega.";
}

function getPaymentCareTask(profileId: BusinessProfileId) {
  if (profileId === "clinica") return "Iniciar onboarding do atendimento";
  if (profileId === "imobiliaria") return "Iniciar onboarding da jornada do cliente";
  return "Iniciar onboarding do cliente";
}

export function getBusinessProfileStarterKit(profileId?: unknown): BusinessProfileStarterKit {
  const normalizedProfileId = normalizeBusinessProfileId(profileId);
  const profile = getBusinessProfile(normalizedProfileId);
  const pipelineStages = getBusinessProfilePipelineStages(normalizedProfileId);
  const stageIds = pipelineStages.map((stage) => stage.id);
  const firstStage = stageIds[0] || "captado";
  const proposalStage = stageIds.find((stage) => ["proposta", "orcamento"].includes(stage)) || "proposta";
  const closeStage =
    stageIds.find((stage) => ["fechamento", "negociacao", "onboarding", "ganho", "realizado"].includes(stage)) ||
    "fechamento";

  return {
    profileId: normalizedProfileId,
    profileLabel: profile.label,
    pipelineStages,
    automations: [
      {
        key: "lead_hot",
        name: "Entrada comercial forte",
        description: `Prioriza leads de entrada no modo ${profile.label} e dispara a primeira acao operacional do time.`,
        trigger: "lead_created",
        enabled: true,
        status: "active",
        conditions: {
          stageIn: [firstStage],
          channelIn: ["whatsapp", "meta_ads", "google_ads", "site_form"],
          scoreGte: 70,
        },
        actions: [
          {
            type: "set_priority",
            priority: "high",
            sequenceOrder: 1,
          },
          {
            type: "add_tag",
            tag: "entrada_quente",
            sequenceOrder: 2,
          },
          {
            type: "create_task",
            title: `Entrar em contato com lead quente - ${profile.label}`,
            taskType: "follow_up",
            priority: "high",
            dueInHours: 1,
            sequenceOrder: 3,
          },
        ],
      },
      {
        key: "reply_recovery",
        name: "Recuperar conversa sem resposta",
        description: "Retoma atendimento quando o cliente fica aguardando resposta do time acima da janela definida.",
        trigger: "waiting_for_reply",
        enabled: true,
        status: "active",
        conditions: {
          channelIn: ["whatsapp", "instagram", "messenger", "site_chat"],
          waitAtLeastHours: 2,
        },
        actions: [
          {
            type: "send_message",
            text: getReplyRecoveryMessage(normalizedProfileId),
            sequenceOrder: 1,
          },
          {
            type: "create_task",
            title: "Retomar conversa sem resposta",
            taskType: "follow_up",
            priority: "high",
            dueInHours: 2,
            sequenceOrder: 2,
          },
        ],
      },
      {
        key: "ai_copilot",
        name: "Copilot comercial da IA",
        description: "Converte sinais da IA em tarefa, nota e prioridade para o desk comercial agir mais rapido.",
        trigger: "ai_next_action",
        enabled: true,
        status: "active",
        conditions: {
          aiNextActionIn: [
            "preparar_proposta_comercial",
            "agendar_proximo_passo",
            "assumir_handoff_humano",
          ],
        },
        actions: [
          {
            type: "set_priority",
            priority: "high",
            sequenceOrder: 1,
          },
          {
            type: "add_note",
            text: `Automacao: a IA sinalizou proximo passo operacional no modo ${profile.label}. Revisar contexto no CRM e agir no desk.`,
            sequenceOrder: 2,
          },
          {
            type: "create_task",
            title: "Executar proximo passo sugerido pela IA",
            taskType: "follow_up",
            priority: "high",
            dueInHours: 2,
            sequenceOrder: 3,
          },
        ],
      },
      {
        key: "budget_followup",
        name: "Follow-up de proposta aprovada",
        description: "Aciona o time comercial assim que a proposta for marcada como aprovada.",
        trigger: "budget_approved",
        enabled: true,
        status: "active",
        conditions: {
          stageIn: [proposalStage, closeStage].filter(Boolean),
        },
        actions: [
          {
            type: "add_note",
            text: getBudgetFollowupNote(normalizedProfileId),
            sequenceOrder: 1,
          },
          {
            type: "set_priority",
            priority: "high",
            sequenceOrder: 2,
          },
          {
            type: "create_task",
            title: getBudgetFollowupTask(normalizedProfileId),
            taskType: "proposta",
            priority: "high",
            dueInHours: 4,
            sequenceOrder: 3,
          },
        ],
      },
      {
        key: "payment_care",
        name: "Onboarding apos pagamento",
        description: "Cria nota de contexto e tarefa de onboarding quando a receita e confirmada.",
        trigger: "finance_paid",
        enabled: true,
        status: "active",
        conditions: {
          stageIn: [closeStage],
        },
        actions: [
          {
            type: "add_note",
            text: getPaymentCareNote(normalizedProfileId),
            sequenceOrder: 1,
          },
          {
            type: "create_task",
            title: getPaymentCareTask(normalizedProfileId),
            taskType: "pendencia",
            priority: "medium",
            dueInHours: 24,
            sequenceOrder: 2,
          },
        ],
      },
    ],
  };
}
