import type { AltumPlannerDecision } from "@/lib/server/ai/altum-agent-v2";

type CoreDecision = "respond" | "ask_more" | "handoff";

type FallbackChoice = {
  decision: CoreDecision;
  reason: string;
  confidence: number;
  nextAction?: string;
  responseText?: string | null;
};

type ResolveConversationalChoiceInput = {
  plannerDecision: AltumPlannerDecision;
  fallbackChoice: FallbackChoice;
  inboundText: string;
  llmDecision?: "respond" | "ask_more" | "handoff" | "skip" | null;
  llmReason?: string | null;
  llmConfidence?: number | null;
  llmNextAction?: string | null;
  llmResponseText?: string | null;
  llmTurnGoal?: string | null;
};

export type ConversationalChoice = {
  decision: CoreDecision;
  reason: string;
  confidence: number;
  nextAction: string;
  responseText: string | null;
  ledBy: "llm" | "planner" | "fallback";
};

function sanitizeText(value: unknown, max = 220) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function classifyTurn(value: string) {
  const normalized = sanitizeText(value, 260)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const isGreeting = /^(oi|ola|olá|bom dia|boa tarde|boa noite)\b/.test(normalized);
  const isDirectQuestion = normalized.includes("?");
  const isRelational =
    /\b(como voce esta|como voce ta|como vai|tudo bem|tudo certo|obrigad|valeu)\b/.test(normalized) ||
    /\b(rs|kkk|haha|hehe|blz|beleza|show|massa)\b/.test(normalized) ||
    /\b(voce e rapido|voce e rapida|você é rapido|você é rápida)\b/.test(normalized);

  return { isGreeting, isDirectQuestion, isRelational };
}

function shouldLetLlmLead(input: ResolveConversationalChoiceInput) {
  const usableResponse = sanitizeText(input.llmResponseText, 1600);
  if (!usableResponse) return false;
  if (input.plannerDecision.decision === "handoff") return false;
  if (input.llmDecision === "handoff") return false;

  const turn = classifyTurn(input.inboundText);
  const turnGoal = sanitizeText(input.llmTurnGoal || "", 140).toLowerCase();
  const confidence = input.llmConfidence || 0;

  if (turn.isGreeting || turn.isDirectQuestion || turn.isRelational) return true;
  if (input.plannerDecision.reason === "grounding_missing_context") return true;
  if (confidence >= 0.58) return true;

  return /(acolher|boas vindas|welcome|clarify|esclarecer|aprofundar|investigar|entender|qualify|discovery|responder|conversar)/i.test(
    turnGoal
  );
}

export function resolveConversationalChoice(input: ResolveConversationalChoiceInput): ConversationalChoice {
  if (input.plannerDecision.decision === "handoff") {
    return {
      decision: "handoff",
      reason: input.plannerDecision.reason || input.fallbackChoice.reason,
      confidence: input.plannerDecision.confidence || input.fallbackChoice.confidence,
      nextAction:
        sanitizeText(input.plannerDecision.nextAction, 160) ||
        sanitizeText(input.fallbackChoice.nextAction, 160) ||
        "assumir_handoff_humano",
      responseText: sanitizeText(input.llmResponseText, 1600) || null,
      ledBy: "planner",
    };
  }

  if (shouldLetLlmLead(input)) {
    const groundedAskMore = input.plannerDecision.reason === "grounding_missing_context";
    const llmDecision =
      input.llmDecision === "ask_more" || groundedAskMore
        ? "ask_more"
        : input.llmDecision === "respond"
          ? "respond"
          : "respond";

    return {
      decision: llmDecision,
      reason:
        sanitizeText(input.llmReason, 180) ||
        (groundedAskMore ? "grounding_missing_context" : "") ||
        input.plannerDecision.reason ||
        input.fallbackChoice.reason,
      confidence: Math.max(
        groundedAskMore ? 0.68 : 0.62,
        Math.min(input.llmConfidence || 0.62, 0.96)
      ),
      nextAction:
        sanitizeText(input.llmNextAction, 160) ||
        sanitizeText(input.plannerDecision.nextAction, 160) ||
        sanitizeText(input.fallbackChoice.nextAction, 160) ||
        "aprofundar_oportunidade",
      responseText: sanitizeText(input.llmResponseText, 1600) || null,
      ledBy: "llm",
    };
  }

  return {
    decision: input.plannerDecision.decision,
    reason: input.plannerDecision.reason || input.fallbackChoice.reason,
    confidence: input.plannerDecision.confidence || input.fallbackChoice.confidence,
    nextAction:
      sanitizeText(input.plannerDecision.nextAction, 160) ||
      sanitizeText(input.fallbackChoice.nextAction, 160) ||
      "aprofundar_oportunidade",
    responseText: null,
    ledBy: "planner",
  };
}
