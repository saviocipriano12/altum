import { suggestPipelineStageForAiAction } from "@/lib/ai-next-actions";
import { normalizePipelineStageId, type PipelineStageDefinition } from "@/lib/pipeline";

export type LeadQualificationReason = {
  code: string;
  label: string;
  detail: string;
  direction: "positive" | "negative";
  impact: number;
};

export type LeadQualification = {
  score: number;
  band: "cold" | "warming" | "sales_ready" | "handoff";
  label: string;
  recommendedStage: string;
  nextAction: string;
  missingFields: string[];
  reasonCodes: string[];
  reasons: LeadQualificationReason[];
  aiSignal: {
    decision: string | null;
    nextAction: string | null;
    confidence: number | null;
  };
  updatedAt: string;
};

function cleanText(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function createReason(input: LeadQualificationReason) {
  return input;
}

function inferBand(score: number, nextAction: string | null) {
  if (nextAction === "assumir_handoff_humano") {
    return {
      band: "handoff" as const,
      label: "Pronto para handoff",
      nextAction: "alertar_humano",
    };
  }
  if (score >= 75) {
    return {
      band: "sales_ready" as const,
      label: "Pronto para proposta ou reuniao",
      nextAction: "agendar_reuniao_ou_proposta",
    };
  }
  if (score >= 45) {
    return {
      band: "warming" as const,
      label: "Em qualificacao ativa",
      nextAction: "aprofundar_descoberta",
    };
  }
  return {
    band: "cold" as const,
    label: "Precisa qualificar melhor",
    nextAction: "coletar_contexto_minimo",
  };
}

export function evaluateLeadQualification(input: {
  lead: Record<string, unknown>;
  stages: PipelineStageDefinition[];
  aiSignals?: Array<Record<string, unknown>>;
  relatedChats?: Array<Record<string, unknown>>;
}) {
  const reasons: LeadQualificationReason[] = [];
  const missingFields: string[] = [];
  const aiSignal = (input.aiSignals || [])[0] || {};
  const aiNextAction = cleanText(aiSignal.nextAction, 120).toLowerCase() || null;
  const aiDecision = cleanText(aiSignal.decision, 40).toLowerCase() || null;
  const aiConfidence = cleanNumber(aiSignal.confidence);

  let score = 10;

  const nome = cleanText(input.lead.nome, 180);
  const email = cleanText(input.lead.email, 180);
  const telefone = cleanText(input.lead.telefone, 40);
  const empresa = cleanText(input.lead.empresa, 180);
  const customFields = asRecord(input.lead.customFields);
  const aiMemory = asRecord(input.lead.aiMemory);
  const notes = cleanText(input.lead.notes || input.lead.aiLeadSummary, 2000);
  const source = cleanText(input.lead.origem || input.lead.channel, 120);
  const businessType = cleanText(
    input.lead.aiBusinessType || aiMemory.businessType || customFields.nicho,
    160
  );
  const primaryGoal = cleanText(
    input.lead.aiPrimaryGoal || aiMemory.primaryGoal || customFields.objetivo_principal,
    220
  );
  const budgetBand = cleanText(
    input.lead.aiBudgetBand || aiMemory.budgetBand || customFields.orcamento || customFields.budget,
    160
  );
  const urgency = cleanText(
    input.lead.aiUrgency || aiMemory.urgency || customFields.urgencia,
    120
  );
  const decisionMaker = cleanText(
    input.lead.aiDecisionMaker || aiMemory.decisionMaker || customFields.decisor,
    160
  );
  const recommendedOffer = cleanText(
    input.lead.aiRecommendedOffer || aiMemory.recommendedOffer || aiMemory.serviceInterest || customFields.servico_interesse,
    180
  );
  const potentialValue =
    cleanNumber(input.lead.potentialValue) ??
    cleanNumber(input.lead.valorPotencial) ??
    cleanNumber(customFields.budget) ??
    null;
  const relatedChats = input.relatedChats || [];

  if (nome) {
    score += 8;
    reasons.push(createReason({
      code: "contact_name_present",
      label: "Identificacao basica",
      detail: "O lead ja tem nome cadastrado.",
      direction: "positive",
      impact: 8,
    }));
  } else {
    missingFields.push("nome");
  }

  if (telefone) {
    score += 15;
    reasons.push(createReason({
      code: "contact_phone_present",
      label: "Canal direto aberto",
      detail: "Existe telefone valido para follow-up comercial.",
      direction: "positive",
      impact: 15,
    }));
  } else {
    missingFields.push("telefone");
    reasons.push(createReason({
      code: "missing_phone",
      label: "Sem telefone confirmado",
      detail: "A operacao fica dependente de outro canal para responder rapido.",
      direction: "negative",
      impact: -8,
    }));
  }

  if (email) {
    score += 10;
    reasons.push(createReason({
      code: "contact_email_present",
      label: "Contato assincrono disponivel",
      detail: "Existe email para proposta, recap ou agenda.",
      direction: "positive",
      impact: 10,
    }));
  } else {
    missingFields.push("email");
  }

  if (empresa) {
    score += 12;
    reasons.push(createReason({
      code: "company_identified",
      label: "Empresa identificada",
      detail: "Ja existe contexto B2B minimo para qualificar melhor.",
      direction: "positive",
      impact: 12,
    }));
  }

  if (typeof potentialValue === "number" && potentialValue > 0) {
    score += potentialValue >= 3000 ? 18 : 10;
    reasons.push(createReason({
      code: "budget_signal_detected",
      label: "Sinal de valor comercial",
      detail: `Valor potencial informado em ${potentialValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      direction: "positive",
      impact: potentialValue >= 3000 ? 18 : 10,
    }));
  }

  if (notes.length >= 60) {
    score += 8;
    reasons.push(createReason({
      code: "commercial_context_captured",
      label: "Resumo comercial registrado",
      detail: "Ja existe contexto suficiente para continuidade humana.",
      direction: "positive",
      impact: 8,
    }));
  }

  if (source) {
    score += 4;
    reasons.push(createReason({
      code: "source_attributed",
      label: "Origem rastreada",
      detail: `Lead entrou por ${source}.`,
      direction: "positive",
      impact: 4,
    }));
  }

  if (businessType) {
    score += 8;
    reasons.push(createReason({
      code: "business_type_mapped",
      label: "Negocio compreendido",
      detail: `A IA identificou o contexto como ${businessType}.`,
      direction: "positive",
      impact: 8,
    }));
  } else {
    missingFields.push("tipo_empresa");
  }

  if (primaryGoal) {
    score += 12;
    reasons.push(createReason({
      code: "primary_goal_mapped",
      label: "Objetivo comercial identificado",
      detail: primaryGoal,
      direction: "positive",
      impact: 12,
    }));
  } else {
    missingFields.push("objetivo");
  }

  if (budgetBand || potentialValue) {
    if (budgetBand) {
      score += 10;
      reasons.push(createReason({
        code: "budget_band_mapped",
        label: "Investimento compreendido",
        detail: budgetBand,
        direction: "positive",
        impact: 10,
      }));
    }
  } else {
    missingFields.push("orcamento");
  }

  if (urgency) {
    score += 6;
    reasons.push(createReason({
      code: "urgency_mapped",
      label: "Prazo ou urgencia identificado",
      detail: urgency,
      direction: "positive",
      impact: 6,
    }));
  } else {
    missingFields.push("urgencia");
  }

  if (decisionMaker) {
    score += 6;
    reasons.push(createReason({
      code: "decision_maker_mapped",
      label: "Decisor identificado",
      detail: decisionMaker,
      direction: "positive",
      impact: 6,
    }));
  }

  if (recommendedOffer) {
    score += 8;
    reasons.push(createReason({
      code: "recommended_offer_mapped",
      label: "Oferta conectada a necessidade",
      detail: recommendedOffer,
      direction: "positive",
      impact: 8,
    }));
  }

  if (relatedChats.length > 0) {
    score += 10;
    reasons.push(createReason({
      code: "conversation_exists",
      label: "Conversa ativa conectada",
      detail: "Existe historico conversacional para avaliar intencao.",
      direction: "positive",
      impact: 10,
    }));
  }

  if (aiDecision === "handoff") {
    score += 18;
    reasons.push(createReason({
      code: "handoff_requested",
      label: "IA pediu apoio humano",
      detail: "A conversa ja exige atuacao humana com contexto preservado.",
      direction: "positive",
      impact: 18,
    }));
  }

  if (aiConfidence !== null) {
    const confidencePoints = Math.round(aiConfidence * 12);
    score += confidencePoints;
    reasons.push(createReason({
      code: "ai_confidence_signal",
      label: "Confianca operacional da IA",
      detail: `Ultima confianca registrada: ${Math.round(aiConfidence * 100)}%.`,
      direction: "positive",
      impact: confidencePoints,
    }));
  }

  if (
    aiNextAction === "preparar_proposta_comercial" ||
    aiNextAction === "agendar_proximo_passo" ||
    aiNextAction === "conduzir_para_diagnostico_ou_reuniao"
  ) {
    score += 20;
    reasons.push(createReason({
      code: "high_intent_next_action",
      label: "Proximo passo de alta intencao",
      detail: `A IA sugeriu ${aiNextAction.replaceAll("_", " ")}.`,
      direction: "positive",
      impact: 20,
    }));
  }

  if (
    aiNextAction === "qualificar_contexto_minimo" ||
    aiNextAction === "coletar_contexto_comercial_minimo" ||
    aiNextAction === "coletar_campos_obrigatorios"
  ) {
    reasons.push(createReason({
      code: "qualification_gap_detected",
      label: "Contexto comercial ainda incompleto",
      detail: "A IA ainda esta tentando fechar o minimo para qualificar.",
      direction: "negative",
      impact: -6,
    }));
    score -= 6;
  }

  if (!empresa && !potentialValue && !budgetBand) {
    missingFields.push("empresa_ou_budget");
  }

  score = Math.max(0, Math.min(100, score));

  const band = inferBand(score, aiNextAction);
  const recommendedStage =
    suggestPipelineStageForAiAction(
      aiNextAction,
      input.stages.map((stage) => stage.id)
    ) ||
    (score >= 80
      ? "proposta"
      : score >= 55
        ? "qualificacao"
        : score >= 30
          ? "contato"
          : "captado");

  return {
    score,
    band: band.band,
    label: band.label,
    recommendedStage: normalizePipelineStageId(recommendedStage),
    nextAction: band.nextAction,
    missingFields: Array.from(new Set(missingFields)),
    reasonCodes: reasons.map((item) => item.code),
    reasons: reasons.slice(0, 8),
    aiSignal: {
      decision: aiDecision,
      nextAction: aiNextAction,
      confidence: aiConfidence,
    },
    updatedAt: new Date().toISOString(),
  } satisfies LeadQualification;
}
