import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Clock3, MessageCircleMore, RefreshCcw, Route, Sparkles, Workflow } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Automação Comercial com IA para Vendas e Follow-up",
  description: "Automação comercial para qualificação, follow-up, distribuição, reativação e próximas ações com IA conectada ao CRM, canais e contexto da ALTUM.",
  path: "/automacoes",
});

const automations = [
  [Bot, "Qualificação automática", "A IA identifica intenção, sinais e informações úteis para priorizar oportunidades."],
  [Clock3, "Follow-up no momento certo", "Tarefas e retomadas podem ser disparadas conforme prazo, etapa e comportamento do lead."],
  [Route, "Distribuição de oportunidades", "Novos contatos podem seguir regras de responsável, canal, origem ou contexto comercial."],
  [MessageCircleMore, "Ações a partir da conversa", "Uma mensagem pode atualizar dados, gerar tarefa, avançar fluxo ou chamar uma pessoa."],
  [RefreshCcw, "Reativação", "Leads e clientes parados podem voltar para fluxos de contato com contexto preservado."],
  [Sparkles, "Próxima melhor ação", "A operação usa contexto e sinais para orientar o que deve acontecer a seguir."],
] as const;

const flow = ["Evento acontece", "Regra identifica contexto", "IA interpreta", "Altum executa", "Equipe acompanha"];

const faqs = [
  {
    question: "O que é automação comercial?",
    answer: "Automação comercial é o uso de regras, integrações e software para executar ou organizar tarefas repetitivas do processo de vendas, como distribuição de leads, qualificação, criação de tarefas, follow-up, atualização do CRM e reativação de oportunidades.",
  },
  {
    question: "Qual a diferença entre automação comercial e automação de marketing?",
    answer: "Automação de marketing costuma atuar principalmente em captação, nutrição e campanhas. Automação comercial atua mais perto da execução de vendas: CRM, oportunidades, responsáveis, tarefas, etapas do pipeline, follow-up e próximos passos. As duas podem trabalhar conectadas.",
  },
  {
    question: "Automação comercial pode usar inteligência artificial?",
    answer: "Sim. A inteligência artificial pode ajudar a interpretar contexto, identificar intenção, estruturar informações, priorizar oportunidades e orientar a próxima ação. Regras e limites continuam importantes para manter controle da operação.",
  },
  {
    question: "Quais tarefas de vendas podem ser automatizadas?",
    answer: "Exemplos incluem criação de tarefas, distribuição por responsável, notas e tags, mudanças de prioridade, follow-up, sequências, reativação e ações disparadas por eventos do CRM ou das conversas. A disponibilidade depende da configuração e do canal usado.",
  },
  {
    question: "Automação comercial substitui o vendedor?",
    answer: "Não necessariamente. O objetivo é retirar trabalho repetitivo e manter o processo em movimento. Pessoas continuam essenciais em negociação, diagnóstico, exceções e decisões que exigem julgamento humano.",
  },
];

export default function AutomacoesPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Automação comercial</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Automatize o próximo passo — não apenas a próxima mensagem.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">A ALTUM conecta gatilhos, IA, CRM, conversas e tarefas para que qualificação, follow-up, distribuição e reativação continuem acontecendo mesmo quando a equipe está ocupada.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver automações em ação <ArrowRight className="h-4 w-4" /></Link><Link href="/ia-para-vendas" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer a IA</Link></div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]"><Image src="/images/platform/marketing/platform-ai-assistant.png" alt="Automação comercial com IA na ALTUM" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" /></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-4 gap-y-3">{flow.map((item, index) => <div key={item} className="flex items-center gap-3 text-sm text-white/58"><span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">{item}</span>{index < flow.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[#ff6a1f]" /> : null}</div>)}</div></section>

      <section className="px-5 py-20 lg:px-8 lg:py-24"><div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é automação comercial?</h2><p className="mt-5 text-lg leading-8 text-white/68">Automação comercial é o uso de regras, integrações e software para executar ou organizar tarefas repetitivas do processo de vendas. Ela pode distribuir leads, gerar tarefas, apoiar qualificação, atualizar contexto do CRM, acionar follow-ups e reativar oportunidades sem depender de trabalho manual em cada etapa.</p><p className="mt-5 text-sm leading-7 text-white/48">Com IA, a automação também pode interpretar sinais e contexto antes de decidir o próximo passo — mantendo critérios de segurança e handoff humano.</p></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-32"><div className="mx-auto max-w-[1180px]"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Fluxos que continuam trabalhando</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Automação útil é a que move a oportunidade para frente.</h2><p className="mt-6 text-lg leading-8 text-white/52">Em vez de criar sequências desconectadas do comercial, a ALTUM usa o contexto do lead, do CRM e da conversa para decidir e executar ações ao longo do processo.</p></div><div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{automations.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div></div></section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">CRM como memória do fluxo</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">A automação fica melhor quando sabe quem é o cliente e em que ponto da venda ele está.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Etapa, histórico, canal, origem, responsável, tarefa e intenção dão contexto para a automação. Isso reduz mensagens genéricas e ações fora de hora.</p><div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/crm" className="inline-flex items-center gap-2 text-[#c84500]">Ver CRM <ArrowRight className="h-4 w-4" /></Link><Link href="/inbox" className="inline-flex items-center gap-2 text-[#c84500]">Ver inbox <ArrowRight className="h-4 w-4" /></Link></div></div><div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="CRM da ALTUM conectado às automações comerciais" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" /></div></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-28"><div className="mx-auto max-w-[980px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p><h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Automação comercial aplicada ao processo de vendas.</h2><div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><Workflow className="h-6 w-6 text-[#ff6a1f]" /><p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Do gatilho ao resultado</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Mostre seu processo comercial e veja onde a ALTUM pode assumir o trabalho repetitivo.</h2><div className="mt-8 flex flex-wrap gap-3 text-sm text-white/62">{["Qualificação", "Follow-up", "Distribuição", "Reativação", "CRM", "IA"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
