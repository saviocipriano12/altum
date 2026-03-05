export type SeoFaq = {
  question: string;
  answer: string;
};

export type SeoServicePage = {
  slug: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  bullets: string[];
  faqs: SeoFaq[];
};

export const seoServicePages: SeoServicePage[] = [
  {
    slug: "gestao-trafego-pago-high-ticket",
    title: "Gestao de trafego pago para high-ticket",
    description:
      "Estrategia de aquisicao para servicos high-ticket com foco em previsibilidade de demanda qualificada e ROI consistente.",
    headline: "Trafego pago com foco em reunioes qualificadas",
    intro:
      "Planejamos campanhas para reduzir custo de aquisicao improdutivo e aumentar volume de oportunidades com perfil financeiro aderente.",
    bullets: [
      "Arquitetura de campanhas orientada por intencao de compra.",
      "Segmentacao por perfil financeiro e maturidade do lead.",
      "Acompanhamento semanal de CAC, taxa de qualificacao e custo por reuniao.",
    ],
    faqs: [
      {
        question: "Quando os primeiros resultados aparecem?",
        answer:
          "Normalmente nas primeiras 2 a 4 semanas ja temos sinal claro de custo por lead qualificado e capacidade de escala.",
      },
      {
        question: "Voces operam Google e Meta Ads?",
        answer: "Sim. Definimos o mix de canais de acordo com intencao, ciclo comercial e ticket medio da operacao.",
      },
    ],
  },
  {
    slug: "qualificacao-ia-whatsapp",
    title: "Qualificacao de leads com IA no WhatsApp",
    description:
      "Filtro automatizado com IA para separar curiosos de oportunidades reais antes do contato comercial humano.",
    headline: "IA para proteger o tempo do seu time comercial",
    intro:
      "A IA conduz perguntas objetivas, classifica nivel de fit e encaminha apenas leads aprovados para agenda comercial.",
    bullets: [
      "Roteiro de qualificacao alinhado ao seu ICP.",
      "Classificacao por status: aprovado, revisao ou reprovado.",
      "Integracao da triagem com fluxo de atendimento e CRM.",
    ],
    faqs: [
      {
        question: "A IA substitui o vendedor?",
        answer:
          "Nao. A IA atua antes do vendedor, removendo contatos sem aderencia para o time focar apenas no que tem potencial de fechamento.",
      },
      {
        question: "Posso customizar perguntas e regras?",
        answer: "Sim. A camada de qualificacao e configurada para refletir ticket, nicho e processo comercial da empresa.",
      },
    ],
  },
  {
    slug: "funil-comercial-b2b",
    title: "Funil comercial B2B para empresas de servicos",
    description:
      "Desenho de funil para operacoes B2B com metas por etapa, rotinas de follow-up e previsao de receita.",
    headline: "Funil B2B com metas por etapa e previsibilidade",
    intro:
      "Estruturamos da captura ao fechamento com criterios claros para passagem de fase e acompanhamento de conversao.",
    bullets: [
      "Definicao de etapas com gatilhos objetivos de avanco.",
      "Rituais comerciais para reduzir gargalos de conversao.",
      "Painel de indicadores: taxa por etapa, ciclo medio e forecast.",
    ],
    faqs: [
      {
        question: "Esse modelo serve para equipes pequenas?",
        answer:
          "Sim. O framework foi pensado para escalar a partir de um processo enxuto, sem complexidade desnecessaria no inicio.",
      },
      {
        question: "Precisa trocar CRM para aplicar?",
        answer: "Nao necessariamente. Adaptamos a implementacao para a stack atual sempre que viavel.",
      },
    ],
  },
];

export const getSeoServicePageBySlug = (slug: string): SeoServicePage | null =>
  seoServicePages.find((page) => page.slug === slug) ?? null;
