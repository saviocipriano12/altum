import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BellRing, Bot, Check, Clock3, History, RefreshCcw, Target } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Follow-up de Vendas: como fazer e automatizar",
  description: "Entenda o que é follow-up de vendas e veja como organizar prazos, próximas ações, histórico, CRM e automações para não perder oportunidades.",
  path: "/follow-up",
});

const features = [
  [Clock3, "Prazo e próxima ação", "Cada oportunidade pode ter data, tarefa e próximo passo claro para não depender da memória do vendedor."],
  [History, "Contexto antes de retomar", "A equipe vê o que aconteceu na conversa, no CRM e no pipeline antes de fazer contato novamente."],
  [Bot, "IA para priorizar", "Sinais de intenção, etapa e histórico ajudam a ordenar quais oportunidades merecem atenção primeiro."],
  [BellRing, "Lembretes e retomadas", "O fluxo pode gerar lembretes ou ações de acompanhamento quando um prazo ou condição é atingido."],
  [RefreshCcw, "Reativação", "Leads que esfriaram podem voltar para a operação com contexto preservado e abordagem adequada ao momento."],
  [Target, "Follow-up conectado ao funil", "O acompanhamento não fica solto: ele está ligado à oportunidade, etapa, responsável e resultado esperado."],
] as const;

const faqs = [
  {
    question: "O que é follow-up de vendas?",
    answer: "Follow-up de vendas é o acompanhamento feito depois de um contato comercial para manter a oportunidade em movimento. Ele pode acontecer por mensagem, ligação, reunião ou tarefa e deve considerar o contexto anterior, o momento do lead e a próxima ação necessária.",
  },
  {
    question: "Como fazer um bom follow-up de vendas?",
    answer: "Um bom follow-up retoma o contexto da conversa, entrega algum avanço útil e deixa clara a próxima ação. Em vez de mensagens genéricas, use o histórico da oportunidade, o que ficou combinado e o prazo adequado para voltar a falar.",
  },
  {
    question: "Quantas vezes devo fazer follow-up?",
    answer: "Não existe um número universal. A frequência depende do ciclo de venda, urgência, canal e sinais do lead. O importante é definir uma cadência coerente, registrar cada tentativa e parar ou mudar a abordagem quando o contexto indicar.",
  },
  {
    question: "É possível automatizar follow-up de vendas?",
    answer: "Sim. Lembretes, tarefas e algumas mensagens podem ser automatizados com base em etapa, prazo ou condição. A automação funciona melhor quando preserva o histórico e permite que uma pessoa assuma em negociações que exigem contexto ou decisão.",
  },
  {
    question: "Como CRM e IA ajudam no follow-up?",
    answer: "O CRM mantém histórico, etapa, responsável e próxima ação organizados. A IA pode ajudar a resumir contexto, identificar prioridade e sugerir o próximo movimento. Na ALTUM, essas informações podem trabalhar juntas no mesmo fluxo comercial.",
  },
];

export default function FollowUpPage() {
  const faqSchema = buildFaqSchema(faqs);

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Follow-up de vendas</p>
          <h1 className="mt-6 max-w-[12ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">A venda não deveria depender de alguém lembrar de chamar o lead de novo.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/58">A ALTUM conecta prazo, histórico, etapa, responsável e IA para manter o acompanhamento comercial visível e transformar silêncio em próxima ação.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-[#ff5c0b]">Ver follow-up em ação <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/pipeline" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88 transition hover:bg-white/[0.05]">Conhecer o pipeline</Link>
          </div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-white/58">{["Próxima ação", "Prazo", "Responsável", "Histórico", "IA", "Reativação"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div></section>

      <section className="px-5 py-20 lg:px-8 lg:py-24"><div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é follow-up de vendas?</h2><p className="mt-5 text-lg leading-8 text-white/68">Follow-up de vendas é o acompanhamento feito depois de um contato comercial para manter a oportunidade em movimento. Ele usa o histórico da negociação para decidir quando retomar, por qual canal, quem deve falar e qual próxima ação aumenta a chance de avanço.</p></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Continuidade comercial</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">Follow-up não é mandar “só passando para saber”.</h2><p className="mt-6 text-lg leading-8 text-white/52">Bom acompanhamento usa o que já aconteceu para decidir quando retomar, quem deve falar e qual é o próximo movimento comercial.</p></div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{features.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold tracking-[-0.025em] text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28"><div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Follow-up + automação</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">O sistema percebe o que ficou parado e ajuda a operação a reagir.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Prazos, etapas e sinais podem alimentar automações, lembretes e retomadas. O vendedor continua no controle, mas não precisa reconstruir a agenda de cabeça.</p></div><div className="rounded-[1.5rem] border border-black/10 bg-white p-8 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#d84b00]">Exemplo de fluxo</p><div className="mt-6 space-y-3">{["Oportunidade fica sem próxima ação", "ALTUM identifica prazo ou condição", "IA/contexto ajuda a priorizar", "Tarefa ou retomada entra no fluxo", "Equipe acompanha o resultado"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-xl border border-black/8 px-4 py-3"><span className="text-xs font-bold text-[#d84b00]">0{index + 1}</span><span className="text-sm font-semibold text-black/68">{item}</span></div>)}</div></div></div></section>

      <section className="px-5 py-24 lg:px-8 lg:py-28"><div className="mx-auto max-w-[980px]"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p><h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Como fazer follow-up sem depender da memória.</h2><div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div></div></section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Pare de perder venda por esquecimento</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como follow-up, CRM e automação podem trabalhar como um único processo.</h2><div className="mt-8 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/automacoes" className="inline-flex items-center gap-2 text-[#ff6a1f]">Ver automações <ArrowRight className="h-4 w-4" /></Link><Link href="/crm" className="inline-flex items-center gap-2 text-[#ff6a1f]">Ver CRM <ArrowRight className="h-4 w-4" /></Link></div><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
