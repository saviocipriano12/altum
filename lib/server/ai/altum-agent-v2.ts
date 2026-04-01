import type {
  AltumConversationRuntimeState,
  AltumConversationStage,
  AltumLeadMemory,
} from "@/lib/server/ai/runtime-state";
import type { AltumTenantLearningHints } from "@/lib/server/ai/tenant-learning";

type ConversationMessage = {
  id: string;
  text: string;
  sender: "agent" | "client" | "system";
  type?: string;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaDuration?: number | null;
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
  escalationTopics?: string[];
  playbookOffers: Array<{ title: string; targetProfile?: string; whenToOffer?: string }>;
  learningHints?: AltumTenantLearningHints | null;
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
  objectionType?: string | null;
  commercialTemperature?: "cold" | "warm" | "hot";
  nextQuestion?: string | null;
  nextAction?: string | null;
  recommendedOffer?: string | null;
};

function lastClientMessage(messages: ConversationMessage[]) {
  return [...messages].reverse().find((item) => item.sender === "client") || null;
}

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
  return terms.some((term) => {
    const normalizedTerm = normalizeWords(term).join(" ");
    if (!normalizedTerm) return false;
    return normalized.includes(normalizedTerm);
  });
}

function buildAllowedOffers(tenantAi: TenantAiConfigLike, kbDocs: KbDoc[]) {
  const titles = [
    ...tenantAi.playbookOffers.map((offer) => sanitizeText(offer.title, 160)),
    ...kbDocs
      .filter((doc) => doc.type === "catalog")
      .map((doc) => sanitizeText(doc.content.replace(/^oferta:\s*/i, ""), 160)),
  ].filter(Boolean);

  return Array.from(new Set(titles));
}

function findGroundedOfferMatch(rawOffer: string, allowedOffers: string[]) {
  const normalizedRaw = normalizeComparable(rawOffer);
  if (!normalizedRaw) return "";

  const exact = allowedOffers.find((offer) => normalizeComparable(offer) === normalizedRaw);
  if (exact) return exact;

  const partial = allowedOffers.find((offer) => {
    const normalizedOffer = normalizeComparable(offer);
    return normalizedOffer.includes(normalizedRaw) || normalizedRaw.includes(normalizedOffer);
  });

  return partial || "";
}

function mergeKnownFields(memory: AltumLeadMemory | null, extracted?: Record<string, string> | null) {
  const fields = {
    businessType: sanitizeText(extracted?.businessType || extracted?.niche || extracted?.segment, 120) || memory?.businessType || "",
    primaryGoal: sanitizeText(extracted?.primaryGoal || extracted?.goal || extracted?.objective, 180) || memory?.primaryGoal || "",
    budgetBand: sanitizeText(extracted?.budgetBand || extracted?.budget, 120) || memory?.budgetBand || "",
    urgency: sanitizeText(extracted?.urgency, 120) || memory?.urgency || "",
    currentChannels:
      sanitizeText(extracted?.currentChannels || extracted?.channels || extracted?.canais, 180) ||
      memory?.currentChannels ||
      "",
    digitalMaturity:
      sanitizeText(extracted?.digitalMaturity || extracted?.maturity || extracted?.structure, 160) ||
      memory?.digitalMaturity ||
      "",
    decisionMaker:
      sanitizeText(extracted?.decisionMaker || extracted?.decisor || extracted?.owner, 160) || memory?.decisionMaker || "",
    serviceInterest:
      sanitizeText(extracted?.serviceInterest || extracted?.offer, 160) || memory?.recommendedOffer || "",
    intent: sanitizeText(extracted?.intent, 120) || memory?.dominantIntent || "",
    objectionType:
      sanitizeText(extracted?.objectionType || extracted?.objection, 120) || memory?.dominantObjection || "",
  };
  return fields;
}

function detectIntent(text: string) {
  const raw = sanitizeText(text, 260).toLowerCase();
  if (/^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(raw)) return "greeting";
  if (/\b(quanto custa|custa quanto|qual o preco|qual o preço|qual valor)\b/.test(raw)) return "ask_price";
  if (/\b(qual e o seu nome|qual é o seu nome|quem e voce|quem é você|seu nome)\b/.test(raw)) return "ask_agent_identity";
  if (/^(sim|claro|pode|quero|ok|beleza|isso)\b/.test(raw)) return "affirmative";
  if (textHasAny(text, ["[audio recebido]", "[audio enviado]", "[voz recebida]"])) return "send_audio";
  if (textHasAny(text, ["[imagem recebida]", "[foto recebida]", "[print recebido]"])) return "send_image";
  if (textHasAny(text, ["[arquivo recebido]", "[documento recebido]", "[pdf recebido]"])) return "send_document";
  if (textHasAny(text, ["humano", "atendente", "pessoa", "alguem"])) return "request_human";
  if (textHasAny(text, ["agendar", "agenda", "reuniao", "diagnostico", "call"])) return "scheduling_interest";
  if (textHasAny(text, ["proposta", "orcamento formal", "manda proposta"])) return "proposal_interest";
  if (textHasAny(text, ["sem orcamento", "sem orçamento", "nao tenho orcamento", "nao tenho orçamento"])) {
    return "budget_objection";
  }
  if (textHasAny(text, ["sem tempo", "correria", "agora nao consigo", "agora nao da", "agora não dá"])) {
    return "timing_objection";
  }
  if (textHasAny(text, ["funciona mesmo", "nao sei se vale", "ja tentei", "já tentei", "nao confio", "não confio"])) {
    return "trust_objection";
  }
  if (textHasAny(text, ["preco", "valor", "orcamento", "investimento"])) return "ask_price";
  if (textHasAny(text, ["o que voces fazem", "o que fazem", "como funciona", "me explica", "nao entendi"])) {
    return "ask_services";
  }
  if (textHasAny(text, ["vou pensar", "depois vejo", "nao tenho certeza"])) return "soft_objection";
  if (textHasAny(text, ["quero vender mais", "aumentar minhas vendas", "mais vendas", "captar mais"])) return "growth_goal";
  if (textHasAny(text, ["site", "landing page", "lp"])) return "digital_assets";
  if (textHasAny(text, ["crm", "pipeline", "atendimento", "whatsapp", "ia"])) return "ops_or_ai";
  if (textHasAny(text, ["ola", "bom dia", "boa tarde", "boa noite"])) return "greeting";
  return "context_share";
}

function isLowClarityAudioText(text: string) {
  return textHasAny(text, [
    "fala pouco clara",
    "baixa clareza de transcricao",
    "baixa clareza de transcrição",
    "audio pouco claro",
    "audio com fala pouco clara",
  ]);
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

function inferCommercialTemperature(input: {
  intent: string;
  hasContext: boolean;
  stateBefore: AltumConversationStage;
}) {
  if (input.intent === "request_human" || input.intent === "proposal_interest" || input.intent === "scheduling_interest") {
    return "hot" as const;
  }
  if (input.hasContext && (input.intent === "ask_price" || input.stateBefore === "recommendation")) {
    return "hot" as const;
  }
  if (input.hasContext || input.intent === "growth_goal" || input.intent === "ops_or_ai") {
    return "warm" as const;
  }
  return "cold" as const;
}

function detectObjectionType(intent: string, inboundText: string) {
  if (intent === "budget_objection") return "budget";
  if (intent === "timing_objection") return "timing";
  if (intent === "trust_objection") return "trust";
  if (intent === "soft_objection") return "soft";
  if (textHasAny(inboundText, ["nao entendi", "como assim", "explica"])) return "clarity";
  if (intent === "ask_price") return "price";
  return "";
}

function matchesEscalationTopic(text: string, escalationTopics?: string[]) {
  if (!escalationTopics?.length) return false;
  const normalizedText = normalizeWords(text).join(" ");
  if (!normalizedText) return false;
  return escalationTopics.some((topic) => {
    const normalizedTopic = normalizeWords(topic).join(" ");
    if (!normalizedTopic) return false;
    return normalizedText.includes(normalizedTopic) || normalizedTopic.includes(normalizedText);
  });
}

function chooseNextQuestion(input: {
  messages: ConversationMessage[];
  mandatoryQuestions: string[];
  businessType?: string;
  primaryGoal?: string;
  currentChannels?: string;
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
  if (!input.currentChannels) {
    return "Hoje os leads de voces entram mais por onde: WhatsApp, Instagram, trafego, site ou indicacao?";
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
  const allowedOffers = buildAllowedOffers(input.tenantAi, input.kbDocs);

  if (input.serviceInterest) {
    const grounded = findGroundedOfferMatch(input.serviceInterest, allowedOffers);
    if (grounded) return grounded;
  }

  const learnedOffer = sanitizeText(input.tenantAi.learningHints?.topOffers?.[0], 160);
  if (learnedOffer && !textHasAny(learnedOffer, ["sem oferta"])) {
    const grounded = findGroundedOfferMatch(learnedOffer, allowedOffers);
    if (grounded) return grounded;
  }

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
    const grounded = findGroundedOfferMatch(content, allowedOffers);
    if (grounded) return grounded;
    if (content) return content;
  }

  return sanitizeText(input.tenantAi.playbookOffers[0]?.title, 160) || "diagnostico comercial e marketing";
}

function resolvePreferredClosingMotion(input: {
  intent: string;
  hasContext: boolean;
  stateBefore: AltumConversationStage;
  tenantAi: TenantAiConfigLike;
}) {
  if (input.intent === "proposal_interest") return "proposal" as const;
  if (input.intent === "scheduling_interest") return "meeting" as const;
  if (!input.hasContext) return null;
  if (input.stateBefore === "recommendation" || input.intent === "growth_goal" || input.intent === "ops_or_ai") {
    return input.tenantAi.learningHints?.preferredClosingMotion || null;
  }
  return null;
}

function buildRecommendationBridge(known: {
  businessType?: string;
  primaryGoal?: string;
  digitalMaturity?: string;
}) {
  if (known.businessType && known.primaryGoal) {
    return `Pelo que voce trouxe, sendo ${known.businessType} e buscando ${known.primaryGoal.toLowerCase()},`;
  }
  if (known.primaryGoal) {
    return `Pelo que voce trouxe buscando ${known.primaryGoal.toLowerCase()},`;
  }
  if (known.digitalMaturity) {
    return `Considerando o momento atual de ${known.digitalMaturity.toLowerCase()},`;
  }
  return "Pelo que voce trouxe,";
}

function hasKnownLeadName(contactName?: string | null) {
  const clean = sanitizeText(contactName, 80);
  if (!clean) return false;
  if (/\d{6,}/.test(clean)) return false;
  if (["lead", "contato", "cliente"].includes(clean.toLowerCase())) return false;
  return true;
}

function firstName(contactName?: string | null) {
  const clean = sanitizeText(contactName, 80);
  if (!hasKnownLeadName(clean)) return "";
  return clean.split(/\s+/)[0] || clean;
}

function scoreCommercialReadiness(known: {
  businessType?: string;
  primaryGoal?: string;
  urgency?: string;
  budgetBand?: string;
  serviceInterest?: string;
  decisionMaker?: string;
  currentChannels?: string;
}) {
  let score = 0;
  if (known.businessType) score += 1;
  if (known.primaryGoal) score += 1;
  if (known.serviceInterest) score += 1;
  if (known.urgency) score += 1;
  if (known.budgetBand) score += 1;
  if (known.decisionMaker) score += 1;
  if (known.currentChannels) score += 1;
  return score;
}

function isReadyForClosingStep(known: {
  businessType?: string;
  primaryGoal?: string;
  urgency?: string;
  budgetBand?: string;
  serviceInterest?: string;
  decisionMaker?: string;
  currentChannels?: string;
}) {
  if (!known.businessType || !known.primaryGoal) return false;
  return scoreCommercialReadiness(known) >= 4;
}

export function planAltumAgentDecision(input: {
  inboundText: string;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  contactName?: string | null;
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
  const latestClient = lastClientMessage(input.conversation);
  const latestClientType = latestClient?.type || "text";
  const intent =
    latestClientType === "audio"
      ? "send_audio"
      : latestClientType === "image"
        ? "send_image"
        : latestClientType === "document"
          ? "send_document"
          : detectIntent(input.inboundText);
  const known = mergeKnownFields(input.leadMemory, input.extractedFields);
  const hasContext = hasCommercialContext(known);
  const readyForClosingStep = isReadyForClosingStep(known);
  const commercialTemperature = inferCommercialTemperature({ intent, hasContext, stateBefore });
  const objectionType = detectObjectionType(intent, input.inboundText) || null;
  const matchedEscalationTopic = matchesEscalationTopic(input.inboundText, input.tenantAi.escalationTopics || []);
  const recommendedOffer = recommendOffer({
    inboundText: input.inboundText,
    businessType: known.businessType,
    primaryGoal: known.primaryGoal,
    serviceInterest: known.serviceInterest,
    kbDocs: input.kbDocs,
    tenantAi: input.tenantAi,
  });
  const preferredClosingMotion = resolvePreferredClosingMotion({
    intent,
    hasContext,
    stateBefore,
    tenantAi: input.tenantAi,
  });

  if (matchedEscalationTopic) {
    return {
      decision: "handoff",
      reason: "matched_escalation_topic",
      confidence: Math.max(0.84, input.llmConfidence || 0.84),
      stateBefore,
      stateAfter: "handoff",
      responseGoal: "handoff",
      intent,
      objectionType,
      commercialTemperature,
      nextAction: "assumir_handoff_humano",
      recommendedOffer,
    };
  }

  if (intent === "request_human") {
    return {
      decision: "handoff",
      reason: input.llmReason || "lead_requested_human",
      confidence: Math.max(0.72, input.llmConfidence || 0.72),
      stateBefore,
      stateAfter: "handoff",
      responseGoal: "handoff",
      intent,
      objectionType,
      commercialTemperature,
      nextAction: "assumir_handoff_humano",
      recommendedOffer,
    };
  }

  if (intent === "send_audio") {
    if (isLowClarityAudioText(input.inboundText)) {
      return {
        decision: "ask_more",
        reason: "audio_low_clarity",
        confidence: Math.max(0.72, input.llmConfidence || 0.72),
        stateBefore,
        stateAfter: hasContext ? "qualification" : "discovery",
        responseGoal: "qualify",
        intent,
        objectionType,
        commercialTemperature,
        nextQuestion:
          "Seu audio chegou com pouca clareza por aqui. Me resume em uma frase o ponto principal para eu te orientar sem adivinhar nada?",
        nextAction: "qualificar_contexto_minimo",
        recommendedOffer,
      };
    }

    return {
      decision: hasContext ? "respond" : "ask_more",
      reason: hasContext ? "audio_contextual_followup" : "audio_needs_context",
      confidence: Math.max(0.72, input.llmConfidence || 0.72),
      stateBefore,
      stateAfter: hasContext ? (stateBefore === "greeting" ? "discovery" : stateBefore) : "discovery",
      responseGoal: hasContext ? "clarify" : "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: hasContext
        ? "Se eu focar no que mais destrava seu caso hoje, o principal ponto esta em gerar demanda, atendimento ou conversao?"
        : "Me resume em uma frase o ponto principal desse audio para eu te orientar no caminho certo.",
      nextAction: hasContext ? "aprofundar_oportunidade" : "qualificar_contexto_minimo",
      recommendedOffer,
    };
  }

  if (intent === "send_image") {
    return {
      decision: "ask_more",
      reason: hasContext ? "image_needs_focus" : "image_needs_context",
      confidence: Math.max(0.7, input.llmConfidence || 0.7),
      stateBefore,
      stateAfter: hasContext ? "qualification" : "discovery",
      responseGoal: "clarify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: hasContext
        ? "Perfeito. O que voce quer que eu avalie nessa imagem: anuncio, site, conversa ou estrutura comercial?"
        : "Perfeito. Me diz so o contexto dessa imagem e o que voce quer entender nela.",
      nextAction: hasContext ? "esclarecer_oferta_e_mapear_foco" : "qualificar_contexto_minimo",
      recommendedOffer,
    };
  }

  if (intent === "send_document") {
    return {
      decision: "ask_more",
      reason: hasContext ? "document_needs_focus" : "document_needs_context",
      confidence: Math.max(0.68, input.llmConfidence || 0.68),
      stateBefore,
      stateAfter: hasContext ? "qualification" : "discovery",
      responseGoal: "clarify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: hasContext
        ? "Perfeito. O que voce quer que eu extraia desse arquivo para te orientar melhor?"
        : "Perfeito. Me diz so o que esse arquivo representa no seu contexto hoje.",
      nextAction: "esclarecer_oferta_e_mapear_foco",
      recommendedOffer,
    };
  }

  if (intent === "proposal_interest" && hasContext && readyForClosingStep) {
    return {
      decision: "respond",
      reason: "proposal_interest_with_context",
      confidence: Math.max(0.84, input.llmConfidence || 0.84),
      stateBefore,
      stateAfter: "proposal_path",
      responseGoal: "move_to_next_step",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: "Perfeito. Se fizer sentido, eu organizo isso em formato de proposta enxuta para avancarmos com clareza. Quer que eu encaminhe por esse caminho?",
      nextAction: "preparar_proposta_comercial",
      recommendedOffer,
    };
  }

  if (intent === "proposal_interest" && hasContext && !readyForClosingStep) {
    return {
      decision: "ask_more",
      reason: "proposal_interest_needs_more_context",
      confidence: Math.max(0.76, input.llmConfidence || 0.76),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion:
        known.urgency || known.budgetBand
          ? "Antes de eu estruturar isso como proposta, me diz so qual seria o primeiro resultado que voces querem destravar com mais urgencia."
          : "Antes de eu estruturar isso como proposta, me diz so o foco principal e o momento atual para eu nao te montar algo solto.",
      nextAction: "coletar_contexto_comercial_minimo",
      recommendedOffer,
    };
  }

  if (intent === "scheduling_interest" && hasContext && readyForClosingStep) {
    return {
      decision: "respond",
      reason: "schedule_interest_with_context",
      confidence: Math.max(0.86, input.llmConfidence || 0.86),
      stateBefore,
      stateAfter: "scheduling",
      responseGoal: "move_to_next_step",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: "Se fizer sentido, eu ja deixo isso no formato de proximo passo comercial para agendar com clareza. Quer que eu siga por ai?",
      nextAction: "agendar_proximo_passo",
      recommendedOffer,
    };
  }

  if (intent === "scheduling_interest" && hasContext && !readyForClosingStep) {
    return {
      decision: "ask_more",
      reason: "schedule_interest_needs_more_context",
      confidence: Math.max(0.78, input.llmConfidence || 0.78),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion:
        "Perfeito. Antes de eu te levar para reuniao sem contexto, me diz em uma linha o que voce quer resolver primeiro para eu te direcionar direito.",
      nextAction: "coletar_contexto_comercial_minimo",
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
      objectionType,
      commercialTemperature,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        currentChannels: known.currentChannels,
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
      objectionType,
      commercialTemperature,
      nextQuestion: hasKnownLeadName(input.contactName)
        ? "Me conta em uma linha o que voce quer melhorar hoje: gerar mais leads, organizar atendimento ou vender melhor?"
        : "Antes de tudo, como voce prefere que eu te chame?",
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
      objectionType,
      commercialTemperature,
      nextQuestion: hasContext
        ? "Se fizer sentido, eu te mostro o proximo passo mais aderente para o seu caso sem empurrar escopo errado. Quer que eu te resuma isso?"
        : known.primaryGoal
        ? chooseNextQuestion({
            messages: input.conversation,
            mandatoryQuestions: input.mandatoryQuestions,
            businessType: known.businessType,
            primaryGoal: known.primaryGoal,
            currentChannels: known.currentChannels,
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
      objectionType,
      commercialTemperature,
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
      objectionType,
      commercialTemperature,
      nextQuestion: !known.businessType
        ? "Antes de falar de faixa, me diz rapidinho qual e o tipo do seu negocio hoje?"
        : "Antes de falar de faixa, qual e o principal objetivo comercial que voce quer destravar primeiro?",
      nextAction: "qualificar_antes_de_preco",
      recommendedOffer,
    };
  }

  if (intent === "ask_agent_identity") {
    return {
      decision: "respond",
      reason: "agent_identity_requested",
      confidence: Math.max(0.86, input.llmConfidence || 0.86),
      stateBefore,
      stateAfter: hasContext ? stateBefore : "discovery",
      responseGoal: hasContext ? "clarify" : "welcome",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: hasContext
        ? chooseNextQuestion({
            messages: input.conversation,
            mandatoryQuestions: input.mandatoryQuestions,
            businessType: known.businessType,
            primaryGoal: known.primaryGoal,
            currentChannels: known.currentChannels,
            budgetBand: known.budgetBand,
            urgency: known.urgency,
          })
        : hasKnownLeadName(input.contactName)
          ? "E me conta: o que voce quer melhorar primeiro hoje no comercial?"
          : "Antes de avancarmos, como voce prefere que eu te chame?",
      nextAction: hasContext ? "retomar_descoberta_com_contexto" : "acolher_e_personalizar_conversa",
      recommendedOffer,
    };
  }

  if (intent === "affirmative" && stateBefore === "recommendation") {
    return {
      decision: "respond",
      reason: "affirmative_after_recommendation",
      confidence: Math.max(0.84, input.llmConfidence || 0.84),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        currentChannels: known.currentChannels,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: "aprofundar_contexto_antes_do_proximo_passo",
      recommendedOffer,
    };
  }

  if (intent === "budget_objection" || intent === "timing_objection" || intent === "trust_objection") {
    return {
      decision: "respond",
      reason: `${intent}_detected`,
      confidence: Math.max(0.76, input.llmConfidence || 0.76),
      stateBefore,
      stateAfter: "objection_handling",
      responseGoal: "handle_objection",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion:
        intent === "budget_objection"
          ? "Se fizer sentido, eu consigo te mostrar o caminho mais enxuto para validar isso sem dar um passo maior que o necessario. Quer que eu te resuma?"
          : intent === "timing_objection"
            ? "Se te ajudar, eu te deixo isso em um proximo passo bem objetivo para voce avaliar sem perder tempo. Quer que eu te resuma?"
            : "Se fizer sentido, eu te mostro em uma linha onde isso encaixa no seu caso para voce avaliar com mais criterio. Quer que eu faca isso?",
      nextAction:
        intent === "budget_objection"
          ? "tratar_objecao_orcamento"
          : intent === "timing_objection"
            ? "tratar_objecao_tempo"
            : "tratar_objecao_confianca",
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
      objectionType,
      commercialTemperature,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        currentChannels: known.currentChannels,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: "coletar_contexto_comercial_minimo",
      recommendedOffer,
    };
  }

  if (!readyForClosingStep && !known.currentChannels) {
    return {
      decision: "ask_more",
      reason: "needs_channel_context_before_recommendation",
      confidence: Math.max(0.79, input.llmConfidence || 0.79),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        currentChannels: known.currentChannels,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: "aprofundar_contexto_comercial",
      recommendedOffer,
    };
  }

  if (!readyForClosingStep && intent !== "ask_price") {
    return {
      decision: "respond",
      reason: "qualify_more_before_recommendation",
      confidence: Math.max(0.8, input.llmConfidence || 0.8),
      stateBefore,
      stateAfter: "qualification",
      responseGoal: "qualify",
      intent,
      objectionType,
      commercialTemperature,
      nextQuestion: chooseNextQuestion({
        messages: input.conversation,
        mandatoryQuestions: input.mandatoryQuestions,
        businessType: known.businessType,
        primaryGoal: known.primaryGoal,
        currentChannels: known.currentChannels,
        budgetBand: known.budgetBand,
        urgency: known.urgency,
      }),
      nextAction: "aprofundar_contexto_antes_do_proximo_passo",
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
      objectionType,
      commercialTemperature,
      nextQuestion: known.urgency
        ? "Se fizer sentido, eu te mostro o proximo passo mais aderente para destravar isso no seu caso. Quer que eu te resuma?"
        : "Isso e uma prioridade para agora ou algo que voces querem estruturar nas proximas semanas?",
      nextAction:
        readyForClosingStep && preferredClosingMotion === "proposal"
          ? "preparar_proposta_comercial"
          : "conduzir_para_diagnostico_ou_reuniao",
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
      objectionType,
      commercialTemperature,
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
    objectionType,
    commercialTemperature,
    nextQuestion:
      "Se fizer sentido, eu te mostro o proximo passo mais aderente para o seu caso sem te empurrar escopo errado. Quer que eu te resuma isso?",
    nextAction:
      readyForClosingStep && preferredClosingMotion === "proposal"
        ? "preparar_proposta_comercial"
        : "conduzir_para_diagnostico_ou_reuniao",
    recommendedOffer,
  };
}

function buildShortBusinessSummary(summary: string) {
  const clean = sanitizeText(summary, 180);
  if (!clean) return "IA, estrutura comercial, marketing e ativos digitais para vender melhor.";
  return clean
    .replace(/^a altum ajuda empresas a vender mais com\s*/i, "")
    .replace(/^a altum ajuda\s*/i, "")
    .replace(/^ajuda empresas a vender mais com\s*/i, "");
}

export function writeAltumAgentReply(input: {
  plan: AltumPlannerDecision;
  tenantAi: TenantAiConfigLike;
  runtimeState: AltumConversationRuntimeState | null;
  leadMemory: AltumLeadMemory | null;
  contactName?: string | null;
  inboundText: string;
}) {
  const businessType = input.leadMemory?.businessType || "";
  const primaryGoal = input.leadMemory?.primaryGoal || "";
  const recommendedOffer = sanitizeText(input.plan.recommendedOffer, 160);
  const currentChannels = sanitizeText(input.leadMemory?.currentChannels, 180);
  const leadFirstName = firstName(input.contactName);
  const bridge = buildRecommendationBridge({
    businessType,
    primaryGoal,
    digitalMaturity: input.leadMemory?.digitalMaturity || "",
  });

  if (input.plan.intent === "send_audio") {
    return input.plan.decision === "respond"
      ? [
          "Perfeito, recebi seu audio.",
          "Para te orientar sem enrolar, vou focar no ponto que mais destrava seu caso agora.",
          input.plan.nextQuestion || "",
        ]
          .filter(Boolean)
          .join(" ")
      : [
          "Perfeito, recebi seu audio.",
          "Para eu te responder com precisao e sem te empurrar algo errado,",
          input.plan.nextQuestion || "",
        ]
          .filter(Boolean)
          .join(" ");
  }

  if (input.plan.intent === "send_image") {
    return ["Perfeito, recebi a imagem.", "Para eu te orientar do jeito certo,", input.plan.nextQuestion || ""]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.intent === "send_document") {
    return ["Perfeito, recebi o arquivo.", "Para eu te ajudar de forma objetiva,", input.plan.nextQuestion || ""]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "welcome") {
    return `${leadFirstName ? `Oi, ${leadFirstName}!` : "Oi!"} Tudo bem? ${input.plan.nextQuestion}`;
  }

  if (input.plan.responseGoal === "clarify") {
    if (input.plan.reason === "agent_identity_requested") {
      return [
        "Eu sou a IA comercial da equipe ALTUM.",
        "Estou aqui para te orientar com clareza e sem te empurrar nada fora do seu momento.",
        input.plan.nextQuestion || "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const businessLine =
      businessType || currentChannels
        ? [
            businessType ? `No seu contexto de ${businessType.toLowerCase()},` : "",
            currentChannels ? `vendo que hoje voces ja atuam com ${currentChannels.toLowerCase()},` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : "";
    return [
      businessLine ||
        `A ALTUM ajuda empresas a vender mais com ${buildShortBusinessSummary(input.tenantAi.businessSummary).toLowerCase()}.`,
      input.plan.nextQuestion || "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "handle_objection" && input.plan.reason === "qualify_before_quote") {
    return [
      "Consigo te passar uma faixa, sim.",
      "So quero alinhar rapidinho seu contexto para nao te jogar um numero solto que depois nao faca sentido no seu caso.",
      input.plan.nextQuestion || "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "handle_objection") {
    if (input.plan.objectionType === "budget") {
      return [
        "Sem problema. Nem sempre faz sentido comecar grande.",
        "Se fizer sentido, eu te mostro o caminho mais enxuto para validar isso sem travar sua operacao nem te empurrar investimento fora de hora.",
        input.plan.nextQuestion || "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (input.plan.objectionType === "timing") {
      return [
        "Entendo. Para nao te tomar tempo, eu consigo resumir o caminho mais aderente em uma linha e voce avalia no seu ritmo.",
        input.plan.nextQuestion || "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (input.plan.objectionType === "trust") {
      return [
        "Faz sentido ter esse cuidado.",
        "Meu papel aqui e te orientar com clareza, sem promessa solta e sem te empurrar algo errado.",
        input.plan.nextQuestion || "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (input.plan.reason === "price_with_context_ready") {
      const intro =
        businessType && primaryGoal
          ? `Consigo te passar uma faixa, sim. Pelo que voce trouxe de ${businessType} buscando ${primaryGoal.toLowerCase()}, isso varia conforme o nivel de estrutura que realmente vale montar no seu caso.`
          : "Consigo te passar uma faixa, sim. O valor real varia conforme a estrutura que faz sentido para o seu caso hoje.";
      return [intro, input.plan.nextQuestion || ""].filter(Boolean).join(" ");
    }

    return [
      "Faz sentido avaliar com calma.",
      input.plan.nextQuestion || "Se quiser, eu te deixo isso bem mastigado em uma linha para voce decidir com calma.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (input.plan.responseGoal === "qualify") {
    if (input.plan.reason === "affirmative_after_recommendation") {
      return [
        "Perfeito. Entao vamos deixar isso mais preciso antes de eu te sugerir o proximo passo.",
        input.plan.nextQuestion || "",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const prefix =
      businessType && primaryGoal
        ? `Perfeito. Pelo que voce trouxe de ${businessType}, faz sentido aprofundar isso com um pouco mais de contexto.`
        : businessType
          ? `Perfeito, sendo ${businessType}, eu consigo te orientar melhor sem te empurrar algo errado.`
          : input.runtimeState?.stage && input.runtimeState.stage !== "greeting"
            ? "Perfeito. Retomando de onde paramos, quero te orientar do jeito certo sem resetar a conversa."
            : "Perfeito. Quero te orientar do jeito certo, sem te enrolar.";
    return [prefix, input.plan.nextQuestion || ""].filter(Boolean).join(" ");
  }

  if (input.plan.responseGoal === "recommend" || input.plan.responseGoal === "move_to_next_step") {
    if (input.plan.nextAction === "agendar_proximo_passo") {
      return [
        `${bridge} o proximo passo mais aderente aqui e uma conversa curta para encaixar isso direito sem perder tempo.`,
        input.plan.nextQuestion || "Se fizer sentido, eu ja deixo esse caminho encaminhado com clareza.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    if (input.plan.nextAction === "preparar_proposta_comercial") {
      return [
        `${bridge} o caminho mais aderente aqui e organizar isso em uma proposta objetiva, sem inflar escopo nem te empurrar algo fora do momento.`,
        input.plan.nextQuestion || "Se fizer sentido, eu sigo nessa linha e estruturo isso de um jeito bem claro.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    const intro = `${bridge} o caminho mais aderente aqui tende a ser ${recommendedOffer || "um diagnostico comercial rapido"}.`;
    return [
      intro,
      input.plan.nextQuestion || "Se fizer sentido, eu te mostro o proximo passo mais aderente para avancarmos sem complicar.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return input.plan.nextQuestion || "Me conta so mais um ponto rapido para eu te orientar melhor.";
}

