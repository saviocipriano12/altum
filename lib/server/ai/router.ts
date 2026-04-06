import type {
  AltumAiAutonomyMode,
  AltumAiProvider,
  AltumAiReasoningLevel,
  AltumAiResponseStyle,
  AltumAiTier,
} from "@/lib/server/ai/operating-layer";
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
  contactName?: string;
  runtimeStateSummary?: string;
  leadMemorySummary?: string;
  toneOfVoice: string;
  businessSummary: string;
  objective?: string;
  guardrails: string[];
  mandatoryQuestions?: string[];
  escalationTopics?: string[];
  playbookOffers?: BusinessProfilePlaybookOffer[];
  playbookScripts?: BusinessProfilePlaybookScript[];
  tier: AltumAiTier;
  autonomyMode: AltumAiAutonomyMode;
  reasoningLevel: AltumAiReasoningLevel;
  responseStyle: AltumAiResponseStyle;
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

  const systemPrompt = [
    "Voce e um agente conversacional comercial da ALTUM.",
    "Converse em portugues do Brasil como uma pessoa atenta, clara e natural no WhatsApp.",
    "Entenda o que o lead acabou de dizer e responda isso primeiro.",
    "Nao siga roteiro, nao soe como chatbot e nao transforme cada turno em qualificacao forcada.",
    "Se o lead fizer uma pergunta direta, responda com clareza antes de conduzir qualquer outra coisa.",
    "Se o lead fizer um turno humano ou relacional, responda de forma humana e nao cole pergunta comercial na mesma mensagem sem necessidade.",
    "Se o lead responder curto, trate como continuidade do assunto vivo. Nao reinicie nem repita bloco.",
    "Quando faltar contexto, faca no maximo uma pergunta curta e realmente util.",
    "Nao use menu de opcoes em saudacao simples.",
    "Nao use bordoes de vendedor nem frases institucionais repetitivas.",
    "Nao invente oferta, preco, prazo, prova social ou promessa.",
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
    `Negocio: ${sanitizeText(input.businessSummary, 240) || "empresa cliente da ALTUM"}.`,
    `Objetivo da IA: ${sanitizeText(input.objective, 140) || "entender o lead, orientar bem e avancar a conversa"}.`,
    `Tom esperado: ${sanitizeText(input.toneOfVoice, 80) || "claro e humano"}.`,
    `Canal: ${input.channel}. Nome conhecido do contato: ${sanitizeText(input.contactName, 80) || "nao informado"}.`,
    multimodalSummary ? `Resumo multimodal: ${multimodalSummary}` : "",
    messageType ? `Tipo de mensagem: ${messageType}` : "",
    input.runtimeStateSummary ? `Contexto vivo da conversa:\n${sanitizeText(input.runtimeStateSummary, 220)}` : "",
    input.leadMemorySummary ? `Memoria relevante:\n${sanitizeText(input.leadMemorySummary, 220)}` : "",
    isShortFollowup ? "A mensagem atual parece uma continuidade curta. Continue do ponto vivo da conversa." : "",
    isDirectQuestion ? "A mensagem atual contem uma pergunta direta. Responda essa pergunta primeiro." : "",
    isGreetingOnly ? "A mensagem atual e apenas uma saudacao. Responda como conversa normal, sem menu." : "",
    escalations ? `Temas sensiveis para escalar:\n${escalations}` : "",
    guardrails ? `Limites importantes:\n${guardrails}` : "",
    playbookOffers ? `Ofertas disponiveis como referencia:\n${playbookOffers}` : "",
    conversation ? `Historico recente:\n${conversation}` : "",
    kb ? `Base relevante:\n${kb}` : "",
    `Mensagem atual do lead: ${inboundText}`,
    "Exemplo bom 1: lead='oi' -> responseText='Oi! Tudo bem? Como posso te ajudar?'",
    "Exemplo bom 2: lead='como voce esta?' -> responseText='Tudo certo por aqui. E por ai?'",
    "Exemplo bom 3: lead='quero gerar mais leads' -> responseText='Boa. Hoje voces captam mais por onde?'",
    'Retorne JSON no formato: {"decision":"respond|ask_more|handoff|skip","reason":"...","confidence":0.0,"responseText":"...","turnGoal":"...","memorySummary":"...","nextAction":"...","extractedFields":{"preferredName":"...","leadTone":"...","activeTopic":"...","businessType":"...","primaryGoal":"...","serviceInterest":"...","budgetBand":"...","city":"...","urgency":"...","decisionMaker":"...","digitalMaturity":"...","currentChannels":"...","teamSize":"...","objectionType":"...","intent":"..."}}',
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
    throw new Error(`openai_http_${response.status}`);
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
    throw new Error(`anthropic_http_${response.status}`);
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
    throw new Error(`gemini_http_${response.status}`);
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
    throw new Error(`mistral_http_${response.status}`);
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
    return tier === "elite" || tier === "enterprise" ? "gpt-5.4" : "gpt-5-mini";
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

export async function runConversationAgent(
  input: ConversationAgentInput,
  policy: RuntimePolicy
): Promise<ConversationAgentResult | null> {
  const providers = candidateProviders(policy, input.preferredProviders);
  let fallbackUsed = false;

  for (const provider of providers) {
    if (provider === "altum_rules") {
      return null;
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
          ...result,
          fallbackUsed,
        };
      }
    } catch {
      fallbackUsed = true;
    }
  }

  return null;
}

