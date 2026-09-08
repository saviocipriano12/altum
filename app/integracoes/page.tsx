import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, MessageCircleMore, ShoppingCart, Workflow } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Integrações ALTUM | WhatsApp, Instagram, Ads e E-commerce",
  description: "Veja integrações verificadas da ALTUM com WhatsApp, Instagram, Messenger, Meta Ads, Google Ads, Shopify, Nuvemshop e WooCommerce.",
  path: "/integracoes",
});

const groups = [
  {
    icon: MessageCircleMore,
    title: "Canais de conversa",
    description: "Conexões para trazer conversas e contexto para a operação comercial.",
    items: [
      ["WhatsApp", "Atendimento, mensagens e continuidade comercial conectados ao histórico do cliente."],
      ["Instagram", "Mensagens e interações podem entrar na operação de atendimento e relacionamento."],
      ["Facebook Messenger", "Canal de mensagens integrado à camada de conversas quando configurado."],
    ],
  },
  {
    icon: BarChart3,
    title: "Mídia e aquisição",
    description: "Dados de campanhas podem alimentar a leitura comercial e de performance.",
    items: [
      ["Meta Ads", "Sincronização de métricas de campanhas da Meta para análise dentro da operação."],
      ["Google Ads", "Sincronização de métricas de mídia para conectar aquisição e resultado comercial."],
    ],
  },
  {
    icon: ShoppingCart,
    title: "E-commerce",
    description: "Conexões de comércio para aproximar pedidos, clientes e atendimento.",
    items: [
      ["Shopify", "Integração com OAuth, webhooks e sincronização de dados de comércio quando configurada."],
      ["Nuvemshop", "Integração de comércio disponível para operações que usam a plataforma."],
      ["WooCommerce", "Integração para conectar dados de lojas WooCommerce à operação ALTUM."],
    ],
  },
] as const;

const faqs = [
  {
    question: "Quais integrações a ALTUM possui?",
    answer: "Entre as integrações verificadas no produto estão WhatsApp, Instagram, Facebook Messenger, Meta Ads, Google Ads, Shopify, Nuvemshop e WooCommerce. A disponibilidade pode variar conforme plano, provedor, permissões e etapa de implantação.",
  },
  {
    question: "A ALTUM integra com WhatsApp?",
    answer: "Sim. O WhatsApp pode ser conectado à operação de atendimento, CRM, qualificação e continuidade comercial. A configuração depende do provedor e do ambiente utilizado pela empresa.",
  },
  {
    question: "A ALTUM integra com Shopify?",
    answer: "Sim. A integração Shopify implementada contempla autenticação, webhooks e sincronização inicial quando a loja e as permissões necessárias estão configuradas.",
  },
  {
    question: "A ALTUM integra com Nuvemshop e WooCommerce?",
    answer: "Sim. Nuvemshop e WooCommerce fazem parte das integrações de comércio verificadas no produto. A configuração concreta depende da conta, credenciais e escopo do projeto.",
  },
  {
    question: "Google Calendar é uma integração disponível?",
    answer: "A ALTUM possui agenda interna e uma camada de adaptação para agenda externa, mas a integração completa com Google Calendar ainda deve ser tratada conforme a configuração e disponibilidade do ambiente. Por isso ela não é listada aqui como integração geral garantida.",
  },
];

export default function IntegracoesPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Integrações ALTUM</p>
          <h1 className="mt-6 max-w-[13ch] text-[clamp(3.2rem,6.5vw,6.5rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Conecte a operação onde suas conversas, campanhas e vendas já acontecem.</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/60">A ALTUM reúne canais de atendimento, mídia e e-commerce para manter cliente, origem, conversa e resultado mais próximos dentro da mesma operação comercial.</p>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[980px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Como pensar em integração</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">Integração não é só “conectar uma API”.</h2>
          <p className="mt-5 text-lg leading-8 text-white/68">O valor aparece quando dados do canal continuam úteis dentro do processo comercial: uma conversa mantém histórico, uma campanha preserva origem e uma venda pode ser relacionada ao cliente e à operação que a gerou.</p>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px] space-y-16">
          {groups.map((group) => <section key={group.title}><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-[#ff6a1f]"><group.icon className="h-5 w-5" /></span><div><h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">{group.title}</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-white/48">{group.description}</p></div></div><div className="mt-7 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{group.items.map(([name, text]) => <article key={name} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><h3 className="text-xl font-semibold text-white">{name}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div></section>)}
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr]"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Integrações + processo</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">Conectar é só o primeiro passo. O dado precisa continuar útil.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">A ALTUM foi desenhada para aproximar canal, cliente, oportunidade e próxima ação. Por isso as integrações fazem mais sentido quando trabalham junto de CRM, Inbox, Pipeline e automações.</p></div><div className="rounded-[1.5rem] border border-black/10 bg-white p-8"><Workflow className="h-6 w-6 text-[#d84b00]" /><div className="mt-6 grid gap-3">{[["CRM para WhatsApp", "/crm-para-whatsapp"],["Inbox", "/inbox"],["Pipeline", "/pipeline"],["Automações", "/automacoes"]].map(([label, href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-xl border border-black/8 px-4 py-3 text-sm font-semibold">{label}<ArrowRight className="h-4 w-4" /></Link>)}</div></div></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-28"><div className="mx-auto max-w-[980px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p><h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Disponibilidade e conexões da ALTUM.</h2><div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div><p className="mt-6 text-xs leading-6 text-white/35">A disponibilidade de cada integração pode variar conforme plano, provedor, permissões e etapa de implantação. Esta página descreve integrações verificadas no produto e não transforma recursos parciais ou roadmap em promessa geral.</p></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Seu ecossistema</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como a ALTUM pode se encaixar na estrutura que sua empresa já usa.</h2><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
