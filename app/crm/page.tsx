import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Bot, Check, Clock3, MessageCircleMore, Tags, UserRound, Waypoints } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Sistema de CRM com IA para Vendas e WhatsApp",
  description: "Sistema de CRM para organizar leads, histórico, pipeline, tarefas, score, follow-up e próximas ações com IA e contexto comercial na ALTUM.",
  path: "/crm",
});

const features = [
  [MessageCircleMore, "Conversa ligada ao lead", "O histórico do atendimento acompanha o contato para que a equipe não precise reconstruir contexto."],
  [Bot, "Qualificação com IA", "Score, sinais, campos extraídos e próxima ação ajudam a priorizar quem merece atenção primeiro."],
  [Waypoints, "Pipeline conectado", "Etapa, valor potencial, responsável e progresso comercial ficam ligados à mesma oportunidade."],
  [Clock3, "Próxima ação visível", "Tarefas, compromissos, follow-ups e prazos reduzem oportunidades esquecidas."],
  [Tags, "Contexto estruturado", "Tags, origem, canal e campos personalizados transformam conversa solta em informação útil."],
  [UserRound, "Handoff para humano", "Quando uma pessoa precisa assumir, ela recebe o histórico e o contexto já organizados."],
] as const;

const flow = ["Mensagem recebida", "Contexto identificado", "Lead atualizado", "Score e prioridade", "Pipeline", "Próxima ação"];

const faqs = [
  {
    question: "O que é um sistema de CRM?",
    answer: "Um sistema de CRM é uma plataforma usada para organizar o relacionamento comercial com leads e clientes. Ele centraliza dados, histórico, responsáveis, oportunidades, tarefas, pipeline e próximas ações para que a equipe acompanhe a venda de forma estruturada.",
  },
  {
    question: "Para que serve um CRM de vendas?",
    answer: "Um CRM de vendas ajuda a registrar oportunidades, acompanhar etapas do pipeline, definir responsáveis, organizar follow-ups, visualizar tarefas e analisar o avanço das negociações. O objetivo é reduzir perda de contexto e tornar o processo comercial mais previsível.",
  },
  {
    question: "Qual a diferença entre CRM e planilha?",
    answer: "A planilha registra dados, mas normalmente não conecta histórico, tarefas, responsáveis, pipeline, automações e conversas em tempo real. Um CRM foi criado para operar o processo comercial de forma contínua e compartilhada entre pessoas e sistemas.",
  },
  {
    question: "CRM pode ser integrado ao WhatsApp?",
    answer: "Sim. Quando CRM e WhatsApp são conectados, conversas podem permanecer vinculadas ao cliente e alimentar histórico, oportunidade, responsável, tarefas e próxima ação. A disponibilidade depende do provedor e da configuração adotada.",
  },
  {
    question: "CRM com IA substitui o vendedor?",
    answer: "Não precisa substituir. A IA pode apoiar qualificação, leitura de contexto, extração de informações, priorização e sugestão de próxima ação, enquanto a equipe continua responsável por negociação, exceções e decisões comerciais.",
  },
] as const;

export default function CrmPage() {
  const faqSchema = buildFaqSchema(faqs.map((faq) => ({ question: faq.question, answer: faq.answer })));

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto grid max-w-[1280px] gap-12 xl:grid-cols-[0.82fr_1.18fr] xl:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Sistema de CRM com IA</p>
            <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">
              Um CRM que entende o que aconteceu antes do vendedor abrir o lead.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">
              Conversas, qualificação, score, tarefas, histórico e próxima ação ficam conectados na mesma operação comercial.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">
                Ver o CRM em ação <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/plataforma" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">
                Conhecer a plataforma
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0b0b0b] p-2.5 shadow-[0_30px_90px_rgba(0,0,0,0.5)]">
            <Image src="/images/platform/marketing/platform-crm-pipeline.png" alt="Sistema de CRM e pipeline de vendas da ALTUM" width={1586} height={992} priority sizes="(min-width:1280px) 58vw, 96vw" className="h-auto w-full rounded-[1.15rem]" />
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-5 gap-y-3">
          {flow.map((item, index) => (
            <div key={item} className="flex items-center gap-3 text-sm text-white/58">
              <span className="rounded-md border border-white/10 bg-white/[0.035] px-3 py-2">{item}</span>
              {index < flow.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-[#ff6a1f]" /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é um sistema de CRM?</h2>
          <p className="mt-5 text-lg leading-8 text-white/68">Um sistema de CRM é uma plataforma usada para organizar o relacionamento comercial com leads e clientes. Ele centraliza dados, histórico, responsáveis, oportunidades, tarefas, pipeline e próximas ações para que a equipe acompanhe a venda sem depender de informações espalhadas.</p>
          <div className="mt-7 grid gap-3 md:grid-cols-2">
            {["Centraliza dados e histórico dos leads", "Organiza oportunidades em pipeline", "Mantém responsável, tarefa e próxima ação", "Conecta qualificação, follow-up e análise comercial"].map((item) => <div key={item} className="flex gap-3 rounded-xl border border-white/8 bg-black/20 p-4 text-sm leading-6 text-white/62"><Check className="mt-1 h-4 w-4 shrink-0 text-[#ff6a1f]" />{item}</div>)}
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Contexto comercial</p>
            <h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">O lead não deveria recomeçar do zero a cada tela.</h2>
            <p className="mt-6 text-lg leading-8 text-white/52">Na ALTUM, atendimento, qualificação e gestão da oportunidade compartilham contexto. Isso transforma o CRM em parte ativa da venda, não apenas em uma base de cadastros.</p>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map(([Icon, title, text]) => (
              <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6">
                <Icon className="h-5 w-5 text-[#ff6a1f]" />
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/48">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Da conversa ao pipeline</p>
            <h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">A IA ajuda a transformar conversa em informação comercial.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Campos capturados, sinais de intenção e prioridade podem alimentar a ficha do lead e orientar a próxima ação sem exigir que o vendedor copie tudo manualmente.</p>
            <div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/ia-para-vendas" className="inline-flex items-center gap-2 text-[#c84500]">Ver IA para vendas <ArrowRight className="h-4 w-4" /></Link><Link href="/crm-para-whatsapp" className="inline-flex items-center gap-2 text-[#c84500]">CRM para WhatsApp <ArrowRight className="h-4 w-4" /></Link></div>
          </div>
          <div className="overflow-hidden rounded-[1.5rem] border border-black/10 bg-white p-2.5 shadow-[0_20px_60px_rgba(20,20,20,0.08)]">
            <Image src="/images/platform/marketing/platform-conversations.png" alt="Conversas conectadas ao contexto comercial na ALTUM" width={1586} height={992} sizes="(min-width:1024px) 55vw, 96vw" className="h-auto w-full rounded-[1rem]" />
          </div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[980px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p>
          <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">O que empresas procuram antes de adotar um CRM.</h2>
          <div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">CRM + operação</p>
          <h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como o CRM se encaixa no seu processo de vendas.</h2>
          <div className="mt-8 flex flex-wrap gap-3 text-sm text-white/62">
            {["Inbox", "IA", "Pipeline", "Follow-up", "Automações", "Agenda"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}
          </div>
          <Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
