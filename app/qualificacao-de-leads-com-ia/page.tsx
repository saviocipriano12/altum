import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Filter, Gauge, MessageCircleMore, Route, Sparkles, Target } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Qualificação de Leads com IA e Lead Scoring",
  description: "Entenda qualificação de leads e lead scoring e veja como IA pode identificar intenção, extrair dados, priorizar oportunidades e alimentar CRM e pipeline.",
  path: "/qualificacao-de-leads-com-ia",
});

const features = [
  [MessageCircleMore, "Entende a conversa", "A IA usa o conteúdo do atendimento para identificar contexto e sinais relevantes antes de classificar."],
  [Sparkles, "Identifica intenção", "Interesse, urgência, necessidade e objeções ajudam a separar curiosidade de oportunidade real."],
  [Filter, "Extrai informações", "Dados importantes podem ser estruturados para reduzir preenchimento manual e enriquecer o CRM."],
  [Gauge, "Ajuda a priorizar", "Score e sinais comerciais ajudam o time a decidir quais oportunidades merecem atenção primeiro."],
  [Target, "Alimenta o pipeline", "A qualificação pode atualizar oportunidade, etapa, contexto e próxima ação no mesmo fluxo."],
  [Route, "Escala para humano", "Quando a conversa precisa de julgamento ou negociação, a equipe assume com histórico e contexto preservados."],
] as const;

const faqs = [
  {
    question: "O que é qualificação de leads?",
    answer: "Qualificação de leads é o processo de avaliar se um contato possui perfil, necessidade, momento e potencial compatíveis com a oferta da empresa. O objetivo é ajudar o time comercial a concentrar atenção nas oportunidades com maior chance de avanço.",
  },
  {
    question: "O que é lead scoring?",
    answer: "Lead scoring é uma forma de atribuir uma pontuação a leads com base em critérios e sinais relevantes, como perfil, interesse, comportamento, urgência e informações comerciais. A pontuação serve como apoio para priorização e não deve substituir a análise do contexto da oportunidade.",
  },
  {
    question: "Qual a diferença entre qualificação de leads e lead scoring?",
    answer: "Qualificação é o processo mais amplo de entender se uma oportunidade faz sentido e o que falta para ela avançar. Lead scoring é um mecanismo de pontuação que pode fazer parte desse processo para ajudar a comparar prioridade entre contatos.",
  },
  {
    question: "Como a IA pode qualificar leads?",
    answer: "A IA pode analisar conversas, identificar intenção, extrair informações, detectar campos ausentes e organizar sinais que apoiam a classificação da oportunidade. Na ALTUM, esses dados podem continuar no CRM e no pipeline em vez de ficar presos ao chat.",
  },
  {
    question: "Quais dados podem ser usados para qualificar um lead?",
    answer: "Os critérios variam por negócio. Podem incluir necessidade, orçamento, urgência, papel na decisão, cidade, tamanho da equipe, produto de interesse, canais atuais e outros dados relevantes para o processo comercial da empresa.",
  },
  {
    question: "Lead scoring com IA substitui o vendedor?",
    answer: "Não. O score é um sinal de prioridade. A equipe continua importante para interpretar situações complexas, negociar, confirmar informações e decidir ações quando o contexto exige julgamento humano.",
  },
];

export default function QualificacaoDeLeadsComIaPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Qualificação de leads com IA</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Use IA para descobrir quais leads merecem atenção antes de sua equipe perder tempo.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">A ALTUM entende conversa, extrai contexto, identifica intenção e ajuda a transformar sinais em prioridade, CRM, pipeline e próxima ação.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver qualificação em ação <ArrowRight className="h-4 w-4" /></Link><Link href="/ia-para-vendas" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer a IA</Link></div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]"><Image src="/images/platform/marketing/platform-ai-assistant.png" alt="IA da ALTUM qualificando oportunidades comerciais" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" /></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-white/58">{["Intenção", "Contexto", "Lead scoring", "CRM", "Pipeline", "Handoff"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div></section>

      <section className="px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-[1180px] gap-4 lg:grid-cols-2">
          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">O que é qualificação de leads?</h2><p className="mt-5 text-base leading-8 text-white/66">É o processo de avaliar perfil, necessidade, momento e potencial de um contato para entender se existe oportunidade real e qual deve ser o próximo passo comercial.</p></article>
          <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Lead scoring</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white">O que é lead scoring?</h2><p className="mt-5 text-base leading-8 text-white/66">Lead scoring é uma pontuação usada para apoiar a priorização de leads a partir de critérios e sinais como perfil, interesse, urgência, contexto e comportamento.</p></article>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32"><div className="mx-auto max-w-[1180px]"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Prioridade antes da fila crescer</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Qualificação não precisa começar depois que o vendedor abre o lead.</h2><p className="mt-6 text-lg leading-8 text-white/52">A conversa já contém sinais sobre necessidade, urgência, fit e objeções. A ALTUM usa esse contexto para ajudar a operação a chegar mais preparada à oportunidade.</p></div><div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{features.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div></div></section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Qualificação + CRM</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">O resultado da qualificação precisa continuar disponível depois da conversa.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Intenção, score, dados extraídos e sinais não ficam presos no chat. Eles podem alimentar o contexto do lead e orientar pipeline, responsável e próxima ação.</p><div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/crm" className="inline-flex items-center gap-2 text-[#c84500]">Ver CRM <ArrowRight className="h-4 w-4" /></Link><Link href="/crm-para-whatsapp" className="inline-flex items-center gap-2 text-[#c84500]">Ver CRM para WhatsApp <ArrowRight className="h-4 w-4" /></Link></div></div><div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="CRM da ALTUM recebendo contexto da qualificação com IA" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" /></div></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-28"><div className="mx-auto max-w-[980px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p><h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Qualificação, score e IA no processo comercial.</h2><div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><Bot className="h-6 w-6 text-[#ff6a1f]" /><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">IA aplicada à operação</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como a ALTUM pode qualificar antes, priorizar melhor e entregar mais contexto para sua equipe.</h2><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
