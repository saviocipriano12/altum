import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";
import type { AltumConversationRuntimeState } from "@/lib/server/ai/runtime-state";

function cleanText(value: unknown, max = 1200) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeText(value: string) {
  return cleanText(value, 1200)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type QualityInput = {
  inboundText: string;
  outboundText: string;
  plan: AltumPlannerDecision;
  runtimeState: AltumConversationRuntimeState | null;
};

export type AltumQualityResult = {
  score: number;
  notes: string[];
};

export function scoreAltumConversationQuality(input: QualityInput): AltumQualityResult {
  const inbound = cleanText(input.inboundText, 900);
  const outbound = cleanText(input.outboundText, 1600);
  const outboundNormalized = normalizeText(outbound);
  const previousOutbound = normalizeText(input.runtimeState?.lastOutboundText || "");
  const notes: string[] = [];
  let score = 0.62;

  if (typeof input.plan.confidence === "number") {
    score += Math.max(-0.1, Math.min(0.15, (input.plan.confidence - 0.5) * 0.5));
  }

  if (outbound.length >= 30 && outbound.length <= 340) {
    score += 0.12;
    notes.push("resposta_curta");
  } else if (outbound.length > 520) {
    score -= 0.16;
    notes.push("resposta_longa");
  } else if (outbound.length < 18) {
    score -= 0.1;
    notes.push("resposta_curta_demais");
  }

  const questionMarks = (outbound.match(/\?/g) || []).length;
  if (questionMarks <= 1) {
    score += 0.06;
    notes.push("uma_pergunta_por_vez");
  } else {
    score -= 0.08;
    notes.push("perguntas_em_excesso");
  }

  if (input.plan.stateAfter !== input.plan.stateBefore) {
    score += 0.08;
    notes.push("progrediu_estado");
  }

  if (input.plan.nextAction) {
    score += 0.05;
    notes.push("proximo_passo_definido");
  }

  if (input.plan.recommendedOffer && ["recommendation", "proposal_path", "scheduling"].includes(input.plan.stateAfter)) {
    score += 0.05;
    notes.push("oferta_sugerida");
  }

  if (previousOutbound && previousOutbound === outboundNormalized) {
    score -= 0.2;
    notes.push("resposta_repetida");
  }

  if (previousOutbound && outboundNormalized.includes(previousOutbound.slice(0, 80))) {
    score -= 0.08;
    notes.push("muito_parecida_com_a_anterior");
  }

  if (
    outboundNormalized.includes("faq") ||
    outboundNormalized.includes("politica") ||
    outboundNormalized.includes("policy") ||
    outboundNormalized.includes("playbook") ||
    outboundNormalized.includes("guardrail") ||
    outboundNormalized.includes("catalogo")
  ) {
    score -= 0.22;
    notes.push("vazou_jargao_interno");
  }

  if (normalizeText(inbound) && outboundNormalized.includes(normalizeText(inbound).slice(0, 90))) {
    score -= 0.04;
    notes.push("ecoou_mensagem_do_lead");
  }

  if (input.plan.decision === "handoff") {
    score += input.plan.confidence >= 0.75 ? 0.04 : -0.02;
    notes.push("handoff_controlado");
  }

  if (input.plan.decision === "ask_more" && questionMarks === 1 && outbound.length <= 260) {
    score += 0.05;
    notes.push("qualificacao_enxuta");
  }

  score = Math.max(0, Math.min(0.99, Number(score.toFixed(3))));
  return { score, notes };
}
