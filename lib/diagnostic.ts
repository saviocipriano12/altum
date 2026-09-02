export type DiagnosticAnswerKey = "revenue" | "segment" | "role" | "timeline" | "budget";

export type DiagnosticAnswerMap = Partial<Record<DiagnosticAnswerKey, string>>;

export type DiagnosticQuestion = {
  id: DiagnosticAnswerKey;
  title: string;
  description: string;
  options: Array<{ value: string; label: string }>;
};

export type DiagnosticRecommendation = {
  id:
    | "servico_entrada"
    | "altum_plataforma"
    | "plataforma_implantacao"
    | "agencia_plataforma"
    | "estrutura_digital";
  title: string;
  description: string;
  ctaLabel: string;
};

export type DiagnosticTemperature = "quente" | "morno" | "frio";

export type DiagnosticClassification = {
  recommendation: DiagnosticRecommendation;
  temperature: DiagnosticTemperature;
  score: number;
  isPrimaryIcp: boolean;
  contactBucket: "prioridade_alta" | "prioridade_media" | "contato_frio";
};

export const diagnosticQuestions: DiagnosticQuestion[] = [
  {
    id: "revenue",
    title: "Hoje, em media, qual faixa de faturamento da empresa?",
    description: "Isso ajuda a recomendar o caminho mais aderente ao momento da operacao.",
    options: [
      { value: "below_30", label: "Ate R$ 30 mil" },
      { value: "30_80", label: "R$ 30 mil a R$ 80 mil" },
      { value: "80_150", label: "R$ 80 mil a R$ 150 mil" },
      { value: "150_300", label: "R$ 150 mil a R$ 300 mil" },
      { value: "300_plus", label: "Acima de R$ 300 mil" },
    ],
  },
  {
    id: "segment",
    title: "Em qual segmento de mercado sua empresa atua?",
    description: "A Altum usa isso para entender o contexto comercial com mais rapidez.",
    options: [
      { value: "health", label: "Clinica / saude" },
      { value: "services", label: "Servicos profissionais" },
      { value: "engineering", label: "Engenharia / construcao" },
      { value: "education", label: "Educacao" },
      { value: "real_estate", label: "Imobiliario" },
      { value: "ecommerce", label: "E-commerce" },
      { value: "industry_b2b", label: "Industria / B2B" },
      { value: "other", label: "Outro" },
    ],
  },
  {
    id: "role",
    title: "Qual sua funcao hoje dentro da empresa?",
    description: "Isso nos ajuda a entender nivel de decisao, urgencia e profundidade da conversa.",
    options: [
      { value: "owner_partner", label: "Dono(a) / socio(a)" },
      { value: "director", label: "Diretor(a)" },
      { value: "sales_manager", label: "Gestor(a) comercial" },
      { value: "marketing_manager", label: "Gestor(a) de marketing" },
      { value: "coordinator", label: "Coordenador(a)" },
      { value: "other", label: "Outro" },
    ],
  },
  {
    id: "timeline",
    title: "Em quanto tempo voce tem interesse em comecar?",
    description: "A ideia aqui e entender o timing sem criar pressao desnecessaria.",
    options: [
      { value: "immediate", label: "Imediatamente" },
      { value: "30_days", label: "Nos proximos 30 dias" },
      { value: "90_days", label: "Nos proximos 90 dias" },
      { value: "evaluating", label: "So estou avaliando por enquanto" },
    ],
  },
  {
    id: "budget",
    title: "Ja existe alguma faixa de investimento pensada?",
    description: "Nao e uma proposta final. E so uma referencia para indicar o caminho certo.",
    options: [
      { value: "undefined", label: "Ainda nao defini" },
      { value: "up_to_3k", label: "Ate R$ 3 mil" },
      { value: "3k_8k", label: "R$ 3 mil a R$ 8 mil" },
      { value: "8k_15k", label: "R$ 8 mil a R$ 15 mil" },
      { value: "over_15k", label: "Acima de R$ 15 mil" },
    ],
  },
] as const;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function getDiagnosticAnswerLabel(questionId: DiagnosticAnswerKey, value: unknown) {
  const normalized = clean(value, 120);
  const question = diagnosticQuestions.find((item) => item.id === questionId);
  if (!question) return normalized;
  return question.options.find((option) => option.value === normalized)?.label || normalized;
}

export function normalizeDiagnosticAnswers(value: unknown): DiagnosticAnswerMap {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return diagnosticQuestions.reduce<DiagnosticAnswerMap>((acc, question) => {
    const normalized = clean(source[question.id], 120);
    if (question.options.some((option) => option.value === normalized)) {
      acc[question.id] = normalized;
    }
    return acc;
  }, {});
}

export function buildDiagnosticSummary(answers: DiagnosticAnswerMap) {
  return diagnosticQuestions
    .map((question) => `${question.title}: ${getDiagnosticAnswerLabel(question.id, answers[question.id]) || "Nao informado"}`)
    .join(" | ");
}

export function getDiagnosticAnswerDetails(answers: DiagnosticAnswerMap) {
  return diagnosticQuestions.map((question) => ({
    id: question.id,
    title: question.title,
    value: answers[question.id] || "",
    label: getDiagnosticAnswerLabel(question.id, answers[question.id]) || "Nao informado",
  }));
}

function resolveRevenueScore(revenue: string | undefined) {
  switch (revenue) {
    case "30_80":
      return 1;
    case "80_150":
      return 2;
    case "150_300":
      return 3;
    case "300_plus":
      return 4;
    default:
      return 0;
  }
}

function resolveRoleScore(role: string | undefined) {
  switch (role) {
    case "owner_partner":
    case "director":
      return 2;
    case "sales_manager":
    case "marketing_manager":
      return 1;
    default:
      return 0;
  }
}

function resolveTimelineScore(timeline: string | undefined) {
  switch (timeline) {
    case "immediate":
    case "30_days":
      return 2;
    case "90_days":
      return 1;
    default:
      return 0;
  }
}

function resolveBudgetScore(budget: string | undefined) {
  switch (budget) {
    case "3k_8k":
      return 1;
    case "8k_15k":
      return 2;
    case "over_15k":
      return 3;
    default:
      return 0;
  }
}

export function resolveDiagnosticRecommendation(answers: DiagnosticAnswerMap): DiagnosticRecommendation {
  return classifyDiagnosticLead(answers).recommendation;
}

export function classifyDiagnosticLead(answers: DiagnosticAnswerMap): DiagnosticClassification {
  const isPrimaryIcp = answers.revenue !== "below_30" && Boolean(answers.revenue);
  const score =
    resolveRevenueScore(answers.revenue) +
    resolveRoleScore(answers.role) +
    resolveTimelineScore(answers.timeline) +
    resolveBudgetScore(answers.budget);

  let temperature: DiagnosticTemperature = "frio";
  if (isPrimaryIcp) {
    if (score >= 7) {
      temperature = "quente";
    } else if (score >= 4) {
      temperature = "morno";
    }
  }

  let recommendation: DiagnosticRecommendation;

  if (!isPrimaryIcp || answers.budget === "up_to_3k") {
    recommendation = {
      id: "servico_entrada",
      title: "Altum Essencial",
      description:
        "Seu perfil indica uma entrada mais enxuta para organizar conversas, clientes e rotina comercial antes de ampliar automacoes e inteligencia.",
      ctaLabel: "Falar sobre o Altum Essencial",
    };
  } else if (
    answers.revenue === "150_300" ||
    answers.revenue === "300_plus" ||
    answers.budget === "over_15k"
  ) {
    recommendation = {
      id: "estrutura_digital",
      title: "Altum Operacao Avancada",
      description:
        "Sua empresa tem perfil para conectar canais, campanhas, operacao comercial, e-commerce, relatorios e IA em uma estrutura mais completa.",
      ctaLabel: "Falar sobre Operacao Avancada",
    };
  } else if (
    (answers.timeline === "immediate" || answers.timeline === "30_days") &&
    answers.budget === "8k_15k"
  ) {
    recommendation = {
      id: "plataforma_implantacao",
      title: "Plataforma + Implantacao",
      description:
        "O caminho mais forte parece ser entrar com a plataforma ja acompanhada de setup, configuracao comercial e apoio inicial da equipe.",
      ctaLabel: "Falar sobre Plataforma + Implantacao",
    };
  } else if (
    answers.revenue === "80_150" &&
    ["owner_partner", "director", "marketing_manager"].includes(answers.role || "")
  ) {
    recommendation = {
      id: "agencia_plataforma",
      title: "Altum Growth",
      description:
        "Seu momento indica espaco para conectar captacao, atribuicao de campanhas e operacao comercial com mais intencao de crescimento.",
      ctaLabel: "Falar sobre Altum Growth",
    };
  } else {
    recommendation = {
      id: "altum_plataforma",
      title: "Altum Plataforma",
      description:
        "Seu perfil sugere uma entrada mais direta pela plataforma, com espaco para ativar implantacao ou servicos complementares depois.",
      ctaLabel: "Falar sobre a Plataforma",
    };
  }

  return {
    recommendation,
    temperature,
    score,
    isPrimaryIcp,
    contactBucket:
      temperature === "quente"
        ? "prioridade_alta"
        : temperature === "morno"
          ? "prioridade_media"
          : "contato_frio",
  };
}

export function buildDiagnosticWhatsappMessage(
  answers: DiagnosticAnswerMap,
  recommendation: DiagnosticRecommendation,
  lead?: { nome?: string; empresa?: string }
) {
  const leadPrefix = [clean(lead?.nome, 120), clean(lead?.empresa, 120)].filter(Boolean).join(" - ");
  const intro = leadPrefix ? `Ola, sou ${leadPrefix}.` : "Ola.";
  return `${intro} Acabei de preencher o Diagnostico Altum. Caminho sugerido: ${recommendation.title}. Resumo: ${buildDiagnosticSummary(answers)}`;
}
