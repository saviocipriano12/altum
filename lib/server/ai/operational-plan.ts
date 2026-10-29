import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";
import type { AltumConversationRuntimeState, AltumConversationStage, AltumLeadMemory } from "@/lib/server/ai/runtime-state";
import type { AltumTenantLearningHints } from "@/lib/server/ai/tenant-learning";
import type { SalesMotion } from "@/lib/sales-journey";
import {
  assistantRoleAllowsProactiveClosing,
  assistantRoleUsesCommercialFunnel,
  type AltumAssistantRole,
} from "@/lib/ai-assistant-role";
import { roleAllowsOperationalAction } from "@/lib/server/ai/role-operating-contract";

type ConversationMessage = {
  sender: "agent" | "client" | "system";
  text: string;
  type?: string;
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score: number;
};

type TenantAiOperationalContext = {
  escalationTopics?: string[];
  playbookOffers?: Array<{ title?: string }>;
  learningHints?: AltumTenantLearningHints | null;
  salesMotion?: SalesMotion | null;
  assistantRole?: AltumAssistantRole;
  roleContract?: {
    readiness?: "ready" | "restricted";
    capabilities?: string[];
  } | null;
};

type ConversationalChoice = {
  decision: "respond" | "ask_more" | "handoff";
  reason: string;
  confidence: number;
  nextAction: string;
  ledBy: "llm" | "fallback";
};

type DeriveOperationalPlanInput = {
  inboundText: string;
  messageType?: string | null;
  choice: ConversationalChoice;
  llmDecision?: "respond" | "ask_more" | "handoff" | "skip" | null;
  llmReason?: string | null;
  llmConfidence?: number | null;
  llmTurnGoal?: string | null;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  extractedFields?: Record<string, string> | null;
  conversation: ConversationMessage[];
  kbDocs: KbDoc[];
  tenantAi: TenantAiOperationalContext;
};

function sanitizeText(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeComparable(value: string) {
  return sanitizeText(value, 220)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWords(value: string) {
  return sanitizeText(value, 600)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function lastClientMessage(messages: ConversationMessage[]) {
  return [...messages].reverse().find((item) => item.sender === "client") || null;
}

function matchesEscalationTopic(inboundText: string, topics: string[]) {
  const normalized = normalizeComparable(inboundText);
  if (!normalized) return false;

  return topics.some((topic) => {
    const normalizedTopic = normalizeComparable(topic);
    return normalizedTopic ? normalized.includes(normalizedTopic) : false;
  });
}

function detectObjectionType(inboundText: string, extractedFields?: Record<string, string> | null) {
  const explicit =
    sanitizeText(extractedFields?.objectionType, 120) ||
    sanitizeText(extractedFields?.objection, 120);
  if (explicit && !/^(none|nenhum|nenhuma|nao|n\/a|sem objecao)$/i.test(normalizeComparable(explicit))) return explicit;

  const normalized = normalizeComparable(inboundText);
  if (!normalized) return null;
  if (/\b(caro|caro demais|preco|orcamento|budget|valor)\b/.test(normalized)) return "budget";
  if (/\b(agora nao|depois|mais pra frente|sem tempo|momento)\b/.test(normalized)) return "timing";
  if (/\b(confi|garantia|prova|resultado|funciona mesmo)\b/.test(normalized)) return "trust";
  return null;
}

function detectIntent(input: {
  inboundText: string;
  messageType?: string | null;
  extractedFields?: Record<string, string> | null;
  llmTurnGoal?: string | null;
}) {
  const messageType = sanitizeText(input.messageType, 40).toLowerCase();
  const normalized = normalizeComparable(input.inboundText);
  if (!normalized) {
    if (messageType === "audio") return "send_audio";
    if (messageType === "image") return "send_image";
    if (messageType === "document") return "send_document";
    return "generic";
  }

  if (/\b(voce|voces)\b.{0,24}\b(humano|humana|pessoa|inteligencia artificial|ia|robo|bot)\b/.test(normalized) || /\b(e|eh)\s+(uma?\s+)?(pessoa|humano|humana|ia|robo|bot)\b/.test(normalized)) return "agent_identity";
  if (/\b(outro cliente|outra empresa|outro lead|outro contato)\b/.test(normalized) && /\b(preco|valor|condicao|dados|informacao|ofereceram|pagou)\b/.test(normalized)) return "cross_customer_context_request";
  if (/\b(quero|gostaria|preciso|prefiro|pode|poderia)\b.{0,42}\b(falar|conversar|atendimento|atender|transferir|chamar)\b.{0,30}\b(humano|pessoa|atendente|suporte|consultor)\b/.test(normalized) || /\b(falar|conversar)\s+com\s+(um|uma)?\s*(humano|pessoa|atendente|consultor)\b/.test(normalized)) return "request_human";
  if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalized)) return "greeting";
  if (/\b(como voce esta|como voce ta|como vai|tudo bem|tudo certo)\b/.test(normalized)) return "relational";
  if (/\b(obrigad|valeu)\b/.test(normalized)) return "thanks";
  if (/\b(kkk|haha|hehe|beleza|show|massa)\b/.test(normalized)) return "light_small_talk";
  if (/\b(quanto custa|qual (e )?o (preco|valor)|preco|valor|custo|custam)\b/.test(normalized)) return "price_inquiry";
  if (/\b(o que (voces|a empresa) (fazem|oferecem)|quais (servicos|solucoes)|como (voces|a empresa) (ajudam|funcionam))\b/.test(normalized)) return "service_overview";
  if (/\b(proposta|orcamento)\b/.test(normalized)) return "proposal_interest";
  if (/\b(reuniao|agenda|agendar|call)\b/.test(normalized)) return "meeting_interest";
  if (/\b(quero contratar|quero comprar|vou contratar|vou comprar|como (eu )?contrato|como (eu )?compro|qual (e )?o proximo passo|podemos fechar|quero fechar)\b/.test(normalized)) {
    return "purchase_interest";
  }
  if (detectObjectionType(input.inboundText, input.extractedFields)) return "objection";
  const businessType = sanitizeText(input.extractedFields?.businessType, 120);
  const primaryGoal = sanitizeText(input.extractedFields?.primaryGoal, 160);
  if ((businessType && primaryGoal) || (/\b(sou|somos|tenho|minha empresa|minha clinica|meu negocio)\b/.test(normalized) && /\b(quero|preciso|busco|objetivo|organizar|melhorar|vender)\b/.test(normalized))) {
    return "business_need";
  }
  if (normalizeWords(sanitizeText(input.llmTurnGoal, 120)).some((word) => ["qualify", "discovery", "aprofundar", "investigar"].includes(word))) {
    return "qualification";
  }

  const mediaPlaceholderOnly =
    /^\s*(audio|imagem|foto|arquivo|documento)\s*(recebido|recebida|enviado|enviada)?\s*$/.test(normalized);
  if (mediaPlaceholderOnly || normalized.length < 3) {
    if (messageType === "audio") return "send_audio";
    if (messageType === "image") return "send_image";
    if (messageType === "document") return "send_document";
  }

  return "generic";
}

function mapTurnGoalToResponseGoal(
  turnGoal: string,
  fallback: AltumPlannerDecision["responseGoal"]
): AltumPlannerDecision["responseGoal"] {
  if (/(handoff|escalar|humano)/i.test(turnGoal)) return "handoff";
  if (/(acolher|boas vindas|welcome)/i.test(turnGoal)) return "welcome";
  if (/(aprofundar|investigar|entender|qualify|discovery)/i.test(turnGoal)) return "qualify";
  if (/(objecao|objection)/i.test(turnGoal)) return "handle_objection";
  if (/(proposta|agendar|fechar|avancar|proximo passo|next step|diagnostico|recomendacao|recomendar|solucao|plano)/i.test(turnGoal)) {
    return "move_to_next_step";
  }
  if (/(responder|esclarecer|clarify|orientar|explicar|resumir|conversar)/i.test(turnGoal)) return "clarify";
  return fallback;
}

function mapResponseGoalToStage(
  responseGoal: AltumPlannerDecision["responseGoal"],
  currentStage: AltumConversationRuntimeState["stage"] | null | undefined,
  fallback: AltumPlannerDecision["stateAfter"]
): AltumPlannerDecision["stateAfter"] {
  if (responseGoal === "handoff") return "handoff";
  if (responseGoal === "welcome") return currentStage === "greeting" || !currentStage ? "discovery" : fallback;
  if (responseGoal === "qualify") {
    if (!currentStage || currentStage === "greeting" || currentStage === "discovery") return "qualification";
    return currentStage as AltumConversationStage;
  }
  if (responseGoal === "clarify") {
    if (!currentStage || currentStage === "greeting") return "discovery";
    return currentStage as AltumConversationStage;
  }
  if (responseGoal === "handle_objection") return "objection_handling";
  if (responseGoal === "recommend") return "recommendation";
  if (responseGoal === "move_to_next_step") return fallback;
  return fallback;
}

function inferFallbackResponseGoal(intent: string, choice: ConversationalChoice) {
  if (choice.decision === "handoff" || intent === "request_human") return "handoff" as const;
  if (intent === "greeting") return "welcome" as const;
  if (intent === "agent_identity" || intent === "service_overview" || intent === "cross_customer_context_request") return "clarify" as const;
  if (intent === "price_inquiry") return "handle_objection" as const;
  if (intent === "business_need") return "recommend" as const;
  if (intent === "objection") return "handle_objection" as const;
  if (intent === "proposal_interest" || intent === "meeting_interest" || intent === "purchase_interest") return "move_to_next_step" as const;
  if (choice.decision === "ask_more" || intent === "qualification") return "qualify" as const;
  return "clarify" as const;
}

function chooseRecommendedOffer(input: {
  extractedFields?: Record<string, string> | null;
  leadMemory: AltumLeadMemory | null;
  tenantAi: TenantAiOperationalContext;
  kbDocs: KbDoc[];
}) {
  const campaignOffer = sanitizeText(input.leadMemory?.campaignOfferName, 160);
  if (campaignOffer) return campaignOffer;

  const rawOffer =
    sanitizeText(input.extractedFields?.serviceInterest, 160) ||
    sanitizeText(input.extractedFields?.offer, 160) ||
    sanitizeText(input.leadMemory?.recommendedOffer, 160);

  const allowedOffers = Array.from(
    new Set(
      [
        ...(input.tenantAi.playbookOffers || []).map((offer) => sanitizeText(offer.title, 160)),
        ...input.kbDocs
          .filter((doc) => doc.type === "catalog")
          .map((doc) => sanitizeText(doc.content.replace(/^oferta:\s*/i, ""), 160)),
      ].filter(Boolean)
    )
  );

  const learnedOffer = sanitizeText(input.tenantAi.learningHints?.topOffers?.[0], 160);
  if (!rawOffer && learnedOffer) {
    // Aprendizado e uma sugestao estatistica, nunca uma nova fonte de verdade
    // comercial. A oferta aprendida so pode reaparecer se ainda existir no
    // catalogo ou playbook ativo deste tenant.
    if (!allowedOffers.length) return null;
    const normalizedLearned = normalizeComparable(learnedOffer);
    const learnedMatch = allowedOffers.find((offer) => {
      const normalizedOffer = normalizeComparable(offer);
      return normalizedOffer === normalizedLearned || normalizedOffer.includes(normalizedLearned);
    });
    if (learnedMatch) return learnedMatch;
    return null;
  }

  if (!allowedOffers.length) return rawOffer || learnedOffer || null;
  if (!rawOffer) return learnedOffer || null;
  const normalizedRaw = normalizeComparable(rawOffer);

  const exact = allowedOffers.find((offer) => normalizeComparable(offer) === normalizedRaw);
  if (exact) return exact;

  const partial = allowedOffers.find((offer) => {
    const normalizedOffer = normalizeComparable(offer);
    return normalizedOffer.includes(normalizedRaw) || normalizedRaw.includes(normalizedOffer);
  });

  return partial || null;
}

function inferCommercialTemperature(input: {
  intent: string;
  responseGoal: AltumPlannerDecision["responseGoal"];
  extractedFields?: Record<string, string> | null;
  leadMemory: AltumLeadMemory | null;
}) {
  const budget =
    sanitizeText(input.extractedFields?.budgetBand, 80) ||
    sanitizeText(input.extractedFields?.budget, 80) ||
    sanitizeText(input.leadMemory?.budgetBand, 80);
  const urgency =
    sanitizeText(input.extractedFields?.urgency, 80) ||
    sanitizeText(input.leadMemory?.urgency, 80);

  if (input.responseGoal === "move_to_next_step") return "hot" as const;
  if (input.intent === "proposal_interest" || input.intent === "meeting_interest" || input.intent === "purchase_interest") return "hot" as const;
  if (budget || urgency) return "warm" as const;
  if (input.responseGoal === "handle_objection") return "warm" as const;
  return "cold" as const;
}

function inferNextAction(input: {
  intent: string;
  responseGoal: AltumPlannerDecision["responseGoal"];
  messageType?: string | null;
  extractedFields?: Record<string, string> | null;
  leadMemory: AltumLeadMemory | null;
  tenantAi: TenantAiOperationalContext;
}) {
  const role = input.tenantAi.assistantRole;
  const restricted = input.tenantAi.roleContract?.readiness === "restricted";
  if (input.responseGoal === "handoff") return "assumir_handoff_humano";
  if (input.intent === "send_image" || input.intent === "send_document") return "esclarecer_oferta_e_mapear_foco";
  if (input.intent === "send_audio") return "aprofundar_oportunidade";
  if (input.responseGoal === "handle_objection") {
    return roleAllowsOperationalAction(role, "handle_objection")
      ? "tratar_objecao_decisiva"
      : "esclarecer_e_encaminhar_objecao";
  }
  if (input.responseGoal === "qualify") {
    return roleAllowsOperationalAction(role, "qualify_lead")
      ? "qualificar_contexto_minimo"
      : "entender_e_resolver_necessidade_atual";
  }
  if (input.intent === "proposal_interest") {
    if (restricted) return "confirmar_configuracao_e_encaminhar_proposta";
    if (roleAllowsOperationalAction(role, "prepare_proposal")) return "preparar_proposta_comercial";
    if (role === "sdr") return "qualificar_e_encaminhar_para_closer";
    return "encaminhar_pedido_de_proposta_com_contexto";
  }
  if (input.intent === "meeting_interest") {
    return roleAllowsOperationalAction(role, "schedule_next_step")
      ? "agendar_proximo_passo"
      : "encaminhar_pedido_de_agendamento";
  }
  if (input.intent === "purchase_interest" && !roleAllowsOperationalAction(role, "complete_purchase")) {
    return role === "sdr" ? "encaminhar_oportunidade_pronta_para_closer" : "encaminhar_intencao_de_compra_com_contexto";
  }
  if (input.responseGoal === "move_to_next_step") {
    if (restricted) return "confirmar_condicoes_antes_de_avancar";
    if (input.tenantAi.salesMotion === "appointment") {
      return roleAllowsOperationalAction(role, "schedule_next_step")
        ? "oferecer_horarios_disponiveis"
        : "encaminhar_pedido_de_agendamento";
    }
    if (input.tenantAi.salesMotion === "store_visit") return "agendar_visita";
    if (input.tenantAi.salesMotion === "direct_checkout" || input.tenantAi.salesMotion === "digital_delivery") {
      return roleAllowsOperationalAction(role, "complete_purchase")
        ? "enviar_checkout_e_concluir_compra"
        : "encaminhar_compra_com_contexto";
    }
    if (input.tenantAi.salesMotion === "assisted_purchase") {
      return roleAllowsOperationalAction(role, "complete_purchase")
        ? "confirmar_opcao_e_facilitar_pagamento"
        : "confirmar_necessidade_e_encaminhar_compra";
    }
    if (input.tenantAi.learningHints?.preferredClosingMotion === "proposal") {
      return roleAllowsOperationalAction(role, "prepare_proposal")
        ? "preparar_proposta_comercial"
        : "encaminhar_pedido_de_proposta_com_contexto";
    }
    if (input.tenantAi.learningHints?.preferredClosingMotion === "meeting") return "agendar_proximo_passo";
    return "conduzir_para_proximo_passo";
  }

  if (!assistantRoleUsesCommercialFunnel(input.tenantAi.assistantRole)) {
    return "resolver_necessidade_atual";
  }

  const hasBusinessContext =
    sanitizeText(input.extractedFields?.businessType, 120) ||
    sanitizeText(input.extractedFields?.primaryGoal, 160) ||
    sanitizeText(input.leadMemory?.businessType, 120) ||
    sanitizeText(input.leadMemory?.primaryGoal, 160);
  const learnedAction = sanitizeText(input.tenantAi.learningHints?.topActions?.[0], 120)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (hasBusinessContext && learnedAction) return learnedAction;
  return hasBusinessContext ? "aprofundar_oportunidade" : "qualificar_contexto_minimo";
}

function inferStateAfter(input: {
  responseGoal: AltumPlannerDecision["responseGoal"];
  intent: string;
  runtimeState: AltumConversationRuntimeState | null;
}) {
  if (input.responseGoal === "move_to_next_step") {
    if (input.intent === "proposal_interest") return "proposal_path" as const;
    if (input.intent === "meeting_interest") return "scheduling" as const;
    return input.runtimeState?.stage || "recommendation";
  }

  return mapResponseGoalToStage(input.responseGoal, input.runtimeState?.stage, input.runtimeState?.stage || "discovery");
}

export function deriveOperationalPlan(input: DeriveOperationalPlanInput): AltumPlannerDecision {
  const inboundText = sanitizeText(input.inboundText, 1000);
  const stateBefore = (input.runtimeState?.stage || "greeting") as AltumConversationStage;
  const latestClientType = sanitizeText(input.messageType || lastClientMessage(input.conversation)?.type, 40).toLowerCase();
  const intent = detectIntent({
    inboundText,
    messageType: latestClientType,
    extractedFields: input.extractedFields,
    llmTurnGoal: input.llmTurnGoal || null,
  });

  const forcedHandoff =
    intent !== "agent_identity" && (
    input.choice.decision === "handoff" ||
    input.llmDecision === "handoff" ||
    intent === "request_human" ||
    matchesEscalationTopic(inboundText, input.tenantAi.escalationTopics || []));

  const fallbackResponseGoal = inferFallbackResponseGoal(intent, input.choice);
  const normalizedTurnGoal = sanitizeText(input.llmTurnGoal, 120).toLowerCase();
  const modelProposedResponseGoal = forcedHandoff
    ? "handoff"
    : mapTurnGoalToResponseGoal(normalizedTurnGoal, fallbackResponseGoal);
  const proposedResponseGoal =
    !forcedHandoff &&
    (intent === "objection" || intent === "price_inquiry") &&
    roleAllowsOperationalAction(input.tenantAi.assistantRole, "handle_objection")
      ? ("handle_objection" as const)
      : !forcedHandoff && (intent === "agent_identity" || intent === "service_overview" || intent === "cross_customer_context_request")
        ? ("clarify" as const)
      : !forcedHandoff && intent === "business_need"
        ? roleAllowsOperationalAction(input.tenantAi.assistantRole, "recommend_offer")
          ? ("recommend" as const)
          : roleAllowsOperationalAction(input.tenantAi.assistantRole, "qualify_lead")
            ? ("qualify" as const)
            : ("clarify" as const)
      : !forcedHandoff &&
          intent === "purchase_interest" &&
          roleAllowsOperationalAction(input.tenantAi.assistantRole, "complete_purchase")
        ? ("move_to_next_step" as const)
      : modelProposedResponseGoal;
  const explicitClosingRequest = intent === "proposal_interest" || intent === "meeting_interest" || intent === "purchase_interest";
  const proposedActionAllowed =
    proposedResponseGoal === "qualify"
      ? roleAllowsOperationalAction(input.tenantAi.assistantRole, "qualify_lead")
      : proposedResponseGoal === "recommend"
        ? roleAllowsOperationalAction(input.tenantAi.assistantRole, "recommend_offer")
        : proposedResponseGoal === "handle_objection"
          ? roleAllowsOperationalAction(input.tenantAi.assistantRole, "handle_objection")
          : true;
  const restrictedHighRiskGoal =
    input.tenantAi.roleContract?.readiness === "restricted" &&
    ["recommend", "handle_objection", "move_to_next_step"].includes(proposedResponseGoal);
  const roleSafeResponseGoal =
    !forcedHandoff &&
    ((!assistantRoleUsesCommercialFunnel(input.tenantAi.assistantRole) &&
      !explicitClosingRequest &&
      ["qualify", "recommend", "handle_objection", "move_to_next_step"].includes(proposedResponseGoal)) ||
      !proposedActionAllowed ||
      restrictedHighRiskGoal)
      ? ("clarify" as const)
      : proposedResponseGoal;
  const responseGoal =
    !forcedHandoff &&
    roleSafeResponseGoal === "move_to_next_step" &&
    !assistantRoleAllowsProactiveClosing(input.tenantAi.assistantRole) &&
    !explicitClosingRequest
      ? ("clarify" as const)
      : roleSafeResponseGoal;
  const hasBusinessContext = Boolean(
    sanitizeText(input.extractedFields?.businessType, 120) ||
    sanitizeText(input.extractedFields?.primaryGoal, 160) ||
    sanitizeText(input.leadMemory?.businessType, 120) ||
    sanitizeText(input.leadMemory?.primaryGoal, 160) ||
    (/\b(sou|somos|tenho|minha empresa|minha clinica|meu negocio)\b/.test(normalizeComparable(inboundText)) && /\b(quero|preciso|busco|objetivo|organizar|melhorar|vender)\b/.test(normalizeComparable(inboundText)))
  );
  const stateAfter = forcedHandoff
    ? ("handoff" as const)
    : intent === "price_inquiry" && hasBusinessContext
      ? ("recommendation" as const)
      : intent === "price_inquiry"
        ? ("qualification" as const)
    : inferStateAfter({
        responseGoal,
        intent,
        runtimeState: input.runtimeState,
      });
  const recommendedOffer = chooseRecommendedOffer({
    extractedFields: input.extractedFields,
    leadMemory: input.leadMemory,
    tenantAi: input.tenantAi,
    kbDocs: input.kbDocs,
  });
  const objectionType = detectObjectionType(inboundText, input.extractedFields);
  const commercialTemperature = inferCommercialTemperature({
    intent,
    responseGoal,
    extractedFields: input.extractedFields,
    leadMemory: input.leadMemory,
  });
  const nextAction = inferNextAction({
    intent,
    responseGoal,
    messageType: latestClientType,
    extractedFields: input.extractedFields,
    leadMemory: input.leadMemory,
    tenantAi: input.tenantAi,
  });

  return {
    decision: forcedHandoff
      ? "handoff"
      : intent === "agent_identity" || intent === "service_overview" || intent === "cross_customer_context_request" || intent === "business_need"
        ? "respond"
      : intent === "price_inquiry" && !hasBusinessContext
        ? "ask_more"
      : responseGoal === "handle_objection"
        ? "respond"
        : input.choice.decision,
    reason:
      sanitizeText(input.choice.reason, 180) ||
      sanitizeText(input.llmReason, 180) ||
      "conversation_turn",
    confidence: Math.max(0.35, Math.min(Math.max(input.choice.confidence, input.llmConfidence || 0), 0.96)),
    stateBefore,
    stateAfter,
    responseGoal,
    intent,
    objectionType,
    commercialTemperature,
    nextQuestion: null,
    nextAction,
    recommendedOffer,
  };
}
