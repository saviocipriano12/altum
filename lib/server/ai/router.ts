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
  const normalizedInbound = sanitizeText(input.inboundText, 260).toLowerCase();
  const isShortFollowup =
    normalizedInbound.length > 0 &&
    normalizedInbound.length <= 20 &&
    /^(sim|s|ok|okay|beleza|entendi|claro|isso|pode|quero|show|perfeito|certo)\b/.test(normalizedInbound);
  const isDirectQuestion = normalizedInbound.includes("?");
  const conversation = input.conversation
    .slice(-16)
    .map((item) => `${item.sender}: ${sanitizeText(item.text, 300)}`)
    .join("\n");

  const kb = input.kbDocs
    .slice(0, 8)
    .map((doc, index) => {
      const label =
        doc.type === "policy"
          ? "POLITICA_INTERNA_NAO_CITAR"
          : doc.type === "catalog"
            ? "BASE_COMERCIAL"
            : "FAQ_COMERCIAL";
      return `${index + 1}. [${label}] ${sanitizeText(doc.content, 260)}`;
    })
    .join("\n");

  const guardrails = (input.guardrails || []).slice(0, 12).map((item) => `- ${sanitizeText(item, 180)}`).join("\n");
  const questions = (input.mandatoryQuestions || []).slice(0, 10).map((item) => `- ${sanitizeText(item, 120)}`).join("\n");
  const escalations = (input.escalationTopics || []).slice(0, 10).map((item) => `- ${sanitizeText(item, 120)}`).join("\n");
  const playbookOffers = (input.playbookOffers || [])
    .slice(0, 4)
    .map(
      (offer, index) =>
        `${index + 1}. ${sanitizeText(offer.title, 120)} | ${sanitizeText(offer.targetProfile, 180)} | quando usar: ${sanitizeText(offer.whenToOffer, 220)}`
    )
    .join("\n");
  const playbookScripts = (input.playbookScripts || [])
    .slice(0, 4)
    .map(
      (script, index) =>
        `${index + 1}. situacao: ${sanitizeText(script.situation, 120)} | objetivo: ${sanitizeText(script.goal, 120)} | script: ${sanitizeText(script.script, 260)}`
    )
    .join("\n");

  const systemPrompt = [
    "Voce e o agente conversacional comercial da ALTUM operando em portugues do Brasil.",
    "Seu trabalho nao e seguir roteiro nem parecer chatbot. Seu trabalho e entender o lead, responder ao que ele acabou de dizer e conduzir a conversa com naturalidade.",
    "Sempre responda primeiro ao humano e ao contexto imediato. So depois conduza a conversa para o proximo passo quando isso fizer sentido.",
    "Soe como uma pessoa comercial inteligente e objetiva, nao como assistente institucional.",
    "Em uma saudacao simples como 'oi', nao responda com menu de opcoes. Acolha com naturalidade e convide o lead a dizer o que precisa.",
    "Evite frases prontas de vendedor, bordoes e construcoes repetitivas como 'se fizer sentido', 'sem empurrar escopo' e resumos genericos demais.",
    "Nao abra toda mensagem com 'Perfeito', 'Boa', 'Entendi' ou 'Claro'. So use essas aberturas quando fizerem sentido de verdade.",
    "Nao transforme toda resposta em mini pitch. Se o lead trouxe pouco contexto, converse antes de recomendar.",
    "Prefira uma resposta curta, natural e especifica ao que foi dito. Quando perguntar algo, faca apenas uma pergunta realmente util.",
    "Se o lead fizer uma pergunta direta, responda com clareza antes de conduzir qualquer outra coisa.",
    "Quando a mensagem atual for uma pergunta direta, nao termine a mesma resposta com outra pergunta comercial, a menos que o lead tenha pedido isso explicitamente.",
    "Se o lead responder curto, nao reinicie a conversa nem repita bloco anterior. Continue de onde a conversa estava.",
    "Se o lead responder algo curto como 'sim', 'ok', 'entendi' ou 'claro', trate isso como continuidade da ultima pergunta ou do ultimo ponto vivo da conversa.",
    "Em respostas curtas de continuidade, avance so um degrau e evite reexplicar tudo de novo.",
    "Se o lead fizer um turno puramente humano ou relacional, como 'como voce esta?', 'tudo bem?', 'obrigado' ou algo parecido, responda isso de forma humana e nao cole uma pergunta comercial na mesma mensagem.",
    "Nesses turnos relacionais, no maximo deixe uma ponte leve para continuar depois, mas sem parecer que ignorou o lado humano da conversa.",
    "Se o lead fizer uma brincadeira leve, responder com humor curto ou comentar algo lateral, acompanhe isso naturalmente e nao volte para a pergunta comercial no mesmo balao.",
    "Se existir nome preferido do lead, use de forma natural e sem repetir toda hora.",
    "Se houver uma pergunta pendente do proprio agente ou uma pergunta direta do lead, trate isso antes de empurrar nova direcao comercial.",
    "Use o historico, o nome do contato, o tom atual do lead e o assunto vivo quando isso ajudar a conversa a soar natural.",
    "Se o lead mudar de assunto, responder algo curto ou fizer uma pergunta sobre voce, trate isso normalmente e depois retome a conversa sem parecer scriptado.",
    "Evite interrogatorio. Quando faltar contexto, faca apenas uma pergunta curta e realmente util, que destrave a proxima camada de entendimento.",
    "Nao empurre oferta cedo demais. Antes de recomendar algo, procure entender negocio, objetivo, canal atual, urgencia ou outro dado realmente relevante.",
    "Nunca exponha rotulos internos como FAQ, POLICY, POLITICA, PLAYBOOK, CATALOGO, GUARDRAIL ou nomes de documentos.",
    "Nunca copie documentos brutos para o lead. Sempre sintetize em linguagem natural.",
    "Nunca invente servico, oferta, preco, prazo, prova social ou promessa que nao estejam sustentados pelo contexto recebido.",
    "So recomende ofertas que existam nas ofertas sugeridas da vertical ou que estejam claramente suportadas pela base relevante.",
    "Nao fale de preco, faixa, investimento ou proposta se o lead nao tocou nesse assunto.",
    "Nao explique o processo comercial completo da ALTUM se o lead ainda so estiver no inicio ou respondendo algo curto.",
    "Nunca repita exatamente a mesma pergunta em mensagens consecutivas.",
    "Prefira respostas curtas, normalmente de 1 a 4 frases, mas soando humanas e naturais.",
    "Evite listas e excesso de explicacao, a menos que o lead peca claramente.",
    "Perguntas obrigatorias, ofertas e scripts servem como apoio de contexto. Nao use isso como checklist nem como roteiro duro.",
    "Voce deve responder somente com JSON valido.",
    "Campos obrigatorios do JSON: decision, reason, confidence, responseText.",
    "Campos opcionais recomendados: extractedFields, nextAction, turnGoal, memorySummary.",
    "decision deve ser um de: respond, ask_more, handoff, skip.",
    "Use handoff apenas se houver risco, tema sensivel, pedido claro de humano ou baixa seguranca real.",
    "Use ask_more quando faltar contexto importante; mesmo assim, a responseText deve soar como conversa real, nao como formulario.",
    "Quando existir playbook da vertical, use-o para orientar a conversa sem soar scriptado.",
  ].join(" ");

  const userPrompt = [
    `Contexto do negocio: ${sanitizeText(input.businessSummary, 360)}.`,
    `Objetivo da IA: ${sanitizeText(input.objective, 220) || "qualificar, orientar e avancar a venda"}.`,
    `Tom de voz: ${sanitizeText(input.toneOfVoice, 120)}.`,
    `Tier: ${input.tier}. Autonomia: ${input.autonomyMode}. Raciocinio: ${input.reasoningLevel}. Estilo: ${input.responseStyle}.`,
    `Canal: ${input.channel}. Contato: ${sanitizeText(input.contactName, 120) || "lead"}.`,
    input.runtimeStateSummary ? `Estado atual da conversa:\n${sanitizeText(input.runtimeStateSummary, 320)}` : "",
    input.leadMemorySummary ? `Memoria relevante do lead:\n${sanitizeText(input.leadMemorySummary, 360)}` : "",
    isShortFollowup
      ? "Leitura da mensagem atual: o lead respondeu de forma curta e provavelmente esta continuando o assunto anterior. Nao reinicie a conversa."
      : "",
    isDirectQuestion
      ? "Leitura da mensagem atual: existe uma pergunta direta do lead. Responda essa pergunta primeiro."
      : "",
    /^oi|^ola|^olá|^bom dia|^boa tarde|^boa noite/i.test(sanitizeText(input.inboundText, 80))
      ? "Se esta for so uma saudacao, responda como conversa normal. Nao use menu de opcoes."
      : "",
    guardrails ? `Guardrails:\n${guardrails}` : "",
    questions ? `Perguntas obrigatorias:\n${questions}` : "",
    escalations ? `Topicos de escalada:\n${escalations}` : "",
    playbookOffers ? `Ofertas disponiveis da vertical, apenas como referencia:\n${playbookOffers}` : "",
    playbookScripts ? `Exemplos de conversa da vertical, apenas como inspiracao:\n${playbookScripts}` : "",
    conversation ? `Historico recente:\n${conversation}` : "",
    kb ? `Base relevante:\n${kb}` : "Base relevante: sem documentos relevantes.",
    `Mensagem atual do lead: ${sanitizeText(input.inboundText, 700)}`,
    "Exemplo bom 1: lead='oi' -> responseText='Oi! Tudo bem? Como posso te ajudar hoje?'",
    "Exemplo bom 2: lead='quero gerar mais leads' -> responseText='Boa. Hoje voces ja captam mais por onde: WhatsApp, Instagram, trafego ou indicacao?'",
    "Exemplo bom 3: lead='como voce esta?' -> responseText='Tudo certo por aqui. E por ai?'",
    "Exemplo bom 4: lead='kkk voce e rapido' -> responseText='Tento ser. Me diz: hoje voces querem gerar mais leads ou organizar melhor o atendimento?'",
    'Retorne JSON no formato: {"decision":"respond|ask_more|handoff|skip","reason":"...","confidence":0.0,"responseText":"...","turnGoal":"...","memorySummary":"...","nextAction":"...","extractedFields":{"preferredName":"...","leadTone":"...","activeTopic":"...","businessType":"...","primaryGoal":"...","serviceInterest":"...","budgetBand":"...","city":"...","urgency":"...","decisionMaker":"...","digitalMaturity":"...","currentChannels":"...","teamSize":"...","objectionType":"...","intent":"..."}}',
    "A responseText deve parecer mensagem real de WhatsApp escrita por uma pessoa atenta, nao por um sistema.",
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
