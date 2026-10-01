export type ConversationTurnKind =
  | "greeting"
  | "relational"
  | "correction"
  | "conversation_request"
  | "product_request"
  | "direct_question"
  | "commercial_need"
  | "continuation";

export type ConversationTurnPolicy = {
  kind: ConversationTurnKind;
  normalizedText: string;
  shouldRetrieveKnowledge: boolean;
  allowCatalog: boolean;
  mustAcknowledgeFirst: boolean;
  resetCommercialTopic: boolean;
  maxQuestions: number;
};

export type VerifiedCommercialFactKind =
  | "price"
  | "inventory"
  | "payment"
  | "delivery"
  | "commercial_policy";

function normalize(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9?\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectVerifiedCommercialFactRequest(value: string): VerifiedCommercialFactKind | null {
  const text = normalize(value).slice(0, 1200);
  if (!text) return null;

  if (/\b(preco|precos|valor|valores|quanto custa|quanto fica|mensalidade|investimento)\b/.test(text)) {
    return "price";
  }
  if (/\b(estoque|em estoque|tem disponivel|esta disponivel|disponibilidade|a pronta entrega)\b/.test(text)) {
    return "inventory";
  }
  if (/\b(forma de pagamento|formas de pagamento|parcelamento|parcela|parcelas|pix|boleto|cartao|checkout|link de pagamento)\b/.test(text)) {
    return "payment";
  }
  if (/\b(prazo de entrega|quando chega|frete|entrega para|envia para|envio para)\b/.test(text)) {
    return "delivery";
  }
  if (/\b(garantia|troca|devolucao|cancelamento|reembolso|politica de)\b/.test(text)) {
    return "commercial_policy";
  }
  return null;
}

export function keepConversationQuestionLimit(value: string, maxQuestions = 1) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean || maxQuestions < 1) return clean.replace(/\?/g, ".");
  if ((clean.match(/\?/g) || []).length <= maxQuestions) return clean;

  const segments = (clean.match(/[^.!?]+[.!?]?/g) || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let questionCount = 0;

  for (const segment of segments) {
    if (!segment.includes("?")) {
      kept.push(segment);
      continue;
    }
    if (questionCount >= maxQuestions) continue;
    kept.push(segment);
    questionCount += 1;
  }

  return kept.join(" ").replace(/\s+/g, " ").trim() || clean;
}

export function classifyConversationTurn(value: string, messageType = "text"): ConversationTurnPolicy {
  const text = normalize(value).slice(0, 800);
  const normalizedMessageType = normalize(messageType);
  const mediaMessage = /^(image|video|document|audio)$/.test(normalizedMessageType);
  const correction = /\b(nao pedi|nao falei|nao perguntei|nao foi isso|entendeu errado|voce entendeu errado|nada a ver|eu quis dizer|na verdade)\b/.test(text);
  const asksToTalk = /\b(conversar primeiro|podemos conversar|pode conversar|quero conversar|so conversar|vamos conversar)\b/.test(text);
  const greeting = /^(oi|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|fala|oi tudo bem)\b/.test(text);
  const relational = /\b(tudo bem|como voce esta|como voce ta|como vai|obrigad[oa]s?|valeu|beleza|show|kkk|haha)\b/.test(text);
  const productRequest = /\b(produto|produtos|servico|servicos|catalogo|modelo|opcao|opcoes|preco|valor|estoque|disponivel|disponibilidade|vende|vendem|oferece|oferecem|foto|imagem|video|mostra|mostrar)\b/.test(text);
  const commercialNeed = /\b(vender|vendas|lead|leads|cliente|clientes|atendimento|whatsapp|instagram|crm|funil|pipeline|proposta|orcamento|trafego|captacao|conversao)\b/.test(text);
  const directQuestion =
    text.includes("?") ||
    /^(qual|quais|quanto|como|quando|onde|porque|por que|voces|voce tem|tem como|posso)\b/.test(text) ||
    /\b(preciso de ajuda|preciso falar|me ajuda|pode me ajudar|quero ajuda|tenho um problema)\b/.test(text);

  let kind: ConversationTurnKind = "continuation";
  if (correction) kind = "correction";
  else if (asksToTalk) kind = "conversation_request";
  else if (greeting && !commercialNeed && !productRequest && text.split(" ").length <= 5) kind = "greeting";
  else if (relational && !commercialNeed && !productRequest) kind = "relational";
  else if (productRequest || (mediaMessage && normalizedMessageType !== "audio")) kind = "product_request";
  else if (directQuestion) kind = "direct_question";
  else if (commercialNeed) kind = "commercial_need";

  const noRetrieval = kind === "greeting" || kind === "relational" || kind === "correction" || kind === "conversation_request";
  return {
    kind,
    normalizedText: text,
    shouldRetrieveKnowledge: !noRetrieval && (mediaMessage || productRequest || directQuestion || text.split(" ").length >= 4),
    allowCatalog: kind === "product_request" || (mediaMessage && normalizedMessageType !== "audio"),
    mustAcknowledgeFirst: kind === "correction" || kind === "conversation_request" || kind === "relational",
    resetCommercialTopic: kind === "correction" || kind === "conversation_request",
    maxQuestions: 1,
  };
}

export function knowledgeScoreThreshold(mode: "keyword" | "hybrid" | "semantic") {
  if (mode === "semantic") return 1.15;
  if (mode === "hybrid") return 0.9;
  return 1;
}

export function conversationPolicyInstruction(policy: ConversationTurnPolicy) {
  if (policy.kind === "greeting") return "Este turno e apenas uma saudacao: acolha e deixe a pessoa falar, sem oferta ou qualificacao.";
  if (policy.kind === "relational") return "Este turno e relacional: responda como uma pessoa e nao transforme a fala em pitch.";
  if (policy.kind === "correction") return "O lead corrigiu a conversa: reconheca o erro, descarte a suposicao anterior e reabra o assunto sem se defender.";
  if (policy.kind === "conversation_request") return "O lead pediu conversa: converse primeiro, sem diagnostico, oferta ou coleta mecanica de dados.";
  if (policy.kind === "product_request") return "O lead pediu produto, servico ou midia: use somente fatos relevantes da base e responda ao pedido antes de conduzir.";
  if (policy.kind === "direct_question") return "O lead fez uma pergunta ou pediu ajuda: responda diretamente ou acolha o pedido especifico antes de qualquer proximo passo comercial.";
  if (policy.kind === "commercial_need") return "O lead mostrou uma necessidade: entenda o momento com uma pergunta contextual antes de recomendar uma oferta.";
  return "Continue do assunto vivo sem reiniciar a conversa nem repetir perguntas.";
}

export function enforceConversationTurnPolicy(input: {
  inboundText: string;
  outboundText: string;
  messageType?: string;
}) {
  const policy = classifyConversationTurn(input.inboundText, input.messageType);
  const outbound = String(input.outboundText || "").replace(/\s+/g, " ").trim();
  const normalizedOutbound = normalize(outbound);
  const hasCommercialPush = /\b(consultoria|diagnostico|oferta|proposta|plano|pacote|gerar leads|vender mais|nicho|orcamento|agendar|reuniao|gargalo|objetivo comercial|resultado comercial|melhorar conversao|organizar atendimento|direcionar)\b/.test(normalizedOutbound);

  if (policy.kind === "correction") {
    return "Você tem razão — eu entendi errado. Vamos deixar isso de lado. Sobre o que você gostaria de conversar?";
  }
  if (policy.kind === "conversation_request" && hasCommercialPush) {
    return "Claro. Podemos conversar sem pressa. O que você gostaria de me contar?";
  }
  if (policy.kind === "greeting" && hasCommercialPush) {
    return "Oi! Tudo bem? Pode falar — como posso te ajudar?";
  }
  if (policy.kind === "relational" && hasCommercialPush) {
    if (/\b(obrigad[oa]s?|valeu)\b/.test(policy.normalizedText)) {
      return "Imagina! Se precisar, estou por aqui.";
    }
    return "Tudo certo por aqui 😊 E com você?";
  }
  return keepConversationQuestionLimit(outbound, policy.maxQuestions);
}
