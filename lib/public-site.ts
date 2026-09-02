import type { Metadata } from "next";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://altum.ag").replace(/\/$/, "");
export const ALTUM_PHONE = "5531972545430";
export const ALTUM_EMAIL = "contato@altum.ag";

export function buildWhatsappUrl(message: string) {
  return `https://wa.me/${ALTUM_PHONE}?text=${encodeURIComponent(message)}`;
}

export function buildMarketingMetadata(input: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = `${SITE_URL}${input.path}`;

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      title: `${input.title} | ALTUM`,
      description: input.description,
      url,
      images: [
        {
          url: "/logo-a.png",
          width: 1200,
          height: 630,
          alt: "ALTUM",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${input.title} | ALTUM`,
      description: input.description,
      images: ["/logo-a.png"],
    },
  };
}

export const publicNav = [
  { href: "/", label: "Inicio" },
  { href: "/plataforma", label: "Plataforma" },
  { href: "/precos", label: "Planos" },
  { href: "/blog", label: "Conteudos" },
  { href: "/cliente/login", label: "Entrar" },
] as const;

export const heroMetrics = [
  { value: "1 operacao", label: "Conversas, CRM, agenda, campanhas e IA no mesmo fluxo." },
  { value: "R$ 797", label: "Faixa sugerida para entrada recorrente da plataforma." },
  { value: "2 motores", label: "SaaS recorrente e servicos de implantacao ou growth." },
] as const;

export const publicPathways = [
  {
    title: "Altum Plataforma",
    href: "/plataforma",
    eyebrow: "SaaS",
    description:
      "Operacao comercial com IA para responder conversas, acompanhar oportunidades, organizar agenda e transformar atendimento em receita.",
    bullets: ["Conversas e CRM integrados", "Agenda e follow-up", "IA aplicada ao dia a dia"],
  },
  {
    title: "Altum Agencia",
    href: "/agencia",
    eyebrow: "Execucao",
    description:
      "Sites, landing pages, lojas virtuais, trafego pago e automacao para empresas que precisam estruturar demanda e posicionamento.",
    bullets: ["Presenca digital premium", "Campanhas e captacao", "Projetos pontuais e contratos"],
  },
  {
    title: "Estrutura Digital",
    href: "/estrutura-digital",
    eyebrow: "Oferta completa",
    description:
      "Combinacao de pagina, trafego, WhatsApp, IA, plataforma e implantacao para gerar caixa mais rapido e organizar a operacao desde o inicio.",
    bullets: ["Maior ticket", "Maior percepcao de valor", "Ideal para cliente com urgencia"],
  },
] as const;

export const platformModules = [
  {
    title: "Conversas",
    description: "WhatsApp, site e Instagram em uma fila clara para responder rapido e com contexto.",
  },
  {
    title: "Clientes & Oportunidades",
    description: "Leads, pipeline, propostas e proximas acoes com visao comercial mais limpa.",
  },
  {
    title: "Agenda",
    description: "Reunioes, retornos, follow-ups e confirmacoes sem depender de planilha solta.",
  },
  {
    title: "Campanhas",
    description: "Midia, captacao e origem dos leads ligadas ao funil e ao resultado comercial.",
  },
  {
    title: "Relatorios",
    description: "Indicadores de operacao e receita com linguagem de negocio e decisao.",
  },
  {
    title: "Assistente Altum",
    description: "IA para responder, sugerir proximos passos, organizar contexto e apoiar o time.",
  },
] as const;

export const agencyServices = [
  {
    title: "Landing pages",
    description: "Paginas para conversao, diagnostico, captacao e oferta direta.",
  },
  {
    title: "Sites de vendas",
    description: "Estruturas premium para reforcar valor percebido, clareza comercial e autoridade.",
  },
  {
    title: "Lojas virtuais",
    description: "Operacao visual e comercial para vender com mais consistencia e percepcao.",
  },
  {
    title: "Trafego pago",
    description: "Google e Meta conectados a CRM, WhatsApp e leitura de resultado.",
  },
  {
    title: "Automacao no WhatsApp",
    description: "Fluxos de contato, triagem e follow-up para nao perder lead quente.",
  },
  {
    title: "Consultoria e implantacao",
    description: "Ajuste de processo, stack comercial e ativacao da operacao digital.",
  },
] as const;

export const implementationSteps = [
  {
    title: "Quiz estrategico",
    description: "Leitura rapida do momento atual, dos gargalos de atendimento e do objetivo de receita.",
  },
  {
    title: "Estrutura inicial",
    description: "Configuracao de equipe, funil, produtos, agenda, canais e rotas principais.",
  },
  {
    title: "Ativacao da IA",
    description: "Base de conhecimento, linguagem comercial, regras de handoff e proximas acoes.",
  },
  {
    title: "Go-live acompanhado",
    description: "Operacao assistida, revisao de primeiros leads e correcoes de ritmo.",
  },
];

export const platformPlans = [
  {
    name: "Essencial",
    price: "R$ 797",
    period: "/mes",
    description: "Para empresas que precisam organizar atendimento, clientes e agenda sem depender de processos soltos.",
    bullets: ["Conversas e CRM", "Agenda e follow-up", "Relatorios basicos", "1 canal principal"],
    featured: false,
  },
  {
    name: "Operacao",
    price: "R$ 997",
    period: "/mes",
    description: "Para times que ja possuem demanda e querem operar com mais velocidade, visibilidade e IA aplicada.",
    bullets: ["Tudo do Essencial", "Campanhas e captacao", "Assistente Altum", "Mais controles de operacao"],
    featured: true,
  },
  {
    name: "Estrutura Assistida",
    price: "Sob diagnostico",
    period: "",
    description: "Plataforma + implantacao + acompanhamento inicial para empresas que querem entrar rodando.",
    bullets: ["Setup dedicado", "Treinamento inicial", "Revisao de fluxo comercial", "Ativacao orientada"],
    featured: false,
  },
] as const;

export const pricingPolicies = [
  "Plataforma com recorrencia em checkout seguro hospedado pelo Asaas.",
  "Implantacao, projetos e contratos de agencia tambem podem ser cobrados via Asaas.",
  "Cliente de agencia pode receber acesso incluso por liberacao do admin.",
  "Planos trimestrais ou anuais podem ser tratados como proposta comercial fechada.",
] as const;

export const faqItems = [
  {
    question: "O que e a Altum?",
    answer:
      "A Altum e uma plataforma de operacao comercial com IA. Ela conecta conversas, clientes, oportunidades, agenda, campanhas e inteligencia aplicada no mesmo fluxo.",
  },
  {
    question: "Posso contratar so a plataforma?",
    answer:
      "Sim. O cliente pode entrar apenas no SaaS e decidir depois se quer implantacao ou algum servico de growth.",
  },
  {
    question: "Preciso contratar setup?",
    answer:
      "Nao. O setup e opcional, mas acelera a entrada em operacao quando a empresa quer ganhar velocidade sem montar tudo sozinha.",
  },
  {
    question: "A Altum substitui meu WhatsApp e minhas planilhas?",
    answer:
      "Ela conecta o atendimento ao CRM, ao funil e a agenda para que a operacao deixe de depender de conversas e controles espalhados.",
  },
] as const;

export const caseStudies = [
  {
    title: "Clube Farm",
    image: "/portfolio/clubefarm-1600.jpg",
    description: "Projeto visual e comercial para uma marca que precisava vender melhor e parecer maior.",
  },
  {
    title: "Pedraum",
    image: "/portfolio/pedraum-1600.jpg",
    description: "Estrutura digital com foco em clareza de oferta e fluxo de operacao mais forte.",
  },
  {
    title: "Vitta Prime",
    image: "/portfolio/vittaprime-1600.jpg",
    description: "Landing page orientada a captacao qualificada e narrativa mais premium.",
  },
] as const;
