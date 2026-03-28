import type {
  AltumConversationRuntimeState,
  AltumConversationStage,
  AltumLeadMemory,
} from "@/lib/server/ai/runtime-state";

type ConversationMessage = {
  id: string;
  text: string;
  sender: "agent" | "client" | "system";
};

type KbDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score: number;
};

type TenantAiConfigLike = {
  businessSummary: string;
  objective: string;
  toneOfVoice: string;
  mandatoryQuestions: string[];
  playbookOffers: Array<{ title: string; targetProfile?: string; whenToOffer?: string }>;
};

export type AltumPlannerDecision = {
  decision: "respond" | "ask_more" | "handoff";
  reason: string;
  confidence: number;
  stateBefore: AltumConversationStage;
  stateAfter: AltumConversationStage;
  responseGoal:
    | "welcome"
    | "clarify"
    | "qualify"
    | "recommend"
    | "handle_objection"
    | "move_to_next_step"
    | "handoff";
  intent: string;
  nextQuestion?: string | null;
  nextAction?: string | null;
  recommendedOffer?: string | null;
};

function sanitizeText(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function textHasAny(text: string, terms: string[]) {
  const normalized = normalizeWords(text).join(" ");
  return terms.some((term) => normalized.includes(term));
}

function mergeKnownFields(memory: AltumLeadMemory | null, extracted?: Record<string, string> | null) {
  const fields = {
    businessType: sanitizeText(extracted?.businessType || extracted?.niche || extracted?.segment, 120) || memory?.businessType || "",
    primaryGoal: sanitizeText(extracted?.primaryGoal || extracted?.goal || extracted?.objective, 180) || memory?.primaryGoal || "",
    budgetBand: sanitizeText(extracted?.budgetBand || extracted?.budget, 120) || memory?.budgetBand || "",
    urgency: sanitizeText(extracted?.urgency, 120) || memory?.urgency || "",
    serviceInterest:
      sanitizeText(extracted?.serviceInterest || extracted?.offer, 160) || memory?.recommendedOffer || "",
    intent: sanitizeText(extracted?.intent, 120) || memory?.dominantIntent || "",
  };
  return fields;
}

function detectIntent(text: string) {
  if (textHasAny(text, ["humano", "atendente", "pessoa", "alguem"])) return "request_human";
  if (textHasAny(text, ["preco", "valor", "orcamento", "investimento"])) return "ask_price";
  if (textHasAny(text, ["o que voces fazem", "o que fazem", "como funciona", "me explica", "nao entendi"])) {
    return "ask_services";
  }
  if (textHasAny(text, ["vou pensar", "depois vejo", "nao tenho certeza"])) return "soft_objection";
  if (textHasAny(text, ["quero vender mais", "aumentar minhas vendas", "mais vendas", "captar mais"])) return "growth_goal";
  if (textHasAny(text, ["site", "landing page", "lp"])) return "digital_assets";
  if (textHasAny(text, ["crm", "pipeline", "atendimento", "whatsapp", "ia"])) return "ops_or_ai";
  if (textHasAny(text, ["oi", "ola", "bom dia", "boa tarde", "boa noite"])) return "greeting";
  return "context_share";
}

function getStateBefore(runtimeState: AltumConversationRuntimeState | null): AltumConversationStage {
  return runtimeState?.stage || "greeting";
}

function hasCommercialContext(known: {
  businessType?: string;
  primaryGoal?: string;
}) {
  return Boolean(known.businessType && known.primaryGoal);
}

function chooseNextQuestion(input: {
  messages: ConversationMessage[];
  mandatoryQuestions: string[];
  businessType?: string;
  primaryGoal?: string;
  budgetBand?: string;
  urgency?: string;
}) {
  const clientCorpus = input.messages
    .filter((item) => item.sender === "client")
    .map((item) => sanitizeText(item.text, 240).toLowerCase())
    .join(" ");

  if (!input.businessType) {
    return "Qual e o nicho ou tipo de empresa de voces hoje?";
  }
  if (!input.primaryGoal) {
    return "Hoje qual e o principal objetivo comercial que voce quer destravar primeiro?";
  }
  if (!input.budgetBand && !textHasAny(clientCorpus, ["orcamento", "investimento", "nao tenho"])) {
    return "Hoje voces ja pensam em alguma faixa de investimento para isso ou ainda estao entendendo o caminho?";
  }
  if (!input.urgency) {
    return "Isso e algo que voce quer colocar de pe ainda agora ou pode amadurecer um pouco?";
  }

  return (
    input.mandatoryQuestions.find((question) => {
      const normalized = sanitizeText(question, 200).toLowerCase();
      return !clientCorpus.includes(normalized.slice(0, 18));
    }) || "Se fizer sentido, eu te mostro o proximo passo mais aderente para o seu caso."
  );
}

function recommendOffer(input: {
  inboundText: string;
  businessType?: string;
  primaryGoal?: string;
  serviceInterest?: string;
  kbDocs: KbDoc[];
  tenantAi: TenantAiConfigLike;
}) {
  if (input.serviceInterest) return input.serviceInterest;

  const text = `${input.inboundText} ${input.primaryGoal || ""} ${input.businessType || ""}`.toLowerCase();
  if (textHasAny(text, ["whatsapp", "responder mais rapido", "atendimento", "ia", "qualificar lead"])) {
    return "implantacao de IA para atendimento e comercial";
  }
  if (textHasAny(text, ["crm", "pipeline", "organizar atendimento", "processo comercial", "desorganizado"])) {
    return "estruturacao comercial com CRM e operacao";
  }
  if (textHasAny(text, ["site", "institucional", "autoridade"])) {
    return "site institucional";
  }
  if (textHasAny(text, ["landing page", "lp", "captacao", "captar mais", "campanha"])) {
    return "landing page comercial";
  }
  if (textHasAny(text, ["marketing", "trafego"])) {
    return "consultoria de marketing";
  }

  const catalogDoc = input.kbDocs.find((doc) => doc.type === "catalog");
  if (catalogDoc) {
    const content = sanitizeText(catalogDoc.content, 160).replace(/^oferta:\s*/i, "");
    if (content) return content;
  }

  return sanitizeText(input.tenantAi.playbookOffers[0]?.title, 160) || "diagnostico comercial e marketing";
}

export function planAltumAgentDecision(input: {
  inboundText: string;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  extractedFields?: Record<string, string> | null;
  llmDecision?: "respond" | "ask_more" | "handoff" | "skip";
  llmReason?: string | null;
  llmConfidence?: number | null;
  mandatoryQuestions: string[];
  conversation: ConversationMessage[];
  kbDocs: KbDoc[];
  tenantAi: TenantAiConfigLike;
}) : AltumPlannerDecision {
  const stateBefore = getStateBefore(input.runtimeState);
  const intent = detectIntent(input.inboundText);
  const known = mergeKnownFields(input.leadMemory, input.extractedFields);
  const hasContext = hasCommercialContext(known);
  const recommendedOffer = recommendOffer({
    inboundText: input.inboundText,
    businessType: known.businessType,
    primaryGoal: known.primaryGoal,
    serviceInterest: known.serviceInterest,
    kbDocs: input.kbDocs,
    tenantAi: input.tenantAi,
  });

  if (intent === "request_human" || input.llmDecision === "handoff") {
    return {
      decision: "handoff",
      reason: input.llmReason || "lead_requested_human",
      confidence: Math.max(0.72, input.llmConfidence || 0.72),
      stateBefore,
      stateAfter: "handoff",
      responseGoal: "handoff",
      intent,
      nextAction: "assumir_handoff_humano",
      recommendedOffer,
    };
  }

  if (intent === "greeting" && hasContext) {
    return {
      decision: "respond",
      reason: "greeting_resume_with_context",
      confidence: Math.max(0.8, input.llmConfidence || 0.8),
      stateBefore,
      stateAfter: stateBefore === "recommendation" ? "recommendation" : "qualification",
      responseGoal: stateBefore === "recommendation" ? "move_to_next_step" : "qualify",
      intent,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: stateBefore === "recommendation" ? "conduzir_para_diagnostico_ou_reuniao" : "retomar_qualificacao_sem_reset",
      recommendedOffer,
    };
  }

  if (intent === "greeting" && !known.primaryGoal && !known.businessType) {
    return {
      decision: "respond",
      reason: "greeting_with_light_discovery",
      confidence: Math.max(0.76, input.llmConfidence || 0.76),
      stateBefore,
      stateAfter: "discovery",
      responseGoal: "welcome",
      intent,
      nextQuestion: "Me conta em uma linha o que voce quer melhorar hoje: gerar mais leads, organizar atendimento ou vender melhor?",
      nextAction: "abrir_descoberta_comercial",
      recommendedOffer,
    };
  }

  if (intent === "ask_services") {
    return {
      decision: "respond",
      reason: "clarify_services_and_focus",
      confidence: Math.max(0.74, input.llmConfidence || 0.74),
      stateBefore,
      stateAfter: hasContext ? "recommendation" : known.primaryGoal ? "qualification" : "discovery",
      responseGoal: "clarify",
      intent,
      nextQuestion: hasContext
        ? "Se fizer sentido, eu te mostro o proximo passo mais aderente para o seu caso sem empurrar escopo errado. Quer que eu te resuma isso?"
        : known.primaryGoal
        ? chooseNextQuestion({
            messages: input.conversation,
            mandatoryQuestions: input.mandatoryQuestions,
            businessType: known.businessType,
            primaryGoal: known.primaryGoal,
            budgetBand: known.budgetBand,
            urgency: known.urgency,
          })
        : "Pelo seu momento hoje, o foco maior esta em captar mais, organizar atendimento ou converter melhor o que ja entra?",
      nextAction: "esclarecer_oferta_e_mapear_foco",
      recommendedOffer,
    };
  }

  if (intent === "ask_price" && hasContext) {
    return {
      decision: "respond",
      reason: "price_with_context_ready",
      confidence: Math.max(0.78, input.llmConfidence || 0.78),
      stateBefore,
      stateAfter: "recommendation",
      responseGoal: "handle_objection",
      intent,
      nextQuestion:
        known.budgetBand || known.urgency
          ? "Se fizer sentido, eu te mostro o proximo passo mais aderente para isso sem te empurrar escopo errado. Quer que eu te resuma?"
          : "So para eu te orientar com responsabilidade: isso e algo urgente para agora ou ainda esta no momento de entender o caminho?",
      nextAction: "conduzir_para_diagnostico_ou_reuniao",
      recommendedOffer,
    };
  }

  if (intent === "ask_price" && (!known.businessType || !known.primaryGoal)) {
    return {
      decision: "ask_more",
      reason: "qualify_before_quote",
      confidence: Math.max(0.7, input.llmConfidence || 0.7),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "handle_objection",
      intent,
      nextQuestion: !known.businessType
        ? "Antes de falar de faixa, me diz rapidinho qual e o tipo do seu negocio hoje?"
        : "Antes de falar de faixa, qual e o principal objetivo comercial que voce quer destravar primeiro?",
      nextAction: "qualificar_antes_de_preco",
      recommendedOffer,
    };
  }

  if (!known.businessType || !known.primaryGoal) {
    return {
      decision: "ask_more",
      reason: "missing_commercial_context",
      confidence: Math.max(0.68, input.llmConfidence || 0.68),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: "coletar_contexto_comercial_minimo",
      recommendedOffer,
    };
  }

  if (intent === "growth_goal" && hasContext) {
    return {
      decision: "respond",
      reason: "growth_goal_with_context",
      confidence: Math.max(0.8, input.llmConfidence || 0.8),
      stateBefore,
      stateAfter: "recommendation",
      responseGoal: "recommend",
      intent,
      nextQuestion: known.urgency
        ? "Se fizer sentido, eu te mostro o proximo passo mais aderente para destravar isso no seu caso. Quer que eu te resuma?"
        : "Isso e uma prioridade para agora ou algo que voces querem estruturar nas proximas semanas?",
      nextAction: "conduzir_para_diagnostico_ou_reuniao",
      recommendedOffer,
    };
  }

  if (intent === "soft_objection" || textHasAny(input.inboundText, ["pensar", "depois", "sem pressa"])) {
    return {
      decision: "respond",
      reason: "soft_objection_handling",
      confidence: Math.max(0.71, input.llmConfidence || 0.71),
      stateBefore,
      stateAfter: "objection_handling",
      responseGoal: "handle_objection",
      intent,
      nextQuestion: "Se te ajudar, eu consigo resumir em uma linha o caminho mais aderente para o seu caso hoje. Quer que eu faca isso?",
      nextAction: "tratar_objecao_suave",
      recommendedOffer,
    };
  }

  return {
    decision: "respond",
    reason: input.llmReason || "context_ready_for_recommendation",
    confidence: Math.max(0.78, input.llmConfidence || 0.78),
    stateBefore,
    stateAfter: "recommendation",
    responseGoal: stateBefore === "recommendation" ? "move_to_next_step" : "recommend",
    intent,
    nextQuestion:
      "Se fizer sentido, eu te mostro o proximo passo mais aderente para o seu caso sem te empurrar escopo errado. Quer que eu te resuma isso?",
    nextAction: "conduzir_para_diagnostico_ou_reuniao",
    recommendedOffer,
  };
}

function buildShortBusinessSummary(summary: string) {
  const clean = sanitizeText(summary, 180);
  return clean || "IA, estrutura comercial, marketing e ativos digitais para vender melhor.";
}

export function writeAltumAgentReply(input: {
  plan: AltumPlannerDecision;
  tenantAi: TenantAiConfigLike;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  inboundText: string;
}) {
  const businessType = input.leadMemory?.businessType || "";
  const primaryGoal = input.leadMemory?.primaryGoal || "";
  const recommendedOffer = sanitizeText(input.plan.recommendedOffer, 160);

  if (input.plan.responseGoal === "welcome") {
    return `Oi! Tudo bem? ${input.plan.nextQuestion}`;
  }

  if (input.plan.responseGoal === "clarify") {
    return [
      `A ALTUM ajuda empresas a vender mais com ${buildShortBusinessSummary(input.tenantAi.businessSummary).toLowerCase()}`,
      input.plan.nextQuestion || "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "handle_objection" && input.plan.reason === "qualify_before_quote") {
    return [
      "Consigo te passar uma faixa, sim. So prefiro entender seu momento antes para te orientar sem te empurrar algo errado.",
      input.plan.nextQuestion || "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "handle_objection") {
    if (input.plan.reason === "price_with_context_ready") {
      const intro =
        businessType && primaryGoal
          ? `Consigo te passar uma faixa, sim. Pelo que voce trouxe de ${businessType} buscando ${primaryGoal.toLowerCase()}, isso depende do nivel de estrutura que faz sentido montar.`
          : "Consigo te passar uma faixa, sim. O valor real depende do nivel de estrutura que faz sentido montar para o seu caso.";
      return [intro, input.plan.nextQuestion || ""].filter(Boolean).join(" ");
    }

    return [
      "Faz sentido avaliar com calma.",
      input.plan.nextQuestion || "Se quiser, eu te ajudo a resumir o caminho mais aderente para o seu caso hoje.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "qualify") {
    const prefix =
      businessType && primaryGoal
        ? `Perfeito. Pelo que voce trouxe de ${businessType}, faz sentido aprofundar isso com contexto.`
        : businessType
          ? `Perfeito, sendo ${businessType}, eu consigo te orientar melhor sem te empurrar algo errado.`
          : input.runtimeState?.stage && input.runtimeState.stage !== "greeting"
            ? "Perfeito. Retomando de onde paramos, quero te orientar do jeito certo sem resetar a conversa."
            : "Perfeito. Quero te orientar do jeito certo, sem te enrolar.";
    return [prefix, input.plan.nextQuestion || ""].filter(Boolean).join(" ");
  }

  if (input.plan.responseGoal === "recommend" || input.plan.responseGoal === "move_to_next_step") {
    const intro =
      businessType && primaryGoal
        ? `Pelo que voce trouxe, sendo ${businessType} e buscando ${primaryGoal.toLowerCase()}, o caminho mais aderente aqui tende a ser ${recommendedOffer || "um diagnostico comercial rapido"}.`
        : `Pelo que voce trouxe, o caminho mais aderente aqui tende a ser ${recommendedOffer || "um diagnostico comercial rapido"}.`;
    return [
      intro,
      input.plan.nextQuestion || "Se fizer sentido, eu te mostro o proximo passo mais aderente para avancarmos.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return input.plan.nextQuestion || "Me conta so mais um ponto rapido para eu te orientar melhor.";
}

