type CoreDecision = "respond" | "ask_more" | "handoff";

type FallbackChoice = {
  decision: CoreDecision;
  reason: string;
  confidence: number;
  nextAction?: string;
  responseText?: string | null;
};

type ResolveConversationalChoiceInput = {
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
  ledBy: "llm" | "fallback";
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

  const isGreeting = /^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalized);
  const isDirectQuestion = normalized.includes("?");
  const isRelational =
    /\b(como voce esta|como voce ta|como vai|tudo bem|tudo certo|obrigad|valeu)\b/.test(normalized) ||
    /\b(rs|kkk|haha|hehe|blz|beleza|show|massa)\b/.test(normalized) ||
    /\b(voce e rapido|voce e rapida)\b/.test(normalized);

  return { isGreeting, isDirectQuestion, isRelational };
}

function looksLikeTemplate(value: string) {
  const normalized = sanitizeText(value, 500)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (!normalized) return true;

  return (
    (/\b(o que voce quer melhorar hoje|como posso te ajudar hoje)\b/.test(normalized) &&
      /\b(gerar mais leads|organizar atendimento|vender melhor)\b/.test(normalized)) ||
    /\b(a altum atua com|o caminho que mais faz sentido aqui tende a ser|me ajuda com so mais um ponto)\b/.test(normalized)
  );
}

function shouldTrustLlm(input: ResolveConversationalChoiceInput) {
  const usableResponse = sanitizeText(input.llmResponseText, 1800);
  if (!usableResponse) return false;
  if (input.llmDecision === "skip" || !input.llmDecision) return false;

  const turn = classifyTurn(input.inboundText);
  const turnGoal = sanitizeText(input.llmTurnGoal || "", 140).toLowerCase();

  if (turn.isGreeting || turn.isDirectQuestion || turn.isRelational) return true;
  if (!looksLikeTemplate(usableResponse) && usableResponse.length >= 12) return true;

  return /(acolher|boas vindas|esclarecer|aprofundar|investigar|entender|qualify|discovery|responder|conversar)/i.test(
    turnGoal
  );
}

export function resolveConversationalChoice(input: ResolveConversationalChoiceInput): ConversationalChoice {
  if (shouldTrustLlm(input)) {
    const llmDecision =
      input.llmDecision === "handoff"
        ? "handoff"
        : input.llmDecision === "ask_more"
          ? "ask_more"
          : "respond";

    return {
      decision: llmDecision,
      reason: sanitizeText(input.llmReason, 180) || input.fallbackChoice.reason,
      confidence: Math.max(0.52, Math.min(input.llmConfidence || 0.6, 0.96)),
      nextAction:
        sanitizeText(input.llmNextAction, 160) ||
        sanitizeText(input.fallbackChoice.nextAction, 160) ||
        "aprofundar_oportunidade",
      responseText: sanitizeText(input.llmResponseText, 1800) || null,
      ledBy: "llm",
    };
  }

  return {
    decision: input.fallbackChoice.decision,
    reason: input.fallbackChoice.reason,
    confidence: input.fallbackChoice.confidence,
    nextAction: sanitizeText(input.fallbackChoice.nextAction, 160) || "aprofundar_oportunidade",
    responseText: sanitizeText(input.fallbackChoice.responseText, 1800) || null,
    ledBy: "fallback",
  };
}
