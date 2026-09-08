import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Check, MessageCircleMore, Route, Sparkles, UserRoundCheck, Workflow } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Automação Instagram com IA para Atendimento e Vendas",
  description: "Automação de atendimento no Instagram com IA, CRM, triagem, contexto e handoff humano. Veja como a ALTUM conecta mensagens do Instagram ao processo comercial.",
  path: "/automacao-instagram",
});

const faqs = [
  {
    question: "O que é automação no Instagram?",
    answer: "Automação no Instagram é o uso de regras, integrações e inteligência artificial para organizar ou executar etapas do atendimento e relacionamento a partir das mensagens do canal. Em uma operação comercial, o objetivo é reduzir trabalho repetitivo sem perder contexto, histórico e possibilidade de atendimento humano.",
  },
  {
    question: "É possível integrar mensagens do Instagram ao CRM?",
    answer: "Sim. Na ALTUM, o Instagram pode fazer parte da camada de conversas conectada ao CRM, permitindo que o contexto do contato continue disponível para qualificação, responsável, pipeline e próxima ação conforme a configuração da operação.",
  },
  {
    question: "A automação do Instagram pode usar inteligência artificial?",
    answer: "Sim. A IA pode ajudar a interpretar contexto, identificar intenção, estruturar informações e orientar o próximo passo. A operação também pode definir limites e momentos em que uma pessoa deve assumir a conversa.",
  },
  {
    question: "A ALTUM faz disparos ou campanhas automáticas pelo Instagram?",
    answer: "A página descreve automação de atendimento e fluxo comercial conectados ao Instagram. Campanhas em massa não devem ser assumidas como recurso geral do Instagram na ALTUM; a disponibilidade depende do canal, das permissões e da implementação utilizada.",
  },
];

const capabilities = [
  [MessageCircleMore, "Mensagens em uma operação", "O Instagram deixa de ficar isolado e passa a fazer parte da fila de atendimento e relacionamento."],
  [Sparkles, "IA com contexto", "A IA pode interpretar sinais da conversa e apoiar qualificação e próxima ação."],
  [Workflow, "Regras e automações", "Eventos e condições podem alimentar tarefas, notas, prioridade e outros movimentos do processo comercial."],
  [UserRoundCheck, "Handoff humano", "Quando a conversa exige negociação ou julgamento, uma pessoa pode assumir com o histórico preservado."],
  [Route, "CRM e pipeline", "O contexto pode continuar como lead, oportunidade e acompanhamento em vez de terminar na DM."],
  [Bot, "Menos trabalho repetitivo", "Triagem e organização podem ser automatizadas sem transformar toda conversa em um fluxo rígido."],
] as const;

export default function AutomacaoInstagramPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Automação Instagram</p>
          <h1 className="mt-6 max-w-[13ch] text-[clamp(3.2rem,6.5vw,6.5rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Transforme mensagens do Instagram em contexto comercial — não em uma fila separada.</h1>
          <p className="mt-7 max-w-3xl text-lg leading-8 text-white/60">A ALTUM conecta Instagram, Inbox, CRM, IA e automações para que a conversa possa ser triada, organizada, qualificada e encaminhada sem perder o histórico.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Ver no meu processo <ArrowRight className="h-4 w-4" /></Link><Link href="/inbox" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88">Conhecer a Inbox</Link></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-white/58">{["Instagram", "Inbox", "IA", "CRM", "Automação", "Handoff"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div></section>

      <section className="px-5 py-20 lg:px-8 lg:py-24"><div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é automação no Instagram?</h2><p className="mt-5 text-lg leading-8 text-white/68">É o uso de regras, integrações e inteligência artificial para organizar ou executar etapas do atendimento e relacionamento a partir das mensagens do Instagram. Em vendas, o ganho aparece quando a conversa também alimenta CRM, prioridade, responsável e próxima ação.</p></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-32"><div className="mx-auto max-w-[1180px]"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Da DM para a operação</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Automação útil não termina na resposta automática.</h2><p className="mt-6 text-lg leading-8 text-white/52">O contato precisa continuar com contexto suficiente para a equipe decidir o que fazer depois.</p></div><div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{capabilities.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div></div></section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Fluxo comercial</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">Mensagem entra. Contexto continua.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">A ALTUM pode usar canal, histórico, intenção e regras para manter a conversa ligada ao restante da operação.</p></div><div className="rounded-[1.5rem] border border-black/10 bg-white p-8"><div className="space-y-3">{["Contato envia mensagem no Instagram", "Conversa entra na Inbox", "IA ou regras ajudam a interpretar o contexto", "Lead pode ser relacionado ao CRM", "Equipe assume quando necessário", "Pipeline e follow-up mantêm a continuidade"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-xl border border-black/8 px-4 py-3"><span className="text-xs font-bold text-[#d84b00]">0{index + 1}</span><span className="text-sm font-semibold text-black/68">{item}</span></div>)}</div></div></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-28"><div className="mx-auto max-w-[980px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p><h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Automação do Instagram sem promessas vagas.</h2><div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Instagram + operação comercial</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como a ALTUM pode conectar suas mensagens do Instagram ao restante da venda.</h2><div className="mt-7 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/inbox" className="text-[#ff6a1f]">Inbox</Link><Link href="/automacoes" className="text-[#ff6a1f]">Automações</Link><Link href="/crm" className="text-[#ff6a1f]">CRM</Link></div><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
