import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Check, Clock3, MessageCircleMore, RefreshCcw, Route, ShieldCheck } from "lucide-react";
import { SiteShell } from "@/components/public/site-shell";
import { buildMarketingMetadata } from "@/lib/public-site";
import { buildFaqSchema, toJsonLdScript } from "@/lib/schema";

export const metadata: Metadata = buildMarketingMetadata({
  title: "Automação WhatsApp com IA para Vendas e Atendimento",
  description: "Automação WhatsApp com IA para responder, qualificar, organizar contexto, acionar follow-ups e encaminhar oportunidades para o time comercial na ALTUM.",
  path: "/ia-no-whatsapp",
});

const capabilities = [
  [MessageCircleMore, "Resposta automática com contexto", "A operação pode responder mensagens usando regras, conhecimento da empresa e contexto da conversa."],
  [Bot, "Qualificação com IA", "A IA pode identificar intenção, extrair informações e ajudar a priorizar oportunidades antes do handoff."],
  [Route, "Encaminhamento para o time", "Quando a conversa exige negociação ou julgamento, uma pessoa assume com histórico e contexto preservados."],
  [Clock3, "Próxima ação", "A conversa pode gerar tarefa, acompanhamento ou outro próximo passo no processo comercial."],
  [RefreshCcw, "Follow-up e reativação", "Prazos e condições podem alimentar retomadas e lembretes sem depender exclusivamente da memória do vendedor."],
  [ShieldCheck, "Regras e limites", "A operação define guardrails, conhecimento, autonomia e situações em que a IA deve parar e escalar."],
] as const;

const faqs = [
  {
    question: "O que é automação de WhatsApp?",
    answer: "Automação de WhatsApp é o uso de regras, integrações e software para responder mensagens, organizar contatos, executar ações e manter o atendimento funcionando sem depender de tarefas manuais em cada etapa.",
  },
  {
    question: "Qual a diferença entre automação de WhatsApp e chatbot?",
    answer: "Chatbot é uma parte possível da automação. A automação pode incluir respostas, triagem, criação de tarefas, atualização de CRM, follow-up, handoff humano e outras ações além da conversa automática em si.",
  },
  {
    question: "Automação WhatsApp pode usar inteligência artificial?",
    answer: "Sim. A IA pode interpretar linguagem natural, identificar intenção, extrair informações, consultar conhecimento e ajudar a decidir a próxima ação. Ainda assim, regras e limites são importantes para manter controle da operação.",
  },
  {
    question: "Automação no WhatsApp pode ajudar vendas?",
    answer: "Pode. Ela pode reduzir tempo de resposta, coletar informações, qualificar leads, registrar contexto, criar próximas ações e encaminhar oportunidades para vendedores com mais informação disponível.",
  },
  {
    question: "É possível integrar automação do WhatsApp com CRM?",
    answer: "Sim. Quando o canal está conectado ao CRM, a conversa pode permanecer ligada ao contato e alimentar histórico, responsável, pipeline, tarefas, qualificação e follow-up, dependendo da configuração adotada.",
  },
] as const;

export default function IaNoWhatsappPage() {
  const faqSchema = buildFaqSchema(faqs.map((faq) => ({ question: faq.question, answer: faq.answer })));

  return (
    <SiteShell>
      <section className="px-5 pb-20 pt-24 lg:px-8 lg:pb-28 lg:pt-32">
        <div className="mx-auto max-w-[1180px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Automação WhatsApp com IA</p>
          <h1 className="mt-6 max-w-[13ch] text-[clamp(3.2rem,6.5vw,6.6rem)] font-semibold leading-[0.92] tracking-[-0.065em] text-white">Automatize o WhatsApp sem separar atendimento, contexto e processo de venda.</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-white/58">A ALTUM conecta automação, inteligência artificial, CRM e equipe humana para que a conversa continue como qualificação, próxima ação, follow-up e oportunidade.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/contato?interest=demonstracao" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Ver automação em ação <ArrowRight className="h-4 w-4" /></Link><Link href="/chatbot-whatsapp" className="inline-flex items-center justify-center rounded-lg border border-white/12 px-6 py-3.5 text-sm font-semibold text-white/88">Ver chatbot WhatsApp</Link></div>
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#080808] px-5 py-8 lg:px-8"><div className="mx-auto flex max-w-[1180px] flex-wrap gap-3 text-sm text-white/58">{["WhatsApp", "IA", "CRM", "Qualificação", "Follow-up", "Handoff humano"].map((item) => <span key={item} className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"><Check className="h-3.5 w-3.5 text-[#ff6a1f]" />{item}</span>)}</div></section>

      <section className="px-5 py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-[980px] rounded-[1.6rem] border border-white/10 bg-white/[0.025] p-7 md:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Resposta rápida</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white md:text-4xl">O que é automação de WhatsApp?</h2>
          <p className="mt-5 text-lg leading-8 text-white/68">Automação de WhatsApp é o uso de regras, integrações e software para responder mensagens, organizar contatos e executar ações sem depender de trabalho manual em cada etapa. Em vendas, ela pode conectar conversa, qualificação, CRM, próxima ação e follow-up.</p>
          <p className="mt-5 text-sm leading-7 text-white/48">Um chatbot pode fazer parte dessa automação, mas automação de WhatsApp é um conceito mais amplo: também inclui tarefas, CRM, handoff, cadências e outras ações operacionais.</p>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-32">
        <div className="mx-auto max-w-[1180px]">
          <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Além da resposta automática</p><h2 className="mt-5 text-[clamp(2.6rem,5vw,4.8rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-white">A automação precisa fazer o processo comercial continuar.</h2><p className="mt-6 text-lg leading-8 text-white/52">Responder rápido ajuda, mas o ganho real aparece quando contexto, qualificação e próximas ações deixam de ficar presos na conversa.</p></div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{capabilities.map(([Icon, title, text]) => <article key={title} className="rounded-[1.3rem] border border-white/9 bg-white/[0.025] p-6"><Icon className="h-5 w-5 text-[#ff6a1f]" /><h3 className="mt-5 text-xl font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{text}</p></article>)}</div>
        </div>
      </section>

      <section className="bg-[#f3f1ec] px-5 py-24 text-black lg:px-8 lg:py-28">
        <div className="mx-auto grid max-w-[1180px] gap-10 lg:grid-cols-2">
          <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d84b00]">Fluxo conectado</p><h2 className="mt-5 text-[clamp(2.8rem,5vw,5rem)] font-semibold leading-[0.94] tracking-[-0.06em]">Mensagem entra. A operação decide o que fazer depois.</h2><p className="mt-6 max-w-xl text-lg leading-8 text-black/56">Uma automação útil não termina no envio de mensagem. Ela pode transformar o que aconteceu em contexto comercial e acionar o próximo passo.</p></div>
          <div className="rounded-[1.5rem] border border-black/10 bg-white p-8 shadow-[0_20px_60px_rgba(20,20,20,0.08)]"><div className="space-y-3">{["Cliente envia mensagem", "Regra ou IA entende o contexto", "Informações relevantes são organizadas", "CRM e oportunidade recebem contexto", "Próxima ação ou follow-up é definido", "Pessoa assume quando necessário"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-xl border border-black/8 px-4 py-3"><span className="text-xs font-bold text-[#d84b00]">0{index + 1}</span><span className="text-sm font-semibold text-black/68">{item}</span></div>)}</div></div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8 lg:py-28">
        <div className="mx-auto max-w-[980px]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Perguntas frequentes</p>
          <h2 className="mt-5 text-[clamp(2.5rem,5vw,4.6rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">O que empresas querem saber antes de automatizar o WhatsApp.</h2>
          <div className="mt-10 space-y-3">{faqs.map((faq) => <article key={faq.question} className="rounded-2xl border border-white/9 bg-white/[0.025] p-6"><h3 className="text-lg font-semibold text-white">{faq.question}</h3><p className="mt-3 text-sm leading-7 text-white/56">{faq.answer}</p></article>)}</div>
        </div>
      </section>

      <section className="px-5 py-24 lg:px-8"><div className="mx-auto max-w-[980px] rounded-[1.7rem] border border-white/10 bg-[#0b0b0b] p-8 md:p-12"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ff6a1f]">Automação + operação comercial</p><h2 className="mt-5 max-w-[15ch] text-[clamp(2.6rem,5vw,4.7rem)] font-semibold leading-[0.96] tracking-[-0.055em] text-white">Veja como WhatsApp, CRM, IA e follow-up podem funcionar como um único processo.</h2><div className="mt-7 flex flex-wrap gap-5 text-sm font-semibold"><Link href="/crm-para-whatsapp" className="text-[#ff6a1f]">CRM para WhatsApp</Link><Link href="/qualificacao-de-leads-com-ia" className="text-[#ff6a1f]">Qualificação com IA</Link><Link href="/automacoes" className="text-[#ff6a1f]">Automações</Link></div><Link href="/contato?interest=demonstracao" className="mt-9 inline-flex items-center gap-2 rounded-lg bg-[#e85002] px-6 py-3.5 text-sm font-semibold text-white">Agendar demonstração <ArrowRight className="h-4 w-4" /></Link></div></section>

      <script type="application/ld+json" dangerouslySetInnerHTML={toJsonLdScript(faqSchema)} />
    </SiteShell>
  );
}
