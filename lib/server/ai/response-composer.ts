import { createHash } from "node:crypto";
import { enforceConversationTurnPolicy } from "@/lib/server/ai/conversation-policy";
import {
  enforceRelationshipPrivacyBoundary,
  removeAnsweredRelationshipQuestions,
  type RelationshipState,
} from "@/lib/server/ai/relationship-state";

export const AI_RESPONSE_COMPOSER_VERSION = "ai-response-composer-v1" as const;

export type AiResponseChannel = "whatsapp" | "instagram" | "facebook" | "site" | "other";
export type AiResponseValidationReceipt = {
  schemaVersion: typeof AI_RESPONSE_COMPOSER_VERSION;
  status: "accepted" | "repaired" | "fallback";
  channel: AiResponseChannel;
  transformations: string[];
  blockedReasons: string[];
  removedRelationshipQuestionKeys: string[];
  questionCount: number;
  messageCount: number;
  inputFingerprint: string;
  outputFingerprint: string;
};

function clean(value: unknown, max = 6000) {
  return typeof value === "string"
    ? value.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max)
    : "";
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function channelLimit(channel: AiResponseChannel) {
  if (channel === "instagram") return 700;
  if (channel === "facebook") return 900;
  if (channel === "whatsapp") return 1100;
  return 1600;
}

function removeExtraQuestions(text: string) {
  if ((text.match(/\?/g) || []).length <= 1) return text;
  let seen = false;
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => {
      if (!sentence.includes("?")) return true;
      if (seen) return false;
      seen = true;
      return true;
    })
    .join(" ")
    .trim();
}

function splitForChannel(text: string, limit: number) {
  if (text.length <= limit) return [text];
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const messages: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) current = sentence;
    else if (`${current} ${sentence}`.length <= limit) current = `${current} ${sentence}`;
    else {
      messages.push(current);
      current = sentence;
    }
    if (messages.length === 1) break;
  }
  if (current && messages.length < 2) messages.push(current);
  return messages.map((message) => message.slice(0, limit).trim()).filter(Boolean).slice(0, 2);
}

function containsSensitiveRequest(text: string) {
  return /\b(senha|cvv|codigo\s+de\s+seguranca|numero\s+completo\s+do\s+cartao|cartao\s+completo)\b/i.test(text);
}

function comparable(text: string) {
  return clean(text, 4000).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export function composeAiResponse(input: {
  inboundText: string;
  draftText: string;
  channel?: string | null;
  messageType?: string | null;
  decision?: string | null;
  responseGoal?: string | null;
  relationshipState?: RelationshipState | null;
  previousOutboundText?: string | null;
  allowUrls?: boolean;
  verifiedUrls?: readonly string[];
  preserveLineBreaks?: boolean;
  verifiedExecution?: boolean;
  verifiedPrice?: boolean;
  verifiedInventory?: boolean;
  verifiedPayment?: boolean;
  verifiedDelivery?: boolean;
  audioDelivery?: boolean;
}) {
  const inboundText = clean(input.inboundText, 1800);
  const original = clean(input.draftText, 6000);
  const channelValue = clean(input.channel, 40).toLowerCase();
  const channel: AiResponseChannel = channelValue.includes("instagram")
    ? "instagram"
    : channelValue.includes("facebook") || channelValue.includes("messenger")
      ? "facebook"
      : channelValue.includes("whatsapp")
        ? "whatsapp"
        : channelValue.includes("site") || channelValue.includes("web")
          ? "site"
          : "other";
  const transformations: string[] = [];
  const blockedReasons: string[] = [];
  let text = original;
  if (!input.verifiedExecution && /\b(j[aá] estou (consultando|verificando)|estou consultando|volto.{0,35}(instantes|minutos)|vou (te )?(enviar|mandar) agora.{0,20}fotos|aqui est[aã]o as fotos|j[aá] (enviei|notifiquei|acionei|chamei))\b/i.test(text)) {
    text = "Ainda não consegui confirmar essa informação. Posso te ajudar a conferir outra opção ou pedir apoio de uma pessoa da equipe?";
    blockedReasons.push("unexecuted_action_claim");
  }

  const leaksInternalPolicy = /(system\s*prompt|prompt\s*interno|guardrail|tool[_ -]?call|developer\s*message|politica\s*interna\s+da\s+ia)/i.test(text);
  if (leaksInternalPolicy) {
    text = "Posso ajudar com o seu pedido, mas não posso expor instruções internas. O que você precisa resolver agora?";
    blockedReasons.push("internal_instruction_leak");
  }
  if (containsSensitiveRequest(inboundText) || containsSensitiveRequest(text)) {
    text = "Não envie número completo do cartão, senha ou código de segurança por aqui. Posso orientar uma forma segura de pagamento ou chamar uma pessoa da equipe.";
    blockedReasons.push("sensitive_payment_data");
  }

  if (input.allowUrls !== true && /https?:\/\//i.test(text)) {
    let removed = false;
    text = text.replace(/https?:\/\/\S+/gi, (url) => {
      if (input.verifiedUrls?.includes(url)) return url;
      removed = true;
      return "";
    }).replace(/[ \t]+([.,!?])/g, "$1").trim();
    if (removed) transformations.push("unauthorized_url_removed");
  }
  if (!input.verifiedPrice && /(?:R\$|\$|€)\s*\d|\b\d+[,.]\d{2}\b/.test(text)) {
    text = "Para confirmar o valor correto, preciso consultar a oferta exata. Qual produto ou serviço você quer verificar?";
    blockedReasons.push("unverified_price");
  }
  if (!input.verifiedInventory && /\b(temos\s+em\s+estoque|estoque\s+garantido|disponibilidade\s+garantida)\b/i.test(text)) {
    text = "Vou confirmar a disponibilidade correta antes de orientar você. Qual produto você quer verificar?";
    blockedReasons.push("unverified_inventory");
  }
  if (!input.verifiedDelivery && /\b(entrega\s+garantida|chega\s+(hoje|amanha)|entregamos\s+em\s+\d+)\b/i.test(text)) {
    text = "Vou confirmar o prazo de entrega para não passar uma informação incorreta. Qual produto e região devo verificar?";
    blockedReasons.push("unverified_delivery");
  }
  if (!input.verifiedPayment && /\b(parcelamos\s+em\s+\d+|juros\s+de\s+\d+|pagamento\s+garantido)\b/i.test(text)) {
    text = "Vou confirmar as condições de pagamento da oferta antes de orientar você.";
    blockedReasons.push("unverified_payment");
  }

  if ((input.decision === "handoff" || input.responseGoal === "handoff") && !/\b(pessoa|equipe|atendente|humano)\b/i.test(text)) {
    text = `Vou chamar uma pessoa da equipe e levar o contexto desta conversa. ${text}`.trim();
    transformations.push("handoff_acknowledgement_added");
  }
  if (/\b(eu\s+sou\s+humano|sou\s+uma\s+pessoa\s+real)\b/i.test(text)) {
    text = text.replace(/\b(eu\s+sou\s+humano|sou\s+uma\s+pessoa\s+real)\b/gi, "sou o assistente virtual da empresa");
    blockedReasons.push("human_impersonation");
  }
  if (/([uú]ltima\s+chance|compre\s+agora|feche\s+agora|se\s+n[aã]o\s+fechar|vai\s+perder\s+a\s+oportunidade)/i.test(text)) {
    text = text
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => !/([uú]ltima\s+chance|compre\s+agora|feche\s+agora|se\s+n[aã]o\s+fechar|vai\s+perder\s+a\s+oportunidade)/i.test(sentence))
      .join(" ")
      .trim();
    blockedReasons.push("aggressive_sales_pressure");
  }

  const isCorrection = /\b(na\s+verdade|corrigindo|correcao|não\s+é|nao\s+e|mudei|agora\s+é|agora\s+e)\b/i.test(inboundText);
  const contradictedConfirmedKeys: string[] = [];
  if (isCorrection && input.relationshipState) {
    for (const fact of Object.values(input.relationshipState.facts)) {
      const oldValue = clean(fact.value, 180);
      if (fact.status === "confirmed" && oldValue.length >= 3 && comparable(text).includes(comparable(oldValue)) && !comparable(inboundText).includes(comparable(oldValue))) {
        contradictedConfirmedKeys.push(fact.key);
      }
    }
  }
  if (contradictedConfirmedKeys.length) {
    text = "Obrigado pela correção. Vou considerar a informação mais recente a partir de agora e seguir sem repetir o dado anterior.";
    blockedReasons.push(`confirmed_memory_contradiction:${contradictedConfirmedKeys.join("+")}`);
  }

  const policyText = enforceConversationTurnPolicy({
    inboundText,
    outboundText: text,
    messageType: clean(input.messageType, 40) || "text",
  });
  const sameContent = (first: string, second: string) => first.replace(/\s+/g, " ").trim() === second.replace(/\s+/g, " ").trim();
  if (!(input.preserveLineBreaks && sameContent(policyText, text))) {
    if (policyText !== text) transformations.push("turn_policy_applied");
    text = policyText;
  }
  const privacy = enforceRelationshipPrivacyBoundary({ inboundText, responseText: text });
  if (privacy.applied) transformations.push(`privacy_boundary:${privacy.reason}`);
  if (!input.preserveLineBreaks || privacy.applied || !sameContent(privacy.text, text)) text = privacy.text;
  const relationship = removeAnsweredRelationshipQuestions(text, input.relationshipState || null);
  if (relationship.removedFactKeys.length) transformations.push("answered_question_removed");
  if (!input.preserveLineBreaks || relationship.removedFactKeys.length || !sameContent(relationship.text, text)) text = relationship.text;

  if (input.previousOutboundText && comparable(text) === comparable(input.previousOutboundText)) {
    text = input.decision === "handoff"
      ? "Vou chamar uma pessoa da equipe e levar o contexto desta conversa."
      : "Entendi. Para avançar sem repetir o que já foi dito, posso seguir pelo próximo passo mais útil para você.";
    transformations.push("repeated_outbound_repaired");
  }

  const oneQuestion = removeExtraQuestions(text);
  if (oneQuestion !== text) transformations.push("extra_questions_removed");
  text = clean(oneQuestion, 4000);
  if (!text) {
    text = input.decision === "handoff"
      ? "Vou chamar uma pessoa da equipe e levar o contexto desta conversa."
      : "Entendi. Vou seguir com segurança e ajudar no próximo passo.";
    blockedReasons.push("empty_after_validation");
  }

  const messages = input.audioDelivery ? [text.slice(0, 1500)] : splitForChannel(text, channelLimit(channel));
  const finalText = messages.join("\n");
  if (messages.length > 1) transformations.push("channel_message_split");
  const status = blockedReasons.length ? (original ? "repaired" : "fallback") : transformations.length ? "repaired" : "accepted";
  return {
    text: finalText,
    messages,
    receipt: {
      schemaVersion: AI_RESPONSE_COMPOSER_VERSION,
      status,
      channel,
      transformations,
      blockedReasons,
      removedRelationshipQuestionKeys: relationship.removedFactKeys,
      questionCount: (finalText.match(/\?/g) || []).length,
      messageCount: messages.length,
      inputFingerprint: fingerprint(original),
      outputFingerprint: fingerprint(finalText),
    } satisfies AiResponseValidationReceipt,
  };
}
