import type { Metadata } from "next";
import { DEFAULT_PLATFORM_PLANS } from "@/lib/platform-plans";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://altumia.com.br").trim().replace(/\/+$/, "");
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
  { value: "R$ 397", label: "Entrada mensal para organizar a operacao comercial." },
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

export const platformPlans = DEFAULT_PLATFORM_PLANS.map((plan) => ({
  name: plan.name,
  price: plan.monthlyPrice
    ? plan.monthlyPrice.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : "Sob consulta",
  period: plan.monthlyPrice ? "/mes" : "",
  description: plan.description,
  bullets: plan.features,
  featured: plan.featured,
}));

export const pricingPolicies = [
  "Plataforma com recorrencia em checkout seguro hospedado pelo Asaas.",
  "Configuracao opcional no Essencial e implantacao assistida nos planos Operacao e Escala.",
  "Custos oficiais de mensagens e consumos adicionais sao cobrados separadamente.",
  "Cliente de agencia pode receber acesso incluso por liberacao do admin.",
  "Condicoes promocionais sao registradas por contrato e nao alteram o catalogo publico.",
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
      "No Essencial, a configuracao guiada e opcional. Nos planos Operacao e Escala, a implantacao assistida e obrigatoria para configurar canais, IA e automacoes com seguranca.",
  },
  {
    question: "O teste libera todos os recursos?",
    answer:
      "Sim. Durante 7 dias voce pode conhecer todos os modulos da plataforma, com limites de consumo controlados e sem informar cartao. Nenhuma cobranca e feita sem sua confirmacao.",
  },
  {
    question: "Existem custos alem da mensalidade?",
    answer:
      "A mensalidade cobre a plataforma dentro dos limites do plano. Implantacao, adicionais contratados e tarifas oficiais de provedores como Meta e WhatsApp aparecem separadamente e sempre antes da confirmacao.",
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
