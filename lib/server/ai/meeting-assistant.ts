type MeetingAssistantLead = {
  nome?: unknown;
  empresa?: unknown;
  origem?: unknown;
  telefone?: unknown;
  email?: unknown;
  notes?: unknown;
  commercialDossier?: unknown;
};

type MeetingAssistantAppointment = {
  title?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  meetingUrl?: unknown;
  notes?: unknown;
};

export type AssistedMeetingSummary = {
  executiveSummary: string;
  leadNeed: string;
  painPoints: string[];
  objections: string[];
  buyingSignals: string[];
  nextSteps: string[];
  sellerCoaching: string[];
  followUpMessage: string;
  crmUpdate: string;
  qualification: {
    temperature: "frio" | "morno" | "quente";
    confidence: number;
    recommendedStage: string;
  };
};

function clean(value: unknown, max = 600) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanList(value: unknown, max = 8) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => clean(item, 240)).filter(Boolean).slice(0, max);
}

function normalizeTemperature(value: unknown): AssistedMeetingSummary["qualification"]["temperature"] {
  const text = clean(value, 40).toLowerCase();
  if (text === "quente" || text === "hot") return "quente";
  if (text === "frio" || text === "cold") return "frio";
  return "morno";
}

function normalizeSummary(value: unknown): AssistedMeetingSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const qualification = raw.qualification && typeof raw.qualification === "object"
    ? raw.qualification as Record<string, unknown>
    : {};
  return {
    executiveSummary: clean(raw.executiveSummary, 1200),
    leadNeed: clean(raw.leadNeed, 800),
    painPoints: cleanList(raw.painPoints),
    objections: cleanList(raw.objections),
    buyingSignals: cleanList(raw.buyingSignals),
    nextSteps: cleanList(raw.nextSteps),
    sellerCoaching: cleanList(raw.sellerCoaching),
    followUpMessage: clean(raw.followUpMessage, 1400),
    crmUpdate: clean(raw.crmUpdate, 1400),
    qualification: {
      temperature: normalizeTemperature(qualification.temperature),
      confidence: Math.max(0, Math.min(100, Number(qualification.confidence || 60))),
      recommendedStage: clean(qualification.recommendedStage, 120) || "follow_up",
    },
  };
}

function fallbackSummary(input: {
  transcript: string;
  notes: string;
  objective: string;
  lead: MeetingAssistantLead | null;
}): AssistedMeetingSummary {
  const source = [input.transcript, input.notes].filter(Boolean).join(" ");
  const lowered = source.toLowerCase();
  const hot = /(proposta|contrato|fechar|comprar|pagar|reuniao|orçamento|orcamento|valor|preco|preço)/.test(lowered);
  const objectionPrice = /(caro|preco|preço|valor|orçamento|orcamento|investimento)/.test(lowered);
  const objectionTime = /(tempo|prazo|agora|depois|sem urgencia|sem urgência)/.test(lowered);
  const leadName = clean(input.lead?.nome, 140) || "o lead";
  const company = clean(input.lead?.empresa, 140);
  const objective = input.objective || "avancar para o proximo passo comercial";

  return {
    executiveSummary: `Reuniao registrada com ${leadName}${company ? ` (${company})` : ""}. O objetivo principal e ${objective}. Validar necessidade, urgencia e proximo passo com clareza.`,
    leadNeed: input.objective || "Confirmar a necessidade principal e conectar com a oferta correta.",
    painPoints: [
      "Mapear o problema central citado na reuniao.",
      "Confirmar impacto financeiro ou operacional do problema.",
      "Entender quem participa da decisao.",
    ],
    objections: [
      ...(objectionPrice ? ["Possivel objecao de preco/investimento."] : []),
      ...(objectionTime ? ["Possivel objecao de tempo ou prioridade."] : []),
      ...(!objectionPrice && !objectionTime ? ["Nenhuma objecao clara foi isolada automaticamente."] : []),
    ],
    buyingSignals: hot ? ["Lead citou proposta, valor, contrato ou proximo passo."] : ["Lead ainda precisa demonstrar um sinal mais forte de compra."],
    nextSteps: [
      "Enviar follow-up com resumo e proximo passo combinado.",
      "Atualizar etapa do CRM conforme temperatura.",
      hot ? "Preparar proposta ou reuniao de fechamento." : "Fazer nova pergunta de qualificacao antes da proposta.",
    ],
    sellerCoaching: [
      "Comecar o retorno confirmando o que foi entendido.",
      "Evitar perguntas repetidas e conduzir para uma decisao simples.",
      "Se houver duvida, oferecer uma recomendacao objetiva em vez de abrir muitas alternativas.",
    ],
    followUpMessage: `Oi, ${leadName}. Recapitulando nossa conversa: entendi que o foco agora e ${objective}. O melhor proximo passo e alinharmos os detalhes finais e te mostrar o caminho mais direto para isso. Faz sentido eu seguir por aqui?`,
    crmUpdate: `Reuniao analisada. Temperatura ${hot ? "quente" : "morno"}. Proximo passo: ${hot ? "proposta ou fechamento" : "qualificacao e follow-up"}.`,
    qualification: {
      temperature: hot ? "quente" : "morno",
      confidence: hot ? 78 : 58,
      recommendedStage: hot ? "proposta" : "follow_up",
    },
  };
}

export function summaryToMarkdown(summary: AssistedMeetingSummary) {
  return [
    "# Resumo da reuniao assistida",
    "",
    "## Resumo executivo",
    summary.executiveSummary,
    "",
    "## Necessidade principal",
    summary.leadNeed,
    "",
    "## Dores",
    ...summary.painPoints.map((item) => `- ${item}`),
    "",
    "## Objeccoes",
    ...summary.objections.map((item) => `- ${item}`),
    "",
    "## Sinais de compra",
    ...summary.buyingSignals.map((item) => `- ${item}`),
    "",
    "## Proximos passos",
    ...summary.nextSteps.map((item) => `- ${item}`),
    "",
    "## Coaching para vendedor",
    ...summary.sellerCoaching.map((item) => `- ${item}`),
    "",
    "## Follow-up sugerido",
    summary.followUpMessage,
    "",
    "## Atualizacao para CRM",
    summary.crmUpdate,
  ].join("\n").slice(0, 10000);
}

export async function generateAssistedMeetingSummary(input: {
  transcript: string;
  notes: string;
  objective: string;
  language: string;
  lead: MeetingAssistantLead | null;
  appointment: MeetingAssistantAppointment | null;
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  const transcript = clean(input.transcript, 12000);
  const notes = clean(input.notes, 3000);
  if (!apiKey) {
    return fallbackSummary({ transcript, notes, objective: clean(input.objective, 500), lead: input.lead });
  }

  const prompt = {
    role: "user",
    content: [
      "Analise a reuniao comercial abaixo e responda APENAS JSON valido.",
      "Use portugues claro e direto. Seja vendedor, objetivo e pratico.",
      "Campos obrigatorios: executiveSummary, leadNeed, painPoints[], objections[], buyingSignals[], nextSteps[], sellerCoaching[], followUpMessage, crmUpdate, qualification{temperature,confidence,recommendedStage}.",
      `Idioma/mercado: ${clean(input.language, 80) || "pt_BR"}.`,
      `Objetivo esperado: ${clean(input.objective, 500) || "qualificar e conduzir para venda ou reuniao de fechamento"}.`,
      `Lead: ${JSON.stringify(input.lead || {})}`,
      `Compromisso: ${JSON.stringify(input.appointment || {})}`,
      `Notas manuais: ${notes || "sem notas"}`,
      `Transcricao: ${transcript || "sem transcricao"}`,
    ].join("\n\n"),
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MEETING_SUMMARY_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Voce e uma IA de vendas B2B/B2C que transforma reunioes em resumo comercial, coaching e proximos passos executaveis.",
          },
          prompt,
        ],
      }),
    });
    if (!response.ok) throw new Error(`openai_${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content || "";
    const parsed = normalizeSummary(JSON.parse(content));
    if (parsed?.executiveSummary) return parsed;
  } catch (error) {
    console.error("Falha ao gerar resumo de reuniao por IA:", error);
  }

  return fallbackSummary({ transcript, notes, objective: clean(input.objective, 500), lead: input.lead });
}
