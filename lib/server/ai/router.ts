import type {
  AltumAiAutonomyMode,
  AltumAiProvider,
  AltumAiReasoningLevel,
  AltumAiResponseStyle,
  AltumAiTier,
} from "@/lib/server/ai/operating-layer";
import type { AltumTenantLearningHints } from "@/lib/server/ai/tenant-learning";
import type { BusinessProfilePlaybookOffer, BusinessProfilePlaybookScript } from "@/lib/business-profiles";

type ConversationMessage = {
  id: string;
  text: string;
  sender: "agent" | "client" | "system";
};

type KnowledgeDoc = {
  id: string;
  type: "faq" | "catalog" | "policy";
  content: string;
  tags: string[];
  score?: number;
};

export type ConversationAgentInput = {
  tenantId: string;
  chatId: string;
  inboundText: string;
  multimodalSummary?: string;
  messageType?: string;
  channel: string;
  agentName?: string;
  contactName?: string;
  runtimeStateSummary?: string;
  leadMemorySummary?: string;
  commercialBrainSummary?: string;
  toneOfVoice: string;
  businessSummary: string;
  objective?: string;
  guardrails: string[];
  mandatoryQuestions?: string[];
  escalationTopics?: string[];
  playbookOffers?: BusinessProfilePlaybookOffer[];
  playbookScripts?: BusinessProfilePlaybookScript[];
  learningHints?: AltumTenantLearningHints | null;
  tier: AltumAiTier;
  autonomyMode: AltumAiAutonomyMode;
  reasoningLevel: AltumAiReasoningLevel;
  responseStyle: AltumAiResponseStyle;
  plannedResponseFormat?: "audio" | "text";
  conversation: ConversationMessage[];
  kbDocs: KnowledgeDoc[];
  preferredProviders: AltumAiProvider[];
};

export type ConversationAgentResult = {
  decision: "respond" | "ask_more" | "handoff" | "skip";
  reason: string;
  confidence: number;
  responseText?: string;
  nextAction?: string;
  turnGoal?: string;
  memorySummary?: string;
  provider: AltumAiProvider;
  model: string;
  fallbackUsed: boolean;
  extractedFields?: Record<string, string>;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
};

export type ConversationAgentRunResult = {
  result: ConversationAgentResult | null;
  providerChainError?: string;
  providerFallbackTriggered: boolean;
};

type RuntimePolicy = {
  primaryProvider: AltumAiProvider;
  fallbackProviders: AltumAiProvider[];
  conversationModel: string;
  extractionModel: string;
  retrievalMode: "keyword" | "hybrid" | "semantic";
  supportsToolCalling: boolean;
  supportsDeepReasoning: boolean;
  budgetMode: "conservative" | "balanced" | "premium";
};

function sanitizeText(value: unknown, max = 900) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJsonPayload(raw: string) {
  const text = raw.trim();
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeDecision(value: unknown) {
  const raw = sanitizeText(value, 40).toLowerCase();
  if (raw === "handoff" || raw === "ask_more" || raw === "skip") return raw;
  return "respond";
}

function normalizeConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.56;
  return Math.max(0, Math.min(0.99, numeric));
}

function normalizeExtractedFields(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const entries = Object.entries(source)
    .map(([key, item]) => [sanitizeText(key, 40), sanitizeText(item, 180)] as const)
    .filter(([key, item]) => key && item);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

function normalizeAgentResult(
  payload: Record<string, unknown> | null,
  provider: AltumAiProvider,
  model: string,
  fallbackUsed: boolean,
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
  }
): ConversationAgentResult | null {
  if (!payload) return null;

  return {
    decision: normalizeDecision(payload.decision),
    reason: sanitizeText(payload.reason, 140) || "model_decision",
    confidence: normalizeConfidence(payload.confidence),
    responseText: sanitizeText(payload.responseText, 1600) || undefined,
    nextAction: sanitizeText(payload.nextAction, 140) || undefined,
    turnGoal: sanitizeText(payload.turnGoal, 120) || undefined,
    memorySummary: sanitizeText(payload.memorySummary, 220) || undefined,
    provider,
    model,
    fallbackUsed,
    extractedFields: normalizeExtractedFields(payload.extractedFields),
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    estimatedCostUsd: usage?.estimatedCostUsd,
  };
}

function getProviderEnv(provider: AltumAiProvider) {
  if (provider === "openai") {
    return {
      ready: Boolean(process.env.OPENAI_API_KEY),
      apiKey: process.env.OPENAI_API_KEY || "",
    };
  }

  if (provider === "anthropic") {
    return {
      ready: Boolean(process.env.ANTHROPIC_API_KEY),
      apiKey: process.env.ANTHROPIC_API_KEY || "",
    };
  }

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    return {
      ready: Boolean(apiKey),
      apiKey,
    };
  }

  if (provider === "mistral") {
    return {
      ready: Boolean(process.env.MISTRAL_API_KEY),
      apiKey: process.env.MISTRAL_API_KEY || "",
    };
  }

  return { ready: true, apiKey: "" };
}

function styleDirective(style: AltumAiResponseStyle) {
  if (style === "concise") {
    return "Estilo: objetivo, no maximo 2 frases curtas por resposta e uma pergunta por vez.";
  }
  if (style === "closer") {
    return "Estilo: comercial assertivo, sempre conduzindo para proximo passo claro (reuniao, proposta ou diagnostico).";
  }
  if (style === "premium_sales") {
    return "Estilo: premium sales consultivo, mostrando clareza de valor e proximos passos sem enrolacao.";
  }
  return "Estilo: consultivo claro, humano e direto ao ponto.";
}

function autonomyDirective(mode: AltumAiAutonomyMode) {
  if (mode === "autonomous") {
    return "Autonomia: assuma iniciativa, dite o ritmo e evite depender do lead para mover a conversa.";
  }
  if (mode === "hybrid") {
    return "Autonomia: conduza com iniciativa, mas valide rapidamente antes de avancar para fechamento.";
  }
  return "Autonomia: conduza discovery com cautela e confirme contexto antes do fechamento.";
}

function reasoningDirective(level: AltumAiReasoningLevel) {
  if (level === "deep") return "Raciocinio: conecte sinais do historico e personalize com alta precisao.";
  if (level === "fast") return "Raciocinio: priorize resposta curta, util e com progresso imediato.";
  return "Raciocinio: equilibrado, com clareza e progressao comercial.";
}

function buildPrompt(input: ConversationAgentInput) {
  const inboundText = sanitizeText(input.inboundText, 700);
  const multimodalSummary = sanitizeText(input.multimodalSummary, 280);
  const messageType = sanitizeText(input.messageType, 40);
  const normalizedInbound = inboundText.toLowerCase();
  const isShortFollowup =
    normalizedInbound.length > 0 &&
    normalizedInbound.length <= 20 &&
    /^(sim|s|ok|okay|beleza|entendi|claro|isso|pode|quero|show|perfeito|certo)\b/.test(normalizedInbound);
  const isDirectQuestion = normalizedInbound.includes("?");
  const isGreetingOnly = /^(oi|ola|bom dia|boa tarde|boa noite)\\W*$/i.test(inboundText);

  const conversation = input.conversation
    .slice(-10)
    .map((item) => `${item.sender}: ${sanitizeText(item.text, 220)}`)
    .join("\n");

  const kb = input.kbDocs
    .slice(0, 4)
    .map((doc, index) => `${index + 1}. ${sanitizeText(doc.content, 220)}`)
    .join("\n");

  const guardrails = (input.guardrails || [])
    .slice(0, 8)
    .map((item) => `- ${sanitizeText(item, 140)}`)
    .join("\n");

  const escalations = (input.escalationTopics || [])
    .slice(0, 8)
    .map((item) => `- ${sanitizeText(item, 100)}`)
    .join("\n");

  const playbookOffers = (input.playbookOffers || [])
    .slice(0, 3)
    .map((offer, index) => `${index + 1}. ${sanitizeText(offer.title, 80)} | ${sanitizeText(offer.targetProfile, 140)}`)
    .join("\n");
  const learningSignals = input.learningHints
    ? [
        input.learningHints.topOffers?.length
          ? `Ofertas com melhor historico: ${input.learningHints.topOffers.join(", ")}.`
          : "",
        input.learningHints.topActions?.length
          ? `Acoes de maior conversao: ${input.learningHints.topActions.join(", ")}.`
          : "",
        input.learningHints.topObjections?.length
          ? `Objecoes mais frequentes: ${input.learningHints.topObjections.join(", ")}.`
          : "",
        input.learningHints.preferredClosingMotion
          ? `Fechamento preferencial historico: ${input.learningHints.preferredClosingMotion}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const systemPrompt = [
    `Voce e ${sanitizeText(input.agentName, 80) || "um agente conversacional comercial"} do negocio configurado.`,
    "Converse em portugues do Brasil como uma pessoa atenta, clara e natural no WhatsApp.",
    "Entenda o que o lead acabou de dizer e responda isso primeiro.",
    "Responda de forma humana, curta e sempre com progressao comercial.",
    "Em saudacoes ou turnos relacionais, acolha em uma frase e conduza com uma pergunta util sobre contexto de negocio.",
    "Evite conversa infinita: cada turno deve mover para descoberta, recomendacao ou proximo passo.",
    "Nao repita a mesma pergunta com outras palavras. Se a memoria ou historico ja trouxe um sinal suficiente, use esse sinal e avance.",
    "Quando ja existir contexto minimo, entregue um diagnostico curto: problema percebido, impacto comercial e caminho recomendado.",
    "Se o lead trouxer uma necessidade clara, mesmo sem haver pacote pronto, monte uma hipotese de solucao personalizada e ofereca proximo passo com a equipe.",
    "Use o cerebro comercial do negocio para pensar como consultor: entenda o objetivo, ligue com uma oferta ou plano personalizado, e avance para decisao.",
    "Quando o lead pedir recomendacao, exemplo, roteiro, plano, onde ficar, como fazer ou qual caminho seguir, entregue uma orientacao util antes de pedir novos dados.",
    "Depois do diagnostico, conduza para uma decisao simples: agendar conversa qualificada, preparar proposta ou encaminhar humano.",
    "Se o lead fizer uma pergunta direta, responda com clareza antes de conduzir qualquer outra coisa.",
    "Nao use menus de opcoes; faca pergunta precisa e contextual.",
    "Se o lead responder curto, trate como continuidade do assunto vivo. Nao reinicie nem repita bloco.",
    "Se a memoria mencionar 'playbook do disparo', a mensagem atual provavelmente e resposta a esse disparo. Use esse playbook como contexto principal da resposta atual.",
    "Nessa situacao, nao volte para atendimento generico, nao pergunte qual e o desafio comercial sem antes conectar a resposta a oferta enviada.",
    "Se a oferta do disparo for landing page, site, campanha, proposta ou qualquer servico especifico, fale exatamente dessa oferta.",
    "Quando o lead pedir exemplo, modelo, demonstracao, print, LP, como fica ou responder afirmativamente a uma oferta do disparo, envie o link/material do playbook se existir e explique em uma frase por que ele ajuda.",
    "Depois de enviar exemplo ou material do disparo, conduza para o proximo passo indicado no playbook, sem abrir nova rodada longa de perguntas.",
    "Quando faltar contexto, faca no maximo uma pergunta curta e realmente util.",
    "Nao faca mais de duas perguntas de qualificacao seguidas sem devolver uma leitura ou recomendacao.",
    input.plannedResponseFormat === "audio"
      ? "A plataforma vai entregar esta resposta em audio. Nao diga que prefere texto, nao explique limitacao de audio e nao pergunte se o lead quer audio; apenas responda com uma fala curta, natural e pronta para ser ouvida."
      : "",
    "Nao use bordoes de vendedor nem frases institucionais repetitivas.",
    "Nao invente oferta, preco, prazo, prova social ou promessa.",
    styleDirective(input.responseStyle),
    autonomyDirective(input.autonomyMode),
    reasoningDirective(input.reasoningLevel),
    "Se souber o nome do lead, use de forma natural. Se nao souber e fizer sentido, pergunte uma vez: 'Posso te chamar de como?'.",
    "Se a mensagem for audio, imagem ou documento, confirme que recebeu e comente o resumo multimodal antes de perguntar algo.",
    "Use a base e as ofertas apenas como apoio silencioso.",
    "Responda com JSON valido.",
    "Campos obrigatorios: decision, reason, confidence, responseText.",
    "Campos opcionais: extractedFields, nextAction, turnGoal, memorySummary.",
    "decision deve ser um de: respond, ask_more, handoff, skip.",
    "Use handoff apenas em risco real, tema sensivel ou pedido claro por humano.",
  ].join(" ");

  const userPrompt = [
    `Negocio: ${sanitizeText(input.businessSummary, 240) || "empresa cliente configurada"}.`,
    `Nome do agente: ${sanitizeText(input.agentName, 80) || "nao informado"}.`,
    `Objetivo da IA: ${sanitizeText(input.objective, 140) || "entender o lead, orientar bem e avancar a conversa"}.`,
    `Tom esperado: ${sanitizeText(input.toneOfVoice, 80) || "claro e humano"}.`,
    `Canal: ${input.channel}. Nome conhecido do contato: ${sanitizeText(input.contactName, 80) || "nao informado"}.`,
    multimodalSummary ? `Resumo multimodal: ${multimodalSummary}` : "",
    messageType ? `Tipo de mensagem: ${messageType}` : "",
    input.runtimeStateSummary ? `Contexto vivo da conversa:\n${sanitizeText(input.runtimeStateSummary, 220)}` : "",
    input.leadMemorySummary ? `Memoria relevante:\n${sanitizeText(input.leadMemorySummary, 1000)}` : "",
    input.commercialBrainSummary ? `Cerebro comercial do negocio:\n${sanitizeText(input.commercialBrainSummary, 1600)}` : "",
    isShortFollowup ? "A mensagem atual parece uma continuidade curta. Continue do ponto vivo da conversa." : "",
    isDirectQuestion ? "A mensagem atual contem uma pergunta direta. Responda essa pergunta primeiro." : "",
    isGreetingOnly ? "A mensagem atual e apenas uma saudacao. Responda como conversa normal, sem menu." : "",
    escalations ? `Temas sensiveis para escalar:\n${escalations}` : "",
    guardrails ? `Limites importantes:\n${guardrails}` : "",
    playbookOffers ? `Ofertas disponiveis como referencia:\n${playbookOffers}` : "",
    learningSignals ? `Aprendizado recente (use como sinal, nao regra fixa): ${learningSignals}` : "",
    conversation ? `Historico recente:\n${conversation}` : "",
    kb ? `Base relevante:\n${kb}` : "",
    `Mensagem atual do lead: ${inboundText}`,
    "Exemplo bom 1: lead='oi' -> responseText='Oi! Tudo bem? Pra te direcionar certo: hoje o foco e gerar mais leads ou melhorar conversao?'",
    "Exemplo bom 2: lead='como voce esta?' -> responseText='Tudo certo por aqui. E no seu comercial hoje, qual e o maior gargalo?'",
    "Exemplo bom 3: lead='quero gerar mais leads' -> responseText='Perfeito. Hoje voces captam mais por qual canal e com qual meta mensal?'",
    "Exemplo bom 4: lead ja explicou negocio e objetivo -> responseText='Pelo que voce trouxe, o gargalo parece estar em captacao e conversao no WhatsApp. O caminho mais forte e organizar uma estrutura com campanha, atendimento rapido e acompanhamento do funil. Faz sentido eu marcar um diagnostico curto para fechar o melhor plano?'",
    "Exemplo bom 5: lead pede algo fora do pacote pronto -> responseText='Faz sentido. Nao vou te empurrar um pacote generico: pelo que voce falou, o melhor e montar um plano sob medida com rota, prioridade e investimento estimado. Posso separar isso com um consultor e ja deixar um resumo do que voce precisa?'",
    'Retorne JSON no formato: {"decision":"respond|ask_more|handoff|skip","reason":"...","confidence":0.0,"responseText":"...","turnGoal":"...","memorySummary":"...","nextAction":"...","extractedFields":{"preferredName":"...","leadTone":"...","activeTopic":"...","businessType":"...","primaryGoal":"...","serviceInterest":"...","budgetBand":"...","city":"...","urgency":"...","decisionMaker":"...","digitalMaturity":"...","currentChannels":"...","teamSize":"...","objectionType":"...","intent":"...","diagnosis":"problema percebido e impacto comercial","personalizedPlan":"plano recomendado em linguagem simples","sellerNextMove":"o que o vendedor deve fazer agora","materialToSend":"link, exemplo ou material que ajudaria","proposalOutline":"estrutura resumida da proposta se fizer sentido"}}',
    "A responseText deve parecer mensagem real de WhatsApp escrita por uma pessoa, nao por um sistema.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { systemPrompt, userPrompt };
}

function estimateTokens(text: string) {
  const clean = sanitizeText(text, 12000);
  if (!clean) return 0;
  return Math.max(1, Math.ceil(clean.length / 4));
}

function pricingFor(provider: AltumAiProvider, model: string) {
  if (provider === "openai") {
    if (model.includes("gpt-5.4")) {
      return { inputPer1k: 0.01, outputPer1k: 0.03 };
    }
    return { inputPer1k: 0.002, outputPer1k: 0.008 };
  }

  if (provider === "anthropic") {
    if (model.includes("opus")) {
      return { inputPer1k: 0.015, outputPer1k: 0.075 };
    }
    return { inputPer1k: 0.003, outputPer1k: 0.015 };
  }

  if (provider === "gemini") {
    if (model.includes("pro")) {
      return { inputPer1k: 0.0025, outputPer1k: 0.01 };
    }
    return { inputPer1k: 0.0005, outputPer1k: 0.002 };
  }

  if (provider === "mistral") {
    if (model.includes("large")) {
      return { inputPer1k: 0.002, outputPer1k: 0.006 };
    }
    return { inputPer1k: 0.001, outputPer1k: 0.003 };
  }

  return { inputPer1k: 0, outputPer1k: 0 };
}

function estimateUsage(provider: AltumAiProvider, model: string, prompts: string[], responseText: string) {
  const inputTokens = prompts.reduce((sum, item) => sum + estimateTokens(item), 0);
  const outputTokens = estimateTokens(responseText);
  const pricing = pricingFor(provider, model);
  const estimatedCostUsd = Number(
    (((inputTokens / 1000) * pricing.inputPer1k) + ((outputTokens / 1000) * pricing.outputPer1k)).toFixed(6)
  );
  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 18000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callOpenAI(input: ConversationAgentInput, model: string) {
  const env = getProviderEnv("openai");
  if (!env.ready) return null;
  const { systemPrompt, userPrompt } = buildPrompt(input);
  const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string; type?: string };
    };
    const message = sanitizeText(payload.error?.message, 220) || `HTTP ${response.status}`;
    throw new Error(`openai_auth_or_request_failed (${model}): ${message}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content || "";
  const payload = parseJsonPayload(raw);
  const usage = estimateUsage("openai", model, [systemPrompt, userPrompt], sanitizeText(raw, 1800));
  return normalizeAgentResult(payload, "openai", model, false, usage);
}

async function callAnthropic(input: ConversationAgentInput, model: string) {
  const env = getProviderEnv("anthropic");
  if (!env.ready) return null;
  const { systemPrompt, userPrompt } = buildPrompt(input);
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.25,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; type?: string };
    };
    const message = sanitizeText(payload.error?.message, 220) || `HTTP ${response.status}`;
    throw new Error(`anthropic_auth_or_request_failed (${model}): ${message}`);
  }

  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content?.find((item) => item.type === "text")?.text || "";
  const usage = estimateUsage("anthropic", model, [systemPrompt, userPrompt], text);
  return normalizeAgentResult(parseJsonPayload(text), "anthropic", model, false, usage);
}

async function callGemini(input: ConversationAgentInput, model: string) {
  const env = getProviderEnv("gemini");
  if (!env.ready) return null;
  const { systemPrompt, userPrompt } = buildPrompt(input);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`;
  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const message = sanitizeText(payload.error?.message, 220) || `HTTP ${response.status}`;
    throw new Error(`gemini_auth_or_request_failed (${model}): ${message}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((item) => item.text || "").join("") || "";
  const usage = estimateUsage("gemini", model, [systemPrompt, userPrompt], text);
  return normalizeAgentResult(parseJsonPayload(text), "gemini", model, false, usage);
}

async function callMistral(input: ConversationAgentInput, model: string) {
  const env = getProviderEnv("mistral");
  if (!env.ready) return null;
  const { systemPrompt, userPrompt } = buildPrompt(input);
  const response = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; type?: string };
    };
    const message = sanitizeText(payload.error?.message, 220) || `HTTP ${response.status}`;
    throw new Error(`mistral_auth_or_request_failed (${model}): ${message}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content || "";
  const payload = parseJsonPayload(raw);
  const usage = estimateUsage("mistral", model, [systemPrompt, userPrompt], sanitizeText(raw, 1800));
  return normalizeAgentResult(payload, "mistral", model, false, usage);
}

function modelForProvider(provider: AltumAiProvider, policy: RuntimePolicy, tier: AltumAiTier) {
  if (provider === "openai") {
    if (policy.primaryProvider === "openai") return policy.conversationModel;
    return tier === "elite" || tier === "enterprise" ? "gpt-5.4" : "gpt-4.1-mini";
  }

  if (provider === "anthropic") {
    if (policy.primaryProvider === "anthropic") return policy.conversationModel;
    return tier === "elite" || tier === "enterprise" ? "claude-opus-4" : "claude-sonnet-4";
  }

  if (provider === "gemini") {
    if (policy.primaryProvider === "gemini") return policy.conversationModel;
    return "gemini-2.5-pro";
  }

  if (provider === "mistral") {
    if (policy.primaryProvider === "mistral") return policy.conversationModel;
    return "mistral-large";
  }

  return "altum_rules_v1";
}

function candidateProviders(policy: RuntimePolicy, preferred: AltumAiProvider[]) {
  const ordered = [policy.primaryProvider, ...preferred, ...policy.fallbackProviders, "altum_rules"] as AltumAiProvider[];
  return Array.from(new Set(ordered));
}

function shouldTryOpenAIEconomyFallback(provider: AltumAiProvider, model: string, errorMessage: string) {
  if (provider !== "openai") return false;
  if (model === "gpt-4.1-mini" || model === "gpt-4o-mini") return false;

  const normalized = sanitizeText(errorMessage, 280).toLowerCase();
  return (
    normalized.includes("exceeded your current quota") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("billing") ||
    normalized.includes("openai_auth_or_request_failed")
  );
}

export async function runConversationAgent(
  input: ConversationAgentInput,
  policy: RuntimePolicy
): Promise<ConversationAgentRunResult> {
  const providers = candidateProviders(policy, input.preferredProviders);
  let fallbackUsed = false;
  let lastProviderError = "";

  for (const provider of providers) {
    if (provider === "altum_rules") {
      if (lastProviderError) {
        console.warn(
          `[ai-router] providers unavailable for tenant ${sanitizeText(input.tenantId, 80)} chat ${sanitizeText(input.chatId, 80)}; using altum_rules fallback: ${lastProviderError}`
        );
      }
      return {
        result: null,
        providerChainError: lastProviderError || undefined,
        providerFallbackTriggered: fallbackUsed || Boolean(lastProviderError),
      };
    }

    const env = getProviderEnv(provider);
    if (!env.ready) {
      fallbackUsed = true;
      continue;
    }

    const model = modelForProvider(provider, policy, input.tier);

    try {
      const result =
        provider === "openai"
          ? await callOpenAI(input, model)
          : provider === "anthropic"
            ? await callAnthropic(input, model)
            : provider === "gemini"
              ? await callGemini(input, model)
              : await callMistral(input, model);

      if (result) {
        return {
          result: {
            ...result,
            fallbackUsed,
          },
          providerChainError: lastProviderError || undefined,
          providerFallbackTriggered: fallbackUsed || Boolean(lastProviderError),
        };
      }
    } catch (error) {
      const providerErrorMessage =
        error instanceof Error ? sanitizeText(error.message, 280) : "provider_request_failed";

      if (shouldTryOpenAIEconomyFallback(provider, model, providerErrorMessage)) {
        fallbackUsed = true;
        try {
          const economyResult = await callOpenAI(input, "gpt-4.1-mini");
          if (economyResult) {
            return {
              result: {
                ...economyResult,
                fallbackUsed: true,
              },
              providerChainError: `${provider}: ${providerErrorMessage}`,
              providerFallbackTriggered: true,
            };
          }
        } catch (economyError) {
          const economyMessage =
            economyError instanceof Error ? sanitizeText(economyError.message, 280) : "provider_request_failed";
          lastProviderError = `${provider}: ${providerErrorMessage} | economy_fallback_failed: ${economyMessage}`;
          fallbackUsed = true;
          continue;
        }
      }

      lastProviderError = `${provider}: ${providerErrorMessage}`;
      fallbackUsed = true;
    }
  }

  if (lastProviderError) {
    console.warn(
      `[ai-router] provider chain failed without explicit altum_rules candidate; falling back to null result: ${lastProviderError}`
    );
  }

  return {
    result: null,
    providerChainError: lastProviderError || undefined,
    providerFallbackTriggered: fallbackUsed || Boolean(lastProviderError),
  };
}

