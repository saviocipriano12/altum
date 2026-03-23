export type BusinessProfileId = "generic" | "imobiliaria" | "clinica" | "agencia";

type ProfileCaptureLandingConfig = {
  badge: string;
  heroTitle: string;
  heroDescription: string;
  ctaNote: string;
  formCardTitle: string;
  formCardDescription: string;
  highlights: string[];
  metrics: Array<{ label: string; value: string }>;
  testimonials: Array<{ quote: string; author: string; role?: string }>;
  faq: Array<{ question: string; answer: string }>;
};

type ProfileCaptureFieldDefinition = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "number" | "date" | "checkbox";
  required: boolean;
  placeholder?: string;
  helperText?: string;
  options?: string[];
  step?: number;
};

type ProfilePipelineStageDefinition = {
  id: string;
  label: string;
  description: string;
  color: string;
  position: number;
  isTerminal?: boolean;
};

export type BusinessProfilePlaybookOffer = {
  title: string;
  category: string;
  targetProfile: string;
  whenToOffer: string;
  priceFrom: number;
  priceTo: number;
};

export type BusinessProfilePlaybookScript = {
  situation: string;
  goal: string;
  script: string;
};

export type BusinessProfile = {
  id: BusinessProfileId;
  label: string;
  description: string;
  commercialMotion: string;
  ai: {
    objective: string;
    toneOfVoice: string;
    mandatoryQuestions: string[];
    escalationTopics: string[];
    guardrails: string[];
  };
  crm: {
    leadFields: string[];
    suggestedTags: string[];
  };
  pipeline: {
    stages: string[];
  };
  metrics: string[];
};

export const BUSINESS_PROFILES: Record<BusinessProfileId, BusinessProfile> = {
  generic: {
    id: "generic",
    label: "Operacao comercial geral",
    description: "Base horizontal da ALTUM para empresas com atendimento comercial orientado a lead.",
    commercialMotion: "qualificar, orientar e avancar o lead para proximo passo comercial",
    ai: {
      objective: "qualificar o lead, responder duvidas iniciais e conduzir para o proximo passo comercial",
      toneOfVoice: "consultivo e objetivo",
      mandatoryQuestions: ["Qual servico ou produto voce procura?", "Qual prazo para comecar?", "Existe uma faixa de investimento prevista?"],
      escalationTopics: ["pedido explicito de humano", "reclamacao", "negociacao fora da politica", "tema sensivel"],
      guardrails: ["Nao prometer descontos, prazos ou condicoes sem validacao.", "Nao confirmar informacoes nao documentadas."],
    },
    crm: {
      leadFields: ["origem", "canal", "interesse", "prazo", "orcamento", "cidade"],
      suggestedTags: ["lead quente", "follow-up", "oportunidade"],
    },
    pipeline: {
      stages: ["captado", "contato_enviado", "respondido", "em_negociacao", "proposta_enviada", "fechado", "perdido"],
    },
    metrics: ["leads recebidos", "taxa de resposta", "taxa de handoff", "oportunidades abertas"],
  },
  imobiliaria: {
    id: "imobiliaria",
    label: "Modo Imobiliaria",
    description: "Fluxo para imobiliarias e corretores com foco em qualificacao de perfil, visita e proposta.",
    commercialMotion: "qualificar o perfil do comprador ou locatario e conduzir para visita, simulacao ou proposta",
    ai: {
      objective: "entender tipo de imovel, faixa de valor, regiao, urgencia e conduzir para visita ou simulacao",
      toneOfVoice: "consultivo, seguro e muito humano",
      mandatoryQuestions: ["Qual tipo de imovel voce busca?", "Qual faixa de valor ou aluguel?", "Qual regiao ou bairro de interesse?", "Voce pretende financiar?"],
      escalationTopics: ["negociacao especial", "documentacao complexa", "condicao fora da politica", "pedido de corretor humano"],
      guardrails: ["Nao prometer disponibilidade de imovel sem validacao.", "Nao prometer aprovacao de financiamento.", "Nao negociar condicoes comerciais fora da politica."],
    },
    crm: {
      leadFields: ["tipo_imovel", "bairro", "faixa_valor", "financiamento", "urgencia", "cidade"],
      suggestedTags: ["visita", "financiamento", "investidor"],
    },
    pipeline: {
      stages: ["captado", "contato_enviado", "qualificado", "visita_agendada", "proposta", "fechado", "perdido"],
    },
    metrics: ["visitas agendadas", "simulacoes", "propostas", "vendas fechadas"],
  },
  clinica: {
    id: "clinica",
    label: "Modo Clinica",
    description: "Fluxo para clinicas privadas, estetica e operacoes de agendamento com atendimento consultivo.",
    commercialMotion: "qualificar necessidade, contexto do paciente e conduzir para avaliacao, agendamento ou procedimento",
    ai: {
      objective: "entender o procedimento de interesse, urgencia, restricoes e conduzir para avaliacao ou agendamento",
      toneOfVoice: "acolhedor, consultivo e premium",
      mandatoryQuestions: ["Qual procedimento ou especialidade voce procura?", "Existe uma urgencia ou data ideal?", "Voce ja realizou esse procedimento antes?", "Qual cidade ou unidade de preferencia?"],
      escalationTopics: ["queixa clinica sensivel", "urgencia medica", "pedido de profissional humano", "tema financeiro delicado"],
      guardrails: ["Nao dar orientacao clinica ou diagnostico.", "Nao prometer resultado medico.", "Escalar imediatamente temas sensiveis."],
    },
    crm: {
      leadFields: ["procedimento", "unidade", "urgencia", "historico", "orcamento", "cidade"],
      suggestedTags: ["avaliacao", "agendamento", "retorno"],
    },
    pipeline: {
      stages: ["captado", "triagem", "avaliacao", "orcamento", "agendamento", "realizado", "perdido"],
    },
    metrics: ["avaliacoes", "agendamentos", "show rate", "procedimentos fechados"],
  },
  agencia: {
    id: "agencia",
    label: "Modo Agencia",
    description: "Fluxo para agencias, consultorias e servicos B2B com diagnostico, proposta e onboarding.",
    commercialMotion: "diagnosticar maturidade do cliente, identificar dores e conduzir para reuniao ou proposta",
    ai: {
      objective: "qualificar nicho, momento, budget, urgencia e conduzir para diagnostico, reuniao ou proposta",
      toneOfVoice: "estrategico, seguro e executivo",
      mandatoryQuestions: ["Qual e o nicho da sua empresa?", "Qual principal objetivo comercial agora?", "Existe budget mensal previsto?", "Voce ja roda trafego ou CRM hoje?"],
      escalationTopics: ["proposta customizada", "pedido de desconto especial", "escopo complexo", "negociacao enterprise"],
      guardrails: ["Nao prometer resultado financeiro garantido.", "Nao confirmar escopo sem diagnostico.", "Nao negociar preco fora da politica."],
    },
    crm: {
      leadFields: ["nicho", "objetivo", "budget_mensal", "maturidade", "time", "canal_principal"],
      suggestedTags: ["diagnostico", "trafego", "crm", "enterprise"],
    },
    pipeline: {
      stages: ["captado", "qualificado", "diagnostico", "proposta_enviada", "negociacao", "onboarding", "perdido"],
    },
    metrics: ["diagnosticos", "propostas", "MRR fechado", "tempo ate fechamento"],
  },
};

const STAGE_DESCRIPTIONS: Record<string, string> = {
  captado: "Entradas novas no fluxo comercial deste perfil.",
  contato: "Primeiro contato ou retorno inicial em andamento.",
  qualificacao: "Contexto, fit e prioridade sendo validados.",
  triagem: "Primeira triagem para decidir o proximo passo.",
  avaliacao: "Lead em avaliacao ou descoberta guiada.",
  visita_agendada: "Etapa reservada para visita ou demonstracao.",
  proposta: "Oferta, proposta ou simulacao em construcao.",
  orcamento: "Valor, condicao ou escopo em discussao.",
  agendamento: "Data ou atendimento sendo confirmado.",
  diagnostico: "Diagnostico, briefing ou descoberta estrategica.",
  negociacao: "Ajustes finais antes da decisao.",
  fechamento: "Decisao comercial e fechamento em curso.",
  onboarding: "Cliente convertido, em transicao para entrega.",
  realizado: "Servico ou atendimento ja realizado.",
  ganho: "Oportunidade convertida em venda.",
  perdido: "Negocio perdido ou arquivado.",
};

const CRM_FIELD_PRESETS: Record<string, Omit<ProfileCaptureFieldDefinition, "id" | "step">> = {
  interesse: {
    label: "Interesse principal",
    type: "text",
    required: true,
    placeholder: "Qual servico ou produto procura?",
    helperText: "Ajuda o CRM e a IA a entender o foco do lead.",
  },
  prazo: {
    label: "Prazo para comecar",
    type: "text",
    required: false,
    placeholder: "Ex.: este mes, em 30 dias",
    helperText: "Use para priorizar cadencia e abordagem.",
  },
  orcamento: {
    label: "Faixa de investimento",
    type: "text",
    required: false,
    placeholder: "Ex.: 5k a 10k",
    helperText: "Qualifica o potencial comercial sem travar a conversa.",
  },
  cidade: {
    label: "Cidade",
    type: "text",
    required: false,
    placeholder: "Cidade do lead",
    helperText: "Importante para atendimento local, agenda e roteamento.",
  },
  tipo_imovel: {
    label: "Tipo de imovel",
    type: "select",
    required: true,
    placeholder: "",
    helperText: "Ajuda a IA e o corretor a qualificar a busca.",
    options: ["Apartamento", "Casa", "Comercial", "Terreno"],
  },
  bairro: {
    label: "Bairro ou regiao",
    type: "text",
    required: false,
    placeholder: "Onde deseja morar ou investir?",
    helperText: "Regiao de interesse do lead.",
  },
  faixa_valor: {
    label: "Faixa de valor",
    type: "text",
    required: true,
    placeholder: "Ex.: 400k a 650k",
    helperText: "Faixa de compra, aluguel ou investimento.",
  },
  financiamento: {
    label: "Pretende financiar?",
    type: "checkbox",
    required: false,
    placeholder: "",
    helperText: "Ajuda a separar simulacao e documentacao.",
  },
  urgencia: {
    label: "Urgencia",
    type: "select",
    required: false,
    placeholder: "",
    helperText: "Tempo de decisao esperado.",
    options: ["Imediata", "30 dias", "60 dias", "Sem pressa"],
  },
  procedimento: {
    label: "Procedimento ou especialidade",
    type: "text",
    required: true,
    placeholder: "Qual atendimento voce busca?",
    helperText: "Base para triagem e agendamento.",
  },
  unidade: {
    label: "Unidade de preferencia",
    type: "text",
    required: false,
    placeholder: "Qual unidade ou regiao prefere?",
    helperText: "Ajuda no roteamento e agenda.",
  },
  historico: {
    label: "Contexto adicional",
    type: "textarea",
    required: false,
    placeholder: "Ja fez algo parecido? Existe alguma observacao importante?",
    helperText: "Coleta contexto para triagem consultiva.",
  },
  nicho: {
    label: "Nicho do negocio",
    type: "text",
    required: true,
    placeholder: "Ex.: clinica, imobiliaria, ecommerce",
    helperText: "Ajuda a qualificar fit do cliente ideal.",
  },
  objetivo: {
    label: "Objetivo principal",
    type: "textarea",
    required: true,
    placeholder: "O que quer melhorar agora?",
    helperText: "Direciona diagnostico, proposta e automacoes.",
  },
  budget_mensal: {
    label: "Budget mensal",
    type: "text",
    required: false,
    placeholder: "Ex.: 3k a 5k",
    helperText: "Orienta proposta, escopo e prioridade.",
  },
  maturidade: {
    label: "Maturidade atual",
    type: "select",
    required: false,
    placeholder: "",
    helperText: "Nivel atual de operacao comercial e marketing.",
    options: ["Comecando", "Operacao inicial", "Estruturado", "Escalando"],
  },
  time: {
    label: "Time comercial",
    type: "text",
    required: false,
    placeholder: "Quantas pessoas hoje?",
    helperText: "Ajuda a entender capacidade operacional.",
  },
  canal_principal: {
    label: "Canal principal",
    type: "select",
    required: false,
    placeholder: "",
    helperText: "Canal dominante de aquisicao ou atendimento.",
    options: ["WhatsApp", "Meta Ads", "Google Ads", "Indicacao", "Site"],
  },
};

export function normalizeBusinessProfileId(value: unknown): BusinessProfileId {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "imobiliaria" || raw === "clinica" || raw === "agencia") return raw;
  return "generic";
}

export function getBusinessProfile(profileId?: unknown) {
  return BUSINESS_PROFILES[normalizeBusinessProfileId(profileId)];
}

function toStageLabel(stageId: string) {
  return stageId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildCaptureField(fieldId: string, index: number): ProfileCaptureFieldDefinition | null {
  const preset = CRM_FIELD_PRESETS[fieldId];
  if (!preset) return null;
  return {
    id: fieldId,
    step: index < 3 ? 1 : 2,
    ...preset,
  };
}

function defaultProfileLandingConfig(): ProfileCaptureLandingConfig {
  return {
    badge: "Lead intake premium",
    heroTitle: "",
    heroDescription: "",
    ctaNote: "Resposta comercial com contexto e roteamento para CRM, inbox e automacoes.",
    formCardTitle: "Solicite um contato",
    formCardDescription: "Preencha os dados abaixo para entrar no fluxo comercial desta operacao.",
    highlights: [],
    metrics: [
      { label: "Roteamento", value: "Tenant isolado" },
      { label: "Atendimento", value: "IA + humano" },
      { label: "Operacao", value: "CRM integrado" },
    ],
    testimonials: [],
    faq: [],
  };
}

function normalizeProfileStageId(value: string) {
  const raw = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return PROFILE_STAGE_ALIASES[raw] || raw || "captado";
}

export function getBusinessProfilePipelineStages(profileId?: unknown): ProfilePipelineStageDefinition[] {
  const profile = getBusinessProfile(profileId);

  return profile.pipeline.stages.map((stageId, index) => {
    const normalizedId = normalizeProfileStageId(stageId);
    return {
      id: normalizedId,
      label: toStageLabel(normalizedId),
      description: STAGE_DESCRIPTIONS[normalizedId] || "Etapa adaptada ao fluxo comercial deste perfil.",
      color: PROFILE_STAGE_COLORS[index] || PROFILE_STAGE_COLORS[PROFILE_STAGE_COLORS.length - 1],
      position: index,
      isTerminal: normalizedId === "ganho" || normalizedId === "perdido" || normalizedId === "realizado",
    };
  });
}

export function getBusinessProfileCapturePreset(profileId?: unknown) {
  const profile = getBusinessProfile(profileId);
  const defaults = defaultProfileLandingConfig();
  const leadFields = profile.crm.leadFields
    .map((fieldId, index) => buildCaptureField(fieldId, index))
    .filter(Boolean) as ProfileCaptureFieldDefinition[];

  const landing: ProfileCaptureLandingConfig = {
    ...defaults,
    badge: profile.label,
    heroTitle:
      profile.id === "generic"
        ? "Capte leads com contexto e atendimento comercial orientado"
        : `${profile.label} com intake pensado para conversao`,
    heroDescription: `Esta landing coleta o contexto inicial do lead para ${profile.commercialMotion}. O fluxo ja nasce alinhado ao modo ${profile.label}.`,
    ctaNote: `Fluxo configurado para ${profile.commercialMotion}.`,
    formCardTitle:
      profile.id === "clinica"
        ? "Solicite sua avaliacao"
        : profile.id === "imobiliaria"
          ? "Quero falar com um especialista"
          : "Solicite um contato",
    formCardDescription: `Os dados entram direto no CRM e no inbox da operacao ${profile.label.toLowerCase()}.`,
    highlights: [
      `Qualificacao alinhada ao modo ${profile.label}.`,
      `Campos pensados para ${profile.commercialMotion}.`,
      "Entrada direta no CRM, inbox e automacoes do tenant.",
      `Leitura operacional baseada em ${profile.metrics.slice(0, 2).join(" e ")}.`,
    ],
    metrics: profile.metrics.slice(0, 3).map((metric) => ({ label: metric, value: "em tempo real" })),
  };

  return {
    nameSuggestion: `Formulario ${profile.label}`,
    descriptionSuggestion: `Intake publico preparado para ${profile.commercialMotion}.`,
    sourceLabel: `${profile.label} • captacao`,
    defaultPipelineStage: getBusinessProfilePipelineStages(profile.id)[0]?.id || "captado",
    tags: profile.crm.suggestedTags.map((tag) => tag.toLowerCase()).slice(0, 4),
    submitLabel: profile.id === "clinica" ? "Quero atendimento" : "Enviar",
    widgetLauncherLabel: profile.id === "imobiliaria" ? "Falar com consultor" : "Abrir chat",
    widgetGreeting: `${profile.ai.objective.charAt(0).toUpperCase()}${profile.ai.objective.slice(1)}.`,
    successMessage: "Recebemos seus dados e vamos direcionar o proximo passo comercial.",
    fields: leadFields,
    landing,
  };
}

export function getBusinessProfilePlaybookPreset(profileId?: unknown): {
  offers: BusinessProfilePlaybookOffer[];
  scripts: BusinessProfilePlaybookScript[];
} {
  const profile = getBusinessProfile(profileId);

  if (profile.id === "imobiliaria") {
    return {
      offers: [
        {
          title: "Atendimento de compradores",
          category: "Imobiliaria",
          targetProfile: "Lead buscando compra com faixa de valor definida",
          whenToOffer: "Quando o lead demonstra clareza de regiao, tipo de imovel e possibilidade de visita.",
          priceFrom: 1500,
          priceTo: 5000,
        },
        {
          title: "Consultoria para investimento",
          category: "Imobiliaria",
          targetProfile: "Investidor ou comprador buscando rentabilidade",
          whenToOffer: "Quando o lead cita rendimento, patrimonio ou segunda aquisicao.",
          priceFrom: 5000,
          priceTo: 15000,
        },
        {
          title: "Simulacao + documentacao assistida",
          category: "Financiamento",
          targetProfile: "Lead que depende de financiamento",
          whenToOffer: "Quando o lead confirma interesse e precisa entender entrada, aprovacao e documentos.",
          priceFrom: 900,
          priceTo: 2500,
        },
      ],
      scripts: [
        {
          situation: "Lead pediu imovel sem detalhar contexto",
          goal: "Descobrir perfil, faixa de valor e urgencia",
          script: "Perfeito. Para eu te direcionar com mais precisao, me conta rapidinho: qual tipo de imovel voce busca, em qual faixa de valor e qual regiao faz mais sentido para voce hoje?",
        },
        {
          situation: "Lead demonstrou interesse real em visita",
          goal: "Conduzir para visita agendada",
          script: "Excelente, faz sentido avancarmos para visita. Me confirma sua melhor disponibilidade e se existe mais alguem que participa da decisao para eu montar uma agenda assertiva com o corretor.",
        },
        {
          situation: "Lead perguntou sobre financiamento",
          goal: "Qualificar sem prometer aprovacao",
          script: "Posso te orientar sobre os proximos passos e o que costuma ser analisado. Para isso, me diz se essa compra seria com renda individual ou composicao e qual seria a entrada aproximada que voce imagina hoje.",
        },
      ],
    };
  }

  if (profile.id === "clinica") {
    return {
      offers: [
        {
          title: "Avaliacao inicial premium",
          category: "Avaliacao",
          targetProfile: "Lead com interesse definido em procedimento ou especialidade",
          whenToOffer: "Quando o lead demonstra interesse genuino e aceita entender o caso com mais profundidade.",
          priceFrom: 250,
          priceTo: 800,
        },
        {
          title: "Plano de tratamento",
          category: "Procedimento",
          targetProfile: "Lead apto para avancar apos avaliacao",
          whenToOffer: "Depois de triagem e alinhamento de expectativa, antes do agendamento final.",
          priceFrom: 2000,
          priceTo: 12000,
        },
        {
          title: "Retorno e acompanhamento",
          category: "Relacionamento",
          targetProfile: "Paciente com historico ou recorrencia",
          whenToOffer: "Quando existe contexto previo e potencial de continuidade do atendimento.",
          priceFrom: 300,
          priceTo: 1500,
        },
      ],
      scripts: [
        {
          situation: "Lead chega inseguro ou com pouca clareza",
          goal: "Acolher e abrir triagem consultiva",
          script: "Entendi. Vamos fazer isso com calma para eu te orientar do jeito mais seguro. Me conta qual procedimento ou especialidade voce procura e se existe alguma urgencia ou data ideal para esse atendimento.",
        },
        {
          situation: "Lead pergunta sobre resultado clinico",
          goal: "Manter guardrail e levar para avaliacao",
          script: "O ideal aqui e nao prometer nada sem avaliacao profissional. O que eu posso fazer e te ajudar a organizar o atendimento e direcionar para a avaliacao mais adequada conforme seu objetivo.",
        },
        {
          situation: "Lead pronto para agendamento",
          goal: "Conduzir para avaliacao ou consulta",
          script: "Perfeito. Para agilizar seu agendamento, me confirma a unidade de preferencia e o melhor periodo para atendimento. Assim ja deixamos o proximo passo bem encaminhado.",
        },
      ],
    };
  }

  if (profile.id === "agencia") {
    return {
      offers: [
        {
          title: "Diagnostico comercial e marketing",
          category: "Consultoria",
          targetProfile: "Empresa com dor de crescimento, funil ou aquisicao",
          whenToOffer: "Quando o lead demonstra clareza de problema e abertura para discutir processo.",
          priceFrom: 1500,
          priceTo: 5000,
        },
        {
          title: "Operacao de trafego + CRM",
          category: "Recorrencia",
          targetProfile: "Cliente com budget e necessidade de estrutura",
          whenToOffer: "Quando o lead precisa volume, acompanhamento e previsibilidade comercial.",
          priceFrom: 3000,
          priceTo: 12000,
        },
        {
          title: "Sprint de implantacao ALTUM",
          category: "Setup",
          targetProfile: "Cliente pronto para onboarding",
          whenToOffer: "Depois de proposta alinhada e decisor engajado na implantacao.",
          priceFrom: 5000,
          priceTo: 18000,
        },
      ],
      scripts: [
        {
          situation: "Lead pede preco cedo demais",
          goal: "Trazer para diagnostico sem perder o timing",
          script: "Consigo te passar uma faixa, mas para ser responsavel eu prefiro entender primeiro o seu momento. Hoje o principal desafio esta em gerar demanda, organizar atendimento ou converter melhor o que ja entra?",
        },
        {
          situation: "Lead parece com bom fit",
          goal: "Levar para diagnostico",
          script: "Pelo que voce trouxe, faz sentido uma conversa mais estrategica para destravar esse ponto com clareza. Se topar, eu organizo um diagnostico rapido para entendermos meta, canal, budget e gargalos atuais.",
        },
        {
          situation: "Lead quer escopo customizado",
          goal: "Preparar proposta sem prometer demais",
          script: "Perfeito. Nesse caso o melhor caminho e estruturar um diagnostico enxuto, porque ai a proposta sai bem aderente ao seu momento e sem empurrar escopo que nao faz sentido para voce agora.",
        },
      ],
    };
  }

  return {
    offers: [
      {
        title: "Atendimento consultivo inicial",
        category: "Entrada",
        targetProfile: "Lead com dor ou demanda comercial em validacao",
        whenToOffer: "Quando o lead demonstra interesse real e precisa de orientacao para o proximo passo.",
        priceFrom: 500,
        priceTo: 2500,
      },
      {
        title: "Proposta comercial principal",
        category: "Comercial",
        targetProfile: "Lead qualificado e pronto para avancar",
        whenToOffer: "Depois de entender contexto, urgencia, fit e investimento.",
        priceFrom: 2500,
        priceTo: 8000,
      },
      {
        title: "Onboarding ou acompanhamento",
        category: "Pos-venda",
        targetProfile: "Cliente convertido",
        whenToOffer: "Apos fechamento, para consolidar a entrega ou recorrencia.",
        priceFrom: 900,
        priceTo: 3000,
      },
    ],
    scripts: [
      {
        situation: "Lead ainda sem contexto suficiente",
        goal: "Qualificar sem travar a conversa",
        script: "Perfeito. Para eu te orientar melhor, me conta qual e o principal objetivo hoje, qual o prazo ideal para resolver isso e se ja existe alguma faixa de investimento pensada.",
      },
      {
        situation: "Lead pronto para proximo passo",
        goal: "Conduzir para reuniao, proposta ou atendimento humano",
        script: "Faz sentido avancarmos. Com o que voce trouxe, o melhor proximo passo agora e alinhar os detalhes finais para eu te encaminhar com a pessoa ou proposta certa.",
      },
      {
        situation: "Lead levantou objecao",
        goal: "Responder com seguranca e manter o interesse",
        script: "Entendo totalmente. Antes de tentar te responder no escuro, prefiro alinhar melhor seu contexto para te orientar com clareza e sem prometer algo fora do que realmente faz sentido para voce.",
      },
    ],
  };
}
const PROFILE_STAGE_COLORS = ["#2563eb", "#0ea5e9", "#10b981", "#f59e0b", "#f97316", "#22c55e", "#ef4444"] as const;

const PROFILE_STAGE_ALIASES: Record<string, string> = {
  captado: "captado",
  novo: "captado",
  novo_lead: "captado",
  contato: "contato",
  contato_enviado: "contato",
  respondido: "qualificacao",
  qualificado: "qualificacao",
  qualificacao: "qualificacao",
  proposta: "proposta",
  proposta_enviada: "proposta",
  em_negociacao: "fechamento",
  negociacao: "negociacao",
  fechamento: "fechamento",
  visita_agendada: "visita_agendada",
  triagem: "triagem",
  avaliacao: "avaliacao",
  orcamento: "orcamento",
  agendamento: "agendamento",
  realizado: "realizado",
  diagnostico: "diagnostico",
  onboarding: "onboarding",
  fechado: "ganho",
  ganho: "ganho",
  perdido: "perdido",
};
